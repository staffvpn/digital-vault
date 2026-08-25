import { handleOptions, json } from "./_shared/cors.ts";
import { requireSession } from "./_shared/auth.ts";
import { supabaseAdmin } from "./_shared/supabaseAdmin.ts";
import { looksLikeCredential } from "./_shared/heuristics.ts";
import { fetchLinkMeta } from "./_shared/linkMeta.ts";

function buildTaxonomy(nowMsk: string): string {
  return `
Возможные type: link, text, image, file, note, reminder, service, bookmark, design_reference.
(Типы movie/series/tags не используются — не добавляй их.)

Правила:
- Любая ссылка на одиночное видео (YouTube, Vimeo, TikTok, влог, обзор,
  туториал, клип, трейлер и т.п.) — это type "bookmark", category "Видео",
  subcategory — название площадки (YouTube и т.п.).
- Если по ссылке видно портфолио, чью-то дизайн-работу, логотипы, кейс на
  Behance/Dribbble/Pinterest — type "design_reference", category "Дизайн"
  (без подкатегорий).
- Полезный сайт/инструмент/сервис (конвертер, редактор, SaaS-продукт) —
  type "service", category — одна из: Design, Development, AI, Productivity,
  Marketing, Finance, Other.
- Обычная ссылка на сайт без явной категории выше — type "bookmark",
  category — коротко по смыслу сайта.
- Текст о том, что нужно сделать или не забыть к конкретной дате/времени
  (дедлайн, "напомни", "нужно сделать к...", явная дата) — type "reminder".
  В этом случае ОБЯЗАТЕЛЬНО заполни "remind_at" (ISO 8601 datetime, до
  минуты, часовой пояс Москвы UTC+3, например "2026-09-23T12:00:00+03:00")
  и "remind_has_time" (true, если в тексте прямо названо время, иначе
  false — и тогда поставь remind_at на 12:00 по Москве в нужную дату).
  Если год не указан — подразумевай ближайшую будущую дату. Текущие дата и
  время в Москве прямо сейчас: ${nowMsk}.
- Обычная заметка без даты/дедлайна (текст без ссылки) — type "note",
  category — короткий Project.

"title" — короткое название по сути дела, а не первые слова текста.
Если текст длинный или это список шагов (например, рецепт, инструкция) —
пойми главную тему и озаглавь её по смыслу (длинный текст про то, как
почистить и обжарить картошку с грибами -> "Рецепт жареной картошки с
грибами"). Если суть по-настоящему не укладывается коротко — заголовок
может быть длиннее, точность важнее краткости, никогда не обрывай его
многоточием сам.

Также ВСЕГДА заполняй "description" — одно короткое предложение на русском
(до 140 символов) простыми словами о том, что это такое: конкретные имена,
бренды, тема, что видно на картинке/странице. Это единственное, по чему
потом можно будет найти вещь в поиске, если название неинформативно —
пиши так, чтобы поиск по любому упомянутому слову находил её.

Отвечай СТРОГО в формате JSON без пояснений и без markdown:
{"type":"...","category":"...","subcategory":"...","title":"...","description":"...","confidence":0.0,"remind_at":null,"remind_has_time":false}
`.trim();
}

function nowInMoscow(): string {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "long",
  }).format(new Date());
}

// Two notification instants, computed once and stored — the delivery cron
// (deliver-reminders) just compares timestamps, it never does date math.
function computeReminderNotifications(remindAtIso: string, hasTime: boolean): { notify1: string; notify2: string } | null {
  const target = new Date(remindAtIso);
  if (Number.isNaN(target.getTime())) return null;
  const notify2 = target.toISOString();
  const offsetMs = hasTime ? 60 * 60 * 1000 : 2 * 24 * 60 * 60 * 1000; // 1h before, or 2 days before
  const notify1 = new Date(target.getTime() - offsetMs).toISOString();
  return { notify1, notify2 };
}

// Classification runs through Polza.ai — an OpenAI-compatible proxy that
// routes to Claude (and other providers) without needing a direct Anthropic
// billing account. Model id is provider-prefixed: "anthropic/claude-sonnet-5".
async function callModel(input: { text?: string; imageBase64?: string; mimeType?: string }): Promise<any> {
  const apiKey = Deno.env.get("POLZA_API_KEY");
  if (!apiKey) return null;

  const taxonomy = buildTaxonomy(nowInMoscow());
  const content: any[] = [];
  if (input.imageBase64 && input.mimeType) {
    content.push({ type: "text", text: "Опиши и классифицируй это изображение.\n\n" + taxonomy });
    content.push({
      type: "image_url",
      image_url: { url: `data:${input.mimeType};base64,${input.imageBase64}` },
    });
  } else {
    content.push({ type: "text", text: `Классифицируй этот контент:\n\n${input.text}\n\n${taxonomy}` });
  }

  const res = await fetch("https://polza.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "anthropic/claude-sonnet-5",
      max_tokens: 500,
      messages: [{ role: "user", content }],
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const text: string | undefined = data.choices?.[0]?.message?.content;
  if (!text) return null;
  try {
    const match = text.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const session = await requireSession(req);
  if (!session) return json({ error: "unauthorized" }, 401);

  const body = await req.json().catch(() => null);
  if (!body?.kind) return json({ error: "invalid_body" }, 400);

  const supabase = supabaseAdmin();

  // 1. Local heuristic pass — never touches AI.
  const rawText: string = body.kind === "image" ? "" : String(body.content ?? "");
  if (rawText && looksLikeCredential(rawText)) {
    return json({
      result: { type: "possible_credential", category: null, tags: [], confidence: 1, title: null },
      source: "heuristic",
    });
  }

  // 2. Plan/AI-call limit check. Usage is metered per calendar month — if the
  // profile's tracked period has rolled over, reset the counter before
  // checking it, the same way a phone plan's minutes refresh monthly.
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, plan, ai_calls_used, ai_calls_period_start")
    .eq("id", session.userId)
    .single();

  let aiCallsUsed = profile?.ai_calls_used ?? 0;
  if (profile) {
    const currentPeriod = new Date();
    currentPeriod.setUTCDate(1);
    const currentPeriodStr = currentPeriod.toISOString().slice(0, 10);
    if (profile.ai_calls_period_start !== currentPeriodStr) {
      aiCallsUsed = 0;
      await supabase
        .from("profiles")
        .update({ ai_calls_used: 0, ai_calls_period_start: currentPeriodStr })
        .eq("id", session.userId);
    }
  }

  const { data: plan } = await supabase
    .from("plans")
    .select("ai_calls_limit_per_month")
    .eq("id", profile?.plan ?? "free")
    .single();
  if (plan && profile && aiCallsUsed >= plan.ai_calls_limit_per_month) {
    return json({ error: "ai_limit_reached", limit: plan.ai_calls_limit_per_month }, 402);
  }

  let linkMeta = null;
  let aiInput: { text?: string; imageBase64?: string; mimeType?: string };

  if (body.kind === "url") {
    linkMeta = await fetchLinkMeta(body.content);
    aiInput = {
      text: `URL: ${body.content}\nTitle: ${linkMeta.title}\nDescription: ${linkMeta.description}\nDomain: ${linkMeta.domain}`,
    };
  } else if (body.kind === "image") {
    aiInput = { imageBase64: body.content, mimeType: body.mimeType ?? "image/png" };
  } else {
    aiInput = { text: rawText };
  }

  const aiResult = await callModel(aiInput);

  // 3. Safety net: if the AI/OCR pass surfaced credential-shaped text
  // anywhere in its own output, still route to the Vault confirmation flow
  // instead of saving it as a normal item.
  const combinedText = [aiResult?.title, rawText].filter(Boolean).join(" ");
  if (looksLikeCredential(combinedText)) {
    return json({
      result: { type: "possible_credential", category: null, tags: [], confidence: 1, title: null },
      source: "heuristic_post_ai",
    });
  }

  await supabase.from("usage_events").insert({ user_id: session.userId, kind: "ai_call" });
  await supabase
    .from("profiles")
    .update({ ai_calls_used: aiCallsUsed + 1 })
    .eq("id", session.userId);

  if (!aiResult) {
    return json({
      result: {
        type: body.kind === "image" ? "image" : body.kind === "url" ? "link" : "text",
        category: null,
        tags: [],
        confidence: 0,
        title: linkMeta?.title ?? null,
        description: linkMeta?.description ?? null,
      },
      source: "fallback",
      linkMeta,
    });
  }

  // 4. Reminder timestamps: the AI extracts *what* and *when* in words —
  // the actual notify_1/notify_2 instants are always computed here, never
  // trusted from the model's own arithmetic.
  if (aiResult.type === "reminder" && typeof aiResult.remind_at === "string") {
    const notifications = computeReminderNotifications(aiResult.remind_at, Boolean(aiResult.remind_has_time));
    if (notifications) {
      aiResult.remind_notify_1 = notifications.notify1;
      aiResult.remind_notify_2 = notifications.notify2;
    } else {
      // Unparseable date from the model — don't silently create a reminder
      // that can never fire.
      aiResult.type = "note";
      aiResult.remind_at = null;
    }
  }

  return json({ result: aiResult, source: "ai", linkMeta });
});
