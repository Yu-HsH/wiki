# Wiki Race PR #63 최종 승인 패키지

2026-11-23 KST. 기준 `6b336c10abafc2fe4a1c25e74e2f5fadd97792a4`와 현재 격리 worktree의 미커밋 변경이다. GitHub에서 같은 HEAD의 열린 Draft 상태를 재확인했다. 현재 PR에 보이는 SQL은 통합 전 원본이다. [PR #63](https://github.com/Yu-HsH/wiki/pull/63)

| 범위 | 판정 | 근거 또는 승인 조건 |
|---|---|---|
| 로컬 DB 후보와 리허설 증거 | **GO** | 사용자 승인 범위의 5개만 수정했고 기존 59개 파일이 동일하다. 아래 SHA가 CLI에서 검증한 파일과 기록 내용에 대응한다. 기존 59→64, 신규 0→64, pgTAP 36파일, 브라우저 E2E, 데이터·역할 복원 결과를 수용했다. |
| 코드 통합 | **CONDITIONAL GO** | 검토자가 아래 목록과 공백 예외를 승인하고, 통합에 사용할 Git blob과 최종 CLI 입력의 SHA가 5개 모두 일치해야 한다. 원격 PR 상태·기준 HEAD가 바뀌면 새 diff를 확인한다. |
| 운영 DB 적용 | **BLOCK** | 별도 승인, 최신 백업과 해당 스냅샷의 실제 복원, 그룹/싱글을 포함한 서버 입장·쓰기 통제, drain·Worker 정지 실측, 운영 연결과 RTO/RPO 확인이 남아 있다. |
| Edge·Worker·신규 모드 및 Production 출시 | **BLOCK** | 별도 체크리스트의 배포 환경·모바일·S5 C 조건이 남아 있다. |

## 후보 파일과 원격 차이

기존 59개는 동일 리허설의 파일 SHA와 현재 raw SHA가 모두 일치하며, Git으로 비교한 결과도 HEAD blob과 일치한다. 파일의 추가·삭제·개명은 없고 버전 64개를 유지했다. 원격 HEAD에 비해 변경된 Migration은 아래 5개다. S5는 신규/기존 분기·보존 가드·역할 복원 변경을 포함한다. v4 4개는 줄바꿈 표현을 제외하고 파일 바깥 `BEGIN`/`COMMIT` 삭제와 설명 주석 추가만 있다. 공식 CLI parser 비교와 이력 증거를 대조했다. 원격 blob SHA, 검증 raw SHA, LF 변환 SHA는 서로 다른 항목이다. [파일별 대조 JSON](../../server-proposals/pr63-cli-path-20261123/release-review-evidence.json)

| Migration | CLI에서 검증한 입력 파일 SHA-256 |
|---|---|
| `20261120024414_group_items_s5.sql` | `30a6668a035e9786d5f6df79e2ec304472e474ae2e80d1d999619c89d4348ccb` |
| `20261120104117_duel_items_v4.sql` | `bb23a8a239cb58f4a0968b96dfed254ff2a782ca73bcc55e6ba8e8d5da6a8246` |
| `20261120113035_duel_v4_server_search.sql` | `e70a149269007097e3c6f6f1d3736fa85bff3c218cde43a3a440eb473e249eed` |
| `20261120113647_duel_v4_reward_queue.sql` | `8ec56d5bfb919a628ff6eb0db809bab6196b7dd2dfc717757832a38ed3cc269c` |
| `20261120114137_duel_v4_link_index.sql` | `e4854ee647e083716fdf01d9bd09bd842742f94bf2de2d2941bb6ca3770242ce` |

## S5 독립 검토

| 항목 | 판정 | 코드와 격리 DB 카탈로그 대조 |
|---|---|---|
| 신규 설치 | PASS | 세 S5 namespace가 없는 경우에만 원래 설치 DDL과 legacy 20개 테이블·7개 함수의 스키마 호환분을 실행한다. 운영 데이터와 비밀번호를 복사하지 않는다. 별도 클러스터에서 0→64와 최종 앱 구조 수렴을 확인했다. SQL에는 신규 설치 후반 timeout을 0으로 재설정하는 덤프 설정이 있다. |
| 기존 객체 | PASS | 두 기존 S5 namespace가 있고 events namespace가 없어야 기존 분기로 들어간다. exact baseline 지문과 허용된 관리 파티션 계약을 확인한 뒤 기존 행 지문을 잠금 안에서 비교한다. ACL/RLS 드리프트·불완전 상태·미만료 파티션 손실은 거절한다. REPEATABLE READ의 일관된 스냅샷과 ACCESS SHARE는 외부 세션의 DML 차단을 제공하지 않는다. |
| 역할과 ACL 복원 | PASS | `current_user=postgres`와 기존 ADMIN을 요구한다. 한 owner 역할의 SET/INHERIT만 파일 트랜잭션 중 빌린다. public CREATE는 기존 분기의 카탈로그 검사 뒤 소유권 이전에 사용한다. 원래 self-grant 상태·grantor 포함 전체 멤버십·public ACL을 비교하고 실패하면 커밋하지 않는다. 기존 6개 앱 역할 속성과 owner/ACL 보존 근거도 대조했다. |
| 공개 SECURITY DEFINER RPC | PASS | 양쪽 실제 카탈로그의 공개 S5 RPC 10개 모두 owner `ink_product_owner`, 빈 `search_path`, owner·authenticated EXECUTE다. Kion 두 RPC는 JWT의 actor, 해당 방/세션의 참가 상태, 수신자를 확인하며 쓰기는 허용 이모트와 rate limit을 거친다. `request_actor_v1`은 owner 전용 invoker다. 공개 RPC 밖의 actor 전제는 Auth/REST의 검증된 JWT 설정에 의존한다. |
| Realtime/RLS/ACL | PASS | `signals_v1`·`emotes_v1`은 authenticated SELECT만 있고 수신자 조건 RLS를 사용한다. 두 테이블만 publication에 들어간다. `emote_limits_v1`은 RLS가 꺼져 있으며 owner ACL만 있다. 외부 grant/API 노출을 바꾸는 후속 변경에는 재검토가 필요하다. 두 수신자 격리 및 익명/직접 쓰기 차단의 기존 검증을 확인했다. |
| 트랜잭션·이력 | PASS | 검증된 5개는 파일별 DDL과 이력 INSERT가 한 단위다. 끝단 이력 INSERT 실패가 59로 원복됐고 세 번째 파일 실패는 앞의 2개를 커밋한 61에서 멈췄다. 정상 CLI 재실행 64 및 이후 no-op을 확인했다. |

역할의 ADMIN/SET/INHERIT 의미와 소유권·`search_path` 검토 기준은 PostgreSQL 17 문서를 적용했다. [GRANT](https://www.postgresql.org/docs/17/sql-grant.html) · [CREATE FUNCTION](https://www.postgresql.org/docs/17/sql-createfunction.html) · [ALTER FUNCTION](https://www.postgresql.org/docs/17/sql-alterfunction.html)

## 공백과 줄바꿈에 대한 통합 조건

후속 Git 검증에서 `.gitattributes`의 다섯 개 경로 규칙으로 staged blob, 임시 로컬 커밋, 새 checkout의 SHA 일치를 확인했다. 아래의 자동 변환 위험은 다섯 경로 규칙이 빠진 경우에 해당한다. 실제 통합 커밋과 CLI 입력은 별도 승인 시 다시 대조한다. [후속 검증과 파일별 통합 계획](S5-PR63-GIT-BYTE-VERIFICATION-2026-11-23.md)

`git diff --check HEAD`는 S5 SQL 10948행의 `select` 뒤 공백 한 건을 보고한다. 해당 줄은 신규 설치용으로 가져온 기존 `ink_product.actor_uid_v1` 함수 본문이다. 복원 후 원본과 새 설치 DDL의 함수 본문이 줄바꿈 표현을 제외하고 같은 것을 확인했다. 공백을 자르면 함수 소스·파일 SHA·CLI 기록의 비교 기준이 바뀌므로 이번에는 그 한 줄을 그대로 두고 검토 예외로 기록한다. 검사 설정을 끄지 않았다. SQL 바이트가 동일해 기존 SQL/E2E 증거를 참조하고, S5 권한·분기·진단 회귀 검사 7개를 재실행해 7/7 PASS를 확인했다.

**기본 Git 저장 방식에는 별도 결함이 있다.** 현재 `core.autocrlf=true`에서 실제 `git hash-object`로 확인한 결과, 검증 입력 5개 모두 저장 시 LF 변환으로 바이트가 달라진다. S5는 1,652개 중 944개 CLI 문장의 텍스트가 달라진다. 기록된 기존 분기 `pg_get_functiondef` 사후검사 MD5 151개가 원본 지문과 정확히 일치하고, 정의 텍스트를 LF로 바꾸면 151개 전부 MD5가 달라진다. 따라서 변환된 후보를 기존 PASS의 입력으로 볼 수 없으며 `BRIDGE_FUNCTION_POSTCONDITION` 실패 위험이 있다. LF 후보의 실제 적용은 시험하지 않았다. [Git 줄바꿈 변환 문서](https://git-scm.com/docs/gitattributes)

별도 통합 승인 이후에는 대상 5개만 명시해 Git 바이트 필터가 작동하지 않는 방식으로 저장한다. 이 worktree에서는 명령 한 번에 `-c core.autocrlf=false`를 붙인 읽기 전용 `hash-object`가 `--no-filters`와 5개 모두 일치했다. 통합 담당자는 실제 staged blob, 통합 후 Git blob, 깨끗한 체크아웃/CLI 입력의 SHA를 각각 비교한다. Git 객체를 파일로 읽을 때 바이너리 그대로 추출한다. 이 조건을 충족하지 못하면 통합을 중지한다. LF 표준화나 공백 제거가 필요하면 별도 후보 SHA를 발행하고 신규/복원 분기, 지문 가드, CLI 이력 원자성, pgTAP와 권한/브라우저 검증을 다시 한다.

## 검토 파일 목록

- `supabase/migrations/`의 위 5개 SQL.
- `supabase/tests/daily_current_snapshot_pairs_v1.sql`, `supabase/tests/duel_drain_recovery_v1.sql`.
- `tests/s5AuthorityClockDiagnostics.test.js`, `tests/s5ReleaseReadiness.test.js`, `tests/helpers/s5MigrationSource.js`.
- `docs/ops/S5-PR63-CLI-MIGRATION-REHEARSAL-2026-11-23.md`, `docs/ops/S5-PR63-CLI-MIGRATION-RUNBOOK-2026-11-23.md`.
- `docs/ops/S5-PR63-RELEASE-REVIEW-2026-11-23.md`, `docs/ops/S5-PR63-RELEASE-CHECKLIST-2026-11-23.md`.
- `server-proposals/pr63-cli-path-20261123/`의 `DESIGN.md`, `candidate-manifest.json`, `final-preservation-result.json`, `pr-readonly-status.json`, `release-review-evidence.json`, `verification-results.json`.

기존 리허설 로그·비공개 백업·Docker 볼륨은 그대로 보존했다. 기존 아카이브 SHA-256을 이전 증거와 다시 대조했다. 이번 검토는 저장소와 기존 증거를 읽고 검토 문서/요약만 추가하거나 갱신했다. 운영 쓰기·Migration·commit/push·병합·배포 실행은 0이다. `CURRENT.md`의 기존 36커밋 격차는 별도 통합 시 반영할 항목이다.

운영 적용·복구 단계와 이력 중단점은 [운영 실행 검토 절차](S5-PR63-CLI-MIGRATION-RUNBOOK-2026-11-23.md), DB 외 출시 항목은 [출시 체크리스트](S5-PR63-RELEASE-CHECKLIST-2026-11-23.md)에 기록했다.
