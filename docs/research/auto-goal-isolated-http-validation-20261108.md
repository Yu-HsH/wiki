# A안 자동 목표 동음이의어 제외 · 격리 HTTP 및 실제 위키백과 검증

검증일: **2026-11-08 KST**

2026-11-09에 실제 로컬 Edge Runtime·PostgreSQL·회원 Chromium QA를 완료했다. 최신 근거와 운영 전 확인 항목은 [11월 9일 최종 QA 기록](auto-goal-local-edge-qa-20261109.md)을 참고한다. 아래 내용은 11월 8일의 HTTP·CI 결과다.

**결론: 격리 계약·실제 위키백과 API 기반 테스트 PASS / 실제 호스팅 Supabase Edge + 실데이터 스테이징 E2E NOT RUN.**

## 환경 격리

- 연결된 Supabase 프로젝트 목록 확인 결과 운영 `ctdpyrmitljgrcgfvndn` 1개뿐, 개발 브랜치 0개.
- 따라서 사용자가 승인하지 않은 유료 Supabase 브랜치 생성, 별도 프로젝트 생성, 운영 `single-run` v3 함수 교체, 운영 DB 글쓰기나 마이그레이션 적용은 하지 않음.
- 테스트는 GitHub Actions Ubuntu + Node 22에서 PR #29 **실제** `handleSingleStart` 및 `selectRandomCourse`를 실행. `fetch('http://127.0.0.1/...')`를 사용한 실제 HTTP 서버/스냅샷 경계, 메모리 내 가짜 `claim_single_course_v1`, `commit_single_course_v1`, `control_single_start_v1`로 격리.
- **한계:** 인메모리 RPC는 PostgreSQL의 실제 트랜잭션 잠금·30초 리스·스냅샷 존재 제약 및 Supabase Edge의 실제 콜드스타트를 대체할 수 없음. 테스트 결과를 호스팅 스테이징 E2E 완료로 표기하지 않음.
- 운영 DB에서 RPC 세 함수의 *존재와 인자·관찰 가능한 분기*를 **읽기 전용**으로 조회. 함수 이름 및 명세 일치:
  - `claim_single_course_v1(p_request_id uuid,p_user_id uuid,p_guest_hash text,p_mode text,p_target text)` — owner advisory lock, 30초 리스, 중복/진행 중 반환.
  - `commit_single_course_v1(p_allocation_id uuid,p_user_id uuid,p_guest_hash text,p_start jsonb,p_goal jsonb,p_daily_date date)` — 스냅샷 및 소유권 검증, 만료 시 거부.
  - `control_single_start_v1(p_run_id uuid,p_user_id uuid,p_guest_hash text,p_action text)` — 소유자 확인, 준비→예약→시작·스냅샷 경로.
  - **함수는 호출하지 않았으며 정의만 읽었다.**

## 격리 HTTP 계약 테스트

테스트: `tests/singleRandomIsolatedHttp.test.js`. 별도 [GitHub Actions run 42485208209](https://github.com/Yu-HsH/wiki/actions/runs/42485208209).

| 검사 | 판정 | 근거 |
|---|---|---|
| 동음이의어 **시작**은 허용 | PASS | 시작 `화성`은 pageprops.disambiguation 있음에도 start로 저장 |
| 동음이의어 **목표**는 새로 추첨 | PASS | 목표 `덕곡면` 제외, `훈민정음`을 goal로 확정 |
| 제외한 목표의 snapshot 미호출 | PASS | Wiki identity 3회 호출, pinned snapshot은 시작+최종 목표 2회 |
| F5/재조회 후 코스 유지 | PASS | `snapshot_v1` 후 목표/출발 ID 유지, Wiki 재추첨 0 |
| 예약→시작→문서 복구 | PASS | `reserve_start`, `start`, `document` 모두 정상, documentHtml 회수 |
| 동시 요청/중복 제출 | PASS | 동일 요청 2개 → `ALLOCATED` 1개/`ALLOCATION_PENDING` 1개, 재요청 `ALLOCATED`; commit 1회 |
| 위키백과 429 실패·재시도 | PASS | snapshot 0/commit 0, 진행 중 요청 중복 방지, 모의 리스 만료 후 재시도 |
| 부적격 목표 11개 연속 | PASS | 전체 추첨 최대 12회, 시작 snapshot 1회, commit 없음 |
| 서버 권위 입력/회원 인증 | PASS | 조작 목표 필드 400, 회원 토큰 없음 401, 정상 테스트 회원 성공 |
| 격리 HTTP 성능 스모크 | PASS | 로컬 가짜 위키·DB·스냅샷으로 24회: p50 4ms, p95 5ms, 최장 6ms (**실서비스 지연 아님**) |

위 단독 오프라인 테스트 **6/6 PASS**. `tests/singleRandomStart.test.js`의 기존 35개 단위 회귀도 그대로 유지.

## 실제 위키백과 네트워크를 연결한 부분 통합

동일 GitHub Actions의 별도 워크플로 작업에서 `RUN_LIVE_WIKI_E2E=1`을 활성화해 `ko.wikipedia.org/w/api.php` **실제 generator=random** 응답을 PR #29 서버 코드에 흘려보냈다. 이후 snapshot과 DB는 **계속 격리된 로컬 응답**이며 외부 서비스 기록·계정·XP 변경 없음.

| 측정 | 결과 |
|---|---:|
| 실제 위키백과 추첨을 통한 독립 시작 시도 | 4 |
| 성공한 목표 확정 | **4/4** |
| 목표 문서의 공식 disambiguation 속성 확인 | 4/4 비동음이의어 |
| 위키백과 요청 수 | 각 2회 (해당 표본에 동음이의어 목표 없음) |
| 전체 HTTP 왕복 지연 (GitHub Actions 기준) | 138ms, 150ms, 154ms, 210ms |
| 중앙 관측값 | 154ms |
| 운영 Edge의 콜드스타트·DB 및 실제 snapshot 지연 | **측정하지 않음** |

이 측정은 위키백과 실제 API와 로컬 HTTP mock DB/snapshot만 통과하므로 실제 운영/스테이징 Edge 지연을 대표하지 않는다. 특히 동음이의어 **실제 무작위** 재추첨은 이 4번에서 발생하지 않았고, 이에 해당하는 동작은 위의 결정론적 통합 사례와 별도 35개 회귀 테스트로 검증했다.

## 기존 PR #29 전체 품질 확인

최종 관련 CI (검증 HEAD `0295977705e6d7c0fcab24421c74732eb83c0d7c`):

- [Frontend PR checks 42485208150](https://github.com/Yu-HsH/wiki/actions/runs/42485208150): 전체 프로젝트 테스트 PASS 및 Vite build PASS.
- [Auto-goal disambiguation QA 42485208209](https://github.com/Yu-HsH/wiki/actions/runs/42485208209): 단위 회귀 / 격리 HTTP / 외부 위키 API와 페어 성능 / daily pool 경고 모두 실행 성공.
- PR #29은 **Draft**이고 `main` 병합 없음.
- 운영 `single-run` Edge 버전 **v3 ACTIVE** 유지, 변경 없음.

## 확인된 별도 이슈와 남은 게이트

1. 오늘의 도전 활성 후보 17개 조회에서 실재 일반 문서 16개 / 현재 MediaWiki `missing`인 `레드벨벳 (아이돌)` 1개. 최신 검증·스냅샷이 없으므로 현재 후보 선정 불가. DB 정리는 별도 승인.
2. **실제 Supabase 스테이징 Edge Runtime + 격리된 PostgreSQL**에서 서버 snapshot·commit의 스냅샷 외래/동일성 검사, 30초 lease 경합, 브라우저 F5 시각적 복구, 회원 JWT 검증, 오류·네트워크 지연/콜드스타트를 아직 확인하지 못함.
3. 호스팅 Supabase 개발 브랜치를 만들면 **시간/자원 기반 비용이 발생할 수 있으므로 견적과 별도 승인이 필요**. 운영 프로젝트에 테스트 함수를 배포하는 방식은 승인 없이 수행하지 않음.
4. 운영 배포 전 별도 승인 시 실제 비용·staging 환경·재현 계정·복구 절차를 확인하고, **운영 single-run v3를 직접 덮어쓰지 않고** 검증.
5. **A안 범위 유지:** 자동 랜덤 목표만 제외. 시작·게임 중 이동·사용자 직접 지정·1:1/그룹의 직접 제출 후보는 변경하지 않음. 오늘의 도전 새 후보에는 향후 사전 검수 프로세스가 필요.

**최종 게이트:** 단위/격리 HTTP + 외부 위키 API 기반 검증 **PASS**. 호스팅 Edge/DB의 진짜 스테이징 **미실시**, 운영 배포 **HOLD**.
