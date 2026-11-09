# PR #29 실제 로컬 Edge·회원 브라우저 QA

2026-11-09 KST, 제품 코드 기준 `25c28fd3bc368a1469c9562d0e942c4ede6f1474`. 실제 로컬 QA와 회귀 검사는 통과했다. 호스팅 Edge 실행과 운영 배포는 별도 승인 게이트로 남는다. [11월 8일 격리 HTTP·위키백과 API 검증](auto-goal-isolated-http-validation-20261108.md)

## 환경과 재현

Windows PowerShell, Node.js 24.18.0, npm 11.16.0, Docker Desktop, Supabase Edge Runtime v1.74.3, Playwright Chromium 151.0.7922.34. 기존 로컬 Auth/Kong/위키 스냅샷은 `127.0.0.1:55421`, PostgreSQL은 `55422`. 고정 SHA의 `single-run`만 `17421`에서 별도 실행했고, 브라우저는 `17422`에서 실제 Vite 빌드를 열었다. 브라우저의 Auth·기타 Supabase 호출은 기존 로컬 스택으로, `single-run`은 격리 Edge로 전달했다. 위키백과와 DB 응답을 실제로 사용했다.

```powershell
$kit = 'C:\Project\wiki-pr29-edge-testkit'
& "$kit\Run-Pr29-EdgeRuntimeE2E.ps1" -Port 17421 -PreflightOnly
& "$kit\Run-Pr29-EdgeRuntimeE2E.ps1" -Port 17421
& "$kit\Run-Pr29-EdgeRuntimeE2E.ps1" -Port 17421 -BrowserQA

Set-Location 'C:\Project\wiki-pr29-local-e2e'
npm test
npm run build
$env:RUN_LIVE_WIKI_E2E = '1'
node --test tests/singleRandomStart.test.js tests/singleRandomIsolatedHttp.test.js
Remove-Item Env:RUN_LIVE_WIKI_E2E
```

브라우저 모드는 위의 별도 로컬 테스트킷과 PR 복사본의 잠금 파일 기반 의존성 및 Playwright Chromium이 필요하다. Windows에서 `core.autocrlf=true`이면 기존 `singleConfirmedMoveCount.test.js`가 `GamePage.jsx`의 LF 문자열 경계를 못 찾아 실패한다. Git 원본은 LF임을 확인했고, `git -c core.autocrlf=false archive HEAD`로 펼친 동일 SHA의 사본에서 전체 테스트를 재실행했다.

## 실제 검증

| 항목 | 결과 |
| --- | --- |
| 실제 Edge HTTP | **20 PASS / 0 FAIL**. 부팅·라우트, 게스트 토큰 요구, 무효 회원 JWT 401, 목표 입력 조작 400, 동시 요청의 DB 단일 할당, 동일 요청 재전송, 출발·목표 스냅샷, 문서 복구, 예약·시작 및 정리 |
| 회원 인증과 코스 | 실제 로컬 가입·비밀번호 로그인 `200`. Edge가 회원 UUID로 코스를 확정했고 Chromium에 목표가 표시됨 |
| 게스트·회원 분리 | 별도 Chromium 컨텍스트. 게스트 대전 접근이 제한되고 두 게임의 DB 소유자가 분리됨. 본인 조회 각각 `200`, 상대 게임 조회 각각 `502` / 게임 데이터 없음. 현행 Edge의 공통 오류 매핑을 관찰한 값 |
| 회원 브라우저 새로고침 | 출발 준비 화면과 경기 화면에서 각각 실제 브라우저 문서 재로드. 동일 게임·출발·목표·리비전과 고정 출발 HTML 복구. 준비 중 예약 시각을 유지하고 실제 게임 HUD 진입 |
| 정상 이탈 | 회원과 게스트 모두 UI에서 이탈 확인 → `leave_v1` → 로비 복귀 및 PostgreSQL `abandoned` |
| 브라우저 진단 | 미처리 JS 예외 0건, 관찰한 로컬 API·리소스 실패 0건. 회원 브라우저에서 외부 광고 스크립트 `no_div` 콘솔 오류 1건 |
| 전체 Node / 빌드 | LF 사본 **804 PASS / 0 FAIL / 1 SKIP**. Vite build PASS, 기존 500 kB 청크 경고. CRLF 작업 트리는 803 PASS / 1 FAIL / 1 SKIP |
| PR 전용 Node | 기본 **41 PASS / 0 FAIL / 1 SKIP**. 라이브 위키백과 케이스 활성화 시 **42 PASS / 0 FAIL / 0 SKIP** |

최종 브라우저 테스트 게임은 회원 `3b8da997-0657-4e79-ae66-58fdc6ae68bb`, 게스트 `7e9fe0c7-7d10-4f2e-a234-b394a4694309`다. 브라우저 QA 게임 2건과 앞선 HTTP 디버깅 게임 3건이 로컬 DB에 `abandoned`로 남았다. 테스트 회원과 프로필을 삭제했고, 격리 Edge를 제거한 뒤 `17421`·`17422`에 리스너가 없음을 확인했다. 기존 로컬 Edge의 컨테이너 ID와 시작 시각은 일치했다.

## CI 및 병합 비교

고정 SHA의 [Frontend PR checks](https://github.com/Yu-HsH/wiki/actions/runs/42485520403)와 [Auto-goal disambiguation QA](https://github.com/Yu-HsH/wiki/actions/runs/42485520866) 4개 작업이 통과했다. 원격 `main`은 `0c1e3bf5f2ca554ce8a94904f9181304ef63d85b`이고, 코드 검증 SHA는 이 기준보다 19커밋 앞서며 뒤처진 커밋은 0개였다.

동일한 원격 main을 기준으로 각 PR과 3방향 `git merge-tree`를 실행해 8건 모두 충돌이 없음을 확인했다. 아래는 변경 파일과 계약을 함께 검토한 결과다.

| PR | 검토 |
| --- | --- |
| #25 `9620b0a` | 싱글 준비 문구·표시 변경과 접점이 있으나 Edge 요청·DB 계약 변경 없음. 병합 뒤 준비 화면 시각 스모크 대상 |
| #26 `b8065af`, #27 `55544af`, #28 `068373a` | 코스 품질·경로·진입 정책 연구와 읽기 전용 도구. 런타임 선택 경로 변경 없음 |
| #30 `64ba635`, #31 `da8ef46` | 홈 노트와 랭킹 UI. 싱글 시작 계약 변경 없음 |
| #36 `cca2228`, #38 `dfb7a7c` | 공개 멀티 대기방 SQL·참가 계약과 그룹 로딩 UI. 싱글 세 RPC 변경 없음 |

## 배포 계약과 남은 확인

- 원격 main 대비 Supabase 변경은 `supabase/functions/single-run/random.mjs`뿐이다. `supabase/config.toml`, `index.ts`, 회원·게스트 인증, RPC 명세 및 마이그레이션은 동일하다.
- 운영 메타데이터 조회 시 `single-run` v3는 ACTIVE / `verify_jwt=false`, `wiki-snapshot` v4는 ACTIVE / `verify_jwt=true`였다. 운영 DB 카탈로그에서 `claim_single_course_v1`, `commit_single_course_v1`, `control_single_start_v1`의 인자, service_role 실행 권한과 anon/authenticated 직접 실행 불가, 잠금·스냅샷·예약 정의를 확인했다. RPC 호출 없이 SELECT만 실행했다. 이 조회 중 Supabase CLI 2.114.0가 임시 DB 로그인 역할 자격을 초기화하는 부수효과가 있었고, 운영 조회를 종료했다. [Supabase CLI 임시 로그인 역할 안내](https://supabase.com/kb/troubleshooting/permission-denied-when-deleting-the-cli_login_postgres-role-808bae)
- 호스팅 Edge에서 콜드 스타트·게이트웨이·실제 배포물은 미실시다. 실제 무작위 브라우저 표본에서 동음이의어 목표 재추첨이 발생했는지는 관측하지 않았고, 해당 분기는 결정론적 회귀에서 검증했다. 회원 완주와 XP/랭킹은 이탈 시나리오의 검증 범위 밖이다.
- 승인된 배포 창에서는 먼저 현재 운영 함수 소스/버전과 JWT 설정을 보존하고, 기존 스테이징에 `single-run`만 배포해 게스트/회원/복구 스모크를 실행한다. 운영에서도 함수 이름을 지정해 같은 설정을 유지하고 `wiki-snapshot`과 RPC는 재배포하지 않는다. 게스트가 게이트웨이에서 차단되거나 정상 회원/할당/복구가 실패하면 기록한 직전 정상 소스를 같은 JWT 설정으로 다시 배포해 스모크를 반복한다. PR의 DB 변경이 없으므로 DB 롤백은 필요하지 않다. [Supabase 함수 설정](https://supabase.com/docs/guides/functions/function-configuration)
