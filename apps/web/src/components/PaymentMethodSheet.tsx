import { useState } from "react";
import { Sparkles, CreditCard } from "lucide-react";
import { Sheet } from "./Sheet";
import { PLAN_TITLES, rub } from "./PlanList";
import { createStarsInvoice, authenticate, ApiError } from "../lib/api";
import { openInvoice, getInitData } from "../lib/telegram";
import { useAuthStore } from "../state/auth";
import { useToastStore } from "../state/toast";
import type { PlanInfo } from "../types";

// Two ways to pay for a ready-made plan: Telegram Stars (live — Telegram
// itself is the payment provider, no external account needed) or
// card/SBP via Platega.io (still a stub — see payment-webhook).
export function PaymentMethodSheet({
  plan,
  open,
  onClose,
}: {
  plan: PlanInfo | null;
  open: boolean;
  onClose: () => void;
}) {
  const push = useToastStore((s) => s.push);
  const profile = useAuthStore((s) => s.profile);
  const refreshProfile = useAuthStore((s) => s.refreshProfile);
  const [payingStars, setPayingStars] = useState(false);

  if (!plan) return null;

  const discounted = Boolean(profile?.hasReferralDiscount);
  const starsPrice = discounted ? Math.round(plan.price_stars * 0.9) : plan.price_stars;
  const rubPrice = discounted ? Math.round(plan.price_rub * 0.9) : plan.price_rub;

  const payWithStars = async () => {
    setPayingStars(true);
    try {
      const { invoiceLink } = await createStarsInvoice(plan.id as "pro" | "pro_plus");
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
      const msg = err instanceof ApiError && err.code === "plan_not_purchasable" ? "Этот тариф пока нельзя купить" : "Не удалось создать счёт — попробуйте позже";
      push(msg, "error");
    } finally {
      setPayingStars(false);
    }
  };

  const payWithPlatega = () => push("Оплата картой/СБП подключается — скоро", "default");

  return (
    <Sheet open={open} onClose={onClose} title={`Оплата: ${PLAN_TITLES[plan.id]}`}>
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
          className="flex w-full items-center gap-3 rounded-md border border-hairline bg-graphite-raised px-3 py-3 text-left transition-colors hover:border-hairline-strong"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-hairline text-slate">
            <CreditCard size={16} strokeWidth={1.5} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-bone">Карта / СБП</p>
            <p className="text-xs text-slate-dim">Через Platega.io — скоро</p>
          </div>
          <p className="shrink-0 font-mono text-sm text-bone tabular">{rub(rubPrice)}</p>
        </button>

        {discounted && <p className="text-center text-[11px] text-signal">-10% по реферальной ссылке применится при оплате</p>}
      </div>
    </Sheet>
  );
}
