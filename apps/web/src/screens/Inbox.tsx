import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Header } from "../components/Header";
import { BottomNav } from "../components/BottomNav";
import { CaptureZone } from "../components/CaptureZone";
import { ItemRow } from "../components/ItemRow";
import { ItemActionsSheet } from "../components/ItemActionsSheet";
import { PlanList, PLAN_TITLES, rub } from "../components/PlanList";
import { CustomPlanCard } from "../components/CustomPlanCard";
import { ReferralCard } from "../components/ReferralCard";
import { Badge, Card, ErrorState, SectionLabel, Skeleton } from "../components/ui";
import { listItems, listPlans, updateItem } from "../lib/api";
import { useAuthStore } from "../state/auth";
import { useToastStore } from "../state/toast";
import type { CustomPlanSelection } from "../lib/customPlanPricing";
import type { PlanInfo, VaultItem } from "../types";

export function InboxScreen() {
  const queryClient = useQueryClient();
  const push = useToastStore((s) => s.push);
  const profile = useAuthStore((s) => s.profile);
  const [selected, setSelected] = useState<VaultItem | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["items", "inbox"],
    queryFn: () => listItems({ status: "inbox" }),
  });

  const { data: plans, isLoading: plansLoading, isError: plansError, refetch: refetchPlans } = useQuery({
    queryKey: ["plans"],
    queryFn: listPlans,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["items"] });

  const quickSave = async (item: VaultItem) => {
    try {
      await updateItem(item.id, { status: "saved" });
      push("Сохранено", "success");
      invalidate();
    } catch {
      push("Не удалось сохранить", "error");
    }
  };

  const currentPlan = plans?.find((p) => p.id === profile?.plan);
  const otherPlans = plans?.filter((p) => p.id !== profile?.plan);

  const onUpgrade = (_plan: PlanInfo) => push("Оплата подключается — скоро через Platega.io", "default");
  const onCustomCheckout = (_price: number, _sel: CustomPlanSelection) =>
    push("Оплата подключается — скоро через Platega.io", "default");

  return (
    <div className="mx-auto min-h-screen max-w-md pb-24">
      <Header title="Входящие" eyebrow="Личное хранилище" />
      <main className="space-y-6 px-4 pt-4">
        <CaptureZone onSaved={invalidate} />

        {!isLoading && !isError && data && data.length > 0 && (
          <div className="space-y-2">
            <Card className="divide-y divide-hairline p-0">
              {data.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  onOpen={() => setSelected(item)}
                  onQuickSave={() => quickSave(item)}
                />
              ))}
            </Card>
          </div>
        )}

        {isLoading && (
          <Card className="divide-y divide-hairline p-0">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <Skeleton className="h-9 w-9" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-2/3" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            ))}
          </Card>
        )}

        {isError && (
          <Card>
            <ErrorState
              title="Не получилось загрузить Входящие"
              description="Проверьте соединение и попробуйте снова."
              onRetry={() => refetch()}
            />
          </Card>
        )}

        <section className="space-y-2">
          <SectionLabel>Ваш тариф</SectionLabel>
          {currentPlan ? (
            <Card className="flex items-center justify-between p-4">
              <div>
                <p className="text-sm font-semibold text-bone">{PLAN_TITLES[currentPlan.id]}</p>
                <p className="text-xs text-slate">{rub(currentPlan.price_rub)}</p>
              </div>
              <Badge tone="signal">Текущий</Badge>
            </Card>
          ) : (
            <Skeleton className="h-16 w-full" />
          )}
        </section>

        {(otherPlans?.length ?? 1) > 0 && (
          <section className="space-y-2">
            <SectionLabel>Другие тарифы</SectionLabel>
            <PlanList
              plans={otherPlans}
              isLoading={plansLoading}
              isError={plansError}
              onRetry={() => refetchPlans()}
              onUpgrade={onUpgrade}
            />
          </section>
        )}

        <section className="space-y-2">
          <SectionLabel>Свой тариф</SectionLabel>
          <CustomPlanCard plans={plans} onCheckout={onCustomCheckout} />
        </section>

        {(profile?.plan === "pro" || profile?.plan === "pro_plus") && (
          <section className="space-y-2">
            <SectionLabel>Приглашения</SectionLabel>
            <ReferralCard />
          </section>
        )}
      </main>
      <ItemActionsSheet
        item={selected}
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        onChanged={invalidate}
      />
      <BottomNav />
    </div>
  );
}
