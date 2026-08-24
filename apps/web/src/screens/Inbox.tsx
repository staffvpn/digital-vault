import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Sparkles, ChevronRight } from "lucide-react";
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
  const navigate = useNavigate();
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
      <Header title="Входящие" eyebrow="Личное хранилище" />
      <main className="space-y-6 px-4 pt-4">
        <CaptureZone onSaved={invalidate} />

        <div className="space-y-2">
          <SectionLabel>
            Сегодня {data ? `· ${data.length}` : ""}
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
                title="Не получилось загрузить Входящие"
                description="Проверьте соединение и попробуйте снова."
                onRetry={() => refetch()}
              />
            </Card>
          )}

          {!isLoading && !isError && data?.length === 0 && (
            <Card>
              <EmptyState
                title="Входящие пусты"
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

        <button
          onClick={() => navigate("/settings")}
          className="flex w-full items-center gap-3 rounded-lg border border-signal-dim/40 bg-signal/5 px-4 py-3 text-left transition-colors hover:bg-signal/10 active:scale-[0.99]"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-signal-dim/40 text-signal">
            <Sparkles size={15} strokeWidth={1.5} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-bone">Больше места и AI-запросов</p>
            <p className="text-xs text-slate">Посмотреть тарифы Pro и Premium</p>
          </div>
          <ChevronRight size={15} strokeWidth={1.5} className="shrink-0 text-slate-dim" />
        </button>
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
