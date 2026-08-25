import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Gift, Share2, Copy, Check } from "lucide-react";
import clsx from "clsx";
import { Card, Skeleton } from "./ui";
import { getReferralInfo } from "../lib/api";
import { useToastStore } from "../state/toast";
import { haptic } from "../lib/telegram";
import { relativeDate } from "../lib/format";
import type { ReferralUserStatus } from "../types";

const BOT_USERNAME = import.meta.env.VITE_TELEGRAM_BOT_USERNAME as string | undefined;
// The short name given to the Mini App in @BotFather (via /newapp) — a
// direct startapp link only resolves as t.me/<bot>/<app_shortname>?startapp=,
// NOT t.me/<bot>?startapp= alone (that form 400s with BOT_INVALID once the
// bot has a registered Mini App rather than just a Menu Button URL).
const APP_SHORTNAME = import.meta.env.VITE_TELEGRAM_MINIAPP_SHORTNAME as string | undefined;

const STATUS_LABEL: Record<ReferralUserStatus, string> = {
  registered: "Ждём оплату",
  payment_pending: "Оформляет оплату",
  paid: "Оплатил, проверяем",
  qualified: "Условие выполнено",
  rewarded: "Условие выполнено",
  refunded: "Оплата возвращена",
  blocked: "На проверке",
};

const STATUS_TONE: Record<ReferralUserStatus, string> = {
  registered: "text-slate-dim",
  payment_pending: "text-slate-dim",
  paid: "text-slate-dim",
  qualified: "text-moss",
  rewarded: "text-moss",
  refunded: "text-ember",
  blocked: "text-ember",
};

export function ReferralCard() {
  const push = useToastStore((s) => s.push);
  const [copied, setCopied] = useState(false);

  const { data, isLoading } = useQuery({ queryKey: ["referrals"], queryFn: getReferralInfo });

  if (isLoading) return <Skeleton className="h-24 w-full" />;
  if (!data) return null;

  const link =
    BOT_USERNAME && APP_SHORTNAME ? `https://t.me/${BOT_USERNAME}/${APP_SHORTNAME}?startapp=${data.code}` : null;
  const shareText = `NCHT Notion — сохраняю ссылки, файлы и пароли, ИИ сам всё раскладывает. Заходи: ${link ?? data.code}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link ?? data.code);
      setCopied(true);
      haptic("light");
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      push("Не удалось скопировать", "error");
    }
  };

  const share = async () => {
    haptic("light");
    if (navigator.share) {
      try {
        await navigator.share({ text: shareText });
        return;
      } catch {
        // user cancelled or share unsupported in this context — fall through to copy
      }
    }
    copy();
  };

  const atCap = data.bonusSecrets >= data.maxBonusSecrets;

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-hairline bg-graphite-raised text-signal">
          <Gift size={15} strokeWidth={1.5} />
        </div>
        <div>
          <p className="text-sm font-semibold text-bone">Пригласить друга</p>
          <p className="text-xs text-slate-dim">
            +{data.rewardPerReferral.pro} места за Pro или +{data.rewardPerReferral.pro_plus} за Premium — когда друг
            оплатит
          </p>
        </div>
      </div>

      <p className="rounded-md border border-signal-dim/40 bg-signal/5 px-3 py-2 text-xs leading-relaxed text-slate">
        Другу тоже выгодно: по вашей ссылке он получает <span className="text-bone">скидку 10%</span> на первую
        оплату Pro или Premium.
      </p>

      <div className="flex items-center gap-2 rounded-md border border-hairline bg-graphite-raised px-3 py-2">
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-slate">{link ?? data.code}</span>
        <button onClick={copy} className="shrink-0 text-slate-dim transition-colors hover:text-bone" aria-label="Скопировать">
          {copied ? <Check size={14} strokeWidth={2} className="text-moss" /> : <Copy size={14} strokeWidth={1.5} />}
        </button>
      </div>

      <button
        onClick={share}
        className="flex w-full items-center justify-center gap-1.5 rounded-md bg-signal py-2 text-xs font-medium text-void transition-all hover:brightness-110 active:scale-[0.98]"
      >
        <Share2 size={13} strokeWidth={2} />
        Поделиться ссылкой
      </button>

      <p className="text-[11px] text-slate-dim">
        Бонус: +{data.bonusSecrets} из {data.maxBonusSecrets} мест в Сейфе
        {atCap ? " (достигнут максимум)" : ""}
      </p>

      {data.referredUsers.length > 0 && (
        <div className="space-y-1 border-t border-hairline pt-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-dim">
            Перешли по ссылке ({data.referredUsers.length})
          </p>
          <div className="divide-y divide-hairline">
            {data.referredUsers.map((u, i) => (
              <div key={i} className="flex items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <p className="truncate text-xs text-bone">{u.name}</p>
                  <p className="text-[10px] text-slate-dim">{relativeDate(u.createdAt)}</p>
                </div>
                <span className={clsx("shrink-0 text-[11px] font-medium", STATUS_TONE[u.status])}>
                  {STATUS_LABEL[u.status]}
                  {u.rewardAmount > 0 ? ` (+${u.rewardAmount})` : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
