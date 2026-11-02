# Jungle65 — 2차 폴리싱 시각 회귀 선별 수정

기준: **`bd87c4dd88857b74da19c585660c8c65f605b91e` + 기존 미커밋 작업 + 이번 선별 수정, 2026-11-02 KST**. 브랜치 `feat/jungle65-design-20261030`, Windows / Node 24.18.0 / npm 11.16.0 / 기존 package-lock.json·Playwright 사용. 아래 검증 수치는 모두 이 기준과 날짜다.

## 1. 작업 요약 — 복원한 요소와 유지한 요소

랜딩/HOME의 큰 불투명 HTML 패널을 제거해 원본 로고·그림 구도를 복원했다. PLAY 간소화, HOME 1400px 폭과 대시보드, 로그인/가입 문구·키보드 관리는 유지했다. 테스트 통과와 별도로 **이전/회귀/복원 스크린샷을 직접 열어 시각적 결과를 비교**했다.

| 영역 | 복원·제거 | 유지·추가 개선 |
|---|---|---|
| 랜딩 | 거대 양피지 패널·텍스트·음영 제거. 원본 Wiki Race 로고·양피지 장식·두 탐험가·배경을 전체 비율로 표시 | 데스크톱의 실제 로그인/가입·공개 링크 클릭 영역. 모바일/태블릿은 그림 아래 별도 52px 로그인/가입 버튼 |
| 태블릿 랜딩 | 화면 중앙의 과도한 위쪽 공백을 줄이고 그림을 상단 24px 여백 뒤에 배치 | 1672:941 비율 그대로 표시. 이미지 아래 로그인/가입 2열 버튼으로 작은 그림 속 버튼을 누를 필요가 없음 |
| HOME 배너 | 큰 사각형 문구 패널 제거. 원본 지도·경로·다리·깃발·Wiki Race 간판 복원 | 데스크톱/태블릿은 이미지 속 CTA에 투명 버튼을 정렬. 작은 화면은 이미지 아래 실제 CTA. 목적지 `/play` 유지 |
| HOME 본문 | 이번 요청에서 수정 없음 | 최대 폭 1400px, 프로필·랭킹·최근 탐험 일지·누적 탐험 전적, 기존 daily 버튼 및 게임 진입 상태 전체 유지 |
| PLAY | 이전의 긴 기본 설명 카드로 되돌리지 않음 | 일러스트·한 줄 소개·배지 3개·기본 접힘 상세·독립 CTA 유지. 설명 14px, 배지 12px. ‘자세히 보기’는 13px/44px 이상 높이·전체 너비 테두리·hover·`+ / −` 표시 추가 |
| 로그인/가입 | 수정 없음 | `탐험가 로그인` / `새 탐험가 등록`, 설명·동적 dialog 이름·Tab 순환·Escape·버튼 포커스 복귀·입력색과 모달 스타일 그대로 유지 |
| 이미지 fallback | 기존 Opening.png에도 로고가 있어 HTML 제목·문구를 겹치지 않게 제거 | Opening.png 전체를 `contain`으로 표시하고 실제 버튼은 아래 배치. HOME의 기존 text-free 지도와 PLAY SVG fallback도 유지 |

**이미지에 포함된 로고·문구를 새 불투명 패널로 덮지 않는다.** 새 메인 카피를 전면 적용하려면 문구 없는 새 에셋이 필요한 후속으로 남긴다. 이번에는 원본 WebP나 Opening.png를 편집하지 않았고 이미지 생성·새 의존성·외부 API를 추가하지 않았다 [코드: `pages/IntroPage.jsx`, `components/wiki-race/ExpeditionHero.jsx`, `css/jungle65.css`].

## 2. 수정 파일과 보존 확인

작업 전 변경 파일 **25개**의 원문·SHA-256·Git binary diff를 `.temp/jungle65-visual-repair-20261102/preserved/`, `preservation.json`, `starting.patch`에 보존했다. 초기 25개는 모두 남아 있으며 **20개는 바이트 동일**, 이번 허용 범위 **5개만 수정**했다. 이 기록 파일은 새로 추가했다 [산출물: 같은 폴더 `scope.json`].

| 이번에 수정·추가한 파일 | 이유 |
|---|---|
| `pages/IntroPage.jsx` | 로고를 가리던 패널 제거, 원본 이미지·투명 클릭 영역·별도 작은 화면 버튼, 비율을 보존하는 fallback |
| `components/wiki-race/ExpeditionHero.jsx` | 원본 배너 위 중복 문구 제거, 실제 CTA와 이미지 밖 fallback 안내만 표시 |
| `css/jungle65.css` | 위 두 그림의 contain/원본 구도 복원, 태블릿 여백, PLAY 상세 표시·작은 글자 개선. 기존 HOME/인증 스타일 보존 |
| `scripts/jungle65-polish-smoke.mjs` | 현재 화면에 맞춘 검사, 로고/탐험가 비가림·원본 비율·클릭 영역·HOME 경로/깃발·CTA 정렬·상세 표시·듀얼 아이템 선택 검증. 이전 캡처를 덮지 않는 새 출력 폴더 |
| `docs/agent/JUNGLE65-COPY-POLISH-2026-11-02.md` | 이전 결론을 현재 사실로 오해하지 않도록 상단 정정만 추가. 기존 본문·검증 이력·스크린샷 보존 |
| 이 문서 | 선별 수정·실제 시각 비교·유지 사항·미확인 범위 인계 |

`pages/PlayPage.jsx`, `pages/MainPage.jsx`, `pages/LoginPage.jsx`는 **이번 요청 시작 시점과 파일 전체가 동일**하다. Intro의 기존 state/effect/리다이렉트와 모달 전체 JSX, HOME 1400px/프로필/랭킹 CSS 및 인증 모달 CSS 규칙도 기존과 동일하다. WebP 5개는 원본 패키지와 바이트 동일하다. 기존 base CSS·테스트·이전 smoke·원본 패키지 등을 임의 복구·삭제하지 않았다 [산출물: `scope.json`, `browser/report.json`].

**Supabase/Edge/API 서비스·인증 서비스·게임 hook·App 라우터·오디오·package/lockfile·workflow·CURRENT는 HEAD와 diff 0**이다. daily 동작은 MainPage 전체 보존과 기존 테스트로 확인했다. UI smoke에서는 actual single 설정 열기·duel/group 경로·게스트 차단과 듀얼 아이템 체크박스를 확인했고, 방 생성이나 게임 시작을 서버에 요청하지 않았다 [산출물: `scope.json`, `npm-test.log`, `browser/report.json`].

## 3. 검증 결과

| 검증 | 결과 |
|---|---|
| `npm test` | **746/746 통과**, 실패·skip·cancel 0 |
| `npm run build` | **exit 0**, 기존 500kB 초과 청크 경고 유지 |
| `node --check scripts/jungle65-polish-smoke.mjs` | 통과 |
| `git diff --check` | 통과 |
| 실제 Chromium UI fixture smoke | **156개 통과**, 정상 화면 page/console error 0 |
| 파일/기능 보존 대조 | **9개 검사 통과**, 초기 파일 소실 0 |
| 비교 자료 | **9개 비교 이미지 / 원본·회귀·복원 PNG 총 27개 참조** |
| 린트 | package.json에 lint 스크립트가 없어 별도 실행하지 않음 |

검증 산출물: `.temp/jungle65-visual-repair-20261102/{npm-test.log,build.log,browser.log,scope.json,browser/report.json,comparison-sources.json}`.

브라우저 검증 범위:

- 랜딩/HOME/PLAY: **1440×1000 / 390×844 / 320×844 / 768×1024 / 1024×768 / 1920×1080**. 모든 화면에서 가로 넘침 없음. 넓은 HOME의 shell 1400px 실측 유지.
- 랜딩: 실제 WebP 1672×941·렌더링 비율·contain 확인. 로고/양피지/탐험가/배경의 원본 좌표 4지점에 가리는 HTML이 없음. 데스크톱 그림 속 로그인/가입 버튼 내부 각 3지점이 실제 대응 버튼에 닿음. 작은 화면은 별도 버튼 사용.
- HOME: contain 유지, 실제 CTA 외 entry 배경은 투명. 두 깃발과 다리 좌표가 entry에 가려지지 않음. 큰 화면 CTA는 그림 속 버튼에 정렬되고 작은 화면은 이미지 아래에 있음.
- 로그인/가입: 데스크톱/모바일/320px/태블릿에서 제목·설명·탭 전환·첫 입력란 포커스, 양방향 Tab 각 14회, Escape 닫기와 원래 버튼 포커스 복귀. 기존 소리 툴바와 모달 비중첩.
- PLAY: 배지 3개, 기본 접힘, Enter 펼치기/Space 접기, `+ / −` 상태 표시, 44px 이상 클릭 영역, focus-visible, CTA 대비·데스크톱 행의 CTA 정렬. 기본 CTA 대비 5.65:1, hover/focus-visible 6.67:1, 게스트 제한 5.91:1 유지.
- 데스크톱 Enter/모바일 tap으로 싱글 설정·duel/group 경로 확인. 게스트의 싱글 설정은 열리고 온라인 모드는 Enter/Space/포인터 모두 차단. 듀얼의 아이템 사용을 해제·재선택하여 로컬 UI 상태 전환 확인.
- 데스크톱·모바일에서 랜딩/HOME/PLAY 이미지 실패를 의도적으로 만들어 기존 대체 이미지·클릭 동작 확인. 의도적 404 진단은 정상 오류와 분리. reduced-motion의 CTA transition 0s 확인.

모바일 PLAY 기본 카드 실측(390×844, 같은 시스템 폰트·fixture):

| 모드 | 이번 수정 전 | 수정 후 |
|---|---:|---:|
| 싱글 | 426.45px | **426.55px** |
| 1:1 | 426.45px | **426.55px** |
| 그룹 | 426.45px | **426.55px** |

글자를 키우면서 배지 패딩과 상세 클릭 영역 높이를 조정해 카드 길이를 유지했다. 펼친 상세는 필요한 만큼 늘어난다 [코드: `css/jungle65.css`; 산출물: `scope.json`, `browser/report.json`].

## 4. 실제 시각 비교와 스크린샷

비교 기준은 사용자 지정 경로를 그대로 사용했다. 왼쪽은 `.temp/jungle65-final-20261101/browser/`, 가운데는 `.temp/jungle65-polish-20261102/browser/`, 오른쪽은 이번 `.temp/jungle65-visual-repair-20261102/browser/`다. 이전 산출물은 덮어쓰지 않았다.

**[비교 뷰어 열기](../../.temp/jungle65-visual-repair-20261102/comparison.html)** — 화면과 크기를 고르면 세 버전을 나란히 볼 수 있다. 긴 캡처는 각 영역에서 스크롤하고 이미지를 눌러 전체 PNG를 연다.

| 화면 | 데스크톱 비교 | 모바일 비교 | 태블릿 비교 |
|---|---|---|---|
| 랜딩 | [PNG](../../.temp/jungle65-visual-repair-20261102/comparison-landing-desktop.png) | [PNG](../../.temp/jungle65-visual-repair-20261102/comparison-landing-mobile.png) | [PNG](../../.temp/jungle65-visual-repair-20261102/comparison-landing-tablet.png) |
| HOME | [PNG](../../.temp/jungle65-visual-repair-20261102/comparison-home-desktop.png) | [PNG](../../.temp/jungle65-visual-repair-20261102/comparison-home-mobile.png) | [PNG](../../.temp/jungle65-visual-repair-20261102/comparison-home-tablet.png) |
| PLAY | [PNG](../../.temp/jungle65-visual-repair-20261102/comparison-play-desktop.png) | [PNG](../../.temp/jungle65-visual-repair-20261102/comparison-play-mobile.png) | [PNG](../../.temp/jungle65-visual-repair-20261102/comparison-play-tablet.png) |

9개 비교 PNG와 새 원본 캡처를 실제로 열어 확인했다. 랜딩은 중앙 로고·장식과 두 탐험가가 원래 위치에 다시 보이고 가장자리도 잘리지 않는다. 태블릿은 그림 위 공백이 줄고 실제 버튼이 아래에 생겼다. HOME은 회귀 버전 패널에 가렸던 경로·깃발·다리가 다시 드러난다. 넓어진 본문, 밝아진 헤더 글자, 바뀐 섹션명은 유지된다. PLAY는 간소화된 카드 순서·길이를 보존하고 상세 펼치기 표시가 더 명확해졌다.

새 전체 캡처는 `browser/landing-{desktop,mobile,tablet}.png`, `home-{desktop,mobile,tablet}.png`, `play-{desktop,mobile,tablet}.png`다. HOME 배너만 크게 보려면 `browser/home-banner-*.png`, 펼친 규칙은 `browser/play-details-*.png`, 모달은 `browser/login-*.png`와 `signup-*.png`, fallback은 `browser/*-fallback-{desktop,mobile}.png`를 사용한다. 같은 폴더에 320px/가로 화면/1920px·게스트 캡처도 보관했다.

## 5. 남은 미확인 사항과 다음 추천 작업

실제 제품 React/CSS/정적 이미지를 실행했고 백엔드·Wikipedia·광고·웹폰트는 로컬 fixture로 가로챘다. 운영 DB/Edge에 접근하지 않았다. 라이브 인증 완료·실제 게임 완주·운영 XP/랭킹을 이번 검증 결과로 주장하지 않는다. 실휴대전화·Safari·가상 키보드·운영 웹폰트와 실제 브라우저 200% 확대는 미확인이다. 다음에는 실휴대전화에서 원본 로고와 실제 버튼의 크기, 가상 키보드가 열린 모달을 확인하는 것을 추천한다.

`CURRENT.md`는 078a690/2026-10-29 기준으로 HEAD보다 57커밋 뒤처져 있음을 작업 전에 보고했다. 트랙 worktree는 CURRENT를 수정하지 않는 AGENTS §7 예외를 따라 여기로 인계한다. 문서 갱신일은 확인일 기준 4일 전이며 운영 최신 상태를 추측하지 않았다.

이번 작업에서 **reset/restore/일괄 롤백/삭제/stash·stage·commit·push·main 병합·DB/Edge 적용·운영 배포는 수행하지 않았다.** `.temp/`의 보존본·로그·비교 페이지·PNG와 빌드 산출물은 Git 제외다.

재검증 명령(PowerShell):

```powershell
npm test
npm run build
$env:PLAYWRIGHT_BROWSERS_PATH = 'C:\Users\SSAFY\AppData\Local\ms-playwright'
node scripts/jungle65-polish-smoke.mjs
git diff --check
```

현재 smoke 출력은 `.temp/jungle65-visual-repair-YYYYMMDD/browser/`다. `--before`는 앞선 1차 디자인 원문 보존본을 읽는 과거 비교용 옵션으로 이번 일반 검증에는 쓰지 않았다. 로컬 sandbox가 loopback 접속을 차단하므로 브라우저 검증은 로컬 실행 권한으로 수행했고 기존 설치 Chromium을 재사용했다.
