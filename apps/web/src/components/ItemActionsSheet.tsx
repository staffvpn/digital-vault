import { useEffect, useState } from "react";
import { Trash2, Check, ExternalLink } from "lucide-react";
import { Sheet } from "./Sheet";
import { Button } from "./ui";
import { deleteItem, updateItem } from "../lib/api";
import { openExternalLink, haptic } from "../lib/telegram";
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
  const push = useToastStore((s) => s.push);

  useEffect(() => {
    if (item) {
      setCategory(item.category ?? "");
    }
  }, [item]);

  if (!item) return null;

  const save = async () => {
    try {
      await updateItem(item.id, {
        category: category || null,
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

  const openLink = () => {
    if (!item.source_url) return;
    haptic("light");
    openExternalLink(item.source_url);
  };

  return (
    <Sheet open={open} onClose={onClose} title={item.title ?? "Без названия"}>
      <div className="space-y-3">
        {item.source_url && (
          <Button variant="secondary" onClick={openLink} className="w-full">
            <ExternalLink size={14} strokeWidth={1.5} />
            Открыть ссылку
          </Button>
        )}
        <div className="space-y-1.5">
          <label className="text-[10px] font-medium uppercase tracking-wider text-slate-dim">Категория</label>
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Например: Дизайн / Web Design"
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
