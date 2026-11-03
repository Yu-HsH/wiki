-- LOCAL CANDIDATE ONLY. Additive controls; defaults preserve current behavior.
begin;
create table private.duel_release_control_v1 (
  singleton boolean primary key default true check(singleton),
  entry_open boolean not null default true,
  required_protocol text not null default '',
  search_enabled boolean not null default true
);
alter table private.duel_release_control_v1 enable row level security;
revoke all on private.duel_release_control_v1 from public,anon,authenticated,service_role;
insert into private.duel_release_control_v1(singleton) values(true);

create function private.assert_duel_entry_v1() returns void
language plpgsql security definer set search_path='' as $$
declare c private.duel_release_control_v1; headers jsonb;
begin
  -- Closing entry waits for in-flight entry transactions to commit. Control
  -- updates never acquire room locks, so room -> control is safe during drain.
  select * into strict c from private.duel_release_control_v1 where singleton for share;
  if not c.entry_open then raise exception 'DUEL_ENTRY_PAUSED'; end if;
  headers:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
  if c.required_protocol<>'' and headers->>'x-wiki-duel-protocol' is distinct from c.required_protocol
    then raise exception 'DUEL_CLIENT_RELOAD_REQUIRED'; end if;
end; $$;
revoke all on function private.assert_duel_entry_v1() from public,anon,authenticated,service_role;

-- Enforce at the write boundary, including wrappers and future/direct paths.
-- Initialization of an already starting game and all progress/result writes
-- remain available: only INSERT and waiting -> starting/playing are entry.
create function private.guard_duel_entry_v1() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_table_name='game_rooms' then
    if new.mode='duel' then
      if tg_op='INSERT' then perform private.assert_duel_entry_v1();
      elsif old.mode is distinct from 'duel' or (old.status='waiting' and new.status in ('starting','playing')) then perform private.assert_duel_entry_v1();
      end if;
    end if;
  elsif exists(select 1 from public.game_rooms where id=new.room_id and mode='duel') then
    perform private.assert_duel_entry_v1();
  end if;
  return new;
end; $$;
revoke all on function private.guard_duel_entry_v1() from public,anon,authenticated,service_role;
create trigger duel_room_entry_guard_v1 before insert or update of status,mode on public.game_rooms
for each row execute function private.guard_duel_entry_v1();
create trigger duel_player_entry_guard_v1 before insert or update of room_id on public.room_players
for each row execute function private.guard_duel_entry_v1();

-- Keep original function identities/ACLs and fail if the reviewed anchors drift.
do $patch$
declare definition text; anchor text;
begin
  definition:=pg_get_functiondef('public.use_duel_item_v3(uuid,uuid,uuid,uuid)'::regprocedure);
  anchor:=E'  if v_grant.consumed_at is not null then';
  if (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 then raise exception 'SEARCH_DISABLE_PATCH_ANCHOR'; end if;
  definition:=replace(definition,anchor,E'  if v_grant.item_id = ''search_once'' then\n    perform 1 from private.duel_release_control_v1 where singleton for share;\n    if not (select search_enabled from private.duel_release_control_v1 where singleton) then\n      return jsonb_build_object(''ok'',false,''code'',''SEARCH_DISABLED'');\n    end if;\n  end if;\n'||anchor);
  execute definition;
end; $patch$;
notify pgrst,'reload schema';
commit;
