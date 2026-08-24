import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, ShieldCheck } from "lucide-react";
import { Header } from "../components/Header";
import { BottomNav } from "../components/BottomNav";
import { Card, EmptyState, ErrorState, IconButton, Skeleton, Tag } from "../components/ui";
import { SecretDetailSheet } from "../components/SecretDetailSheet";
import { AddSecretSheet } from "../components/AddSecretSheet";
import { listSecrets } from "../lib/api";
import { relativeDate } from "../lib/format";
import type { SecretSummary } from "../types";

export function VaultScreen() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<SecretSummary | null>(null);
  const [adding, setAdding] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["secrets"],
    queryFn: listSecrets,
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    if (!q) return data;
    return data.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.category?.toLowerCase().includes(q) ||
        s.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }, [data, query]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["secrets"] });

  return (
    <div className="mx-auto min-h-screen max-w-md pb-24">
      <Header
        title="Secure Vault"
        eyebrow="Зашифровано на сервере"
        right={
          <IconButton onClick={() => setAdding(true)} aria-label="Добавить секрет">
            <Plus size={16} strokeWidth={1.5} />
          </IconButton>
        }
      />
      <main className="space-y-4 px-4 pt-4">
        <div className="flex items-center gap-2 rounded-md border border-vault-border bg-vault-surface px-3 py-2.5">
          <Search size={14} strokeWidth={1.5} className="text-slate-dim" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по секретам"
            className="flex-1 bg-transparent text-sm text-bone placeholder:text-slate-dim outline-none"
          />
        </div>

        <p className="px-1 text-[11px] font-medium uppercase tracking-wider text-slate-dim">
          {data ? `${data.length} secrets` : "…"}
        </p>

        {isLoading && (
          <Card className="divide-y divide-vault-border border-vault-border bg-vault-surface p-0">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3.5">
                <Skeleton className="h-9 w-9" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-1/2" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            ))}
          </Card>
        )}

        {isError && (
          <Card className="border-vault-border bg-vault-surface">
            <ErrorState title="Не удалось загрузить Vault" onRetry={() => refetch()} />
          </Card>
        )}

        {!isLoading && !isError && filtered.length === 0 && (
          <Card className="border-vault-border bg-vault-surface">
            <EmptyState
              icon={<ShieldCheck size={22} strokeWidth={1.5} />}
              title={query ? "Ничего не найдено" : "Vault пуст"}
              description={
                query
                  ? "Попробуйте другой запрос."
                  : "Сохраняйте пароли, ключи API и другие чувствительные данные — они шифруются на сервере и никогда не показываются в списке открытым текстом."
              }
            />
          </Card>
        )}

        {!isLoading && !isError && filtered.length > 0 && (
          <Card className="divide-y divide-vault-border border-vault-border bg-vault-surface p-0">
            {filtered.map((secret) => (
              <button
                key={secret.id}
                onClick={() => setSelected(secret)}
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-vault-border bg-graphite-raised text-signal">
                  <ShieldCheck size={16} strokeWidth={1.5} />
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="truncate text-sm font-medium text-bone">{secret.name}</p>
                  <div className="flex items-center gap-1.5 text-xs text-slate">
                    <span className="font-mono tracking-widest">••••••••••</span>
                    <span className="text-hairline-strong">·</span>
                    <span className="tabular font-mono text-[11px]">{relativeDate(secret.updated_at)}</span>
                  </div>
                  {secret.category && (
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      <Tag>{secret.category}</Tag>
                    </div>
                  )}
                </div>
              </button>
            ))}
          </Card>
        )}
      </main>

      <SecretDetailSheet secret={selected} open={Boolean(selected)} onClose={() => setSelected(null)} onChanged={invalidate} />
      <AddSecretSheet open={adding} onClose={() => setAdding(false)} onCreated={invalidate} />
      <BottomNav />
    </div>
  );
}
