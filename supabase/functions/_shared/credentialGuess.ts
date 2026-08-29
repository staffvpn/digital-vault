// Deno-side mirror of apps/web/src/lib/credentialGuess.ts — kept as a
// direct copy rather than a shared package (the web app and edge functions
// are separate runtimes/build systems) so the bot auto-saves a pasted
// login/password to the Vault exactly the same way the Mini App already
// does: local pattern matching only, never through the AI.

export function guessCredentialFields(text: string): { password?: string; username?: string } {
  const password = text.match(/password\s*[:=]\s*(\S+)/i)?.[1];
  const username = text.match(/(?:username|login|email)\s*[:=]\s*(\S+)/i)?.[1];
  return { password, username };
}

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
