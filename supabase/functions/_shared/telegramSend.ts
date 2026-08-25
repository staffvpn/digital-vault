// Thin wrapper over the Telegram Bot API — used by telegram-webhook to
// reply with a confirmation after saving something forwarded to the bot,
// and to answer the Stars-payment handshake (pre_checkout_query).

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

// Telegram requires this within 10s of every pre_checkout_query or the
// payment is cancelled client-side — this is the last checkpoint before
// the user's Stars actually move, so it re-validates the pending payment
// row rather than trusting the invoice payload blindly.
export async function answerPreCheckoutQuery(
  botToken: string,
  preCheckoutQueryId: string,
  ok: boolean,
  errorMessage?: string,
): Promise<void> {
  await fetch(`https://api.telegram.org/bot${botToken}/answerPreCheckoutQuery`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ pre_checkout_query_id: preCheckoutQueryId, ok, error_message: errorMessage }),
  });
}
