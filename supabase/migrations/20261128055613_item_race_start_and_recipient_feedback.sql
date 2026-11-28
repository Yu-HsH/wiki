-- Keep existing start operations, receipt replay and authoritative rules.
-- Each replacement must match exactly once so this migration cannot silently
-- apply against a different server definition.
create function pg_temp.item_race_replace(target regprocedure, before_text text, after_text text)
returns void language plpgsql as $$
declare definition text := pg_get_functiondef(target);
begin
  if length(definition)-length(replace(definition,before_text,'')) <> length(before_text) then
    raise exception 'Unexpected item race definition for %',target;
  end if;
  execute replace(definition,before_text,after_text);
end $$;

-- 3.5s intro + 0.4s pause + 3s countdown + 1.1s to deliver the reservation.
select pg_temp.item_race_replace('public.act_duel_v4(uuid,uuid,text,jsonb)',
  $$at_time+interval '4 seconds'$$, $$at_time+interval '8 seconds'$$);

alter table duel_v4.traps add column trigger_outcome text check (trigger_outcome in ('hit','blocked'));

select pg_temp.item_race_replace(
  'duel_v4.trip_trap_base(duel_v4.rooms,duel_v4.members,text,timestamptz)',
  'set triggered_at=at_time where grant_id=trap.grant_id',
  $$set triggered_at=at_time,trigger_outcome='hit' where grant_id=trap.grant_id$$);
select pg_temp.item_race_replace(
  'duel_v4.trip_trap_base(duel_v4.rooms,duel_v4.members,text,timestamptz)',
  $$    return 'blocked';$$,
  $$    update duel_v4.traps set trigger_outcome='blocked' where grant_id=trap.grant_id;
    return 'blocked';$$);

-- The existing authenticated state RPC supplies room and verified actor.
-- A successful direct curse is recorded by the consumed grant and its receipt.
create or replace function duel_v4.recent_item_feedback(p_room uuid,p_actor uuid,p_now timestamptz)
returns jsonb language sql stable set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'id',event_id,'kind',kind,'expiresAt',happened_at+interval '30 seconds','outcome',outcome
  )) order by happened_at,event_id),'[]'::jsonb)
  from (
    select * from (
      select 'item-stolen:'||stolen.id::text as event_id,'item_stolen' as kind,stolen.consumed_at as happened_at,
        null::text as outcome
      from duel_v4.grants stolen
      where stolen.room_id=p_room and stolen.user_id=p_actor
        and stolen.consumed_at>p_now-interval '30 seconds'
        and exists(select from duel_v4.grants copy where copy.stolen_from=stolen.id
          and copy.room_id=p_room and copy.user_id<>p_actor)
      union all
      select 'trap-triggered:'||trap.grant_id::text,'trap_triggered',trap.triggered_at,trap.trigger_outcome
      from duel_v4.traps trap
      where trap.room_id=p_room and trap.actor_id=p_actor and trap.triggered_at>p_now-interval '30 seconds'
      union all
      select 'weakening:'||g.id::text,'weakening_hit',g.consumed_at,'applied'
      from duel_v4.grants g join duel_v4.receipts r
        on (r.room_id,r.user_id,r.request_id)=(g.room_id,g.user_id,g.consumed_request)
      where g.room_id=p_room and g.user_id<>p_actor and g.item_id='weakening'
        and g.consumed_at>p_now-interval '30 seconds' and r.result->>'code'='ITEM_WEAKENED'
    ) events
    order by happened_at desc,event_id desc limit 24
  ) recent
$$;

-- Preserve the owner and ACL of the existing S5 RPCs.
create temp table _item_race_owner_grant on commit drop as
select inherit_option from pg_auth_members
where roleid='ink_product_owner'::regrole and member='postgres'::regrole and grantor='postgres'::regrole;
grant ink_product_owner to postgres with inherit true;

select pg_temp.item_race_replace('public.act_group_items_product_room_v1(text,uuid,uuid,text,jsonb,jsonb)',
  $$scheduled_start_at=clock_timestamp()+interval '4 seconds'$$,
  $$scheduled_start_at=clock_timestamp()+interval '8 seconds'$$);

-- A modifier row is inserted only when weakening actually applies (including
-- its reservation for a future grant). This projection uses the verified
-- participant and owner epoch. Older clients ignore the additive property.
select pg_temp.item_race_replace('public.get_group_items_product_state_v1(uuid,uuid,jsonb)',
  $$  return jsonb_set(response,'{body}',body || jsonb_build_object('itemFeedback',feedback));$$,
  $$  return jsonb_set(response,'{body}',body || jsonb_build_object('itemFeedback',feedback,
    'weakeningHits',(
      select coalesce(jsonb_agg(jsonb_build_object('id',recent.right_id,'at',recent.installed_at)
        order by recent.installed_at,recent.right_id),'[]'::jsonb)
      from (
        select m.right_id,m.installed_at from ink_product_engine.ink_s5_modifiers_v1 m
        where m.session_id=p_session and m.participant_id=recipient and m.owner_epoch=epoch
          and m.kind='weakening' and m.installed_at>now_at-interval '30 seconds'
        order by m.installed_at desc,m.right_id desc limit 24
      ) recent
    )));$$);

do $restore$
begin
  if not exists(select from pg_temp._item_race_owner_grant) then revoke ink_product_owner from postgres;
  elsif not (select inherit_option from pg_temp._item_race_owner_grant) then
    grant ink_product_owner to postgres with inherit false;
  end if;
end $restore$;
