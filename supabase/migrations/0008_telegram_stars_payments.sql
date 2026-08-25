-- Telegram Stars as a second payment method alongside the existing (still
-- stubbed) Platega.io flow. Stars need no external merchant account —
-- Telegram itself is the payment provider (currency "XTR"), settled via
-- Bot API createInvoiceLink + the pre_checkout_query / successful_payment
-- webhook handshake in telegram-webhook. See create-stars-invoice.

alter table plans add column price_stars int not null default 0;

-- Rate used to derive these from the existing ruble prices: ~1 XTR ≈ 1.5 ₽,
-- rounded to a clean number. Free stays 0 (not purchasable either way).
update plans set price_stars = 165 where id = 'pro';       -- was 249₽
update plans set price_stars = 300 where id = 'pro_plus';  -- was 449₽

-- Ledger gets a stars amount alongside the existing rub amount; 'provider'
-- was already free-form text (default 'platega') so 'telegram_stars' is
-- just a new value, no enum change needed.
alter table payments add column amount_stars int;
