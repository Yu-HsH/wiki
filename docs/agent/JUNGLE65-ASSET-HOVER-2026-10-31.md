# 정글 에셋 연결 및 PLAY hover 검증

기준: `bd87c4dd88857b74da19c585660c8c65f605b91e` + 이 문서에 명시한 미커밋 작업 트리, **2026-10-31 KST**. 브랜치 `feat/jungle65-design-20261030`. Windows PowerShell 7.6.5 / Node 24.18.0 / npm 11.16.0 / package-lock.json 사용. 아래 검증 수치는 모두 이 기준과 날짜다.

작업 시작 시 추적 파일 변경은 없었고 `WikiRace_Jungle65_Design_Assets_20261030/`만 미추적이었다. `CURRENT.md`는 2026-10-29의 `078a6906` 기준으로 HEAD보다 57커밋 뒤처졌으며, 브랜치·그 뒤 릴리스·정글 디자인 변경을 반영하지 못한 상태임을 먼저 보고했다. 이 디자인 트랙에서는 AGENTS.md §7에 따라 CURRENT.md를 수정하지 않았다. 통합 세션에서 실제 통합 상태로 갱신해야 한다 [문서/산출물: `docs/agent/CURRENT.md`, `git log 078a6906..HEAD`].

## 1. 전체 에셋 조사와 실제 연결

추가 패키지는 설치 안내 README 1개(1,060bytes)와 다음 WebP 5개가 전부다. 요청 범위에 필요한 이미지는 모두 존재한다. 패키지 원본과 기존 자산은 수정·삭제하지 않았다. 아래 파일을 프로젝트 루트 `public/assets/wiki-race/jungle65/`에 복사했고, 원본과 복사본의 바이트 및 SHA-256 일치를 확인했다 [산출물: `.temp/jungle65-20261031/after/report.json`의 assets].

| 파일 | 실측 크기 | 용량(bytes) | 실제 JSX 참조 |
|---|---|---:|---|
| `landing-final.webp` | 1672 × 941 | 499,436 | `pages/IntroPage.jsx`의 JUNGLE_LANDING / wr65-landing-picture |
| `hero-jungle-expedition.webp` | 1535 × 436 | 152,576 | `components/wiki-race/ExpeditionHero.jsx`의 wr-landscape; `pages/MainPage.jsx`가 notebook으로 사용 |
| `solo-expedition.webp` | 1160 × 334 | 59,632 | `pages/PlayPage.jsx`의 mode.id=solo 이미지 |
| `duel-expedition.webp` | 1160 × 334 | 53,224 | 같은 파일의 mode.id=duel 이미지 |
| `group-expedition.webp` | 1160 × 334 | 58,372 | 같은 파일의 mode.id=group 이미지 |

브라우저 URL은 각각 `/assets/wiki-race/jungle65/<파일명>`이다. Vite가 제공하는 디렉터리는 루트 `public/`이며, `WikiRace_Jungle65_Design_Assets_20261030/public/`는 제공 대상이 아니다. Vite publicDir을 바꾸지 않고 기존 프로젝트 구조에 이미지를 설치했다 [코드: `package.json`, 위 JSX; 산출물: 위 report.json].

JSX에는 신규 경로가 이미 연결돼 있었지만 실제 public 파일이 없었다. 수정 전 브라우저는 신규 이미지 URL에서 **HTTP 200 text/html**을 받았고 이미지 디코딩에 실패했다. 이어 기존 onError가 랜딩은 `Opening.png`, HOME은 `hero-landscape.png`, PLAY는 `route-solo/duel/group.svg`로 전환했다. 즉 오래된 이미지의 정상 로딩은 신규 연결 성공을 의미하지 않았다. 기존 fallback은 예외 대응용으로 보존했다 [코드: `pages/IntroPage.jsx`, `components/wiki-race/ExpeditionHero.jsx`, `pages/PlayPage.jsx`; 산출물: `.temp/jungle65-20261031/before/report.json`].

## 2. 변경 전후와 수정 파일

| 화면 | 변경 전 | 변경 후 |
|---|---|---|
| 랜딩 | 신규 이미지 실패 후 기존 레이싱 이미지 | 정글 랜딩 전체 비율 유지, 그림 속 로그인/가입 버튼과 실제 클릭 영역 정렬. 모바일은 읽을 수 있는 설명·실제 버튼 제공 |
| HOME | 기존 평면 배너와 HTML 제목/버튼 | 정글 배너 로딩 시 기존 제목/설명 중복 숨김. 데스크톱 실제 CTA 정렬, 모바일은 전체 그림 아래 실제 설명/CTA 배치 |
| PLAY | 기존 SVG 경로 도식; 활성 카드 hover 시 파란 글자가 파란 배경에 겹침 | 모드별 일러스트를 원본 비율의 동일 슬롯에 표시. 기존 내용 순서·싱글 모달·duel/group 이동 유지. 상태별 대비 확보 |

수정/추가 파일:

- `public/assets/wiki-race/jungle65/*.webp` 5개: 누락된 실서비스 에셋 설치.
- `css/jungle65.css`: 실제 이미지 비율·클릭 영역·모바일 배너, 카드 CTA 대비/포커스/비활성 표현. 이전 daily-course CSS에 들어 있던 리터럴 `\n`을 실제 줄바꿈으로 정리.
- `css/wikiRaceBase.css`: 기존 hover 글자색이 테마 변수를 사용하도록 변경. 테마 변수가 없으면 종전 파란색 유지.
- `pages/IntroPage.jsx`: 모바일 설명과 이미지 대체 텍스트, 닫기 버튼 위치만 조정. 인증 함수는 변경하지 않음.
- `tests/jungle65DesignEntry.test.js`: 루트 public의 실제 WebP 존재·파일 형식·RIFF 길이를 확인하는 회귀 검사 추가. 전달 패키지 폴더가 없어도 실행 가능.
- `scripts/jungle65-design-smoke.mjs`: 기존 Playwright/Vite로 실제 앱을 실행해 이미지 디코딩·응답 형식·반응형·UI 조작·상태별 대비를 확인. 외부/백엔드 요청은 검증용 fixture로 응답.
- 이 문서: 원인·전체 에셋 목록·검증·미확인 범위 기록.

인증 창 검수에서 두 가지 기존 충돌도 확인했다. 닫기 버튼이 모달 바깥의 화면 오른쪽 위에 있어 사운드 도구에 가려졌으므로 dialog 안으로 옮기고 44px 조작 영역을 제공했다. 모달 높이·상단 여백도 조정해 사운드 도구 아래에서 전체 모달을 볼 수 있게 했다. 또한 `app.css`의 `.intro-modal-card` 다크 입력 색상과 정글의 밝은 배경이 충돌해 탭/입력 글자가 흐려졌다. 정글 랜딩 모달 범위에서만 밝은 테마 변수를 지정하고 실제 입력 글자 대비를 검사했다. `LoginPage`·authContext·AudioControls·오디오 서비스는 변경하지 않았다 [코드/산출물: 위 수정 파일, after/signup-desktop.png·signup-mobile.png].

## 3. Hover 원인과 해결

기존 `.wr-mode:not([aria-disabled="true"]):is(:hover, :focus-visible) .wr-mode-action`의 specificity는 (0,4,0), 정글 `.wr-page.wr-play .wr-mode-action`은 (0,3,0)이었다. hover/focus에서 기존 규칙의 `color: var(--wr-blue)`가 승리해 `rgb(50,104,168)` 글자가 파란 그라데이션 위에 표시됐다. 실제 native disabled는 false, 글자/부모 opacity는 1, filter는 none이었다. 이 문제는 1:1뿐 아니라 세 활성 카드에서 동일하게 재현됐다 [코드: `css/wikiRaceBase.css`, `css/jungle65.css`; 산출물: before/report.json].

기존 규칙이 `--wr-mode-action-hover-color`를 읽도록 수정하고 정글 카드가 흰색을 지정한다. hover·focus-visible·active에서는 배경만 더 진하게 한다. aria-disabled/disabled는 별도의 중립 배경을 사용하며 기존 게스트 제한 로직은 보존했다. 이 수정에 새 `!important`는 사용하지 않았다.

브라우저 computed style에서 일반 CTA 최소 **5.65:1**, hover/focus-visible/active **6.67:1**, 비활성 안내 **5.91:1**을 확인했다. 그라데이션 양 끝의 RGB를 기준으로 글자와의 최소 대비를 계산했다. 키보드 포커스 외곽선은 3px이며 Enter로 기존 모달·모드 경로에 진입했다. 모바일 터치도 같은 경로로 이동했다 [산출물: after/report.json, browser.log].

## 4. 검증 결과

| 검증 | 결과 |
|---|---|
| 로컬 Chromium 151 / Playwright UI | **63개 통과**, pageerror/console error 0 |
| 화면 크기 | 랜딩/HOME/PLAY 각각 1440×1000, 390×844, 320×844, 768×1024, 1024×768에서 이미지 디코딩·가로 넘침 확인. 추가 320/768/1024 검사는 reduced-motion 적용 |
| 상태/조작 | 세 카드 normal/hover/focus-visible/active, native disabled, 게스트 온라인 제한. Enter/모바일 tap의 싱글 설정 및 duel/group 이동. 로그인/가입 모드·창 닫기·음소거·음량 조작 |
| 데이터 UI | 검증용 데이터에서 오늘의 도전·XP·프로필 링크·랭킹 영역 표시 유지. 실제 지급이나 실제 서버 인증의 검증은 아님 |
| 에셋 | 5개 모두 HTTP 200 **image/webp**, naturalWidth/Height 정상. 패키지 원본=public=dist 바이트 일치 |
| 디자인 테스트 | `node --test tests/jungle65DesignEntry.test.js` **5/5 통과** |
| 전체 테스트 | `npm test` **746개 중 745 통과 / 기존 1개 실패**, exit 1 |
| 프로덕션 빌드 | `npm run build` exit 0. 기존 500kB 초과 청크 경고 유지 |
| diff | `git diff --check` exit 0 |
| lint | package.json에 lint 스크립트 없음. 새 도구/의존성 추가하지 않음 |

전체 테스트의 실패는 `tests/publicRooms.test.js:12`의 `migration PL/pgSQL uses complete dollar-quoted blocks`다. 테스트가 LF 전용 `/\bas \$\$\n/g`로 opening 6개를 기대하지만, 변경하지 않은 로컬 SQL은 CRLF 164줄이므로 0개로 센다. LF 정규화 후에는 6개이고 SQL·테스트가 모두 HEAD와 동일함을 정규화 대조했다. 이번 범위를 지키기 위해 이 테스트와 SQL은 변경하지 않았다 [산출물: `.temp/jungle65-20261031/{npm-test.log,baseline-eol.json}`].

브라우저에는 기존 React Router future-flag warning이 있으며 오류와 구분했다. 로컬 브라우저의 loopback 접속이 샌드박스에서 차단돼 브라우저 검증 명령만 제한 밖 실행을 사용했다. 스크립트는 별도 브라우저 context와 로컬 fixture를 사용하며 운영 요청을 전송하지 않는다.

로그: `.temp/jungle65-20261031/{browser.log,npm-test.log,build.log,baseline-eol.json}`. 수정 전/후 이미지와 computed style: 같은 폴더 `before/`, `after/`의 report.json 및 PNG. 이 로컬 산출물은 Git 제외다.

## 5. 미적용·미확인 및 재확인 방법

- 요청 범위의 미적용/누락 에셋 **없음**. 제공된 WebP 5개 전부 사용. 텍스트/버튼 레이어가 분리된 별도 모바일 원본은 제공되지 않았으므로 생성·대체하지 않았다. 작은 화면에서는 실제 HTML 설명과 버튼으로 보완했다.
- 실제 모바일 기기·Safari·서버 로그인/회원가입 완료·실제 XP/랭킹 데이터는 이번에 재검증하지 않았다. 검증용 backend 응답을 실제 DB 성공의 근거로 사용하지 않는다.
- 게임 로직·DB·Supabase·Edge Function·API 계약·서비스·새 의존성 변경 없음. commit/push/운영 배포 없음. 기존 이미지와 사용자가 추가한 패키지는 보존했다.
- 후속 추천: 기존 LF 전용 테스트의 Windows 호환성은 별도 범위에서 수정. 통합 시 CURRENT.md의 뒤처진 상태를 실제 이력과 함께 갱신. 실제 기기에서 이미지와 버튼을 최종 확인.

```powershell
npm run dev
# /, /lobby, /play 확인
node --test tests/jungle65DesignEntry.test.js
node scripts/jungle65-design-smoke.mjs
npm test
npm run build
git diff --check
```

Playwright가 설치된 브라우저를 기본 위치에서 찾지 못하면 이 환경에서는 다음을 먼저 설정한다. 프로젝트 의존성을 새로 설치할 필요는 없었다.

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = 'C:/Users/SSAFY/AppData/Local/ms-playwright'
node scripts/jungle65-design-smoke.mjs
```
