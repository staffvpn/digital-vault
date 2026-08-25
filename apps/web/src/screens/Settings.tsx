import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { UserRound, Info } from "lucide-react";
import clsx from "clsx";
import { Header } from "../components/Header";
import { BottomNav } from "../components/BottomNav";
import { Card } from "../components/ui";
import { PLAN_TITLES } from "../components/PlanList";
import { ReferralCard } from "../components/ReferralCard";
import { listPlans } from "../lib/api";
import { useAuthStore } from "../state/auth";
import { formatBytes } from "../lib/typeMeta";

export function SettingsScreen() {
  const navigate = useNavigate();
  const profile = useAuthStore((s) => s.profile);
  const { data: plans } = useQuery({ queryKey: ["plans"], queryFn: listPlans });

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
            <UsageRow
              label="Секреты"
              used={profile.secretsCount}
              limit={currentPlan.secrets_limit + profile.secretsBonus}
              format={(n) => `${n}`}
            />
          </Card>
        )}

        {(profile?.plan === "pro" || profile?.plan === "pro_plus") && <ReferralCard />}

        <div className="flex justify-center pt-2">
          <button
            onClick={() => navigate("/settings/info")}
            className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-graphite px-3 py-1.5 text-xs text-slate transition-colors hover:border-hairline-strong hover:text-bone active:scale-[0.97]"
          >
            <Info size={13} strokeWidth={1.5} />
            Info
          </button>
        </div>
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
