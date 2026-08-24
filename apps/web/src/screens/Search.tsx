import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search as SearchIcon, Sparkles } from "lucide-react";
import { Header } from "../components/Header";
import { BottomNav } from "../components/BottomNav";
import { ItemRow } from "../components/ItemRow";
import { ItemActionsSheet } from "../components/ItemActionsSheet";
import { Card, EmptyState, ErrorState, Skeleton } from "../components/ui";
import { listItems } from "../lib/api";
import type { VaultItem } from "../types";

export function SearchScreen() {
  const queryClient = useQueryClient();
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<VaultItem | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["items", "search", query],
    queryFn: () => listItems({ q: query }),
    enabled: query.length > 0,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["items"] });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setQuery(input.trim());
  };

  return (
    <div className="mx-auto min-h-screen max-w-md pb-24">
      <Header title="Search" eyebrow="Digital Vault" />
      <main className="space-y-4 px-4 pt-4">
        <form onSubmit={submit} className="flex items-center gap-2 rounded-md border border-hairline bg-graphite-raised px-3 py-2.5">
          <SearchIcon size={15} strokeWidth={1.5} className="text-slate-dim" />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Найдите что угодно по названию, тегам, категории…"
            className="flex-1 bg-transparent text-sm text-bone placeholder:text-slate-dim outline-none"
          />
        </form>

        {!query && (
          <Card className="flex items-start gap-2.5 p-4">
            <Sparkles size={15} strokeWidth={1.5} className="mt-0.5 shrink-0 text-signal" />
            <p className="text-xs leading-relaxed text-slate">
              Поиск ищет по названию, описанию, категориям, тегам и распознанному тексту. Семантический поиск по
              смыслу («тёмный сайт с зелёной кнопкой») доступен на Pro.
            </p>
          </Card>
        )}

        {query && isLoading && (
          <Card className="divide-y divide-hairline p-0">
            {[0, 1].map((i) => (
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

        {query && isError && (
          <Card>
            <ErrorState title="Поиск не сработал" onRetry={() => refetch()} />
          </Card>
        )}

        {query && !isLoading && !isError && data?.length === 0 && (
          <Card>
            <EmptyState title="Ничего не найдено" description={`Ничего похожего на «${query}» пока нет в хранилище.`} />
          </Card>
        )}

        {query && !isLoading && !isError && data && data.length > 0 && (
          <Card className="divide-y divide-hairline p-0">
            {data.map((item) => (
              <ItemRow key={item.id} item={item} onOpen={() => setSelected(item)} />
            ))}
          </Card>
        )}
      </main>
      <ItemActionsSheet item={selected} open={Boolean(selected)} onClose={() => setSelected(null)} onChanged={invalidate} />
      <BottomNav />
    </div>
  );
}
