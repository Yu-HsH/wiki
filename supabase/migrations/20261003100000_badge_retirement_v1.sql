-- Wiki Race 2.0 Track 16d-2: retire the badge reward kind.
-- Forward-only migration. Historical migrations stay unchanged (R5).
--
-- Decision (docs/agent/16-HANDOFF.md §10, spec §0 · C1 §0.-1 · C5 §0, 2026-10-03):
--   the profile card is icon · title · frame · background. The 11 badge rewards
--   become profile icons (7) or titles (4) by updating their kind — reward_id
--   stays (16 §1), inventory rows stay, nothing is re-granted. Frames, finish
--   effects and path colors get asset_ref tokens (C5 §3.6, DESIGN-SYSTEM §4).
--
-- What changes:
--   1. reward_catalog — 11 badge rows: kind, display_name, asset_ref
--   2. reward_catalog — asset_ref tokens/SVG paths for frames, finish effects,
--      the path color and the two existing earned icons (16-HANDOFF §10.4 · §10.6)
--   3. user_profile_equipment — badge-slot rows deleted (no automatic re-equip;
--      count them first with scripts/16d-check-badge-holders.sql)
--   4. CHECKs — reward kind and equipment slot lose 'badge' (8 each);
--      slot_index is always 1. Column, PK and RPC signatures stay
--   5. equip_profile_reward_v1 — slot_index rule follows the CHECK
--   6. private.profile_cards_v1 — card slots are 4; 'badges' stays as a constant
--      [] so a front deployed before 16d-1 keeps working
--   7. 준비된 탐험가 — any_of ["title"], condition text, condition_version 2.
--      Unlocks already granted stay valid (16 §1)
--
-- The front (16d-1, main push #13) already runs on both the old and this shape.
-- Data-loss DDL: badge-slot equipment rows are deleted (the rewards stay owned).
--
-- Rollback (structure only; display names and tokens would need the old values):
--   restore the two CHECKs and slot_index rule from 20261001090000, re-run its
--   sections 6–7 for profile_cards_v1 and equip_profile_reward_v1, and set the
--   11 rows back to kind 'badge'. Deleted badge-slot rows cannot be restored.

begin;

-- ---------------------------------------------------------------------------
-- 1. The 11 badge rewards — 16-HANDOFF §10.2.
-- ---------------------------------------------------------------------------
update public.reward_catalog as c
   set kind = v.kind,
       display_name = v.display_name,
       asset_ref = v.asset_ref,
       updated_at = now()
  from (values
    ('badge_first_arrival',        'profile_icon', '첫 도착',          '/profile-icons/first-arrival.svg'),
    ('badge_daily_explorer_1',     'title',        '오늘도 탐험',      null),
    ('badge_daily_explorer_2',     'title',        '매일의 탐험가',    null),
    ('badge_duel_pure',            'title',        '순수한 승부',      null),
    ('badge_duel_defense',         'profile_icon', '방패',             '/profile-icons/shield.svg'),
    ('badge_group_together_1',     'title',        '함께하는 탐험가',  null),
    ('badge_group_together_2',     'profile_icon', '함께하는 탐험',    '/profile-icons/group-together.svg'),
    ('badge_one_step_enough',      'profile_icon', '한 칸이면 충분해', '/profile-icons/x/620733c9.svg'),
    ('badge_signpost',             'profile_icon', '이정표',           '/profile-icons/x/48fa697d.svg'),
    ('badge_shared_document',      'profile_icon', '겹친 문서',        '/profile-icons/x/3036149e.svg'),
    ('badge_simultaneous_arrival', 'profile_icon', '동시 도착',        '/profile-icons/x/2a70eb1b.svg')
  ) as v(reward_id, kind, display_name, asset_ref)
 where c.reward_id = v.reward_id
   and c.kind = 'badge';

-- Any badge row left (an unexpected one, or a renamed seed) stops the migration
-- before the CHECK below would fail with a less useful error.
do $$
begin
  if exists (select 1 from public.reward_catalog where kind = 'badge') then
    raise exception 'BADGE_RETIREMENT_UNMAPPED_ROWS: %',
      (select string_agg(reward_id, ', ' order by reward_id) from public.reward_catalog where kind = 'badge');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. asset_ref tokens and earned-icon paths — 16-HANDOFF §10.4 · §10.6.
-- ---------------------------------------------------------------------------
update public.reward_catalog as c
   set asset_ref = v.asset_ref,
       updated_at = now()
  from (values
    ('frame_ready_explorer',    'frame:tier-1'),
    ('frame_wide_world_1',      'frame:tier-1'),
    ('frame_wide_world_2',      'frame:tier-2'),
    ('frame_wide_world_3',      'frame:tier-3'),
    ('frame_duel_rival_1',      'frame:tier-1'),
    ('frame_duel_rival_2',      'frame:tier-2'),
    ('frame_duel_rival_3',      'frame:tier-3'),
    ('frame_backlink_return',   'frame:special'),
    ('finish_better_path_1',    'finish:tier-1'),
    ('finish_better_path_2',    'finish:tier-2'),
    ('finish_better_path_3',    'finish:tier-3'),
    ('finish_daily_steps',      'finish:tier-2'),
    ('finish_duel_victor',      'finish:tier-2'),
    ('path_color_one_step',     'path:purple'),
    ('icon_daily_explorer',     '/profile-icons/daily-explorer.svg'),
    ('icon_dice_globe',         '/profile-icons/x/4285e53f.svg')
  ) as v(reward_id, asset_ref)
 where c.reward_id = v.reward_id;

-- ---------------------------------------------------------------------------
-- 3. Badge-slot equipment — no slot to keep them in any more.
-- ---------------------------------------------------------------------------
delete from public.user_profile_equipment where slot = 'badge';

-- ---------------------------------------------------------------------------
-- 4. CHECKs — 8 kinds / 8 slots, slot_index always 1 (C1 §0.-1).
-- ---------------------------------------------------------------------------
alter table public.reward_catalog drop constraint reward_catalog_kind_check;
alter table public.reward_catalog add constraint reward_catalog_kind_check
  check (kind = any (array[
    'profile_icon', 'title', 'frame', 'background',
    'path_color', 'path_effect', 'finish_effect', 'spectator_emoji'
  ]::text[]));

alter table public.user_profile_equipment drop constraint user_profile_equipment_slot_check;
alter table public.user_profile_equipment add constraint user_profile_equipment_slot_check
  check (slot = any (array[
    'profile_icon', 'title', 'frame', 'background',
    'path_color', 'path_effect', 'finish_effect', 'spectator_emoji'
  ]::text[]));

alter table public.user_profile_equipment drop constraint user_profile_equipment_slot_index_check;
alter table public.user_profile_equipment add constraint user_profile_equipment_slot_index_check
  check (slot_index = 1);

-- ---------------------------------------------------------------------------
-- 5. equip_profile_reward_v1 — the 17b body with the slot_index rule of §4.
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
  -- 16d: every slot has one place (badges were the only multi-place slot).
  if v_index <> 1 then
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
  -- An unknown slot (including the retired 'badge') matches no kind and lands here too.
  if v_kind is distinct from p_slot then
    return jsonb_build_object('ok', false, 'code', 'SLOT_KIND_MISMATCH');
  end if;

  -- A reward sits in at most one place (unique (user_id, reward_id)). With one
  -- place per slot and kind = slot, the move below only clears a stale row.
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

-- ---------------------------------------------------------------------------
-- 6. private.profile_cards_v1 — card slots are 4; 'badges' is a constant [].
-- ---------------------------------------------------------------------------
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
       and e.slot in ('profile_icon', 'title', 'frame', 'background')
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
               -- 16d: kept for fronts deployed before 16d-1 (C1 §0.-1); always empty.
               'badges', '[]'::jsonb,
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
-- 7. 준비된 탐험가 — profile icon + title (spec §10 2026-10-03).
-- ---------------------------------------------------------------------------
update public.achievement_definitions
   set params = jsonb_set(params, '{any_of}', '["title"]'::jsonb),
       condition_text = '프로필 아이콘 선택 + 대표 칭호 장착',
       condition_version = condition_version + 1,
       updated_at = now()
 where achievement_id = 'onboarding_profile_complete'
   and params->'any_of' = '["title", "badge"]'::jsonb;

do $$
begin
  if exists (select 1 from public.achievement_definitions
              where params->'any_of' ? 'badge' or params->'requires' ? 'badge') then
    raise exception 'BADGE_RETIREMENT_DEFINITION_STILL_USES_BADGE';
  end if;
end;
$$;

commit;
