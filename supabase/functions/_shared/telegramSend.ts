// Thin wrapper over the Telegram Bot API — used by telegram-webhook to
// reply with a confirmation after saving something forwarded to the bot,
// and to answer the Stars-payment handshake (pre_checkout_query).

export interface InlineButton {
  text: string;
  url?: string;
  callback_data?: string;
}

export async function sendTelegramMessage(
  botToken: string,
  chatId: number,
  text: string,
  opts: { keyboard?: InlineButton[][]; parseMode?: "HTML" | "Markdown" } = {},
): Promise<{ ok: boolean; messageId: number | null }> {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: opts.parseMode,
      reply_markup: opts.keyboard ? { inline_keyboard: opts.keyboard } : undefined,
      link_preview_options: { is_disabled: true },
    }),
  });
  const data = await res.json().catch(() => null);
  return { ok: res.ok, messageId: data?.result?.message_id ?? null };
}

// Sends a document as an actual file attachment (multipart upload), not a
// chat message — used for the Privacy Policy / Terms of Use so /info
// delivers exactly two files, not a wall of chained text messages.
export async function sendTelegramDocument(
  botToken: string,
  chatId: number,
  filename: string,
  content: string,
  caption?: string,
): Promise<void> {
  const form = new FormData();
  form.append("chat_id", String(chatId));
  if (caption) form.append("caption", caption);
  form.append("document", new Blob([content], { type: "text/plain; charset=utf-8" }), filename);
  await fetch(`https://api.telegram.org/bot${botToken}/sendDocument`, {
    method: "POST",
    body: form,
  });
}

// Closes the little loading spinner Telegram shows on the tapped button —
// callback_query buttons stay "stuck" in that spinner until this is called,
// even though sending a reply message on its own already looks like a
// response. `text` (optional) pops a small transient toast instead of a
// full message, for a one-line acknowledgement.
export async function answerCallbackQuery(
  botToken: string,
  callbackQueryId: string,
  text?: string,
): Promise<void> {
  await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
  });
}

// The bot's own @username, needed to build t.me deep links from inside the
// webhook — fetched live rather than duplicated as a hardcoded constant or
// env var, since Telegram already knows it and it can never drift out of
// sync this way.
export async function getBotUsername(botToken: string): Promise<string | null> {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
  const data = await res.json().catch(() => null);
  return data?.result?.username ?? null;
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
