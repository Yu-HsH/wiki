# 기능 패킷 02 — 그룹 레이스 최종 차이

기준 문서: `../01-CONFIRMED-SPEC.md`  
목표: 이미 안정화된 그룹 DB/RPC/RLS를 보존하면서 최종 기획과의 작은 차이만 반영

## 1. 보호할 완료 영역

다음은 완료 보고된 영역이다. 현재 코드와 테스트로 사실을 확인하되 이유 없이 다시 설계하지 않는다.

- 그룹 direct table write 제거
- 서버 권위 결과와 history/stats 저장
- 3등 이후 grace lifecycle
- 4등 이후 정상 완주
- 미완주 RETIRE finalizer
- 완주 후 관전과 F5 복원
- 방장 승계
- 모드별 RLS와 authenticated 직접 공격 차단
- 싱글·1:1 회귀

완료 기준 커밋으로 `37adc698c40356ec61af0faf0aff84eb6fadf90b`가 보고됐다. 현재 포함 여부를 먼저 확인한다.

## 2. 최종 확정 차이

### 2.1 시간

- [ ] 전체 제한을 시작 후 20분으로 설정
- [ ] 3등 완주 후 2분 grace 유지
- [ ] 실제 마감은 두 시각 중 빠른 값
- [ ] 3등 완주가 즉시 room finished로 바뀌지 않음
- [ ] 4등 이후 마감 전 완주는 정상 rank
- [ ] 전원 resolved면 조기 종료
- [ ] 기존 10분 상수·기본값·테스트·도움말 문구 전수 확인

### 2.2 방장

- [ ] 경기 전 이탈 시 `joined_at` 기준 다음 참가자 승계
- [ ] 동률일 때 안정적인 보조 정렬키 사용
- [ ] 경기 중 미완주 방장 이탈은 RETIRE + 승계
- [ ] 완주 후 관전 방장 이탈은 결과 유지 + 승계
- [ ] 경기 중 강제 종료·kick 권한 없음
- [ ] 재대결/대기실에서 새 방장 권한 정상 동작

### 2.3 관전 이모티콘

- [ ] 텍스트 채팅 없음
- [ ] 서버가 허용한 preset ID만 수신
- [ ] 발신자별 3초 rate limit
- [ ] 완주 관전자만 전송 가능
- [ ] 동일 발신자의 화면 표시 하나만 유지
- [ ] 사용자별 이모티콘 숨기기
- [ ] 전체 이모티콘 끄기
- [ ] mute는 경기 결과·Realtime 참가 상태에 영향 없음
- [ ] 이모티콘은 history에 영구 저장하지 않아도 됨
- [ ] 악의적인 payload·다른 방 전송 거부

### 2.4 표현

- [ ] 사용자 화면에서 미완주 상태를 `리타이어`로 표시
- [ ] 내부 사유는 timeout/left/disconnected 등으로 분리 가능
- [ ] 순위표에 진행·완주·리타이어·연결 끊김·관전 상태 표시
- [ ] 모바일 최대 8명 상태를 접을 수 있는 바텀시트로 제공

## 3. 테스트 시나리오

1. 4인 경기에서 3등 완주 후 4등이 2분 안에 정상 완주한다.
2. 3등이 19분 30초에 도착하면 20분 마감이 우선한다.
3. 3등이 빠르게 도착하면 정확히 2분 grace를 제공한다.
4. 3등 전 전원이 resolved면 즉시 종료한다.
5. 마감 직전/직후 완주 요청 경계에서 한 번만 결과가 확정된다.
6. 경기 전·진행 중·완주 후 관전 중 방장 이탈을 각각 검증한다.
7. 새 방장이 재대결/대기실 권한을 갖는다.
8. 관전자 이모티콘 rate limit, 다른 방 위조, 미완주자 전송을 거부한다.
9. 사용자별 mute와 전체 mute가 로컬 표시만 바꾸고 경기에는 영향을 주지 않는다.
10. F5 후 참가자 순위·현재 문서·관전 상태가 유지된다.

## 5. 2026-08-14 구현 결과

### 완료한 범위

- `supabase/migrations/20260814103000_group_final_gaps_v13.sql`에 그룹 3~8명, 무아이템, 1200초 hard deadline, 120초 grace, `least(hard, grace)` 종료 규칙을 반영했다.
- 서버 RPC가 개인 완주·late finish·DNF/RETIRE·전원 resolved 조기 종료를 판정하고, 경기 전/중/완주 후 이탈 시 `created_at, id` 순으로 방장을 승계한다.
- `room_events`의 기존 Realtime 경로를 재사용해 preset 이모티콘만 허용하고, 발신자별 3초 rate limit과 완주 관전자/방 검증을 서버에서 수행한다. 별도 텍스트 채팅과 이모티콘 영구 history는 추가하지 않았다.
- 관전 화면은 서버의 `current_page_id/current_revision_id`를 기준으로 Wikipedia `oldid` 본문을 읽기 전용으로 표시하며, 링크는 새 탭에서 연다.
- JS 계약 테스트와 SQL 계약 테스트를 추가했고, 기존 싱글·1:1 경로는 변경하지 않았다.

### 검증 상태와 보류 항목

- 완료: `npm test` 118개, Vite build, 변경 파일 whitespace 검사.
- 보류: Supabase CLI·psql·sqlfluff 및 Docker 로컬 DB를 사용할 수 없어 migration lint/apply, pgTAP 실제 실행, authenticated RPC/RLS 공격, Realtime cloud smoke, 2~8세션 브라우저 시나리오는 확인하지 못했다.
- 따라서 본 패킷은 `코드 구현 완료·DB 런타임 검증 보류`로 분류하며, Packet 13 변경은 commit/push하지 않는다.

## 6. 2026-08-14 Packet 13 Hardening

독립 검증에서 확인된 결함만 후속 additive migration으로 보완했다.

- migration: `supabase/migrations/20260814113000_group_final_gaps_v13_hardening.sql`
- BLOCKER: 빈 종료 방은 활성 host 없이 `host_user_id=NULL`로 보존하고, 기존 `group_match_results`·경기 이력은 유지한다. 활성 구성원이 있는 방은 deterministic oldest candidate 한 명만 host가 된다.
- MAJOR: spectator emoji는 hard/grace 중 빠른 deadline을 서버 시간으로 계산하고, 만료 시 authoritative finalizer를 먼저 호출한 뒤 event/rate ledger를 쓰지 않는다.
- MAJOR: `finalize_group_room_if_expired`는 group mode 확인을 group 전용 mutation보다 먼저 수행한다. duel participant/non-participant 모두 `NOT_A_GROUP`이며 room state/version은 변경되지 않는다.
- MINOR: legacy 함수 부재 검사는 `to_regprocedure()`를 사용하고, 동시성 검사는 별도 PowerShell·psql 세션 harness로 분리했다. 동일 request 재시도는 기존 V2 harness로 event/result 중복이 없음을 확인한다.
- NOT VALID: 기존 group 제한 위반을 상태별 preflight로 조회하고, 안전하게 정규화 가능한 waiting row만 보정했다. 실제 group/non-group 위반 row가 0건이어서 두 CHECK 모두 `VALIDATE CONSTRAINT` 상태다.
- 최종 atomicity 보완: 만료 spectator emoji는 `SPECTATOR_ROOM_EXPIRED`를 SQL exception으로 올리지 않고 `accepted=false`, `finalized`, 최신 `room`, `state_version`, `event_id=null`을 JSONB로 반환한다. 따라서 hard/grace finalization·RETIRE/DNF·`game_end`는 commit되고 emoji event/rate ledger는 생성되지 않는다.

로컬 raw `psql` 적용과 테스트는 완료했지만 migration runner clean apply, 운영 DB dry-run, 실제 브라우저·Realtime 다중 세션 검증과 Release A~D 승인은 여전히 release gate다. 이번 hardening 변경도 commit/push하지 않는다.

## 7. 2026-08-14 Packet 13 Crash Diagnostic

- SIGSEGV는 로컬 PostgreSQL에서 실제 재현됐다. 로그의 최소 target statement는 `select public.send_group_spectator_emoji_v13('<room>','cheer')`이며, anon 권한 거부 경로에서도 backend PID가 signal 11로 종료됐다. PostgreSQL은 다른 server process를 종료하고 automatic recovery를 수행했으며 컨테이너 자체는 재시작하지 않았다.
- full/minimal accepted fixture와 내부 단계 실험은 모두 성공했다. room lock → player lock → preset → rate ledger → event insert → `RETURNING * INTO` → `to_jsonb(v_event)` → JSONB envelope → rate upsert → final JSON 순서에서 독립 실패 지점은 확인되지 않았다.
- 결정적 축소 재현은 room/event/fixture 없이 `EXECUTE`가 없는 `RETURNS jsonb` 함수를 `anon` role이 직접 호출하는 경우다. 따라서 현재 root cause는 Packet 13의 room business logic이 아니라 로컬 Supabase/PostgreSQL 17.6 runtime 또는 preload extension/privilege catalog 경로로 좁혀졌지만, core/backtrace 부재로 내부 함수까지 확정하지 않았다.
- full/minimal 차이: full은 canonical page/revision과 4명, state_version 12를 사용하고 minimal은 canonical 식별자 NULL, 3명, state_version 0이다. 두 fixture 모두 같은 host/finished spectator/result/auth/JWT/role/transaction/publication/trigger 조건을 사용했고, 기존 event/rate ledger는 0건으로 시작했다.
- 새 direct 연결, 기존 장기 연결, prepared/unprepared, transaction 밖 `DISCARD PLANS`, authenticated/service_role은 accepted 1건과 event/rate ledger 1건으로 안정적이었다. anon 호출은 권한 거부 대신 backend crash가 발생했다. PostgREST cache가 아닌 direct psql에서도 발생했다.
- 이 진단에서는 `20260814103000`, `20260814113000`, `20260814123000`을 수정하지 않았고 `group_spectator_emoji_backend_crash_fix` migration도 생성하지 않았다. `CODE NO-GO`와 `RELEASE HOLD`를 유지한다. runtime 버전 교체는 코드 수정과 분리해 제안할 항목이다.

## 8. 2026-08-15 Packet 13-R Local Supabase PostgreSQL Runtime Gate

- 공식 issue [#2112](https://github.com/supabase/postgres/issues/2112)의 회귀 범위와 로컬 증상이 일치함을 확인했다. `.095`는 control PASS, `.104`는 denied 1회에서 SIGSEGV 재현, `.136`과 실제 CLI target `.158`은 denied/allowed 반복 안정성 PASS다.
- CLI `2.114.0` probe 결과 local `major_version=17` runtime은 `.158` (`sha256:99b1729aeb0bac314445024fc149fbd39306170b61dd50800ccf180327ab3459`)이다. `supabase/tests/supabase_runtime_preflight.ps1`가 `.104` 사용을 실패로 차단한다.
- `.158` clean DB 1·DB 2에서 공식 `db push`로 전체 migration을 적용했고, `103000/113000/123000` history와 Packet13 33/33, Atomicity 22/22, V2 97/97, Phase2C 49/49, deterministic hard/grace/lock-order concurrency, actual RPC crash regression을 모두 통과했다.
- 수정 범위는 business SQL이 아닌 검증 경계다: crash harness의 false-green 제거, runtime image gate, clean migration runner, pgtap 준비, concurrency container 전달. RPC 반환 JSONB 계약과 기존 migration은 변경하지 않았다.
- CODE는 `.158` + CLI `2.114.0` + preflight가 적용되는 환경에서만 `GO — verified target runtime constrained`다. 현재 `.104` 로컬 DB를 교체하지 않았으므로 현재 실행 환경 preflight는 FAIL이며, 운영·브라우저·Realtime·dry-run 승인 전 `RELEASE HOLD`를 유지한다.

## 4. 검토 채팅 시작 프롬프트

```text
Wiki Race 그룹 모드의 최종 확정 규칙과 현재 안정화 구현의 차이만 검토해줘.

`01-CONFIRMED-SPEC.md`, `13-GROUP-FINAL-GAPS.md`, 저장소 감사 결과를 읽고, 먼저 읽기 전용으로 현재 group lifecycle/RPC/RLS/Realtime/UI/test를 확인해. 완료 보고된 그룹 안정화를 재설계하지 말고 다음 세 차이만 집중해:

1. 전체 제한 20분 + 3등 후 2분 중 빠른 마감
2. 경기 전/중/완주 후 방장 승계 표현과 권한
3. 관전 채팅 없이 preset 이모티콘, 3초 쿨타임, 사용자별/전체 음소거

현재 10분 값이 남은 위치, 바꿔야 할 DB default/RPC/test/UI 문구, 이모티콘을 영구 채팅 시스템 없이 구현할 최소 Realtime 구조를 제안해. 수정 전에 영향 범위와 회귀 테스트 계획을 보고하고, 최종에는 구현용 Codex 프롬프트를 작성해줘.
```

## 5. 승인 후 Codex 구현 프롬프트

```text
승인된 그룹 최종 차이 계획을 구현해줘. 기존 그룹 RPC/RLS/history/stats 구조는 보존하고 필요한 최소 변경만 수행해.

전체 제한을 20분으로 반영하되 3등 후 2분 grace와의 min 규칙, 4등 정상 완주, 전원 resolved 조기 종료를 유지해. 방장 승계의 세 이탈 시점을 테스트하고, 텍스트 채팅 없이 preset 관전 이모티콘·3초 rate limit·사용자별/전체 음소거를 추가해.

DB/RPC/RLS/JS 테스트와 build를 실행하고 4인 lifecycle, 19분 30초 경계, F5, 방장 승계, 위조 이모티콘, 싱글·1:1 회귀 결과를 보고해. commit과 push는 하지 마.
```

## 9. 2026-08-17 Packet 13-R2 Local Runtime Enforcement & PostgREST Smoke

- 기본 개발 스택은 project ID `wiki-packet13-r2-clean158`, container/volume `supabase_db_wiki-packet13-r2-clean158`으로 분리했다. 기존 `.104` `supabase_db_wiki` volume은 보존하고 새 `.158` DB에 연결하지 않았다.
- CLI `2.114.0` exact pin과 `postgres-version=17.6.1.158` runtime state를 사용한다. preflight는 tag `17.6.1.158`, image ID/digest `sha256:99b1729aeb0bac314445024fc149fbd39306170b61dd50800ccf180327ab3459`, PG 17.6, migration history, RPC catalog/ACL을 모두 검사한다.
- full/minimal crash fixture 비교는 다음과 같다.

| 차원 | full | minimal |
|---|---|---|
| canonical page/revision | page/revision 값 존재 | nullable 값 NULL |
| room/player | 4명, host + finished spectator + active 3명 | 3명, host + finished spectator + active 2명 |
| state version | 12 | 0 |
| 공통 조건 | 같은 group status/deadline, host/finished result, auth/profile/JWT role, 외부 transaction, 기존 event/rate 0건, publication/trigger 환경 | 동일 |

- fresh reset 후 full/minimal accepted, prepared/unprepared, transaction 밖 `DISCARD PLANS`, long-lived, service_role와 실제 PostgREST client를 모두 확인했다. clean158에서는 signal 11, connection loss, postmaster 변경, restart, recovery log marker가 0건이었다.
- PostgREST smoke 결과: accepted event와 3초 ledger, 4초 재시도 accepted, hard/grace 만료 `accepted=false`/emoji event 0/rate ledger 0/`game_end` 1, latest room/results, invalid preset/nonmember/unfinished/duel rejection, anon RPC 및 직접 `room_events` insert `42501`을 확인했다.
- Packet 13의 세 business migration과 JSONB 반환 계약은 수정하지 않았다. 추가된 변경은 runtime gate/harness/entrypoint와 문서뿐이다.

판정: `CODE GO — clean158 local default only`. `.104` 또는 미승인 digest가 기본 경로로 선택되면 ACL 호출 전에 `CODE NO-GO`가 된다. 운영/linked/Edge/browser/Realtime/dry-run 항목은 `RELEASE HOLD`다.

## 10. 2026-08-18 Packet 13-R3 Deterministic Concurrency Gate Closure

- Packet 13 SQL/RPC 동작은 다시 바꾸지 않고 공식 concurrency harness의 검증력을 보강했다. room lock을 직접 관측해야 하므로 진단 세션은 관리자 연결에서 실행하되, RPC에는 실제 spectator/active `auth.uid()` claim을 설정하고 production `SECURITY DEFINER` 경로를 호출한다. authenticated ACL은 별도 preflight/PostgREST smoke에서 계속 검증한다.
- hard/grace finalizer-first와 emoji-first에서 coordinator advisory owner → A room lock owner/barrier wait → B A-PID blocker wait → barrier release → A commit → B resume 순서를 catalog evidence로 확인했다. B의 최종 emoji 응답은 `accepted=false`, `SPECTATOR_ROOM_EXPIRED`, order에 따라 `finalized=false/true`로 일치했다.
- hard/grace equality fixture는 같은 PostgreSQL `clock_timestamp()`를 deadline에 기록하고 즉시 RPC를 호출했다. production `>=` 계약으로 hard `time_limit`, grace `grace_timeout`이 각각 확정됐고 event/rate ledger는 생성되지 않았다.
- 각 시나리오는 고유 room/user와 cleanup을 사용한다. cleanup 실패·worker timeout·예상 PID/wait 미관측·child nonzero·connection loss/recovery/signal 11·assertion 부족은 parent exit nonzero가 된다. fresh fixture 3회 모두 PASS했다.
- `supabase_vector`는 선택적 observability 서비스이며 `host.docker.internal:2375` 연결 거부로 restart loop였다. 공식 `--exclude vector`로 target `.158`에서 제외했고 DB/Auth/PostgREST/Realtime/Storage는 healthy/기능 smoke PASS였다. 기능 구현 blocker가 아니라 MINOR로 기록한다.
- preflight/clean gate pure negative controls와 Vite large chunk warning은 각각 안전성 검증과 성능 backlog로 분리했다. Packet 13 반환 계약·migration·운영 적용은 건드리지 않았다.

판정: `CODE GO — default local runtime and deterministic gate verified` (CLI `2.114.0` + approved `.158` digest + 6개 deterministic scenario 3회 + false-green negative control). 실제 브라우저/Realtime 2~8세션, F5/offline/throttle, Wikipedia snapshot, 운영/linked PostgreSQL, 운영 dry-run, Release A~D는 `RELEASE HOLD`다.

## 11. 2026-08-18 Packet 13-R3.1 Harness Evidence Preservation Closure

- 정상 spectator emoji RPC의 backend 원인을 다시 추측하거나 반환 계약을 변경하지 않고, Packet 13 공식 concurrency harness의 증거 경계를 수정했다. child stdout/stderr는 `2>&1` 없이 분리 보존되고 worker/scenario, process ID, start/end, exit, timeout, connection-loss와 raw stream이 함께 기록된다.
- stderr 단독 출력은 실패가 아니며 exit code·timeout·dangerous runtime marker가 실패 계약이다. connection reset, signal 11, recovery 등은 어느 stream에 나타나도 fail-closed로 분류한다. secret-like 값은 출력 시 redaction한다.
- Job cleanup은 Stop/Receive/Remove를 순서대로 모두 시도하고 단계별 실패를 집계한다. primary failure와 cleanup failure를 모두 보고하며 cleanup failure만으로도 parent nonzero가 된다. fixture SQL cleanup도 같은 집계 경계에 포함했다.
- DB 없는 self-test가 stdout/stderr 분리, nonzero child, Stop/Receive/Remove 각 주입 실패, primary+cleanup aggregate, timeout 후 orphan 0을 통과했다. clean gate는 이 self-test 실패 시 TAP이나 concurrency를 PASS 처리하지 않고 중단한다.
- 이번 수정은 `supabase/tests/group_final_gaps_v13_hardening_concurrency.ps1`, 전용 helper/self-test, `scripts/supabase-clean-gate.mjs`와 handoff 문서에만 적용했다. 세 Packet 13 migration, RPC/JSONB 반환 계약, V2/Phase 2C-5, 운영 DB/Edge Function은 수정·배포하지 않았다.
- 확인 결과: self-test PASS, 실제 Job cleanup probe PASS, `npm test` 124/124, `npm run build` PASS, Node/PowerShell syntax PASS, `git diff --check` PASS. 공식 clean gate는 self-test PASS 뒤 Docker 미기동 `ECONNREFUSED 127.0.0.1:54322`에서 fail-closed 되었고 approved `.158`의 clean gate/6×3 runtime 재실행은 남아 있다.

판정: official harness fail-closed는 `GO`; runtime clean gate 재실행 전 Packet 13은 `CODE NO-GO`, 운영·linked·Edge·user-facing release는 `RELEASE HOLD`다.

## 12. 2026-08-18 Packet 13-R3.2 Third-Finish Parser Final Closure

- third-finish worker의 실제 stdout은 `SET`, `SET`, `APPLIED`였고, 기존 전체 문자열 비교가 이를 하나의 code로 취급해 `codes=[]`를 만들었다. 이는 parser bug이며 Packet 13 RPC/migration 반환 계약 결함이 아니다.
- harness 내부 SQL이 worker별 `PACKET13_RESULT|third-finish-one|code` marker를 출력하도록 했고, 공통 parser가 trim/line split/exact prefix/worker uniqueness/allowed code/child exit·timeout·connection-loss/stderr SQL error를 검증한다. production SQL/RPC는 수정하지 않았다.
- DB 없는 parser self-test는 LF/CRLF와 psql noise, equals marker, `APPLIED` 및 기존 conflict code를 positive로 통과시키고 marker missing/duplicate/malformed/empty/unknown/mismatch/wrong prefix/nonzero/connection-loss/stderr error를 reject했다.
- `.158` third-finish 단독 결과: worker 1 marker `APPLIED`, worker 2 marker `GAME_NOT_ACTIVE`, 각 1개, exit 0, stderr SQL error 없음, event/result cardinality와 cleanup PASS. 전체 concurrency harness도 exit 0으로 6개 deterministic/equality/legacy scenario를 통과했다.
- 공식 clean gate는 self-test와 migration runner까지 PASS했지만 runtime preflight `postgres-log`가 기존 `.158` startup recovery/`unexpected EOF` evidence를 dangerous marker로 판정해 exit 1이었다. 따라서 parser 수정만으로 clean gate를 우회하지 않았고 최종 CODE GO를 선언하지 않았다.

판정: third-finish parser closure `GO`; frozen clean gate exit 0 조건 미충족으로 Packet 13 `CODE NO-GO`, 기존 browser/Realtime/운영 및 Release A~D는 계속 `RELEASE HOLD`다.

## 21. 2026-08-18 Packet 13 Final Log-Window Gate

- 정상 spectator emoji RPC의 반환 계약이나 세 migration은 수정하지 않았다. `clean-gate`와 `postgrest-smoke`가 공통 test-only `RAISE LOG` writer와 pure window parser를 사용한다.
- 각 실행은 baseline → `PACKET13_GATE_START|packet13-<uuid>` → migration/TAP/deterministic/crash 또는 PostgREST smoke → `PACKET13_GATE_END|same-run-id` 순서다. marker가 없거나 중복·역순·run-id 불일치, container/postmaster/restart 변화가 있으면 fail-closed다.
- clean `.158` accepted/concurrency/crash 회귀 결과: TAP `33/33`, `22/22`, `97/97`, `49/49`, deterministic 3회, crash 4종, final current window fatal 0. START/END는 각 1개이며 postmaster/restart는 변하지 않았다.
- 독립 PostgREST accepted/rate-limit/retry/hard/grace expiry/nonmember/duel/RLS/event-ledger smoke도 PASS했고 final current window fatal 0이다. historical recovery/startup/EOF 30건은 현재 window 밖으로 분리해 보존했다.
- hard/grace finalizer 경합, equality boundary, RETIRE/DNF, host invariant, game_end/event/rate cardinality는 기존 R3 concurrency/atomicity 결과를 유지하면서 이번 clean gate에서도 재확인됐다. backend PID 비정상 종료·postmaster restart·signal 11은 current window에서 0건이다.

판정: approved local `.158` runtime에서 Packet 13 기능·원자성·동시성·log-window gate는 `CODE GO`; 운영 적용, Edge Function, browser/Realtime, linked DB와 Release A~D는 별도 `RELEASE HOLD`다.
