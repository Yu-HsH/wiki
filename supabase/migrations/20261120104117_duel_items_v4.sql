-- CLI owns the migration transaction and history INSERT.
-- Independent, opt-in duel rules. The v3 rooms and item RPCs remain intact.

create schema duel_v4;
create schema duel_v4_events;
revoke all on schema duel_v4 from public, anon, authenticated, service_role;
revoke all on schema duel_v4_events from public, anon, authenticated, service_role;
grant usage on schema duel_v4_events to authenticated;

create table duel_v4.admission (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  expires_at timestamptz not null
);

-- S5 item identities, including the items whose duel effects still need parity.
create table duel_v4.catalog (
  item_id text primary key,
  review_enabled boolean not null default false
);
insert into duel_v4.catalog values
  ('ink',true), ('parry',true), ('shield',true), ('bookmark',true),
  ('undo',true), ('censor',true), ('correction',true), ('trap',true),
  ('lost_link',true), ('search',false), ('link_index',true), ('enhancement',true),
  ('weakening',true), ('thunder',true), ('thief',true), ('roulette',false), ('cannon',true);

create table duel_v4.rooms (
  id uuid primary key default gen_random_uuid(),
  code text unique not null default upper(substr(replace(gen_random_uuid()::text,'-',''),1,16)),
  host_id uuid not null references public.profiles(id),
  creation_request uuid not null,
  unique (host_id,creation_request),
  replay_of uuid unique references duel_v4.rooms(id),
  target_id uuid references public.wiki_page_snapshots(id),
  start_id uuid references public.wiki_page_snapshots(id),
  result_room_id uuid unique references public.game_rooms(id),
  version bigint not null default 1,
  supply_round bigint not null default -1,
  started_at timestamptz,
  finished_at timestamptz,
  finish_reason text,
  winner_id uuid,
  check (finish_reason in ('normal_finish','forfeit','cancelled'))
);

create table duel_v4.members (
  room_id uuid not null references duel_v4.rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  seat smallint not null check (seat in (1,2)),
  primary key (room_id,user_id),
  unique (room_id,seat),
  snapshot_id uuid references public.wiki_page_snapshots(id),
  move_count integer not null default 0 check (move_count>=0),
  progress_version bigint not null default 0,
  path uuid[] not null default '{}',
  last_seen_at timestamptz,
  pending_enhance integer not null default 0 check (pending_enhance>=0),
  pending_weaken integer not null default 0 check (pending_weaken>=0),
  bookmarked_id uuid references public.wiki_page_snapshots(id),
  bookmark_uses smallint not null default 0,
  bookmark_expires_at timestamptz,
  last_move_kind text
);

create table duel_v4.grants (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null,
  user_id uuid not null,
  foreign key (room_id,user_id) references duel_v4.members on delete cascade,
  slot smallint not null check (slot in (1,2)),
  item_id text not null references duel_v4.catalog,
  supply_round bigint,
  granted_at timestamptz not null,
  base_tier text not null default 'normal' check (base_tier in ('normal','enhanced','weakened')),
  stolen_from uuid references duel_v4.grants,
  enhanced boolean not null default false,
  weakened boolean not null default false,
  consumed_at timestamptz,
  consumed_request uuid,
  check ((consumed_at is null)=(consumed_request is null)),
  unique (room_id,user_id,supply_round),
  unique (room_id,user_id,consumed_request)
);
create unique index duel_v4_active_slots on duel_v4.grants(room_id,user_id,slot) where consumed_at is null;

create table duel_v4.receipts (
  room_id uuid not null,
  user_id uuid not null,
  foreign key (room_id,user_id) references duel_v4.members on delete cascade,
  request_id uuid not null,
  operation text not null,
  input jsonb not null,
  result jsonb not null,
  primary key (room_id,user_id,request_id)
);

create table duel_v4.attacks (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null,
  actor_id uuid not null,
  target_id uuid not null,
  foreign key (room_id,actor_id) references duel_v4.members on delete cascade,
  foreign key (room_id,target_id) references duel_v4.members on delete cascade,
  check (actor_id<>target_id),
  grant_id uuid unique not null references duel_v4.grants,
  item_id text not null references duel_v4.catalog,
  tier text not null check (tier in ('normal','enhanced','weakened')),
  due_at timestamptz not null,
  source_version bigint,
  target_version bigint,
  resolved_at timestamptz,
  outcome text,
  check ((resolved_at is null)=(outcome is null))
);
create index duel_v4_due_attacks on duel_v4.attacks(room_id,due_at,id) where resolved_at is null;

create table duel_v4.effects (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null,
  user_id uuid not null,
  foreign key (room_id,user_id) references duel_v4.members on delete cascade,
  kind text not null,
  tier text not null check (tier in ('normal','enhanced','weakened')),
  starts_at timestamptz not null,
  expires_at timestamptz not null,
  ended_at timestamptz,
  attack_id uuid references duel_v4.attacks,
  blocked_page_ids text[] not null default '{}',
  check (expires_at>starts_at)
);
create index duel_v4_active_effects on duel_v4.effects(room_id,user_id,kind,expires_at) where ended_at is null;

create table duel_v4.traps (
  grant_id uuid primary key references duel_v4.grants,
  room_id uuid not null,
  actor_id uuid not null,
  target_id uuid not null,
  foreign key (room_id,actor_id) references duel_v4.members on delete cascade,
  foreign key (room_id,target_id) references duel_v4.members on delete cascade,
  check (actor_id<>target_id),
  source_id uuid not null references public.wiki_page_snapshots(id),
  destination_page text not null,
  tier text not null check (tier in ('normal','enhanced','weakened')),
  triggered_at timestamptz
);
create unique index duel_v4_armed_traps on duel_v4.traps(room_id,target_id,source_id,destination_page)
  where triggered_at is null;

create table duel_v4_events.signals (
  room_id uuid not null references duel_v4.rooms(id) on delete cascade,
  recipient_id uuid not null,
  version bigint not null,
  primary key(room_id,recipient_id)
);
alter table duel_v4_events.signals enable row level security;
revoke all on duel_v4_events.signals from public, anon, authenticated, service_role;
grant select on duel_v4_events.signals to authenticated;
create policy duel_v4_recipient_only on duel_v4_events.signals for select to authenticated
  using (recipient_id=(select auth.uid()));
alter publication supabase_realtime add table duel_v4_events.signals;

create function duel_v4.publish(room uuid) returns void
language sql set search_path='' as $$
  with bumped as (
    update duel_v4.rooms set version=version+1 where id=room returning version
  )
  insert into duel_v4_events.signals(room_id,recipient_id,version)
  select m.room_id,m.user_id,b.version from duel_v4.members m cross join bumped b where m.room_id=room
  on conflict (room_id,recipient_id) do update set version=excluded.version
$$;

create function duel_v4.can_enter(actor uuid) returns boolean
language sql stable set search_path='' as $$
  select exists(select from duel_v4.admission a where a.user_id=actor and a.expires_at>now())
$$;

create function duel_v4.tier(g duel_v4.grants) returns text
language sql immutable strict set search_path='' as $$
  select case when g.enhanced and g.weakened then 'normal' when g.enhanced then 'enhanced'
    when g.weakened then 'weakened' else g.base_tier end
$$;

create function duel_v4.supply(room duel_v4.rooms, at_time timestamptz) returns boolean
language plpgsql set search_path='' as $$
declare
  due bigint := case when at_time<room.started_at+interval '20 seconds' then 0
    else 1+floor(extract(epoch from (at_time-room.started_at-interval '20 seconds'))/25)::bigint end;
  owner duel_v4.members;
  free_slot smallint;
  selected text;
begin
  if due<=room.supply_round then return false; end if;
  -- Like S5, a delayed read delivers the newest due round once, without
  -- stockpiling missed drops or replacing a held item.
  update duel_v4.rooms set supply_round=due where id=room.id;
  for owner in select * from duel_v4.members m where m.room_id=room.id order by m.seat loop
    select s into free_slot from generate_series(1,2) s where not exists (
      select from duel_v4.grants g where g.room_id=room.id and g.user_id=owner.user_id and g.slot=s and g.consumed_at is null
    ) order by s limit 1;
    if free_slot is null then continue; end if;
    select item_id into strict selected from duel_v4.catalog where review_enabled order by gen_random_uuid() limit 1;
    insert into duel_v4.grants(room_id,user_id,slot,item_id,supply_round,granted_at,enhanced,weakened)
    values(room.id,owner.user_id,free_slot,selected,due,at_time,owner.pending_enhance>0,owner.pending_weaken>0);
    update duel_v4.members set pending_enhance=greatest(0,pending_enhance-1),pending_weaken=greatest(0,pending_weaken-1)
    where room_id=room.id and user_id=owner.user_id;
  end loop;
  return true;
end $$;

create function duel_v4.finish(room duel_v4.rooms, winner uuid, reason text, at_time timestamptz)
returns void language plpgsql set search_path='' as $$
declare loser uuid; start_title text; target_title text;
begin
  if room.finished_at is not null then return; end if;
  if winner is not null then
    select user_id into strict loser from duel_v4.members m where m.room_id=room.id and m.user_id<>winner;
  end if;
  select canonical_title_snapshot into strict start_title from public.wiki_page_snapshots where id=room.start_id;
  select canonical_title_snapshot into strict target_title from public.wiki_page_snapshots where id=room.target_id;
  update duel_v4.rooms set finished_at=at_time,finish_reason=reason,winner_id=winner where id=room.id;
  -- A terminal projection invokes the existing achievement and duel XP triggers.
  update public.game_rooms set status='finished',finished_at=at_time,finished_reason=reason,
    winner_user_id=winner,winner_user_ids=case when winner is null then '{}'::uuid[] else array[winner] end
  where id=room.result_room_id;
  insert into public.match_history(room_id,winner_user_id,loser_user_id,winner_start_title,loser_start_title,
    winner_target_title,loser_target_title,duration_seconds,result_status,result_reason,finalized_at)
  values(room.result_room_id,winner,loser,start_title,start_title,target_title,target_title,
    greatest(0,floor(extract(epoch from (at_time-room.started_at)))::integer),
    case reason when 'normal_finish' then 'completed' when 'forfeit' then 'forfeit' else 'cancelled' end,reason,at_time);
end $$;

create function duel_v4.apply_thunder(room_id uuid, recipient uuid, tier text, self_penalty boolean,
  at_time timestamptz, attack uuid default null)
returns void language plpgsql set search_path='' as $$
declare
  chain_start timestamptz;
  stun_until timestamptz;
  duration integer:=case when self_penalty then 5 when tier='enhanced' then 4
    when tier='weakened' then 2 else 3 end;
begin
  select e.starts_at,e.expires_at into chain_start,stun_until from duel_v4.effects e
  where e.room_id=apply_thunder.room_id and e.user_id=recipient and e.kind='stun'
    and e.ended_at is null and e.starts_at<=at_time and at_time<=e.expires_at;
  if found then
    stun_until:=least(chain_start+interval '5 seconds',greatest(stun_until,at_time+make_interval(secs=>duration)));
    update duel_v4.effects e set ended_at=at_time where e.room_id=apply_thunder.room_id and e.user_id=recipient
      and e.kind='stun' and e.ended_at is null and e.starts_at<=at_time and at_time<=e.expires_at;
  else
    chain_start:=at_time;
    stun_until:=at_time+make_interval(secs=>duration);
  end if;
  if stun_until>at_time then
    insert into duel_v4.effects(room_id,user_id,kind,tier,starts_at,expires_at,attack_id)
    values(room_id,recipient,'stun',tier,chain_start,stun_until,attack);
  end if;
  if self_penalty then
    insert into duel_v4.effects(room_id,user_id,kind,tier,starts_at,expires_at,attack_id)
    values(room_id,recipient,'thunder_seal',tier,stun_until,stun_until+interval '3 seconds',attack);
  end if;
end $$;

create function duel_v4.lost_link_plan(room duel_v4.rooms, member duel_v4.members, hop_count integer, seed uuid,
  at_time timestamptz)
returns uuid[] language plpgsql stable set search_path='' as $$
declare
  links uuid[]:='{}';
  source uuid:=member.snapshot_id;
  next_page uuid;
begin
  for hop in 1..hop_count loop
    select candidate.id into next_page from public.wiki_snapshot_links l
    cross join lateral (
      select s.id from public.wiki_page_snapshots s where s.page_id=l.target_page_id
        and (l.target_revision_id is null or s.revision_id=l.target_revision_id)
      order by s.fetched_at desc,s.id limit 1
    ) candidate
    where l.snapshot_id=source and candidate.id<>source
      and l.target_page_id<>(select page_id from public.wiki_page_snapshots where id=room.target_id)
      and (hop>1 or not exists(
        select from duel_v4.effects e where e.room_id=room.id and e.user_id=member.user_id and e.kind='censor'
          and e.ended_at is null and e.starts_at<=at_time and at_time<e.expires_at
          and l.target_page_id=any(e.blocked_page_ids)))
    order by md5(seed::text||':'||hop||':'||candidate.id),candidate.id limit 1;
    if not found then return '{}'::uuid[]; end if;
    links:=array_append(links,next_page);
    source:=next_page;
  end loop;
  return links;
end $$;

create function duel_v4.resolve_attack(a duel_v4.attacks, destination uuid, hit_tier text, at_time timestamptz, reflected boolean)
returns text language plpgsql set search_path='' as $$
declare
  protection uuid;
  resolution text;
  lifetime integer;
  exits text[];
  blocked integer;
  forced_path uuid[];
  forced_destination uuid;
  hop integer:=0;
  member duel_v4.members;
  room duel_v4.rooms;
begin
  if a.item_id='censor' then
    select array_agg(l.target_page_id order by md5(a.id::text||l.target_page_id)) into exits
    from duel_v4.members m join public.wiki_snapshot_links l on l.snapshot_id=m.snapshot_id
    where m.room_id=a.room_id and m.user_id=destination;
    if coalesce(cardinality(exits),0)<=2 then
      update duel_v4.attacks set resolved_at=at_time,outcome='no_censor_candidates' where id=a.id;
      return 'no_censor_candidates';
    end if;
  end if;
  if a.item_id='lost_link' then
    select * into strict room from duel_v4.rooms r where r.id=a.room_id;
    select * into strict member from duel_v4.members m where m.room_id=a.room_id and m.user_id=destination;
    if member.progress_version=(case when reflected then a.source_version else a.target_version end) then
      forced_path:=duel_v4.lost_link_plan(room,member,case when a.tier='enhanced' then 2 else 1 end,a.id,at_time);
    end if;
    if coalesce(cardinality(forced_path),0)=0 then
      update duel_v4.attacks set resolved_at=at_time,outcome='void_ineligible' where id=a.id;
      return 'void_ineligible';
    end if;
  end if;
  select e.id into protection from duel_v4.effects e
  where e.room_id=a.room_id and e.user_id=destination and e.kind='shield'
    and e.ended_at is null and e.starts_at<=at_time and at_time<e.expires_at;
  if protection is not null then
    update duel_v4.effects set ended_at=at_time where id=protection;
    resolution:=case when reflected then 'reflected_blocked' else 'blocked' end;
  elsif a.item_id='censor' then
    blocked:=least(cardinality(exits)-2,ceil(cardinality(exits) *
      (case hit_tier when 'weakened' then 0.25 else 0.50 end))::integer);
    lifetime:=case hit_tier when 'weakened' then 2 else 3 end;
    if hit_tier='enhanced' then blocked:=least(blocked,cardinality(exits)/2); end if;
    update duel_v4.effects e set ended_at=at_time where e.room_id=a.room_id and e.user_id=destination
      and e.kind='censor' and e.ended_at is null and e.expires_at>at_time;
    insert into duel_v4.effects(room_id,user_id,kind,tier,starts_at,expires_at,attack_id,blocked_page_ids)
    values(a.room_id,destination,'censor',hit_tier,at_time,at_time+make_interval(secs=>lifetime),a.id,exits[1:blocked]);
    if hit_tier='enhanced' then
      insert into duel_v4.effects(room_id,user_id,kind,tier,starts_at,expires_at,attack_id,blocked_page_ids)
      values(a.room_id,destination,'censor',hit_tier,at_time+interval '3 seconds',at_time+interval '6 seconds',a.id,
        exits[(blocked+1):(2*blocked)]);
    end if;
    resolution:=case when reflected then 'reflected' else 'hit' end;
  elsif a.item_id='thunder' then
    perform duel_v4.apply_thunder(a.room_id,destination,hit_tier,false,at_time,a.id);
    resolution:=case when reflected then 'reflected' else 'hit' end;
  elsif a.item_id='lost_link' then
    foreach forced_destination in array forced_path loop
      hop:=hop+1;
      perform duel_v4.move(room,member,forced_destination,'lost_link',md5(a.id::text||':'||hop)::uuid,at_time,
        case when a.tier='weakened' then 0 else 1 end);
      select * into strict member from duel_v4.members m where m.room_id=a.room_id and m.user_id=destination;
    end loop;
    resolution:=case when reflected then 'reflected' else 'hit' end;
  else
    lifetime:=case hit_tier when 'enhanced' then 9 when 'weakened' then 3 else 6 end;
    insert into duel_v4.effects(room_id,user_id,kind,tier,starts_at,expires_at,attack_id)
    values(a.room_id,destination,a.item_id,hit_tier,at_time,at_time+make_interval(secs=>lifetime),a.id);
    resolution:=case when reflected then 'reflected' else 'hit' end;
  end if;
  update duel_v4.attacks set resolved_at=at_time,outcome=resolution where id=a.id;
  return resolution;
end $$;

create function duel_v4.advance(room duel_v4.rooms, at_time timestamptz)
returns boolean language plpgsql set search_path='' as $$
declare
  expired integer;
  still_here uuid;
  attack duel_v4.attacks;
  changed boolean;
begin
  if room.started_at is null or room.finished_at is not null then return false; end if;
  select count(*) filter (where m.last_seen_at<=at_time-interval '60 seconds'),
    (array_agg(m.user_id) filter (where m.last_seen_at>at_time-interval '60 seconds'))[1]
  into expired,still_here from duel_v4.members m where m.room_id=room.id;
  if expired>0 then
    perform duel_v4.finish(room,still_here,case expired when 1 then 'forfeit' else 'cancelled' end,at_time);
    return true;
  end if;
  changed:=duel_v4.supply(room,at_time);
  for attack in select * from duel_v4.attacks a
    where a.room_id=room.id and a.resolved_at is null and a.due_at<=at_time order by a.due_at,a.id loop
    perform duel_v4.resolve_attack(attack,attack.target_id,attack.tier,attack.due_at,false);
    changed:=true;
  end loop;
  return changed;
end $$;

create function duel_v4.snapshot(snapshot uuid) returns jsonb
language sql stable strict set search_path='' as $$
  select jsonb_build_object('snapshotId',s.id,'pageId',s.page_id,'revisionId',s.revision_id,'title',s.canonical_title_snapshot)
  from public.wiki_page_snapshots s where s.id=snapshot
$$;

create function duel_v4.exit_blocked(room_id uuid, actor uuid, page_id text, at_time timestamptz)
returns boolean language sql stable set search_path='' as $$
  select exists(select from duel_v4.effects e where e.room_id=$1 and e.user_id=$2 and e.kind in ('censor','trap_seal')
    and e.ended_at is null and e.starts_at<=$4 and $4<e.expires_at and $3=any(e.blocked_page_ids))
$$;

create function duel_v4.project(room duel_v4.rooms, actor uuid, at_time timestamptz)
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object(
    'id',room.id,'code',room.code,'hostId',room.host_id,'version',room.version,
    'selfId',actor,'serverTime',at_time,'startedAt',room.started_at,'finishedAt',room.finished_at,
    'winnerId',room.winner_id,'finishReason',room.finish_reason,
    'target',duel_v4.snapshot(room.target_id),'start',duel_v4.snapshot(room.start_id),
    'nextSupplyAt',case when room.started_at is not null and room.finished_at is null
      then room.started_at+make_interval(secs=>20+25*room.supply_round) end,
    'rematchId',(select id from duel_v4.rooms n where n.replay_of=room.id),
    'players',(select jsonb_agg(jsonb_build_object('id',m.user_id,'name',p.nickname,'page',duel_v4.snapshot(m.snapshot_id),
      'moves',m.move_count,'progressVersion',m.progress_version,'path',case when m.user_id=actor or room.finished_at is not null then
        (select jsonb_agg(duel_v4.snapshot(step) order by ordinal) from unnest(m.path) with ordinality t(step,ordinal)) end)
      order by m.seat) from duel_v4.members m join public.profiles p on p.id=m.user_id where m.room_id=room.id),
    'inventory',(select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'itemId',g.item_id,'slot',g.slot,
      'tier',duel_v4.tier(g),'enhanced',g.enhanced,'weakened',g.weakened) order by g.slot),'[]'::jsonb)
      from duel_v4.grants g where g.room_id=room.id and g.user_id=actor and g.consumed_at is null),
    'effects',(select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'kind',e.kind,'tier',e.tier,
      'startsAt',e.starts_at,'expiresAt',e.expires_at) order by e.starts_at,e.id),'[]'::jsonb)
      from duel_v4.effects e where e.room_id=room.id and e.user_id=actor and e.ended_at is null and e.expires_at>at_time),
    'censoredTitles',(select coalesce(jsonb_agg(distinct l.target_title_snapshot),'[]'::jsonb)
      from duel_v4.effects e join duel_v4.members m on (m.room_id,m.user_id)=(e.room_id,e.user_id)
      join public.wiki_snapshot_links l on l.snapshot_id=m.snapshot_id and l.target_page_id=any(e.blocked_page_ids)
      where e.room_id=room.id and e.user_id=actor and e.kind in ('censor','trap_seal') and e.ended_at is null
        and e.starts_at<=at_time and at_time<e.expires_at),
    'trapOptions',(select coalesce(jsonb_agg(jsonb_build_object('pageId',l.target_page_id,'title',l.target_title_snapshot)
      order by l.ordinal),'[]'::jsonb) from duel_v4.members m join public.wiki_snapshot_links l on l.snapshot_id=m.snapshot_id
      where m.room_id=room.id and m.user_id<>actor
      and not duel_v4.exit_blocked(room.id,m.user_id,l.target_page_id,at_time)
      and exists(select from duel_v4.grants g where g.room_id=room.id and g.user_id=actor and g.item_id='trap' and g.consumed_at is null)),
    'warnings',(select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'itemId',a.item_id,'dueAt',a.due_at)
      order by a.due_at,a.id),'[]'::jsonb) from duel_v4.attacks a
      where a.room_id=room.id and a.target_id=actor and a.resolved_at is null),
    'attackResults',(select coalesce(jsonb_agg(to_jsonb(a) order by a.resolved_at,a.id),'[]'::jsonb) from (
      select id,item_id,tier,resolved_at,outcome,actor_id,target_id from duel_v4.attacks
      where room_id=room.id and resolved_at is not null and (actor_id=actor or target_id=actor)
      order by resolved_at desc,id limit 10) a),
    'bookmark',(select jsonb_build_object('page',duel_v4.snapshot(m.bookmarked_id),'uses',m.bookmark_uses,'expiresAt',m.bookmark_expires_at)
      from duel_v4.members m where m.room_id=room.id and m.user_id=actor and m.bookmark_uses>0 and m.bookmark_expires_at>at_time),
    'linkIndex',(select case when exists(select from duel_v4.effects e where e.room_id=room.id and e.user_id=actor
      and e.kind='link_index' and e.ended_at is null and e.expires_at>at_time) then
      (select coalesce(jsonb_agg(jsonb_build_object('pageId',l.target_page_id,'title',l.target_title_snapshot) order by l.ordinal),'[]'::jsonb)
        from public.wiki_snapshot_links l where l.snapshot_id=m.snapshot_id) end from duel_v4.members m where m.room_id=room.id and m.user_id=actor),
    'xp',(select coalesce(sum(x.amount),0) from public.match_history h join public.xp_ledger x on x.source_id=h.id
      where h.room_id=room.result_room_id and x.user_id=actor and x.source_type in
        ('duel_win_normal','duel_loss_normal','duel_win_forfeit','duel_loss_forfeit'))
  )
$$;

create function public.get_duel_v4_entry() returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('available',duel_v4.can_enter(auth.uid()),'version','duel-items-v4-review')
$$;

create function public.get_duel_v4_state(p_room uuid) returns jsonb
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
  return duel_v4.project(room,actor,at_time);
end $$;


create function duel_v4.move(room duel_v4.rooms, member duel_v4.members, destination uuid, move_kind text,
  request uuid, at_time timestamptz, move_delta integer default 1)
returns void language plpgsql set search_path='' as $$
begin
  update duel_v4.members m set snapshot_id=destination,move_count=m.move_count+move_delta,path=array_append(m.path,destination),
    last_move_kind=move_kind,progress_version=m.progress_version+1,
    bookmark_uses=case move_kind when 'bookmark' then 0 when 'link' then greatest(0,bookmark_uses-1) else bookmark_uses end
    where room_id=room.id and user_id=member.user_id;
  update duel_v4.effects set ended_at=at_time where room_id=room.id and user_id=member.user_id
    and kind in ('link_index','censor','trap_seal','trap_stun') and ended_at is null;
  insert into public.game_move_events(scope,game_id,actor_user_id,affected_user_id,request_id,correlation_id,event_type,
    from_page_id,from_revision_id,from_title_snapshot,to_page_id,to_revision_id,to_title_snapshot,
    move_delta,move_count_after,version_before,version_after,metadata,server_timestamp)
  select 'duel',room.result_room_id,member.user_id,member.user_id,request,request,
    case move_kind when 'link' then 'NORMAL_LINK' when 'undo' then 'UNDO' when 'lost_link' then 'FORCED_LINK'
      when 'cannon' then 'RANDOM_TELEPORT' else 'REWIND' end,
    source.page_id,source.revision_id,source.canonical_title_snapshot,dest.page_id,dest.revision_id,dest.canonical_title_snapshot,
    move_delta,member.move_count+move_delta,member.progress_version,member.progress_version+1,
    jsonb_build_object('rules','duel-v4','kind',move_kind),at_time
  from public.wiki_page_snapshots source cross join public.wiki_page_snapshots dest
  where source.id=member.snapshot_id and dest.id=destination and move_delta<>0;
  if move_kind='link' and exists(select from public.wiki_page_snapshots destination_snapshot
    join public.wiki_page_snapshots target on target.id=room.target_id and target.page_id=destination_snapshot.page_id
    where destination_snapshot.id=destination) then
    perform duel_v4.finish(room,member.user_id,'normal_finish',at_time);
  end if;
end $$;

create function duel_v4.trip_trap(room duel_v4.rooms, member duel_v4.members, destination text, at_time timestamptz)
returns text language plpgsql set search_path='' as $$
declare
  trap duel_v4.traps;
  protection uuid;
begin
  select * into trap from duel_v4.traps t where t.room_id=room.id and t.target_id=member.user_id
    and t.source_id=member.snapshot_id and t.destination_page=destination and t.triggered_at is null;
  if not found then return 'none'; end if;
  update duel_v4.traps set triggered_at=at_time where grant_id=trap.grant_id;
  select e.id into protection from duel_v4.effects e where e.room_id=room.id and e.user_id=member.user_id
    and e.kind='shield' and e.ended_at is null and e.starts_at<=at_time and at_time<e.expires_at;
  if protection is not null then
    update duel_v4.effects e set ended_at=at_time where e.id=protection;
    return 'blocked';
  end if;
  if trap.tier='weakened' then return 'arrival'; end if;
  insert into duel_v4.effects(room_id,user_id,kind,tier,starts_at,expires_at)
  values(room.id,member.user_id,'trap_stun',trap.tier,at_time,at_time+interval '3 seconds');
  if trap.tier='enhanced' and exists(select from public.wiki_snapshot_links l where l.snapshot_id=member.snapshot_id
    and l.target_page_id<>destination and not duel_v4.exit_blocked(room.id,member.user_id,l.target_page_id,at_time)) then
    insert into duel_v4.effects(room_id,user_id,kind,tier,starts_at,expires_at,blocked_page_ids)
    values(room.id,member.user_id,'trap_seal',trap.tier,at_time,'infinity',array[destination]);
    return 'sealed';
  end if;
  return 'stopped';
end $$;

create function duel_v4.activate(room duel_v4.rooms, member duel_v4.members, opponent uuid,
  request uuid, input jsonb, at_time timestamptz) returns text
language plpgsql set search_path='' as $$
declare
  g duel_v4.grants;
  stolen duel_v4.grants;
  a duel_v4.attacks;
  tier text;
  duration integer;
  charges integer;
  affected integer;
  effect_id uuid;
  target_grant uuid;
  attack_seed uuid;
  target_member duel_v4.members;
  destination uuid;
  result text := 'ITEM_USED';
begin
  select * into g from duel_v4.grants where id=(input->>'grantId')::uuid and room_id=room.id
    and user_id=member.user_id and consumed_at is null;
  if not found or not exists(select from duel_v4.catalog where item_id=g.item_id and review_enabled) then
    raise check_violation using message='ITEM_NOT_AVAILABLE';
  end if;
  tier:=duel_v4.tier(g);
  if g.item_id<>'correction' and exists(select from duel_v4.effects e where e.room_id=room.id
    and e.user_id=member.user_id and e.kind in ('stun','cannon_stun','trap_stun','thunder_seal') and e.ended_at is null
    and e.starts_at<=at_time and at_time<e.expires_at) then
    raise check_violation using message='ITEM_SEALED';
  end if;
  case g.item_id
    when 'thunder' then
      if random()>=0.5 then
        perform duel_v4.apply_thunder(room.id,member.user_id,tier,true,at_time);
        result:='THUNDER_SELF_PENALTY';
      elsif tier='weakened' then
        perform duel_v4.apply_thunder(room.id,member.user_id,tier,false,at_time);
        result:='THUNDER_SELF_STUN';
      else
        insert into duel_v4.attacks(room_id,actor_id,target_id,grant_id,item_id,tier,due_at)
        values(room.id,member.user_id,opponent,g.id,g.item_id,tier,at_time+interval '2 seconds');
        result:='ATTACK_WARNING';
      end if;
    when 'ink', 'censor' then
      insert into duel_v4.attacks(room_id,actor_id,target_id,grant_id,item_id,tier,due_at)
      values(room.id,member.user_id,opponent,g.id,g.item_id,tier,at_time+interval '2 seconds');
      result:='ATTACK_WARNING';
    when 'lost_link' then
      select * into strict target_member from duel_v4.members m where m.room_id=room.id and m.user_id=opponent;
      attack_seed:=gen_random_uuid();
      if cardinality(duel_v4.lost_link_plan(room,target_member,case when tier='enhanced' then 2 else 1 end,attack_seed,at_time))=0 then
        raise check_violation using message='LOST_LINK_NO_DESTINATION';
      end if;
      insert into duel_v4.attacks(id,room_id,actor_id,target_id,grant_id,item_id,tier,due_at,source_version,target_version)
      values(attack_seed,room.id,member.user_id,opponent,g.id,g.item_id,tier,at_time+interval '2 seconds',
        member.progress_version,target_member.progress_version);
      result:='ATTACK_WARNING';
    when 'parry' then
      select * into a from duel_v4.attacks where id=(input->>'attackId')::uuid and room_id=room.id
        and target_id=member.user_id and resolved_at is null and due_at>at_time;
      if not found then raise check_violation using message='PARRY_WINDOW_CLOSED'; end if;
      if tier='weakened' then
        update duel_v4.attacks set resolved_at=at_time,outcome='parried_blocked' where id=a.id;
        result:='PARRY_BLOCKED';
      else
        result:=case duel_v4.resolve_attack(a,a.actor_id,case when tier='enhanced' then tier else a.tier end,at_time,true)
          when 'reflected' then 'PARRY_REFLECTED' when 'reflected_blocked' then 'PARRY_BLOCKED' else 'PARRY_TARGET_CHANGED' end;
      end if;
    when 'shield' then
      if exists(select from duel_v4.effects e where e.room_id=room.id and e.user_id=member.user_id
        and e.kind='shield' and e.ended_at is null and e.expires_at>at_time) then
        raise check_violation using message='SHIELD_ALREADY_ACTIVE';
      end if;
      insert into duel_v4.effects(room_id,user_id,kind,tier,starts_at,expires_at)
      values(room.id,member.user_id,'shield',tier,at_time,
        case tier when 'enhanced' then 'infinity'::timestamptz when 'weakened' then at_time+interval '4 seconds'
          else at_time+interval '8 seconds' end);
      result:='SHIELD_ACTIVE';
    when 'bookmark' then
      update duel_v4.members set bookmarked_id=member.snapshot_id,bookmark_expires_at='infinity',
        bookmark_uses=case tier when 'enhanced' then 7 when 'weakened' then 3 else 5 end
      where room_id=room.id and user_id=member.user_id;
      result:='BOOKMARK_SAVED';
    when 'undo' then
      if member.last_move_kind is null
        or (member.last_move_kind<>'link' and not (tier='enhanced' and member.last_move_kind in ('lost_link','cannon')))
        or member.path[cardinality(member.path)-1]=member.snapshot_id then
        raise check_violation using message='UNDO_NOT_AVAILABLE';
      end if;
      if tier='weakened' and random()>=0.7 then
        result:='ITEM_CHANCE_FAILED';
      else
        perform duel_v4.move(room,member,member.path[cardinality(member.path)-1],'undo',request,at_time);
        result:='UNDONE';
      end if;
    when 'correction' then
      select e.id into effect_id from duel_v4.effects e where e.room_id=room.id and e.user_id=member.user_id
        and e.kind in ('ink','stun','cannon_stun','trap_stun','censor','thunder_seal') and e.ended_at is null and e.expires_at>at_time
        and e.starts_at<=at_time order by e.starts_at desc,e.id desc limit 1;
      if effect_id is null then raise check_violation using message='NO_EFFECT_TO_CLEAR'; end if;
      if tier='weakened' and random()>=0.6 then
        result:='ITEM_CHANCE_FAILED';
      else
        if exists(select from duel_v4.effects e where e.room_id=room.id and e.user_id=member.user_id
          and e.kind='shield' and e.ended_at is null and e.expires_at>at_time) then
          raise check_violation using message='SHIELD_ALREADY_ACTIVE';
        end if;
        update duel_v4.effects e set ended_at=at_time
        where e.id=effect_id or (e.room_id=room.id and e.user_id=member.user_id and e.ended_at is null and (
          (e.kind='censor' and e.attack_id=(select attack_id from duel_v4.effects where id=effect_id)) or
          (e.kind in ('stun','thunder_seal') and e.expires_at>at_time
           and exists(select from duel_v4.effects cleared where cleared.id=effect_id and cleared.kind in ('stun','thunder_seal')))
        ));
        insert into duel_v4.effects(room_id,user_id,kind,tier,starts_at,expires_at)
        values(room.id,member.user_id,'shield',tier,at_time,at_time+interval '1 second');
        result:='EFFECT_CLEARED';
      end if;
    when 'link_index' then
      duration:=20;
      insert into duel_v4.effects(room_id,user_id,kind,tier,starts_at,expires_at)
      values(room.id,member.user_id,g.item_id,tier,at_time,at_time+make_interval(secs=>duration));
      result:='LINK_INDEX_OPEN';
    when 'enhancement' then
      charges:=case tier when 'enhanced' then 2 else 1 end;
      select other.id into target_grant from duel_v4.grants other where other.room_id=room.id
        and other.user_id=member.user_id and other.consumed_at is null and other.id<>g.id and not other.enhanced;
      if target_grant is distinct from (input->>'targetGrantId')::uuid then
        raise check_violation using message='INVALID_MODIFIER_SELECTION';
      end if;
      if tier='weakened' and random()>=0.6 then
        result:='ITEM_CHANCE_FAILED';
      else
        update duel_v4.grants set enhanced=true where id=target_grant;
        get diagnostics affected=row_count;
        update duel_v4.members set pending_enhance=pending_enhance+charges-affected
        where room_id=room.id and user_id=member.user_id;
        result:='ITEM_ENHANCED';
      end if;
    when 'weakening' then
      charges:=case tier when 'enhanced' then 2 else 1 end;
      if tier='weakened' and random()>=0.6 then
        result:='ITEM_CHANCE_FAILED';
      else
        update duel_v4.grants set weakened=true where id in (
          select other.id from duel_v4.grants other where other.room_id=room.id
            and other.user_id=opponent and other.consumed_at is null and not other.weakened
          order by gen_random_uuid() limit charges);
        get diagnostics affected=row_count;
        update duel_v4.members set pending_weaken=pending_weaken+charges-affected
        where room_id=room.id and user_id=opponent;
        result:='ITEM_WEAKENED';
      end if;
    when 'thief' then
      select other.* into stolen from duel_v4.grants other where other.room_id=room.id and other.user_id=opponent
        and other.consumed_at is null and (tier='normal' or duel_v4.tier(other)=tier) order by gen_random_uuid() limit 1;
      if not found then raise check_violation using message='THIEF_NO_TRANSFERABLE_GRANT'; end if;
      if random()>=0.5 then
        result:='THIEF_EMPTY';
      else
        update duel_v4.grants set consumed_at=at_time,consumed_request=request where id=g.id;
        update duel_v4.grants set consumed_at=at_time,consumed_request=gen_random_uuid() where id=stolen.id;
        insert into duel_v4.grants(room_id,user_id,slot,item_id,granted_at,base_tier,stolen_from)
        values(room.id,member.user_id,g.slot,stolen.item_id,at_time,duel_v4.tier(stolen),stolen.id);
        return 'THIEF_STOLEN';
      end if;
    when 'cannon' then
      select * into strict target_member from duel_v4.members m where m.room_id=room.id and m.user_id=opponent;
      if not exists(select from public.wiki_page_snapshots s,public.wiki_page_snapshots t,public.wiki_page_snapshots goal
        where s.id=member.snapshot_id and t.id=target_member.snapshot_id and goal.id=room.target_id
          and t.page_id<>s.page_id and t.page_id<>goal.page_id) then
        raise check_violation using message='CANNON_DESTINATION_UNAVAILABLE';
      end if;
      -- Approved for this private, allowlisted review ruleset only.
      if random()<0.5 then
        destination:=target_member.snapshot_id;
        result:='CANNON_LANDED';
        if tier<>'normal' then
          insert into duel_v4.effects(room_id,user_id,kind,tier,starts_at,expires_at)
          values(room.id,case when tier='enhanced' then opponent else member.user_id end,
            'cannon_stun',tier,at_time,at_time+interval '2 seconds');
        end if;
      else
        destination:=room.start_id;
        result:='CANNON_RETURNED';
      end if;
      if destination<>member.snapshot_id then
        perform duel_v4.move(room,member,destination,'cannon',request,at_time);
      end if;
    when 'trap' then
      select * into strict target_member from duel_v4.members m where m.room_id=room.id and m.user_id=opponent;
      if (input->>'expectedTargetSnapshotId')::uuid is distinct from target_member.snapshot_id
        or (input->>'expectedTargetProgressVersion')::bigint is distinct from target_member.progress_version
        or not exists(select from public.wiki_snapshot_links l where l.snapshot_id=target_member.snapshot_id
          and l.target_page_id=input->>'destinationPageId')
        or duel_v4.exit_blocked(room.id,opponent,input->>'destinationPageId',at_time) then
        raise check_violation using message='TRAP_SELECTION_STALE';
      end if;
      if tier='enhanced' and not exists(select from public.wiki_snapshot_links l where l.snapshot_id=target_member.snapshot_id
        and l.target_page_id<>input->>'destinationPageId'
        and not duel_v4.exit_blocked(room.id,opponent,l.target_page_id,at_time)
        and not exists(select from duel_v4.traps t where t.room_id=room.id and t.target_id=opponent
          and t.source_id=target_member.snapshot_id and t.destination_page=l.target_page_id
          and t.tier='enhanced' and t.triggered_at is null)) then
        raise check_violation using message='TRAP_LAST_EXIT';
      end if;
      insert into duel_v4.traps values(g.id,room.id,member.user_id,opponent,target_member.snapshot_id,input->>'destinationPageId',tier,null)
      on conflict (room_id,target_id,source_id,destination_page) where triggered_at is null do nothing;
      if not found then raise check_violation using message='TRAP_ALREADY_ARMED'; end if;
      result:='TRAP_INSTALLED';
    else
      raise check_violation using message='ITEM_NOT_IMPLEMENTED';
  end case;

  update duel_v4.grants set consumed_at=at_time,consumed_request=request where id=g.id;
  return result;
end $$;

create function public.create_duel_v4_room(p_request uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); room uuid;
begin
  if p_request is null then raise invalid_parameter_value using message='REQUEST_ID_REQUIRED'; end if;
  if not duel_v4.can_enter(actor) then raise insufficient_privilege using message='DUEL_V4_ENTRY_CLOSED'; end if;
  insert into duel_v4.rooms(host_id,creation_request) values(actor,p_request)
  on conflict (host_id,creation_request) do nothing returning id into room;
  if room is null then
    select id into strict room from duel_v4.rooms where host_id=actor and creation_request=p_request and replay_of is null;
  else
    insert into duel_v4.members(room_id,user_id,seat) values(room,actor,1);
    perform duel_v4.publish(room);
  end if;
  return room;
end $$;

create function public.join_duel_v4_room(p_code text) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); room duel_v4.rooms;
begin
  if not duel_v4.can_enter(actor) then raise insufficient_privilege using message='DUEL_V4_ENTRY_CLOSED'; end if;
  select * into room from duel_v4.rooms where code=upper(btrim(p_code)) for update;
  if not found then raise insufficient_privilege using message='DUEL_V4_ROOM_NOT_AVAILABLE'; end if;
  if exists(select from duel_v4.members m where m.room_id=room.id and m.user_id=actor) then return room.id; end if;
  if room.replay_of is not null and not exists(
    select from duel_v4.members m where m.room_id=room.replay_of and m.user_id=actor
  ) then raise insufficient_privilege using message='DUEL_V4_ROOM_NOT_AVAILABLE'; end if;
  if room.started_at is not null or exists(select from duel_v4.members m where m.room_id=room.id and m.seat=2) then
    raise insufficient_privilege using message='DUEL_V4_ROOM_NOT_AVAILABLE';
  end if;
  insert into duel_v4.members(room_id,user_id,seat) values(room.id,actor,2);
  perform duel_v4.publish(room.id);
  return room.id;
end $$;

create function duel_v4.run_command(room duel_v4.rooms, member duel_v4.members, request uuid,
  operation text, input jsonb, at_time timestamptz) returns jsonb
language plpgsql set search_path='' as $$
declare
  actor uuid:=member.user_id;
  opponent uuid;
  destination uuid;
  result_room uuid;
  next_room uuid;
  next_code text;
  projected_start text;
  projected_page text;
  projected_revision text;
  result text;
  trap_result text;
begin
  select m.user_id into opponent from duel_v4.members m where m.room_id=room.id and m.user_id<>actor;
  if operation='rematch' then
    if room.finished_at is null or not duel_v4.can_enter(actor) then
      raise check_violation using message='REMATCH_NOT_AVAILABLE';
    end if;
    select n.id,n.code into next_room,next_code from duel_v4.rooms n where n.replay_of=room.id;
    if next_room is null then
      insert into duel_v4.rooms(host_id,creation_request,replay_of,target_id) values(actor,request,room.id,room.target_id)
      returning id,code into next_room,next_code;
      insert into duel_v4.members(room_id,user_id,seat) values(next_room,actor,1);
      perform duel_v4.publish(next_room);
      return jsonb_build_object('ok',true,'code','REMATCH_CREATED','roomId',next_room);
    end if;
    perform public.join_duel_v4_room(next_code);
    return jsonb_build_object('ok',true,'code','REMATCH_JOINED','roomId',next_room);
  end if;

  if operation in ('target','start') then
    if room.started_at is not null or room.host_id<>actor or not duel_v4.can_enter(actor) then
      raise check_violation using message='DUEL_V4_HOST_ENTRY_REQUIRED';
    end if;
    destination:=(input->>'snapshotId')::uuid;
    select s.canonical_title_snapshot,s.page_id,s.revision_id into projected_start,projected_page,projected_revision
    from public.wiki_page_snapshots s where s.id=destination;
    if not found then raise check_violation using message='WIKI_SNAPSHOT_REQUIRED'; end if;
    if operation='target' then
      update duel_v4.rooms set target_id=destination where id=room.id;
      return jsonb_build_object('ok',true,'code','TARGET_SAVED');
    end if;
    if room.target_id is null or opponent is null or not duel_v4.can_enter(opponent) then
      raise check_violation using message='DUEL_V4_START_NOT_READY';
    end if;
    if exists(select from public.wiki_page_snapshots s where id=room.target_id and s.page_id=projected_page) then
      raise check_violation using message='START_EQUALS_TARGET';
    end if;
    -- Separate, non-joinable result projection with no v3 room_players.
    insert into public.game_rooms(room_code,host_user_id,mode,status,use_items,is_public,started_at,game_starts_at,
      duel_start_title,duel_start_page_id,duel_start_revision_id)
    values('V4-'||room.id,actor,'duel','playing',false,false,at_time,at_time,projected_start,projected_page,projected_revision)
    returning id into result_room;
    update duel_v4.rooms set started_at=at_time,start_id=destination,result_room_id=result_room where id=room.id
      returning * into room;
    update duel_v4.members set snapshot_id=destination,path=array[destination],last_seen_at=at_time where room_id=room.id;
    perform duel_v4.supply(room,at_time);
    return jsonb_build_object('ok',true,'code','STARTED');
  end if;

  if room.started_at is null or room.finished_at is not null then
    raise check_violation using message='DUEL_V4_MATCH_NOT_ACTIVE';
  end if;
  if operation in ('move','bookmark') and exists(select from duel_v4.effects e where e.room_id=room.id and e.user_id=actor
    and e.kind in ('stun','cannon_stun','trap_stun') and e.ended_at is null and e.starts_at<=at_time and at_time<e.expires_at) then
    raise check_violation using message='STUNNED';
  end if;
  case operation
    when 'move' then
      if (input->>'fromSnapshotId')::uuid is distinct from member.snapshot_id
        or (input->>'expectedProgressVersion')::bigint is distinct from member.progress_version then
        raise check_violation using message='STALE_PAGE';
      end if;
      select s.id into destination from public.wiki_snapshot_links l
        join public.wiki_page_snapshots s on s.page_id=l.target_page_id
        where l.snapshot_id=member.snapshot_id and s.id=(input->>'snapshotId')::uuid
          and (l.target_revision_id is null or l.target_revision_id=s.revision_id);
      if not found or destination=member.snapshot_id then raise check_violation using message='INVALID_WIKI_LINK'; end if;
      select page_id into projected_page from public.wiki_page_snapshots where id=destination;
      if duel_v4.exit_blocked(room.id,actor,projected_page,at_time) then
        raise check_violation using message='LINK_CENSORED';
      end if;
      trap_result:=duel_v4.trip_trap(room,member,projected_page,at_time);
      if trap_result in ('sealed','stopped') then
        return jsonb_build_object('ok',true,'code','TRAP_STOPPED');
      end if;
      perform duel_v4.move(room,member,destination,'link',request,at_time);
      if trap_result='arrival' then
        if not exists(select from duel_v4.rooms r where r.id=room.id and r.finished_at is not null) then
          insert into duel_v4.effects(room_id,user_id,kind,tier,starts_at,expires_at)
          values(room.id,actor,'trap_stun','weakened',at_time,at_time+interval '1 second');
        end if;
        result:='TRAP_ARRIVAL';
      else
        result:='MOVED';
      end if;
    when 'bookmark' then
      if member.bookmark_uses<1 or member.bookmarked_id=member.snapshot_id or member.bookmark_expires_at<=at_time then
        raise check_violation using message='BOOKMARK_NOT_AVAILABLE';
      end if;
      perform duel_v4.move(room,member,member.bookmarked_id,'bookmark',request,at_time);
      result:='BOOKMARK_RETURNED';
    when 'item' then
      result:=duel_v4.activate(room,member,opponent,request,input,at_time);
    when 'forfeit' then
      perform duel_v4.finish(room,opponent,'forfeit',at_time);
      result:='FORFEITED';
    else
      raise check_violation using message='UNKNOWN_DUEL_V4_COMMAND';
  end case;
  return jsonb_build_object('ok',true,'code',result);
end $$;

create function public.act_duel_v4(p_room uuid,p_request uuid,p_operation text,p_input jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor uuid:=auth.uid();
  room duel_v4.rooms;
  member duel_v4.members;
  prior duel_v4.receipts;
  response jsonb;
  at_time timestamptz;
  changed boolean;
  allowed_keys text[];
begin
  if p_request is null or jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>8192 then
    raise invalid_parameter_value using message='INVALID_DUEL_V4_REQUEST';
  end if;
  select r.* into room from duel_v4.rooms r where r.id=p_room
    and exists(select from duel_v4.members m where m.room_id=r.id and m.user_id=actor) for update;
  if not found then raise insufficient_privilege using message='DUEL_V4_MEMBER_REQUIRED'; end if;
  select * into prior from duel_v4.receipts where room_id=p_room and user_id=actor and request_id=p_request;
  if found then
    if (prior.operation,prior.input) is distinct from (p_operation,p_input) then
      raise invalid_parameter_value using message='REQUEST_ID_REUSED';
    end if;
    return prior.result;
  end if;
  allowed_keys:=case p_operation when 'target' then array['snapshotId'] when 'start' then array['snapshotId']
    when 'move' then array['snapshotId','fromSnapshotId','expectedProgressVersion']
    when 'item' then array['grantId','attackId','targetGrantId','destinationPageId','expectedTargetSnapshotId','expectedTargetProgressVersion']
    when 'forfeit' then '{}'::text[] when 'bookmark' then '{}'::text[] when 'rematch' then '{}'::text[] end;
  if allowed_keys is null or p_input-allowed_keys<>'{}'::jsonb then
    raise invalid_parameter_value using message='INVALID_DUEL_V4_REQUEST';
  end if;

  at_time:=clock_timestamp();
  changed:=duel_v4.advance(room,at_time);
  select * into strict room from duel_v4.rooms where id=p_room;
  select * into strict member from duel_v4.members where room_id=p_room and user_id=actor;
  if room.started_at is not null and room.finished_at is null then
    update duel_v4.members set last_seen_at=at_time where room_id=p_room and user_id=actor;
  end if;
  begin
    response:=duel_v4.run_command(room,member,p_request,p_operation,p_input,at_time);
  exception
    when check_violation then
      -- Domain rejections use explicitly raised checks; integrity violations
      -- stay exceptional so a broken projection cannot appear successful.
      if sqlerrm !~ '^[A-Z0-9_]+$' then raise; end if;
      response:=jsonb_build_object('ok',false,'code',sqlerrm);
    when invalid_text_representation or numeric_value_out_of_range then
      response:=jsonb_build_object('ok',false,'code','INVALID_DUEL_V4_REQUEST');
  end;
  response:=response||jsonb_build_object('requestId',p_request);
  insert into duel_v4.receipts values(p_room,actor,p_request,p_operation,p_input,response);
  if changed or (response->>'ok')::boolean then perform duel_v4.publish(room.id); end if;
  return response;
end $$;

revoke all on all tables in schema duel_v4 from public, anon, authenticated, service_role;
revoke all on all functions in schema duel_v4 from public, anon, authenticated, service_role;
revoke all on function public.get_duel_v4_entry(),public.get_duel_v4_state(uuid),public.create_duel_v4_room(uuid),
  public.join_duel_v4_room(text),public.act_duel_v4(uuid,uuid,text,jsonb) from public, anon, authenticated, service_role;
grant execute on function public.get_duel_v4_entry(),public.get_duel_v4_state(uuid),public.create_duel_v4_room(uuid),
  public.join_duel_v4_room(text),public.act_duel_v4(uuid,uuid,text,jsonb) to authenticated;

notify pgrst,'reload schema';
