import { useNavigate } from "react-router-dom";
import { ArrowLeft, Search } from "lucide-react";
import { IconButton } from "./ui";

export function Header({
  title,
  eyebrow,
  back,
  right,
  hideSearch,
}: {
  title: string;
  eyebrow?: string;
  back?: boolean;
  right?: React.ReactNode;
  hideSearch?: boolean;
}) {
  const navigate = useNavigate();
  return (
    <header className="safe-top sticky top-0 z-30 border-b border-hairline bg-void/95 backdrop-blur">
      <div className="mx-auto flex max-w-md items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          {back && (
            <IconButton onClick={() => navigate(-1)} aria-label="Назад">
              <ArrowLeft size={16} strokeWidth={1.5} />
            </IconButton>
          )}
          <div className="min-w-0">
            {eyebrow && (
              <p className="text-[10px] font-medium uppercase tracking-wider text-slate-dim">{eyebrow}</p>
            )}
            <h1 className="truncate text-base font-semibold tracking-tight text-bone">{title}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {right}
          {!hideSearch && (
            <IconButton onClick={() => navigate("/search")} aria-label="Поиск">
              <Search size={16} strokeWidth={1.5} />
            </IconButton>
          )}
        </div>
      </div>
    </header>
  );
}
