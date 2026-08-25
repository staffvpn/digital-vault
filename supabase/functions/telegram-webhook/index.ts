import { handleOptions, json } from "./_shared/cors.ts";
import { supabaseAdmin } from "./_shared/supabaseAdmin.ts";
import { looksLikeCredential } from "./_shared/heuristics.ts";
import { fetchLinkMeta } from "./_shared/linkMeta.ts";
import { callClassifyModel, attachReminderTimestamps } from "./_shared/classify.ts";
import { sendTelegramMessage } from "./_shared/telegramSend.ts";
import { updatePinnedWidget } from "./_shared/pinnedWidget.ts";

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
  const message = update?.message;
  if (!message) return json({ ok: true }); // non-message update (edits, etc.) — nothing to do

  const chatId: number | undefined = message.chat?.id;
  const fromId: number | undefined = message.from?.id;
  if (!chatId || !fromId) return json({ ok: true });

  const reply = (text: string) => sendTelegramMessage(botToken, chatId, text);

  const supabase = supabaseAdmin();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, plan, ai_calls_used, ai_calls_period_start")
    .eq("telegram_id", fromId)
    .maybeSingle();

  if (!profile) {
    await reply("Сначала откройте приложение через кнопку меню хотя бы один раз — тогда я буду знать, кто вы 🙂");
    return json({ ok: true });
  }

  const text: string | undefined = message.text ?? message.caption;
  if (text?.startsWith("/")) return json({ ok: true }); // ignore bot commands

  // AI-call limit — same monthly metering as everywhere else.
  let aiCallsUsed = profile.ai_calls_used ?? 0;
  const currentPeriod = new Date();
  currentPeriod.setUTCDate(1);
  const currentPeriodStr = currentPeriod.toISOString().slice(0, 10);
  if (profile.ai_calls_period_start !== currentPeriodStr) {
    aiCallsUsed = 0;
    await supabase.from("profiles").update({ ai_calls_used: 0, ai_calls_period_start: currentPeriodStr }).eq("id", profile.id);
  }
  const { data: planRow } = await supabase.from("plans").select("ai_calls_limit_per_month").eq("id", profile.plan).single();
  if (planRow && aiCallsUsed >= planRow.ai_calls_limit_per_month) {
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
    const base64 = btoa(String.fromCharCode(...new Uint8Array(fileBytes)));
    const ocrEnabled = profile.plan !== "free";
    const aiResult = await callClassifyModel({ imageBase64: base64, mimeType: "image/jpeg" }, { includeOcr: ocrEnabled });
    if (aiResult) {
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
    await reply(`✅ Сохранено: ${saved.title ?? "без названия"}`);
    await updatePinnedWidget(supabase, botToken, profile.id);
  } else {
    await reply("Не удалось разобрать — попробуйте ещё раз или через приложение.");
  }

  return json({ ok: true });
});
