-- Keep exact request IDs while a room can still accept them. Only terminal
-- rooms can age out, independently of the six-second display window.
create function private.purge_terminal_v4_kion_requests_v1()
returns trigger
language plpgsql security definer set search_path=''
as $$
declare cutoff timestamptz := statement_timestamp() - interval '30 days';
begin
  with batch as (
    select q.room_id,q.sender_id,q.request_id
      from duel_v4.kion_requests q join duel_v4.rooms r on r.id=q.room_id
     where r.finished_at <= cutoff
     order by r.finished_at,q.room_id,q.sender_id,q.request_id
     limit 2000 for update of q skip locked
  )
  delete from duel_v4.kion_requests q using batch b
   where (q.room_id,q.sender_id,q.request_id)=(b.room_id,b.sender_id,b.request_id);
  return null;
exception when others then
  raise warning 'V4_KION_RETENTION_FAILED [%]', sqlstate;
  return null;
end $$;

revoke all on function private.purge_terminal_v4_kion_requests_v1()
  from public,anon,authenticated,service_role;

-- Borrow the existing S5 owner for trigger DDL and restore the role exactly.
create temp table _kion_retention_owner on commit drop as
  select m.inherit_option,m.set_option
    from pg_auth_members m
   where m.roleid='ink_product_owner'::regrole and m.member='postgres'::regrole
     and m.grantor='postgres'::regrole;
do $$begin
  if not exists(select from pg_auth_members
    where roleid='ink_product_owner'::regrole and member='postgres'::regrole and admin_option) then
    raise exception 'S5_EXISTING_OWNER_ADMIN_REQUIRED';
  end if;
end$$;
grant ink_product_owner to postgres with inherit true;
grant ink_product_owner to postgres with set true;

create function ink_product.purge_terminal_lobby_kion_requests_v1()
returns trigger
language plpgsql security definer set search_path=''
as $$
declare cutoff timestamptz := statement_timestamp() - interval '30 days';
begin
  with batch as (
    select q.room_id,q.sender_id,q.request_id
      from ink_product_events.lobby_kion_requests_v1 q
      join ink_product.rooms r on r.id=q.room_id
      join ink_product.group_lifecycle_v1 l on l.room_id=r.id
     where r.phase='finished' and l.closed_at <= cutoff
     order by l.closed_at,q.room_id,q.sender_id,q.request_id
     limit 2000 for update of q skip locked
  )
  delete from ink_product_events.lobby_kion_requests_v1 q using batch b
   where (q.room_id,q.sender_id,q.request_id)=(b.room_id,b.sender_id,b.request_id);
  return null;
exception when others then
  raise warning 'S5_KION_RETENTION_FAILED [%]', sqlstate;
  return null;
end $$;

alter function ink_product.purge_terminal_lobby_kion_requests_v1() owner to ink_product_owner;
revoke all on function ink_product.purge_terminal_lobby_kion_requests_v1()
  from public,anon,authenticated,service_role;

-- Use the existing successful daily maintenance checkpoint. Its scheduler,
-- flags and response are unchanged, and neither purge can abort the old job.
create trigger retain_terminal_v4_kion_requests
after update of last_completed_at on ink_product.maintenance_jobs_v1
for each row when (new.job='daily_receipts' and new.last_completed_at is not null
  and new.last_completed_at is distinct from old.last_completed_at)
execute function private.purge_terminal_v4_kion_requests_v1();

create trigger retain_terminal_s5_kion_requests
after update of last_completed_at on ink_product.maintenance_jobs_v1
for each row when (new.job='daily_receipts' and new.last_completed_at is not null
  and new.last_completed_at is distinct from old.last_completed_at)
execute function ink_product.purge_terminal_lobby_kion_requests_v1();

do $$
declare before_grant record;
begin
  select * into before_grant from pg_temp._kion_retention_owner;
  if found then
    execute format('grant ink_product_owner to postgres with inherit %s',before_grant.inherit_option);
    execute format('grant ink_product_owner to postgres with set %s',before_grant.set_option);
  else
    revoke ink_product_owner from postgres granted by current_user;
  end if;
end$$;
