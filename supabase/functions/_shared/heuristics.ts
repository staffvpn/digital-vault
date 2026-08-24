// Local, offline detection of likely credentials/secrets. Runs BEFORE any AI
// call so probable secrets never leave the server, let alone reach a
// third-party model.
const PATTERNS: RegExp[] = [
  /-----BEGIN [A-Z ]+PRIVATE KEY-----/,
  /\bsk-[A-Za-z0-9]{16,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bghp_[A-Za-z0-9]{20,}\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/,
  /\bpassword\s*[:=]\s*\S+/i,
  /\bapi[_-]?key\s*[:=]\s*\S+/i,
  /\bsecret[_-]?key\s*[:=]\s*\S+/i,
  /\btoken\s*[:=]\s*\S{10,}/i,
];

export function looksLikeCredential(text: string): boolean {
  if (!text) return false;
  return PATTERNS.some((re) => re.test(text));
}
