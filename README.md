# NCHT Notion

Personal Digital Vault — Telegram Mini App для хранения и AI-организации
цифровых материалов. Полная концепция и архитектура: см.
`docs/superpowers/specs/2026-08-24-digital-vault-design.md`.

## Структура

- `apps/web` — React + TypeScript + Vite + Tailwind фронтенд (Mini App UI).
- `supabase/migrations` — схема Postgres (RLS deny-all, только через Edge Functions).
- `supabase/functions` — 17 Edge Functions: `auth-telegram`, `items-crud`,
  `secrets-crud`, `classify-item`, `link-metadata`, `files-upload`, `files-url`,
  `referrals`, `payment-webhook`, `create-stars-invoice`, `transcribe-audio`,
  `deliver-reminders`, `telegram-webhook`, `setup-webhook`, `summarize-link`,
  `collections`, `admin-stats`.

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
     private chat saves it — no Mini App needed. Also registers Telegram
     Stars' `pre_checkout_query`, the `/start` post's inline-button
     `callback_query` updates, in `allowed_updates`, and the `/info`
     command (legal documents, see below). Safe to re-run any time
     (idempotent) — re-run it after any change to `setup-webhook` itself.

   - `ADMIN_SECRET` — any long random string. Protects `admin-stats` (see
     "Админка" below) — without it, `/admin` will 401 forever.

   Или через CLI после `supabase link`:
   ```bash
   supabase secrets set TELEGRAM_BOT_TOKEN=... SESSION_SECRET=... VAULT_ENCRYPTION_KEY=... POLZA_API_KEY=... CRON_SECRET=... TELEGRAM_WEBHOOK_SECRET=... ADMIN_SECRET=...
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

## Приветственный пост (`/start`) и админка

`/start` в личном чате с ботом отвечает не голым текстом, а оформленным
постом (HTML-разметка, кнопки `inline_keyboard`): заголовок, позиционирование,
список возможностей, цены, и кнопки — «Открыть приложение» (t.me-ссылка на
Mini App, username бота получается живым вызовом `getMe`, а не хранится
отдельной константой), «Инфо» и «Поддержка» (`callback_query`-кнопки,
отвечают тем же текстом, что и `/info`/контактный e-mail), «Тарифы» и — если
профиль уже существует — «Пригласить друга» с личной реферальной ссылкой.
Работает и до первого открытия Mini App: `/start` обычно самое первое, что
делает новый человек, поэтому обработан раньше проверки «сначала откройте
приложение». Картинку-обложку (как в примере, который показал заказчик) пока
не добавили — генерация через Gemini недоступна из этой песочницы (сетевой
таймаут до `generativelanguage.googleapis.com`); если дать логотип/картинку
файлом или открыть сеть, `sendMessage` легко заменить на `sendPhoto` с тем же
текстом в подписи.

Простая read-only админка — `/admin` в браузере (не через Telegram: минует
Telegram-гейт полностью, см. `App.tsx`), спрашивает пароль (значение
`ADMIN_SECRET`) один раз за сессию браузера, дальше дёргает `admin-stats`
напрямую с заголовком `X-Admin-Secret`. Показывает: всего пользователей,
новых за 7/30 дней, разбивку по тарифам (включая «свой тариф»), активных за
7/30 дней (по `usage_events`), выручку и число оплат (`payments`, `succeeded`),
рефералов по статусам, последние регистрации и — если такое случится —
удалённые аккаунты. Самостоятельного удаления аккаунта в приложении пока нет
(Info.tsx просит написать на почту), но миграция `0012` заранее ставит
триггер `fn_log_deleted_profile`, который журналирует любое удаление строки
`profiles` в `deleted_profiles` — стоит завести самостоятельное удаление,
список сразу начнёт заполняться без доработок админки.

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

## Юридические документы в боте (`/info`)

Платёжные провайдеры (например, Platega.io) проверяют, что Политика
конфиденциальности и Пользовательское соглашение доступны не только
внутри Mini App, но и прямо в чате с ботом. Команда `/info`
(`telegram-webhook`, до какой-либо проверки профиля — работает даже до
первого открытия приложения) отвечает несколькими сообщениями с обоими
документами, собранными в `_shared/legalText.ts` — та же формулировка,
что в `apps/web/src/screens/Info.tsx` (обновлять оба места вручную при
правках), с живыми цифрами тарифов из таблицы `plans`. Регистрируется в
автодополнении команд через `setMyCommands` в `setup-webhook`.

## Онбординг

Три слайда при первом запуске (`components/Onboarding.tsx`) плюс
дожидающийся подсказки экран `ForwardSavedNudge` во «Входящих» (пока
`profile.aiCallsUsed === 0`) — оба предлагают не добавлять что-то новое,
а переслать боту несколько сообщений из уже существующего Telegram
«Избранное»: первый реальный эффект приложения виден на данных, которые
у человека уже накопились, а не на пустом месте.

## Оплата (Pro / Premium / свой тариф)

Оплата на кнопке «Улучшить» (пресеты) и «Оформить» (свой тариф) открывает
выбор способа: **Telegram Stars** (работает по-настоящему) или
**карта/СБП через Platega.io** (пока заглушка — тост «скоро»).

- **Telegram Stars** — Telegram сам выступает платёжным провайдером
  (валюта `XTR`), внешний мерчант-аккаунт не нужен, только уже
  существующий `TELEGRAM_BOT_TOKEN`. Цена в звёздах для пресетов хранится
  в `plans.price_stars` (курс ~1 XTR ≈ 1.5 ₽, `supabase/migrations/
  0008_telegram_stars_payments.sql`); для своего тарифа считается той же
  формулой на сервере (`_shared/customPlanPricing.ts`, зеркало
  клиентской `lib/customPlanPricing.ts` — цена и лимиты пересчитываются
  и валидируются на сервере, клиенту не доверяют). Поток:
  `create-stars-invoice` (session-функция) создаёт `payments`-запись со
  статусом `pending` (для пресета — `plan`, для своего тарифа —
  `custom_plan` jsonb, `supabase/migrations/0011_custom_plan_purchase.sql`)
  и вызывает `createInvoiceLink`; фронтенд открывает ссылку через
  `Telegram.WebApp.openInvoice`; Telegram шлёт `telegram-webhook`
  сначала `pre_checkout_query` (обязателен ответ за 10 секунд — функция
  сверяет `payments`-запись и telegram_id плательщика), а после реальной
  оплаты — `message.successful_payment`, где тариф выдаётся: пресет —
  `profiles.plan` (плюс `fn_qualify_referral`/`fn_consume_referral_discount`,
  как у Platega-заглушки — свой тариф в реферальную программу никогда не
  засчитывается), свой тариф — `profiles.custom_plan`. Купленный свой
  тариф — не отдельный `plan_type`, а слой поверх пресета: везде, где
  раньше лимит/фича смотрелись по `profiles.plan` напрямую
  (`classify-item`, `telegram-webhook`, `files-upload`, `secrets-crud`,
  `summarize-link`, `collections`), теперь используется общий хелпер
  `_shared/planLimits.ts::getEffectiveLimits`, который сначала проверяет
  `custom_plan` и только потом падает обратно на пресет. Отдельных
  секретов настраивать не нужно.
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
