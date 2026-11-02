# Jungle65 2차 카피·게임감 폴리싱

> **시각 회귀 정정 — 2026-11-02:** 아래 작업의 랜딩/HOME 불투명 패널은 원본 로고·그림을 가리는 시각적 퇴행으로 사용자 검토에서 거부됐다. 테스트 통과가 디자인 적합성을 보장하지 않았으며 해당 패널만 선별 제거했다. PLAY 간소화·모달·HOME 1400px 개선은 유지한다. 현재 화면과 비교 검수 결과는 [시각 회귀 수정 기록](JUNGLE65-VISUAL-REPAIR-2026-11-02.md)을 따른다. 아래 본문·수치·스크린샷은 수정 전 당시 기록으로 보존한다.

기준: **`bd87c4dd88857b74da19c585660c8c65f605b91e` + 작업 시작 시 기존 미커밋 작업 + 이번 폴리싱, 2026-11-02 KST**. 아래 검증 수치는 모두 이 기준과 날짜다. 브랜치 `feat/jungle65-design-20261030`, Windows / PowerShell / Node 24.18.0 / npm 11.16.0 / 기존 package-lock.json·Playwright 사용. 신규 의존성·외부 API 추가 없음.

## 1. 작업 요약

랜딩·HOME·PLAY·로그인/가입의 문구를 탐험 게임 톤으로 정리했다. 기존 일러스트와 양피지·목재·파란 CTA를 유지하면서 실제 HTML로 문구를 표시한다. 이미지에 구워진 기존 문구는 불투명한 양피지 패널로 가려 화면 크기에 맞게 읽히도록 했다. 모바일에서는 패널 바깥의 짧은 여백으로 옛 문구 조각이 비치지 않도록 숲색 프레임도 적용했다 [코드: `pages/IntroPage.jsx`, `css/jungle65.css`].

| 영역 | 적용한 문구·동작 |
|---|---|
| 랜딩 | **위키 레이스: 지식의 정글을 돌파하라** / 문서와 링크를 추적하며 목표 지점까지 가장 빠르게 도달하세요. |
| 랜딩 버튼 | **탐험 시작하기** → 기존 로그인 모달 / **새 탐험가 등록** → 기존 가입 모드 |
| HOME 배너 | **위키 링크를 따라 목표 문서까지** / 오늘의 코스에 도전하고 탐험 랭킹에 이름을 남겨보세요. |
| HOME 버튼 | 배너는 **탐험 모드 선택** → 기존 `/play`, 실제 데일리 버튼은 **오늘의 탐험 출발** → 기존 daily 상태의 `/game` |
| HOME 섹션 | **나의 탐험가 수첩 / 최근 탐험 일지 / 누적 탐험 전적**. 랭킹명은 집계 기준을 명확하게 설명하는 기존 이름을 유지하고 TOP 3 표식을 강조 |
| PLAY | **탐험 모드를 선택하세요** / 혼자 개척할지, 라이벌과 맞붙을지, 여러 탐험가와 함께 질주할지 선택하세요. |
| 싱글 | 나만의 페이스로 링크의 숲을 돌파하세요. / **탐험 시작** / 혼자 집중·기록 도전·오늘의 탐험 |
| 1:1 | 같은 출발선, 같은 목표. 승자는 단 한 명. / **대전 시작** / 정면 승부·실시간 대결·아이템전 선택 |
| 그룹 | 여러 탐험가와 함께 목표를 향해 질주하세요. / **그룹 로비 입장** / 다인 경쟁·순위 레이스·함께 질주 |
| 로그인 | **탐험가 로그인** / 기록을 저장하고 모든 탐험 모드에 참여하세요. |
| 가입 | **새 탐험가 등록** / 위키 레이스에 합류하고 첫 탐험을 시작하세요. |

HOME 배너를 데일리 실행 버튼으로 바꾸지 않았다. 기존 배너의 목적지가 모드 선택이므로 새 표시도 그 동작에 맞췄다. 회원가입 탭을 누르면 제목·설명과 dialog의 접근성 이름이 함께 바뀐다 [코드: `components/wiki-race/ExpeditionHero.jsx`, `pages/MainPage.jsx`, `pages/LoginPage.jsx`, `pages/IntroPage.jsx`].

## 2. UI 및 수정 파일

PLAY 카드는 **일러스트 → 모드명·한 줄 소개 → 짧은 설명 → 배지 3개 → 자세히 보기 → CTA** 순서다. 출발/목표·준비 순서·아이템 규칙의 기존 내용을 접힌 native `<details>` 안에 보존했다. 상세 펼치기가 게임 진입을 일으키지 않도록 카드 전체 `<button>`을 `<article>`과 별도 CTA 버튼으로 나눴다. CTA는 원래의 클릭 콜백과 게스트 가드를 그대로 사용한다 [코드: `pages/PlayPage.jsx`; 산출물: `browser/report.json`].

HOME·PLAY 콘텐츠 최대 폭은 1200px에서 **1400px**로 넓히고 기존 정보 순서를 유지했다. HOME 프로필과 랭킹의 병렬 배치·좁은 화면 세로 배치, 실제 XP/기록/랭킹 조회는 유지한다. 목재 헤더 위 브랜드의 글자 대비와 TOP 3 표식을 보완했다. 이미지 fallback에서도 HOME의 새 문구 패널을 유지해 제목·설명·버튼이 겹치지 않도록 했다 [코드: `css/jungle65.css`, `components/wiki-race/ExpeditionHero.jsx`].

| 이번에 수정·추가한 파일 | 이유 |
|---|---|
| `pages/IntroPage.jsx` | 통합 반응형 랜딩 패널, 실제 카피·CTA, 현재 폼 제목으로 dialog 이름 연결 |
| `pages/PlayPage.jsx` | 짧은 모드 카피, 일러스트 우선 배치, 배지 3개, 독립된 상세/CTA |
| `pages/MainPage.jsx` | 데일리 버튼·프로필·최근 기록·전적·빈 기록 안내 문구만 수정 |
| `pages/LoginPage.jsx` | 로그인/가입별 제목·설명, 제목 ID, 게스트 버튼 카피만 수정 |
| `components/wiki-race/ExpeditionHero.jsx` | HOME 배너 카피·표시 버튼명·제목 위계, fallback에서도 같은 패널 |
| `css/jungle65.css` | Jungle65 범위 안에서 크기·간격·대비·focus-visible·반응형·모달 버튼 톤 조정 |
| `tests/jungle65DesignEntry.test.js` | 기존 모바일 표시 검사에서 제거된 전용 모바일 컨트롤 대신 통합 액션 클래스 확인. 기존 나머지 검사는 보존 |
| `scripts/jungle65-polish-smoke.mjs` | 기존 도구와 로컬 fixture를 사용하는 이번 폴리싱 검수·캡처 |
| 이 문서 | 트랙 작업·검증·스크린샷을 통합 세션에 인계 |

작업 시작 전부터 수정되어 있던 `css/wikiRaceBase.css`, `tests/publicRooms.test.js`, 기존 디자인 smoke 스크립트·원본 패키지·WebP·이전 검수 문서는 보존했다. 원본 WebP 5개는 설치된 public 파일과 바이트 동일하다. 앞선 미커밋을 되돌리거나 stage/commit/push하지 않았다 [산출물: `.temp/jungle65-polish-20261102/starting.patch`, `scope.json`; 코드: 기존 스크립트/에셋 대조].

## 3. 검증 결과

| 검증 | 결과 |
|---|---|
| `npm test` | **746/746 통과**, 실패·skip·cancel 0 |
| `npm run build` | **exit 0**, 기존 500kB 초과 청크 경고 유지 |
| `node --check scripts/jungle65-polish-smoke.mjs` | 통과 |
| `git diff --check` | 통과 |
| 실제 Chromium UI fixture 검수 | **131개 통과**, 일반 화면 page/console error 0 |
| 영향 범위 대조 | **9개 검사 통과**. 아래 상세 참조 |
| 린트 | `package.json`에 lint 스크립트가 없어 별도 실행하지 않음 |

산출물 루트는 **`.temp/jungle65-polish-20261102/`**. `npm-test.log`, `build.log`, `browser.log`, `browser/report.json`, `scope.json`, `card-comparison.json`에 결과를 저장했다. 테스트 중 새 문구가 기존 숨김 보상명 금지 검사에 걸린 경우는 검사 자체를 바꾸지 않고 문구를 `최근 탐험 일지`로 바꿔 해결했다 [코드: `tests/achievementDisplay.test.js`, `pages/MainPage.jsx`].

검수 범위:

- 랜딩/HOME/PLAY: **1440×1000, 390×844, 320×844, 768×1024, 1024×768, 1920×1080**에서 가로 넘침 없음. 1920px에서 shell 폭 1400px 실측.
- 로그인·회원가입: 데스크톱/390px/320px 제목·설명·줄바꿈·탭 전환·입력란 표시 확인. Enter 열기 → 첫 입력란 포커스 → 양방향 Tab 각 14회 → Escape 닫기 → 원래 버튼 포커스 복귀. 기존 소리 툴바와 모달 비중첩 확인.
- PLAY: 모든 크기에서 배지 3개, 기본 접힘, Enter 펼치기/Space 접기, 상세 조작 시 비이동, CTA의 hover/focus-visible/키보드 접근 확인. CTA 대비는 기본 **5.65:1**, hover/focus-visible **6.67:1**, 게스트 제한 **5.91:1**.
- 데스크톱 Enter/모바일 tap으로 기존 싱글 설정·duel/group 목적지 확인. 게스트의 싱글 설정 열기는 유지되고 온라인 CTA는 Enter/Space/포인터로 눌러도 이동하지 않음.
- 랜딩·HOME·PLAY 이미지 로드 실패 시 기존 대체 이미지와 버튼 확인. 의도적인 404 진단은 정상 화면 오류와 분리했다. reduced-motion에서 CTA transition 0s 확인.
- 캡처한 랜딩/HOME/PLAY·로그인/가입의 데스크톱·모바일 화면과 tablet/320px 가입·이미지 fallback을 육안 확인했다.

**모바일 카드 높이 실측 — 390×844, 상세 기본 접힘, 같은 fixture·시스템 폰트**:

| 모드 | 작업 시작 원문 | 변경 후 | 감소 |
|---|---:|---:|---:|
| 싱글 | 619.45px | 426.45px | 193px · **31.2%** |
| 1:1 | 640.45px | 426.45px | 214px · **33.4%** |
| 그룹 | 619.45px | 426.45px | 193px · **31.2%** |

변경 전 수치는 HEAD만으로 측정한 값이 아니다. **작업 시작 시 기존 미커밋을 포함한 실제 파일 사본**을 Vite pre-load로 불러와 동일 fixture/390px에서 재측정했다. 사본은 `preserved/`, 원시 결과는 `before/report.json`이다. 상세를 펼치면 필요한 만큼 카드가 늘어난다. 웹폰트가 달라지면 높이도 달라질 수 있다 [산출물: `card-comparison.json`].

영향 범위 대조는 작업 시작 원문과 비교했다. `MainPage.jsx`는 표시 문구 5곳을 되돌려 비교하면 파일 전체가 같고, `LoginPage.jsx`도 제목·설명·게스트 버튼·제목 ID를 되돌리면 전체가 같다. Intro/hero의 상태·effect 선언과 PLAY CTA 콜백은 기존과 같다. **Supabase·Edge·API 서비스·인증 서비스·게임 hook·App 라우터·오디오·package/lockfile·workflow·CURRENT는 HEAD와 차이 0**이다. 기존 base CSS/public rooms 테스트 diff도 시작 시점과 같다 [산출물: `scope.json`, `verify-scope.mjs`].

## 4. 스크린샷

| 화면 | 데스크톱 | 모바일 |
|---|---|---|
| 랜딩 | [PNG](../../.temp/jungle65-polish-20261102/browser/landing-desktop.png) | [PNG](../../.temp/jungle65-polish-20261102/browser/landing-mobile.png) |
| HOME | [PNG](../../.temp/jungle65-polish-20261102/browser/home-desktop.png) | [PNG](../../.temp/jungle65-polish-20261102/browser/home-mobile.png) |
| PLAY | [PNG](../../.temp/jungle65-polish-20261102/browser/play-desktop.png) | [PNG](../../.temp/jungle65-polish-20261102/browser/play-mobile.png) |
| 로그인 | [PNG](../../.temp/jungle65-polish-20261102/browser/login-desktop.png) | [PNG](../../.temp/jungle65-polish-20261102/browser/login-mobile.png) |
| 회원가입 | [PNG](../../.temp/jungle65-polish-20261102/browser/signup-desktop.png) | [PNG](../../.temp/jungle65-polish-20261102/browser/signup-mobile.png) |

추가 캡처는 같은 폴더의 `*-small.png`, `*-tablet.png`, `*-landscape.png`, `*-wide.png`, `play-details-*.png`, `play-guest-*.png`, `*-fallback-mobile.png`다. `before/play-mobile.png`는 변경 전 비교용이다. 로그·PNG·dist는 Git 제외 산출물이며 소스 수정 대상으로 삼지 않았다.

## 5. 미확인 사항과 다음 추천 작업

이번 브라우저 검수는 실제 제품 React/CSS/정적 파일에 **백엔드·Wikipedia·광고·웹폰트의 로컬 fixture**를 사용했다. 운영 DB/Edge에 접근하지 않았으며 실제 회원 인증 완료·게임 완주·운영 지급·라이브 랭킹 검증을 주장하지 않는다. HOME 탐험 노트의 콘텐츠 조회 불가 안내는 fixture 응답에 따른 캡처다. 실기기/Safari·모바일 가상 키보드·운영 웹폰트 로드·200% 브라우저 확대는 이번에 검증하지 않았다. 다음에는 실휴대전화에서 문구와 가상 키보드 표시를 확인하는 것을 추천한다.

`CURRENT.md`는 **078a690/2026-10-29** 기준이며 HEAD까지 **57커밋**(후속 코드 날짜 10월 30일)이 더 있고, 문서 갱신일은 확인일 기준 4일 전이다. 브랜치/디자인 상태가 맞지 않음을 작업 전에 보고했다. **디자인 트랙 worktree는 CURRENT를 수정하지 않는다는 AGENTS §7 예외**에 따라 이 문서로 인계한다. 통합 세션이 실제 병합 상태를 보고 반영해야 하며, 현재 운영 배포 상태는 여기서 추측하거나 갱신하지 않았다. DB/Edge/배포·merge·stage·commit·push는 수행하지 않았다.

재검증 명령(PowerShell):

```powershell
npm test
npm run build
$env:PLAYWRIGHT_BROWSERS_PATH = 'C:\Users\SSAFY\AppData\Local\ms-playwright'
node scripts/jungle65-polish-smoke.mjs
git diff --check
```

`--before`는 이번 세션의 `preserved/` 사본이 있을 때만 사용한다. 일반 검수에는 필요하지 않다. 이 PC의 샌드박스는 loopback 브라우저 접속을 차단했으므로 실제 브라우저 검수는 로컬 실행 권한으로 수행했다. 기존 설치 브라우저를 재사용했고 새 패키지를 설치하지 않았다.
