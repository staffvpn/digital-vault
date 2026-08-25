# NCHT Notion

Personal Digital Vault — Telegram Mini App для хранения и AI-организации
цифровых материалов. Полная концепция и архитектура: см.
`docs/superpowers/specs/2026-08-24-digital-vault-design.md`.

## Структура

- `apps/web` — React + TypeScript + Vite + Tailwind фронтенд (Mini App UI).
- `supabase/migrations` — схема Postgres (RLS deny-all, только через Edge Functions).
- `supabase/functions` — 9 Edge Functions: `auth-telegram`, `items-crud`,
  `secrets-crud`, `classify-item`, `link-metadata`, `files-upload`, `files-url`,
  `referrals`, `payment-webhook`.

Backend уже развёрнут в Supabase-проекте `digital-vault`
(`etvnsrvenbsqxhosmuhw`, регион eu-west-1, Free-тариф).

## Запуск фронтенда локально

```bash
cd apps/web
npm install
npm run dev
```

`.env.local` уже содержит публичные `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`
(это безопасные клиентские значения, не секреты).

Внутри обычного браузера (не Telegram) экран покажет «Откройте Vault через
Telegram» — это ожидаемо, initData можно получить только внутри Telegram. В
dev-режиме есть кнопка «Предпросмотр без Telegram» для визуальной проверки
экранов без реальной авторизации (данные не загрузятся — это нормально).

## Обязательные шаги перед реальным запуском

Ни один MCP-инструмент не даёт программно задать секреты Edge Function —
это единственная часть, которую нужно сделать руками, один раз.

1. **Supabase Dashboard → Project Settings → Edge Functions → Secrets**,
   добавить:
   - `TELEGRAM_BOT_TOKEN` — токен вашего бота от @BotFather
   - `SESSION_SECRET` — любая длинная случайная строка (32+ символа)
   - `VAULT_ENCRYPTION_KEY` — другая длинная случайная строка (32+ символа)
   - `POLZA_API_KEY` — ключ с polza.ai (OpenAI-совместимый прокси до Claude) —
     без него `classify-item` не сможет вызывать AI, но остальное приложение
     продолжит работать (просто будет предлагать выбрать категорию вручную).
     Модель классификации: `anthropic/claude-sonnet-5`, endpoint
     `https://polza.ai/api/v1/chat/completions`.

   Или через CLI после `supabase link`:
   ```bash
   supabase secrets set TELEGRAM_BOT_TOKEN=... SESSION_SECRET=... VAULT_ENCRYPTION_KEY=... ANTHROPIC_API_KEY=...
   ```

2. **@BotFather** → ваш бот → Bot Settings → Menu Button → указать URL
   развёрнутого фронтенда (после деплоя `apps/web`).

3. **Деплой фронтенда** — любой статический хостинг (Cloudflare Pages,
   Vercel, Netlify): команда сборки `npm run build` в `apps/web`, папка
   `dist`. Прописать `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` как
   переменные окружения хостинга, плюс (опционально, для полных
   реферальных ссылок) `VITE_TELEGRAM_BOT_USERNAME` — username бота без
   `@` — и `VITE_TELEGRAM_MINIAPP_SHORTNAME` — short name, который бот
   получил при регистрации Mini App через `/newapp` у @BotFather (виден в
   финальной direct-link ссылке от BotFather вида `t.me/<bot>/<shortname>`).
   Без обеих переменных реферальный блок покажет только код приглашения
   вместо готовой ссылки. **Обе обязательны вместе**: ссылка вида
   `t.me/<bot>?startapp=<код>` без short name отдаёт `BOT_INVALID`, как
   только у бота зарегистрировано настоящее Mini App (а не просто Menu
   Button) — правильный формат: `t.me/<bot>/<shortname>?startapp=<код>`.

## Оплата (Pro / Premium / свой тариф)

Сейчас — только схема тарифов, калькулятор своего тарифа и paywall UI
(цены в ₽); нажатие «Оформить» показывает тост «Оплата подключается».
Готова серверная часть, к которой предстоит подключить реального
провайдера:

- `payments` / `referrals` таблицы и SQL-функции `fn_qualify_referral` /
  `fn_reverse_referral` (`supabase/migrations/0002_referrals_and_custom_plan.sql`)
  реализуют реферальные бонусы строго за подтверждённую оплату Pro/Premium
  (не за регистрацию), с защитой от self-referral, повторных начислений,
  автовозврата бонуса при рефанде и лимитом бонуса на аккаунт — параметры
  вынесены в таблицу `app_config`, меняются без передеплоя.
- `payment-webhook` Edge Function — точка, куда должен стучаться реальный
  провайдер (Platega.io и т.п.) после оплаты/рефанда. По умолчанию
  отклоняет всё: нужно один раз задать секрет `PAYMENT_WEBHOOK_SECRET`
  (Supabase Dashboard → Edge Functions → Secrets) и настроить у провайдера
  отправку этого значения в заголовке `X-Webhook-Secret`, плюс — перед
  реальным запуском — заменить сверку по секрету проверкой подписи
  провайдера согласно его документации.
