-- The Supabase CLI owns this migration transaction. Only the new E contracts
-- use these transient reactions. The normal rooms and S5 race emote contracts stay intact.

create table duel_v4.kion_requests (
  room_id uuid not null references duel_v4.rooms(id) on delete cascade,
  sender_id uuid not null,
  request_id uuid not null,
  event_id uuid not null,
  emote_id text not null,
  sent_at timestamptz not null,
  primary key (room_id,sender_id,request_id)
);
create index duel_v4_kion_sender_time on duel_v4.kion_requests(room_id,sender_id,sent_at desc);
alter table duel_v4.kion_requests enable row level security;
revoke all on duel_v4.kion_requests from public,anon,authenticated,service_role;

create table duel_v4_events.kion_v1 (
  room_id uuid not null references duel_v4.rooms(id) on delete cascade,
  recipient_id uuid not null,
  sender_participant_id uuid not null,
  id uuid not null,
  emote_id text not null,
  sent_at timestamptz not null,
  primary key (room_id,recipient_id,sender_participant_id)
);
alter table duel_v4_events.kion_v1 enable row level security;
revoke all on duel_v4_events.kion_v1 from public,anon,authenticated,service_role;
grant select on duel_v4_events.kion_v1 to authenticated;

create function duel_v4_events.kion_recipient_v1(p_room uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists (
    select from duel_v4.rooms r join duel_v4.members m on m.room_id=r.id
    where r.id=p_room and m.user_id=(select auth.uid()) and r.finished_at is null
  )
$$;
revoke all on function duel_v4_events.kion_recipient_v1(uuid) from public,anon,authenticated,service_role;
grant execute on function duel_v4_events.kion_recipient_v1(uuid) to authenticated;
create policy duel_v4_kion_recipient on duel_v4_events.kion_v1 for select to authenticated
  using (recipient_id=(select auth.uid()) and
    sent_at>=statement_timestamp()-interval '6 seconds' and duel_v4_events.kion_recipient_v1(room_id));
alter publication supabase_realtime add table duel_v4_events.kion_v1;

create function public.send_duel_v4_kion_v1(p_room uuid,p_request uuid,p_emote_id text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  actor uuid:=auth.uid();
  previous duel_v4.kion_requests;
  own_event duel_v4_events.kion_v1;
  started timestamptz;
  at_time timestamptz;
  event_id uuid;
begin
  if actor is null then raise insufficient_privilege using message='AUTH_REQUIRED'; end if;
  if p_request is null or p_emote_id is null or p_emote_id not in
    ('hello','ready','go','good','wait','hurry','wow','lol','sad','gg')
  then return jsonb_build_object('accepted',false,'code','EMOTE_INVALID'); end if;

  select r.started_at into started from duel_v4.rooms r
  where r.id=p_room and r.finished_at is null and exists (
    select from duel_v4.members m where m.room_id=r.id and m.user_id=actor
  ) for share;
  if not found then return jsonb_build_object('accepted',false,'code','SENDER_NOT_ACTIVE'); end if;
  perform pg_advisory_xact_lock(hashtextextended('duel-v4-kion:'||p_room::text||':'||actor::text,0));
  at_time:=clock_timestamp();
  if started is not null and exists(
    select from duel_v4.members m where m.room_id=p_room and m.last_seen_at<=at_time-interval '60 seconds'
  ) then return jsonb_build_object('accepted',false,'code','SENDER_NOT_ACTIVE'); end if;

  select * into previous from duel_v4.kion_requests
  where room_id=p_room and sender_id=actor and request_id=p_request;
  if found then
    if previous.emote_id<>p_emote_id then return jsonb_build_object('accepted',false,'code','EMOTE_INVALID'); end if;
    select * into own_event from duel_v4_events.kion_v1 e where e.room_id=p_room and e.recipient_id=actor
      and e.sender_participant_id=actor and e.id=previous.event_id and e.sent_at>=at_time-interval '6 seconds';
    return jsonb_build_object('accepted',true,'code','ACCEPTED','event',case when own_event.id is not null then to_jsonb(own_event) end);
  end if;

  if exists(select from duel_v4.kion_requests r where room_id=p_room and sender_id=actor
    and r.sent_at>at_time-interval '3 seconds')
  then return jsonb_build_object('accepted',false,'code','EMOTE_RATE_LIMIT'); end if;

  event_id:=gen_random_uuid();
  insert into duel_v4.kion_requests values(p_room,actor,p_request,event_id,p_emote_id,at_time);
  insert into duel_v4_events.kion_v1(room_id,recipient_id,sender_participant_id,id,emote_id,sent_at)
  select p_room,m.user_id,actor,event_id,p_emote_id,at_time from duel_v4.members m where m.room_id=p_room
  on conflict (room_id,recipient_id,sender_participant_id) do update
    set id=excluded.id,emote_id=excluded.emote_id,sent_at=excluded.sent_at;
  select * into strict own_event from duel_v4_events.kion_v1
  where room_id=p_room and recipient_id=actor and sender_participant_id=actor;
  return jsonb_build_object('accepted',true,'code','ACCEPTED','event',to_jsonb(own_event));
end $$;

create function public.get_duel_v4_kion_v1(p_room uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(to_jsonb(e) order by e.sent_at,e.id),'[]'::jsonb)
  from duel_v4_events.kion_v1 e
  where duel_v4_events.kion_recipient_v1(p_room) and e.room_id=p_room
    and e.recipient_id=(select auth.uid()) and e.sent_at>=statement_timestamp()-interval '6 seconds'
$$;
revoke all on function public.send_duel_v4_kion_v1(uuid,uuid,text),public.get_duel_v4_kion_v1(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.send_duel_v4_kion_v1(uuid,uuid,text),public.get_duel_v4_kion_v1(uuid)
  to authenticated;

-- As with the initial S5 install, temporarily borrow only the existing owner
-- for DDL, then restore the exact baseline flags and public CREATE permission.
create temp table _e_s5_public_option on commit drop as
  select has_schema_privilege('ink_product_owner','public','CREATE') as had_create;
create temp table _e_s5_owner_options on commit drop as
  select m.inherit_option,m.set_option
  from pg_auth_members m
  where m.roleid='ink_product_owner'::regrole and m.member='postgres'::regrole
    and m.grantor='postgres'::regrole;
do $$begin
  if not exists(select from pg_auth_members where roleid='ink_product_owner'::regrole
    and member='postgres'::regrole and admin_option) then
    raise exception 'S5_EXISTING_OWNER_ADMIN_REQUIRED';
  end if;
end$$;
grant ink_product_owner to postgres with inherit true;
grant ink_product_owner to postgres with set true;
do $$begin
  if not (select had_create from pg_temp._e_s5_public_option) then
    grant create on schema public to ink_product_owner;
  end if;
end$$;

create table ink_product_events.lobby_kion_v1 (
  room_id uuid not null references ink_product.rooms(id) on delete cascade,
  recipient_id uuid not null,
  sender_participant_id uuid not null,
  id uuid not null,
  emote_id text not null,
  sent_at timestamptz not null,
  primary key (room_id,recipient_id,sender_participant_id)
);
alter table ink_product_events.lobby_kion_v1 enable row level security;
revoke all on ink_product_events.lobby_kion_v1 from public,anon,authenticated,service_role;
grant select on ink_product_events.lobby_kion_v1 to authenticated;
alter publication supabase_realtime add table ink_product_events.lobby_kion_v1;
alter table ink_product_events.lobby_kion_v1 owner to ink_product_owner;

create table ink_product_events.lobby_kion_requests_v1 (
  room_id uuid not null references ink_product.rooms(id) on delete cascade,
  sender_id uuid not null,
  request_id uuid not null,
  event_id uuid not null,
  emote_id text not null,
  primary key (room_id,sender_id,request_id)
);
alter table ink_product_events.lobby_kion_requests_v1 enable row level security;
revoke all on ink_product_events.lobby_kion_requests_v1 from public,anon,authenticated,service_role;
alter table ink_product_events.lobby_kion_requests_v1 owner to ink_product_owner;

create function ink_product_events.lobby_kion_recipient_v1(p_room uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists (
    select from ink_product.rooms r join ink_product.members m on m.room_id=r.id
    where r.id=p_room and r.phase='waiting' and m.status='waiting'
      and m.actor_id=(select ink_product.request_actor_v1())
  )
$$;
alter function ink_product_events.lobby_kion_recipient_v1(uuid) owner to ink_product_owner;
revoke all on function ink_product_events.lobby_kion_recipient_v1(uuid) from public,anon,authenticated,service_role;
grant execute on function ink_product_events.lobby_kion_recipient_v1(uuid) to authenticated;
create policy s5_lobby_kion_recipient on ink_product_events.lobby_kion_v1 for select to authenticated
  using (recipient_id=(select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),
    nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid) and sent_at>=statement_timestamp()-interval '6 seconds'
    and ink_product_events.lobby_kion_recipient_v1(room_id));

create function public.send_group_items_lobby_kion_v1(p_room uuid,p_request uuid,p_emote_id text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  actor uuid:=ink_product.request_actor_v1();
  previous ink_product_events.lobby_kion_requests_v1;
  own_event ink_product_events.lobby_kion_v1;
  sender_participant uuid;
  at_time timestamptz;
  rate_at timestamptz;
  event_id uuid;
begin
  if actor is null then raise insufficient_privilege using message='AUTH_REQUIRED'; end if;
  if p_request is null or p_emote_id is null or p_emote_id not in
    ('hello','ready','go','good','wait','hurry','wow','lol','sad','gg')
  then return jsonb_build_object('accepted',false,'code','EMOTE_INVALID'); end if;

  select m.participant_id into sender_participant
  from ink_product.rooms r join ink_product.members m on m.room_id=r.id
  where r.id=p_room and r.phase='waiting' and m.actor_id=actor and m.status='waiting'
  for share of r,m;
  if not found then return jsonb_build_object('accepted',false,'code','SENDER_NOT_ACTIVE'); end if;
  perform pg_advisory_xact_lock(hashtextextended('s5-lobby-kion:'||p_room::text||':'||actor::text,0));
  at_time:=clock_timestamp();

  select * into previous from ink_product_events.lobby_kion_requests_v1
  where room_id=p_room and sender_id=actor and request_id=p_request;
  if found then
    if previous.emote_id<>p_emote_id then return jsonb_build_object('accepted',false,'code','EMOTE_INVALID'); end if;
    select * into own_event from ink_product_events.lobby_kion_v1 e where e.room_id=p_room and e.recipient_id=actor
      and e.sender_participant_id=sender_participant and e.id=previous.event_id and e.sent_at>=at_time-interval '6 seconds';
    return jsonb_build_object('accepted',true,'code','ACCEPTED','event',case when own_event.id is not null then to_jsonb(own_event) end);
  end if;

  insert into ink_product_events.emote_limits_v1 as limits(room_id,sender_id,last_sent_at)
  values(p_room,actor,at_time)
  on conflict(room_id,sender_id) do update set last_sent_at=excluded.last_sent_at
  where limits.last_sent_at<=excluded.last_sent_at-interval '3 seconds'
  returning last_sent_at into rate_at;
  if rate_at is null then return jsonb_build_object('accepted',false,'code','EMOTE_RATE_LIMIT'); end if;

  event_id:=gen_random_uuid();
  insert into ink_product_events.lobby_kion_requests_v1 values(p_room,actor,p_request,event_id,p_emote_id);
  insert into ink_product_events.lobby_kion_v1(room_id,recipient_id,sender_participant_id,id,emote_id,sent_at)
  select p_room,m.actor_id,sender_participant,event_id,p_emote_id,at_time
  from ink_product.members m where m.room_id=p_room and m.status='waiting'
  on conflict(room_id,recipient_id,sender_participant_id) do update
    set id=excluded.id,emote_id=excluded.emote_id,sent_at=excluded.sent_at;
  select * into strict own_event from ink_product_events.lobby_kion_v1
  where room_id=p_room and recipient_id=actor and sender_participant_id=sender_participant;
  return jsonb_build_object('accepted',true,'code','ACCEPTED','event',to_jsonb(own_event));
end $$;

create function public.get_group_items_lobby_kion_v1(p_room uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(to_jsonb(e) order by e.sent_at,e.id),'[]'::jsonb)
  from ink_product_events.lobby_kion_v1 e
  where ink_product_events.lobby_kion_recipient_v1(p_room) and e.room_id=p_room
    and e.recipient_id=(select ink_product.request_actor_v1()) and e.sent_at>=statement_timestamp()-interval '6 seconds'
$$;

create function public.get_group_items_spectator_document_v1(
  p_room uuid,p_session uuid,p_binding jsonb,p_target_participant uuid
) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
  r ink_product.rooms;
  viewer ink_product.members;
  target_ids uuid[];
  snapshot ink_product.wiki_snapshots;
  next_mode boolean;
  html text;
  scope jsonb;
begin
  select * into r from ink_product.rooms
  where id=p_room and session_id=p_session and binding=p_binding and phase='playing';
  select * into viewer from ink_product.members
  where room_id=r.id and actor_id=ink_product.request_actor_v1() and status='finished';
  if viewer.actor_id is null then raise insufficient_privilege using message='PRODUCT_SPECTATOR_DOCUMENT_UNAVAILABLE'; end if;

  next_mode:=ink_product.is_next_v1(r.id);
  if exists (
    select from ink_product.group_lifecycle_v1 l where l.room_id=r.id
      and (l.closed_at is not null or ink_product.authority_now_v1(r.session_id)>=least(l.deadline_at,coalesce(l.grace_ends_at,l.deadline_at)))
  ) or (next_mode and not exists (
    select from ink_product_engine.ink_members_v1 e
    where e.session_id=r.session_id and e.participant_id=viewer.participant_id and e.user_id=viewer.actor_id
      and e.owner_epoch=viewer.owner_epoch and e.member_role='player' and e.player_status='finished'
  )) then raise insufficient_privilege using message='PRODUCT_SPECTATOR_DOCUMENT_UNAVAILABLE'; end if;

  select coalesce(array_agg(m.participant_id order by m.participant_id),'{}') into target_ids
  from ink_product.members m join ink_product.wiki_snapshots d on d.id=m.snapshot_id
  where m.room_id=r.id and m.status='playing' and (not next_mode or exists (
    select from ink_product_engine.ink_members_v1 e
    where e.session_id=r.session_id and e.participant_id=m.participant_id and e.user_id=m.actor_id
      and e.owner_epoch=m.owner_epoch and e.member_role='player' and e.player_status='playing'
      and e.current_page_id=d.page_id and e.current_revision_id=d.revision_id and e.progress_version=m.progress_version
  ));

  scope:=jsonb_build_object('roomId',r.id,'sessionId',r.session_id,'activeParticipantIds',target_ids);
  if p_target_participant is null then return scope; end if;
  if not (p_target_participant=any(target_ids)) then
    raise insufficient_privilege using message='PRODUCT_SPECTATOR_DOCUMENT_UNAVAILABLE';
  end if;

  select d.* into strict snapshot
  from ink_product.members m join ink_product.wiki_snapshots d on d.id=m.snapshot_id
  where m.room_id=r.id and m.participant_id=p_target_participant;
  select document_html into html from ink_product.wiki_documents where snapshot_id=snapshot.id;
  return scope || jsonb_build_object('participantId',p_target_participant,'pageId',snapshot.page_id,
    'revisionId',snapshot.revision_id,'canonicalTitle',snapshot.canonical_title,'documentHtml',html);
end $$;

alter function public.send_group_items_lobby_kion_v1(uuid,uuid,text) owner to ink_product_owner;
alter function public.get_group_items_lobby_kion_v1(uuid) owner to ink_product_owner;
alter function public.get_group_items_spectator_document_v1(uuid,uuid,jsonb,uuid) owner to ink_product_owner;
revoke all on function public.send_group_items_lobby_kion_v1(uuid,uuid,text),public.get_group_items_lobby_kion_v1(uuid),
  public.get_group_items_spectator_document_v1(uuid,uuid,jsonb,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.send_group_items_lobby_kion_v1(uuid,uuid,text),public.get_group_items_lobby_kion_v1(uuid),
  public.get_group_items_spectator_document_v1(uuid,uuid,jsonb,uuid)
  to authenticated;

do $$
declare before_grant record;
begin
  if not (select had_create from pg_temp._e_s5_public_option) then revoke create on schema public from ink_product_owner; end if;
  select * into before_grant from pg_temp._e_s5_owner_options;
  if found then
    execute format('grant ink_product_owner to postgres with inherit %s',before_grant.inherit_option);
    execute format('grant ink_product_owner to postgres with set %s',before_grant.set_option);
  else
    revoke ink_product_owner from postgres granted by current_user;
  end if;
end$$;
notify pgrst,'reload schema';
