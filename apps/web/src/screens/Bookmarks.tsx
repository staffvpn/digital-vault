import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark } from "lucide-react";
import { Header } from "../components/Header";
import { BottomNav } from "../components/BottomNav";
import { ItemRow } from "../components/ItemRow";
import { ItemActionsSheet } from "../components/ItemActionsSheet";
import { Card, EmptyState, ErrorState, Skeleton } from "../components/ui";
import { listItems } from "../lib/api";
import type { VaultItem } from "../types";

export function BookmarksScreen() {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<VaultItem | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["items", "bookmark"],
    queryFn: () => listItems({ type: "bookmark" }),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["items"] });

  return (
    <div className="mx-auto min-h-screen max-w-md pb-24">
      <Header title="Bookmarks" eyebrow="Library" back />
      <main className="px-4 pt-4">
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
            <ErrorState title="Не удалось загрузить" onRetry={() => refetch()} />
          </Card>
        )}
        {!isLoading && !isError && data?.length === 0 && (
          <Card>
            <EmptyState icon={<Bookmark size={22} strokeWidth={1.5} />} title="Пока пусто" description="Сохранённые ссылки появятся здесь." />
          </Card>
        )}
        {!isLoading && !isError && data && data.length > 0 && (
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
