-- Project committed v4 outcomes to their intended recipient using existing state refreshes.
-- A copied grant is written only after a successful theft. A trap's timestamp
-- records that it sprang, including when a shield absorbed the effect.
create function duel_v4.recent_item_feedback(p_room uuid, p_actor uuid, p_now timestamptz)
returns jsonb
language sql stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object('id', event_id, 'kind', kind, 'expiresAt', happened_at + interval '30 seconds')
    order by happened_at, event_id
  ), '[]'::jsonb)
  from (
    select *
    from (
      select 'item-stolen:' || stolen.id::text as event_id, 'item_stolen' as kind, stolen.consumed_at as happened_at
      from duel_v4.grants stolen
      where stolen.room_id = p_room and stolen.user_id = p_actor
        and stolen.consumed_at > p_now - interval '30 seconds'
        and exists (
          select from duel_v4.grants copy
          where copy.stolen_from = stolen.id and copy.room_id = p_room and copy.user_id <> p_actor
        )
      union all
      select 'trap-triggered:' || trap.grant_id::text, 'trap_triggered', trap.triggered_at
      from duel_v4.traps trap
      where trap.room_id = p_room and trap.actor_id = p_actor
        and trap.triggered_at > p_now - interval '30 seconds'
    ) events
    order by happened_at desc, event_id desc
    limit 24
  ) recent
$$;

revoke all on function duel_v4.recent_item_feedback(uuid, uuid, timestamptz)
  from public, anon, authenticated, service_role;

-- Preserve the existing participant fence, lock, advancement and heartbeat.
create or replace function public.get_duel_v4_state(p_room uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare room duel_v4.rooms; actor uuid:=auth.uid(); at_time timestamptz;
begin
  select r.* into room from duel_v4.rooms r where r.id=p_room
    and exists(select from duel_v4.members m where m.room_id=r.id and m.user_id=actor)
    for update;
  if not found then raise insufficient_privilege using message='DUEL_V4_MEMBER_REQUIRED'; end if;
  at_time:=clock_timestamp();
  if duel_v4.advance(room,at_time) then
    perform duel_v4.publish(room.id);
    select * into strict room from duel_v4.rooms where id=p_room;
  end if;
  if room.started_at is not null and room.finished_at is null then
    update duel_v4.members set last_seen_at=at_time where room_id=p_room and user_id=actor
      and last_seen_at<at_time-interval '2 seconds';
  end if;
  return duel_v4.project(room,actor,at_time)
    || jsonb_build_object('itemFeedback',duel_v4.recent_item_feedback(room.id,actor,at_time));
end $$;

notify pgrst, 'reload schema';
