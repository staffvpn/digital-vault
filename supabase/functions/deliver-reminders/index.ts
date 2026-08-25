import { handleOptions, json } from "./_shared/cors.ts";
import { supabaseAdmin } from "./_shared/supabaseAdmin.ts";

// Triggered every 5 minutes by pg_cron (see migrations/0005) via pg_net —
// never called by a user session, so it authenticates with its own shared
// secret instead of requireSession, same fail-closed pattern as
// payment-webhook.
Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const expectedSecret = Deno.env.get("CRON_SECRET");
  const providedSecret = req.headers.get("x-cron-secret");
  if (!expectedSecret || providedSecret !== expectedSecret) {
    return json({ error: "unauthorized" }, 401);
  }

  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!botToken) return json({ error: "server_not_configured" }, 500);

  const supabase = supabaseAdmin();
  const nowIso = new Date().toISOString();

  const { data: due, error } = await supabase
    .from("items")
    .select("id, title, description, remind_at, remind_notify_1, remind_notify_2, remind_notified_stage1, remind_notified_stage2, user_id")
    .eq("type", "reminder")
    .eq("reminder_done", false)
    .or(
      `and(remind_notify_1.lte.${nowIso},remind_notified_stage1.eq.false),` +
        `and(remind_notify_2.lte.${nowIso},remind_notified_stage2.eq.false)`,
    );

  if (error) return json({ error: error.message }, 500);
  if (!due?.length) return json({ ok: true, sent: 0 });

  const userIds = [...new Set(due.map((d) => d.user_id))];
  const { data: profiles } = await supabase.from("profiles").select("id, telegram_id").in("id", userIds);
  const telegramIdByUser = Object.fromEntries((profiles ?? []).map((p) => [p.id, p.telegram_id]));

  let sent = 0;
  for (const item of due) {
    const chatId = telegramIdByUser[item.user_id];
    if (!chatId) continue;

    const dueDate = item.remind_at
      ? new Date(item.remind_at).toLocaleString("ru-RU", {
          timeZone: "Europe/Moscow",
          day: "numeric",
          month: "long",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "";

    const isFirstStage = item.remind_notify_1 && new Date(item.remind_notify_1) <= new Date() && !item.remind_notified_stage1;
    const label = isFirstStage ? "Скоро" : "Сейчас";
    const text = `⏰ ${label}: ${item.title ?? "Напоминание"}${dueDate ? `\nСрок: ${dueDate} (МСК)` : ""}${item.description ? `\n${item.description}` : ""}`;

    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });

    if (res.ok) {
      sent += 1;
      const updates: Record<string, boolean> = {};
      if (isFirstStage) updates.remind_notified_stage1 = true;
      else updates.remind_notified_stage2 = true;
      await supabase.from("items").update(updates).eq("id", item.id);
    }
  }

  return json({ ok: true, sent, checked: due.length });
});
