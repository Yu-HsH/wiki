# PR #63 Git 바이트 검증과 통합 계획

**Git 바이트 보존 PASS.** 2026-11-23 KST, 원격 Draft HEAD `6b336c10abafc2fe4a1c25e74e2f5fadd97792a4`와 격리 로컬 시험 커밋 `eb0a54b20bb63aefaed544d42812a19739b9c0c7` 기준이다. 원격 PR과 작업 worktree의 HEAD에는 시험 커밋이 적용되지 않았다. 두 시험 저장소에는 원격이 설정되어 있지 않다. [PR #63](https://github.com/Yu-HsH/wiki/pull/63)

## 검증한 변경

루트 `.gitattributes`의 정확한 경로 5개에만 `-text`를 지정했다. Git 줄바꿈 설정은 두 시험 저장소 모두 `core.autocrlf=true`로 유지했다. `-text`로 해당 파일의 줄바꿈 변환만 끄고 일반 텍스트 diff는 남긴다. 디렉터리 규칙이나 전역 설정 변경은 필요하지 않다. [Git attributes](https://git-scm.com/docs/gitattributes)

작업 파일, staged blob, 임시 로컬 커밋 blob, 새 checkout 파일의 SHA-256이 아래 값과 모두 일치했다. Git blob은 바이트 스트림으로 읽었다. 기존 59개는 기준 Git blob과 이번 커밋 blob이 일치하고, 새 checkout의 작업 파일 바이트도 기존 checkout과 동일했다. 적용 대상 파일 개수는 64개다. `AGENTS.md`, `CURRENT.md`, lockfile의 blob과 작업 파일도 대조했다. [단계별 SHA와 실행 결과](../../server-proposals/pr63-cli-path-20261123/git-byte-verification.json)

| Migration | 네 단계에 공통인 SHA-256 |
|---|---|
| `20261120024414_group_items_s5.sql` | `30a6668a035e9786d5f6df79e2ec304472e474ae2e80d1d999619c89d4348ccb` |
| `20261120104117_duel_items_v4.sql` | `bb23a8a239cb58f4a0968b96dfed254ff2a782ca73bcc55e6ba8e8d5da6a8246` |
| `20261120113035_duel_v4_server_search.sql` | `e70a149269007097e3c6f6f1d3736fa85bff3c218cde43a3a440eb473e249eed` |
| `20261120113647_duel_v4_reward_queue.sql` | `8ec56d5bfb919a628ff6eb0db809bab6196b7dd2dfc717757832a38ed3cc269c` |
| `20261120114137_duel_v4_link_index.sql` | `e4854ee647e083716fdf01d9bd09bd842742f94bf2de2d2941bb6ca3770242ce` |

## 새 checkout 검증

| 검증 | 결과 |
|---|---|
| 실제 Supabase CLI v2.114.0 | 기존 S5가 있는 복원본 및 S5가 없는 59개 기준 DB 모두 **59→64 PASS**. 기존 59개 이력 행과 역할 멤버십 보존. 복원본 원본 182개 테이블 데이터 지문 일치 |
| S5 기존 분기 함수 사후검사 | 새로 적용한 복제본에서 `md5(pg_get_functiondef(...))` **151/151** 일치 |
| CLI statements | 파일별 1,652 / 51 / 22 / 31 / 16문장. 새 checkout을 CLI 파서로 해석한 배열과 이전·이번 실제 CLI 이력 배열이 모두 같음 |
| pgTAP 핵심 재검증 | **4파일, 141 assertions PASS**. 복원 경로의 `daily_current_snapshot_pairs_v1.sql` 17, `duel_drain_recovery_v1.sql` 32. 신규 S5 경로의 `group_items_s5.sql` 1, `duel_items_v4.sql` 91 |
| JavaScript / 빌드 | **918/918 PASS**, 빌드 exit 0. 기존 의존성의 `use client` 번들 경고 유지. 같은 lockfile의 의존성을 격리 checkout으로 복사해 실행 |
| 리허설 보존 | 기존 Docker 컨테이너·볼륨 누락 0, 백업 SHA 일치, 이번 리허설 컨테이너 실행 중 0 |

이번에는 바이트 보존과 핵심 검사를 재실행했다. 전체 pgTAP 36파일 및 브라우저 E2E 근거는 같은 SQL SHA로 통과한 이전 리허설 결과를 사용한다. Docker에서 추가한 DB들은 복제본이며 기존 증거 DB와 원시 로그를 보존했다. [이전 리허설 보고서](S5-PR63-CLI-MIGRATION-REHEARSAL-2026-11-23.md)

`-text`는 CRLF 자체도 보존한다. Git의 기본 `diff --check`는 보존된 CRLF 줄 끝을 지적할 수 있다. 검토할 때 `cr-at-eol`을 명령에만 적용하면 기존 `actor_uid_v1` 함수의 실제 공백 한 곳만 남는다. 기존 함수와 검증 SHA를 보존하기 위해 앞선 리뷰에서 승인 대상으로 기록한 공백이다.

```powershell
git -c core.whitespace=cr-at-eol diff --check HEAD -- supabase/migrations
```

## 별도 통합 승인 후 반영할 파일과 커밋

**첫 커밋 `fix: preserve verified S5 and duel v4 migration bytes`**는 시험 커밋과 같은 아래 11개 파일을 명시해 stage한다. `.gitattributes`와 SQL 5개를 함께 포함해야 stage 시점부터 보호가 적용된다.

- `.gitattributes`
- `supabase/migrations/20261120024414_group_items_s5.sql`
- `supabase/migrations/20261120104117_duel_items_v4.sql`
- `supabase/migrations/20261120113035_duel_v4_server_search.sql`
- `supabase/migrations/20261120113647_duel_v4_reward_queue.sql`
- `supabase/migrations/20261120114137_duel_v4_link_index.sql`
- `supabase/tests/daily_current_snapshot_pairs_v1.sql`
- `supabase/tests/duel_drain_recovery_v1.sql`
- `tests/s5AuthorityClockDiagnostics.test.js`
- `tests/s5ReleaseReadiness.test.js`
- `tests/helpers/s5MigrationSource.js`

**두 번째 커밋 `docs: record PR 63 migration verification and rollout plan`**은 아래 검토 산출물을 담는다.

- `docs/ops/S5-PR63-CLI-MIGRATION-REHEARSAL-2026-11-23.md`
- `docs/ops/S5-PR63-CLI-MIGRATION-RUNBOOK-2026-11-23.md`
- `docs/ops/S5-PR63-RELEASE-CHECKLIST-2026-11-23.md`
- `docs/ops/S5-PR63-RELEASE-REVIEW-2026-11-23.md`
- `docs/ops/S5-PR63-GIT-BYTE-VERIFICATION-2026-11-23.md`
- `server-proposals/pr63-cli-path-20261123/DESIGN.md`
- `server-proposals/pr63-cli-path-20261123/candidate-manifest.json`
- `server-proposals/pr63-cli-path-20261123/final-preservation-result.json`
- `server-proposals/pr63-cli-path-20261123/pr-readonly-status.json`
- `server-proposals/pr63-cli-path-20261123/release-review-evidence.json`
- `server-proposals/pr63-cli-path-20261123/verification-results.json`
- `server-proposals/pr63-cli-path-20261123/git-byte-verification.json`

통합 세션은 원격 Draft HEAD가 여전히 기준과 일치하는지 확인한다. 실제 staged blob, 통합 commit의 blob, 새 checkout, CLI 전달 파일의 SHA를 위 표와 비교한다. 다른 바이트가 하나라도 나오면 적용을 멈추고 차이를 확인한다. 통합 커밋이 만들어지면 저장소 규칙에 따라 `docs/agent/CURRENT.md`에 기준과 결과를 반영한다. 현재 검증용 worktree에서는 이 파일을 보존했다.

통합에 올리는 데이터는 위 파일 목록에 한정한다. 격리 저장소, 의존성, 스크립트 실행 로그는 로컬 `.temp`에 보관하고 DB 아카이브·원시 SQL/CLI 로그는 기존 비공개 저장소에 보관한다. 운영 적용과 출시는 이전 승인 패키지의 조건을 따른다. [최종 승인 패키지](S5-PR63-RELEASE-REVIEW-2026-11-23.md)

## 2026-11-23 실제 PR 브랜치 로컬 통합과 push 판단

원격 Draft HEAD는 `6b336c10abafc2fe4a1c25e74e2f5fadd97792a4`다. 실제 PR 브랜치 `codex/s5-item-overhaul-20261120`에서 제품 커밋 `a662c30732cf229ba42f348b0eece97d3cf1f691`을 작성했다. staged tree와 제품 커밋의 tree는 바이트 검증용 임시 커밋의 tree와 같다. 새 독립 checkout의 SQL SHA 5개, 기존 59개와 AGENTS.md를 재대조했다. 이 checkout에서 `npm test` 918/918, `npm run build` PASS였다. 기존 `use client` 경고는 유지됐다. 앞선 CLI 151/151, 핵심 pgTAP 및 E2E 결과는 이와 동일한 제품 tree에 대한 근거다.

| 자동화 | 읽기 전용 확인과 예상 영향 |
|---|---|
| GitHub Actions | 현재 PR tree의 23개 workflow를 검토했다. 브랜치 push는 열린 PR의 `pull_request:synchronize`를 발생시키며 base/path 필터가 맞는 QA가 실행된다. Frontend PR checks, S5 synthetic 59→64, S5/v4 격리 Docker 테스트가 해당한다. Supabase migration/test는 로컬 runner DB에서 수행된다. 운영 변경을 호출하는 push workflow는 발견하지 않았다. Keepalive는 schedule/수동 실행의 읽기 요청이며 PR push 트리거가 없다. |
| Vercel | Vercel 프로젝트의 현재 PR HEAD 배포가 READY Preview이고 최신 Production 배포는 `main`임을 조회했다. 이 PR 브랜치에 연결된 custom environment는 없었다. 같은 브랜치 push는 Preview 배포를 만들 수 있다. |
| Preview의 운영 영향 | `VITE_SUPABASE_URL` 및 `VITE_SUPABASE_ANON_KEY`는 각각 Preview·Production·Development 공통 항목이다. 이 브랜치 전용 오버라이드는 조회되지 않았고 유지보수 변수는 Production 범위에만 등록되어 있었다. 앱은 빌드에서 이 두 Supabase 설정으로 클라이언트를 초기화한다. Preview 접속 후 로그인·게임 등 일반 화면 동작도 운영 Supabase에 요청을 보낼 수 있다. 연결 값은 조회 결과나 문서에 기록하지 않았다. |

**Push BLOCK.** 커밋 자체의 검증은 PASS다. 운영 DB와 공유하는 Preview가 자동 생성될 수 있으므로 실제 push는 보류한다. Preview를 독립 Supabase로 분리하거나 이 브랜치의 Preview 자동 배포를 차단하는 설정을 별도 승인으로 준비한 뒤 재확인한다. 이번 작업에서 Vercel 설정·운영 DB·Edge·Production을 변경하지 않았다.

[GitHub Actions PR 이벤트](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request) · [Vercel Git 배포](https://vercel.com/docs/git/vercel-for-github) · [Vercel 환경변수 범위](https://vercel.com/docs/environment-variables)
