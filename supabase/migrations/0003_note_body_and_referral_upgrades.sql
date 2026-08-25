-- Two independent fixes bundled in one migration:
--
-- 1. Notes/text items were losing their full content: only a short
--    AI-written description (capped ~140 chars) or nothing at all was ever
--    persisted, so anything longer than the summary silently vanished. Adds
--    a real `body` column for the full, verbatim, paragraph-preserving text.
--
-- 2. Referral program upgrade: the invited person now gets a one-time 10%
--    discount on Pro/Premium (never on the custom plan), and the referrer's
--    reward now depends on which plan the invite bought (+2 secrets slots
--    for Pro, +4 for Premium) instead of a flat amount.

-- ---------------------------------------------------------------------
-- 1. Full note/text body
-- ---------------------------------------------------------------------
alter table items add column body text;

-- Search should find things by the actual words in a note, not just the
-- short AI summary.
drop index if exists items_search_idx;
create index items_search_idx on items using gin (
  to_tsvector('simple',
    coalesce(title,'') || ' ' || coalesce(description,'') || ' ' ||
    coalesce(body,'') || ' ' || coalesce(ocr_text,'')
  )
);

-- ---------------------------------------------------------------------
-- 2a. One-time referral discount for the invited person
-- ---------------------------------------------------------------------
alter table profiles add column referral_discount_used boolean not null default false;

-- Marks the invited person's one-time discount as spent. Returns whether a
-- discount was actually available to consume (false if they weren't
-- referred, or already used it) — a future real checkout should call this
-- when computing the charge amount, and payment-webhook calls it
-- defensively on a successful Pro/Premium payment either way.
create or replace function fn_consume_referral_discount(p_user_id uuid)
returns boolean language plpgsql as $$
declare
  v_referred_by uuid;
  v_used boolean;
begin
  select referred_by, referral_discount_used into v_referred_by, v_used
    from profiles where id = p_user_id for update;

  if v_referred_by is null or v_used then
    return false;
  end if;

  update profiles set referral_discount_used = true where id = p_user_id;
  return true;
end;
$$;

-- ---------------------------------------------------------------------
-- 2b. Plan-dependent referrer reward (was a flat amount)
-- ---------------------------------------------------------------------
delete from app_config where key = 'referral_reward_secrets';
insert into app_config (key, value) values
  ('referral_reward_secrets_pro', '2'),
  ('referral_reward_secrets_premium', '4')
on conflict (key) do nothing;

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
  v_reward_key text;
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

  v_reward_key := case when p_plan = 'pro_plus' then 'referral_reward_secrets_premium' else 'referral_reward_secrets_pro' end;
  select (value #>> '{}')::int into v_reward from app_config where key = v_reward_key;
  select (value #>> '{}')::int into v_max from app_config where key = 'referral_max_bonus_secrets';
  select (value #>> '{}')::int into v_velocity_limit from app_config where key = 'referral_velocity_limit_per_day';
  v_reward := coalesce(v_reward, case when p_plan = 'pro_plus' then 4 else 2 end);
  v_max := coalesce(v_max, 20);
  v_velocity_limit := coalesce(v_velocity_limit, 5);

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
