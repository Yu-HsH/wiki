-- Created 2026-11-03. Dependency slot: release controls -> recovery -> search.
-- LOCAL CANDIDATE. Installing this file does NOT execute any recovery.
begin;
create table private.duel_recovery_approvals_v1 (
  case_id text primary key check(case_id in ('D01','D02','D28','D32')),
  room_key text not null unique check(room_key ~ '^[0-9a-f]{64}$'),
  fingerprint text not null check(fingerprint ~ '^[0-9a-f]{64}$'),
  expected_status text not null check(expected_status in ('starting','playing')),
  expected_players integer not null check(expected_players in (1,2)),
  approval_ref text not null,
  observed_at timestamptz not null,
  check((case_id in ('D01','D02') and expected_status='starting' and expected_players=2)
     or (case_id in ('D28','D32') and expected_status='playing' and expected_players=1))
);
create table private.duel_recovery_receipts_v1 (
  room_id uuid primary key references public.game_rooms(id),
  case_id text not null unique references private.duel_recovery_approvals_v1(case_id),
  result_id uuid not null unique references public.match_history(id),
  before_fingerprint text not null,
  after_fingerprint text not null,
  response jsonb not null,
  applied_at timestamptz not null
);
create table private.duel_recovery_requests_v1 (
  request_id uuid primary key,
  room_id uuid not null references private.duel_recovery_receipts_v1(room_id),
  expected_fingerprint text not null,
  rationale text not null,
  requested_at timestamptz not null,
  database_actor text not null
);
alter table private.duel_recovery_approvals_v1 enable row level security;
alter table private.duel_recovery_receipts_v1 enable row level security;
alter table private.duel_recovery_requests_v1 enable row level security;
revoke all on private.duel_recovery_approvals_v1,private.duel_recovery_receipts_v1,
  private.duel_recovery_requests_v1 from public,anon,authenticated,service_role;

-- No enrollment RPC exists. These four hashes are generated from the verified
-- read-only backup, not from caller input. No user IDs or room codes are shipped.
insert into private.duel_recovery_approvals_v1 values
('D01','9ff9ab074e0131eebf04949a988c698af937f5f8eb7aea1501760203505a4f49','76274d0f1b8179cfb13e6c7036d115c7484c7d39038fd8d5b2f1c76df24f1c98','starting',2,'Jungle65 drain design 2026-11-03; execution requires separate approval','2026-11-03 01:37:28.731698+00'),
('D02','7c27f22f40bc7c92af0822e84042713259f7cbcb97a3af33e7d8b482051bb415','81ca480cfd4412686b662e7413691f3e2fd94eb091cd1231d89afbe6d0067648','starting',2,'Jungle65 drain design 2026-11-03; execution requires separate approval','2026-11-03 01:37:28.731698+00'),
('D28','c30636c4e4155f9d2aa21cff5e852471137026d59dfed0a086769768a02910cb','f1cd9c99442b18c2c4840a9bc6acad026b4cb404080d87c95c12c1e2ae225978','playing',1,'Jungle65 drain design 2026-11-03; execution requires separate approval','2026-11-03 01:37:28.731698+00'),
('D32','5bf8e709995925936cdb4949cdcb96cc46efba13e8411be2a141158a55bee753','27946e2d29c6718b95c8907ccb8a47afadf1fec3c31d24dbe2c424cbee2d41ca','playing',1,'Jungle65 drain design 2026-11-03; execution requires separate approval','2026-11-03 01:37:28.731698+00');

create function private.duel_recovery_fingerprint_v1(p_room_id uuid) returns text
language sql stable security definer set search_path='' set timezone='UTC' as $$
  select encode(sha256(convert_to(jsonb_build_object(
    'room',(select to_jsonb(r) from public.game_rooms r where id=p_room_id),
    'players',(select coalesce(jsonb_agg(to_jsonb(p) order by p.id),'[]') from public.room_players p where room_id=p_room_id),
    'moves',(select coalesce(jsonb_agg(to_jsonb(e) order by e.id),'[]') from public.game_move_events e where scope='duel' and game_id=p_room_id),
    'items',(select coalesce(jsonb_agg(to_jsonb(e) order by e.id),'[]') from public.duel_item_events e where room_id=p_room_id),
    'grants',(select coalesce(jsonb_agg(to_jsonb(g) order by g.id),'[]') from public.duel_item_grants g where room_id=p_room_id),
    'requests',(select coalesce(jsonb_agg(to_jsonb(m) order by m.actor_user_id,m.request_id),'[]') from public.game_mutation_requests m where scope='duel' and game_id=p_room_id),
    'events',(select coalesce(jsonb_agg(to_jsonb(e) order by e.id),'[]') from public.room_events e where room_id=p_room_id),
    'results',(select coalesce(jsonb_agg(to_jsonb(m) order by m.id),'[]') from public.match_history m where room_id=p_room_id),
    'xp',(select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') from public.xp_ledger x where source_id=p_room_id or source_id in(select id from public.match_history where room_id=p_room_id))
  )::text,'UTF8')),'hex');
$$;
revoke all on function private.duel_recovery_fingerprint_v1(uuid) from public,anon,authenticated,service_role;

-- Finished-room leave may append an ALREADY_FINISHED request. Such normal
-- bookkeeping must not invalidate a receipt; protect the settlement itself.
create function private.duel_recovery_outcome_v1(p_room_id uuid) returns text
language sql stable security definer set search_path='' set timezone='UTC' as $$
  select encode(sha256(convert_to(jsonb_build_object(
    'room',(select to_jsonb(r) from public.game_rooms r where id=p_room_id),
    'players',(select coalesce(jsonb_agg(to_jsonb(p) order by p.id),'[]') from public.room_players p where room_id=p_room_id),
    'results',(select coalesce(jsonb_agg(to_jsonb(m) order by m.id),'[]') from public.match_history m where room_id=p_room_id),
    'xp',(select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') from public.xp_ledger x where source_id=p_room_id or source_id in(select id from public.match_history where room_id=p_room_id))
  )::text,'UTF8')),'hex');
$$;
revoke all on function private.duel_recovery_outcome_v1(uuid) from public,anon,authenticated,service_role;

-- Admin DB role only; never a service-key/member/anonymous HTTP capability.
create function public.admin_recover_legacy_duel_v1(
  p_room_id uuid,p_request_id uuid,p_expected_fingerprint text,p_rationale text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  r public.game_rooms; a private.duel_recovery_approvals_v1;
  receipt private.duel_recovery_receipts_v1; prior private.duel_recovery_requests_v1;
  applied timestamptz; result_id uuid; response jsonb; last_activity timestamptz;
begin
  if p_room_id is null or p_request_id is null or p_expected_fingerprint is null
     or p_rationale is null or length(btrim(p_rationale)) not between 8 and 1000 then
    raise exception 'RECOVERY_ARGUMENT_REQUIRED';
  end if;
  -- Request -> room -> ordered players -> control. No control writer takes rooms.
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,81000));
  select * into prior from private.duel_recovery_requests_v1 where request_id=p_request_id;
  if found and (prior.room_id<>p_room_id or prior.expected_fingerprint<>p_expected_fingerprint
      or prior.rationale<>p_rationale) then raise exception 'RECOVERY_REQUEST_CONFLICT'; end if;
  select * into r from public.game_rooms where id=p_room_id for update;
  if not found then raise exception 'RECOVERY_NOT_APPROVED'; end if;
  perform 1 from public.room_players where room_id=p_room_id order by user_id for update;
  perform 1 from private.duel_release_control_v1 where singleton for share;
  if not found then raise exception 'RECOVERY_GATE_REQUIRED'; end if;
  select * into a from private.duel_recovery_approvals_v1
    where room_key=encode(sha256(convert_to(p_room_id::text,'UTF8')),'hex');
  if not found then raise exception 'RECOVERY_NOT_APPROVED'; end if;
  if p_expected_fingerprint<>a.fingerprint then raise exception 'RECOVERY_APPROVAL_MISMATCH'; end if;
  select * into receipt from private.duel_recovery_receipts_v1 where room_id=p_room_id;
  if found then
    if private.duel_recovery_outcome_v1(p_room_id)<>receipt.after_fingerprint then
      raise exception 'RECOVERY_RECEIPT_DRIFT';
    end if;
    insert into private.duel_recovery_requests_v1 values
      (p_request_id,p_room_id,p_expected_fingerprint,p_rationale,clock_timestamp(),session_user)
      on conflict(request_id) do nothing;
    return receipt.response;
  end if;
  if (select entry_open or search_enabled from private.duel_release_control_v1 where singleton) then
    raise exception 'RECOVERY_GATE_MUST_BE_CLOSED';
  end if;
  if r.mode<>'duel' or r.status<>a.expected_status or r.finished_at is not null
     or r.finished_reason is not null or r.winner_user_id is not null
     or cardinality(r.winner_user_ids)>0
     or r.duel_start_page_id is not null or r.duel_start_revision_id is not null
     or r.game_starts_at is not null then raise exception 'RECOVERY_ROOM_CONDITION'; end if;
  if (select count(*) from public.room_players where room_id=p_room_id)<>a.expected_players
     or (select count(*) from public.room_players where room_id=p_room_id and role='host' and user_id=r.host_user_id)<>1
     or (a.expected_players=2 and (select count(*) from public.room_players where room_id=p_room_id and role='guest')<>1)
     or exists(select 1 from public.room_players where room_id=p_room_id and
       (player_status<>'playing' or has_finished or rank is not null or retired_at is not null
        or start_page_id is not null or start_revision_id is not null
        or current_page_id is not null or current_revision_id is not null)) then
    raise exception 'RECOVERY_ROSTER_CONDITION';
  end if;
  if exists(select 1 from public.match_history where room_id=p_room_id)
     or exists(select 1 from public.xp_ledger where source_id=p_room_id
       or source_id in(select id from public.match_history where room_id=p_room_id)) then
    raise exception 'RECOVERY_ALREADY_SETTLED';
  end if;
  select greatest(r.created_at,r.started_at,
    (select max(greatest(heartbeat_at,last_seen_at,updated_at,finished_at,retired_at)) from public.room_players where room_id=p_room_id),
    (select max(server_timestamp) from public.game_move_events where scope='duel' and game_id=p_room_id),
    (select max(server_timestamp) from public.duel_item_events where room_id=p_room_id),
    (select max(created_at) from public.game_mutation_requests where scope='duel' and game_id=p_room_id),
    (select max(created_at) from public.room_events where room_id=p_room_id)) into last_activity;
  applied:=clock_timestamp();
  if last_activity>applied-interval '30 days' or last_activity>a.observed_at then
    raise exception 'RECOVERY_RECENT_ACTIVITY';
  end if;
  -- Separate statement after all locks; no pre-lock snapshot is accepted.
  if private.duel_recovery_fingerprint_v1(p_room_id)<>a.fingerprint then
    raise exception 'RECOVERY_STATE_CHANGED';
  end if;
  update public.room_players set player_status='retired',has_finished=false,rank=null,
    retired_at=applied,retire_reason='disconnected_timeout',
    progress_version=progress_version+1,updated_at=applied where room_id=p_room_id;
  update public.game_rooms set status='finished',finished_at=applied,finished_reason='cancelled',
    winner_user_id=null,winner_user_ids='{}',state_version=state_version+1 where id=p_room_id;
  insert into public.match_history(room_id,duration_seconds,result_status,result_reason,finalized_at)
    values(p_room_id,0,'cancelled','disconnect_cancelled',applied) returning id into result_id;
  -- Existing cancelled-result triggers exclude XP/achievements. Never disable them.
  if exists(select 1 from public.xp_ledger where source_id in(p_room_id,result_id)) then
    raise exception 'RECOVERY_UNEXPECTED_XP';
  end if;
  response:=jsonb_build_object('ok',true,'code','LEGACY_DUEL_CANCELLED','caseId',a.case_id,
    'roomId',p_room_id,'resultId',result_id,'appliedAt',applied,'winnerUserId',null);
  insert into private.duel_recovery_receipts_v1 values(p_room_id,a.case_id,result_id,a.fingerprint,
    private.duel_recovery_outcome_v1(p_room_id),response,applied);
  insert into private.duel_recovery_requests_v1 values(p_request_id,p_room_id,p_expected_fingerprint,
    p_rationale,applied,session_user);
  return response;
end; $$;
revoke all on function public.admin_recover_legacy_duel_v1(uuid,uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.admin_recover_legacy_duel_v1(uuid,uuid,text,text) to postgres;
notify pgrst,'reload schema';
commit;
