import { handleOptions, json } from "./_shared/cors.ts";
import { supabaseAdmin } from "./_shared/supabaseAdmin.ts";

// A simple read-only dashboard endpoint — no Telegram session involved at
// all, since this is for the founder looking at the whole user base, not
// any one user's own data. Protected by a flat shared secret (same posture
// as setup-webhook's X-Setup-Secret) rather than anything per-account.
Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  if (req.method !== "GET") return json({ error: "method_not_allowed" }, 405);

  const expectedSecret = Deno.env.get("ADMIN_SECRET");
  const providedSecret = req.headers.get("x-admin-secret");
  if (!expectedSecret || providedSecret !== expectedSecret) {
    return json({ error: "unauthorized" }, 401);
  }

  const supabase = supabaseAdmin();

  const now = new Date();
  const d7 = new Date(now.getTime() - 7 * 86400000).toISOString();
  const d30 = new Date(now.getTime() - 30 * 86400000).toISOString();

  const [
    totalUsersRes,
    newUsers7dRes,
    newUsers30dRes,
    planRowsRes,
    customPlanUsersRes,
    activeEvents7dRes,
    activeEvents30dRes,
    paymentsRes,
    referralsRes,
    deletedCountRes,
    recentSignupsRes,
    recentDeletionsRes,
  ] = await Promise.all([
    supabase.from("profiles").select("*", { count: "exact", head: true }),
    supabase.from("profiles").select("*", { count: "exact", head: true }).gte("created_at", d7),
    supabase.from("profiles").select("*", { count: "exact", head: true }).gte("created_at", d30),
    supabase.from("profiles").select("plan"),
    supabase.from("profiles").select("*", { count: "exact", head: true }).not("custom_plan", "is", null),
    supabase.from("usage_events").select("user_id").gte("occurred_at", d7),
    supabase.from("usage_events").select("user_id").gte("occurred_at", d30),
    supabase.from("payments").select("status, amount_rub, provider").eq("status", "succeeded"),
    supabase.from("referrals").select("status"),
    supabase.from("deleted_profiles").select("*", { count: "exact", head: true }),
    supabase
      .from("profiles")
      .select("id, telegram_id, username, first_name, plan, custom_plan, created_at")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.from("deleted_profiles").select("*").order("deleted_at", { ascending: false }).limit(50),
  ]);

  const planCounts: Record<string, number> = { free: 0, pro: 0, pro_plus: 0 };
  for (const r of planRowsRes.data ?? []) planCounts[r.plan] = (planCounts[r.plan] ?? 0) + 1;

  const activeUsers7d = new Set((activeEvents7dRes.data ?? []).map((e) => e.user_id)).size;
  const activeUsers30d = new Set((activeEvents30dRes.data ?? []).map((e) => e.user_id)).size;

  const payments = paymentsRes.data ?? [];
  const revenueRub = payments.reduce((sum, p) => sum + (p.amount_rub ?? 0), 0);
  const revenueByProvider: Record<string, number> = {};
  for (const p of payments) revenueByProvider[p.provider] = (revenueByProvider[p.provider] ?? 0) + (p.amount_rub ?? 0);

  const referralStatusCounts: Record<string, number> = {};
  for (const r of referralsRes.data ?? []) referralStatusCounts[r.status] = (referralStatusCounts[r.status] ?? 0) + 1;

  return json({
    totalUsers: totalUsersRes.count ?? 0,
    newUsers7d: newUsers7dRes.count ?? 0,
    newUsers30d: newUsers30dRes.count ?? 0,
    planCounts,
    customPlanUsers: customPlanUsersRes.count ?? 0,
    activeUsers7d,
    activeUsers30d,
    revenueRub,
    revenueByProvider,
    paymentsCount: payments.length,
    referralStatusCounts,
    deletedCount: deletedCountRes.count ?? 0,
    recentSignups: recentSignupsRes.data ?? [],
    recentDeletions: recentDeletionsRes.data ?? [],
  });
});
