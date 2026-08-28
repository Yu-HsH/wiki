# Wiki Race 2.0 통합 QA 체크리스트

기준 문서: `../01-CONFIRMED-SPEC.md`  
목표: 기능·디자인 통합 후 확정 규칙과 회귀를 한 번에 검증

## 1. 사전 확인

- [ ] 현재 브랜치·HEAD·작업 트리 기록
- [ ] 적용 migration과 환경 기록
- [ ] 테스트 계정·브라우저 세션 2~8개 준비
- [ ] PC·모바일 viewport 준비
- [ ] 네트워크 offline/throttle 도구 준비
- [ ] 기존 사용자 데이터 백업 또는 테스트 DB 사용

## 2. 링크·문서

- [ ] plcontinue 전체 링크 수집
- [ ] redirect와 canonical 통일
- [ ] 실제 본문/API namespace 0 교집합
- [ ] 빠른 링크 최대 20개 순서 안정
- [ ] 표·정보상자·이미지 설명·둘러보기 링크
- [ ] 같은 이동 중복 방지
- [ ] 조작된 next document 서버 거부
- [ ] 목표 직접 위조 finish 거부

## 3. 싱글·오늘의 탐험·게스트

- [ ] 랜덤 탐험 정상 완주·기록·XP 20
- [ ] 목표 지정 정상 완주·XP 15
- [ ] 같은 목표 코스 반복 XP 차단
- [ ] 오늘 세 코스가 사용자 간 동일
- [ ] 코스별 최초 XP 25
- [ ] 시간→이동→기록 시각 랭킹
- [ ] 세 코스 올클리어
- [ ] 날짜 경계 재생성
- [ ] guest 싱글 가능
- [ ] guest XP·업적·랭킹·온라인 전적 미저장

## 4. 1:1

- [ ] 비아이템전 정상 승패
- [ ] 정상 승/패 XP 50/25
- [ ] 직접 기권 0, 상대 기권승 30
- [ ] 연결 끊김 60초 유예
- [ ] 유예 안 복귀
- [ ] 유예 만료 FORFEIT
- [ ] 양쪽 장애 무효 처리
- [ ] 현재 문서·이동 횟수 공개
- [ ] 전체 경로 결과에서 공개
- [ ] 동일 상대 XP 3/5/6경기 감쇠 경계

## 5. 아이템전

- [ ] 4고정 역할+변칙 1, 총 5개
- [ ] 변칙 확률과 조커 제외
- [ ] 양쪽 역할 수 동일·사용자 내 중복 없음
- [ ] 2.5초 공통 쿨타임
- [ ] 먹물 4초·HUD 유지·reduced motion
- [ ] 잘못된 링크 목표 제외·이동+1
- [ ] 링크 검열 6초·약 50%·최소 2개
- [ ] 검색 15초·문서 이동 시 종료
- [ ] 미리보기 15초·최대 3개
- [ ] 편집 보호 8초·공격 1회
- [ ] 되돌리기 일반/강제 이동 복구
- [ ] 역링크 6초·반사
- [ ] 특수:임의 문서 후보 필터
- [ ] 문서 맞교환 즉시 승리 방지
- [ ] 역사 되감기 양쪽 직전 문서
- [ ] 조커 방어 불가
- [ ] 로딩·복구·결과 중 사용 불가
- [ ] F5 후 지급·소비·효과·쿨타임 유지
- [ ] 재대결 재추첨
- [ ] 그룹 무아이템

## 6. 그룹

- [ ] 3~8명 입장·대기·시작
- [ ] 동일 시작·목표
- [ ] 개인 완주 즉시 결과 저장
- [ ] 3등 후 2분 grace
- [ ] 시작 후 20분 마감
- [ ] 두 마감 중 빠른 값
- [ ] 4등 이후 정상 완주
- [ ] 전원 resolved 조기 종료
- [ ] 미완주 RETIRE·XP 0
- [ ] 완주 후 관전
- [ ] 경기 전/중/완주 후 방장 승계
- [ ] 방장 강제 종료·kick 없음
- [ ] F5 관전·순위·현재 문서 복원
- [ ] preset 이모티콘 3초 쿨타임
- [ ] 사용자별/전체 음소거
- [ ] 채팅 UI 없음

## 7. XP·레벨·랭킹

- [ ] result ID 중복 지급 차단
- [ ] gameplay/achievement/admin XP 구분
- [ ] 레벨 1~5 필요 XP 100
- [ ] 5레벨 구간마다 +25
- [ ] 81레벨 이후 500
- [ ] 최대 레벨 없음
- [ ] 여러 레벨 동시 상승
- [ ] 주간 랭킹에 achievement XP 제외
- [ ] 월요일 00:00 경계
- [ ] 탐험가 레벨 누적 표시
- [ ] 레벨이 게임 성능에 영향 없음

## 8. 업적·보상

- [ ] 일반 업적 단계·진행·보상 공개
- [ ] 초기 일반 18계열 활성
- [ ] 히든 13개 판정
- [ ] 히든 달성 전 API/UI 비공개
- [ ] 히든 reveal과 도감 기록
- [ ] 자동 보상·중복 지급 차단
- [ ] canonical 고유 문서 집계
- [ ] redirect·경로 비교·아이템·group finished_at 조건
- [ ] 누적 업적 소급
- [ ] 상황 업적 활성화 이후 판정
- [ ] retired 업적 기록 보존
- [ ] 안정적인 reward bundle ID와 자동 지급
- [ ] `onboarding_full_avatar` 사용 기록이 있으면 조건 보존·legacy/retired 처리
- [ ] `onboarding_profile_complete` 조건: 프로필 아이콘 + 대표 칭호 또는 배지 1개
- [ ] `onboarding_profile_complete` 보상: 기본 프로필 프레임

## 9. 프로필 카드·꾸미기

- [ ] 보유하지 않은 꾸미기 보상 장착 차단
- [ ] 시스템 제공 프로필 아이콘 4~6종 중 1개 장착 저장
- [ ] 대표 칭호 1개·대표 배지 최대 3개 장착 저장
- [ ] 프로필 프레임 1개·프로필 배경 1개 장착 저장
- [ ] 경로 색상·경로 효과·완주 효과·관전 이모티콘 장착 저장
- [ ] 새로고침과 재로그인 후 장착 상태 유지
- [ ] 프로필 아이콘 없음·에셋 로딩 실패 시 시스템 기본 이미지
- [ ] 기존 `profile_image_url` 또는 4부위 값이 있는 사용자 legacy fallback
- [ ] 프로필·랭킹·그룹 참가자 행·결과 화면의 일관된 표시
- [ ] 모바일 프로필 카드와 보상 inventory
- [ ] guest가 영구 보상 inventory·장착 상태를 생성하지 못함
- [ ] 사용자 이미지 업로드·4부위 조합·아바타 프리셋 UI 없음
- [ ] 기존 경기 아이템 inventory 지급·소비·F5 복구 회귀 없음

## 10. UI·반응형·접근성

- [ ] 세 모드 동등한 위계
- [ ] 그룹 선택 시 방 만들기/코드 참가
- [ ] Wikipedia 본문 최대 영역
- [ ] 싱글/1:1/아이템/그룹 HUD 변형
- [ ] 최대 8명 participant panel
- [ ] 관전 기본 플레이어 보기·보조 경로 비교
- [ ] 결과 순위→기록→XP→업적→경로 순서
- [ ] 본문 16px 이상
- [ ] 터치 대상 44px 이상
- [ ] 키보드 탐색·focus visible
- [ ] 색상 외 상태 구분
- [ ] reduced motion
- [ ] PC/모바일 게임·관전·결과·프로필
- [ ] 상점·재화·시즌·신고·관전 채팅 노출 없음

## 11. 복구·오류·보안

- [ ] F5가 leave를 발생시키지 않음
- [ ] 뒤로가기 확인 취소 시 게임 유지
- [ ] 뒤로가기 확인 시 모드별 종료 사유
- [ ] Realtime 중복 channel 없음
- [ ] stale/역순 이벤트 무시
- [ ] DB 직접 rank/status/history/stats 공격 거부
- [ ] 다른 방/사용자 RPC 공격 거부
- [ ] 중복 finish/item/XP/achievement 요청
- [ ] API 오류 재시도와 안전한 로비 이동
- [ ] 서버 시간과 클라이언트 시간 차이

## 12. 최종 완료 보고

```md
## Wiki Race 2.0 최종 QA
- 검증 브랜치/커밋:
- DB migration 버전:
- 자동 테스트:
- PC 브라우저:
- 모바일 viewport/device:
- 통과 항목:
- 실패/보류 항목:
- 출시 차단 이슈:
- 플레이테스트에서 조정할 수치:
- 후속 기능으로 남긴 항목:
```

## 13. 2026-08-14 Packet 13 사전 검증 기록

- 검증 브랜치: `feat/group-final-gaps`
- 서버 권위 V2 기준 커밋: `450f63a`
- Packet 13 migration: `20260814103000_group_final_gaps_v13.sql` (미적용 작업 트리)
- 자동 테스트: `npm test` 118/118 통과
- 빌드: Vite build 성공; 번들 크기 경고만 확인
- 정적 SQL 계약 검사: migration/RPC/권한/Realtime publication 계약을 `supabase/tests/group_final_gaps_v13.sql`에 기록
- 브라우저·모바일·다중 세션·실제 Supabase RPC/RLS/Realtime: 환경 도구 부재로 보류
- 출시 차단 이슈: 실제 DB migration 적용 후 pgTAP/RPC/RLS와 2~8세션 QA를 통과해야 함

## 14. 2026-08-14 Packet 13 Hardening 독립 검증 보완

- 후속 migration: `supabase/migrations/20260814113000_group_final_gaps_v13_hardening.sql`
- BLOCKER 검증: 빈 `finished` 방의 `host_user_id=NULL`, player row 0, result row 보존; 구성원이 남은 방은 host role/reference 1:1 일치.
- MAJOR 검증: hard/grace deadline 직전 spectator emoji는 허용되고 직후는 0건이며, concurrent finalizer와 경합해도 만료 요청의 rate ledger/event는 0건; duel participant/non-participant finalize는 `NOT_A_GROUP`이고 상태/version 불변.
- 동시성 검증: 방장+참가자 leave, hard/grace emoji+finalizer, 서로 다른 request의 third finish, 기존 동일 request 재시도 harness 모두 통과.
- SQL 검증: Packet 13 pgTAP 33개, Server Authority V2 97개, Phase 2C 49개 전체 통과. 두 CHECK는 preflight 위반 0건 및 `VALIDATE CONSTRAINT` 상태.
- Atomicity 검증: hard/grace 단독 만료 emoji 22개 pgTAP과 단독·동시 harness 통과. 만료 RPC는 data JSONB로 반환되고 room finalization commit, `game_end` 1건, 결과/RETIRE 보존, emoji event/rate ledger 0건을 확인.
- 운영 보강: group/non-group host CHECK를 모두 preflight 대상으로 기록했다. `game_rooms.host_user_id` 전용 index는 현재 조회 경로와 catalog에서 근거가 없어 추가하지 않고 운영 EXPLAIN 성능 점검으로 남겼다.
- 로컬 Docker DB에 raw `psql`로만 확인했으며 migration runner clean apply, 운영 dry-run, 실제 Realtime/브라우저 2~8세션은 release gate로 남긴다.

## 15. 2026-08-14 Packet 13 Crash Diagnostic

- [x] PostgreSQL log에서 signal 11, failed statement, backend PID, recovery 전후를 보존했다. 컨테이너 restart count는 0이지만 backend와 다른 세션은 recovery로 종료됐다.
- [x] `room_events` row type/trigger/constraint/RLS/publication, RPC OID/return type/owner/volatility/security/ACL/pg_depend, private finalizer/helper chain을 catalog에서 확인했다.
- [x] 원본 `0135…` fixture는 현재 DB/repository에 남아 있지 않아 byte-identical 복원이 불가함을 기록하고, 별도 diagnostic harness에 full/minimal substitute와 cleanup을 보존했다.
- [x] full/minimal 단계별 accepted path에서 lock·preset·ledger·insert·composite JSONB·최종 JSONB를 모두 통과시켰다. 새 direct, prepared, `DISCARD PLANS`, 장기 연결, authenticated/service_role accepted path도 확인했다.
- [x] anon의 권한 거부 호출과 room 없는 generic `RETURNS jsonb` guard에서 signal 11을 재현했다. 이 결과는 `to_jsonb(v_event)`나 fixture 결함만으로 설명되지 않으며, runtime/extension/catalog 경로의 재현 가능한 blocker다.
- [ ] PostgreSQL/Supabase image 교체·disposable clean DB·운영 버전 비교·core/backtrace 확보
- [ ] backend crash가 없는 새 환경에서만 20회/100회 accepted, prepared/unprepared, boundary/rate, pgTAP·concurrency·Node·build 전체 재검증
- 판정: `CODE NO-GO`, `RELEASE HOLD`. 운영 DB/Edge Function 배포, migration runner history 변경, OS debug/core 설정 변경은 하지 않았다.

## 16. 2026-08-15 Packet 13-R Local Supabase PostgreSQL Runtime Gate

- [x] 공식 [Supabase issue #2112](https://github.com/supabase/postgres/issues/2112)와 [Docker changelog](https://github.com/supabase/supabase/blob/master/docker/CHANGELOG.md)를 확인했다.
- [x] `.095` control, `.104` reproduction, `.136` candidate, CLI actual `.158`을 서로 다른 disposable container·volume으로 비교했다. `.104`는 denied 1회에서 SIGSEGV/recovery를 재현해 중단했다.
- [x] `.095`와 `.136`/`.158`에서 integer/text/jsonb denied `42501`, allowed 반환값, 새 연결 20회, 동일 연결 100회, prepared/unprepared, `DISCARD PLANS`를 검증했다. `.158` final marker에서 signal 11/recovery/postmaster 변경/restart는 0건이다.
- [x] `.158` clean DB 1·DB 2에 official migration runner로 12개 migration을 적용하고 세 Packet 13 migration history를 확인했다.
- [x] 두 clean DB: Packet13 33/33, Atomicity 22/22, Server Authority V2 97/97, Phase2C 49/49, hard/grace exact boundary와 lock-order concurrency PASS.
- [x] clean DB actual RPC: authenticated accepted와 anon denied `42501`이 모두 backend crash 없이 PASS.
- [x] CLI `2.114.0`과 `.158` image ID/digest를 `supabase/config.toml` 및 preflight harness로 고정했다. R1 당시 `.104` DB에서 preflight가 FAIL하는 것도 확인했다. R2에서는 `.104` stack을 중지하고 clean158을 기본으로 분리했다.
- [x] 검증 harness의 stdout/stderr/exit-code 보존과 `connection loss`/signal 11/recovery 오판 방지를 확인했다.
- [ ] 운영 runtime/linked project read-only version 확인
- [ ] 실제 브라우저 2~8세션, Realtime, F5/offline/throttle, Wikipedia snapshot 429 없는 smoke
- [ ] 운영 dry-run 및 Release A~D 승인

판정: `CODE GO — verified target runtime constrained`는 CLI `2.114.0`과 image `.158` preflight를 통과하는 local/CI 환경에 한해 적용한다. 운영 및 사용자-facing release는 위 미완료 항목 때문에 `RELEASE HOLD`다.

## 17. 2026-08-17 Packet 13-R2 Local Runtime Enforcement & PostgREST Smoke

- [x] CLI `2.114.0`을 package.json/package-lock에 exact pin하고 Node `supabase:start`, `supabase:preflight`, `supabase:clean-gate`, `supabase:postgrest-smoke` entrypoint를 추가했다.
- [x] 기존 `.104` stack은 공식 stop으로 중지했고 `supabase_db_wiki` volume은 보존했다. clean158은 별도 project/container/volume과 54321·54322 포트로 시작했다. `.104` volume을 `.158`에 연결하지 않았다.
- [x] preflight는 wrong tag/ID/digest와 migration/catalog/ACL prerequisite 실패를 fail-closed로 처리하며, `.104` mismatch에서는 denied ACL call을 실행하지 않았다. approved `.158` full preflight는 history/return contract/ACL/42501/postmaster/restart/log를 PASS했다.
- [x] fresh `.158` default에서 official `supabase db reset --local --no-seed --yes`와 `db push --local`을 실행하고 12 migration 및 `103000/113000/123000` history를 확인했다.
- [x] TAP exact: Packet13 33/33, Atomicity 22/22, Server Authority V2 97/97, Phase2C 49/49. no `not ok`, Bail out, skip, todo.
- [x] PowerShell 7.6.4와 ProcessStartInfo.ArgumentList probe, deterministic hard/grace/lock-order concurrency, full/minimal/prepared/DISCARD/long-lived/service-role crash regression을 PASS했다.
- [x] 실제 local PostgREST smoke: authenticated accepted/rate-limit/4초 retry, hard/grace structured expiry, latest room/results, domain rejection, anon 42501, direct room_events RLS 42501, event/ledger/game_end counts, backend stability.
- [x] `npm test` 121/121, `npm run build` 성공, Node 5개/PowerShell 7개 syntax, `git diff --check` 통과. build의 large chunk는 기존 경고이며 실패가 아니다.
- [ ] 운영 runtime/linked project read-only confirmation
- [ ] 실제 browser 2~8세션, Realtime, F5/offline/throttle, Wikipedia snapshot smoke
- [ ] 운영 dry-run 및 Release A~D 승인

판정: `CODE GO — clean158 + CLI 2.114.0 + approved digest + preflight constrained`; 사용자-facing release는 미완료 항목으로 `RELEASE HOLD`다.

## 18. 2026-08-18 Packet 13-R3 Deterministic Concurrency Gate Closure

- [x] 공식 concurrency harness가 advisory coordinator와 PostgreSQL catalog 관측(`pg_stat_activity`, `pg_locks`, `pg_blocking_pids`)으로 lock owner/waiter를 증명한다. 단순 동시 시작·고정 sleep은 순서 근거로 사용하지 않았다.
- [x] finalizer-first hard/grace, emoji-first hard/grace, hard equality, grace equality 6개 시나리오를 고유 fixture로 3회 반복했다. 각 반복에서 A room lock owner, B transactionid waiter/blocker, barrier release, PID/xact/wait/RPC/commit evidence를 남겼다.
- [x] hard invariant: finished/time_limit, game_end=1, results=3, retired/player_retired=2, emoji event/rate ledger=0, host 유지. grace는 finished/grace_timeout으로 동일 invariant. 중복 finalization·deadlock·timeout·orphan `r3-*` activity 없음.
- [x] equality invariant: 동일 DB server timestamp deadline과 production `>=`를 확인하고 즉시 만료 구조화 결과를 받았다.
- [x] pure validation negative controls: wrong CLI/image/digest/migration/RPC/ACL, process nonzero/connection loss/recovery/signal 11, TAP shortfall/not ok/Bail out/skip/todo/plan mismatch 모두 reject.
- [x] safe start는 공식 CLI `--exclude vector`를 사용한다. Vector는 Docker host logging endpoint 연결 실패로 restart loop였지만 Wiki Race 기능에서 사용하지 않는 observability 서비스이고, 제외 후 DB/Auth/PostgREST/Realtime/Storage smoke는 PASS했다.
- [x] official clean gate가 concurrency 전체를 3회 실행하도록 고정했고, 수정 후 official migration runner, TAP 33/22/97/49, crash regression, PostgREST smoke, Node/build/syntax/diff 검증을 완료했다.
- [ ] 실제 browser 2~8세션 Realtime, F5/offline/throttle, Wikipedia snapshot 429 없는 smoke
- [ ] 운영/linked PostgreSQL runtime read-only 확인, 운영 dry-run, Release A~D 승인

판정: `CODE GO — default local runtime and deterministic gate verified`는 approved `.158` local/CI에 한정한다. 사용자-facing release는 위 미완료 항목으로 `RELEASE HOLD`다. Vite 약 688KB chunk warning은 성능 backlog이며 Packet 13 기능 결함으로 처리하지 않는다.

## 19. 2026-08-18 Packet 13-R3.1 Harness Evidence Preservation Closure

- [x] 공식 concurrency child 실행에서 stdout/stderr를 별도 보존하고 worker/scenario, process ID, start/end, exit code, timeout, connection-loss, cleanup 상태를 구조화했다. `2>&1` 병합과 stderr-only false failure를 제거했다.
- [x] Stop/Receive/Remove cleanup을 단계별로 집계하고 모든 단계를 계속 시도한다. primary failure와 cleanup failure를 함께 보고하며 cleanup failure만으로도 parent nonzero가 된다. fixture/job orphan 0 경계를 포함했다.
- [x] DB 없는 `group_final_gaps_v13_hardening_concurrency_self_test.ps1`에서 stream/nonzero, Stop/Receive/Remove fail injection, primary+cleanup aggregate, timeout orphan-free를 PASS했다.
- [x] `supabase-clean-gate.mjs`가 공식 migration/TAP/concurrency gate 전에 self-test를 실행하고 실패 시 fail-closed하도록 연결했다.
- [x] DB 비의존 회귀: `npm test` 124/124, `npm run build`, Node·PowerShell syntax, `git diff --check`.
- [ ] approved `.158` local runtime에서 clean gate, TAP 33/22/97/49, crash regression, PostgREST/Realtime smoke와 deterministic 6개 시나리오 3회 재실행. 공식 gate는 harness self-test를 PASS했지만 Docker 미기동 `ECONNREFUSED 127.0.0.1:54322`에서 migration 단계로 fail-closed 되었다.
- [ ] browser 2~8세션 Realtime, F5/offline/throttle, 운영/linked runtime read-only, 운영 dry-run 및 Release A~D 승인

판정: harness 구현은 `GO`; approved `.158` runtime gate 재실행 전 Packet 13 `CODE NO-GO`, 사용자-facing release `RELEASE HOLD`를 유지한다. Vite 약 689KB chunk warning은 기존 성능 backlog다.

## 20. 2026-08-18 Packet 13-R3.2 Third-Finish Parser Final Closure

- [x] third-finish parser가 stdout 전체를 code로 비교하던 원인을 확인했다. `SET`/빈 줄이 포함되어도 test-only `PACKET13_RESULT|worker|code` marker만 추출한다.
- [x] parser helper가 LF/CRLF, exact prefix, worker별 정확히 1개, 기존 allowed code, child nonzero/timeout/connection loss/stderr SQL error를 fail-closed 검증한다.
- [x] parser self-test positive/negative 전체 PASS: psql status noise, CRLF, equals marker, conflict code, marker 없음/중복/malformed/empty/unknown/worker mismatch/wrong prefix/nonzero/connection-loss/stderr error.
- [x] third-finish 단독 PASS: marker `APPLIED` + `GAME_NOT_ACTIVE`, worker별 1개, exit 0, fixture/event cleanup PASS.
- [x] 전체 concurrency harness PASS: deterministic/equality/third-finish, exit 0, orphan activity 0.
- [x] Node 124/124, build, Node·PowerShell syntax, `git diff --check` PASS.
- [ ] 공식 clean gate exit 0. migration runner와 harness self-test는 PASS했지만 `.158` preflight log check가 기존 startup recovery/`unexpected EOF` marker로 실패했다. preflight 우회나 log 삭제는 하지 않았다.
- [ ] PostgREST smoke 전체 exit 0. domain/RLS 기능 case는 PASS했지만 동일 runtime-stability dangerous log 판정에서 실패했다.
- [ ] browser 2~8세션 Realtime, F5/offline/throttle, 운영/linked runtime, dry-run, Release A~D 승인

판정: parser/harness는 `GO`; clean gate exit 0 미충족으로 Packet 13 `CODE NO-GO`, 사용자-facing release `RELEASE HOLD`다. Vector observability와 Vite chunk warning은 CODE blocker로 추가하지 않는다.

## 21. 2026-08-18 Packet 13 Final Log-Window Gate

> #### ⚠ 봉인 — 이 절은 **2026-08-18 시점의 게이트 기록**이다 (2026-08-29 봉인)
>
> **아래 체크박스와 판정줄은 그날의 실행 결과다. 지우지 않고 그대로 둔다.**
> 다만 **미체크 항목과 판정 사유는 2026-08-27~28 cutover 창으로 낡았다.**
>
> **`RELEASE HOLD` 판정 자체는 유지된다. 사유가 완전히 바뀌었다.**
>
> | | HOLD 사유 |
> |---|---|
> | **2026-08-18 (아래 기록)** | 운영/linked runtime read-only confirmation, **운영 dry-run**, **Release A~D 승인**, browser 2~8세션 Realtime |
> | **2026-08-29 (현재)** | **W9 미해결 4건** — `wiki-snapshot` 429 대량 재발(그룹), RETIRE 사유 불일치, `username-lookup` 404, 관전 이모티콘 미전달 |
>
> 위 표 왼쪽 항목이 어떻게 닫혔는지:
>
> | 미체크 항목 | 2026-08-28 창 |
> |---|---|
> | 운영/linked runtime read-only confirmation | **해소** — W7이 함수 36 / legacy RPC 0 / RLS 14/14 / publication 4테이블 / 이력 12행을 실측 |
> | 운영 dry-run | **해소** — W5에서 pending 정확히 11개, 순서 계획 표와 완전 일치 |
> | Release A~D 승인 | **대체됨** — U2로 11개를 한 창에서 전량 적용 (CUTOVER-PLAN §10) |
> | browser 2~8세션 Realtime | **부분.** 4인 그룹은 실제로 돌렸다(W9 발견 3·6의 관측 경로). 1:1 2세션은 여전히 미수행 (CUTOVER-PLAN §8.2-2) |
>
> **이 절을 대체하는 새 게이트 기록(§22)은 아직 작성되지 않았다** —
> `docs/agent/CURRENT.md` §5.6-8의 작업이다. 그때까지 **판정의 현재 값은
> `docs/agent/CURRENT.md` §1**에서 읽고, 창 실행 결과는
> **`docs/ops/CUTOVER-LOG-2026-08-27.md`** 에서 읽는다.

- [x] DB-free log-window parser self-test: historical fatal outside window PASS, marker missing/duplicate/reversed, current signal 11/PANIC, container/postmaster/restart change, log command failure 모두 reject.
- [x] approved `.158` preflight/baseline: CLI `2.114.0`, image/digest, PG `17.6`, healthy, container ID stable, postmaster stable, restart `0`.
- [x] clean gate run `packet13-f7f2779b-9d76-4670-a65a-bb8172adfeda`: START/END each 1, ordered, current fatal 0, historical fatal 30, migration/TAP `33/22/97/49`, deterministic concurrency 3회, crash regression 4종, exit 0.
- [x] independent PostgREST run `packet13-bd859f66-7d1e-4f6b-8cbc-cc148778a5c4`: authenticated accepted, rate-limit/retry, hard/grace expiry, RLS/anon/nonmember/duel and event-ledger cardinality PASS; START/END each 1, current fatal 0, exit 0.
- [x] `npm test` 126/126, `npm run build`, Node/PowerShell syntax, `git diff --check`.
- [ ] browser 2~8세션 Realtime, F5/offline/throttle, 운영/linked runtime read-only confirmation, 운영 dry-run, Release A~D 승인.

판정: approved local `.158` + CLI `2.114.0` 범위의 Packet 13 `CODE GO`; historical PostgreSQL recovery/EOF marker는 삭제하지 않고 별도 evidence로 보존했다. 사용자-facing release는 미완료 항목 때문에 `RELEASE HOLD`다.
