// Shared zero-confirmation "classify this text and file it" pipeline —
// used by the voice-capture sheet (and mirrors what CaptureZone does for
// pasted text). One text in, one saved thing out, no prompts in between.
import { classifyContent, createItem, createSecret } from "./api";
import { guessCredentialFields, guessSecretName } from "./credentialGuess";
import type { ClassifyResult, ItemType } from "../types";

export interface AutoSaveFlash {
  title: string;
  sub: string;
  tone: "success" | "secret" | "duplicate";
}

export function isUrl(text: string): boolean {
  try {
    const u = new URL(text.trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export async function classifyAndSaveText(raw: string): Promise<AutoSaveFlash> {
  const trimmed = raw.trim();
  const kind: "url" | "text" = isUrl(trimmed) ? "url" : "text";
  const { result, linkMeta, existingItem } = await classifyContent({ kind, content: trimmed });
  const meta = linkMeta as { title: string | null; description: string | null; image: string | null; domain: string | null } | undefined;

  if (result.type === "duplicate") {
    return { title: existingItem?.title ?? "Уже сохранено", sub: "Уже есть в коллекции", tone: "duplicate" };
  }

  if (result.type === "possible_credential") {
    const guess = guessCredentialFields(trimmed);
    const name = guessSecretName(trimmed);
    await createSecret({ name, username: guess.username || undefined, password: guess.password ?? trimmed });
    return { title: name, sub: "В Сейфе · не отправлялось в AI", tone: "secret" };
  }

  const title = result.title ?? meta?.title ?? (kind === "text" ? trimmed.slice(0, 80) : null);
  const description = result.description ?? meta?.description ?? null;
  const body = kind === "text" ? trimmed : null;

  await createItem({
    type: (result.type as ItemType) ?? "text",
    category: result.category ?? null,
    subcategory: result.subcategory ?? null,
    title,
    description,
    body,
    source_url: kind === "url" ? trimmed : null,
    source_domain: meta?.domain ?? null,
    preview_url: meta?.image ?? null,
    status: "saved",
    confidence: result.confidence,
    remind_at: result.remind_at ?? null,
    remind_has_time: result.remind_has_time ?? false,
    remind_notify_1: result.remind_notify_1 ?? null,
    remind_notify_2: result.remind_notify_2 ?? null,
  } as Partial<import("../types").VaultItem>);

  const sub =
    result.type === "reminder" && result.remind_at
      ? `Напоминание · ${new Date(result.remind_at).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}`
      : result.category ?? "Разобрано и сохранено";

  return { title: title || "Сохранено", sub, tone: "success" };
}

export type { ClassifyResult };
