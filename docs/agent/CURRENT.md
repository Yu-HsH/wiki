# 현재 상태 — Wiki Race 2.0

갱신 날짜: 2026-09-04 (2차)
기준 커밋: `8a3c77f` (`fix(preflight): stop flagging benign standby EOF as a runtime crash`)
마지막 **코드** 커밋: `8a3c77f` — **그리고 이것은 `origin/main`이 아니다.**
`origin/main` = **`a784d2e`** 그대로다. 트랙 A(`e70c541`)·B(`7a7197e`)·N2(`a784d2e`)는
`b3da192`·`527f896`·`eeb7a16` 병합을 거쳐 **2026-09-03에 배포됐고**,
**D(15a, `020daaa` → `1af9f93`)는 통합만 됐다 — 배포되지 않았다** (아래 ⚑ 상자·§3).
그 뒤 **`8a3c77f`가 `supabase:preflight`의 standby EOF 오탐을 고쳤다 — 트랙 C 착수 전 선행 작업이다.**
이전 기준: `1af9f93` · `a784d2e` · `eeb7a16`
브랜치: `feat/group-final-gaps`

> # ⚑ 2026-09-04 — **트랙 D(15a)가 통합됐다. 배포는 하지 않는다 — migration이 있다.**
>
> **`feat/group-final-gaps` = `1af9f93`** (`git merge --no-ff feat/track-15a`). **충돌 0.**
> 15a는 **신규 5파일뿐이고 기존 파일 수정이 0**이라 교집합이 원리적으로 0이었다.
>
> | 항목 | 실측 |
> |---|---|
> | **`npm test`** | **252/252 pass, fail 0, skipped 0** — 204(베이스라인) + **48**(`tests/xpLedger.test.js`) |
> | **pgTAP** | **128/128, `not ok` 0건** (`supabase/tests/xp_ledger_v1.sql`, 통합 환경 재실행) |
> | **`npm run build`** | **exit 0.** `App-*.js` **551.09 kB — 통합 전과 동일** (어느 화면에도 연결되지 않았다) |
> | **migration** | **로컬 적용 확인.** 저장소 **13개**(`20260903090000_xp_ledger_v1.sql` 추가) |
> | **`supabase:preflight`** | **11/11 PASS 유지** (적용 후 재실행). restart 0/0 |
> | **운영 DB** | **미접근. 운영 migration은 여전히 12개다** |
>
> **⚠ 이 코드는 `main`에 올리지 않는다. A·B·N2와 성격이 다르다.**
> A·B·N2는 프론트 전용이라 `main` push가 곧 배포로 끝났다. **15a는 migration을 만든다** —
> **DB 변경은 3코스 창에서만 적용된다** (`TRACKS.md` §7, `AGENTS.md` §1). 따라서
> **15a의 종착지는 이 브랜치이고, 운영 반영은 창의 일부다.**
>
> **15a가 C2 계약의 `확인 필요` 2건을 닫았다** — ①`floor`·②KST가 **제안 → 확정**.
> 근거는 문서가 아니라 **구현과 양쪽 테스트**다 (`C2-XP-LEDGER.md` **§0 정정 이력**).

> # ⚑ 2026-09-03 — **트랙 A·B·N2가 배포됐다. 게이트 없이 실사용자에게 닿은 첫 배포다.**
>
> **`main` = `a784d2e`** (`git push origin feat/group-final-gaps:main`, `9eba7e9..a784d2e` 17커밋)
> `[사용자 실행, 2026-09-03]`. **프론트 전용 — DB·Edge Function 변경 0.** 상세는 §3의 ⚑ 상자.
>
> **화이트리스트가 실제로 배타적이었다** — A가 건드린 10파일과 B가 건드린 9파일의 **교집합이 0**이고
> merge 둘 다 **충돌 0**이었다. `TRACKS.md` §2가 설계한 대로 동작했다.
>
> | 항목 | 실측 |
> |---|---|
> | **`npm test`** | **204/204 pass, fail 0** — 144(베이스라인) + 17(A) + 42(B) + **1(N2 해소)** |
> | **`npm run build`** | **exit 0** |
> | **grep 불변식** | **A 7건 + B 8건 전건 통과** (측정 단서 5건은 `TRACKS.md` §8-A·§8-B 완료 행) |
> | **DB** | **미접근. migration 산출물 0개** — 두 트랙 모두, N2도 프론트만 만졌다 |
> | **게스트 경계** | **완결.** N1·N2가 둘 다 닫혔다 (패킷 17 §6) — 아래 결함 블록 |
>
> **⚠ 운영에는 아직 없다.** 이 코드는 `feat/group-final-gaps`에 있고 `main`에 없다.
> **`main` push 금지는 그대로다** (§3, `AGENTS.md` §1.1) — 게이트가 해제된 상태이므로
> 이 코드를 올리는 것은 **실사용자에게 바로 닿는 배포**다.

> # ⚑ 2026-09-02 — **유지보수 게이트가 해제됐다. 서비스가 열려 있다.**
>
> Vercel에서 `VITE_MAINTENANCE`를 **삭제**하고 최신 Production 배포(`9eba7e9`)를 **Redeploy**했다.
> 프로덕션 URL에서 **점검 화면 없이 앱이 렌더된다** `[사용자 확인, 2026-09-02]`.
> **이 문서의 모든 서술에서 "사용자 노출 0"이라는 전제가 사라졌다** — 특히 `main` push의
> 위험도가 바뀌었다 (§3, `AGENTS.md` §1.1). 기록: `CUTOVER-LOG-2026-08-27.md` §W10.

> **창 종료 이후 코드 커밋은 둘이고 둘 다 운영에 반영됐다.** `579a338`(RETIRE 3줄, W9 발견 4)과
> `0ad3cde`(`wiki-snapshot` 요청 감축, W9 발견 3). **W1-b(`main` push)로 프론트를,
> W8-b(`functions deploy wiki-snapshot`)로 Edge Function을 올렸다** — 배포 경로 둘이 모두 닫혔다.
> `29a21d0`·`357a330`·`e272b44`·`298cf54`·`aa58bac`·`9eba7e9`·`48e3f2d`는 문서 전용이다.

> **2026-08-27~28 cutover 창이 실행됐고, 2026-09-02에 최종 종료됐다.** W6(`db push --linked`)로
> **운영 migration 11개 전량이 적용됐고**, W7 검증이 전항목 통과했으며, W8로 Edge Function 2개가
> 배포됐다. **W9에서 결함 6건이 나와 W10을 창 밖으로 넘겼고**(G3 경로), 창 밖 후속에서
> 4건을 닫은 뒤 **W10(게이트 해제)까지 완료했다.** 실행 기록 전문:
> `docs/ops/CUTOVER-LOG-2026-08-27.md` — 창 밖 후속은 §W1-b·§W8-b·§W9-b·§W10·§W11-b.

이 파일이 **"지금 상태"의 단일 기준**이다. `docs/CLAUDE_HANDOFF.md`는 배경 문서(전체 인계 정보)이고,
상시 금지·의무 사항은 `AGENTS.md`에 있다. 수치는 저장소 기록과 실측에서 그대로 옮겼고,
확인되지 않은 것은 `미확인`으로 둔다.

**갱신 규칙:** 커밋을 만든 세션이 이 파일의 기준 커밋·갱신 날짜를 같은 커밋 또는 직후 커밋에서
갱신한다 (`AGENTS.md` §7). 갱신 커밋은 자신의 해시를 담을 수 없으므로 **기준 커밋이 그 갱신
커밋의 부모인 상태가 정상이다** — 그 한 커밋 차이는 뒤처진 것이 아니다. 이 갱신 커밋은 문서만
변경하므로 아래 수치의 기준을 바꾸지 않는다.
**다만 부모인 `579a338`은 코드를 바꿨다** — §2의 2026-08-29 행이 그 커밋 기준 실측이다.

---

## 1. 판정

### CODE GO — 기준 커밋 `0ad3cde`

**유효 조건 (아래를 모두 만족하는 local/CI 환경에서만 유효)**

- 승인 이미지 `public.ecr.aws/supabase/postgres:17.6.1.158`, digest `sha256:99b1729aeb0bac314445024fc149fbd39306170b61dd50800ccf180327ab3459`
- Supabase CLI `2.114.0` (exact pin: `package.json` devDependencies)
- `npm run supabase:preflight` 통과 (image tag/ID/digest, migration history, RPC catalog/ACL, log 안정성)
- project/volume 격리 유지: `wiki-packet13-r2-clean158`

**즉시 무효화 조건**

- `.104` 이미지 또는 미승인 digest가 기본 경로로 선택되면 그 시점에 `CODE NO-GO`
- 운영 런타임은 이 고정 범위 **밖**이다. 이 판정은 운영 적용 근거가 아니다

> **⚑ 2026-09-04 재확인 — 13번째 migration이 붙은 뒤에도 유효 조건 4개가 전부 유지된다** `[산출물]`.
> **`npm run supabase:preflight` 11/11 PASS** — 승인 이미지 digest `sha256:99b1729a…` 동일 ·
> CLI `2.114.0` 동일 · project `wiki-packet13-r2-clean158` 동일 ·
> `postmaster-stability before == after`, **restart 0/0**. `migration-history`는 고정 3버전만
> 조회하므로 **`count=3` 그대로다** (`TRACKS.md` §2.4). **즉 15a의 migration 적용이 런타임 축을
> 흔들지 않았다.** 다만 `postgres-log` 케이스의 판정 창에 대해서는 **§2 끝의 관찰**을 함께 읽는다.

**이전 판정 기준(`339fb77`) 이후의 코드 변경분.** 비문서 변경은 **두 묶음**이다.

1. **유지보수 게이트** (`b24744e`) — `utils/maintenanceGate.js`,
   `components/MaintenanceScreen.jsx`, `main.jsx`, `appStyles.js`,
   `tests/maintenanceGate.test.js`, `.env.example`, `.gitignore`, `README.md`, `AGENTS.md`
   (`git diff --name-only 339fb77..HEAD`, 2026-08-27 `[산출물]`).
2. **2026-08-28 운영 장애 최소 수정 3건** — `components/ExitGuard.jsx`(React import),
   `supabase/functions/wiki-snapshot/index.ts`(User-Agent 헤더, info 배치 dedup).
   설계 변경 없음. 보류한 항목은 §5.4에 있다.

나머지 커밋은 `docs/`와 `wiki-race-2.0-handoff/` 문서다. 두 묶음 모두 `npm test` 142/142와
`npm run build` 성공으로 덮였고(2026-08-28 재실행), `032caba` 기준
`npm run supabase:preflight` 11/11로 런타임 축이 재확인됐다 (§2).

> **`wiki-snapshot`의 UA 문자열은 확정됐고 운영에 반영됐다** —
> `WikiRace/2.0 (https://wiki-dusky-one.vercel.app) supabase-edge-functions`.
> 도메인은 2026-08-28 운영 스택트레이스에서 확인된 실제 값이다 `[사용자 확인]`. 자리표시자는 없다.
> 이메일은 넣지 않는다 — Wikimedia 정책은 연락 가능한 **URL 또는 이메일 중 하나**면 충족한다.
> **W8(2026-08-28)이 이 값을 운영에 올렸고 싱글 경로의 429는 풀렸다.**
> ~~**그룹 경로는 풀리지 않았다**~~ — 62요청이 참가자 수만큼 곱해져 4인 그룹에서 502가 재발했다
> (§5.5 발견 3). **UA와 dedup만으로는 부족하다는 것이 창에서 실측됐다** — 그것이
> `0ad3cde`의 요청 감축으로 이어졌고, **W8-b 배포 후 재스모크에서 502가 0건이 됐다** (2026-09-02).

근거: `wiki-race-2.0-handoff/code/13-GROUP-FINAL-GAPS.md` §9·§21, `code/10-CODE-MASTER-TODO.md` §9.8

### ~~RELEASE HOLD~~ → **RELEASE 해제 — 기준 커밋 `48e3f2d`, 2026-09-02**

**서비스가 열렸다.** 2026-08-27~28 창이 DB·배포 축을 닫았고, 창 밖 후속이 W9 발견 4건을
전부 종결한 뒤 **W10(유지보수 게이트 해제)이 수행됐다.**

| 축 | 상태 | 근거 |
|---|---|---|
| 운영 DB migration | **적용 완료** — 11개 전량, W7 전항목 통과 | CUTOVER-LOG §W6·§W7 |
| Edge Function | **배포 완료** — `wiki-snapshot`(W8 → W8-b 재배포)·`single-run`(W8) | §W8·§W8-b |
| 프론트 | **배포 완료** — `main` = `9eba7e9` | §W1·§W1-a·§W1-b |
| W9 결함 6건 | **전건 종결** — 4건 수정·2건 결함 아님 | §5.5, CUTOVER-LOG §5-a |
| **유지보수 게이트** | **해제됨.** `VITE_MAINTENANCE` 삭제 + Redeploy | §W10 |

> **HOLD를 유지할 근거가 남아 있지 않다.** 이 판정은 "품질이 완결됐다"가 아니라
> **"게이트를 계속 켜 둘 사유가 없다"** 는 뜻이다. 잔여 검증은 §5에 있고,
> 그중 무엇도 게이트를 다시 켤 등급이 아니다. **다시 켜야 할 상황이 오면 W0의 역순이 아니라
> 새 창을 연다** — 게이트를 켜는 것 자체가 재배포이기 때문이다 (F11).

**바뀐 전제 — 이 문서 전체에 적용된다.**

| | 2026-09-02 이전 | 지금 |
|---|---|---|
| 사용자 노출 | **0.** 게이트가 막고 있었다 (최종 플레이 2026-08-04 `[실측]`) | **있다.** 프로덕션이 앱을 그대로 보여준다 |
| `main` push의 의미 | 게이트 뒤로 배포 | **즉시 사용자 노출** |
| 결함 발견 비용 | 게이트 뒤에서 조사 | 사용자가 먼저 만날 수 있다 |

**아래 두 절(창이 닫은 항목 / 남은 HOLD 사유)은 판정 경로의 기록으로 보존한다.**

#### 창이 닫은 항목 (2026-08-27~28)

| 항목 | 상태 | 근거 |
|---|---|---|
| 운영/linked DB migration 적용 | **완료.** W6에서 **11개 전량 적용 성공**, 오류 없음 | CUTOVER-LOG §W6 |
| 운영 dry-run | **완료.** pending 정확히 11개, 순서 표와 완전 일치 | CUTOVER-LOG §W5 |
| baseline 처리 (`schema_migrations` 부재) | **완료.** `repair` exit 0, 이력 1행 / `baseline_remote_schema` / `statement_count` 250 — 기대값 정확히 일치 | CUTOVER-LOG §W3·§W4 |
| 적용 결과 검증 | **완료. 전항목 통과** — 함수 36 / legacy RPC 2개 부재 / v13 제약 2개 `convalidated = true` / `rls_off_tables` 0 / publication 4테이블 / 이력 12행 | CUTOVER-LOG §W7 |
| Edge Function 배포 (`wiki-snapshot`, `single-run`) | **완료.** 이름 명시·`--prune` 미사용 | CUTOVER-LOG §W8 |
| Release A~D 승인 | **완료.** U2대로 11개를 한 창에서 전량 적용했다 | 대체 매핑 CUTOVER-PLAN §10 |
| `finish_group_player` 삭제에 따른 배포 순서 | **완료.** W0(게이트 on) → W1(main push) → W6 순서대로 실행됐고 구버전 세션 drain 문제는 발생하지 않았다 | CUTOVER-LOG §W1·§W6 |
| V2 이전 3개 migration(8/4·8/7·8/13) | **완료.** 11개 집합에 포함되어 적용됐다 | CUTOVER-LOG §W5·§W6 |
| **W2.5 삭제의 성격** | **운영에서는 "선택"이었다.** `w6_blocking_rows` **실측 0** — 리허설이 확정한 #10 실패 경로가 **운영에는 존재하지 않았다.** 그래도 삭제를 택했고(근거 3가지) 그 덕에 W7의 `convalidated = true`가 나왔다 | CUTOVER-LOG §W2.5. **CUTOVER-PLAN §5.3-0의 두 갈래 중 "선택" 쪽** |
| **롤백** | **발생하지 않았다.** §6.0.3의 트리거가 한 건도 발화하지 않았다 | CUTOVER-LOG §4 |

#### ~~남은 HOLD 사유~~ → **전건 종결 (2026-09-02)**

**W9 발견 4건이 전부 닫혔다.** 2026-08-29 조사에서 2건(4·5)이, 2026-09-02 배포·재스모크에서
나머지 2건(3·6)이 종결됐다. 조사 근거는 §5.5, 배포·검증 기록은 CUTOVER-LOG §W8-b·§W9-b.

| # | 항목 | 최종 상태 | 게이트 해제 차단? |
|---|---|---|---|
| **3** | **`wiki-snapshot` 502 대량 재발 (4인 그룹).** 준비 버튼 11회 연속 실패. **62요청 × 참가자 수**로 곱해지는 구조 | **해소 (2026-09-02).** 감축(`0ad3cde`)을 프론트(W1-b) → Edge Function(W8-b) 순으로 배포한 뒤 **4인 재스모크에서 502 0건.** 대기실 **124요청이 rate limit을 통과했다** `[사용자 보고]`. 게임 진입은 244 → **31건** | ~~예~~ → **아니오** |
| **4** | ~~**"유효하지 않은 RETIRE 사유"** — 결과 화면에서 로비 나가기 실패~~ | **해소 (2026-09-02 W1-b 배포 + 재스모크 확인).** 원인은 RPC 계약 불일치가 **아니라** `onClick` 바인딩 버그였다 `[코드]`. §5.5-4 | **아니오** |
| ~~5~~ | ~~**`username-lookup` 404**~~ | **종결 (2026-08-29) — 결함이 아니다.** 아이디 미존재 시의 **의도된 404 응답**이며 프론트가 이미 처리한다 `[코드]`. §5.5-5 | **아니오** |
| ~~6~~ | ~~**관전 이모티콘이 다른 참가자에게 전달되지 않음**~~ | **종결 (2026-09-02) — 스펙 범위 밖** `[사용자 판정]`. 스펙은 **"완주 관전자만 전송 가능"만 규정하고 수신자를 규정하지 않는다** `[문서]`. 렌더 경로가 `SPECTATING` 분기 하나뿐인 것은 확정 사실이나 그것이 위반의 근거는 아니다. §5.5-6 | **아니오** |

> **감축만으로 통과했다 — 이것이 §5.4-3의 답이다.** 대기실 요청 수는 244 → 124건으로 **절반만**
> 줄었고 그것으로 502가 사라졌다. 백오프는 필요하지 않았다 (§5.4-3).

**보존 — 2026-08-28의 W10 미수행 판정 근거.** 발견 3·4가 그룹 모드의 정상 이용을 막았고,
게이트를 해제하면 사용자가 준비 버튼 실패와 결과 화면 이탈 실패를 직접 만나는 상태였다.
**G3 경로(재개 포기, 게이트 켠 채 창 종료)를 채택했다** — CUTOVER-PLAN §6.0.2가 정의한
예정 경로이며 실패가 아니다. **그 판정이 옳았다는 것은 창 밖 후속이 증명했다** — 발견 3은
Edge Function을 배포하기 전까지 실제로 재현됐다.

#### 창이 닫지 않은 나머지

**2026-09-02 재스모크(W9-b)는 이 표를 바꾸지 않았다** — 4인 그룹 경로만 다시 밟았고
아래 항목은 어느 것도 그 범위에 없다. **게이트가 열렸으므로 이 표의 미실행 항목들은
이제 "실사용자가 먼저 밟을 수 있는 것"이 됐다** (§5).

| 항목 | 상태 | 처리 위치 |
|---|---|---|
| publication 운영 대조 | **해소 (2026-08-21 실측 → 2026-08-28 W7 재확인).** 4테이블, `group_spectator_emoji_rate_limits` 미포함 | CUTOVER-PLAN §1.2, CUTOVER-LOG §W7 |
| `GRANT` 70행 운영 대조 | **해소 (2026-08-27 → 2026-08-28 W2 재확인). 차이 0건** — 운영 스키마 덤프와 baseline이 **바이트 단위 완전 동일**(md5 양쪽 `e2bfa805…`, 1563행). W2 덤프도 리허설 덤프와 바이트 동일 | CUTOVER-PLAN **§1.4**, CUTOVER-LOG §W2 |
| 운영 17.6 권한 거부 경로 SIGSEGV 검증 | **미실행.** W9에서 의도적 1회도 수행하지 않았다 | §8.2-1로 이월 |
| 실제 브라우저 1:1 2세션 수동 검증 | **미실행.** 4인 그룹은 실제로 돌렸다(발견 3·6의 관측 경로) | §8.2-2 |
| 모바일 viewport / 키보드 / reduced-motion 검증 | **미실행** | §8.2-4 |
| **새 운영 스냅샷** | ~~**필수가 됐다.**~~ → **완료 (2026-09-02).** `PROD-SNAPSHOT-2026-08-20.md`를 무효화한 변화(함수 7→36, RLS 12/14→14/14, 이력 0→12행)를 **`PROD-SNAPSHOT-2026-09-02.md`가 실측으로 담았다** | §8.2-6 종결. §5.0 B1 |
| `target-level` Edge Function 존재 확인 | **미확인.** `--prune` 미사용은 확인됐으므로 삭제됐을 이유가 없다 | §8.1-7로 이월 |
| **§6.3 전체 복원 절차** | **쓰이지 않았다** (롤백 미발생). 운영 실행 권한은 **여전히 미검증**이다. 창 §0.0의 실행 전제 3항목(Docker·승인 이미지·IPv4 연결)도 **당일 확인 기록이 없다** | CUTOVER-PLAN **§6.3**·**§6.5**, CUTOVER-LOG §0.0 |
| **`public` 전용 데이터 덤프** | **W2에서 빠졌다.** §6.3.3이 "§4.3에 추가"라고만 하고 §4.3 명령 목록에 실제로 추가되지 않은 것이 원인이다. 복원 시 `slice-public.awk`(§6.3.3 (b))로 대체 가능 | CUTOVER-PLAN §4.3 수정 대상 |

근거: `docs/ops/CUTOVER-LOG-2026-08-27.md` (창 실행 기록 전문),
`docs/ops/CUTOVER-PLAN.md` §1·§7·§8·§9·§10·§11,
`wiki-race-2.0-handoff/qa/30-INTEGRATION-CHECKLIST.md` §21, `docs/CLAUDE_HANDOFF.md` §4.4

---

## 2. 검증 수치

**실행 시점이 기재된 기준 커밋과 다른 항목은 그 사실을 명시한다** — 일부 수치는 동일 변경이
미커밋 작업 트리에 있던 시점에 측정됐다.

| 항목 | 수치 | 실행 날짜 | 기준 |
|---|---|---|---|
| B1 브라우저 게이트 시나리오 | 12/12 (failed 0, skipped 0) | 2026-08-19 | `339fb77` **이전** — 미커밋 작업 트리, HEAD `450f63a` |
| B1 browser contexts | 53/53 (created/closed) | 2026-08-19 | 동일 실행 |
| B1 realtime join ack | 52/52 | 2026-08-19 | 동일 실행 |
| B1 event delivery | 90/90 | 2026-08-19 | 동일 실행 |
| B1 duplicate_events | 0 | 2026-08-19 | 동일 실행 |
| B1 unexpected_wikipedia_requests | 0 | 2026-08-19 | 동일 실행. **Wikipedia는 fixture 인터셉트** — 실제 API 아님 |
| B1 wiki_snapshot 429 | 0 | 2026-08-19 | 동일 실행 |
| B1 log window current fatal | 0 (historical 39) | 2026-08-19 | 동일 실행 |
| `npm test` | 126/126 | 2026-08-18 | `339fb77` **이전** — 문서 기록 |
| `npm test` | 129/129 | 2026-08-20 | `339fb77` 실측. 08-19에 추가된 B1 시나리오 계약 테스트 3개가 늘어난 차이다 |
| `npm test` | **142/142** | 2026-08-21 | `b24744e` 실측. 베이스라인 129 + 유지보수 게이트 13 (`tests/maintenanceGate.test.js`) |
| `npm test` | **142/142** | 2026-08-23 | `032caba` 실측. Docker Desktop 재시작 후 재확인 |
| `npm test` | **142/142** | 2026-08-28 | `be520c3` 실측. 운영 장애 최소 수정 3건 후 재실행. **테스트 수는 늘지 않았다** — 수정이 기존 계약 안에 들어간다 (`serverAuthorityMigration.test.js:62-65`, `groupFinalGaps.test.js:66-68` 무영향) |
| `npm test` | **142/142** | 2026-08-29 | `579a338` 실측. RETIRE 3줄 수정 후 재실행. **테스트 수는 늘지 않았다** — `onClick` 바인딩은 기존 계약(`groupGameFlow.test.js:198`의 `shouldRetireGroupPlayer`)을 건드리지 않는다 |
| `npm test` | **144/144** | 2026-09-02 | `0ad3cde` 실측 (측정은 커밋 직전 작업 트리). **+2** — `serverAuthorityMigration.test.js`의 목적지 revision 계약이 **제거의 유지**로 뒤집히면서 재사용·본문 플래그 계약 2건이 늘었다 |
| `npm test` | **144/144** (fail 0, skipped 0) | 2026-09-02 | `48e3f2d` 실측 `[산출물]`. **W10 완료 세션의 재확인.** 이 세션은 문서만 바꿨으므로 수치가 같은 것이 정상이다 |
| `npm test` | **144/144** (fail 0, skipped 0) | 2026-09-02 | `f40e071` 실측 `[산출물]`. **병렬 트랙 세팅 세션(`TRACKS.md` 신설)의 재확인.** 문서만 바꿨으므로 수치가 같은 것이 정상이다 |
| `npm test` | **144/144** (fail 0, skipped 0) | 2026-09-02 | `e1b5546` 실측 `[산출물]`. **결정 3건 확정·창 범위 확정 세션.** 문서만 바꿨다 |
| `npm test` | **144/144** (fail 0, skipped 0) | 2026-09-02 | `b281e01` 실측 `[산출물]`. **C4-① 확정·ACL 절차·A·B 착수 티켓 세션.** 문서만 바꿨다 |
| `npm test` | **144/144** (fail 0, skipped 0) | 2026-09-02 | `ad569f2` — **트랙 A·B의 분기점.** 두 트랙이 각자 이 값을 베이스라인으로 기록했다 |
| `npm test` | **161/161** (fail 0) | 2026-09-03 | `e70c541` **트랙 A 단독** `[산출물]`. **+17** — `tests/profileCard.test.js` |
| `npm test` | **186/186** (fail 0) | 2026-09-03 | `7a7197e` **트랙 B 단독** `[산출물]`. **+42** — `tests/resultReasonLabels.test.js` + `tests/explorationRecords.test.js` |
| `npm test` | **203/203** (fail 0, skipped 0, todo 0) | 2026-09-03 | `527f896` **A·B 통합 후** `[산출물]`. **144 + 17 + 42 = 203 — 단순 합과 정확히 일치한다.** 두 트랙이 같은 테스트 파일을 건드리지 않았고 서로의 assert를 무효화하지도 않았다는 뜻이다 (화이트리스트 배타성의 사후 확인) |
| `npm test` | **204/204** (fail 0, skipped 0, todo 0) | 2026-09-03 | `eeb7a16` 실측 `[산출물]`. **+1** — N2 해소 테스트 (`explorationRecords.test.js`의 `(3) 랭킹 전체 보기 진입점은 게스트에게 노출되지 않는다`). 측정은 커밋 직전 작업 트리 |
| `npm test` | **252/252** (fail 0, skipped 0, todo 0) | **2026-09-04** | **`1af9f93` — 트랙 D(15a) 통합 후** 실측 `[산출물]`. **+48** — `tests/xpLedger.test.js`. **204 + 48 = 252, 단순 합과 정확히 일치한다** — 15a는 기존 테스트 파일을 하나도 건드리지 않았다 |
| **pgTAP `xp_ledger_v1`** | **128/128** (`not ok` **0건**) | **2026-09-04** | **`1af9f93`** 실측 `[산출물]`. `supabase/tests/xp_ledger_v1.sql`을 **통합 환경에서 재실행**했다. **파일이 `rollback`으로 끝나 DB 상태를 남기지 않는다** (계약 테스트가 이 성질을 assert) |
| production build (`npm run build`) | **PASS** (exit 0) | **2026-09-04** | **`1af9f93`** 실측 `[산출물]`. 214 모듈 · `App-*.js` **551.09 kB**(gzip 163.08) — **`eeb7a16`과 같은 값이다**(vite 보고 단위 기준. 모듈 수도 214로 같다). 15a가 어느 화면에도 연결되지 않았으므로(범위 밖 ④⑤) **번들이 늘지 않는 것이 정상이다** |
| `npm run supabase:preflight` | **11/11 PASS** | **2026-09-04** | **`1af9f93`** 실측 `[산출물]`. **13번째 migration 적용 후** 재실행. `migration-history count=3` 유지 · `postmaster-stability before == after`, restart **0/0**. **CODE GO 유효 조건이 유지된다** |
| **저장소 migration 수** | **13개** (마지막 `20260903090000_xp_ledger_v1.sql`) | **2026-09-04** | `1af9f93` `[산출물]`. **로컬 스택에는 13개가 적용됐다.** ~~12개~~ |
| **운영 migration 수** | **12개** — **변화 없다** | 2026-08-28 | 창 W7 `[사용자 보고]`. **13번째는 운영에 없다** (R6, `AGENTS.md` §1). **저장소 13 ↔ 운영 12의 차이는 이 시점부터 정상 상태이며, 3코스 창이 그 차이를 닫는다** |
| `npm test` | **258/258** (fail 0, skipped 0, todo 0) | **2026-09-04** | **`8a3c77f`** 실측 `[산출물]`. **+6** — `tests/supabaseRuntimeValidation.test.js`의 standby EOF 면제 계약 5건 + **선행 결함 등재 1건**. 측정은 커밋 직전 작업 트리 |
| `npm run supabase:preflight` | **11/11 PASS** | **2026-09-04** | **`8a3c77f`** 실측 `[산출물]`. `postgres-log`가 **`dangerous_marker=false benign_suppressed=0`** — detail에 면제 건수 필드가 생겼다 |
| **`postgres-log` 전체 로그 판정** | **구 로직 `dangerous=true`(FAIL) → 신 로직 `false`(PASS)**, 면제 **8줄** | **2026-09-04** | **`8a3c77f`** 실측 `[산출물]`. `docker logs --timestamps` **전량 31,040줄**에 대해 두 로직을 직접 대조했다. **면제 8줄을 빼면 위험 마커가 0건** — 오탐 외에 가려진 것이 없다는 뜻이다 |
| log window self-test | **14/14 PASS** | **2026-09-04** | **`8a3c77f`** 실측 `[산출물]`. `negative-current-signal-11`·`negative-current-panic` 포함 전건 통과. **2026-08-23의 12/12에서 케이스가 2건 늘었다** — 그 사이 추가된 것이며 이번 변경이 만든 차이가 아니다 |
| build (`npm run build`) | **PASS** (exit 0) | **2026-09-04** | **`8a3c77f`** 실측 `[산출물]`. 스크립트·테스트만 바뀌어 번들에 영향이 없다 |
| pgTAP Packet 13 | 33/33 | 2026-08-18 | `339fb77` 이전 |
| pgTAP spectator emoji atomicity | 22/22 | 2026-08-18 | `339fb77` 이전 |
| pgTAP Server Authority V2 | 97/97 | 2026-08-18 | `339fb77` 이전 |
| pgTAP Phase 2C | 49/49 | 2026-08-18 | `339fb77` 이전 |
| deterministic concurrency | 6 시나리오 × 3회 PASS | 2026-08-18 | `339fb77` 이전 |
| crash regression | 4종 PASS | 2026-08-18 | `339fb77` 이전 |
| production build (`npm run build`) | PASS (약 689KB chunk 경고) | 2026-08-18 | `339fb77` 이전 |
| production build (`npm run build`) | **PASS** | 2026-08-21 | `b24744e` 실측. **커밋 기준 재실행 완료** — CUTOVER-PLAN §7 P13 |
| production build (`npm run build`) | **PASS** | 2026-08-28 | `be520c3` 실측. 산출물의 바 `React.createElement`가 **7건 → 0건** — ExitGuard 수정이 번들 수준에서 확인됐다 |
| production build (`npm run build`) | **PASS** (exit 0) | 2026-08-29 | `579a338` 실측. 청크 경고는 기존과 동일 |
| production build (`npm run build`) | **PASS** (exit 0) | 2026-09-03 | `527f896` **A·B 통합 후** 실측 `[산출물]`. 214 모듈 · `App-*.js` 550.99 kB(gzip 163.06) · `appStyles-*.css` 72.07 kB. **500 kB 청크 경고는 기존과 동일하며 새로 생긴 것이 아니다** |
| production build (`npm run build`) | **PASS** (exit 0) | 2026-09-03 | `eeb7a16` **N2 해소 후** 실측 `[산출물]`. `App-*.js` 551.09 kB(gzip 163.08) — 통합 시점 550.99 kB 대비 **+0.10 kB**(게이팅 1줄·안내 문구 1줄). 청크 경고는 기존과 동일 |
| production build (`npm run build`) | **PASS** (exit 0) | 2026-09-02 | `0ad3cde` 실측 (측정은 커밋 직전 작업 트리) |
| production build (`npm run build`) | **PASS** (exit 0) | 2026-09-02 | `48e3f2d` 실측 `[산출물]`. `App-*.js` 546.39 kB — 500 kB 청크 경고는 기존과 동일 |
| **4인 그룹 재스모크 (운영, W9-b)** | **전 경로 통과.** 대기실 준비 버튼 **502 0건**(124요청 통과), 게임 진입 **31요청**, 문서 전환 정상, 결과 화면 로비 나가기 정상, 관전 화면 본문 정상 렌더 | 2026-09-02 | 운영 실측 `[사용자 보고]`. **Edge Function 재배포(W8-b) 후** 측정이라 유효하다 — 그 전 값은 61건 그대로였다. CUTOVER-LOG §W9-b |
| **유지보수 게이트 (운영, W10)** | **해제됨** — `VITE_MAINTENANCE` 삭제 + `9eba7e9` Redeploy. 프로덕션 URL에서 점검 화면 없이 앱 렌더 | 2026-09-02 | `[사용자 확인]`. CUTOVER-LOG §W10 |
| **`wiki-snapshot` Wikipedia 요청 수** | cold **61 → 31**, warm **61 → 0**, 관전 **61 → 1** / 4인 대기실 **244 → 124**, 4인 진입 **244 → 31** | 2026-09-02 | `scripts/wikiSnapshotRequestCount.mjs` 실측 `[산출물]`. before = `aa58bac`, after = `0ad3cde`. **baseline "제목만" 62건이 2026-08-28 기록과 일치**해 하네스가 검증됐다 |
| `npm run supabase:preflight` | **11/11 PASS** | 2026-08-23 | `032caba` 실측. `postmaster-stability before == after`, restart 0/0 |
| log window self-test | **12/12 PASS** | 2026-08-23 | `032caba` 실측. `negative-postmaster-changed` 포함 |
| `npm run supabase:clean-gate` / `supabase:postgrest-smoke` 재실행 | 미확인 | — | `339fb77` 이후 재실행 기록 없음. `supabase:preflight`와 별개 스크립트다 |
| 운영 dry-run (`db push --dry-run --linked`) | **pending 11개, 순서 표와 완전 일치** | 2026-08-28 | 창 W5 `[사용자 보고]`. `--include-all` 미사용 |
| **운영 migration 적용 (`db push --linked`)** | **11/11 적용 성공, 오류 없음** | 2026-08-28 | 창 W6 `[사용자 보고]`. **소요 시간은 미기록** — 시작 21:47만 남았다 |
| **운영 적용 검증 (W7)** | **전항목 통과** — 함수 **36** / legacy RPC 2개 `null` / v13 제약 2개 `convalidated=true` / `rls_off_tables` **0** / publication **4테이블** / 이력 **12행** | 2026-08-28 | 창 W7 `[사용자 보고]` |
| 운영 스키마 덤프 ↔ baseline | **바이트 단위 동일** (41,399 B / 1,563행, md5 `e2bfa805…`) | 2026-08-28 | 창 W2 덤프를 로컬에서 재측정 `[산출물]`. W-1 리허설 덤프와도 동일 |

> ### ~~⚠ 관찰~~ → **✅ 해소 — `postgres-log` 패턴을 좁혔다 (2026-09-04, `8a3c77f`)**
>
> **근거 커밋 `8a3c77f`** (`fix(preflight): stop flagging benign standby EOF as a runtime crash`).
> 아래는 관찰 당시의 기록이며 **진단은 그대로 유효하다.** 수정 내용과 판정 근거는 이 블록 끝에 있다.
>
> `postgres-log` 케이스는 컨테이너 로그를 `DANGEROUS_RUNTIME_MARKERS`로 검사하고, 그 정규식에
> **`unexpected eof`가 들어 있다** (`scripts/supabase-runtime-validation.mjs:1`) `[코드]`.
> 그런데 로컬 스택의 전체 로그에는 **`LOG: unexpected EOF on standby connection`이 8건** 있다
> `[산출물]`. **이것은 크래시가 아니다** — Realtime의 논리 복제 슬롯
> (`START_REPLICATION SLOT supabase_realtime_messages_replication_slot_`)이 연결을 끊을 때
> 워커가 남기는 **`LOG` 등급** 줄이다.
>
> | 축 | 실측 |
> |---|---|
> | 등급 | **`LOG`** — `FATAL`도 `PANIC`도 아니다 |
> | 크래시 흔적 | **0건** — `PANIC` · `terminated by signal` · `reinitializ*` 전부 **0** |
> | postmaster | **2026-08-23 14:01:28 이후 바뀌지 않았다.** 가장 최근 EOF(2026-09-03 11:15:08)보다 **앞선 시각이 그대로 유지된다** — 즉 그 EOF가 재시작을 만들지 않았다 |
> | docker `RestartCount` | **0** |
> | 직후 로그 | **checkpoint가 정상 주기로 이어진다** (11:19:11 → complete) |
>
> **왜 지금 preflight가 통과하는가.** `postgres-log`는 **`docker logs --tail 500`만** 읽는다
> (`scripts/supabase-runtime-preflight.mjs:249`) `[코드]`. 최근 500줄에 EOF가 없어서
> `dangerous_marker=false`가 나온다. **즉 통과는 "안전함의 확인"이 아니라 창 크기의 결과다** —
> 창 안에 이 줄이 들어오면 **정상 상태에서 `CASE FAIL`이 난다.**
>
> **여유가 크지 않다** `[산출물]`: 전체 로그 **31,033줄** 중 마지막 EOF는 **30,442번째 줄**이다 —
> 끝에서 **591줄**. **판정 창(500줄) 밖으로 91줄 차이다.** 로그가 조금만 덜 쌓였거나
> `--tail` 값이 커지면 **아무것도 고장나지 않은 상태에서 preflight가 실패한다.**
>
> ~~**패턴을 조정할지는 별도 판단이다.**~~ → **조정했다 (2026-09-04, `8a3c77f`).**
> **트랙 C 착수 전 선행 작업으로 수행했다** — C는 `supabase:preflight`를 통과시킨 뒤 시작하는데,
> 로그가 조금만 더 쌓이면 그 관문이 멀쩡한 상태에서 막힌다.
>
> **면제 방식 — 두 안을 합쳐 가장 좁게 잡았다.**
>
> | 안 | 왜 그것만으로는 부족한가 |
> |---|---|
> | **문자열 허용 목록**(`standby connection` 포함 줄) | **severity를 보지 않아 `FATAL:  unexpected EOF on standby connection`까지 뚫린다** |
> | **severity로 한정**(`FATAL`/`PANIC`과 함께일 때만 위험) | **같은 패턴이 도는 다른 두 경로에는 severity가 아예 없다** — `classifyChildProcessResult`는 자식 프로세스 stdout/stderr에, `parseTapTranscript`는 TAP 출력에 돈다. 거기서는 기준이 성립하지 않는다 |
> | **채택 — 둘을 합친다** | **`LOG:` severity가 붙은 한 줄 형태만** 면제한다. `LOG:` 리터럴을 앵커로 쓰므로 **severity 게이트가 공짜로 따라온다** |
>
> **탐지력이 넓게 뚫리지 않는 근거 3가지.**
> ① **면제는 줄 단위다** — 같은 텍스트의 다른 줄에 있는 위험 마커는 그대로 걸린다.
> ② **크래시는 이 줄에 의존하지 않는다** — signal 11 · segfault · `terminated` ·
> `reinitializ*` · `recovery` · PANIC · 57P02가 각각 독립적으로 잡는다. standby EOF가
> **크래시의 유일한 증거인 경우는 없다.**
> ③ **면제가 조용하지 않다** — `benign_suppressed=N`이 `CASE` 줄에 찍힌다.
>
> **실측 판정** `[산출물]`: **전체 로그 31,040줄**에 대해 **구 로직 `dangerous=true`(CASE FAIL)
> → 신 로직 `false`(CASE PASS)**, 면제 **8줄**. **그 8줄을 빼면 31,040줄 안에 위험 마커가 하나도
> 없다** — 즉 면제가 다른 무엇을 가리고 있지 않다. `postgres-log`는 `benign_suppressed=0`으로
> PASS한다(창 안에 해당 줄이 없다). 같은 오탐이 있던 **log-window 경로에도 같은 조건으로 적용**했다.
>
> **⚠ 그 과정에서 선행 결함 2건이 드러났다. 고치지 않고 등재만 했다** — §2 끝의 별도 블록.

> ### ⚠ 선행 결함 2건 — **`8a3c77f`가 만든 것이 아니고 고치지도 않았다** `[2026-09-04 실측]`
>
> standby EOF 오탐을 고치면서 **마커 목록 자체의 커버리지 구멍**이 드러났다. **탐지력을 넓히는
> 방향이라 이번 변경(좁히기)과 성격이 반대이고, 새 오탐을 만들 수 있어 별건으로 둔다.**
> **둘 다 테스트로 고정해 두었다** (`tests/supabaseRuntimeValidation.test.js`의 `선행 결함 등재`) —
> **커버리지를 바꾸면 그 테스트가 먼저 실패해서 알려준다.**
>
> | # | 결함 | 실측 |
> |:-:|---|---|
> | **P1** | **두 마커 목록의 커버리지가 다르다** | `DANGEROUS_RUNTIME_MARKERS`(preflight `postgres-log` · 자식 프로세스 · TAP)에 **`panic`·`terminated`·`reinitializ*`·`starting up`이 없다.** 넷 다 `PACKET13_CURRENT_FATAL_MARKERS`(log-window)에만 있다. **즉 `PANIC: could not write to file` 한 줄만 있는 로그는 preflight가 통과시킨다** `[산출물]` |
> | **P2** | **둘 다 놓치는 줄이 하나 있다** | **`LOG:  server process (PID 9) was terminated by signal 6: Aborted`가 어느 경로에서도 잡히지 않는다.** `server-terminated` 정규식이 `server process`와 `terminated`가 **붙어 있기를** 요구하는데 실제 PostgreSQL 형식은 그 사이에 **`(PID N) was`가 들어간다.** signal 11만 별도 패턴으로 **우연히** 걸리고, **signal 6·9 같은 다른 크래시는 조용히 통과한다** `[산출물]` |
>
> **P2가 더 무겁다.** P1은 "다른 경로가 잡는다"로 완충되지만, P2는 **실제 크래시 형식이 두 목록의
> 어느 정규식과도 맞지 않는 것**이다. `signal 11`이 잡히는 이유는 `server-terminated`가 아니라
> **`signal 11` 리터럴 패턴**이며, 같은 형식의 `signal 6`은 그 리터럴이 없어 빠져나간다.
>
> **판단이 필요한 이유.** 고치려면 `\bsignal(?:\s+|[_-])\d+\b`처럼 넓히거나 `server process .*
> terminated`로 느슨하게 해야 하는데, **같은 정규식이 자식 프로세스 stdout과 TAP 출력에도 돌기
> 때문에** 정상 텍스트에 걸릴 위험이 있다. **이번 커밋의 원칙(가장 좁은 변경)과 반대 방향이라
> 근거를 따로 세워 결정한다.**

수치 출처: `wiki-race-2.0-handoff/code/10-CODE-MASTER-TODO.md` §9.8,
`test-results/packet13-b1/b1.3-2026-08-19T01-19-11-669Z-7c95d293/summary.json` (gitignore 대상 로컬 산출물),
`docs/ops/CUTOVER-PLAN.md` §7 P13, `docs/CLAUDE_HANDOFF.md` §3.2 "런타임 baseline 축의 성질".

---

## 3. 원격 상태

측정 시점: **2026-09-04 — 두 값이 다시 갈렸다.**
**`origin/main` = `a784d2e`** (2026-09-03 배포 이후 **변화 없음**) ·
**`origin/feat/group-final-gaps` = `8a3c77f` + 이 문서 커밋** (`git ls-remote origin` 실측 `[산출물]`).
**차이는 트랙 D(15a)와 preflight 수정이다.** D가 `main`에 없는 것은 의도된 상태다 — migration을
담고 있어 **3코스 창 전에는 올리지 않는다** (`AGENTS.md` §1·§1.1, `TRACKS.md` §7).
**`8a3c77f`는 검증 스크립트라 운영 번들과 무관하며, 같은 이유로 단독 배포할 것도 아니다.**
이전 측정: 2026-09-04 `039ab3d`(feat) / 2026-09-03 `a784d2e`(둘 다) / 2026-09-02 `48e3f2d`(feat) / `9eba7e9`(main, W1-b 직후) /
2026-08-29 `e272b44` / 2026-08-28 23:21 `4a78a0d`.

> ### ⚑ **2026-09-03 — `main` 배포가 실행됐다. 게이트 없이 실사용자에게 닿은 첫 배포다**
>
> ```
> git push origin feat/group-final-gaps:main     # 9eba7e9..a784d2e
> ```
>
> **`[사용자 실행, 2026-09-03]`.** Vercel 프로덕션 빌드가 트리거됐다.
> **`AGENTS.md` §1.1이 정의한 승인 조건("이 변경을 실사용자에게 지금 노출해도 되는가" +
> 배포 전 검증)이 충족된 건별 승인**이며, **그 승인은 이 push에서 끝났다** — 다음 push는 새 승인이다.
>
> | 항목 | 값 |
> |---|---|
> | 범위 | **`9eba7e9..a784d2e` 17커밋** — 코드 3(`e70c541` A · `7a7197e` B · `a784d2e` N2) + `--no-ff` merge 3(`b3da192`·`527f896`·`eeb7a16`) + **문서 11** `[산출물]` |
> | 사용자에게 닿는 변화 | **트랙 A** 프로필 카드 공통 컴포넌트(6지점 이주) · **트랙 B** 서버 권위 순위 + 게스트 경계 + `resultReasonLabels` · **N2** 게스트 랭킹 진입점 숨김 |
> | **DB** | **변경 없음.** migration 산출물 0개, 운영 DB 미접근. **프론트 전용 배포다** |
> | Edge Function | **변경 없음.** `supabase/functions/`는 Vercel 배포에 포함되지 않는다 (W1-b에서 확인된 사실) |
> | 배포 전 검증 | `npm test` **204/204** · `npm run build` **exit 0** (§2) · **로컬 스모크 전항목 통과** (아래) |
> | 롤백 경로 | **이전 Vercel 배포(`9eba7e9`)로 되돌리는 것.** DB를 건드리지 않았으므로 **프론트만 되돌리면 정합이 맞는다** — 8월 창 이후 배포 중 되돌리기가 가장 단순한 건이다 `[추정]` |
>
> **로컬 스모크 (배포 전, `npm run dev`) — 전항목 통과** `[사용자 확인, 2026-09-03]`:
> 프로필·랭킹·공개 프로필 모달·그룹 로비 참가자 카드 렌더 · **로그인 완주 순위가 서버 값**
> ("2건 중 1위") · 게스트 경계 3항목.
>
> | **미확인 — 운영에서 확인할 것** | 왜 로컬에서 못 봤나 |
> |---|---|
> | **그룹 참가자 행** | 3명 이상이 실제로 모여야 하는 경로다 |
> | **실제 이미지 fallback 경로** | `legacyImageUrl` → 이니셜 → 시스템 기본의 2·3단 전이는 **실제 `avatars` 객체와 로딩 실패**가 있어야 밟힌다 (C5 §3.1~§3.2) |
>
> **이 둘은 배포 차단 사유가 아니었다** — 렌더 실패 시의 대체 경로이고, 실패해도
> 이니셜 placeholder로 떨어지도록 설계된 부분이다 (C5 §3.2). **운영에서 확인 후 여기에 적는다.**

> ### ⚑ 게이트 상태 — **해제됨 (2026-09-02, W10)**
>
> | 항목 | 값 |
> |---|---|
> | `VITE_MAINTENANCE` | **삭제됨.** `"true"`가 아니면 비활성이므로 `false` 설정과 판정이 같다 (`utils/maintenanceGate.js:26`) `[코드]` |
> | `VITE_MAINTENANCE_BYPASS` | **유지.** 다음 창에서 다시 쓴다. 게이트가 꺼진 동안에는 판정에 영향이 없다 `[코드]` |
> | 프로덕션 화면 | **앱 정상 렌더** (점검 화면 없음) `[사용자 확인, 2026-09-02]` |
> | 반영 방법 | 최신 Production 배포(`9eba7e9`) **Redeploy** — `VITE_*`는 빌드 시점 인라인이라 값 변경만으로는 반영되지 않는다 (F11) |
>
> **`main` push는 이제 곧 사용자 노출이다.** 아래 "`main` push 금지" 절과 `AGENTS.md` §1.1을
> 이 사실 위에서 다시 썼다.

> ### ~~⚠ 두 ref가 다시 갈라졌다 (2026-09-02, W1-b 이후)~~ → **다시 같아졌다 (2026-09-03)**
>
> **`main` = `feat/group-final-gaps` = `a784d2e`.** 2026-09-03 배포가 두 ref를 맞췄다.
>
> **보존 — 2026-09-02의 판단.** `48e3f2d`(문서 전용)를 `feat`에만 push했고 `main`은 `9eba7e9`에
> 멈춰 있었다. 그것은 의도된 상태였다: 문서 커밋은 배포에 영향이 없고 `main` push는 곧
> 프로덕션 재배포이기 때문이다. **그 규칙은 지금도 유효하다** — **다시 갈라지는 것이 정상이며,
> 이번처럼 같아진 것은 배포가 있었기 때문이다.** 다음 문서 커밋부터 다시 갈라진다.
> **뒤처져 있다는 이유로 `main`을 맞추지 않는다.**

아래 값은 **`feat` push 후 실측**이며 재측정 명령을 함께 적는다.

> ### `main` push 실행 (2026-09-02) — **W1-b**
>
> **이 절은 W1-b 시점의 기록이다.** 2026-08-29에 보류했던 `main` push를
> **W9 발견 3의 코드 수정이 갖춰진 뒤 실행했다** `[사용자 승인, 2026-09-02]`.
> 전제였던 **유지보수 게이트 ON은 프로덕션 URL에서 점검 화면 렌더로 확인했다**
> `[사용자 확인, 2026-08-29]`. 기록: `CUTOVER-LOG-2026-08-27.md` §W1-b.
> **이 push로 두 ref가 잠시 같은 커밋이 됐다** — 그 뒤 문서 커밋이 쌓이며 다시 갈라졌고
> **그것이 의도된 상태다** (위 상자).
>
> **이 push는 프론트만 배포했다. Edge Function은 W8-b에서 별도로 올렸다** — 아래 상자 참조.
>
> **아래 커밋 수는 측정 시점 값이고, 이 절을 기록·갱신하는 커밋 자신은 포함되지 않는다**
> (서두의 갱신 규칙과 같은 이유 — 커밋은 자기 해시를 담을 수 없다).
> **정확한 현재 값은 오른쪽 재측정 명령으로 읽는다.**

| 항목 | 값 | 재측정 명령 |
|---|---|---|
| `origin/main` HEAD | ~~`9eba7e9`~~ → **`a784d2e`** (2026-09-03 배포가 올린 값). `9eba7e9`에서 **17커밋 앞** | `git ls-remote origin refs/heads/main` |
| `origin/feat/group-final-gaps` HEAD | **`a784d2e`** — `main`과 **같다.** **이 절을 갱신한 커밋을 push하면 다시 1커밋 앞이 된다**(문서 전용, `main`에 올리지 않는다) — 위 자기참조 주의 | `git ls-remote origin refs/heads/feat/group-final-gaps` |
| 현재 브랜치 upstream | `origin/feat/group-final-gaps` (설정됨) | `git rev-parse --abbrev-ref "@{u}"` |
| upstream 대비 | **0 behind / 0 ahead** — push 완료 | `git rev-list --left-right --count "@{u}...HEAD"` |
| `origin/main...HEAD` | ~~0 behind / 1 ahead~~ → **0 behind / 0 ahead** (배포 직후 측정값) | `git rev-list --left-right --count origin/main...HEAD` |
| `e6d8eee..HEAD` 커밋 수 | **46** (`48e3f2d` 기준, 2026-09-02 실측) | `git rev-list --count e6d8eee..HEAD` |
| `37adc69`·`450f63a`·`339fb77`·`f1e61fa`·`b24744e`·`032caba`·`be520c3` | `origin/main`·`origin/feat/group-final-gaps` **양쪽에 포함** | `git branch -r --contains <sha>` |

**W1-b가 올린 것 — `4a78a0d..9eba7e9` 9커밋** (2026-09-02 실측 `[산출물]`):

| 커밋 | 성격 | 배포 효과 |
|---|---|---|
| `9eba7e9`·`aa58bac`·`298cf54`·`e272b44`·`357a330`·`29a21d0`·`1599be9` | 문서 7건 | 없음 |
| **`0ad3cde`** | **코드 — Edge Function + 프론트 + 테스트 + 계측 스크립트** | **프론트분만 반영된다.** `supabase/functions/`는 Vercel 배포에 포함되지 않는다 |
| **`579a338`** | **코드 — `pages/GroupGamePage.jsx` 3줄** | **반영됨** — W9 발견 4(RETIRE) 해소 |

> ### ~~⚠ 미완료 — Edge Function 배포~~ → **완료 (2026-09-02, W8-b)**
>
> `0ad3cde`는 배포 경로가 둘로 갈리는 첫 커밋이다. **양쪽 다 닫혔다.**
>
> | | 배포 경로 | 상태 |
> |---|---|---|
> | 프론트 (`pages/`·`services/`) | `main` push → Vercel | **완료 (W1-b, 2026-09-02)** |
> | **Edge Function** | **`npx supabase functions deploy wiki-snapshot`** | **완료 (W8-b, 2026-09-02)** |
>
> **순서를 지켰다 — 프론트 먼저.** 새 프론트가 `includeDocument`를 보내도 옛 함수는
> 무시하고 늘 HTML을 주므로 안전하다(감축 효과만 늦게 나온다). 역순이면 옛 프론트가
> 플래그를 보내지 않아 warm 경로가 빈 HTML을 주고 관전 화면이
> `SPECTATOR_DOCUMENT_UNAVAILABLE`로 깨진다 (§5.4-1·2).
> **W9-b에서 관전 화면 본문이 정상 렌더된 것이 순서가 지켜졌다는 확인이다.**
>
> **W8-b 이후에 돌린 재스모크만 유효하다.** 그 전 스모크는 운영 요청 수가 61건이라
> 발견 3이 그대로 재현되는 상태였다. 유효한 측정은 **2026-09-02 W9-b 하나뿐**이며,
> 거기서 **502가 0건**이었다 (CUTOVER-LOG §W9-b).

`git ls-remote`는 원격을 직접 조회하므로 `fetch` 없이도 실제 값을 준다. 이 클론에는
`.git/FETCH_HEAD`가 없어 remote-tracking ref는 push 결과만 반영한다 — **`git status`의
ahead/behind만 믿지 말고 `ls-remote`로 대조한다.**

**`main`은 더 이상 5월 상태가 아니다.** 그룹 보안 하드닝, 서버 권위 V2, Packet 13, 유지보수 게이트,
2026-08-28 최소 수정 3건, **그리고 2026-09-02 W1-b로 W9 발견 3·4 수정**이 전부 들어 있고
Vercel 프로덕션에 배포된 상태다.
~~**사용자에게는 점검 화면만 보인다**~~ → **사용자에게 앱이 그대로 보인다.**
**W10(2026-09-02)이 `VITE_MAINTENANCE`를 삭제하고 재배포했다** — 위 게이트 상태 상자.
게이트 ON은 W1-b 실행 **전에** 프로덕션 URL에서 점검 화면 렌더로 확인했고
`[사용자 확인, 2026-08-29]`, 해제 후에는 **앱 렌더로 확인했다** `[사용자 확인, 2026-09-02]`.

### `main` push 이력 — **3건. 3번째는 성격이 다르다**

| | 시점 | 대상 | 사유 | 게이트 | 기록 |
|---|---|---|---|---|---|
| **W1-a** | 2026-08-28 (창 **안**) | `be520c3` + 문서 4 → `4a78a0d` | W9 발견 2(`React is not defined`) 반영 | **ON** | 아래 절 + CUTOVER-LOG §W1-a |
| **W1-b** | 2026-09-02 (창 **밖**) | `579a338`·`0ad3cde` + 문서 7 → `9eba7e9` | W9 발견 3·4 수정 반영 | **ON** | CUTOVER-LOG §W1-b |
| **#3** | **2026-09-03** | **`9eba7e9..a784d2e` 17커밋 (코드 3 + merge 3 + 문서 11)** | **트랙 A·B·N2 배포** | **없음** | **위 ⚑ 상자** |

**W1-a·W1-b의 전제는 같았다** — 유지보수 게이트 ON, 사용자 노출 0, 게이트 미변경, DB 영향 없음.
W1-b는 push 전 프로덕션 URL에서 점검 화면 렌더를 확인했다 `[사용자 확인, 2026-08-29]`.
**W1-b는 창 밖이라 예외의 성격이 달랐다** — 창의 승인이 아니라 건별 승인이었다.

> **#3은 앞의 둘과 종류가 다르다. 이것이 이 표의 요점이다.**
> W1-a·W1-b는 **"게이트가 받아 주니까 올린다"** 였고, **#3은 "실사용자에게 노출해도 된다고
> 판단해서 올린다"** 다. `AGENTS.md` §1.1이 승인 조건을 ②에서 ③으로 바꾼 뒤의 **첫 적용 사례**이며,
> **그 조건은 배포 전 검증(`npm test`·`npm run build`·해당 경로 수동 확인)이었고 충족됐다.**
>
> **그래도 선례가 되지 않는다.** 세 건 모두 **건별 승인**이고 **그 승인은 각자의 push에서 끝났다.**
> **"저번에 게이트 없이 올렸으니까"는 승인이 아니다** — `AGENTS.md` §1의 문장 그대로다.
> **다음 push는 그 시점의 변경 내용으로 다시 판단한다.**

#### 2026-08-28 — 창 안 추가 `main` push (W1 이후 예외)

**W1 이후에 `main` push가 한 번 더 발생했다.** 아래 "`main` push 금지" 규칙의 예외이며,
사유·판단 주체·전제를 남긴다 `[사용자 결정, 2026-08-28]`.

| 항목 | 값 |
|---|---|
| 대상 커밋 | `be520c3`(수정 3건) + `861051c`·`3fe6fc1`·`6725c96`·`4a78a0d`(문서). **push 후 `origin/main` = `4a78a0d`** (`ls-remote` 실측) |
| 사유 | **W1으로 배포된 프론트가 `ExitGuard`의 `ReferenceError: React is not defined`로 깨져 있다.** 게임 중 이탈 다이얼로그와 앱 내부 이동 전체가 죽는다. 수정을 올리지 않으면 창이 끝나도 그 상태가 남는다 |
| 전제 | **유지보수 게이트가 켜져 있다.** 배포돼도 사용자에게는 점검 화면이 뜬다. 게이트는 이 작업에서 건드리지 않았다 |
| 규칙 해석 | "`main` push는 W1에서만"은 **창 밖 push를 막는 규칙**이다. 지금은 창 안이고 게이트가 켜져 있어 규칙이 막으려던 위험(게이트 없는 상태에서 미배포 RPC를 호출하는 프론트가 뜨는 것)이 성립하지 않는다 |
| 이 push가 고치지 **못한** 것 | **`wiki-snapshot`의 429.** Edge Function은 Vercel 배포에 포함되지 않는다. **W8이 그것을 해결했고 싱글 경로는 통과했다** — 그러나 **그룹 경로는 여전히 502**다 (§5.5 발견 3) |
| DB 영향 | 없음. migration·RPC 무변경, 운영 DB 접근 없음 |
| 결과 | **성공.** 점검 화면 유지 확인, ExitGuard 정상 동작 확인 |

기록 위치: 이 절과 `docs/ops/CUTOVER-LOG-2026-08-27.md` §W1-a.

### `main` push 금지 — **근거가 두 번 바뀌었다. 지금이 가장 강하다 (2026-09-02)**

> **금지 근거의 이력.** ① 원래는 "운영 DB에 V2 RPC가 없어 프론트가 없는 RPC를 호출한다"였다 →
> W6·W7이 그 전제를 지웠다. ② 2026-08-28에 **"유지보수 게이트가 유일한 방패다"** 로 바꿨다 →
> **W10이 그 게이트를 껐다.** ③ **지금의 근거: 방패가 없다. `main` push는 곧 사용자 노출이다.**
> **약해진 것이 아니라 강해졌다** — ②에서는 잘못 올려도 점검 화면이 받아냈지만 지금은 받아낼
> 것이 없다. `AGENTS.md` §1.1도 같은 내용으로 갱신했다. 두 문서가 어긋나면
> **상시 규칙인 `AGENTS.md`가 우선한다.**

**여전히 사실인 것**

- **`origin/main`은 Vercel 프로덕션 배포와 연동되어 있다. main push는 즉시 배포를 트리거한다.**
- 백업 push는 `origin/feat/group-final-gaps`로만 한다. Vercel Production Branch = `main`,
  Ignored Build Step = Automatic이므로(사용자 확인, 2026-08-20) 이 브랜치 push는 프로덕션 배포를
  만들지 않는다. preview 배포 생성 여부는 미확인.

**바뀐 것**

- **"미배포 RPC 호출" 위험은 해소됐다.** 운영 `public` 함수는 7개에서 **36개**가 됐고 legacy RPC
  2개는 삭제됐다 (W7). **DB 스키마를 건드리는 커밋은 창 이후 하나도 없으므로 프론트/DB 버전
  어긋남은 계속 없다.** ~~지금 어긋나 있는 축은 프론트 ↔ Edge Function이다~~ →
  **그 축도 W8-b로 닫혔다** (위 상자). **지금 어긋난 축은 없다.**
- **`PROD-SNAPSHOT-2026-08-20.md` §2의 "함수 7개 / V2 RPC 30개 부재"는 무효다.**
- ~~**유지보수 게이트가 유일한 방패다.**~~ → **게이트가 없다 (2026-09-02, W10).**

**새 금지 근거 — 지금 main push가 위험한 이유**

1. **막아 주는 것이 아무것도 없다.** `origin/main` push → Vercel 프로덕션 배포 → **그 순간부터
   실사용자가 그 코드를 쓴다.** 이전 두 근거(미배포 RPC / 게이트 뒤)는 **둘 다 완충재가 있는
   상태를 전제했는데, 지금은 완충재가 없다.** 잘못 올린 것을 되돌리는 방법은 이전 배포로
   롤백하는 것뿐이고 그 사이의 사용자 세션은 되돌아오지 않는다.
2. **되돌리기가 대칭이 아니다.** 게이트를 다시 켜는 것도 **재배포**다 (`VITE_*`는 빌드 시점
   인라인 — F11). 즉 "일단 올리고 문제 있으면 게이트를 켜자"는 경로는 **한 번 더 배포를 태우는
   것**이지 즉시 차단이 아니다.
3. **DB는 이제 되돌릴 수 없는 쪽이다.** legacy RPC 2개가 삭제된 상태이므로 **구버전 프론트로의
   롤백은 깨진다** (`code/18-...md` §롤백 주의사항). 되돌릴 수 있는 범위는 **창 이후 커밋 사이**로
   한정된다.

→ **결론: main push는 계속 건별 승인 대상이며, 확인할 것이 바뀌었다.**
"RPC가 있는가"(~~①~~) → "`VITE_MAINTENANCE`가 여전히 `true`인가"(~~②~~) →
**"이 변경을 실사용자에게 지금 노출해도 되는가"**. 즉 **배포 전 검증이 승인 조건이 됐다** —
`npm test`·`npm run build`·해당 경로 수동 확인. 상시 규칙: `AGENTS.md` §1.1.

---

## 4. 진행 중인 작업

- ~~**트랙 A·B — 코드 완료, 배포 전**~~ → **배포됨 (2026-09-03).** A·B·N2가 `a784d2e`로
  `main`에 올라가 **실사용자에게 닿았다** (§3의 ⚑ 상자). **`npm test` 204/204 ·
  `npm run build` exit 0 · migration 0 · 운영 DB 미접근 — 프론트 전용 배포다.**
  **이 항목의 진행 축이 닫혔다** — 남은 것은 운영 확인 2건(그룹 참가자 행 · 이미지 fallback
  실경로)이며 §3 상자에 등재했다. 상세는 §5.0의 2026-09-03 블록과 `TRACKS.md` §8-A·§8-B 완료 행.
- ~~**다음 트랙 — C(14)는 G7 대기, 15a는 착수 가능 (2026-09-03 재확인).**~~
  → **15a는 완료·통합됐다 (2026-09-04, `1af9f93`). C는 여전히 G7 대기다.**
  `npm test` **252/252** · pgTAP **128/128** · `npm run build` **exit 0** ·
  `supabase:preflight` **11/11 유지** (§2). 산출물은 예고대로 **migration 파일까지이며
  운영 적용은 하지 않았다** — 저장소 13개 ↔ **운영 12개** (`AGENTS.md` §1, R6).
  **`main`에도 올리지 않는다: migration을 담은 브랜치이므로 3코스 창의 일부다.**
  **이 항목의 진행 축이 닫혔다** — 상세는 §5.0의 2026-09-04 블록과 `TRACKS.md` §8-D 완료 행.
- **⚠ 지금 코드로 열려 있는 트랙이 없다 (2026-09-04).** C는 **G7**(사람 결정), 15b는 **3코스 창**,
  15c는 **창 + 트랙 C**를 기다린다. 다음 세션의 선택지는 **§5.0-B 이월 항목**이거나
  **3코스 창을 여는 결정 자체**다.
- **저장소 구조 정비 — 완료 (열거된 3건 기준).** (a) 상시 가드레일 `AGENTS.md` 분리, (b) 운영 실측
  `docs/ops/` 편입(`PROD-SNAPSHOT-2026-08-20.md`·`CUTOVER-PLAN.md`), (c) 이 파일 신설 — 3건 모두
  저장소에 존재한다 (2026-08-27 확인 `[산출물]`). **"구조 정비"의 추가 범위는 문서에 정의된 적이
  없으므로 이 항목은 원래 열거된 3건에 대해서만 완료로 판정한다.** 그 밖에 정비 대상이 있다면
  새 항목으로 세워야 한다.
- **유지보수 게이트 — 완료 (`b24744e`, 2026-08-21). 운영에서는 켰다가 껐다 (W0 → W10).**
  `utils/maintenanceGate.js`, `components/MaintenanceScreen.jsx`, `main.jsx` 분기. 계약은
  `tests/maintenanceGate.test.js` 13개로 고정, 사용법은 `README.md` §유지보수 게이트. 로컬
  확인(점검 화면 렌더·`?bypass=` 진입·새로고침 유지·`?bypass=off` 해제)까지 끝났다
  (CUTOVER-PLAN §7 P1~P3). **W0에서 켜(2026-08-27) 창 전체와 창 밖 후속을 그 뒤에서 진행했고,
  W10에서 껐다(2026-09-02).** 끄는 방법은 `false` 설정이 아니라 **환경변수 삭제**였다 —
  `isMaintenanceFlagEnabled`가 정확히 `"true"`만 활성으로 보므로 판정이 같다
  (`utils/maintenanceGate.js:26`) `[코드]`. Vercel Type은 `Secret`이 아니라 **`Config`** 다
  (`VITE_*`는 번들 인라인이라 Secret 저장이 거부된다).
  **`VITE_MAINTENANCE_BYPASS`는 지우지 않았다** — 다음 창에서 다시 쓴다.
  **게이트 코드는 그대로 두고 다음 창에서 재사용한다. 제거 대상이 아니다.**
- Packet 13은 커밋됨(`339fb77`). 코드 작업은 종료.
- **cutover 창 — 최종 종료 (2026-08-27~28 창 + 창 밖 후속 ~2026-09-02).**
  W0~W9를 2세션으로 실행했다. **W6에서 migration 11개 전량 적용 성공, W7 전항목 통과,
  W8 Edge Function 2개 배포 성공.** W9에서 결함 6건이 나와 2건은 창 안에서 고쳤고
  **4건이 미해결이라 W10을 하지 않고 G3 경로로 창을 닫았다.** 롤백은 발생하지 않았다.
  **창 밖 후속에서 그 4건을 전부 종결하고 W10까지 마쳤다** — 순서는
  **① 프론트 배포(W1-b) → ② `functions deploy wiki-snapshot`(W8-b) → ③ 4인 재스모크(W9-b,
  502 0건) → ④ 발견 6 종결(스펙 범위 밖) → ⑤ W10(게이트 해제)**. ①②를 뒤집었다면 관전 화면이
  깨졌을 것이다 (§5.4-1·2). 실행 기록: **`docs/ops/CUTOVER-LOG-2026-08-27.md`**.
  **다음 창의 범위는 이 창의 이월 항목이 아니라 새 작업이다** (§5).
- **W9 발견 4 "유효하지 않은 RETIRE 사유" — 해소 (2026-09-02 W1-b 배포).**
  `pages/GroupGamePage.jsx:1267`·`:1434`·`:1491` 3줄을
  `onClick={() => handleReturnToLobby("left")}`로 교체했다. 원인은 RPC 계약 불일치가 아니라
  **`onClick` 직접 바인딩으로 React SyntheticEvent가 첫 인자에 들어간 것**이었다.
  분기별 근거·불변식·`"left"` 선택 이유는 **§5.5-4**.
  `npm test` **142/142**, `npm run build` **exit 0** —
  기준 커밋 `357a330`에 이 3줄만 얹은 상태에서 측정했다 (측정 시점은 커밋 전), 2026-08-29 `[산출물]`.
  **게이트 해제 전에 배포돼야 한다** — 운영 번들은 아직 결함을 갖고 있다.
- **W9 발견 3 `wiki-snapshot` 요청 감축 — 해소 (2026-09-02).**
  §5.4-1(스냅샷 재사용 조기 반환)과 §5.4-2(`fetchRevisionIds` 제거)를 **한 번에** 적용했다.
  같은 파일이라 배포 단위가 하나다. **cold 61 → 31, warm 61 → 0, 4인 대기실 244 → 124건**
  (`scripts/wikiSnapshotRequestCount.mjs` 실측, §2).
  **프론트(W1-b) → Edge Function(W8-b) 순서를 지켜 배포했고**, 그 뒤 4인 재스모크(W9-b)에서
  **대기실 준비 버튼 502가 0건**이었다 `[사용자 보고]`. **대기실이 절반만 줄었는데도 통과했다** —
  §5.4-3(백오프)은 그래서 **넣지 않는다.**
- 디자인 개편: 저장소 밖에서 별도 진행 중. 확정 시안 산출물 없음 (`code/10-CODE-MASTER-TODO.md` §2 순서 7 = `[~]`).
- **`GROUP_SPECTATOR_MIGRATION.sql`(저장소 루트) — 폐기 판정 (2026-08-29). 파일은 보존한다.**
  ~~미적용 제안 파일이며 의도적으로 미추적 상태다.~~ **미적용인 것은 맞지만 "아직 적용 안 함"이
  아니라 "적용하면 안 됨"이다** `[코드]`. 이 파일은 `participant_status`/`left_at`/`leave_reason`과
  `group_match_results.result_status in ('finished','dnf')`를 세우는 **구형 제안**인데, 운영에 적용된
  v13 계열은 `player_status`/`retired_at`/`retire_reason`과 `result_status`에 `'retired'`를 쓴다
  (`20260807003609_group_match_lifecycle_phase2a.sql:88-89`,
  `20260814103000_group_final_gaps_v13.sql`).
  **적용하면 v13 계약이 깨진다. 그리고 제약 이름이 겹치지 않기 때문에 더 나쁘다** `[코드]` —
  이 파일은 `group_match_results_status_check`를 drop/create 하는데 운영에 있는 것은
  `group_match_results_result_status_check`다. **`drop constraint if exists`가 v13 제약을 지우지
  못하므로 두 CHECK가 동시에 남고**, 교집합은 `'finished'` 하나뿐이 되어
  `leave_group_player`가 기록하는 `'retired'` 행이 **거부된다.** `room_players`도 마찬가지로
  v13의 `player_status`(`:52-53`)와 무관한 `participant_status` 컬럼을 하나 더 세운다.
  **AGENTS.md §4에 따라 삭제하지 않고 미추적으로 보존하며, 파일 서두에도 같은 판정을
  주석으로 남겼다.**

---

## 5. 다음 작업

### 5.0 지금 할 일 — **2026-09-02 재작성**

**cutover가 끝났으므로 이 절의 성격이 바뀌었다.** 창을 열기 위한 선행 조건 목록이 아니라
**서비스가 열린 상태에서의 작업 목록**이다. 아래 5.1~5.6은 그 판단에 이른 경로의 기록이며
**작업 지시로 읽지 않는다** — 지시는 이 절이다.

**A. 재스모크가 남긴 잔여 관찰 3건 (W9-b, 2026-09-02)**

| # | 항목 | 확정된 것 | 미확정 | 등급 |
|---|---|---|---|---|
| **A1** | **관전 이모티콘 쿨타임이 콘솔 에러로만 드러난다** — `spectator_emoji_v13` **400 × 3** | **의도된 동작이다.** `last_sent_at > now - interval '3 seconds'`면 `SPECTATOR_EMOJI_RATE_LIMIT`을 raise한다 (`20260814123000_group_spectator_emoji_atomicity_fix.sql:132-133`) `[코드]` | 화면에 쿨타임을 알리는 경로가 있는지 | **UX 개선.** 결함 아님. 400이 정상 동작이라는 것을 화면이 말하지 않는 것이 문제다 |
| **A2** | **`group game realtime disconnected: CLOSED`** (게임 종료 시점) | 로그 지점은 `pages/GroupGamePage.jsx:768` `[코드]`. **정리 경로에서 나온 `CLOSED`라면 `:766`의 `realtimeChannelRef.current !== channel` 가드가 먼저 반환한다** — 즉 **콘솔에 찍혔다는 것은 그 가드를 통과했다는 뜻**이고, 같은 분기가 `:769`에서 `setPhase(RECOVERING)`까지 실행한다 | **원인.** "게임 종료 시점 채널 정리"는 **추정이며 위 코드와 정합하지 않는다** — 정리 경로였다면 `:779`가 ref를 먼저 `null`로 만든 뒤 `:781`이 `removeChannel`을 부르므로 가드에 걸려야 한다 | **조사.** 진행 중 끊김은 관측되지 않았으나 **무해하다고 단정할 수 없다** — 화면 영향이 왜 없었는지도 미확정이다 |
| **A3** | **관전자 ↔ 관전자 이모티콘 전달** | 송신·구독·RLS·publication 경로는 코드상 정상으로 읽힌다 (§5.5-6) | **전달 여부.** 4인 중 완주자가 1명이면 관전자도 1명이라 조건을 만들지 못했다 | **검증.** 결함 판정이 아니다 — 발견 6은 스펙 범위 밖으로 종결됐다. 확인 방법은 §5.5-6 |
| **A4** | **cold 문서 로딩 지연** (2026-09-03 배포 전 로컬 스모크에서 관측) `[사용자 확인]` | **구조가 §5.4에 이미 측정돼 있다.** cold 스냅샷은 감축 후에도 **31요청**이고 warm은 **0**이다 (§5.4-1·2 표). **즉 지연은 캐시 미스의 정상 비용이며 이 배포가 만든 것이 아니다** — 배포 범위에 `wiki-snapshot` 변경이 없다 (§3 상자) | **체감 지연의 크기와 어느 경로에서 나오는지.** 대기실 준비 경로는 문서가 전원 distinct라 **구조적으로 전부 cold**다 (§5.4-1·2의 4인 환산 124건) | **관찰. 배포 차단이 아니었다.** §5.4-3이 백오프를 넣지 않기로 판정했고 그 판정은 유지된다. **다음 레버는 §5.4의 1번(스냅샷 재사용)이며 대기실 경로에는 듣지 않는다** — 그 한계도 §5.5-3에 이미 기록돼 있다 |

> **A4를 새 결함으로 세우지 않는 이유.** 같은 현상이 **이미 측정·판정된 구간에 들어간다** —
> §5.4가 요청 수를, §5.5-3이 대기실 경로의 한계를, §5.4-3이 백오프 기각을 각각 담고 있다.
> **새로 등재한 것은 "사용자가 체감했다"는 사실 하나다.** 그것이 판정을 바꾸려면
> **어느 경로에서 몇 초인지**가 필요하고, 지금은 없다 (`미확인`).

> **A1·A3은 급하지 않다.** A1은 사용자가 "안 눌리네"로 겪을 뿐 기능이 깨지지 않고,
> A3은 스펙이 요구하지 않는 동작이다. **A2가 유일하게 성격이 불분명한 항목이다.**

**B. 창이 남긴 이월 — 게이트가 열려 우선순위가 올라간 것들**

| # | 항목 | 왜 지금 올라가나 | 위치 |
|---|---|---|---|
| ~~**B1**~~ | ~~**새 운영 스냅샷 `PROD-SNAPSHOT-YYYY-MM-DD.md`**~~ | **완료 (2026-09-02) — `docs/ops/PROD-SNAPSHOT-2026-09-02.md`.** 테이블 21 / 함수 36 / RLS off 0 / 이력 12행 / publication 4 / users 145 · `game_records` 59를 실측했고, 08-20 대비 변화를 migration별로 매핑했다. **`2026-08-20` 파일은 역사 기록으로 보존한다** | **남은 공백은 그 문서 §9** |
| **B2** | **모바일 viewport / 키보드 / reduced-motion** | **실사용자가 먼저 밟는다.** 게이트 뒤에서는 미룰 수 있었다 | §8.2-4 |
| **B3** | **불변식 모니터링** | 같은 이유. `game_move_events`·`game_mutation_requests`·`match_history.result_status`·`game_records.run_id` | §8.2-5 |
| **B4** | `target-level` Edge Function 존재 확인 | §8.1-7의 마지막 미완 항목. 운영 조회 1회면 끝난다 | §5.6-4 |
| **B5** | `qa/30-INTEGRATION-CHECKLIST.md` §22 새 게이트 기록 | 창 결과를 체크리스트에 등재 | §5.6-8, CUTOVER-PLAN §10.2 |
| **B6** | 1:1 2세션 Realtime 수동 검증 / 권한 거부 SIGSEGV 관측(U6) / B2 하네스 | 창에서도 창 밖에서도 수행되지 않았다 | §5.3, §8.2-1·2·3 |

**C. 기능 작업 — 미구현 패킷 14~17**

> ### ▶ 이 항목의 상세는 **`docs/agent/PACKET-CONTRACT-GAPS.md`** 다
>
> **계약 고정이 여러 세션에 걸치므로 조사 결과를 그 문서에 모았다** (2026-09-02).
> 패킷 간 의존, 계약 공백 **G1~G20**, 시안 78화면 × 10섹션 대조, 오늘 3코스 전환 판정,
> **W0~W3 착수 순서**가 거기 있다. **패킷 작업을 시작하는 세션은 그 문서부터 읽는다.**
>
> **판단 8건이 확정됐다 (2026-09-02)** `[사용자 결정]`:
> **G1** reward 3테이블 = **공통 계약**(어느 패킷에도 소유권 없음) ·
> **G2** 아이템 이벤트 = **`room_events`**(publication에 이미 있어 **창 불필요**) ·
> **G3** 3코스 창 = **15 착수 후 코스별 랭킹 도달 시점** ·
> **G11** reason = **통일 대신 5값 유지 + 표시 매핑** ·
> **시안 4건** G16=55 / G17=20·15·25 / G18=범위 밖 / G19=`변칙`.

> ### ▶ **W0 공통 계약이 동결됐다 (2026-09-02) — `docs/contracts/`**
>
> **패킷 단위로 고정하면 닫히지 않던 항목들을 먼저 동결했다.** 소유자는 전부 **공통**이며
> **어느 패킷도 재정의하지 않는다.**
>
> | 계약 | 닫은 공백 | 핵심 |
> |---|---|---|
> | **C1** 보상 3테이블 | G1 | **복합 FK가 "미보유 장착"을 DB에서 막는다.** 배지 3개 제한도 구조로 강제 |
> | **C2** XP 원장 | G4 | **`xp_class` 3종**(`gameplay`/`achievement`/`admin`)이 "업적 XP는 주간 제외"를 한 줄로 만든다 |
> | **C3** 레벨 저장 위치 | G6 | **`profiles.total_xp`.** `user_profile_stats`는 **본인만 RLS**라 쓸 수 없다. **레벨은 저장하지 않고 함수로 계산** |
> | **C4** 결과 사유 어휘 | G11 | 저장 7축 전수 + **완주/기권/리타이어/몰수 매핑** |
> | **C5** 프로필 카드 | G10 | **DDL 0.** 4곳이 아니라 **5곳**이고 지금 바로 착수 가능 |
>
> **계약이 새 공백 4건을 드러냈다** — 그중 **`C3-①`은 보안 문제다.**
> `total_xp`를 `profiles`에 두면 `ProfilePage.jsx:86·149`의 **클라이언트 직접 update로
> XP 위조가 가능하다.** **15 착수 전에 답해야 한다.**
>
> **남은 질문:** **G7**(아이템 ID) · **C3-①** · **C2-③**(XP 겹침) · **C5-②**(스냅샷 확장) ·
> **G2-②**(`room_events` INSERT 회수) · **C1-④**(기본 아이콘 ID).

> ### ▶ **결정 3건 확정 + 창 범위 4항목 확정 (2026-09-02, 2차)** `[사용자 확정]`
>
> | # | 결정 | 결과 |
> |---|---|---|
> | **1** | **C3-① grant 컬럼 = 3개** — `nickname` · `profile_image_url` · **`updated_at`** | **C3 계약을 정정했다** (동결 문서 최초 정정). `C3-LEVEL-STORAGE.md` **§0 정정 이력** · **§5.1 확정 DDL** · `contracts/README.md`에 정정 이력 표 신설. **`total_xp`는 목록 밖이라 그대로 보호된다** |
> | **2** | **G2-②(`room_events` INSERT 회수)를 3코스 창에서 제외** | **순서를 뒤집었다:** 14가 서버 INSERT(SECURITY DEFINER)로 전환 → 프론트 배포 → **클라이언트 경로 부재 확인** → **별도 창(W2″)**. 선례는 `send_group_spectator_emoji_v13`. **회수를 포기한 것이 아니라 경로가 사라진 뒤로 미룬 것이다** |
> | **3** | **`highlight_links` 이중 등록** | 트랙 C는 **`MULTI_ITEM_IDS`만** 수정하고 **`SINGLE_ITEM_IDS`는 동결.** 파일 단위로 표현할 수 없는 제약이라 **티켓 문구와 grep 불변식으로 강제한다** |
>
> **3코스 창 = 4항목.** ① `daily_challenges` 제약 교체 + `course_slot` ② `game_records.result_status`
> CHECK **1건**(`match_end_reason` 제외) ③ `profiles` 컬럼 단위 grant 축소 **3컬럼**
> ④ `profiles.total_xp` 추가. **순서 ③ → ④** (컬럼 단위 grant가 나중 컬럼을 덮지 않으므로
> 이 순서면 `total_xp`가 구조적으로 보호된다).
>
> **게이트 최종 판정: 없이 가능하다** `[추정]`. **성립 조건 3개** — ③이 3컬럼 · **①의 함수
> 재생성이 ACL을 복구** · T5 스모크를 실사용자 경로로 수행. **창 절차 초안 T-1~T6은
> `TRACKS.md` §7.6**이며 8월 W0~W11에서 **W0·W1·W2.5·W3·W4·W8·W10을 뺐다** (근거 각각 기재).
> **롤백 성격이 8월과 다르다 — 4항목 전부 역DDL이 있고 데이터 손실 DDL이 0이다.**
>
> **⚠ 새 발견 2건.**
> ① **`ensure_today_daily_challenge`는 `create or replace`로 교체할 수 없다** — 반환
> `table(...)`에 `course_slot`을 넣으면 반환 타입이 바뀌어 **`drop function`이 필요하다** `[코드]`.
> 같은 트랜잭션 안 재생성이라 게이트 사유는 아니지만 **`drop`이 ACL을 지우므로 `anon` EXECUTE를
> 복구해야 한다** — 빠뜨리면 **게스트의 오늘 코스가 사라진다.** `PACKET-CONTRACT-GAPS.md`
> §5.5.2의 "함수 삭제 없다" 전제를 정정했다.
> ② **공유 자원 겹침 7건** — 파일은 갈렸는데 **배열·복제된 문자열 리터럴·CSS 클래스 이름·훅 반환
> 형태**를 공유한다 (`TRACKS.md` §2.3). **화이트리스트가 잡지 못하는 종류다.** 가장 나쁜 것은
> **`"wiki-single-items"` localStorage 키** — import 없이 **문자열이 4곳에 복제**돼 있어
> 한쪽이 바꾸면 다른 쪽이 조용히 아무것도 지우지 않는다.

> ### ▶ **C4-① 확정 · 창 ACL 절차 보강 · A·B 착수 (2026-09-02, 3차)** `[사용자 확정]`
>
> **C4-①(부제 문구)이 닫혔다. 규칙은 `시안 > 코드 > 발명`이다.**
>
> | `retire_reason` | 확정 부제 | 출처 |
> |---|---|---|
> | `time_limit` | **제한 시간 초과** | **코드** — `groupResultFormatter.js:2`가 운영에서 쓰는 문자열 |
> | `grace_timeout` | **유예 시간 초과** | **코드** — `:3` |
> | `disconnected_timeout` | **재접속 유예 종료** (용어는 **몰수**) | **시안** §07 RESULT |
>
> **`"연결 끊김"`과 `몰수`는 같은 상태다** `[코드 확인]` — 따라서 **정정이고, 둘 다 필요한 것이
> 아니다.** 근거 셋: ① `formatGroupRetireReason`은 **`retire_reason`만** 받는다
> (`GroupGamePage.jsx:1336`·`:1483`) ② `"연결 끊김"` 문자열은 저장소에 **한 곳**뿐이다
> ③ **살아 있는 끊김 상태(`player_status = 'disconnected'`)에는 라벨이 아예 없다** —
> `INACTIVE_STATUSES`에 그 값이 없어서 유예 중 참가자는 `진행 중`으로 렌더된다
> (`groupGameFlow.js:14-22`). **즉 그 문자열이 다른 상태를 표시하고 있던 것이 아니다.**
>
> **두 문자열은 서로 다른 슬롯에 있다.** 헤드라인은 지금 **`"RETIRE"` 고정**이고
> (`GroupGamePage.jsx:1479`) 구분은 부제에서만 난다 — **4용어 매핑은 아직 코드에 없다.**
> 그래서 정정 대상은 둘이다: 부제 문자열 1개 + 헤드라인 4용어.
> **실행 트랙은 그룹 결과 화면 소유자다 — 트랙 B가 아니다.** `groupResultFormatter.js`의 유일한
> 소비자가 **동결된 `GroupGamePage.jsx`**이고 테스트가 옛 문자열을 assert한다.
> **정답은 B의 신규 `utils/resultReasonLabels.js`에 먼저 담긴다** (C4-③ = 신규 모듈로 확정).
>
> **창 절차에 ACL 3지점을 보강했다** (`TRACKS.md` **§7.9** 신설):
> **T-1 스냅샷**(`pg_proc.proacl` + `aclexplode` 쿼리 2개 — `drop` 전에만 뜰 수 있다) ·
> **T3에서 같은 트랜잭션 안 `grant execute ... to anon/authenticated/service_role`** ·
> **T4 검증 3번이 T-1 스냅샷과 대조** · **T5에 게스트 오늘 코스 스모크**.
>
> **⚠ 그 과정에서 2차 갱신의 서술 하나를 자체 정정했다.**
> "ACL 재부여를 빠뜨리면 게스트의 오늘 코스가 사라진다"는 **기제가 틀렸다** — 함수는 grant를
> 하지 않으면 **`PUBLIC`에 EXECUTE가 붙는 것이 기본값**이라 `anon`도 실행된다.
> **진짜 함정은 반대쪽이다:** `contracts/README.md`의 신규 RPC 패턴
> (`revoke all ... from public, anon`)을 이 함수에 적용하면 **게스트 경로가 끊긴다.**
> **이 함수는 그 패턴의 예외라고 §7.9에 명시했다.**
>
> **착수 트랙은 A·B다.** 둘 다 선행 0이고 **DB를 건드리지 않는다.**
> **C는 G7이 차단**이고, **D는 코드 충돌이 0인데도 순차다** — 충돌 축이 파일이 아니라
> **로컬 Supabase 스택**이기 때문이다. 티켓은 착수 가능 상태로 다듬었다
> (`TRACKS.md` §8-A·§8-B — 읽을 파일 3분류 · §2.3 공유 자원 중 각 트랙이 걸리는 항목 ·
> `npm test` 신규 항목 · **grep 불변식 7~8개** · 첫 수).

> ### ▶ **A·B 완료 — 통합됐다 (2026-09-03)** `[산출물]`
>
> **넷 중 둘이 닫혔다.** 자세한 실측은 `TRACKS.md` **§8-A·§8-B 완료 행**이다.
>
> | 트랙 | 상태 | 산출 | 남긴 것 |
> |---|---|---|---|
> | **A** C5 프로필 카드 | **✅ 완료** `e70c541` → `b3da192` | 신규 5파일(`utils/profileCard.js` · `ProfileCard.jsx` · `ProfileAvatar.jsx` · `css/profileCard.css` · 테스트 17건) · **닫은 지점 6곳** · **이름 fallback 8종 → 2종** | **4곳(전부 C 소유)** + **부채-1** |
> | **B** 17a-2 기록·게스트 | **✅ 완료** `7a7197e` → `527f896` | 신규 3파일(`utils/resultReasonLabels.js` + 테스트 42건) · **싱글 순위를 서버가 센다** · **게스트 경계 3지점** | **부채-2** |
> | **C** 14 아이템 서버 권위 | **대기 — G7이 여전히 차단** | — | **선행 하나가 풀렸다:** B가 `utils/resultReasonLabels.js`를 먼저 만들어 뒀으므로 **C의 1:1 결과 표시는 막히지 않는다** (`TRACKS.md` §8-B 의존) |
> | **D** 15a XP 원장 | ~~착수 가능~~ → **✅ 완료 · 통합됨 (2026-09-04)** `020daaa` → `1af9f93` | 신규 5파일 · `npm test` **+48** · **pgTAP 128** · **migration 1개** | **배포하지 않는다 — 3코스 창 대기** |
>
> ~~**다음 트랙은 D(15a)다.**~~ → **D는 끝났다 (2026-09-04).** C는 G7(아이템 ID 확정)이
> 사람 결정이라 코드로 풀 수 없다. **남은 열린 트랙이 없다** — 아래 2026-09-04 블록 참조.
>
> **⚠ A·B가 문서 수치 4건을 정정했다** (`TRACKS.md` 4차 갱신):
> §2.3-③ **12지점 → 13줄**(보호 키에 `floatingMessage` 추가) · §2.3-④ **합계 4 → 4파일 6줄** ·
> §2.3-⑥ **A의 `"left"`는 retire 어휘가 아니라 `textAlign` 값** · §5.2 **적용 지점 5 → 6, 이름
> fallback 6종 → 8종**. **전부 "문서 대 문서"가 아니라 코드를 실제로 만지면서 나온 것이다.**
>
> **`C5-①`(`"탐험가"`)은 확인 필요로 남는다.** §8-A 티켓이 확정값으로 적었고 A가 구현했지만
> **근거 문자열은 여전히 스펙에 없다.** `PACKET-CONTRACT-GAPS.md` §3.2.1에 그 사실만 등재했다 —
> **해소가 아니다.**

> ### ▶ **D(15a) 완료 — 통합됐다. 그리고 열린 트랙이 없어졌다 (2026-09-04)** `[산출물]`
>
> **넷 중 셋이 닫혔다.** 실측은 `TRACKS.md` **§8-D 완료 행**이고 수치는 §2에 있다.
>
> | 트랙 | 상태 | 다음 |
> |---|---|---|
> | **A** C5 프로필 카드 | **✅ 완료 → 배포됨** (2026-09-03) | — |
> | **B** 17a-2 기록·게스트 | **✅ 완료 → 배포됨** (2026-09-03) | — |
> | **D** 15a XP 원장 | **✅ 완료 → 통합됨** (2026-09-04) `1af9f93` | **3코스 창에서 운영 적용** |
> | **C** 14 아이템 서버 권위 | **대기 — G7이 여전히 차단** | **사람 결정이 필요하다. 코드로 풀 수 없다** |
>
> **⚠ 지금 코드로 진행할 수 있는 트랙이 없다.** 남은 셋이 전부 사람 결정이나 창을 기다린다:
> **C는 G7**(아이템 ID 확정) · **15b는 3코스 창** · **15c는 창 + C**. 이 상태에서 다음
> 세션이 집을 것은 트랙이 아니라 **§5.0-B의 이월 항목**(B2 모바일 · B3 불변식 모니터링 ·
> B4·B5·B6)이거나 **3코스 창을 여는 결정 자체**다.
>
> **C의 선행 작업 하나는 미리 치웠다 (2026-09-04, `8a3c77f`).** C는 착수 시
> `supabase:preflight`를 먼저 통과시켜야 하는데(§1.1-b의 CODE GO 유효 조건),
> **`postgres-log`가 정상 로그에 오탐해 그 관문이 막힐 상태였다.** 창 밖 91줄 차이였다 —
> 로그가 조금만 더 쌓이면 **G7이 풀려도 C가 시작하지 못했다.** 진단·수정·판정 근거는 §2.
> **G7은 여전히 유일한 차단이다** — 이 작업이 그것을 대신 풀어주지는 않는다.
>
> **15b·15c는 3코스 창 이후다.** 지금 착수할 수 없는 것이지 미정인 것이 아니다.
>
> | 조각 | 무엇 | 왜 창 이후인가 |
> |---|---|---|
> | **15b** | `profiles.total_xp` · `grant_xp_v1` 교체본(`update profiles` 포함) · **주간/레벨 랭킹 RPC** | **창 항목 ③④ 그 자체다** — grant 축소 3컬럼 → `total_xp` 추가 순서(`TRACKS.md` §7.1). **컬럼이 없으면 교체본이 성립하지 않는다** |
> | **15c** | **결과 확정 경로 연결** — `finalize_group_room_if_expired` · duel 결과 · `apply_single_move_v2` | **둘이 겹쳐 막는다.** ① 운영에 `grant_xp_v1`이 없으므로(운영 migration 12개) 연결할 대상이 없다 ② **살아 있는 결과 경로를 바꾸는 일**이고 duel 쪽은 **트랙 C 소유**다 (`TRACKS.md` §6.3) |
>
> **15a가 "지급할 수 있는 원장"까지이고 "실제로 지급되는 상태"는 15c다** (`TRACKS.md` §6.3).
> **지금 원장에 행을 만드는 코드 경로는 저장소에 없다** — 그것이 15a를 창 무관으로 만든 성질이며,
> **통합만 하고 배포하지 않는 판단과 일관된다.**
>
> **계약 쪽 산출:** C2의 `확인 필요`가 ~~5건~~ → **3건(③④⑤)**으로 줄었다.
> ①`floor`·②KST를 **15a의 구현과 테스트를 근거로** 확정했다 (`C2-XP-LEDGER.md` §0).
> **③(XP 겹침)은 열린 채다** — 3열 유니크가 겹침을 허용하는 쪽이고, 좁히는 결정이 나면
> forward-only 보정이다.

> ### ▶ ~~**신규 결함 2건**~~ → **2건 전부 종결 (2026-09-03). 게스트 경계 완결** `[코드]`
>
> | # | 결함 | 상태 |
> |---|---|---|
> | **N1** | **`App.jsx` `GameRoute`가 완주한 게스트에게 거짓 메시지를 띄웠다** — `handleSaveRecord`가 `result?.serverFinalized`를 **게스트 판정보다 먼저** 보았다. 게스트 싱글 런은 서버에서도 `single_game_runs`에만 남고 **`game_records`에 행을 만들지 않는데** 화면은 **"서버에서 결과와 랭킹 기록을 확정했습니다"**라고 알렸다 (패킷 17 §6 위반) | **✅ B가 수정했다** (`7a7197e`, `App.jsx:93-102`). 게스트 판정을 앞으로 옮기고 **"게스트 기록은 저장되지 않습니다"**로 바꿨다. 부수적으로 **`alert()` 호출 1건이 `setSaveStatus`로 대체됐다** |
> | **N2** | **`MainPage.jsx:413` 랭킹 카드의 "전체 보기 →"가 게스트에게 열려 있다** — `/ranking`은 `ProtectedRoute`인데(`App.jsx:202-207`) 게이팅이 없어 **누르면 `/login`으로 튕긴다** | **✅ 해소 (2026-09-03)** `[사용자 확정]`. **조건부 렌더로 숨겼다** (`:416-420`) — 같은 파일이 같은 목적지(`/ranking`)를 이미 그렇게 처리하고 있었다(`:455-459`). 숨긴 자리에 **안내 문구**를 남겼다 (`:444-448`). **`disabled`+`aria-disabled`를 쓰지 않은 근거는 `TRACKS.md` §5.2-부채-2-a** — 요청된 테스트가 "진입점이 노출되지 않음"을 요구하고, `disabled`는 **노출된 채 동작만 죽는다.** **랭킹 탭 블록 범위 밖 규칙의 1회 예외**로 처리했다 |
>
> **둘 다 "게스트가 로그인 전용 경로를 만났을 때"의 같은 결함군이었다.** N1은 **거짓말을 했고**,
> N2는 **막다른 길로 보냈다.** **둘 다 닫혔으므로 패킷 17 §6 게스트 경계가 완결됐다** (2026-09-03).
>
> **검증** `[산출물]`: `npm test` **204/204**(+1, 계약 테스트 1건) · `npm run build` **exit 0** ·
> **게스트 로비를 실제 브라우저에서 확인** — `/ranking` 컨트롤 **0개**, 안내 문구 렌더,
> **TOP 3는 그대로 보인다**(공개 콘텐츠에는 손대지 않았다. 데이터 로딩에 게스트 분기가 없다 `:104-118`).
>
> **관측되나 이 변경과 무관한 것:** 게스트 로비에서 **400 두 건**이 콘솔에 남는다 —
> `guest-xxxx` id로 `fetchUserStats`·`fetchAllProfileStats`를 호출하는 경로다 `[산출물]`.
> **렌더 경로가 아니라 데이터 로딩 경로이며 이 커밋 이전에도 같았다.** 등급은 **조사**이고
> N1·N2와 같은 결함군(게스트 × 로그인 전용 자원)이라 **후속으로 등재한다.**

> ### ▶ **병렬 트랙 4개가 열렸다 (2026-09-02) — `docs/agent/TRACKS.md`**
>
> **트랙이 넷 동시에 열린 것은 처음이다.** 계약이 *무엇을 만드는지*를 고정했고,
> `TRACKS.md`가 **누가 어느 파일을 쓰는지**를 고정한다. **병렬 작업의 SSOT다** —
> 트랙을 시작하는 세션은 `PACKET-CONTRACT-GAPS.md` 다음에 그 문서를 읽는다.
>
> | 트랙 | 내용 | 선행 | 파일 성격 |
> |---|---|---|---|
> | **A** | C5 프로필 카드 공통 컴포넌트 | 없음 | 프로필·랭킹·공개 프로필·그룹 로비 |
> | **B** | 17a-2 기록·게스트 | 없음 | 싱글 게임·**싱글 결과**·게스트 경계·기록 데이터 |
> | **C** | 14 아이템 서버 권위 | **G7 — 차단** | 1:1 전 경로·아이템 카탈로그 |
> | **D** | 15a XP 원장·지급·감쇠 | 없음 | **전부 신규 파일.** 기존 파일 0 |
>
> **범위를 잘라서 넷이 됐다.** 결과 화면은 §7의 6영역으로 갈리지 않는다 —
> `ResultShell`이 코드에 없어서 **한 모드의 결과가 한 파일의 인라인 JSX**다.
> 그래서 **모드 단위로 나눴다**: 싱글→B · 1:1→C · **그룹→동결**.
> `pages/GroupGamePage.jsx`(1603줄)는 **이 웨이브에 소유자가 없다.**
>
> **15가 두 조각으로 갈렸다.** **15a**(원장·지급 RPC·감쇠·멱등성)는 창 무관이고,
> **15b**(`profiles.total_xp`·랭킹 정렬)만 C3-①에 종속된다. 성립 조건은
> **`grant_xp_v1`이 15a에서 `profiles`를 쓰지 않는 것** — 누적은 원장 합계로 계산한다
> (`TRACKS.md` §6.1). **결과 경로 연결은 15c로 또 한 번 떼어냈다.**
>
> ~~**3코스 창에 5항목을 묶었다**~~ → **4항목으로 확정됐다. G2-②가 빠졌다** — 위 블록 참조.
> **순서 의존 2건은 그대로다:** **C3-① → `total_xp`** · **15a → `total_xp`**.
>
> ~~**⚠ 게이트 재판정: G2-② 하나가 판정을 뒤집는다. 빼는 것을 권한다**~~
> → **제외로 확정됐다 (2026-09-02).** 판정 근거는 유지된다: 배포된 프론트가
> **10곳에서 직접 INSERT하고**(`MultiplayerGamePage.jsx:191-204`) `[코드]`, 회수하면
> **구버전 번들 drain 문제**가 남는다. **게이트 최종 판정은 "없이 가능"이다** (`TRACKS.md` §7.5).
>
> **⚠ 계약 문서 불일치 — 처음 3건에서 4건이 됐고, 그중 1건은 고쳤다** (`TRACKS.md` §9):
> ① **C5의 적용 지점은 8곳**이고 이름 fallback은 **6종**이다 (`나`·`상대`가 빠졌다)
> — **계약 문구는 그대로 두고 A의 완료 정의로 흡수했다**
> ② **C4의 "CHECK 2건"은 추가 1건**이다 — **창 범위가 1건으로 확정됐다**
> ③ **C3-①의 grant 목록** — **✅ 정정 완료. 3컬럼으로 확정** (위 블록)
> ④ **새로 찾은 것:** C4 §3.1이 "부제 문구가 시안에 없어 발명하지 않는다"고 적었는데
> **`utils/groupResultFormatter.js:2-3`에 운영 문자열이 이미 있다** `[코드]` —
> `time_limit`→"제한 시간 초과", `grace_timeout`→"유예 시간 초과". 반대로
> `disconnected_timeout`은 **코드 "연결 끊김" vs 계약 "몰수"로 어긋난다.**
> ~~**C4-①은 여전히 미결이지만**~~ → **확정됐다 (3차 갱신).** "발명 대신 기존 문자열 채택"이
> 채택됐고, `disconnected_timeout`은 **시안이 상위**라 코드가 정정 대상이 됐다. 위 3차 블록 참조.

**릴리스가 열렸으므로 이제 여기가 본류다.** 순서·선행 조건은
`wiki-race-2.0-handoff/code/10-CODE-MASTER-TODO.md` §2가 단일 기준이다.

| 순서 | 묶음 | 문서 | 선행 조건 | 상태 |
|---:|---|---|---|---|
| 3 | **1:1·아이템전** | `14-DUEL-ITEMS.md` | 서버 이벤트 계약 | `[ ]` |
| 4 | **XP·레벨·랭킹** | `15-XP-LEVEL-RANKING.md` | 결과 서버 권위 | `[ ]` |
| 5 | 업적·보상 카탈로그·프로필 꾸미기 | `16-ACHIEVEMENTS-REWARDS.md` | 3·4 이벤트 계약 | `[ ]` |
| 6 | 탐험·프로필 카드·게스트 | `17-EXPLORATION-PROFILE-GUEST.md` | 4·5 | `[ ]` |
| 7 | 확정 디자인 통합 | 별도 산출물 | 디자인 승인 | `[~]` 저장소 밖 진행 중 |

> **패킷 14~17은 전부 DB 변경을 동반할 가능성이 크다.** 그리고 **운영은 이제 열려 있다** —
> 다음 migration 적용은 **사용자가 쓰고 있는 DB에 대한 것**이고, 이 창이 쓴 절차(게이트 → 배포 →
> 게이트 뒤 검증 → 해제)를 **다시 밟아야 한다.** 창 절차는 `CUTOVER-PLAN.md`에 그대로 있고,
> 다음 창을 위한 개선점은 그 문서 §0.-1과 CUTOVER-LOG §6.2·§6.5에 정리돼 있다.
>
> **창이 필요한 것은 `17a-1 오늘 3코스` 하나로 좁혀졌다.** `daily_challenges`의
> **`UNIQUE(challenge_date)` 제약 교체**가 운영 DDL이기 때문이다.
> **G2가 `room_events`로 결정되면서 14가 창에서 빠졌고, G1이 공통 계약으로 빠지면서
> 16·17b의 상호 대기가 없어졌다** — `PACKET-CONTRACT-GAPS.md` §5.5·§6.2.
>
> **그 창은 8월 창과 성격이 다르다** `[추정]` — 함수 삭제가 없고, `daily_challenges`는
> 레이스 중에 읽히지 않으며, FK도 publication 등재도 없다. **구버전 프론트는 3행 중
> 첫 행을 집어 1코스만 보이는 상태로 정상 동작한다.** 그래서 **유지보수 게이트 없이
> 실행 가능한 것으로 읽힌다.** 배포 순서도 8월과 **반대로 DB가 먼저다** (§5.5.3).
> **최종 판단은 창을 여는 세션이 한다.**
> **`AGENTS.md` §1의 건별 승인은 그대로다 — 이 창의 승인은 이 창에서 끝났다.**

**D. 운영 상시 항목 — 게이트 해제로 성격이 바뀐 것**

| # | 항목 | 왜 지금 등재하나 |
|---|---|---|
| **D1** | **무료 요금제 자동 일시정지 — 주 1회 접속으로 깨워 둔다** | **아래** |

**D1 상세.** 무료 요금제는 일정 기간 무활동 시 프로젝트를 **자동 일시정지**한다 `[외부]`.
CUTOVER-PLAN §3.3이 **7일**로 적고 있고, 창 절차가 P4(프로젝트 Active)를 **전날과 당일에 각각**
확인하게 만든 근거가 이것이다.

**바뀐 것은 사실이 아니라 결과다.** 창 기간에는 일시정지가 **개발자만 겪는 문제**였다 —
게이트가 켜져 있어 사용자는 어차피 점검 화면만 봤다. **W10 이후에는 사용자가 깨진 사이트를
만난다.** 프론트는 Vercel에 정적으로 떠 있으므로 **앱은 뜨고 DB 호출만 실패하는 형태**가
된다 — 점검 화면보다 나쁜 경험이다. 로그인부터 실패한다.

| 항목 | 값 |
|---|---|
| 확인된 마지막 DB 활동 | **2026-09-02** (W9-b 재스모크 · W10) |
| 그 이전 활동 | 2026-08-28 (창 세션 2). **그 사이 5일 공백이 있었던 것으로 읽힌다** |
| 실사용자 트래픽 | **없는 것으로 읽힌다** — `game_records` 마지막 행이 창의 싱글 스모크다 (스냅샷 §8.1) |
| 조치 | **주 1회 접속.** 프로덕션 URL 방문으로 DB 호출이 발생하면 충분하다 |
| 해제 조건 | 실사용자 트래픽 정착. 판단 기준은 `game_records`·`last_play` 재측정 |

> **"9월 9일에 멈춘다"고 단정하지 않는다.** 7일은 CUTOVER-PLAN의 기재값이고
> **정지 조건의 정확한 판정 기준·유예·알림 여부는 확인되지 않았다** `[미확인]`.
> **영구 조치가 아니라 한시적 운영 습관으로 다룬다.**

**착수 순서 제안 (2026-09-03 갱신):** ~~B1~~ **완료 → A2 → B4·B5 → C.**
**C(기능 작업) 안에서는 A·B가 끝났으므로 다음이 `TRACKS.md` 트랙 D(15a XP 원장)다** —
선행 0 · 파일 충돌 0이고, **A·B가 끝나 로컬 Supabase 스택 경합도 없다.**
**트랙 C(14)는 G7이 사람 결정이라 코드로 풀리지 않는다.**
~~B1이 먼저인 이유는 다른 모든 판단이 "지금 운영이 어떤 상태인가"를 근거로 삼기 때문이고~~
→ **B1이 끝났으므로 그 근거는 `PROD-SNAPSHOT-2026-09-02.md`에서 읽는다.**
**A2가 다음인 이유는 원인이 확정되지 않은 유일한 항목**이라서다.
A1·A3·B2·B3·B6는 C와 병행 가능하다. **D1은 순서가 아니라 상시 항목이다.**

### 5.1 완료된 선행 조사

1. ~~**`baseline_remote_schema`와 운영 스키마 대응 관계 확인**~~ — **완료 (2026-08-20).**
   4개 축을 대조해 **차이 0건**이다: 테이블 14/14(양방향 잉여 0), 함수 7/7(이름·인자 일치),
   제약 52/52(CHECK 술어·FK 참조 대상·`ON DELETE` 동작까지 일치), RLS 14/14(정책 합계 29 일치).

   → **baseline은 이 운영 상태의 덤프다. `repair` 대상 버전은 `20260730170602`로 확정,
   판단은 `(a) 성립`으로 확정한다.** `repair`는 스키마를 검사하지 않고 이력 행 하나를 기록하는
   연산이므로 잔여 드리프트가 성공·실패를 바꾸지 않는다. `repair`의 실제 동작(테이블·스키마 생성,
   행 정확히 1개, `--status reverted`의 DELETE)은 U12에서 로컬 재현으로 실측 확정됐다.

   부수 확인 2건: `picked`는 baseline:612에 있고 운영 제약도 0건이라 사본 판정이 양쪽에서 일치한다
   (보존 결정: U10). `group_match_history`·`user_profile_stats`의 RLS off는 운영·baseline·문서
   (`docs/WIKI_RACE_GROUP_DB_SECURITY_SPEC.md` §4.4·§5.4) **3자 일치**이며,
   Phase 2C(`20260813072952:765-766`)가 잠금을 도입한다.

   근거·판단 전문: `docs/ops/PROD-SNAPSHOT-2026-08-20.md` §9·§10.
2. ~~**cutover 계획 재작성**~~ — **완료 (2026-08-21, `a064256`).**
   `docs/ops/CUTOVER-PLAN.md`가 W0~W11 창 절차, 백업(§4), 과거 방 이력 삭제(§5), 롤백(§6),
   창 전 선행 조건(§7), 창 후 검증(§8), 미결정 항목(§9), Release A~D 대체 매핑(§10)을 담는다.
   이후 `9145833`·`032caba`가 U12(`repair` 동작)·U13(link 대상)을 해소했다.

   확정된 전제: 다운타임 허용·창 1~2시간(U1), Release 재분할 불필요·11개 전량 1창 적용(U2),
   구버전 세션 drain은 유지보수 게이트(U3), `game_rooms` 위반 167건은 과거 방 이력 삭제로 처리(U7),
   `picked` 보존(U10). **되돌릴 수 없는 지점은 W6(`db push --linked`)** 이고 down migration이
   없으므로 유일한 되돌림 수단은 덤프 복원이다(§2.1·§6).

   운영 데이터 변경 2건(F14)과 과거 방 이력 삭제(§5)는 **별도 승인 사안**이다 (`AGENTS.md` §4).
   `game_rooms` 위반 행 점검 쿼리와 판정(위반 167건, non-group `host_user_id is null` 0건)은
   CUTOVER-PLAN §1.2·§5.3에 있다.
3. ~~**`avatars` 버킷 객체 소유자 확인**~~ — **해소 (2026-08-21).** 소유자는 **`roeehd2` — 사용자
   본인 계정**이다 (`[사용자 확인]`, CUTOVER-PLAN §1.1 U11). 실사용자 데이터가 아니므로 프로필
   업로드 기능 제거가 안전하다. 객체 자체의 삭제는 cutover 범위 밖이며 `AGENTS.md` §4가 그대로
   적용된다.
4. ~~**롤백 판단 기준(P11)과 §6.3 복원 절차**~~ — **완료 (2026-08-27).**
   사용자가 원칙 4가지를 확정했고(U14), 그 위에서 **로컬 복원 리허설**을 수행해(U15)
   CUTOVER-PLAN에 **§6.0**(판단 기준)·**§6.3**(확정 절차)·**§6.5**(리허설 기록)를 넣었다.

   **리허설이 뒤집은 사실 3건 — 다음 세션이 반드시 알아야 한다:**

   - ~~**W2.5는 선택이 아니다.**~~ — **운영에서는 선택이었다 (2026-08-28 창 실측).**
     리허설이 재현한 실패 경로 자체는 실재한다: `w6_blocking_rows > 0`이면 **W6가 10번째
     `20260814113000`에서 SQLSTATE 23514로 실패한다** — 그 migration이 자기가 붙인 `NOT VALID`
     제약이 걸린 행을 스스로 UPDATE하기 때문이다.
     **그러나 운영의 `w6_blocking_rows`는 `0`이었다** — 그 경로를 발화시킬 행(`host` 참조가 끊긴
     위반 행)이 운영에 없었다. 즉 **CUTOVER-PLAN §5.3-0의 두 갈래 중 운영이 놓인 쪽은 "선택"**
     이었다. 삭제는 그래도 수행했고 근거는 W7의 조건부 `validate`였다 (CUTOVER-LOG §W2.5).
     **교훈은 "리허설이 틀렸다"가 아니라 "삭제 전에 먼저 재라"는 §5.3-0의 설계가 옳았다**는 것이다.
   - **§6.3의 데이터 덤프 복원은 그대로 하면 실패한다.** 전체 데이터 덤프에는 `auth`·`storage`
     데이터가 들어 있고 §6.3-2는 `public`만 비우므로 **`auth` PK 충돌로 중단된다**
     (`duplicate key ... audit_log_entries_pkey`, public 복원 0행). **`--schema public` 덤프를
     따로 떠서 복원한다** (CUTOVER-PLAN §6.3.3).
   - **비우기 SQL은 `private` 스키마도 지워야 한다.** `drop schema public cascade`는
     `private` 함수 10개 중 3개만 끌고 가고 **7개가 살아남는다** (CUTOVER-PLAN §6.3.2).

   **복원 결과:** 구조 지문·행 수·이력 **차이 0건.** DB 작업 **4.4초**(로컬).
   복원되지 않는 것 중 실질 항목은 **`supabase_admin` default privileges 3행 하나**이며
   `postgres` 롤로는 재생성할 수 없다 (CUTOVER-PLAN §6.3.4).

   **여전히 미검증:** 운영에서의 실행. 특히 `drop schema public cascade`와
   `set session_replication_role = replica`의 **운영 `postgres` 롤 권한** (CUTOVER-PLAN §6.5.7).

### 5.2 CUTOVER-PLAN §7 선행 조건 — **창이 열렸고 닫혔다 (2026-08-27~28)**

**P1~P14는 이 절의 역할을 다했다.** P4(프로젝트 Active)는 명시적 대시보드 확인 기록이 없지만
**W2 덤프와 W6 `db push`가 모두 성공했으므로 창 시점에 `Active`였다는 사실은 사후 확정된다** —
`Paused`였다면 두 명령 모두 접속 단계에서 실패한다 (CUTOVER-LOG §0.1).

> **다만 절차 이탈 1건이 있었다.** CUTOVER-LOG §0.0의 실행 전제 3항목(Docker 데몬, 승인 이미지,
> 운영 연결 문자열 IPv4)에 **당일 확인 기록이 없다.** §0.0은 "셋 중 하나라도 아니면 W6를
> 시작하지 않는다"고 정하므로, **되돌릴 수단의 전제를 확인하지 않은 채 되돌릴 수 없는 지점을
> 넘었다.** 결과적으로 복원은 필요 없었지만 그것은 사후 결과이지 절차 충족이 아니다.
> 다음 창의 개선안은 CUTOVER-LOG §6.2-5·§6.3에 있다.

**완료 13건.** 2026-08-21: **P1·P2·P3**(게이트 구현·포함·로컬 확인), **P6**(`backup/` gitignore),
**P8**(link 대상 확인), **P13**(커밋 기준 `npm test`·`npm run build`).
2026-08-27: **P5·P7·P9·P10·P11·P12·P14.**

- **P14** — `psql`이 이 머신에 없다는 실측에서 시작해 **Docker 이미지의 `psql`로 경로를 확정**했다:
  `docker run --rm -i --entrypoint psql <승인이미지> "<CONN>" -v ON_ERROR_STOP=1 -f - < <파일>`
  (CUTOVER-PLAN §6.3.0 A안). **로컬 Supabase 스택 up은 요구하지 않는다** — `docker run`이
  스택과 무관하게 동작함을 검증했다 `[산출물]`. **대안 경로는 없다** — Studio SQL Editor는
  `COPY … FROM stdin`을 공급할 수 없어 데이터 복원이 원리적으로 불가능하다 (§6.3.0-4).
  **컨테이너에 IPv6가 없으므로**(`EnableIPv6=false`, `curl -6` 실패 `[산출물]`) 연결 문자열이
  IPv4로 해석돼야 한다 (§6.3.0-1).

- **P5·P7** (2026-08-27) — 사용자가 W-1 리허설 스키마 덤프를 실행했다. **덤프가 완주한 것 자체가
  P5(로그인 세션·DB 비밀번호 유효)의 증명이고**, 그 결과물을 baseline과 대조해 **바이트 단위
  완전 동일**(차이 0건)이 나와 P7·U5가 해소됐다. 전문은 CUTOVER-PLAN §1.4.
- **P6의 판정 축이 2건으로 늘었다** — gitignore 반영에 **`backup/` 디렉터리 실재**가 더해졌다.
  W-1에서 `failed to open dump file: NotFound`가 실제로 발생했고, 인증이 성공한 뒤 파일 쓰기에서
  실패하므로 **로그인 문제로 오진하기 쉽다** (CUTOVER-PLAN §4.3-0).

- **P9** — `npx supabase --version` → `2.114.0` `[산출물]`. `package.json` 핀(캐럿 없는 정확한 값)·
  `package-lock.json`·`node_modules` 설치본·런타임 네 축이 모두 일치한다.
  **CODE GO의 유효 조건**이라 불일치는 창 차단 요소였다. 설치·업그레이드는 하지 않았다.
- **P10** — 리허설로 삭제가 선택에서 필수가 되면서 합의할 "삭제 여부"가 사라졌다고 봤으나,
  **창 실측이 다시 "선택"으로 되돌렸다** (`w6_blocking_rows = 0`). **P10이 실제로 값을 낸 부분은
  "범위 값은 창 안 W2.5에서 측정한다"였다** — 그 측정이 필수/선택 판정을 뒤집었다
  (CUTOVER-PLAN §5.3-0, CUTOVER-LOG §W2.5).
- **P11** — 롤백 판단 기준. CUTOVER-PLAN §6.0.
- **P12** — `docs/ops/CUTOVER-LOG-TEMPLATE.md`. 창 당일 `CUTOVER-LOG-YYYY-MM-DD.md`로 복사해 쓴다.

### 5.3 창과 무관하게 남은 검증

- **실제 Wikipedia snapshot smoke (B2)** — B1은 fixture 인터셉트 기반이므로 실제 API 경로의
  429·revision 변경·`WIKI_SNAPSHOT_IDENTITY_MISMATCH` 처리는 아직 미검증이다.
  **B1이 이 경로를 덮지 못하는 것은 설계상 그렇다** — `scripts/packet13-browser-b1.mjs:788-789`가
  Wikipedia를 fixture로 라우팅하고 `:1726`이 `unexpectedWikipediaRequests !== 0`을 실패로 처리한다.
  따라서 §2의 "B1 wiki_snapshot 429 = 0"은 **검증이 아니라 미측정**이다.
  `qa/30-INTEGRATION-CHECKLIST.md` §21에는 B2 항목 자체가 없다 (CUTOVER-PLAN §10이 명시).

  > **2026-08-28 창이 이 미측정 구간을 운영에서 밟았다.** W9 발견 1·3이 정확히 그 결과다 —
  > B1이 fixture로 가려 둔 실제 429 경로가 운영에서 터졌다. **형식적 B2 하네스는 여전히
  > 미작성이지만, "실제 API 경로가 어떻게 실패하는가"는 더 이상 미지가 아니다** (§5.5).
  >
  > **2026-09-02 — B2의 1단계만 생겼다.** `scripts/wikiSnapshotRequestCount.mjs`가
  > `index.ts`를 그대로 불러와 **요청 수를 센다** (§5.4-1·2). **이것은 요청량 계측이지
  > 실패 경로 검증이 아니다** — 429·revision 변경·`WIKI_SNAPSHOT_IDENTITY_MISMATCH`는
  > 여전히 스텁 응답이라 미검증이다. **B2 본체(2단계, `functions serve`)는 미작성이다.**
- `npm run supabase:clean-gate`·`npm run supabase:postgrest-smoke`의 현재 커밋 기준 재실행 (§2).

### 5.4 2026-08-28 운영 장애에서 갈라져 나온 후속 작업

2026-08-28에 **최소 수정 3건만** 적용했다 (§1의 변경분 2번). 아래는 **의도적으로 보류**한 것이며,
전부 `supabase/functions/wiki-snapshot/index.ts` 축이다. 판단 예정: **2026-08-29.**

> **창이 이 보류 목록을 검증했다.** 최소 수정 3건은 W8로 운영에 반영됐고 **싱글 경로의 429는
> 풀렸다.** 그러나 **4인 그룹에서 502가 대량 재발했다** (§5.5 발견 3) — 62요청이 참가자 수만큼
> 곱해지기 때문이다. ~~**즉 아래 1번(스냅샷 재사용)이 "최대 레버리지"라는 판단이 운영에서
> 확인됐고**~~ ~~1번은 §5.5 발견 3의 해결 후보이며 **두 항목은 같은 뿌리다** — 2026-08-29
> 판단에서 1번을 최우선으로 올린다.~~
>
> **2026-08-29 판단 완료 — 위 결론을 정정한다** `[코드]`. **1번은 대기실 준비 버튼 502를
> 고치지 못한다.** 그 경로의 문서는 참가자마다 서로 다르고(`GROUP_TARGETS_NOT_DISTINCT` 제약)
> **전부 cold miss**이기 때문이다. **순서는 2 → 1 → 3으로 바뀐다.** 근거·측정·결합 제약은
> **§5.5-3**에 있다. 아래 표의 "왜 보류했나"는 2026-08-28 시점 기록으로 **그대로 보존한다.**

배경 실측 — 문서 1건당 Wikipedia 요청 수는 `대한민국` 기준 **78건**
(parse 2 + info 46 + revisions 30, 2026-08-28 `[산출물]`). dedup 적용 후 **62건**이다.
운영 429는 이 요청량과 UA 부재가 겹쳐 발생했다 (`execution_time_ms 4988`, `fetchPageIdentities`).

| # | 항목 | 왜 보류했나 | 비고 |
|---|---|---|---|
| ~~1~~ | ~~**스냅샷 재사용 (조기 반환)**~~ **완료 (2026-09-02). Edge Function 미배포.** | 보류 사유였던 "로직 변경"은 유효했다 — 실제로 조기 반환 2개와 캐시 조회 1개가 들어갔다 | **warm 61 → 0건**(본문 불필요) / **→ 1건**(관전). 4인 게임 진입 244 → 31건 |
| ~~2~~ | ~~**`fetchRevisionIds` 제거**~~ **완료 (2026-09-02). Edge Function 미배포.** | 계약 테스트를 **제거의 유지**로 뒤집었다 (`tests/serverAuthorityMigration.test.js`). 식별자가 사유 주석에 남으므로 호출·정의 형태로 검사한다 | **cold 61 → 31건.** 대기실 4인 244 → 124건 |
| 3 | **429 재시도·백오프** | ~~요청 62건이 남은 상태에서는 실행 예산을 태운다~~ → **여전히 보류. 사유가 "아직 이르다"에서 "측정 대기"로 바뀌었다** (아래 5.4-3) | 넣는다면 `wikiJson` 한 곳. `Retry-After` 존중. 선례는 `scripts/verifyWikiLinks.mjs:23-43` |
| 4 | **상태코드 분리 / 프론트 에러 메시지** | 별도 작업 | 지금은 상위 rate limit과 `WIKI_PAGE_INVALID`가 **둘 다 502**다. 프론트는 `FunctionsHttpError`의 고정 영문 문구를 그대로 노출하고 `error.context`의 `code`를 읽지 않는다 (`services/wikiSnapshotService.js:42`) |
| 5 | **`config.toml`의 `[functions.wiki-snapshot]`** | 별도 판단 | 선언이 없어 `verify_jwt`가 **기본 true**로 배포된다. `single-run`만 F20으로 고정돼 있다 (`supabase/config.toml:423-424`) |

**B2 로컬 검증 경로** (§5.3의 B2와 같은 항목이다. 2026-08-28 실측):
로컬 `supabase_edge_runtime_*` 컨테이너는 `Exited (255)` 상태이고 `deno`는 PATH에 없다.
1단계는 Docker 없이 가능하다 — 실제 Wikipedia에 대고 `extractBodyLinks`·배치 수를 재는 독립
하네스이며, 78건·dedup 등가성이 이 방식으로 측정됐다. 2단계는
`npx supabase functions serve wiki-snapshot`으로 fixture 없이 전 경로를 태우는 것이다.
**어느 쪽도 `npm test`에 넣지 않는다** — 3자 API를 실제로 호출하므로
`verifyWikiLinks.mjs`처럼 명시 실행 스크립트여야 한다.

#### 5.4-1·2 적용 결과 (2026-09-02) — **실측**

1번과 2번을 **한 번에** 적용했다. 같은 파일이라 배포 단위가 하나이기 때문이다.
계측 하네스는 **`scripts/wikiSnapshotRequestCount.mjs`** (명시 실행, `npm test` 밖 — 위 규칙).
`index.ts`를 **복사하지 않고 그대로 불러와** `fetch`를 세므로 소스가 바뀌면 수치도 따라 바뀐다.
실제 Wikipedia 호출은 문서 HTML 1건뿐이고 그마저 캐시된다.

```bash
node scripts/wikiSnapshotRequestCount.mjs
```

| 시나리오 | before | after | 차이 |
|---|---|---|---|
| cold — 최초 스냅샷 (신원 있음) | 61 | **31** | −30 |
| **warm — 재사용 (본문 불필요)** | 61 | **0** | **−61** |
| warm — 관전 (본문 필요) | 61 | **1** | −60 |
| cold — 제목만 (신원 없음) | **62** | **32** | −30 |

**하네스 검증:** "제목만" before가 **62건**으로, §5.4 서두에 기록된 2026-08-28 실측값과
정확히 일치한다. 독립적으로 만든 계측이 기존 수치를 재현했다.

| 4인 그룹 환산 | before | after |
|---|---|---|
| 게임 진입 (전원 같은 시작 문서) | 61 + 3×61 = **244** | 31 + 3×0 = **31** (−87%) |
| 대기실 준비 (전원 다른 문서) | 4×61 = **244** | 4×31 = **124** (−49%) |

**대기실이 여전히 124건인 것이 남은 위험이다.** 문서가 전원 distinct라 재사용이 듣지 않는
구간이고, 이것이 발견 3의 관측(준비 버튼 11회 연속 실패)이 나온 바로 그 경로다.
**절반으로 줄었을 뿐 구조는 그대로다** — 운영 재검증이 필요하다.

기준 커밋·검증 수치는 §2.

> ### ⚠ 배포 순서 — **프론트가 먼저다. 반대로 하면 관전 화면이 깨진다**
>
> 이 수정은 요청 body에 **`includeDocument` 플래그**를 새로 넣는다. 본문 HTML은
> `wiki_page_snapshots`에 없어서 warm 경로에서 pinned parse를 태울지 말지를 이 값으로 정한다.
> 두 배포는 서로 독립이다 — 프론트는 Vercel(`main` push), Edge Function은 `supabase
> functions deploy`. **따라서 순서가 관측 가능한 차이를 만든다.**
>
> | 순서 | 결과 |
> |---|---|
> | **프론트 → Edge Function** | **안전.** 새 프론트가 플래그를 보내도 옛 함수는 무시하고 늘 HTML을 준다. 감축 효과만 늦게 나온다 |
> | Edge Function → 프론트 | **관전 화면이 깨진다.** 옛 프론트는 플래그를 안 보내므로 `includeDocument=false`로 취급돼 warm 경로가 `documentHtml: ""`를 준다. `services/groupSpectatorService.js:92-96`이 `SPECTATOR_DOCUMENT_UNAVAILABLE`로 실패한다 |
>
> **게이트가 켜져 있으면 사용자 노출은 어느 쪽이든 0이지만, 순서를 지켜야 스모크가 유효하다.**
> 같은 창에서 둘 다 올리고 프론트를 먼저 올린다.
>
> **실행 결과 (2026-09-02): 순서를 지켰다.** W1-b(프론트) → W8-b(Edge Function) →
> W9-b(재스모크)이고, 재스모크에서 **관전 화면 본문이 정상 렌더**됐다 —
> 역순이었다면 여기서 `SPECTATOR_DOCUMENT_UNAVAILABLE`이 떴을 것이다.
> **이 상자는 다음에 같은 형태의 배포를 할 때 다시 읽는다** (플래그를 새로 추가하는 변경은
> 전부 같은 구조를 만든다).

#### 5.4-3 429 백오프 — ~~다음 판단~~ → **판정 완료: 넣지 않는다 (2026-09-02)**

**측정이 끝났다.** ① 수정을 배포했고(W1-b·W8-b) → ② 4인 그룹 스모크를 다시 돌렸고
(W9-b) → ③ **429/502가 나오지 않았다. 대기실 124요청이 그대로 통과했다** `[사용자 보고]`.
**따라서 백오프는 넣지 않는다.**

**"감축만으로 통과하는지 먼저 잰다"는 순서가 값을 냈다.** 넣었다면 **불필요한 지연**이
됐을 것이다 — 백오프는 실패를 느리게 만들 뿐 요청 수를 줄이지 않으므로, 통과하는 요청량에
대해서는 순수 비용이다. **반대 순서로 갔다면 그 비용을 영구히 지불하면서 그 사실을 몰랐을
것이다.**

> **다만 폐기가 아니라 보류다 — 재검토 조건을 남긴다.**
> 지금 통과한 것은 **4인 · 단발 스모크 · 그 시점의 Wikipedia rate limit** 조건에서다.
> **동시 사용자가 늘면 다시 재야 한다** — 대기실 요청 수는 참가자 수에 그대로 비례하고
> (4인 124건 = 인당 31건), **여러 방이 동시에 돌면 같은 상위 rate limit을 나눠 쓴다.**
> 재검토 트리거: **동시 그룹 방이 늘어난 뒤 502가 다시 보이면.**
> 그때는 "얼마나 모자라는가"라는 측정값을 들고 들어갈 수 있다.
>
> **넣게 될 경우의 자리는 그대로다:** `wikiJson` 한 곳, `Retry-After` 존중,
> 선례 `scripts/verifyWikiLinks.mjs:23-43`. 병렬화는 **하지 않는다** — 실패 모드가
> rate limit이므로 순간 동시성을 올리면 악화된다 (§5.5-3).

### 5.5 ~~W9 미해결 4건~~ → **전건 종결 (2026-09-02)**

2026-08-27~28 창의 W9에서 결함 6건이 나왔다. 2건은 창 안에서 고쳤고(`be520c3`) 4건이 남았다.
**2026-08-29에 그 4건을 전부 코드에서 조사했고**(5번 결함 아님, 4번 수정), **2026-09-02에
배포·재스모크로 3번을 닫고 6번을 스펙 범위 밖으로 종결했다.**
전문·발견 순서·통과 항목은 `docs/ops/CUTOVER-LOG-2026-08-27.md` §W9·§W9-b.

| # | 항목 | 관측 | 최종 판정 | 해제 차단 |
|---|---|---|---|---|
| **3** | **`wiki-snapshot` 502 대량 재발 (4인 그룹)** | 준비 버튼 **11회 연속 실패** | **해소 (2026-09-02).** 감축을 프론트(W1-b) → Edge Function(W8-b) 순으로 배포한 뒤 재스모크에서 **502 0건**. 대기실 4인 244 → **124건**(통과), 게임 진입 244 → **31건** | ~~예~~ → **아니오** |
| **4** | ~~**"유효하지 않은 RETIRE 사유"**~~ | 결과 화면에서 로비 나가기 실패 | **해소.** 수정 2026-08-29(`579a338`), 배포 2026-09-02(W1-b), **재스모크에서 정상 확인**. 아래 5.5-4 | **아니오** |
| ~~5~~ | ~~**`username-lookup` 404**~~ | — | **결함 아님 → 종결 (2026-08-29).** 아래 5.5-5 | **아니오** |
| ~~6~~ | ~~**관전 이모티콘이 다른 참가자에게 전달되지 않음**~~ | — | **스펙 범위 밖 → 종결 (2026-09-02)** `[사용자 판정]`. 구조(렌더 경로가 `SPECTATING` 분기 하나뿐)는 확정이나 **스펙이 수신자를 규정하지 않는다.** 아래 5.5-6 | **아니오** |

> **결함 판정과 검증은 다르다.** 6번은 **결함이 아닌 것으로 종결**됐지만, 관전자 2명 조건에서
> 실제로 전달되는지는 **여전히 미검증**이다 (§5.0 A3). 종결은 "고칠 것이 없다"이지
> "확인했다"가 아니다.

#### 5.5-3 `wiki-snapshot` 502 — **§5.4-1이 이 증상을 못 고친다** → **해소 (2026-09-02)**

> **결론부터: 닫혔다.** 아래 분석은 **어떤 수정이 왜 필요했는지**의 기록이며 그대로 유효하다 —
> 실제로 1순위로 올린 §5.4-2(`fetchRevisionIds` 제거)가 대기실 경로를 절반으로 줄였고
> **그 절반으로 통과했다** (W9-b). **분석의 핵심 주장("곱셈은 두 갈래이고 서로 다른 수정을
> 요구한다")이 운영에서 확인됐다.** 3순위였던 백오프는 필요하지 않았다 (§5.4-3).

~~**발견 3과 §5.4-1은 같은 뿌리다.** §5.4-1(스냅샷 재사용)이 유일하게 곱셈 구조를 깨는 수정이다.~~
**2026-08-29 조사로 이 서술을 정정한다** `[코드]`. 곱셈은 **두 갈래이고 서로 다른 수정을 요구한다.**

| 경로 | 호출 지점 | 문서 동일성 | §5.4-1(재사용)의 효과 |
|---|---|---|---|
| **대기실 준비 버튼** | `pages/GroupRoomPage.jsx:203` | **전원 서로 다른 문서** — `start_group_room_game_v2`가 `submitted_target_page_id`의 **distinct**를 요구하고 아니면 `GROUP_TARGETS_NOT_DISTINCT`로 거부한다 (`20260814103000_group_final_gaps_v13.sql:943`) | **0%.** 전부 cold miss다 |
| 게임 진입·복구 | `pages/GroupGamePage.jsx:452` | **전원 동일** (시작 문서) | 62 → 62 + (N−1)×1 |
| 이동 1회 | `pages/GroupGamePage.jsx:1008` | 부분 중복 | 부분 |

**두 번째 증폭 — 실패가 아무것도 남기지 않는다.** DB 쓰기는 62요청이 전부 성공한 뒤 마지막
한 번뿐이다 (`supabase/functions/wiki-snapshot/index.ts:219`). 중간 429는 `wikiJson`이 throw(`:40`)
→ catch → 502(`:244`). **재시도는 매번 full cost이므로 11회 연속 실패 ≈ 한 참가자가 혼자
최대 ~680요청을 태운 것**이고, 그 재시도가 rate limit을 계속 살려두는 자기지속 루프다.

**§5.4 보류 항목 재평가 (이 데이터 기준):**

| §5.4 | 준비 버튼 502에 대한 실효성 | 재평가 |
|---|---|---|
| **2. `fetchRevisionIds` 제거** | **62 → 32 (−48%). cold·warm 무관하게 항상 적용** | **1순위로 올린다** — 보고된 증상에 직접 듣는 유일한 항목 |
| **1. 스냅샷 재사용** | **대기실 0%.** 진입·재방문에서만 62 → 1 | 2순위. "유일하게 곱셈을 깬다"는 서술은 **경로를 특정해야 성립한다** |
| **3. 429 백오프** | 하드 실패를 느린 성공으로 전환 — 11연속 실패 증상을 직접 없앤다 | **3순위로 올린다.** "62건이 남은 상태에서는 예산을 태운다"는 보류 사유는 2번 적용 후 32건이면 약해진다 |
| 4. 상태코드 분리 | 게이트 무관 | 가치 상승. 지금 프론트가 `FunctionsHttpError` 영문을 그대로 노출해 테스터가 원인을 못 읽었다 |
| 5. `config.toml` | 무관 | **확인함** — `[functions.single-run]`만 선언돼 있다 (`supabase/config.toml:423`) `[코드]`. 4건 중 어느 것의 원인도 아니다 |

> **"병렬화"는 §5.4에 없다** (`병렬` 문자열 0건, 2026-08-29 확인). 그리고 여기서는 **틀린 방향**이다 —
> 실패 모드가 rate limit이므로 순간 동시성을 올리면 429가 악화된다. 지연(실행 5초, 문서 전환
> 7~20초)은 줄지만 증상은 심해진다.

**착수 시 걸리는 것 (전부 미기록이었다):**
- Edge Function은 **Vercel 배포에 포함되지 않아 별도 배포가 필요하다** (CUTOVER-LOG §W8, `:194`).
- §5.4-2는 `tests/serverAuthorityMigration.test.js:61-66`의 계약을 깬다 → 테스트 동반 수정.
- **§5.4-2의 숨은 결합:** `target_revision_id`가 null이면 `apply_group_move_v2`가
  `private.resolve_wiki_revision(page_id, null)`로 폴백하고, 그것도 null이면
  `current_revision_id = coalesce(null, current_revision_id)`로 **이전 문서의 revision이 남는다.**
  지금 안전한 유일한 이유는 클라이언트가 이동 RPC 직전에 목적지를 스냅샷하기 때문이다
  (`GroupGamePage.jsx:1008` → `:1014`). **이 순서가 곧 계약이며 문서에 없었다.**
- **§5.4-1의 제약:** `wiki_page_snapshots`에 **HTML 컬럼이 없는데**
  (`20260814090000_server_authority_v2.sql:16-24`) `services/groupSpectatorService.js:92-96`은
  `documentHtml`이 없으면 `SPECTATOR_DOCUMENT_UNAVAILABLE`로 실패한다. 조기 반환은 pinned parse
  1건을 남겨야 하며, 이것이 문서의 "78 → 1~2건"과 일치한다.
- **추가 여지 (§5.4에 없음):** 관전 외 **모든 호출부가 반환값을 버린다** — 9개 호출 지점 전부
  `await ensureWikiSnapshot(page);`. 요청 body에 플래그를 두면 관전 아닌 호출은 warm 시 **0 요청**이다.

#### 5.5-4 "유효하지 않은 RETIRE 사유" — **해소 (2026-09-02 배포 완료)**

**RPC 계약 불일치가 아니었다.** 허용 값은 프론트(`services/groupMultiplayerService.js:212`)와
RPC(`20260814103000_group_final_gaps_v13.sql:920`) 모두 **`left` / `forfeited` 2개로 일치**한다.
관측된 한국어 문구는 **클라이언트 가드**(`groupMultiplayerService.js:213`)이며 RPC의 문구는
`RETIRE_REASON_INVALID`다.

**실제 원인은 `onClick` 바인딩이었다** `[코드]`. `handleReturnToLobby`의 첫 인자가 `retireReason`인데
세 곳이 핸들러를 그대로 `onClick`에 넘겨 **React가 SyntheticEvent를 첫 인자로 주입**했다.
기본값 `"forfeited"`는 `undefined`일 때만 적용되므로 이벤트 객체가 그대로 가드에 걸렸다.
**ExitGuard 경로만 정상이던 이유가 이것이다** — `GroupGamePage.jsx:1160`은
`() => handleReturnToLobby("forfeited")`로 감싼다. 게임 중 나가기는 되고 결과 화면만 실패한
관측과 정확히 일치한다.

**완주 후 나가기가 RETIRE 경로를 타는 것 자체는 맞다.** `leave_group_player`는 이름과 달리
완주자에 대해 전용 분기(`:937`)를 타서 `room_players` 행을 삭제하고 방을 종료할 뿐
**retire 처리를 하지 않으며 `p_retire_reason`을 읽지도 않는다.** 완주 기록은
`group_match_results`에 이미 있고 `where result_status <> 'finished'` 가드로 보호된다.
**방을 닫으려면 이 호출이 필요하다.**

**수정 (2026-08-29):** `pages/GroupGamePage.jsx:1267`·`:1434`·`:1491` 3줄을
`onClick={() => handleReturnToLobby("left")}`로 교체.

**세 분기 모두 `"left"`인 근거 (분기별 확인):**

| 줄 | phase | 도달 조건 | RPC 호출 여부 | reason 사용 여부 |
|---|---|---|---|---|
| `:1267` | FINISHED | `outcome === "finished"` ⟹ **완주자만** (`utils/onlineGameSession.js:152-157`) | 예 — `isFinishedExplicitLeave` | **미사용** (완주자 분기) |
| `:1434` | SPECTATING | FINISHED의 관전 버튼 또는 `viewMode === "spectating"` 복구 ⟹ **완주자만.** `send_group_spectator_emoji_v13`의 `SPECTATOR_FINISH_REQUIRED`도 같은 불변식을 강제한다 | 예 | **미사용** |
| `:1491` | ENDED | `room.status === 'finished'` ⟹ **완주 없이 종료된 경우를 포함한다** | **완주자만 호출.** 미완주자는 `shouldRetireGroupPlayer`가 false(방이 `finished`)이고 `isFinishedExplicitLeave`도 false라 **호출 자체가 없다** | **양쪽 다 미사용** |

즉 **세 곳 모두 reason이 도달 가능한 경로에서 실제로 쓰이지 않는다.** 그래도 `"left"`(게임 이탈)로
적는 이유는, `"forfeited"`(기권)가 완주자에게 **틀린 표현**이고 향후 이 값이 살아나는 리팩터에서
잘못된 라벨이 기록되지 않게 하기 위해서다. 라벨 대응은 `utils/groupResultFormatter.js:4-5`.
**`:1160`(ExitGuard, 경기 중 이탈)의 `"forfeited"`는 옳으므로 그대로 둔다.**

**남긴 것:** `handleReturnToLobby`의 기본값 `= "forfeited"`(`:1083`). 호출부 4곳이 전부 명시적이라
**도달 불가**가 됐지만, 직접 바인딩이 재발하면 여전히 SyntheticEvent가 들어와 가드에서
**소리 나게 실패한다** — 기본값을 바꿔도 그 보호는 달라지지 않으므로 범위 밖으로 뒀다.

**검증:** `npm test` **142/142 통과**, `npm run build` **exit 0** —
기준 커밋 `357a330`에 위 3줄만 얹은 상태에서 측정했다 (측정 시점은 커밋 전), 2026-08-29 `[산출물]`.

#### 5.5-5 `username-lookup` 404 — **종결. 결함이 아니다**

**404는 아이디 미존재 시의 의도된 응답이다** — `supabase/functions/username-lookup/index.ts:77-88`이
`{ok:false, error:"존재하지 않는 아이디입니다."}`와 함께 **명시적으로 HTTP 404**를 반환한다 `[코드]`.
프론트는 이미 이것을 처리한다 — `authContext.jsx:44-46`이 `operation === "username-lookup" &&
status === 404`를 `username-not-found`로 분류하고 "아이디 또는 비밀번호가 올바르지 않습니다."를
띄운다. 브라우저 콘솔의 `Failed to load resource: 404`는 **모든** 404에 찍히는 로그이며
함수 부재의 증거가 아니다.

**배포 증명은 로그인 성공 그 자체다.** `pages/LoginPage.jsx:157`은 `loginWithUsername`만 쓰고,
그 경로는 이 함수가 돌려주는 `syntheticEmail` 없이 `authContext.jsx:223-227`에서 반드시 실패한다.
이메일 로그인 대체 경로가 화면에 없다. **W9에서 로그인이 통과했으므로**(CUTOVER-LOG §W9 통과 표)
**이 함수는 배포돼 있고 동작한다.**

**U9(운영 배포 함수 목록 미확인)와는 별개 축이다.** U9는 §5.6-4(`target-level` 실물 확인)로 남지만
이 건이 그 근거는 아니었다. 운영 확인이 더 필요하면(사용자 수행): ① 존재하는 아이디 로그인 →
200이면 확인 — **이미 관측됨**, ② 응답 body 구분 — 배포됨은 위 한국어 문구, 미배포는 게이트웨이의
`{"code":"NOT_FOUND",...}`, ③ `supabase functions list --project-ref <ref>`.

#### 5.5-6 관전 이모티콘 — ~~스펙 위반 여부 미확정~~ → **스펙 범위 밖으로 종결 (2026-09-02)**

> **종결 판정** `[사용자 판정, 2026-09-02]`. 아래 조사가 근거다 — **스펙은 "완주 관전자만
> 전송 가능"만 규정하고 수신자를 규정하지 않는다.** 렌더 경로가 `SPECTATING` 분기 하나뿐이라는
> 사실은 확정이지만 **그것이 위반이라는 근거가 없다.** 테스터의 기대가 스펙보다 넓었던 건이다.
> **수신 범위를 넓힐지는 제품 판단이며 결함 수정이 아니다.**
> **관전자 2명 조건의 실제 전달 여부는 여전히 미검증이다** (§5.0 A3) — 아래 "확인 방법"이
> 그대로 쓰인다.

**확정된 것:** `visibleSpectatorEmojis`가 렌더되는 곳은 `pages/GroupGamePage.jsx:1379`
**단 한 곳**이고 `phase === SPECTATING` 분기 안이다. PLAYING 분기에는 이모티콘 렌더 코드가
**아예 없고** FINISHED 분기도 마찬가지다. 복원 effect도 `phase !== SPECTATING`이면 즉시 반환한다
(`:893`) `[코드]`. **즉 아직 달리고 있는 참가자는 수신 여부와 무관하게 볼 수 없다.**
4인 중 1명만 완주해 관전 중이었다면 렌더할 사람이 아무도 없다 — 관측과 일치한다.

**스펙 위반이 아닐 가능성이 크다.** `01-CONFIRMED-SPEC.md` §6.4와 `code/13-GROUP-FINAL-GAPS.md`
§2.3은 **"완주 관전자만 전송 가능"만 규정하고 수신자를 규정하지 않는다** `[문서]`. 항목 전체가
"관전과 소통" 아래에 있다. **테스터의 기대가 스펙보다 넓었던 건으로 보인다** — 제품 판단이 필요하다.

**미확정 — 관전자 ↔ 관전자 전달.** 경로는 코드상 정상으로 읽힌다: 송신은 `room_events` insert
(`20260814123000_group_spectator_emoji_atomicity_fix.sql:141`), 수신 구독은 phase와 무관하게 항상
등록되며(`GroupGamePage.jsx:747-760`), RLS SELECT는 같은 방 참가자면 통과한다
(`20260730170602_baseline_remote_schema.sql:1077`), publication 등재도 `:1194` + W7 확인.
**관전자가 1명뿐인 스모크로는 검증되지 않았다.**

**확인 방법 (운영 DB 접근 불필요):** 관전자 2명을 만든 뒤 A 전송 → B 실시간 확인 → B 새로고침 후
재진입. 복원 effect가 `room_events`를 REST로 조회하므로(`services/groupMultiplayerService.js:237-243`)
**새로고침 후엔 보이고 실시간엔 안 보이면 Realtime, 둘 다 안 보이면 insert/RLS, 둘 다 보이면
렌더 범위 문제만 남는다.**

#### 착수 순서 — ~~3 → 4 → 5 → 6~~ → ~~3 → 6~~ → **전부 소화됨 (2026-09-02)**

**실제로 이렇게 흘렀다:** 5(결함 아님) → 4(수정) → 3(§5.4-2 + §5.4-1 동시 적용,
한 번의 Edge Function 배포에 함께 실음) → **측정(W9-b)** → §5.4-3 **불필요 판정** →
6(스펙 범위 밖 종결). **§5.5-3의 재평가가 정한 3 내부 순서를 그대로 밟았고 결과가 맞았다.**

**다음 작업 목록은 이 절이 아니라 §5.0이다.**

**부수 관찰 (수정 대상 아님, CUTOVER-LOG §W9):** 문서 전환 애니메이션 없음(디자인 범위),
문서 전환 7~20초(발견 3과 같은 뿌리일 가능성),
대기실 "최대 6명" 표시 — **이것은 결함이 아니다.** `services/groupMultiplayerService.js:19`의
`createGroupRoom` 기본값이 `maxPlayers = 6`이고 Packet 13 제약은 `max_players between
min_players and 8`이므로 **6은 유효 범위 안**이다 `[코드, 2026-08-28 확인]`. 기본값을 8로 올릴지는
제품 판단이다.

### 5.6 창이 만든 문서 정합 작업

**2026-08-28에 저장소 전체를 훑어 "W6 이전 상태를 현재 사실로 단정하는 서술"을 조사했고,
2026-08-29에 정리를 끝냈다** `[산출물]`.

> **2026-09-02에 같은 종류의 정리가 한 번 더 필요했다.** 이번에 낡은 것은 "W6 이전"이 아니라
> **"게이트가 켜져 있다 / W10 미수행"** 을 현재 사실로 단정하는 서술이다. 대상은
> `AGENTS.md` §1.1(항목 2), `10-CODE-MASTER-TODO.md` §2(항목 9), 그리고 이 파일 자신이다.
> **교훈은 같다 — 상태가 바뀌면 그 상태를 인용한 문서가 전부 낡는다.**
> **남은 것은 여전히 운영 재조회가 필요한 2건(1·4)과 미작성 1건(8)이다.**

**적용한 원칙 — 문서 성격에 따라 방식을 나눴다:**

| 성격 | 방식 | 대상 |
|---|---|---|
| 현재 상태를 서술하는 문서 | **갱신** — 낡은 서술을 취소선으로 남기고 "언제까지 참이었고 무엇이 바꿨는지" 병기 | `AGENTS.md`, `CLAUDE_HANDOFF.md`, `10-CODE-MASTER-TODO.md` §2 |
| 특정 시점 판정을 담은 문서 | **봉인** — 서두에 시점·무효 사유 헤더, **본문 보존** | `WIKI_RACE_GROUP_DB_SECURITY_SPEC.md`, `qa/30` §21, `18-SERVER-AUTHORITY-V2-...md` |

**실행 기록은 지우지 않았다.** 낡았다는 사실이 드러나게만 했다.

| # | 항목 | 상태 |
|---|---|---|
| 2 | ~~`AGENTS.md` §1.1 근거 서술~~ | **완료 (2026-08-28) → 다시 갱신 (2026-09-02).** 2026-08-28에 근거를 "운영에 V2 RPC가 없다"에서 **"유지보수 게이트가 유일한 방패다"** 로 교체했는데, **W10이 그 게이트를 껐다.** 2026-09-02에 근거를 **"방패가 없다 — `main` push는 곧 사용자 노출이다"** 로 다시 썼다. **금지는 세 번 다 유지됐고 근거만 바뀌었다** (§3의 이력 상자) |
| **9** | **`10-CODE-MASTER-TODO.md` §2 판정 블록** | **완료 (2026-09-02).** 표 아래 블록이 "`RELEASE HOLD`는 유지되며 사유는 W9 미해결 4건 / 게이트가 켜진 채 / W10 미수행"으로 남아 있었다 — **세 문장 전부 더 이상 사실이 아니다.** 현재 사실로 교체하고 판정의 단일 기준이 이 파일 §1임을 유지했다. **표의 최종 갱신 날짜·기준 커밋도 함께 옮겼다** (`AGENTS.md` §6) |
| 5 | ~~`docs/CLAUDE_HANDOFF.md` 갱신~~ | **완료 (2026-08-29).** 보고한 9개 위치를 전부 교체하고 **§0.2에 "바뀐 지점" 표**를 신설했다. §3.1 제목·본문(함수 7→36, legacy RPC 0, 이력 12행), §1.4(Release A~D → U2), §3.2 판정(HOLD 사유 표로 전후 대비), §4.1·§4.2·§4.4(해소 항목 정리), **§4.5 신설**(창이 만든 미해결 4건 + 절차 공백 2건), §5(진입점 재작성). 근거는 전부 `CUTOVER-LOG-2026-08-27.md`의 단계로 명시. **2026-09-02 재갱신** — 서두 기준 커밋·`origin/main` 값, §0.2 §3.2 행, §4.1 `main` push 행, §4.5(4건 종결 블록 추가), §5 진입점 1·2번을 **게이트 해제 후 사실**로 옮겼다 |
| 7a | ~~`10-CODE-MASTER-TODO.md` §2~~ | **완료 (2026-08-29).** 순서 1 `[~]`→`[x]`, 순서 2 `[ ]`→`[x]`, 순서 8 `[ ]`→`[~]`. **표 머리에 "최종 갱신 날짜·기준 커밋·브랜치"를 넣었다** — 날짜 없는 상태표가 다시 생기지 않게 하는 것이 목적이다. "순서가 `[x]`라고 릴리스가 열린 것은 아니다"도 함께 |
| 6 | ~~`WIKI_RACE_GROUP_DB_SECURITY_SPEC.md`~~ | **완료 (2026-08-29) — 봉인.** 기존 stale 표기가 시간 규칙만 덮고 있었다. **운영 상태 축을 별도로 명시**했다: 적용 상태(`:6`·§4.1), §5.4 "현재 RLS 잠금 필요"(W7 `rls_off_tables = 0`), **§13의 `db push`·`migration repair` 금지 — 둘 다 2026-08-28에 건별 승인 아래 실행됐다** |
| 3 | ~~`qa/30-INTEGRATION-CHECKLIST.md` §21~~ | **완료 (2026-08-29) — 봉인.** `RELEASE HOLD` 판정은 유지하고 **사유가 바뀌었음**을 전후 표로 명시. 미체크 4항목이 창에서 어떻게 닫혔는지도 행별로 적었다. **2026-09-02 재갱신** — 봉인 헤더의 "`RELEASE HOLD` 판정 자체는 유지된다"가 낡아 **해제 행을 표에 추가**했다. **§22(새 게이트 기록) 작성은 여전히 미수행** |
| 7b | ~~`18-SERVER-AUTHORITY-V2-IMPLEMENTATION.md`~~ | **완료 (2026-08-29) — 봉인.** Release A~D가 U2로 대체되고 실제 절차가 `CUTOVER-PLAN` W0~W11이었음을 **파일 안에** 명시했다 — 그전에는 이 파일만 읽으면 알 수 없었다. `--prune` 금지·이름 명시 제약도 함께 |
| ~~**1**~~ | ~~**새 운영 스냅샷 `PROD-SNAPSHOT-YYYY-MM-DD.md` 작성**~~ | **완료 (2026-09-02) — `docs/ops/PROD-SNAPSHOT-2026-09-02.md`.** 08-20 대비 변화 5축(테이블 14→21, 함수 7→36, RLS off 2→0, **정책 29→33**, 이력 0→12)을 **migration별로 매핑**했고, 새 테이블 7개·정책 0개 테이블 7개·publication 미변화의 근거를 `[코드]`로 붙였다. 기존 파일은 **보존**했다. **남은 공백은 그 문서 §9** — 정책 **이름·술어**, 함수 이름 목록, 제약/ACL 대조가 이번 조회에 없었다 |
| **4** | **`target-level` Edge Function 존재 확인** | **미수행 — 운영 조회 필요.** §8.1-7. `--prune` 미사용은 확인됐으나 실물 확인은 안 했다 |
| 8 | `qa/30` §22 새 게이트 기록 작성 | 미수행. 창 결과를 체크리스트 형식으로 등재 (CUTOVER-PLAN §10.2) |

**그대로 둔 것 (날짜 있는 실행 기록):** `10-CODE-MASTER-TODO.md` §9.8,
`11-REPOSITORY-AUDIT.md` §21, `13-GROUP-FINAL-GAPS.md` §21의 `RELEASE HOLD` 판정줄.
**다만 `CLAUDE_HANDOFF.md` §3.2가 그중 둘을 "현재 판정"의 근거로 인용하던 것은 고쳤다** —
이제 판정의 현재 값은 이 파일 §1에서 읽고 그 문서들은 시점 기록으로만 읽도록 명시돼 있다.

**낡지 않은 것 (확인함):** `README.md` — 유지보수 게이트 절은 **특정 시점 상태를 단정하지 않는다.**
게이트를 켜고 끄는 방법만 적혀 있고, `:120`이 "점검 종료 시 `VITE_MAINTENANCE`를 **삭제하거나**
`false`로 바꾸고 다시 Redeploy"라고 **W10이 실제로 한 조작을 그대로 담고 있다** `[코드, 2026-09-02
재확인]`. **게이트 해제로도 낡지 않았다** — 상태가 아니라 절차를 적었기 때문이다.
`PROD-SNAPSHOT-2026-08-20.md` 본문 — 서두에 "특정 시점 관찰이며 변경 시 무효"가
이미 있어 **역사 기록으로 성립한다** (§6 문서 표에 무효 표기를 더했다).
`GROUP_SPECTATOR_MIGRATION.sql`·`onboarding_full_avatar`의 "미적용/미배포"는 **다른 사안**이다.

---

## 6. 참조 문서

| 문서 | 역할 |
|---|---|
| `AGENTS.md` | **상시 가드레일.** 세션마다 자동 로드. 운영 DB 변경·commit/push·임의 삭제 금지, 추측 금지, 수치 기재 규칙, 이 파일의 갱신 의무(§7) |
| `docs/agent/CURRENT.md` | **이 파일.** 지금 상태의 단일 기준. 판정·수치·다음 작업 |
| **`docs/agent/PACKET-CONTRACT-GAPS.md`** | **패킷 14~17 계약 고정의 작업 기준 (2026-09-02 신설).** 패킷 간 의존·공유 테이블·공유 화면, 계약 공백 **G1~G20**, **시안 78화면 × 10섹션 대조**, 오늘 3코스 전환 판정, **W0~W3 착수 순서**. **§5.0 C의 상세이며 패킷 작업을 시작하는 세션이 먼저 읽는다** |
| **`docs/agent/TRACKS.md`** | **병렬 트랙 파일 소유권의 단일 기준 (2026-09-02 신설).** 트랙 A~D의 **배타적 파일 화이트리스트**, 동결 파일 목록, 공유 위험 파일과 계약 유지 조건, migration 파일명 예약, **결과 화면·프로필 화면·공통 컴포넌트 겹침 판정**, **15a/15b 분리 판정**, **3코스 창 5항목 통합과 게이트 재판정**, 트랙별 티켓(목표·범위 밖·읽을 파일·건드릴 파일·수용조건·의존). **트랙을 시작하는 세션은 `PACKET-CONTRACT-GAPS.md` 다음에 읽는다** |
| **`docs/contracts/`** | **공통 계약 (2026-09-02 신설). C1~C5 + `README.md`.** 패킷 14~17이 공유하는 테이블 DDL·RPC 시그니처·RLS 방향·렌더 규칙. **소유자는 전부 `공통`이며 어느 패킷도 재정의하지 않는다.** `README.md`에 DDL·RPC·RLS 공통 규칙과 **계약별 창 필요 여부**가 있다 |
| **`docs/design/MOBILE-VALIDATION-CORRECTIONS.md`** | **모바일 시안 정정 기록 (2026-09-02 신설).** 시안이 "확정값의 변환, 새 기능 없음"을 선언했으나 어긋난 지점을 남긴다 — **시안 오류 6건**(순차 해제·XP 수치·칭호·그룹 2위 XP·슬롯 명칭, 그리고 **Freeze v1 내부 불일치 1건**)과 **범위 밖 1건**(`오늘의 발견`). **네 건 모두 Freeze v1 쪽이 확정값과 일치했다.** **시안 HTML은 수정하지 않았다** |
| `docs/design/*.html` | **시안 원본 2개** — Freeze v1 FINAL(78화면 요구사항)·Mobile Visual Validation v0.1. bundled 형식이라 원문 검색이 되지 않는다. **수정하지 않는다.** 확정값과의 차이는 위 정정 문서에서 읽는다 |
| `docs/ops/CUTOVER-PLAN.md` | **운영 cutover 실행 계획.** W0~W11 창 절차, 백업·삭제 전문, **롤백 판단 기준(§6.0)**·복원 절차(§6.3)·리허설 기록(§6.5), 창 전 선행 조건(§7), 창 후 검증(§8), 미결정 항목(§9), Release A~D 대체 매핑(§10). **창을 열기 전 §7을 이 문서 기준으로 점검한다.** 창 중 롤백 판단은 **§6.0만 펼치면 끝나도록** 쓰여 있다 |
| `docs/ops/wipe-public.sql` | **§6.3 2단계 실행 파일.** 실행은 `docker run --rm -i --entrypoint psql <승인이미지> "<CONN>" -v ON_ERROR_STOP=1 -f -`로 한다 (§6.3.0 A안 — 이 머신에 `psql`이 없다). `public`·`private` 스키마를 비우고 덤프가 담지 않는 스키마 속성 2건(owner, PUBLIC USAGE)을 복원한다. **파일 안에 자체 `begin;`/`commit;`이 있어 바깥에서 감싸도 롤백되지 않는다 — 시험 실행이라는 것이 없다** (§6.3.1-0) |
| `docs/ops/slice-public.awk` | **§6.3.3 (b) 대체 경로.** 전체 데이터 덤프에서 `public` COPY 블록만 남긴다. W2에서 `--schema public` 덤프를 떴다면 필요 없다 |
| `docs/ops/CUTOVER-LOG-TEMPLATE.md` | **창 기록 틀 (P12).** 창 당일 `docs/ops/CUTOVER-LOG-YYYY-MM-DD.md`로 **복사해서** 쓰고 원본은 남긴다. W0~W11 단계별 시각·판정, G1~G3 게이트, W2.5 측정값, W4~W9 결과, 롤백 시 트리거·등급·승인 시각·복원 소요, 창 후 이월을 빈칸으로 담았다 |
| **`docs/ops/CUTOVER-LOG-2026-08-27.md`** | **실제 창 실행 기록 (2026-08-27~28 창 + 창 밖 후속 ~2026-09-02).** W0~W11 단계별 결과, G1~G3 도달 시각, W2.5 실측값, W7 검증 전항목, **W9 결함 6건**, 2026-08-28의 W10 미수행 판정(보존), **창 밖 후속 §W1-b·§W8-b·§W9-b·§W10·§W11-b**, **§6 총평(계획 검증·수정 대상 7건·템플릿 개선안·§6.5 창의 최종 형태)**. **다음 창을 여는 세션은 §6 총평부터 읽는다 — 특히 §6.5** |
| `docs/CLAUDE_HANDOFF.md` | 배경 인계 문서. 확정 스펙 근거 매핑, 의도적 제외 vs 미구현 구분, 확인 필요 항목, 런타임 baseline 축의 성질. **2026-08-29에 창 결과를 반영했다 — 바뀐 지점은 §0.2, 창이 만든 미해결은 §4.5** |
| `docs/WIKI_RACE_GROUP_DB_SECURITY_SPEC.md` (봉인) · `wiki-race-2.0-handoff/code/18-...md` (봉인) · `qa/30-INTEGRATION-CHECKLIST.md` §21 (봉인) | **특정 시점 문서.** 2026-08-29에 서두 봉인 헤더를 붙였고 **본문은 보존했다.** 현재 사실의 근거로 인용하지 않는다 — 시점과 무효 사유는 각 헤더에 있다 |
| **`docs/ops/PROD-SNAPSHOT-2026-09-02.md`** | **운영 상태의 현재 기준 (2026-09-02 실측).** 테이블 21 / 함수 36 / **RLS 21/21 · 정책 33**(정책 0개 테이블 7) / publication 4 / 이력 12행 / users 145 · `game_records` 59. **08-20 대비 변화를 migration별로 매핑**했고, 정책 0개가 결함이 아니라 3계층 접근 설계라는 근거(`[코드]`)와 **publication 미변화가 향후 실시간 기능에 거는 선행 조건**을 담았다. **§4.2.1이 중요하다** — 저장소 파생이 두 시점에서 실측을 재현했으므로 **다음 조사는 운영 조회 없이 파생을 1차 근거로 쓸 수 있다**(성립 조건 3가지 포함). 남은 축은 §0.2·§9 |
| `docs/ops/PROD-SNAPSHOT-2026-08-20.md` | 운영 Supabase 읽기 전용 실측(2026-08-20). **⚠ 무효 — 2026-08-28 창이 무효화했고 2026-09-02 스냅샷이 대체했다.** **역사 기록으로만 읽는다.** 다만 **`avatars` 객체 실측(§4.1)과 런타임 17.6(§5)은 09-02에 재조회되지 않아 그쪽이 여전히 마지막 실측**이다 |
| `wiki-race-2.0-handoff/01-CONFIRMED-SPEC.md` | 게임 규칙 **단일 기준선**. 다른 문서와 충돌하면 이 문서 우선 |
| `wiki-race-2.0-handoff/code/10-CODE-MASTER-TODO.md` | 작업 순서·의존성·Packet 13 검증 이력(§9~§9.8) |
| `wiki-race-2.0-handoff/code/11-REPOSITORY-AUDIT.md` | 저장소 감사 결과와 보존 원칙 |
| `wiki-race-2.0-handoff/code/13-GROUP-FINAL-GAPS.md` | Packet 13 범위와 R~R3.2 판정 근거 |
| `wiki-race-2.0-handoff/code/18-SERVER-AUTHORITY-V2-IMPLEMENTATION.md` | Release A~D 절차와 cutover 주의사항. **artifact 분할은 U2로 대체됐다** — 대체 매핑은 CUTOVER-PLAN §10 |
| `wiki-race-2.0-handoff/code/14~17` | 미구현 패킷 계획(1:1 아이템, XP·레벨·랭킹, 업적·보상, 탐험·프로필·게스트) |
| `wiki-race-2.0-handoff/qa/30-INTEGRATION-CHECKLIST.md` | 통합 QA 체크리스트와 릴리스 게이트 기록 |
| `docs/WIKI_RACE_GROUP_DB_SECURITY_SPEC.md` | **stale.** 그룹 시간 규칙이 15분/3분으로 남아 있음. 확정값은 20분/2분 |
