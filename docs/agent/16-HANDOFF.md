# 16 업적·보상 — 판정과 인계

작성: 2026-10-02 · 브랜치 `feat/group-final-gaps` · 착수 기준 `819617a`
**이 문서는 패킷 16의 판정·범위·보상 할당표의 단일 기준이다.** 트랙 경계와 수용조건은 `TRACKS.md` §8-16,
소유권 예외는 `TRACKS.md` §1.1-e. 근거 문서는 `wiki-race-2.0-handoff/code/16-ACHIEVEMENTS-REWARDS.md`(이하 16) ·
`01-CONFIRMED-SPEC.md` §9·§10 · `docs/contracts/C1-REWARD-TABLES.md` · `C2-XP-LEDGER.md`.

---

## 1. 판정 `[사용자 결정, 2026-10-01 — 16 계획 판정]`

| # | 항목 | 판정 |
|:-:|---|---|
| 1 | G5와 카탈로그 공개 | **C1 수정 승인** — `reward_catalog.listed` + 정책 `retired = false and (listed or 본인 보유)`. C1 문서 반영은 16a 커밋에 포함 |
| 2 | X1 업적 3개 (꾸준한 탐험 · 정해진 목적지 · 모든 길의 시작) | **보류.** 해금은 되돌릴 수 없으므로 랜덤 완주가 목표 지정 진행도에 섞이는 판정을 굽지 않는다. 서버 `run_mode` 도입 시 함께 연다 |
| 3 | `onboarding_tutorial` | **보류.** 튜토리얼이 없다 (저장소 `tutorial` 검색 0건, 2026-10-01) |
| 4 | `hidden_redirect` | **보류.** `clicked_raw_title`은 클라이언트 값이다 (`services/singleGameService.js:64`). 업적은 서버 확정 값만 (spec §2). 서버가 리다이렉트를 판정할 근거가 생기면 연다 |
| 5 | 히든 표시 | **카드 1장 `발견 n / ??`.** spec §9.2(전체 개수 비공개)가 16 §7보다 상위. 서버는 히든 총개수를 어떤 형태로도 반환하지 않는다 |
| 6 | 조건 모호점 기본값 | 아래 §1.1 |
| 7 | XP·보상 | 단일 단계 XP **30**. 단계별 보상 할당표는 16 §2·§4 "보상 방향" 열로 초안 → **사용자 검토 후 시드 확정** (§3). 경기 표현용 4종(경로 색상·경로 효과·완주 효과·관전 이모티콘)은 **지급만**, 경기 화면 표시는 범위 밖 |
| 8 | 소급 | **누적형만.** 근거는 서버 권위 이후 기록만 — `game_records`는 `run_id is not null`인 행만(O1 legacy 0~1초 기록 배제). 15c 이전 1:1 감쇠는 `private.duel_decay_v1`로 재계산. 레벨 급상승 허용. **16b-r은 별도 건별 승인** |
| 9 | 업적 XP와 결과 화면 레벨업 | **16c에서 해결.** 같은 결과의 원장 행(결과 XP + 업적 XP) 합산 금액으로 레벨업 판정. "한 번 지급 최대 70" 전제가 깨지므로(70+120=190) **다중 레벨업**도 처리 |
| 10 | 남의 프로필 업적 공개 | **이번엔 본인만.** 보류 |
| 11 | "재배포 없이 추가"의 범위 | 새 기준값·계열은 **시드**, 새 판정 방식은 **migration** |
| — | C1 `active=false` 보유 보상 장착 | **막지 않는다.** `active`는 신규 지급·카탈로그 노출 여부이지 보유 무효가 아니다. C1 RPC 무변경 |
| — | G20 | `다섯 걸음 승부사` = 시안 샘플(G15와 같은 처리) · `앞서가는 탐험가` = 16 §3 "추후 활성화", **미시드** |
| — | G8 `onboarding_full_avatar` | **만들지 않는다.** 코드 0건 · 업적 테이블이 지금까지 없었다(운영 migration = 저장소 21) → 사용자 기록이 존재할 수 없다 |

### 1.1 조건 기본값 (판정 6)

| 업적 | 기본값 |
|---|---|
| 더 나은 길 · `hidden_improve_one` | **이동 수** 단축 |
| `hidden_disjoint_retry` | 같은 (시작, 목표)의 **직전 완주** 대비 |
| `hidden_three_close` | **1위 → 3위 전체 간격** 1초 이내 (`finished_at`) |
| 여덟 명의 원정대 | **결과 행 8개** (실제 8명) |
| 이어지는 발걸음 | **오늘 코스 완주**한 서로 다른 날짜 |
| 승부사 | **기권승 제외** |
| 잠수 | `match_history.result_reason = 'disconnect_forfeit'`로 끝난 경기 — 해당 업적에서 제외 |
| `hidden_attack_helped` | **상대가 나에게 쓴 공격만.** 반사로 돌아온 내 공격 제외 |

> **결과로 생기는 겹침 하나 (기록만).** 하루 1코스(§0 2026-09-28)에서 `오늘도 탐험`("서로 다른 날짜의 코스 완주")과
> `이어지는 발걸음`("오늘 코스 완주한 서로 다른 날짜")은 **같은 수를 센다.** 기준값만 다르다(10/50/200 vs 7/30/100).
> 3코스가 돌아오면 갈라진다. 16a 시드는 둘 다 같은 판정기 `daily_course_days`를 가리킨다.

---

## 2. 업적 범위 — 31개 중 **시드 23 · 보류 6 · 제외 2**

| 처리 | 수 | 업적 |
|---|:-:|---|
| **시드·활성 (일반)** | 13 | `onboarding_first_finish` · `onboarding_profile_complete` · 넓어진 세계 · 더 나은 길 · 오늘도 탐험 · 이어지는 발걸음 · 맞수와의 만남 · 승부사 · 순수한 승부 · 완벽한 대응 · 함께하는 탐험 · 여덟 명의 원정대 · 끝까지 함께 |
| **시드·활성 (히든)** | 10 | `hidden_one_move` · `hidden_improve_one` · `hidden_disjoint_retry` · `hidden_attack_helped` · `hidden_return_to_sender` · `hidden_random_win` · `hidden_same_document` · `hidden_same_group_path` · `hidden_three_disjoint` · `hidden_three_close` |
| **보류 (미시드)** | 6 | 꾸준한 탐험 · 정해진 목적지 · 모든 길의 시작 (판정 2) · `onboarding_tutorial` (3) · `hidden_redirect` (4) · `hidden_swap_win` (`swap_current` 비활성 — 서버 `SWAP_DISABLED`) |
| **범위 제외** | 2 | 오늘의 올클리어 · `hidden_daily_same_moves` — 하루 3코스 전제 (spec §0 2026-09-28) |

**보류는 시드하지 않는다.** 정의를 미리 넣으면 그 보상 행이 카탈로그에 보이거나(일반), G5 대상이 늘어난다(히든).
열 때 정의·단계·보상을 한 migration(새 판정 방식) 또는 시드(기존 판정기 재사용)로 추가한다 (판정 11).
보류 업적 ID는 위 이름으로 **예약**한다 — 다른 뜻으로 재사용하지 않는다 (16 §1).

**`끝까지 함께`는 근사치다.** 근거는 "방 종료 순간 `room_players`에 finished로 남아 있음"이고 연결 유지(heartbeat)까지는 증명하지 않는다.
근거 데이터가 과거에 없으므로 `from_activation`(소급 없음).

---

## 3. 단계별 보상 할당표 — **초안, 사용자 검토 대기** (판정 7)

**출처:** 16 §2·§4의 "보상 방향" 열. 방향이 두 종류를 적은 곳은 단계에 나눠 배치했고, 마지막 단계에 더 드문 종류를 둔다.
**아트:** 새 보상 44개 전부 `asset_ref = null` — 클라이언트는 기본 이미지로 떨어진다 (16 §7). 칭호는 텍스트라 아트가 필요 없다.
**시드 위치:** `20261002090000_achievements_rewards_v1.sql` §6·§8. **운영 미적용이므로 검토 결과는 이 파일을 고쳐 반영한다** (아직 어느 운영 이력에도 없으므로 R5의 append-only 대상이 아니다. 로컬은 재적용한다).
번들 ID는 전부 `bundle_<achievement_id>_<tier>`.

### 3.1 일반 13 (단계 29 · 보상 29, 전부 `listed = true`)

| 업적 ID | 이름 | 단계 기준값 | XP | 보상 (`reward_id` · 종류 · 표시명) | 16 보상 방향 |
|---|---|---|---|---|---|
| `onboarding_first_finish` | 첫 도착 | 1 | 30 | `badge_first_arrival` 배지 「첫 도착」 | 기본 배지 |
| `onboarding_profile_complete` | 준비된 탐험가 | 1 | 30 | `frame_ready_explorer` 프레임 「준비된 탐험가」 | 기본 프로필 프레임 |
| `explore_unique_documents` | 넓어진 세계 | 100 / 500 / 2,000 | 30 / 60 / 120 | `frame_wide_world_1·2·3` 프레임 「넓어진 세계 I·II·III」 | 프로필 프레임 |
| `explore_better_path` | 더 나은 길 | 5 / 20 / 50 | 30 / 60 / 120 | `finish_better_path_1·2·3` 완주 효과 「더 나은 길 I·II·III」 | 완주 효과 |
| `daily_course_finishes` | 오늘도 탐험 | 10 / 50 / 200 | 30 / 60 / 120 | `badge_daily_explorer_1` 배지 · `badge_daily_explorer_2` 배지 · `icon_daily_explorer` **프로필 아이콘** 「오늘의 탐험가」 | 배지 또는 프로필 아이콘 |
| `daily_participation` | 이어지는 발걸음 | 7 / 30 / 100 | 30 / 60 / 120 | `title_daily_steps_1` 칭호 「이어지는 발걸음」 · `finish_daily_steps` 완주 효과 · `title_daily_steps_3` 칭호 「멈추지 않는 발걸음」 | 칭호·완주 효과 |
| `duel_normal_matches` | 맞수와의 만남 | 10 / 50 / 200 | 30 / 60 / 120 | `frame_duel_rival_1·2·3` 프레임 「맞수의 테두리 I·II·III」 | VS 테두리 |
| `duel_wins` | 승부사 | 10 / 50 / 150 | 30 / 60 / 120 | `title_duel_victor_1` 칭호 「승부사」 · `finish_duel_victor` 완주 효과 · `title_duel_victor_3` 칭호 「노련한 승부사」 | 칭호·완주 효과 |
| `duel_pure_wins` | 순수한 승부 | 10 / 50 | 30 / 60 | `badge_duel_pure` 배지 · `background_duel_pure` 배경 | 배지·프로필 배경 |
| `duel_perfect_defense` | 완벽한 대응 | 10 / 50 | 30 / 60 | `badge_duel_defense` 배지 「방패」 · `emoji_duel_defense` 관전 이모티콘 「방패」 | 방패형 배지 또는 이모티콘 |
| `group_normal_finishes` | 함께하는 탐험 | 10 / 50 / 200 | 30 / 60 / 120 | `badge_group_together_1·2` 배지 · `background_group_together` 배경 | 그룹 배지·프로필 배경 |
| `group_party_of_eight` | 여덟 명의 원정대 | 1 | 30 | `title_expedition_member` 칭호 「원정대원」 | 칭호 `원정대원` |
| `group_until_the_end` | 끝까지 함께 | 10 | 30 | `emoji_until_the_end` 관전 이모티콘 「끝까지 함께」 | 관전 이모티콘 |

### 3.2 히든 10 (단계 각 1 · 보상 15, 전부 `listed = false`)

| 업적 ID | 유형 · XP | 보상 (`reward_id` · 종류 · 표시명) | 16 §4 보상 방향 |
|---|---|---|---|
| `hidden_one_move` | 재미 30 | `title_one_step_enough` 칭호 + `badge_one_step_enough` 배지 「한 칸이면 충분해」 | `한 칸이면 충분해` 칭호·배지 |
| `hidden_improve_one` | 재미 30 | `title_one_step_difference` 칭호 「한 칸의 차이」 + `path_color_one_step` 경로 색상 | `한 칸의 차이` 칭호·경로 색상 |
| `hidden_disjoint_retry` | 도전 120 | `path_effect_forked_road` 경로 효과 「갈림길」 | 갈림길 경로 효과 |
| `hidden_attack_helped` | 발견 60 | `badge_signpost` 배지 「이정표」 | 이정표 배지 또는 이모티콘 |
| `hidden_return_to_sender` | 도전 120 | `frame_backlink_return` 프레임 「움직이는 역링크」 | 움직이는 역링크 테두리 |
| `hidden_random_win` | 발견 60 | `icon_dice_globe` 프로필 아이콘 「주사위 지구본」 | 주사위 지구본 프로필 아이콘 또는 배지 |
| `hidden_same_document` | 재미 30 | `badge_shared_document` 배지 + `emoji_shared_document` 관전 이모티콘 「겹친 문서」 | 겹친 문서 배지·이모티콘 |
| `hidden_same_group_path` | 재미 30 | `emoji_footprints` 관전 이모티콘 「발자국」 + `title_footprint_follower` 칭호 「발자국 탐험가」 | 발자국 이모티콘·칭호 |
| `hidden_three_disjoint` | 도전 120 | `background_three_ways` 배경 「세 갈래 길」 | 세 갈래 경로 배경 |
| `hidden_three_close` | 발견 60 | `emoji_simultaneous_arrival` 관전 이모티콘 + `badge_simultaneous_arrival` 배지 「동시 도착」 | 동시 도착 이모티콘·배지 |

### 3.3 검토할 때 볼 것

| # | 항목 |
|:-:|---|
| ① | **16·spec에 없는 표시명은 발명이다** (C4 §3.1 시안 > 코드 > 발명). 16이 이름을 준 보상은 `한 칸이면 충분해`·`한 칸의 차이`·`원정대원` 셋뿐이고, 나머지(`멈추지 않는 발걸음`·`노련한 승부사`·`발자국 탐험가` 등)는 자리표시자다 |
| ② | **경기 표현용 4종 14개**(경로 색상 1·경로 효과 1·완주 효과 6·관전 이모티콘 6)는 지급·보유·장착까지만 된다. **경기 화면에 그리는 곳은 없다** (판정 7) |
| ③ | **배지가 12개다.** 대표 배지는 최대 3개만 걸린다 (C1 §3). 단계 I·II를 같은 배지의 등급으로 둘지, 단계마다 다른 배지로 둘지는 아트 결정이다 |
| ④ | **프로필 아이콘 보상 2개**(`icon_daily_explorer`·`icon_dice_globe`)는 아트가 없으면 기본 이미지로 보인다 — 장착해도 달라진 것이 안 보인다 |
| ⑤ | 단계마다 보상 1개가 원칙이고 히든 5개만 2개짜리 번들이다. 16의 유일한 "프레임+배경" 번들(오늘의 올클리어)은 범위 제외로 사라졌다 |

---

## 4. G5 — 히든 비노출 구조 (16a 구현)

| 경로 | 막는 방법 |
|---|---|
| 신규 8테이블 | RLS on + **`anon`·`authenticated` 권한 0 + 정책 0.** 본인 행도 직접 못 읽는다 — 진행·해금 행의 `achievement_id`만으로 존재가 드러나기 때문이다 |
| `reward_catalog` | **`listed = false`** + 정책 `retired = false and (listed or 본인 보유)` (C1 §1.1) |
| 읽기 RPC | `get_my_achievements_v1`은 히든을 **본인이 해금한 것만** 돌려준다. `hidden` 블록의 키는 **`discovered`·`achievements` 둘뿐** — 총개수는 어떤 형태로도 없다 (판정 5). 카드에 `sortOrder`를 싣지 않는다 (번호 틈으로 개수를 추정하지 못하게) |
| 결과 RPC | `get_result_achievements_v1`은 **호출자 본인**의 해금만 |
| 장착 탐침 | 미보유 히든 보상 장착 응답 = **존재하지 않는 ID와 같은 `REWARD_NOT_OWNED`** (C1 §4.1 판정 순서 그대로) |
| 스키마 텍스트 | 이름·조건은 **테이블 행에만** 있다. 함수 본문·주석·정책·기본값에 히든 문자열 0 (pgTAP §6.3) |
| 프론트 번들 (16c) | **히든 이름·조건을 JS 상수로 두지 않는다.** 문구는 서버 응답에서만 온다 — 16c 수용조건 |
| 의도된 노출 | 해금한 사람이 **장착한** 히든 보상은 남의 카드에 보인다 (C1 §3.2 "걸었는지는 표시 정보") |
| 남은 노출 | **저장소의 migration 파일 자체**에는 이름·조건이 있다. 저장소 공개 여부는 확인하지 않았다 `확인 필요` |

---

## 5. 16b·16c가 쓰는 인터페이스 (16a 산출물)

**지급 파이프라인 — `private`, 실행 권한 없음 (16b 판정기만 부른다):**

| 함수 | 하는 일 | 반환 |
|---|---|---|
| `private.apply_achievement_value_v1(user, achievement_id, value bigint, state jsonb, source_type, source_id, at)` | 다시 센 값을 진행도에 기록하고 **기준값 이하의 모든 단계**를 해금 (여러 단계 동시). 단일 단계는 `value = 1` | `{ok, achievement_id, value, unlocks:[…]}` |
| `private.unlock_achievement_v1(user, achievement_id, tier smallint, source_type, source_id, at)` | 해금 1행 → 번들 지급 → inventory → `try_grant_xp_v1('achievement_unlock', unlock.id)`. **이미 있으면 보상·XP만 보충** (멱등 치유) | `{ok, unlocked, unlock_id, achievement_id, tier, rewards_granted, xp}` |

- 실패 코드: `AUTH_REQUIRED`(게스트·null) · `ACHIEVEMENT_NOT_FOUND` · `ACHIEVEMENT_TIER_INVALID` · `ACHIEVEMENT_INACTIVE`(신규 해금만 — 이미 받은 해금은 비활성 후에도 유효) · `ACHIEVEMENT_SOURCE_INVALID` · `ACHIEVEMENT_VALUE_INVALID`.
- **`source_type`·`source_id`:** `single` = `game_records.id` · `duel` = `match_history.id` · `group` = `game_rooms.id` (15c와 같은 결과 ID) · `equipment`·`retro`·`admin`은 `source_id`를 생략할 수 있다.
- **XP 실패는 해금을 되돌리지 않는다** (`try_grant_xp_v1` — WARNING만). 16b 트리거는 15c처럼 업적마다 예외 블록을 한 겹 더 둔다.
- 비활성·은퇴 보상과 번들은 **새로 지급하지 않는다** (C1 `active` 판정).

**읽기 RPC — `authenticated`·`service_role`, `security definer`:**

| RPC | 반환 |
|---|---|
| `get_my_achievements_v1()` | `{ok, achievements:[카드], hidden:{discovered, achievements:[카드]}, unseenCount}`. 카드 = `{achievementId, category, hidden, hiddenKind, name, condition, description, displayPolicy, active, retired, current, tierCount, unlockedTier, nextThreshold, tiers:[{tier, threshold, xp, rewards:[RewardRef], unlocked, unlockId, unlockedAt, seen}]}`. 일반은 **살아 있는 것 + 본인이 받은 것**(비활성·은퇴 후에도) |
| `get_result_achievements_v1(scope, result_id)` | **G9 형식.** `{ok, scope, resultId, achievements:[{achievementId, category, hidden, hiddenKind, name, condition, description, tierCount, tiers:[{unlockId, tier, threshold, xp:{amount, ledgerId}, rewards, unlockedAt, seen}], xpTotal}], xpTotal}`. **업적별로 묶고 히든을 앞에 둔다.** `xp.amount`는 원장의 실제 값 — 16c의 레벨업 합산(판정 9)이 이것을 쓴다 |
| `mark_achievements_seen_v1(unlock_ids uuid[] = null)` | 본인 해금의 `seen_at`. `null`이면 전부. 남의 ID는 조용히 무시 → `{ok, marked}` |

실패: `AUTH_REQUIRED` · `RESULT_SCOPE_INVALID` · `RESULT_ID_REQUIRED`.

**16b 판정기 이름**은 `achievement_definitions.evaluator`에 이미 있다 — `first_normal_finish` · `profile_card_complete` · `unique_documents` ·
`course_improvements` · `daily_course_days`(2개 공유) · `duel_normal_matches` · `duel_normal_wins`(2개 공유, `params`로 갈림) · `duel_defense_successes` ·
`group_normal_finishes` · `group_party_finish` · `group_stay_until_close` · `single_exact_moves` · `course_improvement_exact` · `course_disjoint_retry` ·
`duel_attack_helped` · `duel_return_to_sender` · `duel_random_win` · `duel_same_document` · `group_same_path` · `group_top3_disjoint` · `group_top3_close`.
`params`의 키는 판정 6의 기본값을 그대로 담았다 (예: `exclude_forfeit_wins`, `exclude_reflected`, `window_ms: 1000`).

---

## 6. 16a 검증 `[산출물, 로컬 스택 wiki-packet13-r2-clean158, 2026-10-02]`

| 항목 | 결과 · 기준 |
|---|---|
| migration | `npx supabase migration up --local` — `20261002090000` 적용, 로컬 이력 **22** · 정의 23(히든 10) · 단계 39 · 번들 39 · 번들 항목 44 · 카탈로그 50(=6+44) · 비공개 15 — 기준 `a8eda5a` |
| pgTAP 신규 | `achievements_rewards_v1` **145/145** — 기준 `c6172fd` |
| pgTAP 전체 | **916/916** (기존 771 + 145) · `not ok` 0. TAP 없는 `group_final_gaps_v13_hardening_preflight.sql`은 제외 — 기준 `c6172fd` |
| G5 음성 대조 | 테스트 사본에 히든 보상 1개 `listed = true` + `achievement_definitions` SELECT grant를 주입 → **3건 실패** (정의 읽기 · 카탈로그 히든 문자열 · U1 미발견 보상). 테스트가 누출을 실제로 잡는다. 사본은 커밋하지 않았다 |
| `npm test` | **422/422** (JS 변경 없음) — 기준 `c6172fd` |
| inert | 비내부 트리거 중 업적 함수를 부르는 것 0 (pgTAP §1). 적용해도 지급 0 |
| 운영 | **미적용 · 미접근.** 적용은 건별 승인 (`AGENTS.md` §1) |
