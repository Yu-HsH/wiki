# 현재 상태 — Wiki Race 2.0

갱신 날짜: 2026-08-29
기준 커밋: `579a338` (`fix: bind group lobby-exit buttons so RETIRE reason is not a click event`)
이전 기준: `29a21d0`
브랜치: `feat/group-final-gaps`

> **`579a338`은 창 종료 이후 첫 코드 변경이다** (`pages/GroupGamePage.jsx` 3줄, W9 발견 4).
> 그 앞의 `29a21d0`·`357a330`은 문서 전용이었으므로 코드 기준선이 움직인 것은 여기서가 처음이다.

> **2026-08-27~28 cutover 창이 실행됐고 종료됐다.** W6(`db push --linked`)로 **운영 migration 11개
> 전량이 적용됐고**, W7 검증이 전항목 통과했으며, W8로 Edge Function 2개가 배포됐다.
> **W10(게이트 해제)은 수행하지 않았다** — W9에서 결함 6건이 나왔고 그중 4건이 미해결이다.
> **유지보수 게이트는 켜진 채다.** 실행 기록 전문: `docs/ops/CUTOVER-LOG-2026-08-27.md`.

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

### CODE GO — 기준 커밋 `579a338`

**유효 조건 (아래를 모두 만족하는 local/CI 환경에서만 유효)**

- 승인 이미지 `public.ecr.aws/supabase/postgres:17.6.1.158`, digest `sha256:99b1729aeb0bac314445024fc149fbd39306170b61dd50800ccf180327ab3459`
- Supabase CLI `2.114.0` (exact pin: `package.json` devDependencies)
- `npm run supabase:preflight` 통과 (image tag/ID/digest, migration history, RPC catalog/ACL, log 안정성)
- project/volume 격리 유지: `wiki-packet13-r2-clean158`

**즉시 무효화 조건**

- `.104` 이미지 또는 미승인 digest가 기본 경로로 선택되면 그 시점에 `CODE NO-GO`
- 운영 런타임은 이 고정 범위 **밖**이다. 이 판정은 운영 적용 근거가 아니다

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
> **그룹 경로는 풀리지 않았다** — 62요청이 참가자 수만큼 곱해져 4인 그룹에서 502가 재발한다
> (§5.5 발견 3). UA와 dedup만으로는 부족하다는 것이 창에서 실측됐다.

근거: `wiki-race-2.0-handoff/code/13-GROUP-FINAL-GAPS.md` §9·§21, `code/10-CODE-MASTER-TODO.md` §9.8

### RELEASE HOLD — 기준 커밋 `579a338`

**사용자-facing 릴리스는 여전히 보류다. 그러나 HOLD의 성격이 바뀌었다.**
2026-08-27~28 창이 **DB·배포 축을 전부 닫았고**, 남은 HOLD 사유는 **W9에서 발견된 결함 4건**뿐이다.
유지보수 게이트는 켜진 채이며 **사용자 노출은 0**이다 (최종 플레이 2026-08-04 `[실측]`).

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

#### 남은 HOLD 사유 — ~~W9 발견 4건~~ → **2건 (2026-08-29 조사 후)**

**2026-08-29 조사로 4건 중 2건이 닫혔다.** 5번은 결함이 아니었고, 4번은 코드 수정이 끝났다.
조사 근거는 §5.5, 수정 내역은 §4.

| # | 항목 | 상태 | 게이트 해제 차단? |
|---|---|---|---|
| **3** | **`wiki-snapshot` 502 대량 재발 (4인 그룹).** 준비 버튼 11회 연속 실패. **62요청 × 참가자 수**로 곱해지는 구조 | **미해결.** 원인 축은 확정. **단 곱셈의 성격이 §5.5에서 재확정됐다** — 대기실 경로는 문서가 전원 distinct라 스냅샷 재사용으로 풀리지 않는다 | **예** |
| **4** | ~~**"유효하지 않은 RETIRE 사유"** — 결과 화면에서 로비 나가기 실패~~ | **코드 수정 완료 (2026-08-29). 미배포.** 원인 확정 — RPC 계약 불일치가 **아니라** `onClick` 바인딩 버그였다 `[코드]`. §5.5-4 | **배포까지 예** |
| ~~5~~ | ~~**`username-lookup` 404**~~ | **종결 (2026-08-29) — 결함이 아니다.** 아이디 미존재 시의 **의도된 404 응답**이며 프론트가 이미 처리한다 `[코드]`. §5.5-5 | **아니오** |
| 6 | **관전 이모티콘이 다른 참가자에게 전달되지 않음** | **미해결.** publication은 4테이블로 정상 확인됨(W7 #5). **2026-08-29 조사에서 렌더 경로 부재가 확정됐고, 스펙 위반이 아닐 가능성이 크다** — §5.5-6 | 조사 필요 |

**W10 미수행 판정 근거:** 발견 3·4가 그룹 모드의 정상 이용을 막는다. 게이트를 해제하면 사용자가
준비 버튼 실패와 결과 화면 이탈 실패를 직접 만난다. **G3 경로(재개 포기, 게이트 켠 채 창 종료)를
채택했다** — CUTOVER-PLAN §6.0.2가 정의한 예정 경로이며 실패가 아니다.

> **2026-08-29 갱신.** 발견 4는 코드에서 고쳤지만 **아직 배포되지 않았다.** 운영에 배포된 번들은
> 여전히 결함을 갖고 있으므로 **위 판정은 그대로 유효하다.** 게이트 해제의 선행 조건은 이제
> **발견 3의 해결 + 발견 4 수정의 배포** 두 가지다.

#### 창이 닫지 않은 나머지

| 항목 | 상태 | 처리 위치 |
|---|---|---|
| publication 운영 대조 | **해소 (2026-08-21 실측 → 2026-08-28 W7 재확인).** 4테이블, `group_spectator_emoji_rate_limits` 미포함 | CUTOVER-PLAN §1.2, CUTOVER-LOG §W7 |
| `GRANT` 70행 운영 대조 | **해소 (2026-08-27 → 2026-08-28 W2 재확인). 차이 0건** — 운영 스키마 덤프와 baseline이 **바이트 단위 완전 동일**(md5 양쪽 `e2bfa805…`, 1563행). W2 덤프도 리허설 덤프와 바이트 동일 | CUTOVER-PLAN **§1.4**, CUTOVER-LOG §W2 |
| 운영 17.6 권한 거부 경로 SIGSEGV 검증 | **미실행.** W9에서 의도적 1회도 수행하지 않았다 | §8.2-1로 이월 |
| 실제 브라우저 1:1 2세션 수동 검증 | **미실행.** 4인 그룹은 실제로 돌렸다(발견 3·6의 관측 경로) | §8.2-2 |
| 모바일 viewport / 키보드 / reduced-motion 검증 | **미실행** | §8.2-4 |
| **새 운영 스냅샷** | **필수가 됐다.** `PROD-SNAPSHOT-2026-08-20.md`는 **이 창으로 무효다** — 함수 7→36, RLS 12/14→14/14, 이력 0→12행 | §8.2-6. 운영 재조회 필요 |
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
| `npm run supabase:preflight` | **11/11 PASS** | 2026-08-23 | `032caba` 실측. `postmaster-stability before == after`, restart 0/0 |
| log window self-test | **12/12 PASS** | 2026-08-23 | `032caba` 실측. `negative-postmaster-changed` 포함 |
| `npm run supabase:clean-gate` / `supabase:postgrest-smoke` 재실행 | 미확인 | — | `339fb77` 이후 재실행 기록 없음. `supabase:preflight`와 별개 스크립트다 |
| 운영 dry-run (`db push --dry-run --linked`) | **pending 11개, 순서 표와 완전 일치** | 2026-08-28 | 창 W5 `[사용자 보고]`. `--include-all` 미사용 |
| **운영 migration 적용 (`db push --linked`)** | **11/11 적용 성공, 오류 없음** | 2026-08-28 | 창 W6 `[사용자 보고]`. **소요 시간은 미기록** — 시작 21:47만 남았다 |
| **운영 적용 검증 (W7)** | **전항목 통과** — 함수 **36** / legacy RPC 2개 `null` / v13 제약 2개 `convalidated=true` / `rls_off_tables` **0** / publication **4테이블** / 이력 **12행** | 2026-08-28 | 창 W7 `[사용자 보고]` |
| 운영 스키마 덤프 ↔ baseline | **바이트 단위 동일** (41,399 B / 1,563행, md5 `e2bfa805…`) | 2026-08-28 | 창 W2 덤프를 로컬에서 재측정 `[산출물]`. W-1 리허설 덤프와도 동일 |

수치 출처: `wiki-race-2.0-handoff/code/10-CODE-MASTER-TODO.md` §9.8,
`test-results/packet13-b1/b1.3-2026-08-19T01-19-11-669Z-7c95d293/summary.json` (gitignore 대상 로컬 산출물),
`docs/ops/CUTOVER-PLAN.md` §7 P13, `docs/CLAUDE_HANDOFF.md` §3.2 "런타임 baseline 축의 성질".

---

## 3. 원격 상태

측정 시점: **2026-08-29, 로컬 HEAD `e272b44`** (`git ls-remote origin` 실측 `[산출물]`).
이전 측정: 2026-08-28 23:21, `4a78a0d` — 그때는 두 ref가 같은 커밋이었다.
아래 값은 **feat push 후 실측**이며 재측정 명령을 함께 적는다.

> **`main`과 `feat`가 갈라졌다 (2026-08-29).** 창 종료 후 처음이다.
> **차이는 정확히 5커밋 = 코드 1 + 문서 4**이고, `main` push를 보류했기 때문에 생긴 것이다.

| 항목 | 값 | 재측정 명령 |
|---|---|---|
| `origin/main` HEAD | **`4a78a0d`** — 2026-08-28 W1-a 이후 **움직이지 않았다.** `e6d8eee`에서 36커밋 앞 | `git ls-remote origin refs/heads/main` |
| `origin/feat/group-final-gaps` HEAD | **`e272b44`** — ~~`main`과 동일 값~~ → **`main`보다 5커밋 앞** | `git ls-remote origin refs/heads/feat/group-final-gaps` |
| 현재 브랜치 upstream | `origin/feat/group-final-gaps` (설정됨) | `git rev-parse --abbrev-ref "@{u}"` |
| upstream 대비 | **0 behind / 0 ahead** — push 완료 | `git rev-list --left-right --count "@{u}...HEAD"` |
| `origin/main...HEAD` | ~~0 behind / 0 ahead~~ → **0 behind / 5 ahead** | `git rev-list --left-right --count origin/main...HEAD` |
| `e6d8eee..HEAD` 커밋 수 | **41** (`e272b44` 기준, 2026-08-29 실측) | `git rev-list --count e6d8eee..HEAD` |
| `37adc69`·`450f63a`·`339fb77`·`f1e61fa`·`b24744e`·`032caba`·`be520c3` | `origin/main`·`origin/feat/group-final-gaps` **양쪽에 포함** | `git branch -r --contains <sha>` |

**`main`에 없는 5커밋 — 무엇이 미배포인가:**

| 커밋 | 성격 | 운영 영향 |
|---|---|---|
| `e272b44` | 문서 | 없음 |
| **`579a338`** | **코드 — `pages/GroupGamePage.jsx` 3줄** (`git diff --stat origin/main..HEAD` 실측) | **W9 발견 4(RETIRE) 수정이 운영에 없다** |
| `357a330` | 문서 | 없음 |
| `29a21d0` | 문서 | 없음 |
| `1599be9` | 문서 | 없음 |

**즉 운영 번들과 이 브랜치의 코드 차이는 `579a338` 하나뿐이다** (`git diff origin/main..HEAD`에서
`docs/`·`wiki-race-2.0-handoff/`·`AGENTS.md`를 빼면 그 파일 한 개만 남는다, 2026-08-29 실측
`[산출물]`).

**`main` push를 보류한 이유** `[사용자 결정, 2026-08-29]`: **`579a338`만 올려도 그룹 모드는 쓸 수
없다.** 발견 3(준비 버튼 502)이 미해결이라 **결과 화면까지 도달하지 못하므로** 이 수정이 고치는
지점에 사용자가 닿지 않는다. **발견 3 수정과 함께 한 번의 배포로 올리고 스모크도 한 번에 한다.**
→ **다음 `main` push의 묶음은 `579a338` + 발견 3 수정 + 그때까지의 문서다.**

`git ls-remote`는 원격을 직접 조회하므로 `fetch` 없이도 실제 값을 준다. 이 클론에는
`.git/FETCH_HEAD`가 없어 remote-tracking ref는 push 결과만 반영한다 — **`git status`의
ahead/behind만 믿지 말고 `ls-remote`로 대조한다.**

**`main`은 더 이상 5월 상태가 아니다.** 그룹 보안 하드닝, 서버 권위 V2, Packet 13, 유지보수 게이트,
2026-08-28 최소 수정 3건이 전부 들어 있고 Vercel 프로덕션에 배포된 상태다.
**사용자에게는 점검 화면만 보인다** — `VITE_MAINTENANCE=true`가 켜져 있기 때문이다 (W10 미수행).

### 2026-08-28 — 창 안 추가 `main` push (W1 이후 예외)

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

### `main` push 금지 — **금지 사유가 바뀌었다 (2026-08-28 창 이후)**

> **`AGENTS.md` §1.1도 2026-08-28에 같은 내용으로 갱신했다** (§5.6-2). 그 조항은 원래 "운영 DB에
> V2 RPC가 없으므로 main push가 즉시 장애를 만든다"를 근거로 삼았는데 **운영 DB에는 이제 그 RPC가
> 있다** (W6·W7). **금지는 유지되고 근거만 바뀌었다** — 아래와 같다. 두 문서가 어긋나면
> **상시 규칙인 `AGENTS.md`가 우선한다.**

**여전히 사실인 것**

- **`origin/main`은 Vercel 프로덕션 배포와 연동되어 있다. main push는 즉시 배포를 트리거한다.**
- 백업 push는 `origin/feat/group-final-gaps`로만 한다. Vercel Production Branch = `main`,
  Ignored Build Step = Automatic이므로(사용자 확인, 2026-08-20) 이 브랜치 push는 프로덕션 배포를
  만들지 않는다. preview 배포 생성 여부는 미확인.

**바뀐 것**

- **"미배포 RPC 호출" 위험은 해소됐다.** 운영 `public` 함수는 7개에서 **36개**가 됐고 legacy RPC
  2개는 삭제됐다 (W7). ~~`origin/main`과 `HEAD`가 같은 커밋이므로 프론트/DB 버전 어긋남도 없다.~~
  **2026-08-29부터 두 ref는 5커밋 갈라져 있다** (위 표). 다만 **DB 스키마를 건드리는 커밋은 없고**
  차이의 코드분은 `579a338`의 프론트 3줄뿐이므로 **프론트/DB 버전 어긋남은 여전히 없다.**
- **`PROD-SNAPSHOT-2026-08-20.md` §2의 "함수 7개 / V2 RPC 30개 부재"는 무효다.**

**새 금지 근거 — 지금 main push가 위험한 이유**

1. **유지보수 게이트가 유일한 방패다.** ~~W9 미해결 4건(발견 3·4·5·6)~~ →
   **2026-08-29 조사 후 발견 3·6이 남았고 발견 4는 수정됐으나 미배포다** (§5.5). 사용자를
   막고 있는 것은 `VITE_MAINTENANCE=true` 하나뿐이다. `VITE_*`는 **빌드 시점 인라인**이므로
   (F11) **게이트 값이 바뀐 상태에서의 push는 곧 서비스 오픈이다.**
2. **게이트 해제는 W10이고, W10은 별도 판단이다.** ~~발견 3·4~~ → **발견 3**이 해결되기 전의
   해제는 사용자가 **준비 버튼 실패**를 직접 만나는 결과가 된다. 발견 4는 코드에서는 고쳤지만
   **미배포이므로 지금 게이트를 열면 결과 화면 이탈 실패도 함께 노출된다.**

→ **결론: main push는 계속 건별 승인 대상이다.** 다만 승인 시 확인할 것이 "RPC가 있는가"에서
**"`VITE_MAINTENANCE`가 여전히 `true`인가"** 로 바뀌었다. 상시 규칙: `AGENTS.md` §1.1.

---

## 4. 진행 중인 작업

- **저장소 구조 정비 — 완료 (열거된 3건 기준).** (a) 상시 가드레일 `AGENTS.md` 분리, (b) 운영 실측
  `docs/ops/` 편입(`PROD-SNAPSHOT-2026-08-20.md`·`CUTOVER-PLAN.md`), (c) 이 파일 신설 — 3건 모두
  저장소에 존재한다 (2026-08-27 확인 `[산출물]`). **"구조 정비"의 추가 범위는 문서에 정의된 적이
  없으므로 이 항목은 원래 열거된 3건에 대해서만 완료로 판정한다.** 그 밖에 정비 대상이 있다면
  새 항목으로 세워야 한다.
- **유지보수 게이트 — 완료 (`b24744e`, 2026-08-21).** `utils/maintenanceGate.js`,
  `components/MaintenanceScreen.jsx`, `main.jsx` 분기. 계약은 `tests/maintenanceGate.test.js` 13개로
  고정, 사용법은 `README.md` §유지보수 게이트. 로컬 확인(점검 화면 렌더·`?bypass=` 진입·새로고침
  유지·`?bypass=off` 해제)까지 끝났다 (CUTOVER-PLAN §7 P1~P3). **W0에서 운영에 반영됐고
  (2026-08-27) 지금도 켜져 있다** — W10 미수행이므로 해제되지 않았다. Vercel Type은 `Secret`이
  아니라 **`Config`** 다 (`VITE_*`는 번들 인라인이라 Secret 저장이 거부된다).
- Packet 13은 커밋됨(`339fb77`). 코드 작업은 종료.
- **cutover 창 — 실행 완료, W10 미수행으로 종료 (2026-08-27~28).**
  W0~W9를 2세션으로 실행했다. **W6에서 migration 11개 전량 적용 성공, W7 전항목 통과,
  W8 Edge Function 2개 배포 성공.** W9에서 결함 6건이 나와 2건은 창 안에서 고쳤고
  **4건이 미해결이라 W10을 하지 않고 G3 경로로 창을 닫았다.** 롤백은 발생하지 않았다.
  실행 기록: **`docs/ops/CUTOVER-LOG-2026-08-27.md`**.
  ~~**다음 창의 범위는 W9 잔여 4건 + W10 하나다**~~ → **2026-08-29 조사로 4건 중 2건이 닫혔다.
  다음 창의 범위는 W9 잔여 2건(발견 3·6) + 발견 4 수정의 배포 + W10이다** (§5.5).
- **W9 발견 4 "유효하지 않은 RETIRE 사유" — 코드 수정 완료 (2026-08-29). 미배포.**
  `pages/GroupGamePage.jsx:1267`·`:1434`·`:1491` 3줄을
  `onClick={() => handleReturnToLobby("left")}`로 교체했다. 원인은 RPC 계약 불일치가 아니라
  **`onClick` 직접 바인딩으로 React SyntheticEvent가 첫 인자에 들어간 것**이었다.
  분기별 근거·불변식·`"left"` 선택 이유는 **§5.5-4**.
  `npm test` **142/142**, `npm run build` **exit 0** —
  기준 커밋 `357a330`에 이 3줄만 얹은 상태에서 측정했다 (측정 시점은 커밋 전), 2026-08-29 `[산출물]`.
  **게이트 해제 전에 배포돼야 한다** — 운영 번들은 아직 결함을 갖고 있다.
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
| 1 | **스냅샷 재사용 (조기 반환)** | **최대 레버리지지만 로직 변경**이다. 최소 수정 범위 밖 | `wiki_page_snapshots`에 `(page_id, revision_id)` unique가 있고 RPC가 upsert다. 재방문 시 78 → 1~2건 |
| 2 | **`fetchRevisionIds` 제거** | **테스트가 계약으로 고정 중이다** — `tests/serverAuthorityMigration.test.js:62-63`이 `fetchRevisionIds`와 `targetRevisionId: targetRevisionIds.get`를 match한다. 제거는 고정된 계약의 변경이다 | 요청 30건 축소. `wiki_snapshot_links.target_revision_id`는 nullable |
| 3 | **429 재시도·백오프** | **요청 62건이 남은 상태에서는 실행 예산을 태운다.** 요청 수를 먼저 줄여야 의미가 있다 | 넣는다면 `wikiJson` 한 곳. `Retry-After` 존중. 선례는 `scripts/verifyWikiLinks.mjs:23-43` |
| 4 | **상태코드 분리 / 프론트 에러 메시지** | 별도 작업 | 지금은 상위 rate limit과 `WIKI_PAGE_INVALID`가 **둘 다 502**다. 프론트는 `FunctionsHttpError`의 고정 영문 문구를 그대로 노출하고 `error.context`의 `code`를 읽지 않는다 (`services/wikiSnapshotService.js:42`) |
| 5 | **`config.toml`의 `[functions.wiki-snapshot]`** | 별도 판단 | 선언이 없어 `verify_jwt`가 **기본 true**로 배포된다. `single-run`만 F20으로 고정돼 있다 (`supabase/config.toml:423-424`) |

**B2 로컬 검증 경로** (§5.3의 B2와 같은 항목이다. 2026-08-28 실측):
로컬 `supabase_edge_runtime_*` 컨테이너는 `Exited (255)` 상태이고 `deno`는 PATH에 없다.
1단계는 Docker 없이 가능하다 — 실제 Wikipedia에 대고 `extractBodyLinks`·배치 수를 재는 독립
하네스이며, 78건·dedup 등가성이 이 방식으로 측정됐다. 2단계는
`npx supabase functions serve wiki-snapshot`으로 fixture 없이 전 경로를 태우는 것이다.
**어느 쪽도 `npm test`에 넣지 않는다** — 3자 API를 실제로 호출하므로
`verifyWikiLinks.mjs`처럼 명시 실행 스크립트여야 한다.

### 5.5 ~~W9 미해결 4건~~ → **남은 2건 (2026-08-29 조사 완료)**

2026-08-27~28 창의 W9에서 결함 6건이 나왔다. 2건은 창 안에서 고쳤고(`be520c3`) 4건이 남았다.
**2026-08-29에 그 4건을 전부 코드에서 조사했다** `[코드]`. **5번은 결함이 아니었고 4번은 고쳤다.
남은 것은 3번과 6번이며, 게이트 해제를 실제로 막는 것은 3번뿐이다.**
전문·발견 순서·통과 항목은 `docs/ops/CUTOVER-LOG-2026-08-27.md` §W9.

| # | 항목 | 관측 | 원인 | 해제 차단 |
|---|---|---|---|---|
| **3** | **`wiki-snapshot` 502 대량 재발 (4인 그룹)** | 준비 버튼 **11회 연속 실패** | **구조 확정.** 문서 1건당 **62요청**이 **참가자 수만큼 곱해진다.** **아래 5.5-3에서 곱셈의 성격이 두 갈래로 갈라졌다** | **예** |
| **4** | ~~**"유효하지 않은 RETIRE 사유"**~~ | 결과 화면에서 로비 나가기 실패 | **확정 → 수정 완료 (2026-08-29). 미배포.** 아래 5.5-4 | **배포까지 예** |
| ~~5~~ | ~~**`username-lookup` 404**~~ | — | **결함 아님 → 종결 (2026-08-29).** 아래 5.5-5 | **아니오** |
| 6 | **관전 이모티콘이 다른 참가자에게 전달되지 않음** | — | **구조는 확정, 결함 여부는 미확정.** 아래 5.5-6 | 조사 필요 |

#### 5.5-3 `wiki-snapshot` 502 — **§5.4-1이 이 증상을 못 고친다**

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

#### 5.5-4 "유효하지 않은 RETIRE 사유" — **수정 완료, 미배포**

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

#### 5.5-6 관전 이모티콘 — **렌더 경로 부재 확정. 스펙 위반 여부는 미확정**

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

#### 착수 순서 — ~~3 → 4 → 5 → 6~~ → **3 → 6 (2026-08-29 갱신)**

4는 끝났고(배포 대기) 5는 결함이 아니었다. **남은 순서는 3 → 6이며 게이트 해제를 실제로
막는 것은 3뿐이다.** 6은 재검증에 관전자 2명이 필요해 3의 해결이 선행돼야 하므로 순서상 뒤다.
3 내부 순서는 위 5.5-3의 재평가대로 **§5.4-2 → §5.4-1 동시 → 측정 → §5.4-3**이며,
2와 1은 같은 파일이라 **한 번의 Edge Function 배포에 함께 싣는다.**

**부수 관찰 (수정 대상 아님, CUTOVER-LOG §W9):** 문서 전환 애니메이션 없음(디자인 범위),
문서 전환 7~20초(발견 3과 같은 뿌리일 가능성),
대기실 "최대 6명" 표시 — **이것은 결함이 아니다.** `services/groupMultiplayerService.js:19`의
`createGroupRoom` 기본값이 `maxPlayers = 6`이고 Packet 13 제약은 `max_players between
min_players and 8`이므로 **6은 유효 범위 안**이다 `[코드, 2026-08-28 확인]`. 기본값을 8로 올릴지는
제품 판단이다.

### 5.6 창이 만든 문서 정합 작업

**2026-08-28에 저장소 전체를 훑어 "W6 이전 상태를 현재 사실로 단정하는 서술"을 조사했고,
2026-08-29에 정리를 끝냈다** `[산출물]`. **문서 정리는 완료다. 남은 것은 운영 재조회가 필요한
2건뿐이다.**

**적용한 원칙 — 문서 성격에 따라 방식을 나눴다:**

| 성격 | 방식 | 대상 |
|---|---|---|
| 현재 상태를 서술하는 문서 | **갱신** — 낡은 서술을 취소선으로 남기고 "언제까지 참이었고 무엇이 바꿨는지" 병기 | `AGENTS.md`, `CLAUDE_HANDOFF.md`, `10-CODE-MASTER-TODO.md` §2 |
| 특정 시점 판정을 담은 문서 | **봉인** — 서두에 시점·무효 사유 헤더, **본문 보존** | `WIKI_RACE_GROUP_DB_SECURITY_SPEC.md`, `qa/30` §21, `18-SERVER-AUTHORITY-V2-...md` |

**실행 기록은 지우지 않았다.** 낡았다는 사실이 드러나게만 했다.

| # | 항목 | 상태 |
|---|---|---|
| 2 | ~~`AGENTS.md` §1.1 근거 서술~~ | **완료 (2026-08-28).** 금지 근거를 "운영에 V2 RPC가 없다"에서 **"유지보수 게이트가 유일한 방패이고 W9 미해결 4건이 그 뒤에 있다"** 로 교체. §1에 "창의 승인은 그 창에서 끝났다", 기준 문서 목록에 경고 |
| 5 | ~~`docs/CLAUDE_HANDOFF.md` 갱신~~ | **완료 (2026-08-29).** 보고한 9개 위치를 전부 교체하고 **§0.2에 "바뀐 지점" 표**를 신설했다. §3.1 제목·본문(함수 7→36, legacy RPC 0, 이력 12행), §1.4(Release A~D → U2), §3.2 판정(HOLD 사유 표로 전후 대비), §4.1·§4.2·§4.4(해소 항목 정리), **§4.5 신설**(창이 만든 미해결 4건 + 절차 공백 2건), §5(진입점 재작성). 근거는 전부 `CUTOVER-LOG-2026-08-27.md`의 단계로 명시 |
| 7a | ~~`10-CODE-MASTER-TODO.md` §2~~ | **완료 (2026-08-29).** 순서 1 `[~]`→`[x]`, 순서 2 `[ ]`→`[x]`, 순서 8 `[ ]`→`[~]`. **표 머리에 "최종 갱신 날짜·기준 커밋·브랜치"를 넣었다** — 날짜 없는 상태표가 다시 생기지 않게 하는 것이 목적이다. "순서가 `[x]`라고 릴리스가 열린 것은 아니다"도 함께 |
| 6 | ~~`WIKI_RACE_GROUP_DB_SECURITY_SPEC.md`~~ | **완료 (2026-08-29) — 봉인.** 기존 stale 표기가 시간 규칙만 덮고 있었다. **운영 상태 축을 별도로 명시**했다: 적용 상태(`:6`·§4.1), §5.4 "현재 RLS 잠금 필요"(W7 `rls_off_tables = 0`), **§13의 `db push`·`migration repair` 금지 — 둘 다 2026-08-28에 건별 승인 아래 실행됐다** |
| 3 | ~~`qa/30-INTEGRATION-CHECKLIST.md` §21~~ | **완료 (2026-08-29) — 봉인.** `RELEASE HOLD` 판정은 유지하고 **사유가 바뀌었음**을 전후 표로 명시. 미체크 4항목이 창에서 어떻게 닫혔는지도 행별로 적었다. **§22(새 게이트 기록) 작성은 여전히 미수행** |
| 7b | ~~`18-SERVER-AUTHORITY-V2-IMPLEMENTATION.md`~~ | **완료 (2026-08-29) — 봉인.** Release A~D가 U2로 대체되고 실제 절차가 `CUTOVER-PLAN` W0~W11이었음을 **파일 안에** 명시했다 — 그전에는 이 파일만 읽으면 알 수 없었다. `--prune` 금지·이름 명시 제약도 함께 |
| **1** | **새 운영 스냅샷 `PROD-SNAPSHOT-YYYY-MM-DD.md` 작성** | **미수행 — 운영 재조회 필요.** `PROD-SNAPSHOT-2026-08-20.md`가 무효다(함수 7→36, RLS 12/14→14/14, 이력 0→12행). 기존 파일은 **보존**한다 |
| **4** | **`target-level` Edge Function 존재 확인** | **미수행 — 운영 조회 필요.** §8.1-7. `--prune` 미사용은 확인됐으나 실물 확인은 안 했다 |
| 8 | `qa/30` §22 새 게이트 기록 작성 | 미수행. 창 결과를 체크리스트 형식으로 등재 (CUTOVER-PLAN §10.2) |

**그대로 둔 것 (날짜 있는 실행 기록):** `10-CODE-MASTER-TODO.md` §9.8,
`11-REPOSITORY-AUDIT.md` §21, `13-GROUP-FINAL-GAPS.md` §21의 `RELEASE HOLD` 판정줄.
**다만 `CLAUDE_HANDOFF.md` §3.2가 그중 둘을 "현재 판정"의 근거로 인용하던 것은 고쳤다** —
이제 판정의 현재 값은 이 파일 §1에서 읽고 그 문서들은 시점 기록으로만 읽도록 명시돼 있다.

**낡지 않은 것 (확인함):** `README.md` — 유지보수 게이트 절이 게이트가 켜져 있는 현재 상태와
일치한다. `PROD-SNAPSHOT-2026-08-20.md` 본문 — 서두에 "특정 시점 관찰이며 변경 시 무효"가
이미 있어 **역사 기록으로 성립한다** (§6 문서 표에 무효 표기를 더했다).
`GROUP_SPECTATOR_MIGRATION.sql`·`onboarding_full_avatar`의 "미적용/미배포"는 **다른 사안**이다.

---

## 6. 참조 문서

| 문서 | 역할 |
|---|---|
| `AGENTS.md` | **상시 가드레일.** 세션마다 자동 로드. 운영 DB 변경·commit/push·임의 삭제 금지, 추측 금지, 수치 기재 규칙, 이 파일의 갱신 의무(§7) |
| `docs/agent/CURRENT.md` | **이 파일.** 지금 상태의 단일 기준. 판정·수치·다음 작업 |
| `docs/ops/CUTOVER-PLAN.md` | **운영 cutover 실행 계획.** W0~W11 창 절차, 백업·삭제 전문, **롤백 판단 기준(§6.0)**·복원 절차(§6.3)·리허설 기록(§6.5), 창 전 선행 조건(§7), 창 후 검증(§8), 미결정 항목(§9), Release A~D 대체 매핑(§10). **창을 열기 전 §7을 이 문서 기준으로 점검한다.** 창 중 롤백 판단은 **§6.0만 펼치면 끝나도록** 쓰여 있다 |
| `docs/ops/wipe-public.sql` | **§6.3 2단계 실행 파일.** 실행은 `docker run --rm -i --entrypoint psql <승인이미지> "<CONN>" -v ON_ERROR_STOP=1 -f -`로 한다 (§6.3.0 A안 — 이 머신에 `psql`이 없다). `public`·`private` 스키마를 비우고 덤프가 담지 않는 스키마 속성 2건(owner, PUBLIC USAGE)을 복원한다. **파일 안에 자체 `begin;`/`commit;`이 있어 바깥에서 감싸도 롤백되지 않는다 — 시험 실행이라는 것이 없다** (§6.3.1-0) |
| `docs/ops/slice-public.awk` | **§6.3.3 (b) 대체 경로.** 전체 데이터 덤프에서 `public` COPY 블록만 남긴다. W2에서 `--schema public` 덤프를 떴다면 필요 없다 |
| `docs/ops/CUTOVER-LOG-TEMPLATE.md` | **창 기록 틀 (P12).** 창 당일 `docs/ops/CUTOVER-LOG-YYYY-MM-DD.md`로 **복사해서** 쓰고 원본은 남긴다. W0~W11 단계별 시각·판정, G1~G3 게이트, W2.5 측정값, W4~W9 결과, 롤백 시 트리거·등급·승인 시각·복원 소요, 창 후 이월을 빈칸으로 담았다 |
| **`docs/ops/CUTOVER-LOG-2026-08-27.md`** | **실제 창 실행 기록 (2026-08-27~28).** W0~W9 단계별 결과, G1~G3 도달 시각, W2.5 실측값, W7 검증 전항목, **W9 결함 6건**, W10 미수행 판정 근거, **§6 총평(계획 검증·수정 대상 5건·템플릿 개선안)**. **다음 창을 여는 세션은 §6 총평부터 읽는다** |
| `docs/CLAUDE_HANDOFF.md` | 배경 인계 문서. 확정 스펙 근거 매핑, 의도적 제외 vs 미구현 구분, 확인 필요 항목, 런타임 baseline 축의 성질. **2026-08-29에 창 결과를 반영했다 — 바뀐 지점은 §0.2, 창이 만든 미해결은 §4.5** |
| `docs/WIKI_RACE_GROUP_DB_SECURITY_SPEC.md` (봉인) · `wiki-race-2.0-handoff/code/18-...md` (봉인) · `qa/30-INTEGRATION-CHECKLIST.md` §21 (봉인) | **특정 시점 문서.** 2026-08-29에 서두 봉인 헤더를 붙였고 **본문은 보존했다.** 현재 사실의 근거로 인용하지 않는다 — 시점과 무효 사유는 각 헤더에 있다 |
| `docs/ops/PROD-SNAPSHOT-2026-08-20.md` | 운영 Supabase 읽기 전용 실측(2026-08-20). **⚠ 무효 — 2026-08-28 창이 이 문서를 무효화했다** (CUTOVER-PLAN §8.2-6). 함수 7→36, RLS 12/14→14/14, 이력 0→12행. **역사 기록으로만 읽고 현재 상태의 근거로 쓰지 않는다.** 새 날짜 스냅샷 작성은 §5.6-1 |
| `wiki-race-2.0-handoff/01-CONFIRMED-SPEC.md` | 게임 규칙 **단일 기준선**. 다른 문서와 충돌하면 이 문서 우선 |
| `wiki-race-2.0-handoff/code/10-CODE-MASTER-TODO.md` | 작업 순서·의존성·Packet 13 검증 이력(§9~§9.8) |
| `wiki-race-2.0-handoff/code/11-REPOSITORY-AUDIT.md` | 저장소 감사 결과와 보존 원칙 |
| `wiki-race-2.0-handoff/code/13-GROUP-FINAL-GAPS.md` | Packet 13 범위와 R~R3.2 판정 근거 |
| `wiki-race-2.0-handoff/code/18-SERVER-AUTHORITY-V2-IMPLEMENTATION.md` | Release A~D 절차와 cutover 주의사항. **artifact 분할은 U2로 대체됐다** — 대체 매핑은 CUTOVER-PLAN §10 |
| `wiki-race-2.0-handoff/code/14~17` | 미구현 패킷 계획(1:1 아이템, XP·레벨·랭킹, 업적·보상, 탐험·프로필·게스트) |
| `wiki-race-2.0-handoff/qa/30-INTEGRATION-CHECKLIST.md` | 통합 QA 체크리스트와 릴리스 게이트 기록 |
| `docs/WIKI_RACE_GROUP_DB_SECURITY_SPEC.md` | **stale.** 그룹 시간 규칙이 15분/3분으로 남아 있음. 확정값은 20분/2분 |
