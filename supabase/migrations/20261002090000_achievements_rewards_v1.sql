-- Wiki Race 2.0 Track 16a: achievements and reward bundles — the server base.
-- Forward-only additive migration. Historical migrations stay unchanged.
--
-- Requires 20261001090000_c1_reward_tables_v1.sql (C1 tables, private.reward_ref_v1)
-- and 20260930090000_xp_result_grants_v1.sql (private.try_grant_xp_v1).
--
-- What this file does (docs/agent/16-HANDOFF.md · TRACKS.md §8-16):
--   1. reward_catalog gains `listed`, and its read policy becomes
--      "retired = false and (listed or the reader owns it)" — decision 1, C1 amendment.
--      Hidden-achievement rewards are seeded listed = false, so their names
--      cannot be read off the public catalog before they are earned (G5).
--   2. Eight new tables: reward_bundles · reward_bundle_items ·
--      achievement_definitions · achievement_tiers · user_achievement_progress ·
--      user_achievement_unlocks · reward_grants · user_visited_documents.
--      RLS on, no grant to anon or authenticated, no policy: every read goes
--      through a security definer RPC (G5 — even an own progress or unlock row
--      would reveal that a hidden achievement exists).
--   3. Seed: 23 achievements (13 general + 10 hidden), 39 tiers, 39 bundles,
--      44 rewards. The draft assignment table is 16-HANDOFF.md §3 and is
--      pending user review (decision 7). Held and excluded achievements are
--      not seeded (16-HANDOFF.md §2).
--   4. Grant pipeline (private): unlock → reward_grants → user_reward_inventory
--      → grant_xp_v1 (xp_class 'achievement' via source_type
--      'achievement_unlock'). Every step is idempotent, and a repeat call heals
--      a missing reward or XP row of an existing unlock.
--   5. Readers: get_my_achievements_v1 · get_result_achievements_v1 ·
--      mark_achievements_seen_v1.
--
-- No trigger is created. Nothing in this file calls the pipeline, so applying it
-- grants nothing (inert). Event wiring is 16b.
--
-- Data-loss DDL in this file: 0. One policy on reward_catalog is dropped and
-- re-created (a policy, not data). No column drop, rename or type change; no
-- update or delete of existing rows (existing catalog rows take listed = true).
--
-- Rollback (nothing outside this file depends on these objects yet):
--   drop function if exists public.mark_achievements_seen_v1(uuid[]);
--   drop function if exists public.get_result_achievements_v1(text, uuid);
--   drop function if exists public.get_my_achievements_v1();
--   drop function if exists private.achievement_card_v1(uuid, text);
--   drop function if exists private.achievement_tier_rewards_v1(text);
--   drop function if exists private.apply_achievement_value_v1(uuid, text, bigint, jsonb, text, uuid, timestamptz);
--   drop function if exists private.unlock_achievement_v1(uuid, text, smallint, text, uuid, timestamptz);
--   drop function if exists private.achievement_is_live_v1(public.achievement_definitions, timestamptz);
--   drop table if exists public.user_visited_documents, public.reward_grants,
--     public.user_achievement_unlocks, public.user_achievement_progress,
--     public.achievement_tiers, public.achievement_definitions,
--     public.reward_bundle_items, public.reward_bundles;
--   delete from public.reward_catalog where listed = false or reward_id in (<16a seed ids>);
--   drop policy "Authenticated users can read live rewards" on public.reward_catalog;
--   create policy ... using (retired = false);   -- the C1 original
--   alter table public.reward_catalog drop column listed;

begin;

create schema if not exists private;

-- ---------------------------------------------------------------------------
-- 1. reward_catalog.listed — C1 amendment (decision 1).
-- ---------------------------------------------------------------------------
-- listed = false keeps a reward out of the public catalog until the reader owns
-- it. The own-inventory exception keeps the 17b editor's inventory → catalog
-- embed working for an owned hidden reward. Inside the policy the inventory is
-- read under its own owner-only RLS, which is exactly the condition we want.
alter table public.reward_catalog
  add column if not exists listed boolean not null default true;

drop policy if exists "Authenticated users can read live rewards" on public.reward_catalog;
create policy "Authenticated users can read live rewards"
on public.reward_catalog for select to authenticated
using (
  retired = false
  and (
    listed
    or exists (
      select 1
        from public.user_reward_inventory owned
       where owned.reward_id = reward_catalog.reward_id
         and owned.user_id = (select auth.uid())
    )
  )
);

-- ---------------------------------------------------------------------------
-- 2. Reward bundles — owned by 16 (C1 §0.1 ①).
-- ---------------------------------------------------------------------------
create table if not exists public.reward_bundles (
  reward_bundle_id text primary key,
  active boolean not null default true,
  retired boolean not null default false,
  created_at timestamptz not null default now(),
  constraint reward_bundles_id_format_check
    check (reward_bundle_id ~ '^[a-z][a-z0-9_]{2,63}$')
);

create table if not exists public.reward_bundle_items (
  reward_bundle_id text not null references public.reward_bundles(reward_bundle_id) on delete cascade,
  reward_id text not null references public.reward_catalog(reward_id),
  primary key (reward_bundle_id, reward_id)
);

-- ---------------------------------------------------------------------------
-- 3. Definitions and tiers (16 §5.1).
-- ---------------------------------------------------------------------------
-- achievement_id never changes after release (16 §1). `evaluator` names the
-- judging routine (16b); a new threshold or series that reuses an evaluator is
-- a seed, a new evaluator is a migration (decision 11).
create table if not exists public.achievement_definitions (
  achievement_id text primary key,
  category text not null,
  hidden boolean not null default false,
  hidden_kind text,
  active boolean not null default true,
  retired boolean not null default false,
  evaluator text not null,
  params jsonb not null default '{}'::jsonb,
  condition_version integer not null default 1,
  retro_policy text not null,
  display_policy text not null,
  display_name text not null,
  condition_text text not null,
  description text,
  sort_order integer not null,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint achievement_definitions_id_format_check
    check (achievement_id ~ '^[a-z][a-z0-9_]{2,63}$'),
  constraint achievement_definitions_category_check
    check (category = any (array[
      'onboarding', 'exploration', 'daily', 'duel', 'group', 'collection'
    ]::text[])),
  -- spec §9.2: fun 30 / discovery 60 / challenge 120. Only hidden ones carry it.
  constraint achievement_definitions_hidden_kind_check
    check ((hidden and hidden_kind = any (array['fun', 'discovery', 'challenge']::text[]))
        or (not hidden and hidden_kind is null)),
  constraint achievement_definitions_evaluator_format_check
    check (evaluator ~ '^[a-z][a-z0-9_]{2,63}$'),
  constraint achievement_definitions_condition_version_check
    check (condition_version >= 1),
  -- 16 §1: cumulative stats may be backfilled; situational ones start at activation.
  constraint achievement_definitions_retro_policy_check
    check (retro_policy = any (array['retroactive', 'from_activation']::text[])),
  constraint achievement_definitions_display_policy_check
    check (display_policy = any (array['counter', 'once']::text[])),
  constraint achievement_definitions_window_check
    check (starts_at is null or ends_at is null or starts_at < ends_at)
);

create table if not exists public.achievement_tiers (
  achievement_id text not null references public.achievement_definitions(achievement_id) on delete restrict,
  tier smallint not null,
  threshold integer not null,
  xp integer not null,
  reward_bundle_id text references public.reward_bundles(reward_bundle_id),
  primary key (achievement_id, tier),
  constraint achievement_tiers_tier_check check (tier between 1 and 10),
  constraint achievement_tiers_threshold_check check (threshold >= 1),
  -- 16 §1 / spec §9: 30 / 60 / 120, single-tier achievements 30 (decision 7).
  constraint achievement_tiers_xp_check check (xp = any (array[30, 60, 120]))
);

-- ---------------------------------------------------------------------------
-- 4. Per-user state (16 §5.2) and the visited-document set.
-- ---------------------------------------------------------------------------
-- Progress is a display cache. 16b recounts from the result tables and writes
-- the value here; the source of truth is the result data.
create table if not exists public.user_achievement_progress (
  user_id uuid not null references public.profiles(id) on delete cascade,
  achievement_id text not null references public.achievement_definitions(achievement_id),
  condition_version integer not null,
  current_value bigint not null default 0,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, achievement_id),
  constraint user_achievement_progress_value_check check (current_value >= 0)
);

-- One row per (user, achievement, tier). id is xp_ledger.source_id for the
-- achievement_unlock XP (C2 §3). source_id is the scope's result id, the same
-- ids 15c pays from: game_records.id · match_history.id · game_rooms.id.
create table if not exists public.user_achievement_unlocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  achievement_id text not null,
  tier smallint not null,
  condition_version integer not null,
  source_type text not null,
  source_id uuid,
  unlocked_at timestamptz not null default now(),
  seen_at timestamptz,
  constraint user_achievement_unlocks_once_uq unique (user_id, achievement_id, tier),
  constraint user_achievement_unlocks_owner_uq unique (id, user_id),
  constraint user_achievement_unlocks_tier_fk
    foreign key (achievement_id, tier)
    references public.achievement_tiers (achievement_id, tier) on delete restrict,
  constraint user_achievement_unlocks_source_type_check
    check (source_type = any (array[
      'single', 'duel', 'group', 'equipment', 'retro', 'admin'
    ]::text[])),
  constraint user_achievement_unlocks_source_id_check
    check (source_type in ('equipment', 'retro', 'admin') or source_id is not null)
);

create index if not exists user_achievement_unlocks_user_idx
  on public.user_achievement_unlocks (user_id, unlocked_at desc);
create index if not exists user_achievement_unlocks_result_idx
  on public.user_achievement_unlocks (user_id, source_type, source_id);

-- One bundle grant per unlock. Its id is the inventory's grant_source_id
-- (grant_source_type 'reward_bundle', C1 §2). The composite FK pins the grant
-- to the unlock's own user.
create table if not exists public.reward_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  reward_bundle_id text not null references public.reward_bundles(reward_bundle_id),
  unlock_id uuid not null,
  granted_at timestamptz not null default now(),
  constraint reward_grants_once_uq unique (user_id, reward_bundle_id, unlock_id),
  constraint reward_grants_unlock_fk
    foreign key (unlock_id, user_id)
    references public.user_achievement_unlocks (id, user_id) on delete cascade
);

-- Canonical documents a player has reached (넓어진 세계). Filled by 16b; a
-- recount over game_move_events would scan the whole table per finish because
-- that table has no per-user index.
create table if not exists public.user_visited_documents (
  user_id uuid not null references public.profiles(id) on delete cascade,
  page_id text not null,
  first_source_type text not null,
  first_source_id uuid,
  first_seen_at timestamptz not null default now(),
  primary key (user_id, page_id),
  constraint user_visited_documents_source_type_check
    check (first_source_type = any (array['single', 'duel', 'group', 'retro']::text[]))
);

-- ---------------------------------------------------------------------------
-- 5. RLS and ACL — RPC-only reads (G5).
-- ---------------------------------------------------------------------------
alter table public.reward_bundles enable row level security;
alter table public.reward_bundle_items enable row level security;
alter table public.achievement_definitions enable row level security;
alter table public.achievement_tiers enable row level security;
alter table public.user_achievement_progress enable row level security;
alter table public.user_achievement_unlocks enable row level security;
alter table public.reward_grants enable row level security;
alter table public.user_visited_documents enable row level security;

revoke all on table
  public.reward_bundles, public.reward_bundle_items,
  public.achievement_definitions, public.achievement_tiers,
  public.user_achievement_progress, public.user_achievement_unlocks,
  public.reward_grants, public.user_visited_documents
from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Seed — rewards (draft, 16-HANDOFF.md §3; decision 7: pending review).
-- ---------------------------------------------------------------------------
-- asset_ref is null for every new reward: art is linked at production time
-- (16 §2) and the client falls back to the default image (16 §7).
-- Hidden-achievement rewards are listed = false (G5).
insert into public.reward_catalog (reward_id, kind, display_name, description, asset_ref, listed)
values
  -- onboarding
  ('badge_first_arrival',          'badge',           '첫 도착',            '처음으로 정상 완주했다', null, true),
  ('frame_ready_explorer',         'frame',           '준비된 탐험가',      '기본 프로필 프레임', null, true),
  -- exploration
  ('frame_wide_world_1',           'frame',           '넓어진 세계 I',      '고유 문서 100개 방문', null, true),
  ('frame_wide_world_2',           'frame',           '넓어진 세계 II',     '고유 문서 500개 방문', null, true),
  ('frame_wide_world_3',           'frame',           '넓어진 세계 III',    '고유 문서 2,000개 방문', null, true),
  ('finish_better_path_1',         'finish_effect',   '더 나은 길 I',       '같은 코스 기록 5회 단축', null, true),
  ('finish_better_path_2',         'finish_effect',   '더 나은 길 II',      '같은 코스 기록 20회 단축', null, true),
  ('finish_better_path_3',         'finish_effect',   '더 나은 길 III',     '같은 코스 기록 50회 단축', null, true),
  -- daily
  ('badge_daily_explorer_1',       'badge',           '오늘도 탐험 I',      '서로 다른 날짜의 코스 10개 완주', null, true),
  ('badge_daily_explorer_2',       'badge',           '오늘도 탐험 II',     '서로 다른 날짜의 코스 50개 완주', null, true),
  ('icon_daily_explorer',          'profile_icon',    '오늘의 탐험가',      '서로 다른 날짜의 코스 200개 완주', null, true),
  ('title_daily_steps_1',          'title',           '이어지는 발걸음',    '오늘의 탐험 7일 참여', null, true),
  ('finish_daily_steps',           'finish_effect',   '이어지는 발걸음',    '오늘의 탐험 30일 참여', null, true),
  ('title_daily_steps_3',          'title',           '멈추지 않는 발걸음', '오늘의 탐험 100일 참여', null, true),
  -- duel
  ('frame_duel_rival_1',           'frame',           '맞수의 테두리 I',    '1:1 정상 대전 10회', null, true),
  ('frame_duel_rival_2',           'frame',           '맞수의 테두리 II',   '1:1 정상 대전 50회', null, true),
  ('frame_duel_rival_3',           'frame',           '맞수의 테두리 III',  '1:1 정상 대전 200회', null, true),
  ('title_duel_victor_1',          'title',           '승부사',             '1:1 10승', null, true),
  ('finish_duel_victor',           'finish_effect',   '승부사의 완주',      '1:1 50승', null, true),
  ('title_duel_victor_3',          'title',           '노련한 승부사',      '1:1 150승', null, true),
  ('badge_duel_pure',              'badge',           '순수한 승부',        '비아이템전 10승', null, true),
  ('background_duel_pure',         'background',      '순수한 승부',        '비아이템전 50승', null, true),
  ('badge_duel_defense',           'badge',           '방패',               '방어 성공 10회', null, true),
  ('emoji_duel_defense',           'spectator_emoji', '방패',               '방어 성공 50회', null, true),
  -- group
  ('badge_group_together_1',       'badge',           '함께하는 탐험 I',    '그룹 레이스 10회 정상 완주', null, true),
  ('badge_group_together_2',       'badge',           '함께하는 탐험 II',   '그룹 레이스 50회 정상 완주', null, true),
  ('background_group_together',    'background',      '함께하는 탐험',      '그룹 레이스 200회 정상 완주', null, true),
  ('title_expedition_member',      'title',           '원정대원',           '8인 방에서 정상 완주', null, true),
  ('emoji_until_the_end',          'spectator_emoji', '끝까지 함께',        '완주 후 최종 종료까지 10회 관전', null, true),
  -- hidden (listed = false)
  ('title_one_step_enough',        'title',           '한 칸이면 충분해',   '숨겨진 업적 보상', null, false),
  ('badge_one_step_enough',        'badge',           '한 칸이면 충분해',   '숨겨진 업적 보상', null, false),
  ('title_one_step_difference',    'title',           '한 칸의 차이',       '숨겨진 업적 보상', null, false),
  ('path_color_one_step',          'path_color',      '한 칸의 차이',       '숨겨진 업적 보상', null, false),
  ('path_effect_forked_road',      'path_effect',     '갈림길',             '숨겨진 업적 보상', null, false),
  ('badge_signpost',               'badge',           '이정표',             '숨겨진 업적 보상', null, false),
  ('frame_backlink_return',        'frame',           '움직이는 역링크',    '숨겨진 업적 보상', null, false),
  ('icon_dice_globe',              'profile_icon',    '주사위 지구본',      '숨겨진 업적 보상', null, false),
  ('badge_shared_document',        'badge',           '겹친 문서',          '숨겨진 업적 보상', null, false),
  ('emoji_shared_document',        'spectator_emoji', '겹친 문서',          '숨겨진 업적 보상', null, false),
  ('emoji_footprints',             'spectator_emoji', '발자국',             '숨겨진 업적 보상', null, false),
  ('title_footprint_follower',     'title',           '발자국 탐험가',      '숨겨진 업적 보상', null, false),
  ('background_three_ways',        'background',      '세 갈래 길',         '숨겨진 업적 보상', null, false),
  ('emoji_simultaneous_arrival',   'spectator_emoji', '동시 도착',          '숨겨진 업적 보상', null, false),
  ('badge_simultaneous_arrival',   'badge',           '동시 도착',          '숨겨진 업적 보상', null, false)
on conflict (reward_id) do nothing;

-- ---------------------------------------------------------------------------
-- 7. Seed — achievements.
-- ---------------------------------------------------------------------------
-- params are the evaluator's inputs (16b). Thresholds live on the tiers.
insert into public.achievement_definitions (
  achievement_id, category, hidden, hidden_kind, evaluator, params,
  retro_policy, display_policy, display_name, condition_text, sort_order
)
values
  -- general (16 §2; held/excluded ones are not seeded — 16-HANDOFF.md §2)
  ('onboarding_first_finish', 'onboarding', false, null, 'first_normal_finish',
   '{"scopes": ["single", "duel", "group"]}',
   'retroactive', 'once', '첫 도착', '처음으로 정상 완주', 110),
  ('onboarding_profile_complete', 'onboarding', false, null, 'profile_card_complete',
   '{"requires": ["profile_icon"], "any_of": ["title", "badge"]}',
   'retroactive', 'once', '준비된 탐험가', '프로필 아이콘 선택 + 대표 칭호 또는 배지 1개 장착', 120),
  ('explore_unique_documents', 'exploration', false, null, 'unique_documents',
   '{"identity": "canonical_page_id"}',
   'retroactive', 'counter', '넓어진 세계', '고유 문서 100 / 500 / 2,000개 방문', 210),
  ('explore_better_path', 'exploration', false, null, 'course_improvements',
   '{"metric": "moves"}',
   'retroactive', 'counter', '더 나은 길', '동일 코스 개인 기록 5 / 20 / 50회 단축 (이동 수)', 220),
  ('daily_course_finishes', 'daily', false, null, 'daily_course_days',
   '{}',
   'retroactive', 'counter', '오늘도 탐험', '서로 다른 날짜의 코스 10 / 50 / 200개 완주', 310),
  ('daily_participation', 'daily', false, null, 'daily_course_days',
   '{}',
   'retroactive', 'counter', '이어지는 발걸음', '서로 다른 날짜에 7 / 30 / 100일 오늘의 탐험 완주', 320),
  ('duel_normal_matches', 'duel', false, null, 'duel_normal_matches',
   '{"exclude_result_reasons": ["disconnect_forfeit"], "exclude_decay_reasons": ["duel_repeat_zero"]}',
   'retroactive', 'counter', '맞수와의 만남', '정상 대전 10 / 50 / 200회 완료', 410),
  ('duel_wins', 'duel', false, null, 'duel_normal_wins',
   '{"exclude_forfeit_wins": true, "exclude_decay_reasons": ["duel_repeat_zero"]}',
   'retroactive', 'counter', '승부사', '10 / 50 / 150승 (기권승 제외)', 420),
  ('duel_pure_wins', 'duel', false, null, 'duel_normal_wins',
   '{"use_items": false, "exclude_forfeit_wins": true, "exclude_decay_reasons": ["duel_repeat_zero"]}',
   'retroactive', 'counter', '순수한 승부', '비아이템전 10 / 50승', 430),
  ('duel_perfect_defense', 'duel', false, null, 'duel_defense_successes',
   '{"items": ["cleanse_shield", "go_back", "backlink_reflect"]}',
   'retroactive', 'counter', '완벽한 대응', '편집 보호·되돌리기·역링크 성공 합계 10 / 50회', 440),
  ('group_normal_finishes', 'group', false, null, 'group_normal_finishes',
   '{}',
   'retroactive', 'counter', '함께하는 탐험', '그룹 레이스 10 / 50 / 200회 정상 완주', 510),
  ('group_party_of_eight', 'group', false, null, 'group_party_finish',
   '{"participants": 8}',
   'retroactive', 'once', '여덟 명의 원정대', '8인 방에서 정상 완주', 520),
  ('group_until_the_end', 'group', false, null, 'group_stay_until_close',
   '{}',
   'from_activation', 'counter', '끝까지 함께', '완주 후 최종 종료까지 10회 관전 유지', 530),
  -- hidden (16 §4). Names and conditions live only in this table (G5).
  ('hidden_one_move', 'exploration', true, 'fun', 'single_exact_moves',
   '{"moves": 1}',
   'from_activation', 'once', '출발했는데 도착입니다', '랜덤·목표 지정·오늘에서 정확히 1회 이동 완주', 1010),
  ('hidden_improve_one', 'exploration', true, 'fun', 'course_improvement_exact',
   '{"metric": "moves", "delta": 1}',
   'from_activation', 'once', '한 칸만 줄여 달랬잖아요', '동일 코스 기록을 정확히 1이동 단축', 1020),
  ('hidden_disjoint_retry', 'exploration', true, 'challenge', 'course_disjoint_retry',
   '{"min_moves": 5, "compare": "previous_finish"}',
   'from_activation', 'once', '전과 다른 길입니다, 정말로요', '두 경로 모두 5회 이상이며 직전 완주와 중간 문서가 겹치지 않음', 1030),
  ('hidden_attack_helped', 'duel', true, 'discovery', 'duel_attack_helped',
   '{"item": "random_link_move", "max_moves_after": 2, "exclude_reflected": true}',
   'from_activation', 'once', '그 공격, 길 안내 맞죠?', '잘못된 링크를 받은 뒤 되돌리기 없이 다음 2회 이동 이내 완주·승리', 1040),
  ('hidden_return_to_sender', 'duel', true, 'challenge', 'duel_return_to_sender',
   '{"item": "backlink_reflect"}',
   'from_activation', 'once', '반송 처리되었습니다', '역링크로 공격을 반사하고 같은 경기 승리', 1050),
  ('hidden_random_win', 'duel', true, 'discovery', 'duel_random_win',
   '{"item": "random_teleport", "max_moves_after": 5}',
   'from_activation', 'once', '특수:운이_좋았습니다', '특수:임의 문서 뒤 직접 링크 5회 이내 완주·승리', 1060),
  ('hidden_same_document', 'duel', true, 'fun', 'duel_same_document',
   '{}',
   'from_activation', 'once', '여기 제 자리인데요?', '양쪽이 시작·목표가 아닌 같은 중간 문서를 동시에 봄, 경기 정상 종료', 1070),
  ('hidden_same_group_path', 'group', true, 'fun', 'group_same_path',
   '{}',
   'from_activation', 'once', '앞사람만 따라왔습니다', '같은 그룹의 다른 완주자와 전체 경로 일치', 1080),
  ('hidden_three_disjoint', 'group', true, 'challenge', 'group_top3_disjoint',
   '{}',
   'from_activation', 'once', '어디서들 오셨어요?', '1·2·3위의 중간 경로가 서로 겹치지 않음', 1090),
  ('hidden_three_close', 'group', true, 'discovery', 'group_top3_close',
   '{"window_ms": 1000}',
   'from_activation', 'once', '문은 하나인데 세 분이 오셨네요', '1위부터 3위까지 1초 안에 완주', 1100)
on conflict (achievement_id) do nothing;

-- ---------------------------------------------------------------------------
-- 8. Seed — bundles, bundle items, tiers.
-- ---------------------------------------------------------------------------
-- One bundle per tier: bundle_<achievement_id>_<tier>. Rows are
-- (achievement_id, tier, threshold, xp, reward ids).
create temporary table achievement_seed_tiers_16a (
  achievement_id text, tier smallint, threshold integer, xp integer, rewards text[]
) on commit drop;

insert into achievement_seed_tiers_16a values
  ('onboarding_first_finish',     1,    1,  30, array['badge_first_arrival']),
  ('onboarding_profile_complete', 1,    1,  30, array['frame_ready_explorer']),
  ('explore_unique_documents',    1,  100,  30, array['frame_wide_world_1']),
  ('explore_unique_documents',    2,  500,  60, array['frame_wide_world_2']),
  ('explore_unique_documents',    3, 2000, 120, array['frame_wide_world_3']),
  ('explore_better_path',         1,    5,  30, array['finish_better_path_1']),
  ('explore_better_path',         2,   20,  60, array['finish_better_path_2']),
  ('explore_better_path',         3,   50, 120, array['finish_better_path_3']),
  ('daily_course_finishes',       1,   10,  30, array['badge_daily_explorer_1']),
  ('daily_course_finishes',       2,   50,  60, array['badge_daily_explorer_2']),
  ('daily_course_finishes',       3,  200, 120, array['icon_daily_explorer']),
  ('daily_participation',         1,    7,  30, array['title_daily_steps_1']),
  ('daily_participation',         2,   30,  60, array['finish_daily_steps']),
  ('daily_participation',         3,  100, 120, array['title_daily_steps_3']),
  ('duel_normal_matches',         1,   10,  30, array['frame_duel_rival_1']),
  ('duel_normal_matches',         2,   50,  60, array['frame_duel_rival_2']),
  ('duel_normal_matches',         3,  200, 120, array['frame_duel_rival_3']),
  ('duel_wins',                   1,   10,  30, array['title_duel_victor_1']),
  ('duel_wins',                   2,   50,  60, array['finish_duel_victor']),
  ('duel_wins',                   3,  150, 120, array['title_duel_victor_3']),
  ('duel_pure_wins',              1,   10,  30, array['badge_duel_pure']),
  ('duel_pure_wins',              2,   50,  60, array['background_duel_pure']),
  ('duel_perfect_defense',        1,   10,  30, array['badge_duel_defense']),
  ('duel_perfect_defense',        2,   50,  60, array['emoji_duel_defense']),
  ('group_normal_finishes',       1,   10,  30, array['badge_group_together_1']),
  ('group_normal_finishes',       2,   50,  60, array['badge_group_together_2']),
  ('group_normal_finishes',       3,  200, 120, array['background_group_together']),
  ('group_party_of_eight',        1,    1,  30, array['title_expedition_member']),
  ('group_until_the_end',         1,   10,  30, array['emoji_until_the_end']),
  ('hidden_one_move',             1,    1,  30, array['title_one_step_enough', 'badge_one_step_enough']),
  ('hidden_improve_one',          1,    1,  30, array['title_one_step_difference', 'path_color_one_step']),
  ('hidden_disjoint_retry',       1,    1, 120, array['path_effect_forked_road']),
  ('hidden_attack_helped',        1,    1,  60, array['badge_signpost']),
  ('hidden_return_to_sender',     1,    1, 120, array['frame_backlink_return']),
  ('hidden_random_win',           1,    1,  60, array['icon_dice_globe']),
  ('hidden_same_document',        1,    1,  30, array['badge_shared_document', 'emoji_shared_document']),
  ('hidden_same_group_path',      1,    1,  30, array['emoji_footprints', 'title_footprint_follower']),
  ('hidden_three_disjoint',       1,    1, 120, array['background_three_ways']),
  ('hidden_three_close',          1,    1,  60, array['emoji_simultaneous_arrival', 'badge_simultaneous_arrival']);

insert into public.reward_bundles (reward_bundle_id)
select 'bundle_' || s.achievement_id || '_' || s.tier
  from achievement_seed_tiers_16a s
on conflict (reward_bundle_id) do nothing;

insert into public.reward_bundle_items (reward_bundle_id, reward_id)
select 'bundle_' || s.achievement_id || '_' || s.tier, r.reward_id
  from achievement_seed_tiers_16a s
 cross join lateral unnest(s.rewards) as r(reward_id)
on conflict do nothing;

insert into public.achievement_tiers (achievement_id, tier, threshold, xp, reward_bundle_id)
select s.achievement_id, s.tier, s.threshold, s.xp, 'bundle_' || s.achievement_id || '_' || s.tier
  from achievement_seed_tiers_16a s
on conflict (achievement_id, tier) do nothing;

-- ---------------------------------------------------------------------------
-- 9. Grant pipeline (private). Called by 16b's evaluators; nothing calls it here.
-- ---------------------------------------------------------------------------
-- Live = active, not retired, inside the optional window. Unlocks that already
-- exist stay valid when a definition goes inactive (16 §1: records are kept).
create or replace function private.achievement_is_live_v1(
  p_definition public.achievement_definitions,
  p_at timestamptz
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_definition.active
     and not p_definition.retired
     and (p_definition.starts_at is null or p_definition.starts_at <= p_at)
     and (p_definition.ends_at is null or p_at < p_definition.ends_at);
$$;

revoke all on function private.achievement_is_live_v1(public.achievement_definitions, timestamptz)
  from public, anon, authenticated;

-- One tier for one user. Returns
--   {ok, unlocked, unlock_id, achievement_id, tier, rewards_granted, xp}
-- unlocked:false means the unlock already existed; the call still ensures its
-- bundle grant, inventory rows and XP row, so a retry heals a partial grant.
-- XP goes through private.try_grant_xp_v1 (15c): a failure there raises only a
-- WARNING and never undoes the unlock or the caller's match.
create or replace function private.unlock_achievement_v1(
  p_user_id uuid,
  p_achievement_id text,
  p_tier smallint,
  p_source_type text,
  p_source_id uuid,
  p_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_definition public.achievement_definitions;
  v_tier public.achievement_tiers;
  v_unlock public.user_achievement_unlocks;
  v_new boolean := false;
  v_grant_id uuid;
  v_rewards text[] := '{}'::text[];
  v_xp jsonb;
begin
  -- Guests have no profile and never get an unlock (16 §8).
  if p_user_id is null
     or not exists (select 1 from public.profiles where id = p_user_id) then
    return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED');
  end if;

  select * into v_definition
    from public.achievement_definitions
   where achievement_id = p_achievement_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'ACHIEVEMENT_NOT_FOUND');
  end if;

  select * into v_tier
    from public.achievement_tiers
   where achievement_id = p_achievement_id and tier = p_tier;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'ACHIEVEMENT_TIER_INVALID');
  end if;

  select * into v_unlock
    from public.user_achievement_unlocks
   where user_id = p_user_id and achievement_id = p_achievement_id and tier = p_tier;

  if not found then
    if not private.achievement_is_live_v1(v_definition, coalesce(p_at, now())) then
      return jsonb_build_object('ok', false, 'code', 'ACHIEVEMENT_INACTIVE');
    end if;

    if p_source_type is null
       or p_source_type not in ('single', 'duel', 'group', 'equipment', 'retro', 'admin')
       or (p_source_type in ('single', 'duel', 'group') and p_source_id is null) then
      return jsonb_build_object('ok', false, 'code', 'ACHIEVEMENT_SOURCE_INVALID');
    end if;

    insert into public.user_achievement_unlocks (
      user_id, achievement_id, tier, condition_version, source_type, source_id
    )
    values (
      p_user_id, p_achievement_id, p_tier, v_definition.condition_version,
      p_source_type, p_source_id
    )
    on conflict on constraint user_achievement_unlocks_once_uq do nothing
    returning * into v_unlock;

    if found then
      v_new := true;
    else
      -- A concurrent call won the insert; continue with its row.
      select * into v_unlock
        from public.user_achievement_unlocks
       where user_id = p_user_id and achievement_id = p_achievement_id and tier = p_tier;
    end if;
  end if;

  -- Bundle → inventory. A retired or inactive bundle grants nothing new;
  -- rewards that are retired or inactive are skipped (active = "still granted").
  if v_tier.reward_bundle_id is not null
     and exists (
       select 1 from public.reward_bundles b
        where b.reward_bundle_id = v_tier.reward_bundle_id
          and b.active and not b.retired
     ) then
    insert into public.reward_grants (user_id, reward_bundle_id, unlock_id)
    values (p_user_id, v_tier.reward_bundle_id, v_unlock.id)
    on conflict on constraint reward_grants_once_uq do nothing
    returning id into v_grant_id;

    if v_grant_id is null then
      select id into v_grant_id
        from public.reward_grants
       where user_id = p_user_id
         and reward_bundle_id = v_tier.reward_bundle_id
         and unlock_id = v_unlock.id;
    end if;

    with granted as (
      insert into public.user_reward_inventory (user_id, reward_id, grant_source_type, grant_source_id)
      select p_user_id, item.reward_id, 'reward_bundle', v_grant_id
        from public.reward_bundle_items item
        join public.reward_catalog catalog on catalog.reward_id = item.reward_id
       where item.reward_bundle_id = v_tier.reward_bundle_id
         and catalog.active
         and not catalog.retired
      on conflict (user_id, reward_id) do nothing
      returning reward_id
    )
    select coalesce(array_agg(reward_id order by reward_id), '{}'::text[])
      into v_rewards
      from granted;
  end if;

  v_xp := private.try_grant_xp_v1(
    p_user_id, 'achievement_unlock', v_unlock.id, v_tier.xp, v_tier.xp, null
  );

  return jsonb_build_object(
    'ok', true,
    'unlocked', v_new,
    'unlock_id', v_unlock.id,
    'achievement_id', p_achievement_id,
    'tier', p_tier,
    'rewards_granted', to_jsonb(v_rewards),
    'xp', v_xp
  );
end;
$$;

revoke all on function private.unlock_achievement_v1(uuid, text, smallint, text, uuid, timestamptz)
  from public, anon, authenticated;

-- Record a recounted value and unlock every tier it reaches — several tiers in
-- one call when a value jumps (16 §8 "단계형 여러 단계 동시 통과"). Single-tier
-- achievements pass 1. Returns {ok, achievement_id, value, unlocks:[...]}.
create or replace function private.apply_achievement_value_v1(
  p_user_id uuid,
  p_achievement_id text,
  p_value bigint,
  p_state jsonb,
  p_source_type text,
  p_source_id uuid,
  p_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_definition public.achievement_definitions;
  v_tier smallint;
  v_unlocks jsonb := jsonb_build_array();
begin
  if p_user_id is null
     or not exists (select 1 from public.profiles where id = p_user_id) then
    return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED');
  end if;

  select * into v_definition
    from public.achievement_definitions
   where achievement_id = p_achievement_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'ACHIEVEMENT_NOT_FOUND');
  end if;

  if not private.achievement_is_live_v1(v_definition, coalesce(p_at, now())) then
    return jsonb_build_object('ok', false, 'code', 'ACHIEVEMENT_INACTIVE');
  end if;

  if p_value is null or p_value < 0 then
    return jsonb_build_object('ok', false, 'code', 'ACHIEVEMENT_VALUE_INVALID');
  end if;

  insert into public.user_achievement_progress (
    user_id, achievement_id, condition_version, current_value, state, updated_at
  )
  values (
    p_user_id, p_achievement_id, v_definition.condition_version, p_value,
    coalesce(p_state, '{}'::jsonb), now()
  )
  on conflict (user_id, achievement_id) do update
    set condition_version = excluded.condition_version,
        current_value = excluded.current_value,
        state = excluded.state,
        updated_at = excluded.updated_at;

  for v_tier in
    select tier
      from public.achievement_tiers
     where achievement_id = p_achievement_id
       and threshold <= p_value
     order by tier
  loop
    v_unlocks := v_unlocks || jsonb_build_array(private.unlock_achievement_v1(
      p_user_id, p_achievement_id, v_tier, p_source_type, p_source_id, p_at
    ));
  end loop;

  return jsonb_build_object(
    'ok', true,
    'achievement_id', p_achievement_id,
    'value', p_value,
    'unlocks', v_unlocks
  );
end;
$$;

revoke all on function private.apply_achievement_value_v1(uuid, text, bigint, jsonb, text, uuid, timestamptz)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 10. Readers.
-- ---------------------------------------------------------------------------
-- RewardRefs of one bundle (C1 §4.1 shape via private.reward_ref_v1, which
-- reads the catalog as definer — callers only pass bundles the reader may see).
create or replace function private.achievement_tier_rewards_v1(p_bundle_id text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
           jsonb_agg(private.reward_ref_v1(item.reward_id, null) order by item.reward_id),
           '[]'::jsonb
         )
    from public.reward_bundle_items item
   where item.reward_bundle_id = p_bundle_id;
$$;

revoke all on function private.achievement_tier_rewards_v1(text) from public, anon, authenticated;

-- One achievement card for one user. A hidden achievement shows only the tiers
-- the user unlocked; callers never pass a hidden achievement the user has not
-- unlocked (G5).
create or replace function private.achievement_card_v1(p_user_id uuid, p_achievement_id text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with definition as (
    select * from public.achievement_definitions where achievement_id = p_achievement_id
  ), tiers as (
    select tier_row.tier, tier_row.threshold, tier_row.xp, tier_row.reward_bundle_id,
           unlock.id as unlock_id, unlock.unlocked_at, unlock.seen_at
      from public.achievement_tiers tier_row
      cross join definition
      left join public.user_achievement_unlocks unlock
        on unlock.user_id = p_user_id
       and unlock.achievement_id = tier_row.achievement_id
       and unlock.tier = tier_row.tier
     where tier_row.achievement_id = p_achievement_id
       and (not definition.hidden or unlock.id is not null)
  )
  select jsonb_build_object(
           'achievementId', definition.achievement_id,
           'category', definition.category,
           'hidden', definition.hidden,
           'hiddenKind', definition.hidden_kind,
           'name', definition.display_name,
           'condition', definition.condition_text,
           'description', definition.description,
           'displayPolicy', definition.display_policy,
           'active', definition.active,
           'retired', definition.retired,
           'current', case when definition.hidden then null else coalesce((
             select progress.current_value
               from public.user_achievement_progress progress
              where progress.user_id = p_user_id
                and progress.achievement_id = p_achievement_id
           ), 0) end,
           'tierCount', (select count(*) from tiers),
           'unlockedTier', coalesce((select max(tier) from tiers where unlock_id is not null), 0),
           'nextThreshold', (select min(threshold) from tiers where unlock_id is null),
           'tiers', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'tier', tiers.tier,
                      'threshold', tiers.threshold,
                      'xp', tiers.xp,
                      'rewards', private.achievement_tier_rewards_v1(tiers.reward_bundle_id),
                      'unlocked', tiers.unlock_id is not null,
                      'unlockId', tiers.unlock_id,
                      'unlockedAt', tiers.unlocked_at,
                      'seen', tiers.seen_at is not null
                    ) order by tiers.tier)
               from tiers
           ), '[]'::jsonb)
         )
    from definition;
$$;

revoke all on function private.achievement_card_v1(uuid, text) from public, anon, authenticated;

-- The achievement screen. General achievements: every live one, plus any the
-- user unlocked that has since gone inactive or retired. Hidden: only the ones
-- the user unlocked, and the count of those. No total of hidden achievements
-- is returned in any form (decision 5, spec §9.2) — the UI prints "??".
create or replace function public.get_my_achievements_v1()
returns jsonb
language plpgsql
stable
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

  return jsonb_build_object(
    'ok', true,
    'achievements', coalesce((
      select jsonb_agg(private.achievement_card_v1(v_user_id, definition.achievement_id)
                       order by definition.sort_order, definition.achievement_id)
        from public.achievement_definitions definition
       where not definition.hidden
         and (private.achievement_is_live_v1(definition, now())
              or exists (
                select 1 from public.user_achievement_unlocks unlock
                 where unlock.user_id = v_user_id
                   and unlock.achievement_id = definition.achievement_id
              ))
    ), '[]'::jsonb),
    'hidden', (
      select jsonb_build_object(
               'discovered', count(*),
               'achievements', coalesce(
                 jsonb_agg(private.achievement_card_v1(v_user_id, found.achievement_id)
                           order by found.first_unlocked_at, found.achievement_id),
                 '[]'::jsonb
               )
             )
        from (
          select unlock.achievement_id, min(unlock.unlocked_at) as first_unlocked_at
            from public.user_achievement_unlocks unlock
            join public.achievement_definitions definition
              on definition.achievement_id = unlock.achievement_id
           where unlock.user_id = v_user_id
             and definition.hidden
           group by unlock.achievement_id
        ) found
    ),
    'unseenCount', (
      select count(*)
        from public.user_achievement_unlocks unlock
       where unlock.user_id = v_user_id
         and unlock.seen_at is null
    )
  );
end;
$$;

-- G9: the unlocks one result produced for the caller, grouped by achievement.
-- p_result_id is the scope's result id — game_records.id (single),
-- match_history.id (duel) or game_rooms.id (group), the ids 15c pays from.
-- Hidden achievements come first so the UI can lead with the reveal.
create or replace function public.get_result_achievements_v1(
  p_scope text,
  p_result_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_achievements jsonb;
  v_xp_total bigint;
begin
  if v_user_id is null
     or not exists (select 1 from public.profiles where id = v_user_id) then
    return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED');
  end if;

  if p_scope is null or p_scope not in ('single', 'duel', 'group') then
    return jsonb_build_object('ok', false, 'code', 'RESULT_SCOPE_INVALID');
  end if;

  if p_result_id is null then
    return jsonb_build_object('ok', false, 'code', 'RESULT_ID_REQUIRED');
  end if;

  with result_unlocks as (
    select unlock.id, unlock.achievement_id, unlock.tier, unlock.unlocked_at, unlock.seen_at,
           tier_row.threshold, tier_row.reward_bundle_id,
           ledger.id as ledger_id, ledger.amount as ledger_amount
      from public.user_achievement_unlocks unlock
      join public.achievement_tiers tier_row
        on tier_row.achievement_id = unlock.achievement_id
       and tier_row.tier = unlock.tier
      left join public.xp_ledger ledger
        on ledger.user_id = unlock.user_id
       and ledger.source_type = 'achievement_unlock'
       and ledger.source_id = unlock.id
     where unlock.user_id = v_user_id
       and unlock.source_type = p_scope
       and unlock.source_id = p_result_id
  ), grouped as (
    select result_unlocks.achievement_id,
           jsonb_agg(jsonb_build_object(
             'unlockId', result_unlocks.id,
             'tier', result_unlocks.tier,
             'threshold', result_unlocks.threshold,
             'xp', jsonb_build_object(
               'amount', result_unlocks.ledger_amount,
               'ledgerId', result_unlocks.ledger_id
             ),
             'rewards', private.achievement_tier_rewards_v1(result_unlocks.reward_bundle_id),
             'unlockedAt', result_unlocks.unlocked_at,
             'seen', result_unlocks.seen_at is not null
           ) order by result_unlocks.tier) as tiers,
           coalesce(sum(result_unlocks.ledger_amount), 0) as xp_total
      from result_unlocks
     group by result_unlocks.achievement_id
  )
  select jsonb_agg(jsonb_build_object(
           'achievementId', definition.achievement_id,
           'category', definition.category,
           'hidden', definition.hidden,
           'hiddenKind', definition.hidden_kind,
           'name', definition.display_name,
           'condition', definition.condition_text,
           'description', definition.description,
           'tierCount', case when definition.hidden then jsonb_array_length(grouped.tiers)
                             else (select count(*) from public.achievement_tiers t
                                    where t.achievement_id = definition.achievement_id) end,
           'tiers', grouped.tiers,
           'xpTotal', grouped.xp_total
         ) order by definition.hidden desc, definition.sort_order, definition.achievement_id),
         coalesce(sum(grouped.xp_total), 0)
    into v_achievements, v_xp_total
    from grouped
    join public.achievement_definitions definition
      on definition.achievement_id = grouped.achievement_id;

  return jsonb_build_object(
    'ok', true,
    'scope', p_scope,
    'resultId', p_result_id,
    'achievements', coalesce(v_achievements, '[]'::jsonb),
    'xpTotal', coalesce(v_xp_total, 0)
  );
end;
$$;

-- NEW badge (§4.3 · 16 §7): mark the caller's unlocks as seen — the given ids,
-- or every unseen one when p_unlock_ids is null. Other users' ids are ignored.
create or replace function public.mark_achievements_seen_v1(
  p_unlock_ids uuid[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_marked integer;
begin
  if v_user_id is null
     or not exists (select 1 from public.profiles where id = v_user_id) then
    return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED');
  end if;

  update public.user_achievement_unlocks
     set seen_at = now()
   where user_id = v_user_id
     and seen_at is null
     and (p_unlock_ids is null or id = any (p_unlock_ids));
  get diagnostics v_marked = row_count;

  return jsonb_build_object('ok', true, 'marked', v_marked);
end;
$$;

revoke all on function public.get_my_achievements_v1() from public, anon;
revoke all on function public.get_result_achievements_v1(text, uuid) from public, anon;
revoke all on function public.mark_achievements_seen_v1(uuid[]) from public, anon;
grant execute on function public.get_my_achievements_v1() to authenticated, service_role;
grant execute on function public.get_result_achievements_v1(text, uuid) to authenticated, service_role;
grant execute on function public.mark_achievements_seen_v1(uuid[]) to authenticated, service_role;

commit;
