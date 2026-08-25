import { useEffect, useRef, useState } from "react";
import { Mic, Square, Check, KeyRound } from "lucide-react";
import clsx from "clsx";
import { Sheet } from "./Sheet";
import { Button } from "./ui";
import { ProcessingReadout } from "./ProcessingReadout";
import { classifyAndSaveText, type AutoSaveFlash } from "../lib/autoSave";
import { transcribeAudio } from "../lib/api";
import { hapticNotify } from "../lib/telegram";
import { useToastStore } from "../state/toast";

type Stage = "idle" | "recording" | "processing" | "done" | "error";

// Same zero-confirmation philosophy as CaptureZone, just fed by a
// microphone instead of a paste event: record or type, and it's filed —
// including reminders ("напомни обновить токен 23 сентября"), which the
// classifier routes automatically.
export function VoiceCaptureSheet({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [stage, setStage] = useState<Stage>("idle");
  const [seconds, setSeconds] = useState(0);
  const [manualText, setManualText] = useState("");
  const [flash, setFlash] = useState<AutoSaveFlash | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const push = useToastStore((s) => s.push);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (open) return;
    if (timerRef.current) window.clearInterval(timerRef.current);
    if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
    setStage("idle");
    setSeconds(0);
    setManualText("");
    setFlash(null);
  }, [open]);

  const runSave = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) {
      setStage("error");
      setErrorMsg("Пустой текст — не удалось разобрать");
      return;
    }
    setStage("processing");
    try {
      const result = await classifyAndSaveText(trimmed);
      hapticNotify("success");
      setFlash(result);
      setStage("done");
      onSaved();
      window.setTimeout(onClose, 1400);
    } catch {
      setStage("error");
      setErrorMsg("Не удалось сохранить");
    }
  };

  const handleRecorded = async (blob: Blob) => {
    setStage("processing");
    try {
      const text = await transcribeAudio(blob);
      await runSave(text);
    } catch {
      setStage("error");
      setErrorMsg("Не удалось распознать голос");
    }
  };

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      push("Микрофон недоступен здесь — напишите текстом ниже", "error");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        handleRecorded(blob);
      };
      recorder.start();
      recorderRef.current = recorder;
      setStage("recording");
      setSeconds(0);
      timerRef.current = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      push("Нет доступа к микрофону", "error");
    }
  };

  const stopRecording = () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    recorderRef.current?.stop();
  };

  return (
    <Sheet open={open} onClose={onClose} title="Голосом или текстом">
      <div className="flex flex-col items-center gap-5 py-3">
        {stage === "idle" && (
          <>
            <button
              onClick={startRecording}
              aria-label="Начать запись"
              className="flex h-20 w-20 items-center justify-center rounded-full bg-signal text-void shadow-[0_0_30px_rgba(79,182,214,0.5)] transition-all duration-150 hover:brightness-110 active:scale-95"
            >
              <Mic size={30} strokeWidth={2} />
            </button>
            <p className="max-w-[260px] text-center text-xs text-slate-dim">
              Нажмите и скажите, например: «напомни обновить токен 23 сентября»
            </p>
            <div className="w-full space-y-2 border-t border-hairline pt-4">
              <textarea
                value={manualText}
                onChange={(e) => setManualText(e.target.value)}
                placeholder="Или напишите текстом…"
                rows={2}
                className="w-full resize-none rounded-md border border-hairline bg-graphite-raised px-3 py-2 text-sm text-bone placeholder:text-slate-dim outline-none focus:border-signal-dim"
              />
              <Button variant="secondary" className="w-full" disabled={!manualText.trim()} onClick={() => runSave(manualText)}>
                Сохранить текст
              </Button>
            </div>
          </>
        )}

        {stage === "recording" && (
          <>
            <button
              onClick={stopRecording}
              aria-label="Остановить запись"
              className="flex h-20 w-20 animate-pulse items-center justify-center rounded-full bg-ember text-void shadow-[0_0_30px_rgba(226,102,92,0.5)]"
            >
              <Square size={24} strokeWidth={2} />
            </button>
            <p className="font-mono text-sm text-bone tabular">
              {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
            </p>
            <p className="text-xs text-slate-dim">Говорите — нажмите ещё раз, чтобы остановить</p>
          </>
        )}

        {stage === "processing" && (
          <div className="flex flex-col items-center gap-3 py-8">
            <ProcessingReadout label="РАСПОЗНАЁМ" />
          </div>
        )}

        {stage === "done" && flash && (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <div
              className={clsx(
                "flex h-11 w-11 items-center justify-center rounded-full border",
                flash.tone === "secret" ? "border-signal-dim/60 bg-signal/10 text-signal" : "border-moss/40 bg-moss/10 text-moss",
              )}
            >
              {flash.tone === "secret" ? <KeyRound size={18} strokeWidth={2} /> : <Check size={20} strokeWidth={2} />}
            </div>
            <p className="max-w-[260px] text-sm font-medium text-bone">{flash.title}</p>
            <p className="text-xs text-slate">{flash.sub}</p>
          </div>
        )}

        {stage === "error" && (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <p className="max-w-[260px] text-sm text-ember">{errorMsg}</p>
            <Button variant="secondary" onClick={() => setStage("idle")}>
              Попробовать снова
            </Button>
          </div>
        )}
      </div>
    </Sheet>
  );
}
