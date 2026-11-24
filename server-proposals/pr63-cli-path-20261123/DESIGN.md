# PR #63 CLI 이관 검토안

기준 `6b336c10` + 미커밋 제안, 2026-11-23 KST. 운영 쓰기/배포 승인이 아니다.

운영 읽기 전용 실측: postgres는 ink_product_owner ADMIN=TRUE, INHERIT=FALSE,
SET=FALSE. supabase_admin은 superuser지만 공식 CLI v2.114.0의 원격 연결은
supabase_admin/cli_login_*도 postgres로 전환한다.

권한 제안: 기존 ADMIN 능력으로 이번 migration transaction 안에서만
postgres가 자신에게 owner 역할의 SET/INHERIT를 빌리고, 같은 transaction 끝에서
자신이 grantor인 행만 제거한다. 원래 supabase_admin grant 행과 모든 최종
멤버십/owner/ACL은 불변이어야 한다. 계정/운영 역할을 미리 변경하지 않는다.
임시 로그인 경로에서도 RESET ROLE로 login 역할로 돌아가지 않고 명시적으로
postgres로 복귀해야 한다. Docker에서 동일 역할과 CLI 경로로 검증할 제안이다.

이력 충돌: 운영 59개 다음의 20261120024414 후보는 unconditional CREATE다.
더 늦은 새 migration을 추가해도 이 파일이 먼저 실패한다. 이를 건너뛰거나
repair/stamp하면 사용자의 금지 조건을 위반한다. 제안은 **이미 적용된 59개는
바이트 그대로 두고, 아직 운영 이력에 없는 Draft 후보 5개만 정정**하는 것이다.

- 기존 S5가 없는 DB: 검토된 신규 설치 DDL을 실제 실행한다.
- 기존 S5가 있는 DB: 정확한 baseline/보존 가드를 통과한 bridge를 실제 실행한다.
- 양쪽 모두 같은 S5 migration version을 정상 CLI가 성공 후 기록한다.
- 후속 v4 4개도 정상 CLI 순서로 실행한다.
- 미적용 5개 파일의 내부 BEGIN/COMMIT을 정리해 CLI가 객체 변경과 history
  INSERT를 같은 transaction으로 관리하게 한다. 기존 59개는 수정하지 않는다.
- 새/기존 S5 객체의 owner/RLS/ACL/함수/트리거와 보존용 legacy 객체의 차이를
  비교하고, 모르는 객체는 자동 삭제하거나 수용하지 않는다.

상시 AGENTS.md의 append-only 규칙에 대해 사용자가 2026-11-23 KST 이 후보 5개만의
일회성 예외를 승인했다. 파일명/버전을 유지하고 기존 운영 59개는 변경하지 않는다.
전역 AGENTS.md 자체는 수정하지 않는다. 운영 적용/권한 변경/배포/commit/push는 금지다.

실제 postgres CLI 시험에서 새 public 함수의 OWNER 이전에는 target owner의 public
schema CREATE도 필요함을 확인했다. 기존 객체 경로에서는 정확한 baseline 검사 뒤,
새 함수 OWNER 이전 시점에만 CREATE를 차용하고 같은 파일 끝에서 원래 schema ACL로
복귀시킨다. 최종 schema ACL/멤버십이 정확히 같지 않으면 전체 파일이 실패해야 한다.
2026-11-23 KST, 기준 `6b336c10` + 미커밋 후보의 로컬 검증을 완료했다.
동일 postgres 권한의 운영 복원본 59→64, 별도 신규 클러스터 0→64,
최종 구조 수렴, 이력 INSERT 실패 원복, 중간 61개 중단 후 재시도는 PASS다.
5개 전체의 단일 트랜잭션은 지원되지 않으며 파일마다 커밋된다.
기존 59개 파일은 바이트 불변이고, 후보 statements는 CLI 기록과 일치한다.

전체 결과: [후속 리허설 보고서](../../docs/ops/S5-PR63-CLI-MIGRATION-REHEARSAL-2026-11-23.md).
실제 적용은 여전히 BLOCK/별도 승인 대상이다.
적용·중단·재개·복구 검토안은 [별도 runbook](../../docs/ops/S5-PR63-CLI-MIGRATION-RUNBOOK-2026-11-23.md)에 있다.
후보 지문과 안전한 결과 요약은 이 폴더의 candidate-manifest.json과 verification-results.json이다.
