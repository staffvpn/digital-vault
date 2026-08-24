import { MoreHorizontal, Check } from "lucide-react";
import { typeMeta } from "../lib/typeMeta";
import { relativeDate } from "../lib/format";
import { openExternalLink, haptic } from "../lib/telegram";
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

  const handlePrimaryTap = () => {
    if (item.source_url) {
      haptic("light");
      openExternalLink(item.source_url);
    } else {
      onOpen();
    }
  };

  return (
    <div className="flex items-center gap-3 border-b border-hairline px-4 py-3 last:border-b-0">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-hairline bg-graphite-raised text-slate">
        <Icon size={16} strokeWidth={1.5} />
      </div>
      <button onClick={handlePrimaryTap} className="flex min-w-0 flex-1 flex-col items-start gap-1 text-left overflow-hidden">
        <span className="w-full truncate text-sm font-medium text-bone">
          {item.title || item.source_domain || meta.label}
        </span>
        <span className="flex w-full items-center gap-1.5 text-xs text-slate">
          <span className="shrink-0">{meta.label}</span>
          {item.category && (
            <>
              <span className="shrink-0 text-hairline-strong">·</span>
              <span className="truncate">{item.category}</span>
            </>
          )}
          <span className="shrink-0 text-hairline-strong">·</span>
          <span className="shrink-0 tabular font-mono text-[11px]">{relativeDate(item.created_at)}</span>
        </span>
      </button>
      {item.status === "inbox" && onQuickSave ? (
        <button
          onClick={onQuickSave}
          className="flex h-8 shrink-0 items-center gap-1 rounded-md border border-moss/30 px-2.5 text-xs font-medium text-moss transition-colors hover:bg-moss/10"
        >
          <Check size={13} strokeWidth={2} />
          Save
        </button>
      ) : (
        <button onClick={onOpen} className="shrink-0 p-1 text-slate-dim transition-colors hover:text-bone" aria-label="Действия">
          <MoreHorizontal size={16} strokeWidth={1.5} />
        </button>
      )}
    </div>
  );
}
