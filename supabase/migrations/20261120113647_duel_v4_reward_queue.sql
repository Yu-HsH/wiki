-- CLI owns the migration transaction and history INSERT.

alter table duel_v4.members add column roulette_supply_weakened boolean not null default false;

create table duel_v4.reward_candidates (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null,
  user_id uuid not null,
  foreign key (room_id,user_id) references duel_v4.members on delete cascade,
  origin uuid not null,
  ordinal smallint not null check (ordinal in (1,2)),
  unique (room_id,user_id,origin,ordinal),
  sequence bigint generated always as identity,
  item_id text not null references duel_v4.catalog,
  tier text not null check (tier in ('normal','enhanced','weakened')),
  offered_at timestamptz not null,
  resolved_at timestamptz,
  delivered_grant uuid references duel_v4.grants on delete set null
);
create index duel_v4_reward_head on duel_v4.reward_candidates(room_id,user_id,sequence) where resolved_at is null;

create table duel_v4.roulette_automatic_effects (
  room_id uuid not null,
  user_id uuid not null,
  foreign key (room_id,user_id,parent_request) references duel_v4.receipts on delete cascade deferrable initially deferred,
  parent_request uuid not null,
  ordinal smallint not null check (ordinal in (1,2)),
  grant_id uuid not null references duel_v4.grants on delete cascade,
  result text not null,
  primary key (room_id,user_id,parent_request,ordinal)
);

alter table duel_v4.reward_candidates enable row level security;
alter table duel_v4.roulette_automatic_effects enable row level security;
revoke all on duel_v4.reward_candidates,duel_v4.roulette_automatic_effects from public,anon,authenticated,service_role;
revoke all on sequence duel_v4.reward_candidates_sequence_seq from public,anon,authenticated,service_role;

create function duel_v4.reward_draw(weakened boolean,excluded text default null)
returns text language plpgsql volatile set search_path='' as $$
declare
  roll integer:=floor(random()*(case when weakened then 3 else 100 end));
  category integer;
  pool text[];
begin
  category:=case when weakened then roll
    when roll<25 then 0 when roll<50 then 1 when roll<75 then 2 when roll<85 then 3 else 4 end;
  pool:=case category when 0 then array['ink','censor','trap','lost_link']
    when 1 then array['parry','shield','correction']
    when 2 then array['bookmark','undo','search','link_index']
    when 3 then array['thunder','thief','roulette','cannon']
    else array['enhancement','weakening'] end;
  if excluded is not null then pool:=array_remove(pool,excluded); end if;
  return pool[1+floor(random()*cardinality(pool))::integer];
end $$;

create function duel_v4.free_slot(p_room uuid,p_actor uuid)
returns smallint language sql stable set search_path='' as $$
  select positions.slot::smallint from generate_series(1,2) as positions(slot) where not exists(
    select from duel_v4.grants g where (g.room_id,g.user_id,g.slot)=(p_room,p_actor,positions.slot) and g.consumed_at is null
  ) order by positions.slot limit 1
$$;

create function duel_v4.reward_head(p_room uuid,p_actor uuid,at_time timestamptz)
returns duel_v4.reward_candidates language sql stable set search_path='' as $$
  select c.* from duel_v4.reward_candidates c
  where (c.room_id,c.user_id)=(p_room,p_actor) and c.resolved_at is null
    and c.offered_at<=at_time and at_time<c.offered_at+interval '15 seconds'
  order by c.sequence limit 1
$$;

create function duel_v4.reward_inventory_token(p_room uuid,p_actor uuid)
returns text language sql stable set search_path='' as $$
  select md5(coalesce(string_agg(g.id::text||':'||duel_v4.tier(g),',' order by g.slot),''))
  from duel_v4.grants g where (g.room_id,g.user_id)=(p_room,p_actor) and g.consumed_at is null
$$;

create function duel_v4.deliver_reward(candidate duel_v4.reward_candidates,slot smallint,at_time timestamptz)
returns uuid language plpgsql set search_path='' as $$
declare granted uuid;
begin
  insert into duel_v4.grants(room_id,user_id,slot,item_id,base_tier,granted_at)
  values(candidate.room_id,candidate.user_id,slot,candidate.item_id,candidate.tier,at_time)
  returning id into granted;
  update duel_v4.reward_candidates set resolved_at=at_time,delivered_grant=granted where id=candidate.id;
  return granted;
end $$;

create function duel_v4.offer_rewards(p_room uuid,p_actor uuid,p_origin uuid,items text[],tier text,at_time timestamptz)
returns void language plpgsql set search_path='' as $$
declare slot smallint; candidate duel_v4.reward_candidates;
begin
  insert into duel_v4.reward_candidates(room_id,user_id,origin,ordinal,item_id,tier,offered_at)
  select p_room,p_actor,p_origin,position::smallint,item,tier,at_time
  from unnest(items) with ordinality as choices(item,position)
  order by position
  on conflict (room_id,user_id,origin,ordinal) do nothing;
  for idx in 1..cardinality(items) loop
    slot:=duel_v4.free_slot(p_room,p_actor);
    candidate:=duel_v4.reward_head(p_room,p_actor,at_time);
    exit when slot is null or candidate.id is null;
    perform duel_v4.deliver_reward(candidate,slot,at_time);
  end loop;
end $$;

create function duel_v4.apply_roulette_supply()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.supply_round is not null then
    update duel_v4.members set roulette_supply_weakened=false
      where (room_id,user_id)=(new.room_id,new.user_id) and roulette_supply_weakened;
    if found then new.base_tier:='weakened'; end if;
  end if;
  return new;
end $$;
create trigger duel_v4_roulette_supply before insert on duel_v4.grants
for each row execute function duel_v4.apply_roulette_supply();

create function duel_v4.automatic_effect(room duel_v4.rooms,actor uuid,opponent uuid,item text,at_time timestamptz)
returns table(grant_id uuid,detail text) language plpgsql set search_path='' as $$
declare
  me duel_v4.members;
  target duel_v4.members;
  input jsonb;
  selected_attack uuid;
  trap_page text;
  slot smallint:=duel_v4.free_slot(room.id,actor);
begin
  if slot is null then raise check_violation using message='AUTO_ITEM_UNAVAILABLE'; end if;
  select * into strict me from duel_v4.members m where (m.room_id,m.user_id)=(room.id,actor);
  insert into duel_v4.grants(room_id,user_id,slot,item_id,granted_at)
    values(room.id,actor,slot,item,at_time) returning id into grant_id;
  input:=jsonb_build_object('grantId',grant_id);
  if item='parry' then
    select a.id into selected_attack from duel_v4.attacks a where (a.room_id,a.target_id)=(room.id,actor)
      and a.resolved_at is null and a.due_at>at_time order by a.due_at,a.id limit 1;
    input:=input||jsonb_build_object('attackId',selected_attack);
  elsif item='trap' then
    select * into strict target from duel_v4.members m where (m.room_id,m.user_id)=(room.id,opponent);
    select l.target_page_id into trap_page from public.wiki_snapshot_links l where l.snapshot_id=target.snapshot_id
      and not duel_v4.exit_blocked(room.id,opponent,l.target_page_id,at_time)
      and not exists(select from duel_v4.traps t where (t.room_id,t.target_id,t.source_id,t.destination_page)=
        (room.id,opponent,target.snapshot_id,l.target_page_id) and t.triggered_at is null)
      order by l.ordinal limit 1;
    input:=input||jsonb_build_object('destinationPageId',trap_page,
      'expectedTargetSnapshotId',target.snapshot_id,'expectedTargetProgressVersion',target.progress_version);
  end if;
  detail:=duel_v4.activate(room,me,opponent,gen_random_uuid(),input,at_time);
  if exists(select from duel_v4.grants g where g.id=grant_id and g.consumed_at is null) then
    raise exception 'DUEL_V4_AUTO_GRANT_NOT_CONSUMED';
  end if;
  return next;
end $$;

alter function duel_v4.activate(duel_v4.rooms,duel_v4.members,uuid,uuid,jsonb,timestamptz) rename to activate_with_search;
create function duel_v4.activate(room duel_v4.rooms, member duel_v4.members, opponent uuid,
  request uuid, input jsonb, at_time timestamptz) returns text
language plpgsql set search_path='' as $$
declare
  g duel_v4.grants;
  tier text;
  item text;
  first_item text;
  candidates text[];
  excluded text[]:='{}';
  child record;
begin
  select * into g from duel_v4.grants where id=(input->>'grantId')::uuid
    and room_id=room.id and user_id=member.user_id and consumed_at is null;
  if g.item_id is distinct from 'roulette' then
    return duel_v4.activate_with_search(room,member,opponent,request,input,at_time);
  end if;
  if exists(select from duel_v4.effects e where (e.room_id,e.user_id)=(room.id,member.user_id)
    and e.kind in ('stun','cannon_stun','trap_stun','thunder_seal') and e.ended_at is null
    and e.starts_at<=at_time and at_time<e.expires_at) then
    raise check_violation using message='ITEM_SEALED';
  end if;
  tier:=duel_v4.tier(g);
  update duel_v4.grants set consumed_at=at_time,consumed_request=request where id=g.id;
  if random()>=0.5 then
    update duel_v4.grants set weakened=true where (room_id,user_id)=(room.id,member.user_id) and consumed_at is null;
    update duel_v4.members set roulette_supply_weakened=true where (room_id,user_id)=(room.id,member.user_id);
    return 'ROULETTE_FAILED';
  end if;
  if tier='enhanced' then
    for idx in 1..(1+floor(random()*2)::integer) loop
      candidates:='{}';
      foreach item in array array['ink','censor','trap','lost_link','parry','shield','correction','bookmark','undo','link_index'] loop
        if item=any(excluded) then continue; end if;
        begin
          perform duel_v4.automatic_effect(room,member.user_id,opponent,item,at_time);
          candidates:=array_append(candidates,item);
          raise sqlstate 'P1A01' using message='ROLLBACK_AUTO_ELIGIBILITY_PROBE';
        exception
          when sqlstate 'P1A01' then null;
          when check_violation then if sqlerrm !~ '^[A-Z0-9_]+$' then raise; end if;
        end;
      end loop;
      if cardinality(candidates)=0 then raise check_violation using message='ROULETTE_AUTO_UNAVAILABLE'; end if;
      item:=candidates[1+floor(random()*cardinality(candidates))::integer];
      select * into strict child from duel_v4.automatic_effect(room,member.user_id,opponent,item,at_time);
      insert into duel_v4.roulette_automatic_effects(room_id,user_id,parent_request,ordinal,grant_id,result)
      values(room.id,member.user_id,request,idx,child.grant_id,child.detail);
      excluded:=array_append(excluded,item);
    end loop;
  end if;
  first_item:=duel_v4.reward_draw(tier='weakened');
  perform duel_v4.offer_rewards(room.id,member.user_id,request,array[first_item,duel_v4.reward_draw(tier='weakened',first_item)],
    case when tier='weakened' then 'normal' else 'enhanced' end,at_time);
  return case when tier='enhanced' then 'ROULETTE_BOOSTED' else 'ROULETTE_WON' end;
end $$;

alter function duel_v4.resolve_attack(duel_v4.attacks,uuid,text,timestamptz,boolean) rename to resolve_attack_base;
create function duel_v4.resolve_attack(a duel_v4.attacks,destination uuid,hit_tier text,at_time timestamptz,reflected boolean)
returns text language plpgsql set search_path='' as $$
declare shield uuid; result text;
begin
  select e.id into shield from duel_v4.effects e where (e.room_id,e.user_id)=(a.room_id,destination)
    and e.kind='shield' and e.tier='enhanced' and e.ended_at is null
    and e.starts_at<=at_time and at_time<e.expires_at;
  result:=duel_v4.resolve_attack_base(a,destination,hit_tier,at_time,reflected);
  if result='blocked' and shield is not null and destination<>a.actor_id then
    perform duel_v4.offer_rewards(a.room_id,destination,shield,array[duel_v4.reward_draw(false)],'normal',at_time);
  end if;
  return result;
end $$;

alter function duel_v4.trip_trap(duel_v4.rooms,duel_v4.members,text,timestamptz) rename to trip_trap_base;
create function duel_v4.trip_trap(room duel_v4.rooms,member duel_v4.members,destination text,at_time timestamptz)
returns text language plpgsql set search_path='' as $$
declare shield uuid; result text;
begin
  select e.id into shield from duel_v4.effects e where (e.room_id,e.user_id)=(room.id,member.user_id)
    and e.kind='shield' and e.tier='enhanced' and e.ended_at is null
    and e.starts_at<=at_time and at_time<e.expires_at;
  result:=duel_v4.trip_trap_base(room,member,destination,at_time);
  if result='blocked' and shield is not null then
    perform duel_v4.offer_rewards(room.id,member.user_id,shield,array[duel_v4.reward_draw(false)],'normal',at_time);
  end if;
  return result;
end $$;

alter function duel_v4.project(duel_v4.rooms,uuid,timestamptz) rename to project_with_search;
create function duel_v4.project(room duel_v4.rooms,actor uuid,at_time timestamptz)
returns jsonb language sql stable set search_path='' as $$
  select duel_v4.project_with_search(room,actor,at_time)||jsonb_build_object(
    'reward',(select jsonb_build_object('id',c.id,'itemId',c.item_id,'tier',c.tier,
      'expiresAt',c.offered_at+interval '15 seconds','inventoryToken',duel_v4.reward_inventory_token(room.id,actor))
      from duel_v4.reward_head(room.id,actor,at_time) c where c.id is not null and room.finished_at is null)
  )
$$;

create function public.resolve_duel_v4_reward(p_room uuid,p_reward uuid,p_request uuid,p_claim boolean,
  p_replace uuid default null,p_inventory_token text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor uuid:=auth.uid();
  room duel_v4.rooms;
  prior duel_v4.receipts;
  candidate duel_v4.reward_candidates;
  request_input jsonb;
  reply jsonb;
  at_time timestamptz;
  changed boolean;
  slot smallint;
  granted uuid;
begin
  if p_reward is null or p_request is null or p_claim is null
    or (not p_claim and (p_replace is not null or p_inventory_token is not null))
    or (p_claim and (p_inventory_token is null or p_inventory_token !~ '^[a-f0-9]{32}$')) then
    raise invalid_parameter_value using message='INVALID_REWARD_INPUT';
  end if;
  select r.* into room from duel_v4.rooms r where r.id=p_room
    and exists(select from duel_v4.members m where (m.room_id,m.user_id)=(r.id,actor)) for update;
  if not found then raise insufficient_privilege using message='DUEL_V4_MEMBER_REQUIRED'; end if;
  request_input:=jsonb_build_object('rewardId',p_reward,'claim',p_claim,'replaceGrantId',p_replace,'inventoryToken',p_inventory_token);
  select * into prior from duel_v4.receipts where (room_id,user_id,request_id)=(p_room,actor,p_request);
  if found then
    if (prior.operation,prior.input) is distinct from ('reward_resolve'::text,request_input) then
      raise invalid_parameter_value using message='REQUEST_ID_REUSED';
    end if;
    return prior.result;
  end if;
  at_time:=clock_timestamp();
  changed:=duel_v4.advance(room,at_time);
  select * into strict room from duel_v4.rooms where id=p_room;
  candidate:=duel_v4.reward_head(p_room,actor,at_time);
  if room.finished_at is not null or candidate.id is distinct from p_reward then
    reply:=jsonb_build_object('ok',false,'code','REWARD_UNAVAILABLE');
  elsif exists(select from duel_v4.effects e where (e.room_id,e.user_id)=(p_room,actor)
    and e.kind in ('stun','cannon_stun','trap_stun','thunder_seal') and e.ended_at is null
    and e.starts_at<=at_time and at_time<e.expires_at) then
    reply:=jsonb_build_object('ok',false,'code','ITEM_SEALED');
  elsif not p_claim then
    update duel_v4.reward_candidates set resolved_at=at_time where id=candidate.id;
    reply:=jsonb_build_object('ok',true,'code','REWARD_DISCARDED');
  elsif duel_v4.reward_inventory_token(p_room,actor) is distinct from p_inventory_token then
    reply:=jsonb_build_object('ok',false,'code','STALE_INVENTORY');
  else
    if p_replace is null then
      slot:=duel_v4.free_slot(p_room,actor);
    else
      update duel_v4.grants g set consumed_at=at_time,consumed_request=p_request
      where g.id=p_replace and (g.room_id,g.user_id)=(p_room,actor) and g.consumed_at is null
      returning g.slot into slot;
    end if;
    if slot is null then
      reply:=jsonb_build_object('ok',false,'code',case when p_replace is null then 'INVENTORY_FULL' else 'ITEM_NOT_AVAILABLE' end);
    else
      granted:=duel_v4.deliver_reward(candidate,slot,at_time);
      reply:=jsonb_build_object('ok',true,'code','REWARD_CLAIMED','grantId',granted);
    end if;
  end if;
  reply:=reply||jsonb_build_object('requestId',p_request);
  insert into duel_v4.receipts values(p_room,actor,p_request,'reward_resolve',request_input,reply);
  if changed or (reply->>'ok')::boolean then perform duel_v4.publish(p_room); end if;
  return reply;
end $$;

update duel_v4.catalog set review_enabled=true where item_id='roulette';
revoke all on all functions in schema duel_v4 from public,anon,authenticated,service_role;
revoke all on function public.resolve_duel_v4_reward(uuid,uuid,uuid,boolean,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.resolve_duel_v4_reward(uuid,uuid,uuid,boolean,uuid,text) to authenticated;

notify pgrst,'reload schema';
