import { MoreHorizontal, Check } from "lucide-react";
import { typeMeta } from "../lib/typeMeta";
import { relativeDate } from "../lib/format";
import { Tag } from "./ui";
import type { VaultItem } from "../types";

export function ItemRow({
  item,
  onOpen,
  onQuickSave,
}: {
  item: VaultItem;
  onOpen: () => void;
  onQuickSave?: () => void;
}) {
  const meta = typeMeta(item.type);
  const Icon = meta.icon;

  return (
    <div className="flex items-center gap-3 border-b border-hairline px-4 py-3 last:border-b-0">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-hairline bg-graphite-raised text-slate">
        <Icon size={16} strokeWidth={1.5} />
      </div>
      <button onClick={onOpen} className="flex min-w-0 flex-1 flex-col items-start gap-1 text-left">
        <span className="truncate text-sm font-medium text-bone">
          {item.title || item.source_domain || meta.label}
        </span>
        <span className="flex items-center gap-1.5 text-xs text-slate">
          <span>{meta.label}</span>
          {item.category && (
            <>
              <span className="text-hairline-strong">·</span>
              <span className="truncate">{item.category}</span>
            </>
          )}
          <span className="text-hairline-strong">·</span>
          <span className="tabular font-mono text-[11px]">{relativeDate(item.created_at)}</span>
        </span>
        {item.tags?.length > 0 && (
          <span className="flex flex-wrap gap-1 pt-0.5">
            {item.tags.slice(0, 3).map((t) => (
              <Tag key={t}>#{t}</Tag>
            ))}
          </span>
        )}
      </button>
      {item.status === "inbox" && onQuickSave ? (
        <button
          onClick={onQuickSave}
          className="flex h-8 shrink-0 items-center gap-1 rounded-md border border-moss/30 px-2.5 text-xs font-medium text-moss transition-colors hover:bg-moss/10"
        >
          <Check size={13} strokeWidth={2} />
          Сохранить
        </button>
      ) : (
        <button onClick={onOpen} className="shrink-0 p-1 text-slate-dim transition-colors hover:text-bone">
          <MoreHorizontal size={16} strokeWidth={1.5} />
        </button>
      )}
    </div>
  );
}
