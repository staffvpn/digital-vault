// Verifies Telegram WebApp `initData` per the official algorithm:
// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app

async function hmacSha256(key: Uint8Array | string, message: string): Promise<Uint8Array> {
  const keyBytes = typeof key === "string" ? new TextEncoder().encode(key) : key;
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(message));
  return new Uint8Array(sig);
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface TelegramUser {
  id: number;
  username?: string;
  first_name?: string;
  // Present when the Mini App was opened via a `t.me/<bot>?startapp=CODE`
  // deep link. This comes straight out of the HMAC-signed initData, so —
  // unlike a value the client could pass separately in a request body —
  // it can be trusted as genuinely what Telegram handed the user.
  startParam?: string;
}

export async function verifyInitData(
  initData: string,
  botToken: string,
  maxAgeSeconds = 86400,
): Promise<TelegramUser | null> {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");

  const pairs: string[] = [];
  for (const [key, value] of [...params.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    pairs.push(`${key}=${value}`);
  }
  const dataCheckString = pairs.join("\n");

  const secretKey = await hmacSha256("WebAppData", botToken);
  const computedHash = toHex(await hmacSha256(secretKey, dataCheckString));
  if (computedHash !== hash) return null;

  const authDate = Number(params.get("auth_date") ?? 0);
  if (!authDate || Date.now() / 1000 - authDate > maxAgeSeconds) return null;

  const userRaw = params.get("user");
  if (!userRaw) return null;
  try {
    const user = JSON.parse(userRaw) as TelegramUser;
    const startParam = params.get("start_param");
    if (startParam) user.startParam = startParam;
    return user;
  } catch {
    return null;
  }
}
