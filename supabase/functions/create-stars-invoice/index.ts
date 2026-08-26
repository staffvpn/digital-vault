import { handleOptions, json } from "./_shared/cors.ts";
import { requireSession } from "./_shared/auth.ts";
import { supabaseAdmin } from "./_shared/supabaseAdmin.ts";
import { validateCustomSelection, customPlanPriceRub, customPlanPriceStars } from "./_shared/customPlanPricing.ts";

// Issues a Telegram Stars invoice link — for a preset plan (Pro/Premium)
// or for a hand-assembled "Свой тариф" selection. Stars need no external
// merchant account — Telegram itself settles the payment (currency "XTR",
// empty provider_token). The Mini App opens the returned link via
// Telegram.WebApp.openInvoice(); Telegram then calls telegram-webhook
// with pre_checkout_query, and once confirmed, message.successful_payment
// — that's where the plan actually gets granted, never here (this only
// creates a pending invoice, it never charges anyone).
Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const session = await requireSession(req);
  if (!session) return json({ error: "unauthorized" }, 401);

  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!botToken) return json({ error: "server_not_configured" }, 500);

  let body: { plan?: string; custom?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const supabase = supabaseAdmin();

  let amountRub: number;
  let stars: number;
  let title: string;
  let description: string;
  let insertFields: Record<string, unknown>;

  if (body.plan === "pro" || body.plan === "pro_plus") {
    const { data: plan } = await supabase
      .from("plans")
      .select("id, price_rub, price_stars")
      .eq("id", body.plan)
      .single();
    if (!plan || plan.price_stars <= 0) return json({ error: "plan_not_purchasable" }, 400);

    // Price is computed here, server-side, from the plans table — never
    // trusted from the client. Same one-time 10% referral discount as the
    // ready-made-plan cards, decided the same way auth-telegram decides it:
    // referred by someone, and hasn't used the discount yet.
    const { data: profile } = await supabase
      .from("profiles")
      .select("referred_by, referral_discount_used")
      .eq("id", session.userId)
      .single();
    const discounted = Boolean(profile?.referred_by) && !profile?.referral_discount_used;
    stars = discounted ? Math.round(plan.price_stars * 0.9) : plan.price_stars;
    amountRub = plan.price_rub;
    title = plan.id === "pro" ? "NCHT Notion Pro" : "NCHT Notion Premium";
    description = `Подписка «${title}» на 1 месяц`;
    insertFields = { plan: plan.id };
  } else if (body.custom) {
    // No referral discount for the custom plan — same invariant the Mini
    // App's CustomPlanCard already documents: a hand-assembled bundle is
    // deliberately never discounted on top of its already-higher price.
    const sel = validateCustomSelection(body.custom);
    if (!sel) return json({ error: "invalid_custom_selection" }, 400);
    amountRub = customPlanPriceRub(sel);
    stars = customPlanPriceStars(sel);
    title = "NCHT Notion — свой тариф";
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
      amount_stars: stars,
      status: "pending",
      provider: "telegram_stars",
      ...insertFields,
    })
    .select("id")
    .single();
  if (insertError || !payment) return json({ error: "payment_create_failed" }, 500);

  const res = await fetch(`https://api.telegram.org/bot${botToken}/createInvoiceLink`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      title,
      description,
      payload: payment.id,
      provider_token: "",
      currency: "XTR",
      prices: [{ label: title, amount: stars }],
    }),
  });
  const data = await res.json().catch(() => null);
  if (!data?.ok || !data.result) {
    await supabase.from("payments").update({ status: "failed" }).eq("id", payment.id);
    return json({ error: "telegram_error", detail: data?.description }, 502);
  }

  return json({ invoiceLink: data.result as string, paymentId: payment.id as string, stars });
});
