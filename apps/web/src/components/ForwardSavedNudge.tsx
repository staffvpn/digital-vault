import { Forward } from "lucide-react";
import { Card, Button } from "./ui";
import { openExternalLink } from "../lib/telegram";

const BOT_USERNAME = import.meta.env.VITE_TELEGRAM_BOT_USERNAME as string | undefined;

// The onboarding WOW-moment: instead of an empty app asking someone to add
// something new, point them at the mess they already have — their own
// Telegram "Избранное" — and let them watch it get sorted in seconds.
// Shown only until the first real AI classification happens (ai_calls_used
// === 0 is a reliable proxy: it flips the moment either capture path —
// Mini App or forwarding to the bot — actually runs).
export function ForwardSavedNudge() {
  const open = () => {
    if (BOT_USERNAME) openExternalLink(`https://t.me/${BOT_USERNAME}`);
  };

  return (
    <Card className="space-y-3 border-signal-dim/40 bg-signal/5 p-4">
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-hairline bg-graphite-raised text-signal">
          <Forward size={15} strokeWidth={1.5} />
        </div>
        <div>
          <p className="text-sm font-semibold text-bone">Начните с того, что уже есть</p>
          <p className="text-xs text-slate-dim">Не сохраняйте новое — перешлите старое</p>
        </div>
      </div>
      <p className="text-xs leading-relaxed text-slate">
        Откройте своё «Избранное» в Telegram, перешлите сюда 5–10 сообщений оттуда — и посмотрите, как ИИ
        мгновенно разложит их по категориям и сделает доступными для поиска.
      </p>
      <Button variant="signal" className="w-full" onClick={open} disabled={!BOT_USERNAME}>
        Открыть бота и переслать
      </Button>
    </Card>
  );
}
