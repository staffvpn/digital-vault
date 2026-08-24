// Minimal HS256 JWT-alike session token. Deliberately dependency-free (Web
// Crypto only) so it deploys reliably in the edge sandbox. Not a general
// JWT implementation — just enough for our own client<->function sessions.

function base64url(input: Uint8Array): string {
  const str = btoa(String.fromCharCode(...input));
  return str.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlDecode(input: string): Uint8Array {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const withPad = padded + "=".repeat((4 - (padded.length % 4)) % 4);
  const str = atob(withPad);
  return Uint8Array.from(str, (c) => c.charCodeAt(0));
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function createSessionToken(
  payload: Record<string, unknown>,
  secret: string,
  ttlSeconds = 3600,
): Promise<string> {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + ttlSeconds };
  const encHeader = base64url(new TextEncoder().encode(JSON.stringify(header)));
  const encBody = base64url(new TextEncoder().encode(JSON.stringify(body)));
  const signingInput = `${encHeader}.${encBody}`;
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${base64url(new Uint8Array(sig))}`;
}

export async function verifySessionToken(
  token: string,
  secret: string,
): Promise<Record<string, any> | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [encHeader, encBody, encSig] = parts;
  const key = await hmacKey(secret);
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    base64urlDecode(encSig),
    new TextEncoder().encode(`${encHeader}.${encBody}`),
  );
  if (!valid) return null;
  const payload = JSON.parse(new TextDecoder().decode(base64urlDecode(encBody)));
  if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) return null;
  return payload;
}
