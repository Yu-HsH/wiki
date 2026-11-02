# 보안 후보 확정 재검증 — 2026-11-02 KST

판정: **보안 후보 커밋·CI 진행 가능 / 실제 출시 HOLD**. 운영 DB·Edge·main·Production은 변경하지 않는다. 아래 종전 보고서는 최초 로컬 개발 기록이며, 현재 결과는 이 절이 우선한다.

기준은 main 8da7d25 + 이 문서와 함께 커밋되는 보안 소스15파일이다. raw-byte fingerprint: cbf54fad74561ece1225165c6b894cb2bc59fd12d4bb0a9cd82334d2cbee0e20. 변경 파일은 소스15 + 문서2이며 .temp·build·자격정보는 제외한다. CURRENT.md는 트랙 규칙에 따라 수정하지 않는다.

- npm test **756/756**, build 성공, diff --check 성공 — 2026-11-02, 위 미커밋 소스 기준으로 재실행. 실제 SQL 신규23/23 + 기존 아이템157/157, 실제 Deno/Auth/RPC/React 통합19/19 재실행. 429·identity·timeout 오류 주입3개가 기존16개에 추가됐으며 timeout은12,094ms에 실패 안전 처리됐다.
- 디자인746과 보안756의 공통 검사는741. 디자인 전용5(에셋·진입·인증·접근성)와 보안 전용15(정제·인증·서버 판정)가 각각 추가됐다. 삭제·skip 검사는0. 통합 예상761개. Windows publicRooms 검사4개 정규식의 CRLF 허용 수정은 디자인과 같은 변경이며 검증 조건/개수는 그대로다.
- RLS3테이블 활성, 직접 ACL은 postgres만. source RPC는 authenticated만, cache put/commit은 service_role만, guard는 postgres만. SECURITY DEFINER4개 모두 빈 search_path. 실제 일반회원 commit은42501, 성공 주장 필드는400이다.
- verify_jwt=false는 handler getUser 검증과 한 계약이다. 누락/anon/위조/정상 서명된 만료 JWT 거부를 실제 Deno/Auth 경로로 확인한다.
- parse5 7.3.0은 서버 HTML5 파싱과 브라우저 동일 텍스트 판정을 위해 고정했다. 정규식만으로 HTML5 table/entity/text-node 정합성을 보장할 수 없어 채택했다. 브라우저 런타임 의존성에는 넣지 않았다. Supabase Edge Runtime1.74.3/Deno2.1.4 실제 eszip 번들 생성 성공, 추가 설치/배포는 없다.
- 응답 Server-Timing은 auth/source/html_fetch/parse/hash/cache_write/match/commit/total의 소요 시간만 제공한다. 검색어·토큰·사용자 ID는 포함하지 않는다. 15초 deadline·쿨타임·슬롯·XP·결과 로직은 변경하지 않는다.
- scripts/benchmark-duel-search-local.mjs는 localhost55421/project/container를 강제하고 실제 Wikipedia HTML만 읽는다. 로컬 테스트 계정·경기만 생성/정리한다. 원문 corpus와 로그는 Git 제외다.

실제 문서5종 × Cold5/Warm10 =75회 중68회 성공/7회 WORKER_LIMIT. 모든 실패는 5,696,443byte 문서의 cache miss에서 발생했고 CPU hard limit 로그가 일치한다. 해당 문서 Cold는1/5 성공, 예정 Warm10회 중 처음4회는 실제로 cache miss(3실패/1성공)였다. **이를 Warm hit로 집계하지 않는다**. 실제 Warm hit6회는 모두 성공(약182~201ms). 원래15초는 연장하지 않았고 실패는 usable time0이다. 큰 문서 반복 실패 때문에 성능 출시 게이트는 HOLD다. CPU 예산 안에서의 정제 개선과 prewarm/캐시 수명 설계를 별도 검증한 후 재판정해야 한다.

산출물: .temp/final-npm-test.log, final-build.log, audit-pgtap-search.log, audit-pgtap-items.log, final-integration.log, duel-search-authority/report.json, duel-search-performance/measurements.json. 통합 브랜치의 별도 성능·Cutover 보고서가 출시 후보 SHA/CI/Preview와 현재 결론을 기록한다.

---

## 최초 로컬 개발 기록 (아래 미커밋/미push 표시는 당시 상태)

# 검색 성공 소비 서버 권위 — 로컬 보완 및 운영 영향 검토

상태: **로컬 수정·검증 완료 / 운영 미적용 / Jungle65 출시 HOLD**.

기준: `8da7d25f4c364f431f8baf8b1abc685a3bee9e6e` + 보안 보완 미커밋 작업 트리, 2026-11-02 KST 확인. 소스14파일 fingerprint: `873f432929d993b5fed9a008660051df34e2442ae988af669979e10dc1d7473e` — 정렬된 문서 제외 변경 경로 + NUL + 각 파일 원시 bytes SHA-256 + LF. 명세는 `.temp/source-manifest.json` [산출물].

## 1. 디자인 후보와 작업 범위

|구분|기준/상태|
|---|---|
|동결 디자인|`27e5056d2780e84bd107e64d10684be63fd204aa`, [PR #7](https://github.com/Yu-HsH/wiki/pull/7), 원격 feature에 보존|
|디자인 CI/Preview|GitHub Actions 41409205514 성공, Vercel `G4KNeE3psSnd767xzVcGyLjQYfcG` Ready/같은SHA|
|현재 보안 작업|`codex/search-consumption-authority-20261102`, main `8da7d25` 기반 별도 worktree, 미커밋·미push|
|운영|main/Production `8da7d25` 유지, 검색 보안 수정 미적용|

사용자는 이번 디자인 후보에 대한 기존 검색 우회 위험 수용을 거절하고, 보안 수정과 로컬 검증을 먼저 요청했다. 운영 migration/Edge 변경·Production 배포는 승인되지 않았다. 이 작업은 디자인 CSS·에셋·레이아웃을 포함하지 않는다.

보관 위치: `C:/Project/wiki-jungle65/.worktrees/search-consumption-authority-20261102`. 임시 산출물 정리와 분리했고, 원본 작업 트리의 로컬 Git exclude로만 숨겼다. 원본 `.gitignore`나 디자인 commit은 바꾸지 않았다.

이 트리의 `CURRENT.md`는 2026-10-29 기준으로 main보다47커밋 뒤처진 역사적 상태다. 작업 전 보고했고 트랙의 CURRENT 수정 금지 규칙에 따라 변경하지 않았다. 디자인 트리의 CURRENT/HOLD 메모와 이 별도 보고서로 인계한다.

## 2. 바뀐 동작과 이유 [코드]

이전 1:1 검색은 표시된 DOM에서 먼저 강조한 뒤 React boolean만 껐다. 그 boolean을 변조하면 다른 단어도 성공시킬 수 있었고 서버에 성공 소비 기록이 없었다.

이제 기존 아이템 활성화 트랜잭션에서 **활성화 event별 서버 세션**을 만든다. 방·사용자·snapshot/page/revision·진행 frame·기존 만료 시각을 함께 고정한다. 지급·슬롯·쿨타임·기존15초 만료·경기 이동·결과/XP 규칙은 바꾸지 않았다.

기존 슬롯 소비는 활성화 때 확정된다. 이번에 서버로 옮긴 값은 그 활성화에 주어진 **성공 검색1회 예산**이다. 빈 입력·미발견은 이 성공 예산을 보존한다.

새 `duel-search` Edge는 유효한 회원 JWT를 `auth.getUser`로 검증한다. 서버가 현재 고정 revision의 HTML을 기존 wiki-snapshot에서 받고 정제한 뒤 hash와 텍스트 노드를 private cache에 저장한다. 화면도 이 **같은 서버 정제 HTML**을 표시한다. 클라이언트의 HTML·일치 개수·성공 주장·사용자ID는 요청 입력으로 받지 않는다.

검색 판정은 서버에서 기존과 같은 literal 정규식 `gi` 및 텍스트 노드별 검색으로 계산한다. service_role 전용 commit RPC가 방→참가자→검색 세션 순으로 잠근 후, 소유권·진행 상태·실제 현재 시각·문서 frame·hash를 다시 확인한다. 첫 양성 결과만 성공 소비를 기록한다. 빈 입력은 요청 전/서버 검증에서 거부하고, 미발견은 소비하지 않는다.

같은 request ID·검색어·hash 재전송은 저장 결과를 재사용한다. 같은 ID를 다른 검색어에 붙이면 충돌로 거부하며, 새 요청 ID로 두 번째 성공을 시도하면 `SEARCH_USED`다. 이동 후 돌아와도 활성화 이후 move event가 있으면 무효다. 기존 아이템 이벤트는 append-only로 유지하고 별도 private 세션/요청 기록에 성공을 저장한다.

React는 서버 승인 전에는 강조하지 않는다. 준비 중 문서/경기/컴포넌트가 바뀐 응답은 적용하지 않는다. 응답이 유실되면 같은 검색 요청 ID로 복구한다. F5에서는 검색 패널을 복원하지 않고 서버 소비 상태도 초기화하지 않는다. 싱글·그룹에는 기존 viewer 계약을 유지한다.

검색 HTML 준비는 기존 전체 아이템 busy 시간을 늘리지 않도록 별도 비동기 처리한다. 기존 APPLIED 분기 안에서만 연출을 실행하는 조건은 유지했다. 마지막 재검증의 구형 소스 문자열 검사 공백 불일치는 호출 표기를 기존 형식에 맞춰 해결했고, 로컬 Edge hot reload 연결 중단은 기동 대기를 추가한 뒤 전체 검사를 다시 통과했다. 실패를 삭제하거나 성공으로 계산하지 않았다.

## 3. 수정 파일

|파일|변경 이유|
|---|---|
|`pages/MultiplayerGamePage.jsx`|서버 본문 준비·요청 ID 재사용·승인 후 상태 갱신·비동기 문서 변경 차단|
|`components/WikiViewer.jsx`|서버 승인 후에만 강조, 중복 클릭 대기, finite 1:1 permit의 클라이언트 fallback 차단|
|`services/duelSearchService.js`|새 회원 Edge 호출, 실패 시 닫힌 상태 유지|
|`supabase/functions/duel-search/{index.ts,handler.mjs,document.mjs}`|회원 검증·고정 문서 공급·정제/검색·요청 스키마 검증|
|`supabase/migrations/20261102090000_duel_search_authority_v1.sql`|신규 private 저장소3개·RPC3개·private guard1개·기존 활성화의 source capture|
|`supabase/config.toml`|새 함수의 명시적 handler 인증 계약 선언|
|`package.json`, `package-lock.json`|parse5 7.3.0을 devDependency로 고정. Edge도 같은 버전을 사용하며 브라우저 번들에는 추가하지 않음|
|`tests/duelSearchAuthority.test.js`|HTML·literal 검색·회원/요청/변조/만료 거부 단위 검증|
|`supabase/tests/duel_search_authority_v1.sql`|실제 DB의 권한·15초·소비·중복·frame·종료 검증, 전부 rollback|
|`scripts/verify-duel-search-local.mjs`|격리 Deno/Auth/RPC/React 및 동시 요청·응답 유실·상태 변조 통합 검증|
|`tests/publicRooms.test.js`|Windows CRLF checkout도 같은6개 dollar quote 쌍을 검사하도록 정정. 검사 삭제 없음|

HTML을 정규식으로만 해석하지 않기 위해 [HTML5 표준 파서 parse5](https://github.com/inikulin/parse5)를 선택했다. 기존 브라우저 sanitizer와 새 서버 sanitizer를 서로 다른 실행 환경에서 비교하고, 실제 표시 텍스트 노드도 서버 manifest와 대조했다.

## 4. 새 실행 검증 [산출물]

모두 위 main SHA + 동일한 미커밋 보안 소스, **2026-11-02 KST** 실측이다.

|검증|결과|위치|
|---|---|---|
|전체 npm test|756/756, 실패/skip0. 새 검색 단위15개 포함|`.temp/search-tests-final.log`|
|Production build|성공, 기존500kB chunk 경고 유지|`.temp/search-build-final.log`|
|git diff --check|통과|최종 실행 기록|
|새 검색 pgTAP|23/23, rollback|`.temp/search-pgtap-final.log`|
|기존 아이템 pgTAP|157/157, rollback|디자인 트리 `.temp/jungle65-release-20261102/search-existing-items-pgtap.log`|
|실제 서버·브라우저 통합|16개 검증 통과|`.temp/duel-search-authority/report.json`, `.temp/search-integration-final.log`|

실제 통합 검증은 다음을 포함한다.

- 누락·anon·위조·정상 서명 만료 JWT의 실제 Deno401 거부.
- cold 문서 준비에서 실제 Deno/parse5/RPC 실행. 본문 전송만 localhost fixture이며 Auth·DB·RPC·React는 실제 격리 스택이다.
- 일반 회원의 직접 성공 count RPC는42501, HTTP의 forged count 필드는400.
- 서로 다른 동시 요청8개 중 성공1개/거부7개, 성공 기록1건.
- 동일 요청 ID의 동시 재전송4개는 같은 기록1건 재사용.
- 다른 참가자도 **자기 활성화**로는 정상1회 사용 가능. 타인 permit·다른 방 event 재사용은 거부.
- 사용 후 재준비 및 검색어 재결합 거부. 미발견 이후 정상 literal 검색 성공.
- 방 잠금 대기 동안 만료된 요청은 잠금 취득 후 거부되며 소비하지 않음.
- entity·빈 문단·참조 제거·table·링크·이미지 등9개 HTML이 기존 브라우저 정제 결과와 일치.
- 실제390px 화면의 텍스트 노드가 서버 canonical manifest와 일치.
- 빈 입력/미발견은 미소비, 승인된 정상 검색만 강조. 성공 commit 응답 유실 후 같은 ID 재시도 복구.
- React의 searchAvailable 상태를 강제로 켜고 **다른 존재하는 단어**를 검색해도 추가 강조/성공 소비 거부.
- F5 후 패널 미복원·성공 상태 보존, page error0. 응답 유실 주입의 `net::ERR_FAILED`1건은 의도적이다.

격리 DB: `wiki-next-goal-release-20261029`, API `http://127.0.0.1:55421`. 테스트가 만든 계정·방·문서를 정리했고 새 private documents/sessions/requests 잔여는 모두0이다. 로컬 임시 본문 transport adapter도 복원했다. 운영 서버는 이 통합 검사에 사용하지 않았다.

화면 증거: `.temp/duel-search-authority/state-tamper-rejected-390.png`.

## 5. 필요한 DB/Edge 변경과 운영 영향 — 실행 전 별도 검토

- **신규 forward migration1개**다. 기존45개 migration은 수정하지 않았다. private 테이블3개는 RLS를 켜고 public/anon/authenticated/service_role의 직접 권한을 모두 revoke한다. member는 자기 source 조회 RPC만, 문서 저장/성공 commit은 service_role만 실행한다. 새 시퀀스·광범위 테이블 grant는 없다.
- 기존 `use_duel_item_v3`에는 검색 활성화 source 기록만 추가한다. 기존 이동·방어·지급·쿨타임·확정 결과 경로는 유지한다. 기존 API 서명도 유지한다.
- **신규 Edge `duel-search`1개** 배포가 필요하다. `verify_jwt=false`와 handler의 `auth.getUser` 검증을 한 계약으로 검토해야 한다. 기존 Edge 재배포는 이 수정에 필수 아님.
- 프론트는 새 Edge가 준비돼 있어야 검색을 사용할 수 있다. 선행 조건 미충족 시 서버 승인 없이 강조하는 fallback은 없다. migration/Edge만 적용하고 구형 프론트를 두는 상태를 보안 해결로 판정하지 않는다.
- cache는 snapshot별 정제 HTML+텍스트 노드를 보관한다. HTML 상한4MB, 입력 raw HTML 상한8MB다. 최초 준비는 고정 본문을 추가로 서버에서 읽으므로 cold latency/DB 저장량/전송량이 늘 수 있다. 원래15초 deadline을 연장하지 않으므로 **운영 cold latency와 대형 실제 문서 비용은 배포 전 추가 실측 대상**이다. 로컬 cold transport/만료 실패 안전성은 검증했다.
- 성공 수 제한의 경계는 **서버 공식 검색 요청**이다. 브라우저에 이미 전달된 문서의 임의 로컬 계산·개발자도구 DOM 변경까지 서버가 통제한다고 주장하지 않는다.
- 운영 DB migration·Edge·프론트 적용, 버전별 cutover/rollback 계획은 아직 실행하지 않았다. 운영 스모크·새 보안 후보 CI/Preview도 미실행이다. 이 트리의 commit/push도 하지 않았다.
- 운영 rollout을 검토할 때 승인된 migration→새 Edge 인증/권한 확인→보안 프론트 통합→실서비스 검증 순서를 후보 SHA와 함께 다시 고정해야 한다. 구형 프론트 rollback은 기존 클라이언트 검색 한계도 되돌린다. DB 역방향 migration은 자동 실행하지 않는다.

## 6. 별도 승인된 운영 QA — 보안 출시 승인과 무관

일반 회원의 정상 가입 API로 QA 계정1개를 만들고 **2026-11-02 17:20:11 KST** 생성 시각을 조회했다. 로그인·프로필·XP·랭킹 API 조회 성공, total XP0, 자기 game_rooms/game_records/duel_item_grants/duel_item_events/xp_ledger 행수0을 회원 권한으로 확인했다. 경기·아이템 사용·XP/업적 생성 API를 호출하지 않았다.

정상 가입 trigger가 기본 프로필 꾸미기 아이콘6개를 자동 지급했다. 이는 경기 아이템 grant와 별도인 기존 system_default 동작이다. 업적 원본3개 테이블 직접 조회는403으로 거부돼 실제 행수는 미검증이며, 우회 권한이나 DB 보정 없이 그 제한을 기록했다. 브라우저 폼 전체 검증은 하지 않았다.

QA 계정은 삭제하지 않았다. 자격정보는 저장소 밖 DPAPI 암호화 보관이며 이 보고서에 계정 식별자·비밀번호·토큰을 싣지 않았다. 계정 삭제는 별도 승인 대상이다. 승인된 QA 조회 성공은 검색 위험 수용이나 Production 배포 승인으로 확장되지 않는다.

## 7. 다음 단계

이 미커밋 보안 변경을 검토한 뒤 후보 commit/CI·운영 영향/적용 창을 별도로 결정한다. Jungle65 `27e5056`/PR #7은 계속 보존한다. 현재 판정은 **HOLD**이며 운영 보안 문제를 해결 완료로 표시하지 않는다.

현재 PC의 격리55421 스택/Docker가 실행 중인 상태에서 재현 명령:

```powershell
cd C:\Project\wiki-jungle65\.worktrees\search-consumption-authority-20261102
npm test
npm run build
git diff --check
node scripts/verify-duel-search-local.mjs
```

마지막 스크립트는 정해진 로컬 project ID/API/container를 확인하고 운영 연결을 거부한다. 회원용 API로 정상 가입/조회한 운영 QA와는 별개의 로컬 검증이다.
