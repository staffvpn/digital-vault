import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { ClipboardPaste, Upload, ShieldAlert, Check, Pencil, X, KeyRound } from "lucide-react";
import { Button } from "./ui";
import { ProcessingReadout } from "./ProcessingReadout";
import { typeMeta } from "../lib/typeMeta";
import { classifyContent, createItem, updateItem, uploadFile, createSecret } from "../lib/api";
import { useToastStore } from "../state/toast";
import { haptic, hapticNotify } from "../lib/telegram";
import type { ClassifyResult, ItemType } from "../types";

type Stage = "idle" | "dragging" | "processing" | "result" | "credential" | "uploading";

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

function guessCredentialFields(text: string) {
  const password = text.match(/password\s*[:=]\s*(\S+)/i)?.[1];
  const username = text.match(/(?:username|login|email)\s*[:=]\s*(\S+)/i)?.[1];
  return { password, username };
}

export function CaptureZone({ onSaved }: { onSaved: () => void }) {
  const [stage, setStage] = useState<Stage>("idle");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [result, setResult] = useState<ClassifyResult | null>(null);
  const [linkMeta, setLinkMeta] = useState<LinkMeta | null>(null);
  const [editing, setEditing] = useState(false);
  const [editCategory, setEditCategory] = useState("");
  const [saving, setSaving] = useState(false);
  const [credFields, setCredFields] = useState({ name: "", username: "", password: "" });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const push = useToastStore((s) => s.push);

  const runClassification = useCallback(async (d: Draft) => {
    setDraft(d);
    setLinkMeta(null);
    setStage("processing");
    try {
      const { result, linkMeta: meta } = await classifyContent({ kind: d.kind, content: d.content, mimeType: d.mimeType });
      if (meta) setLinkMeta(meta as LinkMeta);
      if (result.type === "possible_credential") {
        const guess = guessCredentialFields(d.raw);
        setCredFields({ name: "", username: guess.username ?? "", password: guess.password ?? "" });
        setStage("credential");
        hapticNotify("warning");
        return;
      }
      setResult(result);
      setEditCategory(result.category ?? "");
      setStage("result");
      hapticNotify("success");
    } catch {
      setResult({ type: "unknown", category: null, title: null, tags: [], confidence: 0 });
      setEditCategory("");
      setStage("result");
    }
  }, []);

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
          await uploadFile(file);
          push(`Сохранено: ${file.name}`, "success");
          hapticNotify("success");
          onSaved();
          setStage("idle");
        } catch {
          push("Не удалось загрузить файл", "error");
          setStage("idle");
        }
      }
    },
    [runClassification, onSaved, push],
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

  const reset = () => {
    setStage("idle");
    setDraft(null);
    setResult(null);
    setLinkMeta(null);
    setEditing(false);
    setSaving(false);
    setCredFields({ name: "", username: "", password: "" });
  };

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

  const handleSave = async () => {
    if (!result || !draft || saving) return;
    setSaving(true);
    haptic("medium");
    try {
      if (draft.kind === "image" && draft.file) {
        // The image itself was only ever sent to the AI for classification —
        // actually persist the bytes now, then attach the AI's metadata.
        const item = await uploadFile(draft.file);
        await updateItem(item.id, {
          category: editCategory || null,
          title: result.title ?? draft.file.name,
          status: "saved",
          confidence: result.confidence,
        });
      } else {
        await createItem({
          type: (result.type as ItemType) ?? "text",
          category: editCategory || null,
          title: result.title ?? linkMeta?.title ?? (draft.kind === "text" ? draft.content.slice(0, 80) : null),
          description: draft.kind === "text" ? draft.content : linkMeta?.description ?? null,
          source_url: draft.kind === "url" ? draft.content : null,
          source_domain: linkMeta?.domain ?? null,
          preview_url: linkMeta?.image ?? null,
          status: "saved",
          confidence: result.confidence,
        });
      }
      push("Сохранено", "success");
      onSaved();
      reset();
    } catch {
      push("Не удалось сохранить", "error");
      setSaving(false);
    }
  };

  const handleSaveSecret = async () => {
    if (!credFields.name || !credFields.password) {
      push("Укажите название и пароль", "error");
      return;
    }
    try {
      await createSecret({
        name: credFields.name,
        username: credFields.username || undefined,
        password: credFields.password,
      });
      push("Сохранено в Сейф", "success");
      hapticNotify("success");
      reset();
    } catch {
      push("Не удалось сохранить секрет", "error");
    }
  };

  const lowConfidence = result && (!result.category || result.confidence < 0.4);

  const idleStage = stage === "idle" || stage === "dragging";

  return (
    <div className="relative">
      {/* soft ambient glow behind the frame — same flowing gradient, blurred */}
      <div
        aria-hidden
        className={clsx(
          "aurora-flow pointer-events-none absolute -inset-4 -z-10 rounded-[34px] blur-2xl transition-opacity duration-300",
          stage === "dragging" ? "aurora-flow-fast opacity-70" : "opacity-30",
        )}
      />
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (stage === "idle") setStage("dragging");
        }}
        onDragLeave={() => stage === "dragging" && setStage("idle")}
        onDrop={onDrop}
        className={clsx(
          "aurora-flow relative overflow-hidden rounded-[26px] p-[1.5px] transition-all duration-300",
          stage === "dragging" && "aurora-flow-fast",
        )}
      >
        <div className="relative overflow-hidden rounded-[24px] bg-graphite p-5">
          {stage === "dragging" && (
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-signal/60 animate-scanline" />
          )}

          {idleStage && (
            <div
              onClick={tryClipboardTap}
              className="flex cursor-pointer flex-col items-center gap-3.5 py-9 text-center"
            >
              <div className="aurora-flow flex h-16 w-16 items-center justify-center rounded-2xl p-[1.5px]">
                <div className="flex h-full w-full items-center justify-center rounded-2xl bg-graphite-raised text-signal">
                  <ClipboardPaste size={24} strokeWidth={1.5} />
                </div>
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

      {stage === "credential" && (
        <div className="space-y-4 py-2">
          <div className="flex items-start gap-2.5 rounded-md border border-ember/30 bg-ember/5 px-3 py-2.5">
            <ShieldAlert size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-ember" />
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-ember">Похоже на пароль</p>
              <p className="text-xs text-slate leading-relaxed">
                Похоже на логин/пароль или ключ. Мы не отправляли это в AI — сохраним прямо в Сейф.
              </p>
            </div>
          </div>
          <div className="space-y-2.5">
            <input
              value={credFields.name}
              onChange={(e) => setCredFields((f) => ({ ...f, name: e.target.value }))}
              placeholder="Название (например GitHub)"
              className="w-full rounded-md border border-hairline bg-graphite-raised px-3 py-2 text-sm text-bone placeholder:text-slate-dim outline-none focus:border-signal-dim"
            />
            <input
              value={credFields.username}
              onChange={(e) => setCredFields((f) => ({ ...f, username: e.target.value }))}
              placeholder="Логин / email"
              className="w-full rounded-md border border-hairline bg-graphite-raised px-3 py-2 text-sm text-bone placeholder:text-slate-dim outline-none focus:border-signal-dim"
            />
            <input
              value={credFields.password}
              onChange={(e) => setCredFields((f) => ({ ...f, password: e.target.value }))}
              placeholder="Пароль"
              type="password"
              className="w-full rounded-md border border-hairline bg-graphite-raised px-3 py-2 text-sm text-bone placeholder:text-slate-dim outline-none focus:border-signal-dim"
            />
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={reset}>
              Отмена
            </Button>
            <Button variant="signal" className="flex-1" onClick={handleSaveSecret}>
              <KeyRound size={14} strokeWidth={1.5} />
              Сохранить безопасно
            </Button>
          </div>
        </div>
      )}

      {stage === "result" && result && draft && (
        <ResultCard
          result={result}
          draft={draft}
          linkMeta={linkMeta}
          lowConfidence={Boolean(lowConfidence)}
          editing={editing}
          editCategory={editCategory}
          saving={saving}
          setEditCategory={setEditCategory}
          setEditing={setEditing}
          onSave={handleSave}
          onCancel={reset}
        />
      )}
        </div>
      </div>
    </div>
  );
}

function ResultCard({
  result,
  draft,
  linkMeta,
  lowConfidence,
  editing,
  editCategory,
  saving,
  setEditCategory,
  setEditing,
  onSave,
  onCancel,
}: {
  result: ClassifyResult;
  draft: Draft;
  linkMeta: LinkMeta | null;
  lowConfidence: boolean;
  editing: boolean;
  editCategory: string;
  saving: boolean;
  setEditCategory: (v: string) => void;
  setEditing: (v: boolean) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const meta = typeMeta((result.type as ItemType) ?? "text");
  const Icon = meta.icon;
  const previewSrc = draft.kind === "image" ? `data:${draft.mimeType};base64,${draft.content}` : linkMeta?.image;

  return (
    <div className="space-y-4 py-1">
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-moss">
        <Check size={13} strokeWidth={2} />
        НАЙДЕНО
      </div>

      {previewSrc && (
        <div className="overflow-hidden rounded-md border border-hairline bg-graphite-raised">
          <img src={previewSrc} alt="" className="max-h-40 w-full object-cover" />
        </div>
      )}

      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-hairline bg-graphite-raised text-signal">
          <Icon size={18} strokeWidth={1.5} />
        </div>
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium text-bone">{result.title ?? linkMeta?.title ?? meta.label}</p>
          {draft.kind === "url" && (
            <p className="truncate text-xs text-slate">{new URL(draft.content).hostname.replace(/^www\./, "")}</p>
          )}
          {draft.kind === "text" && <p className="line-clamp-2 text-xs text-slate">{draft.content}</p>}
        </div>
      </div>

      {lowConfidence ? (
        <div className="rounded-md border border-hairline bg-graphite-raised px-3 py-2 text-xs text-slate">
          Не удалось уверенно определить категорию — выберите вручную.
        </div>
      ) : (
        <div className="space-y-1.5">
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-dim">Категория</p>
          <p className="text-sm text-bone">{[result.category, result.subcategory].filter(Boolean).join(" / ") || "—"}</p>
        </div>
      )}

      {editing && (
        <input
          value={editCategory}
          onChange={(e) => setEditCategory(e.target.value)}
          placeholder="Категория"
          className="w-full rounded-md border border-hairline bg-graphite-raised px-3 py-2 text-sm text-bone placeholder:text-slate-dim outline-none focus:border-signal-dim"
        />
      )}

      <div className="flex gap-2">
        <Button variant="secondary" className="w-9 shrink-0 px-0" onClick={onCancel} aria-label="Отменить">
          <X size={16} strokeWidth={1.5} />
        </Button>
        <Button
          variant="secondary"
          className="flex-1"
          onClick={() => setEditing(!editing)}
        >
          <Pencil size={14} strokeWidth={1.5} />
          {editing ? "Готово" : "Изменить"}
        </Button>
        <Button variant="primary" className="flex-1" onClick={onSave} disabled={saving || (lowConfidence && !editCategory)}>
          {saving ? "Сохраняем…" : "Сохранить"}
        </Button>
      </div>
    </div>
  );
}
