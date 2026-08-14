-- Wiki Race 2.0 server-authority v2 foundation.
-- Existing migrations are intentionally left untouched. This migration is additive.

begin;

create table if not exists public.wiki_pages (
  page_id text primary key,
  canonical_title text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists wiki_pages_canonical_title_uidx
  on public.wiki_pages (lower(canonical_title));

create table if not exists public.wiki_page_snapshots (
  id uuid primary key default gen_random_uuid(),
  page_id text not null references public.wiki_pages(page_id) on delete cascade,
  revision_id text not null,
  canonical_title_snapshot text not null,
  fetched_at timestamptz not null default now(),
  request_id uuid,
  created_at timestamptz not null default now(),
  unique (page_id, revision_id)
);

create index if not exists wiki_page_snapshots_page_revision_idx
  on public.wiki_page_snapshots (page_id, revision_id);

create table if not exists public.wiki_snapshot_links (
  snapshot_id uuid not null references public.wiki_page_snapshots(id) on delete cascade,
  target_page_id text not null,
  target_revision_id text,
  target_title_snapshot text not null,
  link_text text,
  ordinal integer not null,
  created_at timestamptz not null default now(),
  primary key (snapshot_id, target_page_id),
  unique (snapshot_id, ordinal),
  check (ordinal >= 0)
);

create index if not exists wiki_snapshot_links_target_page_idx
  on public.wiki_snapshot_links (target_page_id);

-- Immutable movement source of truth shared by single, duel, and group modes.
create table if not exists public.game_move_events (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('single', 'duel', 'group')),
  game_id uuid not null,
  actor_user_id uuid,
  affected_user_id uuid,
  request_id uuid not null,
  correlation_id uuid not null,
  event_type text not null check (event_type in (
    'NORMAL_LINK', 'FORCED_LINK', 'UNDO', 'RANDOM_TELEPORT',
    'SWAP', 'REWIND'
  )),
  from_page_id text,
  from_revision_id text,
  from_title_snapshot text,
  to_page_id text,
  to_revision_id text,
  to_title_snapshot text,
  clicked_raw_title text,
  move_delta integer not null,
  move_count_after integer,
  version_before bigint not null,
  version_after bigint not null,
  item_event_id uuid,
  undone_event_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  server_timestamp timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (move_delta <> 0),
  check (version_after > version_before),
  unique (scope, game_id, actor_user_id, request_id)
);

create index if not exists game_move_events_game_order_idx
  on public.game_move_events (scope, game_id, server_timestamp, id);

create unique index if not exists game_move_events_guest_request_uidx
  on public.game_move_events (scope, game_id, request_id)
  where actor_user_id is null;

create table if not exists public.game_mutation_requests (
  scope text not null check (scope in ('single', 'duel', 'group')),
  game_id uuid not null,
  actor_user_id uuid not null,
  request_id uuid not null,
  operation text not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key (scope, game_id, actor_user_id, request_id)
);

-- Progress is a versioned state projection of immutable move events.
alter table public.game_rooms
  add column if not exists state_version bigint not null default 0,
  add column if not exists reconnect_deadline_seconds integer not null default 60,
  add column if not exists match_end_reason text,
  add column if not exists duel_start_page_id text,
  add column if not exists duel_start_revision_id text,
  add column if not exists duel_start_title text,
  add column if not exists group_start_page_id text,
  add column if not exists group_start_revision_id text,
  add column if not exists group_target_page_id text,
  add column if not exists group_target_revision_id text;

alter table public.room_players
  add column if not exists progress_version bigint not null default 0,
  add column if not exists start_page_id text,
  add column if not exists start_revision_id text,
  add column if not exists target_page_id text,
  add column if not exists target_revision_id text,
  add column if not exists current_page_id text,
  add column if not exists current_revision_id text,
  add column if not exists heartbeat_at timestamptz,
  add column if not exists path_page_ids text[] not null default '{}',
  add column if not exists path_revision_ids text[] not null default '{}';

alter table public.game_records
  add column if not exists run_id uuid,
  add column if not exists start_page_id text,
  add column if not exists target_page_id text,
  add column if not exists start_revision_id text,
  add column if not exists target_revision_id text,
  add column if not exists result_status text not null default 'completed';

create unique index if not exists game_records_run_uidx
  on public.game_records (run_id)
  where run_id is not null;

alter table public.match_history
  add column if not exists result_status text not null default 'completed',
  add column if not exists result_reason text,
  add column if not exists finalized_at timestamptz;

alter table public.game_rooms
  drop constraint if exists game_rooms_reconnect_deadline_check;
alter table public.game_rooms
  add constraint game_rooms_reconnect_deadline_check
    check (reconnect_deadline_seconds between 1 and 600);

create or replace function private.normalize_wiki_title(p_title text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(regexp_replace(replace(btrim(coalesce(p_title, '')), '_', ' '), '\\s+', ' ', 'g'));
$$;

create or replace function private.snapshot_contains_link(
  p_from_page_id text,
  p_from_revision_id text,
  p_to_page_id text,
  p_to_revision_id text default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.wiki_page_snapshots snapshot
    join public.wiki_snapshot_links link on link.snapshot_id = snapshot.id
    where snapshot.page_id = p_from_page_id
      and snapshot.revision_id = p_from_revision_id
      and link.target_page_id = p_to_page_id
      and (p_to_revision_id is null or link.target_revision_id is null or link.target_revision_id = p_to_revision_id)
  );
$$;

create or replace function private.resolve_wiki_revision(
  p_page_id text,
  p_revision_id text default null
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select snapshot.revision_id
  from public.wiki_page_snapshots snapshot
  where snapshot.page_id = p_page_id
    and (p_revision_id is null or snapshot.revision_id = p_revision_id)
  order by snapshot.fetched_at desc
  limit 1;
$$;

-- Snapshot body and link replacement are one service-role transaction. The
-- Edge Function never exposes a partially replaced snapshot to readers.
create or replace function public.replace_wiki_snapshot_v2(
  p_page_id text,
  p_revision_id text,
  p_canonical_title text,
  p_request_id uuid default null,
  p_links jsonb default '[]'::jsonb
)
returns public.wiki_page_snapshots
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_snapshot public.wiki_page_snapshots;
  v_link jsonb;
  v_ordinal integer := 0;
  v_target_page_id text;
  v_target_title text;
begin
  if nullif(trim(p_page_id), '') is null
    or nullif(trim(p_revision_id), '') is null
    or nullif(trim(p_canonical_title), '') is null
    or jsonb_typeof(coalesce(p_links, '[]'::jsonb)) <> 'array' then
    raise exception 'SNAPSHOT_IDENTITY_REQUIRED';
  end if;

  insert into public.wiki_pages(page_id, canonical_title, updated_at)
  values (trim(p_page_id), trim(p_canonical_title), now())
  on conflict (page_id) do update
    set canonical_title = excluded.canonical_title, updated_at = now();

  insert into public.wiki_page_snapshots(
    page_id, revision_id, canonical_title_snapshot, request_id, fetched_at
  ) values (
    trim(p_page_id), trim(p_revision_id), trim(p_canonical_title), p_request_id, now()
  )
  on conflict (page_id, revision_id) do update
    set canonical_title_snapshot = excluded.canonical_title_snapshot,
        request_id = excluded.request_id,
        fetched_at = excluded.fetched_at
  returning * into v_snapshot;

  delete from public.wiki_snapshot_links where snapshot_id = v_snapshot.id;

  for v_link in select value from jsonb_array_elements(coalesce(p_links, '[]'::jsonb))
  loop
    v_target_page_id := nullif(trim(v_link->>'targetPageId'), '');
    v_target_title := nullif(trim(v_link->>'targetTitle'), '');
    if v_target_page_id is null or v_target_title is null then
      raise exception 'SNAPSHOT_LINK_IDENTITY_REQUIRED';
    end if;

    insert into public.wiki_snapshot_links(
      snapshot_id, target_page_id, target_revision_id, target_title_snapshot,
      link_text, ordinal
    ) values (
      v_snapshot.id,
      v_target_page_id,
      nullif(trim(v_link->>'targetRevisionId'), ''),
      v_target_title,
      nullif(trim(v_link->>'linkText'), ''),
      v_ordinal
    );
    v_ordinal := v_ordinal + 1;
  end loop;

  return v_snapshot;
end;
$$;

-- This is intentionally service-role only. The browser never writes the cache directly.
revoke all on table public.wiki_pages from anon, authenticated;
revoke all on table public.wiki_page_snapshots from anon, authenticated;
revoke all on table public.wiki_snapshot_links from anon, authenticated;
grant select on table public.wiki_pages, public.wiki_page_snapshots, public.wiki_snapshot_links to authenticated, service_role;

alter table public.wiki_pages enable row level security;
alter table public.wiki_page_snapshots enable row level security;
alter table public.wiki_snapshot_links enable row level security;
alter table public.game_move_events enable row level security;
alter table public.game_mutation_requests enable row level security;

drop policy if exists "Members can read move events" on public.game_move_events;
create policy "Members can read move events"
on public.game_move_events
for select
to authenticated
using (
  exists (
    select 1 from public.room_players player
    where player.room_id = game_move_events.game_id
      and player.user_id = (select auth.uid())
  )
);

revoke all on table public.game_move_events, public.game_mutation_requests from anon, authenticated;
grant select on table public.game_move_events to authenticated;

-- The service role owns cache writes; RPCs own event and projection writes.
revoke all on function private.normalize_wiki_title(text) from public, anon, authenticated;
revoke all on function private.snapshot_contains_link(text, text, text, text) from public, anon, authenticated;
revoke all on function private.resolve_wiki_revision(text, text) from public, anon, authenticated;
revoke all on function public.replace_wiki_snapshot_v2(text, text, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.replace_wiki_snapshot_v2(text, text, text, uuid, jsonb) to service_role;

commit;
