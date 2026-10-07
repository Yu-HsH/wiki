# Jungle Expedition UI Phase 1 — 로컬 통합 기록

기준: **6629445 + 미커밋 작업 트리**, **2026-10-07**. commit/push/배포/운영 DB 적용 없음.
운영 상태는 `docs/agent/CURRENT.md`의 2026-10-06 배포 기록을 유지한다.

## Files changed

| 파일 | 변경 이유 |
|---|---|
| `App.jsx` | `/play`를 기존 `getLobbyAccess` 접근 판정으로 등록 |
| `pages/MainPage.jsx` | 기존 상태/서비스/핸들러를 유지한 HOME/PLAY 표시 분기, 실제 XP 요약 표시 |
| `pages/MultiplayerPage.jsx` | 허용된 `?mode=duel`/`?mode=group`로 기존 입력 패널 초기 선택. 미지정/잘못된 값은 기존 선택 화면 유지 |
| `appStyles.js` | 기존 동적 스타일 로딩 경로에 새 CSS 등록 |
| `tests/explorationRecords.test.js` | 이동한 게스트 온라인 제한을 PLAY에서 검사 |
| `scripts/ui-phase1-browser.mjs` | 실제 React 화면과 기존 서비스 경로를 격리된 API fixture로 검증 |
| `docs/agent/CURRENT.md` | 미커밋 UI 작업과 운영 상태를 구분하여 기록 |

## Components/styles created

- `components/wiki-race/WikiRaceShell.jsx`: Shell/Header, 승인된 ExplorerAvatar, 장식용 ExpeditionTrail.
- `components/wiki-race/ExpeditionHero.jsx`: 승인된 풍경/마스코트와 HOME → PLAY 버튼.
- `components/wiki-race/ExpeditionDialog.jsx`: 기존 검색/설명 모달의 포커스 순환·Escape·복귀.
- `pages/PlayPage.jsx`: 데이터/방 생성 로직 없는 모드 선택 표현 컴포넌트.
- `css/wikiRaceTokens.css`, `wikiRaceMotion.css`, `wikiRaceBase.css`: `.wr-page` 범위의 색상, 모션, 컴포넌트/반응형 스타일. 기존 다른 페이지의 변수/스타일을 덮어쓰지 않음.
- `public/assets/wiki-race/`: Freeze 내부 PNG 원본 7개와 PLAY SVG 3개. 출처는 같은 폴더 `README.md`.

## Existing production logic preserved

`pages/MainPage.jsx`의 통계/랭킹 조회, 서버 XP/레벨 조회, 업적 알림 및 sessionStorage dismiss,
실제 오늘 코스 조회·fallback·로딩 차단, 목표 검색, random/custom/daily `/game` payload,
방문 analytics, 로그아웃을 유지했다. XP 요약은 기존 조회 응답을 표시할 뿐 공식을 새로 만들지 않는다.

싱글은 `/play`에서 기존 검색 모달을 연다. 1:1/그룹은 `/multiplayer?mode=duel|group`의 기존
방 생성/코드 참가 패널로 이동한다. 게스트는 온라인 버튼이 `aria-disabled`이며 클릭/키보드
핸들러도 차단한다. 기존 ProtectedRoute 및 인증 context는 그대로다.

기존 게임 설명은 HOME의 Base Camp Board 버튼으로 접근한다. 기존 광고/법적 링크도 유지한다.
서비스, 인증, RPC, DB/migration, Edge, Realtime, 아이템, 결과, XP/업적/랭킹 규칙은 수정하지 않았다.

## Motion implemented

공용 fast/UI/page 타이밍과 standard/out/emphasized easing을 정의했다.
HOME은 풍경 등장, 경로 reveal, 체크포인트 순차 등장, 마스코트/PLAY/하단 구역의 짧은 entrance.
PLAY는 모드 배경·경로 그림 3px 이동·방향 문구 강조. 반복 이동이나 새 애니메이션 라이브러리는 없다.
`prefers-reduced-motion: reduce`에서는 범위 내 animation/transition과 큰 이동을 제거한다.

## Responsive behavior / Accessibility

데스크톱은 최대 1200px Shell과 같은 너비의 PLAY 3영역. 760px 이하에서 세로로 쌓고 헤더를
컴팩트하게 재배치한다. 390px/320px에서 가로 넘침을 검사했다. 작은 화면의 추가 장식은 숨긴다.

모드별 네이티브 button 하나, 자식 button/link 없음, Tab 1회·Enter/Space 활성화·명확한 focus.
스킵 링크, 실제 nav 링크의 현재 경로 표시, 모달 이름/포커스 순환·복귀, 검색 결과 키보드 선택,
장식 이미지의 빈 alt를 적용했다. 게스트 온라인 영역도 Tab으로 안내를 확인할 수 있다.

## Test / build result

**기준 6629445 + 미커밋 UI 작업 트리, 2026-10-07 [산출물]**:

- `npm test`: **511/511**, 실패/skip 0.
- `npm run build`: exit 0. 기존 큰 번들 경고는 남는다.
- `git diff --check`: exit 0.
- Freeze manifest의 승인 HTML 8개 SHA-256 일치. Freeze 폴더 읽기 전용 유지.
- lint: `package.json`에 lint 스크립트가 없어 실행하지 않음.

## Browser validation

`node scripts/ui-phase1-browser.mjs`: **32/32 [산출물, 동일 기준·날짜]**.
인증/게스트 HOME, HOME → PLAY, 직접 URL/F5, 싱글 setup, 1:1/그룹 기존 진입,
랭킹/업적/프로필 이동, 서비스 응답 XP/오늘 코스/최근 기록, 업적 알림 dismiss,
키보드 모드/검색/모달, 포커스, desktop/mobile, reduced motion을 확인했다.

**범위는 API fixture 기반 UI 검증이다. 실제 Supabase 인증·DB·게임 완주 검증을 대신하지 않는다.**
fixture는 테스트 스크립트에만 있다. 운영 요청은 실행하지 않았다. 브라우저 콘솔/page error 0은
기존 Google Fonts 및 광고 요청을 테스트에서 격리한 조건이다. 최초 환경의 외부 폰트 요청은
`ERR_NETWORK_ACCESS_DENIED`였으며, 실제 외부 폰트 로딩은 미확인이다.

검증 결과/스크린샷: `test-results/packet13-b1/ui-phase1/report.json`, `home-desktop.png`,
`play-desktop.png`, `lobby-390.png`, `play-390.png`, `lobby-320.png`, `play-320.png`.
스크린샷은 entrance 종료 상태를 캡처한다. PLAY desktop은 키보드 focus 표시를 포함한다.

## Differences from frozen HTML

- 오늘 코스는 기존 서비스의 단일 실제 코스를 표시한다. mock 3코스/완료 횟수를 도입하지 않는다.
- Featured/역사/오늘의 그림용 실제 데이터 소스가 없어 그 자리에 실제 랭킹 preview와 기존 통계/가이드를 배치한다. mock 문서/뉴스/기록은 복사하지 않는다.
- 기존 폰트 전략과 시스템 fallback을 유지한다. 번들의 외부 폰트 파일은 복사하지 않는다.
- 기존 기능인 로그아웃·광고·법적 링크를 보존한다.

## Deferred to Phase 2 / Risks / follow-up

멀티플레이어 실제 입장/로비, Single/Duel/Group RACE, Spectator, RESULT, Profile/Ranking/Achievements,
Public Guide, Login/Intro의 디자인 교체는 하지 않았다. 방 생성/참가 핸들러도 기존 구현이다.

다음 검증은 실제 로컬 테스트 계정에서 HOME → 각 모드 → 방 생성/참가 및 싱글 시작·오늘 코스
완주를 수행하는 것이다. 실제 운영 계정·XP 지급·Realtime/복구는 이번 UI 검증의 미확인 범위다.
배포는 별도의 건별 승인과 실제 경로 검증 후 진행한다.

재실행:

```powershell
npm test
npm run build
node scripts/ui-phase1-browser.mjs
```

## Phase 1 visual review 후 두 항목 확인

**6629445 + 미커밋 작업 트리, 2026-10-07 [코드·산출물]**.

1. 모드 기본 CSS는 세 열 모두 transparent이며 동일하다. 기존 스크린샷은 Single의 복귀된 키보드 포커스와 Duel의 남아 있던 마우스 hover가 동시에 캡처된 상태다. 기본 배경/Blue 전체 영역 포커스 규칙은 수정하지 않았다. 각 모드 hover가 해당 열에만 적용되고 해제되면 기본 상태로 복귀하는 것을 계산된 스타일로 확인했다.
2. 누락된 Freeze PLAY의 점선 경로 3개를 복원했다. PlayPage.jsx에 aria-hidden/focusable=false SVG, wikiRaceBase.css에 absolute·pointer-events:none·낮은 대비·모바일 숨김을 추가했다. 정적 장식이므로 reduced motion에서도 움직이지 않는다. 표시/숨김 전후 열의 좌표·크기가 같아 레이아웃 영향이 없다.

브라우저 전체 회귀 **42/42**, build/diff exit 0. 이번 후속에서 npm 전체 테스트는 재실행하지 않았으며 위 511/511은 앞선 Phase 1 검증이다. API fixture 조건과 실서버 미검증 범위는 동일하다. HOME 및 PLAY 배치 변경 없음. commit/push/배포 없음.

별도 재캡처: play-desktop-base.png, play-desktop-hover.png, play-desktop-focus.png; 모바일 play-390.png/play-320.png. 산출물 폴더는 위와 같다.
