import { useEffect } from "react";
import { X } from "lucide-react";
import { IconButton } from "./ui";

export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-void/70 backdrop-blur-sm" onClick={onClose} />
      <div className="safe-bottom relative w-full max-w-md animate-[sheet-up_0.2s_ease-out] rounded-t-lg border-t border-hairline bg-graphite">
        <div className="mx-auto mt-2 h-1 w-9 rounded-full bg-hairline-strong" />
        <div className="flex items-center justify-between px-4 pt-3">
          {title && <h2 className="text-sm font-semibold text-bone">{title}</h2>}
          <IconButton onClick={onClose} className="ml-auto" aria-label="Закрыть">
            <X size={16} strokeWidth={1.5} />
          </IconButton>
        </div>
        <div className="max-h-[75vh] overflow-y-auto px-4 pb-6 pt-3">{children}</div>
      </div>
      <style>{`
        @keyframes sheet-up {
          from { transform: translateY(16px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
