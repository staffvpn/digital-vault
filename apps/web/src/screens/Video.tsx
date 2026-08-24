import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PlaySquare } from "lucide-react";
import { Header } from "../components/Header";
import { BottomNav } from "../components/BottomNav";
import { ItemVisualCard } from "../components/ItemVisualCard";
import { ItemActionsSheet } from "../components/ItemActionsSheet";
import { Card, EmptyState, ErrorState, Skeleton } from "../components/ui";
import { listItems } from "../lib/api";
import type { VaultItem } from "../types";

export function VideoScreen() {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<VaultItem | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["items", "bookmark", "Видео"],
    queryFn: () => listItems({ type: "bookmark", category: "Видео" }),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["items"] });

  return (
    <div className="mx-auto min-h-screen max-w-md pb-24">
      <Header title="Видео" eyebrow="Библиотека" back />
      <main className="px-4 pt-4">
        {isLoading && (
          <div className="grid grid-cols-2 gap-3">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="aspect-[4/3] w-full" />
            ))}
          </div>
        )}

        {isError && (
          <Card>
            <ErrorState title="Не удалось загрузить" onRetry={() => refetch()} />
          </Card>
        )}

        {!isLoading && !isError && data?.length === 0 && (
          <Card>
            <EmptyState
              icon={<PlaySquare size={22} strokeWidth={1.5} />}
              title="Пока пусто"
              description="Вставьте ссылку на видео (YouTube и т.п.) во Входящих — оно появится здесь с обложкой."
            />
          </Card>
        )}

        {!isLoading && !isError && data && data.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            {data.map((item) => (
              <ItemVisualCard key={item.id} item={item} onOpen={() => setSelected(item)} />
            ))}
          </div>
        )}
      </main>
      <ItemActionsSheet item={selected} open={Boolean(selected)} onClose={() => setSelected(null)} onChanged={invalidate} />
      <BottomNav />
    </div>
  );
}
