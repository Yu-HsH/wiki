# 보안 로컬 정리 + 랜덤 탐험 XP

기준 `e4fb483` + 미커밋 작업 트리, 2026-10-06. branch `feat/group-final-gaps`.
기존 미커밋 변경/미추적 파일 보존. commit/push/운영 DB 접속·적용/배포 없음.

## 보안

- A3 경계는 기존 [검토 기록](SEC-A3-M2-REVIEW-2026-10-06.md) 유지. 본인 Realtime, 상대 마스킹 RPC, 그룹 제외. 운영 적용 여부는 미확인.
- M2 migration `20261006000302_security_privilege_cleanup_v1.sql` 작성. profiles INSERT/DELETE, analytics UPDATE/DELETE, target_candidates/daily_challenges/daily_challenge_pool/picked INSERT/UPDATE/DELETE, target_candidates_id_seq 권한을 anon/authenticated에서 회수하는 SQL이다. **미적용**.
- 근거 `[코드]`: baseline 권한·RLS, C3 컬럼 UPDATE, username-signup service_role INSERT, ensure_today_daily_challenge definer 내부 쓰기, services/pages/authContext 호출 대조. 회수는 grant 부재 시에도 안전하며 서비스 역할은 보존한다.
- analytics INSERT와 수집 정책, 후보 SELECT/운영 컬럼, 실제 추가 ACL/기본 권한, 죽은 정책·구형 RPC는 보류. RPC DROP·정책 삭제·데이터 변경 없음.
- pgTAP `security_privilege_cleanup_v1.sql`: 역할별 유효 권한, 필요한 SELECT/RPC, 본인 닉네임 UPDATE, 직접 DML 거부. 기존 A1/A3 pgTAP이 duel progress·본인/상대/방장/종료/group 경계를 확인하므로 중복 복사하지 않는다.

## 싱글 흐름과 계약

| 모드 | React 진입 | 서버 생성 | 결과 / XP |
|---|---|---|---|
| random | GameSetup 기본 / MainPage 랜덤 | createAuthenticatedSingleRun의 8인자 create_single_game_run; guest는 single-run Edge | single_game_runs.run_mode → game_records.run_mode → single_random_finish 20 |
| custom | MainPage 목표 선택 | 같은 생성 경로, mode custom | single_target_first_finish 15, 본인 동일 시작/목표 최초만 |
| daily | MainPage 오늘 버튼 (기존 custom → daily) | 현재 KST 코스 제목+서버 wiki_pages page identity 검증 | daily_course_first_finish 25, 본인 해당 course date 최초만 |

`[코드]` mode는 GamePage → service/Edge → run에 저장. 클라이언트 XP 인자 없음.
`20261006000303_single_run_mode_xp_v1.sql`의 BEFORE INSERT trigger가 서버 run에서 mode/date를 복사하므로 기존 apply_single_move_v2를 재작성하지 않았다. 이후 기존 AFTER INSERT XP·업적 trigger가 실행된다. duel/group/level/achievement 판정기는 변경하지 않았다.

daily는 현재의 1일 1코스를 유지하며 목표를 현재 코스와 대조한다. 시작 문서는 기존 랜덤 흐름을 유지한다. daily 목표 snapshot도 생성 전에 확보해 서버 identity 확인에 사용한다. DB의 오늘 코스와 다른 fallback/오래 열린 오늘 버튼은 `DAILY_COURSE_MISMATCH`로 거부하며 임의의 25 XP를 지급하지 않는다.

명시적 daily run은 **생성 시 서버가 검증한 KST 코스 날짜**를 저장한다. 자정/F5 이후에도 그 코스 날짜의 최초 완주로 판단한다. 과거 mode 없는 run/record는 기존 **완주 시각 KST 날짜 + 목표 제목 추론**을 유지한다. 새 custom/random은 daily 제목과 우연히 같아도 daily로 재분류하지 않는다.

- mode 컬럼은 nullable, default 없음: 과거/구버전 7인자 RPC는 NULL 유지. 추정 backfill·재지급 없음.
- 기존 7인자 생성 RPC 유지, mode 있는 8인자 overload만 추가. 같은 run ID 재시도는 기존 mode를 바꾸지 않는다.
- random 코스 반복 제한은 추가하지 않았다: 확정 스펙 §7.2는 custom 반복만 제한한다. 각 정상 random run 완주는 20, **동일 result 재처리는 ledger UNIQUE(user_id,source_type,source_id)**로 한 번만 지급한다.
- custom은 기존 start/target 중복 검사를, daily는 profile row lock + 코스 날짜 중복 검사를 유지한다. duplicate move request는 기존 멱등 처리 사용.
- guest는 run_mode만 저장한다. 기존 guest move RPC는 game_records를 만들지 않아 영구 XP 없음.
- 결과 UI는 기존 ledger 조회 + buildResultXpView를 그대로 사용. random 카탈로그와 라벨이 이미 있어 신규 디자인/프론트 XP 공식 없음.

## 검증

`[산출물]` 기준 `e4fb483` + 미커밋 작업 트리, 2026-10-06:

- 관련 node 테스트 228/228, 전체 482/482, production build exit 0 (기존 chunk 500 kB 경고).
- Edge TypeScript esbuild 구문 검사 통과. 모의 DB를 통한 실제 Edge handler의 random/custom/daily 생성, 잘못된 mode/daily 거부 테스트 통과.
- SQL 정적 대조: revoke 범위·PUBLIC/anon EXECUTE 회수·server-only 쓰기·mode/결과 trigger 순서·XP 카탈로그 일치·legacy fallback 확인. SQL 컴파일/pgTAP 실행 성공을 뜻하지 않는다.
- SQL 신규 2파일 작성: mode 생성/결과 보존, 20/15/25, random 반복, custom/daily 중복, 재지급/duplicate request, legacy 7인자, guest 완료/XP 없음, ACL. A1/A3·기존 XP/업적 회귀는 기존 스위트 재실행 대상.
- Docker engine named pipe 없음: migration 로컬 적용, pgTAP, 실제 Auth/Realtime/browser smoke **미실행**. psql/SQL parser도 없어 SQL 실행 검증은 미확인.
- CLI help는 `SUPABASE_TELEMETRY_DISABLED=1`로 정상 실행됨. 이전 홈 telemetry EPERM은 이 방식으로 회피했다. migration 파일명은 CLI migration new가 생성한 UTC timestamp이며 기존 최대 뒤에 위치한다.

## 다음 검증과 적용 순서

로컬 스택의 버전·migration 상태 확인 후 **로컬에만** 새 migration을 적용하고 전 pgTAP을 실행해야 한다. 관련 테스트 직접 실행 명령:

```powershell
$env:SUPABASE_TELEMETRY_DISABLED = '1'
npx supabase test db --local supabase/tests/security_privilege_cleanup_v1.sql supabase/tests/single_run_mode_xp_v1.sql supabase/tests/duel_players_view_v1.sql supabase/tests/duel_players_rls_v1.sql
npx supabase test db --local
node scripts/duel-players-view-smoke.mjs
npm test
npm run build
git diff --check
```

로컬 검증 뒤 운영은 별도 승인이다. A3·M2·run_mode migration → single-run Edge → 프론트 순서로 검토한다. 새 프론트를 mode 없는 DB보다 먼저 배포하면 새 RPC 인자를 인식하지 못한다. daily guest도 새 컬럼/Edge가 먼저 필요하다. 어떤 단계도 이번 세션에서 적용하지 않았다.

남은 범위: 실제 SQL/싱글 브라우저 검증, 운영 A3/M2 확인. 기능 부채 random_teleport 명세 차이·주간 gameplay XP 랭킹·그룹 결과 XP/업적 reveal·기권 UI·보류 업적·디자인/모바일 QA는 미변경.
SQL 검증을 마친 뒤 다음 기능 작업 하나는 random_teleport 명세 일치 권장: 기존 아이템 이동 규칙을 닫고 통합 QA로 이어진다.
