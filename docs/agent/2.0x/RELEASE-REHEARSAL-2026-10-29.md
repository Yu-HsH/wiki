# 운영 배포 리허설·최종 적용안 — 2026-10-29

기준 **`4830b38fee774aa8953a8740cd50563c43d0eb76` + 고정 미커밋 후보**, **2026-10-29 KST**. 이 문서의 모든 검증 수치는 이 기준·날짜의 실행값이다. 제품 소스는 이번 세션에서 수정하지 않았다. 검증기 4파일을 실제 운영 데이터가 있는 환경에 맞게 수정했다. 운영 migration/RPC/RLS 적용·Edge 배포·Vercel 변경·commit/push는 실행하지 않았다.

**판정: 배포 기술 리허설 통과, 조건부 운영 적용 승인 대기.** 검색 성공 소비의 서버 권위는 미해결이며 실제 변조로 재현됐다. 2026-10-14의 구현 보류는 이번 배포 승인이 아니다. 이 위험을 포함한 아래 고정 범위의 건별 승인이 필요하다. 서버 권위 전체 해결을 출시 조건으로 삼는 경우에는 배포 불가다. 승인 전에 추가 기능 구현이나 검색 비활성화를 하지 않았다.

## 1. 고정한 출시 후보

정확한 파일·파일별 SHA·migration별 함수 시그니처·제외 범위는 [후보 명세 JSON](RELEASE-CANDIDATE-2026-10-29.json)을 따른다. 새 Git 커밋 대신 파일 집합과 SHA-256으로 고정했다. 작업 브랜치는 `main`이며 작업 트리를 checkout/reset/stash하지 않았다.

```text
base:         4830b38fee774aa8953a8740cd50563c43d0eb76
source SHA:   c7ef6142bfa9b357d7034dfdce126cff2a81fcf1ba4786b014bd1315f1eba555
runtime SHA:  09c4531d3d9e7449298afca20e3a40d5bbb8524c71714a3d315c0dd77fd7d900
verification: 8a8b7062fa858c829d1b2956ff67d0ca18b7ad624ea30c4732e9fa3d129dd0a7
```

- 소스 명세 538파일 = 런타임 235 + Edge 10 + migration 42 + 검증 참고 소스 251. 전체 SHA에는 이 네 집합이 포함된다. 문서·개인 설정·백업·검증 결과·node_modules·dist는 포함되지 않는다.
- **실제 프론트 출시 변경은 130파일**이다. JSON `releaseChangedFiles`가 정확한 목록이다. 기존 파일은 Git diff 기준으로, 새 파일은 명시한 runtime 집합에서만 골랐다. CRLF/LF 차이만 있는 기존 파일은 변경 목록에 추가하지 않았다. 필요한 `Opening.png`, `data/*.js`, 동적 CSS·장식 이미지·현재 참조 음원도 포함해 후보 폴더 자체 빌드를 통과했다.
- **Edge 적용 입력은 5파일/2함수**: `single-run/{index.ts,start.mjs,random.mjs}`, `duel-link-preview/{index.ts,handler.mjs}`. JSON `edgeDeploy` 참조. 나머지 Edge는 배포하지 않는다. `wiki-snapshot`·`duel-random-teleport`는 앞선 운영 다운로드 대조에서 현재 소스와 LF 정규화 후 같았다 [이전 실측: LOCAL-RECOVERY §5]. `username-*`도 이번 변경 대상이 아니다.
- migration 적용 입력은 아래 10파일뿐이다. 기준 migration 32파일도 SHA 명세로 보존했지만 재적용하지 않는다.
- 검증 참고 소스 251개는 재검증용 보존 집합이며 **일괄 커밋/운영 배포 목록이 아니다**. 이번 추가 수정은 §3의 4파일뿐이다. 프론트 결과물은 후보에서 만들어진 `dist`이며 검증기/문서/백업을 공개 디렉터리로 배포하지 않는다.
- npm/`package-lock.json` 기준. 새 의존성·SDK·플러그인·외부 서비스 추가 0. `package.json` 기존 미커밋 변경은 테스트 탐색을 `tests/*.test.js`로 한정한 것이다. 고정 설치값: Supabase CLI 2.114.0, JS SDK 2.103.0, React 18.3.1, Vite 5.4.21, Playwright 1.62.1. lockfile은 보존했다 [산출물: npm ls].
- 음원 시안·납품물·개인 인계/설정·`.env*`·`supabase/config.toml`·`supabase/.temp`·snippets·독립 SQL 초안은 출시 변경에서 제외했다. 사용하지 않는 음원도 삭제하지 않았다. 초기 1,646파일 소실 0, 승인/기존 `public/audio` 53파일 SHA 동일, config/lockfile 동일. 후보에 개인 환경 키 원문이 들어가지 않았음을 값 대조로 확인했다 [산출물: preservation-final.json].

현재 후보 사본은 Git 제외 `.temp/release-rehearsal-20261029/candidate/`에 있다. 이 폴더의 `.env`는 생성하지 않았다. 빌드에는 격리 API와 공개 anon 키만 메모리로 주입했다. 운영 프론트는 승인 후 운영 공개 설정으로 다시 빌드해야 한다. 현재 로컬 검증용 dist를 운영에 그대로 올리지 않는다.

## 2. 운영 백업과 실제 격리 복원

운영 연결 대상 `ctdpyrmitljgrcgfvndn`을 대조했다. 연결 준비 결과의 자격 정보는 메모리에서만 파싱하고 표준입력으로 전달했다. 파일·명령 인자·채팅에 비밀번호를 기록하지 않았다. 운영 SQL은 read-only 세션/트랜잭션으로 실행했다. 전체 custom archive와 비밀번호 없는 roles 백업은 Git 제외 보호 폴더에만 보관했고 Windows ACL을 현재 사용자·SYSTEM·관리자로 제한했다. 백업 내용/세션/계정 정보는 공개 산출물에 넣지 않았다.

```text
archive bytes: 1,999,158
archive SHA:   ee05d18cf2b106437a0acac8c3090dd76966c89c2fbb2655a673abbfb87479dd
```

무료 로컬 Docker 프로젝트 `wiki-next-goal-release-20261029`, API 55421/DB 55422, PostgreSQL `17.6.1.158`을 새로 만들었다. 사용자 기존 프로젝트 `wiki-packet13-r2-clean158`, API 54321/DB 54322와 포트·컨테이너·볼륨을 분리했다. 새 스택 초기화에서 앱 migration/seed를 실행하지 않았다.

archive를 **빈 `rehearsal_restore_v2` DB에 pg_restore로 끝까지 복원**했다. `--no-owner`/`--no-acl`로 권한을 생략하지 않았다. 첫 postgres 역할 복원은 관리 객체 소유권 설정에서 중단됐고, 별도 새 빈 DB에서 격리 관리 역할로 다시 복원해 성공했다. 부분 복원 DB를 정상 복원으로 계산하지 않았다. 운영 원본이나 사용자 기존 로컬 DB에 `--clean`/reset/복원을 실행하지 않았다.

| 비교 범위 | 운영 백업 기준 → 실제 복원 | 결과 |
|---|---:|---|
| auth/public/private/storage/migration 73테이블 | 각 행수·전체 내용 digest | 전부 동일 |
| auth.users / identities | 각각 147 → 147 | 동일 |
| profiles | 144 → 144 | 동일 |
| 싱글 기록 / 런 | 68 / 19 → 동일 | 동일 |
| 듀얼 기록 / 그룹 결과 | 85 / 12 → 동일 | 동일 |
| XP 원장 | 33 → 33 | 동일 |
| public/private 함수 | 101개, 정의·소유자·SECURITY DEFINER·ACL | 동일 |
| 정책 | 42개 | 동일 |
| 테이블 RLS/소유자/ACL | 72개 | 유효 권한 동일 |
| 기본 권한 | 24개 | 동일 |

정책 표현은 빈 search_path로 통일했고, ACL 배열 순서와 소유자 기본 ACL의 NULL 표기를 정규화했다. 실제 권한을 제거해 비교를 맞춘 것이 아니다. 앱 접속 역할의 authenticator 멤버십은 동일하다. 플랫폼 전체 역할은 완전 동일하다고 주장하지 않는다: 임시 CLI 로그인 역할 방향, 로컬 Realtime 역할의 anon/authenticated/service_role 멤버십, local `supabase_functions_admin` 등이 다르며 `restore-comparison.json`에 분리했다. 실제 anon/authenticated/service 권한 경계는 복사 DB의 pgTAP·실제 인증 API에서 별도로 검증했다.

기존 운영 계정의 비밀번호/세션을 사용한 로그인은 수행하지 않았다. 계정 행 전체의 지문 일치로 저장된 인증 데이터 복원을 확인했고, 실제 로그인·JWT 검증은 격리 DB에 새로 만든 테스트 계정으로 수행했다.

검증 복원본은 보존하고 복사본을 API용 `postgres` DB로 활성화했다. 별도 `rehearsal_migration_audit` 복사 DB는 migration 데이터 비교 전용이다. 운영에는 없는 **로컬 플랫폼 관리 스키마 `_realtime`**가 필요해 격리 초기 DB에서 테스트 복사 DB로만 복원했다. 이 전에는 Realtime 재시작/그룹 요청 연결 종료가 있었고, 보완 후 Realtime 양방향 신호·그룹 전체 흐름이 통과했다. 앱의 public/private/auth/storage를 다른 로컬 데이터로 덮지 않았다. 운영에 `_realtime`을 추가할 계획은 없다.

Storage는 DB 객체 메타데이터 1행까지 비교했다. Storage 바이너리 본체의 별도 다운로드·복구 리허설은 이번 DB 백업에 포함하지 않는다. 이번 출시에는 Storage 객체 변경이 없다. 이 백업은 실행 시점의 새 운영 백업을 대체하지 않는다.

근거: Git 제외 `.temp/release-rehearsal-20261029/{backup.mjs,restore.mjs,compare.mjs,restore-comparison.json,platform-adapter.mjs,data-audit.mjs,migration-data-comparison.json}`와 보호된 archive/복원 로그/지문. 개인정보 원문을 문서로 이동하지 않았다.

## 3. 10건 순차 적용·최종 조합 검증

실제 운영 이력 32개를 복원한 테스트 DB에 **공식 CLI `db push --local`로 10개만 순서대로 적용**, 42개/pending 0을 확인했다. 원문 migration을 수정하지 않았고 seed·repair·과거 migration 재작성은 없었다. 테스트와 섞이지 않은 별도 복사 DB에도 같은 원문 SQL을 적용해 기존 컬럼 데이터를 비교했다. **업무 72테이블 중 71개 완전 동일**, 업무 데이터 차이는 `daily_challenge_pool` 12→17행이다. 기존 계정·기록·런·XP는 동일하다. 비교 전용 DB는 원문 SQL만 적용하여 migration 이력을 수동으로 꾸미지 않았고, **공식 CLI 적용 DB의 이력 10행 추가는 별도의 예정된 변경**이다. 새 컬럼·테이블은 이 보존 비교와 별도로 검사했다.

| 검증 | 이번 결과·근거 |
|---|---|
| Node / 빌드 | 682/682, 후보 자체 production build 성공(306모듈), diff check 성공. 기존 500kB 청크 경고 유지. lint 스크립트 없음 |
| 전체 pgTAP | 28파일 1,500/1,500. 인증·권한·RLS·이동·보상·중복·신/구 API 포함. 의도적으로 지급 실패를 만드는 테스트의 경고는 성공으로 오인하지 않았고 TAP 판정을 따름 |
| 새 랜덤 | 회원/게스트, 1440/768/390, 준비·예약·실제 시작·완주·20 XP/게스트 영구 기록 0·F5·skip/reduced motion, 8케이스 62검사. 외부 문서 HTTP만 fixture, Auth/Deno/wiki-snapshot/RPC/DB/React는 실제 |
| 커스텀/데일리 | 각각 예약→완주→15/25 XP→결과 F5, 7검사씩. 신/구 계약 실제 혼재 랭킹·목록/개인 순위·프로필·계약 간 지급 중복 방지 9검사. NULL 계약과 새 계약 기록을 둘 다 실제 API로 생성 |
| 듀얼 | 새 프론트 19검사. 대기실→정상 완주·양쪽 결과/XP/F5, 직접 SELECT 본인 행 제한·RPC 상대 경로 마스킹, Realtime 본인 비공개 신호/공개 진행 신호, 실제 random-teleport Edge/위키 문서, 기권·F5 |
| 그룹 | 새 프론트 3계정 준비·시작·개인 완주·관전·최종 순위/XP·F5·390px, 7검사. 실제 Auth/RPC/Realtime/DB 사용, 문서 fixture. final 화면 재조회 중단·원장 불변 확인 |
| 미리보기 보안/경합 | 실제 Auth/DB + 동일 handler + 요약 fixture 17검사. 4개 동시 예약 중 3개만 허용, 동일 대상 재조회 무료, 타인/다른 방·authenticated 위조 정산 거부, 실패/재시도/만료·이동·F5·종료 경합 |
| 실제 외부 미리보기 | 무수정 Deno wiki-snapshot으로 대한민국/훈민정음 조회. **390px 실제 새 UI → duel-link-preview → 실제 Wikipedia 서울특별시 요약 → 비어 있지 않은 extract 표시 → 서버 used=1**. Wikipedia·Edge 응답 대체 없음 |
| 동시성 | 싱글 회원/게스트 각 12개 할당·예약/완주 요청, 런/이동/결과/XP 단일 확정(5검사). 듀얼 3시나리오×5회, 교착 0. 그룹 전체 하니스 exit 0: 방장 이탈, hard/grace 잠금 순서·마감 동등 경계·동시 3위 완주 |
| 검색 | 정상 정책과 클라이언트 변조 재현 9검사. **검증기가 통과한 것은 취약점 재현에 성공했다는 뜻이며 보안 해결이 아님** (§6) |

이번에 고친 것은 다음 **검증기 4파일**이다. 제품 동작·migration·음원 수정 0이다.

1. `supabase/tests/achievements_rewards_v1.sql`: 비활성 업적 검사가 모든 사용자의 진행 행을 0으로 가정하던 쿼리를 해당 테스트 사용자로 한정했다. 첫 pgTAP은 1개 실패했고 수정 후 전량 통과했다.
2. `scripts/release-validation-local-smoke.mjs`: 추천 후보가 fixture 1개뿐이라는 가정 대신 실제 선택 결과가 추천/easy 후보인지 검사했다. 기존 운영 후보가 포함된 복원 DB에서도 테스트를 검증할 수 있게 했다.
3. `scripts/verify-single-random-browser.mjs`, `scripts/verify-single-start-browser.mjs`: 상위 50개 목록 길이와 전체 기록 수가 항상 같다는 가정을 제거했다. 전체 count는 SQL 실제 수와, 목록은 `min(50,total)`과 비교한다. 첫 혼재 검증에서 73≠50으로 실패한 기록을 남겼고 재실행 통과했다.

별도 리허설 어댑터는 `.temp`에만 두었다. 프론트 root를 고정 후보 또는 이전 소스로 지정하고, DB 대상은 기존 `validationTarget()`의 격리 허용 경로/프로젝트/포트 검사에 걸었다. 운영/기존 로컬로 fixture SQL을 보내는 우회는 만들지 않았다. 첫 복원 권한 실패·검증기 생성 오류·옛 화면 선택자/기대 동작 오인·Realtime 초기 실패 기록은 성공 결과와 분리했다.

재검증 예시(격리 스택이 실행 중일 때만; 일반 테스트를 사용자 DB에 보내지 않는다):

```powershell
node .temp/release-rehearsal-20261029/verify.mjs node
node .temp/release-rehearsal-20261029/verify.mjs build
node .temp/release-rehearsal-20261029/verify.mjs tap
node .temp/release-rehearsal-20261029/final-audit.mjs
```

## 4. 운영에 적용할 정확한 순서와 중간 상태

아래는 **아직 실행하지 않은 승인 대상**이다. 사용자 로컬 복구 승인을 운영 승인으로 확장하지 않는다. 최종 후보 해시·변경 목록을 먼저 재검사하고, 새 운영 백업/격리 복원 증명 및 실행 직전 drift 확인을 수행한다. 이력/정의가 달라졌다면 중지하고 재검토한다.

| 순서 | 기존 migration 파일 | 적용 객체·데이터 영향 |
|---:|---|---|
| 1 | `20261009030624_daily_course_identity_v2.sql` | daily identity guard/best records/기존 daily ranking/싱글 XP 함수. 이후 정상 daily 자격 판단, 과거 기록·XP 수정 없음 |
| 2 | `20261009032309_daily_course_pool_verified_v2.sql` | verified 컬럼·CHECK/ensure 함수·검증 후보 5개. 복원본에서 pool만 12→17, 기존 사용 코스 보호 |
| 3 | `20261009033227_explorer_xp_rankings_v2.sql` | XP ranking/개인 daily rank RPC. XP 재계산 없음 |
| 4 | `20261009051855_explorer_xp_grant_timestamp_fix.sql` | 주간 XP ranking을 granted_at 기준으로 교체. 원장 업데이트 없음 |
| 5 | `20261014052928_duel_link_censorship_authority_v1.sql` | 기존 `use_duel_item_v3`/`apply_duel_move_v2` 본문, 검열 서버 검증 |
| 6 | `20261014073626_duel_public_move_authority_v1.sql` | `apply_duel_move_v2` 최종 본문. 공개 RPC의 비정상 item 이동 거부, 기존 정상 링크 계약 유지 |
| 7 | `20261014103131_duel_preview_authority_v1.sql` | private 미리보기 3테이블·RLS·인덱스·state/reserve/settle 함수. authenticated 예약, service_role 정산, 직접 테이블 접근 금지 |
| 8 | `20261015061829_single_reserved_start_v1.sql` | 예약/시간 계약 컬럼, private allocation, guard/resolve/copy trigger·claim/commit/control 및 기존 get/move/leave 함수. 기존 timing NULL 유지 |
| 9 | `20261015062624_single_timing_rankings_v1.sql` | 계약별 daily best/ranking/개인 rank와 인덱스. 과거 시간값 변환 없음 |
| 10 | `20261015233503_single_random_reserved_v1.sql` | claim/commit 최종 랜덤 예약 계약. 기존 런·보상 재작성 없음 |

모든 경로는 `supabase/migrations/` 아래다. **함수 전체 이름·인자·파일 SHA는 후보 JSON `migrations[].functions`에 있으며 같은 함수가 후속 파일에서 교체되는 순서까지 명시한다.** 개별 함수만 복사해 적용하지 않는다. 적용 후 이력 42/pending 0 및 실제 컬럼·함수·ACL/RLS를 함께 확인한다.

DB 다음은 Edge **`single-run` → `duel-link-preview`**, 마지막은 프론트다. 인증은 single-run의 member JWT/guest token 검증 및 preview의 `auth.getUser()`와 정산 권한 경계를 그대로 사용한다. 원격 함수 전체 배포나 `--prune`를 사용하지 않는다.

승인 후 사용할 Edge 명령(현재 미실행; 먼저 후보 바이트 재검사):

```powershell
node node_modules/supabase/dist/supabase.js functions deploy single-run --project-ref ctdpyrmitljgrcgfvndn --no-verify-jwt --use-api
node node_modules/supabase/dist/supabase.js functions deploy duel-link-preview --project-ref ctdpyrmitljgrcgfvndn --no-verify-jwt --use-api
```

DB 적용은 승인된 10파일만 pending임을 재확인한 후 linked 공식 migration runner로 수행한다. 이 문서의 로컬 테스트/seed SQL을 운영에서 실행하지 않는다. 프론트는 JSON의 출시 변경 목록만 검토·커밋한 승인된 release SHA를 대상으로 main 반영한다. **현재 HEAD를 그대로 push하거나 `git add .`로 전체 미커밋을 커밋하지 않는다.** main push는 즉시 Vercel Production 배포이므로 별도 건별 승인이 필요하다.

| 격리에서 확인한 조합 | 결과·제한 |
|---|---|
| 신 DB + 이전 프론트4830b38 + 이전 single-run | 기존 회원/게스트 런 복구→완주/XP→F5, 8검사 통과 |
| 신 DB + 이전 프론트4830b38 + 새 single-run | 같은 기존 API 흐름 8검사 통과. Edge 선행 배포 시 이전 싱글 클라이언트 호환 확인 |
| 신 DB + 새 프론트 + 새 Edge | 신규 예약 싱글·듀얼·그룹 및 기존 NULL 계약 런 복구 8검사/혼재 랭킹 통과 |
| 신 DB + 새 예약 런 + 이전 single-run | 새 `snapshot_v1`은 `UNSUPPORTED_ACTION`; 이전 `snapshot`은 행만 읽음. 이전 Edge로의 단순 복귀 불가 |

이전 싱글 프론트는 완료 후 F5에서 **로비 이동이 원래 계약**이다 (`previous/pages/GamePage.jsx`의 completed 분기). 최초 검증기가 새 결과 유지 동작을 기대해 timeout이 있었으나, 코드와 실제 로비 복귀/기록 단일 행을 확인해 기존 계약으로 판정했다. 이전 프론트를 수정해서 통과시킨 것이 아니다. 이전 듀얼/그룹 UI 전체 조합을 별도로 재생한 것은 아니며, 이들 기존 RPC 계약/권한은 전체 pgTAP·새 UI 회귀와 소스 대조로 확인했다.

원격 main과 feat는 이번 `git ls-remote`에서도 모두 `4830b38...`이었다 [산출물, 2026-10-29]. 실제 Production Ready/고정 배포 ID `Fg9XeDWqCDJ5LNSz71Xn3kzJKbYf`는 앞선 같은 날짜 로컬 복구 보고서 §5의 dashboard 실측을 인용한다. 이번에 Vercel 배포/승격/Instant Rollback을 실행하지 않았다. Vercel 자체 배포 성공은 운영 승인 후 확인해야 한다.

## 5. 복귀 절차 — DB 전체 덮어쓰기 기본 사용 금지

**기본은 확장 DB를 유지하고 프론트 변경 범위를 되돌리는 것**이다. 새 Edge는 기존 API를 유지하므로 신·구 클라이언트가 공존하는 동안 유지하는 편이 안전하다. SQL DOWN, migration 이력 삭제, 보상/계정 롤백, 전체 운영 DB 덮어쓰기를 하지 않는다.

1. **DB만 적용한 시점의 문제:** 프론트·Edge는 기존 배포를 유지한다. 실제 적용 이력과 정의를 확인하고 실패 지점 이후를 재평가한다. 성공한 파일을 재실행하거나 repair로 덮지 않는다. 필요한 보정은 새 forward migration을 검토·승인받는다.
2. **Edge 적용 후 프론트 전 문제:** 기존 프론트를 유지한다. legacy API 호환은 위 중간 상태에서 확인했다. 새 예약 요청이 아직 없다면 Edge별 문제를 좁혀 판단하되, 캐시된 새 클라이언트가 없음을 단순 활성 런 수만으로 단정하지 않는다.
3. **새 프론트 노출 후 문제:** 먼저 새 예약/경기가 더 생기지 않는 운영 창을 확보하고, `timing_contract='single_reserved_prefetch_v1'`의 prepared/scheduled/active 런·활성 듀얼/그룹과 캐시된 새 클라이언트를 조사한다. completed 기록/XP는 그대로 둔다. 이전 프론트 artifact로 복귀해도 새 예약 상태의 UI 복구는 보장되지 않으므로 **새 Edge는 유지**한다.
4. **새 예약 런 정리:** 가능한 런은 새 호환 프론트/Edge에서 정상 완료시키거나 소유자의 `leave_v1`로 포기한다. 소유자 접근이 불가능한 런을 운영자가 정리해야 한다면 목록·대상·사유를 확정하고 service_role `control_single_start_v1(...,'leave')`를 쓰는 별도 제한된 승인안으로 처리한다. 게스트 hash/토큰을 문서·쿼리 결과에 노출하지 않는다. 무차별 UPDATE/DELETE나 임의 완료·XP 지급을 하지 않는다.
5. **Edge까지 이전 버전으로 내려야 하는 경우:** 모든 신계약 활성 런을 해소하는 것 외에 **새 API를 호출하는 캐시 클라이언트의 재유입도 차단/갱신**해야 한다. 런 0만으로 충분하지 않다. 이전 Edge에는 allocate/reserve_start/start/document/snapshot_v1/leave_v1가 없어 재유입하면 즉시 실패한다. 실질적인 기본 복귀는 DB·새 Edge 유지 + 프론트 이전 artifact다. 새 미리보기 endpoint도 구 artifact에 없다는 이유만으로 삭제하지 않는다.

실제 리허설에서는 새 guest scheduled 런을 만든 뒤 이전 Edge로 바꾸자 새 조회가 거부됐고, 다시 새 Edge로 바꾸면 **같은 run ID·예약 시각이 복구**됐다. 이후 소유자 leave_v1로 abandoned/결과 0건을 확인했다. 데이터·시간 계약을 옛 기준으로 강제 변환하지 않았다 [산출물: live-and-rollback.json].

전체 DB 복원은 실제 데이터 손상 등 별도 사고 대응에서만 검토한다. 그 경우에도 백업 이후 생성된 계정·기록·XP를 먼저 별도 보존하고, 선택적 복구/forward 보정을 우선 검토한다. 이번 격리 복원 성공을 운영 전체 덮어쓰기 승인으로 취급하지 않는다.

## 6. 검색 성공 소비 보류 — 현재에도 재현

**미해결.** `pages/MultiplayerGamePage.jsx`는 `searchAvailable/searchPermit`를 React 상태로 관리하고 `onConsumeSearch={() => setSearchAvailable(false)}`를 전달한다. `components/WikiViewer.jsx`는 정제된 DOM의 개별 텍스트 노드에서 검색하고 성공 시 이 콜백만 실행한다. 서버는 `use_duel_item_v3`로 아이템 활성화·15초 기간·grant 1회 사용을 확정하지만, **성공한 검색어/소비를 확정하는 서버 RPC·원장은 없다** [코드].

격리 복사 DB/고정 새 프론트에서 다음을 실제 재현했다.

1. search_once 사용 후 정상 검색 `검증`은 성공하고, 두 번째 `로컬` 검색은 정상 UI에서 거부된다.
2. 브라우저 React 상태의 검색 가능 값을 다시 true로 변경한다. 화면/응답을 fixture 성공으로 바꾸지 않았다.
3. 같은 아이템 이벤트로 `로컬` 검색이 다시 성공하고 하이라이트가 바뀐다. **duel_item_events 행은 전후 완전 동일**하다. 서버 성공 소비가 없다는 점을 확인했다.

영향은 개발자 도구/변조 클라이언트가 성공 1회 UI 제한을 우회할 수 있다는 것이다. 정상 UI의 빈 입력/미발견 미소비·성공 1회·15초 만료·이동/F5 미재개와 grant 활성화 중복 방지는 통과했지만, 이것으로 서버 권한 검증 완료라고 판단하지 않는다. 이 우회가 임의 이동/XP 조작까지 허용함을 뜻하지는 않으며 해당 이동/보상은 별도 서버 권위 검증을 거친다.

기존 결정은 [WIKIRACE-NEXT-GOAL-HANDOFF.md §확정 목표](WIKIRACE-NEXT-GOAL-HANDOFF.md)와 CURRENT의 2026-10-15 기록이다 [사용자 결정, 2026-10-14]. 현재 화면 최신 본문·서버 snapshot revision·정제/텍스트 노드 기준이 다르므로, 요약/합친 문자열/클라이언트 성공 주장만으로 서버 소비를 승인하면 같은 검색을 검증하지 못한다. 같은 본문 공급 계약·파싱·저장 비용까지 영향을 주어 사용자가 구현을 보류했다. 이번에는 보류 범위를 확대하거나 기능을 끄지 않았다.

**권고:** 현재 미해결 위험을 명시적으로 수용하는 조건부 배포만 승인 대상으로 제시한다. 검색 성공까지 서버 권위여야 한다면 이번 배포를 승인하지 않고 별도 설계/검증을 해야 한다. 이전 보류를 자동 출시 승인으로 해석하지 않는다.

## 7. 최종 승인 범위·남은 확인

- 승인 요청 범위는 **고정 후보의 DB 10건 → Edge 2함수 → 프론트130변경파일의 승인된 release commit/Production 배포**다. 이번 요청은 리허설 준비였으므로 이를 실행하지 않았다. 사용자 기존 작업을 일괄 커밋하지 않았다.
- 실행 직전 운영 drift·활성 경기·새 백업을 다시 확인해야 한다. 운영에는 fixture/seed/pgTAP을 보내지 않는다. 승인 후 실제 UI로 싱글 각 모드·듀얼/그룹·미리보기·F5/보상 확인을 한다. 배포 후 Vercel Production SHA/Ready와 `git ls-remote origin refs/heads/main`을 함께 대조한다.
- 검색 위험 (§6), 캐시된 새 프론트가 존재할 때 옛 Edge 복귀 불가 (§5), Vercel 실승격/실롤백 미실행, Storage 본체 복구 미검증, 실기기/Safari/OS suspend는 잔여 사항이다. 정상 UI 검사로 이 범위를 해결 처리하지 않는다.
- 최종 정리에서 **이번 프로젝트 컨테이너 9개만 중지하고 볼륨/복원 증거를 보존했다**. DB 컨테이너 restartCount 0을 확인했고, 테스트용 Edge 응답 어댑터를 고정 원본으로 교체했다. 사용자 기존 DB는 계속 실행 중이다 [산출물: closed-environment.json]. 재개는 대상 경로/프로젝트를 다시 대조한 뒤 별도 격리 `start`로 수행한다.

새 유료 리소스 0, 운영 DB/Edge/Vercel 적용 0, commit/push 0. 본문 수치의 원시 증거는 Git 제외 `.temp/release-rehearsal-20261029/`와 보호 백업에 남겼다. 원격 백업·자격 정보는 후보 JSON이나 채팅에 포함하지 않았다.
