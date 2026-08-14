-- SWAP keeps its public event/RPC contract for a future duel-item packet.
-- It is intentionally disabled until server inventory, consumption ledger,
-- ownership checks, and cooldown expiry are implemented. The SWAP event type
-- remains part of the contract ('SWAP') so a later duel-item packet can
-- re-enable it.

begin;

create or replace function public.apply_duel_swap_v2(
  p_room_id uuid,
  p_request_id uuid,
  p_correlation_id uuid,
  p_expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  -- Deliberately do not read or lock any game row. This makes the disabled
  -- operation a no-op even for forged rooms, participants, versions, or
  -- repeated request IDs, while preserving the signature and SWAP event type.
  return jsonb_build_object('ok', false, 'code', 'SWAP_DISABLED');
end;
$$;

revoke all on function public.apply_duel_swap_v2(uuid, uuid, uuid, bigint) from public, anon;
grant execute on function public.apply_duel_swap_v2(uuid, uuid, uuid, bigint) to authenticated, service_role;

commit;
