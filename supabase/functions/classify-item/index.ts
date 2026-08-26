import { handleOptions, json } from "./_shared/cors.ts";
import { requireSession } from "./_shared/auth.ts";
import { supabaseAdmin } from "./_shared/supabaseAdmin.ts";
import { looksLikeCredential } from "./_shared/heuristics.ts";
import { fetchLinkMeta } from "./_shared/linkMeta.ts";
import { callClassifyModel, attachReminderTimestamps } from "./_shared/classify.ts";
import { getEffectiveLimits } from "./_shared/planLimits.ts";

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

  // 1b. Dedup — same user, same URL, already saved. Skip the AI call
  // entirely (saves the user's monthly allowance) and just point back at
  // the existing item.
  if (body.kind === "url") {
    const { data: existing } = await supabase
      .from("items")
      .select("id, title, description, category, type, created_at")
      .eq("user_id", session.userId)
      .eq("source_url", body.content)
      .maybeSingle();
    if (existing) {
      return json({
        result: { type: "duplicate", category: existing.category, tags: [], confidence: 1, title: existing.title },
        source: "dedup",
        existingItem: existing,
      });
    }
  }

  // 2. Plan/AI-call limit check. Usage is metered per calendar month — if the
  // profile's tracked period has rolled over, reset the counter before
  // checking it, the same way a phone plan's minutes refresh monthly.
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, plan, custom_plan, ai_calls_used, ai_calls_period_start")
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

  const limits = profile ? await getEffectiveLimits(supabase, profile) : null;
  if (limits && profile && aiCallsUsed >= limits.aiCallsLimitPerMonth) {
    return json({ error: "ai_limit_reached", limit: limits.aiCallsLimitPerMonth }, 402);
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

  // OCR (verbatim text-in-image extraction, for search) is a Pro/Premium
  // perk — the vision call happens regardless (needed for classification),
  // this just decides whether we also ask for and keep the literal text.
  const ocrEnabled = body.kind === "image" && Boolean(limits?.ocrEnabled);
  const aiResult = await callClassifyModel(aiInput, { includeOcr: Boolean(ocrEnabled) });

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
  attachReminderTimestamps(aiResult);

  return json({ result: aiResult, source: "ai", linkMeta });
});
