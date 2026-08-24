import clsx from "clsx";
import { useToastStore } from "../state/toast";

export function ToastHost() {
  const toasts = useToastStore((s) => s.toasts);
  if (!toasts.length) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex flex-col items-center gap-2 px-4 pt-3">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={clsx(
            "pointer-events-auto w-full max-w-md rounded-md border px-3 py-2.5 text-xs font-medium shadow-lg backdrop-blur",
            t.tone === "success" && "border-moss/30 bg-graphite text-moss",
            t.tone === "error" && "border-ember/30 bg-graphite text-ember",
            t.tone === "default" && "border-hairline bg-graphite text-bone",
          )}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
