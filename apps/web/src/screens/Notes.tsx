import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { StickyNote, ArrowUp, ChevronDown, Trash2 } from "lucide-react";
import clsx from "clsx";
import { Header } from "../components/Header";
import { BottomNav } from "../components/BottomNav";
import { Card, EmptyState, ErrorState, Skeleton, Tag } from "../components/ui";
import { classifyContent, createItem, createSecret, deleteItem, listItems } from "../lib/api";
import { relativeDate } from "../lib/format";
import { guessCredentialFields, guessSecretName } from "../lib/credentialGuess";
import { hapticNotify } from "../lib/telegram";
import { useToastStore } from "../state/toast";
import type { VaultItem } from "../types";

export function NotesScreen() {
  const queryClient = useQueryClient();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["items", "note"],
    queryFn: () => listItems({ type: "note" }),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["items"] });

  return (
    <div className="mx-auto min-h-screen max-w-md pb-24">
      <Header title="Заметки" eyebrow="Библиотека" back />
      <main className="space-y-4 px-4 pt-4">
        <NoteComposer onSaved={invalidate} />

        {isLoading && (
          <Card className="divide-y divide-hairline p-0">
            {[0, 1].map((i) => (
              <div key={i} className="space-y-2 px-4 py-3">
                <Skeleton className="h-3.5 w-3/4" />
                <Skeleton className="h-3 w-1/4" />
              </div>
            ))}
          </Card>
        )}
        {isError && (
          <Card>
            <ErrorState title="Не удалось загрузить" onRetry={() => refetch()} />
          </Card>
        )}
        {!isLoading && !isError && data?.length === 0 && (
          <Card>
            <EmptyState icon={<StickyNote size={22} strokeWidth={1.5} />} title="Пока пусто" description="Ваши заметки появятся здесь." />
          </Card>
        )}
        {!isLoading && !isError && data && data.length > 0 && (
          <Card className="divide-y divide-hairline p-0">
            {data.map((item) => (
              <NoteRow key={item.id} item={item} onDeleted={invalidate} />
            ))}
          </Card>
        )}
      </main>
      <BottomNav />
    </div>
  );
}

// Same zero-confirmation philosophy as the main capture zone: type, hit the
// button (or Ctrl/Cmd+Enter), and it's filed — the AI gives it a real title
// and a short searchable description, while the full text (paragraphs
// intact) is kept verbatim in `body`, never truncated down to a summary.
function NoteComposer({ onSaved }: { onSaved: () => void }) {
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const push = useToastStore((s) => s.push);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [draft]);

  const submit = async () => {
    const text = draft.trim();
    if (!text || saving) return;
    setSaving(true);
    try {
      const { result } = await classifyContent({ kind: "text", content: text });

      if (result.type === "possible_credential") {
        const guess = guessCredentialFields(text);
        const name = guessSecretName(text);
        await createSecret({ name, username: guess.username || undefined, password: guess.password ?? text });
        hapticNotify("success");
        push("Похоже на пароль — сохранено в Сейф, не как заметка", "success");
      } else {
        const firstLine = text.split(/\r?\n/).find((l) => l.trim().length > 0);
        await createItem({
          type: "note",
          category: result.category ?? null,
          subcategory: result.subcategory ?? null,
          title: result.title ?? firstLine?.slice(0, 60) ?? "Заметка",
          description: result.description ?? null,
          body: text,
          status: "saved",
          confidence: result.confidence,
        });
        hapticNotify("success");
      }
      setDraft("");
      onSaved();
    } catch {
      push("Не удалось сохранить заметку", "error");
    } finally {
      setSaving(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="rounded-lg border border-hairline bg-graphite transition-colors focus-within:border-signal-dim/70">
      <div className="flex items-end gap-2 p-3">
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Быстро записать мысль…"
          rows={1}
          disabled={saving}
          className="max-h-[220px] flex-1 resize-none bg-transparent px-1 py-1.5 text-sm leading-relaxed text-bone placeholder:text-slate-dim outline-none"
        />
        <button
          onClick={submit}
          disabled={!draft.trim() || saving}
          aria-label="Сохранить заметку"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-signal text-void shadow-[0_0_14px_rgba(79,182,214,0.4)] transition-all duration-150 hover:brightness-110 active:scale-90 disabled:opacity-30 disabled:shadow-none"
        >
          {saving ? (
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-void/40 border-t-void" />
          ) : (
            <ArrowUp size={16} strokeWidth={2.25} />
          )}
        </button>
      </div>
      {draft.trim().length > 0 && (
        <p className="px-4 pb-2 text-[10px] text-slate-dim">Enter — новая строка · Ctrl+Enter — сохранить</p>
      )}
    </div>
  );
}

// Tap to unfold in place and read the whole thing, paragraphs intact — no
// bottom sheet, no category picker, nothing that isn't reading or deleting.
function NoteRow({ item, onDeleted }: { item: VaultItem; onDeleted: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const push = useToastStore((s) => s.push);

  const remove = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (deleting) return;
    setDeleting(true);
    try {
      await deleteItem(item.id);
      push("Удалено", "success");
      onDeleted();
    } catch {
      push("Не удалось удалить", "error");
      setDeleting(false);
    }
  };

  const preview = item.description || item.body || "";
  const fullText = item.body || item.description || "";

  return (
    <div className="px-4 py-3">
      <button onClick={() => setExpanded((v) => !v)} className="flex w-full items-start gap-2 text-left">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="truncate text-sm font-medium text-bone">{item.title || "Заметка"}</p>
          {!expanded && preview && <p className="line-clamp-2 text-xs text-slate">{preview}</p>}
          <p className="font-mono text-[11px] text-slate-dim">{relativeDate(item.created_at)}</p>
        </div>
        <ChevronDown
          size={14}
          strokeWidth={1.5}
          className={clsx("mt-1 shrink-0 text-slate-dim transition-transform duration-200", expanded && "rotate-180")}
        />
      </button>

      {expanded && (
        <div className="mt-2.5 space-y-2.5 border-t border-hairline pt-2.5">
          {fullText && <p className="whitespace-pre-wrap text-sm leading-relaxed text-bone">{fullText}</p>}
          <div className="flex items-center justify-between">
            {item.category ? <Tag>{item.category}</Tag> : <span />}
            <button
              onClick={remove}
              disabled={deleting}
              className="inline-flex items-center gap-1.5 text-xs text-slate-dim transition-colors hover:text-ember disabled:opacity-50"
            >
              <Trash2 size={12} strokeWidth={1.5} />
              {deleting ? "Удаляем…" : "Удалить"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
