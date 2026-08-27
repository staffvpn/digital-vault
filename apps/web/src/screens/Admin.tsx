import { useEffect, useState } from "react";
import { Card, Button, Skeleton, ErrorState } from "../components/ui";

const SESSION_KEY = "ncht_admin_secret";

interface AdminStats {
  totalUsers: number;
  newUsers7d: number;
  newUsers30d: number;
  planCounts: Record<string, number>;
  customPlanUsers: number;
  activeUsers7d: number;
  activeUsers30d: number;
  revenueRub: number;
  revenueByProvider: Record<string, number>;
  paymentsCount: number;
  referralStatusCounts: Record<string, number>;
  deletedCount: number;
  recentSignups: Array<{
    id: string;
    telegram_id: number;
    username: string | null;
    first_name: string | null;
    plan: string;
    custom_plan: unknown;
    created_at: string;
  }>;
  recentDeletions: Array<{
    id: string;
    telegram_id: number;
    username: string | null;
    first_name: string | null;
    plan: string | null;
    created_at: string | null;
    deleted_at: string;
  }>;
}

const PLAN_LABEL: Record<string, string> = { free: "Free", pro: "Pro", pro_plus: "Premium" };

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

async function fetchStats(secret: string): Promise<AdminStats> {
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-stats`, {
    headers: {
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
      "x-admin-secret": secret,
    },
  });
  if (!res.ok) {
    if (res.status === 401) throw new Error("Неверный пароль");
    throw new Error(`Ошибка ${res.status}`);
  }
  return res.json();
}

function Tile({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="p-4">
      <p className="text-[11px] font-medium uppercase tracking-wider text-slate-dim">{label}</p>
      <p className="mt-1 font-mono text-2xl font-semibold text-bone tabular">{value}</p>
    </Card>
  );
}

export function AdminScreen() {
  const [secret, setSecret] = useState(() => sessionStorage.getItem(SESSION_KEY) ?? "");
  const [input, setInput] = useState("");
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (s: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchStats(s);
      setStats(data);
      sessionStorage.setItem(SESSION_KEY, s);
      setSecret(s);
    } catch (err) {
      sessionStorage.removeItem(SESSION_KEY);
      setSecret("");
      setError(err instanceof Error ? err.message : "Не удалось загрузить");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (secret) load(secret);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!secret) {
    return (
      <div className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-4 px-6">
        <p className="text-sm font-semibold text-bone">Админка NCHT Notion</p>
        <input
          type="password"
          autoFocus
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && input && load(input)}
          placeholder="Пароль администратора"
          className="w-full rounded-md border border-hairline bg-graphite-raised px-3 py-2 text-sm text-bone placeholder:text-slate-dim outline-none focus:border-signal-dim"
        />
        {error && <p className="text-xs text-ember">{error}</p>}
        <Button variant="signal" className="w-full" disabled={!input || loading} onClick={() => load(input)}>
          {loading ? "Проверяю…" : "Войти"}
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-screen max-w-2xl px-4 py-6">
      <div className="mb-5 flex items-center justify-between">
        <p className="text-sm font-semibold text-bone">Админка NCHT Notion</p>
        <Button variant="secondary" onClick={() => load(secret)} disabled={loading}>
          {loading ? "Обновляю…" : "Обновить"}
        </Button>
      </div>

      {loading && !stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      )}

      {error && !stats && <ErrorState title="Не удалось загрузить" description={error} onRetry={() => load(secret)} />}

      {stats && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile label="Всего пользователей" value={stats.totalUsers} />
            <Tile label="Новых за 7 дней" value={stats.newUsers7d} />
            <Tile label="Новых за 30 дней" value={stats.newUsers30d} />
            <Tile label="Удалено аккаунтов" value={stats.deletedCount} />
            <Tile label="Активны за 7 дней" value={stats.activeUsers7d} />
            <Tile label="Активны за 30 дней" value={stats.activeUsers30d} />
            <Tile label="На своём тарифе" value={stats.customPlanUsers} />
            <Tile label="Оплат всего" value={stats.paymentsCount} />
          </div>

          <Card className="space-y-2 p-4">
            <p className="text-[11px] font-medium uppercase tracking-wider text-slate-dim">По тарифам</p>
            {Object.entries(stats.planCounts).map(([plan, count]) => (
              <div key={plan} className="flex items-center justify-between text-sm">
                <span className="text-slate">{PLAN_LABEL[plan] ?? plan}</span>
                <span className="font-mono text-bone tabular">{count}</span>
              </div>
            ))}
          </Card>

          <Card className="space-y-2 p-4">
            <p className="text-[11px] font-medium uppercase tracking-wider text-slate-dim">Выручка (succeeded)</p>
            <p className="font-mono text-2xl font-semibold text-bone tabular">{stats.revenueRub.toLocaleString("ru-RU")} ₽</p>
            {Object.entries(stats.revenueByProvider).map(([provider, amount]) => (
              <div key={provider} className="flex items-center justify-between text-xs">
                <span className="text-slate-dim">{provider}</span>
                <span className="font-mono text-slate tabular">{amount.toLocaleString("ru-RU")} ₽</span>
              </div>
            ))}
          </Card>

          <Card className="space-y-2 p-4">
            <p className="text-[11px] font-medium uppercase tracking-wider text-slate-dim">Рефералы по статусу</p>
            {Object.entries(stats.referralStatusCounts).length === 0 && <p className="text-xs text-slate-dim">Пока нет данных</p>}
            {Object.entries(stats.referralStatusCounts).map(([status, count]) => (
              <div key={status} className="flex items-center justify-between text-sm">
                <span className="text-slate">{status}</span>
                <span className="font-mono text-bone tabular">{count}</span>
              </div>
            ))}
          </Card>

          <Card className="space-y-2 p-4">
            <p className="text-[11px] font-medium uppercase tracking-wider text-slate-dim">
              Последние регистрации ({stats.recentSignups.length})
            </p>
            <div className="max-h-72 space-y-1 overflow-y-auto">
              {stats.recentSignups.map((u) => (
                <div key={u.id} className="flex items-center justify-between border-b border-hairline py-1.5 text-xs last:border-0">
                  <span className="min-w-0 truncate text-bone">{u.first_name || u.username || u.telegram_id}</span>
                  <span className="shrink-0 text-slate-dim">{u.custom_plan ? "Свой тариф" : PLAN_LABEL[u.plan] ?? u.plan}</span>
                  <span className="shrink-0 font-mono text-slate-dim tabular">{fmtDate(u.created_at)}</span>
                </div>
              ))}
              {stats.recentSignups.length === 0 && <p className="text-xs text-slate-dim">Пока никого</p>}
            </div>
          </Card>

          <Card className="space-y-2 p-4">
            <p className="text-[11px] font-medium uppercase tracking-wider text-slate-dim">
              Удалённые аккаунты ({stats.recentDeletions.length})
            </p>
            <div className="max-h-72 space-y-1 overflow-y-auto">
              {stats.recentDeletions.map((u, i) => (
                <div key={i} className="flex items-center justify-between border-b border-hairline py-1.5 text-xs last:border-0">
                  <span className="min-w-0 truncate text-bone">{u.first_name || u.username || u.telegram_id}</span>
                  <span className="shrink-0 text-slate-dim">{u.plan ? PLAN_LABEL[u.plan] ?? u.plan : "—"}</span>
                  <span className="shrink-0 font-mono text-slate-dim tabular">{fmtDate(u.deleted_at)}</span>
                </div>
              ))}
              {stats.recentDeletions.length === 0 && (
                <p className="text-xs text-slate-dim">Пока никто не удалял аккаунт (самостоятельного удаления в приложении ещё нет — только по запросу на почту)</p>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
