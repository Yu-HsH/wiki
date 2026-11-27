-- The opt-in scheduled command shares the existing start validator, engine and XP path.
alter table duel_v4.rooms add column waiting_closed_at timestamptz;
create table duel_v4.waiting_departures_v1 (
  room_id uuid not null references duel_v4.rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  request_id uuid not null,
  primary key (room_id,user_id,request_id)
);
alter table duel_v4.waiting_departures_v1 enable row level security;
revoke all on duel_v4.waiting_departures_v1 from public, anon, authenticated, service_role;

alter function public.act_duel_v4(uuid,uuid,text,jsonb) rename to act_duel_v4_before_followup;
revoke all on function public.act_duel_v4_before_followup(uuid,uuid,text,jsonb)
  from public, anon, authenticated, service_role;

create function public.act_duel_v4(p_room uuid,p_request uuid,p_operation text,p_input jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor uuid := auth.uid();
  room duel_v4.rooms;
  member duel_v4.members;
  prior duel_v4.receipts;
  output jsonb;
  at_time timestamptz;
begin
  if p_request is null or jsonb_typeof(p_input) is distinct from 'object'
    or octet_length(p_input::text)>8192 then
    raise invalid_parameter_value using message='INVALID_DUEL_V4_REQUEST';
  end if;
  -- Take the same room lock even on retries. A guest departure deletes the old membership.
  select r.* into room from duel_v4.rooms r where r.id=p_room and (
    exists(select from duel_v4.members m where m.room_id=r.id and m.user_id=actor)
    or exists(select from duel_v4.waiting_departures_v1 d where d.room_id=r.id
      and d.user_id=actor and d.request_id=p_request)) for update;
  if not found then raise insufficient_privilege using message='DUEL_V4_MEMBER_REQUIRED'; end if;
  if exists(select from duel_v4.waiting_departures_v1 d where d.room_id=p_room
    and d.user_id=actor and d.request_id=p_request) then
    if p_operation is distinct from 'leave_waiting' or p_input is distinct from '{}'::jsonb then
      raise invalid_parameter_value using message='REQUEST_ID_REUSED';
    end if;
    return jsonb_build_object('ok',true,'code','LEFT_WAITING_ROOM','requestId',p_request);
  end if;
  select * into strict member from duel_v4.members where room_id=p_room and user_id=actor;
  select * into prior from duel_v4.receipts where room_id=p_room and user_id=actor and request_id=p_request;
  if found then
    if (prior.operation,prior.input) is distinct from (p_operation,p_input) then
      raise invalid_parameter_value using message='REQUEST_ID_REUSED';
    end if;
    return prior.result;
  end if;
  at_time := clock_timestamp();
  if room.waiting_closed_at is not null then
    return jsonb_build_object('ok',false,'code','WAITING_ROOM_CLOSED','requestId',p_request);
  end if;
  if room.started_at>at_time then
    return jsonb_build_object('ok',false,'code','MATCH_STARTING','requestId',p_request);
  end if;

  if p_operation='leave_waiting' then
    if p_input is distinct from '{}'::jsonb or room.started_at is not null then
      return jsonb_build_object('ok',false,'code','WAITING_ROOM_REQUIRED','requestId',p_request);
    end if;
    insert into duel_v4.waiting_departures_v1 values(p_room,actor,p_request);
    if actor=room.host_id then
      update duel_v4.rooms set waiting_closed_at=at_time where id=p_room;
    else
      delete from duel_v4.members where room_id=p_room and user_id=actor;
    end if;
    perform duel_v4.publish(p_room);
    return jsonb_build_object('ok',true,'code','LEFT_WAITING_ROOM','requestId',p_request);
  end if;
  if p_operation is distinct from 'start_scheduled' then
    return public.act_duel_v4_before_followup(p_room,p_request,p_operation,p_input);
  end if;
  if p_input-'snapshotId'<>'{}'::jsonb then
    raise invalid_parameter_value using message='INVALID_DUEL_V4_REQUEST';
  end if;
  begin
    output := duel_v4.run_command(room,member,p_request,'start',p_input,at_time+interval '4 seconds');
  exception when check_violation then
    if sqlerrm !~ '^[A-Z0-9_]+$' then raise; end if;
    output := jsonb_build_object('ok',false,'code',sqlerrm);
  when invalid_text_representation then
    output := jsonb_build_object('ok',false,'code','INVALID_DUEL_V4_REQUEST');
  end;
  output := output || jsonb_build_object('requestId',p_request);
  insert into duel_v4.receipts values(p_room,actor,p_request,p_operation,p_input,output);
  if (output->>'ok')::boolean then perform duel_v4.publish(p_room); end if;
  return output;
end $$;
revoke all on function public.act_duel_v4(uuid,uuid,text,jsonb) from public, anon, authenticated, service_role;
grant execute on function public.act_duel_v4(uuid,uuid,text,jsonb) to authenticated;

create or replace function public.join_duel_v4_room(p_code text) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); room duel_v4.rooms;
begin
  if not duel_v4.can_enter(actor) then raise insufficient_privilege using message='DUEL_V4_ENTRY_CLOSED'; end if;
  select * into room from duel_v4.rooms where code=upper(btrim(p_code)) and waiting_closed_at is null for update;
  if not found then raise insufficient_privilege using message='DUEL_V4_ROOM_NOT_AVAILABLE'; end if;
  if exists(select from duel_v4.members m where m.room_id=room.id and m.user_id=actor) then return room.id; end if;
  if (room.replay_of is not null and not exists(
    select from duel_v4.members m where m.room_id=room.replay_of and m.user_id=actor
  )) or room.started_at is not null or exists(select from duel_v4.members m where m.room_id=room.id and m.seat=2) then
    raise insufficient_privilege using message='DUEL_V4_ROOM_NOT_AVAILABLE';
  end if;
  insert into duel_v4.members(room_id,user_id,seat) values(room.id,actor,2);
  perform duel_v4.publish(room.id);
  return room.id;
end $$;

create or replace function public.get_duel_v4_state(p_room uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  room duel_v4.rooms;
  actor uuid:=auth.uid();
  at_time timestamptz;
  body jsonb;
  supply_grant uuid;
begin
  select r.* into room from duel_v4.rooms r where r.id=p_room
    and exists(select from duel_v4.members m where m.room_id=r.id and m.user_id=actor)
    for update;
  if not found then raise insufficient_privilege using message='DUEL_V4_MEMBER_REQUIRED'; end if;
  at_time:=clock_timestamp();
  if room.started_at<=at_time and room.finished_at is null then
    if duel_v4.advance(room,at_time) then
      perform duel_v4.publish(room.id);
      select * into strict room from duel_v4.rooms where id=p_room;
    end if;
    update duel_v4.members set last_seen_at=at_time where room_id=p_room and user_id=actor
      and last_seen_at<at_time-interval '2 seconds' and room.finished_at is null;
  end if;
  body := duel_v4.project(room,actor,at_time)
    || jsonb_build_object('itemFeedback',duel_v4.recent_item_feedback(room.id,actor,at_time),
      'waitingClosedAt',room.waiting_closed_at,'waitingActionsVersion',1);
  if room.started_at>at_time then
    -- A deployed client interprets any non-null startedAt as permission to
    -- leave the lobby. Only the new countdown UI reads this additive field.
    return body || jsonb_build_object('startedAt',null,'scheduledStartAt',room.started_at,
      'inventory','[]'::jsonb,'nextSupplyAt',null,'supplyGrant',null);
  end if;
  select g.id into supply_grant from duel_v4.grants g where g.room_id=p_room and g.user_id=actor
    and g.supply_round=room.supply_round and g.consumed_at is null;
  return body || jsonb_build_object('supplyGrant',case when supply_grant is not null then
    jsonb_build_object('round',room.supply_round::text,'grantId',supply_grant) end);
end $$;

notify pgrst, 'reload schema';
