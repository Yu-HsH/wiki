-- CLI owns the migration transaction and history INSERT.

create table duel_v4.search_documents (
  snapshot_id uuid primary key references public.wiki_page_snapshots(id) on delete cascade,
  document_hash text not null,
  document_html text not null check (octet_length(document_html) between 1 and 4000000),
  text_nodes text[] not null
);

create table duel_v4.search_windows (
  id uuid primary key,
  room_id uuid not null,
  user_id uuid not null,
  foreign key (room_id,user_id) references duel_v4.members on delete cascade,
  grant_id uuid not null references duel_v4.grants on delete cascade,
  snapshot_id uuid not null references public.wiki_page_snapshots(id),
  progress_version bigint not null,
  tier text not null check (tier in ('normal','enhanced','weakened')),
  opened_at timestamptz not null,
  started_at timestamptz,
  used smallint not null default 0 check (used between 0 and 3),
  last_query text,
  last_count integer,
  available_at timestamptz,
  check ((used=0) = (started_at is null))
);
create index duel_v4_search_frame on duel_v4.search_windows(room_id,user_id,progress_version,opened_at desc);
alter table duel_v4.search_documents enable row level security;
alter table duel_v4.search_windows enable row level security;
revoke all on duel_v4.search_documents,duel_v4.search_windows from public,anon,authenticated,service_role;

create function duel_v4.active_search(member duel_v4.members, at_time timestamptz)
returns duel_v4.search_windows language sql stable set search_path='' as $$
  select w.* from duel_v4.search_windows w
  where (w.room_id,w.user_id,w.snapshot_id,w.progress_version)=(member.room_id,member.user_id,member.snapshot_id,member.progress_version)
    and (
      (w.started_at is not null and at_time<w.started_at+interval '15 seconds') or
      (w.started_at is null and exists(select from duel_v4.grants g where g.id=w.grant_id
        and (g.room_id,g.user_id)=(member.room_id,member.user_id) and g.consumed_at is null))
    )
  order by w.opened_at desc,w.id limit 1
$$;

create function duel_v4.search_state(room duel_v4.rooms, actor uuid, at_time timestamptz)
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object(
    'id',w.id,'snapshotId',w.snapshot_id,'progressVersion',w.progress_version,
    'tier',case when w.started_at is null then duel_v4.tier(g) else w.tier end,
    'documentHash',d.document_hash,'expiresAt',w.started_at+interval '15 seconds',
    'remaining',case when (case when w.started_at is null then duel_v4.tier(g) else w.tier end)='enhanced'
      then 3-w.used else 1-w.used end,
    'lastResult',case when w.used>0 then jsonb_build_object('query',w.last_query,'availableAt',w.available_at,
      'count',case when w.available_at<=at_time then w.last_count end) end
  )
  from duel_v4.members m
  cross join lateral duel_v4.active_search(m,at_time) w
  join duel_v4.grants g on g.id=w.grant_id
  left join duel_v4.search_documents d on d.snapshot_id=w.snapshot_id
  where m.room_id=room.id and m.user_id=actor and room.finished_at is null and w.id is not null
$$;

alter function duel_v4.project(duel_v4.rooms,uuid,timestamptz) rename to project_base;
create function duel_v4.project(room duel_v4.rooms, actor uuid, at_time timestamptz)
returns jsonb language sql stable set search_path='' as $$
  select duel_v4.project_base(room,actor,at_time)||jsonb_build_object('search',duel_v4.search_state(room,actor,at_time))
$$;

alter function duel_v4.activate(duel_v4.rooms,duel_v4.members,uuid,uuid,jsonb,timestamptz) rename to activate_base;
create function duel_v4.activate(room duel_v4.rooms, member duel_v4.members, opponent uuid,
  request uuid, input jsonb, at_time timestamptz) returns text
language plpgsql set search_path='' as $$
declare
  g duel_v4.grants;
  w duel_v4.search_windows;
begin
  select * into g from duel_v4.grants where id=(input->>'grantId')::uuid
    and room_id=room.id and user_id=member.user_id and consumed_at is null;
  if g.item_id is distinct from 'search' then
    return duel_v4.activate_base(room,member,opponent,request,input,at_time);
  end if;
  if exists(select from duel_v4.effects e where (e.room_id,e.user_id)=(room.id,member.user_id)
    and e.kind in ('stun','cannon_stun','trap_stun','thunder_seal') and e.ended_at is null
    and e.starts_at<=at_time and at_time<e.expires_at) then
    raise check_violation using message='ITEM_SEALED';
  end if;
  w:=duel_v4.active_search(member,at_time);
  if w.id is null then
    insert into duel_v4.search_windows(id,room_id,user_id,grant_id,snapshot_id,progress_version,tier,opened_at)
    values(gen_random_uuid(),room.id,member.user_id,g.id,member.snapshot_id,member.progress_version,duel_v4.tier(g),at_time);
  end if;
  return 'SEARCH_OPENED';
end $$;

create function duel_v4.search_source(p_room uuid,p_window uuid,p_actor uuid)
returns jsonb language sql stable set search_path='' as $$
  select coalesce((
    select jsonb_build_object('ok',true,'snapshotId',s.id,'pageId',s.page_id,'revisionId',s.revision_id,
      'title',s.canonical_title_snapshot,'documentHtml',d.document_html,'documentHash',d.document_hash)
    from duel_v4.rooms r
    join duel_v4.members m on m.room_id=r.id and m.user_id=p_actor
    cross join lateral duel_v4.active_search(m,statement_timestamp()) w
    join public.wiki_page_snapshots s on s.id=w.snapshot_id
    left join duel_v4.search_documents d on d.snapshot_id=w.snapshot_id
    where r.id=p_room and r.finished_at is null and w.id=p_window
  ),jsonb_build_object('ok',false,'code','SEARCH_UNAVAILABLE'))
$$;

create function public.get_duel_v4_search_source(p_room uuid,p_window uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select duel_v4.search_source(p_room,p_window,auth.uid())
$$;

-- Only the authenticated Edge handler holds this write capability.
create function public.store_duel_v4_search_document(p_room uuid,p_window uuid,p_actor uuid,p_snapshot uuid,
  p_html text,p_text_nodes text[])
returns jsonb language plpgsql security definer set search_path='' as $$
declare source jsonb;
begin
  select duel_v4.search_source(p_room,p_window,p_actor) into source;
  if source->>'snapshotId' is distinct from p_snapshot::text
    or p_snapshot is null then
    return jsonb_build_object('ok',false,'code','SEARCH_SOURCE_CHANGED');
  end if;
  if p_html is null or octet_length(p_html) not between 1 and 4000000
    or p_text_nodes is null or array_position(p_text_nodes,null) is not null
    or coalesce((select sum(octet_length(t)) from unnest(p_text_nodes) t),0)>4000000 then
    return jsonb_build_object('ok',false,'code','SEARCH_INVALID_DOCUMENT');
  end if;
  insert into duel_v4.search_documents(snapshot_id,document_hash,document_html,text_nodes)
  values(p_snapshot,encode(sha256(convert_to('search-html-v1','UTF8')||decode('00','hex')||convert_to(p_html,'UTF8')),'hex'),
    p_html,p_text_nodes) on conflict (snapshot_id) do nothing;
  return duel_v4.search_source(p_room,p_window,p_actor);
end $$;

create function public.submit_duel_v4_search(p_room uuid,p_window uuid,p_request uuid,p_query text,p_document_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor uuid:=auth.uid();
  room duel_v4.rooms;
  member duel_v4.members;
  w duel_v4.search_windows;
  g duel_v4.grants;
  doc duel_v4.search_documents;
  prior duel_v4.receipts;
  request_input jsonb;
  reply jsonb;
  at_time timestamptz;
  changed boolean;
  hits integer;
  query text:=btrim(p_query,U&'\0009\000a\000b\000c\000d\0020\00a0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200a\2028\2029\202f\205f\3000\feff');
begin
  if p_request is null or p_window is null or query is null or char_length(query) not between 1 and 4096
    or p_document_hash is null or p_document_hash !~ '^[a-f0-9]{64}$' then
    raise invalid_parameter_value using message='INVALID_SEARCH_INPUT';
  end if;
  select r.* into room from duel_v4.rooms r where r.id=p_room
    and exists(select from duel_v4.members m where (m.room_id,m.user_id)=(r.id,actor)) for update;
  if not found then raise insufficient_privilege using message='DUEL_V4_MEMBER_REQUIRED'; end if;

  request_input:=jsonb_build_object('windowId',p_window,'query',query,'documentHash',p_document_hash);
  select * into prior from duel_v4.receipts where (room_id,user_id,request_id)=(p_room,actor,p_request);
  if found then
    if (prior.operation,prior.input) is distinct from ('search_submit'::text,request_input) then
      raise invalid_parameter_value using message='REQUEST_ID_REUSED';
    end if;
    return prior.result;
  end if;
  at_time:=clock_timestamp();
  changed:=duel_v4.advance(room,at_time);
  select * into strict room from duel_v4.rooms where id=p_room;
  select * into strict member from duel_v4.members where (room_id,user_id)=(p_room,actor);
  w:=duel_v4.active_search(member,at_time);

  if room.finished_at is not null or w.id is distinct from p_window then
    reply:=jsonb_build_object('ok',false,'code','SEARCH_UNAVAILABLE');
  elsif exists(select from duel_v4.effects e where (e.room_id,e.user_id)=(room.id,actor)
    and e.kind in ('stun','cannon_stun','trap_stun','thunder_seal') and e.ended_at is null
    and e.starts_at<=at_time and at_time<e.expires_at) then
    reply:=jsonb_build_object('ok',false,'code','ITEM_SEALED');
  else
    select * into doc from duel_v4.search_documents where snapshot_id=w.snapshot_id;
    if doc.document_hash is distinct from p_document_hash then
      reply:=jsonb_build_object('ok',false,'code','SEARCH_SOURCE_CHANGED');
    elsif w.used>=(case when w.tier='enhanced' then 3 else 1 end) then
      reply:=jsonb_build_object('ok',false,'code','SEARCH_USED');
    else
      if w.started_at is null then
        select * into strict g from duel_v4.grants where id=w.grant_id;
        w.tier:=duel_v4.tier(g);
        w.started_at:=at_time;
        update duel_v4.grants set consumed_at=at_time,consumed_request=p_request
          where id=w.grant_id;
      end if;
      select coalesce(sum(regexp_count(node,'***='||query,1,'i')),0)::integer into hits from unnest(doc.text_nodes) nodes(node);
      update duel_v4.search_windows set started_at=w.started_at,tier=w.tier,used=w.used+1,last_query=query,
        last_count=hits,available_at=at_time+(case when w.tier='weakened' then interval '2 seconds' else interval '0' end)
        where id=w.id;
      update duel_v4.members set last_seen_at=at_time where (room_id,user_id)=(p_room,actor);
      reply:=jsonb_build_object('ok',true,'code','SEARCH_SUBMITTED');
      changed:=true;
    end if;
  end if;
  reply:=reply||jsonb_build_object('requestId',p_request);
  insert into duel_v4.receipts values(p_room,actor,p_request,'search_submit',request_input,reply);
  if changed then perform duel_v4.publish(p_room); end if;
  return reply;
end $$;

update duel_v4.catalog set review_enabled=true where item_id='search';
revoke all on all functions in schema duel_v4 from public,anon,authenticated,service_role;
revoke all on function public.get_duel_v4_search_source(uuid,uuid),public.submit_duel_v4_search(uuid,uuid,uuid,text,text),
  public.store_duel_v4_search_document(uuid,uuid,uuid,uuid,text,text[]) from public,anon,authenticated,service_role;
grant execute on function public.get_duel_v4_search_source(uuid,uuid),public.submit_duel_v4_search(uuid,uuid,uuid,text,text)
  to authenticated;
grant execute on function public.store_duel_v4_search_document(uuid,uuid,uuid,uuid,text,text[]) to service_role;

notify pgrst,'reload schema';
