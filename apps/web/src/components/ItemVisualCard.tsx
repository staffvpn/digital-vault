import { MoreHorizontal } from "lucide-react";
import { typeMeta } from "../lib/typeMeta";
import { openExternalLink, haptic } from "../lib/telegram";
import type { VaultItem } from "../types";

export function ItemVisualCard({ item, onOpen }: { item: VaultItem; onOpen: () => void }) {
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
    <div className="relative flex flex-col overflow-hidden rounded-lg border border-hairline bg-graphite text-left transition-colors hover:border-hairline-strong">
      <button onClick={handlePrimaryTap} className="flex flex-col text-left active:scale-[0.98]">
        <div className="flex aspect-[4/3] items-center justify-center bg-graphite-raised">
          {item.preview_url ? (
            <img src={item.preview_url} alt="" className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <Icon size={26} strokeWidth={1.2} className="text-slate-dim" />
          )}
        </div>
        <div className="space-y-1 p-2.5">
          <p className="truncate text-xs font-medium text-bone">{item.title || meta.label}</p>
          <p className="truncate text-[11px] text-slate">{item.source_domain || item.category || " "}</p>
        </div>
      </button>
      {item.source_url && (
        <button
          onClick={onOpen}
          aria-label="Действия"
          className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-md bg-void/70 text-bone backdrop-blur-sm"
        >
          <MoreHorizontal size={13} strokeWidth={1.5} />
        </button>
      )}
    </div>
  );
}
