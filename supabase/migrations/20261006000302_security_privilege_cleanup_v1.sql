-- SF-M2: only unused client DML/sequence grants; no data, policy or RPC drops.
-- Preserve analytics INSERT, profile column UPDATE and all existing reads.
begin;
revoke insert, delete on table public.profiles from anon, authenticated;
revoke update, delete on table public.analytics_events from anon, authenticated;
revoke insert, update, delete on table public.target_candidates,
  public.daily_challenges, public.daily_challenge_pool, public.picked
  from anon, authenticated;
revoke all on sequence public.target_candidates_id_seq from anon, authenticated;
commit;
