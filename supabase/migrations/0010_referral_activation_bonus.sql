-- Activation reward: a small bonus for BOTH sides of a referral the moment
-- the referred person makes their first real save — not just for signing
-- up (registration is free to fake) and not gated behind a purchase (the
-- existing fn_qualify_referral reward, unchanged, still only fires once the
-- referred person actually pays for Pro/Premium).
--
-- Deliberately kept economically small and bounded:
--   * Same lifetime cap (referral_max_bonus_secrets, 20) as the paid
--     reward — both write to the same profiles.secrets_bonus column under
--     a row lock, so the two rewards can never together exceed 20 per
--     referrer, no matter how many friends "activate" vs. actually pay.
--   * Its own, tighter velocity limit — an activation only costs the
--     referred person one real AI-classified save (which itself consumes
--     their own monthly AI allowance), so it's cheaper to fake at volume
--     than a real purchase and gets a stricter 24h gate.
--   * Fires at most once per referral row (activated_at is the guard),
--     regardless of how many items get created afterwards.

alter table referrals add column activated_at timestamptz;
alter table referrals add column activation_reward_amount int not null default 0;

insert into app_config (key, value) values
  ('referral_activation_reward_secrets', '1'),
  ('referral_activation_velocity_limit_per_day', '3')
on conflict (key) do nothing;

create or replace function fn_activate_referral(p_referred_id uuid)
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
    where referred_id = p_referred_id and activated_at is null
    for update;
  if not found then
    return; -- not referred, or activation already resolved for this referral
  end if;

  -- Unreachable by construction (fn_attach_referrer never lets referred_by
  -- equal the new user's own id) — kept anyway as defense in depth, same
  -- posture as fn_qualify_referral's identical check.
  if v_referral.referrer_id = p_referred_id then
    update referrals set activated_at = now() where id = v_referral.id;
    return;
  end if;

  select (value #>> '{}')::int into v_reward from app_config where key = 'referral_activation_reward_secrets';
  select (value #>> '{}')::int into v_max from app_config where key = 'referral_max_bonus_secrets';
  select (value #>> '{}')::int into v_velocity_limit from app_config where key = 'referral_activation_velocity_limit_per_day';
  v_reward := coalesce(v_reward, 1);
  v_max := coalesce(v_max, 20);
  v_velocity_limit := coalesce(v_velocity_limit, 3);

  select count(*) into v_recent_count from referrals
    where referrer_id = v_referral.referrer_id
      and activated_at > now() - interval '24 hours';
  if v_recent_count >= v_velocity_limit then
    -- Mark resolved (never retried) but grant nothing — same "slow the
    -- burst down, don't just silently allow it" posture as the paid path.
    update referrals set activated_at = now(), activation_reward_amount = 0 where id = v_referral.id;
    return;
  end if;

  select secrets_bonus into v_current_bonus from profiles where id = v_referral.referrer_id for update;
  v_new_bonus := least(coalesce(v_current_bonus, 0) + v_reward, v_max);
  update profiles set secrets_bonus = v_new_bonus where id = v_referral.referrer_id;

  -- The referred person gets the same small welcome bonus, once — for
  -- actually using the product, not for the act of signing up.
  update profiles set secrets_bonus = least(secrets_bonus + v_reward, v_max) where id = p_referred_id;

  update referrals set
    activated_at = now(),
    activation_reward_amount = v_new_bonus - coalesce(v_current_bonus, 0)
  where id = v_referral.id;
end;
$$;
