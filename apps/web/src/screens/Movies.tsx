import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Clapperboard } from "lucide-react";
import clsx from "clsx";
import { Header } from "../components/Header";
import { BottomNav } from "../components/BottomNav";
import { ItemActionsSheet } from "../components/ItemActionsSheet";
import { Card, EmptyState, ErrorState, Skeleton } from "../components/ui";
import { listItems } from "../lib/api";
import type { MovieStatus, VaultItem } from "../types";

const TABS: { key: MovieStatus; label: string }[] = [
  { key: "watch_later", label: "Хочу посмотреть" },
  { key: "watching", label: "Смотрю" },
  { key: "watched", label: "Посмотрено" },
];

export function MoviesScreen() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<MovieStatus>("watch_later");
  const [selected, setSelected] = useState<VaultItem | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["items", "movies"],
    queryFn: async () => {
      const [movies, series] = await Promise.all([
        listItems({ type: "movie" }),
        listItems({ type: "series" }),
      ]);
      return [...movies, ...series];
    },
  });

  const filtered = useMemo(
    () => (data ?? []).filter((i) => (i.movie_status ?? "watch_later") === tab),
    [data, tab],
  );

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["items"] });

  return (
    <div className="mx-auto min-h-screen max-w-md pb-24">
      <Header title="Фильмы и сериалы" eyebrow="Библиотека" back />
      <main className="space-y-4 px-4 pt-4">
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={clsx(
                "shrink-0 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                tab === t.key
                  ? "border-signal-dim/60 bg-signal/10 text-signal"
                  : "border-hairline text-slate hover:text-bone",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {isLoading && (
          <div className="grid grid-cols-3 gap-2.5">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="aspect-[2/3] w-full" />
            ))}
          </div>
        )}

        {isError && (
          <Card>
            <ErrorState title="Не удалось загрузить" onRetry={() => refetch()} />
          </Card>
        )}

        {!isLoading && !isError && filtered.length === 0 && (
          <Card>
            <EmptyState icon={<Clapperboard size={22} strokeWidth={1.5} />} title="Пока пусто" description="Вставьте ссылку на фильм или сериал во Входящие." />
          </Card>
        )}

        {!isLoading && !isError && filtered.length > 0 && (
          <div className="grid grid-cols-3 gap-2.5">
            {filtered.map((item) => (
              <button
                key={item.id}
                onClick={() => setSelected(item)}
                className="flex flex-col overflow-hidden rounded-lg border border-hairline bg-graphite text-left active:scale-[0.98]"
              >
                <div className="flex aspect-[2/3] items-center justify-center bg-graphite-raised">
                  {item.preview_url ? (
                    <img src={item.preview_url} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <Clapperboard size={20} strokeWidth={1.2} className="text-slate-dim" />
                  )}
                </div>
                <div className="p-1.5">
                  <p className="line-clamp-2 text-[11px] font-medium leading-snug text-bone">{item.title}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </main>
      <ItemActionsSheet item={selected} open={Boolean(selected)} onClose={() => setSelected(null)} onChanged={invalidate} />
      <BottomNav />
    </div>
  );
}
