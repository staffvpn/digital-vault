import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FolderPlus, Check, Users } from "lucide-react";
import { Sheet } from "./Sheet";
import { Button, Skeleton } from "./ui";
import { ApiError, addItemToCollection, createCollection, listCollections } from "../lib/api";
import { useAuthStore } from "../state/auth";
import { useToastStore } from "../state/toast";

export function CollectionPickerSheet({
  itemId,
  open,
  onClose,
}: {
  itemId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const push = useToastStore((s) => s.push);
  const profile = useAuthStore((s) => s.profile);
  const [addedTo, setAddedTo] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const { data: collections, isLoading, refetch } = useQuery({
    queryKey: ["collections"],
    queryFn: listCollections,
    enabled: open,
  });

  useEffect(() => {
    if (!open) {
      setAddedTo(new Set());
      setCreating(false);
      setNewName("");
    }
  }, [open]);

  if (!itemId) return null;

  const add = async (collectionId: string) => {
    try {
      await addItemToCollection(collectionId, itemId);
      setAddedTo((s) => new Set(s).add(collectionId));
      push("Добавлено в подборку", "success");
    } catch {
      push("Не удалось добавить", "error");
    }
  };

  const createAndAdd = async () => {
    if (!newName.trim()) return;
    try {
      const collection = await createCollection(newName.trim());
      await addItemToCollection(collection.id, itemId);
      push("Подборка создана", "success");
      setNewName("");
      setCreating(false);
      refetch();
    } catch (err) {
      const isPremiumGate = err instanceof ApiError && err.status === 402;
      push(isPremiumGate ? "Создание подборок — на тарифе Premium" : "Не удалось создать подборку", "error");
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Добавить в подборку">
      <div className="space-y-3">
        {isLoading && (
          <div className="space-y-2">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        )}

        {!isLoading && (collections?.length ?? 0) > 0 && (
          <div className="space-y-1.5">
            {collections!.map((c) => (
              <button
                key={c.id}
                onClick={() => add(c.id)}
                disabled={addedTo.has(c.id)}
                className="flex w-full items-center gap-3 rounded-md border border-hairline bg-graphite-raised px-3 py-2.5 text-left transition-colors hover:border-hairline-strong disabled:opacity-60"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-hairline text-signal">
                  <Users size={14} strokeWidth={1.5} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-bone">{c.name}</p>
                  <p className="text-xs text-slate-dim">
                    {c.itemCount ?? 0} записей · {c.myRole === "owner" ? "вы владелец" : "участник"}
                  </p>
                </div>
                {addedTo.has(c.id) && <Check size={16} strokeWidth={2} className="shrink-0 text-moss" />}
              </button>
            ))}
          </div>
        )}

        {!isLoading && (collections?.length ?? 0) === 0 && !creating && (
          <p className="py-2 text-center text-sm text-slate-dim">Подборок пока нет.</p>
        )}

        {creating ? (
          <div className="space-y-2">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Название подборки"
              className="w-full rounded-md border border-hairline bg-graphite-raised px-3 py-2 text-sm text-bone placeholder:text-slate-dim outline-none focus:border-signal-dim"
            />
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setCreating(false)}>
                Отмена
              </Button>
              <Button variant="signal" className="flex-1" disabled={!newName.trim()} onClick={createAndAdd}>
                Создать
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="secondary" className="w-full" onClick={() => setCreating(true)}>
            <FolderPlus size={14} strokeWidth={1.5} />
            Новая подборка
          </Button>
        )}

        {profile?.plan !== "pro_plus" && (
          <p className="text-center text-[11px] text-slate-dim">Создание подборок доступно на Premium — добавлять в чужие уже можно и так.</p>
        )}
      </div>
    </Sheet>
  );
}
