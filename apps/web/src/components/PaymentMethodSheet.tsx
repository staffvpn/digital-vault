import { useState } from "react";
import { Sparkles, CreditCard } from "lucide-react";
import { Sheet } from "./Sheet";
import { PLAN_TITLES, rub } from "./PlanList";
import { createStarsInvoice, createPlategaInvoice, authenticate, ApiError } from "../lib/api";
import { openInvoice, openExternalLink, getInitData } from "../lib/telegram";
import { useAuthStore } from "../state/auth";
import { useToastStore } from "../state/toast";
import type { PlanInfo } from "../types";
import type { CustomPlanSelection } from "../lib/customPlanPricing";

export type PaymentTarget =
  | { kind: "plan"; plan: PlanInfo }
  | { kind: "custom"; selection: CustomPlanSelection; priceRub: number; priceStars: number };

// Two ways to pay for a plan — preset or hand-assembled: Telegram Stars
// (Telegram itself is the payment provider, no external account needed)
// or card/SBP via Platega.io (a hosted redirect — see create-platega-invoice
// and payment-webhook).
export function PaymentMethodSheet({
  target,
  open,
  onClose,
}: {
  target: PaymentTarget | null;
  open: boolean;
  onClose: () => void;
}) {
  const push = useToastStore((s) => s.push);
  const profile = useAuthStore((s) => s.profile);
  const refreshProfile = useAuthStore((s) => s.refreshProfile);
  const [payingStars, setPayingStars] = useState(false);
  const [payingPlatega, setPayingPlatega] = useState(false);

  if (!target) return null;

  // The custom plan never gets the referral discount — same invariant the
  // custom-plan card itself documents.
  const discounted = target.kind === "plan" && Boolean(profile?.hasReferralDiscount);
  const title = target.kind === "plan" ? PLAN_TITLES[target.plan.id] : "Свой тариф";
  const starsPrice =
    target.kind === "plan" ? (discounted ? Math.round(target.plan.price_stars * 0.9) : target.plan.price_stars) : target.priceStars;
  const rubPrice =
    target.kind === "plan" ? (discounted ? Math.round(target.plan.price_rub * 0.9) : target.plan.price_rub) : target.priceRub;

  const payWithStars = async () => {
    setPayingStars(true);
    try {
      const { invoiceLink } =
        target.kind === "plan"
          ? await createStarsInvoice({ plan: target.plan.id as "pro" | "pro_plus" })
          : await createStarsInvoice({ custom: target.selection });
      const status = await openInvoice(invoiceLink);
      if (status === "paid") {
        push("Оплата прошла — тариф обновляется…", "success");
        const initData = getInitData();
        if (initData) {
          try {
            const fresh = await authenticate(initData);
            refreshProfile(fresh.profile);
          } catch {
            // Webhook already granted the plan server-side either way —
            // the next app launch will pick it up if this refresh fails.
          }
        }
        onClose();
      } else if (status === "cancelled") {
        push("Оплата отменена", "default");
      } else if (status === "failed") {
        push("Оплата не прошла — попробуйте ещё раз", "error");
      }
    } catch (err) {
      const msg =
        err instanceof ApiError && (err.code === "plan_not_purchasable" || err.code === "invalid_custom_selection")
          ? "Этот тариф пока нельзя купить — попробуйте изменить параметры"
          : "Не удалось создать счёт — попробуйте позже";
      push(msg, "error");
    } finally {
      setPayingStars(false);
    }
  };

  const payWithPlatega = async () => {
    setPayingPlatega(true);
    try {
      const { paymentUrl } =
        target.kind === "plan"
          ? await createPlategaInvoice({ plan: target.plan.id as "pro" | "pro_plus" })
          : await createPlategaInvoice({ custom: target.selection });
      openExternalLink(paymentUrl);
      // Unlike Stars, there's no in-app callback the moment the payment
      // resolves — Platega calls the server webhook once it settles, and
      // that's what actually grants the plan. Closing the sheet now is
      // safe either way; the next time the app opens (tapping the return
      // link, or just re-launching it) the profile refresh picks it up.
      push("Открылась страница оплаты — после оплаты тариф обновится сам", "default");
      onClose();
    } catch (err) {
      const msg =
        err instanceof ApiError && (err.code === "plan_not_purchasable" || err.code === "invalid_custom_selection")
          ? "Этот тариф пока нельзя купить — попробуйте изменить параметры"
          : "Не удалось создать счёт — попробуйте позже";
      push(msg, "error");
    } finally {
      setPayingPlatega(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title={`Оплата: ${title}`}>
      <div className="space-y-3">
        <p className="text-xs text-slate-dim">Выберите способ оплаты</p>

        <button
          onClick={payWithStars}
          disabled={payingStars}
          className="flex w-full items-center gap-3 rounded-md border border-hairline bg-graphite-raised px-3 py-3 text-left transition-colors hover:border-signal-dim disabled:opacity-60"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-hairline text-signal">
            <Sparkles size={16} strokeWidth={1.5} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-bone">Telegram Stars</p>
            <p className="text-xs text-slate-dim">Оплата звёздами внутри Telegram, мгновенно</p>
          </div>
          <p className="shrink-0 font-mono text-sm text-bone tabular">{payingStars ? "…" : `${starsPrice} ⭐`}</p>
        </button>

        <button
          onClick={payWithPlatega}
          disabled={payingPlatega}
          className="flex w-full items-center gap-3 rounded-md border border-hairline bg-graphite-raised px-3 py-3 text-left transition-colors hover:border-hairline-strong disabled:opacity-60"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-hairline text-slate">
            <CreditCard size={16} strokeWidth={1.5} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-bone">Карта / СБП</p>
            <p className="text-xs text-slate-dim">Через Platega.io</p>
          </div>
          <p className="shrink-0 font-mono text-sm text-bone tabular">{payingPlatega ? "…" : rub(rubPrice)}</p>
        </button>

        {discounted && <p className="text-center text-[11px] text-signal">-10% по реферальной ссылке применится при оплате</p>}
      </div>
    </Sheet>
  );
}
