-- !!! 16b-r 소급 — APPLY. 운영 데이터에 해금·보상·XP를 실제로 쓴다 (COMMIT).
-- !!! scripts/16b-r-retro-dryrun.sql 의 보고를 사용자가 확인·승인한 뒤에만 실행한다 (건별 승인, AGENTS.md §1).
-- !!! 실행 전 백업. 16c 배포 후에 실행한다 (소급 해금은 로비 알림으로 보인다).
-- 본문은 dry-run 파일과 같다 (tests/retroScripts.test.js) — 다른 것은 마지막 호출의 인자(true)뿐이다.
-- 두 번 실행해도 안전하다 (멱등 — 두 번째는 해금 0). SQL Editor는 붙인 전체를 한 트랜잭션으로 실행하고 끝에 커밋한다.

-- >>> 16b-r BODY — dry-run·apply 두 파일에서 한 글자도 다르면 안 된다 (tests/retroScripts.test.js)
--
-- 범위 (16-HANDOFF.md §1 판정 8 · §9):
--   * 누적형만 — retro_policy = 'retroactive'이고 지금 살아 있는 정의 (히든·끝까지 함께는 from_activation이라 제외)
--   * 근거는 서버 권위 이후 기록만:
--       싱글 = game_records.run_id is not null + 완료 run (private.achievement_single_records_v1과 같은 선)
--       1:1·그룹 = 이동 이벤트(game_move_events)가 있는 결과만 [사용자 결정, 2026-10-03] — 없는 결과는 제외하고 수를 보고한다
--   * 1:1 감쇠는 16b 판정기가 private.duel_decay_v1로 다시 센다. 레벨 급상승 허용
-- 방법: (1) 방문 문서 집합 private.achievement_record_visits_v1 (2) 사용자별 profiles 잠금, user_id 순
--   (3) counter = 16b 판정기가 원천에서 다시 센다, 근거 결과 1개로 호출 (4) 소급 분기 = 첫 도착·여덟 명의 원정대는
--   근거 결과를 시간순으로 훑어 처음 만족하는 것, 준비된 탐험가는 현재 장착 (5) 지급 = apply_achievement_value_v1(..., 'retro', null)
--   → 결과 화면이 없으므로 16c 로비 알림이 받는다. 멱등 — 두 번째 실행은 해금 0.
-- dry-run은 마지막에 표식 예외로 모든 쓰기를 되돌리고 변수에 모아 둔 보고만 돌려준다 (SQL Editor는 마지막 결과만 보여 준다).
create or replace function pg_temp.retro_16b_r(p_apply boolean)
returns table (ord integer, section text, item text, value text)
language plpgsql
as $retro$
declare
  v_started timestamptz := clock_timestamp();
  v_report jsonb := '[]'::jsonb;
  v_visits bigint := 0;
  v_user uuid;
  v_definition public.achievement_definitions;
  v_scopes text[];
  v_source record;
  v_value bigint;
  v_result jsonb;
begin
  begin
    perform set_config('lock_timeout', '10s', true);
    drop table if exists retro_before, retro_before_unlocks, retro_sources, retro_excluded, retro_failures, retro_after;

    create temp table retro_before on commit drop as
    select profile.id as user_id, profile.total_xp,
           public.level_from_total_xp(profile.total_xp) as level,
           (select count(*) from public.user_achievement_unlocks u where u.user_id = profile.id) as unlocks
      from public.profiles profile;

    create temp table retro_before_unlocks on commit drop as
    select id from public.user_achievement_unlocks;

    create temp table retro_sources (scope text, result_id uuid, user_id uuid, at timestamptz) on commit drop;
    create temp table retro_excluded (scope text, result_id uuid, still_counted boolean) on commit drop;
    create temp table retro_failures (user_id uuid, achievement_id text, detail text) on commit drop;

    -- 싱글
    insert into retro_sources
    select 'single', record.id, record.user_id, record.created_at
      from public.game_records record
      join public.single_game_runs run on run.id = record.run_id
      join public.profiles profile on profile.id = record.user_id
     where record.run_id is not null
       and record.result_status = 'completed'
       and run.status = 'completed'
       and run.user_id = record.user_id;

    -- 1:1 — 이동 이벤트가 없는 결과는 제외 대상
    insert into retro_excluded
    select 'duel', match.id, match.result_status = 'completed'
      from public.match_history match
     where match.result_status <> 'cancelled'
       and not exists (select 1 from public.game_move_events event
                        where event.scope = 'duel' and event.game_id = match.room_id);

    insert into retro_sources
    select 'duel', match.id, player.user_id, coalesce(match.finalized_at, match.created_at)
      from public.match_history match
     cross join lateral unnest(array[match.winner_user_id, match.loser_user_id]) as player(user_id)
      join public.profiles profile on profile.id = player.user_id
     where match.result_status <> 'cancelled'
       and match.id not in (select result_id from retro_excluded where scope = 'duel');

    -- 그룹 — 같은 기준
    insert into retro_excluded
    select 'group', room.id,
           exists (select 1 from public.group_match_results result
                    where result.room_id = room.id and result.result_status = 'finished')
      from public.game_rooms room
     where room.mode = 'group'
       and room.status = 'finished'
       and room.finished_reason is distinct from 'cancelled'
       and not exists (select 1 from public.game_move_events event
                        where event.scope = 'group' and event.game_id = room.id);

    insert into retro_sources
    select 'group', room.id, result.user_id, coalesce(room.finished_at, result.finalized_at)
      from public.game_rooms room
      join public.group_match_results result on result.room_id = room.id
      join public.profiles profile on profile.id = result.user_id
     where room.mode = 'group'
       and room.status = 'finished'
       and room.finished_reason is distinct from 'cancelled'
       and room.id not in (select result_id from retro_excluded where scope = 'group');

    create index on retro_sources (user_id, scope, at);

    -- (1) 방문 문서 집합
    select coalesce(sum(private.achievement_record_visits_v1(source.user_id, source.scope, source.result_id)), 0)
      into v_visits
      from (select * from retro_sources order by user_id, at, result_id) source;

    -- (2)~(5) 판정·지급
    for v_user in
      select profile.id
        from public.profiles profile
       where exists (select 1 from retro_sources s where s.user_id = profile.id)
          or exists (select 1 from public.user_profile_equipment e where e.user_id = profile.id)
       order by profile.id
    loop
      perform 1 from public.profiles where id = v_user for update;

      for v_definition in
        select definition.*
          from public.achievement_definitions definition
         where definition.retro_policy = 'retroactive'
           and private.achievement_is_live_v1(definition, now())
         order by definition.sort_order, definition.achievement_id
      loop
        begin
          v_scopes := private.achievement_evaluator_scopes_v1(v_definition.evaluator);
          v_value := null;

          if 'equipment' = any (v_scopes) then
            v_value := private.achievement_value_v1(v_definition, v_user, 'equipment', v_user);
          elsif v_definition.display_policy = 'counter' then
            select * into v_source from retro_sources s
             where s.user_id = v_user and s.scope = any (v_scopes)
             order by s.at desc, s.result_id desc limit 1;
            if found then
              v_value := private.achievement_value_v1(v_definition, v_user, v_source.scope, v_source.result_id);
            end if;
          else
            for v_source in
              select * from retro_sources s
               where s.user_id = v_user and s.scope = any (v_scopes)
               order by s.at, s.result_id
            loop
              v_value := private.achievement_value_v1(v_definition, v_user, v_source.scope, v_source.result_id);
              exit when coalesce(v_value, 0) >= 1;
            end loop;
          end if;

          if v_value is null or (v_definition.display_policy = 'once' and v_value < 1) then
            continue;
          end if;

          v_result := private.apply_achievement_value_v1(
            v_user, v_definition.achievement_id, v_value,
            jsonb_build_object('retro', true), 'retro', null, now());
          if coalesce((v_result->>'ok')::boolean, false) is not true then
            insert into retro_failures values (v_user, v_definition.achievement_id, v_result::text);
          end if;
        exception when others then
          insert into retro_failures values (v_user, v_definition.achievement_id, sqlstate || ' ' || sqlerrm);
        end;
      end loop;
    end loop;

    -- 보고
    create temp table retro_after on commit drop as
    select before.user_id,
           before.level as level_before,
           public.level_from_total_xp(profile.total_xp) as level_after,
           profile.total_xp - before.total_xp as xp_gained,
           (select count(*) from public.user_achievement_unlocks u where u.user_id = before.user_id) - before.unlocks as unlocks_gained
      from retro_before before
      join public.profiles profile on profile.id = before.user_id;

    select coalesce(jsonb_agg(to_jsonb(line) order by line.ord), '[]'::jsonb) into v_report
      from (
        select 1 as ord, '요약' as section, '모드' as item,
               case when p_apply then 'APPLY — COMMIT' else 'DRY-RUN — 전부 되돌림' end as value
        union all select 2, '요약', '근거 있는 사용자', (select count(distinct user_id) from retro_sources)::text
        union all select 3, '요약', '근거 결과 — 싱글', (select count(*) from retro_sources where scope = 'single')::text
        union all select 4, '요약', '근거 결과 — 1:1', (select count(distinct result_id) from retro_sources where scope = 'duel')::text
        union all select 5, '요약', '근거 결과 — 그룹', (select count(distinct result_id) from retro_sources where scope = 'group')::text
        union all select 6, '제외', '이동 이벤트 없는 1:1 결과', (select count(*) from retro_excluded where scope = 'duel')::text
        union all select 7, '제외', '이동 이벤트 없는 그룹 결과', (select count(*) from retro_excluded where scope = 'group')::text
        union all select 8, '제외', '그중 16b 누적 판정기가 원천에서 여전히 세는 결과 (정상 승패 1:1 · 완주자 있는 그룹)',
               (select count(*) from retro_excluded where still_counted)::text
        union all select 9, '요약', '방문 문서 행 추가', v_visits::text
        union all select 10, '요약', '해금 받은 사용자', (select count(*) from retro_after where unlocks_gained > 0)::text
        union all select 11, '요약', '해금 합계', (select coalesce(sum(unlocks_gained), 0) from retro_after)::text
        union all select 12, '요약', 'XP 합계', (select coalesce(sum(xp_gained), 0) from retro_after)::text
        union all select 13, '요약', '실패', (select count(*) from retro_failures)::text
        union all select 14, '요약', '소요 ms', round(extract(epoch from clock_timestamp() - v_started) * 1000)::text
        union all
        select 100 + (row_number() over (order by d.unlocks_gained))::integer, '사용자별 해금 수 분포',
               d.unlocks_gained || '개', d.users || '명'
          from (select unlocks_gained, count(*) as users from retro_after
                 where unlocks_gained > 0 group by unlocks_gained) d
        union all
        select 200 + (row_number() over (order by a.achievement_id, a.tier))::integer, '업적별 해금',
               a.achievement_id || ' · ' || a.tier || '단계', a.users || '명 · ' || a.xp || ' XP'
          from (select unlock.achievement_id, unlock.tier, count(*) as users, coalesce(sum(ledger.amount), 0) as xp
                  from public.user_achievement_unlocks unlock
                  left join public.xp_ledger ledger
                    on ledger.source_type = 'achievement_unlock' and ledger.source_id = unlock.id
                 where unlock.id not in (select id from retro_before_unlocks)
                 group by unlock.achievement_id, unlock.tier) a
        union all
        select 300 + (row_number() over (order by l.levels_gained))::integer, '레벨 상승 분포 (해금 받은 사용자)',
               '+' || l.levels_gained, l.users || '명'
          from (select level_after - level_before as levels_gained, count(*) as users from retro_after
                 where unlocks_gained > 0 group by 1) l
        union all
        select 400 + (row_number() over (order by f.user_id, f.achievement_id))::integer, '실패',
               f.user_id || ' · ' || f.achievement_id, f.detail
          from retro_failures f
      ) line;

    if not p_apply then
      raise exception '16B_R_DRY_RUN_ROLLBACK';
    end if;
  exception when raise_exception then
    if sqlerrm <> '16B_R_DRY_RUN_ROLLBACK' then
      raise;
    end if;
  end;

  return query
  select (line->>'ord')::integer, line->>'section', line->>'item', line->>'value'
    from jsonb_array_elements(v_report) line
   order by 1;
end;
$retro$;
-- <<< 16b-r BODY

set statement_timeout = '5min';
select * from pg_temp.retro_16b_r(true);
