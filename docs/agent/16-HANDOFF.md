# 16 업적·보상 — 판정과 인계

작성: 2026-10-02 · 16b 추가 2026-10-03 (§7) · 16c·16b-r 준비 추가 2026-10-03 (§8·§9) · 16d 판정 2026-10-03 (§10) · 16b-f 2026-10-03 (§11) · 브랜치 `feat/group-final-gaps` · 착수 기준 `819617a`
> **패킷 16 완료 (2026-10-03)** `[사용자 실행·확인, 2026-10-03]` — 16a(서버 기반) · 16b(사건 연결) · 16b-r(소급, §9.5) · 16b-f(권위 필터, §11.5) · 16c(표시, main push #12) · 16d(배지 폐지 — 16d-1 main push #13 · 16d-2 운영 migration, §10.7). 운영 migration 25 = 저장소 25.

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
| — | 보상 할당표 (2026-10-03) | **승인.** 임시 표시명은 GAPS §4.5.1 발명 목록 (§3) |
| — | 「이어지는 발걸음」 정의 (2026-10-03) | **원문대로 누적.** 스트릭 제안 철회 (§1.1 상자) |
| — | 운영 적용 단위 (2026-10-03) | **16a는 16b와 묶어 적용한다.** 적용 자체는 건별 승인 (`AGENTS.md` §1) |
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

> **하루 1코스에서는 「오늘도 탐험」과 「이어지는 발걸음」이 같은 수를 센다. 3코스 재개 시 분리된다**
> `[사용자 결정, 2026-10-03]`. 둘 다 **누적**이다 — 16 §2.3:72 "연속 출석 스트릭이 아니라 누적 참여일이다" · spec §3.3 "누적 참여일을 업적으로 추적한다".
> 겹침은 **3코스 범위 제외(spec §0 2026-09-28)의 파생 효과**이며 결함이 아니다. 기준값만 다르다(10/50/200 vs 7/30/100).
> 16a 시드는 둘 다 같은 판정기 `daily_course_days`를 가리킨다.
> ~~「이어지는 발걸음」= 오늘 코스 완주 연속 일수(KST 스트릭)~~ — **2026-10-03 제안 후 같은 날 철회.** 16 §2.3이 의도적으로 누적을 택했다. migration 무수정.

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

## 3. 단계별 보상 할당표 — ~~초안, 사용자 검토 대기~~ → **승인 (2026-10-03)** `[사용자 결정]` (판정 7)

**승인은 할당(종류·단계·ID)에 대한 것이다.** 16·spec에 근거가 없는 표시명·설명은 **발명**으로 `PACKET-CONTRACT-GAPS.md` §4.5.1에 등재했다 —
디자인 확정 시 `display_name`만 교체한다 (`reward_id`는 불변, 16 §1). 시드는 수정 없이 확정이다.

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
| ③ | ~~**배지가 12개다.** 대표 배지는 최대 3개만 걸린다 (C1 §3). 단계 I·II를 같은 배지의 등급으로 둘지, 단계마다 다른 배지로 둘지는 아트 결정이다~~ → **정정 (2026-10-03): 시드의 배지는 11개(공개 7 · 히든 4)였다. 배지 kind는 폐지 — 11개는 아이콘 7 · 칭호 4로 전환 (§10)** |
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
| 운영 | **적용 완료 (2026-10-03, 16b와 묶어)** — §7.4 |

---

## 7. 16b — 사건 연결 (로컬 완료, 2026-10-03) `[산출물]`

**migration `20261002100000_achievement_triggers_v1.sql`** (TRACKS §2.4 예약 그대로) · pgTAP `supabase/tests/achievement_triggers_v1.sql`.
커밋: `f684a46` 판정기 → `e122bfd` 트리거 → `d2c139a` pgTAP. **운영 미적용 · push 안 함.** 16a와 묶어 적용한다 (§1).

### 7.1 구조

| 층 | 객체 | 하는 일 |
|---|---|---|
| 트리거 4 | `trg_record_single_result_achievements`(game_records INSERT) · `trg_record_duel_result_achievements`(match_history INSERT) · `trg_record_group_result_achievements`(game_rooms UPDATE OF status) · `trg_record_equipment_achievements`(user_profile_equipment INSERT/UPDATE) | 15c와 같은 WHEN + 싱글은 `run_id is not null`. 이름순으로 15c `trg_grant_*` 뒤에 실행 (pgTAP §1이 고정) |
| 바깥 격리 | `private.record_result_achievements_on_write_v1` | 전체를 예외 블록 1겹 — 실패 시 `ACHIEVEMENT_RESULT_FAILED` WARNING, 경기 커밋 |
| 결과 1건 | `private.record_result_achievements_v1(scope, id)` | 참가자 = 싱글 1 · 1:1 승패자 · 그룹 **결과 행 전원**(떠난 완주자 포함). 프로필 **user_id 순 잠금 후** 순서대로 판정. 게스트·프로필 없음 제외 |
| 사용자 1명 | `private.record_user_achievements_v1` | 방문 문서 기록 → 그 scope를 듣는 **살아 있는** 정의마다 예외 블록 1겹 (`ACHIEVEMENT_EVAL_FAILED` WARNING) |
| 정의 1개 | `private.evaluate_achievement_v1` → `private.achievement_value_v1` | 값 계산 → 16a `apply_achievement_value_v1`. `once`는 값 1일 때만, `counter`는 0이어도 진행도 기록 |
| 재실행 | `public.evaluate_result_achievements_v1(scope, id)` | **service_role 전용.** scope = `single`·`duel`·`group`·`equipment`(id = user_id). 멱등 |
| 신규 테이블 | `user_achievement_marks` | 다시 셀 수 없는 판정(끝까지 함께)의 결과별 표식. RLS on · 권한 0 (16a 8테이블과 같은 G5 자세) |

**판정기 → scope 지도**는 `private.achievement_evaluator_scopes_v1`에 있다. 여기 없는 evaluator를 가리키는 정의는 **돌지 않는다** — 새 판정 방식은 migration (판정 11).
**누적형은 매번 원천에서 다시 센다** — 16b-r이 같은 함수를 부를 수 있다. 상황형은 이번 결과만 본다.

### 7.2 구현 판정 — §1.1에 없던 것 `[16b 구현 판정 → 사용자 승인, 2026-10-03]`

§1.1 기본값은 전부 `params`대로 반영했다. 아래는 원문·§1.1이 정하지 않아 **이번에 고른 것**이다. 바꾸려면 판정기 또는 `params` 수정 (운영 적용 전이면 이 파일을 고친다 — 16a와 같은 처리).

| # | 업적 | 고른 것 | 이유 |
|:-:|---|---|---|
| ① | 완벽한 대응 — 되돌리기 "성공" | **상대가 건 강제 이동(FORCED_LINK)을 되돌린 `go_back`만.** 자기 이동 되돌리기는 제외. 편집 보호·역링크는 공격을 소비한 것(`consumed_defense_event_id`) | "대응"이 성공한 경우만. 모든 `go_back`을 세면 공격 없이 쌓인다 |
| ② | 끝까지 함께 | room_players에 finished로 남아 있고 **`finished_at < 방 finished_at`** — 방을 닫은 그 순간 완주한 사람은 관전하지 않았다 | 근사치(§2)의 하한 |
| ③ | 반송 처리 · 특수:운 · 그 공격 길 안내 | "승리" = **정상 완주 승리**(`result_status = completed`). 기권승 제외 | 승부사 기본값(§1.1)과 같은 선 |
| ④ | 전과 다른 길 | 이동 수 = `click_count`, 중간 문서 = `path_page_ids[2:n-1]`(싱글 path는 시작 포함 — 직전 세션 실측) | — |
| ⑤ | 어디서들 오셨어요 | 1·2·3위 **각자 중간 문서 1개 이상** 필요 | 직행끼리는 중간이 공집합이라 "안 겹침"이 공허하게 참 |
| ⑥ | 넓어진 세계 | 방문 = **그 경기 이동 이벤트의 양끝**(시작·되돌린 문서 포함). 1:1 패자·그룹 기권자 포함. **싱글은 완주 판만** — 포기·만료 판은 결과 행이 없어 트리거가 없다 | — |
| ⑦ | 첫 도착 | **이번 결과**가 정상 완주일 때만(1:1 패배·그룹 기권은 해당 없음) | 기존 사용자가 16b-r 전에 진 경기로 「첫 도착」을 받지 않게 |
| ⑧ | 맞수·승부사·순수한 승부의 0% 반복 | 15c 원장을 읽지 않고 **같은 규칙(`duel_decay_v1` + 같은 순번)으로 재계산** | 소급과 같은 코드. 트리거 순서(`trg_record_*`)는 그대로 둔다 |
| ⑨ | 여기 제 자리인데요 | 위치는 이동 이벤트 `server_timestamp`부터 그 사람의 다음 이동까지, **겹침은 엄격(<)**. 두 목표는 room_players에서 — 행이 없으면(나중 재실행) 판정하지 않음 | — |
| ⑩ | 그룹 경로 3종 | 경로 = 이동 이벤트 **재생**(UNDO는 pop) — 떠난 완주자는 room_players에 없다 | — |
| ⑪ | from_activation | 결과 시각 < `coalesce(starts_at, created_at)`이면 판정 안 함 — **재실행 RPC 포함** | 활성 전 결과로 상황형이 열리지 않게 |

### 7.3 검증 (로컬 스택 `wiki-packet13-r2-clean158`, 2026-10-03)

| 항목 | 결과 · 기준 |
|---|---|
| migration | **`db reset --local` — 23개 전체 재생 통과** (2026-10-03, 배포 전 관문 1) |
| pgTAP 신규 | `achievement_triggers_v1` **128/128** — reset 직후 실행에서 U5·U6 fixture가 활성 시각보다 앞서 1건 실패(시간 의존 fixture, migration 무관) → 밀리초 오프셋 + 가드 단언 1건 추가 |
| pgTAP 전체 | **1044/1044** (916 + 128, reset 후 재실행 — 배포 전 관문 2), `not ok` 0. 기존 2파일 조정: 16a "inert" 단언 → `trg_record_*` 4개만 허용 · 15c `pg_temp.total`이 `achievement_unlock` XP를 뺀 결과 XP를 잰다 (`e122bfd`) |
| 음성 대조 | 같은 스위트를 트리거 4개 **disable**한 사본으로 → **76/127 실패**(양성 단언 전부). 남은 51은 "해금 없음" 경계·구조 단언. 사본은 커밋하지 않았다. 스위트 안에도 트리거를 끈 1건(§8.4)이 있다 |
| 격리 3경우 | ① 정의 1개의 `params` 파손 → 그 업적만 실패, 나머지 해금 ② 결과 판정 전체 예외 주입 → 완주·15c XP 커밋, 해금 0 ③ `grant_xp_v1` 예외 주입 → 해금·보상 유지, 업적 XP 0 → 재실행 RPC가 XP만 보충 |
| 로컬 스모크 | 싱글 첫 완주(실제 `apply_single_move_v2`) → **첫 도착 해금 + `achievement_unlock` 30 XP + `badge_first_arrival`**, 15c 결과 XP 1행 그대로 (pgTAP §2.1) |
| 동시성 (pwsh 7.6) | `duel_item_concurrency_v3` 3×5 PASS · deadlock 0 · `server_authority_concurrency_v2` PASS · `group_final_gaps_v13_hardening_concurrency` **8/8 PASS** (`-DbContainer` 지정. server_authority는 컨테이너명이 하드코딩이라 임시 사본으로 실행 후 삭제) |
| `npm test` | **422/422** (JS 변경 없음) |

### 7.4 남은 것

| 항목 | 상태 |
|---|---|
| 16b 전용 경합 하니스 | **없다.** 같은 사용자의 완주와 장착이 동시에 오는 경우 등은 분석으로만 — 모든 경로가 `profiles` 행을 먼저 잠그고(15c `grant_xp_v1` · 이 파일 §7) 그룹은 user_id 순이다. 기존 하니스 3종은 16b 트리거가 켜진 채로 통과했다 |
| 16b-r | 누적형 판정기는 그대로 재사용된다. 단일 단계 일반 2개(첫 도착 · 여덟 명의 원정대)는 **이번 결과만** 보므로 (준비된 탐험가는 현재 장착 상태를 읽어 그대로 재사용된다) 소급용 분기(`scope = 'retro'`)가 필요하다. `user_visited_documents`도 과거 경기에서 채워야 한다 |
| 재실행 RPC 응답 | 히든 `achievement_id`가 담긴다 — service_role 전용이라 G5 밖이다 |
| 비용 | 그룹 종료 1회 = 최대 8명 × 그룹 판정기 8개. 그룹 경로 재생은 판정기마다 다시 한다(최대 8명 × 3) |
| 운영 | **적용 완료 (2026-10-03)** `[사용자 실행·확인]` — 백업 → `db push` 2개, 검증 쿼리 기대값, 운영 23 = 저장소 23. 스모크: 싱글 1회 이동 완주 → +15 결과 · 누적 75(15 + 첫 도착 30 + 히든 30), 편집기 배지 2개. 결과 화면 표시는 16c |

---

## 8. 16c — 표시 (완료, 2026-10-03, 커밋 `ecbf727` — 미배포) `[산출물]`

기준: `ecbf727`(코드·테스트 — 검증은 커밋 직전 같은 작업 트리). migration 없음 — 16a 읽기 RPC 3개와 `level_from_total_xp`만 부른다. 소유권은 `TRACKS.md` §1.1-e 16c 행(착수 시 실측으로 `MainPage.jsx`·15c-2 파일 추가).

### 8.1 판정 `[사용자 결정, 2026-10-03]`

| # | 항목 | 판정 |
|:-:|---|---|
| ① | 1:1 결과 유지 시간 | **이번 결과에 해금이 있으면 6000ms, 없으면 4000ms 유지.** 6000은 결과가 뜬 시각부터 잰다. `duelResultHotfix.test.js`는 기준 문자열만 `}, RESULT_HOLD_MS);`로 |
| ② | 로비 알림 닫기 | **세션 동안 숨김.** seen은 **업적 화면 진입 시에만**. 닫은 뒤 미확인 수가 늘면 다시 보인다 |
| ③ | 분류 표시명 6개 | 발명 — `PACKET-CONTRACT-GAPS.md` §4.5.1 (16c 표시 문구 표) |
| ④ | 16b-r 실행 시점 | **16c 배포 후** — 소급 해금이 로비 알림으로 묶여 보인다 |
| ⑤ | 범위 밖 수정 — 한 번 달성형(`once`) 카드의 `0 / 1` 진행 막대 숨김 | **승인** |
| ⑥ | 16b-r 근거 — 판정 8을 1:1·그룹에도 적용 | **이동 이벤트(`game_move_events`)가 없는 1:1·그룹 결과는 소급 근거에서 제외.** 운영 dry-run 보고에 그 수를 따로 내고, 수치를 본 뒤 사용자가 최종 확정 |

### 8.2 구조

| 화면 | 구현 | 데이터 |
|---|---|---|
| 업적 화면 `/achievements` (ProtectedRoute) | `pages/AchievementsPage.jsx` — 히든 카드 1장 `발견 n / ??` + 해금한 히든 · 분류별 일반 카드(단계 점 · 진행 막대 · 다음 보상 · 완료) · NEW | `get_my_achievements_v1` 1회 → 그린 직후 `mark_achievements_seen_v1(null)` |
| 결과 reveal (싱글 · 1:1 정상 종료) | `components/ResultXp.jsx`가 업적을 함께 조회 → `components/ResultAchievements.jsx`. 히든 먼저(서버 순서), 600ms 간격, `prefers-reduced-motion: reduce`면 처음부터 정적. **그려진 카드의 해금만** seen | `get_result_achievements_v1(single, game_records.id)` · `(duel, match_history.id)` — 결과와 같은 트랜잭션에서 열리므로 재시도 없음 |
| XP 합산·다중 레벨업 (판정 9) | `utils/xpResultDisplay.js` — 결과 원장 행 + 업적 `xpTotal`을 한 줄씩, 합산으로 판정. 획득 전 레벨 = 서버 `level_from_total_xp(totalXp − 합산)` → `레벨 업! Lv.1 → Lv.3 (+2)`. 실패 시 `레벨 업! Lv.3` | 공식은 프론트에 없다 (C3). `authenticated` 실행 권한 실측 `t` (로컬) |
| 로비 | `pages/MainPage.jsx` — 헤더 `업적` 버튼 · `새 업적 n개` 알림(결과 화면 없는 경로: 그룹 · 1:1 기권 · 장착 · 소급) | `unseenCount` |
| 본인 프로필 | `pages/ProfilePage.jsx` — `n개 달성`(분모 없음) + 최근 해금 3개 + 전체 보기 | 같은 RPC |

G5: 히든 이름·조건·보상명은 JS에 없다 — `tests/achievementDisplay.test.js`가 migration에서 히든 10개·비공개 보상 15개를 읽어 프론트 8파일에 없음을 단언한다 (음성 대조: 이름 1개 주입 → 실패 확인).

### 8.3 검증 (로컬 스택 `wiki-packet13-r2-clean158`, 2026-10-03, `ecbf727`의 작업 트리)

| 항목 | 결과 |
|---|---|
| `npm test` | **438/438** (422 + 신규 `achievementDisplay` 12 + `xpResultDisplay` 순증 4). 15c-2 전제 테스트("한 결과는 최대 1레벨")는 판정 9에 맞게 교체 |
| `npm run build` | 통과 — 기존 500 kB 경고 유지 |
| 로컬 UI `scripts/achievement-display-smoke.mjs` | **15/15** — 싱글 1이동 첫 완주(99 XP·방문 99곳 사전 세팅) → `+15`·`+90 업적 달성`·`Lv.1 → Lv.3 (+2)` · reveal 3장 히든 먼저 · seen 3 / 로비 알림 → 닫기 세션 숨김(seen 불변) → 새 세션 재표시 → 업적 화면 NEW·`발견 1 / ??`·`101 / 500`·다음 보상 → seen 0 / 프로필 `4개 달성`·최근 3 / 1:1 승자(해금 1, 모션 감소 → 정적) **5953ms**, 패자(해금 0) **3986ms** / 페이지 오류 0 / 정리 확인 |
| DB 전제 | 로컬 migration 23 · `has_function_privilege(authenticated, level_from_total_xp)` = t · 읽기 RPC 3개 authenticated 실행 가능 |

### 8.4 남은 것

| 항목 | 상태 |
|---|---|
| 배포 | feat push까지 `[사용자 승인]`. **`main` push는 사용자가 한다** — DB 변경 없음 |
| 그룹 reveal | 범위 밖 (X2) — 그룹 해금은 로비 알림이 받는다 |
| 1:1 기권·이탈 | 결과 화면 없음 (X3) — 로비 알림 |
| 남은 노출 | 해금 직후 같은 결과 화면을 다시 열 수 없으므로 reveal은 1회성이다. 다시 보기는 업적 화면 |

---

## 9. 16b-r — 소급 준비 (작성 · 로컬 검증만, 2026-10-03, 커밋 `301c1db`) `[산출물]`

**운영 실행 안 함.** 16c 배포 후 건별 승인 (§8.1 ④). 운영에는 psql이 없고 **Supabase SQL Editor**만 쓴다 — `-v` 변수·`\` 명령 없음, 화면에는 **마지막 결과만** 보인다.

### 9.1 파일

| 파일 | 역할 |
|---|---|
| `scripts/16b-r-retro-dryrun.sql` | SQL Editor에 그대로 붙이는 판. 마지막 줄 `select * from pg_temp.retro_16b_r(false);` — **보고(ord · section · item · value)가 마지막 결과로 한 번에 나온다** |
| `scripts/16b-r-retro-apply.sql` | 같은 본문, 마지막 인자만 `true`. 머리에 "dry-run 승인 후에만 · 백업 · 16c 배포 후" 경고 |
| `tests/retroScripts.test.js` | **두 파일의 본문(`-- >>> 16b-r BODY` ~ `-- <<< 16b-r BODY`)이 한 글자도 다르지 않음**을 고정 · 꼬리는 인자만 다름 · `\` 명령·문장 단위 begin/commit/rollback 없음 · 마지막 문장이 보고 · 범위·보고 항목. 음성 대조: apply 본문 1글자 변경 → 실패 확인 |
| `scripts/16b-r-retro-local-fixture.sql` · `scripts/16b-r-retro-local-run.mjs` | 로컬 전용. 실행기가 **위 두 파일 그대로**를 fixture 위에서 dry-run → apply → apply 순으로 돌리고 전체를 ROLLBACK. `--scale`은 143명 규모 시간 측정 |

**dry-run이 `begin … rollback`이 아닌 이유:** SQL Editor는 마지막 문장의 결과만 보여 주므로 `rollback;`이 마지막이면 보고가 사라진다. 그래서 본문은 `pg_temp` 함수이고, dry-run은 함수 안에서 모든 쓰기 뒤에 **표식 예외(`16B_R_DRY_RUN_ROLLBACK`)로 되돌리고** 변수에 모아 둔 보고만 돌려준다. 다른 예외는 그대로 올라온다. apply는 표식 없이 끝나고 SQL Editor의 암묵 트랜잭션이 커밋한다.

### 9.2 방법

① 근거 결과: 싱글 = `run_id is not null` + 완료 run · **1:1·그룹 = 이동 이벤트가 있는 결과만**(§8.1 ⑥ — 없는 결과는 `제외` 행으로 보고) ② 근거 결과마다 `private.achievement_record_visits_v1` ③ `retroactive`·살아 있는 정의만, 사용자별 `profiles` 잠금(user_id 순) ④ counter = 16b 판정기가 원천에서 다시 센다(근거 결과 1개로 호출) ⑤ **소급 분기** — 첫 도착 · 여덟 명의 원정대는 근거 결과를 시간순으로 훑어 처음 만족하는 것, 준비된 탐험가는 현재 장착 ⑥ 지급 `apply_achievement_value_v1(…, 'retro', null)` → 결과 화면 없음 → 16c 로비 알림. 1:1 감쇠는 판정기가 `duel_decay_v1`로 다시 센다.

**보고:** 모드 · 근거 사용자·결과 수(싱글/1:1/그룹) · **제외: 이동 이벤트 없는 1:1·그룹 결과 수와 그중 누적 판정기가 여전히 세는 수** · 방문 문서 행 · 해금 받은 사용자 · 해금 합계 · XP 합계 · 실패 · 소요 ms · 사용자별 해금 수 분포 · 업적·단계별 해금(사용자 수·XP) · 레벨 상승 분포 · 실패 상세.

### 9.3 로컬 검증 (스택 `wiki-packet13-r2-clean158`, 2026-10-03, `301c1db`의 작업 트리 · `npm test` 445/445)

| 항목 | 결과 |
|---|---|
| fixture 13명 (`node scripts/16b-r-retro-local-run.mjs`) | dry-run: 근거 싱글 119 · 1:1 12 · 그룹 1 · **제외 1:1 7 · 그룹 1 (그중 여전히 세는 결과 8)** · 해금 **26** · XP **780** · 11명 · 레벨 +1 3명 / +0 8명 · 실패 0. **dry-run 뒤 해금 0** · **apply = dry-run(모든 수·분포 일치)** · **두 번째 apply 해금 0·XP 0·방문 0 (멱등)** · ROLLBACK 후 잔여 0 |
| 규모 (`--scale`) | 143명 · 싱글 5,720 · 1:1 1,530(제외 100) · 그룹 25 — 운영(2026-09-02 실측 users 145 · game_records 59)보다 훨씬 많게 잡았다 → **DB 안 소요 4,629 ms**. 운영 규모면 1초 안쪽으로 예상. 파일이 `statement_timeout = '5min'`을 건다. **SQL Editor 자체의 요청 시간 제한 값은 저장소에서 확인되지 않는다** `확인 필요` — 보고의 "소요 ms"로 실측한다 |

### 9.5 운영 실행 `[사용자 실행·확인, 2026-10-03]`

| 단계 | 결과 |
|---|---|
| dry-run (`16b-r-retro-dryrun.sql`) | 근거 사용자 7 · 해금 5 (전부 `onboarding_first_finish`) · 150 XP · 레벨 변화 0 · **251 ms** · 이동 이벤트 없는 1:1 **76** (그중 16b 판정기가 세는 것 **75**) |
| apply (`16b-r-retro-apply.sql`) | **dry-run과 동일** — 5명 · `onboarding_first_finish` · 150 XP · 레벨 변화 0 · **133 ms**. **16b-r 완료** |

§9.4의 "효과 없음" 쪽이 실제로 75건이다 — 그 사용자가 다음 1:1을 하면 16b 판정기가 75건까지 다시 센다. **16b-f(§11)에서 판정기 자체를 고친다** — 제외 규칙은 소급과 실시간 판정이 같은 기준이 되는 것으로 확정된다.

### 9.4 제외 규칙의 한계 — **최종 확정 전에 볼 것** `확인 필요`

16b의 누적 판정기(맞수와의 만남 · 승부사 · 순수한 승부 · 함께하는 탐험)는 `match_history`·`group_match_results`를 **이동 이벤트 조건 없이** 원천에서 센다 (`20261002100000` §4). 그래서 소급 스크립트의 제외는 다음까지만 효과가 있다:

- **효과 있음:** 방문 문서 집합 · 첫 도착 · 여덟 명의 원정대(소급 분기가 근거 결과만 훑는다) · 그 scope에 근거 결과가 하나도 없는 사용자(판정기를 부르지 않는다)
- **효과 없음:** 그 scope에 근거 결과가 하나라도 있는 사용자의 카운터 값에는 제외된 결과도 들어간다. 그리고 **소급과 무관하게, 그 사용자가 다음에 1:1·그룹을 한 판 하면 16b 트리거가 제외된 결과까지 다시 센다**

보고의 `그중 16b 누적 판정기가 원천에서 여전히 세는 결과`가 그 크기다. 0이거나 작으면 그대로 확정하면 된다. 크고 완전히 배제하려면 판정기에 이동 이벤트 조건을 넣는 **forward migration**이 필요하다(판정 11 — 새 판정 방식은 migration) — 그때는 실시간 판정도 함께 바뀐다.

---

## 10. 16d — 배지 폐지 · 프레임 단계 · 경기 표현 판정 `[사용자 결정, 2026-10-03]`

**기록만이다 — 구현·나머지 16d-0(TRACKS §1.1-e 등재 · C1·C5·spec §10 정정 · GAPS §4.5.1 등재 · `docs/design/DESIGN-SYSTEM.md`)은 16b-r apply 후.**
배경 결정: **배지 kind를 폐지한다.** 카드 = 아이콘(그림) · 칭호(글) · 프레임(테두리) · 배경(질감). 근거 — 칭호와 배지가 같은 의미를 중복하고, 그림 배지는 아이콘과 겹친다. 아이콘은 랭킹(COMPACT)에 보이므로 업적 보상이 남에게 보이게 된다.
"대표 배지" 수는 저장소 전 문서에서 **최대 3**이었다(1개 결정 기록은 없음) — 정정은 "3 → 폐지"로 적는다. 배경 패턴은 디자인 세션.

### 10.1 판정 5건

| # | 항목 | 판정 |
|:-:|---|---|
| 1 | 전환 방식 · 순서 | **(a) kind 갱신** — 배지 보상 행의 `kind`·`display_name`·`asset_ref`만 바꾼다. `reward_id` 불변(16 §1), 보유 인벤토리 행 그대로, 재지급 0. **순서: 16b-r apply → 16d** — (a)는 소급이 먼저 지급한 행도 같은 ID라 함께 전환되므로 순서가 정확성에 영향이 없다. 사이 기간 비용(소급 해금이 "배지 「…」"로 보임 · 그 사이 장착된 배지는 16d가 해제)은 아래 §10.3 쿼리로 센다 |
| 2 | 전환표 | **승인 — 아이콘 7 · 칭호 4** (§10.2). 발명 표시명 2개(「매일의 탐험가」·「함께하는 탐험가」)는 GAPS §4.5.1에 등재. **§3.3 ③의 "배지가 12개다"는 틀렸다 — 시드는 11개(공개 7 · 히든 4)** |
| 3 | 프레임 · 경로 색상 | **확정 디자인 시스템 기준** (디자인 작업에서 확정, 저장소 미등재 → 16d-0에서 `docs/design/DESIGN-SYSTEM.md` 최소 등재, 디자인 세션이 확장). 팔레트 5색 — 파랑 `#2E6DB4`(링크·현재·플레이) · 보라 `#6E56C9`(방문·기록) · 금 `#B98A12`(목표·승리) · 청록 `#1D8B81`(발견·위키) · 산호 `#DE5F49`(반응·경고). 규칙: **테두리·노드·아이콘·경로에만, 배경 채움 금지.** 종이 톤 바탕. Pretendard Variable. **프레임 I: 1px 잉크 링 · II: 이중 링 · III: 금 링 · special(히든): 청록 점선 회전, 모션 감소 시 정적.** 경로 색상 토큰 `path:<색>`은 팔레트 5색 안에서 |
| 4 | 결과 화면 경기 표현 | **싱글:** 경로 타임라인에 경로 색상 + 완주 효과. **1:1: 승자 카드에 완주 효과만, 경로 줄 추가 안 함** (1:1 결과 카드에는 경로 목록이 없다 — `MultiplayerGamePage.jsx` 결과 카드). 그룹은 동결 — 제외. 경로 효과(갈림길)는 판정 7 그대로 범위 밖 |
| 5 | 히든 아이콘 SVG | **불투명 파일명 + 일반 `<title>`** — `public/`은 누구나 받을 수 있으므로 히든 보상 이름이 파일 경로·SVG에 드러나지 않게. 화면 alt는 서버 표시명 |

### 10.2 전환표 (판정 2)

| `reward_id` (불변) | 지금 (배지) | → kind | 새 표시명 |
|---|---|---|---|
| `badge_first_arrival` | 첫 도착 | 프로필 아이콘 | 「첫 도착」 |
| `badge_daily_explorer_1` | 오늘도 탐험 I | 칭호 | 「오늘도 탐험」 |
| `badge_daily_explorer_2` | 오늘도 탐험 II | 칭호 | 「매일의 탐험가」 **발명** |
| `badge_duel_pure` | 순수한 승부 | 칭호 | 「순수한 승부」 |
| `badge_duel_defense` | 방패 | 프로필 아이콘 | 「방패」 |
| `badge_group_together_1` | 함께하는 탐험 I | 칭호 | 「함께하는 탐험가」 **발명** |
| `badge_group_together_2` | 함께하는 탐험 II | 프로필 아이콘 | 「함께하는 탐험」 |
| `badge_one_step_enough` (히든) | 한 칸이면 충분해 | 프로필 아이콘 | 그대로 (같은 번들에 같은 이름 칭호) |
| `badge_signpost` (히든) | 이정표 | 프로필 아이콘 | 그대로 |
| `badge_shared_document` (히든) | 겹친 문서 | 프로필 아이콘 | 그대로 |
| `badge_simultaneous_arrival` (히든) | 동시 도착 | 프로필 아이콘 | 그대로 |

규칙: 상징 그림 → 아이콘, 이름을 부르는 것 → 칭호, 같은 번들 안 같은 이름은 아이콘. 획득형 아이콘은 이 7개 + 기존 `icon_daily_explorer`·`icon_dice_globe`(아트 없음) = **임시 SVG 9개** (기본 6종과 같은 형식 — `viewBox 0 0 64 64`, 판정 5).
`reward_id` 접두사 `badge_`와 kind가 어긋나는 것은 (a)의 알려진 비용이다 — 사용자에게는 보이지 않는다.

### 10.4 `asset_ref` 토큰 할당 (16d-0, 16d-2 migration이 적용)

토큰 문법은 `docs/design/DESIGN-SYSTEM.md` §4 · C5 §3.6. **프론트는 `reward_id`로 모양을 정하지 않는다** (G5).

| 보상 | kind | `asset_ref` |
|---|---|---|
| `frame_ready_explorer` | 프레임 | `frame:tier-1` |
| `frame_wide_world_1·2·3` | 프레임 | `frame:tier-1` · `frame:tier-2` · `frame:tier-3` |
| `frame_duel_rival_1·2·3` | 프레임 | `frame:tier-1` · `frame:tier-2` · `frame:tier-3` |
| `frame_backlink_return` (히든) | 프레임 | `frame:special` |
| `finish_better_path_1·2·3` | 완주 효과 | `finish:tier-1` · `finish:tier-2` · `finish:tier-3` |
| `finish_daily_steps` (이어지는 발걸음 2단계) | 완주 효과 | `finish:tier-2` |
| `finish_duel_victor` (승부사 2단계) | 완주 효과 | `finish:tier-2` |
| `path_color_one_step` (히든, 한 칸의 차이) | 경로 색상 | `path:purple` (방문·기록) |
| 전환 아이콘 7 + `icon_daily_explorer` · `icon_dice_globe` | 프로필 아이콘 | 임시 SVG 9개 — 공개 4개는 `/profile-icons/<이름>.svg`, **히든 5개는 불투명 파일명** (판정 5). 파일명은 16d-1이 정하고 16d-2가 같은 값을 넣는다 |

`finish:special`은 지금 할당 대상이 없다 (히든 완주 효과 없음). 2단계 완주 효과 2개를 `tier-2`로 둔 것은 단계 위치(2단계 보상)를 따른 것이다 — 디자인 세션이 바꿀 수 있다.

### 10.3 구현 계획 (16b-r apply 후)

| 단계 | 내용 | 배포 |
|---|---|---|
| 16d-0 | TRACKS §1.1-e 16d 행(R10) · C1(§1·§3·§5) · C5(§2·§3.5·§4·열린 질문 ③) · spec §10 정정(C3 §0 방식 — 정정 표, 옛 값 취소선) · GAPS §4.5.1 · `docs/design/DESIGN-SYSTEM.md` · §3 표의 배지 행 정정 | 문서 |
| 16d-1 | 프론트 — SVG 9 · 카드 슬롯 4(편집기 7행 → 4행) · `orderedBadges`·`MAX_BADGES`·`.pcard-badge*` 제거 · `REWARD_KIND_LABELS`에서 `badge` 제거 · 편집기 "경기 표현"(완주 효과·경로 색상) · `asset_ref` 토큰 렌더(프레임 `frame:tier-1..3`·`frame:special`, 완주 `finish:…`, 경로 `path:<색>`) · 결과 화면(판정 4). **옛 DB 상태·새 DB 상태 둘 다에서 동작** — migration이 `asset_ref`에 SVG 경로를 넣기 전에 파일이 있어야 한다 | `main` push |
| 16d-2 | forward migration — 11행 kind·표시명·`asset_ref` · `slot = 'badge'` 장착 행 삭제(자동 재장착 없음) · `reward_catalog` kind CHECK와 장착 slot CHECK에서 `badge` 제거, `slot_index`는 항상 1(컬럼·RPC 인자는 호환용으로 유지) · `equip_profile_reward_v1` 인덱스 규칙 · `profile_cards_v1`의 `badges` 키는 `[]` 상수로 유지(옛 프론트 호환) · 「준비된 탐험가」 `params.any_of = ["title"]` + 조건 문구 "프로필 아이콘 선택 + 대표 칭호 장착"(받은 해금 유효, 판정기 함수 기본값은 params가 덮으므로 무수정) · 프레임·완주·경로 `asset_ref` 토큰 · pgTAP(`c1_reward_tables_v1`·`achievements_rewards_v1`·`achievement_triggers_v1` 배지 단언 정정 + 신규 `badge_retirement_v1`) · JS 테스트(`profileCard`·`profileRewards`, `achievementDisplay`의 kind 목록 출처를 새 migration으로) | 운영 적용 — 건별 승인 |

**G5:** 프레임·효과 단계는 서버 `asset_ref` 토큰으로 구분한다 — 프론트가 `reward_id`로 단계를 정하면 히든 ID(`frame_backlink_return` 등)가 JS에 들어간다.

**운영 배지 보유 현황 (읽기 전용, SQL Editor) — `scripts/16d-check-badge-holders.sql`. 16d-2 migration 직전에 사용자가 실행해 해제될 장착 행 수를 확인한다:**
```sql
select c.reward_id, c.listed,
       count(distinct i.user_id) as holders,
       count(distinct e.user_id) filter (where e.slot = 'badge') as equipped_users,
       (select count(*) from public.user_profile_equipment where slot = 'badge') as badge_slot_rows_total
  from public.reward_catalog c
  left join public.user_reward_inventory i on i.reward_id = c.reward_id
  left join public.user_profile_equipment e on e.reward_id = c.reward_id
 where c.kind = 'badge'
 group by c.reward_id, c.listed
 order by c.reward_id;
```

---

## 11. 16b-f — 1:1·그룹 누적 판정기 권위 필터 `[사용자 결정, 2026-10-03]`

**문제:** 16b 싱글 판정기는 `run_id is not null`로 legacy를 뺀다(`achievement_single_records_v1`). 1:1·그룹 누적 판정기는 `match_history`·`group_match_results`를 **조건 없이** 센다. 운영에 이동 이벤트 없는 1:1이 76건(판정기가 세는 것 75건, §9.5) — 그 사용자가 다음 1:1을 하면 legacy까지 세어 해금이 열리고, **해금은 되돌릴 수 없다.** 로컬 재현: legacy 9승 + 실제 1승 → 한 판에 맞수·승부사·순수한 승부 4단계(두 사람).

### 11.1 판정

| # | 항목 | 판정 |
|:-:|---|---|
| 1 | 기준 | 1:1·그룹 누적 판정기는 **이동 이벤트(`game_move_events`)가 있는 결과만** 센다 — 16b-r 소급과 같은 기준. §9.4의 제외 규칙은 이것으로 확정 |
| 2 | 범위 | 맞수와의 만남 · 승부사 · 순수한 승부(`duel_normal_matches`·`duel_normal_wins`) · **완벽한 대응**(`duel_defense_successes`, 규칙을 하나로) · 함께하는 탐험(`group_normal_finishes`). 감쇠 순번(`achievement_duel_ordinal_v1`, 15c와 같은 규칙) · 상황형·once 판정기(이번 결과만 본다) · 트리거는 무변경 |
| 3 | 이미 열린 해금 | **목록만 이 절(§11.3)에 기록, 회수 없음** (16 §1) |
| 4 | 배포 | 16d를 기다리지 않는 별도 migration `20261003090000_achievement_authority_filter_v1.sql` → 사용자 `db push` → `scripts/16b-f-check-applied.sql`로 **판정기 값 = clean 전부 일치** 확인 → 16d |

### 11.2 확인 쿼리 (읽기 전용, SQL Editor — `545cc14`)

| 파일 | 보는 것 |
|---|---|
| `scripts/16b-f-check-opened.sql` | 이미 열린 누적 해금 중, 이동 이벤트 없는 결과를 빼면 기준값 미달인 것 |
| `scripts/16b-f-check-exposure.sql` | 사용자·업적별 clean / legacy 수 · `tiers_opened_by_legacy_next_game`(1 이상 = 16b-f 전 판정기로 다음 한 판에 열릴 위험). **이 열은 테이블에서 직접 계산한 가정값이라 판정기와 무관하다 — 적용 후에도 0이 되지 않는다.** 적용 전 노출 규모를 보는 용도 |
| `scripts/16b-f-check-applied.sql` (16b-f-1에서 추가) | **적용 확인용.** legacy가 있는 사용자·업적마다 실제 `private.achievement_value_v1`을 불러 그 값이 `clean`과 같은지 본다. 적용 전 = legacy 포함 값, **적용 후 = 모든 행 `clean`과 일치**. 이 5개 분기는 select만 한다 |

로컬 fixture(legacy 9 + 실제 1)에서 두 쿼리가 열린 4단계와 위험 사용자를 모두 잡는다 `[산출물]`. 완벽한 대응 분기는 fixture에 아이템 이벤트가 없어 구문만 확인 — pgTAP 신규 스위트가 덮는다.

### 11.4 16b-f-1 — migration · 검증 (로컬 스택 `wiki-packet13-r2-clean158`, 2026-10-03, `8eadaac`) `[산출물]`

| 항목 | 결과 |
|---|---|
| migration | **`20261003090000_achievement_authority_filter_v1.sql`** — `private.achievement_value_v1` create or replace 1개. 16b 본문 + 조건 4곳(맞수·승부사·순수한 승부 1 · 완벽한 대응 2 · 함께하는 탐험 1). 데이터·트리거·다른 함수 무변경 |
| 본문 고정 | `tests/achievementAuthorityFilter.test.js` 4건 — 조건 4곳을 빼면 16b 본문과 같다. 음성 대조: 본문 1글자 변경 → 실패 |
| pgTAP 신규 | `achievement_authority_filter_v1` **17/17**. **migration 전 10/17 실패**(필터에 의존하는 단언 전부 — 경계·감쇠·회수 없음·트리거 단언은 전후 모두 통과) |
| pgTAP 16b 정정 | `achievement_triggers_v1`의 `pg_temp.prior_room()`이 방마다 이동 이벤트 1개를 쓴다. **단언 무편집.** 정정 전 파일은 새 함수에서 §4가 실패 — 정정이 필요했음을 확인 |
| 전체 | **`db reset --local` 24개 재생** · pgTAP **1061/1061** (1044 + 17) · `npm test` **449/449** · 16b-r 로컬 실행기 기대값 불변 · `duel_item_concurrency_v3` 3×5 PASS · deadlock 0 · `server_authority_concurrency_v2` PASS(컨테이너명 임시 사본) · `group_final_gaps_v13_hardening_concurrency` **8/8** |
| 적용 확인 쿼리 | `scripts/16b-f-check-applied.sql` — 로컬 fixture에서 16b 본문이면 모든 행 `matches = f`, 16b-f 본문이면 모든 행 `t` |

**운영 적용 (사용자):** 백업 → `db push`(이 migration 1개, 운영 24 = 저장소 24) → `16b-f-check-applied.sql` 실행 → **모든 행 `matches = true`** → `16b-f-check-opened.sql` 결과를 §11.3에 기록 → 16d-0.

### 11.3 이미 열린 해금 (운영)

**0건** `[사용자 실행·확인, 2026-10-03]` — `16b-f-check-opened.sql` 0행. legacy 결과로 열린 1:1·그룹 누적 해금은 없다 (16b 운영 적용부터 16b-f 적용 사이에 legacy 보유자가 기준값을 넘긴 판이 없었다). 회수 대상 없음.

### 11.5 운영 적용 `[사용자 실행·확인, 2026-10-03]`

| 단계 | 결과 |
|---|---|
| 백업 → `db push` | `20261003090000_achievement_authority_filter_v1.sql` 적용. **운영 24 = 저장소 24** |
| `16b-f-check-applied.sql` | **전 행 `matches = true`** — 운영 판정기가 이동 이벤트 없는 결과를 세지 않는다 |
| `16b-f-check-opened.sql` | **0행** (§11.3) |

**16b-f 완료.** 소급(16b-r)과 실시간 판정이 같은 근거 규칙을 쓴다.

### 10.5 16d-0 완료 (2026-10-03) `[산출물]`

| 문서 | 바뀐 것 |
|---|---|
| `01-CONFIRMED-SPEC.md` §0 · §9.2 · §10 | 정정 이력 2026-10-03 — 대표 배지 3 → 폐지 · 우연형 보상 · legacy 대응 · `준비된 탐험가` 조건 (옛 문장 취소선) |
| `docs/contracts/C1-REWARD-TABLES.md` §0.-1 | 정정 이력 신설 — `kind`/`slot` 9 → 8 · `slot_index` 항상 1 · 카드 슬롯 4 · `badges` `[]` 상수 |
| `docs/contracts/C5-PROFILE-CARD.md` §0 · §3.6 | 정정 이력 신설 — `badges` 폐지 · §3.5 폐지 · §6-③ 대상 소멸 · `asset_ref` 토큰 §3.6 신설 |
| `docs/contracts/README.md` | 정정 이력 행 추가 |
| `docs/design/DESIGN-SYSTEM.md` | **신규 최소판** — 팔레트 5색 · 색 허용 위치 · 프레임 I/II/III/special · 경로 색상·완주 효과 토큰 · `asset_ref` 문법 · 임시 SVG 형식 |
| `PACKET-CONTRACT-GAPS.md` §4.5.1 | 발명 표시명 「매일의 탐험가」「함께하는 탐험가」 · 전환된 보상 표시명 |
| `TRACKS.md` §1.1-e · §2.4 | 16d 행 · `20261003100000_badge_retirement_v1.sql` 예약 |
| 이 문서 | §3.3 ③ 12 → 11 정정 · §10.4 토큰 할당 |
| `scripts/16d-check-badge-holders.sql` | 배지 보유자·장착 행 (읽기 전용) — 16d-2 직전 |

**구현은 아직 없다** — 코드·DB는 옛 규칙 그대로다. 다음: 16d-1(프론트).

### 10.6 16d-1 — 프론트 (로컬 완료, 2026-10-03) `[산출물]`

**옛 DB(지금 운영)와 16d-2 이후 DB 양쪽에서 동작한다** — migration보다 먼저 배포한다.

| 영역 | 바뀐 것 |
|---|---|
| 카드 | `utils/profileCard.js` — 카드 4요소(배지 키 없음) · `PROFILE_CARD_SLOTS` 4종 · `MATCH_EXPRESSION_SLOTS`(완주 효과·경로 색상) · 옛 DB의 `badge` 장착 행과 카드 `badges`는 읽지 않는다. `components/ProfileCard.jsx` 배지 렌더 제거 · 프레임 단계 클래스 · special은 아바타 바깥 회전 링 |
| 토큰 | 신규 `utils/rewardTokens.js` — 팔레트 5색 · `frameTier`·`finishTier`·`pathColor`. 토큰 없음(옛 DB) → 기본 모양 |
| 편집기 | `components/ProfileRewardEditor.jsx` — 카드 4행 + "경기 표현" 2행. 경기 표현은 `fetchOwnMatchExpression`(신규, `services/profileRewardService.js`)로 읽고 장착 응답으로 갱신. 경로 색상 견본은 노드 테두리만 |
| 결과 | 신규 `hooks/useMatchExpression.js` · `components/FinishEffect.jsx` · `css/matchExpression.css`(`fx-`). 싱글(`SuccessOverlay`) = 경로 노드·선 색 + 마지막 노드 완주 효과 · 1:1(`MultiplayerGamePage`) = **승자 카드에만** 완주 효과, 경로 줄 없음 (판정 4). 모션 감소 시 정적 |
| CSS | `css/profileCard.css` — `.pcard-badge*` 제거 · `.pcard--frame-tier-1·2·3·special` · 편집기 묶음·견본. `appStyles.js` import 1줄 |
| 라벨 | `utils/achievementDisplay.js` `REWARD_KIND_LABELS`에서 `badge` 제거 — 옛 DB의 배지 보상은 「이름」만 |
| SVG 9 | 공개: `public/profile-icons/first-arrival.svg` · `shield.svg` · `group-together.svg` · `daily-explorer.svg`. 히든(판정 5): `public/profile-icons/x/<8자리 hex>.svg` 5개, `<title>획득 아이콘</title>` |

**16d-2가 넣을 `asset_ref` (아이콘)** — 히든 이름이 이 표와 migration에 남는 것은 §4 "남은 노출"과 같은 수준이다(번들·공개 파일 경로가 아니다):

| 보상 | `asset_ref` |
|---|---|
| `badge_first_arrival` | `/profile-icons/first-arrival.svg` |
| `badge_duel_defense` | `/profile-icons/shield.svg` |
| `badge_group_together_2` | `/profile-icons/group-together.svg` |
| `icon_daily_explorer` | `/profile-icons/daily-explorer.svg` |
| `badge_one_step_enough` | `/profile-icons/x/620733c9.svg` |
| `badge_signpost` | `/profile-icons/x/48fa697d.svg` |
| `badge_shared_document` | `/profile-icons/x/3036149e.svg` |
| `badge_simultaneous_arrival` | `/profile-icons/x/2a70eb1b.svg` |
| `icon_dice_globe` | `/profile-icons/x/4285e53f.svg` |

**검증 (로컬 스택, 2026-10-03, 커밋 직전 작업 트리):** `npm test` **456/456** (449 + 7 — 배지 단언 정정 · 신규 `tests/matchExpression.test.js` 6 · 편집기·서비스 1) · build 통과 · **G5 스캔에 16d 파일·SVG 전부 추가** — 공개 SVG 제목 「함께 걷는 발자국」이 히든 보상명 「발자국」을 포함해 스캔이 잡았고 「함께하는 탐험」으로 고쳤다.
로컬 UI `scripts/badge-retirement-ui-smoke.mjs` **9/9** — **A 옛 DB**: 편집기 6행(배지 행 없음) · 장착된 배지 무시 · 프레임/완주/경로 장착 · 토큰 없음 → 기본 링·기본 완주 효과 / **B 16d-2 모양**(카탈로그 행을 임시로 바꾸고 원복): 금 링(tier-3) · 전환된 「첫 도착」이 아이콘 SVG로 장착 · 싱글 결과 보라 경로 + tier-3 완주 / **C 1:1**: 승자 카드에만 완주 효과(모션 감소 → 정적) · special 링 회전 / 모션 감소 정적 · 페이지 오류 0 · 카탈로그 원복 확인. 16c `achievement-display-smoke` **15/15** 회귀 없음.

### 10.7 16d-2 — migration (로컬 완료, 2026-10-03) `[산출물]`

**`supabase/migrations/20261003100000_badge_retirement_v1.sql`** — 운영 미적용.

| 절 | 하는 일 |
|---|---|
| 1 | 배지 11행 → kind · 표시명 · `asset_ref` (§10.2 · §10.6). 남은 `badge` 행이 있으면 `BADGE_RETIREMENT_UNMAPPED_ROWS`로 **중단** |
| 2 | 토큰 16행 — 프레임 8 · 완주 효과 5 · 경로 색상 1 · 기존 획득 아이콘 2 SVG (§10.4) |
| 3 | `slot = 'badge'` 장착 행 삭제 — 보상은 보유 그대로, 자동 재장착 없음 |
| 4 | CHECK 3개 교체 — kind 8 · slot 8 · `slot_index = 1`. 행을 먼저 고친 뒤 조인다 |
| 5 | `equip_profile_reward_v1` — 17b 본문 + index 규칙(`v_index <> 1` → `SLOT_INDEX_INVALID`) · 주석 2줄. `unequip`은 무변경 |
| 6 | `private.profile_cards_v1` — 카드 슬롯 4 · `badges`는 `'[]'::jsonb` 상수 |
| 7 | 「준비된 탐험가」 `any_of = ["title"]` · 조건 문구 · **`condition_version` 1 → 2**(구현 판정 — 해금·진행 행이 버전을 기록하므로 옛 조건으로 받은 해금은 1로 남는다). 정의에 `badge`가 남으면 `BADGE_RETIREMENT_DEFINITION_STILL_USES_BADGE`로 중단 |

**검증 (로컬 스택, 2026-10-03, 커밋 직전 작업 트리):**

| 항목 | 결과 |
|---|---|
| 본문 고정 | `tests/badgeRetirement.test.js` 5 — equip·카드 빌더가 17b 본문과 의도한 줄만 다르다 · SVG 경로 9개 실재(히든 5 불투명) · 토큰 문법 · 실패 시 중단 · 행 → CHECK 순서 |
| 데이터 경로 | `scripts/16d-2-migration-local-check.mjs` **8/8** — `db reset --version 20261003090000`(16d-2 직전)에서 배지 보유·장착 fixture → **보유자 쿼리 전: 11행 · 해제 예정 3행** → migration 파일 적용 → **보유 행 불변(재지급 0) · 배지 슬롯 3행만 삭제 · 칭호·프레임 장착 유지 · 보유자 쿼리 후 0행** → 전체 reset 복귀 |
| pgTAP 신규 | `badge_retirement_v1` **24/24** |
| pgTAP 정정 | `c1_reward_tables_v1` 96 → **97** — 배지 fixture를 다른 kind로, 여러 자리·이동 단언을 "slot당 한 자리" 단언으로 1:1 교체 + `badge` kind 거부 1건 추가 · `achievement_triggers_v1` §6 「준비된 탐험가」를 아이콘 + 배지 → **아이콘 + 칭호**(두 순서 모두) |
| 전체 | migration **25**(`db reset`) · pgTAP **1086/1086** · `npm test` **461/461** · build · 16b-r 실행기 5/5 · UI `badge-retirement-ui-smoke` **8/8 (실제 migration 상태)** · 16c 스모크 15/15 |

UI 스모크는 DB 상태를 감지한다 — 옛 DB면 16d-2를 카탈로그에서 흉내 내고 원복, 16d-2 DB면 실제 행을 본다. **1:1 START 버튼 대기(5초)가 1/3회 시간 초과** — 목표 저장 지연으로 보이며 같은 패턴의 16c 스모크에도 있다. 이 스크립트만 15초로 늘렸다.

**판정 추가** `[사용자 결정, 2026-10-03]`: 「준비된 탐험가」 `condition_version` 1 → 2 **승인**.

**운영 배지 보유 현황 — 16d-2 직전** (`scripts/16d-check-badge-holders.sql`) `[사용자 실행, 2026-10-03]`:

| 보상 | 보유 | 장착 |
|---|---:|---:|
| `badge_first_arrival` | 7 | 1 |
| `badge_one_step_enough` (히든) | 1 | 0 |
| 나머지 9개 | 0 | 0 |
| **`badge_slot_rows_total`** | | **1** |

→ **16d-2가 해제할 장착 행은 1개.** 보유 8행은 그대로 아이콘이 된다(kind 갱신).

**운영 적용** `[사용자 실행·확인, 2026-10-03]`:

| 단계 | 결과 |
|---|---|
| 백업 → `db push` | `20261003100000_badge_retirement_v1.sql` 적용 — **운영 25 = 저장소 25** |
| `16d-check-badge-holders.sql` 재실행 | **0행** — `kind = 'badge'` 행 없음 · 해제 예정이던 장착 1행 해제 |
| 화면 | 프로필 아이콘 목록에 전환된 「첫 도착」 표시 |

**16d 완료.**
