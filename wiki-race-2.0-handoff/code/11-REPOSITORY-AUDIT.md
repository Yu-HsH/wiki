# 기능 패킷 00 — 저장소 감사와 구현 지도

기준 문서: `../01-CONFIRMED-SPEC.md`  
이 단계의 목표: 코드를 바꾸기 전에 실제 상태와 확정 명세의 차이를 증거로 정리

## 1. 확인 범위

- 저장소 루트와 적용되는 `AGENTS.md`
- 현재 브랜치·HEAD·upstream·작업 트리
- `fix/wiki-link-stability`와 `37adc698c40356ec61af0faf0aff84eb6fadf90b` 존재·포함 여부
- React 라우트·페이지·공통 게임 훅·서비스
- Supabase schema·migration·RPC·RLS·Realtime publication
- 싱글·오늘의 탐험·1:1·그룹·게스트의 실제 구현
- 기존 아이템 이름과 서버/클라이언트 판정 위치
- profile/history/ranking 데이터 흐름
- `avatar`, `avatar_url`, `avatar_config`, `head`, `face`, `outfit`, `hand`, `cosmetic`, `equipped`, `inventory`, `onboarding_full_avatar` 사용 위치
- 프로필/cosmetic 컬럼·테이블, 장착 UI, Realtime/API payload, 사용자 보유·장착 데이터와 reward ID
- 테스트 파일과 실행 명령
- 현재 디자인/CSS 구조와 와이어프레임 반영 정도

## 2. 산출물

### 2.1 기능 상태표

각 항목을 다음 중 하나로 분류한다.

- 완료: 명세와 일치하며 테스트 근거 있음
- 부분 구현: 핵심은 있으나 조건·상태·권위가 부족
- 미구현
- 명세 불일치
- 확인 불가: 환경·자격증명·외부 서비스 필요

필수 기능 행:

- 링크 수집·canonical·빠른 링크
- 싱글 랜덤/목표 지정/오늘의 탐험
- F5 복구/명시적 이탈
- 1:1 방·진행·승패·재접속
- 1:1 아이템 11종·5슬롯
- 그룹 lifecycle·관전·방장·20분
- spectator 이모티콘·음소거
- 결과·경로 이벤트
- XP·무한 레벨
- 오늘/주간/레벨 랭킹
- 일반·히든 업적
- 보상 inventory·프로필 카드 꾸미기·legacy avatar 호환
- 프로필·게스트
- 접근성·모바일
- 서버 권위·RLS·anti-cheat

### 2.2 파일·데이터 지도

기능별로 다음을 기록한다.

- UI route/component
- state/hook/service
- table/view/RPC
- Realtime channel
- 테스트
- 수정 시 영향을 받는 다른 기능

### 2.3 우선순위 계획

- P0: 데이터 손상·승패 오류·권한 우회·복구 실패
- P1: 확정 핵심 기능 미구현
- P2: UX·접근성·표현 상태
- P3: 플레이테스트 수치 조정

### 2.4 2026-08-14 프로필·꾸미기 감사 결과

| 확인 항목 | 실제 저장소 사실 | 분류/조치 |
|---|---|---|
| 프로필 원본 | `profiles.profile_image_url` 단일 `text` 컬럼 | 기존 값을 프로필 아이콘/legacy fallback으로 보존 |
| 경기 참가 snapshot | `room_players.profile_image_snapshot` | 그룹·1:1 참가 시점 호환 값으로 보존 |
| Realtime/API payload | 참가자 row 조회·구독 payload에 `profile_image_snapshot`이 포함되고 `avatar_config`는 없음 | 기존 필드를 호환 유지하고 신규 장착 snapshot 계약은 후속 설계 |
| 프로필 편집 | `pages/ProfilePage.jsx`가 `avatars` Storage에 사용자 파일을 업로드 | 확정 명세 불일치, 프로필 단계에서 시스템 4~6종 선택으로 교체 |
| 표시 위치 | 프로필/공개 프로필/랭킹/그룹 참가자에서 단일 이미지 또는 글자 fallback 사용 | 공통 기본 이미지와 프로필 카드 표시 계약 필요 |
| 결과 화면 | 프로필 이미지/카드의 일관된 표시가 없음 | 프로필 단계 신규 구현 |
| 4부위 구조 | 코드·로컬 schema에서 `avatar_config`, head/face/outfit/hand 장착 구조 없음 | 새로 만들지 않음 |
| 꾸미기 데이터 | cosmetic reward catalog, 보유 inventory, equipped 상태 테이블 없음 | 업적·보상 단계 신규 additive 설계 |
| 경기 inventory | `useItemSystem`과 1:1 화면의 경기 아이템 inventory만 존재 | 프로필 보상 inventory와 분리·회귀 보호 |
| 준비된 탐험가 ID | `onboarding_full_avatar`는 handoff 문서에서만 검색됨 | 운영 DB/사용자 기록 확인 전 기존 ID 변경 금지 |
| 실제 사용자 데이터 | 로컬 schema dump에는 row 데이터가 없고 운영 DB는 조회하지 않음 | `확인 불가`; 배포 전 읽기 전용 감사 필요 |

검색 결과 `avatar_url`, `avatar_config`와 4부위/cosmetic 장착 식별자는 실제 소스·migration에서 발견되지 않았다. `avatar`라는 UI 표현은 단일 `profile_image_url` 또는 글자 placeholder를 가리키며, `inventory`는 현재 경기 아이템 상태다.

보존 원칙:

- 기존 단일 이미지와 향후 발견될 4부위 값·사용자 보유/장착 기록은 삭제하거나 파괴적으로 변환하지 않는다.
- 프로필 표시 계층은 신규 서버 확정 장착 상태 → `profile_image_url` legacy icon → 시스템 기본 이미지 순으로 fallback한다.
- 사용자 이미지 업로드는 2.0에서 구현하지 않으며 기존 업로드 URL과 storage object는 존재 여부를 확인하기 전 삭제하지 않는다.
- 운영 DB의 `onboarding_full_avatar`, reward ID, storage object 사용 여부가 확인되기 전에는 rename/update migration을 만들지 않는다.
- 프로필 구현은 additive migration과 별도 cutover로 설계하고 경기 아이템 inventory를 수정하지 않는다.

## 3. 감사 중 금지

- 기존 파일 수정
- 마이그레이션 실행
- 원격 push
- 스키마 추측
- 보고된 완료 작업을 근거 없이 재구현
- 현재 디자인을 곧바로 교체

## 4. 검토 채팅 시작 프롬프트

```text
Wiki Race 2.0 저장소의 구현 상태를 감사해줘.

첨부한 `01-CONFIRMED-SPEC.md`, `10-CODE-MASTER-TODO.md`, `11-REPOSITORY-AUDIT.md`를 먼저 전부 읽어줘. 이번 단계에서는 코드를 수정하지 말고 읽기 전용으로 분석해.

1. 저장소 루트와 AGENTS.md를 확인한다.
2. 현재 브랜치, HEAD, upstream, git status를 확인한다.
3. 마지막으로 알려진 `fix/wiki-link-stability`와 커밋 `37adc698c40356ec61af0faf0aff84eb6fadf90b`가 실제로 존재하고 현재 브랜치에 포함됐는지 확인한다.
4. 프론트 라우트·상태·서비스와 Supabase migration·RPC·RLS·Realtime·테스트를 기능별로 추적한다.
5. 확정 명세의 각 기능을 완료/부분 구현/미구현/불일치/확인 불가로 분류한다.
6. 각 기능의 실제 관련 파일, DB 객체, 테스트, 영향 범위를 표로 작성한다.
7. 이미 완료된 그룹 DB/RPC/RLS 안정화를 재작성하지 않도록 보호 영역을 명시한다.
8. P0~P3 우선순위와 기능별 권장 작업 순서를 제안한다.
9. 프로필 구현 전 아바타·cosmetic 검색 목록을 다시 실행하고 운영 DB의 보유·장착·업적 ID 사용 여부를 읽기 전용으로 확인한다.

코드 변경, 마이그레이션 적용, commit, push는 하지 마. 추측과 코드 근거를 분리하고, 발견한 위험에는 파일과 이유를 붙여줘. 마지막에는 다음 기능 채팅에 복사할 수 있는 짧은 인수인계 요약을 작성해줘.
```

## 5. 구현 단계 진입 조건

- 기능 상태표가 작성됨
- 현재 브랜치와 안정화 커밋 상태가 확인됨
- P0 보안·복구 작업과 기능 작업의 순서가 정해짐
- 사용자 변경과 충돌 가능성이 있는 파일이 식별됨
- 실행 가능한 테스트 명령이 정리됨
- legacy 프로필 값과 운영 보상/장착 기록의 확인 가능·불가 범위가 구분됨

## 2026-08-14 Packet 13 Hardening 감사 보완

- `game_rooms.host_user_id`는 저장소의 RPC·RLS·UI에서 현재 활성 host 참조로 사용되며 별도 historical creator 필드는 확인되지 않았다. 따라서 nullable 전환은 빈 종료 방의 활성 host 없음 상태만 표현하고 생성자·결과 이력을 새로 추측하지 않는다.
- 후속 migration은 waiting row만 3~8명·무아이템·1200/120초 규칙으로 정규화하고, playing/finished row와 match result/history는 삭제·왜곡하지 않는다.
- `reconcile_group_host_v13`는 room lock 안에서 retired가 아닌 구성원을 `created_at ASC, id ASC`로 선택해 host role/reference를 함께 갱신한다. 후보가 없으면 모든 role을 guest로 정리하고 host reference를 NULL로 만든다.
- 관전자 이모지와 만료 RPC는 SECURITY DEFINER, 고정 `search_path`, `auth.uid()` 검증, group mode 경계, authenticated/service_role만의 실행 권한, anon 실행 차단을 실제 catalog에서 확인했다.
- 만료 spectator emoji RPC는 기존 `room_events` composite 반환에서 JSONB 구조화 결과로 교체되었고, finalizer 후 예외를 던지지 않아 같은 RPC transaction이 commit된다. 정상 응답은 내부 `event`를 기존 event shape로 유지한다.
- local preflight 결과 group/non-group 설정 위반은 0건이고 두 CHECK는 validated 상태다. 이 기록은 운영 DB 검사 결과가 아니며 운영 dry-run이 별도 gate다.
- `game_rooms.host_user_id` 전용 index는 현재 catalog에 없고 저장소 조회 경로상 즉시 필요한 근거도 확인되지 않았다. 운영 데이터 규모에서 host/RLS 조회 계획을 EXPLAIN으로 확인한 뒤 별도 migration 여부를 결정한다.

## 2026-08-14 Packet 13 Crash Diagnostic 감사

- public RPC catalog: `send_group_spectator_emoji_v13(uuid,text)` OID `33209`, return `jsonb`, owner `postgres`, `VOLATILE`, `SECURITY DEFINER`, `search_path=""`; EXECUTE는 `authenticated/service_role`만 허용하고 `public/anon`은 회수했다. 현재 `pg_depend`는 language/namespace만 남고 reverse dependency는 없다. 이전 composite 반환 OID는 DROP 후 catalog에서 복구할 수 없다.
- `room_events` table OID `18570`, row type OID `18572`; 사용자 trigger는 없고 FK constraint trigger 4개, PK/FK constraint 3개, RLS policy 2개이며 `supabase_realtime` publication에만 포함된다. rate ledger는 publication에 없다.
- 현재 RPC가 호출하는 private chain은 `finalize_group_room_v13` → `finish_group_room_v13`/`reconcile_group_host_v13`/`sync_group_records`이며 모두 SECURITY DEFINER와 빈 search_path를 가진다. 이 chain은 단계별 accepted bisection에서 crash를 만들지 않았다.
- crash diagnostic harness `supabase/tests/group_spectator_emoji_crash_diagnostic.ps1`는 원본 `0135…` fixture가 rollback/cleanup 후 사라져 byte-identical 복원이 불가함을 명시하고 full/minimal substitute를 별도로 생성했다. full은 canonical page/revision·4명·state_version 12, minimal은 해당 nullable 값 없음·3명·state_version 0이며 host, finished spectator, result, auth/profile, publication/trigger 환경은 동일하게 맞췄다.
- direct psql의 새 연결·prepared statement·`DISCARD PLANS`·장기 연결 및 authenticated/service_role accepted 호출은 안정적이었다. 그러나 anon의 권한 거부 호출과, room/fixture가 전혀 없는 동일 ACL의 `RETURNS jsonb` guard 호출이 signal 11로 재현됐다. 따라서 PostgREST schema cache 단독 문제나 `to_jsonb(v_event)` 단독 문제로 단정하지 않는다.
- DB는 PostgreSQL `17.6`, Supabase image `17.6.1.104`, `shared_preload_libraries`에 `pgaudit`, `plpgsql_check`, `plan_filter` 등이 포함된 Alpine 3.23.3/WSL2 container다. 실제 core/backtrace는 없고, 매번 backend termination 후 recovery가 수행됐다. 컨테이너 restart count는 0, postmaster start time은 유지됐다.
- 판정: SQL 함수 수정 근거가 부족하고 runtime crash가 재현되므로 `CODE NO-GO`, `RELEASE HOLD`. 기존 migration 세 개는 수정하지 않았고 후속 migration도 만들지 않았다. clean disposable DB와 다른 PostgreSQL/Supabase image 비교 및 공식 backtrace 확보 전 운영 적용 금지.

## 2026-08-15 Packet 13-R Local Supabase PostgreSQL Runtime Gate 감사

- 비교 image digest: `.095`=`sha256:965e2dfb5a23a0d6541b6106541e777b303656ebabd4e878746b189d550c0a66`, `.104`=`sha256:5deba92e50cd17bfacf8603834d317cdf3bfc1c016ec8293991997fa3b55fa3d`, `.136`=`sha256:f371b5f3f2ac0a05703f33d6e6134515fb2498cab708fb948a0aeb7481467c00`, `.158`=`sha256:99b1729aeb0bac314445024fc149fbd39306170b61dd50800ccf180327ab3459`.
- `.095`와 `.136`/`.158`은 `anon` denied를 `42501 permission denied`로 처리했고 backend PID·postmaster·container가 안정적이었다. `.104`는 단순 권한 거부 함수 호출 1회에서 signal 11과 recovery marker가 발생해 추가 호출 없이 중단했다.
- CLI probe는 현재 `supabase/config.toml`의 `major_version=17`만으로 image를 직접 고정하지 않으며, CLI `2.114.0`이 실제 `.158`을 선택한다는 사실을 확인했다. preflight는 CLI 버전, image tag, image ID/digest를 확인하고 `.104`에서 실패한다.
- `.158` clean DB 두 개는 모두 official migration runner로 12개 migration을 적용했고 세 Packet 13 migration이 `supabase_migrations.schema_migrations`에 기록됐다. Packet13/Atomicity/V2/Phase2C는 각각 33/22/97/49 PASS이며 concurrency와 actual RPC denied/accepted regression도 PASS다.
- test-only 보강은 `group_final_gaps_v13.sql`의 pgTAP extension 준비와 concurrency job의 명시적 container 전달이다. `103000`, `113000`, `123000` 및 `GROUP_SPECTATOR_MIGRATION.sql`은 수정·적용하지 않았다. 운영/linked project는 접근하지 않았다.

## 2026-08-17 Packet 13-R2 Local Runtime Enforcement & PostgREST Smoke 감사

- package.json/package-lock에 Supabase CLI `2.114.0` exact pin을 추가했고, Node 기반 fail-closed runtime preflight와 safe start/clean gate/PostgREST smoke를 저장소 entrypoint로 연결했다. 새 의존성은 CLI pin 자체이며 다른 package manager·최신 fallback은 사용하지 않았다.
- `.104` 원래 volume `supabase_db_wiki`는 보존된 stopped 상태다. 잘못 선택된 disposable `.104` target도 별도 volume으로 격리·중지했고, approved `.158` volume과 섞지 않았다. 현재 기본 container/volume은 `supabase_db_wiki-packet13-r2-clean158`이다.
- 최초 safe start가 ignored CLI state `supabase/.temp/postgres-version=17.6.1.104`를 선택한 사실을 preflight가 image mismatch로 차단했다. 이후 `.158` state와 새 volume을 사용해 재시작했고, 잘못된 image에는 denied ACL probe를 보내지 않았다.
- official reset/db runner 이후 migration history와 RPC catalog/ACL을 다시 확인했다. TAP 구조 검사는 exact plan과 assertion count, `not ok`/Bail out/skip/todo를 함께 판정하며, PowerShell 7/ArgumentList가 없으면 실패한다.
- actual PostgREST smoke는 공개 anon key만 사용해 Auth JWT session과 RPC/RLS 응답을 확인했다. API transport loss 없이 domain error와 SQLSTATE `42501`이 반환됐고, clean158 backend PID/postmaster/restart/log는 안정적이었다.
- 판정: local default는 `CODE GO`이며, 범위는 `.158` approved digest와 CLI exact pin을 통과한 환경으로 제한한다. 운영/linked/Edge/브라우저/Realtime 검증이 남아 사용자-facing release는 계속 `RELEASE HOLD`다.

## 2026-08-18 Packet 13-R3 Deterministic Concurrency Gate 감사

- 기존 business migration `20260814103000`, `20260814113000`, `20260814123000`, RPC signature, JSONB 반환 계약, RLS/ACL은 수정하지 않았다. 변경은 concurrency harness, pure validation seam/test, safe start의 vector 제외, 문서다.
- deterministic harness는 coordinator가 transaction-level advisory lock을 소유한 뒤 A가 room row lock과 advisory wait에 도달했음을 catalog에서 확인하고, B가 A PID를 blocker로 두고 `transactionid` wait 중임을 확인한 뒤 coordinator cancel로 barrier를 해제한다. A commit 후 B가 재개하므로 lock winner와 결과 관찰이 분리된다.
- finalizer-first와 emoji-first hard/grace, hard/grace equality를 고유 fixture로 3회 반복했다. A/B raw PID·xact start·wait event·blocker, 결과(`finalized=false/true`), `game_end=1`, retired/result/host/cardinality invariant 및 cleanup을 모두 보존했다. orphan `r3-*` activity는 최종 확인에서 0건이었다.
- preflight/clean gate의 pure validator는 실제 negative-control 입력을 통해 false-green을 차단한다. 이전 `signal11=False` 진단 필드 오인 정규식도 수정해 실제 `signal 11` 표기만 dangerous marker로 분류한다.
- Vector는 `vector:0.53.0-alpine`이 Docker host `2375` endpoint를 열 수 없어 정상 기동 직후 source를 종료하고 restart loop에 들어간 것으로 확인했다. Wiki Race는 Logs Explorer/analytics ingestion을 기능 경로로 사용하지 않으며, 공식 CLI `-x vector`로 제외해 기능 서비스와 분리했다. 이는 CODE 차단점이 아닌 observability MINOR다.
- 판정: `CODE GO — default local runtime and deterministic gate verified`; 운영 runtime·browser/Realtime·F5/offline/throttle·Wikipedia snapshot·dry-run·Release A~D는 여전히 `RELEASE HOLD`다.

## 2026-08-18 Packet 13-R3.1 Harness Evidence Preservation Closure 감사

- `Invoke-ConcurrentSql`의 child stream 병합 지점은 제거됐다. 공용 helper가 stdout/stderr를 별도 raw 문자열로 읽고, process ID·worker 이름·UTC start/end·exit·timeout·connection-loss·cleanup 상태를 반환한다. secret-like text는 evidence 출력 전에 redaction한다.
- deterministic, host-leave, deadline emoji, third-finish 경로의 Job lifecycle은 Stop → Receive → Remove를 모두 시도하고 단계별 결과를 기록한다. 실패는 전역 aggregate에 남으며 primary exception을 덮지 않고 최종 parent exit nonzero로 전파된다. timeout 경로는 정리 후 orphan 여부를 self-test에서 확인한다.
- DB 없는 self-test는 separate-streams/nonzero, Stop/Receive/Remove fail injection, primary+cleanup 동시 보존, timeout orphan-free를 모두 PASS했다. clean gate는 이 self-test를 공식 migration/TAP/concurrency gate보다 먼저 실행한다.
- 기존 Packet 13 migration 3개, 함수 signature/반환 계약, ACL/RLS, V2/Phase 2C 구현은 변경하지 않았다. `GROUP_SPECTATOR_MIGRATION.sql`도 제외 상태를 유지했다. 기존 R3 deterministic 순서와 fixture invariant는 변경하지 않았다.
- DB 비의존 회귀는 `npm test` 124/124, build, Node·PowerShell syntax, `git diff --check`를 PASS했다. 공식 clean gate는 self-test PASS 후 Docker 미기동 `ECONNREFUSED 127.0.0.1:54322`로 migration runner를 fail-closed 종료했으며, approved `.158` 컨테이너 단계 결과는 아직 없다.

판정: Packet 13 official harness는 fail-closed 구현 검증 `GO`; 컨테이너 gate 재실행과 그 전까지의 runtime/release 판정은 `NO-GO`, `RELEASE HOLD`다.

## 2026-08-18 Packet 13-R3.2 Third-Finish Parser Final Closure 감사

- 확인된 parser 결함은 `Run-ThirdFinishScenario`가 separated stdout 전체를 `APPLIED`/`STATE_VERSION_CONFLICT`/`GAME_NOT_ACTIVE`와 비교한 것이었다. psql의 `SET` status line이 포함되어 허용 code가 0개로 계산됐다.
- 수정은 `group_final_gaps_v13_hardening_concurrency.ps1`의 test-only SQL marker와 공용 `Parse-Packet13WorkerResults` helper에 한정했다. `PACKET13_RESULT|worker|code`와 context worker 기반 `PACKET13_RESULT=code`를 지원하며, raw stdout/stderr는 redaction 후 진단에 보존한다.
- parser self-test는 실제 parse/reject 결과를 확인했고 positive 4종, negative 10종을 PASS했다. legacy emoji assertion에도 같은 stream 분리 회귀에 대한 line split만 적용했으며 시나리오 의미는 바꾸지 않았다.
- approved `.158` runtime은 image `17.6.1.158`, digest `sha256:99b1729aeb0bac314445024fc149fbd39306170b61dd50800ccf180327ab3459`, PostgreSQL `17.6`, healthy, restart `0`, orphan `r3-*` activity `0`이었다. third-finish 단독과 전체 concurrency harness는 PASS했다.
- clean gate는 migration runner PASS 후 preflight log check에서 실패했다. 현재 log tail에는 startup recovery와 `unexpected EOF`가 포함되어 `dangerous_marker=true`가 되었고, PostgREST smoke도 기능 case는 PASS했지만 동일 runtime-stability log 판정에서 실패했다. 이는 parser나 production SQL/RPC 결함으로 단정하지 않는다.

판정: third-finish parser/harness는 `GO`; frozen approval criterion인 clean gate exit 0 미충족으로 Packet 13 `CODE NO-GO`, 운영 적용 `RELEASE HOLD`다.

## 21. 2026-08-18 Packet 13 Final Log-Window Gate

- 전체 `docker logs` 위험 문자열 판정을 공식 gate의 현재 실행 판정으로 사용하지 않고, baseline 고정 후 test-only `RAISE LOG` START/END marker 사이만 current evidence로 판정하도록 정리했다. runtime preflight의 log 단계는 clean gate에 한해 window 판정으로 위임하며 standalone preflight는 기존 fail-closed 전체 로그 검사를 유지한다.
- pure parser는 current window의 fatal marker와 window 밖 historical marker를 분리하고, marker exactly-once/order, run-id 일치, container ID, postmaster start time, restart count 안정성을 fail-closed로 확인한다. marker SQL statement logging 중복을 피하기 위해 marker token은 RAISE 인자로 조립한다.
- `.158` 환경 증거: container `33f879e1ac23915d0211dd466bebc23143dcc787327442829076bc39c3759142`, PG `17.6`, postmaster `2026-08-18 01:31:36.816875+00`, restart `0`, approved image/digest와 CLI `2.114.0` 일치.
- clean run `packet13-f7f2779b-9d76-4670-a65a-bb8172adfeda`와 독립 PostgREST run `packet13-bd859f66-7d1e-4f6b-8cbc-cc148778a5c4` 모두 START/END exactly-once, ordered, current fatal `0`, runtime baseline stable이었다. historical fatal `30`은 timestamp/PID/context와 함께 별도 분류됐다.
- clean gate는 migration runner, Packet13/Atomicity/V2/Phase2C TAP `33/22/97/49`, deterministic concurrency 3회, crash regression 4종을 통과했고 PostgREST functional smoke도 통과했다. DB-free parser self-test 및 Node 회귀 `126/126`, build, syntax, diff check도 PASS다.

판정: `CODE GO — approved local .158 + CLI 2.114.0 + run-scoped log-window`; historical log evidence는 보존·보고 상태다. 운영/linked DB, Edge Function, browser/Realtime, 운영 dry-run, Release A~D는 `RELEASE HOLD`다.
