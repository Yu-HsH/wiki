-- Opt in on new rooms. Existing fixed courses, matches, and clients keep their contract.
create temp table _s5_free_roles on commit drop as
select inherit_option,set_option from pg_auth_members
where roleid='ink_product_owner'::regrole and member='postgres'::regrole and grantor='postgres'::regrole;

create temp table _s5_free_acl on commit drop as
select has_schema_privilege('ink_product_owner','public','CREATE') as had_create;
grant create on schema public to ink_product_owner;
grant select on public.wiki_page_snapshots,public.wiki_snapshot_links to ink_product_owner;
create policy s5_snapshot_read on public.wiki_page_snapshots for select to ink_product_owner using (true);
create policy s5_snapshot_links_read on public.wiki_snapshot_links for select to ink_product_owner using (true);
grant ink_product_owner to postgres with inherit true;
grant ink_product_owner to postgres with set true;

set local role ink_product_owner;
alter table ink_product.rooms add column free_wiki boolean not null default false;
create table ink_product.free_wiki_pages_v1 (
  room_id uuid not null references ink_product.rooms(id) on delete cascade,
  page_id text not null,
  snapshot_id uuid not null references ink_product.wiki_snapshots(id),
  primary key(room_id,page_id)
);
alter table ink_product.free_wiki_pages_v1 enable row level security;
alter table ink_product.free_wiki_pages_v1 force row level security;
create policy owner_access on ink_product.free_wiki_pages_v1 to ink_product_owner using (true) with check (true);
revoke all on ink_product.free_wiki_pages_v1 from public,anon,authenticated,service_role;

-- S5 keeps its immutable snapshot keys for inventory, movement logs and resume.
-- The original public snapshot and its links remain the only Wikipedia authority.
create function ink_product.import_free_wiki_snapshot_v1(p_public_id uuid)
returns uuid language plpgsql strict set search_path='' as $$
declare
  source public.wiki_page_snapshots;
  projected uuid;
begin
  select * into source from public.wiki_page_snapshots where id=p_public_id;
  if source.id is null then return null; end if;
  insert into ink_product.wiki_snapshots(page_id,revision_id,canonical_title,wiki_snapshot_id)
  values(source.page_id,source.revision_id,source.canonical_title_snapshot,source.id)
  on conflict(page_id,revision_id) do nothing;
  select id into projected from ink_product.wiki_snapshots
  where page_id=source.page_id and revision_id=source.revision_id and canonical_title=source.canonical_title_snapshot;
  return projected;
end $$;

create function ink_product.pin_free_wiki_page_v1(p_room uuid,p_snapshot uuid)
returns uuid language sql strict set search_path='' as $$
  insert into ink_product.free_wiki_pages_v1(room_id,page_id,snapshot_id)
  select r.id,s.page_id,s.id from ink_product.rooms r cross join ink_product.wiki_snapshots s
  where r.id=p_room and r.free_wiki and s.id=p_snapshot
  on conflict(room_id,page_id) do update set snapshot_id=free_wiki_pages_v1.snapshot_id
  returning snapshot_id
$$;

create function ink_product.s5_wiki_public_id_v1(p_snapshot uuid)
returns uuid language sql stable strict set search_path='' as $$
  select w.id from ink_product.wiki_snapshots s join public.wiki_page_snapshots w using(page_id,revision_id)
  where s.id=p_snapshot and s.canonical_title=w.canonical_title_snapshot
$$;

create function ink_product.s5_room_pages_v1(p_room uuid)
returns table(page_id text,snapshot_id uuid) language sql stable strict set search_path='' as $$
  select c.page_id,c.snapshot_id from ink_product.rooms r
  join ink_product.wiki_course_pages c on c.binding=r.binding
  where r.id=p_room and not r.free_wiki
  union all
  select c.page_id,c.snapshot_id from ink_product.rooms r join ink_product.free_wiki_pages_v1 c on c.room_id=r.id
  where r.id=p_room and r.free_wiki
$$;

create function ink_product.s5_document_links_v1(p_room uuid,p_snapshot uuid)
returns setof ink_product.wiki_links language sql stable strict set search_path='' as $$
  select p_snapshot,l.target_page_id,l.target_title_snapshot,array[]::text[]
  from ink_product.rooms r join public.wiki_snapshot_links l
    on l.snapshot_id=ink_product.s5_wiki_public_id_v1(p_snapshot)
  where r.id=p_room and r.free_wiki
  union all
  select l.* from ink_product.rooms r join ink_product.wiki_links l on l.snapshot_id=p_snapshot
  where r.id=p_room and not r.free_wiki
$$;

-- Like v4, forced moves use cached destination snapshots. During the match,
-- project at most six verified direct destinations for the current document.
-- This function never calls Wikipedia, examines the goal, or walks a path.
create function ink_product.s5_cache_adjacent_wiki_v1(p_room uuid,p_source uuid)
returns void language plpgsql strict set search_path='' as $$
declare destination uuid;
begin
  if not exists(select from ink_product.rooms where id=p_room and free_wiki) then return; end if;
  for destination in
    select s.id from public.wiki_snapshot_links l
    cross join lateral (
      select w.id from public.wiki_page_snapshots w where w.page_id=l.target_page_id
        and (l.target_revision_id is null or w.revision_id=l.target_revision_id)
      order by w.fetched_at desc,w.id limit 1
    ) s
    where l.snapshot_id=ink_product.s5_wiki_public_id_v1(p_source)
      and not exists(select from ink_product.free_wiki_pages_v1 c where c.room_id=p_room and c.page_id=l.target_page_id)
    order by l.ordinal limit 6
  loop
    perform ink_product.pin_free_wiki_page_v1(p_room,ink_product.import_free_wiki_snapshot_v1(destination));
  end loop;
end $$;

revoke all on function ink_product.import_free_wiki_snapshot_v1(uuid),
  ink_product.pin_free_wiki_page_v1(uuid,uuid),ink_product.s5_wiki_public_id_v1(uuid),
  ink_product.s5_room_pages_v1(uuid),ink_product.s5_document_links_v1(uuid,uuid),
  ink_product.s5_cache_adjacent_wiki_v1(uuid,uuid) from public,anon,authenticated,service_role;

create or replace function ink_product.course_document(p_session uuid,p_page text)
returns ink_product.wiki_snapshots language sql stable strict set search_path='' as $$
  select s.* from ink_product.rooms r cross join lateral ink_product.s5_room_pages_v1(r.id) p
  join ink_product.wiki_snapshots s on s.id=p.snapshot_id and s.page_id=p.page_id
  where r.session_id=p_session and p.page_id=p_page
$$;

create or replace function ink_product.course_exits(p_session uuid,p_page text,p_revision text)
returns setof text language sql stable strict set search_path='' as $$
  select l.page_id from ink_product.rooms r
  cross join lateral ink_product.s5_room_pages_v1(r.id) source
  join ink_product.wiki_snapshots s on s.id=source.snapshot_id and s.page_id=source.page_id and s.revision_id=p_revision
  cross join lateral ink_product.s5_document_links_v1(r.id,s.id) l
  where r.session_id=p_session and source.page_id=p_page and l.page_id<>p_page
  and (r.free_wiki or exists (
    select from ink_product.wiki_course_pages destination join ink_product.wiki_snapshots target on target.id=destination.snapshot_id
    where destination.binding=r.binding and (target.page_id,target.canonical_title)=(l.page_id,l.canonical_title)
  ))
$$;

create or replace function ink_product.lock_verified_link(p_room uuid,p_session uuid,p_actor uuid,p_binding jsonb,p_payload jsonb)
returns ink_product.wiki_links language plpgsql set search_path='' as $$
declare
  r ink_product.rooms;
  m ink_product.members;
  s ink_product.wiki_snapshots;
  edge ink_product.wiki_links;
  requested public.wiki_page_snapshots;
  link public.wiki_snapshot_links;
  pinned uuid;
begin
  select * into r from ink_product.rooms where id=p_room and session_id=p_session and binding=p_binding and phase='playing' for update;
  select * into m from ink_product.members where room_id=r.id and actor_id=p_actor and status='playing' for update;
  if m.actor_id is null then raise insufficient_privilege using message='PRODUCT_DOCUMENT_UNAVAILABLE'; end if;
  select * into strict s from ink_product.wiki_snapshots where id=m.snapshot_id;
  if jsonb_build_object('expectedPageId',s.page_id,'expectedRevisionId',s.revision_id,'expectedSnapshotId',s.id,
      'expectedProgressVersion',m.progress_version::text) is distinct from
      (p_payload-case when r.free_wiki then array['targetPageId','targetSnapshotId'] else array['targetPageId'] end) then
    raise invalid_parameter_value using message='STALE_DOCUMENT';
  end if;
  select * into edge from ink_product.s5_document_links_v1(r.id,s.id)
    where page_id=p_payload->>'targetPageId' and page_id<>s.page_id;
  if edge.page_id is null or edge.page_id not in(select ink_product.course_exits(r.session_id,s.page_id,s.revision_id)) then
    raise invalid_parameter_value using message='LINK_NOT_VERIFIED';
  end if;
  if r.free_wiki then
    if coalesce(p_payload->>'targetSnapshotId','') !~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' then
      raise invalid_parameter_value using message='LINK_SNAPSHOT_MISSING';
    end if;
    select * into requested from public.wiki_page_snapshots
      where id=(p_payload->>'targetSnapshotId')::uuid and page_id=edge.page_id;
    select * into link from public.wiki_snapshot_links
      where snapshot_id=ink_product.s5_wiki_public_id_v1(s.id) and target_page_id=edge.page_id;
    if requested.id is null or (link.target_revision_id is not null and requested.revision_id<>link.target_revision_id) then
      raise invalid_parameter_value using message='LINK_NOT_VERIFIED';
    end if;
    pinned:=ink_product.pin_free_wiki_page_v1(r.id,ink_product.import_free_wiki_snapshot_v1(requested.id));
    if pinned is null then raise invalid_parameter_value using message='LINK_SNAPSHOT_MISSING'; end if;
    if link.target_revision_id is not null and not exists(
      select from ink_product.wiki_snapshots where id=pinned and revision_id=link.target_revision_id
    ) then raise invalid_parameter_value using message='LINK_NOT_VERIFIED'; end if;
  end if;
  return edge;
end $$;

-- Each patch matches exactly once in the history-70 function.
create function pg_temp.s5_free_replace(p_function regprocedure,p_old text,p_new text)
returns void language plpgsql as $$
declare body text:=replace(pg_get_functiondef(p_function),chr(13),'' );
  prior text:=replace(p_old,chr(13),'' );
begin
  if (length(body)-length(replace(body,prior,'')))/length(prior)<>1 then
    raise exception 'S5_FREE_MIGRATION_ANCHOR: %',p_function;
  end if;
  execute replace(body,prior,p_new);
end $$;

select pg_temp.s5_free_replace('public.get_group_items_entry_v1(text)',
  $$'policyRevision',p.revision::text$$,
  $$'freeWiki',p.binding->>'schemaVersion'='candidate-v3','policyRevision',p.revision::text$$);
select pg_temp.s5_free_replace('public.act_group_items_product_room_before_followup(text,uuid,uuid,text,jsonb,jsonb)',
  $$WHEN 'create' THEN
        IF p_payload IS DISTINCT FROM '{}'::jsonb THEN code := 'PRODUCT_INVALID_REQUEST'; EXIT operation; END IF;$$,
  $$WHEN 'create' THEN
        IF p_payload IS DISTINCT FROM '{}'::jsonb AND
           (p_payload IS DISTINCT FROM '{"freeWiki":true}'::jsonb OR p_binding->>'schemaVersion' IS DISTINCT FROM 'candidate-v3')
        THEN code := 'PRODUCT_INVALID_REQUEST'; EXIT operation; END IF;$$);
select pg_temp.s5_free_replace('public.act_group_items_product_room_before_followup(text,uuid,uuid,text,jsonb,jsonb)',
  'ink_product.rooms(binding,host_actor) VALUES (p_binding,actor)',
  $$ink_product.rooms(binding,host_actor,free_wiki) VALUES (p_binding,actor,p_payload='{"freeWiki":true}'::jsonb)$$);
select pg_temp.s5_free_replace('public.act_group_items_product_room_before_followup(text,uuid,uuid,text,jsonb,jsonb)',
  'ink_product.rooms(binding,host_actor,previous_room_id) VALUES (r.binding,actor,r.id)',
  'ink_product.rooms(binding,host_actor,previous_room_id,free_wiki) VALUES (r.binding,actor,r.id,r.free_wiki)');

select pg_temp.s5_free_replace('public.act_group_items_product_room_v1(text,uuid,uuid,text,jsonb,jsonb)',
  $$if p_operation is null or p_operation not in$$,
  $$if p_operation in ('start','ready') and r.free_wiki and r.phase='waiting' then
    select * into m from ink_product.members where room_id=r.id and actor_id=actor and status='waiting';
    if m.actor_id is null then raise insufficient_privilege using message='PRODUCT_ROOM_UNAVAILABLE'; end if;
    if p_operation='start' or m.target_candidate_id is null then
      return jsonb_build_object('ok',false,'code',case when p_operation='start' then 'PRODUCT_SCHEDULED_START_REQUIRED'
        else 'PRODUCT_CANDIDATE_REQUIRED' end,'protocol','s4-product-v1','testOnly',false,
        'operation',p_operation,'roomId',r.id,'actorId',actor,'binding',p_binding,'requestId',p_request);
    end if;
  end if;
  if p_operation is null or p_operation not in$$);
select pg_temp.s5_free_replace('public.act_group_items_product_room_v1(text,uuid,uuid,text,jsonb,jsonb)',
  $old$candidate := (p_payload->>'snapshotId')::uuid;
      if candidate is not null and not exists (
        select from ink_product.wiki_course_pages w join ink_product.wiki_documents d on d.snapshot_id=w.snapshot_id
        where w.binding=r.binding and w.snapshot_id=candidate
      ) then
        code := 'PRODUCT_CANDIDATE_UNAVAILABLE';
      elsif m.target_candidate_id is distinct from candidate then$old$,
  $new$candidate := (p_payload->>'snapshotId')::uuid;
      if r.free_wiki then
        if candidate is not null then
          candidate:=ink_product.import_free_wiki_snapshot_v1(candidate);
          if candidate is null then code := 'PRODUCT_CANDIDATE_UNAVAILABLE'; end if;
        end if;
      elsif candidate is not null and not exists (
        select from ink_product.wiki_course_pages w join ink_product.wiki_documents d on d.snapshot_id=w.snapshot_id
        where w.binding=r.binding and w.snapshot_id=candidate
      ) then
        code := 'PRODUCT_CANDIDATE_UNAVAILABLE';
      end if;
      if code is null and m.target_candidate_id is distinct from candidate then$new$);
select pg_temp.s5_free_replace('public.act_group_items_product_room_v1(text,uuid,uuid,text,jsonb,jsonb)',
  $$if exists(select from ink_product.members where room_id=r.id and status='waiting' and target_candidate_id is not null) then$$,
  $$if r.free_wiki then
      if exists(select from ink_product.members where room_id=r.id and status='waiting' and target_candidate_id is null)
      then code := 'PRODUCT_CANDIDATE_REQUIRED';
      else
        select target_candidate_id into from_id from ink_product.members
        where room_id=r.id and status='waiting' order by md5(participant_id::text||r.id::text) limit 1;
        select pick.target_candidate_id into goal_id from ink_product.members pick
        join ink_product.wiki_snapshots s on s.id=pick.target_candidate_id
        where pick.room_id=r.id and pick.status='waiting'
          and s.page_id<>(select page_id from ink_product.wiki_snapshots where id=from_id)
        order by md5(pick.participant_id::text||r.id::text||'target') limit 1;
        if goal_id is null then code := 'PRODUCT_CANDIDATE_PAIR_REQUIRED';
        else
          delete from ink_product.free_wiki_pages_v1 where room_id=r.id;
          perform ink_product.pin_free_wiki_page_v1(r.id,from_id);
          perform ink_product.pin_free_wiki_page_v1(r.id,goal_id);
        end if;
      end if;
    elsif exists(select from ink_product.members where room_id=r.id and status='waiting' and target_candidate_id is not null) then$$);

select pg_temp.s5_free_replace('public.get_group_items_product_room_v1(uuid,jsonb)',
  $$'courseCandidates',candidates,'followupActions',followup_actions$$,
  $$'courseCandidates',candidates,'followupActions',followup_actions,'freeWiki',r.free_wiki,
    'myCandidateTitle',(select s.canonical_title from ink_product.members m
      join ink_product.wiki_snapshots s on s.id=m.target_candidate_id
      where m.room_id=r.id and m.actor_id=ink_product.request_actor_v1() and m.status='waiting')$$);

select pg_temp.s5_free_replace('ink_product.start_match_v1(uuid)',
  'FROM ink_product.wiki_course_pages WHERE binding=r.binding',
  'FROM ink_product.s5_room_pages_v1(r.id) WHERE true');
select pg_temp.s5_free_replace('ink_product.start_match_v1(uuid)',
  'IF ink_product_engine.ink_s3_tick_v1(session,started,receipt,true)',
  'PERFORM ink_product.s5_cache_adjacent_wiki_v1(r.id,p.start_snapshot_id); IF ink_product_engine.ink_s3_tick_v1(session,started,receipt,true)');
select pg_temp.s5_free_replace('ink_product.checkpoint_v1(uuid)',
  'ink_product.wiki_course_pages c','ink_product.s5_room_pages_v1(r.id) c');
select pg_temp.s5_free_replace('ink_product.checkpoint_v1(uuid)',
  'AND c.binding=r.binding AND c.page_id','AND c.page_id');
select pg_temp.s5_free_replace('ink_product.apply_match_command_v1(uuid,uuid,uuid,text,jsonb,ink_product.wiki_links)',
  $$p_payload-'expectedSnapshotId'$$, $$p_payload-array['expectedSnapshotId','targetSnapshotId']$$);
select pg_temp.s5_free_replace('ink_product.apply_match_command_v1(uuid,uuid,uuid,text,jsonb,ink_product.wiki_links)',
  $$b := ink_product_engine.ink_s4_dispatch_v1(r.session_id,p_receipt$$,
  $$if r.free_wiki and p_operation='lost_link' then
    perform ink_product.s5_cache_adjacent_wiki_v1(r.id,m.snapshot_id)
    from ink_product.members m where m.room_id=r.id and m.status='playing'
      and m.participant_id::text=p_payload->>'targetParticipantId' and m.actor_id<>p_actor;
  end if;
  b := ink_product_engine.ink_s4_dispatch_v1(r.session_id,p_receipt$$);
select pg_temp.s5_free_replace('ink_product.apply_match_command_v1(uuid,uuid,uuid,text,jsonb,ink_product.wiki_links)',
  'b := b || jsonb_build_object(', 'PERFORM ink_product.s5_cache_adjacent_wiki_v1(r.id,next_document.id); b := b || jsonb_build_object(');
select pg_temp.s5_free_replace('ink_product_engine.ink_s5_joker_v1(uuid,ink_product_engine.ink_members_v1,ink_product_engine.ink_members_v1,text,jsonb,timestamp with time zone,uuid,text,boolean)',
  'ON s.id=p.start_snapshot_id WHERE r.session_id=p_session',
  'ON s.id=coalesce(r.selected_start_snapshot_id,p.start_snapshot_id) WHERE r.session_id=p_session');

select pg_temp.s5_free_replace('public.get_group_items_product_document_v1(uuid,uuid,jsonb,jsonb)',
  'FROM ink_product.wiki_links WHERE snapshot_id=s.id', 'FROM ink_product.s5_document_links_v1(r.id,s.id) WHERE snapshot_id=s.id');
select pg_temp.s5_free_replace('public.get_group_items_product_document_v1(uuid,uuid,jsonb,jsonb)',
  'SELECT document_html INTO STRICT html FROM ink_product.wiki_documents WHERE snapshot_id=s.id;',
  'SELECT document_html INTO html FROM ink_product.wiki_documents WHERE snapshot_id=s.id;');
select pg_temp.s5_free_replace('public.get_group_items_product_document_v1(uuid,uuid,jsonb,jsonb)',
  $$'wikiSnapshotId',s.wiki_snapshot_id$$,
  $$'wikiSnapshotId',case when r.free_wiki then ink_product.s5_wiki_public_id_v1(s.id) else s.wiki_snapshot_id end$$);
select pg_temp.s5_free_replace('ink_product_engine.ink_s5_navigation_state_v1(uuid,ink_product_engine.ink_members_v1,timestamp with time zone)',
  'FROM ink_product.wiki_links l LEFT JOIN',
  'FROM ink_product.s5_document_links_v1((select id from ink_product.rooms where session_id=p_session),v_snapshot.id) l LEFT JOIN');

-- The wiki-snapshot Edge handler prepares optional item indexes on document
-- load. Only that trusted handler can store them and only for a current frame.
create function public.prepare_s5_wiki_document_v1(p_room uuid,p_actor uuid,p_snapshot uuid,
  p_html text,p_nodes text[],p_sections jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare
  snapshot uuid;
  digest text:=encode(sha256(convert_to(p_html,'UTF8')),'hex');
begin
  select m.snapshot_id into snapshot from ink_product.rooms r join ink_product.members m on m.room_id=r.id
  where r.id=p_room and r.free_wiki and r.phase='playing' and m.actor_id=p_actor and m.status='playing'
    and ink_product.s5_wiki_public_id_v1(m.snapshot_id)=p_snapshot;
  if snapshot is null then return false; end if;
  if coalesce(octet_length(p_html),0) not between 1 and 8000000
    or p_nodes is null or array_position(p_nodes,null) is not null
    or jsonb_typeof(p_sections) is distinct from 'object' then return false; end if;
  insert into ink_product.wiki_documents(snapshot_id,document_html,document_digest)
    values(snapshot,p_html,digest) on conflict(snapshot_id) do nothing;
  insert into ink_product_engine.ink_s5_search_documents_v1(snapshot_id,document_hash,text_nodes,link_sections)
    select snapshot,digest,p_nodes,p_sections from ink_product.wiki_documents d
    where d.snapshot_id=snapshot and d.document_digest=digest
    on conflict(snapshot_id) do nothing;
  return true;
end $$;
revoke all on function public.prepare_s5_wiki_document_v1(uuid,uuid,uuid,text,text[],jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.prepare_s5_wiki_document_v1(uuid,uuid,uuid,text,text[],jsonb) to service_role;

reset role;
do $restore$
begin
  if not (select had_create from pg_temp._s5_free_acl) then revoke create on schema public from ink_product_owner; end if;
  if not exists(select from pg_temp._s5_free_roles) then revoke ink_product_owner from postgres;
  else
    if not (select inherit_option from pg_temp._s5_free_roles) then grant ink_product_owner to postgres with inherit false; end if;
    if not (select set_option from pg_temp._s5_free_roles) then grant ink_product_owner to postgres with set false; end if;
  end if;
end
$restore$;
