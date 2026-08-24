import { NavLink } from "react-router-dom";
import { Inbox, Lock, LayoutGrid, Search } from "lucide-react";
import clsx from "clsx";
import { haptic } from "../lib/telegram";

const items = [
  { to: "/", label: "Inbox", icon: Inbox, end: true },
  { to: "/vault", label: "Vault", icon: Lock, end: false },
  { to: "/library", label: "Library", icon: LayoutGrid, end: false },
  { to: "/search", label: "Search", icon: Search, end: false },
];

export function BottomNav() {
  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-hairline bg-void/95 backdrop-blur">
      <div className="mx-auto grid max-w-md grid-cols-4">
        {items.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={() => haptic("light")}
            className={({ isActive }) =>
              clsx(
                "flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium uppercase tracking-wider transition-colors",
                isActive ? "text-signal" : "text-slate-dim",
                to === "/vault" && isActive && "text-bone",
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon
                  size={20}
                  strokeWidth={1.5}
                  className={clsx(to === "/vault" && isActive && "text-signal")}
                />
                <span>{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
