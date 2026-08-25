-- Referral system + payment scaffolding + custom-plan bonus support.
--
-- Design notes (see also apps/web/src/screens/Info.tsx for the
-- user-facing explanation of this logic):
--   * A referral bonus is only ever granted for a QUALIFIED purchase —
--     never for registration alone. See fn_qualify_referral().
--   * profiles.referred_by is set exactly once, only at account creation
--     (auth-telegram), from Telegram's own signed start_param — never via
--     a separate authenticated "attach referral" endpoint, and a trigger
--     below makes it immutable at the DB level regardless.
--   * All referral tuning knobs (reward size, bonus cap, abuse-velocity
--     limit) live in app_config so they can change without a redeploy.

-- ---------------------------------------------------------------------
-- Tunable config
-- ---------------------------------------------------------------------
create table app_config (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
insert into app_config (key, value) values
  ('referral_reward_secrets', '2'),        -- secret slots granted per qualified referral
  ('referral_max_bonus_secrets', '20'),    -- lifetime cap on bonus slots per referrer
  ('referral_velocity_limit_per_day', '5'); -- qualified referrals/24h before auto-review

alter table app_config enable row level security;
revoke all on app_config from anon, authenticated;

-- ---------------------------------------------------------------------
-- profiles: referral code (own link), referred_by (who invited them),
-- secrets_bonus (extra Vault slots earned from qualified referrals)
-- ---------------------------------------------------------------------
create or replace function fn_generate_referral_code() returns text as $$
declare
  v_code text;
begin
  loop
    v_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
    exit when not exists (select 1 from profiles where referral_code = v_code);
  end loop;
  return v_code;
end;
$$ language plpgsql;

alter table profiles add column referral_code text unique;
update profiles set referral_code = fn_generate_referral_code() where referral_code is null;
alter table profiles alter column referral_code set not null;
alter table profiles alter column referral_code set default fn_generate_referral_code();

alter table profiles add column referred_by uuid references profiles(id);
alter table profiles add column secrets_bonus int not null default 0;

-- referred_by may only be set once — enforced at the DB level as
-- defense in depth even though no API path allows changing it either.
create or replace function fn_prevent_referred_by_change() returns trigger as $$
begin
  if old.referred_by is not null and new.referred_by is distinct from old.referred_by then
    raise exception 'referred_by is immutable once set';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger profiles_referred_by_immutable
  before update on profiles
  for each row execute function fn_prevent_referred_by_change();

-- ---------------------------------------------------------------------
-- referrals: one row per (referrer, referred) pair — the state machine
-- ---------------------------------------------------------------------
create type referral_status as enum (
  'registered', 'payment_pending', 'paid', 'qualified', 'rewarded', 'refunded', 'blocked'
);

create table referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references profiles(id) on delete cascade,
  referred_id uuid not null unique references profiles(id) on delete cascade,
  code_used text not null,
  status referral_status not null default 'registered',
  plan_purchased plan_type,
  reward_amount int not null default 0,
  blocked_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  qualified_at timestamptz,
  rewarded_at timestamptz
);
create index referrals_referrer_idx on referrals(referrer_id);
create index referrals_status_idx on referrals(status);

create trigger referrals_set_updated_at before update on referrals
  for each row execute function set_updated_at();

alter table referrals enable row level security;
revoke all on referrals from anon, authenticated;

-- ---------------------------------------------------------------------
-- payments: minimal ledger the future payment-provider webhook writes to.
-- Not connected to a live provider yet — see payment-webhook function.
-- ---------------------------------------------------------------------
create type payment_status as enum ('pending', 'succeeded', 'failed', 'refunded');

create table payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  plan plan_type not null,
  amount_rub int not null,
  status payment_status not null default 'pending',
  provider text not null default 'platega',
  provider_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index payments_user_idx on payments(user_id);
create index payments_provider_ref_idx on payments(provider_ref);

create trigger payments_set_updated_at before update on payments
  for each row execute function set_updated_at();

alter table payments enable row level security;
revoke all on payments from anon, authenticated;

-- ---------------------------------------------------------------------
-- fn_attach_referrer: called once, at account creation, if the user
-- opened the app via a signed Telegram start_param that matches a real
-- referral code. Never callable again for that account afterwards.
-- ---------------------------------------------------------------------
create or replace function fn_attach_referrer(p_new_user_id uuid, p_code text)
returns void language plpgsql as $$
declare
  v_referrer_id uuid;
begin
  if p_code is null or length(trim(p_code)) = 0 then
    return;
  end if;

  select id into v_referrer_id from profiles where referral_code = upper(trim(p_code));
  if v_referrer_id is null or v_referrer_id = p_new_user_id then
    return; -- unknown code, or a (structurally impossible) self-referral
  end if;

  update profiles set referred_by = v_referrer_id
    where id = p_new_user_id and referred_by is null;

  insert into referrals (referrer_id, referred_id, code_used, status)
  values (v_referrer_id, p_new_user_id, upper(trim(p_code)), 'registered')
  on conflict (referred_id) do nothing;
end;
$$;

-- ---------------------------------------------------------------------
-- fn_qualify_referral: called by the payment webhook once a purchase by
-- the referred user is confirmed. Applies the abuse checks and, if they
-- pass, grants the reward atomically.
-- ---------------------------------------------------------------------
create or replace function fn_qualify_referral(p_referred_id uuid, p_plan plan_type)
returns void language plpgsql as $$
declare
  v_referral referrals%rowtype;
  v_reward int;
  v_max int;
  v_velocity_limit int;
  v_recent_count int;
  v_current_bonus int;
  v_new_bonus int;
begin
  select * into v_referral from referrals
    where referred_id = p_referred_id and status in ('registered', 'payment_pending', 'paid')
    for update;
  if not found then
    return; -- not referred, or this referral was already resolved/blocked
  end if;

  if v_referral.referrer_id = p_referred_id then
    update referrals set status = 'blocked', blocked_reason = 'self_referral', updated_at = now()
      where id = v_referral.id;
    return;
  end if;

  select (value #>> '{}')::int into v_reward from app_config where key = 'referral_reward_secrets';
  select (value #>> '{}')::int into v_max from app_config where key = 'referral_max_bonus_secrets';
  select (value #>> '{}')::int into v_velocity_limit from app_config where key = 'referral_velocity_limit_per_day';
  v_reward := coalesce(v_reward, 2);
  v_max := coalesce(v_max, 20);
  v_velocity_limit := coalesce(v_velocity_limit, 5);

  -- Lightweight abuse heuristic: too many qualifying referrals from the
  -- same referrer in 24h goes to manual review instead of auto-rewarding.
  -- This is deliberately simple (no device/IP fingerprinting is available
  -- in this stack) — it catches obvious bulk abuse, not a determined actor.
  select count(*) into v_recent_count from referrals
    where referrer_id = v_referral.referrer_id
      and status in ('qualified', 'rewarded')
      and qualified_at > now() - interval '24 hours';

  if v_recent_count >= v_velocity_limit then
    update referrals set status = 'blocked', blocked_reason = 'velocity_limit', updated_at = now()
      where id = v_referral.id;
    return;
  end if;

  select secrets_bonus into v_current_bonus from profiles where id = v_referral.referrer_id for update;
  v_new_bonus := least(coalesce(v_current_bonus, 0) + v_reward, v_max);

  update profiles set secrets_bonus = v_new_bonus where id = v_referral.referrer_id;

  update referrals set
    status = 'rewarded',
    plan_purchased = p_plan,
    reward_amount = v_new_bonus - coalesce(v_current_bonus, 0),
    qualified_at = now(),
    rewarded_at = now(),
    updated_at = now()
  where id = v_referral.id;
end;
$$;

-- ---------------------------------------------------------------------
-- fn_reverse_referral: called on a confirmed refund of the qualifying
-- purchase. Claws back exactly the bonus that purchase granted.
-- ---------------------------------------------------------------------
create or replace function fn_reverse_referral(p_referred_id uuid)
returns void language plpgsql as $$
declare
  v_referral referrals%rowtype;
begin
  select * into v_referral from referrals
    where referred_id = p_referred_id and status = 'rewarded'
    for update;
  if not found then
    return;
  end if;

  update profiles set secrets_bonus = greatest(0, secrets_bonus - v_referral.reward_amount)
    where id = v_referral.referrer_id;

  update referrals set status = 'refunded', reward_amount = 0, updated_at = now()
    where id = v_referral.id;
end;
$$;
