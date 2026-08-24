# Digital Vault — Telegram Mini App — Design Spec

Date: 2026-08-24
Status: Approved (fast-track — user requested implementation without further per-section review)

## Concept

"Personal Digital Vault" — a private, AI-organized store for anything digital
(links, text, images, files, notes, credentials, movies, services). Core loop:
**paste/drop → AI identifies it → user confirms → it's filed.**

Not a notes app, not a file manager, not Notion. Premium, dark, minimal,
technical/industrial visual character — no gradients, no glassmorphism, no neon,
no big 3D, no emoji-as-UI-icons.

## Stack decisions (locked with user)

- Frontend: React + TypeScript + Vite + Tailwind, `@telegram-apps/sdk-react`
  for theme/haptics/back-button/safe-area/initData.
- Backend: Supabase project `digital-vault` (org `nichegotakova`, Free tier),
  project ref `etvnsrvenbsqxhosmuhw`, region eu-west-1. Postgres + RLS +
  Edge Functions (Deno) + Storage.
- AI: Claude (Anthropic) API, called only from Edge Functions. Key never
  reaches the client.
- Telegram Bot: token supplied by user, stored only as an Edge Function
  secret (`TELEGRAM_BOT_TOKEN`), never in code or client.
- Payments: schema + paywall UI only in this phase. Real billing via
  platega.io is a separate future phase. Prices displayed in ₽ (RUB).

## Auth flow

Client gets `initData` from Telegram SDK on launch → POSTs to Edge Function
`auth-telegram` → function verifies the Telegram HMAC signature using
`TELEGRAM_BOT_TOKEN` (the only place the token is used) → upserts a row in
`profiles` keyed by `telegram_id` → mints a short-lived app session token
(HS256, signed with `SESSION_SECRET`, ~1h expiry) → client holds it in memory
only (no localStorage), re-authenticates via fresh `initData` on next launch.

All data access happens through Edge Functions using the Supabase service
role (never exposed to the client). Every table has RLS enabled with a
deny-all policy for `anon`/`authenticated` — PostgREST direct access is fully
closed; Edge Functions are the only path to data, and each one filters every
query by the authenticated `user_id` from the verified session token. This
sidesteps needing Supabase Auth's own JWT signing secret and keeps the trust
boundary in one auditable place.

## Data model

- `profiles(id, telegram_id unique, username, plan, storage_used_bytes, ai_calls_used, ai_calls_period_start, created_at)`
- `items(id, user_id, type, category, subcategory, tags text[], title, description, source_url, source_domain, preview_url, ocr_text, ai_meta jsonb, status, movie_status, created_at, updated_at)`
  - `type`: link | text | image | file | note | movie | series | service | bookmark | design_reference
  - `status`: inbox | saved
  - `movie_status` (nullable): watch_later | watching | watched
- `secrets(id, user_id, name, username, password_encrypted, category, tags text[], created_at, updated_at)` —
  fully separate table from `items`; never touched by AI classification.
- `files(id, user_id, item_id, storage_path, mime_type, size_bytes, created_at)`
- `usage_events(id, user_id, kind, occurred_at)` — for free-tier limit counters (ai_calls, storage).

## Secure Vault encryption

- Password encrypted server-side with `pgcrypto` (`pgp_sym_encrypt`) using a
  key held only in the `VAULT_ENCRYPTION_KEY` Edge Function secret — never in
  the DB, never in the client.
- Decryption happens only inside `secrets-crud` on an explicit "reveal"
  action, never in list/index responses (always masked `••••••••` there).
- No secret content is ever sent to the AI classifier. Regex heuristics
  detect likely credentials/API keys *before* any AI call and short-circuit
  straight to the Secure Vault confirmation flow.
- TLS in transit (Supabase default), RLS deny-all on `secrets` table, no
  localStorage for secret values.
- Explicitly not claimed as "100% secure" anywhere in the UI. Architecture is
  built to be auditable later (isolated encryption boundary, single key
  secret, append-only usage log).

## AI classification flow

1. Client sends raw content (URL, text, or image) to `classify-item`.
2. Local regex heuristics run first (password/login patterns, `api[_-]?key`,
   `sk-…`, `AKIA…`, PEM key blocks). Match → return `possible_credential`
   immediately, no AI call, route to Secure Vault confirm screen.
3. Otherwise: for URLs, `link-metadata` fetches OG tags server-side first;
   Claude (text or vision) classifies type/category/subcategory/tags/title
   with a confidence score.
4. Result lands in `items` with `status=inbox` as a draft — nothing is final
   until the user taps Save (or Edit then Save).
5. Each AI call increments `usage_events` for plan-limit enforcement.

## Navigation (mobile, 320–430px)

Bottom bar: **Inbox · Vault (Secure Vault, visually distinct accent) ·
Library · Search**. Library is a grid hub covering Inspiration, Bookmarks,
Movies, Services, Files, Notes — each its own screen one tap deeper.
Settings/Account lives behind the profile icon in the header, not in the tab
bar. Inbox is the launch screen and leads with the Capture Zone.

## Design system

- Palette: Void `#0A0A0C` (bg), Graphite `#141417` (surface), Graphite
  Raised `#1C1C20` (elevated), Hairline `#2B2B30` (border), Bone `#EDEDEF`
  (text), Slate `#8B8B94` (muted text), Signal `#4FB6D6` (single cold
  accent), Moss `#6FBF8B` (muted positive), Ember `#E2665C` (muted danger).
- Type: Geist (display/UI/body), Geist Mono (numbers, storage, timestamps,
  technical metadata). Uppercase tracked labels for category chips only, not
  whole UI.
- Small radii (6–8px), 1px hairline borders, no heavy shadows, no gradients.
- Signature element: the Capture Zone + its ANALYZING → FOUND terminal-style
  processing readout — the one deliberately expressive moment in an
  otherwise quiet, disciplined interface.

## Monetization (schema + UI only this phase)

Free / Pro / Pro+ tiers, limits on storage / AI calls / secrets count /
history. Prices shown in **₽**. No live payment processing — placeholder
"Upgrade" CTA, real integration (platega.io) is a later phase.

## Known manual steps (cannot be automated via available tools)

- Setting Edge Function secrets (`TELEGRAM_BOT_TOKEN`, `ANTHROPIC_API_KEY`,
  `VAULT_ENCRYPTION_KEY`, `SESSION_SECRET`) — no MCP tool exposes secret
  writes; must be done via Supabase Dashboard or `supabase secrets set`.
  Documented precisely at handoff.
- Registering the Mini App URL as the bot's menu button via @BotFather.
- Choosing and executing a static host for `apps/web` (Cloudflare
  Pages/Vercel/etc.) — build output is a plain static bundle either way.
