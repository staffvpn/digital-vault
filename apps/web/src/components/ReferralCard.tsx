import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Gift, Share2, Copy, Check } from "lucide-react";
import { Card, Skeleton } from "./ui";
import { getReferralInfo } from "../lib/api";
import { useToastStore } from "../state/toast";
import { haptic } from "../lib/telegram";

const BOT_USERNAME = import.meta.env.VITE_TELEGRAM_BOT_USERNAME as string | undefined;

export function ReferralCard() {
  const push = useToastStore((s) => s.push);
  const [copied, setCopied] = useState(false);

  const { data, isLoading } = useQuery({ queryKey: ["referrals"], queryFn: getReferralInfo });

  if (isLoading) return <Skeleton className="h-24 w-full" />;
  if (!data) return null;

  const link = BOT_USERNAME ? `https://t.me/${BOT_USERNAME}?startapp=${data.code}` : null;
  const shareText = `Digital Vault — сохраняю ссылки, файлы и пароли, ИИ сам всё раскладывает. Заходи: ${link ?? data.code}`;

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

  const paidTotal = data.stats.qualified + data.stats.rewarded + data.stats.refunded;
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
            +{data.rewardPerReferral} места в Сейфе, когда друг оплатит Pro или Premium
          </p>
        </div>
      </div>

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

      {(paidTotal > 0 || data.bonusSecrets > 0) && (
        <p className="text-[11px] text-slate-dim">
          Оплатили по вашей ссылке: {paidTotal} · бонус: +{data.bonusSecrets} мест в Сейфе
          {atCap ? " (достигнут максимум)" : ""}
        </p>
      )}
    </Card>
  );
}
