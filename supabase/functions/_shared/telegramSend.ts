// Thin wrappers over the Telegram Bot API — used by telegram-webhook (reply
// confirmations) and pinnedWidget (the recent-saves digest).

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

export async function editTelegramMessage(
  botToken: string,
  chatId: number,
  messageId: number,
  text: string,
): Promise<boolean> {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/editMessageText`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId, text }),
  });
  return res.ok;
}

export async function pinTelegramMessage(botToken: string, chatId: number, messageId: number): Promise<void> {
  await fetch(`https://api.telegram.org/bot${botToken}/pinChatMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId, disable_notification: true }),
  });
}
