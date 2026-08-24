import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import clsx from "clsx";

export function Card({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx(
        "rounded-lg border border-hairline bg-graphite",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function Tag({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "signal" }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider",
        tone === "signal"
          ? "border-signal-dim/60 text-signal"
          : "border-hairline text-slate",
      )}
    >
      {children}
    </span>
  );
}

const badgeTone = {
  neutral: "text-slate border-hairline",
  positive: "text-moss border-moss/30",
  danger: "text-ember border-ember/30",
  signal: "text-signal border-signal-dim/60",
};

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: keyof typeof badgeTone }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider",
        badgeTone[tone],
      )}
    >
      {children}
    </span>
  );
}

const buttonVariants = {
  primary: "bg-bone text-void hover:bg-white active:scale-[0.98]",
  secondary: "bg-graphite-raised text-bone border border-hairline hover:border-hairline-strong active:scale-[0.98]",
  ghost: "text-slate hover:text-bone active:scale-[0.98]",
  danger: "bg-ember/10 text-ember border border-ember/30 hover:bg-ember/15 active:scale-[0.98]",
  signal: "bg-signal text-void hover:brightness-110 active:scale-[0.98]",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof buttonVariants;
}

export function Button({ variant = "primary", className, children, ...rest }: ButtonProps) {
  return (
    <button
      className={clsx(
        "inline-flex items-center justify-center gap-1.5 rounded-md px-4 py-2.5 text-sm font-medium transition-all duration-150 disabled:opacity-40 disabled:pointer-events-none",
        buttonVariants[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function IconButton({ className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={clsx(
        "inline-flex h-9 w-9 items-center justify-center rounded-md border border-hairline bg-graphite-raised text-slate transition-all duration-150 hover:text-bone hover:border-hairline-strong active:scale-95",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={clsx("animate-pulse rounded-md bg-graphite-raised", className)}
    />
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-8 py-16 text-center">
      {icon && <div className="text-slate-dim">{icon}</div>}
      <div className="space-y-1">
        <p className="text-sm font-medium text-bone">{title}</p>
        {description && <p className="text-xs text-slate leading-relaxed">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({
  title = "Не получилось загрузить",
  description,
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-8 py-16 text-center">
      <div className="space-y-1">
        <p className="text-sm font-medium text-ember">{title}</p>
        {description && <p className="text-xs text-slate leading-relaxed">{description}</p>}
      </div>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry} className="mt-1">
          Повторить
        </Button>
      )}
    </div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="px-4 text-[11px] font-medium uppercase tracking-wider text-slate-dim">
      {children}
    </p>
  );
}
