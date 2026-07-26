-- 온라인 게임 동시 요청의 중복 저장을 막기 위한 안전 마이그레이션입니다.
-- 기존 중복 행을 임의로 삭제하지 않으며, 중복이 있으면 전체 트랜잭션을 중단합니다.

begin;

do $$
begin
  if to_regclass('public.game_rooms') is null
    or to_regclass('public.room_players') is null
    or to_regclass('public.match_history') is null
    or to_regclass('public.group_match_history') is null
    or to_regclass('public.group_match_results') is null then
    raise exception '온라인 게임 테이블이 모두 존재해야 합니다.';
  end if;

  if exists (
    select 1 from public.game_rooms group by room_code having count(*) > 1
  ) then
    raise exception 'game_rooms.room_code 중복을 먼저 정리해야 합니다.';
  end if;

  if exists (
    select 1
    from public.room_players
    group by room_id, user_id
    having count(*) > 1
  ) then
    raise exception 'room_players의 (room_id, user_id) 중복을 먼저 정리해야 합니다.';
  end if;

  if exists (
    select 1 from public.match_history group by room_id having count(*) > 1
  ) then
    raise exception 'match_history.room_id 중복을 먼저 정리해야 합니다.';
  end if;

  if exists (
    select 1
    from public.group_match_history
    group by room_id, user_id
    having count(*) > 1
  ) then
    raise exception 'group_match_history의 (room_id, user_id) 중복을 먼저 정리해야 합니다.';
  end if;

  if exists (
    select 1
    from public.group_match_results
    group by room_id, user_id
    having count(*) > 1
  ) then
    raise exception 'group_match_results의 (room_id, user_id) 중복을 먼저 정리해야 합니다.';
  end if;
end;
$$;

create unique index if not exists game_rooms_room_code_uidx
  on public.game_rooms (room_code);

create unique index if not exists room_players_room_user_uidx
  on public.room_players (room_id, user_id);

create unique index if not exists match_history_room_uidx
  on public.match_history (room_id);

create unique index if not exists group_match_history_room_user_uidx
  on public.group_match_history (room_id, user_id);

create unique index if not exists group_match_results_room_user_uidx
  on public.group_match_results (room_id, user_id);

commit;
