import { useState } from "react";
import { KeyRound } from "lucide-react";
import { Sheet } from "./Sheet";
import { Button } from "./ui";
import { createSecret } from "../lib/api";
import { useToastStore } from "../state/toast";
import { hapticNotify } from "../lib/telegram";

export function AddSecretSheet({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [category, setCategory] = useState("");
  const [busy, setBusy] = useState(false);
  const push = useToastStore((s) => s.push);

  const reset = () => {
    setName("");
    setUsername("");
    setPassword("");
    setCategory("");
  };

  const submit = async () => {
    if (!name || !password) {
      push("Укажите название и пароль", "error");
      return;
    }
    setBusy(true);
    try {
      await createSecret({ name, username: username || undefined, password, category: category || undefined });
      hapticNotify("success");
      push("Сохранено в Сейф", "success");
      reset();
      onCreated();
      onClose();
    } catch (err) {
      push(err instanceof Error && err.message === "secrets_limit_reached" ? "Достигнут лимит секретов на вашем плане" : "Не удалось сохранить", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Новый секрет">
      <div className="space-y-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Название (например GitHub)"
          className="w-full rounded-md border border-vault-border bg-vault-surface px-3 py-2.5 text-sm text-bone placeholder:text-slate-dim outline-none focus:border-signal-dim"
        />
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Логин / email"
          className="w-full rounded-md border border-vault-border bg-vault-surface px-3 py-2.5 text-sm text-bone placeholder:text-slate-dim outline-none focus:border-signal-dim"
        />
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Пароль"
          type="password"
          className="w-full rounded-md border border-vault-border bg-vault-surface px-3 py-2.5 text-sm text-bone placeholder:text-slate-dim outline-none focus:border-signal-dim"
        />
        <input
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="Категория (необязательно)"
          className="w-full rounded-md border border-vault-border bg-vault-surface px-3 py-2.5 text-sm text-bone placeholder:text-slate-dim outline-none focus:border-signal-dim"
        />
        <Button variant="signal" onClick={submit} disabled={busy} className="w-full">
          <KeyRound size={14} strokeWidth={1.5} />
          Сохранить безопасно
        </Button>
      </div>
    </Sheet>
  );
}
