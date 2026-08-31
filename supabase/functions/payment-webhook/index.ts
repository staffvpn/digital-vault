import { handleOptions, json } from "./_shared/cors.ts";
import { supabaseAdmin } from "./_shared/supabaseAdmin.ts";

// Platega.io's real callback ("Callback об изменении статуса транзакции").
// Their auth model isn't a signature — they echo back the same
// X-MerchantId/X-Secret pair we send when creating a transaction, so this
// checks the request against the same two Platega credentials
// create-platega-invoice already uses, not a separate shared secret.
//
// Payload: { id (their transaction ID), amount, currency,
// status: "CONFIRMED" | "CANCELED" | "CHARGEBACKED", paymentMethod }.
// We never trust their `payload` echo for the lookup — provider_ref (set
// to their transaction ID at creation time) is the only reliable key.
Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const merchantId = Deno.env.get("PLATEGA_MERCHANT_ID");
  const secret = Deno.env.get("PLATEGA_SECRET");
  if (!merchantId || !secret) return json({ error: "server_not_configured" }, 500);
  if (req.headers.get("x-merchantid") !== merchantId || req.headers.get("x-secret") !== secret) {
    return json({ error: "unauthorized" }, 401);
  }

  let body: {
    id?: string;
    amount?: number;
    currency?: string;
    status?: "CONFIRMED" | "CANCELED" | "CHARGEBACKED";
    paymentMethod?: number;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  if (!body.id || !body.status) return json({ error: "missing_fields" }, 400);

  const supabase = supabaseAdmin();

  const { data: payment } = await supabase
    .from("payments")
    .select("id, status, user_id, plan, custom_plan")
    .eq("provider_ref", body.id)
    .maybeSingle();
  if (!payment) return json({ error: "unknown_payment" }, 404);

  // Idempotency: Platega retries up to 3 times over ~15 minutes if it
  // doesn't get a 200 back — a payment already in a terminal state means
  // this exact event already ran, never double-grant or double-reverse.
  if (payment.status === "succeeded" || payment.status === "refunded" || payment.status === "failed") {
    return json({ ok: true, alreadyProcessed: true });
  }

  if (body.status === "CONFIRMED") {
    await supabase.from("payments").update({ status: "succeeded" }).eq("id", payment.id);

    if (payment.plan) {
      await supabase.from("profiles").update({ plan: payment.plan }).eq("id", payment.user_id);
      // Referral rewards only ever apply to Pro/Premium purchases — a
      // custom-plan purchase deliberately never qualifies or consumes a
      // referral, same invariant as the Stars flow.
      await supabase.rpc("fn_qualify_referral", { p_referred_id: payment.user_id, p_plan: payment.plan });
      await supabase.rpc("fn_consume_referral_discount", { p_user_id: payment.user_id });
      await notifyUser(
        supabase,
        payment.user_id,
        `✅ Оплата получена — тариф обновлён на ${payment.plan === "pro" ? "Pro" : "Premium"}. Спасибо! ⭐`,
      );
    } else if (payment.custom_plan) {
      await supabase.from("profiles").update({ custom_plan: payment.custom_plan }).eq("id", payment.user_id);
      await notifyUser(supabase, payment.user_id, "✅ Оплата получена — ваш «Свой тариф» подключён. Спасибо! ⭐");
    } else {
      await notifyUser(supabase, payment.user_id, "✅ Оплата получена, спасибо!");
    }
    return json({ ok: true });
  }

  if (body.status === "CANCELED") {
    await supabase.from("payments").update({ status: "failed" }).eq("id", payment.id);
    return json({ ok: true });
  }

  if (body.status === "CHARGEBACKED") {
    await supabase.from("payments").update({ status: "refunded" }).eq("id", payment.id);
    if (payment.plan) {
      const { data: profile } = await supabase.from("profiles").select("plan").eq("id", payment.user_id).single();
      if (profile?.plan === payment.plan) {
        await supabase.from("profiles").update({ plan: "free" }).eq("id", payment.user_id);
      }
      await supabase.rpc("fn_reverse_referral", { p_referred_id: payment.user_id });
    }
    return json({ ok: true });
  }

  return json({ error: "unknown_status" }, 400);
});

// A card/SBP payment never goes through the bot chat on its own — unlike
// Stars, there's no successful_payment update to hang a confirmation off
// of — so this webhook sends the confirmation itself.
// deno-lint-ignore no-explicit-any
async function notifyUser(supabase: any, userId: string, text: string): Promise<void> {
  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!botToken) return;
  const { data: profile } = await supabase.from("profiles").select("telegram_id").eq("id", userId).maybeSingle();
  if (!profile?.telegram_id) return;
  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: profile.telegram_id, text }),
  }).catch(() => {});
}
