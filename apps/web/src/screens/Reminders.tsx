import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Check, Trash2 } from "lucide-react";
import clsx from "clsx";
import { Header } from "../components/Header";
import { BottomNav } from "../components/BottomNav";
import { Card, EmptyState, ErrorState, Skeleton, Tag } from "../components/ui";
import { deleteItem, listItems, updateItem } from "../lib/api";
import { useToastStore } from "../state/toast";
import type { VaultItem } from "../types";

export function RemindersScreen() {
  const queryClient = useQueryClient();
  const push = useToastStore((s) => s.push);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["items", "reminder"],
    queryFn: () => listItems({ type: "reminder" }),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["items"] });

  const { upcoming, done } = useMemo(() => {
    const sorted = [...(data ?? [])].sort((a, b) => (a.remind_at ?? "").localeCompare(b.remind_at ?? ""));
    return {
      upcoming: sorted.filter((i) => !i.reminder_done),
      done: sorted.filter((i) => i.reminder_done),
    };
  }, [data]);

  const markDone = async (item: VaultItem) => {
    try {
      await updateItem(item.id, { reminder_done: true } as Partial<VaultItem>);
      push("Отмечено выполненным", "success");
      invalidate();
    } catch {
      push("Не удалось обновить", "error");
    }
  };

  const remove = async (item: VaultItem) => {
    try {
      await deleteItem(item.id);
      push("Удалено", "success");
      invalidate();
    } catch {
      push("Не удалось удалить", "error");
    }
  };

  return (
    <div className="mx-auto min-h-screen max-w-md pb-24">
      <Header title="Напоминания" eyebrow="Библиотека" back />
      <main className="space-y-4 px-4 pt-4">
        <p className="text-xs leading-relaxed text-slate-dim">
          Скажите или напишите что-то с датой — например «напомни обновить токен 23 сентября» — и оно
          появится здесь. Присылаю уведомление в Telegram заранее и в срок.
        </p>

        {isLoading && (
          <Card className="divide-y divide-hairline p-0">
            {[0, 1].map((i) => (
              <div key={i} className="space-y-2 px-4 py-3">
                <Skeleton className="h-3.5 w-3/4" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            ))}
          </Card>
        )}
        {isError && (
          <Card>
            <ErrorState title="Не удалось загрузить" onRetry={() => refetch()} />
          </Card>
        )}
        {!isLoading && !isError && (data?.length ?? 0) === 0 && (
          <Card>
            <EmptyState icon={<Bell size={22} strokeWidth={1.5} />} title="Пока пусто" description="Здесь появятся ваши напоминания." />
          </Card>
        )}

        {upcoming.length > 0 && (
          <Card className="divide-y divide-hairline p-0">
            {upcoming.map((item) => (
              <ReminderRow key={item.id} item={item} onDone={() => markDone(item)} onDelete={() => remove(item)} />
            ))}
          </Card>
        )}

        {done.length > 0 && (
          <div className="space-y-2">
            <p className="px-1 text-[11px] font-medium uppercase tracking-wider text-slate-dim">Выполнено</p>
            <Card className="divide-y divide-hairline p-0">
              {done.map((item) => (
                <ReminderRow key={item.id} item={item} onDone={() => markDone(item)} onDelete={() => remove(item)} muted />
              ))}
            </Card>
          </div>
        )}
      </main>
      <BottomNav />
    </div>
  );
}

function ReminderRow({
  item,
  onDone,
  onDelete,
  muted,
}: {
  item: VaultItem;
  onDone: () => void;
  onDelete: () => void;
  muted?: boolean;
}) {
  const when = item.remind_at
    ? new Date(item.remind_at).toLocaleString("ru-RU", {
        day: "numeric",
        month: "long",
        ...(item.remind_has_time ? { hour: "2-digit", minute: "2-digit" } : {}),
      })
    : null;
  const overdue = !item.reminder_done && item.remind_at && new Date(item.remind_at) < new Date();

  return (
    <div className={clsx("flex items-center gap-3 px-4 py-3", muted && "opacity-50")}>
      <div className="min-w-0 flex-1">
        <p className={clsx("truncate text-sm font-medium", muted ? "text-slate line-through" : "text-bone")}>
          {item.title || "Напоминание"}
        </p>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs">
          {when && <span className={clsx("font-mono", overdue ? "text-ember" : "text-slate")}>{when}</span>}
          {item.category && (
            <>
              <span className="text-hairline-strong">·</span>
              <Tag>{item.category}</Tag>
            </>
          )}
        </div>
      </div>
      {!item.reminder_done && (
        <button
          onClick={onDone}
          aria-label="Отметить выполненным"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-moss/30 text-moss transition-colors hover:bg-moss/10"
        >
          <Check size={14} strokeWidth={2} />
        </button>
      )}
      <button
        onClick={onDelete}
        aria-label="Удалить"
        className="shrink-0 p-1 text-slate-dim transition-colors hover:text-ember"
      >
        <Trash2 size={14} strokeWidth={1.5} />
      </button>
    </div>
  );
}
