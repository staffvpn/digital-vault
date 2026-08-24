import { handleOptions, json } from "./_shared/cors.ts";
import { requireSession } from "./_shared/auth.ts";
import { supabaseAdmin } from "./_shared/supabaseAdmin.ts";
import { looksLikeCredential } from "./_shared/heuristics.ts";
import { fetchLinkMeta } from "./_shared/linkMeta.ts";

const TAXONOMY = `
Возможные type: link, text, image, file, note, movie, series, service, bookmark, design_reference.
Категории (category / subcategory), выбирай наиболее подходящую:
- Насмотренность: Web Design, UI/UX, Branding, Typography, 3D, Illustration, Animation, Colors, Landing Pages
- Кино: Хочу посмотреть, Смотрю, Посмотрено (только для type=movie или series)
- Сервисы: Design, Development, AI, Productivity, Marketing, Finance, Other
- Закладки: короткая категория по смыслу сайта
- Заметки: короткий Project + теги
Отвечай СТРОГО в формате JSON без пояснений и без markdown:
{"type":"...","category":"...","subcategory":"...","title":"...","tags":["..."],"confidence":0.0}
`.trim();

async function callClaude(input: { text?: string; imageBase64?: string; mimeType?: string }): Promise<any> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return null;

  const content: any[] = [];
  if (input.imageBase64 && input.mimeType) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: input.mimeType, data: input.imageBase64 },
    });
    content.push({ type: "text", text: "Опиши и классифицируй это изображение.\n\n" + TAXONOMY });
  } else {
    content.push({ type: "text", text: `Классифицируй этот контент:\n\n${input.text}\n\n${TAXONOMY}` });
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: 500,
      messages: [{ role: "user", content }],
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const textBlock = data.content?.find((b: any) => b.type === "text");
  if (!textBlock) return null;
  try {
    const match = textBlock.text.match(/\{[\s\S]*\}/);
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

  // 2. Plan/AI-call limit check.
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, plan, ai_calls_used")
    .eq("id", session.userId)
    .single();
  const { data: plan } = await supabase
    .from("plans")
    .select("ai_calls_limit_per_month")
    .eq("id", profile?.plan ?? "free")
    .single();
  if (plan && profile && profile.ai_calls_used >= plan.ai_calls_limit_per_month) {
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

  const aiResult = await callClaude(aiInput);

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
    .update({ ai_calls_used: (profile?.ai_calls_used ?? 0) + 1 })
    .eq("id", session.userId);

  if (!aiResult) {
    return json({
      result: {
        type: body.kind === "image" ? "image" : body.kind === "url" ? "link" : "text",
        category: null,
        tags: [],
        confidence: 0,
        title: linkMeta?.title ?? null,
      },
      source: "fallback",
      linkMeta,
    });
  }

  return json({ result: aiResult, source: "ai", linkMeta });
});
