import { handleOptions, json } from "./_shared/cors.ts";
import { requireSession } from "./_shared/auth.ts";
import { supabaseAdmin } from "./_shared/supabaseAdmin.ts";

// Read-only. There is deliberately no "attach referral" write endpoint here
// — that only ever happens once, at account creation, inside auth-telegram,
// from Telegram's own signed start_param. See migrations/0002 for why.
Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  if (req.method !== "GET") return json({ error: "method_not_allowed" }, 405);

  const session = await requireSession(req);
  if (!session) return json({ error: "unauthorized" }, 401);

  const supabase = supabaseAdmin();

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("referral_code, secrets_bonus")
    .eq("id", session.userId)
    .single();
  if (profileError || !profile) return json({ error: "not_found" }, 404);

  const { data: config } = await supabase
    .from("app_config")
    .select("key, value")
    .in("key", ["referral_reward_secrets", "referral_max_bonus_secrets"]);
  const configMap = Object.fromEntries((config ?? []).map((c) => [c.key, c.value]));

  const { data: referrals } = await supabase
    .from("referrals")
    .select("status")
    .eq("referrer_id", session.userId);

  const stats = { registered: 0, paid: 0, qualified: 0, rewarded: 0, blocked: 0, refunded: 0 };
  for (const r of referrals ?? []) {
    if (r.status in stats) (stats as Record<string, number>)[r.status] += 1;
  }

  return json({
    code: profile.referral_code,
    bonusSecrets: profile.secrets_bonus,
    rewardPerReferral: configMap.referral_reward_secrets ?? 2,
    maxBonusSecrets: configMap.referral_max_bonus_secrets ?? 20,
    stats,
  });
});
