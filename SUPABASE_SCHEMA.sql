create table if not exists public.game_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  player_name text not null,
  start_title text not null,
  target_title text not null,
  elapsed_seconds integer not null check (elapsed_seconds >= 0),
  click_count integer not null check (click_count >= 0),
  created_at timestamptz not null default now()
);

alter table public.game_records enable row level security;

create policy "insert own records"
  on public.game_records
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "read all records"
  on public.game_records
  for select
  to authenticated
  using (true);
