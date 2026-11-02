-- Forward-only LOCAL CANDIDATE. No Production application is authorized.
begin;
create table private.duel_search_documents_v1 (
  snapshot_id uuid primary key references public.wiki_page_snapshots(id) on delete cascade,
  policy_version text not null check (policy_version='search-html-v1'),
  document_hash text not null check (document_hash ~ '^[0-9a-f]{64}$'),
  document_html text not null check (octet_length(document_html) between 1 and 4000000),
  text_nodes jsonb not null check (jsonb_typeof(text_nodes)='array'),
  created_at timestamptz not null default clock_timestamp()
);
create table private.duel_search_sessions_v1 (
  item_event_id uuid primary key references public.duel_item_events(id) on delete cascade,
  room_id uuid not null references public.game_rooms(id) on delete cascade,
  actor_user_id uuid not null references public.profiles(id) on delete cascade,
  source_snapshot_id uuid not null references public.wiki_page_snapshots(id),
  source_page_id text not null,
  source_revision_id text not null,
  source_progress_version bigint not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  consumed_request_id uuid
);
create table private.duel_search_requests_v1 (
  item_event_id uuid not null references private.duel_search_sessions_v1 on delete cascade,
  request_id uuid not null,
  query text not null,
  document_hash text not null,
  response jsonb not null,
  primary key(item_event_id,request_id)
);
alter table private.duel_search_documents_v1 enable row level security;
alter table private.duel_search_sessions_v1 enable row level security;
alter table private.duel_search_requests_v1 enable row level security;
revoke all on private.duel_search_documents_v1,private.duel_search_sessions_v1,private.duel_search_requests_v1 from public,anon,authenticated,service_role;
create index duel_search_sessions_actor_v1 on private.duel_search_sessions_v1(room_id,actor_user_id);

-- Capture the same authoritative identity as item activation, inside its existing transaction.
do $patch$
declare v_def text; v_anchor text:=E'  returning * into v_event;';
begin
  v_def:=pg_get_functiondef('public.use_duel_item_v3(uuid,uuid,uuid,uuid)'::regprocedure);
  if position(v_anchor in v_def)=0 or position('duel_search_sessions_v1' in v_def)>0 then raise exception 'SEARCH_USE_PATCH_ANCHOR'; end if;
  v_def:=replace(v_def,v_anchor,v_anchor||E'\n\n  if v_grant.item_id = ''search_once'' and v_result = ''applied'' then\n    insert into private.duel_search_sessions_v1(item_event_id,room_id,actor_user_id,source_snapshot_id,source_page_id,source_revision_id,source_progress_version,expires_at)\n    select v_event.id,p_room_id,v_user_id,s.id,v_actor.current_page_id,v_actor.current_revision_id,v_actor.progress_version,v_effect_expires\n    from public.wiki_page_snapshots s where s.page_id=v_actor.current_page_id and s.revision_id=v_actor.current_revision_id;\n    if not found then raise exception ''SEARCH_SOURCE_SNAPSHOT_MISSING''; end if;\n  end if;');
  execute v_def;
end; $patch$;

create function private.duel_search_guard_v1(p_room uuid,p_event uuid,p_actor uuid)
returns text language plpgsql security definer set search_path='' as $$
declare s private.duel_search_sessions_v1; r public.game_rooms; p public.room_players;
begin
  -- Same room -> participant -> session order as movement/item RPCs.
  select * into r from public.game_rooms where id=p_room and mode='duel' for update;
  if not found then return 'DUEL_ROOM_NOT_FOUND'; end if;
  select * into p from public.room_players where room_id=p_room and user_id=p_actor for update;
  if not found then return 'NOT_A_PARTICIPANT'; end if;
  select * into s from private.duel_search_sessions_v1 where item_event_id=p_event and room_id=p_room and actor_user_id=p_actor for update;
  if not found then return 'SEARCH_NOT_OWNED'; end if;
  if r.status<>'playing' or p.player_status<>'playing' then return 'GAME_NOT_ACTIVE'; end if;
  if clock_timestamp()>=s.expires_at then return 'SEARCH_EXPIRED'; end if;
  if p.current_page_id is distinct from s.source_page_id or p.current_revision_id is distinct from s.source_revision_id
    or exists(select 1 from public.game_move_events e where e.scope='duel' and e.game_id=p_room and e.affected_user_id=p_actor and e.version_after>s.source_progress_version)
    then return 'SEARCH_SOURCE_CHANGED'; end if;
  return null;
end; $$;
revoke all on function private.duel_search_guard_v1(uuid,uuid,uuid) from public,anon,authenticated,service_role;

create function public.get_duel_search_source_v1(p_room_id uuid,p_item_event_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid:=auth.uid(); code text; s private.duel_search_sessions_v1; d private.duel_search_documents_v1;
begin
  if a is null then raise exception 'AUTH_REQUIRED'; end if;
  code:=private.duel_search_guard_v1(p_room_id,p_item_event_id,a);
  if code is not null then return jsonb_build_object('ok',false,'code',code); end if;
  select * into s from private.duel_search_sessions_v1 where item_event_id=p_item_event_id;
  select * into d from private.duel_search_documents_v1 where snapshot_id=s.source_snapshot_id;
  return jsonb_build_object('ok',true,'code','SEARCH_SOURCE_READY','page_id',s.source_page_id,'revision_id',s.source_revision_id,
    'title',(select canonical_title_snapshot from public.wiki_page_snapshots where id=s.source_snapshot_id),
    'expires_at',s.expires_at,'consumed',s.consumed_at is not null,'document_hash',d.document_hash,'document_html',d.document_html,'text_nodes',d.text_nodes);
end; $$;
revoke all on function public.get_duel_search_source_v1(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_duel_search_source_v1(uuid,uuid) to authenticated;

-- Trusted Edge only: raw HTML/claimed matches from authenticated clients never enter these RPCs.
create function public.put_duel_search_document_v1(p_room_id uuid,p_item_event_id uuid,p_user_id uuid,p_document_hash text,p_document_html text,p_text_nodes jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare code text; s private.duel_search_sessions_v1; d private.duel_search_documents_v1;
begin
  code:=private.duel_search_guard_v1(p_room_id,p_item_event_id,p_user_id);
  if code is not null then return jsonb_build_object('ok',false,'code',code); end if;
  select * into s from private.duel_search_sessions_v1 where item_event_id=p_item_event_id;
  if s.consumed_at is not null then return jsonb_build_object('ok',false,'code','SEARCH_USED'); end if;
  if p_document_hash is null or p_document_hash !~ '^[0-9a-f]{64}$' or p_document_html is null or octet_length(p_document_html) not between 1 and 4000000
    or jsonb_typeof(p_text_nodes) is distinct from 'array' or exists(select 1 from jsonb_array_elements(p_text_nodes) n where jsonb_typeof(n)<>'string')
    then return jsonb_build_object('ok',false,'code','SEARCH_DOCUMENT_INVALID'); end if;
  insert into private.duel_search_documents_v1 values(s.source_snapshot_id,'search-html-v1',p_document_hash,p_document_html,p_text_nodes,clock_timestamp()) on conflict(snapshot_id) do nothing;
  select * into d from private.duel_search_documents_v1 where snapshot_id=s.source_snapshot_id;
  return jsonb_build_object('ok',true,'code','SEARCH_DOCUMENT_READY','document_hash',d.document_hash,'document_html',d.document_html,'text_nodes',d.text_nodes,'expires_at',s.expires_at);
end; $$;
revoke all on function public.put_duel_search_document_v1(uuid,uuid,uuid,text,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.put_duel_search_document_v1(uuid,uuid,uuid,text,text,jsonb) to service_role;

create function public.commit_duel_search_v1(p_room_id uuid,p_item_event_id uuid,p_user_id uuid,p_request_id uuid,p_query text,p_document_hash text,p_match_count integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare code text; s private.duel_search_sessions_v1; prev private.duel_search_requests_v1; result jsonb;
begin
  if p_request_id is null or p_query is null or length(p_query) not between 1 and 4096 or p_match_count is null or p_match_count<0 then return jsonb_build_object('ok',false,'code','INVALID_SEARCH_REQUEST'); end if;
  code:=private.duel_search_guard_v1(p_room_id,p_item_event_id,p_user_id);
  if code is not null then return jsonb_build_object('ok',false,'code',code); end if;
  select * into s from private.duel_search_sessions_v1 where item_event_id=p_item_event_id;
  if not exists(select 1 from private.duel_search_documents_v1 d where d.snapshot_id=s.source_snapshot_id and d.document_hash=p_document_hash) then return jsonb_build_object('ok',false,'code','SEARCH_DOCUMENT_MISMATCH'); end if;
  select * into prev from private.duel_search_requests_v1 where item_event_id=p_item_event_id and request_id=p_request_id;
  if found then
    if prev.query is distinct from p_query or prev.document_hash is distinct from p_document_hash then return jsonb_build_object('ok',false,'code','SEARCH_REQUEST_CONFLICT'); end if;
    return prev.response;
  end if;
  if s.consumed_at is not null then return jsonb_build_object('ok',false,'code','SEARCH_USED'); end if;
  result:=jsonb_build_object('ok',true,'code',case when p_match_count>0 then 'SEARCH_FOUND' else 'SEARCH_NOT_FOUND' end,'count',p_match_count,'query',p_query,'document_hash',p_document_hash,'expires_at',s.expires_at);
  if p_match_count>0 then
    update private.duel_search_sessions_v1 set consumed_at=clock_timestamp(),consumed_request_id=p_request_id where item_event_id=p_item_event_id;
  end if;
  insert into private.duel_search_requests_v1 values(p_item_event_id,p_request_id,p_query,p_document_hash,result);
  return result;
end; $$;
revoke all on function public.commit_duel_search_v1(uuid,uuid,uuid,uuid,text,text,integer) from public,anon,authenticated,service_role;
grant execute on function public.commit_duel_search_v1(uuid,uuid,uuid,uuid,text,text,integer) to service_role;
commit;
