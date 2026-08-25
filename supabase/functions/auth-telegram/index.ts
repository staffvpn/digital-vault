import { handleOptions, json } from "./_shared/cors.ts";
import { verifyInitData } from "./_shared/telegram.ts";
import { createSessionToken } from "./_shared/session.ts";
import { supabaseAdmin } from "./_shared/supabaseAdmin.ts";

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const sessionSecret = Deno.env.get("SESSION_SECRET");
  if (!botToken || !sessionSecret) {
    return json({ error: "server_not_configured" }, 500);
  }

  let body: { initData?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  if (!body.initData) return json({ error: "missing_init_data" }, 400);

  const tgUser = await verifyInitData(body.initData, botToken);
  if (!tgUser) return json({ error: "invalid_init_data" }, 401);

  const supabase = supabaseAdmin();
  const { data: existing } = await supabase
    .from("profiles")
    .select("*")
    .eq("telegram_id", tgUser.id)
    .maybeSingle();

  let profile = existing;
  if (!profile) {
    const { data: created, error } = await supabase
      .from("profiles")
      .insert({ telegram_id: tgUser.id, username: tgUser.username, first_name: tgUser.first_name })
      .select("*")
      .single();
    if (error) return json({ error: "profile_create_failed", detail: error.message }, 500);
    profile = created;

    // Referral attach happens exactly once, right here, only for a brand
    // new profile, and only from Telegram's own signed start_param — there
    // is no other code path that can set profiles.referred_by.
    if (tgUser.startParam) {
      await supabase.rpc("fn_attach_referrer", { p_new_user_id: profile.id, p_code: tgUser.startParam });
    }
  } else {
    await supabase
      .from("profiles")
      .update({ username: tgUser.username, first_name: tgUser.first_name })
      .eq("id", profile.id);
  }

  const sessionToken = await createSessionToken(
    { sub: profile.id, telegram_id: tgUser.id },
    sessionSecret,
    3600,
  );

  return json({
    sessionToken,
    expiresIn: 3600,
    profile: {
      id: profile.id,
      username: profile.username,
      firstName: profile.first_name,
      plan: profile.plan,
      storageUsedBytes: profile.storage_used_bytes,
      aiCallsUsed: profile.ai_calls_used,
      secretsCount: profile.secrets_count,
      secretsBonus: profile.secrets_bonus,
      referralCode: profile.referral_code,
    },
  });
});
