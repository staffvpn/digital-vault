import { useState } from "react";
import { Copy, Eye, EyeOff, Trash2, Check } from "lucide-react";
import { Sheet } from "./Sheet";
import { Button, Tag } from "./ui";
import { deleteSecret, revealSecret } from "../lib/api";
import { useToastStore } from "../state/toast";
import { haptic } from "../lib/telegram";
import type { SecretSummary } from "../types";

export function SecretDetailSheet({
  secret,
  open,
  onClose,
  onChanged,
}: {
  secret: SecretSummary | null;
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [revealed, setRevealed] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);
  const push = useToastStore((s) => s.push);

  if (!secret) return null;

  const toggleReveal = async () => {
    if (revealed) {
      setRevealed(null);
      return;
    }
    setRevealing(true);
    try {
      const password = await revealSecret(secret.id);
      setRevealed(password);
      haptic("medium");
    } catch {
      push("Не удалось показать секрет", "error");
    } finally {
      setRevealing(false);
    }
  };

  const copy = async (value: string, label: string) => {
    await navigator.clipboard.writeText(value);
    push(`${label} скопирован`, "success");
    haptic("light");
  };

  const copyPassword = async () => {
    const password = revealed ?? (await revealSecret(secret.id).catch(() => null));
    if (!password) {
      push("Не удалось скопировать пароль", "error");
      return;
    }
    await copy(password, "Пароль");
  };

  const remove = async () => {
    try {
      await deleteSecret(secret.id);
      push("Удалено", "success");
      onChanged();
      onClose();
    } catch {
      push("Не удалось удалить", "error");
    }
  };

  const close = () => {
    setRevealed(null);
    onClose();
  };

  return (
    <Sheet open={open} onClose={close} title={secret.name}>
      <div className="space-y-4">
        {secret.category && (
          <div className="flex flex-wrap gap-1.5">
            <Tag>{secret.category}</Tag>
            {secret.tags.map((t) => (
              <Tag key={t}>#{t}</Tag>
            ))}
          </div>
        )}

        {secret.username && (
          <div className="space-y-1.5">
            <label className="text-[10px] font-medium uppercase tracking-wider text-slate-dim">Логин</label>
            <div className="flex items-center gap-2 rounded-md border border-vault-border bg-vault-surface px-3 py-2.5">
              <span className="flex-1 truncate text-sm text-bone font-mono">{secret.username}</span>
              <button onClick={() => copy(secret.username!, "Логин")} className="text-slate-dim hover:text-bone">
                <Copy size={14} strokeWidth={1.5} />
              </button>
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <label className="text-[10px] font-medium uppercase tracking-wider text-slate-dim">Пароль</label>
          <div className="flex items-center gap-2 rounded-md border border-vault-border bg-vault-surface px-3 py-2.5">
            <span className="flex-1 truncate font-mono text-sm text-bone">
              {revealed ? revealed : "••••••••••••"}
            </span>
            <button onClick={toggleReveal} disabled={revealing} className="text-slate-dim hover:text-bone">
              {revealed ? <EyeOff size={14} strokeWidth={1.5} /> : <Eye size={14} strokeWidth={1.5} />}
            </button>
            <button onClick={copyPassword} className="text-slate-dim hover:text-bone">
              <Copy size={14} strokeWidth={1.5} />
            </button>
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <Button variant="danger" onClick={remove} className="shrink-0">
            <Trash2 size={14} strokeWidth={1.5} />
          </Button>
          <Button variant="secondary" onClick={close} className="flex-1">
            <Check size={14} strokeWidth={1.5} />
            Готово
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
