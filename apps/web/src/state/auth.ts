import { create } from "zustand";
import { authenticate } from "../lib/api";
import { getInitData, initTelegram } from "../lib/telegram";
import type { Profile } from "../types";

type AuthStatus = "idle" | "authenticating" | "ready" | "error" | "offline" | "no_telegram";

interface AuthState {
  status: AuthStatus;
  sessionToken: string | null;
  profile: Profile | null;
  error: string | null;
  bootstrap: () => Promise<void>;
  refreshProfile: (profile: Profile) => void;
  enterPreviewMode: () => void;
}

// The session token lives only in memory — never localStorage — and is
// re-derived from fresh Telegram initData on every app launch.
export const useAuthStore = create<AuthState>((set) => ({
  status: "idle",
  sessionToken: null,
  profile: null,
  error: null,

  async bootstrap() {
    set({ status: "authenticating", error: null });
    initTelegram();
    const initData = getInitData();
    if (!initData) {
      set({ status: "no_telegram" });
      return;
    }
    try {
      const { sessionToken, profile } = await authenticate(initData);
      set({ status: "ready", sessionToken, profile });
    } catch (err) {
      const offline = !navigator.onLine;
      set({
        status: offline ? "offline" : "error",
        error: err instanceof Error ? err.message : "unknown_error",
      });
    }
  },

  refreshProfile(profile) {
    set({ profile });
  },

  // Dev-only: lets the UI be inspected outside of an actual Telegram
  // session. No real session token is issued, so any data call will fail
  // gracefully into the normal error/empty states.
  enterPreviewMode() {
    set({
      status: "ready",
      sessionToken: null,
      profile: {
        id: "preview",
        username: "preview",
        firstName: "Preview",
        plan: "free",
        storageUsedBytes: 0,
        aiCallsUsed: 0,
        secretsCount: 0,
      },
    });
  },
}));
