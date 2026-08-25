import { handleOptions, json } from "./_shared/cors.ts";
import { requireSession } from "./_shared/auth.ts";
import { supabaseAdmin } from "./_shared/supabaseAdmin.ts";

const MAX_BYTES = 15 * 1024 * 1024; // ~ a few minutes of voice, generous for a quick note

// Speech-to-text for the voice-capture button. Forwards the recording to
// Polza.ai's Whisper endpoint (OpenAI-compatible /audio/transcriptions) and
// returns plain text, which the client then runs through the exact same
// zero-confirmation classify-and-save pipeline as pasted text — voice is
// just another way to fill that one text box.
Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const session = await requireSession(req);
  if (!session) return json({ error: "unauthorized" }, 401);

  const apiKey = Deno.env.get("POLZA_API_KEY");
  if (!apiKey) return json({ error: "server_not_configured" }, 500);

  const form = await req.formData().catch(() => null);
  const audio = form?.get("audio");
  if (!audio || !(audio instanceof File)) return json({ error: "missing_audio" }, 400);
  if (audio.size > MAX_BYTES) return json({ error: "file_too_large", limit: MAX_BYTES }, 413);

  const supabase = supabaseAdmin();

  // Same monthly AI-call metering as classify-item — voice capture is an
  // AI operation like any other, not a free side door around the limit.
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

  const upstreamForm = new FormData();
  upstreamForm.append("file", audio, audio.name || "voice.webm");
  upstreamForm.append("model", "openai/whisper-large-v3-turbo");

  const res = await fetch("https://polza.ai/api/v1/audio/transcriptions", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}` },
    body: upstreamForm,
  });
  if (!res.ok) return json({ error: "transcription_failed" }, 502);
  const data = await res.json().catch(() => null);
  const text: string | undefined = data?.text;
  if (!text) return json({ error: "empty_transcription" }, 422);

  await supabase.from("usage_events").insert({ user_id: session.userId, kind: "ai_call" });
  await supabase.from("profiles").update({ ai_calls_used: aiCallsUsed + 1 }).eq("id", session.userId);

  return json({ text });
});
