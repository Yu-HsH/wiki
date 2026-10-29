-- LOCAL approved Duel preview authority. Forward-only, original item/move rules preserved.
create table private.duel_preview_sessions_v1 (
  item_event_id uuid primary key references public.duel_item_events(id) on delete cascade,
  room_id uuid not null references public.game_rooms(id) on delete cascade,
  actor_user_id uuid not null references public.profiles(id) on delete cascade,
  source_page_id text not null,
  source_revision_id text not null,
  source_snapshot_id uuid not null references public.wiki_page_snapshots(id),
  source_progress_version bigint not null,
  expires_at timestamptz not null
);
create table private.duel_preview_targets_v1 (
  item_event_id uuid not null references private.duel_preview_sessions_v1 on delete cascade,
  target_page_id text not null,
  status text not null check (status in ('reserved','ready','failed')),
  lease_token uuid not null,
  lease_until timestamptz not null,
  summary jsonb,
  primary key(item_event_id,target_page_id),
  check (status <> 'ready' or summary is not null)
);
create table private.duel_preview_requests_v1 (
  item_event_id uuid not null references private.duel_preview_sessions_v1 on delete cascade,
  request_id uuid not null,
  target_page_id text not null,
  primary key(item_event_id,request_id)
);
alter table private.duel_preview_sessions_v1 enable row level security;
alter table private.duel_preview_targets_v1 enable row level security;
alter table private.duel_preview_requests_v1 enable row level security;
revoke all on private.duel_preview_sessions_v1, private.duel_preview_targets_v1,
  private.duel_preview_requests_v1 from public, anon, authenticated, service_role;
-- No direct table permission is needed: narrow owner-executed RPCs are the only interface.
create index duel_preview_sessions_actor_v1 on private.duel_preview_sessions_v1(room_id,actor_user_id);
create index duel_preview_move_guard_v1 on public.game_move_events(game_id,affected_user_id,version_after) where scope='duel';

create function private.duel_preview_state_v1(p_event uuid,p_actor uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  s private.duel_preview_sessions_v1;
  r public.game_rooms;
  p public.room_players;
  v_now timestamptz := clock_timestamp();
  v_source boolean;
  v_active boolean;
  v_used integer;
  v_reserved integer;
  v_targets jsonb;
  v_entries jsonb;
begin
  select * into s from private.duel_preview_sessions_v1 where item_event_id=p_event and actor_user_id=p_actor;
  if not found then return null; end if;
  select * into r from public.game_rooms where id=s.room_id and mode='duel';
  select * into p from public.room_players where room_id=s.room_id and user_id=p_actor;
  v_source := p.id is not null and p.current_page_id=s.source_page_id
    and p.current_revision_id=s.source_revision_id and not exists (
      select 1 from public.game_move_events m where m.scope='duel' and m.game_id=s.room_id
      and m.affected_user_id=p_actor and m.version_after>s.source_progress_version
    );
  v_active := coalesce(v_source and r.status='playing' and p.player_status='playing' and s.expires_at>v_now,false);
  select count(*) filter(where status='ready'),count(*) filter(where status='reserved' and lease_until>v_now)
    into v_used,v_reserved from private.duel_preview_targets_v1 where item_event_id=p_event;
  select coalesce(jsonb_agg(jsonb_build_object('page_id',links.target_page_id,'title',links.title,'censored',exists (
    select 1 from public.duel_item_events e where e.room_id=s.room_id and e.target_user_id=p_actor
      and e.item_id='link_censorship' and e.result in ('applied','reflected') and e.effect_expires_at>v_now
      and ((e.metadata->'censoredPageIds') ? links.target_page_id or (e.metadata->'censoredTitles') ? links.title)
  )) order by links.ordinal), '[]'::jsonb) into v_targets
  from (select target_page_id,min(target_title_snapshot) as title,min(ordinal) as ordinal
    from public.wiki_snapshot_links where snapshot_id=s.source_snapshot_id group by target_page_id) links;
  select coalesce(jsonb_agg(jsonb_build_object('page_id',t.target_page_id,'status',
      case when t.status='reserved' and t.lease_until<=v_now then 'failed' else t.status end,
      'lease_until',t.lease_until,'summary',case when v_active then t.summary else null end)
      order by t.target_page_id),'[]'::jsonb) into v_entries
    from private.duel_preview_targets_v1 t where t.item_event_id=p_event;
  return jsonb_build_object('item_event_id',p_event,'source_page_id',s.source_page_id,
    'source_revision_id',s.source_revision_id,'source_progress_version',s.source_progress_version,
    'expires_at',s.expires_at,'source_valid',coalesce(v_source,false),'expired',s.expires_at<=v_now,
    'active',v_active,'used',v_used,'reserved',case when v_active then v_reserved else 0 end,'max',3,
    'candidates',v_targets,'entries',v_entries,'server_now',v_now);
end; $$;

create function public.reserve_duel_preview_v1(p_room_id uuid,p_item_event_id uuid,p_target_page_id text,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid:=auth.uid();
  s private.duel_preview_sessions_v1;
  t private.duel_preview_targets_v1;
  v_state jsonb;
  v_bound text;
  v_title text;
  v_now timestamptz;
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_request_id is null then raise exception 'REQUEST_ID_REQUIRED'; end if;
  perform 1 from public.game_rooms where id=p_room_id and mode='duel' for update;
  if not found then raise exception 'DUEL_ROOM_NOT_FOUND'; end if;
  perform 1 from public.room_players where room_id=p_room_id and user_id=v_actor for update;
  if not found then raise exception 'NOT_A_PARTICIPANT'; end if;
  select * into s from private.duel_preview_sessions_v1
    where item_event_id=p_item_event_id and room_id=p_room_id and actor_user_id=v_actor for update;
  if not found then return jsonb_build_object('ok',false,'code','PREVIEW_NOT_OWNED','server_now',clock_timestamp()); end if;
  v_state:=private.duel_preview_state_v1(p_item_event_id,v_actor);
  select target_page_id into v_bound from private.duel_preview_requests_v1 where item_event_id=p_item_event_id and request_id=p_request_id;
  if v_bound is not null and v_bound is distinct from p_target_page_id then
    return jsonb_build_object('ok',false,'code','PREVIEW_REQUEST_CONFLICT','preview_state',v_state,'server_now',clock_timestamp());
  end if;
  if not (v_state->>'active')::boolean then
    return jsonb_build_object('ok',false,'code',case when not (v_state->>'source_valid')::boolean then 'PREVIEW_SOURCE_CHANGED'
      when (v_state->>'expired')::boolean then 'PREVIEW_EXPIRED' else 'GAME_NOT_ACTIVE' end,'preview_state',v_state,'server_now',clock_timestamp());
  end if;
  select x->>'title' into v_title from jsonb_array_elements(v_state->'candidates') x
    where x->>'page_id'=p_target_page_id;
  if v_title is null then return jsonb_build_object('ok',false,'code','PREVIEW_TARGET_INVALID','preview_state',v_state,'server_now',clock_timestamp()); end if;
  if exists(select 1 from jsonb_array_elements(v_state->'candidates') x where x->>'page_id'=p_target_page_id and (x->>'censored')::boolean) then
    return jsonb_build_object('ok',false,'code','LINK_CENSORED','preview_state',v_state,'server_now',clock_timestamp());
  end if;
  v_now:=clock_timestamp(); -- after room/player locks; an elapsed lease never remains approved
  update private.duel_preview_targets_v1 set status='failed',summary=null where item_event_id=p_item_event_id and status='reserved' and lease_until<=v_now;
  select * into t from private.duel_preview_targets_v1 where item_event_id=p_item_event_id and target_page_id=p_target_page_id;
  if t.status='ready' then
    insert into private.duel_preview_requests_v1 values(p_item_event_id,p_request_id,p_target_page_id) on conflict do nothing;
    return jsonb_build_object('ok',true,'code','PREVIEW_READY','entry',t.summary,'preview_state',private.duel_preview_state_v1(p_item_event_id,v_actor),'server_now',clock_timestamp());
  end if;
  if t.status='reserved' then return jsonb_build_object('ok',false,'code','PREVIEW_PENDING','preview_state',v_state,'server_now',clock_timestamp()); end if;
  if (select count(*) from private.duel_preview_targets_v1 where item_event_id=p_item_event_id and status in ('reserved','ready'))>=3 then
    return jsonb_build_object('ok',false,'code','PREVIEW_LIMIT_REACHED','preview_state',private.duel_preview_state_v1(p_item_event_id,v_actor),'server_now',clock_timestamp());
  end if;
  insert into private.duel_preview_requests_v1 values(p_item_event_id,p_request_id,p_target_page_id) on conflict do nothing;
  insert into private.duel_preview_targets_v1 values(p_item_event_id,p_target_page_id,'reserved',extensions.gen_random_uuid(),least(v_now+interval '6 seconds',s.expires_at),null)
    on conflict(item_event_id,target_page_id) do update set status='reserved',lease_token=excluded.lease_token,lease_until=excluded.lease_until,summary=null returning * into t;
  return jsonb_build_object('ok',true,'code','PREVIEW_RESERVED','lease_token',t.lease_token,'lease_until',t.lease_until,
    'target_title',v_title,'preview_state',private.duel_preview_state_v1(p_item_event_id,v_actor),'server_now',clock_timestamp());
end; $$;

create function public.settle_duel_preview_v1(p_room_id uuid,p_item_event_id uuid,p_user_id uuid,
  p_target_page_id text,p_request_id uuid,p_lease_token uuid,p_summary jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s private.duel_preview_sessions_v1; t private.duel_preview_targets_v1; v_state jsonb;
begin
  perform 1 from public.game_rooms where id=p_room_id and mode='duel' for update;
  if not found then return jsonb_build_object('ok',false,'code','DUEL_ROOM_NOT_FOUND'); end if;
  perform 1 from public.room_players where room_id=p_room_id and user_id=p_user_id for update;
  if not found then return jsonb_build_object('ok',false,'code','NOT_A_PARTICIPANT'); end if;
  select * into s from private.duel_preview_sessions_v1 where item_event_id=p_item_event_id and room_id=p_room_id and actor_user_id=p_user_id for update;
  if not found then return jsonb_build_object('ok',false,'code','PREVIEW_NOT_OWNED'); end if;
  v_state:=private.duel_preview_state_v1(p_item_event_id,p_user_id);
  select * into t from private.duel_preview_targets_v1 where item_event_id=p_item_event_id and target_page_id=p_target_page_id;
  if t.lease_token is distinct from p_lease_token or not exists (
    select 1 from private.duel_preview_requests_v1 where item_event_id=p_item_event_id and request_id=p_request_id and target_page_id=p_target_page_id
  ) then return jsonb_build_object('ok',false,'code','PREVIEW_LEASE_INVALID','preview_state',v_state,'server_now',clock_timestamp()); end if;
  if not (v_state->>'active')::boolean then
    if t.status='reserved' then update private.duel_preview_targets_v1 set status='failed' where item_event_id=p_item_event_id and target_page_id=p_target_page_id; end if;
    return jsonb_build_object('ok',false,'code',case when not (v_state->>'source_valid')::boolean then 'PREVIEW_SOURCE_CHANGED'
      when (v_state->>'expired')::boolean then 'PREVIEW_EXPIRED' else 'GAME_NOT_ACTIVE' end,'preview_state',private.duel_preview_state_v1(p_item_event_id,p_user_id),'server_now',clock_timestamp());
  end if;
  if exists(select 1 from jsonb_array_elements(v_state->'candidates') x where x->>'page_id'=p_target_page_id and (x->>'censored')::boolean) then
    if t.status='reserved' then update private.duel_preview_targets_v1 set status='failed' where item_event_id=p_item_event_id and target_page_id=p_target_page_id; end if;
    return jsonb_build_object('ok',false,'code','LINK_CENSORED','preview_state',private.duel_preview_state_v1(p_item_event_id,p_user_id),'server_now',clock_timestamp());
  end if;
  if t.status='ready' then return jsonb_build_object('ok',true,'code','PREVIEW_READY','entry',t.summary,'preview_state',v_state,'server_now',clock_timestamp()); end if;
  if t.status<>'reserved' or t.lease_until<=clock_timestamp() then return jsonb_build_object('ok',false,'code','PREVIEW_LEASE_INVALID','preview_state',v_state,'server_now',clock_timestamp()); end if;
  if p_summary is null or jsonb_typeof(p_summary->'extract') is distinct from 'string'
    or btrim(p_summary->>'extract')='' or p_summary->>'page_id' is distinct from p_target_page_id then
    update private.duel_preview_targets_v1 set status='failed',summary=null where item_event_id=p_item_event_id and target_page_id=p_target_page_id;
    return jsonb_build_object('ok',false,'code','PREVIEW_UNAVAILABLE','preview_state',private.duel_preview_state_v1(p_item_event_id,p_user_id),'server_now',clock_timestamp());
  end if;
  update private.duel_preview_targets_v1 set status='ready',summary=jsonb_build_object(
    'page_id',p_target_page_id,'title',p_summary->>'title','extract',p_summary->>'extract','description',p_summary->>'description')
    where item_event_id=p_item_event_id and target_page_id=p_target_page_id returning * into t;
  return jsonb_build_object('ok',true,'code','PREVIEW_READY','entry',t.summary,'preview_state',private.duel_preview_state_v1(p_item_event_id,p_user_id),'server_now',clock_timestamp());
end; $$;

revoke all on function private.duel_preview_state_v1(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.reserve_duel_preview_v1(uuid,uuid,text,uuid) from public,anon;
grant execute on function public.reserve_duel_preview_v1(uuid,uuid,text,uuid) to authenticated;
revoke all on function public.settle_duel_preview_v1(uuid,uuid,uuid,text,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.settle_duel_preview_v1(uuid,uuid,uuid,text,uuid,uuid,jsonb) to service_role;

-- Insert only preview bookkeeping into the existing, already-tested item transaction.
-- Fail closed if its anchors drift; do not replace private movement or item balance.
do $patch$
declare v_def text; v_anchor text;
begin
  v_def:=pg_get_functiondef('public.use_duel_item_v3(uuid,uuid,uuid,uuid)'::regprocedure);
  v_anchor:=E'  returning * into v_event;';
  if position(v_anchor in v_def)=0 or position('duel_preview_sessions_v1' in v_def)>0 then raise exception 'PREVIEW_USE_PATCH_ANCHOR'; end if;
  v_def:=replace(v_def,v_anchor,v_anchor||E'\n\n  if v_grant.item_id = ''link_preview'' and v_result = ''applied'' then\n    insert into private.duel_preview_sessions_v1(item_event_id,room_id,actor_user_id,source_page_id,source_revision_id,source_snapshot_id,source_progress_version,expires_at)\n    select v_event.id,p_room_id,v_user_id,v_actor.current_page_id,v_actor.current_revision_id,snapshot.id,v_actor.progress_version,v_effect_expires\n    from public.wiki_page_snapshots snapshot where snapshot.page_id=v_actor.current_page_id and snapshot.revision_id=v_actor.current_revision_id;\n    if not found then raise exception ''PREVIEW_SOURCE_SNAPSHOT_MISSING''; end if;\n  end if;');
  v_anchor:=E'  insert into public.game_mutation_requests(';
  if position(v_anchor in v_def)=0 then raise exception 'PREVIEW_RESPONSE_PATCH_ANCHOR'; end if;
  v_def:=replace(v_def,v_anchor,E'  if v_grant.item_id = ''link_preview'' and v_result = ''applied'' then\n    v_response := v_response || jsonb_build_object(''preview_state'',private.duel_preview_state_v1(v_event.id,v_user_id));\n  end if;\n\n'||v_anchor);
  execute v_def;
  v_def:=pg_get_functiondef('public.get_duel_item_state_v3(uuid)'::regprocedure);
  v_anchor:=E'    ''pending_defenses'', v_defenses,';
  if position(v_anchor in v_def)=0 or position('preview_states' in v_def)>0 then raise exception 'PREVIEW_STATE_PATCH_ANCHOR'; end if;
  v_def:=replace(v_def,v_anchor,v_anchor||E'\n    ''preview_states'', (select coalesce(jsonb_agg(private.duel_preview_state_v1(s.item_event_id,v_user_id) order by s.expires_at),''[]''::jsonb) from private.duel_preview_sessions_v1 s where s.room_id=p_room_id and s.actor_user_id=v_user_id),');
  execute v_def;
end; $patch$;
