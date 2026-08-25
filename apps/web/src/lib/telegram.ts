// Thin wrapper around the Telegram WebApp bridge injected by
// telegram-web-app.js. We read initData / theme / viewport directly off
// `window.Telegram.WebApp` rather than pulling in the full SDK's component
// tree, keeping this predictable inside Vite + React.

interface TelegramWebApp {
  initData: string;
  initDataUnsafe: Record<string, unknown>;
  colorScheme: "light" | "dark";
  themeParams: Record<string, string>;
  viewportHeight: number;
  isExpanded: boolean;
  ready: () => void;
  expand: () => void;
  enableClosingConfirmation: () => void;
  setHeaderColor: (color: string) => void;
  setBackgroundColor: (color: string) => void;
  HapticFeedback?: {
    impactOccurred: (style: "light" | "medium" | "heavy" | "rigid" | "soft") => void;
    notificationOccurred: (type: "error" | "success" | "warning") => void;
  };
  openLink?: (url: string, options?: { try_instant_view?: boolean }) => void;
  openInvoice?: (url: string, callback: (status: "paid" | "cancelled" | "failed" | "pending") => void) => void;
  BackButton?: {
    show: () => void;
    hide: () => void;
    onClick: (cb: () => void) => void;
    offClick: (cb: () => void) => void;
  };
}

declare global {
  interface Window {
    Telegram?: { WebApp: TelegramWebApp };
  }
}

export function getTelegramWebApp(): TelegramWebApp | null {
  return window.Telegram?.WebApp ?? null;
}

export function initTelegram(): void {
  const tg = getTelegramWebApp();
  if (!tg) return;
  tg.ready();
  tg.expand();
  try {
    tg.setHeaderColor("#0a0a0c");
    tg.setBackgroundColor("#0a0a0c");
  } catch {
    // older clients may not support these calls — non-fatal.
  }
}

export function haptic(style: "light" | "medium" | "heavy" = "light"): void {
  getTelegramWebApp()?.HapticFeedback?.impactOccurred(style);
}

export function hapticNotify(type: "error" | "success" | "warning"): void {
  getTelegramWebApp()?.HapticFeedback?.notificationOccurred(type);
}

export function getInitData(): string | null {
  const tg = getTelegramWebApp();
  return tg?.initData || null;
}

export const isInsideTelegram = (): boolean => Boolean(getTelegramWebApp()?.initData);

// Opens a Telegram Stars invoice link inside the Mini App's native payment
// sheet and resolves once the user closes it. Falls back to a plain link
// (e.g. desktop clients without openInvoice) with status "pending" — the
// webhook still grants the plan once/if the payment actually completes.
export function openInvoice(url: string): Promise<"paid" | "cancelled" | "failed" | "pending"> {
  return new Promise((resolve) => {
    const tg = getTelegramWebApp();
    if (!tg?.openInvoice) {
      openExternalLink(url);
      resolve("pending");
      return;
    }
    tg.openInvoice(url, (status) => resolve(status));
  });
}

export function openExternalLink(url: string): void {
  const tg = getTelegramWebApp();
  if (tg?.openLink) {
    tg.openLink(url);
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}
