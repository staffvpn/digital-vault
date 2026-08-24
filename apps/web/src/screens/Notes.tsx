import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { StickyNote, ArrowUp } from "lucide-react";
import { Header } from "../components/Header";
import { BottomNav } from "../components/BottomNav";
import { ItemActionsSheet } from "../components/ItemActionsSheet";
import { Card, EmptyState, ErrorState, IconButton, Skeleton } from "../components/ui";
import { createItem, listItems } from "../lib/api";
import { relativeDate } from "../lib/format";
import { useToastStore } from "../state/toast";
import type { VaultItem } from "../types";

export function NotesScreen() {
  const queryClient = useQueryClient();
  const push = useToastStore((s) => s.push);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<VaultItem | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["items", "note"],
    queryFn: () => listItems({ type: "note" }),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["items"] });

  const save = async () => {
    const text = draft.trim();
    if (!text) return;
    setSaving(true);
    try {
      await createItem({
        type: "note",
        title: text.slice(0, 60),
        description: text,
        status: "saved",
      });
      setDraft("");
      invalidate();
    } catch {
      push("Не удалось сохранить заметку", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto min-h-screen max-w-md pb-24">
      <Header title="Заметки" eyebrow="Библиотека" back />
      <main className="space-y-4 px-4 pt-4">
        <Card className="p-2">
          <div className="flex items-end gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Быстро записать мысль…"
              rows={2}
              className="flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-bone placeholder:text-slate-dim outline-none"
            />
            <IconButton onClick={save} disabled={!draft.trim() || saving} aria-label="Сохранить заметку">
              <ArrowUp size={15} strokeWidth={1.5} />
            </IconButton>
          </div>
        </Card>

        {isLoading && (
          <Card className="divide-y divide-hairline p-0">
            {[0, 1].map((i) => (
              <div key={i} className="space-y-2 px-4 py-3">
                <Skeleton className="h-3.5 w-3/4" />
                <Skeleton className="h-3 w-1/4" />
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
            <EmptyState icon={<StickyNote size={22} strokeWidth={1.5} />} title="Пока пусто" description="Ваши заметки появятся здесь." />
          </Card>
        )}
        {!isLoading && !isError && data && data.length > 0 && (
          <Card className="divide-y divide-hairline p-0">
            {data.map((item) => (
              <button
                key={item.id}
                onClick={() => setSelected(item)}
                className="block w-full space-y-1 px-4 py-3 text-left"
              >
                <p className="line-clamp-3 text-sm text-bone">{item.description || item.title}</p>
                <p className="font-mono text-[11px] text-slate-dim">{relativeDate(item.created_at)}</p>
              </button>
            ))}
          </Card>
        )}
      </main>
      <ItemActionsSheet item={selected} open={Boolean(selected)} onClose={() => setSelected(null)} onChanged={invalidate} />
      <BottomNav />
    </div>
  );
}
