-- "Свой тариф" becomes purchasable (via Telegram Stars, same as Pro/
-- Premium) instead of only ever showing a "скоро" stub. It's an override
-- layer on top of the preset plan model, not a new plan_type enum value:
-- profiles.custom_plan holds the purchased numbers/features and, when
-- set, takes over from the profiles.plan lookup everywhere a limit or
-- feature gate is checked (see _shared/planLimits.ts). NULL means
-- "nothing purchased, use the preset plan as before".
alter table profiles add column custom_plan jsonb;

-- payments.plan was `not null` because only preset purchases existed.
-- Custom-plan purchases have no plan_type to record, so plan becomes
-- nullable and custom_plan carries the purchased selection instead --
-- exactly one of the two is ever set per payment row.
alter table payments alter column plan drop not null;
alter table payments add column custom_plan jsonb;
