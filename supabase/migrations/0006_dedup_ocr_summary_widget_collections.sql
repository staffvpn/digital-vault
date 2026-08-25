-- Schema for the second feature batch:
--   dedup (index only, logic lives in classify-item)
--   OCR text (reuses existing items.ocr_text column, unused until now)
--   article summary (items.summary)
--   pinned "recent saves" widget (profiles.pinned_message_id)
--   shared collections (collections / collection_items / collection_members)

alter table items add column summary text;
alter table profiles add column pinned_message_id bigint;

-- Dedup lookups are always "same user, same URL".
create index items_user_source_url_idx on items(user_id, source_url)
  where source_url is not null;

-- ---------------------------------------------------------------------
-- Shared collections (Premium to create, free for anyone to join/view
-- once shared — the invite is the point).
-- ---------------------------------------------------------------------
create table collections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  share_code text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index collections_owner_idx on collections(owner_id);

create table collection_members (
  collection_id uuid not null references collections(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role text not null default 'member', -- 'owner' | 'member'
  joined_at timestamptz not null default now(),
  primary key (collection_id, user_id)
);

create table collection_items (
  collection_id uuid not null references collections(id) on delete cascade,
  item_id uuid not null references items(id) on delete cascade,
  added_by uuid references profiles(id),
  added_at timestamptz not null default now(),
  primary key (collection_id, item_id)
);

create trigger collections_set_updated_at before update on collections
  for each row execute function set_updated_at();

alter table collections enable row level security;
alter table collection_members enable row level security;
alter table collection_items enable row level security;
revoke all on collections, collection_members, collection_items from anon, authenticated;

create or replace function fn_generate_collection_code() returns text as $$
declare
  v_code text;
begin
  loop
    v_code := lower(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
    exit when not exists (select 1 from collections where share_code = v_code);
  end loop;
  return v_code;
end;
$$ language plpgsql;

alter table collections alter column share_code set default fn_generate_collection_code();

-- Joining a shared collection by code is idempotent (safe to call again).
-- Unlike referral attach, this runs on every login where a col_<code>
-- start_param is present, not just at account creation — see auth-telegram.
create or replace function fn_join_collection(p_user_id uuid, p_share_code text)
returns void language plpgsql as $$
declare
  v_collection_id uuid;
begin
  select id into v_collection_id from collections where share_code = p_share_code;
  if v_collection_id is null then
    return;
  end if;
  insert into collection_members (collection_id, user_id, role)
  values (v_collection_id, p_user_id, 'member')
  on conflict (collection_id, user_id) do nothing;
end;
$$;
