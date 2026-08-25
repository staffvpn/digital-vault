import { useEffect, useState } from "react";
import { Trash2, Check, ExternalLink, Sparkles, FolderPlus, ScanSearch } from "lucide-react";
import { Sheet } from "./Sheet";
import { Button } from "./ui";
import { ApiError, deleteItem, summarizeLink, updateItem } from "../lib/api";
import { haptic } from "../lib/telegram";
import { isOpenable, openItemContent } from "../lib/openItem";
import { useLightboxStore } from "../state/lightbox";
import { useToastStore } from "../state/toast";
import { useAuthStore } from "../state/auth";
import { FileThumb } from "./FileThumb";
import { SimilarItemsSheet } from "./SimilarItemsSheet";
import { CollectionPickerSheet } from "./CollectionPickerSheet";
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
  const [opening, setOpening] = useState(false);
  const [similarOpen, setSimilarOpen] = useState(false);
  const [collectionOpen, setCollectionOpen] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const push = useToastStore((s) => s.push);
  const openLightbox = useLightboxStore((s) => s.open);
  const profile = useAuthStore((s) => s.profile);

  useEffect(() => {
    if (item) {
      setCategory(item.category ?? "");
      setSummary(item.summary ?? null);
    }
  }, [item]);

  if (!item) return null;

  const summarize = async () => {
    if (summarizing) return;
    setSummarizing(true);
    try {
      const { summary: text } = await summarizeLink(item.id);
      setSummary(text);
      onChanged();
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) {
        push("Пересказ статей — на тарифе Premium", "error");
      } else {
        push("Не удалось пересказать", "error");
      }
    } finally {
      setSummarizing(false);
    }
  };

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

  const openLink = async () => {
    haptic("light");
    if (item.type === "image") {
      openLightbox(item);
      onClose();
      return;
    }
    if (opening) return;
    setOpening(true);
    try {
      await openItemContent(item);
    } catch {
      push("Не удалось открыть", "error");
    } finally {
      setOpening(false);
    }
  };

  return (
    <>
    <Sheet open={open} onClose={onClose} title={item.title ?? "Без названия"}>
      <div className="space-y-3">
        {(item.type === "image" || item.preview_url) && (
          <div className="overflow-hidden rounded-md border border-hairline bg-graphite-raised">
            {item.type === "image" ? (
              <div className="aspect-video w-full">
                <FileThumb item={item} />
              </div>
            ) : (
              <img src={item.preview_url ?? undefined} alt="" className="max-h-40 w-full object-cover" loading="lazy" />
            )}
          </div>
        )}
        {isOpenable(item) && (
          <Button variant="secondary" onClick={openLink} className="w-full" disabled={opening}>
            <ExternalLink size={14} strokeWidth={1.5} />
            {opening ? "Открываем…" : item.source_url ? "Открыть ссылку" : "Открыть"}
          </Button>
        )}
        {item.body && (
          <div className="max-h-64 overflow-y-auto rounded-md border border-hairline bg-graphite-raised px-3 py-2.5">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-bone">{item.body}</p>
          </div>
        )}

        {summary && (
          <div className="space-y-1 rounded-md border border-signal-dim/40 bg-signal/5 px-3 py-2.5">
            <p className="text-[10px] font-medium uppercase tracking-wider text-signal">Пересказ</p>
            <p className="text-sm leading-relaxed text-bone">{summary}</p>
          </div>
        )}

        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setSimilarOpen(true)} className="flex-1">
            <ScanSearch size={13} strokeWidth={1.5} />
            Похожее
          </Button>
          <Button variant="secondary" onClick={() => setCollectionOpen(true)} className="flex-1">
            <FolderPlus size={13} strokeWidth={1.5} />
            В подборку
          </Button>
        </div>

        {item.source_url && !summary && (
          <Button variant="secondary" onClick={summarize} className="w-full" disabled={summarizing}>
            <Sparkles size={13} strokeWidth={1.5} />
            {summarizing ? "Читаем…" : profile?.plan === "pro_plus" ? "Пересказ за 30 секунд" : "Пересказ за 30 секунд (Premium)"}
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

    <SimilarItemsSheet item={item} open={similarOpen} onClose={() => setSimilarOpen(false)} />
    <CollectionPickerSheet itemId={item.id} open={collectionOpen} onClose={() => setCollectionOpen(false)} />
    </>
  );
}
