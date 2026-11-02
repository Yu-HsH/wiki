# Jungle65 최종 검수 및 통합 판단

기준: **`bd87c4dd88857b74da19c585660c8c65f605b91e` + 미커밋 작업 트리, 2026-11-01 KST**. 브랜치 `feat/jungle65-design-20261030`. 아래 모든 검증 수치는 이 기준과 날짜다. Windows / PowerShell 7.6.5 / Node 24.18.0 / npm 11.16.0 / 기존 package-lock.json과 Playwright 사용.

**결론: 선별 커밋 준비 가능, 원격 main과 코드 통합 위험 낮음, 운영 배포는 HOLD.** 실제 실행은 커밋·stage·push·main 병합·DB/Edge 변경·운영 배포 모두 0이다. 운영 HOLD는 아래 §7의 미확인 상태를 해소하기 위한 판정이며, 디자인 검수 실패를 뜻하지 않는다.

## 1. 전체 테스트 정상화

실패를 먼저 재현했다. `tests/publicRooms.test.js:12`는 opening을 `/\bas \$\$\n/g`로 세는데, 현재 SQL 파일은 CRLF 164줄이어서 opening을 0개로 인식했다. 실제 함수 opening/closing은 각각 6개다. SQL·기능 코드는 변경하지 않고 테스트의 opening/closing 및 잘못된 single-dollar 구문 검사 **정규식 4곳에만 `\r?`를 추가**했다. 기대 개수 6, opening/closing 일치, 잘못된 구문 거부는 그대로다 [코드: `tests/publicRooms.test.js`; 산출물: `.temp/jungle65-final-20261101/public-rooms-before.log`].

| 검증 | 결과 |
|---|---|
| `npm test` | **746/746 통과**, fail/skip/cancel 0, exit 0 |
| 동일 테스트 callback에 LF/CRLF SQL 각각 입력 | 양쪽 모두 통과 |
| opening/closing을 일부러 잘못된 single-dollar로 바꾼 입력 | 양쪽 줄바꿈 모두 거부 |
| `npm run build` | exit 0, 기존 500kB 초과 청크 경고 유지 |
| `node --check scripts/jungle65-design-smoke.mjs` | 통과 |
| `git diff --check` | 통과 |

LF/CRLF 검증은 새로 복제한 검사 로직이 아니라 **수정한 기존 테스트의 callback 자체**를 별도 VM context에서 실행했다. 원본 SQL은 메모리 안에서만 줄바꿈을 바꿨고 파일에 쓰지 않았다. Linux/Node 22의 실제 GitHub CI는 이번에 실행하지 않았다. 원격 workflow는 Ubuntu + Node 22이고, 이번 로컬 검증은 Windows + Node 24다 [산출물: `.temp/jungle65-final-20261101/{npm-test.log,line-endings.json,build.log}`; 코드: `.github/workflows/pr-frontend-checks.yml`].

## 2. 브라우저 최종 검수

실제 Chromium 151에서 일반 UI **67개**, 실제 브라우저 200% 확대 **9개**, 합계 **76개 검사 통과**. 두 실행 모두 pageerror/console error 0이다. 기존 React Router future-flag warning은 오류와 구분했다.

- 랜딩/HOME/PLAY: 1440×1000 및 터치 지원 390×844. 추가로 320×844, 768×1024, 1024×768에서 reduced-motion 레이아웃 확인.
- WebP 5개 모두 실제 `<img>`의 currentSrc/naturalWidth/naturalHeight로 확인. HTTP 200 + `image/webp`, 옛 PNG/SVG fallback으로 대체되지 않음. 원본 패키지=public=dist 바이트 동일.
- 데스크톱 랜딩: 원본 1672×941 그림에 그려진 로그인/가입 버튼의 좌표를 기준으로 각 버튼 내부 3지점을 검사. 모든 지점에서 실제 대응 HTML 버튼이 hit-test 대상이었다. 키보드 포커스 테두리도 육안 확인했다.
- 모바일 및 확대 후 모바일 breakpoint에서는 그림 위 hotspot을 숨기고 별도 실제 로그인/가입 버튼을 사용한다. 작은 그림 속 버튼을 그대로 눌러야 하는 구조로 판정하지 않았다.
- PLAY의 세 카드 normal/hover/focus-visible/active, 실제 disabled, 게스트 aria-disabled 구분. CTA 대비는 일반 5.65:1, hover/focus/active 6.67:1, 비활성 안내 5.91:1. Enter/모바일 tap의 기존 싱글 설정·duel/group 이동 유지.
- 로그인/회원가입 전환, 입력, 닫기, 전체 음소거·음량 조작 유지. HOME 오늘의 도전·XP·프로필 링크·랭킹 영역은 검증용 데이터로 확인.

### 키보드 문제의 최소 보완

기존 미커밋 디자인에서 로그인 창을 열어도 포커스가 뒤의 랜딩 버튼에 남는 현상을 실제 재현했다. `pages/IntroPage.jsx`에 ref/effect만 추가하여 첫 입력란 포커스, Tab/Shift+Tab의 dialog 내부 순환, Escape 닫기, 원래 버튼으로 복귀를 구현했다. 실제 키 입력으로 양방향 Tab 각 14회와 Enter/Escape를 검증했다. 인증 서비스·로그인 API·게임 이동 로직은 바꾸지 않았다 [산출물: `.temp/jungle65-final-20261101/{keyboard-before.json,keyboard-before.log}`, `browser/report.json`; 코드: `pages/IntroPage.jsx`].

### 실제 200% 확대의 근거

Windows computer-use 도구가 `failed to write kernel assets ... (os error 3)`로 초기화되지 않아 초기화/리셋 후 재시도하고 대안을 사용했다. 사용자 프로필과 분리된 임시 Chromium 프로필에서 `chrome://settings/appearance`의 Chromium 자체 `settingsPrivate.setDefaultZoom`으로 200%를 설정했다. 이 API가 브라우저 zoom factor를 실제 profile zoom level로 변환하는 것은 [Chromium 공식 구현](https://chromium.googlesource.com/chromium/src/+/b2cb08aba4e0b700007339e30c0aa2cd0d21bc1c/chrome/browser/extensions/api/settings_private/settings_private_delegate.cc)으로 확인했다.

| 관측값 | 100% | 200% |
|---|---:|---:|
| Chromium getDefaultZoom | 1 | 2 |
| 창 외곽 폭 | 1440 | 1440 |
| window.innerWidth | 1427 | 713 |
| window.innerHeight | 822 | 411 |
| devicePixelRatio | 2 | 4 |
| visualViewport.scale | 1 | 1 |

CSS zoom·transform·CDP pinch 또는 화면 폭 축소로 200%를 대신하지 않았다. 200%에서 세 화면의 실제 clientWidth와 scrollWidth가 각각 713px로 같았고 키보드 이동도 통과했다. 확대 후 좌표 단위 차이로 기본 캡처가 잘리는 도구 문제는 CDP clip의 CSS→브라우저 zoom 단위 환산으로 보정했다. PNG 원본은 랜딩 2824×3104, HOME 2824×9896, PLAY 2824×11280이며 내용 전체가 보이는 것을 육안 확인했다 [산출물: `native-zoom/report.json`의 nativeZoom/captures/screens].

### 최종 스크린샷

| 화면 | 데스크톱 100% | 모바일 100% | 실제 브라우저 200% |
|---|---|---|---|
| 랜딩 | [PNG](../../.temp/jungle65-final-20261101/browser/landing-desktop.png) | [PNG](../../.temp/jungle65-final-20261101/browser/landing-mobile.png) | [PNG](../../.temp/jungle65-final-20261101/native-zoom/landing-native-200.png) |
| HOME | [PNG](../../.temp/jungle65-final-20261101/browser/home-desktop.png) | [PNG](../../.temp/jungle65-final-20261101/browser/home-mobile.png) | [PNG](../../.temp/jungle65-final-20261101/native-zoom/home-native-200.png) |
| PLAY | [PNG](../../.temp/jungle65-final-20261101/browser/play-desktop.png) | [PNG](../../.temp/jungle65-final-20261101/browser/play-mobile.png) | [PNG](../../.temp/jungle65-final-20261101/native-zoom/play-native-200.png) |

[랜딩 hotspot의 실제 포커스 테두리](../../.temp/jungle65-final-20261101/browser/landing-desktop-keyboard-focus.png), [회원가입 모바일](../../.temp/jungle65-final-20261101/browser/signup-mobile.png)도 저장했다.

브라우저는 실제 제품 React/CSS/정적 파일을 실행하지만 **백엔드·Wikipedia·웹폰트·광고 응답은 로컬 fixture**다. 실제 회원 인증 완료, 운영 XP 지급/랭킹, 실제 기기/Safari의 성공 근거는 아니다. 실제 웹폰트 다운로드가 완료된 운영 화면도 이번에 재검증하지 않았다. 운영 DB/Edge에 요청해 데이터를 만들지 않았다. 일반 UI는 headless Chromium, 실제 zoom은 별도 프로필의 headed Chromium을 사용했다 [코드: `scripts/jungle65-design-smoke.mjs`].

## 3. 수정 파일과 미추적 파일

작업 시작 시 미커밋/미추적 17개 파일의 원문 사본·SHA-256·binary diff를 `.temp/jungle65-final-20261101/preserved/`, `preservation-before.json`, `starting.patch`에 보관했다. 17개 모두 남아 있으며 15개는 바이트 그대로다. 변경된 기존 파일 2개는 승인 범위의 키보드 보완(`IntroPage.jsx`)과 검증 확장(`jungle65-design-smoke.mjs`)이다. 새 줄바꿈 테스트 수정과 이 보고서가 추가됐다.

현재 추적 파일 변경 5개:

| 파일 | 이전 작업에서 보존/이번 작업 내용 |
|---|---|
| `css/jungle65.css` | 이전 디자인/반응형/입력색 수정 그대로 보존, 이번 변경 없음 |
| `css/wikiRaceBase.css` | 이전 hover 색상 변수 수정 그대로 보존, 이번 변경 없음 |
| `pages/IntroPage.jsx` | 이전 에셋·모바일·모달 수정 보존 + 이번 키보드 포커스 관리 |
| `tests/jungle65DesignEntry.test.js` | 이전 WebP 실제 파일 회귀 검사 보존, 이번 변경 없음 |
| `tests/publicRooms.test.js` | 이번 LF/CRLF 정규식 4곳 수정 |

미추적 파일 14개:

- **원본 패키지 6개, 배포 입력 아님**: `WikiRace_Jungle65_Design_Assets_20261030/README_설치.md`와 그 아래 `public/assets/wiki-race/jungle65/`의 WebP 5개. 사용자 원본 보존용이며 중복 커밋을 권하지 않는다.
- **실제 배포 파일 5개, 향후 선별 커밋에 반드시 포함**: `public/assets/wiki-race/jungle65/landing-final.webp`, `hero-jungle-expedition.webp`, `solo-expedition.webp`, `duel-expedition.webp`, `group-expedition.webp`.
- **검증/기록 3개**: `scripts/jungle65-design-smoke.mjs`, `docs/agent/JUNGLE65-ASSET-HOVER-2026-10-31.md`, 이 `JUNGLE65-FINAL-REVIEW-2026-11-01.md`.

`.temp/`의 로그·PNG·임시 브라우저 프로필과 `dist/`는 Git 제외이며 커밋 입력이 아니다. 원본 패키지를 제외한 **현재 미커밋 선별 후보는 13개 파일**이다. 실제 stage/commit은 하지 않았다. 전체 경로 목록과 에셋 해시는 `.temp/jungle65-final-20261101/files.json`에 기록했다.

## 4. 최신 원격 main과 통합 위험

`git ls-remote origin`으로 시작/종료 시 재확인한 값:

| ref | SHA |
|---|---|
| 원격 main | `8da7d25f4c364f431f8baf8b1abc685a3bee9e6e` |
| 원격 디자인 브랜치 / 로컬 HEAD | `bd87c4dd88857b74da19c585660c8c65f605b91e` |
| 로컬 main | `843febdb17318a4f0ac68b5a4c8eaeeaf67e3faa` — 최신 원격 main이 아님 |

원격 main은 HEAD의 조상(`merge-base --is-ancestor` exit 0)이고 symmetric difference는 **main 전용 0 / 디자인 전용 10커밋**이다. 따라서 조사 시점에는 갈라진 코드 이력에 의한 텍스트 충돌이 없다. 병합 명령은 실행하지 않았다. 향후 통합 판단은 뒤처진 로컬 main이 아니라 재조회한 원격 main으로 해야 한다.

디자인 10커밋의 추적 파일 차이는 아래 8개뿐이다:

```text
components/wiki-race/ExpeditionHero.jsx
css/jungle65.css
pages/IntroPage.jsx
pages/LoginPage.jsx
pages/MainPage.jsx
pages/PlayPage.jsx
tests/explorationRecords.test.js
tests/jungle65DesignEntry.test.js
```

`MainPage`는 CSS import 1줄, `PlayPage`는 이미지 영역, `ExpeditionHero`는 이미지/fallback/레이블, `LoginPage`는 기본 signin을 보존하는 선택적 initialMode다. 기존 인증 서비스 호출과 모드별 이동/게스트 제한은 보존한다. 미커밋까지 합친 Base CSS 추가 차이는 hover 규칙 1개이며, 정글 변수가 없는 화면은 기존 파란색 fallback을 유지한다 [코드: `git diff 8da7d25 HEAD`, `git diff 8da7d25`; 산출물: `integration.json`].

### 기존 기능·보안 수정 누락 확인

원격 main 조상을 모두 포함하므로 기존 수정 커밋은 누락되지 않았다. 특히 고아 공개방 억제 `410bed1`, 운영 적용 이력 파일명 정합 `bcba2ef`, 문서 탐색/전체 링크 그래프/서버 snapshot 검증을 보존한 `8da7d25`가 HEAD에 포함된다. 실제 소스의 다음 범위 **163개 파일**을 원격 main blob과 줄바꿈 정규화 후 전수 대조해 누락/내용 변경 0을 확인했다:

```text
supabase/  services/  utils/  .github/
authContext.jsx  App.jsx  rankingService.js  appStyles.js
package.json  package-lock.json
```

이는 기존 구현을 보존한다는 근거이며, 해당 구현의 모든 보안 문제가 해결됐다는 새 감사 판정은 아니다. 실험 REST/combined/overlap은 기존 opt-in을 유지하고, snapshot이 서버의 전체 링크 그래프와 독립 판정을 기다리는 기존 코드도 동일하다 [코드: `services/wikiSnapshotOverlap.js`, `supabase/functions/wiki-snapshot/snapshotLinkGraph.js`; 산출물: `integration.json`의 protectedFileCount=163, missingOrChanged=[]].

| 위험 | 수준 | 판단/권장 조치 |
|---|---|---|
| 현재 원격 main과 텍스트 충돌 | 낮음 | main은 조상, main 전용 커밋 0. 향후 ref가 움직이면 재대조 |
| 기능/보안 코드의 덮어쓰기 | 낮음 | 위 163개 원격 blob과 동일, 게임 페이지·서비스/DB 변경 없음 |
| 공통 CSS의 회귀 | 낮음 | hover 1개는 테마 변수 fallback, 정글 규칙은 HOME/PLAY/랜딩 범위. UI 검수 통과 |
| WebP 5개 누락 커밋 | 현재 주의 필요 | 아직 미추적이므로 코드만 커밋하면 원래 누락 재발. 5개를 함께 선별 |
| 원본 패키지/산출물 혼입 | 현재 주의 필요 | 원본 6개와 .temp/dist를 커밋 후보에서 제외 |
| 최신 운영 상태/기록과의 차이 | 미확인 | CURRENT·릴리스 기록이 오래돼 실제 Production/DB/Edge 일치를 단정할 수 없음 |

## 5. CURRENT.md의 57커밋 관련성

`CURRENT.md` 기준은 `078a6906`, 갱신일은 2026-10-29다. 57개는 누락된 기능 57개라는 뜻이 아니며 merge의 측면 이력도 포함한다. 정확히 **기준→현재 원격 main 47개 + main→디자인 HEAD 10개**다.

main까지의 first-parent 주요 이력은 `843febd` 문서 갱신 → `71f9516` 기존 릴리스 → `410bed1` 고아 공개방 hotfix → `bcba2ef` migration 이력 정합 → `8da7d25` 탐색/서버 snapshot 릴리스다. 그 다음 디자인 10개는 랜딩·선택적 가입 탭·HOME·PLAY·CSS·관련 검사다. 커밋 전체 목록은 `current-to-main-commits.txt`, `main-to-design-commits.txt`에 보관했다.

따라서 CURRENT의 예전 branch/main/운영 미적용 서술을 현재 운영 상태로 사용하면 안 된다. 반대로 Git main에 릴리스가 있다는 사실만으로 운영 DB/Edge 적용 완료를 추측해서도 안 된다. 이 디자인 트랙은 AGENTS.md §7의 예외에 따라 CURRENT를 수정하지 않았고, **통합 세션에서 확인된 실제 ref·배포·적용 이력으로 갱신할 인계 자료**를 이 문서에 남긴다 [문서: `docs/agent/CURRENT.md`, `docs/ops/RELEASE-2026-10-29.md`; 산출물: 위 Git 이력].

## 6. 커밋 및 통합 가능 여부

**기술적으로 선별 커밋 준비 가능.** 전체 테스트/빌드/UI 검수가 통과했고 기존 사용자 변경은 소실되지 않았다. 위 13개 후보를 실제 diff로 확인한 뒤 승인된 시점에만 커밋한다. 원본 패키지 6개를 일괄 add하지 않는다.

**원격 main과 코드 통합 가능, 충돌 위험 낮음.** 현재 10개 디자인 커밋과 앞으로 만들 선별 수정 커밋이 포함된 후보를 검토할 수 있다. 원격 ref 재확인, 해당 후보 CI, 통합 세션의 CURRENT 갱신이 필요하다. 이번 요청은 조사/로컬 검수이므로 실제 commit·push·merge는 수행하지 않았다. main 반영은 프로덕션 노출과 연결되므로 배포 판단을 먼저 분리해서 확인해야 한다 [문서: AGENTS.md §1.1·§2·§7].

## 7. 운영 배포 GO / HOLD 및 남은 사항

**판정: HOLD.** 로컬 디자인/테스트의 기술 게이트는 통과했지만, 다음 항목을 이번 검증으로 완료 처리할 수 없다:

1. 실제 Vercel Production SHA/Ready 상태와 원격 main, 운영 DB/Edge 계약의 현재 일치 여부. 기존 CURRENT·10월29일 릴리스 기록은 최신 main/이력과 맞지 않으며 이번에 운영 상태를 새로 실측하지 않았다. 디자인 때문에 새 migration/Edge 배포가 필요하다고 판정한 것은 아니다.
2. 실제 서버 인증·게임 완주/XP·랭킹과 실제 모바일/Safari 검수. 이번 브라우저 결과는 로컬 fixture UI다. 외부 웹폰트까지 로드한 실제 화면도 후속 확인 대상이다.
3. [검색 성공 소비 서버 권위 후속](2.0x/SEARCH-CONSUMPTION-FOLLOWUP.md)은 여전히 미해결로 기록돼 있다. 이번 디자인은 해당 코드를 변경하지 않았고 예전의 위험 수용/배포 승인을 새 배포 승인으로 확장하지 않는다. 현재 변경을 노출할 때 알려진 제약의 유지 여부를 다시 명시해야 한다.

권장 순서: WebP 포함 후보 선별 → 승인 후 디자인 브랜치 커밋/CI → 통합 세션의 CURRENT·운영 기록 재정합 → 실제 서버/기기 확인 → 해당 후보의 건별 운영 GO 판단. 이번 단계에서는 이 후속 작업을 실행하지 않았다.

재확인 명령:

```powershell
npm test
npm run build
git diff --check
$env:PLAYWRIGHT_BROWSERS_PATH = 'C:/Users/SSAFY/AppData/Local/ms-playwright'
node scripts/jungle65-design-smoke.mjs
node scripts/jungle65-design-smoke.mjs --native-zoom
git ls-remote origin refs/heads/main refs/heads/feat/jungle65-design-20261030
```

검증 로그/메타데이터/PNG는 `.temp/jungle65-final-20261101/` 아래 보관한다. 커밋 후보와 사용자 원본/산출물의 구분은 `files.json`, 보존 확인과 main 대조는 `integration.json`, 실제 확대는 `native-zoom/report.json`을 따른다.
