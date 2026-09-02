# Wiki Race 2.0 인수인계 (Claude 세션용) — 초안

작성일: 2026-08-20
갱신: **2026-08-29 — 2026-08-27~28 cutover 창 결과 반영** (§0.2에 변경 지점 목록)
이전 갱신: 2026-08-20 — 상시 가드레일을 `AGENTS.md`로 분리, 운영 실측(`docs/ops/PROD-SNAPSHOT-2026-08-20.md`) 반영
작성 방식: 저장소 읽기 전용 조사 (코드 수정·commit·push 없음). 운영 DB에는 접근하지 않았고, 운영 수치는 전달받은 스냅샷 문서와 창 실행 기록을 근거로 인용한다.
최초 조사 기준: 브랜치 `feat/group-final-gaps`, HEAD `450f63a` (`feat: complete server authority v2 cutover`)
현재 기준: HEAD `48e3f2d`, `origin/main` = `9eba7e9` (2026-09-02 실측)

> **⚠ 이 문서의 운영 상태 서술은 2026-08-27~28 cutover 창으로 한 번 크게 뒤집혔다.**
> **운영 migration 11개가 전량 적용됐고**(W6) 검증이 전항목 통과했으며(W7) Edge Function 2개가
> 배포됐다(W8). ~~**W10(유지보수 게이트 해제)만 수행되지 않았다.**~~
> → **W10도 수행됐다 (2026-09-02). 유지보수 게이트가 해제됐고 서비스가 열려 있다.**
> 낡은 서술은 지우지 않고 **"언제까지 참이었고 무엇이 바꿨는지"를 병기하는 방식**으로 갱신했다 —
> 이 문서는 인계 문서이므로 판단이 뒤집힌 경위 자체가 정보다.
>
> **지금 상태의 단일 기준은 `docs/agent/CURRENT.md`다.** 이 문서와 어긋나면 그쪽이 우선한다.
> 창 실행 기록 전문은 **`docs/ops/CUTOVER-LOG-2026-08-27.md`**. 바뀐 지점 목록은 **§0.2**.

## 0. 이 문서의 규칙

- 모든 항목에 **근거 파일 경로**를 붙인다. 경로가 없는 항목은 이 문서에 넣지 않는다.
- 근거 종류를 구분한다.
  - `[코드]` 실제 소스·마이그레이션·테스트에서 확인
  - `[문서]` 저장소 안 handoff/스펙 문서에서만 확인 (코드로 재확인하지 않음)
  - `[산출물]` 테스트 실행 결과 파일에서 확인
- 저장소에서 확인되지 않는 것은 추측하지 않고 §4 `확인 필요`로만 기록한다 (상시 규칙: `AGENTS.md` §5).
- 단일 기준 문서는 `wiki-race-2.0-handoff/01-CONFIRMED-SPEC.md`다. 다른 문서와 충돌하면 이 문서를 우선한다.
- **상시 금지·의무 사항은 이 문서가 아니라 `AGENTS.md`에 있다.** 이 문서는 인계 정보(현재 상태·근거·미확인 항목)만 담는다. 핸드오프를 첨부하지 않은 세션에서도 가드레일이 적용되도록 분리했다.
- 운영 환경 실측 기록은 `docs/ops/PROD-SNAPSHOT-2026-08-20.md`였다. **그 문서는 2026-08-28 창으로 무효가 됐다** — 현재 상태의 근거로 인용하지 않는다 (`AGENTS.md` §1.1). 새 날짜 스냅샷은 아직 없다 (`docs/agent/CURRENT.md` §5.6-1).

### 0.1 저장소 상태 (조사 시점 = 2026-08-20)

- 브랜치: `feat/group-final-gaps`. 조사 시점 최근 커밋은 `450f63a`, `37adc69`, `aa756e1`, `8a77e53`, `94f422b`.
- ~~Packet 13과 로컬 런타임 게이트 관련 변경은 **전부 미커밋 작업 트리 상태**다.~~
  **2026-08-20에 `339fb77`로 커밋됐다.** 조사 시점에는 `20260814103000_group_final_gaps_v13.sql`,
  `20260814113000_group_final_gaps_v13_hardening.sql`,
  `20260814123000_group_spectator_emoji_atomicity_fix.sql`, `services/groupSpectatorService.js`,
  `scripts/supabase-*.mjs`, `scripts/packet13-browser-b1*.mjs`, `wiki-race-2.0-handoff/`가
  untracked/modified였고, 그 상태는 **같은 날 종료됐다.**
- 상시 가드레일은 2026-08-20에 저장소 루트 `AGENTS.md`로 분리했다(신규 파일, 그 이전에는 없었음). `CLAUDE.md`는 없고 `.agents/`는 빈 디렉터리다.

### 0.2 2026-08-29 갱신에서 바뀐 지점

**2026-08-27~28 cutover 창이 이 문서의 운영 상태 서술을 뒤집었다.** 아래가 그 목록이다.
각 절에서 원문을 취소선으로 남기고 무엇이 언제 바꿨는지 병기했다 — 근거는 전부
`docs/ops/CUTOVER-LOG-2026-08-27.md`의 해당 단계다.

| 절 | 무엇이 낡았었나 | 지금 | 바꾼 단계 |
|---|---|---|---|
| §0.1 | "Packet 13 변경은 **전부 미커밋 작업 트리 상태**" | `339fb77`로 커밋됨 (2026-08-20) | 창 이전 |
| §1.4 | Release A~D 4단계를 **확정 절차**로 기술 | **U2로 대체됐다** — 11개를 한 창에서 전량 적용 | CUTOVER-PLAN §10 |
| §3.1 | "운영 **미적용**, 함수 **7개뿐**, V2 RPC 30개 없음, CLI push 이력 없음" | 적용됨. 함수 **36개**, legacy RPC **0**, 이력 **12행** | **W3·W4·W6·W7** |
| §3.2 | RELEASE HOLD 사유 = 운영 적용·Edge Function·dry-run·Release A~D 승인 | **4개 전부 완료.** ~~지금 HOLD 사유는 W9 미해결 4건~~ → **2026-09-02: `RELEASE HOLD`가 해제됐다.** 4건 전건 종결 + **W10(게이트 해제) 수행.** 판정의 현재 값은 `docs/agent/CURRENT.md` §1 | W5·W6·W8·W9 · **W8-b·W9-b·W10** |
| §4.1 | publication·RLS·Edge Function 배포 목록 **미확인** | publication 4테이블, RLS 14/14, 함수 2개 배포 | **W7·W8** |
| §4.4 | `schema_migrations` 부재 = **cutover 차단 요소** / `finish_group_player` 배포 순서 **설계 필요** / 3개 migration **미적용** | 전부 해소 | **W3·W6·W7** |
| §5 | "Release A~D 재설계 전에는 운영 적용을 시작하지 않는다" | 이미 U2로 실행됐다 | 창 전체 |

**바뀌지 않은 것:** §1(확정 스펙), §2(의도적 제외 vs 미구현), §3.3(테스트 실행 방법),
§4.3(스펙 공백)은 창의 영향을 받지 않는다. §4.2는 일부만 바뀌었다 — 해당 절에 표시했다.

---

## 1. 확정 스펙 (근거 파일 경로 포함)

기준: `wiki-race-2.0-handoff/01-CONFIRMED-SPEC.md` (작성 2026-08-13, 갱신 2026-08-14). 아래는 그중 코드로 교차 확인 가능한 항목을 중심으로 정리한 것이다.

### 1.1 공통 원칙

| 확정 규칙 | 근거 |
|---|---|
| 문서 이동·승패 판정은 canonical page/revision ID 기준 | `[문서]` `01-CONFIRMED-SPEC.md` §2 / `[코드]` `supabase/migrations/20260814090000_server_authority_v2.sql` (`wiki_pages`, `wiki_page_snapshots`, `wiki_snapshot_links`) |
| 새로고침은 명시적 이탈이 아니며 진행 상태를 복구한다 | `[문서]` §2, `wiki-race-2.0-handoff/code/12-SERVER-AUTHORITY-RECOVERY.md` §1 / `[코드]` `components/ExitGuard.jsx`, `utils/serverAuthority.js` |
| 뒤로가기·나가기는 확인을 받은 명시적 이탈 | `[문서]` §2 / `[코드]` `components/ExitGuard.jsx` (react-router `useBlocker`로 앱 내부 이동·뒤로가기만 확인 모달 처리, 새로고침·탭 닫기는 heartbeat/F5 복구에 위임), `supabase/migrations/20260814091000_server_authority_rpc_v2.sql` (`leave_single_game_run`) |
| 결과·통계는 서버가 확정한 값만 저장 | `[문서]` §2 / `[코드]` `supabase/migrations/20260814093000_server_authority_cutover_v2.sql` |
| 빠른 링크는 본문 링크 ∩ namespace 0 API 링크, 동일 revision에서 최대 20개 고정 | `[문서]` §2 / `[코드]` `services/wikiLinkPolicy.js` (`selectAllowedLinkTitlesFromHtml`, `selectDeterministicQuickLinks`), `services/wikiService.js:399` (`maxQuickLinks = 20`), `tests/wikiLinkPolicy.test.js` |
| 같은 이동 요청의 연속 중복 처리 차단 | `[문서]` §2 / `[코드]` `supabase/migrations/20260814090000_server_authority_v2.sql` (`game_mutation_requests`), `utils/serverAuthority.js` (`createRequestId`, `createPendingRequestStore`) |

### 1.2 그룹 레이스 (Packet 13 확정값)

| 확정 규칙 | 근거 |
|---|---|
| 참가 인원 3~8명 | `[문서]` §6.1 / `[코드]` `supabase/migrations/20260814103000_group_final_gaps_v13.sql:32-33,221-223,287` |
| 그룹에는 아이템이 없다 | `[문서]` §6.1, `code/10-CODE-MASTER-TODO.md` §8 / `[코드]` `20260814103000_group_final_gaps_v13.sql:243` (`use_items=false` 고정) |
| 전체 제한 20분(1200초) | `[문서]` §6.2 / `[코드]` 같은 마이그레이션 `:8,13,380,437,440`, `utils/groupGameTimer.js:2` |
| 3등 완주 후 2분(120초) grace | `[문서]` §6.2 / `[코드]` 같은 마이그레이션 `:9,14,381,874`, `utils/groupGameTimer.js:3` |
| 실제 마감 = `min(20분, 3등+2분)` | `[문서]` §6.2 / `[코드]` 같은 마이그레이션 `:493-502` (`least`), `utils/groupGameTimer.js` (`getGroupActualEndAt`) |
| 3등 완주가 방을 즉시 종료하지 않고 4등 이후도 마감 전 정상 순위 기록 | `[문서]` §6.2 / `[코드]` 같은 마이그레이션 `public.apply_group_move_v2:605`, `tests/groupFinalGaps.test.js` |
| 전원 완주·리타이어 시 마감 전 즉시 종료 | `[문서]` §6.2 / `[코드]` 같은 마이그레이션 `private.finalize_group_room_v13:467`, `private.finish_group_room_v13:130` |
| 미완주자는 `RETIRE`, 사용자 화면 표기는 `리타이어` | `[문서]` §6.2 / `[코드]` `pages/GroupGamePage.jsx`, `utils/groupResultFormatter.js` |
| 방장 승계: 경기 전 / 경기 중 미완주 / 완주 후 관전 세 시점, `created_at ASC, id ASC` | `[문서]` §6.3 / `[코드]` 같은 마이그레이션 `private.reconcile_group_host_v13:59`, `public.leave_group_player:904` |
| 경기 시작 후 방장은 강제 종료·추방 권한 없음 | `[문서]` §6.3 / `[코드]` 해당 마이그레이션에 kick / force-finish RPC 없음 (함수 목록 확인 결과 부재) |
| 관전 채팅 없음 / preset 이모티콘만 | `[문서]` §6.4 / `[코드]` 같은 마이그레이션 `:1033` (`cheer, wow, hurry, clap, gg`), `services/groupSpectatorService.js` (`GROUP_SPECTATOR_PRESETS`) |
| 발신자별 3초 쿨타임, 같은 사용자 이모티콘 1개만 표시 | `[문서]` §6.4 / `[코드]` 같은 마이그레이션 `:1057` (3초 간격 검사), `services/groupSpectatorService.js` (`upsertLatestGroupSpectatorEmoji`) |
| 사용자별 숨기기 + 전체 끄기 | `[문서]` §6.4 / `[코드]` `services/groupSpectatorService.js` (`filterVisibleGroupSpectatorEmojis`), `css/groupSpectator.css` |
| 완주 후 기본 화면은 한 참가자의 실제 플레이 관전 (읽기 전용) | `[문서]` §6.4 / `[코드]` `services/groupSpectatorService.js` (`fetchGroupSpectatorPage`; canonical page/revision 불일치 시 `SPECTATOR_SNAPSHOT_STALE`) |

### 1.3 1:1 대전

| 확정 규칙 | 근거 |
|---|---|
| 연결 끊김 60초 재접속 유예 | `[문서]` §4.2 / `[코드]` `utils/serverAuthority.js:2` (`DUEL_RECONNECT_DEADLINE_SECONDS = 60`), `supabase/migrations/20260814091000_server_authority_rpc_v2.sql:952` (`reconnect_deadline_seconds`) |
| 유예 만료 시 기권패·상대 승리 | `[문서]` §4.2 / `[코드]` 같은 파일 `finalize_duel_if_expired:935` (`finished_reason='forfeit'`, `result_status='forfeit'`) |
| 양쪽 동시 만료는 무효(취소) 처리 | `[문서]` §4.2 / `[코드]` 같은 함수 (`finished_reason='cancelled'`, `result_reason='disconnect_cancelled'`) |
| 아이템전 SWAP은 서버 inventory 구현 전까지 비활성 | `[문서]` `code/18-SERVER-AUTHORITY-V2-IMPLEMENTATION.md` / `[코드]` `supabase/migrations/20260814094000_duel_item_authority_v2.sql` (`apply_duel_swap_v2` → `SWAP_DISABLED`), `tests/duelSwapDisabled.test.js` |

### 1.4 배포 릴리스 게이트 — **Release A~D는 대체됐다 (U2, 2026-08-21)**

~~`Release A`(additive schema/RPC) → `Release B`(Edge Functions) → `Release C`(V2 프론트) →
`Release D`(최종 breaking cutover)의 4단계 승인 절차와 각 단계 명령이 확정되어 있다.~~

**이 4단계 분할은 실행되지 않았다.** U2 결정(2026-08-21)으로 **미적용 11개를 한 창에서 순서대로
전량 적용**하는 방식으로 대체됐고, 실제 절차는 `docs/ops/CUTOVER-PLAN.md`의 **W0~W11**이다.
**2026-08-27~28에 W0~W9가 그대로 실행됐다** (`docs/ops/CUTOVER-LOG-2026-08-27.md`).
A~D와 W단계의 대체 매핑은 **CUTOVER-PLAN §10**에 있다.

근거: `[문서]` `wiki-race-2.0-handoff/code/18-SERVER-AUTHORITY-V2-IMPLEMENTATION.md` "적용 순서"
(원 4단계 절차 — 그 파일 서두에 대체 표시를 붙였다), `docs/ops/CUTOVER-PLAN.md` §10.

- `20260814093000_server_authority_cutover_v2.sql`은 additive patch가 아니라 **의도된 최종 breaking cutover**이며 legacy RPC 두 개(`update_group_progress`, `finish_group_player`)를 삭제한다. 근거: `[코드]` 해당 마이그레이션 / `[문서]` `18-...md` "Legacy 그룹 mutation RPC 최종 breaking cutover".
- 로컬 런타임은 Supabase CLI `2.114.0` + image `public.ecr.aws/supabase/postgres:17.6.1.158` (digest `sha256:99b1729a...`)로 고정한다. 근거: `[코드]` `package.json` (`supabase` exact `2.114.0`), `supabase/config.toml` `[db]` 섹션의 런타임 게이트 주석, `scripts/supabase-runtime-preflight.mjs`.

---

## 2. 의도적으로 제외된 범위 vs 미구현

### 2.1 의도적으로 제외/보류한 범위 (스펙에 명시된 결정)

이 항목들은 "아직 안 만든 것"이 아니라 **2.0에서 만들지 않기로 확정된 것**이다.

| 제외 항목 | 근거 |
|---|---|
| 상점·게임 재화·유료 재화 | `01-CONFIRMED-SPEC.md` §10, §12 |
| 계정 전체 차단·신고 시스템 | 같은 문서 §6.4, §12 |
| 기간 한정 이벤트·아이템 로테이션 | §12 |
| 추가 히든 업적 (초기 13개 외) | §9.2, §12 |
| 머리·얼굴·의상·손 4부위 조합형 아바타, 아바타 프리셋 | §10, §12 / `code/11-REPOSITORY-AUDIT.md` §2.4 ("새로 만들지 않음") |
| 사용자 프로필 이미지 업로드 | §10, §12 |
| 새로운 시즌제 랭킹 | §8, §12 |
| 미니게임 결투의 기본 아이템 복귀 | §5.6, §12 (기존 구현은 삭제 강제 없이 이벤트/로테이션 후보로 보류) |
| 구체적인 꾸미기 아트 전량 제작 | §12 |
| 그룹 모드 아이템 | §5.6 마지막 문단, §6.1, `code/10-CODE-MASTER-TODO.md` §8 |
| 관전 텍스트 채팅 | §6.4, `code/13-GROUP-FINAL-GAPS.md` §2.3 |
| 제거 확정 아이템 5종(언어 변경, 링크 하이라이트, 양쪽 화면 가리기, 목표·현재 문서 교환, 기본 아이템 미니게임) | §5.6 |
| `GROUP_SPECTATOR_MIGRATION.sql`은 미적용 참고 자료로만 유지 | `GROUP_SPECTATOR_MIGRATION.sql` 상단 주석, `docs/WIKI_RACE_GROUP_DB_SECURITY_SPEC.md` §13, `code/13-GROUP-FINAL-GAPS.md` §11 |
| `game_rooms.host_user_id` 전용 index는 근거 부족으로 추가하지 않음 (운영 EXPLAIN 항목으로 보류) | `code/11-REPOSITORY-AUDIT.md` Hardening 감사 보완, `code/10-CODE-MASTER-TODO.md` §9.1 |
| Vector(observability) 서비스는 로컬 스택에서 의도적 제외 | `code/13-GROUP-FINAL-GAPS.md` §10, `scripts/supabase-start-pinned.mjs` (`--exclude vector`) |
| Vite 번들 chunk 경고는 성능 backlog로 분리 (기능 차단 아님) | `code/10-CODE-MASTER-TODO.md` §9.5 |

### 2.2 미구현 (스펙은 확정, 코드 근거 없음)

검색 기준으로 마이그레이션·프론트엔드에서 관련 테이블/함수/모듈이 **발견되지 않은** 항목이다.

| 미구현 항목 | 확인 방법과 결과 |
|---|---|
| XP 지급·XP ledger | `supabase/migrations/**`와 `*.js/jsx`에서 xp/experience 테이블·함수·모듈 없음. 계획 문서만 존재: `code/15-XP-LEVEL-RANKING.md` |
| 무한 레벨 (`min(100 + 25 × floor((lv-1)/5), 500)`) | 코드에 레벨 계산식 없음. `01-CONFIRMED-SPEC.md` §7.3과 `code/15-XP-LEVEL-RANKING.md`만 존재 |
| 주간 탐험가 랭킹 (월요일 00:00 초기화) | 없음. 현재 랭킹은 기존 1.0 구현 (`rankingService.js`, `pages/RankingPage.jsx`) |
| 일반 업적 18계열 / 히든 업적 13개 / 업적 도감 | achievement 관련 테이블·모듈 없음. `code/16-ACHIEVEMENTS-REWARDS.md`만 존재 |
| 보상 카탈로그 / 보유 inventory / 장착 상태 / reward bundle ID | 없음. `code/11-REPOSITORY-AUDIT.md` §2.4가 "cosmetic reward catalog, 보유 inventory, equipped 상태 테이블 없음"으로 이미 감사 기록 |
| 프로필 카드(아이콘 1 + 칭호 1 + 배지 최대 3 + 프레임 1 + 배경 1) | 없음. 현재는 `profiles.profile_image_url` 단일 이미지 + `room_players.profile_image_snapshot` (`code/11-REPOSITORY-AUDIT.md` §2.4) |
| 오늘의 탐험 **세 코스**·코스별 랭킹·올클리어 | 현재는 하루 1코스 구조. `supabase/migrations/20260730170602_baseline_remote_schema.sql`의 `daily_challenges`는 `challenge_date` UNIQUE 1행이고 `ensure_today_daily_challenge()`도 단일 코스를 반환. 서비스: `services/dailyChallengeService.js`. 운영에도 동일한 1코스 함수만 존재 (`docs/ops/PROD-SNAPSHOT-2026-08-20.md` §2) |
| 1:1 확정 아이템 11종·5슬롯·2.5초 공통 쿨타임·변칙 슬롯 확률 | 미구현. 현재 카탈로그는 1.0 세트(`data/items.js`: `blind`, `translate_current`, `random_link_move`, `highlight_links`, `cleanse_shield`, `search_once`, `go_back`, `random_teleport`, `double_blind`, `mini_game`, `swap_current`)이고 판정 로직은 클라이언트(`utils/itemSystem.js`) |
| 서버 권위 아이템 지급·소비 원장·쿨타임 | 미구현. 그래서 `apply_duel_swap_v2`가 `SWAP_DISABLED`로 남아 있다 (`supabase/migrations/20260814094000_duel_item_authority_v2.sql`) |

### 2.3 명세 불일치 (구현은 있으나 확정 스펙과 어긋남)

| 항목 | 현재 코드 | 확정 스펙 |
|---|---|---|
| 프로필 이미지 업로드 | `pages/ProfilePage.jsx:132-142`가 `avatars` Storage 버킷에 사용자 파일 업로드. 운영 `avatars` 버킷에 객체 1개·소유자 1명이 실재한다 (`docs/ops/PROD-SNAPSHOT-2026-08-20.md` §3) | §10 "사용자 이미지 업로드는 구현하지 않는다". `code/11-REPOSITORY-AUDIT.md` §2.4가 이미 "확정 명세 불일치"로 분류. 객체가 0이 아니므로 무해한 즉시 제거 대상이 아니다 |
| 제거 확정 아이템 잔존 | `data/items.js`에 `translate_current`, `highlight_links`, `double_blind`, `mini_game`, `swap_current` 존재 | §5.6 제거 목록. 단 코드 감사 전 임의 삭제는 상시 금지이므로(`AGENTS.md` §4) 즉시 삭제 대상은 아니다 |
| 그룹 시간 규칙 문서 충돌 | `docs/WIKI_RACE_GROUP_DB_SECURITY_SPEC.md` §2.1·§14가 15분/3분·승자 1~3등으로 기재 | 확정값은 20분/2분 (`01-CONFIRMED-SPEC.md` §6.2, `20260814103000_group_final_gaps_v13.sql`). **해당 문서는 stale이며 갱신 대상** |
| README 사용자 문구 | README.md:9 "프로필 이미지(아바타) 커스텀" | §10 사용자 이미지 업로드 미구현. 업로드 기능과 함께 처리 |
---

## 3. 서버 권위 V2 / Packet 13 실제 구현 상태

### 3.1 서버 권위 V2 — 커밋 완료, **운영 적용 완료 (2026-08-28, W6)**

- 커밋 상태: HEAD `450f63a` (`feat: complete server authority v2 cutover`)에 포함. `[코드]` `git log`
- 마이그레이션 5개 (모두 tracked):
  1. `supabase/migrations/20260814090000_server_authority_v2.sql` — `wiki_pages`, `wiki_page_snapshots`, `wiki_snapshot_links`, `game_move_events`, `game_mutation_requests` + RLS
  2. `20260814091000_server_authority_rpc_v2.sql` — `single_game_runs`, `create_single_game_run`, `apply_single_move_v2`, `apply_guest_single_move_v2`(service_role 전용), `leave_single_game_run`, `submit_group_target_v2`, `apply_group_move_v2`, 듀얼 lifecycle RPC
  3. `20260814092000_duel_authority_v2.sql` — `create_duel_room_v2`, `join_duel_room_v2`, `apply_duel_move_v2`, `leave_duel_room_v2`
  4. `20260814093000_server_authority_cutover_v2.sql` — 클라이언트 직접 write 차단 + legacy 그룹 RPC 2개 삭제(breaking)
  5. `20260814094000_duel_item_authority_v2.sql` — `apply_duel_swap_v2` = `SWAP_DISABLED`
- 권한 경계: V2 RPC 전체가 `revoke ... from public, anon` + `grant execute to authenticated, service_role`. 게스트 이동은 `apply_guest_single_move_v2`가 service_role 전용이므로 Edge Function 경유다. `[코드]` `20260814091000_server_authority_rpc_v2.sql` 말미 GRANT 블록, `supabase/functions/single-run/index.ts`, `supabase/config.toml` (`[functions.single-run] verify_jwt = false`)
- 프론트 계약: `utils/serverAuthority.js` (`request_id`/`correlation_id`, `progress_version` 기반 `classifyRealtimeVersion`·`isStaleRealtimeVersion`, 입력 잠금), `services/wikiSnapshotService.js` (Edge Function `wiki-snapshot` 경유 캐시 적재)
- 테스트: `tests/serverAuthority.test.js`, `tests/serverAuthorityMigration.test.js`, `tests/duelSwapDisabled.test.js`, `supabase/tests/server_authority_v2.sql` (pgTAP 97), `supabase/tests/server_authority_concurrency_v2.ps1`
- **운영 적용 상태: 적용 완료 (2026-08-28).** ~~미적용 (2026-08-20 실측 확인)~~ —
  **2026-08-20 실측 시점에는 미적용이었다.** 그때 운영에는 `supabase_migrations.schema_migrations`가
  존재하지 않아 CLI push 이력 자체가 없었고, 로컬 기준 미적용 migration이 V2 5개를 포함해 총 11개였다.
  **cutover 창이 그 상태를 끝냈다:**
  - **W3** — `migration repair --status applied 20260730170602 --linked` (exit 0,
    `Repaired migration history: [20260730170602] => applied`)
  - **W4** — 이력 1행 / `baseline_remote_schema` / `statement_count` 250 확인
  - **W5** — `db push --dry-run --linked`에서 pending **정확히 11개**, 순서 계획 표와 완전 일치
  - **W6** — `db push --linked`로 **11개 전량 적용 성공**, 오류 없음
  - **W7** — migration 이력 **12행** (baseline + 11)

  `[산출물]` `docs/ops/CUTOVER-LOG-2026-08-27.md` §W3·§W4·§W5·§W6·§W7 /
  `[산출물]` `docs/ops/PROD-SNAPSHOT-2026-08-20.md` §1 (**무효 — 2026-08-20 시점 기록**) /
  `[문서]` `code/18-SERVER-AUTHORITY-V2-IMPLEMENTATION.md` (Release A~D는 U2로 대체, §1.4)
- **운영 `public` 함수는 36개다** (2026-08-28 W7 실측).
  ~~운영 `public` 스키마 함수는 7개뿐이고 그중 `finish_group_player`는 운영 전용(구버전,
  클라이언트 값 신뢰)이다. V2 RPC 30개는 운영에 없다.~~ — **2026-08-20 시점의 사실이었다.**
  W6가 적용한 `20260814093000_server_authority_cutover_v2`가 legacy RPC 2개
  (`finish_group_player`, `update_group_progress`)를 삭제했고, **W7에서 둘 다 `null`로 확인됐다.**
  `[산출물]` `docs/ops/CUTOVER-LOG-2026-08-27.md` §W7 (항목 1·2)
- **RLS도 함께 닫혔다.** `group_match_history`·`user_profile_stats`의 RLS off는 2026-08-20까지
  운영·baseline·`docs/WIKI_RACE_GROUP_DB_SECURITY_SPEC.md` §4.4 **3자 일치** 상태였다.
  Phase 2C(`20260813072952`)가 W6에서 적용되어 **W7 실측 `rls_off_tables = 0` (14/14)**.
  `[산출물]` `docs/ops/CUTOVER-LOG-2026-08-27.md` §W7 (항목 4)

### 3.2 Packet 13 (그룹 최종 차이) — 코드 완료·커밋(`339fb77`), **운영 적용 완료 (W6)** / 릴리스 보류

**코드 구현** — ~~(모두 untracked 또는 미커밋 수정)~~ **2026-08-20에 `339fb77`로 전부 커밋됐다.**
아래 목록은 조사 시점(2026-08-20)의 파일 구성이며 경로는 그대로 유효하다.

| 범위 | 파일 |
|---|---|
| 3~8명·무아이템·20분/2분·`min` 마감·전원 resolved 조기 종료·RETIRE·방장 승계 | `supabase/migrations/20260814103000_group_final_gaps_v13.sql` |
| 빈 종료 방 `host_user_id=NULL` 정리, 이모지 RPC lock 순서, `finalize_group_room_if_expired`의 `NOT_A_GROUP` 경계 | `supabase/migrations/20260814113000_group_final_gaps_v13_hardening.sql` |
| 만료 이모지 RPC의 JSONB 구조화 반환 (만료 시 `accepted=false` + finalization commit) | `supabase/migrations/20260814123000_group_spectator_emoji_atomicity_fix.sql` |
| preset / 음소거 / 최신 1개 유지, canonical 관전 문서 로딩 | `services/groupSpectatorService.js`, `pages/GroupGamePage.jsx`, `components/WikiViewer.jsx`, `css/groupSpectator.css` |
| 서버 시각 기반 마감 계산·finalizer 중복 호출 방지 | `utils/groupGameTimer.js`, `services/groupMultiplayerService.js` |
| 검증 하네스 | `supabase/tests/group_final_gaps_v13.sql`, `supabase/tests/group_final_gaps_v13_hardening_concurrency*.ps1`, `supabase/tests/group_spectator_emoji_atomicity.sql`, `scripts/supabase-*.mjs`, `scripts/packet13-browser-b1*.mjs` |
| JS 계약 테스트 | `tests/groupFinalGaps.test.js`, `tests/groupGameTimer.test.js`, `tests/supabaseRuntimeValidation.test.js`, `tests/packet13BrowserB1Scenarios.test.js` |

**검증 이력 (문서 기록)** — `code/10-CODE-MASTER-TODO.md` §9~§9.8, `code/13-GROUP-FINAL-GAPS.md` §5~§21, `qa/30-INTEGRATION-CHECKLIST.md` §13~§21

1. R1 (08-14): 코드·JS 검증 완료, DB 런타임 미검증 → `부분 완료 / 출시 보류`
2. Hardening (08-14): host·이모지·모드 경계 결함 3건을 additive 마이그레이션으로 보완
3. Crash Diagnostic (08-14): 로컬 PostgreSQL에서 `anon` 권한 거부 경로의 signal 11(SIGSEGV) 재현 → `CODE NO-GO`. 원인은 Packet 13 함수 body가 아니라 로컬 런타임으로 좁혀짐
4. R (08-15): Supabase image `.095`/`.104`/`.136`/`.158` 비교로 `.104` 회귀 확인, CLI `2.114.0` + `.158` 고정 → 제한적 `CODE GO`
5. R2 (08-17): CLI exact pin, clean158 기본 스택 분리, PostgREST/Supabase client smoke 통과
6. R3 / R3.1 / R3.2 (08-18): deterministic concurrency 게이트(6 시나리오 × 3회), 하네스 stdout/stderr 분리·cleanup 집계, third-finish parser 결함 수정
7. Final Log-Window Gate (08-18): run-scoped `PACKET13_GATE_START/END` 윈도 판정 도입. TAP `33/22/97/49`, concurrency 3회, crash regression 4종, PostgREST smoke 통과, current fatal 0 → **approved local `.158` + CLI `2.114.0` 범위에서 `CODE GO`**

**브라우저/Realtime B1 게이트 (handoff 문서에 아직 반영되지 않은 실행 결과)**

- 러너: `scripts/packet13-browser-b1.mjs` (시나리오 계약 `scripts/packet13-browser-b1-scenarios.mjs`, 실행 `npm run test:e2e:packet13-b1`)
- 시나리오 12개: 2인 시작 거부, 3인 이동+F5, 대기 방장 F5, 경기 중 방장 offline(60초 이상), 방장 명시적 이탈, 미완주자 이모지 거부, 관전 음소거 UI, 4인 grace+관전 F5, 5·6·7인 smoke, 8인 정원(초과 입장 거부 1회)
- 최신 실행 `[산출물]` `test-results/packet13-b1/b1.3-2026-08-19T01-19-11-669Z-7c95d293/summary.json`:
  `required=12 / passed=12 / failed=0`, contexts `53/53`, join acks `52/52`, event deliveries `90/90`, `duplicate_events=0`, `unexpected_wikipedia_requests=0`, `wiki_snapshot_429_count=0`, `fixture_remaining=0`, `exit_code=0`, log window `current_fatal=0` / `historical_fatal=39`, container·postmaster·restart 불변
- 산출물 디렉터리는 릴리스 입력이 아니라 로컬 QA 출력으로 `.gitignore`에 추가되어 있다. `[코드]` `.gitignore` 마지막 항목
- **주의**: Wikipedia 요청은 Playwright `context.route`로 fixture 응답으로 대체된다 (`scripts/packet13-browser-b1.mjs:698-788`). 따라서 "실제 Wikipedia 429 없는 snapshot smoke"는 이 게이트로 충족되지 않는다.

**현재 판정 — 단일 기준은 `docs/agent/CURRENT.md` §1이다**

> **아래 `code/10-CODE-MASTER-TODO.md` §9.8과 `qa/30-INTEGRATION-CHECKLIST.md` §21은
> 날짜가 붙은 실행 기록이지 현재 판정이 아니다.** 이전 판(2026-08-20)은 그 두 문서를
> "현재 판정"의 근거로 인용했는데, 그 인용이 **낡은 HOLD 사유를 현재 사유처럼 보이게 했다.**
> 판정의 현재 값은 `CURRENT.md` §1에서 읽고, 아래 두 문서는 **그 시점 기록으로만** 읽는다.

- **CODE: `GO`** (approved local `.158` + CLI `2.114.0` 범위). 유효 조건과 무효화 조건은
  `docs/agent/CURRENT.md` §1. `[문서]` `code/10-CODE-MASTER-TODO.md` §9.8 (2026-08-18 기록) /
  `[산출물]` B1 summary
- **RELEASE: `HOLD` — 그러나 사유가 완전히 바뀌었다.**

  | 시점 | HOLD 사유 |
  |---|---|
  | ~~2026-08-20~~ | ~~운영/linked DB 적용, Edge Function 배포, 운영 dry-run, Release A~D 승인~~ — **네 항목 전부 2026-08-28 창에서 완료됐다** (W6·W8·W5, Release A~D는 U2로 대체) |
  | ~~2026-08-29~~ | ~~**W9 미해결 4건**~~ → **2026-08-29 조사 후 2건** — `wiki-snapshot` 429 대량 재발(그룹), 관전 이모티콘 미전달. ~~RETIRE 사유 불일치~~는 수정 완료·**미배포**, ~~`username-lookup` 404~~는 **결함 아님으로 종결** |
  | **2026-09-02 (현재)** | **없음 — `RELEASE HOLD` 해제.** 남은 2건이 닫혔다(429는 배포 후 재스모크에서 502 0건, 이모티콘은 스펙 범위 밖 종결)고 **W10이 수행됐다.** 판정의 현재 값은 `CURRENT.md` §1 |

  즉 **HOLD를 만드는 층이 DB에서 프론트·Edge Function으로 옮겨갔고, 그 층도 닫혔다.**
  ~~유지보수 게이트가 켜진 채이며 사용자 노출은 0이다.~~ → **게이트는 해제됐다 (W10).**
  `[산출물]` `docs/ops/CUTOVER-LOG-2026-08-27.md` §W9·§W9-b·§W10
- ~~2026-08-20 운영 실측 이후 늘어난 릴리스 게이트 — baseline 처리, 운영 17.6 권한 거부 경로 검증,
  `finish_group_player` 배포 순서, V2 이전 3개 migration 영향도~~ →
  **4개 중 3개가 창에서 해소됐다** (baseline = W3·W4, `finish_group_player` 순서 = W0→W1→W6,
  3개 migration = W6에 포함). **남은 것은 권한 거부 경로 SIGSEGV 검증 하나**이며,
  W9에서 의도적 1회도 수행하지 않아 창 밖으로 이월됐다 (§4.4, CUTOVER-PLAN §8.2-1).
- `.104` image 또는 미승인 digest가 기본 경로로 돌아오면 즉시 `CODE NO-GO`. `[문서]` `code/13-GROUP-FINAL-GAPS.md` §9

**런타임 baseline 축의 성질 (2026-08-23 재확인)**

2026-08-23 Docker Desktop 재시작으로 로컬 `.158` 스택의 `pg_postmaster_start_time()`이
`2026-08-20 23:37:45` → `2026-08-23 14:01:28`로 바뀌었다. 컨테이너 id(`33f879e1ac23`)와
`RestartCount`(0)는 그대로이고 데이터도 무변경이다
(`supabase_migrations.schema_migrations` 12행, 내용 md5 지문 재시작 전후 동일 `[산출물]`).

**결론: 갱신할 baseline 산출물이 없다.** postmaster 시각은 **저장된 기대값이 아니다.**

- 게이트 스크립트는 실행마다 값을 **새로 측정한다** — `supabase-clean-gate.mjs`의
  `readRuntimeBaseline()`/`readPostmaster()`, `supabase-runtime-preflight.mjs:127`의
  `pg_postmaster_start_time()` `[코드]`.
- 판정은 **한 실행 안의 before/after 동일성**이다 — `evaluatePacket13RuntimeBaseline`의
  `postmasterStable`은 `before === after`만 본다. 고정된 문자열과 대조하지 않는다
  (`scripts/supabase-runtime-validation.mjs:71-82` `[코드]`).
- 나머지 용도는 로그 라인 주석이다 — `logLineContext`가 fatal marker를 postmaster 시각 이후인지로
  분류한다 (동일 파일 `:29-46`).
- 저장소에 남은 `2026-08-18 01:31:36.816875+00`은 **합성 fixture**다
  (`tests/supabaseRuntimeValidation.test.js:47`, `scripts/supabase-log-window-self-test.mjs:11,64`).
  라이브 컨테이너 측정값이 아니므로 **바꾸지 않는다.** 특히 self-test의
  `negative-postmaster-changed`는 "시각이 바뀌면 검증기가 거부해야 한다"를 확인하는 음성 테스트다.
- `code/11-REPOSITORY-AUDIT.md`의 `.158` 환경 증거 줄에 적힌 postmaster 시각은 그 시점 관찰 기록이다.
  기대값이 아니므로 소급 수정 대상이 아니다.

**실측으로 확인 (2026-08-23, 기준 커밋 `032caba`)**

| 실행 | 결과 |
|---|---|
| `npm run supabase:preflight` | **11/11 PASS.** `postmaster-stability before=2026-08-23 14:01:28.07022+00 after=(동일) restart_before=0 restart_after=0` |
| `node scripts/supabase-log-window-self-test.mjs --run-id <uuid>` | **12/12 PASS** (`negative-postmaster-changed` 포함) |
| `npm test` | **142/142** |

고정 기대값을 갖는 축은 전부 그대로 일치했다 — CLI `2.114.0`, image
`public.ecr.aws/supabase/postgres:17.6.1.158`, digest `sha256:99b1729a…`, `server_version 17.6`.
**Docker 재시작은 이 축들에 영향을 주지 않는다.** postmaster 시각 변화만으로 게이트를 다시 돌릴
이유는 없고, 돌려도 판정이 달라지지 않는다.

### 3.3 자동 테스트 실행 방법

```bash
npm test
```

`package.json`의 `test`는 `node --test`이며 `tests/` 아래 18개 테스트 파일을 실행한다. 문서에 기록된 최근 카운트는 `126/126` (`code/10-CODE-MASTER-TODO.md` §9.8). 로컬 DB 게이트는 `npm run supabase:preflight`, `npm run supabase:clean-gate`, `npm run supabase:postgrest-smoke`, 브라우저 게이트는 `npm run test:e2e:packet13-b1`이다. `[코드]` `package.json`

---

## 4. 확인 필요 (저장소에서 근거를 찾지 못한 항목)

아래는 **추측하지 않고 미확인으로 남긴** 항목이다. 다음 세션에서 사람 확인 또는 외부 접근이 필요하다.
2026-08-20 운영 읽기 전용 실측으로 해소된 항목은 `docs/ops/PROD-SNAPSHOT-2026-08-20.md` 참조로 대체했고,
**2026-08-27~28 cutover 창이 해소한 항목은 `docs/ops/CUTOVER-LOG-2026-08-27.md`의 단계를 명시했다.**

> **창이 이 절을 크게 줄였다.** §4.1의 마지막 행과 §4.4의 4개 항목 중 3개가 해소됐다.
> **대신 창이 새 미해결 4건을 만들었다** — §4.5에 등재했다. **(2026-08-29 조사로 2건으로 줄었다 — §4.5)**

### 4.1 원격 / 운영 환경

| 항목 | 상태 |
|---|---|
| `37adc69`·`450f63a`의 원격(`origin/main`) 포함 여부 | **해소 (2026-08-20) → 상태가 두 번 바뀌었다.** 2026-08-20에는 `origin/main`이 5월 상태(`e6d8eee`)라 미포함이었다. **W1·W1-a가 `main`을 `4a78a0d`로, W1-b(2026-09-02)가 `9eba7e9`로 옮겨 두 커밋 모두 포함됐다.** `feat`는 문서 커밋 `48e3f2d`로 **1커밋 앞서 있고 그것이 의도된 상태다** (2026-09-02 `ls-remote` 실측). **main push 금지는 유지되며 근거가 또 바뀌었다** — 게이트가 해제돼 **push가 곧 사용자 노출**이기 때문이다 (`AGENTS.md` §1.1). 상세: `docs/agent/CURRENT.md` §3 |
| 운영/linked Supabase 프로젝트의 실제 migration 적용 상태 | **해소 → 그 뒤 상태가 바뀌었다.** ~~미적용 11개, `schema_migrations` 부재로 CLI push 이력 자체 없음~~ 은 **2026-08-20 시점의 값**이다. **2026-08-28 창에서 11개 전량이 적용됐고 이력은 12행이다** (W3·W6·W7). 격차에 포함됐던 8/4·8/7·8/13 3개도 함께 적용됐다 → `docs/ops/CUTOVER-LOG-2026-08-27.md` §W6·§W7 |
| 운영 PostgreSQL/Supabase 런타임 버전 | **해소.** `PostgreSQL 17.6 on aarch64-unknown-linux-gnu` → `docs/ops/PROD-SNAPSHOT-2026-08-20.md` §5. 창이 바꾸지 않은 값이다. 파생 위험은 §4.4로 이관 |
| 운영 DB의 `onboarding_full_avatar` 사용 여부 | **해소.** avatar/achievement/reward 관련 테이블·컬럼 0행이므로 저장 구조 자체가 없고 업적 ID rename이 안전 → `docs/ops/PROD-SNAPSHOT-2026-08-20.md` §4. 이전 "확인 전 rename/update 금지" 제약은 해제됨 |
| `avatars` Storage 버킷의 실제 업로드 이미지 존재 여부 | **해소 (2026-08-21).** 소유자는 **`roeehd2` — 사용자 본인 계정**이다 `[사용자 확인]` (CUTOVER-PLAN §1.1 U11). 실사용자 데이터가 아니다. 객체 삭제는 cutover 범위 밖이며 `AGENTS.md` §4가 그대로 적용된다 |
| 운영 Realtime publication 구성, RLS 활성 테이블 목록, Edge Function 배포 목록 | **해소 (2026-08-28, W7·W8).** publication **4테이블**(`game_rooms`·`group_match_results`·`room_events`·`room_players`, `group_spectator_emoji_rate_limits` 미포함), RLS **14/14**(`rls_off_tables = 0`), Edge Function **`wiki-snapshot`·`single-run` 배포 완료** → `docs/ops/CUTOVER-LOG-2026-08-27.md` §W7·§W8. **남은 확인 하나**: `target-level`이 여전히 배포돼 있는지 (`--prune` 미사용은 확인됐으나 실물 미확인 — `CURRENT.md` §5.6-4) |

### 4.2 검증 게이트

| 항목 | 상태 |
|---|---|
| 실제 Wikipedia API를 사용하는 429-free snapshot smoke | **형식적 하네스는 여전히 없다.** 다만 **창이 이 경로를 운영에서 실제로 밟았다** — W9 발견 1·3이 그 결과이며 429가 실제로 터졌다. 즉 "실제 API 경로가 어떻게 실패하는가"는 더 이상 미지가 아니다. B1이 fixture 인터셉트 기반(§3.2)인 것은 그대로다 (`CURRENT.md` §5.3) |
| 모바일 viewport / 키보드 / `prefers-reduced-motion` 검증 | **미충족.** `qa/30-INTEGRATION-CHECKLIST.md` §10 전 항목 미체크. 창에서도 수행하지 않았다 (CUTOVER-PLAN §8.2-4) |
| 1:1 2브라우저 수동 검증, 실제 60초 재접속 시나리오 | **미충족.** W9 항목 4가 미수행이다. 다만 **4인 그룹 다중 세션은 창에서 실제로 돌렸다**(발견 3·6의 관측 경로) → CUTOVER-PLAN §8.2-2 |
| `historical_fatal` 로그 39건의 근본 원인 | `.158` 로그의 window 밖 startup recovery / `unexpected EOF` 증거로 보존만 되어 있고 원인 미확정 (`code/10-CODE-MASTER-TODO.md` §9.8). 창과 무관 |
| ~~Packet 13 변경의 commit/push 시점~~ | **해소.** 2026-08-20에 `339fb77`로 커밋됐고, 2026-08-27~28 창의 W1·W1-a가 `origin/main`까지 올렸다 |

### 4.3 스펙 공백

| 항목 | 상태 |
|---|---|
| 레벨 보상 / 꾸미기 아트의 구체 외형·수량 | `01-CONFIRMED-SPEC.md` §7.3, §10이 "제작 단계에서 정한다"로 위임. 확정값 없음 |
| 히든 업적 13개의 개별 판정 조건 | 이름만 확정(§9.2). 세부 판정은 `code/16-ACHIEVEMENTS-REWARDS.md`로 위임 — 이번 조사에서는 해당 문서 전문을 확인하지 않았다 |
| 디자인 확정 여부 (`design/20`~`design/22`) | `code/10-CODE-MASTER-TODO.md` §2 순서 7이 `[~] 디자인 작업 별도 진행 중`. 확정 시안 산출물이 저장소에 없다 (`Wiki 디자인 와이어프레임 1차.zip`은 저장소 밖 자료로 참조되며 `.gitignore`가 `*.zip`을 제외) |
| 아이템 ID 확정값 | `code/14-DUEL-ITEMS.md` §2가 "ID는 예시다. 현재 코드 ID와 마이그레이션 호환성을 감사한 뒤 결정한다"로 명시 |
| `docs/WIKI_RACE_GROUP_DB_SECURITY_SPEC.md` 갱신 주체·시점 | 15분/3분 stale 값이 남아 있으나 폐기·갱신 결정 기록이 없다 (§2.3 참고) |

### 4.4 운영 스냅샷(2026-08-20)이 새로 만든 항목 — **4건 중 3건 해소 (2026-08-28 창)**

전부 `docs/ops/PROD-SNAPSHOT-2026-08-20.md` 실측에서 파생된 항목이었다. **원 성격 분류를 남기고
창이 무엇을 어떻게 닫았는지 병기한다.**

| 항목 | 2026-08-20 판정 | 지금 |
|---|---|---|
| `supabase_migrations.schema_migrations` 부재 → 첫 push 시 baseline 재적용 위험 | **cutover 차단 요소.** 운영 스키마가 CLI 이력 밖에서 구성돼 첫 `db push`가 `20260730170602_baseline_remote_schema`를 다시 적용하려 할 수 있다. baseline 처리 절차를 선행 단계로 추가해야 한다 | **해소 (W3·W4·W5).** `migration repair --status applied 20260730170602 --linked` exit 0 → 이력 1행 / `statement_count` 250 확인 → dry-run pending **11개**(12개가 아니다 = baseline 재적용 없음). 근거: `CUTOVER-LOG-2026-08-27.md` §W3·§W4·§W5 |
| 운영 PostgreSQL 17.6 + 권한 거부 경로 SIGSEGV | **릴리스 게이트 추가 대상.** `20260814093000_server_authority_cutover_v2`가 `public`·`anon` 실행 권한을 회수하므로 cutover 직후 권한 거부 경로 빈도가 증가하고, 이는 08-14 Crash Diagnostic의 signal 11 경로와 겹친다. **로컬 게이트로 대체 불가** | **미해소 — 이 절에서 유일하게 남은 항목.** W6가 그 migration을 실제로 적용했으므로 **위험 조건은 이제 성립한다.** W9에서 의도적 1회 확인을 하기로 돼 있었으나 **수행하지 않았다.** 창 밖 관측으로 이월 (CUTOVER-PLAN §8.2-1, `CURRENT.md` §1) |
| `finish_group_player`가 cutover에서 삭제됨 → 운영 클라이언트 파손 가능 | **배포 순서 설계 필요.** 이 함수는 현재 운영에만 존재하고 로컬 목록에는 없다. 운영 클라이언트가 호출 중이면 cutover 시점에 즉시 깨진다 | **해소.** 순서를 **W0(게이트 on) → W1(프론트 배포) → W6(삭제)** 로 설계해 실행했고, 구버전 세션 drain은 유지보수 게이트가 담당했다(U3). W7에서 `finish_group_player`·`update_group_progress` 둘 다 `null` 확인. **파손은 발생하지 않았다.** 근거: `CUTOVER-LOG-2026-08-27.md` §W1·§W6·§W7 |
| 운영 격차가 V2 이전 3개 migration(8/4·8/7·8/13)까지 포함 | **cutover 범위 재산정.** `group_security_hardening_phase1`, `group_match_lifecycle_phase2a`, `group_security_phase2c`가 운영에 미적용이며 기존 데이터 영향은 미검토다. Release A 범위를 다시 계산해야 한다 | **해소.** U2로 Release 분할 자체가 대체됐고 3개가 **11개 전량 적용 집합에 포함**되어 W5가 목록을 검증하고 W6가 적용했다. Phase 2C의 `user_profile_stats` 전량 재집계 검토는 CUTOVER-PLAN F8·§5.4에 있다. **phase1·phase2a의 개별 영향도 문서는 여전히 없다** |

### 4.5 2026-08-27~28 창이 새로 만든 항목

**창은 §4.4를 줄였지만 새 미해결을 만들었다.** ~~이 4건이 지금 `RELEASE HOLD`의 전부다.~~
→ **2026-09-02에 4건이 전부 종결됐고 `RELEASE HOLD`도 해제됐다.**
목록·착수 순서의 단일 기준은 **`docs/agent/CURRENT.md` §5.5**이며, 관측 전문은
`docs/ops/CUTOVER-LOG-2026-08-27.md` §W9(창 안)·§W9-b(재스모크)에 있다.
**아래 표는 2026-08-29 시점 상태로 보존한다** — 최종 판정은 표 뒤의 종결 블록에 있다.

| # | 항목 | 원인 | 게이트 해제 차단 |
|---|---|---|---|
| 3 | `wiki-snapshot` 502 대량 재발 (4인 그룹, 준비 버튼 11회 연속 실패) | **구조 확정.** dedup 후에도 문서 1건당 62요청이고 **참가자 수만큼 곱해진다** | **예** |
| 4 | ~~"유효하지 않은 RETIRE 사유" — 결과 화면에서 로비 나가기 실패~~ | ~~미확정~~ → **확정·수정 완료 (2026-08-29). 미배포.** `onClick` 직접 바인딩으로 React SyntheticEvent가 사유 인자에 주입된 것 | **배포까지 예** |
| ~~5~~ | ~~`username-lookup` 404~~ | ~~미확정. U9와 같은 축일 가능성~~ → **결함 아님으로 종결 (2026-08-29).** 아이디 미존재 시의 의도된 응답이며 프론트가 이미 처리한다. **U9와는 별개 축이었다** | **아니오** |
| 6 | 관전 이모티콘이 다른 참가자에게 전달되지 않음 | 미확정. publication은 W7에서 4테이블 정상 확인 — publication 누락은 원인이 아니다. **2026-08-29: 렌더 경로 부재 확정, 스펙 위반 여부는 미확정** | 조사 필요 |

~~**발견 3은 `CURRENT.md` §5.4-1(스냅샷 재사용)과 같은 뿌리다**~~ → **2026-08-29 정정.**
**§5.4-1은 대기실 준비 버튼 502를 고치지 못한다** — 그 경로의 문서는 참가자마다 distinct라
전부 cold miss다. 우선 항목은 **§5.4-2(`fetchRevisionIds` 제거, 62→32)** 로 바뀐다.
근거는 `CURRENT.md` §5.5-3.

> **2026-08-29 요약 — 이 표의 4건은 2건이 됐다.** 실제 미해결은 3·6이고, 4는 배포 대기,
> 5는 종결이다. **단일 기준은 여전히 `CURRENT.md` §5.5다.**
>
> **2026-09-02 최종 — 4건 전부 종결됐다.**
>
> | # | 최종 판정 | 근거 |
> |---|---|---|
> | **3** | **해소.** 감축을 프론트(W1-b) → Edge Function(W8-b) 순으로 배포한 뒤 4인 재스모크에서 **502 0건.** 대기실 124요청 통과, 게임 진입 31요청 | CUTOVER-LOG §W8-b·§W9-b |
> | **4** | **해소.** `579a338` 배포(W1-b) 후 결과 화면 로비 나가기 정상 확인 | §W1-b·§W9-b |
> | ~~5~~ | **결함 아님 — 종결 (2026-08-29)** | `CURRENT.md` §5.5-5 |
> | ~~6~~ | **스펙 범위 밖 — 종결 (2026-09-02)** `[사용자 판정]`. 스펙이 수신자를 규정하지 않는다. **관전자 2명 전달 여부는 여전히 미검증** | `CURRENT.md` §5.5-6·§5.0 A3 |
>
> **그리고 W10이 수행됐다** — 유지보수 게이트 해제, 서비스 재개.
> **다음 작업 목록은 `CURRENT.md` §5.0이다.**

**창이 남긴 절차 공백 2건도 함께 기록한다** (CUTOVER-LOG §0.0·§6.3):
`§0.0`의 복원 전제 3항목(Docker·승인 이미지·IPv4 연결)에 **당일 확인 기록이 없고**,
**W6 종료 시각이 기록되지 않아** 되돌릴 수 없는 단계의 운영 소요를 얻지 못했다.

---

## 5. 다음 세션 권장 진입점

> **작업 순서의 단일 기준은 `docs/agent/CURRENT.md` §5다.** 이 절은 배경 설명으로만 남긴다.
> Packet 13은 2026-08-20에 `339fb77`로 커밋됐고, **cutover는 2026-08-27~28에 W0~W9까지 실행됐다.**
> 이전 판의 1~3번은 그 과정에서 전부 종료됐으므로 아래로 교체한다.

1. ~~**`docs/agent/CURRENT.md` §5.5의 W9 미해결 항목이 1순위다.**~~
   → **2026-09-02: 4건이 전부 종결됐고 W10(게이트 해제)까지 끝났다.**
   **다음 작업 목록은 `docs/agent/CURRENT.md` §5.0**이며,
   재스모크가 남긴 잔여 관찰 3건 + 창 이월 6건 + **미구현 패킷 14~17**로 재작성돼 있다.
2. ~~§4.4의 네 항목은 cutover 계획 자체를 바꾼다. Release A~D 재설계 전에는 운영 적용을 시작하지
   않고 `origin/main`에 push하지 않는다.~~ → **cutover는 U2 방식으로 이미 실행됐다.**
   **`origin/main` push 금지는 유지되지만 근거가 또 바뀌었다** — ~~"운영에 RPC가 없어서"~~ →
   ~~"유지보수 게이트가 유일한 방패이기 때문"~~ → **"게이트가 해제돼 막아 주는 것이 없기
   때문"** 이다. 승인 시 확인할 것은 **"이 변경을 실사용자에게 지금 노출해도 되는가"** 다
   (`AGENTS.md` §1, §1.1).
3. ~~§4.1에 남은 읽기 전용 확인 항목을 해소한다.~~ → **`avatars` 소유자(U11), publication,
   RLS, Edge Function 배포 목록은 전부 해소됐다.** 남은 것은 `target-level` 실물 확인 하나다
   (`CURRENT.md` §5.6-4).
4. **문서 정합 작업은 2026-08-29에 대부분 끝났다** — 이 문서를 포함해 6개 문서를 갱신·봉인했다.
   ~~**운영 재조회가 필요한 2건만 남았다**~~ → **2026-09-02에 그중 하나가 닫혔다.**
   **새 운영 스냅샷은 작성됐다 — `docs/ops/PROD-SNAPSHOT-2026-09-02.md`가 현재 기준이고
   `PROD-SNAPSHOT-2026-08-20.md`는 역사 기록이다.** 남은 것은
   **`target-level` Edge Function 실물 확인**과
   `qa/30-INTEGRATION-CHECKLIST.md` §22(새 게이트 기록) 작성이다 — §21은 봉인만 했다.
   목록은 `CURRENT.md` §5.6.
5. `code/10-CODE-MASTER-TODO.md` §2의 순서 3(1:1·아이템전) 이후 패킷은 **미구현**이므로, 새 기능 착수 전 XP·업적 이벤트 계약(같은 문서 §4·§5 공통 TODO)을 먼저 확정한다.
6. `docs/WIKI_RACE_GROUP_DB_SECURITY_SPEC.md`는 **2026-08-29에 봉인 헤더를 붙였다** (시간 규칙
   15분/3분 + 운영 상태 서술 양쪽). 본문 정정은 여전히 미수행이다.
