-- NCHT Notion — initial schema
-- All tables are accessed exclusively through Edge Functions using the
-- service role. RLS is enabled everywhere with no grants to anon/authenticated
-- as defense in depth: PostgREST direct access is fully closed.

create extension if not exists pgcrypto;

create type plan_type as enum ('free', 'pro', 'pro_plus');
create type item_type as enum (
  'link', 'text', 'image', 'file', 'note',
  'movie', 'series', 'service', 'bookmark', 'design_reference'
);
create type item_status as enum ('inbox', 'saved');
create type movie_status as enum ('watch_later', 'watching', 'watched');
create type usage_kind as enum ('ai_call', 'file_upload');

create table profiles (
  id uuid primary key default gen_random_uuid(),
  telegram_id bigint not null unique,
  username text,
  first_name text,
  plan plan_type not null default 'free',
  storage_used_bytes bigint not null default 0,
  ai_calls_used int not null default 0,
  ai_calls_period_start date not null default date_trunc('month', now())::date,
  secrets_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  type item_type not null,
  category text,
  subcategory text,
  tags text[] not null default '{}',
  title text,
  description text,
  source_url text,
  source_domain text,
  preview_url text,
  ocr_text text,
  ai_meta jsonb not null default '{}'::jsonb,
  status item_status not null default 'inbox',
  movie_status movie_status,
  confidence numeric(3,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index items_user_id_idx on items(user_id);
create index items_user_status_idx on items(user_id, status);
create index items_user_type_idx on items(user_id, type);
create index items_tags_idx on items using gin(tags);
create index items_search_idx on items using gin (
  to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(description,'') || ' ' || coalesce(ocr_text,''))
);

create table secrets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  username text,
  password_encrypted bytea not null,
  category text,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index secrets_user_id_idx on secrets(user_id);

create table files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  item_id uuid references items(id) on delete cascade,
  storage_path text not null,
  mime_type text,
  size_bytes bigint not null default 0,
  created_at timestamptz not null default now()
);
create index files_user_id_idx on files(user_id);

create table usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  kind usage_kind not null,
  occurred_at timestamptz not null default now()
);
create index usage_events_user_period_idx on usage_events(user_id, kind, occurred_at);

-- Reference table for plan limits / pricing (RUB). Read by the frontend
-- through a dedicated Edge Function, not directly.
create table plans (
  id plan_type primary key,
  price_rub int not null default 0,
  storage_limit_bytes bigint not null,
  ai_calls_limit_per_month int not null,
  secrets_limit int not null,
  features jsonb not null default '[]'::jsonb
);
insert into plans (id, price_rub, storage_limit_bytes, ai_calls_limit_per_month, secrets_limit, features) values
  ('free', 0, 524288000, 50, 5, '["Базовые категории","Обычные ссылки и заметки","5 секретов"]'),
  ('pro', 399, 10737418240, 1000, 100, '["OCR","Семантический поиск","Расширенные категории","100 секретов","Экспорт данных"]'),
  ('pro_plus', 799, 53687091200, 5000, 1000, '["Расширенный AI","Резервное копирование","Приоритетная обработка","1000 секретов"]');

-- updated_at maintenance
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger profiles_set_updated_at before update on profiles
  for each row execute function set_updated_at();
create trigger items_set_updated_at before update on items
  for each row execute function set_updated_at();
create trigger secrets_set_updated_at before update on secrets
  for each row execute function set_updated_at();

-- Lock every table down: RLS on, zero policies for anon/authenticated.
-- Only the service role (used exclusively inside Edge Functions) bypasses RLS.
alter table profiles enable row level security;
alter table items enable row level security;
alter table secrets enable row level security;
alter table files enable row level security;
alter table usage_events enable row level security;
alter table plans enable row level security;

revoke all on profiles, items, secrets, files, usage_events, plans from anon, authenticated;

-- plans is public reference data, safe to read directly
create policy "plans are publicly readable" on plans for select to anon, authenticated using (true);
grant select on plans to anon, authenticated;
