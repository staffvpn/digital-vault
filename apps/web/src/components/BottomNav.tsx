import { useState } from "react";
import { NavLink } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Inbox, Lock, LayoutGrid, UserRound, Mic } from "lucide-react";
import clsx from "clsx";
import { haptic } from "../lib/telegram";
import { VoiceCaptureSheet } from "./VoiceCaptureSheet";

const leftItems = [
  { to: "/", label: "Входящие", icon: Inbox, end: true },
  { to: "/vault", label: "Сейф", icon: Lock, end: false },
];
const rightItems = [
  { to: "/library", label: "Библиотека", icon: LayoutGrid, end: false },
  { to: "/settings", label: "Профиль", icon: UserRound, end: false },
];

function NavItem({ to, label, icon: Icon, end }: { to: string; label: string; icon: typeof Inbox; end: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={() => haptic("light")}
      className={({ isActive }) =>
        clsx(
          "flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium uppercase tracking-wider transition-colors",
          isActive ? "text-signal" : "text-slate-dim",
        )
      }
    >
      <Icon size={20} strokeWidth={1.5} />
      <span>{label}</span>
    </NavLink>
  );
}

export function BottomNav() {
  const [voiceOpen, setVoiceOpen] = useState(false);
  const queryClient = useQueryClient();

  return (
    <>
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-hairline bg-void/95 backdrop-blur">
        <div className="relative mx-auto grid max-w-md grid-cols-5">
          {leftItems.map((item) => (
            <NavItem key={item.to} {...item} />
          ))}

          <div className="flex items-start justify-center">
            <button
              onClick={() => {
                haptic("medium");
                setVoiceOpen(true);
              }}
              aria-label="Записать голосом или текстом"
              className="-mt-5 flex h-14 w-14 items-center justify-center rounded-full bg-signal text-void shadow-[0_0_22px_rgba(79,182,214,0.55)] transition-all duration-150 hover:brightness-110 active:scale-90"
            >
              <Mic size={22} strokeWidth={2} />
            </button>
          </div>

          {rightItems.map((item) => (
            <NavItem key={item.to} {...item} />
          ))}
        </div>
      </nav>

      <VoiceCaptureSheet
        open={voiceOpen}
        onClose={() => setVoiceOpen(false)}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ["items"] })}
      />
    </>
  );
}
