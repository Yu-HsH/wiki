# Jungle65 디자인 + 검색 보안 통합 후보

> 후속(2026-11-03): [검색 CPU 최적화 및 재검증](SEARCH-CPU-2026-11-03.md), [서버 게이트·drain·복구·보존 후보](JUNGLE65-SEARCH-CUTOVER-2026-11-03.md), [현재 기준](../agent/CURRENT.md)이 최신이다. 아래 성능 FAIL과 미구현 항목은96fec9b 시점의 보존 기록이다. 운영 변경0/Production HOLD는 유지한다.

판정: **HOLD**. 이번 범위는 후보 commit/push·CI/Preview·로컬 실측·배포 계획까지다. 운영 DB/Edge/main/Production은 변경하지 않았다. 2026-11-02 KST.

## 후보와 보존

- 디자인: `27e5056d2780e84bd107e64d10684be63fd204aa`, [PR #7](https://github.com/Yu-HsH/wiki/pull/7) OPEN, 원격 head 그대로 재확인.
- 보안: `fdd7190f16057a156caac5f78335a6d9d72f570e`, `codex/search-consumption-authority-20261102`, 선별17파일 commit/push 완료. [CI41455976926](https://github.com/Yu-HsH/wiki/actions/runs/41455976926) success, Vercel `FgMokRQeCB9nutoJV6tReXkPbggd` Ready/같은SHA, `https://wiki-e3sh4lv4i-yu-hshs-projects.vercel.app/`.
- 통합: `codex/jungle65-release-candidate-20261102`, 디자인27e5056에서 분기해 보안을 merge한 `099028be50819ae497eef81975c491400ac6f258` 기반. 제품 확정 commit은 82c82f0407c7d83df06d6a4f466057b80bbda643다. 최종 문서 포함 후보 hash/CI/Preview는 feature push 후 GitHub PR의 실제 head/checks로 확인한다. 이 문서는 로컬 검증 동결 시점의 기록이다.
- 추가 통합 수정은 모바일 검색 패널 위치 변수1개와 검증 runner의 진단·정확한 활성화 시점·기준SHA 기록이다. 보안17파일과 구분하며 PR #7의 기존 commit은 바꾸지 않았다.
- WebP5개·A+ 폰트 CSS·폰트 라이선스가 디자인27과 동일한 Git blob임을 확인했다. 게임 서비스/XP·결과/hook/utils의 기존 구현은 변경하지 않았다. 신규 검색 service만 추가했다. CRLF 검사 변경은 두 후보에 이미 같아 merge 충돌이 없었다.
- 원본 worktree의 미커밋 CURRENT/RELEASE/QA 문서와 중복 원본 에셋 패키지는 보존했다. 보안 작업 시작 시17파일 중 기존16파일을 별도 raw-byte 백업했고 이후 새 측정 runner만 추가했다. `.temp`, build/cache/log, 환경파일·자격정보는 stage하지 않았다.

## 실제 재실행 결과

기준은 `099028b` + 통합 CSS/runner 미커밋 후보, 2026-11-02 KST. 후속 문서 변경은 제품 소스에 영향을 주지 않는다.

|검사|결과|산출물|
|---|---|---|
|npm test|761/761, fail/skip0|`.temp/integrated-tests.log`|
|Production Vite build|성공, 기존 큰 chunk 경고|`.temp/integrated-build.log`|
|diff --check / runner 문법|성공|명령 실행 기록|
|보호 랜딩/HOME/PLAY|84개, 동결 PNG 픽셀 비교·접근성 포함|`.temp/integrated-protected/report.json`|
|전체 디자인·그룹·게임·결과·랭킹·프로필·업적|154개/108화면|`.temp/integrated-full/after/report.json`|
|모바일 그룹 compact·READY/취소·방장 승계·HUD 링크|78개|`.temp/integrated-regression/after/focused-report.json`|
|1:1 로비|116개/38화면, 기능·픽셀 비교 통과|`.temp/integrated-duel/after/report.json`|
|실제 로컬 Deno/Auth/RPC/React|19/19|`.temp/duel-search-authority/report.json`|
|신규 검색 SQL / 기존 아이템 SQL|23/23 +157/157, 보안fdd7190 소스로 재실행|보안 worktree `.temp/audit-pgtap-*.log`|
|실제 Wikipedia 반복 성능|75회 중68성공/7CPU실패: **성능 FAIL**|[성능](SEARCH-PERFORMANCE-2026-11-02.md)|
|통합390px 실제 문서 UI|5종×Cold/Warm 각1회=10/10 검색·manifest·강조 성공|[화면 JSON](SEARCH-PERFORMANCE-BROWSER-2026-11-02.json)|

화면 폭320·390·768·1024·1440px를 실제 fixture로 재검증했다. 일반 사용자·방장·참가자·실제 장착 프레임/칭호/READY, 후보 선택·저장 실패·취소·시작 사유, F5, 모바일 키보드/소리 패널, 폰트 로딩·fallback, 로그인/회원가입 포커스·Escape·Tab을 포함한다. 운영 서비스의 다계정 검증을 했다는 뜻은 아니다.

테스트 개수: main 공통741 + 디자인5 =746, 공통741 + 보안15 =756, 합집합761. 기존 검사를 삭제하거나 skip하지 않았다. 상세 이름 대조는 원본 `.temp/search-release-gate-20261102/test-inventory.json`에 있다. 1:1 스모크는 새 worktree에 기준 PNG가 없어 첫 실행 마지막 비교에서 실패했고, 동결27e5056 원본을 `JUNGLE65_DUEL_SOURCE_ROOT`로 읽어 fresh baseline을 만든 뒤 같은 검사 전체를 재실행했다. 이번 후보에 맞춰 실패 조건을 제거하지 않았다.

## 보안 계약

신규 private 테이블3개 RLS 활성, 직접 테이블 접근은 postgres만이다. source RPC authenticated만, put/commit service_role만, private guard는 postgres만 실행한다. SECURITY DEFINER4개 모두 빈 search_path이며 실행 grant를 migration에 명시했다. 실제 회원 직접 성공 commit42501·HTTP count 주장400, 누락/anon/위조/정상서명 만료JWT401을 확인했다. `verify_jwt=false`를 인증 생략으로 쓰지 않고 handler `getUser`가 먼저 검증한다.

서로 다른 동시 요청8개는1성공/7거부, 동일 ID 동시4개는 기록1개다. 동일 ID의 다른 검색어, 타인 permit, 다른 방 event, 경기 종료/페이지 이동·돌아오기·만료 후 사용을 거부한다. 빈 입력/미발견 미소비, 응답 유실 후 같은 ID 복구, React 상태 변조의 두 번째 성공 거부, F5 ledger 보존을 실제 서버와 화면에서 확인했다. 서버 canonical HTML과 화면 text-node manifest도 실제 문서5종에서 일치했다.

parse5 7.3.0 고정 의존성은 실제 Edge eszip 번들 생성과 Deno 요청 실행을 모두 검증했다. 브라우저 배포 번들에서 parse5를 사용하는 것은 아니다. Server-Timing에는 숫자 소요 시간만 포함한다. 15초·쿨타임·슬롯·XP·승패·결과 계약은 유지했다.

## 성능·운영 판정

약5.7MB 문서의 cache miss에서 CPU hard limit가 반복됐다. Warm으로 시도했으나 실제 cache miss였던4회도 분리했다. 첫 성공 이후 실제 cache hit6회는 모두 성공했지만, Cold4/5 실패를 상쇄하지 않는다. UI10/10의 단일 표본 성공도 반복 실패 해결로 간주하지 않는다. 15초 연장0, 실패 시 실사용 시간0이다. 저장량·증가 추정·p50/p95/max·오류 주입·개선안은 성능 문서를 따른다.

main은 `8da7d25f4c364f431f8baf8b1abc685a3bee9e6e`로 재조회했고, Vercel 화면에서 기존 Production `4MdbEvoe5bArd9Fd1BvyTc8xpGgv` Ready/main8da7d25/정상 alias를 읽기 확인했다. 이전 rollback 참조도 이 배포이며 실제 적용 직전에 다시 확인해야 한다.

운영 migration45/기존Edge8 ACTIVE는 이전 운영 조회 기록이다. **이번 CLI migration 재조회는 project link 부재로 실패**했으므로 최신 운영 값으로 재사용하지 않는다. 로컬 후보 migration46개 중 신규1개/Edge1개를 운영에 적용한 적은 없다. 운영의 현재 pending/Edge/JWT/ACL/RLS·게임/XP 서버 계약은 적용 창 직전에 읽기 재확인해야 한다. 권한을 우회하거나 임의 link/DB 보정으로 채우지 않았다.

Preview Ready는 프론트 빌드 성공이다. 새 보안 DB/Edge를 운영에 적용하지 않았으므로 Preview에서 운영 게임·아이템·XP 데이터를 만드는 검사를 하지 않는다. 격리 환경 실제 검증과 운영 후 스모크를 구분한다. 기존 승인 QA 계정1개는 유지하며 이번에 신규 운영 계정/게임 데이터를 생성·삭제하지 않았다.

## 다음 출시 게이트

1. 큰 문서 CPU 비용을 줄이거나 안전한 prewarm/실패 정책을 설계한 뒤 같은15초로 반복 실측 통과.
2. 서버 진입 제한·기존 경기 drain·구형 클라이언트 전환·검색만 닫는 복구안 마련과 별도 승인.
3. 운영 최신 계약/백업/롤백 대상·승인된 실제 다계정·XP 스모크 조건 확보.
4. migration1개 → Edge1개 → 인증/권한 검증 → 승인 PR main 자동 배포1회 → 실서비스 검증 → 정상화 순서의 건별 최종 승인.

단계별 실패 시 복구 및 구형 프론트 rollback이 검색 우회를 복원하는 위험은 [Cutover/Rollback](JUNGLE65-SEARCH-CUTOVER-2026-11-02.md)에 기록했다. **이번 작업은 Production GO가 아니며 실제 배포하지 않았다.**
