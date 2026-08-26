// Fires once per referred account, right after its first real save —
// through either capture path (Mini App via items-crud, or a Telegram
// forward via telegram-webhook). A much lower bar than the paid-referral
// reward, so fn_activate_referral keeps it small and separately
// velocity-limited. Never throws: a referral bonus is never worth
// blocking or slowing down the user's own save over.
// deno-lint-ignore no-explicit-any
export async function maybeActivateReferral(supabase: any, userId: string): Promise<void> {
  try {
    const { count } = await supabase
      .from("items")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    if (count !== 1) return; // not their first item ever — nothing to activate
    await supabase.rpc("fn_activate_referral", { p_referred_id: userId });
  } catch {
    // best-effort — a referral bonus glitch should never break saving
  }
}
