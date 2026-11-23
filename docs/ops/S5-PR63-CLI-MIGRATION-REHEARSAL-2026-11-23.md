# PR #63 실행 권한·CLI Migration 이력 후속 리허설

기준: `6b336c10abafc2fe4a1c25e74e2f5fadd97792a4` + 미커밋 격리 작업 트리.
확인일: **2026-11-23 KST**. 아래 모든 검증 수치는 이 기준과 날짜의 로컬 산출물이다.
운영 적용·권한 변경·배포·commit/push 승인이 아니다.

## 판정

**실행 권한과 Migration 이력 연결의 두 기술 BLOCK은 로컬 검증에서 PASS로 전환했다.**
운영은 59개 이력을 유지하며 PR #63은 Draft다. 실제 운영 적용은 **BLOCK / 승인 대기**다.
이번 결과는 수정된 로컬 후보에 대한 것이며, 원격 PR의 기존 unconditional SQL을 승인하는 결과가 아니다.

| 항목 | 판정 | 확인 내용 / 산출물 |
|---|---|---|
| 최신 운영 읽기 전용 확인 | PASS | TLS 검증 + READ ONLY 트랜잭션. 최초/최종 역할·멤버십·카탈로그·59개 이력 동일. `final-production-readonly-result.json` |
| 동일 실행 역할 | PASS | 실제 CLI password 경로의 executor=`postgres`; SET/INHERIT 없는 운영 역할 계약으로 재현. `execution-role-cli-proof.json` |
| 최소 권한 bridge | PASS | 이미 있는 ADMIN을 사용한 트랜잭션 내 임시 자기 grant와 public CREATE 차용; 기존 전체 멤버십·public ACL·6개 앱 역할 속성 복원 |
| 실제 운영 백업 복원본 59→64 | PASS | 기존 182개 테이블의 원본 행 지문, 기존 59개 이력 행 보존. `path_upgrade_r5-result.json` |
| 신규 설치 0→64 | PASS | 별도 PG 클러스터, 앱 역할 0개/이력 0개에서 실제 CLI 적용. `fresh-zero-result.json` |
| 신규/기존 최종 구조 | PASS | 앱 스키마의 테이블·컬럼·인덱스·제약·RLS·ACL·함수·트리거·publication 비교 차이 0. `fresh-upgrade-convergence.json` |
| CLI 변경+이력 원자성 | PASS | S5의 마지막 CLI 이력 INSERT를 고의 실패시켜 DDL·데이터·역할·59개 이력 전체 원복 후 재시도 64 |
| 5개 전체 단일 트랜잭션 | BLOCK | **지원한다고 가정하지 않는다.** 세 번째 파일 실패 시 앞 2개는 커밋되어 이력 61. 실패 파일만 원복; 정상 후보 재개 후 64 |
| 중단·재시도·완료 후 재실행 | PASS | 기존 61개 이력 행 불변, 최종 64, 완료 후 재실행은 데이터/이력 무변경. `cli-failure-retry-result.json` |
| Realtime 만료 파티션 | PASS | 원본 모두 존재 / 빈 만료 2개 부재 / 빈 만료 3개 부재 모두 실제 CLI 성공. 3개 부재 경로 CLI 약 13.96초, 운영 SLA 아님 |
| 가드가 거절해야 할 변동 | PASS | 기존 ACL 변경·RLS 해제·미검토 객체·미만료 파티션 삭제·부분 설치 5종 거절. 실패 후 역할/카탈로그/59개 이력 원복 |
| pgTAP 전체 | PASS | **36파일, 1,682 assertions**, SQL exit·plan·`not ok` 모두 검사. fixture 전후 원본 182개 지문 및 이력 64 동일 |
| 실제 Auth/브라우저 | PASS | S5 3인, v4 2인, 일반 1:1, 기존 그룹 3인. UI 로그인·참가·READY·시작·문서 이동·완주·결과·XP·F5·재경기 |
| 실제 패링/방어 영수증 | PASS | 브라우저 입력 후 `PARRY_ACCEPTED`, `PROTECTION_ACTIVE` 실서버 영수증 확인. `browser-receipt-proof.json` |
| XP 중복·RLS | PASS | 기존 XP 요청 817개 재생 시 추가 지급 0, 수신자 2명 격리·익명/직접 쓰기 거절. `final-security-proof.json` |
| 원본 사용자·XP·업적·경기 기록 | PASS | E2E 후 원본 행의 해시별 중복 개수까지 전부 잔존. 합성 계정/경기/보상만 추가. 앱 카탈로그는 CLI-64 결과와 동일 |
| 물리 테이블 수 영구 182 유지 | BLOCK | Realtime 실행 후 빈 만료 자식 11/17·18·19가 정상 정리되어 원본 중 179개 존재. 원본 행 손실 0. 비실행 원본 복원 DB는 182개 유지 |
| JavaScript / build | PASS | `npm test` **918/918**, `npm run build` exit 0. 기존 `use client` 경고는 잔존 |
| lint / diff 형식 | BLOCK | lint script 없음. `git diff --check`는 복사한 기존 `actor_uid_v1` 함수 본문의 `select ` 공백 1곳 지적. 함수 텍스트 보존 때문에 유지 |
| 기존 Docker·백업 보존 | PASS | 기존 컨테이너 317개·볼륨 122개 삭제 0, 원본 archive SHA-256 동일. 이번 실행 서비스/DB만 정지, 볼륨 보존 |
| 운영 실행·Edge·병합·배포 | BLOCK | 이 작업의 허용 범위 밖. 실행 0, PR Draft 유지, commit/push 0 |

공개 가능한 상세 수치와 파일별 결과는
[`verification-results.json`](../../server-proposals/pr63-cli-path-20261123/verification-results.json),
정확한 후보 바이트 지문은
[`candidate-manifest.json`](../../server-proposals/pr63-cli-path-20261123/candidate-manifest.json)에 있다.
원시 DB/계정/브라우저 로그는 이 문서에 포함하지 않는다.

## 실행 권한 원인과 해결

[산출물] 운영 `postgres`는 NOSUPERUSER, CREATEROLE, BYPASSRLS이며
`ink_product_owner`의 기존 멤버십은 `ADMIN=true`, `SET=false`, `INHERIT=false`다.
ADMIN은 역할을 관리할 능력이고 SET ROLE 권한과 별개이므로, 기존 SQL의 owner 전환이 실패했다.
`supabase_admin`은 superuser여서 그 역할로만 성공한 예전 리허설은 실제 CLI 실행 권한 증명이 되지 않는다.
[PostgreSQL 17 GRANT](https://www.postgresql.org/docs/17/sql-grant.html)

[코드] 고정한 CLI **v2.114.0**의 원격 연결은 `supabase_admin` 또는 `cli_login_*` 로그인에서
`SET SESSION ROLE postgres`를 수행한다. 비밀번호 경로의 로컬 실제 CLI probe에서도
session/current user=`postgres`, owner SET/상속=false를 확인했다.
localhost `--db-url`은 원격 step-down을 생략할 수 있으므로 이를 혼동하지 않았다.
관리 API로 임시 운영 로그인 역할을 만들거나 실제 운영 Migration을 실행해 증명하지 않았다.
[공식 CLI 연결 소스](https://github.com/supabase/cli/blob/v2.114.0/apps/cli/src/legacy/shared/legacy-db-connection.sql-pg.layer.ts)

[코드/산출물] 새 후보는 current_user가 `postgres`일 때만 시작한다. 기존 ADMIN이 없으면 실패한다.
같은 파일 트랜잭션 안에서 postgres 자신이 grantor인 owner SET/INHERIT만 잠시 사용하고,
기존 자기 grant가 있었다면 그 옵션을 되돌리며, 없었다면 자기 grant만 회수한다.
다른 grantor인 `supabase_admin` 행을 회수하지 않는다. 전체 멤버십 그래프가 시작 시점과
같지 않으면 커밋 전에 실패한다. 운영 역할에 영구 권한을 추가하는 선행 명령은 없다.

`ALTER FUNCTION ... OWNER`에는 대상 owner의 포함 스키마 CREATE도 필요하다.
기존 객체 경로에서는 정확한 baseline 검사 **후** 새 public 함수의 owner 이전 때만
CREATE를 차용하고, 파일 끝에서 public schema ACL을 정확히 복원한다.
기존 owner·유효 ACL·테이블 RLS 및 6개 앱 역할의 속성도 원본과 대조했다.
[PostgreSQL 17 ALTER FUNCTION](https://www.postgresql.org/docs/17/sql-alterfunction.html)

## Migration 이력 연결과 원자성

[사용자 승인] 2026-11-23 KST, AGENTS.md append-only 규칙에 대해 **아직 미적용인 PR #63
Draft 후보 5개만 수정하는 일회성 예외**를 승인했다. 기존 운영 적용 59개 파일의 SHA-256은
모두 동일하며 AGENTS.md 전역 규칙도 수정하지 않았다. 수정 파일명과 버전은 유지했다.

| 순서 | 기존 파일명/버전 | 변경 이유 |
|---|---|---|
| 60 | `20261120024414_group_items_s5.sql` | 신규 설치/기존 객체 bridge 분기, 정확한 보존·드리프트 가드, 임시 권한 복원, CLI 트랜잭션 소유 |
| 61 | `20261120104117_duel_items_v4.sql` | 파일 바깥 BEGIN/COMMIT 제거 및 CLI 이력 원자성 설명; 게임 DDL 본문 유지 |
| 62 | `20261120113035_duel_v4_server_search.sql` | 동일 |
| 63 | `20261120113647_duel_v4_reward_queue.sql` | 동일 |
| 64 | `20261120114137_duel_v4_link_index.sql` | 동일 |

더 늦은 bridge 파일을 추가하는 방식은 기존 unconditional S5 파일이 먼저 실패하므로 해결이 아니다.
60번 자체가 상태를 검사한 뒤 실제 DDL을 수행하고 CLI가 정상 이력을 기록하도록 정리했다.
`migration repair`, 수동 history INSERT, 파일 건너뛰기, 가짜 이력 등록을 사용하지 않았다.
CLI에 저장된 5개 `statements` 배열이 현재 파일을 공식 parser로 나눈 결과와 정확히 같음을 확인했다.

[코드/산출물] 이 5개 후보는 CLI가 파일별 BEGIN/COMMIT과 마지막 이력 INSERT를 담당한다.
파일 안의 별도 COMMIT은 제거했다. 트랜잭션을 분리하는 `CONCURRENTLY` 같은 문장도 사용하지 않는다.
S5 이력 INSERT 실패 시험은 전체 파일이 원복되는 것을 확인했다.
반면 5개 전체는 묶음 트랜잭션이 아니므로 61까지 성공한 상태에서 중단될 수 있다.
재개 절차는 별도 runbook에 명시했다.
[공식 CLI apply 소스](https://github.com/supabase/cli/blob/v2.114.0/apps/cli/src/legacy/shared/legacy-migration-apply.ts)

신규 설치에는 원본 S5에만 있던 legacy **20개 테이블과 7개 함수의 검토된 스키마/ACL**을
추가해 기존 객체 경로와 구조를 맞췄다. 원본 계정·정책 행·설치 영수증은 복사하지 않는다.
runtime 역할은 실측된 LOGIN/INHERIT 계약을 유지하고 비밀번호는 이 SQL에 넣지 않는다.
하나의 큰 DO로 포장했을 때 CLI parser가 오래 걸렸으므로 같은 파일 트랜잭션 안의
작은 조건부 문장으로 나눴다. S5의 실제 기록 문장은 1,652개다. 생성된 긴 SQL의 유지보수·검토 비용은 남는다.

## 비교 방법과 보존 범위

[산출물] 데이터는 원본 182개 relation 각각을 `ONLY`로 읽어 부모/자식 중복을 피하고,
행 수와 정렬된 row JSON 해시를 비교했다. E2E 후에는 원본 행 해시의 **중복 개수**까지
대조해 합성 행 추가가 기존 행 변경/삭제를 가리지 않도록 했다. 기존 XP·업적·경기 기록을 포함한다.
반복 가능 읽기 fingerprint는 다른 세션의 미래 쓰기까지 막는 장치가 아니므로 운영 적용에는
별도 쓰기 중지/진행 경기 drain이 필요하다.

최종 구조 비교에서 다음 표현상 차이만 명시적으로 정규화했다. 권한 비트·grant option·grantor,
컬럼 순서·제약 의미·RLS·트리거 내용은 무시하지 않았다.

- NULL ACL의 owner 기본 권한과 동일한 명시 ACL, ACL 배열 순서.
- 함수 정의의 CRLF/LF.
- 삭제된 컬럼 때문에 남은 내부 attnum 간격.
- 이전 복원 대조에서 검토된 정확한 CHECK 두 쌍의 deparse 표현:
  `game_rooms_group_limits_v13_check`, `site_news_posts_details_check`.

기존 함수의 **소유권/ACL은 보존**했다. 함수 본문 147개는 검토된 bridge가 새 계약으로 교체하는
의도된 변경이며, 모든 본문이 운영 전과 동일하다는 뜻은 아니다. 이전 검토 bridge 결과와도 대조했다.
새 `get_group_items_kion_v1`/`send_group_items_kion_v1` 두 RPC는 owner/authenticated만 실행 가능하다.
이전 superuser 중간 리허설에 있던 postgres 명시 EXECUTE는 이번 신규 객체에 추가하지 않았다.
기존 객체의 권한을 삭제한 변경은 아니다.

## pgTAP와 Auth/브라우저의 실제 범위

`daily_current_snapshot_pairs_v1.sql`은 임시 독립 fixture와 충분한 후보를 사용한다.
`duel_drain_recovery_v1.sql`은 기존 복구 영수증을 남기고 새 case ID·기존 영수증 멱등성을 분리한다.
두 파일은 직전 통과한 fixture를 재사용해 이 작업 트리에도 반영했다.

전체 36파일 검증은 **채워진 DB용 fixture adapter**를 사용했다. 나머지 34개는 앞선 리허설의
검토된 입력을 재사용했다. 각 트랜잭션의 protocol 초기화, 신규 fixture ID/기준 건수,
해당 시험 방으로 한정한 영수증/재경기 조회, rollback되는 review policy 설정이 포함된다.
생산 제약조건 완화나 원본 데이터 삭제로 통과시키지 않았다. 원시 빈 DB 전용 fixture를
그대로 실행했다는 주장은 하지 않는다. 파일별 입력 SHA와 SQL 오류/plan/assertion 결과를 보존했다.

Auth·REST·Realtime은 새 Docker 서비스와 새 합성 계정만 사용했다. 브라우저 로그인 폼부터
실제 token endpoint와 DB RPC/WAL Realtime을 통과했다. 세션을 브라우저에 주입하거나 RPC를
mock하지 않았다. S5 초기 아이템 종류는 신규 합성 경기에서만 정해 공격/패링/보호를 재현했다.
외부 Wikipedia/wiki-snapshot은 로컬 결정적 fixture이며 username-lookup은 동일 소스의 로컬 shim이다.
운영 Edge나 외부 검색 서비스의 배포 검증이 아니다. 이번 실제 브라우저 재검증 인원은
S5 3명이며, 과거 4·8인 실행을 이번 재실행으로 합산하지 않았다.

## Realtime 관리 파티션

[산출물] 비실행 원본 복원본은 원래 182개를 유지했다. 실제 Realtime을 연결한 E2E DB에서는
`realtime.messages_2026_11_17`, `...18`, `...19`가 정리되었다. 원본에서 모두 빈 테이블이고
정상 `realtime.messages` 자식이며, 확인한 UTC 시각상 보존 기간 밖임을 검사했다.
이는 관리 서비스의 자동 보존/정리와 일치한다. 운영의 과거 두 삭제에 대한 실행자 감사 로그까지
확정한 것은 아니며, 삭제 주체를 bridge라고 추정하지 않는다.
[Supabase Realtime architecture](https://supabase.com/docs/guides/realtime/architecture)

가드는 관리 스키마 전체를 제외하지 않는다. 날짜 범위·부모/경계·컬럼·owner·ACL·제약·인덱스·
publication 계약을 먼저 검증한 정상 daily child만 정규화한다. 원래 child가 없으면 UTC 만료도 확인한다.
앱 RLS/ACL 드리프트와 미만료 child 손실은 실제 CLI에서 거절됐다.
따라서 “원본 행 보존”은 PASS지만 “동적 서비스 실행 후 물리 182개 영구 불변”은 BLOCK이다.

## 파일·증거와 보존 상태

수정한 기존 파일은 위 Migration 5개, pgTAP fixture 2개,
`tests/s5AuthorityClockDiagnostics.test.js`, `tests/s5ReleaseReadiness.test.js`다.
추가한 `tests/helpers/s5MigrationSource.js`는 실제 fresh/existing 분기를 나눠 기존 권위 시계·권한
assertion을 각각 검사한다. 전역 문자열 중복 개수에 의존하던 검사를 실제 실행 분기 기준으로 바꿨다.
새 의존성·SDK·플러그인 설치는 없으며 기존 lockfile과 일치하는 로컬 의존성을 재사용했다.

- 검토안/매니페스트/결과: `server-proposals/pr63-cli-path-20261123/`.
- 별도 적용·복구 문서: `docs/ops/S5-PR63-CLI-MIGRATION-RUNBOOK-2026-11-23.md`.
- 로컬 전용 도구: 이 worktree의 Git 무시 경로 `.temp/path-tools/`, `.temp/pr63-followup/`.
- 비공개 원시 증거: 로컬 `WikiRacePrivateBackups/pr63-cli-path-20261123-r1`.
  Credential Manager·백업·계정·JWT·원시 SQL/브라우저 로그를 GitHub/공개 CI에 업로드하지 않았다.
- 원본 archive SHA-256:
  `8c031920937456f20ae9698d4a04b1c49702a2b41e29cc2211666a8879701a01` (종료 시 동일).
- 기존 리허설 보고서·bridge·Docker·비공개 백업을 덮어쓰거나 제거하지 않았다.
  이번 새 컨테이너도 삭제하지 않고 정지했으며 볼륨은 유지했다.

`docs/agent/CURRENT.md` 기준은 HEAD보다 36개 커밋 뒤처져 있음을 앞서 보고했다.
트랙 worktree는 CURRENT를 수정하지 않는 규칙에 따라 그대로 두었다. 통합 시 이 보고서를 반영해야 한다.
PR/HEAD 재조회는 `pr-readonly-status.json`에 보존했다.

## 남은 운영 판단

두 기술 BLOCK은 이 후보와 동일한 역할·구조의 로컬 복제본에서 해결했다. 그러나 실제 hosted
Migration을 실행한 적이 없으므로 운영 성능/잠금 대기와 원격 로그인 provisioning 성공까지 보증하지 않는다.
새 쓰기 중지 창, 직전 백업/복원 재확인, 후보 해시 동결, 실제 실행 역할 확인과 별도 승인이 필요하다.
운영 Edge/Worker·S5 C 보류·실기기 패링 등 기존 PR의 다른 출시 보류는 이번 DB 검증으로 해제하지 않는다.
다음 검토 대상은 별도 runbook이며, 운영 SQL·권한 변경·Edge·main 병합·Production 배포는 실행하지 않았다.
