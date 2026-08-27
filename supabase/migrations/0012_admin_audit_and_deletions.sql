-- Support for a simple admin dashboard: an audit trail of deleted profiles
-- (there's no self-serve delete yet -- Info.tsx still says "email us" --
-- but whenever an account IS removed, manually or by a future self-serve
-- flow, this trigger captures who it was so the admin panel can show it).
-- Activity/revenue/referral stats are all derivable from existing tables
-- (usage_events, payments, referrals) -- nothing else new needed for those.

create table deleted_profiles (
  id uuid not null,
  telegram_id bigint not null,
  username text,
  first_name text,
  plan plan_type,
  custom_plan jsonb,
  created_at timestamptz,
  deleted_at timestamptz not null default now()
);
create index deleted_profiles_deleted_at_idx on deleted_profiles(deleted_at);

alter table deleted_profiles enable row level security;
revoke all on deleted_profiles from anon, authenticated;

create or replace function fn_log_deleted_profile() returns trigger as $$
begin
  insert into deleted_profiles (id, telegram_id, username, first_name, plan, custom_plan, created_at)
  values (old.id, old.telegram_id, old.username, old.first_name, old.plan, old.custom_plan, old.created_at);
  return old;
end;
$$ language plpgsql;

create trigger profiles_log_deletion before delete on profiles
  for each row execute function fn_log_deleted_profile();
