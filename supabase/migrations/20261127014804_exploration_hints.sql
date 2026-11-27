-- Hints have their own room preference, server clock and retryable release state.
create table private.exploration_hint_options_v1 (
  mode text not null check (mode in ('duel','group','duel_items','group_items')),
  room_id uuid not null,
  enabled boolean not null,
  primary key(mode,room_id)
);
create table private.exploration_hint_rounds_v1 (
  mode text not null,
  room_id uuid not null,
  started_at timestamptz not null,
  round integer not null check (round>0),
  token uuid not null,
  retry_at timestamptz not null,
  published_at timestamptz,
  primary key(mode,room_id,started_at,round),
  foreign key(mode,room_id) references private.exploration_hint_options_v1(mode,room_id) on delete cascade
);
create table private.exploration_hint_documents_v1 (
  mode text not null,
  room_id uuid not null,
  started_at timestamptz not null,
  round integer not null,
  page_id text not null check(page_id ~ '^[1-9][0-9]{0,18}$'),
  title text not null check(length(btrim(title)) between 1 and 240),
  primary key(mode,room_id,started_at,page_id),
  foreign key(mode,room_id,started_at,round) references private.exploration_hint_rounds_v1(mode,room_id,started_at,round) on delete cascade
);
alter table private.exploration_hint_options_v1 enable row level security;
alter table private.exploration_hint_rounds_v1 enable row level security;
alter table private.exploration_hint_documents_v1 enable row level security;
revoke all on private.exploration_hint_options_v1,private.exploration_hint_rounds_v1,private.exploration_hint_documents_v1
  from public,anon,authenticated,service_role;

create function private.exploration_hint_scope_v1(p_mode text,p_room uuid,p_actor uuid)
returns table(host uuid,started_at timestamptz,target_page text,waiting boolean,active boolean)
language sql stable strict set search_path='' as $$
  select r.host_user_id,case when r.mode='duel' then r.started_at else r.game_starts_at end,
    case when r.mode='duel' then h.target_page_id else r.group_target_page_id end,
    r.status='waiting',r.status in ('playing','grace_period')
  from public.game_rooms r
  join public.room_players m on m.room_id=r.id and m.user_id=p_actor
  left join public.room_players h on h.room_id=r.id and h.user_id=r.host_user_id
  where r.id=p_room and r.mode=p_mode and p_mode in ('duel','group') and not r.use_items
  union all
  select r.host_id,r.started_at,t.page_id,
    r.started_at is null and r.waiting_closed_at is null,r.started_at is not null and r.finished_at is null
  from duel_v4.rooms r join duel_v4.members m on m.room_id=r.id and m.user_id=p_actor
  left join public.wiki_page_snapshots t on t.id=r.target_id
  where p_mode='duel_items' and r.id=p_room
  union all
  select r.host_actor,l.started_at,t.page_id,r.phase='waiting' and r.scheduled_start_at is null,
    r.phase='playing' and l.closed_at is null and statement_timestamp()<least(l.deadline_at,coalesce(l.grace_ends_at,l.deadline_at))
  from ink_product.rooms r join ink_product.members m on m.room_id=r.id and m.actor_id=p_actor
  join ink_product.policies p on p.binding=r.binding
  left join ink_product.group_lifecycle_v1 l on l.room_id=r.id
  left join ink_product.wiki_snapshots t on t.id=coalesce(r.selected_goal_snapshot_id,p.goal_snapshot_id)
  where p_mode='group_items' and r.id=p_room and m.status<>'left'
$$;
revoke all on function private.exploration_hint_scope_v1(text,uuid,uuid) from public,anon,authenticated,service_role;

create function public.configure_exploration_hints_v1(p_mode text,p_room uuid,p_enabled boolean)
returns boolean language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); scope record;
begin
  select * into scope from private.exploration_hint_scope_v1(p_mode,p_room,actor);
  if actor is null or scope.host is distinct from actor or scope.waiting is distinct from true or p_enabled is null
  then raise insufficient_privilege using message='HINTS_ROOM_UNAVAILABLE'; end if;
  -- Preference is set once by the room creator, before it is shared.
  insert into private.exploration_hint_options_v1 values(p_mode,p_room,p_enabled) on conflict do nothing;
  return (select enabled=p_enabled from private.exploration_hint_options_v1 where mode=p_mode and room_id=p_room);
end $$;
revoke all on function public.configure_exploration_hints_v1(text,uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.configure_exploration_hints_v1(text,uuid,boolean) to authenticated;

create function public.read_exploration_hints_v1(p_mode text,p_room uuid,p_actor uuid,p_claim boolean default true)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  scope record;
  due_round integer;
  next_round integer;
  clock_at timestamptz:=clock_timestamp();
  lease uuid:=gen_random_uuid();
  claimed uuid;
  next_at timestamptz;
  titles jsonb;
begin
  select * into scope from private.exploration_hint_scope_v1(p_mode,p_room,p_actor);
  if not found then raise insufficient_privilege using message='HINTS_ROOM_UNAVAILABLE'; end if;
  if not exists(select from private.exploration_hint_options_v1 where mode=p_mode and room_id=p_room and enabled)
  then return jsonb_build_object('enabled',false); end if;
  select coalesce(jsonb_agg(title order by round,title,page_id),'[]') into titles from private.exploration_hint_documents_v1
    where mode=p_mode and room_id=p_room and started_at=scope.started_at;
  if scope.started_at is null or scope.target_page is null or scope.active is distinct from true then
    return jsonb_build_object('enabled',true,'titles',titles,'serverNow',clock_at);
  end if;
  due_round:=greatest(0,floor(extract(epoch from (clock_at-scope.started_at))/300)::integer);
  select coalesce(max(round),0)+1 into next_round from private.exploration_hint_rounds_v1
    where mode=p_mode and room_id=p_room and started_at=scope.started_at and published_at is not null;
  next_at:=scope.started_at+make_interval(mins=>next_round*5);
  if next_round<=due_round and p_claim then
    insert into private.exploration_hint_rounds_v1 as r(mode,room_id,started_at,round,token,retry_at)
    values(p_mode,p_room,scope.started_at,next_round,lease,clock_at+interval '15 seconds')
    on conflict(mode,room_id,started_at,round) do update set token=excluded.token,retry_at=excluded.retry_at
      where r.published_at is null and r.retry_at<=clock_at
    returning token into claimed;
    select retry_at into next_at from private.exploration_hint_rounds_v1
      where mode=p_mode and room_id=p_room and started_at=scope.started_at and round=next_round;
  end if;
  return jsonb_build_object('enabled',true,'titles',titles,'serverNow',clock_at,'nextAt',next_at,
    'claim',case when claimed is not null then jsonb_build_object('token',claimed,'round',next_round,'targetPageId',scope.target_page,
      'excludedIds',(select coalesce(jsonb_agg(page_id),'[]') from private.exploration_hint_documents_v1
        where mode=p_mode and room_id=p_room and started_at=scope.started_at)) end);
end $$;

create function public.publish_exploration_hints_v1(p_mode text,p_room uuid,p_actor uuid,
  p_token uuid,p_round integer,p_target text,p_rows jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare scope record;
begin
  select * into scope from private.exploration_hint_scope_v1(p_mode,p_room,p_actor);
  if scope.active is distinct from true or scope.target_page is distinct from p_target then return false; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows)>40 then return false; end if;
  perform 1 from private.exploration_hint_rounds_v1 r where r.mode=p_mode and r.room_id=p_room
    and r.started_at=scope.started_at and r.round=p_round and r.token=p_token and r.published_at is null
  for update;
  if not found then return false; end if;
  insert into private.exploration_hint_documents_v1(mode,room_id,started_at,round,page_id,title)
  select p_mode,p_room,scope.started_at,p_round,x.page_id,x.title from (
    select distinct on(d.page_id) d.page_id,btrim(d.title) title
    from jsonb_to_recordset(p_rows) d(page_id text,title text)
    where d.page_id ~ '^[1-9][0-9]{0,18}$' and d.page_id<>p_target and length(btrim(d.title)) between 1 and 240
    and not exists(select from private.exploration_hint_documents_v1 seen where seen.mode=p_mode
      and seen.room_id=p_room and seen.started_at=scope.started_at and seen.page_id=d.page_id)
    order by d.page_id,btrim(d.title)
    limit 3
  ) x;
  -- A valid lookup may return fewer than three unused backlinks; do not invent a title.
  update private.exploration_hint_rounds_v1 set published_at=clock_timestamp()
    where mode=p_mode and room_id=p_room and started_at=scope.started_at and round=p_round;
  return true;
end $$;
revoke all on function public.read_exploration_hints_v1(text,uuid,uuid,boolean),
  public.publish_exploration_hints_v1(text,uuid,uuid,uuid,integer,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.read_exploration_hints_v1(text,uuid,uuid,boolean),
  public.publish_exploration_hints_v1(text,uuid,uuid,uuid,integer,text,jsonb) to service_role;

-- The game modes create a new room for every rematch. Inherit the option
-- in the same transaction and let the new room have its own release record.
create function private.copy_exploration_hint_option_v1()
returns trigger language plpgsql security definer set search_path='' as $$
declare source_id uuid; next_id uuid; room_mode text;
begin
  if tg_table_schema='private' then
    source_id:=new.source_room_id;
    next_id:=new.next_room_id;
    select r.mode into room_mode from public.game_rooms r where r.id=source_id and not r.use_items;
  elsif tg_table_schema='duel_v4' then
    source_id:=new.replay_of;
    next_id:=new.id;
    room_mode:='duel_items';
  elsif tg_table_schema='ink_product' then
    source_id:=new.previous_room_id;
    next_id:=new.id;
    room_mode:='group_items';
  end if;
  insert into private.exploration_hint_options_v1(mode,room_id,enabled)
  select room_mode,next_id,o.enabled from private.exploration_hint_options_v1 o
    where o.mode=room_mode and o.room_id=source_id
  on conflict(mode,room_id) do nothing;
  return new;
end $$;
revoke all on function private.copy_exploration_hint_option_v1() from public,anon,authenticated,service_role;
create trigger rematch_exploration_hint_option_v1 after insert on private.room_rematches_v1
for each row execute function private.copy_exploration_hint_option_v1();
create trigger rematch_exploration_hint_option_v1 after insert on duel_v4.rooms
for each row when (new.replay_of is not null) execute function private.copy_exploration_hint_option_v1();
create temp table _hint_trigger_role on commit drop as
select inherit_option,set_option from pg_auth_members
where roleid='ink_product_owner'::regrole and member='postgres'::regrole and grantor='postgres'::regrole;
grant ink_product_owner to postgres with inherit true;
create trigger rematch_exploration_hint_option_v1 after insert on ink_product.rooms
for each row when (new.previous_room_id is not null) execute function private.copy_exploration_hint_option_v1();

do $restore$
begin
  if not exists(select from pg_temp._hint_trigger_role) then revoke ink_product_owner from postgres;
  elsif not (select inherit_option from pg_temp._hint_trigger_role) then grant ink_product_owner to postgres with inherit false;
  end if;
end
$restore$;
