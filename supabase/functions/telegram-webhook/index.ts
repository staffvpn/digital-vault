import { handleOptions, json } from "./_shared/cors.ts";
import { supabaseAdmin } from "./_shared/supabaseAdmin.ts";
import { looksLikeCredential } from "./_shared/heuristics.ts";
import { fetchLinkMeta } from "./_shared/linkMeta.ts";
import { callClassifyModel, attachReminderTimestamps } from "./_shared/classify.ts";
import { sendTelegramMessage, answerPreCheckoutQuery } from "./_shared/telegramSend.ts";
import { maybeActivateReferral } from "./_shared/referralActivation.ts";
import { buildPrivacySections, buildTermsSections, chunkSections } from "./_shared/legalText.ts";
import { getEffectiveLimits } from "./_shared/planLimits.ts";

// Forward (or just type) anything straight to the bot in its private chat —
// no need to open the Mini App at all. This is the direct answer to
// Telegram's own "Saved Messages": forward there, or forward here, same
// gesture, except here it actually gets classified, filed, and made
// findable. Telegram calls this URL for every message sent to the bot once
// setup-webhook has registered it; authenticity is the X-Telegram-Bot-Api-
// Secret-Token header, which only Telegram (and us) know.
Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const expectedSecret = Deno.env.get("TELEGRAM_WEBHOOK_SECRET");
  const providedSecret = req.headers.get("x-telegram-bot-api-secret-token");
  if (!expectedSecret || providedSecret !== expectedSecret) {
    return json({ error: "unauthorized" }, 401);
  }

  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!botToken) return json({ error: "server_not_configured" }, 500);

  const update = await req.json().catch(() => null);
  const supabase = supabaseAdmin();

  // Stars-payment handshake, step 1: Telegram asks "still good to charge?"
  // right before moving the user's Stars. Must answer within 10s. This is
  // the last checkpoint before real money (well, Stars) changes hands, so
  // it re-checks the pending payment row rather than trusting the invoice
  // payload blindly — this update type carries no `message`, so it has to
  // be handled before the message-only early return below.
  if (update?.pre_checkout_query) {
    const pcq = update.pre_checkout_query;
    let ok = false;
    const { data: payment } = await supabase
      .from("payments")
      .select("id, status, user_id")
      .eq("id", pcq.invoice_payload)
      .maybeSingle();
    if (payment && payment.status === "pending") {
      const { data: payer } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", payment.user_id)
        .eq("telegram_id", pcq.from?.id)
        .maybeSingle();
      ok = Boolean(payer);
    }
    await answerPreCheckoutQuery(
      botToken,
      pcq.id,
      ok,
      ok ? undefined : "Счёт устарел или недействителен — откройте приложение и попробуйте снова.",
    );
    return json({ ok: true });
  }

  const message = update?.message;
  if (!message) return json({ ok: true }); // non-message update (edits, etc.) — nothing to do

  const chatId: number | undefined = message.chat?.id;
  const fromId: number | undefined = message.from?.id;
  if (!chatId || !fromId) return json({ ok: true });

  const reply = (text: string) => sendTelegramMessage(botToken, chatId, text);
  const text: string | undefined = message.text ?? message.caption;

  // Legal documents, right in the bot chat — some payment providers check
  // these are reachable without opening the Mini App at all. Works even
  // before the person has ever opened the app (no profile lookup needed),
  // and needs the live `plans` row for the numbers quoted inside.
  if (text?.trim().split(/\s|@/)[0] === "/info") {
    const { data: plans } = await supabase
      .from("plans")
      .select("id, price_rub, storage_limit_bytes, ai_calls_limit_per_month, secrets_limit")
      .order("price_rub", { ascending: true });
    for (const chunk of chunkSections(buildPrivacySections(plans ?? []))) {
      await reply(chunk);
    }
    for (const chunk of chunkSections(buildTermsSections(plans ?? []))) {
      await reply(chunk);
    }
    return json({ ok: true });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, plan, custom_plan, ai_calls_used, ai_calls_period_start, storage_used_bytes")
    .eq("telegram_id", fromId)
    .maybeSingle();

  if (!profile) {
    await reply("Сначала откройте приложение через кнопку меню хотя бы один раз — тогда я буду знать, кто вы 🙂");
    return json({ ok: true });
  }

  // Stars-payment handshake, step 2: the charge actually went through.
  // Grant the plan here — same qualify/consume calls the (still-stubbed)
  // Platega webhook uses for a "succeeded" event, so referral rewards work
  // identically no matter which provider the money came through.
  if (message.successful_payment) {
    const sp = message.successful_payment;
    const { data: payment } = await supabase
      .from("payments")
      .select("id, status, plan, custom_plan, user_id")
      .eq("id", sp.invoice_payload)
      .maybeSingle();
    if (payment && payment.user_id === profile.id && payment.status !== "succeeded") {
      await supabase
        .from("payments")
        .update({ status: "succeeded", provider_ref: sp.telegram_payment_charge_id })
        .eq("id", payment.id);
      if (payment.plan) {
        await supabase.from("profiles").update({ plan: payment.plan }).eq("id", profile.id);
        // Referral rewards only ever apply to Pro/Premium purchases — a
        // custom-plan purchase (payment.custom_plan branch below) deliberately
        // never qualifies or consumes a referral, same invariant as the
        // Platega webhook stub.
        await supabase.rpc("fn_qualify_referral", { p_referred_id: profile.id, p_plan: payment.plan });
        await supabase.rpc("fn_consume_referral_discount", { p_user_id: profile.id });
        await reply(`✅ Оплата получена — тариф обновлён на ${payment.plan === "pro" ? "Pro" : "Premium"}. Спасибо! ⭐`);
      } else if (payment.custom_plan) {
        await supabase.from("profiles").update({ custom_plan: payment.custom_plan }).eq("id", profile.id);
        await reply("✅ Оплата получена — ваш «Свой тариф» подключён. Спасибо! ⭐");
      } else {
        await reply("✅ Оплата получена, спасибо!");
      }
    } else {
      await reply("✅ Оплата получена, спасибо!");
    }
    return json({ ok: true });
  }

  if (text?.startsWith("/")) return json({ ok: true }); // ignore other bot commands

  // AI-call limit — same monthly metering as everywhere else.
  let aiCallsUsed = profile.ai_calls_used ?? 0;
  const currentPeriod = new Date();
  currentPeriod.setUTCDate(1);
  const currentPeriodStr = currentPeriod.toISOString().slice(0, 10);
  if (profile.ai_calls_period_start !== currentPeriodStr) {
    aiCallsUsed = 0;
    await supabase.from("profiles").update({ ai_calls_used: 0, ai_calls_period_start: currentPeriodStr }).eq("id", profile.id);
  }
  const limits = await getEffectiveLimits(supabase, profile);
  if (aiCallsUsed >= limits.aiCallsLimitPerMonth) {
    await reply("Лимит AI-сохранений на этот месяц исчерпан — но переслать вручную в приложении всё ещё можно.");
    return json({ ok: true });
  }

  let saved: { id: string; title: string | null } | null = null;

  if (message.photo?.length) {
    const largest = message.photo[message.photo.length - 1];
    const fileRes = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${largest.file_id}`).then((r) => r.json());
    const filePath = fileRes?.result?.file_path;
    if (!filePath) {
      await reply("Не получилось скачать изображение 🙁");
      return json({ ok: true });
    }
    const fileBytes = await fetch(`https://api.telegram.org/file/bot${botToken}/${filePath}`).then((r) => r.arrayBuffer());

    if (profile.storage_used_bytes + fileBytes.byteLength > limits.storageLimitBytes) {
      await reply("Не хватает места в хранилище на вашем тарифе — освободите место или перейдите на тариф побольше в приложении.");
      return json({ ok: true });
    }

    const base64 = btoa(String.fromCharCode(...new Uint8Array(fileBytes)));
    const ocrEnabled = limits.ocrEnabled;
    const aiResult = await callClassifyModel({ imageBase64: base64, mimeType: "image/jpeg" }, { includeOcr: ocrEnabled });
    if (aiResult) {
      // Persist the actual bytes to Storage — the AI call above only ever
      // saw a transient in-memory copy for classification, it was never
      // kept anywhere on its own.
      const storagePath = `${profile.id}/${crypto.randomUUID()}-telegram.jpg`;
      const { error: uploadError } = await supabase.storage
        .from("vault-files")
        .upload(storagePath, fileBytes, { contentType: "image/jpeg" });

      if (uploadError) {
        await reply("Не удалось сохранить изображение 🙁");
        return json({ ok: true });
      }

      await supabase.from("usage_events").insert({ user_id: profile.id, kind: "ai_call" });
      await supabase.from("profiles").update({ ai_calls_used: aiCallsUsed + 1 }).eq("id", profile.id);
      const { data: item } = await supabase
        .from("items")
        .insert({
          user_id: profile.id,
          type: "image",
          category: aiResult.category ?? null,
          subcategory: aiResult.subcategory ?? null,
          title: aiResult.title ?? "Изображение",
          description: aiResult.description ?? null,
          ocr_text: aiResult.ocr_text ?? null,
          status: "saved",
          confidence: aiResult.confidence ?? null,
        })
        .select("id, title")
        .single();

      if (item) {
        await supabase.from("files").insert({
          user_id: profile.id,
          item_id: item.id,
          storage_path: storagePath,
          mime_type: "image/jpeg",
          size_bytes: fileBytes.byteLength,
        });
        await supabase
          .from("profiles")
          .update({ storage_used_bytes: profile.storage_used_bytes + fileBytes.byteLength })
          .eq("id", profile.id);
      }
      saved = item;
    }
  } else if (text?.trim()) {
    const trimmed = text.trim();
    if (looksLikeCredential(trimmed)) {
      await reply("Похоже на пароль — такое, пожалуйста, сохраняйте прямо в приложении, в Сейф, а не пересылкой сюда.");
      return json({ ok: true });
    }

    let isUrl = false;
    try {
      const u = new URL(trimmed);
      isUrl = u.protocol === "http:" || u.protocol === "https:";
    } catch {
      isUrl = false;
    }

    if (isUrl) {
      const { data: existing } = await supabase
        .from("items")
        .select("id, title")
        .eq("user_id", profile.id)
        .eq("source_url", trimmed)
        .maybeSingle();
      if (existing) {
        await reply(`Уже сохранено: ${existing.title ?? trimmed}`);
        return json({ ok: true });
      }
    }

    const linkMeta = isUrl ? await fetchLinkMeta(trimmed) : null;
    const aiInput = isUrl
      ? { text: `URL: ${trimmed}\nTitle: ${linkMeta?.title}\nDescription: ${linkMeta?.description}\nDomain: ${linkMeta?.domain}` }
      : { text: trimmed };
    const aiResult = await callClassifyModel(aiInput);

    if (aiResult && looksLikeCredential(aiResult.title ?? "")) {
      await reply("Похоже на пароль — такое, пожалуйста, сохраняйте прямо в приложении, в Сейф, а не пересылкой сюда.");
      return json({ ok: true });
    }

    if (aiResult) {
      attachReminderTimestamps(aiResult);
      await supabase.from("usage_events").insert({ user_id: profile.id, kind: "ai_call" });
      await supabase.from("profiles").update({ ai_calls_used: aiCallsUsed + 1 }).eq("id", profile.id);
      const { data: item } = await supabase
        .from("items")
        .insert({
          user_id: profile.id,
          type: aiResult.type ?? (isUrl ? "link" : "text"),
          category: aiResult.category ?? null,
          subcategory: aiResult.subcategory ?? null,
          title: aiResult.title ?? trimmed.slice(0, 80),
          description: aiResult.description ?? null,
          body: !isUrl ? trimmed : null,
          source_url: isUrl ? trimmed : null,
          source_domain: linkMeta?.domain ?? null,
          preview_url: linkMeta?.image ?? null,
          status: "saved",
          confidence: aiResult.confidence ?? null,
          remind_at: aiResult.remind_at ?? null,
          remind_has_time: aiResult.remind_has_time ?? false,
          remind_notify_1: aiResult.remind_notify_1 ?? null,
          remind_notify_2: aiResult.remind_notify_2 ?? null,
        })
        .select("id, title")
        .single();
      saved = item;
    }
  }

  if (saved) {
    await maybeActivateReferral(supabase, profile.id);
    await reply(`✅ Сохранено: ${saved.title ?? "без названия"}`);
  } else {
    await reply("Не удалось разобрать — попробуйте ещё раз или через приложение.");
  }

  return json({ ok: true });
});
