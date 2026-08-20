# Wiki Race 2.0 인수인계 (Claude 세션용) — 초안

작성일: 2026-08-20
갱신: 2026-08-20 — 상시 가드레일을 `AGENTS.md`로 분리, 운영 실측(`docs/ops/PROD-SNAPSHOT-2026-08-20.md`) 반영
작성 방식: 저장소 읽기 전용 조사 (코드 수정·commit·push 없음). 운영 DB에는 접근하지 않았고, 운영 수치는 전달받은 스냅샷 문서를 근거로 인용한다.
조사 기준: 브랜치 `feat/group-final-gaps`, HEAD `450f63a` (`feat: complete server authority v2 cutover`)

## 0. 이 문서의 규칙

- 모든 항목에 **근거 파일 경로**를 붙인다. 경로가 없는 항목은 이 문서에 넣지 않는다.
- 근거 종류를 구분한다.
  - `[코드]` 실제 소스·마이그레이션·테스트에서 확인
  - `[문서]` 저장소 안 handoff/스펙 문서에서만 확인 (코드로 재확인하지 않음)
  - `[산출물]` 테스트 실행 결과 파일에서 확인
- 저장소에서 확인되지 않는 것은 추측하지 않고 §4 `확인 필요`로만 기록한다 (상시 규칙: `AGENTS.md` §5).
- 단일 기준 문서는 `wiki-race-2.0-handoff/01-CONFIRMED-SPEC.md`다. 다른 문서와 충돌하면 이 문서를 우선한다.
- **상시 금지·의무 사항은 이 문서가 아니라 `AGENTS.md`에 있다.** 이 문서는 인계 정보(현재 상태·근거·미확인 항목)만 담는다. 핸드오프를 첨부하지 않은 세션에서도 가드레일이 적용되도록 분리했다.
- 운영 환경 실측 기록은 `docs/ops/PROD-SNAPSHOT-2026-08-20.md`다. 특정 시점 관찰이므로 운영에 변경이 가해지면 무효이며, 갱신 시 새 날짜 파일을 만든다.

### 0.1 저장소 상태 (조사 시점)

- 브랜치: `feat/group-final-gaps`. 최근 커밋은 `450f63a`, `37adc69`, `aa756e1`, `8a77e53`, `94f422b`.
- Packet 13(그룹 최종 차이)과 로컬 런타임 게이트 관련 변경은 **전부 미커밋 작업 트리 상태**다. `git status`에서 `supabase/migrations/20260814103000_group_final_gaps_v13.sql`, `20260814113000_group_final_gaps_v13_hardening.sql`, `20260814123000_group_spectator_emoji_atomicity_fix.sql`, `services/groupSpectatorService.js`, `scripts/supabase-*.mjs`, `scripts/packet13-browser-b1*.mjs`, `wiki-race-2.0-handoff/`가 untracked/modified로 확인된다.
- 상시 가드레일은 2026-08-20에 저장소 루트 `AGENTS.md`로 분리했다(신규 파일, 그 이전에는 없었음). `CLAUDE.md`는 없고 `.agents/`는 빈 디렉터리다.

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

### 1.4 배포 릴리스 게이트 (확정 절차)

`Release A`(additive schema/RPC) → `Release B`(Edge Functions) → `Release C`(V2 프론트) → `Release D`(최종 breaking cutover)의 4단계 승인 절차와 각 단계 명령이 확정되어 있다.
근거: `[문서]` `wiki-race-2.0-handoff/code/18-SERVER-AUTHORITY-V2-IMPLEMENTATION.md` "적용 순서".

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

### 3.1 서버 권위 V2 — 커밋 완료, 운영 미적용

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
- 운영 적용 상태: **미적용 (2026-08-20 실측 확인)**. 운영에는 `supabase_migrations.schema_migrations`가 존재하지 않아 CLI push 이력 자체가 없고, 로컬 기준 미적용 migration은 V2 5개를 포함해 총 11개다. `[산출물]` `docs/ops/PROD-SNAPSHOT-2026-08-20.md` §1 / `[문서]` `code/18-SERVER-AUTHORITY-V2-IMPLEMENTATION.md`, `code/10-CODE-MASTER-TODO.md` §2 (순서 1 = `[~]`)
- 운영 `public` 스키마 함수는 7개뿐이고 그중 `finish_group_player`는 운영 전용(구버전, 클라이언트 값 신뢰)이다. V2 RPC 30개는 운영에 없다. `[산출물]` `docs/ops/PROD-SNAPSHOT-2026-08-20.md` §2

### 3.2 Packet 13 (그룹 최종 차이) — 코드 완료, 미커밋, 로컬 게이트 통과 / 릴리스 보류

**코드 구현 (모두 untracked 또는 미커밋 수정)**

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

**현재 판정 (저장소 근거 기준)**

- CODE: approved local `.158` + CLI `2.114.0` 범위에서 `GO`. `[문서]` `code/10-CODE-MASTER-TODO.md` §9.8 / `[산출물]` B1 summary
- RELEASE: `HOLD`. 남은 게이트 — 운영/linked DB 적용, Edge Function 배포, 운영 dry-run, Release A~D 승인. `[문서]` `code/10-CODE-MASTER-TODO.md` §9.8, `qa/30-INTEGRATION-CHECKLIST.md` §21
- 2026-08-20 운영 실측 이후 릴리스 게이트가 늘어났다. baseline 처리, 운영 17.6 권한 거부 경로 검증, `finish_group_player` 배포 순서, V2 이전 3개 migration 영향도가 추가 선행 조건이다. → §4.4
- `.104` image 또는 미승인 digest가 기본 경로로 돌아오면 즉시 `CODE NO-GO`. `[문서]` `code/13-GROUP-FINAL-GAPS.md` §9

### 3.3 자동 테스트 실행 방법

```bash
npm test
```

`package.json`의 `test`는 `node --test`이며 `tests/` 아래 18개 테스트 파일을 실행한다. 문서에 기록된 최근 카운트는 `126/126` (`code/10-CODE-MASTER-TODO.md` §9.8). 로컬 DB 게이트는 `npm run supabase:preflight`, `npm run supabase:clean-gate`, `npm run supabase:postgrest-smoke`, 브라우저 게이트는 `npm run test:e2e:packet13-b1`이다. `[코드]` `package.json`

---

## 4. 확인 필요 (저장소에서 근거를 찾지 못한 항목)

아래는 **추측하지 않고 미확인으로 남긴** 항목이다. 다음 세션에서 사람 확인 또는 외부 접근이 필요하다.
2026-08-20 운영 읽기 전용 실측으로 해소된 항목은 `docs/ops/PROD-SNAPSHOT-2026-08-20.md` 참조로 대체했다.

### 4.1 원격 / 운영 환경

| 항목 | 상태 |
|---|---|
| `37adc69`·`450f63a`의 원격(`origin/main`) 포함 여부 | **해소 (2026-08-20).** `origin/main`에는 미포함(HEAD `e6d8eee` "0529백업", 5월 상태). 같은 날 `origin/feat/group-final-gaps`로 push해 `f1e61fa`까지 원격 백업됨. 상세는 `docs/agent/CURRENT.md` §3. **`origin/main`은 Vercel 프로덕션 배포와 연동되어 있어 cutover 계획 확정 전 main push가 금지된다 (`AGENTS.md` §1.1)** |
| 운영/linked Supabase 프로젝트의 실제 migration 적용 상태 | **해소.** 미적용 11개, `supabase_migrations.schema_migrations` 부재로 CLI push 이력 자체 없음 → `docs/ops/PROD-SNAPSHOT-2026-08-20.md` §1. 격차는 V2 5개에 더해 8/4·8/7·8/13 3개를 포함한다 |
| 운영 PostgreSQL/Supabase 런타임 버전 | **해소.** `PostgreSQL 17.6 on aarch64-unknown-linux-gnu` → `docs/ops/PROD-SNAPSHOT-2026-08-20.md` §5. 파생 위험은 §4.4로 이관 |
| 운영 DB의 `onboarding_full_avatar` 사용 여부 | **해소.** avatar/achievement/reward 관련 테이블·컬럼 0행이므로 저장 구조 자체가 없고 업적 ID rename이 안전 → `docs/ops/PROD-SNAPSHOT-2026-08-20.md` §4. 이전 "확인 전 rename/update 금지" 제약은 해제됨 |
| `avatars` Storage 버킷의 실제 업로드 이미지 존재 여부 | **부분 해소.** 객체 1개·소유자 1명 존재 → `docs/ops/PROD-SNAPSHOT-2026-08-20.md` §3. **남은 확인**: 소유자가 실제 사용자인지 개발 테스트 계정인지 식별(§8 후속 쿼리 미실행). 삭제·변환은 `AGENTS.md` §4에 따라 금지 |
| 운영 Realtime publication 구성, RLS 활성 테이블 목록, Edge Function 배포 목록 | **미확인.** 스냅샷 §8이 미실행 항목으로 명시 |

### 4.2 검증 게이트

| 항목 | 상태 |
|---|---|
| 실제 Wikipedia API를 사용하는 429-free snapshot smoke | B1은 fixture 인터셉트 기반(§3.2)이라 미충족 |
| 모바일 viewport / 키보드 / `prefers-reduced-motion` 검증 | `qa/30-INTEGRATION-CHECKLIST.md` §10 전 항목 미체크. 코드에도 검증 산출물 없음 |
| 1:1 2브라우저 수동 검증, 실제 60초 재접속 시나리오 | `code/10-CODE-MASTER-TODO.md` §6 미체크. B1 게이트는 그룹 전용 |
| `historical_fatal` 로그 39건의 근본 원인 | `.158` 로그의 window 밖 startup recovery / `unexpected EOF` 증거로 보존만 되어 있고 원인 미확정 (`code/10-CODE-MASTER-TODO.md` §9.8) |
| Packet 13 변경의 commit/push 시점 | 모든 문서가 "commit/push하지 않는다"로 기록. 언제 커밋할지에 대한 결정 기록이 저장소에 없다 |

### 4.3 스펙 공백

| 항목 | 상태 |
|---|---|
| 레벨 보상 / 꾸미기 아트의 구체 외형·수량 | `01-CONFIRMED-SPEC.md` §7.3, §10이 "제작 단계에서 정한다"로 위임. 확정값 없음 |
| 히든 업적 13개의 개별 판정 조건 | 이름만 확정(§9.2). 세부 판정은 `code/16-ACHIEVEMENTS-REWARDS.md`로 위임 — 이번 조사에서는 해당 문서 전문을 확인하지 않았다 |
| 디자인 확정 여부 (`design/20`~`design/22`) | `code/10-CODE-MASTER-TODO.md` §2 순서 7이 `[~] 디자인 작업 별도 진행 중`. 확정 시안 산출물이 저장소에 없다 (`Wiki 디자인 와이어프레임 1차.zip`은 저장소 밖 자료로 참조되며 `.gitignore`가 `*.zip`을 제외) |
| 아이템 ID 확정값 | `code/14-DUEL-ITEMS.md` §2가 "ID는 예시다. 현재 코드 ID와 마이그레이션 호환성을 감사한 뒤 결정한다"로 명시 |
| `docs/WIKI_RACE_GROUP_DB_SECURITY_SPEC.md` 갱신 주체·시점 | 15분/3분 stale 값이 남아 있으나 폐기·갱신 결정 기록이 없다 (§2.3 참고) |

### 4.4 운영 스냅샷(2026-08-20)이 새로 만든 항목

전부 `docs/ops/PROD-SNAPSHOT-2026-08-20.md` 실측에서 파생된 항목이다. 아래 성격 분류는 스냅샷 §7의 기재를 그대로 따른다.

| 항목 | 성격 / 남은 결정 |
|---|---|
| `supabase_migrations.schema_migrations` 부재 → 첫 push 시 baseline 재적용 위험 | **cutover 차단 요소.** 운영 스키마가 CLI 이력 밖에서 구성됐으므로 첫 `db push`가 `20260730170602_baseline_remote_schema`를 다시 적용하려 할 수 있다. `migration repair --status applied 20260730170602` 등 baseline 처리 절차를 cutover 계획의 **선행 단계**로 추가해야 한다. 근거: 스냅샷 §1, §7 |
| 운영 PostgreSQL 17.6 + 권한 거부 경로 SIGSEGV | **릴리스 게이트 추가 대상.** `20260814093000_server_authority_cutover_v2`가 `public`·`anon` 실행 권한을 회수하므로 cutover 직후 권한 거부 경로 빈도가 증가하고, 이는 08-14 Crash Diagnostic에서 signal 11이 관측된 경로와 겹친다. 로컬 `CODE GO`는 승인 이미지 `.158` + CLI `2.114.0` 범위 한정이므로 **로컬 게이트로 대체 불가**. 단 로컬 `.104`/`.158`은 CLI 개발용 이미지이고 운영은 별도 관리형 배포판이므로 동일 빌드 여부는 미확인 — 확정 위험이 아니라 **검증 대상**으로 분류한다. 근거: 스냅샷 §5, §7 |
| `finish_group_player`가 cutover에서 삭제됨 → 운영 클라이언트 파손 가능 | **배포 순서 설계 필요.** 이 함수는 현재 운영에만 존재하고 로컬 목록에는 없다. 운영 클라이언트가 호출 중이면 cutover 시점에 즉시 깨진다. 프론트 배포와 migration 적용의 순서·동시성·다운타임 허용 여부를 결정해야 한다 (`code/18-SERVER-AUTHORITY-V2-IMPLEMENTATION.md`의 Release C → Release D 순서와 함께 검토). 근거: 스냅샷 §2, §7 |
| 운영 격차가 V2 이전 3개 migration(8/4·8/7·8/13)까지 포함 | **cutover 범위 재산정.** `group_security_hardening_phase1`, `group_match_lifecycle_phase2a`, `group_security_phase2c`가 운영에 미적용이다. 이 3개가 운영 기존 데이터에 미치는 영향은 미검토이며, Release A 범위 정의를 이 격차 기준으로 다시 계산해야 한다. 근거: 스냅샷 §1, §7, §8 |

---

## 5. 다음 세션 권장 진입점

> **작업 순서의 단일 기준은 `docs/agent/CURRENT.md` §5다.** 이 절은 배경 설명으로만 남긴다.
> Packet 13은 2026-08-20에 `339fb77`로 커밋됐으므로 이전 초안의 "커밋 범위 결정" 항목은 종료됐다.

1. `docs/agent/CURRENT.md` §5의 순서(baseline 대응 확인 → cutover 재작성 → `avatars` 소유자 확인 → B2)를 따른다.
2. §4.4의 네 항목은 cutover 계획 자체를 바꾼다. Release A~D 재설계 전에는 운영 적용을 시작하지 않고 `origin/main`에 push하지 않는다 (`AGENTS.md` §1, §1.1).
3. §4.1에 남은 읽기 전용 확인 항목(`avatars` 소유자, Realtime publication, RLS 활성 테이블, Edge Function 배포 목록)을 해소한다.
4. `code/10-CODE-MASTER-TODO.md` §2의 순서 3(1:1·아이템전) 이후 패킷은 **미구현**이므로, 새 기능 착수 전 XP·업적 이벤트 계약(같은 문서 §4·§5 공통 TODO)을 먼저 확정한다.
5. `docs/WIKI_RACE_GROUP_DB_SECURITY_SPEC.md`의 15분/3분 기재를 20분/2분으로 정정하거나 supersede 표시를 붙인다.
