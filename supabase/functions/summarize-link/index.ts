import { handleOptions, json } from "./_shared/cors.ts";
import { requireSession } from "./_shared/auth.ts";
import { supabaseAdmin } from "./_shared/supabaseAdmin.ts";

// "Read in 30 seconds" — Premium only (a full extra AI call over the whole
// page, the priciest single operation in the app, worth reserving for the
// top tier). Fetches the page, strips it down to plain text, asks Claude
// for a short summary, and caches it on the item so it's free to re-read.
function htmlToPlainText(html: string): string {
  const withoutScripts = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "");
  const withoutTags = withoutScripts.replace(/<[^>]+>/g, " ");
  return withoutTags.replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const session = await requireSession(req);
  if (!session) return json({ error: "unauthorized" }, 401);

  const body = await req.json().catch(() => null);
  if (!body?.item_id) return json({ error: "missing_item_id" }, 400);

  const supabase = supabaseAdmin();

  const { data: profile } = await supabase
    .from("profiles")
    .select("plan, ai_calls_used, ai_calls_period_start")
    .eq("id", session.userId)
    .single();
  if (profile?.plan !== "pro_plus") {
    return json({ error: "premium_required" }, 402);
  }

  const { data: item } = await supabase
    .from("items")
    .select("id, source_url, summary")
    .eq("id", body.item_id)
    .eq("user_id", session.userId)
    .single();
  if (!item?.source_url) return json({ error: "not_a_link" }, 400);
  if (item.summary) return json({ summary: item.summary, cached: true });

  let aiCallsUsed = profile.ai_calls_used ?? 0;
  const currentPeriod = new Date();
  currentPeriod.setUTCDate(1);
  const currentPeriodStr = currentPeriod.toISOString().slice(0, 10);
  if (profile.ai_calls_period_start !== currentPeriodStr) {
    aiCallsUsed = 0;
    await supabase.from("profiles").update({ ai_calls_used: 0, ai_calls_period_start: currentPeriodStr }).eq("id", session.userId);
  }
  const { data: plan } = await supabase.from("plans").select("ai_calls_limit_per_month").eq("id", "pro_plus").single();
  if (plan && aiCallsUsed >= plan.ai_calls_limit_per_month) {
    return json({ error: "ai_limit_reached", limit: plan.ai_calls_limit_per_month }, 402);
  }

  const apiKey = Deno.env.get("POLZA_API_KEY");
  if (!apiKey) return json({ error: "server_not_configured" }, 500);

  let pageText = "";
  try {
    const res = await fetch(item.source_url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; NCHTNotionBot/1.0)" },
      signal: AbortSignal.timeout(8000),
    });
    const html = await res.text();
    pageText = htmlToPlainText(html).slice(0, 8000);
  } catch {
    return json({ error: "fetch_failed" }, 502);
  }
  if (!pageText) return json({ error: "empty_page" }, 422);

  const res = await fetch("https://polza.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "anthropic/claude-sonnet-5",
      max_tokens: 400,
      messages: [
        {
          role: "user",
          content: `Перескажи суть этой страницы на русском в 4-6 коротких предложениях, по делу, без вступлений вроде "эта статья о том, что". Если это не статья, а инструмент/сервис/лендинг — опиши, что он делает и для кого.\n\nТекст страницы:\n${pageText}`,
        },
      ],
    }),
  });
  if (!res.ok) return json({ error: "summarize_failed" }, 502);
  const data = await res.json();
  const summary: string | undefined = data.choices?.[0]?.message?.content?.trim();
  if (!summary) return json({ error: "empty_summary" }, 422);

  await supabase.from("items").update({ summary }).eq("id", item.id);
  await supabase.from("usage_events").insert({ user_id: session.userId, kind: "ai_call" });
  await supabase.from("profiles").update({ ai_calls_used: aiCallsUsed + 1 }).eq("id", session.userId);

  return json({ summary, cached: false });
});
