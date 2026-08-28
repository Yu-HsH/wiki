# AGENTS.md — Wiki Race 상시 가드레일

이 파일은 세션마다 자동 로드되는 **상시 규칙**이다. 인계 정보·현재 상태·검증 이력은
`docs/CLAUDE_HANDOFF.md`와 `wiki-race-2.0-handoff/`에 두고, 이 파일에는 항상 지켜야 하는
금지·의무 사항만 둔다.

기준 문서:

- 게임 규칙 단일 기준: `wiki-race-2.0-handoff/01-CONFIRMED-SPEC.md`
- **지금 상태의 단일 기준: `docs/agent/CURRENT.md`** (갱신 의무는 §7)
- 배경 인계·구현 상세: `docs/CLAUDE_HANDOFF.md`
  — 2026-08-29에 창 결과를 반영했다. 바뀐 지점 목록은 그 문서 **§0.2**.
  판정·현재 상태가 어긋나면 `docs/agent/CURRENT.md`가 우선한다
- 운영 환경 실측: `docs/ops/PROD-SNAPSHOT-2026-08-20.md`
  — **⚠ 무효.** 2026-08-28 창이 운영을 바꿨다. **현재 상태의 근거로 인용하지 않는다** (§1.1)
- 운영 cutover 실행 계획: `docs/ops/CUTOVER-PLAN.md`
- **운영 cutover 실행 기록: `docs/ops/CUTOVER-LOG-2026-08-27.md`** (2026-08-27~28 창, W0~W9 실행)

---

## 1. 운영 DB 변경 금지

운영(linked) Supabase에 migration·RPC·RLS·Edge Function을 적용하지 않는다.
적용은 **건별 명시적 승인**이 있을 때만 수행한다. 승인 하나가 다음 적용까지 확장되지 않는다.

- `supabase db push --linked`, `db reset --linked`, `migration repair`, `functions deploy`는
  승인 없이 실행하지 않는다.
- 로컬 스택 적용 결과를 운영 적용 근거로 사용하지 않는다.
- **2026-08-27~28 cutover 창에서 이 명령들이 승인 아래 실제로 실행됐다** (migration 11개 적용,
  Edge Function 2개 배포 — `docs/ops/CUTOVER-LOG-2026-08-27.md`). **그 승인은 그 창에서 끝났다.**
  다음 적용은 새 승인이 필요하다 — 위 문장 그대로다.
- 근거: `wiki-race-2.0-handoff/code/10-CODE-MASTER-TODO.md` §3-7,
  `code/18-SERVER-AUTHORITY-V2-IMPLEMENTATION.md` (Release A~D 승인 절차)

### 1.1 `origin/main` push 금지 — 배포 파이프라인 사실

**금지의 근거가 2026-08-28에 바뀌었다.** 이 조항은 원래 "운영 DB에 V2 RPC가 없으니 프론트가
존재하지 않는 RPC를 호출한다"를 근거로 삼았다. **그 전제는 사라졌다** — W6(`db push --linked`,
2026-08-28)로 migration 11개가 전량 적용됐고 W7 실측에서 **운영 `public` 함수 36개, legacy RPC
0개**가 확인됐다 (`docs/ops/CUTOVER-LOG-2026-08-27.md` §W6·§W7).
**금지는 유지된다. 아래가 현재의 근거다.**

- **`origin/main`은 Vercel 프로덕션 배포와 연동되어 있다. main push는 즉시 배포를 트리거한다.**
- **유지보수 게이트(`VITE_MAINTENANCE=true`)가 사용자 노출을 막는 유일한 방패다.**
  W10(게이트 해제)은 수행되지 않았고 게이트는 켜진 채다. **게이트를 끈 상태로 main push하면
  W9 미해결 결함 4건이 즉시 사용자에게 노출된다:**

  | # | 결함 | 사용자가 겪는 것 |
  |---|---|---|
  | 3 | `wiki-snapshot` 429 대량 재발 (그룹) | 준비 버튼이 연속 실패한다 |
  | 4 | RETIRE 사유 불일치 | 결과 화면에서 로비로 나갈 수 없다 |
  | 5 | `username-lookup` 404 | — |
  | 6 | 관전 이모티콘 미전달 | — |

  목록과 상태는 `docs/agent/CURRENT.md` §5.5가 단일 기준이다.
- **따라서 main push는 계속 건별 승인 대상이다.** 승인 시 확인할 것이 "운영에 RPC가 있는가"에서
  **"`VITE_MAINTENANCE`가 여전히 `true`인가"** 로 바뀌었다.
- **창 안에서의 예외적 main push는 게이트가 켜져 있음을 확인한 뒤에만 한다.**
  선례: 2026-08-28 W1-a — W9에서 발견한 `ExitGuard` 오류 수정을 창 안에서 배포했다.
  게이트가 켜져 있어 **사용자 노출은 0**이었고, 게이트 자체는 건드리지 않았다
  (`docs/agent/CURRENT.md` §3, `docs/ops/CUTOVER-LOG-2026-08-27.md` §W1-a).
  **게이트 상태를 확인하지 않은 main push는 이 선례에 해당하지 않는다.**
- 백업 목적의 push는 **`origin/feat/group-final-gaps`로만** 수행한다. `main`에는 하지 않는다.
  이 브랜치가 현재 작업 브랜치의 upstream이다. 창 이후 두 ref는 같은 커밋을 가리키므로
  **`main`이 뒤처져 있다는 이유로 push하지 않는다** (최신 값은 `docs/agent/CURRENT.md` §3.
  `git ls-remote origin`으로 재측정한다).
- Vercel 설정: **Production Branch = `main`**, **Ignored Build Step = Automatic** (사용자 확인, 2026-08-20).
  따라서 feature 브랜치 push는 프로덕션 배포를 만들지 않는다. preview 배포 생성 여부는 미확인이다.
- **`VITE_*`는 빌드 시점에 번들로 인라인된다.** 값 변경만으로는 반영되지 않고 재배포가 필요하며
  (CUTOVER-PLAN F11), 같은 이유로 Vercel에 **`Secret`이 아니라 `Config`로 저장된다**
  (2026-08-27 창 실측). **게이트 해제는 곧 재배포이므로 W10과 분리해서 다룰 수 없다.**
- 배포와 DB 적용의 순서는 **`docs/ops/CUTOVER-PLAN.md`의 W0~W11이 확정한다.**
  **W0~W9는 2026-08-27~28에 실행됐고 남은 것은 W10뿐이다** (CUTOVER-PLAN §0.-1).
  `code/18-...md`의 Release A~D artifact 분할은 U2 결정으로 대체됐다 — 대체 매핑은 CUTOVER-PLAN §10.
- 이 항목의 Vercel 연동 사실은 사용자가 제공한 정보다. 저장소의 `vercel.json`은 SPA rewrite 설정만
  담고 있어 git 연동 자체를 증명하지 않는다.
- **`docs/ops/PROD-SNAPSHOT-2026-08-20.md`를 현재 운영 상태의 근거로 인용하지 않는다.**
  2026-08-28 창이 무효화했다 (함수 7→36, RLS 12/14→14/14, 이력 0→12행).

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

## 7. `docs/agent/CURRENT.md` 갱신 의무

`docs/agent/CURRENT.md`는 스스로를 **"지금 상태의 단일 기준"** 으로 선언한다. 그 선언이 사실로
유지되도록 아래를 지킨다.

- **커밋을 만든 세션은 `docs/agent/CURRENT.md`의 기준 커밋·갱신 날짜를 같은 커밋 또는 직후
  커밋에서 갱신한다.** 문서만 바꾼 커밋도 예외가 아니다.
- **`CURRENT.md`의 기준 커밋이 `HEAD`보다 뒤처진 상태를 발견하면 다른 작업을 시작하기 전에 그
  사실을 먼저 보고한다.** 뒤처진 정도(몇 커밋·며칠)와 어긋난 항목을 같이 보고하고, 빈칸을
  추측으로 메우지 않는다 (§5).
- **완료된 작업을 `CURRENT.md`에서 미완으로 남겨두지 않는다.** 완료된 항목은 완료로 전환하고
  근거(커밋·날짜·산출물)를 적는다. 반대로 확인되지 않은 것을 완료로 적지도 않는다 (§6).

확인 방법:

```bash
grep -m1 '기준 커밋' docs/agent/CURRENT.md; git rev-parse --short HEAD
```

두 값이 다르면 그 사이 커밋을 `git log <기준커밋>..HEAD`로 읽고 반영한다. 원격 값은
`git ls-remote origin`으로 대조한다 — `git status`의 ahead/behind는 `fetch` 없이는 신뢰할 수 없다.

**한 커밋 차이는 정상이다.** 갱신 커밋 자체는 자신의 해시를 담을 수 없으므로, 기준 커밋이 그
갱신 커밋의 **부모**인 상태가 정상이다. 즉 `git log <기준커밋>..HEAD`가 **`CURRENT.md`를 갱신한
문서 커밋 하나만** 내놓으면 뒤처진 것이 아니다. 그 밖의 커밋이 하나라도 섞여 있으면 뒤처진
상태이며 위 규칙이 적용된다.

배경: 2026-08-27에 기준 커밋 `339fb77`·갱신 날짜 2026-08-20으로 남아 있던 `CURRENT.md`와 실제
저장소 상태 사이에서 불일치 11건이 확인됐다. 사실이 뒤집힌 항목은 없었고 전부 "그 뒤 진행분을
담지 못한" 방향이었지만, 그중 2건(cutover 계획 작성, 커밋 기준 `npm run build` 재실행)은 이미
완료된 작업이 미완으로 남아 다음 세션이 중복 작업할 수 있는 상태였다.
