import { create } from "zustand";
import type { VaultItem } from "../types";

// Global so any list (Inbox, Search, Images…) can open the same in-app
// viewer without each screen owning its own modal state.
interface LightboxState {
  item: VaultItem | null;
  open: (item: VaultItem) => void;
  close: () => void;
}

export const useLightboxStore = create<LightboxState>((set) => ({
  item: null,
  open: (item) => set({ item }),
  close: () => set({ item: null }),
}));
