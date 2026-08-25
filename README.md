# NCHT Notion

Personal Digital Vault — Telegram Mini App для хранения и AI-организации
цифровых материалов. Полная концепция и архитектура: см.
`docs/superpowers/specs/2026-08-24-digital-vault-design.md`.

## Структура

- `apps/web` — React + TypeScript + Vite + Tailwind фронтенд (Mini App UI).
- `supabase/migrations` — схема Postgres (RLS deny-all, только через Edge Functions).
- `supabase/functions` — 16 Edge Functions: `auth-telegram`, `items-crud`,
  `secrets-crud`, `classify-item`, `link-metadata`, `files-upload`, `files-url`,
  `referrals`, `payment-webhook`, `create-stars-invoice`, `transcribe-audio`,
  `deliver-reminders`, `telegram-webhook`, `setup-webhook`, `summarize-link`,
  `collections`.

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

   - `CRON_SECRET` — must be exactly `b8b1a13ced45df526ef6606905115d6cb7858e83e6d6ed76`
     (this exact value is already hard-coded into the pg_cron job created by
     `migrations/0005_reminder_columns_and_cron.sql` — there's no MCP tool to
     set Edge Function secrets, so the two sides have to match manually).
     Protects `deliver-reminders`, the job pg_cron calls every 5 minutes to
     send reminder notifications via Telegram — without this secret set,
     reminders will never actually be delivered even though everything else
     about them works.

   - `TELEGRAM_WEBHOOK_SECRET` — must be exactly `75dec84da4669a031a9b3138d41d735fc85f72d965e34676`
     (same reasoning as `CRON_SECRET` above: this exact value is what
     `setup-webhook` will register with Telegram as the `secret_token`, and
     what `telegram-webhook` checks on every incoming update — they have to
     match). Once this is set, trigger the one-time webhook registration:
     ```bash
     curl -X POST "https://etvnsrvenbsqxhosmuhw.supabase.co/functions/v1/setup-webhook" \
       -H "X-Setup-Secret: 75dec84da4669a031a9b3138d41d735fc85f72d965e34676"
     ```
     After that, forwarding or typing a message directly to the bot in its
     private chat saves it — no Mini App needed. Safe to re-run any time
     (idempotent).

   Или через CLI после `supabase link`:
   ```bash
   supabase secrets set TELEGRAM_BOT_TOKEN=... SESSION_SECRET=... VAULT_ENCRYPTION_KEY=... POLZA_API_KEY=... CRON_SECRET=... TELEGRAM_WEBHOOK_SECRET=...
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

## Голос и напоминания

Центральная кнопка-микрофон в нижней навигации открывает запись голоса или
текстовый ввод, который проходит через тот же ИИ-конвейер, что и обычная
вставка. `transcribe-audio` пересылает запись на Whisper через Polza.ai
(`openai/whisper-large-v3-turbo`, endpoint `/api/v1/audio/transcriptions`),
результат метится как обычный AI-вызов (тот же месячный лимит тарифа).

Если ИИ распознаёт в тексте дедлайн/напоминание ("напомни...", явная дата),
`classify-item` выставляет `type: "reminder"` и считает два момента
уведомления: `remind_notify_1`/`remind_notify_2` (за 2 дня и в сам день в
12:00 МСК — если время не указано; либо за 1 час и в момент — если указано
точное время). `deliver-reminders` вызывается pg_cron каждые 5 минут
(`migrations/0005`) и шлёт уведомление в Telegram через Bot API, когда
время подходит. Список и отметка «выполнено» — экран «Напоминания» в
Библиотеке.

## Дедуп, OCR, пересказ, «Похожее», подборки

- **Дедупликация** (все тарифы) — `classify-item` проверяет `source_url` до
  вызова ИИ; повтор той же ссылки возвращает `type: "duplicate"` вместо
  создания второй записи и не тратит AI-лимит.
- **Пересылка боту** (все тарифы) — `telegram-webhook` (после
  `setup-webhook`, см. выше) принимает текст/фото прямо в чате с ботом и
  прогоняет через тот же классификатор, что и Mini App.
- **OCR** (Pro/Premium) — при классификации картинки `classify-item`
  дополнительно просит модель продублировать видимый текст в `ocr_text`
  (колонка существовала в схеме, но не использовалась) — участвует в поиске.
- **«Похожее»** (все тарифы) — `SimilarItemsSheet`, поиск по ключевым словам
  из title/category через существующий индекс, без embeddings/вектора.
- **Пересказ статьи** (Premium) — `summarize-link`: фетчит страницу,
  снимает разметку, просит модель пересказать в 4-6 предложений, кэширует
  в `items.summary`.
- **Совместные подборки** (создание — Premium; вступление и добавление
  записей — любой тариф) — `collections` Edge Function +
  `collections`/`collection_items`/`collection_members` таблицы. Ссылка на
  подборку использует тот же механизм `?startapp=`, что и рефералы, с
  префиксом `col_<code>`; присоединение обрабатывается в `auth-telegram`
  при каждом входе (не только при регистрации, в отличие от рефералов).

## Оплата (Pro / Premium / свой тариф)

Оплата на кнопке «Улучшить» открывает выбор способа: **Telegram Stars**
(работает по-настоящему) или **карта/СБП через Platega.io** (пока
заглушка — тост «скоро»).

- **Telegram Stars** — Telegram сам выступает платёжным провайдером
  (валюта `XTR`), внешний мерчант-аккаунт не нужен, только уже
  существующий `TELEGRAM_BOT_TOKEN`. Цена в звёздах хранится в
  `plans.price_stars` (курс ~1 XTR ≈ 1.5 ₽, `supabase/migrations/
  0008_telegram_stars_payments.sql`). Поток: `create-stars-invoice`
  (session-функция) создаёт `payments`-запись со статусом `pending` и
  вызывает `createInvoiceLink`; фронтенд открывает ссылку через
  `Telegram.WebApp.openInvoice`; Telegram шлёт `telegram-webhook`
  сначала `pre_checkout_query` (обязателен ответ за 10 секунд — функция
  сверяет `payments`-запись и telegram_id плательщика), а после реальной
  оплаты — `message.successful_payment`, где тариф и выдаётся (плюс те
  же вызовы `fn_qualify_referral`/`fn_consume_referral_discount`, что и
  у Platega-заглушки). Отдельных секретов настраивать не нужно.
- **Карта/СБП (Platega.io)** — пока заглушка, серверная часть готова:
  `payments` / `referrals` таблицы и SQL-функции `fn_qualify_referral` /
  `fn_reverse_referral` (`supabase/migrations/0002_referrals_and_custom_plan.sql`)
  реализуют реферальные бонусы строго за подтверждённую оплату Pro/Premium
  (не за регистрацию), с защитой от self-referral, повторных начислений,
  автовозврата бонуса при рефанде и лимитом бонуса на аккаунт — параметры
  вынесены в таблицу `app_config`, меняются без передеплоя.
  `payment-webhook` Edge Function — точка, куда должен стучаться реальный
  провайдер после оплаты/рефанда. По умолчанию отклоняет всё: нужно один
  раз задать секрет `PAYMENT_WEBHOOK_SECRET` (Supabase Dashboard → Edge
  Functions → Secrets) и настроить у провайдера отправку этого значения в
  заголовке `X-Webhook-Secret`, плюс — перед реальным запуском — заменить
  сверку по секрету проверкой подписи провайдера согласно его документации.
