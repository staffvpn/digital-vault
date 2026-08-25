import { useEffect, useState } from "react";
import { Sheet } from "./Sheet";
import { Skeleton } from "./ui";
import { typeMeta } from "../lib/typeMeta";
import { listItems } from "../lib/api";
import type { VaultItem } from "../types";

// Keyword-similar, not semantic-similar — there's no embeddings/vector
// search in this stack. Picks the most distinctive words out of the
// title/category and reuses the existing search index, which is honest
// about what it actually is: "shares words with this", not "means the
// same thing as this".
function keywordsFrom(item: VaultItem): string[] {
  const source = [item.title, item.category].filter(Boolean).join(" ");
  const stop = new Set(["для", "или", "как", "что", "это", "the", "and", "with", "for"]);
  return source
    .toLowerCase()
    .split(/[^a-zа-яё0-9]+/i)
    .filter((w) => w.length >= 4 && !stop.has(w))
    .slice(0, 3);
}

export function SimilarItemsSheet({ item, open, onClose }: { item: VaultItem | null; open: boolean; onClose: () => void }) {
  const [results, setResults] = useState<VaultItem[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !item) {
      setResults(null);
      return;
    }
    const keywords = keywordsFrom(item);
    if (!keywords.length) {
      setResults([]);
      return;
    }
    setLoading(true);
    Promise.all(keywords.map((k) => listItems({ q: k })))
      .then((lists) => {
        const seen = new Map<string, VaultItem>();
        for (const list of lists) {
          for (const it of list) {
            if (it.id !== item.id) seen.set(it.id, it);
          }
        }
        setResults([...seen.values()].slice(0, 8));
      })
      .catch(() => setResults([]))
      .finally(() => setLoading(false));
  }, [open, item]);

  if (!item) return null;

  return (
    <Sheet open={open} onClose={onClose} title="Похожее">
      <div className="space-y-1">
        {loading && (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        )}
        {!loading && results?.length === 0 && (
          <p className="py-4 text-center text-sm text-slate-dim">Ничего похожего пока не нашлось.</p>
        )}
        {!loading &&
          results?.map((r) => {
            const meta = typeMeta(r.type);
            const Icon = meta.icon;
            return (
              <div key={r.id} className="flex items-center gap-3 rounded-md px-2 py-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-hairline bg-graphite-raised text-slate">
                  <Icon size={14} strokeWidth={1.5} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-bone">{r.title || meta.label}</p>
                  <p className="truncate text-xs text-slate-dim">{r.category || meta.label}</p>
                </div>
              </div>
            );
          })}
      </div>
    </Sheet>
  );
}
