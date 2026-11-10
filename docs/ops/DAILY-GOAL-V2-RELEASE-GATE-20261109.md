# 오늘의 도전 목표 단어 v2 운영 반영 게이트 — 2026-11-09

**현재 상태: 배포 후보 / 운영 미적용 / 최종 운영 승인 필요.**

## 승인 범위와 설계

- PR #47의 공식 Wikipedia identity audit: 목표 24/24 namespace 0, 동음이의어 0, 역링크 100개 이상 표본(전체 조회 아님), WikiViewer 실제 대표 링크 9/9 PASS.
- PR #48 신규 22개 목표 등록: 기존 활성 17개 보존 → 운영 적용 후 활성 39개.
- 목표와 출발은 `daily_challenge_pool.target_title`의 **하나의 공용 단어 풀**. 캐시 그래프에서 방향 있는 연결이 관측된 순서쌍만 사전 생성.
- **이동 횟수 제한, 최단거리, N회 경로 점수는 전혀 사용하지 않음.** 캐시로 관측한 연결이 실제 라이브 WikiViewer의 모든 이동을 보장하지는 않음.
- 2026-11-09 읽기 전용 운영 캐시 측정: 829개 방향별 조합 / 23개 출발 / 37개 목표. 남는 2개(백준 온라인 저지, 레드벨벳 (아이돌))는 이번 캐시에서 목표로 연결된 증거가 없음.
- 하루 목표를 먼저 균등 추첨, 그 목표의 출발을 고름. 목표 최근 7일·출발 최근 3일·동일 쌍 최근 30일은 **소프트** 억제.
- 검증 고정 5개 코스는 캐시 증거가 사라진 때도 살려둔 비상 대안. 기존 오늘/과거 코스, XP, 기록, 순위 저장 로직 변경 없음.

## 코드 및 검증 위치

- 실행 대상 마이그레이션: `supabase/migrations/20261109102652_daily_word_pool_goal_first_v2.sql`
- 22개 SQL 단독 실험: `scripts/sql/daily-goal-22-targets-staged-20261109.sql` (**단독 운영 실행 금지**)
- 829개 연구 증거: `data/research/daily-goal-cached-reachable-pairs-20261109.json`
- 실제 PostgreSQL 17 격리 CI: 39개 등록, 비대칭 유향 그래프, 30일 가상 출제, 두 동시 RPC 요청 하루 1코스, 기존 오늘 코스 불변, RLS PASS
- 829 후보 기반 30일 가상 출제: 목표 22~24개, 출발 17~19개(시드별 결과), 7일 목표 재출제 없음.
- 긴급 원복: `docs/ops/sql/daily-goal-v2-emergency-rollback-20261109.sql` (기존 함수 복원·신규 22개 비활성화, **이미 발행된 코스는 절대 수정하지 않음**)

## 운영 적용 전 순서

1. 병렬 작업 종료와 운영 원격 `main` 최신 SHA 확인. 같은 파일 및 신규 Supabase migration 충돌 없는지 비교.
2. `supabase_migrations.schema_migrations`에 20261109022138, 20261109031938 등 다른 세션의 최신 이력이 반영되었는지 확인. 이 PR의 20261109102652은 아직 없어야 함.
3. 현재 함수 DDL 및 `daily_challenge_pool`, `daily_challenges`, `game_records`, `single_game_runs`의 관련 행 수와 오늘 확정 코스 백업, DB 복원 가능성/유지보수 게이트 확인.
4. 운영과 버전이 맞는 격리 Supabase 환경에서 migration reset, fallback, 기존 서비스 RPC/프론트 회귀 검사 통과. **격리 스택의 실패를 운영에서 반복 시험하지 않음.**
5. 사용자 운영 배포 승인 후 GitHub PR 병합. 다른 pending migration이 있으면 재평가하고, 단 하나의 담당자가 정식 CLI `supabase db push --remote` 또는 승인된 migrations 배포 경로로 적용. SQL Editor 수동 22개 입력 금지.
6. 적용 후 읽기 전용 확인:
   - 후보 활성 총 39개, 신규 200..221 총 22개, 신규 힌트 모두 존재.
   - `daily_course_pairs_v2` 100개 이상, 목표 종류 20개 이상(스냅샷 환경에 따른 보수적 게이트).
   - 새 테이블 RLS, anon/authenticated SELECT 불가.
   - 오늘 KST `daily_challenges` 한 행과 발급된 시작·목표가 적용 전과 동일.
   - `private.choose_daily_course_goal_first_v2(KST 내일)` 조회만으로 다음날 가상 후보가 생성됨(실제 INSERT 없음).
7. KST 자정 이후 최초 일일 확정 시 도전 준비·실제 회원 클릭 완주·F5 복구·기록 및 랭킹 표출 검사. 필요 시 게이트로 신규 시작 차단.

## 롤백

- 배포 전 DB 함수 본문과 후보 데이터 백업을 먼저 마련한다.
- 긴급 문제 발생 시 **오늘 코스 삭제/재선정 금지**, 신규 단어 22개 비활성화 및 이전 함수 복원(시험 완료된 긴급 스크립트).
- 정식 migration 이력은 남으므로 그 뒤 같은 내용의 forward corrective migration으로 원복 이력을 정리해야 한다. 임의 migration repair 또는 생산성 핫픽스로 히스토리를 조작하지 않는다.

## 위험 고지

- 캐시 기반 간접 연결의 존재는 모든 문서 링크가 라이브 WikiViewer에서 표시·클릭된다는 보장이 아니다. 대표 9개 콜백은 통과했지만 829개 전수 플레이 테스트는 아니었다.
- 프로덕션 첫 선정은 KST 00:00 이후이며, **배포 시점의 오늘 코스는 유지된다.**
- 새 단어를 미래에 더 등록할 때는 `private.refresh_daily_course_pairs_v2()`를 관리자 권한으로 갱신해야 한다. 운영 회원에게 자동 호출 권한을 부여하지 않는다.
- 마이그레이션 한 건의 RLS/함수 권한만 다루며 별도 싱글·듀얼·그룹 업데이트는 포함하지 않는다.
