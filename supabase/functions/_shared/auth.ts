import { verifySessionToken } from "./session.ts";

export interface Session {
  userId: string;
  telegramId: number;
}

export async function requireSession(req: Request): Promise<Session | null> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const secret = Deno.env.get("SESSION_SECRET");
  if (!secret) return null;
  const payload = await verifySessionToken(token, secret);
  if (!payload || !payload.sub) return null;
  return { userId: payload.sub as string, telegramId: payload.telegram_id as number };
}
