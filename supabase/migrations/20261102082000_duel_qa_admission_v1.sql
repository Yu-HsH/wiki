-- Created 2026-11-03. Dependency slot: release controls -> QA admission -> search.
-- LOCAL CANDIDATE. Empty by default; installing never admits a QA account.
begin;
create table private.duel_release_qa_v1 (
  slot smallint primary key check(slot in(1,2)),
  user_id uuid not null unique references public.profiles(id),
  approved_at timestamptz not null,
  expires_at timestamptz not null,
  check(expires_at>approved_at and expires_at<=approved_at+interval '2 hours')
);
create table private.duel_qa_admin_requests_v1 (
  request_id uuid primary key,
  user_ids uuid[] not null,
  ttl_seconds integer not null,
  approval_ref text not null,
  response jsonb not null,
  requested_at timestamptz not null,
  database_actor text not null
);
alter table private.duel_release_qa_v1 enable row level security;
alter table private.duel_qa_admin_requests_v1 enable row level security;
revoke all on private.duel_release_qa_v1,private.duel_qa_admin_requests_v1 from public,anon,authenticated,service_role;

create function public.admin_set_duel_qa_v1(
  p_user_ids uuid[],p_request_id uuid,p_approval_ref text,p_ttl_seconds integer default 3600
) returns jsonb language plpgsql security definer set search_path='' as $$
declare prior private.duel_qa_admin_requests_v1; approved timestamptz; response jsonb;
begin
  if p_user_ids is null or p_request_id is null or p_approval_ref is null
     or length(btrim(p_approval_ref)) not between 8 and 1000
     or p_ttl_seconds is null or p_ttl_seconds not between 1 and 7200
     or cardinality(p_user_ids)>2
     or (cardinality(p_user_ids)>0 and array_ndims(p_user_ids)<>1)
     or exists(select 1 from unnest(p_user_ids) u where u is null)
     or (select count(distinct u) from unnest(p_user_ids) u)<>cardinality(p_user_ids) then
    raise exception 'QA_APPROVAL_INVALID';
  end if;
  -- Control writers never lock a room; entry holds room -> control FOR SHARE.
  perform 1 from private.duel_release_control_v1 where singleton for update;
  if not found then raise exception 'QA_GATE_REQUIRED'; end if;
  select * into prior from private.duel_qa_admin_requests_v1 where request_id=p_request_id;
  if found then
    if prior.user_ids<>p_user_ids or prior.ttl_seconds<>p_ttl_seconds or prior.approval_ref<>p_approval_ref then
      raise exception 'QA_REQUEST_CONFLICT';
    end if;
    return prior.response; -- replay never renews an expired approval
  end if;
  if cardinality(p_user_ids)>0 then
    if (select entry_open or required_protocol<>'search-authority-v1' from private.duel_release_control_v1 where singleton) then
      raise exception 'QA_GATE_MUST_BE_CLOSED';
    end if;
    if exists(select 1 from unnest(p_user_ids) u where
      not exists(select 1 from public.profiles p join auth.users a on a.id=p.id where p.id=u)) then
      raise exception 'QA_MEMBER_REQUIRED';
    end if;
  end if;
  approved:=clock_timestamp();
  delete from private.duel_release_qa_v1;
  insert into private.duel_release_qa_v1(slot,user_id,approved_at,expires_at)
    select ord::smallint,u,approved,approved+make_interval(secs=>p_ttl_seconds)
    from unnest(p_user_ids) with ordinality ids(u,ord);
  response:=jsonb_build_object('ok',true,'count',cardinality(p_user_ids),'approvedAt',approved,
    'expiresAt',approved+make_interval(secs=>p_ttl_seconds));
  insert into private.duel_qa_admin_requests_v1 values
    (p_request_id,p_user_ids,p_ttl_seconds,p_approval_ref,response,approved,session_user);
  return response;
end; $$;
revoke all on function public.admin_set_duel_qa_v1(uuid[],uuid,text,integer) from public,anon,authenticated,service_role;
grant execute on function public.admin_set_duel_qa_v1(uuid[],uuid,text,integer) to postgres;

create or replace function private.assert_duel_entry_v1() returns void
language plpgsql security definer set search_path='' as $$
declare c private.duel_release_control_v1; headers jsonb;
begin
  select * into strict c from private.duel_release_control_v1 where singleton for share;
  headers:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
  if not c.entry_open then
    perform 1 from private.duel_release_qa_v1
      where user_id=auth.uid() and expires_at>clock_timestamp() for share;
    if not found then raise exception 'DUEL_ENTRY_PAUSED'; end if;
    if headers->>'x-wiki-duel-protocol' is distinct from 'search-authority-v1' then
      raise exception 'DUEL_CLIENT_RELOAD_REQUIRED';
    end if;
  end if;
  if c.required_protocol<>'' and headers->>'x-wiki-duel-protocol' is distinct from c.required_protocol then
    raise exception 'DUEL_CLIENT_RELOAD_REQUIRED';
  end if;
end; $$;
revoke all on function private.assert_duel_entry_v1() from public,anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
