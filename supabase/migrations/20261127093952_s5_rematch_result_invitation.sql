-- Use the owned S5 schema policies, including on hosts where postgres is not a superuser.
create temp table _s5_display_role on commit drop as
select inherit_option,set_option from pg_auth_members
where roleid='ink_product_owner'::regrole and member='postgres'::regrole and grantor='postgres'::regrole;
create temp table _s5_display_acl on commit drop as
select has_schema_privilege('ink_product_owner','public','CREATE') as had_create;
grant ink_product_owner to postgres with inherit true;
grant ink_product_owner to postgres with set true;
grant create on schema public to ink_product_owner;
set local role ink_product_owner;

-- The finished room is the invitation. Reuse the existing S5 join transaction.
create function public.get_s5_item_rematch_v1(p_source_room uuid)
returns uuid language plpgsql stable security definer set search_path='' as $$
declare actor uuid := ink_product.request_actor_v1();
begin
  if actor is null or not exists (
    select from ink_product.rooms r join ink_product.members m on m.room_id=r.id
    where r.id=p_source_room and r.phase='finished' and m.actor_id=actor
  ) then
    raise insufficient_privilege using message='PRODUCT_ROOM_UNAVAILABLE';
  end if;
  return (select id from ink_product.rooms where previous_room_id=p_source_room
    and phase='waiting' and scheduled_start_at is null);
end $$;

create function public.join_s5_item_rematch_v1(p_source_room uuid,p_request uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare next_id uuid := public.get_s5_item_rematch_v1(p_source_room);
        prep ink_product.rooms;
        response jsonb;
begin
  if next_id is null then raise exception 'REMATCH_NOT_READY'; end if;
  select * into strict prep from ink_product.rooms where id=next_id;
  response := public.act_group_items_product_room_v1('join',null,p_request,null,prep.binding,
    jsonb_build_object('roomCode',prep.code));
  if response->>'ok' is distinct from 'true' then
    if response->>'code' in ('PRODUCT_ROOM_UNAVAILABLE','PRODUCT_MATCH_STARTING') then
      raise exception 'REMATCH_ALREADY_STARTED';
    end if;
    raise exception '%',response->>'code';
  end if;
  return next_id;
end $$;

create function ink_product.require_rematch_invitee_v1()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if exists (
    select from ink_product.rooms r where r.id=new.room_id and r.previous_room_id is not null
      and not exists(select from ink_product.members m where m.room_id=r.previous_room_id and m.actor_id=new.actor_id)
  ) then
    raise insufficient_privilege using message='PRODUCT_ROOM_UNAVAILABLE';
  end if;
  return new;
end $$;

revoke all on function ink_product.require_rematch_invitee_v1() from public,anon,authenticated,service_role;
revoke all on function public.get_s5_item_rematch_v1(uuid),public.join_s5_item_rematch_v1(uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.get_s5_item_rematch_v1(uuid),public.join_s5_item_rematch_v1(uuid,uuid)
  to authenticated;

create trigger s5_require_rematch_invitee_v1 before insert or update of status,room_id,actor_id on ink_product.members
  for each row when (new.status='waiting') execute function ink_product.require_rematch_invitee_v1();

-- Preserve the room reader's existing membership check and scheduled-start transition.
alter function public.get_group_items_product_room_v1(uuid,jsonb) set schema ink_product;
alter function ink_product.get_group_items_product_room_v1(uuid,jsonb) rename to get_s5_room_before_race_display;
revoke all on function ink_product.get_s5_room_before_race_display(uuid,jsonb) from public,anon,authenticated,service_role;

create function public.get_group_items_product_room_v1(p_room uuid,p_binding jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare body jsonb := ink_product.get_s5_room_before_race_display(p_room,p_binding);
        viewer uuid := (body->>'participantId')::uuid;
        match_id uuid := (body->>'sessionId')::uuid;
        people jsonb;
begin
  if match_id is null then return body; end if;
  with members as (
    select m.participant_id,m.status,e.move_count,e.finished_at,
      p.observed_at,
      case when e.finished_at is not null then row_number() over(
        order by e.finished_at nulls last,m.participant_id)::int end as finish_rank
    from ink_product.members m
    left join ink_product_engine.ink_members_v1 e on e.session_id=match_id and e.participant_id=m.participant_id
    left join ink_product_engine.ink_s3_presence_v1 p on p.session_id=match_id
      and p.participant_id=m.participant_id and p.owner_epoch=m.owner_epoch
    where m.room_id=p_room
  ), documents as materialized (
    select p.page_id,s.revision_id,s.canonical_title
    from ink_product.s5_room_pages_v1(p_room) p join ink_product.wiki_snapshots s on s.id=p.snapshot_id
  )
  select coalesce(jsonb_agg(roster.player || jsonb_strip_nulls(jsonb_build_object(
    'status',case when m.status='playing' and m.observed_at<statement_timestamp()-interval '15 seconds'
      then 'disconnected' else m.status end,
    'moveCount',m.move_count,
    'rank',m.finish_rank,
    'elapsedSeconds',extract(epoch from(m.finished_at-l.started_at)),
    'pathTitles',case when m.participant_id=viewer or m.status in ('finished','left') then
      jsonb_build_array(body->'startDocument'->>'title') || coalesce(path.titles,'[]'::jsonb) end
  )) order by roster.position),'[]'::jsonb) into people
  from jsonb_array_elements(body->'players') with ordinality roster(player,position)
  join members m on m.participant_id=(roster.player->>'participantId')::uuid
  left join ink_product.group_lifecycle_v1 l on l.room_id=p_room
  left join lateral (
    select jsonb_agg(d.canonical_title order by step.version_after) as titles
    from ink_product_engine.ink_moves_v1 step
    join documents d on (d.page_id,d.revision_id)=(step.to_page_id,step.to_revision_id)
    where step.session_id=match_id and step.actor_participant_id=m.participant_id
      and (m.participant_id=viewer or m.status in ('finished','left'))
  ) path on true;
  return body || jsonb_build_object('players',people);
end $$;
revoke all on function public.get_group_items_product_room_v1(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.get_group_items_product_room_v1(uuid,jsonb) to authenticated;

-- Same aggregate exposed by the ordinary group profile, without exposing S5 match rows.
create function public.get_s5_item_profile_podium_v1(p_user uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('first',count(*) filter(where rank=1),
    'second',count(*) filter(where rank=2),'third',count(*) filter(where rank=3))
  from ink_product.result_projection_v1
  where actor_id=p_user and result_status='finished' and ink_product.request_actor_v1() is not null
$$;
revoke all on function public.get_s5_item_profile_podium_v1(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_s5_item_profile_podium_v1(uuid) to authenticated;

reset role;
do $restore$
begin
  if not (select had_create from pg_temp._s5_display_acl) then revoke create on schema public from ink_product_owner; end if;
  if not exists(select from pg_temp._s5_display_role) then revoke ink_product_owner from postgres;
  else
    if not (select inherit_option from pg_temp._s5_display_role) then grant ink_product_owner to postgres with inherit false; end if;
    if not (select set_option from pg_temp._s5_display_role) then grant ink_product_owner to postgres with set false; end if;
  end if;
end
$restore$;

alter function public.get_duel_v4_state(uuid) set schema private;
alter function private.get_duel_v4_state(uuid) rename to get_duel_v4_state_before_race_display;
revoke all on function private.get_duel_v4_state_before_race_display(uuid) from public,anon,authenticated,service_role;

create function public.get_duel_v4_state(p_room uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare body jsonb := private.get_duel_v4_state_before_race_display(p_room);
        people jsonb;
begin
  if body->>'finishedAt' is not null then
    return body || jsonb_build_object('resultRoomId',(select r.result_room_id from duel_v4.rooms r where r.id=p_room));
  end if;
  if body->>'startedAt' is null then return body; end if;
  select jsonb_agg(player || jsonb_build_object('disconnected',m.last_seen_at<statement_timestamp()-interval '15 seconds')
    order by position) into people
  from jsonb_array_elements(body->'players') with ordinality roster(player,position)
  join duel_v4.members m on m.room_id=p_room and m.user_id=(player->>'id')::uuid;
  return body || jsonb_build_object('players',people);
end $$;

revoke all on function public.get_duel_v4_state(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_duel_v4_state(uuid) to authenticated;
notify pgrst,'reload schema';
