import { useNavigate } from "react-router-dom";
import { Palette, Bookmark, Clapperboard, Wrench, FolderOpen, StickyNote, ChevronRight } from "lucide-react";
import { Header } from "../components/Header";
import { BottomNav } from "../components/BottomNav";
import { Card } from "../components/ui";

const sections = [
  { to: "/library/inspiration", label: "Насмотренность", desc: "Референсы и вдохновение", icon: Palette },
  { to: "/library/bookmarks", label: "Закладки", desc: "Сохранённые ссылки", icon: Bookmark },
  { to: "/library/movies", label: "Фильмы", desc: "Фильмы и сериалы", icon: Clapperboard },
  { to: "/library/services", label: "Сервисы", desc: "Полезные сайты и инструменты", icon: Wrench },
  { to: "/library/files", label: "Файлы", desc: "Документы и изображения", icon: FolderOpen },
  { to: "/library/notes", label: "Заметки", desc: "Быстрые заметки", icon: StickyNote },
];

export function LibraryHub() {
  const navigate = useNavigate();
  return (
    <div className="mx-auto min-h-screen max-w-md pb-24">
      <Header title="Библиотека" eyebrow="Личное хранилище" />
      <main className="grid grid-cols-2 gap-3 px-4 pt-4">
        {sections.map(({ to, label, desc, icon: Icon }) => (
          <Card
            key={to}
            onClick={() => navigate(to)}
            className="flex cursor-pointer flex-col justify-between gap-6 p-4 transition-colors hover:border-hairline-strong active:scale-[0.98]"
          >
            <div className="flex items-center justify-between">
              <div className="flex h-9 w-9 items-center justify-center rounded-md border border-hairline bg-graphite-raised text-signal">
                <Icon size={17} strokeWidth={1.5} />
              </div>
              <ChevronRight size={15} strokeWidth={1.5} className="text-slate-dim" />
            </div>
            <div className="space-y-0.5">
              <p className="text-sm font-semibold text-bone">{label}</p>
              <p className="text-xs leading-snug text-slate">{desc}</p>
            </div>
          </Card>
        ))}
      </main>
      <BottomNav />
    </div>
  );
}
