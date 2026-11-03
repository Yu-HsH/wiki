-- LOCAL CANDIDATE. No automatic Cron job. Explicit postgres maintenance only.
begin;
create index duel_search_sessions_snapshot_v1 on private.duel_search_sessions_v1(source_snapshot_id);
create index duel_search_sessions_expiry_v1 on private.duel_search_sessions_v1(expires_at);
create index duel_search_documents_created_v1 on private.duel_search_documents_v1(created_at);
create function private.prune_duel_search_v1(p_batch integer default 100)
returns jsonb language plpgsql security definer set search_path='' as $$
declare sessions_deleted integer; documents_deleted integer:=0; snapshot uuid; removed integer;
begin
  if p_batch is null or p_batch not between 1 and 1000 then raise exception 'INVALID_PRUNE_BATCH'; end if;
  -- Retry records live with their session for >=7 days after the absolute
  -- deadline, and indefinitely while its game is not finished. Events stay.
  with victims as (
    select s.item_event_id from private.duel_search_sessions_v1 s
    join public.game_rooms r on r.id=s.room_id
    where s.expires_at<clock_timestamp()-interval '7 days' and r.status='finished'
    order by s.expires_at limit p_batch for update of s skip locked
  ) delete from private.duel_search_sessions_v1 s using victims v where s.item_event_id=v.item_event_id;
  get diagnostics sessions_deleted=row_count;
  -- Lock the snapshot first. Activation's snapshot FK takes KEY SHARE, which
  -- conflicts with this lock. Recheck references in a separate statement after
  -- any lock wait: an activation committed during the wait must be visible.
  for snapshot in
    select w.id from public.wiki_page_snapshots w
    join private.duel_search_documents_v1 d on d.snapshot_id=w.id
    where d.created_at<clock_timestamp()-interval '30 days'
      and not exists(select 1 from private.duel_search_sessions_v1 s where s.source_snapshot_id=w.id)
    order by d.created_at limit p_batch for update of w skip locked
  loop
    delete from private.duel_search_documents_v1 d where d.snapshot_id=snapshot
      and d.created_at<clock_timestamp()-interval '30 days'
      and not exists(select 1 from private.duel_search_sessions_v1 s where s.source_snapshot_id=snapshot);
    get diagnostics removed=row_count;documents_deleted:=documents_deleted+removed;
  end loop;
  return jsonb_build_object('sessions_deleted',sessions_deleted,'documents_deleted',documents_deleted);
end; $$;
revoke all on function private.prune_duel_search_v1(integer) from public,anon,authenticated,service_role;
commit;
