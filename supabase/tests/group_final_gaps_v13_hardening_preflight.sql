-- Read-only preflight for Packet 13's NOT VALID group constraint.
-- Run before release approval. It does not mutate rows or validate constraints.

-- TAP wrapper lets the official full-directory test runner include this preflight.
begin;
create extension if not exists pgtap with schema extensions;
select plan(1);
select ok(not exists (
  select 1 from public.game_rooms
  where mode = 'group' and not (
    min_players between 3 and 8
    and max_players between min_players and 8
    and finish_rank_limit = 3
    and use_items = false
  )
), 'existing group rooms satisfy the Packet 13 constraints');

select
  status,
  count(*)::bigint as violating_rows
from public.game_rooms
where mode = 'group'
  and not (
    min_players between 3 and 8
    and max_players between min_players and 8
    and finish_rank_limit = 3
    and use_items = false
  )
group by status
order by status;

select
  id,
  room_code,
  status,
  min_players,
  max_players,
  finish_rank_limit,
  use_items,
  created_at
from public.game_rooms
where mode = 'group'
  and not (
    min_players between 3 and 8
    and max_players between min_players and 8
    and finish_rank_limit = 3
    and use_items = false
  )
order by status, created_at, id;

select * from finish();
rollback;
