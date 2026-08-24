import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Header } from "../components/Header";
import { BottomNav } from "../components/BottomNav";
import { CaptureZone } from "../components/CaptureZone";
import { ItemRow } from "../components/ItemRow";
import { ItemActionsSheet } from "../components/ItemActionsSheet";
import { Card, EmptyState, ErrorState, SectionLabel, Skeleton } from "../components/ui";
import { listItems, updateItem } from "../lib/api";
import { useToastStore } from "../state/toast";
import type { VaultItem } from "../types";

export function InboxScreen() {
  const queryClient = useQueryClient();
  const push = useToastStore((s) => s.push);
  const [selected, setSelected] = useState<VaultItem | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["items", "inbox"],
    queryFn: () => listItems({ status: "inbox" }),
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

  return (
    <div className="mx-auto min-h-screen max-w-md pb-24">
      <Header title="Inbox" eyebrow="Digital Vault" />
      <main className="space-y-6 px-4 pt-4">
        <CaptureZone onSaved={invalidate} />

        <div className="space-y-2">
          <SectionLabel>
            Today {data ? `· ${data.length} items` : ""}
          </SectionLabel>

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
                title="Не получилось загрузить Inbox"
                description="Проверьте соединение и попробуйте снова."
                onRetry={() => refetch()}
              />
            </Card>
          )}

          {!isLoading && !isError && data?.length === 0 && (
            <Card>
              <EmptyState
                title="Inbox пуст"
                description="Вставьте ссылку, текст или изображение выше — здесь появится то, что ИИ ещё не разобрал."
              />
            </Card>
          )}

          {!isLoading && !isError && data && data.length > 0 && (
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
          )}
        </div>
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
