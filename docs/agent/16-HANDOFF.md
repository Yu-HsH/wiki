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
