import { handleOptions, json } from "./_shared/cors.ts";

// One-time (idempotent) admin trigger — registers telegram-webhook as this
// bot's webhook with Telegram, using the bot token that only lives in this
// project's own Edge Function secrets (never exposed to me or the client).
// Protected by the same TELEGRAM_WEBHOOK_SECRET used to verify inbound
// updates, so nobody else can point the bot's webhook elsewhere.
Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const expectedSecret = Deno.env.get("TELEGRAM_WEBHOOK_SECRET");
  const providedSecret = req.headers.get("x-setup-secret");
  if (!expectedSecret || providedSecret !== expectedSecret) {
    return json({ error: "unauthorized" }, 401);
  }

  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!botToken || !supabaseUrl) return json({ error: "server_not_configured" }, 500);

  const webhookUrl = `${supabaseUrl}/functions/v1/telegram-webhook`;
  const res = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      url: webhookUrl,
      secret_token: expectedSecret,
      allowed_updates: ["message"],
      drop_pending_updates: true,
    }),
  });
  const data = await res.json().catch(() => null);
  return json({ ok: res.ok, telegram: data });
});
