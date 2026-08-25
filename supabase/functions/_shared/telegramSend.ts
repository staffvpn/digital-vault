// Thin wrapper over the Telegram Bot API — used by telegram-webhook to
// reply with a confirmation after saving something forwarded to the bot.

export async function sendTelegramMessage(
  botToken: string,
  chatId: number,
  text: string,
): Promise<{ ok: boolean; messageId: number | null }> {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  const data = await res.json().catch(() => null);
  return { ok: res.ok, messageId: data?.result?.message_id ?? null };
}
