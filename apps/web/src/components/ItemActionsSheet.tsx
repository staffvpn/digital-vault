import { useEffect, useState } from "react";
import { Trash2, Check } from "lucide-react";
import { Sheet } from "./Sheet";
import { Button } from "./ui";
import { deleteItem, updateItem } from "../lib/api";
import { useToastStore } from "../state/toast";
import type { VaultItem } from "../types";

export function ItemActionsSheet({
  item,
  open,
  onClose,
  onChanged,
}: {
  item: VaultItem | null;
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [category, setCategory] = useState("");
  const [tags, setTags] = useState("");
  const push = useToastStore((s) => s.push);

  useEffect(() => {
    if (item) {
      setCategory(item.category ?? "");
      setTags(item.tags?.join(", ") ?? "");
    }
  }, [item]);

  if (!item) return null;

  const save = async () => {
    try {
      await updateItem(item.id, {
        category: category || null,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        status: "saved",
      });
      push("Обновлено", "success");
      onChanged();
      onClose();
    } catch {
      push("Не удалось обновить", "error");
    }
  };

  const remove = async () => {
    try {
      await deleteItem(item.id);
      push("Удалено", "success");
      onChanged();
      onClose();
    } catch {
      push("Не удалось удалить", "error");
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title={item.title ?? "Без названия"}>
      <div className="space-y-3">
        <div className="space-y-1.5">
          <label className="text-[10px] font-medium uppercase tracking-wider text-slate-dim">Category</label>
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Например: Насмотренность / Web Design"
            className="w-full rounded-md border border-hairline bg-graphite-raised px-3 py-2 text-sm text-bone placeholder:text-slate-dim outline-none focus:border-signal-dim"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-medium uppercase tracking-wider text-slate-dim">Tags</label>
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="через запятую"
            className="w-full rounded-md border border-hairline bg-graphite-raised px-3 py-2 text-sm text-bone placeholder:text-slate-dim outline-none focus:border-signal-dim"
          />
        </div>
        <div className="flex gap-2 pt-1">
          <Button variant="danger" onClick={remove} className="shrink-0">
            <Trash2 size={14} strokeWidth={1.5} />
          </Button>
          <Button variant="primary" onClick={save} className="flex-1">
            <Check size={14} strokeWidth={1.5} />
            Сохранить
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
