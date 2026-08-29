import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { ClipboardPaste, Upload, Check, KeyRound, Copy } from "lucide-react";
import { ProcessingReadout } from "./ProcessingReadout";
import { classifyContent, createItem, updateItem, uploadFile, createSecret } from "../lib/api";
import { useToastStore } from "../state/toast";
import { hapticNotify } from "../lib/telegram";
import { guessCredentialFields, guessSecretName } from "../lib/credentialGuess";
import type { ClassifyResult, ItemType } from "../types";

// Everything here is designed around one rule: the person never has to
// confirm, edit, or dismiss anything to get something saved. Paste it, drop
// it, tap to paste — it's filed the moment the AI (or the local credential
// heuristic) has an answer. Mistakes get fixed afterwards, from the item's
// own actions sheet — not gated up front.
type Stage = "idle" | "dragging" | "processing" | "uploading" | "saved";

interface LinkMeta {
  title: string | null;
  description: string | null;
  image: string | null;
  domain: string | null;
}

interface Draft {
  kind: "url" | "text" | "image";
  content: string;
  mimeType?: string;
  raw: string;
  file?: File;
}

interface SavedFlash {
  title: string;
  sub: string;
  tone: "success" | "secret" | "duplicate";
}

function isUrl(text: string): boolean {
  try {
    const u = new URL(text.trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function CaptureZone({ onSaved }: { onSaved: () => void }) {
  const [stage, setStage] = useState<Stage>("idle");
  const [savedFlash, setSavedFlash] = useState<SavedFlash | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const push = useToastStore((s) => s.push);
  const flashTimer = useRef<number | null>(null);

  useEffect(() => () => {
    if (flashTimer.current) window.clearTimeout(flashTimer.current);
  }, []);

  const flashSaved = useCallback((flash: SavedFlash) => {
    setSavedFlash(flash);
    setStage("saved");
    hapticNotify("success");
    onSaved();
    if (flashTimer.current) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => {
      setStage((s) => (s === "saved" ? "idle" : s));
      setSavedFlash(null);
    }, 1200);
  }, [onSaved]);

  const autoSaveSecret = useCallback(
    async (raw: string) => {
      const guess = guessCredentialFields(raw);
      const name = guessSecretName(raw);
      try {
        await createSecret({
          name,
          username: guess.username || undefined,
          password: guess.password ?? raw.trim(),
        });
        flashSaved({ title: name, sub: "В Сейфе · не отправлялось в AI", tone: "secret" });
      } catch {
        push("Не удалось сохранить в Сейф", "error");
        setStage("idle");
      }
    },
    [flashSaved, push],
  );

  // Same destination as autoSaveSecret, but the fields already come filled
  // in — from the AI reading a login/registration screenshot — instead of
  // being guessed locally from raw pasted text.
  const autoSaveSecretFromFields = useCallback(
    async (fields: { name: string; username?: string; password: string }) => {
      try {
        await createSecret(fields);
        flashSaved({ title: fields.name, sub: "В Сейфе · распознано на скриншоте", tone: "secret" });
      } catch {
        push("Не удалось сохранить в Сейф", "error");
        setStage("idle");
      }
    },
    [flashSaved, push],
  );

  const autoSaveItem = useCallback(
    async (draft: Draft, result: ClassifyResult, linkMeta: LinkMeta | null) => {
      try {
        const title = result.title ?? linkMeta?.title ?? (draft.kind === "text" ? draft.content.slice(0, 80) : null);
        // description is the short AI-written summary used for search/cards —
        // never the fallback for the real content. The full text (with its
        // paragraphs intact) is preserved separately in `body`, or it's
        // silently lost the moment the AI's summary is all that's kept.
        const description = result.description ?? linkMeta?.description ?? null;
        const body = draft.kind === "text" ? draft.content : null;

        if (draft.kind === "image" && draft.file) {
          // The image itself was only ever sent to the AI for classification —
          // actually persist the bytes now, then attach the AI's metadata.
          const item = await uploadFile(draft.file);
          await updateItem(item.id, {
            category: result.category ?? null,
            subcategory: result.subcategory ?? null,
            title: title ?? draft.file.name,
            description,
            status: "saved",
            confidence: result.confidence,
          });
        } else {
          await createItem({
            type: (result.type as ItemType) ?? "text",
            category: result.category ?? null,
            subcategory: result.subcategory ?? null,
            title,
            description,
            body,
            source_url: draft.kind === "url" ? draft.content : null,
            source_domain: linkMeta?.domain ?? null,
            preview_url: linkMeta?.image ?? null,
            status: "saved",
            confidence: result.confidence,
            remind_at: result.remind_at ?? null,
            remind_has_time: result.remind_has_time ?? false,
            remind_notify_1: result.remind_notify_1 ?? null,
            remind_notify_2: result.remind_notify_2 ?? null,
          } as Partial<import("../types").VaultItem>);
        }
        const sub =
          result.type === "reminder" && result.remind_at
            ? `Напоминание · ${new Date(result.remind_at).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}`
            : result.category ?? "Разобрано и сохранено";
        flashSaved({
          title: title || "Сохранено",
          sub,
          tone: "success",
        });
      } catch {
        push("Не удалось сохранить", "error");
        setStage("idle");
      }
    },
    [flashSaved, push],
  );

  const runClassification = useCallback(
    async (d: Draft) => {
      setStage("processing");
      try {
        const { result, linkMeta, existingItem } = await classifyContent({ kind: d.kind, content: d.content, mimeType: d.mimeType });
        if (result.type === "duplicate") {
          flashSaved({ title: existingItem?.title ?? "Уже сохранено", sub: "Уже есть в коллекции", tone: "duplicate" });
          return;
        }
        if (result.type === "possible_credential") {
          hapticNotify("warning");
          if (d.kind === "image") {
            // The AI recognized this as a login/registration screen. If it
            // could read the password (not masked by dots), file it straight
            // into the Vault — the image itself is never uploaded or kept.
            // If the password was hidden, there's nothing to auto-save.
            if (result.cred_password) {
              await autoSaveSecretFromFields({
                name: result.cred_site || `Скриншот · ${new Date().toLocaleDateString("ru-RU")}`,
                username: result.cred_login || undefined,
                password: result.cred_password,
              });
            } else {
              push("Экран входа найден, но пароль скрыт на скриншоте — сохраните вручную в Сейфе", "default");
              setStage("idle");
            }
            return;
          }
          await autoSaveSecret(d.raw);
          return;
        }
        await autoSaveItem(d, result, (linkMeta as LinkMeta) ?? null);
      } catch {
        push("Не удалось распознать содержимое", "error");
        setStage("idle");
      }
    },
    [autoSaveSecret, autoSaveSecretFromFields, autoSaveItem, flashSaved, push],
  );

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const file = files[0];
      if (!file) return;
      if (file.type.startsWith("image/")) {
        const base64 = await fileToBase64(file);
        runClassification({ kind: "image", content: base64, mimeType: file.type, raw: "", file });
      } else {
        setStage("uploading");
        try {
          const item = await uploadFile(file);
          await updateItem(item.id, { status: "saved" });
          flashSaved({ title: file.name, sub: "Сохранено в Файлы", tone: "success" });
        } catch {
          push("Не удалось загрузить файл", "error");
          setStage("idle");
        }
      }
    },
    [runClassification, flashSaved, push],
  );

  const handleText = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      runClassification({ kind: isUrl(trimmed) ? "url" : "text", content: trimmed, raw: trimmed });
    },
    [runClassification],
  );

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (stage !== "idle") return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.kind === "file" && item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            handleFiles([file]);
            return;
          }
        }
      }
      const text = e.clipboardData?.getData("text/plain");
      if (text) {
        e.preventDefault();
        handleText(text);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [stage, handleFiles, handleText]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setStage("idle");
    if (e.dataTransfer.files.length) {
      handleFiles(e.dataTransfer.files);
      return;
    }
    const uri = e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain");
    if (uri) handleText(uri);
  };

  // Mobile has no Ctrl+V — tapping anywhere on the empty capture field reads
  // the clipboard directly, same effect as a desktop paste.
  const tryClipboardTap = async () => {
    if (stage !== "idle" && stage !== "dragging") return;
    if (!navigator.clipboard) {
      push("Вставьте вручную: Ctrl+V", "error");
      return;
    }
    try {
      if (navigator.clipboard.read) {
        const clipItems = await navigator.clipboard.read();
        for (const clipItem of clipItems) {
          const imageType = clipItem.types.find((t) => t.startsWith("image/"));
          if (imageType) {
            const blob = await clipItem.getType(imageType);
            const file = new File([blob], "clipboard-image.png", { type: imageType });
            handleFiles([file]);
            return;
          }
        }
      }
      const text = await navigator.clipboard.readText();
      if (text.trim()) {
        handleText(text);
        return;
      }
      push("Буфер обмена пуст", "error");
    } catch {
      push("Нет доступа к буферу обмена — вставьте вручную", "error");
    }
  };

  const idleStage = stage === "idle" || stage === "dragging";
  const dragging = stage === "dragging";

  return (
    <div className="relative p-1">
      {/* Viewfinder-style corner brackets — not decorative gloss, reads as
          "instrument", matches the rest of the app's terminal/vault motifs. */}
      <CornerBracket corner="top-left" active={dragging} />
      <CornerBracket corner="top-right" active={dragging} />
      <CornerBracket corner="bottom-left" active={dragging} />
      <CornerBracket corner="bottom-right" active={dragging} />

      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (stage === "idle") setStage("dragging");
        }}
        onDragLeave={() => stage === "dragging" && setStage("idle")}
        onDrop={onDrop}
        className={clsx(
          "relative overflow-hidden rounded-lg border bg-graphite transition-colors duration-300",
          dragging ? "border-signal-dim/70" : "border-hairline",
        )}
      >
        {/* thin flowing accent — the app's own signal blue, dim to bright and back */}
        <div className={clsx("aurora-flow h-[2px] w-full", dragging && "aurora-flow-fast")} />

        <div className="relative p-5">
          {dragging && (
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-signal/60 animate-scanline" />
          )}

          {idleStage && (
            <div
              onClick={tryClipboardTap}
              className="flex cursor-pointer flex-col items-center gap-3.5 py-9 text-center"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-hairline-strong bg-graphite-raised text-signal shadow-[0_0_0_1px_rgba(79,182,214,0.08)]">
                <ClipboardPaste size={22} strokeWidth={1.5} />
              </div>
              <p className="text-base font-medium text-bone">
                Нажмите, чтобы вставить, <br className="sm:hidden" />
                или перетащите сюда
              </p>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
                className="mt-0.5 inline-flex items-center gap-1.5 text-xs font-medium text-slate hover:text-bone transition-colors"
              >
                <Upload size={13} strokeWidth={1.5} />
                или загрузить файл
              </button>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => e.target.files && handleFiles(e.target.files)}
              />
            </div>
          )}

          {stage === "uploading" && (
            <div className="flex flex-col items-center gap-3 py-10">
              <ProcessingReadout label="ЗАГРУЗКА" />
            </div>
          )}

          {stage === "processing" && (
            <div className="flex flex-col items-center gap-3 py-10">
              <ProcessingReadout label="АНАЛИЗ" />
            </div>
          )}

          {stage === "saved" && savedFlash && (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <div
                className={clsx(
                  "flex h-11 w-11 items-center justify-center rounded-full border",
                  savedFlash.tone === "secret" && "border-signal-dim/60 bg-signal/10 text-signal",
                  savedFlash.tone === "duplicate" && "border-slate-dim/40 bg-graphite-raised text-slate",
                  savedFlash.tone === "success" && "border-moss/40 bg-moss/10 text-moss",
                )}
              >
                {savedFlash.tone === "secret" ? (
                  <KeyRound size={18} strokeWidth={2} />
                ) : savedFlash.tone === "duplicate" ? (
                  <Copy size={18} strokeWidth={1.5} />
                ) : (
                  <Check size={20} strokeWidth={2} />
                )}
              </div>
              <p className="max-w-[240px] truncate text-sm font-medium text-bone">{savedFlash.title}</p>
              <p className="text-xs text-slate">{savedFlash.sub}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const BRACKET_POSITION: Record<string, string> = {
  "top-left": "left-0 top-0 rounded-tl-lg border-l-2 border-t-2",
  "top-right": "right-0 top-0 rounded-tr-lg border-r-2 border-t-2",
  "bottom-left": "left-0 bottom-0 rounded-bl-lg border-l-2 border-b-2",
  "bottom-right": "right-0 bottom-0 rounded-br-lg border-r-2 border-b-2",
};

function CornerBracket({
  corner,
  active,
}: {
  corner: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  active: boolean;
}) {
  return (
    <div
      aria-hidden
      className={clsx(
        "pointer-events-none absolute h-3.5 w-3.5 transition-colors duration-300",
        BRACKET_POSITION[corner],
        active ? "border-signal" : "border-hairline-strong",
      )}
    />
  );
}
