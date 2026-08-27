import { handleOptions, json } from "./_shared/cors.ts";
import { supabaseAdmin } from "./_shared/supabaseAdmin.ts";
import { looksLikeCredential } from "./_shared/heuristics.ts";
import { fetchLinkMeta } from "./_shared/linkMeta.ts";
import { callClassifyModel, attachReminderTimestamps, transcribeVoice } from "./_shared/classify.ts";
import {
  sendTelegramMessage,
  sendTelegramDocument,
  deleteTelegramMessage,
  answerPreCheckoutQuery,
  answerCallbackQuery,
  getBotUsername,
} from "./_shared/telegramSend.ts";
import { maybeActivateReferral } from "./_shared/referralActivation.ts";
import { buildPrivacySections, buildTermsSections, joinDocument, CONTACT_EMAIL, CONTACT_TELEGRAM } from "./_shared/legalText.ts";
import { getEffectiveLimits } from "./_shared/planLimits.ts";

// Registered once with @BotFather via /newapp — this is fixed registration
// metadata, not a secret, and there's no Bot API call that returns it, so
// it's a constant here rather than duplicated as another env var.
const MINIAPP_SHORTNAME = "ncht";

// How long the "✅ Сохранено" confirmation stays visible before it deletes
// itself — long enough to read the title, short enough not to clutter the
// chat once it's served its purpose (same idea as auto-deleting the voice
// note it may have replaced).
const CONFIRMATION_TTL_MS = 6000;

// Deletes a message after a delay, without making the webhook wait for it —
// scheduled via EdgeRuntime.waitUntil so it keeps running after the
// response has already gone back to Telegram. Falls back to a bare
// fire-and-forget promise if that global isn't available.
function scheduleMessageDeletion(botToken: string, chatId: number, messageId: number, delayMs: number): void {
  const task = new Promise<void>((resolve) => setTimeout(resolve, delayMs)).then(() =>
    deleteTelegramMessage(botToken, chatId, messageId)
  );
  // deno-lint-ignore no-explicit-any
  const runtime = (globalThis as any).EdgeRuntime;
  if (runtime?.waitUntil) {
    runtime.waitUntil(task);
  } else {
    task.catch(() => {});
  }
}

// Sends exactly two file attachments — Privacy Policy and Terms of Use —
// never chained chat messages. Shared between /info and the "Инфо" button
// under the /start post so both paths stay identical.
// deno-lint-ignore no-explicit-any
async function sendLegalDocuments(supabase: any, botToken: string, chatId: number): Promise<void> {
  const { data: plans } = await supabase
    .from("plans")
    .select("id, price_rub, storage_limit_bytes, ai_calls_limit_per_month, secrets_limit")
    .order("price_rub", { ascending: true });
  await sendTelegramDocument(
    botToken,
    chatId,
    "Политика конфиденциальности NCHT Notion.txt",
    joinDocument(buildPrivacySections(plans ?? [])),
    "Политика конфиденциальности",
  );
  await sendTelegramDocument(
    botToken,
    chatId,
    "Пользовательское соглашение NCHT Notion.txt",
    joinDocument(buildTermsSections(plans ?? [])),
    "Пользовательское соглашение",
  );
}

// The classify-and-save pipeline shared by pasted/forwarded text and by
// voice messages once transcribed to text — one piece of text in, one saved
// item (note, reminder, link…) out. Handles the credential guard, the
// duplicate-URL check and the actual AI call + insert.
// deno-lint-ignore no-explicit-any
async function classifyAndSaveText(
  supabase: any,
  profileId: string,
  aiCallsUsed: number,
  trimmed: string,
  reply: (text: string) => Promise<unknown>,
): Promise<{ id: string; title: string | null } | null> {
  if (looksLikeCredential(trimmed)) {
    await reply("Похоже на пароль — такое, пожалуйста, сохраняйте прямо в приложении, в Сейф, а не пересылкой сюда.");
    return null;
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
      .eq("user_id", profileId)
      .eq("source_url", trimmed)
      .maybeSingle();
    if (existing) {
      await reply(`Уже сохранено: ${existing.title ?? trimmed}`);
      return null;
    }
  }

  const linkMeta = isUrl ? await fetchLinkMeta(trimmed) : null;
  const aiInput = isUrl
    ? { text: `URL: ${trimmed}\nTitle: ${linkMeta?.title}\nDescription: ${linkMeta?.description}\nDomain: ${linkMeta?.domain}` }
    : { text: trimmed };
  const aiResult = await callClassifyModel(aiInput);

  if (aiResult && looksLikeCredential(aiResult.title ?? "")) {
    await reply("Похоже на пароль — такое, пожалуйста, сохраняйте прямо в приложении, в Сейф, а не пересылкой сюда.");
    return null;
  }
  if (!aiResult) return null;

  attachReminderTimestamps(aiResult);
  await supabase.from("usage_events").insert({ user_id: profileId, kind: "ai_call" });
  await supabase.from("profiles").update({ ai_calls_used: aiCallsUsed + 1 }).eq("id", profileId);
  const { data: item } = await supabase
    .from("items")
    .insert({
      user_id: profileId,
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

  return item ?? null;
}

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

  // The "ℹ️ Инфо" / "🆘 Поддержка" buttons under the /start post are
  // callback_query updates, not messages — same reasoning as
  // pre_checkout_query above, handled before the message-only paths.
  if (update?.callback_query) {
    const cq = update.callback_query;
    const cqChatId: number | undefined = cq.message?.chat?.id;
    if (cqChatId) {
      if (cq.data === "info") {
        await sendLegalDocuments(supabase, botToken, cqChatId);
      } else if (cq.data === "support") {
        await sendTelegramMessage(botToken, cqChatId, `По любым вопросам — Telegram ${CONTACT_TELEGRAM} или e-mail ${CONTACT_EMAIL}`);
      }
    }
    await answerCallbackQuery(botToken, cq.id);
    return json({ ok: true });
  }

  const message = update?.message;
  if (!message) return json({ ok: true }); // non-message update (edits, etc.) — nothing to do

  const chatId: number | undefined = message.chat?.id;
  const fromId: number | undefined = message.from?.id;
  if (!chatId || !fromId) return json({ ok: true });

  const reply = (text: string) => sendTelegramMessage(botToken, chatId, text);
  const text: string | undefined = message.text ?? message.caption;
  const command = text?.trim().split(/\s|@/)[0];

  // Legal documents, right in the bot chat — some payment providers check
  // these are reachable without opening the Mini App at all. Works even
  // before the person has ever opened the app (no profile lookup needed),
  // and needs the live `plans` row for the numbers quoted inside.
  if (command === "/info") {
    await sendLegalDocuments(supabase, botToken, chatId);
    return json({ ok: true });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, plan, custom_plan, ai_calls_used, ai_calls_period_start, storage_used_bytes, referral_code")
    .eq("telegram_id", fromId)
    .maybeSingle();

  // The welcome post — works whether or not the person has ever opened
  // the Mini App (that's normally the very first thing a new user does:
  // press Start before anything else exists for them), so it has to run
  // before the "open the app first" gate below. Includes a personal
  // referral link only once a profile actually exists.
  if (command === "/start") {
    const botUsername = await getBotUsername(botToken);
    const appLink = botUsername ? `https://t.me/${botUsername}/${MINIAPP_SHORTNAME}` : null;
    const referralLink = appLink && profile?.referral_code ? `${appLink}?startapp=${profile.referral_code}` : null;
    const firstName: string = message.from?.first_name ?? "";

    const body = [
      `Привет${firstName ? `, ${firstName}` : ""}! 👋`,
      "",
      "<b>NCHT Notion</b>",
      "<i>Избранное, которое думает за вас</i>",
      "",
      "Просто перешлите сюда что угодно — ссылку, текст, скриншот, голосовое — и я сам разложу это по категориям, а потом найду похожее.",
      "",
      "Что умею:",
      "• Пересылка прямо из чата — без открытия приложения",
      "• ИИ сам определяет тип и категорию, находит дубли",
      "• OCR по скриншотам и пересказ статей за 30 секунд (Pro/Premium)",
      "• Голосовые заметки и напоминания точно ко времени",
      "• Пароли и ключи — отдельно, зашифрованно, никогда не через ИИ",
      "",
      "Free — бесплатно, 50 AI-сохранений в месяц и 5 паролей в Сейфе. Pro — 249 ₽/мес. Premium — 449 ₽/мес. Можно оплатить звёздами Telegram.",
      "",
      "Откройте приложение и перешлите сюда что-нибудь из своего Избранного в Telegram — эффект видно сразу.",
    ].join("\n");

    const keyboard = appLink
      ? [
          [{ text: "🚀 Открыть приложение", url: appLink }],
          [
            { text: "ℹ️ Инфо", callback_data: "info" },
            { text: "🆘 Поддержка", url: `https://t.me/${CONTACT_TELEGRAM.replace("@", "")}` },
          ],
          referralLink
            ? [
                { text: "💳 Тарифы", url: appLink },
                { text: "🎁 Пригласить друга", url: referralLink },
              ]
            : [{ text: "💳 Тарифы", url: appLink }],
        ]
      : undefined;

    await sendTelegramMessage(botToken, chatId, body, { keyboard, parseMode: "HTML" });
    return json({ ok: true });
  }

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
  // Only set once a voice note has actually been turned into a saved item —
  // that's the trigger to delete the original recording from the chat.
  let voiceMessageId: number | null = null;

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
  } else if (message.voice) {
    // Voice note → bytes → Whisper → same classify-and-save pipeline as
    // typed text. No storage-limit check here: unlike photos, the audio
    // itself is never kept — only the transcribed, classified item is.
    const fileRes = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${message.voice.file_id}`).then((r) =>
      r.json()
    );
    const filePath = fileRes?.result?.file_path;
    if (!filePath) {
      await reply("Не получилось скачать голосовое сообщение 🙁");
      return json({ ok: true });
    }
    const fileBytes = await fetch(`https://api.telegram.org/file/bot${botToken}/${filePath}`).then((r) => r.arrayBuffer());

    const transcribed = await transcribeVoice(fileBytes, "voice.ogg", message.voice.mime_type ?? "audio/ogg");
    if (!transcribed) {
      await reply("Не удалось распознать голосовое — попробуйте ещё раз или напишите текстом.");
      return json({ ok: true });
    }

    // Transcription is its own AI call (same as the in-app voice button),
    // classification below is a second one — matches what recording the
    // same note inside the Mini App would cost.
    await supabase.from("usage_events").insert({ user_id: profile.id, kind: "ai_call" });
    await supabase.from("profiles").update({ ai_calls_used: aiCallsUsed + 1 }).eq("id", profile.id);

    saved = await classifyAndSaveText(supabase, profile.id, aiCallsUsed + 1, transcribed, reply);
    if (saved) voiceMessageId = message.message_id;
  } else if (text?.trim()) {
    saved = await classifyAndSaveText(supabase, profile.id, aiCallsUsed, text.trim(), reply);
  }

  if (saved) {
    await maybeActivateReferral(supabase, profile.id);
    const confirmation = await reply(`✅ Сохранено: ${saved.title ?? "без названия"}`);
    if (voiceMessageId) {
      await deleteTelegramMessage(botToken, chatId, voiceMessageId);
    }
    if (confirmation.messageId) {
      scheduleMessageDeletion(botToken, chatId, confirmation.messageId, CONFIRMATION_TTL_MS);
    }
  } else {
    await reply("Не удалось разобрать — попробуйте ещё раз или через приложение.");
  }

  return json({ ok: true });
});
