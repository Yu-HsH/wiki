# 현재 상태 — Wiki Race 2.0

갱신 날짜: 2026-08-20
기준 커밋: `339fb77` (`feat: complete group final gaps (Packet 13) with runtime and browser gates`)
브랜치: `feat/group-final-gaps`

이 파일이 **"지금 상태"의 단일 기준**이다. `docs/CLAUDE_HANDOFF.md`는 배경 문서(전체 인계 정보)이고,
상시 금지·의무 사항은 `AGENTS.md`에 있다. 수치는 저장소 기록과 실측에서 그대로 옮겼고,
확인되지 않은 것은 `미확인`으로 둔다.

---

## 1. 판정

### CODE GO — 기준 커밋 `339fb77`

**유효 조건 (아래를 모두 만족하는 local/CI 환경에서만 유효)**

- 승인 이미지 `public.ecr.aws/supabase/postgres:17.6.1.158`, digest `sha256:99b1729aeb0bac314445024fc149fbd39306170b61dd50800ccf180327ab3459`
- Supabase CLI `2.114.0` (exact pin: `package.json` devDependencies)
- `npm run supabase:preflight` 통과 (image tag/ID/digest, migration history, RPC catalog/ACL, log 안정성)
- project/volume 격리 유지: `wiki-packet13-r2-clean158`

**즉시 무효화 조건**

- `.104` 이미지 또는 미승인 digest가 기본 경로로 선택되면 그 시점에 `CODE NO-GO`
- 운영 런타임은 이 고정 범위 **밖**이다. 이 판정은 운영 적용 근거가 아니다

근거: `wiki-race-2.0-handoff/code/13-GROUP-FINAL-GAPS.md` §9·§21, `code/10-CODE-MASTER-TODO.md` §9.8

### RELEASE HOLD — 기준 커밋 `339fb77`

사용자-facing 릴리스는 보류다. 남은 선행 조건:

| 항목 | 상태 |
|---|---|
| 운영/linked DB migration 적용 | 미적용. 미적용 11개, CLI push 이력 자체 없음 |
| Edge Function 배포 (`wiki-snapshot`, `single-run`) | 미배포 |
| 운영 dry-run | 미실행 |
| Release A~D 승인 | 미승인 |
| baseline 처리 절차 (`schema_migrations` 부재) | 미설계 |
| 운영 17.6 권한 거부 경로 SIGSEGV 검증 | 미실행. 로컬 게이트로 대체 불가 |
| `finish_group_player` 삭제에 따른 배포 순서 | 미설계 |
| V2 이전 3개 migration(8/4·8/7·8/13) 영향도 | 미검토 |
| 실제 브라우저 1:1 2세션 수동 검증 | 미실행 |
| 모바일 viewport / 키보드 / reduced-motion 검증 | 미실행 |

근거: `docs/ops/PROD-SNAPSHOT-2026-08-20.md` §6·§7·§8,
`wiki-race-2.0-handoff/qa/30-INTEGRATION-CHECKLIST.md` §21, `docs/CLAUDE_HANDOFF.md` §4.4

---

## 2. 검증 수치

`커밋 2`는 `339fb77`을 가리킨다. **실행 시점이 `339fb77` 이전인 항목은 그 사실을 명시한다** —
그 시점에는 동일 변경이 미커밋 작업 트리에 있었다.

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
| `npm test` | **129/129** | 2026-08-20 | `339fb77` 실측. 08-19에 추가된 B1 시나리오 계약 테스트 3개가 늘어난 차이다 |
| pgTAP Packet 13 | 33/33 | 2026-08-18 | `339fb77` 이전 |
| pgTAP spectator emoji atomicity | 22/22 | 2026-08-18 | `339fb77` 이전 |
| pgTAP Server Authority V2 | 97/97 | 2026-08-18 | `339fb77` 이전 |
| pgTAP Phase 2C | 49/49 | 2026-08-18 | `339fb77` 이전 |
| deterministic concurrency | 6 시나리오 × 3회 PASS | 2026-08-18 | `339fb77` 이전 |
| crash regression | 4종 PASS | 2026-08-18 | `339fb77` 이전 |
| production build (`npm run build`) | PASS (약 689KB chunk 경고) | 2026-08-18 | `339fb77` 이전. 커밋 기준 재실행 **미실행** |
| clean gate / PostgREST smoke 재실행 | 미확인 | — | `339fb77` 기준 재실행 기록 없음 |
| 운영 dry-run | 미확인 | — | 미실행 |

수치 출처: `wiki-race-2.0-handoff/code/10-CODE-MASTER-TODO.md` §9.8,
`test-results/packet13-b1/b1.3-2026-08-19T01-19-11-669Z-7c95d293/summary.json` (gitignore 대상 로컬 산출물),
`npm test` 2026-08-20 실행 결과.

---

## 3. 원격 상태

| 항목 | 값 |
|---|---|
| `origin/main` HEAD | `e6d8eee` ("0529백업") — **변경 없음** |
| `origin/feat/group-final-gaps` HEAD | `f1e61fa` — 2026-08-20 push |
| 현재 브랜치 upstream | `origin/feat/group-final-gaps` (설정됨) |
| upstream 대비 | 0 behind / 0 ahead — **동기화 완료** |
| `origin/main...HEAD` | 0 behind / **11 ahead** |
| `37adc69`·`450f63a`·`339fb77`·`f1e61fa` | `origin/feat/group-final-gaps`에 **포함**, `origin/main`에는 **미포함** |

작업 브랜치는 원격 백업됐다. **`main`은 여전히 5월 상태(`e6d8eee`)이며 그룹 보안 하드닝, 서버 권위 V2,
Packet 13이 모두 들어 있지 않다.** 원격 백업이 있다는 사실이 배포 가능 상태를 뜻하지 않는다.

### `main` push 금지 — 배포 연동

- **`origin/main`은 Vercel 프로덕션 배포와 연동되어 있다. main push는 즉시 배포를 트리거한다.**
- 로컬 10개 커밋에는 미배포 서버 권위 V2와 Packet 13이 들어 있고, **운영 DB에는 해당 RPC가 없다**
  (운영 `public` 함수 7개, V2 RPC 30개 부재 — `docs/ops/PROD-SNAPSHOT-2026-08-20.md` §2).
- 따라서 **cutover 계획 확정 전 main push는 즉시 장애를 유발한다.** 배포된 프론트가 존재하지 않는 RPC를
  호출하고, 반대로 `finish_group_player`는 cutover 시 삭제되므로 순서를 잘못 잡으면 양방향으로 깨진다.
- 백업 push는 `origin/feat/group-final-gaps`로만 한다. Vercel Production Branch = `main`,
  Ignored Build Step = Automatic이므로(사용자 확인, 2026-08-20) 이 브랜치 push는 프로덕션 배포를
  만들지 않는다. preview 배포 생성 여부는 미확인. 상시 규칙: `AGENTS.md` §1.1.

---

## 4. 진행 중인 작업

- 저장소 구조 정비: 상시 가드레일을 `AGENTS.md`로 분리, 운영 실측을 `docs/ops/`로 편입, 이 파일 신설. 진행 중.
- Packet 13은 커밋됨(`339fb77`). 코드 작업은 종료, **릴리스 계획 재작성 대기**.
- 디자인 개편: 저장소 밖에서 별도 진행 중. 확정 시안 산출물 없음 (`code/10-CODE-MASTER-TODO.md` §2 순서 7 = `[~]`).
- `GROUP_SPECTATOR_MIGRATION.sql`(저장소 루트)은 미적용 제안 파일이며 의도적으로 미추적 상태다.

---

## 5. 다음 작업 (순서대로)

1. **`baseline_remote_schema`와 운영 스키마 대응 관계 확인** — 스냅샷 §1은 로컬 baseline이 운영 덤프로
   "보인다"고만 기록한다. 이 대응이 확정되지 않으면 `migration repair` 대상 버전 자체가 정해지지 않는다.
   **2번(cutover 계획 재작성)의 선행 조건이므로 먼저 수행한다.**
2. **cutover 계획 재작성** — `docs/ops/PROD-SNAPSHOT-2026-08-20.md` §7의 신규 위험 4건을 반영한다.
   baseline 처리 선행 단계, 운영 17.6 권한 거부 경로 검증, `finish_group_player` 배포 순서,
   V2 이전 3개 migration 범위 재산정. Release A~D 정의를 이 격차 기준으로 다시 계산하며,
   Vercel main 배포와 DB 적용의 순서·다운타임 허용 여부를 함께 확정한다 (§3, `AGENTS.md` §1.1).
3. **`avatars` 버킷 객체 소유자 확인** — 운영 콘솔, **사람 작업**. 객체 1개·소유자 1명이 실재하며
   실제 사용자인지 개발 테스트 계정인지에 따라 프로필 업로드 제거 방식이 갈린다. 삭제·변환은 금지(`AGENTS.md` §4).
4. **실제 Wikipedia snapshot smoke (B2)** — B1은 fixture 인터셉트 기반이므로 실제 API 경로의
   429·revision 변경·`WIKI_SNAPSHOT_IDENTITY_MISMATCH` 처리는 아직 미검증이다.

---

## 6. 참조 문서

| 문서 | 역할 |
|---|---|
| `AGENTS.md` | **상시 가드레일.** 세션마다 자동 로드. 운영 DB 변경·commit/push·임의 삭제 금지, 추측 금지, 수치 기재 규칙 |
| `docs/agent/CURRENT.md` | **이 파일.** 지금 상태의 단일 기준. 판정·수치·다음 작업 |
| `docs/CLAUDE_HANDOFF.md` | 배경 인계 문서. 확정 스펙 근거 매핑, 의도적 제외 vs 미구현 구분, 확인 필요 항목 |
| `docs/ops/PROD-SNAPSHOT-2026-08-20.md` | 운영 Supabase 읽기 전용 실측(2026-08-20). 운영에 변경이 가해지면 무효, 갱신 시 새 날짜 파일 |
| `wiki-race-2.0-handoff/01-CONFIRMED-SPEC.md` | 게임 규칙 **단일 기준선**. 다른 문서와 충돌하면 이 문서 우선 |
| `wiki-race-2.0-handoff/code/10-CODE-MASTER-TODO.md` | 작업 순서·의존성·Packet 13 검증 이력(§9~§9.8) |
| `wiki-race-2.0-handoff/code/11-REPOSITORY-AUDIT.md` | 저장소 감사 결과와 보존 원칙 |
| `wiki-race-2.0-handoff/code/13-GROUP-FINAL-GAPS.md` | Packet 13 범위와 R~R3.2 판정 근거 |
| `wiki-race-2.0-handoff/code/18-SERVER-AUTHORITY-V2-IMPLEMENTATION.md` | Release A~D 절차와 cutover 주의사항 |
| `wiki-race-2.0-handoff/code/14~17` | 미구현 패킷 계획(1:1 아이템, XP·레벨·랭킹, 업적·보상, 탐험·프로필·게스트) |
| `wiki-race-2.0-handoff/qa/30-INTEGRATION-CHECKLIST.md` | 통합 QA 체크리스트와 릴리스 게이트 기록 |
| `docs/WIKI_RACE_GROUP_DB_SECURITY_SPEC.md` | **stale.** 그룹 시간 규칙이 15분/3분으로 남아 있음. 확정값은 20분/2분 |
