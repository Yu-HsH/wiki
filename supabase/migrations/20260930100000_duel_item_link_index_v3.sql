-- Wiki Race 2.0 track 14b: the 1:1 catalog gains `link_index` (링크만 보기).
-- Forward-only; 20260904090000 stays unchanged (AGENTS.md §4, R5).
--
-- ## Why
--   User decision 2026-09-30 (01-CONFIRMED-SPEC.md §0): the quick-links block
--   leaves every game screen, and its role moves to a 1:1 search item that opens
--   every link of the current page for at most 20 seconds. Search candidates
--   become search_once · link_preview · link_index; the active catalog is 11.
--
-- ## What changes -- exactly two objects
--   1. `private.duel_item_catalog_v3()` gains one row. The signature is the same,
--      so `create or replace` keeps the function's ACL (revoked from public,
--      anon and authenticated in 20260904090000).
--   2. `duel_item_grants_item_id_check` enumerates the grantable IDs, so a catalog
--      row alone would make the grant INSERT fail. It is dropped and re-added with
--      the eleventh ID. Every existing row satisfies the wider list.
--
-- ## What deliberately does not change
--   `public.use_duel_item_v3` needs no edit. It looks the grant up in the catalog,
--   and a non-attack item that is not `history_rewind` takes the generic
--   self-target branch; with `move_event_type` null nothing moves and only
--   `effect_expires_at` (now + 20s) is written. `ensure_duel_item_grant_v3`
--   filters the catalog by role, so the new search row joins the pool untouched.
--
--   The item reads no server data: the list is the client's `pageData.links`.
--   The server does not count the page's links either, so "no link, no use"
--   (TRACKS.md §8-14b Q3) is a client pre-check only.

create or replace function private.duel_item_catalog_v3()
returns table (
  item_id text,
  slot_role text,
  duration_ms integer,
  charges integer,
  blockable boolean,
  reflectable boolean,
  move_event_type text
)
language sql
immutable
set search_path = ''
as $$
  select *
  from (
    values
      ('blind',            'attack',  4000,  0, true,  true,  null),
      ('random_link_move', 'attack',  0,     0, true,  true,  'FORCED_LINK'),
      ('link_censorship',  'attack',  6000,  0, true,  true,  null),
      ('search_once',      'search',  15000, 0, false, false, null),
      ('link_preview',     'search',  15000, 0, false, false, null),
      ('link_index',       'search',  20000, 0, false, false, null),
      ('cleanse_shield',   'defense', 8000,  1, false, false, null),
      ('go_back',          'defense', 0,     0, false, false, 'UNDO'),
      ('backlink_reflect', 'defense', 6000,  1, false, false, null),
      ('random_teleport',  'joker',   0,     0, false, false, 'RANDOM_TELEPORT'),
      ('history_rewind',   'joker',   0,     0, false, false, 'REWIND')
  ) as catalog (
    item_id, slot_role, duration_ms, charges, blockable, reflectable, move_event_type
  );
$$;

alter table public.duel_item_grants
  drop constraint if exists duel_item_grants_item_id_check;

alter table public.duel_item_grants
  add constraint duel_item_grants_item_id_check
    check (item_id = any (array[
      'blind',
      'random_link_move',
      'link_censorship',
      'search_once',
      'link_preview',
      'link_index',
      'cleanse_shield',
      'go_back',
      'backlink_reflect',
      'random_teleport',
      'history_rewind'
    ]::text[]));
