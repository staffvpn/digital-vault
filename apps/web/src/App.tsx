import { useEffect, useState } from "react";
import { Routes, Route } from "react-router-dom";
import { Lock } from "lucide-react";
import { useAuthStore } from "./state/auth";
import { ProcessingReadout } from "./components/ProcessingReadout";
import { Button } from "./components/ui";
import { ToastHost } from "./components/ToastHost";
import { ImageLightbox } from "./components/ImageLightbox";
import { Onboarding } from "./components/Onboarding";
import { InboxScreen } from "./screens/Inbox";
import { VaultScreen } from "./screens/Vault";
import { LibraryHub } from "./screens/LibraryHub";
import { InspirationScreen } from "./screens/Inspiration";
import { BookmarksScreen } from "./screens/Bookmarks";
import { VideoScreen } from "./screens/Video";
import { ImagesScreen } from "./screens/Images";
import { ServicesScreen } from "./screens/Services";
import { FilesScreen } from "./screens/Files";
import { NotesScreen } from "./screens/Notes";
import { RemindersScreen } from "./screens/Reminders";
import { SearchScreen } from "./screens/Search";
import { SettingsScreen } from "./screens/Settings";
import { InfoScreen } from "./screens/Info";

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
          <ProcessingReadout label="ПОДКЛЮЧЕНИЕ" />
          <p className="text-xs text-slate-dim">Проверяем сессию Telegram…</p>
        </>
      )}

      {status === "no_telegram" && (
        <>
          <p className="text-sm font-medium text-bone">Откройте NCHT Notion через Telegram</p>
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
      <Route path="/library/design" element={<InspirationScreen />} />
      <Route path="/library/bookmarks" element={<BookmarksScreen />} />
      <Route path="/library/video" element={<VideoScreen />} />
      <Route path="/library/services" element={<ServicesScreen />} />
      <Route path="/library/images" element={<ImagesScreen />} />
      <Route path="/library/files" element={<FilesScreen />} />
      <Route path="/library/notes" element={<NotesScreen />} />
      <Route path="/library/reminders" element={<RemindersScreen />} />
      <Route path="/search" element={<SearchScreen />} />
      <Route path="/settings" element={<SettingsScreen />} />
      <Route path="/settings/info" element={<InfoScreen />} />
    </Routes>
  );
}

const ONBOARDING_KEY = "vault_onboarding_seen";

export default function App() {
  const [showOnboarding, setShowOnboarding] = useState(
    () => localStorage.getItem(ONBOARDING_KEY) !== "1",
  );

  const dismissOnboarding = () => {
    localStorage.setItem(ONBOARDING_KEY, "1");
    setShowOnboarding(false);
  };

  return (
    <>
      <AuthGate />
      {showOnboarding && <Onboarding onDone={dismissOnboarding} />}
      <ImageLightbox />
      <ToastHost />
    </>
  );
}
