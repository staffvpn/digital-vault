-- Reminder scheduling data + the cron job that triggers delivery.
-- See deliver-reminders Edge Function for the actual Telegram send.

alter table items add column remind_at timestamptz;
alter table items add column remind_has_time boolean not null default false;
alter table items add column remind_notify_1 timestamptz;
alter table items add column remind_notify_2 timestamptz;
alter table items add column remind_notified_stage1 boolean not null default false;
alter table items add column remind_notified_stage2 boolean not null default false;
alter table items add column reminder_done boolean not null default false;

create index items_reminder_due_idx on items(type, reminder_done)
  where type = 'reminder' and reminder_done = false;

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Runs every 5 minutes. The secret here must match the deliver-reminders
-- Edge Function's CRON_SECRET env var (Supabase Dashboard -> Edge
-- Functions -> Secrets) — this is the one thing that can't be set through
-- migrations/MCP and needs a one-time manual step.
select cron.schedule(
  'deliver-reminders-every-5-min',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://etvnsrvenbsqxhosmuhw.supabase.co/functions/v1/deliver-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json', 'X-Cron-Secret', 'b8b1a13ced45df526ef6606905115d6cb7858e83e6d6ed76'),
    body := '{}'::jsonb
  );
  $$
);
