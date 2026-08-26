import { useState } from "react";
import { ClipboardPaste, Sparkles, Lock, Check, Forward } from "lucide-react";
import clsx from "clsx";
import { haptic } from "../lib/telegram";

const SLIDES = [
  {
    icon: ClipboardPaste,
    title: "Сохраняй что угодно",
    text: "Ссылку, текст, скриншот или файл — вставьте (Ctrl+V) или перетащите в приложение.",
  },
  {
    icon: Sparkles,
    title: "ИИ сам разберётся",
    text: "Определит тип, категорию и теги — останется только подтвердить.",
    demo: true,
  },
  {
    icon: Forward,
    title: "Начните с того, что уже есть",
    text: "Не сохраняйте новое — откройте своё «Избранное» в Telegram и перешлите оттуда несколько сообщений прямо боту. Увидите, как ИИ мгновенно разложит их по категориям.",
  },
  {
    icon: Lock,
    title: "Личное и защищённое",
    text: "Пароли и ключи хранятся отдельно, зашифрованными, и никогда не попадают в ИИ.",
  },
];

export function Onboarding({ onDone }: { onDone: () => void }) {
  const [index, setIndex] = useState(0);
  const slide = SLIDES[index];
  const Icon = slide.icon;
  const isLast = index === SLIDES.length - 1;

  const next = () => {
    haptic("light");
    if (isLast) {
      onDone();
    } else {
      setIndex((i) => i + 1);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-void safe-top safe-bottom">
      <div className="flex items-center justify-between px-5 pt-4">
        <div className="flex gap-1.5">
          {SLIDES.map((_, i) => (
            <span
              key={i}
              className={clsx(
                "h-1 w-6 rounded-full transition-colors",
                i === index ? "bg-signal" : "bg-hairline",
              )}
            />
          ))}
        </div>
        <button
          onClick={onDone}
          className="text-xs font-medium text-slate-dim transition-colors hover:text-bone"
        >
          Пропустить
        </button>
      </div>

      <div key={index} className="flex flex-1 flex-col items-center justify-center gap-6 px-8 text-center animate-[fade-up_0.35s_ease-out]">
        {slide.demo ? (
          <div className="relative flex h-32 w-full max-w-[220px] items-center justify-center">
            <div className="absolute h-24 w-24 rounded-full bg-signal/20 blur-2xl" />
            <div className="relative w-full rounded-lg border border-white/10 bg-white/[0.04] p-3 text-left backdrop-blur-md">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-moss">
                <Check size={11} strokeWidth={2} />
                НАЙДЕНО
              </div>
              <p className="mt-1.5 text-xs font-medium text-bone">Design reference</p>
              <p className="text-[11px] text-slate">Насмотренность / Web Design</p>
            </div>
          </div>
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-md border border-hairline bg-graphite-raised text-signal">
            <Icon size={24} strokeWidth={1.5} />
          </div>
        )}

        <div className="space-y-2">
          <h2 className="text-lg font-semibold tracking-tight text-bone">{slide.title}</h2>
          <p className="max-w-[280px] text-sm leading-relaxed text-slate">{slide.text}</p>
        </div>
      </div>

      <div className="px-5 pb-4">
        <button
          onClick={next}
          className="w-full rounded-md bg-bone py-3 text-sm font-medium text-void transition-all active:scale-[0.98]"
        >
          {isLast ? "Начать" : "Далее"}
        </button>
      </div>

      <style>{`
        @keyframes fade-up {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
