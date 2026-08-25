-- Reminders: a new item type the AI can extract from free text ("напомни
-- обновить токен 23 сентября"), delivered as real Telegram notifications by
-- a scheduled job — not just another category that sits there unread.
--
-- Two notifications per reminder:
--   * date-only ("23 сентября")      -> 2 days before at 12:00 MSK, and the
--                                       day itself at 12:00 MSK.
--   * has a specific time ("в 18:00")-> 1 hour before, and at the exact time.
-- Both instants are computed once, server-side, in classify-item (see
-- supabase/functions/classify-item) and stored directly — the delivery job
-- just compares them to now(), it does no date arithmetic itself.

alter type item_type add value if not exists 'reminder';
