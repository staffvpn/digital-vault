import { typeMeta } from "../lib/typeMeta";
import { Tag } from "./ui";
import type { VaultItem } from "../types";

export function ItemVisualCard({ item, onOpen }: { item: VaultItem; onOpen: () => void }) {
  const meta = typeMeta(item.type);
  const Icon = meta.icon;

  return (
    <button
      onClick={onOpen}
      className="flex flex-col overflow-hidden rounded-lg border border-hairline bg-graphite text-left transition-colors hover:border-hairline-strong active:scale-[0.98]"
    >
      <div className="flex aspect-[4/3] items-center justify-center bg-graphite-raised">
        {item.preview_url ? (
          <img src={item.preview_url} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <Icon size={26} strokeWidth={1.2} className="text-slate-dim" />
        )}
      </div>
      <div className="space-y-1.5 p-2.5">
        <p className="truncate text-xs font-medium text-bone">{item.title || meta.label}</p>
        <p className="truncate text-[11px] text-slate">{item.source_domain || item.category || " "}</p>
        {item.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {item.tags.slice(0, 2).map((t) => (
              <Tag key={t}>{t}</Tag>
            ))}
          </div>
        )}
      </div>
    </button>
  );
}
