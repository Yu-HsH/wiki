-- Wiki Race 2.0 Track 17b-1: C1 reward tables — catalog, inventory, equipment.
-- Forward-only additive migration. Historical migrations stay unchanged.
--
-- What this file does (docs/contracts/C1-REWARD-TABLES.md):
--   1. reward_catalog          — C1 §1 DDL + RLS, verbatim.
--   2. user_reward_inventory   — C1 §2 DDL + RLS, verbatim. Owner-only read.
--   3. user_profile_equipment  — C1 §3 DDL + RLS, verbatim. Public read.
--   4. Seed: six system default profile icons (C1 §5-④).
--   5. Default icon grant: backfill every existing profile, and an AFTER INSERT
--      trigger on profiles for every new one (grant_source_type 'system_default').
--   6. RPCs: equip_profile_reward_v1 · unequip_profile_reward_v1 ·
--      get_profile_card_v1 (C1 §4) and get_profile_cards_v1 (batch, see below).
--
-- User decisions this file implements (2026-10-01, 17b pre-start report):
--   ① reward_bundles belong to packet 16. Not created here; inventory only
--     leaves grant_source_type 'reward_bundle' + grant_source_id open (C1 §0.1).
--   ② A retired reward that is already equipped stays equipped and keeps
--     showing on the card. Only a new equip of it is refused (REWARD_RETIRED).
--     The card readers are security definer so the catalog's retired=false
--     policy does not hide it from other players.
--   ③ kind↔slot match is checked in equip_profile_reward_v1 (SLOT_KIND_MISMATCH).
--     The tables grant no writes, so the RPC is the only write path (C1 §3.1).
--   ④ Six icons, ids icon_default_{compass,book,globe,lantern,map,quill},
--     asset_ref = '/profile-icons/<name>.svg' (placeholder art shipped in
--     public/). Granted to everyone as system_default.
--   Batch reader: get_profile_cards_v1(uuid[]) is a fourth RPC that C1 §4 does
--     not list. The ranking page reads 50 cards; one call per row would be N+1.
--     get_profile_card_v1 is a one-element wrapper over the same builder, so the
--     card shape has one source. To be added to C1 §4 at integration.
--
-- Data-loss DDL in this file: 0. No drop, no rename, no type change, no update
-- or delete of existing rows. profiles gains one trigger; no column changes.
--
-- Rollback (nothing else depends on these objects yet):
--   drop trigger if exists profiles_grant_default_profile_icons on public.profiles;
--   drop function if exists public.get_profile_cards_v1(uuid[]);
--   drop function if exists public.get_profile_card_v1(uuid);
--   drop function if exists public.unequip_profile_reward_v1(text, smallint);
--   drop function if exists public.equip_profile_reward_v1(text, smallint, text);
--   drop function if exists private.profile_cards_v1(uuid[]);
--   drop function if exists private.profile_equipment_v1(uuid);
--   drop function if exists private.reward_ref_v1(text, smallint);
--   drop function if exists private.grant_default_profile_icons_v1();
--   drop function if exists private.default_profile_icon_ids_v1();
--   drop table if exists public.user_profile_equipment;
--   drop table if exists public.user_reward_inventory;
--   drop table if exists public.reward_catalog;

begin;

create schema if not exists private;

-- ---------------------------------------------------------------------------
-- 1. reward_catalog — C1 §1.
-- ---------------------------------------------------------------------------
create table if not exists public.reward_catalog (
  reward_id text primary key,
  kind text not null,
  display_name text not null,
  description text,
  asset_ref text,
  active boolean not null default true,
  retired boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reward_catalog_kind_check check (kind = any (array[
    'profile_icon', 'title', 'badge', 'frame', 'background',
    'path_color', 'path_effect', 'finish_effect', 'spectator_emoji'
  ]::text[])),
  constraint reward_catalog_reward_id_format_check
    check (reward_id ~ '^[a-z][a-z0-9_]{2,63}$')
);

create index if not exists reward_catalog_kind_active_idx
  on public.reward_catalog (kind, active) where retired = false;

alter table public.reward_catalog enable row level security;
revoke all on table public.reward_catalog from anon, authenticated;
grant select on table public.reward_catalog to authenticated;

create policy "Authenticated users can read live rewards"
on public.reward_catalog for select to authenticated
using (retired = false);

-- ---------------------------------------------------------------------------
-- 2. user_reward_inventory — C1 §2.
-- ---------------------------------------------------------------------------
create table if not exists public.user_reward_inventory (
  user_id uuid not null references public.profiles(id) on delete cascade,
  reward_id text not null references public.reward_catalog(reward_id),
  grant_source_type text not null,
  grant_source_id uuid,
  acquired_at timestamptz not null default now(),
  primary key (user_id, reward_id),
  constraint user_reward_inventory_grant_source_type_check
    check (grant_source_type = any (array[
      'achievement_unlock', 'reward_bundle', 'admin', 'system_default'
    ]::text[])),
  constraint user_reward_inventory_grant_source_id_check
    check ((grant_source_type in ('admin', 'system_default')) or grant_source_id is not null)
);

create index if not exists user_reward_inventory_user_idx
  on public.user_reward_inventory (user_id, acquired_at desc);

alter table public.user_reward_inventory enable row level security;
revoke all on table public.user_reward_inventory from anon, authenticated;
grant select on table public.user_reward_inventory to authenticated;

create policy "Users can read own inventory"
on public.user_reward_inventory for select to authenticated
using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- 3. user_profile_equipment — C1 §3.
-- ---------------------------------------------------------------------------
create table if not exists public.user_profile_equipment (
  user_id uuid not null,
  slot text not null,
  slot_index smallint not null default 1,
  reward_id text not null,
  equipped_at timestamptz not null default now(),
  primary key (user_id, slot, slot_index),
  constraint user_profile_equipment_slot_check
    check (slot = any (array[
      'profile_icon', 'title', 'badge', 'frame', 'background',
      'path_color', 'path_effect', 'finish_effect', 'spectator_emoji'
    ]::text[])),
  constraint user_profile_equipment_slot_index_check
    check ((slot = 'badge' and slot_index between 1 and 3)
        or (slot <> 'badge' and slot_index = 1)),
  constraint user_profile_equipment_owned_fk
    foreign key (user_id, reward_id)
    references public.user_reward_inventory (user_id, reward_id)
    on delete cascade
);

create unique index if not exists user_profile_equipment_unique_reward_idx
  on public.user_profile_equipment (user_id, reward_id);

alter table public.user_profile_equipment enable row level security;
revoke all on table public.user_profile_equipment from anon, authenticated;
grant select on table public.user_profile_equipment to authenticated;

create policy "Authenticated users can read equipment"
on public.user_profile_equipment for select to authenticated
using (true);

-- ---------------------------------------------------------------------------
-- 4. Seed — system default profile icons (decision ④).
-- ---------------------------------------------------------------------------
-- One list, used by the seed, the backfill and the trigger. Ids never change
-- after release (16 §1); art can be swapped by updating asset_ref only.
create or replace function private.default_profile_icon_ids_v1()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'icon_default_compass', 'icon_default_book', 'icon_default_globe',
    'icon_default_lantern', 'icon_default_map', 'icon_default_quill'
  ]::text[];
$$;

revoke all on function private.default_profile_icon_ids_v1() from public, anon, authenticated;

insert into public.reward_catalog (reward_id, kind, display_name, description, asset_ref)
values
  ('icon_default_compass', 'profile_icon', '나침반', '시스템 기본 프로필 아이콘', '/profile-icons/compass.svg'),
  ('icon_default_book',    'profile_icon', '펼친 책', '시스템 기본 프로필 아이콘', '/profile-icons/book.svg'),
  ('icon_default_globe',   'profile_icon', '지구본', '시스템 기본 프로필 아이콘', '/profile-icons/globe.svg'),
  ('icon_default_lantern', 'profile_icon', '등불', '시스템 기본 프로필 아이콘', '/profile-icons/lantern.svg'),
  ('icon_default_map',     'profile_icon', '지도', '시스템 기본 프로필 아이콘', '/profile-icons/map.svg'),
  ('icon_default_quill',   'profile_icon', '깃펜', '시스템 기본 프로필 아이콘', '/profile-icons/quill.svg')
on conflict (reward_id) do nothing;

-- ---------------------------------------------------------------------------
-- 5. Default icon grant — backfill + new-profile trigger (decision ④).
-- ---------------------------------------------------------------------------
-- Profiles are inserted by the username-signup Edge Function. A trigger covers
-- that path and any future one without redeploying the function.
-- on conflict do nothing: the inventory PK makes the grant idempotent (C1 §2).
create or replace function private.grant_default_profile_icons_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_reward_inventory (user_id, reward_id, grant_source_type)
  select new.id, c.reward_id, 'system_default'
    from public.reward_catalog c
   where c.reward_id = any (private.default_profile_icon_ids_v1())
  on conflict (user_id, reward_id) do nothing;
  return new;
end;
$$;

revoke all on function private.grant_default_profile_icons_v1() from public, anon, authenticated;

drop trigger if exists profiles_grant_default_profile_icons on public.profiles;
create trigger profiles_grant_default_profile_icons
after insert on public.profiles
for each row execute function private.grant_default_profile_icons_v1();

insert into public.user_reward_inventory (user_id, reward_id, grant_source_type)
select p.id, c.reward_id, 'system_default'
  from public.profiles p
  cross join public.reward_catalog c
 where c.reward_id = any (private.default_profile_icon_ids_v1())
on conflict (user_id, reward_id) do nothing;

-- ---------------------------------------------------------------------------
-- 6. Card builders (private).
-- ---------------------------------------------------------------------------
-- RewardRef of C5 §2, plus slotIndex (badge order, C5 §3.5) and retired
-- (decision ②: the editor marks it). Reads the catalog as definer, so a retired
-- reward that is still equipped is not hidden.
create or replace function private.reward_ref_v1(p_reward_id text, p_slot_index smallint)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'rewardId', c.reward_id,
           'kind', c.kind,
           'displayName', c.display_name,
           'assetRef', c.asset_ref,
           'slotIndex', p_slot_index,
           'retired', c.retired
         )
    from public.reward_catalog c
   where c.reward_id = p_reward_id;
$$;

revoke all on function private.reward_ref_v1(text, smallint) from public, anon, authenticated;

-- Full equipment state of one user, the return value of equip/unequip.
create or replace function private.profile_equipment_v1(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'slot', e.slot,
               'slotIndex', e.slot_index,
               'rewardId', e.reward_id,
               'equippedAt', e.equipped_at,
               'reward', private.reward_ref_v1(e.reward_id, e.slot_index)
             )
             order by e.slot, e.slot_index
           ),
           '[]'::jsonb
         )
    from public.user_profile_equipment e
   where e.user_id = p_user_id;
$$;

revoke all on function private.profile_equipment_v1(uuid) from public, anon, authenticated;

-- C5 §2 cards keyed by user id. Unknown ids are left out. One query over the
-- equipment PK for the whole set — this is what keeps the ranking page at one
-- round trip for 50 rows.
create or replace function private.profile_cards_v1(p_user_ids uuid[])
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with eq as (
    select e.user_id, e.slot, e.slot_index,
           private.reward_ref_v1(e.reward_id, e.slot_index) as ref
      from public.user_profile_equipment e
     where e.user_id = any (p_user_ids)
       and e.slot in ('profile_icon', 'title', 'badge', 'frame', 'background')
  )
  select coalesce(
           jsonb_object_agg(
             p.id::text,
             jsonb_build_object(
               'userId', p.id,
               'nickname', p.nickname,
               'level', public.level_from_total_xp(p.total_xp),
               'icon', (select eq.ref from eq where eq.user_id = p.id and eq.slot = 'profile_icon'),
               'title', (select eq.ref from eq where eq.user_id = p.id and eq.slot = 'title'),
               'badges', coalesce(
                 (select jsonb_agg(eq.ref order by eq.slot_index)
                    from eq where eq.user_id = p.id and eq.slot = 'badge'),
                 '[]'::jsonb),
               'frame', (select eq.ref from eq where eq.user_id = p.id and eq.slot = 'frame'),
               'background', (select eq.ref from eq where eq.user_id = p.id and eq.slot = 'background'),
               'legacyImageUrl', p.profile_image_url,
               'source', 'live'
             )
           ),
           '{}'::jsonb
         )
    from public.profiles p
   where p.id = any (p_user_ids);
$$;

revoke all on function private.profile_cards_v1(uuid[]) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. Public RPCs — C1 §4.
-- ---------------------------------------------------------------------------
create or replace function public.equip_profile_reward_v1(
  p_slot text,
  p_slot_index smallint,
  p_reward_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_index smallint := coalesce(p_slot_index, 1);
  v_kind text;
  v_retired boolean;
begin
  -- Guests have no profile row (17 §6, 16 §8).
  if v_user_id is null
     or not exists (select 1 from public.profiles where id = v_user_id) then
    return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED');
  end if;

  -- Mirrors user_profile_equipment_slot_index_check so a bad caller gets a code.
  if not ((p_slot = 'badge' and v_index between 1 and 3)
          or (p_slot is distinct from 'badge' and v_index = 1)) then
    return jsonb_build_object('ok', false, 'code', 'SLOT_INDEX_INVALID');
  end if;

  if not exists (
    select 1 from public.user_reward_inventory
     where user_id = v_user_id and reward_id = p_reward_id
  ) then
    return jsonb_build_object('ok', false, 'code', 'REWARD_NOT_OWNED');
  end if;

  select kind, retired into v_kind, v_retired
    from public.reward_catalog where reward_id = p_reward_id;

  -- Decision ②: kept if already equipped, refused as a new equip.
  if v_retired then
    return jsonb_build_object('ok', false, 'code', 'REWARD_RETIRED');
  end if;

  -- Decision ③: the DDL cannot see kind, so the RPC checks it (C1 §3.1).
  -- An unknown slot matches no kind and lands here too.
  if v_kind is distinct from p_slot then
    return jsonb_build_object('ok', false, 'code', 'SLOT_KIND_MISMATCH');
  end if;

  -- A reward sits in at most one place (unique (user_id, reward_id)). Equipping
  -- it elsewhere moves it — this is how badges are reordered.
  delete from public.user_profile_equipment
   where user_id = v_user_id
     and reward_id = p_reward_id
     and (slot, slot_index) is distinct from (p_slot, v_index);

  begin
    insert into public.user_profile_equipment (user_id, slot, slot_index, reward_id)
    values (v_user_id, p_slot, v_index, p_reward_id)
    on conflict (user_id, slot, slot_index)
    do update set reward_id = excluded.reward_id, equipped_at = now();
  exception
    -- The FK is the final guard (C1 §4): ownership revoked between the check
    -- above and this insert.
    when foreign_key_violation then
      return jsonb_build_object('ok', false, 'code', 'REWARD_NOT_OWNED');
  end;

  return jsonb_build_object('ok', true, 'equipment', private.profile_equipment_v1(v_user_id));
end;
$$;

create or replace function public.unequip_profile_reward_v1(
  p_slot text,
  p_slot_index smallint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null
     or not exists (select 1 from public.profiles where id = v_user_id) then
    return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED');
  end if;

  delete from public.user_profile_equipment
   where user_id = v_user_id
     and slot = p_slot
     and slot_index = coalesce(p_slot_index, 1);

  if not found then
    return jsonb_build_object('ok', false, 'code', 'SLOT_EMPTY');
  end if;

  return jsonb_build_object('ok', true, 'equipment', private.profile_equipment_v1(v_user_id));
end;
$$;

create or replace function public.get_profile_card_v1(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_card jsonb;
begin
  v_card := private.profile_cards_v1(array[p_user_id]) -> (p_user_id::text);
  if v_card is null then
    return jsonb_build_object('ok', false, 'code', 'PROFILE_NOT_FOUND');
  end if;
  return jsonb_build_object('ok', true, 'card', v_card);
end;
$$;

-- Batch reader (see header). Ids without a profile are simply absent from
-- `cards`; callers fall back to their own row data. Capped so one call cannot
-- scan the whole table.
create or replace function public.get_profile_cards_v1(p_user_ids uuid[])
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
begin
  select coalesce(array_agg(distinct id), '{}'::uuid[]) into v_ids
    from unnest(coalesce(p_user_ids, '{}'::uuid[])) as id
   where id is not null;

  if cardinality(v_ids) > 100 then
    return jsonb_build_object('ok', false, 'code', 'TOO_MANY_USERS');
  end if;

  return jsonb_build_object('ok', true, 'cards', private.profile_cards_v1(v_ids));
end;
$$;

-- C1 §4: authenticated only.
revoke all on function public.equip_profile_reward_v1(text, smallint, text) from public, anon;
revoke all on function public.unequip_profile_reward_v1(text, smallint) from public, anon;
revoke all on function public.get_profile_card_v1(uuid) from public, anon;
revoke all on function public.get_profile_cards_v1(uuid[]) from public, anon;
grant execute on function public.equip_profile_reward_v1(text, smallint, text) to authenticated, service_role;
grant execute on function public.unequip_profile_reward_v1(text, smallint) to authenticated, service_role;
grant execute on function public.get_profile_card_v1(uuid) to authenticated, service_role;
grant execute on function public.get_profile_cards_v1(uuid[]) to authenticated, service_role;

commit;
