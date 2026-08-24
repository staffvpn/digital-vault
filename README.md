# Digital Vault

Personal Digital Vault — Telegram Mini App для хранения и AI-организации
цифровых материалов. Полная концепция и архитектура: см.
`docs/superpowers/specs/2026-08-24-digital-vault-design.md`.

## Структура

- `apps/web` — React + TypeScript + Vite + Tailwind фронтенд (Mini App UI).
- `supabase/migrations` — схема Postgres (RLS deny-all, только через Edge Functions).
- `supabase/functions` — 7 Edge Functions: `auth-telegram`, `items-crud`,
  `secrets-crud`, `classify-item`, `link-metadata`, `files-upload`, `files-url`.

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
   - `ANTHROPIC_API_KEY` — ключ Anthropic API (console.anthropic.com) —
     без него `classify-item` не сможет вызывать AI, но остальное приложение
     продолжит работать (просто будет предлагать выбрать категорию вручную).

   Или через CLI после `supabase link`:
   ```bash
   supabase secrets set TELEGRAM_BOT_TOKEN=... SESSION_SECRET=... VAULT_ENCRYPTION_KEY=... ANTHROPIC_API_KEY=...
   ```

2. **@BotFather** → ваш бот → Bot Settings → Menu Button → указать URL
   развёрнутого фронтенда (после деплоя `apps/web`).

3. **Деплой фронтенда** — любой статический хостинг (Cloudflare Pages,
   Vercel, Netlify): команда сборки `npm run build` в `apps/web`, папка
   `dist`. Прописать те же `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`
   как переменные окружения хостинга.

## Оплата (Pro / Pro+)

Сейчас — только схема тарифов и paywall UI (цены в ₽). Реальная интеграция
Platega.io — отдельная следующая фаза.
