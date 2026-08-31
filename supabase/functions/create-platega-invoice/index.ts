import { handleOptions, json } from "./_shared/cors.ts";
import { requireSession } from "./_shared/auth.ts";
import { supabaseAdmin } from "./_shared/supabaseAdmin.ts";
import { validateCustomSelection, customPlanPriceRub } from "./_shared/customPlanPricing.ts";

// Issues a Platega.io hosted payment link — the card/SBP alternative to
// Telegram Stars. We deliberately don't pin a paymentMethod (POST
// /v2/transaction/process, not /transaction/process): Platega's own hosted
// page then offers the payer a method picker (card, SBP, Sberpay, …)
// instead of us hard-coding one. Platega settles in real rubles and calls
// payment-webhook once the transaction resolves; this function only ever
// creates a pending payment row and asks for a URL to redirect to — it
// never grants a plan itself.
Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const session = await requireSession(req);
  if (!session) return json({ error: "unauthorized" }, 401);

  const merchantId = Deno.env.get("PLATEGA_MERCHANT_ID");
  const secret = Deno.env.get("PLATEGA_SECRET");
  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!merchantId || !secret || !botToken) return json({ error: "server_not_configured" }, 500);

  let body: { plan?: string; custom?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const supabase = supabaseAdmin();

  let amountRub: number;
  let description: string;
  let insertFields: Record<string, unknown>;

  if (body.plan === "pro" || body.plan === "pro_plus") {
    const { data: plan } = await supabase.from("plans").select("id, price_rub").eq("id", body.plan).single();
    if (!plan || plan.price_rub <= 0) return json({ error: "plan_not_purchasable" }, 400);

    // Same one-time 10% referral discount as Stars and the ready-made-plan
    // cards, decided the same way everywhere else: referred by someone,
    // hasn't used the discount yet.
    const { data: profile } = await supabase
      .from("profiles")
      .select("referred_by, referral_discount_used")
      .eq("id", session.userId)
      .single();
    const discounted = Boolean(profile?.referred_by) && !profile?.referral_discount_used;
    amountRub = discounted ? Math.round(plan.price_rub * 0.9) : plan.price_rub;
    const title = plan.id === "pro" ? "NCHT Notion Pro" : "NCHT Notion Premium";
    description = `Подписка «${title}» на 1 месяц`;
    insertFields = { plan: plan.id };
  } else if (body.custom) {
    // No referral discount for the custom plan — same invariant the Stars
    // flow and the Mini App's CustomPlanCard already document.
    const sel = validateCustomSelection(body.custom);
    if (!sel) return json({ error: "invalid_custom_selection" }, 400);
    amountRub = customPlanPriceRub(sel);
    description = `${sel.storageGb} ГБ, ${sel.aiCalls} AI-сохранений/мес, ${sel.secrets} мест в Сейфе${sel.features.length ? `, +${sel.features.length} доп. функции` : ""}`;
    insertFields = { custom_plan: sel };
  } else {
    return json({ error: "invalid_plan" }, 400);
  }

  const { data: payment, error: insertError } = await supabase
    .from("payments")
    .insert({
      user_id: session.userId,
      amount_rub: amountRub,
      status: "pending",
      provider: "platega",
      ...insertFields,
    })
    .select("id")
    .single();
  if (insertError || !payment) return json({ error: "payment_create_failed" }, 500);

  // Reopening the Mini App (rather than a plain https:// page) once the
  // hosted payment page closes — a t.me link tapped inside Telegram's own
  // in-app browser relaunches the app natively, the same trick the
  // referral and collection-share links already rely on.
  const me = await fetch(`https://api.telegram.org/bot${botToken}/getMe`).then((r) => r.json()).catch(() => null);
  const botUsername: string | undefined = me?.result?.username;
  const returnUrl = botUsername ? `https://t.me/${botUsername}/ncht` : "https://t.me";

  const res = await fetch("https://app.platega.io/v2/transaction/process", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-MerchantId": merchantId,
      "X-Secret": secret,
    },
    body: JSON.stringify({
      paymentDetails: { amount: amountRub, currency: "RUB" },
      description,
      return: returnUrl,
      failedUrl: returnUrl,
      payload: payment.id,
      metadata: { userId: session.userId },
    }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.url || !data?.transactionId) {
    await supabase.from("payments").update({ status: "failed" }).eq("id", payment.id);
    return json({ error: "platega_error", detail: data }, 502);
  }

  // The callback only ever sends this transaction ID back, never our own
  // payment.id — this is the only way payment-webhook can look the row
  // back up when it fires, so it has to be stored now.
  await supabase.from("payments").update({ provider_ref: data.transactionId }).eq("id", payment.id);

  return json({ paymentUrl: data.url as string, paymentId: payment.id as string, amountRub });
});
