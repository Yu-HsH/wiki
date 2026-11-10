# 오늘의 도전: 목표 22개 등록 SQL — 격리 테스트 단계

## 상태

- **Draft review only**. 이 파일은 `scripts/sql/`에 있으므로 Supabase migration 적용 대상이 아니다.
- PR #47 공식 MediaWiki API 검증: 24/24 일반 문서, 동음이의어 0, 각 목표 직접 역링크 100개 표본 + 추가 페이지 존재. 기존 활성 대상 `훈민정음`과 `카카오톡` 2개 제외 → 순신규 목표 22개.
- PR #47 WikiViewer 브라우저 연구: 대표 9개 출처 문서를 실제 `fetchPageData` + `WikiViewer`로 읽고 목표 링크 클릭 콜백 확인 9/9.
- **서버 이동 권위/RPC**, 개별 22개 전수 WikiViewer QA, 실제 회원 오늘의 도전 완주는 아직 검사하지 않음.
- 전체 24개 중 캐시 직접 출처 링크가 하나 이상 확인되었으며, 목표 ID는 공식 Wiki pageId와 모두 일치함. 단 전체 위키백과 링크가 아닌 스냅샷 표본임.

## SQL 계약

- `scripts/sql/daily-goal-22-targets-staged-20261109.sql`
- 실제 운영 스키마의 `daily_challenge_pool(sort_order,start_title,target_title,hint,is_active,verified_path_titles,verified_at)` 기준.
- `sort_order=200..221` 예약. 실행 시 기존 PK/UNIQUE와 충돌하면 즉시 중단, 절대 덮어쓰지 않음.
- `start_title=NULL, verified_at=NULL, verified_path_titles=NULL`. **최단거리 또는 n회 경로 조건은 신규 목표 검수에 사용하지 않음.**
- 같은 SQL 재실행에 중복 목표를 만들지 않음. 과거 `daily_challenges` 및 게임/XP 데이터를 변경하지 않음.

## 격리 테스트

GitHub Actions `Daily goal 22 SQL isolated PostgreSQL QA`에서 PostgreSQL 17 별도 서비스 컨테이너를 띄우고 다음을 검사한다.

1. 기존 활성 후보 17개와 기존 오늘의 코스 1개를 fixture로 준비.
2. 신규 SQL을 두 번 실행해 동일 결과로 수렴하는지 검증.
3. 기존 17개 행 보존, 신규 22개, 합계 39개, 오늘의 코스 원본 불변 확인.
4. `sort_order` 및 `target_title` 충돌을 각각 주입하여 오류·트랜잭션 롤백 확인.

**주의:** 이 검증은 실제 Supabase 전체 로컬 스택/E2E 및 `ensure_today_daily_challenge()` 실행 검증을 대신하지 않는다.

## 왜 이 SQL만으론 매일 신규 목표가 나오는 게 보장되지 않을까?

현재 운영 `ensure_today_daily_challenge()`는 목표 풀의 단어끼리 연결된 2회 이동 조합을 찾아 우선 선정하며, 없을 때 verified 고정 코스를 사용한다. 신규 단어가 목표 후보로 추가돼도 그 단어를 출발점으로 쓸 수 있는 스냅샷이 없으면 이용 가능한 조합에 포함되지 않을 수 있다.

따라서 **목표 문서의 도달가능성 검증은 특정 출발 문서·n회 이동 분석과 분리**하되, 실제 하루 코스 확정 시에는 별도의 출발 문서를 안전하게 정하고 권위 이동을 보장하는 **선정 함수 변경 PR**이 필요하다.

## 운영 등록 전 체크리스트

- [ ] PR #47의 WikiViewer 대표 검증 확대 및 필요 시 실제 회원 브라우저 QA
- [ ] 신규 목표를 사용하는 출발 선정 정책 제안 및 30일 가상 배정·F5/랭킹 회귀
- [ ] Supabase CLI를 격리 로컬 환경에서 사용하여 `supabase migration new <name>`로 정식 마이그레이션 파일 생성 및 본 SQL 편입
- [ ] 실제 로컬 Supabase migration reset / 일일 RPC 동시 호출 테스트
- [ ] 운영 백업 및 원복 절차 + 유지보수 게이트 점검
- [ ] 사용자 최종 승인 후 병합·운영 적용 (현재 미승인)

## 안전 경계

운영 DB, Edge, 기존 17개 목표, 과거 확정 코스, PR #29, 다른 기능 PR은 변경하지 않는다. CLI `supabase db query --linked`는 임시 역할 부수효과 이력 때문에 사용 금지.

## 격리 PostgreSQL 실측 결과

[GitHub Actions 실행 #42584540182](https://github.com/Yu-HsH/wiki/actions/runs/42584540182), PostgreSQL 17 service, 2026-11-09:
- 기존 17개 + 신규 22개 = **39개**, SQL 2회 재실행 멱등성 PASS.
- 기존 17개, 확정된 하루 코스 fixture 불변 PASS.
- `sort_order` 충돌은 예외 + 전체 롤백 PASS.
- `target_title` 충돌은 예외 + 전체 롤백 PASS.
- 프론트엔드 체크 PASS.
- **운영 DB에는 실행하지 않았음.** isolated fixture는 실제 전체 Supabase 스택을 대신하지 않음.
