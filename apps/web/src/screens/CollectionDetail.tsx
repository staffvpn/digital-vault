import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Check, Share2, Trash2, Users } from "lucide-react";
import { Header } from "../components/Header";
import { BottomNav } from "../components/BottomNav";
import { Card, EmptyState, ErrorState, Skeleton, Badge } from "../components/ui";
import { ItemVisualCard } from "../components/ItemVisualCard";
import { ItemActionsSheet } from "../components/ItemActionsSheet";
import { deleteCollection, getCollection, removeItemFromCollection } from "../lib/api";
import { useToastStore } from "../state/toast";
import { haptic } from "../lib/telegram";
import type { VaultItem } from "../types";

const BOT_USERNAME = import.meta.env.VITE_TELEGRAM_BOT_USERNAME as string | undefined;
const APP_SHORTNAME = import.meta.env.VITE_TELEGRAM_MINIAPP_SHORTNAME as string | undefined;

export function CollectionDetailScreen() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const push = useToastStore((s) => s.push);
  const [copied, setCopied] = useState(false);
  const [selected, setSelected] = useState<VaultItem | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["collection", id],
    queryFn: () => getCollection(id!),
    enabled: Boolean(id),
  });

  if (!id) return null;

  const link = BOT_USERNAME && APP_SHORTNAME ? `https://t.me/${BOT_USERNAME}/${APP_SHORTNAME}?startapp=col_${data?.collection.share_code}` : null;

  const copy = async () => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(link ?? data.collection.share_code);
      setCopied(true);
      haptic("light");
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      push("Не удалось скопировать", "error");
    }
  };

  const share = async () => {
    if (!data) return;
    haptic("light");
    const shareText = `Подборка «${data.collection.name}» в NCHT Notion — присоединяйтесь: ${link ?? data.collection.share_code}`;
    if (navigator.share) {
      try {
        await navigator.share({ text: shareText });
        return;
      } catch {
        /* fall through to copy */
      }
    }
    copy();
  };

  const removeItem = async (itemId: string) => {
    try {
      await removeItemFromCollection(id, itemId);
      push("Удалено из подборки", "success");
      queryClient.invalidateQueries({ queryKey: ["collection", id] });
    } catch {
      push("Не удалось удалить", "error");
    }
  };

  const remove = async () => {
    try {
      await deleteCollection(id);
      push("Подборка удалена", "success");
      navigate("/library/collections");
    } catch {
      push("Не удалось удалить подборку", "error");
    }
  };

  return (
    <div className="mx-auto min-h-screen max-w-md pb-24">
      <Header title={data?.collection.name ?? "Подборка"} eyebrow="Совместная подборка" back />
      <main className="space-y-4 px-4 pt-4">
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

        {data && (
          <>
            <Card className="space-y-3 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs text-slate">
                  <Users size={13} strokeWidth={1.5} />
                  {data.memberCount} {data.memberCount === 1 ? "участник" : "участника"}
                </div>
                {data.myRole === "owner" && <Badge tone="signal">Вы владелец</Badge>}
              </div>
              <div className="flex items-center gap-2 rounded-md border border-hairline bg-graphite-raised px-3 py-2">
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-slate">{link ?? data.collection.share_code}</span>
                <button onClick={copy} className="shrink-0 text-slate-dim transition-colors hover:text-bone" aria-label="Скопировать">
                  {copied ? <Check size={14} strokeWidth={2} className="text-moss" /> : <Copy size={14} strokeWidth={1.5} />}
                </button>
              </div>
              <button
                onClick={share}
                className="flex w-full items-center justify-center gap-1.5 rounded-md bg-signal py-2 text-xs font-medium text-void transition-all hover:brightness-110 active:scale-[0.98]"
              >
                <Share2 size={13} strokeWidth={2} />
                Поделиться подборкой
              </button>
            </Card>

            {data.items.length === 0 ? (
              <Card>
                <EmptyState
                  icon={<Users size={22} strokeWidth={1.5} />}
                  title="Пока пусто"
                  description="Добавьте что-нибудь из карточки записи — кнопка «В подборку»."
                />
              </Card>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {data.items.map((item) => (
                  <div key={item.id} className="relative">
                    <ItemVisualCard item={item} onOpen={() => setSelected(item)} />
                    <button
                      onClick={() => removeItem(item.id)}
                      aria-label="Убрать из подборки"
                      className="absolute left-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-md bg-void/70 text-slate-dim backdrop-blur-sm transition-colors hover:text-ember"
                    >
                      <Trash2 size={12} strokeWidth={1.5} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {data.myRole === "owner" && (
              <button
                onClick={remove}
                className="mx-auto flex items-center gap-1.5 text-xs text-slate-dim transition-colors hover:text-ember"
              >
                <Trash2 size={12} strokeWidth={1.5} />
                Удалить подборку
              </button>
            )}
          </>
        )}
      </main>
      <ItemActionsSheet
        item={selected}
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        onChanged={() => queryClient.invalidateQueries({ queryKey: ["collection", id] })}
      />
      <BottomNav />
    </div>
  );
}
