// Best-effort field extraction for text the server already flagged as a
// likely credential (classify-item's local heuristic, never the AI) —
// shared by every zero-confirmation capture entry point (CaptureZone,
// NoteComposer, …) so a pasted login/password always lands in the Vault
// the same way no matter where it was typed.

export function guessCredentialFields(text: string) {
  const password = text.match(/password\s*[:=]\s*(\S+)/i)?.[1];
  const username = text.match(/(?:username|login|email)\s*[:=]\s*(\S+)/i)?.[1];
  return { password, username };
}

// Best-effort name for an auto-saved secret when the pasted text has no
// explicit "name:" field — a nearby URL's domain is the strongest signal
// ("github.com ... password: hunter2" -> "github.com").
export function guessSecretName(text: string): string {
  const url = text.match(/https?:\/\/[^\s]+/i)?.[0];
  if (url) {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      /* fall through */
    }
  }
  const firstLine = text
    .split(/\r?\n/)
    .find((l) => l.trim().length > 0 && l.trim().length < 60 && !/password|пароль/i.test(l));
  if (firstLine) return firstLine.trim();
  return `Секрет · ${new Date().toLocaleDateString("ru-RU")}`;
}
