# SF-A3 / SF-M2 최소 변경 검토

> 후속 작업에서 안전하게 확정한 회수 권한을 새 migration으로 작성했다(미적용). 아래 "회수 migration 미작성"·472/472는 최초 검토 시점의 기록이다. 최신 상태는 [SEC-M2-RANDOM-XP-2026-10-06.md](SEC-M2-RANDOM-XP-2026-10-06.md)와 CURRENT.md 상단을 따른다.

기준: `e4fb483` + 미커밋 작업 트리, 2026-10-06. 운영 DB 접속·적용·배포·commit·push 없음.
브랜치 `feat/group-final-gaps`, 시작 시 tracked clean. 기존 미추적 파일은 보존했다.

## SF-A3

**로컬 코드 경계 확인, 운영 완료는 미확인.** A3 마지막 기록은 운영 미적용이다 (`CURRENT.md` (25)).

- `[코드]` `20261004110000_duel_players_rls_v1.sql`: 참가자 여부 AND (본인 OR duel starting/playing 이외). 방장 우회 없음. finished는 상대 행 공개, group은 제외. 권한을 우회하는 프론트 수정으로 대체할 수 없는 DB 경계다.
- `[코드]` `20261004100000_duel_players_view_v1.sql`: 비참가자 빈 배열, group 거부, 진행 중 상대 path 3키 제거. current_title·move_count는 확정 스펙 §4.1의 공개 정보다. 전체 상대 객체를 UI에서 참조한다는 사실만으로 유출은 아니다. 목표는 14c 공통 목표다.
- `[코드]` `services/multiplayerService.js`: fetchRoomPlayers와 초기화 fallback 모두 마스킹 RPC. `MultiplayerGamePage.jsx`의 recoverGame(F5/재접속), 진행 신호, heartbeat, 강제 이동 재조회도 같은 함수. raw SELECT fallback 없음.
- `[코드]` `MultiplayerGamePage.jsx`: 경기 room_players 구독을 user_id 본인으로 축소. payload는 버전 신호로만 쓰고 데이터는 RPC 재조회. 다른 방의 본인 이벤트가 오더라도 현재 roomId RPC만 읽는다. 상대 진행은 room_events.duel_progress + 주기 재조회. 종료 후 결과는 기존 RPC·결과 컴포넌트 흐름 유지.
- `[코드]` `RoomPage.jsx`: 대기실 구독은 room_id 유지. 대기실은 상대 참가/퇴장/목표 변경을 받아야 하며 payload 행을 상태에 넣지 않는다. 시작 전 양쪽 행 공개는 계약이다. starting/playing 전환 이후 상대 이벤트 차단은 A3 RLS 책임이다.
- `[코드]` 그룹 raw SELECT/Realtime은 `groupMultiplayerService.js`, `GroupRoomPage.jsx`, `GroupGamePage.jsx`에 남는다. 그룹 관전 계약이라 제거하지 않았다. duel URL을 그룹 읽기로 바꾸어도 DB 정책은 mode를 확인한다.
- `[코드]` M1은 이동·아이템 응답 상대 경로를 제거하고 game_move_events는 본인만 공개한다. 경기 결과·이동·XP·업적·아이템·room event의 프론트 직접 INSERT/UPDATE/DELETE 없음 (`services/`, `pages/`, `authContext.jsx` 전수 대조).
- Realtime 자체 차단은 SELECT RLS에 의존한다. DELETE는 일반 UPDATE와 동일하게 취급할 수 없으므로 실제 프레임 확인이 필요하다. 공식 설명: https://supabase.com/docs/guides/realtime/postgres-changes (DELETE + RLS는 old PK만 공개). 이번 세션은 DB/Realtime 실측을 하지 않았다.
- `[문서]` M1 이전 game_mutation_requests 응답 재생 잔재는 요청자 본인 한정으로 TRACKS §8-SEC-⑥에 기록되어 있다. 운영 적용 시 진행 경기/기존 요청의 잔재 확인 필요. 임의 데이터 삭제 없음.

## SF-M2 유지/회수 표

아래는 **저장소 계약 판정**이다. 실제 운영 grant/컬럼 ACL/함수 overload는 조회 전 단정하지 않는다.
REVOKE는 회수 후보이며 이 세션에서 DB에 적용했다는 뜻이 아니다.

| 권한/대상 | 판정 | 이유 / 근거 | 조치 |
|---|---|---|---|
| profiles SELECT | KEEP | 프로필·랭킹 사용, baseline public 읽기 | 기존 유지 |
| profiles authenticated UPDATE 3컬럼 | KEEP | nickname, profile_image_url, updated_at만 C3 허용; ProfilePage 닉네임 수정 | total_xp UPDATE 금지 유지 (`20260928090000`) |
| profiles anon/auth INSERT·DELETE | REVOKE | 쓰기 정책·클라이언트 사용 없음; username-signup은 서버 service_role INSERT | prod ACL 확인 후 forward migration 후보 |
| room_players authenticated SELECT | KEEP | 본인 원본·대기실·종료 결과·그룹 관전 필요 | A3 RLS 적용 여부 확인 |
| room_players DML·game_rooms DML·match_history/game_records DML | KEEP | `20260814093000`에서 이미 회수; 서버 RPC가 쓴다 | 재부여 금지, prod 유효 권한 확인 |
| room_players/game_records/match_history 죽은 쓰기 정책 | UNUSED / DELETE CANDIDATE | DML grant 없어 발동 불가, TRACKS §8-SEC-④ | 정책 삭제는 prod 확인·로컬 DB 검증 뒤, 데이터/테이블 삭제 아님 |
| room_events authenticated SELECT | KEEP | duel_progress·아이템·그룹 이모지 수신 | M1의 anon SELECT 및 양 역할 DML 회수 유지 |
| duel_progress | KEEP | 테이블이 아니라 room_events.event_type; payload userId/version/time 신호 | 별도 테이블 grant 만들지 않음 |
| analytics_events INSERT | NEEDS PROD CONFIRMATION | trackEvent는 게스트/회원 사용; baseline WITH CHECK true는 임의 메타데이터/ID 삽입 허용 | R6 실태·수집 정책 확인; 익명 수집 임의 차단 금지 |
| analytics_events UPDATE·DELETE | REVOKE | 프론트 사용/정책 없음 | prod ACL 확인 후 회수 후보 |
| daily_challenges SELECT anon/auth | KEEP | 오늘 코스 RPC 실패 시 실제 fallback | 쓰기만 회수 후보 |
| daily_challenges·daily_challenge_pool·picked DML | REVOKE | client 쓰기 없음, definer 오늘 코스 함수가 내부 사용 | prod R7/R8 확인 후 회수 후보 |
| target_candidates SELECT | NEEDS PROD CONFIRMATION | fetchRandomAiTarget helper 자체도 현재 호출 없음; is_active/usage_count는 baseline에 없음 | prod R5 컬럼·외부 소비자 확인; 읽기 임의 차단 금지 |
| target_candidates DML | REVOKE | 쓰기 정책 없음; markAiTargetUsed 호출 0 | 사용하지 않는 UPDATE helper 제거; prod 회수 후보 |
| target_candidates_id_seq anon/auth | REVOKE | client INSERT 없음 | prod 확인 후 USAGE/SELECT/UPDATE 회수 후보 |
| wiki_pages/wiki_page_snapshots/wiki_snapshot_links SELECT | KEEP | 공개 문서 데이터, authenticated 읽기만 명시; 스냅샷 쓰기는 서버 RPC | 클라이언트 쓰기 금지 유지 (`20260814090000`) |
| game_move_events SELECT | KEEP | M1 본인 행만, 상대 이동 경로 공개 금지 | prod 정책 확인 |
| game_mutation_requests | KEEP | client 권한 0, RPC 멱등 저장소 | 예전 응답 잔재는 별도 확인 |
| single_game_runs / group_match_results / group_match_history | KEEP | 서버 권위/결과 읽기; 클라이언트 직접 쓰기 없음 | 기존 정책·grant 유지 |
| xp_ledger | KEEP | 본인 SELECT만, 지급은 서버 | `20260903090000` 유지 |
| duel_item_grants/events | KEEP | 본인 grant/참가자 event SELECT, 사용 RPC만 쓰기 | `20260904090000` 유지 |
| reward_catalog/user_reward_inventory/user_profile_equipment | KEEP | 공개 활성 보상/본인 소유/장착 SELECT; 쓰기는 장착 RPC | `20261001090000` 유지 |
| achievement_definitions/tiers, user_achievement_progress/unlocks/marks, reward_bundles/items/grants, user_visited_documents | KEEP | 16a·16b 직접 client 권한 0, 읽기도 RPC 경유 | `20261002090000`, `20261002100000` 유지 |
| public 함수 기본 EXECUTE / supabase_admin 기본 ACL | NEEDS PROD CONFIRMATION | 새 함수는 PUBLIC EXECUTE 기본값; postgres 기본 테이블 ACL 회수와 별개 | 신규 함수 explicit revoke 필수, 기존 전체 기본값 임의 변경 없음 |

## 클라이언트 RPC 전체 대조

직접 호출은 services의 `.rpc()`와 동적 applyDuelMoveV2의 두 분기를 포함한다.
아래 authenticated KEEP은 anon 불필요, 해당 migration에서 PUBLIC/anon 회수 + authenticated/service_role 실행 계약이다.

| 역할 / 판정 | RPC (호출 파일별) |
|---|---|
| authenticated KEEP — multiplayerService.js | create_duel_room_v2, join_duel_room_v2, get_duel_room_players_v1, set_duel_target_v2, leave_duel_room_v2, start_duel_room_v2, initialize_duel_player_v2, apply_duel_move_v2, apply_duel_swap_v2, heartbeat_duel_v2, finalize_duel_if_expired |
| authenticated KEEP — groupMultiplayerService.js | create_group_room, join_group_room, leave_group_waiting_room, submit_group_target_v2, set_group_ready, start_group_room_game_v2, apply_group_move_v2, activate_group_room_game, finalize_group_room_if_expired, leave_group_player, send_group_spectator_emoji_v13 |
| authenticated KEEP — duelItemService.js | ensure_duel_item_grant_v3, get_duel_item_state_v3, use_duel_item_v3 |
| authenticated KEEP — singleGameService.js | create_single_game_run, get_single_game_run, apply_single_move_v2, leave_single_game_run |
| authenticated KEEP — achievementService.js | get_my_achievements_v1, get_result_achievements_v1, mark_achievements_seen_v1 |
| authenticated KEEP — profileRewardService.js / xpService.js | get_profile_card_v1, get_profile_cards_v1, equip_profile_reward_v1, unequip_profile_reward_v1, get_xp_summary_v1 |
| anon + authenticated KEEP — dailyChallengeService.js | ensure_today_daily_challenge (게스트 필요, definer 내부 쓰기) |
| anon + authenticated KEEP — 순수 계산/공개 computed 필드 | level_from_total_xp (achievementService.js), profile_level (ProfilePage computed SELECT), xp_to_next_level (서버 계산 helper; 데이터 쓰기 없음) |
| service_role 전용 KEEP | replace_wiki_snapshot_v2 (wiki-snapshot Edge), apply_guest_single_move_v2 (single-run Edge), grant_xp_v1, grant_result_xp_v1, evaluate_result_achievements_v1 (서버 지급/재평가), set_updated_at (트리거) |
| authenticated KEEP — RLS 내부 의존 | can_view_room_player_v1, is_room_member, is_room_participant, can_join_room; 프론트 직접 호출 0을 unused 판정으로 오해하지 않음 |
| UNUSED / DELETE CANDIDATE — 삭제/회수 미수행 | start_group_room_game, start_group_room_game_v2_safe, submit_group_target, finalize_group_records. 프론트 호출 없음; 외부 호출·함수 간 의존·현재 prod 본문을 확인해야 폐기 가능 |
| KEEP — 이미 삭제된 legacy | update_group_progress, finish_group_player (`20260814093000`); 복원 금지 |

`apply_duel_swap_v2`는 현재 UI 활성 기능이 아니지만 서비스 동적 분기가 있으므로 함수 삭제 후보로 단정하지 않는다.
private 함수는 서버/트리거 내부 의존이며 client EXECUTE가 필요하지 않다. 실제 모든 overload는 SQL 조회로 대조해야 한다.

## 확인 SQL

- 기존 **미추적** `scripts/sec-m2-check-prod.sql`은 그대로 보존했다. R1~R8은 후보 DML/컬럼 ACL/죽은 정책/시퀀스/컬럼/analytics/행수/definer 참조 조사다.
- 이 파일만으로 전체 권한을 닫을 수 없다: R1은 6테이블 한정, 함수 EXECUTE 전체 조회 없음. R3 ALL은 INSERT만 확인하므로 모든 명령의 유효 권한을 대표하지 않는다.
- 새 `scripts/sec-m2-verify-readonly.sql`은 전체 유효 테이블/컬럼 UPDATE 권한·public/private 함수 overload·정책·시퀀스·기본 ACL·migration/A3 함수·publication을 SELECT로 보완한다. 이번에 실행하지 않았으므로 SQL 실행 성공은 미확인이다.
- grant 실제 상태 미확인 및 Docker 미가동으로 pgTAP 불가: 새 회수 migration은 작성하지 않았다. 회수 후보 표를 실제 권한과 대조한 뒤 append-only 파일로 만들고 로컬 검증해야 한다.

## 검증 / 다음

`[산출물]` 2026-10-06, 기준 `e4fb483` + 미커밋 작업 트리:

- 관련 SF-A2/M1·duel·복구·그룹 테스트 107/107.
- npm test 472/472, npm run build exit 0. 기존 500 kB chunk 경고 남음.
- git diff --check 통과.
- DB pgTAP / browser smoke 미실행: Docker engine named pipe 없음, 이미 실행 가능한 local Auth/DB 2계정 환경 없음. 운영으로 우회하지 않았다.
- CLI `test db --help`도 사용자 홈 telemetry 쓰기가 sandbox EPERM으로 실패했다. DB 테스트 명령은 이 세션에서 실행 가능 여부를 검증하지 못했다.
- 기존 A3 pgTAP은 본인/상대/방장/finished/group을 다루지만 이번 실행 결과로 재사용하지 않았다.

다시 검증할 명령 (로컬 스택 정상 작동·migration 상태 확인 후):

```powershell
npm test
npm run build
npx supabase test db --help
node scripts/duel-players-view-smoke.mjs
```

스모크 스크립트는 로컬만 허용하며 fixture 생성/정책 임시 교체 후 finally 복원한다. 단순 읽기 테스트가 아님을 유의한다.
pgTAP 대상은 `supabase/tests/duel_players_view_v1.sql`, `duel_players_rls_v1.sql`, `sec_finish_db_v1.sql`이다. 정상 CLI의 help에서 로컬 파일 실행 옵션을 확인한 뒤 실행한다.
보안 운영 완료 조건은 A3 적용 확인 + 실제 SELECT/Realtime 음성 검증 + M2 권한 회수 로컬 검증/별도 승인 적용이다.
그 뒤 기능은 랜덤 탐험 run_mode + XP 20부터 권장한다 (모드와 보상 계약을 먼저 확정해 후속 아이템/주간 gameplay XP에 같은 기준 사용).
