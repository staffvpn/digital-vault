import { useQuery } from "@tanstack/react-query";
import { Check, UserRound } from "lucide-react";
import clsx from "clsx";
import { Header } from "../components/Header";
import { BottomNav } from "../components/BottomNav";
import { Button, Card, ErrorState, Skeleton } from "../components/ui";
import { listPlans } from "../lib/api";
import { useAuthStore } from "../state/auth";
import { formatBytes } from "../lib/typeMeta";
import { useToastStore } from "../state/toast";

function rub(amount: number): string {
  if (amount === 0) return "Бесплатно";
  return `${amount.toLocaleString("ru-RU")} ₽/мес`;
}

const PLAN_TITLES: Record<string, string> = { free: "Free", pro: "Pro", pro_plus: "Premium" };

export function SettingsScreen() {
  const profile = useAuthStore((s) => s.profile);
  const push = useToastStore((s) => s.push);
  const { data: plans, isLoading, isError, refetch } = useQuery({ queryKey: ["plans"], queryFn: listPlans });

  const currentPlan = plans?.find((p) => p.id === profile?.plan);

  return (
    <div className="mx-auto min-h-screen max-w-md pb-24">
      <Header title="Профиль" eyebrow="Личное хранилище" />
      <main className="space-y-5 px-4 pt-4">
        <Card className="flex items-center gap-3 p-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-md border border-hairline bg-graphite-raised text-slate">
            <UserRound size={18} strokeWidth={1.5} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-bone">{profile?.firstName || profile?.username || "Пользователь"}</p>
            <p className="text-xs text-slate">
              Тариф: <span className="text-bone">{PLAN_TITLES[profile?.plan ?? "free"]}</span>
            </p>
          </div>
        </Card>

        {profile && currentPlan && (
          <Card className="space-y-3 p-4">
            <p className="text-[11px] font-medium uppercase tracking-wider text-slate-dim">Расход</p>
            <UsageRow label="Хранилище" used={profile.storageUsedBytes} limit={currentPlan.storage_limit_bytes} format={formatBytes} />
            <UsageRow label="AI-операции" used={profile.aiCallsUsed} limit={currentPlan.ai_calls_limit_per_month} format={(n) => `${n}`} />
            <UsageRow label="Секреты" used={profile.secretsCount} limit={currentPlan.secrets_limit} format={(n) => `${n}`} />
          </Card>
        )}

        <div className="space-y-2">
          <p className="px-1 text-[11px] font-medium uppercase tracking-wider text-slate-dim">Тарифы</p>

          {isLoading && (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-28 w-full" />
              ))}
            </div>
          )}

          {isError && (
            <Card>
              <ErrorState title="Не удалось загрузить тарифы" onRetry={() => refetch()} />
            </Card>
          )}

          {plans?.map((plan) => {
            const isCurrent = plan.id === profile?.plan;
            return (
              <Card
                key={plan.id}
                className={clsx("space-y-3 p-4", isCurrent && "border-signal-dim/60")}
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-bone">{PLAN_TITLES[plan.id]}</p>
                  <p className="font-mono text-sm text-bone tabular">{rub(plan.price_rub)}</p>
                </div>
                <ul className="space-y-1.5">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-xs text-slate">
                      <Check size={13} strokeWidth={2} className="mt-0.5 shrink-0 text-moss" />
                      {f}
                    </li>
                  ))}
                </ul>
                {isCurrent ? (
                  <Button variant="secondary" disabled className="w-full">
                    Текущий тариф
                  </Button>
                ) : (
                  <Button
                    variant={plan.id === "free" ? "secondary" : "signal"}
                    className="w-full"
                    onClick={() => push("Оплата подключается — скоро через Platega.io", "default")}
                  >
                    {plan.id === "free" ? "Понизить" : "Улучшить"}
                  </Button>
                )}
              </Card>
            );
          })}
        </div>

        <p className="px-1 text-center text-[11px] leading-relaxed text-slate-dim">
          Сервис не даёт абсолютных гарантий безопасности — но шифрует секреты на сервере, никогда не хранит
          их в открытом виде и не отправляет в AI.
        </p>
      </main>
      <BottomNav />
    </div>
  );
}

function UsageRow({
  label,
  used,
  limit,
  format,
}: {
  label: string;
  used: number;
  limit: number;
  format: (n: number) => string;
}) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate">{label}</span>
        <span className="font-mono text-slate tabular">
          {format(used)} / {format(limit)}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-graphite-raised">
        <div
          className={clsx("h-full rounded-full transition-all", pct >= 90 ? "bg-ember" : "bg-signal")}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
