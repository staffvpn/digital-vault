import { handleOptions, json } from "./_shared/cors.ts";
import { supabaseAdmin } from "./_shared/supabaseAdmin.ts";

// STUB — not yet wired to a live payment provider. This exists so the
// plan-upgrade and referral-qualification logic has one real entry point to
// call once Platega.io (or any provider) is actually connected; nothing in
// the app can reach real money today.
//
// Fails closed by default: PAYMENT_WEBHOOK_SECRET must be set as an Edge
// Function secret, and the caller must echo it back via X-Webhook-Secret.
// Until that's configured, every request here is rejected with 401.
//
// TODO before going live: replace/augment this shared-secret check with
// verification of the provider's own webhook signature per their docs, and
// map their real payload fields onto the shape read below.
Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const expectedSecret = Deno.env.get("PAYMENT_WEBHOOK_SECRET");
  const providedSecret = req.headers.get("x-webhook-secret");
  if (!expectedSecret || providedSecret !== expectedSecret) {
    return json({ error: "unauthorized" }, 401);
  }

  let body: {
    event?: "succeeded" | "failed" | "refunded";
    userId?: string;
    plan?: "pro" | "pro_plus";
    amountRub?: number;
    providerRef?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  if (!body.event || !body.userId || !body.providerRef) {
    return json({ error: "missing_fields" }, 400);
  }

  const supabase = supabaseAdmin();

  // Idempotency: providers retry webhook delivery. A providerRef already in
  // a terminal state means this event was already applied — never double-
  // charge a plan change or a referral reward off a retried delivery.
  const { data: existing } = await supabase
    .from("payments")
    .select("id, status")
    .eq("provider_ref", body.providerRef)
    .maybeSingle();
  if (existing && (existing.status === "succeeded" || existing.status === "refunded")) {
    return json({ ok: true, alreadyProcessed: true });
  }

  if (body.event === "succeeded") {
    if (!body.plan || !body.amountRub) return json({ error: "missing_fields" }, 400);

    if (existing?.id) {
      await supabase.from("payments").update({ status: "succeeded" }).eq("id", existing.id);
    } else {
      await supabase.from("payments").insert({
        user_id: body.userId,
        plan: body.plan,
        amount_rub: body.amountRub,
        status: "succeeded",
        provider_ref: body.providerRef,
      });
    }

    await supabase.from("profiles").update({ plan: body.plan }).eq("id", body.userId);
    await supabase.rpc("fn_qualify_referral", { p_referred_id: body.userId, p_plan: body.plan });
    return json({ ok: true });
  }

  if (body.event === "refunded") {
    const { data: payment } = await supabase
      .from("payments")
      .select("id, user_id, plan")
      .eq("provider_ref", body.providerRef)
      .maybeSingle();
    if (!payment) return json({ error: "unknown_payment" }, 404);

    await supabase.from("payments").update({ status: "refunded" }).eq("id", payment.id);

    const { data: profile } = await supabase.from("profiles").select("plan").eq("id", payment.user_id).single();
    if (profile?.plan === payment.plan) {
      await supabase.from("profiles").update({ plan: "free" }).eq("id", payment.user_id);
    }

    await supabase.rpc("fn_reverse_referral", { p_referred_id: payment.user_id });
    return json({ ok: true });
  }

  if (body.event === "failed") {
    if (existing?.id) {
      await supabase.from("payments").update({ status: "failed" }).eq("id", existing.id);
    }
    return json({ ok: true });
  }

  return json({ error: "unknown_event" }, 400);
});
