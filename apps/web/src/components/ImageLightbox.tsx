import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { X, Trash2, ExternalLink } from "lucide-react";
import { useLightboxStore } from "../state/lightbox";
import { getFileUrl, deleteItem } from "../lib/api";
import { openExternalLink } from "../lib/telegram";
import { useToastStore } from "../state/toast";

// Full-screen in-app viewer for images — mounted once, globally, at the app
// root, so any list (Inbox, Search, Images…) can open it via useLightboxStore
// instead of leaving the Mini App to view a picture.
export function ImageLightbox() {
  const item = useLightboxStore((s) => s.item);
  const close = useLightboxStore((s) => s.close);
  const queryClient = useQueryClient();
  const push = useToastStore((s) => s.push);

  const { data: url, isLoading } = useQuery({
    queryKey: ["file-url", item?.id],
    queryFn: () => getFileUrl(item!.id),
    enabled: Boolean(item),
    staleTime: 4 * 60_000,
  });

  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [item, close]);

  if (!item) return null;

  const remove = async () => {
    try {
      await deleteItem(item.id);
      push("Удалено", "success");
      queryClient.invalidateQueries({ queryKey: ["items"] });
      close();
    } catch {
      push("Не удалось удалить", "error");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-void/95 backdrop-blur-sm" onClick={close}>
      <div className="flex items-center justify-between px-3 py-3" onClick={(e) => e.stopPropagation()}>
        <button onClick={close} aria-label="Закрыть" className="flex h-9 w-9 items-center justify-center rounded-md text-bone">
          <X size={20} strokeWidth={1.5} />
        </button>
        <div className="flex items-center gap-0.5">
          {url && (
            <button
              onClick={() => openExternalLink(url)}
              aria-label="Открыть в браузере"
              className="flex h-9 w-9 items-center justify-center rounded-md text-slate transition-colors hover:text-bone"
            >
              <ExternalLink size={17} strokeWidth={1.5} />
            </button>
          )}
          <button
            onClick={remove}
            aria-label="Удалить"
            className="flex h-9 w-9 items-center justify-center rounded-md text-ember"
          >
            <Trash2 size={17} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center overflow-hidden px-4 pb-4" onClick={(e) => e.stopPropagation()}>
        {isLoading && <p className="text-xs text-slate">Загрузка…</p>}
        {!isLoading && !url && <p className="text-xs text-slate">Не удалось загрузить изображение</p>}
        {url && <img src={url} alt="" className="max-h-full max-w-full rounded-md object-contain" />}
      </div>

      {(item.title || item.category) && (
        <div className="px-4 pb-5 text-center" onClick={(e) => e.stopPropagation()}>
          {item.title && <p className="truncate text-sm text-bone">{item.title}</p>}
          {item.category && <p className="text-xs text-slate">{item.category}</p>}
        </div>
      )}
    </div>
  );
}
