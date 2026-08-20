# AGENTS.md — Wiki Race 상시 가드레일

이 파일은 세션마다 자동 로드되는 **상시 규칙**이다. 인계 정보·현재 상태·검증 이력은
`docs/CLAUDE_HANDOFF.md`와 `wiki-race-2.0-handoff/`에 두고, 이 파일에는 항상 지켜야 하는
금지·의무 사항만 둔다.

기준 문서:

- 게임 규칙 단일 기준: `wiki-race-2.0-handoff/01-CONFIRMED-SPEC.md`
- 현재 구현·검증 상태: `docs/CLAUDE_HANDOFF.md`
- 운영 환경 실측: `docs/ops/PROD-SNAPSHOT-2026-08-20.md`

---

## 1. 운영 DB 변경 금지

운영(linked) Supabase에 migration·RPC·RLS·Edge Function을 적용하지 않는다.
적용은 **건별 명시적 승인**이 있을 때만 수행한다. 승인 하나가 다음 적용까지 확장되지 않는다.

- `supabase db push --linked`, `db reset --linked`, `migration repair`, `functions deploy`는
  승인 없이 실행하지 않는다.
- 로컬 스택 적용 결과를 운영 적용 근거로 사용하지 않는다.
- 근거: `wiki-race-2.0-handoff/code/10-CODE-MASTER-TODO.md` §3-7,
  `code/18-SERVER-AUTHORITY-V2-IMPLEMENTATION.md` (Release A~D 승인 절차)

### 1.1 `origin/main` push 금지 — 배포 파이프라인 사실

- **`origin/main`은 Vercel 프로덕션 배포와 연동되어 있다. main push는 즉시 배포를 트리거한다.**
- 현재 로컬은 미배포 서버 권위 V2와 Packet 13을 포함하며, **운영 DB에는 해당 RPC가 존재하지 않는다.**
  운영 `public` 함수는 7개뿐이고 V2 RPC 30개가 없다 (`docs/ops/PROD-SNAPSHOT-2026-08-20.md` §2).
- 따라서 **cutover 계획 확정 전 main push는 즉시 장애를 유발한다.** 프론트가 존재하지 않는 RPC를 호출한다.
- 백업 목적의 push는 **feature 브랜치 또는 별도 원격으로만** 수행한다. `main`에는 하지 않는다.
- 배포와 DB 적용의 순서는 `code/18-...md`의 Release C(프론트) → Release D(cutover) 계약을 따르며,
  그 순서 자체가 운영 실측 이후 재설계 대상이다 (`docs/agent/CURRENT.md` §5).
- 이 항목의 Vercel 연동 사실은 사용자가 제공한 정보다. 저장소의 `vercel.json`은 SPA rewrite 설정만
  담고 있어 git 연동 자체를 증명하지 않는다.

## 2. commit·push 금지

요청받기 전에 commit·push하지 않는다. 사용자 변경과 더러운 작업 트리를 임의로 되돌리지 않는다
(`git reset --hard`, `git checkout --`, stash 포함).

- 근거: `code/12-SERVER-AUTHORITY-RECOVERY.md` §6, `code/13-GROUP-FINAL-GAPS.md` §5,
  `code/10-CODE-MASTER-TODO.md` §8

## 3. 기존 구조를 읽기 전에 기능을 확장하지 않는다

관련 파일·DB 객체·테스트를 먼저 읽고 현재 계약을 확인한 뒤에만 변경한다.
이미 완료 보고된 영역(그룹 DB/RPC/RLS 안정화, 서버 권위 V2)은 근거 없이 재설계·재작성하지 않는다.

- 근거: `code/11-REPOSITORY-AUDIT.md` §3, `code/13-GROUP-FINAL-GAPS.md` §1,
  `code/10-CODE-MASTER-TODO.md` §8

## 4. 코드 감사 전 임의 삭제 금지

기존 구현·데이터·마이그레이션·보상 ID를 명시적 근거 없이 삭제하거나 파괴적으로 변환하지 않는다.

- 기존 migration은 append-only로 다룬다. 되돌려 수정하지 않고 forward-only 보정 migration을 추가한다.
- 확정 스펙에서 제외된 기능이라도 코드 감사 전에는 자동 삭제 대상이 아니다.
- 운영에서 사용 여부가 확인되지 않은 컬럼·업적 ID·storage object는 삭제·rename하지 않는다.
- 근거: `01-CONFIRMED-SPEC.md` §5.6, §10, `code/11-REPOSITORY-AUDIT.md` §2.4 보존 원칙,
  `code/10-CODE-MASTER-TODO.md` §8

## 5. 확인되지 않는 사실은 추측하지 않는다

저장소·코드·실측 기록에서 확인되지 않는 것은 단정하지 않고 `확인 필요`로 남긴다.

- 스키마·운영 상태·사용자 데이터를 추측으로 채우지 않는다.
- 문서 기록(`[문서]`)과 코드 근거(`[코드]`)와 실행 산출물(`[산출물]`)을 구분해 표기한다.
- 각 서술에는 근거 파일 경로를 붙인다.
- 근거: `code/11-REPOSITORY-AUDIT.md` §3-4, `docs/CLAUDE_HANDOFF.md` §0

## 6. 검증 수치에는 기준 커밋과 날짜를 함께 적는다

테스트 개수·TAP 결과·게이트 판정 등 수치를 기록할 때는 **기준 커밋 해시와 확인 날짜**를 같이 적는다.
수치만 있고 기준이 없는 기록은 남기지 않는다.

- 예: `npm test 126/126 — 기준 450f63a, 2026-08-18 확인`
- 미커밋 작업 트리에서 측정했다면 그 사실을 함께 적는다.
- 코드를 작성했다는 이유만으로 완료(`[x]`)로 표기하지 않는다. 관련 테스트·빌드·수동 흐름까지 통과해야 한다.
- 근거: `wiki-race-2.0-handoff/00-START-HERE.md` §4, §6, `code/10-CODE-MASTER-TODO.md` §7
