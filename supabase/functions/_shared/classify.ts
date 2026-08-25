// Core AI-classification logic, shared between classify-item (session-based,
// called from the Mini App) and telegram-webhook (bot-triggered, called when
// a message is forwarded straight to the bot). Same taxonomy, same model,
// same reminder-timestamp math either way — only the auth/plumbing differs
// between the two callers.

function buildTaxonomy(nowMsk: string, includeOcr: boolean): string {
  const ocrRule = includeOcr
    ? `\nЕсли на картинке есть текст — распознай его и продублируй ДОСЛОВНО в поле
"ocr_text" (или null, если текста нет). Это отдельное поле от "description":
"description" — краткое описание своими словами, "ocr_text" — точный текст с
картинки, по которому тоже должен находить поиск.`
    : "";
  const ocrSchema = includeOcr ? `,"ocr_text":null` : "";

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
${ocrRule}

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
{"type":"...","category":"...","subcategory":"...","title":"...","description":"...","confidence":0.0,"remind_at":null,"remind_has_time":false${ocrSchema}}
`.trim();
}

export function nowInMoscow(): string {
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
export function computeReminderNotifications(
  remindAtIso: string,
  hasTime: boolean,
): { notify1: string; notify2: string } | null {
  const target = new Date(remindAtIso);
  if (Number.isNaN(target.getTime())) return null;
  const notify2 = target.toISOString();
  const offsetMs = hasTime ? 60 * 60 * 1000 : 2 * 24 * 60 * 60 * 1000; // 1h before, or 2 days before
  const notify1 = new Date(target.getTime() - offsetMs).toISOString();
  return { notify1, notify2 };
}

// deno-lint-ignore no-explicit-any
export async function callClassifyModel(
  input: { text?: string; imageBase64?: string; mimeType?: string },
  opts: { includeOcr?: boolean } = {},
): Promise<any> {
  const apiKey = Deno.env.get("POLZA_API_KEY");
  if (!apiKey) return null;

  const taxonomy = buildTaxonomy(nowInMoscow(), Boolean(opts.includeOcr));
  // deno-lint-ignore no-explicit-any
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

// Attaches remind_notify_1/2 onto an AI result in place, or demotes it back
// to a plain note if the model produced an unparseable date — never create a
// reminder that can never fire.
// deno-lint-ignore no-explicit-any
export function attachReminderTimestamps(aiResult: any): void {
  if (aiResult?.type !== "reminder" || typeof aiResult.remind_at !== "string") return;
  const notifications = computeReminderNotifications(aiResult.remind_at, Boolean(aiResult.remind_has_time));
  if (notifications) {
    aiResult.remind_notify_1 = notifications.notify1;
    aiResult.remind_notify_2 = notifications.notify2;
  } else {
    aiResult.type = "note";
    aiResult.remind_at = null;
  }
}
