# 현재 상태 — Wiki Race 2.0

갱신 날짜: 2026-08-27
기준 커밋: `4840ec4` (`docs: frame G2 as a hand-off point and make P10 measurement-led`)
브랜치: `feat/group-final-gaps`

이 파일이 **"지금 상태"의 단일 기준**이다. `docs/CLAUDE_HANDOFF.md`는 배경 문서(전체 인계 정보)이고,
상시 금지·의무 사항은 `AGENTS.md`에 있다. 수치는 저장소 기록과 실측에서 그대로 옮겼고,
확인되지 않은 것은 `미확인`으로 둔다.

**갱신 규칙:** 커밋을 만든 세션이 이 파일의 기준 커밋·갱신 날짜를 같은 커밋 또는 직후 커밋에서
갱신한다 (`AGENTS.md` §7). 갱신 커밋은 자신의 해시를 담을 수 없으므로 **기준 커밋이 그 갱신
커밋의 부모인 상태가 정상이다** — 그 한 커밋 차이는 뒤처진 것이 아니다. 이 갱신 커밋은 문서만
변경하므로 아래 수치의 기준을 바꾸지 않는다.

---

## 1. 판정

### CODE GO — 기준 커밋 `4840ec4`

**유효 조건 (아래를 모두 만족하는 local/CI 환경에서만 유효)**

- 승인 이미지 `public.ecr.aws/supabase/postgres:17.6.1.158`, digest `sha256:99b1729aeb0bac314445024fc149fbd39306170b61dd50800ccf180327ab3459`
- Supabase CLI `2.114.0` (exact pin: `package.json` devDependencies)
- `npm run supabase:preflight` 통과 (image tag/ID/digest, migration history, RPC catalog/ACL, log 안정성)
- project/volume 격리 유지: `wiki-packet13-r2-clean158`

**즉시 무효화 조건**

- `.104` 이미지 또는 미승인 digest가 기본 경로로 선택되면 그 시점에 `CODE NO-GO`
- 운영 런타임은 이 고정 범위 **밖**이다. 이 판정은 운영 적용 근거가 아니다

**이전 판정 기준(`339fb77`) 이후의 코드 변경분.** 비문서 변경은 **유지보수 게이트 하나뿐**이다 —
`utils/maintenanceGate.js`, `components/MaintenanceScreen.jsx`, `main.jsx`, `appStyles.js`,
`tests/maintenanceGate.test.js`, `.env.example`, `.gitignore`, `README.md`, `AGENTS.md`
(`git diff --name-only 339fb77..HEAD`, 2026-08-27 `[산출물]`). 나머지 커밋은 `docs/`와
`wiki-race-2.0-handoff/` 문서이며, `b24744e` 이후 비문서 변경은 없다. 게이트는 `npm test` 142/142와 `npm run build` 성공으로 덮였고,
`032caba` 기준 `npm run supabase:preflight` 11/11로 런타임 축이 재확인됐다 (§2).

근거: `wiki-race-2.0-handoff/code/13-GROUP-FINAL-GAPS.md` §9·§21, `code/10-CODE-MASTER-TODO.md` §9.8

### RELEASE HOLD — 기준 커밋 `4840ec4`

사용자-facing 릴리스는 보류다. **절차는 `docs/ops/CUTOVER-PLAN.md`(W0~W11)로 확정됐고, 남은 것은
실행과 승인이다.** 각 항목의 처리 위치를 함께 적는다:

| 항목 | 상태 | 처리 위치 |
|---|---|---|
| 운영/linked DB migration 적용 | **미적용** (11개, CLI push 이력 없음) | W3~W7. 목록·순서는 §3.2 W5 |
| Edge Function 배포 (`wiki-snapshot`, `single-run`) | **미배포** | W8 고정. 선배포(A5)는 기각 |
| 운영 dry-run | **미실행** | W5 (`db push --dry-run --linked`) |
| Release A~D 승인 | **분할 자체가 대체됐다** — U2로 미적용 11개를 한 창에서 전량 적용. 창 실행 승인은 **미완** | 대체 매핑 §10 |
| baseline 처리 (`schema_migrations` 부재) | **판단·절차 확정.** `repair --status applied 20260730170602`, 4개 축 차이 0건(§5.1-1), `repair` 동작은 U12로 실측 해소. **실행 승인 대기** | W3~W4 |
| publication 운영 대조 | **해소 (2026-08-21 실측).** 4테이블 baseline과 완전 일치, 드리프트 없음 | CUTOVER-PLAN §1.2 |
| `GRANT` 70행 운영 대조 | **미실행.** 드리프트 시 런타임 권한 거부로만 나타난다 | U5 → P7 (W-1 리허설 덤프) |
| 운영 17.6 권한 거부 경로 SIGSEGV 검증 | **미실행.** 로컬 게이트로 대체 불가 | U6 — W9에서 의도적 1회 + §8.2-1 사후 관측. 창을 막지 않음 |
| `finish_group_player` 삭제에 따른 배포 순서 | **설계됨.** 삭제는 W6(`20260814093000`) 안에서 일어나고, 순서는 W0(게이트 on) → W1(main push·배포) → W6이다. 구버전 세션 drain은 유지보수 게이트가 담당(U3) | §2.1, §3.2 |
| V2 이전 3개 migration(8/4·8/7·8/13) | **범위·순서 확정.** 11개 전량 적용 집합에 포함되고 W5가 목록을 검증한다. Phase 2C의 `user_profile_stats` 전량 재집계는 F8·§5.4로 검토됐다. **phase1·phase2a의 개별 영향도 문서는 없다** | §3.2 W5, §5.4 |
| 실제 브라우저 1:1 2세션 수동 검증 | **미실행** | W9-4 + §8.2-2 |
| 모바일 viewport / 키보드 / reduced-motion 검증 | **미실행** | §8.2-4 |
| **롤백 판단 기준 (P11)** | **확정 (2026-08-27).** 원칙 4가지, 시각 게이트 3개(G1 +60분 / G2 +85분 / G3 +120분), W6·W7·W9 단계별 트리거 등급표 | CUTOVER-PLAN **§6.0** |
| **§6.3 전체 복원 절차** | **확정·리허설 완료 (2026-08-27, 로컬).** 비우기 SQL 확정, 복원 결과 지문 차이 0건, DB 작업 4.4초 실측. **운영 실행 권한은 여전히 미검증** | CUTOVER-PLAN **§6.3**·**§6.5** |
| **W2.5 삭제의 성격** | **뒤집혔다 (2026-08-27 실측).** 기존 "삭제를 건너뛰어도 migration은 실패하지 않는다"는 **틀렸다** — `w6_blocking_rows > 0`이면 W6가 #10에서 실패한다 | CUTOVER-PLAN **§5.3-0**·F15a·§6.5.3 |
| **창 전 선행 조건 (P1~P13)** | **10/13 완료.** 남은 것은 **P4·P5·P7 3건**이며 전부 운영·외부 확인이다 — P4는 창 당일, P5·P7은 전날. **저장소 안에서 처리할 수 있는 항목은 없다** | CUTOVER-PLAN §7. 목록은 §5.2 |

근거: `docs/ops/CUTOVER-PLAN.md` §1·§7·§8·§9·§10,
`docs/ops/PROD-SNAPSHOT-2026-08-20.md` §6·§7·§8,
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
| pgTAP Packet 13 | 33/33 | 2026-08-18 | `339fb77` 이전 |
| pgTAP spectator emoji atomicity | 22/22 | 2026-08-18 | `339fb77` 이전 |
| pgTAP Server Authority V2 | 97/97 | 2026-08-18 | `339fb77` 이전 |
| pgTAP Phase 2C | 49/49 | 2026-08-18 | `339fb77` 이전 |
| deterministic concurrency | 6 시나리오 × 3회 PASS | 2026-08-18 | `339fb77` 이전 |
| crash regression | 4종 PASS | 2026-08-18 | `339fb77` 이전 |
| production build (`npm run build`) | PASS (약 689KB chunk 경고) | 2026-08-18 | `339fb77` 이전 |
| production build (`npm run build`) | **PASS** | 2026-08-21 | `b24744e` 실측. **커밋 기준 재실행 완료** — CUTOVER-PLAN §7 P13 |
| `npm run supabase:preflight` | **11/11 PASS** | 2026-08-23 | `032caba` 실측. `postmaster-stability before == after`, restart 0/0 |
| log window self-test | **12/12 PASS** | 2026-08-23 | `032caba` 실측. `negative-postmaster-changed` 포함 |
| `npm run supabase:clean-gate` / `supabase:postgrest-smoke` 재실행 | 미확인 | — | `339fb77` 이후 재실행 기록 없음. `supabase:preflight`와 별개 스크립트다 |
| 운영 dry-run | 미확인 | — | 미실행 (W5) |

수치 출처: `wiki-race-2.0-handoff/code/10-CODE-MASTER-TODO.md` §9.8,
`test-results/packet13-b1/b1.3-2026-08-19T01-19-11-669Z-7c95d293/summary.json` (gitignore 대상 로컬 산출물),
`docs/ops/CUTOVER-PLAN.md` §7 P13, `docs/CLAUDE_HANDOFF.md` §3.2 "런타임 baseline 축의 성질".

---

## 3. 원격 상태

측정 시점: **2026-08-27, 로컬 HEAD `4840ec4`.** 아래 값은 그 시점 실측이며 재측정 명령을 함께 적는다.

| 항목 | 값 | 재측정 명령 |
|---|---|---|
| `origin/main` HEAD | `e6d8eee` ("0529백업") — **변경 없음** | `git ls-remote origin refs/heads/main` |
| `origin/feat/group-final-gaps` HEAD | push 전 원격 값은 `77094d1` (`git ls-remote` 실측 2026-08-27). 이 파일의 갱신 커밋은 같은 push에 포함되므로 **push 후 값은 그 커밋이다** | `git ls-remote origin refs/heads/feat/group-final-gaps` |
| 현재 브랜치 upstream | `origin/feat/group-final-gaps` (설정됨) | `git rev-parse --abbrev-ref "@{u}"` |
| upstream 대비 | 0 behind / 0 ahead (push 직후) | `git rev-list --left-right --count "@{u}...HEAD"` |
| `origin/main...HEAD` | 0 behind / **24 ahead** (`4840ec4` 기준, 2026-08-27 실측. 이 파일의 갱신 커밋을 더하면 25) | `git rev-list --left-right --count origin/main...HEAD` |
| `37adc69`·`450f63a`·`339fb77`·`f1e61fa`·`b24744e`·`032caba` | `origin/feat/group-final-gaps`에 **포함**, `origin/main`에는 **미포함** | `git branch -r --contains <sha>` |

`git ls-remote`는 원격을 직접 조회하므로 `fetch` 없이도 실제 값을 준다. 이 클론에는
`.git/FETCH_HEAD`가 없어 remote-tracking ref는 push 결과만 반영한다 — **`git status`의
ahead/behind만 믿지 말고 `ls-remote`로 대조한다.**

작업 브랜치는 원격 백업됐다. **`main`은 여전히 5월 상태(`e6d8eee`)이며 그룹 보안 하드닝, 서버 권위 V2,
Packet 13, 유지보수 게이트가 모두 들어 있지 않다.** 원격 백업이 있다는 사실이 배포 가능 상태를
뜻하지 않는다.

### `main` push 금지 — 배포 연동

- **`origin/main`은 Vercel 프로덕션 배포와 연동되어 있다. main push는 즉시 배포를 트리거한다.**
- 로컬 24개 커밋에는 미배포 서버 권위 V2와 Packet 13이 들어 있고, **운영 DB에는 해당 RPC가 없다**
  (운영 `public` 함수 7개, V2 RPC 30개 부재 — `docs/ops/PROD-SNAPSHOT-2026-08-20.md` §2).
- 따라서 **cutover 창 밖에서의 main push는 즉시 장애를 유발한다.** 배포된 프론트가 존재하지 않는 RPC를
  호출하고, 반대로 `finish_group_player`는 cutover 시 삭제되므로 순서를 잘못 잡으면 양방향으로 깨진다.
- main push는 **cutover 창의 W1 단계에서만** 수행한다. 그 시점에는 W0에서 `VITE_MAINTENANCE=true`가
  이미 켜져 있어 배포된 프론트가 점검 화면을 낸다 (`docs/ops/CUTOVER-PLAN.md` §3.2 W0·W1).
  `origin/main`은 `HEAD`의 조상이므로 fast-forward push가 가능하다 (CUTOVER-PLAN F17).
- 백업 push는 `origin/feat/group-final-gaps`로만 한다. Vercel Production Branch = `main`,
  Ignored Build Step = Automatic이므로(사용자 확인, 2026-08-20) 이 브랜치 push는 프로덕션 배포를
  만들지 않는다. preview 배포 생성 여부는 미확인. 상시 규칙: `AGENTS.md` §1.1.

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
  유지·`?bypass=off` 해제)까지 끝났다 (CUTOVER-PLAN §7 P1~P3). **운영 반영은 창의 W0에서 이뤄진다.**
- Packet 13은 커밋됨(`339fb77`). 코드 작업은 종료.
- **cutover 계획은 작성 완료** (`docs/ops/CUTOVER-PLAN.md`). 2026-08-27에 **§6.0 롤백 판단 기준(P11)**과
  **§6.3 확정 복원 절차·§6.5 리허설 기록**이 추가됐고, 선행 조건 P9·P10·P11·P12가 충족됐다.
  남은 것은 창 밖 선행 조건 **3건(P4·P5·P7, 전부 운영·외부 확인)**과
  창 실행 승인이다 (§5.2).
- 디자인 개편: 저장소 밖에서 별도 진행 중. 확정 시안 산출물 없음 (`code/10-CODE-MASTER-TODO.md` §2 순서 7 = `[~]`).
- `GROUP_SPECTATOR_MIGRATION.sql`(저장소 루트)은 미적용 제안 파일이며 의도적으로 미추적 상태다.

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

   - **W2.5는 선택이 아니다.** `w6_blocking_rows > 0`이면 **W6가 10번째
     `20260814113000`에서 SQLSTATE 23514로 실패한다** — 그 migration이 자기가 붙인 `NOT VALID`
     제약이 걸린 행을 스스로 UPDATE하기 때문이다. 로컬에서 재현했고, 삭제 후에는 11개 전부
     적용됐다. 기존 F15 해석("삭제를 건너뛰어도 실패하지 않는다")은 **틀렸다**
     (CUTOVER-PLAN §5.3-0·F15a·§6.5.3).
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

### 5.2 남은 작업 — CUTOVER-PLAN §7의 미완 선행 조건 3건

전부 창 **밖에서** 끝낸다. 하나라도 미완이면 창을 열지 않는다.
**남은 3건은 전부 운영·외부 확인이며 시점에 묶여 있다** — P4는 창 당일, P5·P7은 전날이다.
**저장소 안에서 처리할 수 있는 항목은 없다.**

| ID | 항목 | 성격 | 비고 |
|---|---|---|---|
| P4 | **프로젝트 Active 확인** | 외부 (Supabase 대시보드) | **창 당일에 다시 확인한다.** 무료 요금제는 7일 무활동 시 자동 일시정지하고 최종 플레이가 2026-08-04이므로 전날 값이 당일을 보장하지 않는다 |
| P5 | DB 접속 자격 준비 | 외부 | `supabase login` 세션 유효, DB 비밀번호 확보 (`db dump`·`db push`가 요구) |
| P7 | W-1 리허설 덤프로 `GRANT` 70행 대조 | 운영 (읽기 전용 덤프) | **창을 막는 유일한 미결정 항목(U5).** 스키마 덤프가 `public` GRANT를 담는다(F3) |

**완료 10건.** 2026-08-21: **P1·P2·P3**(게이트 구현·포함·로컬 확인), **P6**(`backup/` gitignore),
**P8**(link 대상 확인), **P13**(커밋 기준 `npm test`·`npm run build`).
2026-08-27: **P9·P10·P11·P12.**

- **P9** — `npx supabase --version` → `2.114.0` `[산출물]`. `package.json` 핀(캐럿 없는 정확한 값)·
  `package-lock.json`·`node_modules` 설치본·런타임 네 축이 모두 일치한다.
  **CODE GO의 유효 조건**이라 불일치는 창 차단 요소였다. 설치·업그레이드는 하지 않았다.
- **P10** — 리허설로 **삭제가 선택에서 필수가 되면서** 합의할 "삭제 여부"가 사라졌다.
  **P10이 확정하는 것은 절차와 필수성이고, 범위 값은 창 안 W2.5에서 측정한다** —
  측정 자체가 운영 조회이므로 창 밖에서 미리 정할 수 없다 (CUTOVER-PLAN §5.3-0).
- **P11** — 롤백 판단 기준. CUTOVER-PLAN §6.0.
- **P12** — `docs/ops/CUTOVER-LOG-TEMPLATE.md`. 창 당일 `CUTOVER-LOG-YYYY-MM-DD.md`로 복사해 쓴다.

### 5.3 창과 무관하게 남은 검증

- **실제 Wikipedia snapshot smoke (B2)** — B1은 fixture 인터셉트 기반이므로 실제 API 경로의
  429·revision 변경·`WIKI_SNAPSHOT_IDENTITY_MISMATCH` 처리는 아직 미검증이다.
  창 후 항목으로도 등록돼 있다 (CUTOVER-PLAN §8.2-3).
- `npm run supabase:clean-gate`·`npm run supabase:postgrest-smoke`의 현재 커밋 기준 재실행 (§2).

---

## 6. 참조 문서

| 문서 | 역할 |
|---|---|
| `AGENTS.md` | **상시 가드레일.** 세션마다 자동 로드. 운영 DB 변경·commit/push·임의 삭제 금지, 추측 금지, 수치 기재 규칙, 이 파일의 갱신 의무(§7) |
| `docs/agent/CURRENT.md` | **이 파일.** 지금 상태의 단일 기준. 판정·수치·다음 작업 |
| `docs/ops/CUTOVER-PLAN.md` | **운영 cutover 실행 계획.** W0~W11 창 절차, 백업·삭제 전문, **롤백 판단 기준(§6.0)**·복원 절차(§6.3)·리허설 기록(§6.5), 창 전 선행 조건(§7), 창 후 검증(§8), 미결정 항목(§9), Release A~D 대체 매핑(§10). **창을 열기 전 §7을 이 문서 기준으로 점검한다.** 창 중 롤백 판단은 **§6.0만 펼치면 끝나도록** 쓰여 있다 |
| `docs/ops/CUTOVER-LOG-TEMPLATE.md` | **창 기록 틀 (P12).** 창 당일 `docs/ops/CUTOVER-LOG-YYYY-MM-DD.md`로 **복사해서** 쓰고 원본은 남긴다. W0~W11 단계별 시각·판정, G1~G3 게이트, W2.5 측정값, W4~W9 결과, 롤백 시 트리거·등급·승인 시각·복원 소요, 창 후 이월을 빈칸으로 담았다 |
| `docs/CLAUDE_HANDOFF.md` | 배경 인계 문서. 확정 스펙 근거 매핑, 의도적 제외 vs 미구현 구분, 확인 필요 항목, 런타임 baseline 축의 성질 |
| `docs/ops/PROD-SNAPSHOT-2026-08-20.md` | 운영 Supabase 읽기 전용 실측(2026-08-20). 운영에 변경이 가해지면 무효, 갱신 시 새 날짜 파일. **cutover 창이 이 문서를 무효화한다** (CUTOVER-PLAN §8.2-6) |
| `wiki-race-2.0-handoff/01-CONFIRMED-SPEC.md` | 게임 규칙 **단일 기준선**. 다른 문서와 충돌하면 이 문서 우선 |
| `wiki-race-2.0-handoff/code/10-CODE-MASTER-TODO.md` | 작업 순서·의존성·Packet 13 검증 이력(§9~§9.8) |
| `wiki-race-2.0-handoff/code/11-REPOSITORY-AUDIT.md` | 저장소 감사 결과와 보존 원칙 |
| `wiki-race-2.0-handoff/code/13-GROUP-FINAL-GAPS.md` | Packet 13 범위와 R~R3.2 판정 근거 |
| `wiki-race-2.0-handoff/code/18-SERVER-AUTHORITY-V2-IMPLEMENTATION.md` | Release A~D 절차와 cutover 주의사항. **artifact 분할은 U2로 대체됐다** — 대체 매핑은 CUTOVER-PLAN §10 |
| `wiki-race-2.0-handoff/code/14~17` | 미구현 패킷 계획(1:1 아이템, XP·레벨·랭킹, 업적·보상, 탐험·프로필·게스트) |
| `wiki-race-2.0-handoff/qa/30-INTEGRATION-CHECKLIST.md` | 통합 QA 체크리스트와 릴리스 게이트 기록 |
| `docs/WIKI_RACE_GROUP_DB_SECURITY_SPEC.md` | **stale.** 그룹 시간 규칙이 15분/3분으로 남아 있음. 확정값은 20분/2분 |
