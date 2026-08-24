import clsx from "clsx";
import { Check } from "lucide-react";
import { Button, Card, ErrorState, Skeleton } from "./ui";
import type { PlanInfo } from "../types";

export const PLAN_TITLES: Record<string, string> = { free: "Free", pro: "Pro", pro_plus: "Premium" };

export function rub(amount: number): string {
  if (amount === 0) return "Бесплатно";
  return `${amount.toLocaleString("ru-RU")} ₽/мес`;
}

export function PlanList({
  plans,
  isLoading,
  isError,
  onRetry,
  onUpgrade,
}: {
  plans?: PlanInfo[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onUpgrade: (plan: PlanInfo) => void;
}) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-28 w-full" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <Card>
        <ErrorState title="Не удалось загрузить тарифы" onRetry={onRetry} />
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {plans?.map((plan) => (
        <Card key={plan.id} className="space-y-3 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-bone">{PLAN_TITLES[plan.id]}</p>
            <p className="font-mono text-sm text-bone tabular">{rub(plan.price_rub)}</p>
          </div>
          <ul className="space-y-1.5">
            {plan.features.map((f) => (
              <li key={f} className={clsx("flex items-start gap-2 text-xs text-slate")}>
                <Check size={13} strokeWidth={2} className="mt-0.5 shrink-0 text-moss" />
                {f}
              </li>
            ))}
          </ul>
          <Button
            variant={plan.id === "free" ? "secondary" : "signal"}
            className="w-full"
            onClick={() => onUpgrade(plan)}
          >
            {plan.id === "free" ? "Понизить" : "Улучшить"}
          </Button>
        </Card>
      ))}
    </div>
  );
}
