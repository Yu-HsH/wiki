-- Direct curses and roulette failures both install weakening modifiers.
-- The direct curse receipt proves the cause and the intended recipient.
-- Deferred attacks continue to use their existing resolved-attack projection.
do $migration$
declare
  definition text := pg_get_functiondef('public.get_group_items_product_state_v1(uuid,uuid,jsonb)'::regprocedure);
  prior_inherit boolean;
  old_query text := $old$
        select m.right_id,m.installed_at from ink_product_engine.ink_s5_modifiers_v1 m
        where m.session_id=p_session and m.participant_id=recipient and m.owner_epoch=epoch
          and m.kind='weakening' and m.installed_at>now_at-interval '30 seconds'
$old$;
  new_query text := $new$
        select m.right_id,m.installed_at
        from ink_product_engine.ink_s5_modifiers_v1 m
        join ink_product_engine.ink_receipts_v1 r
          on (r.session_id,r.receipt_id)=(m.session_id,m.source_receipt)
        where m.session_id=p_session and m.participant_id=recipient and m.owner_epoch=epoch
          and m.kind='weakening' and m.installed_at>now_at-interval '30 seconds'
          and r.principal_scope='player' and r.principal_id<>ink_product.request_actor_v1()
          and r.operation='weakening' and r.outcome_code='WEAKENING_APPLIED'
          and r.canonical_payload#>>'{payload,targetParticipantId}'=recipient::text
$new$;
begin
  if length(definition)-length(replace(definition,old_query,'')) <> length(old_query) then
    raise exception 'Unexpected S5 weakening feedback projection';
  end if;

  select inherit_option into prior_inherit from pg_auth_members
  where roleid='ink_product_owner'::regrole and member='postgres'::regrole and grantor='postgres'::regrole;
  grant ink_product_owner to postgres with inherit true;
  execute replace(definition,old_query,new_query);
  if prior_inherit is null then
    revoke ink_product_owner from postgres;
  elsif not prior_inherit then
    grant ink_product_owner to postgres with inherit false;
  end if;
end
$migration$;
