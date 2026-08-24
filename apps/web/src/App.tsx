import { useEffect } from "react";
import { Routes, Route } from "react-router-dom";
import { Lock } from "lucide-react";
import { useAuthStore } from "./state/auth";
import { ProcessingReadout } from "./components/ProcessingReadout";
import { Button } from "./components/ui";
import { ToastHost } from "./components/ToastHost";
import { InboxScreen } from "./screens/Inbox";
import { VaultScreen } from "./screens/Vault";
import { LibraryHub } from "./screens/LibraryHub";
import { InspirationScreen } from "./screens/Inspiration";
import { BookmarksScreen } from "./screens/Bookmarks";
import { MoviesScreen } from "./screens/Movies";
import { ServicesScreen } from "./screens/Services";
import { FilesScreen } from "./screens/Files";
import { NotesScreen } from "./screens/Notes";
import { SearchScreen } from "./screens/Search";
import { SettingsScreen } from "./screens/Settings";

function AuthGate() {
  const { status, error, bootstrap, enterPreviewMode } = useAuthStore();

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  if (status === "ready") return <AppRoutes />;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 px-8 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-md border border-hairline bg-graphite text-signal">
        <Lock size={18} strokeWidth={1.5} />
      </div>

      {(status === "idle" || status === "authenticating") && (
        <>
          <ProcessingReadout label="CONNECTING" />
          <p className="text-xs text-slate-dim">Проверяем сессию Telegram…</p>
        </>
      )}

      {status === "no_telegram" && (
        <>
          <p className="text-sm font-medium text-bone">Откройте Vault через Telegram</p>
          <p className="max-w-xs text-xs leading-relaxed text-slate">
            Это приложение работает как Telegram Mini App и не открывается напрямую в браузере.
          </p>
          {import.meta.env.DEV && (
            <Button variant="secondary" onClick={enterPreviewMode} className="mt-2">
              Предпросмотр без Telegram (dev)
            </Button>
          )}
        </>
      )}

      {(status === "error" || status === "offline") && (
        <>
          <p className="text-sm font-medium text-ember">
            {status === "offline" ? "Нет соединения" : "Не удалось подключиться"}
          </p>
          <p className="max-w-xs text-xs leading-relaxed text-slate">
            {status === "offline"
              ? "Проверьте интернет-соединение и попробуйте ещё раз."
              : error ?? "Попробуйте перезапустить приложение."}
          </p>
          <Button variant="secondary" onClick={bootstrap} className="mt-1">
            Повторить
          </Button>
        </>
      )}
    </div>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<InboxScreen />} />
      <Route path="/vault" element={<VaultScreen />} />
      <Route path="/library" element={<LibraryHub />} />
      <Route path="/library/inspiration" element={<InspirationScreen />} />
      <Route path="/library/bookmarks" element={<BookmarksScreen />} />
      <Route path="/library/movies" element={<MoviesScreen />} />
      <Route path="/library/services" element={<ServicesScreen />} />
      <Route path="/library/files" element={<FilesScreen />} />
      <Route path="/library/notes" element={<NotesScreen />} />
      <Route path="/search" element={<SearchScreen />} />
      <Route path="/settings" element={<SettingsScreen />} />
    </Routes>
  );
}

export default function App() {
  return (
    <>
      <AuthGate />
      <ToastHost />
    </>
  );
}
