// Pro/Premium perk: a pinned message in the chat with the bot that always
// shows the last 5 saved things, so the value is visible even without
// opening the Mini App. Edits the existing pin in place when possible;
// falls back to sending+pinning a fresh one (e.g. if the user unpinned it).
import { sendTelegramMessage, editTelegramMessage, pinTelegramMessage } from "./telegramSend.ts";

const TYPE_EMOJI: Record<string, string> = {
  link: "🔗",
  text: "📝",
  image: "🖼️",
  file: "📎",
  note: "🗒️",
  reminder: "⏰",
  service: "🧰",
  bookmark: "🔖",
  design_reference: "🎨",
};

export async function updatePinnedWidget(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  botToken: string,
  userId: string,
): Promise<void> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("telegram_id, plan, pinned_message_id")
    .eq("id", userId)
    .single();
  if (!profile || profile.plan === "free") return;

  const { data: items } = await supabase
    .from("items")
    .select("type, title, source_domain")
    .eq("user_id", userId)
    .eq("status", "saved")
    .order("created_at", { ascending: false })
    .limit(5);
  if (!items?.length) return;

  // deno-lint-ignore no-explicit-any
  const lines = items.map((i: any) => `${TYPE_EMOJI[i.type] ?? "•"} ${i.title || i.source_domain || "Без названия"}`);
  const text = `📌 Последние сохранения\n\n${lines.join("\n")}`;

  if (profile.pinned_message_id) {
    const edited = await editTelegramMessage(botToken, profile.telegram_id, profile.pinned_message_id, text);
    if (edited) return;
  }

  const sent = await sendTelegramMessage(botToken, profile.telegram_id, text);
  if (sent.ok && sent.messageId) {
    await pinTelegramMessage(botToken, profile.telegram_id, sent.messageId);
    await supabase.from("profiles").update({ pinned_message_id: sent.messageId }).eq("id", userId);
  }
}
