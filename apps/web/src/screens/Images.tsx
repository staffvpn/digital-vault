import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Image as ImageIcon, MoreHorizontal } from "lucide-react";
import { Header } from "../components/Header";
import { BottomNav } from "../components/BottomNav";
import { FileThumb } from "../components/FileThumb";
import { ItemActionsSheet } from "../components/ItemActionsSheet";
import { Card, EmptyState, ErrorState, Skeleton } from "../components/ui";
import { listItems } from "../lib/api";
import { useLightboxStore } from "../state/lightbox";
import { haptic } from "../lib/telegram";
import type { VaultItem } from "../types";

export function ImagesScreen() {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<VaultItem | null>(null);
  const openLightbox = useLightboxStore((s) => s.open);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["items", "image"],
    queryFn: () => listItems({ type: "image" }),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["items"] });

  const openTile = (item: VaultItem) => {
    haptic("light");
    openLightbox(item);
  };

  return (
    <div className="mx-auto min-h-screen max-w-md pb-24">
      <Header title="Изображения" eyebrow="Библиотека" back />
      <main className="px-4 pt-4">
        {isLoading && (
          <div className="grid grid-cols-3 gap-2">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="aspect-square w-full" />
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
              icon={<ImageIcon size={22} strokeWidth={1.5} />}
              title="Пока пусто"
              description="Вставьте (Ctrl+V) или перетащите картинку во Входящих — она сохранится здесь."
            />
          </Card>
        )}

        {!isLoading && !isError && data && data.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {data.map((item) => (
              <div key={item.id} className="relative overflow-hidden rounded-md border border-hairline bg-graphite-raised">
                <button
                  onClick={() => openTile(item)}
                  className="aspect-square w-full active:scale-[0.97]"
                >
                  <FileThumb item={item} />
                </button>
                <button
                  onClick={() => setSelected(item)}
                  aria-label="Действия"
                  className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-md bg-void/70 text-bone backdrop-blur-sm"
                >
                  <MoreHorizontal size={13} strokeWidth={1.5} />
                </button>
              </div>
            ))}
          </div>
        )}
      </main>
      <ItemActionsSheet item={selected} open={Boolean(selected)} onClose={() => setSelected(null)} onChanged={invalidate} />
      <BottomNav />
    </div>
  );
}
