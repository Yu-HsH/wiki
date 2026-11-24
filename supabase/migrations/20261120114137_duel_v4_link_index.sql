-- CLI owns the migration transaction and history INSERT.

alter table duel_v4.search_documents add column link_sections jsonb
  check (link_sections is null or jsonb_typeof(link_sections)='object');
alter table duel_v4.effects add column hidden_page_ids text[] not null default '{}';

create function duel_v4.active_link_index(p_room uuid,p_actor uuid,at_time timestamptz)
returns duel_v4.effects language sql stable set search_path='' as $$
  select e.* from duel_v4.effects e where (e.room_id,e.user_id)=(p_room,p_actor) and e.kind='link_index'
    and e.ended_at is null and e.starts_at<=at_time and at_time<e.expires_at
  order by e.starts_at desc,e.id limit 1
$$;

create function duel_v4.mask_link_index()
returns trigger language plpgsql set search_path='' as $$
begin
  select coalesce(array_agg(r.target_page_id),'{}') into new.hidden_page_ids
  from (
    select l.target_page_id,row_number() over (order by md5(new.id::text||l.target_page_id),l.target_page_id) as position,
      count(*) over () as total
    from duel_v4.members m join public.wiki_snapshot_links l on l.snapshot_id=m.snapshot_id
    where (m.room_id,m.user_id)=(new.room_id,new.user_id)
  ) r where r.position<=least(r.total/2,greatest(r.total-2,0));
  return new;
end $$;
create trigger duel_v4_mask_link_index before insert on duel_v4.effects
for each row when (new.kind='link_index' and new.tier='weakened')
execute function duel_v4.mask_link_index();

create or replace function duel_v4.search_source(p_room uuid,p_window uuid,p_actor uuid)
returns jsonb language sql stable set search_path='' as $$
  select coalesce((
    select jsonb_build_object('ok',true,'snapshotId',s.id,'pageId',s.page_id,'revisionId',s.revision_id,
      'title',s.canonical_title_snapshot,'documentHtml',d.document_html,'documentHash',d.document_hash,
      'needsSections',w.id is distinct from p_window,'sectionsReady',d.link_sections is not null)
    from duel_v4.rooms r
    join duel_v4.members m on m.room_id=r.id and m.user_id=p_actor
    join public.wiki_page_snapshots s on s.id=m.snapshot_id
    cross join lateral duel_v4.active_search(m,statement_timestamp()) w
    left join duel_v4.search_documents d on d.snapshot_id=m.snapshot_id
    where r.id=p_room and r.finished_at is null and (
      w.id=p_window or exists(
        select from duel_v4.grants g where (g.id,g.room_id,g.user_id)=(p_window,r.id,p_actor)
          and g.item_id='link_index' and g.consumed_at is null and duel_v4.tier(g)='enhanced'
      )
    )
  ),jsonb_build_object('ok',false,'code','SEARCH_UNAVAILABLE'))
$$;

create function public.store_duel_v4_prepared_document(p_room uuid,p_window uuid,p_actor uuid,p_snapshot uuid,
  p_html text,p_text_nodes text[],p_sections jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  if p_sections is null or jsonb_typeof(p_sections)<>'object' or octet_length(p_sections::text)>1000000 then
    return jsonb_build_object('ok',false,'code','SEARCH_INVALID_DOCUMENT');
  end if;
  result:=public.store_duel_v4_search_document(p_room,p_window,p_actor,p_snapshot,p_html,p_text_nodes);
  if (result->>'ok')::boolean is not true then return result; end if;
  update duel_v4.search_documents set link_sections=p_sections
  where snapshot_id=p_snapshot and document_html=p_html and link_sections is null;
  return duel_v4.search_source(p_room,p_window,p_actor);
end $$;

alter function duel_v4.activate(duel_v4.rooms,duel_v4.members,uuid,uuid,jsonb,timestamptz) rename to activate_with_rewards;
create function duel_v4.activate(room duel_v4.rooms,member duel_v4.members,opponent uuid,
  request uuid,input jsonb,at_time timestamptz) returns text
language plpgsql set search_path='' as $$
declare g duel_v4.grants;
begin
  select * into g from duel_v4.grants where id=(input->>'grantId')::uuid
    and room_id=room.id and user_id=member.user_id and consumed_at is null;
  if g.item_id='link_index' then
    if (duel_v4.active_link_index(room.id,member.user_id,at_time)).id is not null then
      raise check_violation using message='LINK_INDEX_ACTIVE';
    end if;
    if duel_v4.tier(g)='enhanced' and not exists(select from duel_v4.search_documents d where d.snapshot_id=member.snapshot_id
      and d.link_sections is not null) then
      raise check_violation using message='LINK_SECTIONS_UNAVAILABLE';
    end if;
  end if;
  return duel_v4.activate_with_rewards(room,member,opponent,request,input,at_time);
end $$;

create function duel_v4.link_index_state(room duel_v4.rooms,actor uuid,at_time timestamptz)
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('id',e.id,'tier',e.tier,'expiresAt',e.expires_at,
    'entries',(select coalesce(jsonb_agg(jsonb_build_object('pageId',l.target_page_id,'title',l.target_title_snapshot,
      'blocked',duel_v4.exit_blocked(room.id,actor,l.target_page_id,at_time),
      'section',case when e.tier='enhanced' then coalesce(d.link_sections->>l.target_title_snapshot,'기타') end
    ) order by l.target_title_snapshot collate pg_catalog."C",l.target_page_id),'[]'::jsonb)
      from public.wiki_snapshot_links l where l.snapshot_id=m.snapshot_id and l.target_page_id<>all(e.hidden_page_ids)))
  from duel_v4.members m
  cross join lateral duel_v4.active_link_index(room.id,actor,at_time) e
  left join duel_v4.search_documents d on d.snapshot_id=m.snapshot_id
  where m.room_id=room.id and m.user_id=actor and room.finished_at is null and e.id is not null
$$;

alter function duel_v4.project(duel_v4.rooms,uuid,timestamptz) rename to project_with_rewards;
create function duel_v4.project(room duel_v4.rooms,actor uuid,at_time timestamptz)
returns jsonb language sql stable set search_path='' as $$
  select duel_v4.project_with_rewards(room,actor,at_time)||jsonb_build_object(
    'linkIndex',duel_v4.link_index_state(room,actor,at_time),
    'rouletteSupplyWeakened',coalesce((select m.roulette_supply_weakened from duel_v4.members m
      where (m.room_id,m.user_id)=(room.id,actor)),false)
  )
$$;

revoke all on all functions in schema duel_v4 from public,anon,authenticated,service_role;
revoke all on function public.store_duel_v4_prepared_document(uuid,uuid,uuid,uuid,text,text[],jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.store_duel_v4_prepared_document(uuid,uuid,uuid,uuid,text,text[],jsonb) to service_role;

notify pgrst,'reload schema';
