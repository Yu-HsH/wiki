# 병렬 트랙 파일 소유권 — 단일 기준

갱신 날짜: 2026-09-02 (2차)
기준 커밋: `e1b5546` (`docs: set up four parallel tracks with exclusive file ownership`)
이전 기준: `f40e071`
브랜치: `feat/group-final-gaps`

> **2차 갱신에서 바뀐 것 (2026-09-02):** **결정 3건이 확정됐다** (§9.1) ·
> **창 범위가 4항목으로 확정됐다** (§7.1, G2-② 제외) · **창 절차 초안 T-1~T6 신설** (§7.6) ·
> **공유 자원 감사 7건 신설** (§2.3 — 파일은 갈렸는데 배열·리터럴·CSS 이름을 공유하는 곳) ·
> **미배정 파일 21개를 동결로 명시** (§2.1) · **`ensure_today_daily_challenge`가
> `drop function`을 요구한다는 발견** (§7.2).

> ## 이 문서가 **병렬 작업의 SSOT**다
>
> **트랙이 넷 동시에 열린 것은 처음이다.** 계약(`docs/contracts/`)은 *무엇을 만드는지*를
> 고정했고, 이 문서는 *누가 어느 파일을 쓰는지*를 고정한다.
>
> **두 트랙이 같은 파일을 쓰면 그것은 병렬이 아니다.** 그래서 소유권은 **배타적**이며,
> 겹치는 것은 숨기지 않고 §3~§5에 판정과 순서를 적었다.
>
> 판정·현재 상태가 어긋나면 **`docs/agent/CURRENT.md`가 우선한다.**

**근거 태그:** `[코드]` 저장소 실측 · `[문서]` 문서 기재 · `[산출물]` 실행 결과 ·
`[추정]` 근거 있는 추정 · `확인 필요` 미확정. **운영 DB는 조회하지 않았다.**

---

## 0. 규칙

| # | 규칙 |
|---|---|
| **R1** | **§2의 화이트리스트 밖 파일은 건드리지 않는다.** 필요해지면 트랙을 멈추고 이 문서를 먼저 고친다 |
| **R2** | **§2.1 동결 파일은 어느 트랙도 쓰지 않는다.** 소유자가 없다는 뜻이며, 비어 있다는 뜻이 아니다 |
| **R3** | **남의 파일은 읽는다. 고치지 않는다.** 남의 파일이 고쳐져야 하면 그것은 의존이고 §8에 적힌다 |
| **R4** | **공개 계약(export·prop·RPC 시그니처)을 바꾸면 남의 파일이 깨진다.** §2.2의 계약 유지 조건을 지킨다 |
| **R5** | **migration은 append-only.** 기존 12개 파일을 수정하지 않고 새 파일을 추가한다 (`AGENTS.md` §4). 파일명 접두사는 §2.4에서 예약한다 |
| **R6** | **운영 DB에 적용하지 않는다.** 트랙의 산출물은 migration **파일**이고, 적용은 별건 승인이다 (`AGENTS.md` §1) |
| **R7** | **CSS는 `appStyles.js`에만 등록한다.** 컴포넌트·`main.jsx`에서 css를 static import하면 점검 화면 경로에 CSS 요청이 생기고 `tests/maintenanceGate.test.js:275`가 막는다 `[코드]` |
| **R8** | **수치에는 기준 커밋과 날짜를 붙인다** (`AGENTS.md` §6). 트랙마다 `npm test` 수가 달라지므로 특히 그렇다. 현재 베이스라인은 **144/144** (기준 `48e3f2d`, 2026-09-02) |
| **R9** | **§2.3의 공유 자원 불변식을 깨지 않는다.** 파일 소유권으로 표현할 수 없는 겹침이 7건 있다 — 배열·상수·문자열 리터럴·CSS 클래스 이름·훅 반환 형태. **화이트리스트가 잡지 못하는 종류이므로 티켓 문구와 grep 가능한 불변식으로 강제한다** |
| **R10** | **§2에 없는 파일은 동결로 취급한다.** 이름이 표에 없다는 것은 "자유"가 아니라 "소유자 미정"이다. 필요해지면 트랙을 멈추고 이 문서를 고친다 (R1) |

---

## 1. 열린 트랙 — 선행 조건 정정

| 트랙 | 내용 | 사용자 제시 선행 조건 | **판정** |
|---|---|---|---|
| **A** | C5 프로필 카드 공통 컴포넌트 | 없음 | **없음 — 맞다.** DDL 0, 다른 계약 대기 0 (C5 머리말) |
| **B** | 17a-2 기록·게스트 | 없음 | **없음 — 맞다.** 서버 자산이 이미 있다 (§8-B) |
| **C** | 14 아이템 서버 권위 | G7 (아이템 ID 확정) | **G7 — 맞다. 그리고 차단이다.** ID가 event_type 명명·payload 키·카탈로그 파일명을 전부 결정한다 |
| **D** | 15a XP ledger·지급·감쇠 | 없음 | **없음 — 조건부로 맞다.** C2-①(`floor`)·②(KST)는 **제안값이 있어** 진행 가능하고, C2-③은 **C2 §4가 이미 넓은 쪽(3열 유니크)으로 결정**했다. **차단 아님, 인지 대상** |

> **A는 아무것도 기다리지 않지만, A를 기다리는 것은 많다** (§5).
> **이 웨이브에서는 아무 트랙도 A를 기다리지 않게 범위를 잘랐다** — 그래서 넷이 동시에 열린다.

---

## 2. 파일 소유권 지도

### 2.0 배타 소유 — 이 표가 화이트리스트다

| 파일 | 줄수 | **소유** | 근거 |
|---|---:|:-:|---|
| **components/ProfileCard.jsx** | 신규 | **A** | C5 §5 |
| **components/ProfileAvatar.jsx** | 신규 | **A** | C5 §5 |
| **css/profileCard.css** | 신규 | **A** | R7 |
| **tests/profileCard.test.js** | 신규 | **A** | 수용조건 |
| pages/ProfilePage.jsx | 334 | **A** | C5 §4 지점 1. 아바타 `:191-201` · 이름 fallback `-` `:64` `[코드]` |
| pages/RankingPage.jsx | 195 | **A** | C5 §4 지점 3. `:145-150` · `Unknown` `:132` · 빈 `alt` `[코드]` |
| components/UserProfileModal.jsx | 113 | **A** | **C5 §4 지점 2(공개 프로필)의 실제 파일.** `:74-79` `[코드]` |
| pages/GroupRoomPage.jsx | 558 | **A** | C5 §4 지점 4(로비 참가자 행). 인라인 스타일 `:493·500` · `U` `:503` `[코드]` |
| appStyles.js | 7 | **A** | 이 웨이브에서 CSS를 추가하는 트랙이 A뿐이다 |
| **pages/GamePage.jsx** | 898 | **B** | 싱글 게임·게스트 단일 진입점 |
| **components/SuccessOverlay.jsx** | 375 | **B** | **싱글 결과 화면** (§3) |
| css/SuccessOverlay.css | 31 | **B** | 위와 한 짝 |
| pages/MainPage.jsx | 548 | **B** | 게스트 게이팅 `:199·208·433-479` `[코드]`. **일부 영역 동결 — §2.2** |
| services/singleGameService.js | 110 | **B** | 소비자가 `GamePage.jsx` 하나 `[코드]` |
| utils/singleGameSession.js | 176 | **B** | 게스트 세션 저장 |
| utils/localAuthSession.js | 16 | **B** | 게스트 복원 |
| authContext.jsx | 336 | **B** | 게스트/로그인 경계. **게이트 계약 유지 — §2.2** |
| App.jsx | 277 | **B** | 게스트 라우트 접근 판정 |
| rankingService.js | 229 | **B** | 기록·랭킹 **데이터** 계층 |
| services/profileStatsService.js | 146 | **B** | 전적·공개 프로필 조회 |
| services/analyticsService.js | 52 | **B** | 기록 계측 |
| pages/IntroPage.jsx | 101 | **B** | **게스트/로그인 경계.** 17 §6 "로그인 창이 중복으로 열리지 않도록 단일 modal 상태 사용"이 이 화면이다 |
| pages/LoginPage.jsx | 318 | **B** | 같은 경계. `IntroPage`가 import한다 `[코드]` |
| **utils/resultReasonLabels.js** | 신규 | **B** | **C4 §3.4의 프론트 단일 모듈.** 배정 근거와 조건은 §2.2 |
| tests/appRouting.test.js | — | **B** | **공유 위험 있음 — §2.2** |
| tests/guestSingleSession.test.js | — | **B** | 게스트 계약 |
| **data/duelItems.js** | 신규 | **C** | G7 확정 후. 신규 카탈로그 |
| **components/DuelItemBar.jsx** | 신규 | **C** | 5슬롯 HUD (14 §6). `ItemBar.jsx`를 변형하지 않는 이유는 §2.2 |
| **services/duelItemService.js** | 신규 | **C** | 아이템 사용 RPC 클라이언트 |
| **supabase/migrations/…_duel_item_authority_v3.sql** | 신규 | **C** | §2.4 |
| **supabase/tests/duel_item_authority_v3.sql** | 신규 | **C** | pgTAP |
| pages/MultiplayerGamePage.jsx | 1458 | **C** | 1:1 게임·아이템·**1:1 결과 화면** `:1437-1454` `[코드]` |
| pages/MultiplayerPage.jsx | 341 | **C** | 아이템전 선택 `:26·144-147` · 아이템 설명 `:314-325` `[코드]` |
| pages/RoomPage.jsx | 667 | **C** | 1:1 방·준비. 아바타 `:477·596` `[코드]` |
| components/VsIntroOverlay.jsx | 41 | **C** | 1:1 인트로 이니셜 `:22·35` `[코드]` |
| services/multiplayerService.js | 188 | **C** | 1:1 RPC 클라이언트 |
| css/multiplayer.css | 1732 | **C** | 1:1 HUD·결과 스타일 |
| data/items.js · data/itemPools.js · utils/itemSystem.js · hooks/useItemSystem.js · components/ItemBar.jsx | 160·25·80·315·51 | **C** | **조건부 — §2.2. 삭제 금지·prop 계약 유지** |
| tests/duelSwapDisabled.test.js · tests/serverAuthorityMigration.test.js | — | **C** | 기존 아이템·V2 계약 테스트 |
| **supabase/migrations/…_xp_ledger_v1.sql** | 신규 | **D** | §2.4 |
| **supabase/tests/xp_ledger_v1.sql** | 신규 | **D** | pgTAP |
| **services/xpService.js** | 신규 | **D** | 지급·요약 RPC 클라이언트 |
| **utils/xpRules.js** | 신규 | **D** | 감쇠·경계 규칙 (C2 §5) |
| **tests/xpLedger.test.js** | 신규 | **D** | 수용조건 |

> **D는 기존 파일을 하나도 쓰지 않는다.** 넷 중 유일하다. **그래서 D는 어느 트랙과도
> 물리적으로 충돌할 수 없다** — 충돌 가능성은 전부 15b에서 시작한다 (§6).

### 2.1 동결 — 소유자 없음

| 파일 | 왜 동결인가 |
|---|---|
| **pages/GroupGamePage.jsx** (1603) | **한 파일이 세 역할을 한다** — 그룹 게임 + 관전 + **그룹 결과 2블록**(`:1212-1280` 내 기록, `:1450-1500` 최종 순위) `[코드]`. 어느 트랙에 줘도 그 트랙이 그룹 결과 화면의 소유자가 된다. **이 웨이브에는 그룹 결과를 바꿀 트랙이 없다** (§3) |
| **services/dailyChallengeService.js** (109) | 17a-1(3코스) 소유. B의 범위는 "3코스 제외"다 |
| **utils/serverAuthority.js** (91) | 싱글·1:1·그룹 3경로가 전부 import한다 `[코드]`. 여기를 고치면 트랙 셋이 동시에 흔들린다 |
| **services/groupMultiplayerService.js** · **services/groupSpectatorService.js** · **utils/groupGameFlow.js** · **utils/groupGameTimer.js** · **utils/groupResultFormatter.js** · **css/group.css** · **css/groupSpectator.css** | 그룹 축. 이 웨이브에 그룹 트랙이 없다 |
| **utils/maintenanceGate.js** · **components/MaintenanceScreen.jsx** · **main.jsx** · **tests/maintenanceGate.test.js** | **다음 창에서 다시 쓴다.** `VITE_MAINTENANCE_BYPASS`는 유지돼 있다 (`AGENTS.md` §1.1) |
| **supabase/migrations/** 기존 12개 · **supabase/baseline/remote_schema.sql** | append-only (R5) |
| **docs/contracts/** C1~C5 · README | **계약이다.** 트랙이 계약을 바꾸려면 트랙 밖 결정이 먼저다. 발견한 불일치는 §9에 모은다 |
| **docs/design/\*.html** | 시안 원본. 수정하지 않는다 (`PACKET-CONTRACT-GAPS.md` §8) |
| wiki.jsx · components/WikiViewer.jsx · services/wikiService.js · services/wikiLinkPolicy.js · services/wikiSnapshotService.js · css/wiki.css | 본문·링크 정책 축. 어느 트랙의 범위도 아니다 |
| **css/app.css** (2344) | **A와 B가 함께 쓴다** — `.profile-avatar-*`·`.ranking-avatar-*`(A 영역)와 `.auth-*`·MainPage 스타일(B 영역)이 한 파일에 있다 `[코드]`. **A의 신규 스타일은 `css/profileCard.css`로 가고, 기존 클래스는 감사 전까지 그대로 둔다** (`AGENTS.md` §4) |
| **utils/appRoutes.js** (15) | **A·B·C가 전부 import한다** (`ProfilePage`·`RankingPage`(A) · `GamePage`·`App.jsx`(B) · `MultiplayerPage`(C)) `[코드]`. 게다가 `tests/appRouting.test.js`가 상수와 함수를 직접 검사한다 |
| **components/CountdownOverlay.jsx · EffectOverlay.jsx · ExitGuard.jsx · FloatingHud.jsx · PageLoadingOverlay.jsx · ScrollToTopButton.jsx · OnlineGameRecoveryPanel.jsx** | **싱글(B)·1:1(C)·그룹(동결)이 같은 컴포넌트를 mount한다** `[코드]`. **C가 새 아이템 연출이 필요하면 새 컴포넌트를 만든다** — `EffectOverlay`를 고치면 B의 싱글 화면이 함께 바뀐다 |
| **utils/onlineGameSession.js** (262) | **한 파일에 `validateDuelGameSession`(C 영역)과 `validateGroupGameSession`(동결 영역)이 함께 있다** `:130`·`:191` `[코드]`. `itemPools.js`와 같은 형태의 겹침이다 (§2.3-②) |
| **supabaseClient.js · services/targetService.js · utils/latestRequest.js · utils/groupTargetSummary.js · components/GameSetup.jsx · components/AdBanner.jsx · components/GroupPickOverlay.jsx · pages/PublicContentPage.jsx · css/recovery.css** | 여러 축이 공유하거나 어느 트랙의 범위도 아니다 |

### 2.2 공유 위험이 남은 파일 — 소유는 하나, 조건이 붙는다

| 파일 | 소유 | 왜 위험한가 | **조건** |
|---|:-:|---|---|
| **tests/appRouting.test.js** | **B** | **한 테스트 파일이 세 트랙의 파일을 문자열로 검사한다** `[코드]`: `GamePage.jsx`·`SuccessOverlay.jsx`(B) `:92-93`, **`MultiplayerGamePage.jsx`·`GroupGamePage.jsx`** `:167-168` | **C는 `navigate("/multiplayer", { replace: true })` 문자열을 유지한다** (`:172-175`). B는 그 assert를 건드리지 않는다 |
| **동 파일의 전역 스캔** | — | `:128`의 "앱 라우팅에서 `/main` 경로를 사용하지 않는다"가 **저장소 전체의 `.js`/`.jsx`를 훑는다** (`.git`·`dist`·`node_modules`·`tests` 제외) `[코드]` | **모든 트랙의 신규 파일에 `"/main"` 리터럴을 넣지 않는다** |
| **appStyles.js** | **A** | 7줄에 css import 7개. 두 트랙이 css를 추가하면 같은 줄 근처를 고친다 | **C는 기존 `css/multiplayer.css`를 쓴다.** B·D는 CSS를 추가하지 않는다 |
| **authContext.jsx · App.jsx** | **B** | `tests/maintenanceGate.test.js:309`가 `authContext.jsx`를 읽는다 `[코드]` | B는 게이트 관련 assert가 깨지지 않는 범위에서만 고친다. 깨지면 트랙을 멈추고 보고한다 |
| **pages/MainPage.jsx** | **B** | 한 파일에 **게스트 게이팅(B) + 오늘 코스 조회(`:155-167`, 17a-1) + 랭킹 탭(`:169-`의 `today/weekly/all`, 15b)** 이 함께 있다 `[코드]` | **B는 게스트 영역만 고친다.** 오늘 코스 블록과 랭킹 탭 블록은 **범위 밖** |
| **components/UserProfileModal.jsx** | **A** | 호출자가 셋이고 그중 **`RoomPage.jsx`는 C 소유**다 (`RankingPage:188` · `GroupRoomPage:551` · `RoomPage:658`) `[코드]` | **A는 prop 계약 `{userId, isOpen, onClose}`를 바꾸지 않는다** |
| **data/items.js · data/itemPools.js · utils/itemSystem.js · hooks/useItemSystem.js · components/ItemBar.jsx** | **C** | **싱글과 1:1이 같은 카탈로그를 쓴다.** `highlight_links`가 `SINGLE_ITEM_IDS`와 `MULTI_ITEM_IDS`에 **둘 다 있다** (`itemPools.js:2·13`) `[코드]`. `GamePage.jsx`(B)가 `useItemSystem`·`ItemBar`를 import한다 `:29·31` | **① `data/itemPools.js`에서 C는 `MULTI_ITEM_IDS` 배열만 수정한다. `SINGLE_ITEM_IDS`는 읽기 전용·동결** `[사용자 결정, 2026-09-02]` — §2.3-① **② `data/items.js`의 기존 11개 정의를 삭제하지 않는다** (`AGENTS.md` §4) **③ `ItemBar.jsx`의 기존 prop 계약을 바꾸지 않는다** — 새 HUD는 `DuelItemBar.jsx`로 만든다 **④ `useItemSystem`의 반환 형태를 바꾸지 않는다** — §2.3-③ **⑤ 신규 duel 카탈로그는 `data/duelItems.js`에 둔다** |
| **utils/resultReasonLabels.js** (신규) | **B** | **B(싱글 3경우)와 C(1:1 5경우)가 둘 다 이 모듈을 필요로 한다.** 각자 만들면 C4가 막으려던 어휘 분산이 그대로 재발한다 | **B가 C4 §3.1~§3.3을 한 번에 옮겨 적는다** — 그룹·1:1·싱글 세 표 전부. **계약이 동결됐으므로 이것은 설계가 아니라 전사(轉寫)다.** C는 **읽기 전용으로 호출만 한다.** ⚠ **C4-③(신규 모듈 vs `groupResultFormatter.js` 확장)이 "확장"으로 결정되면 이 배정은 무효다** — `groupResultFormatter.js`는 동결이므로 트랙을 멈추고 이 문서를 고친다 |

> **`highlight_links`가 이 웨이브에서 가장 조용한 함정이다.**
> `PACKET-CONTRACT-GAPS.md` §1.2가 "제거"로 판정한 3종 중 하나인데 **싱글 풀에도 들어 있다.**
> C가 스펙대로 지우면 **B의 파일이 런타임에 깨진다** — 파일 소유권은 지켜졌는데도 그렇다.

### 2.3 공유 자원 감사 — **화이트리스트가 못 잡는 겹침 7건** `[코드, 2026-09-02 전수]`

**파일은 갈렸는데 데이터를 공유하는 곳을 찾았다.** 배열·상수·문자열 리터럴·CSS 클래스 이름·
훅 반환 형태다. **파일 단위 소유권으로는 표현할 수 없으므로 불변식으로 강제한다.**

| # | 공유 자원 | 파일은 갈렸는데 | **불변식** |
|---|---|---|---|
| **①** | **`data/itemPools.js`의 두 배열** — `SINGLE_ITEM_IDS`(4종) · `MULTI_ITEM_IDS`(10종). `highlight_links`가 양쪽에 있다 | 파일은 **C 소유**인데 `SINGLE_ITEM_IDS`의 소비자는 **B의 `GamePage.jsx`**다 (`useItemSystem` 경유) | **C는 `MULTI_ITEM_IDS`만 수정한다.** `git diff`에서 `SINGLE_ITEM_IDS` 블록이 변경되면 위반이다. **`grep -c 'highlight_links' data/itemPools.js` = 2 유지** |
| **②** | **`utils/onlineGameSession.js`의 두 검증 함수** — `validateDuelGameSession`(`:191`) · `validateGroupGameSession`(`:130`) | 한 파일에 **C 영역과 동결 영역**이 같이 있다 | **동결.** C가 1:1 세션 복구를 고쳐야 하면 **트랙을 멈추고 이 문서를 고친다.** 그룹 함수와 공유하는 헬퍼(`normalizeOnlineGameError`·`retryRecoverable`)까지 흔들린다 |
| **③** | **`useItemSystem()`의 반환 형태** — `inventory`·`canUseItem`·`useItem`·`activeEffects`·`immunityUntil`·`highlightRequestId`·`searchAvailable`·`consumeSearchAvailable`·`status`·`pushHistory`·`clearPageScopedEffects`·`initializeItems` | 훅은 **C 소유**, 소비자는 **B의 `GamePage.jsx` 12지점** (`:423·426·473·491·821-845`) | **C는 반환 키를 제거·개명하지 않는다.** 추가만 허용. 위반하면 B의 파일이 런타임에 깨진다 |
| **④** | **`"wiki-single-items"` localStorage 키** — **import되지 않고 문자열이 4곳에 복제돼 있다** | `hooks/useItemSystem.js:26`(**C**) 가 쓰고, `utils/singleGameSession.js:6`(**B**)·`pages/GamePage.jsx:176·672`(**B**)·`tests/guestSingleSession.test.js:197`(**B**)이 지운다 | **양쪽 다 이 문자열을 바꾸지 않는다.** 한쪽만 바꾸면 게스트 아이템 상태가 정리되지 않고 다음 게임으로 새어 나간다 (17 §6 위반). **`grep -rc '"wiki-single-items"'` 합계 4 유지** |
| **⑤** | **`mp-*` CSS 클래스 이름공간** — `css/multiplayer.css`에 최상위 규칙 131개 | 파일은 **C 소유**인데 **A의 `GroupRoomPage.jsx`**, **동결된 `GroupGamePage.jsx`**, 동결된 `OnlineGameRecoveryPanel.jsx`가 `mp-page`·`mp-card`·`mp-title`·`mp-action-btn` 등을 쓴다 `[코드]` | **C는 기존 `mp-*` 규칙을 개명·삭제하지 않는다.** 1:1 전용 스타일은 새 클래스로 추가한다. 위반하면 **CSS만 고쳤는데 그룹 화면이 바뀐다** |
| **⑥** | **retire/result 어휘 문자열** — `"finished"`·`"retired"`·`"forfeited"`·`"left"` | **A**(`GroupRoomPage`) · **C**(`MultiplayerGamePage`) · 동결(`GroupGamePage`·`groupGameFlow`·`onlineGameSession`·`groupMultiplayerService`)에 **리터럴로 흩어져 있다** | **어느 트랙도 이 문자열을 바꾸지 않는다.** C4가 **5값 어휘를 유지하기로 결정**했으므로 지금은 안전하다 — 그 결정이 이 불변식의 근거다 |
| **⑦** | **`useAuth()`의 반환 형태** (`authContext.jsx`) | 파일은 **B 소유**인데 **13개 파일이 import한다** — A 4개·C 4개·동결 포함 `[코드]` | **B는 `user`·`loading`·`logout`과 `user.isGuest`·`user.id`·`user.displayName` 키를 유지한다.** 게스트 경계 작업이 정확히 이 형태를 만지는 작업이므로 **가장 조심할 항목이다** |

> **④가 이 감사에서 가장 나쁜 형태다.** 공유 심볼이 아니라 **복제된 리터럴**이라
> 컴파일러도 테스트도 잡지 못한다. 한쪽이 이름을 바꾸면 다른 쪽은 **조용히 아무것도 지우지 않는다.**

**추가로 확인해서 문제가 아니었던 것:**

| 확인한 것 | 결과 |
|---|---|
| duel `room_events` event_type과 그룹 이모티콘 event_type | **충돌하지 않는다.** 그룹 소비자가 `event_type !== "group_spectator_emoji"`면 즉시 반환한다 (`GroupGamePage.jsx:756`) `[코드]` |
| 1:1 localStorage 키 `wiki-mp-game:{roomId}:{userId}` | **C 단독** (`MultiplayerGamePage.jsx:127`) `[코드]` |
| `GROUP_GAME_PHASE` (`utils/groupGameFlow.js`) | A의 `GroupRoomPage`가 읽지만 **동결 모듈이라 아무도 안 고친다** |
| pgTAP·preflight의 migration 개수 의존 | **없다.** preflight는 고정 3개 버전만 조회한다 `[코드]` |

### 2.4 migration 파일명 예약

**두 트랙이 각자 timestamp를 고르면 적용 순서가 흔들린다.** 접두사를 미리 나눈다.

| 블록 | 트랙 | 제안 파일명 |
|---|:-:|---|
| `20260903 09` | **D** | `20260903090000_xp_ledger_v1.sql` |
| `20260903 10` | **C** | `20260903100000_duel_item_authority_v3.sql` |
| `20260904 0*` | **창 (§7)** | `20260904010000_profiles_grant_narrow.sql` → `…020000_profiles_total_xp.sql` → `…030000_daily_challenges_course_slot.sql` → `…040000_game_records_result_status_check.sql` |

**파일명은 제안이다. 순서 관계만 계약이다** — 창 블록의 4개는 **적은 순서대로 적용돼야 한다** (§7.2).
`supabase:preflight`는 고정된 3개 버전만 조회하므로 새 migration이 늘어도 깨지지 않는다
(`scripts/supabase-runtime-preflight.mjs:136-138`) `[코드]`.

---

## 3. 결과 화면 — 질문 1의 판정

**질문: §7 읽는 순서로 영역이 갈리는가, 파일이 하나라 순차여야 하는가.**

### 3.1 둘 다 아니다 — **파일이 하나가 아니고, 영역으로도 갈리지 않는다**

**결과 화면은 한 파일이 아니다. 네 지점이다** `[코드]`:

| 모드 | 파일·위치 | 형태 |
|---|---|---|
| 싱글 | `components/SuccessOverlay.jsx` (375줄, `GamePage.jsx:856`에서 mount) | **컴포넌트로 분리돼 있다** |
| 1:1 | `pages/MultiplayerGamePage.jsx:1437-1454` | 인라인 JSX 2블록 (승리/패배) |
| 그룹 — 내 기록 | `pages/GroupGamePage.jsx:1212-1280` | 인라인 JSX |
| 그룹 — 최종 순위 | `pages/GroupGamePage.jsx:1450-1500` | 인라인 JSX |

**그런데 §7의 6영역(①결과 ②기록 ③XP ④업적·보상 ⑤경로 ⑥행동)은 이 파일들 안에서 분리돼
있지 않다.** `ResultShell`이라는 것이 코드에 없다 — Freeze v1이 그 분해를 이름으로만 갖고 있다
(`PACKET-CONTRACT-GAPS.md` §2.3) `[문서]`.

→ **영역 단위 병렬은 지금 성립하지 않는다.** ③XP만 고치려는 트랙과 ①결과만 고치려는 트랙이
**같은 JSX 블록의 인접한 줄을 편집한다.**

### 3.2 그래서 이렇게 나눈다 — **모드 단위로 갈린다**

| 결과 지점 | **이 웨이브 소유** | 이유 |
|---|:-:|---|
| 싱글 (`SuccessOverlay.jsx`) | **B** | 17 §4의 "결과 화면과 프로필 history가 같은 권위 결과 사용"이 여기서 실제로 깨져 있다 — `SuccessOverlay.jsx:32-35`가 **`elapsedSeconds`·`clickCount`·`targetTitle` 값 일치로 내 순위를 클라이언트에서 추측한다** `[코드]` |
| 1:1 (`MultiplayerGamePage.jsx`) | **C** | 같은 파일이 아이템 HUD를 갖고 있어 분리 불가 |
| 그룹 2블록 (`GroupGamePage.jsx`) | **없음 — 동결** | §2.1 |
| **③ XP 영역** | **범위 밖** | 15 §6이고 **D의 범위가 아니다** (§6.3) |
| **④ 업적·보상 영역** | **범위 밖** | 패킷 16 |
| **프로필 카드 (C5 5번째 지점)** | **범위 밖** | §5.2 |

> **4트랙이 모두 결과 화면에 관계된다는 전제는, 범위를 자르면 사라진다.**
> D가 UI를 갖지 않고(§6.3) A가 5번째 지점을 미루면(§5.2) **결과 화면에 남는 트랙은 B와 C 둘이고,
> 둘은 서로 다른 파일이다.** 이것이 넷을 동시에 열 수 있는 이유다.

### 3.3 남은 부채 — 트랙 E 제안

**§7의 6영역을 실제로 분리하는 작업은 이 웨이브에 넣지 않는다.**

| | 내용 |
|---|---|
| **트랙 E (제안)** | `components/result/` 아래로 `ResultShell` + 6영역 컴포넌트 추출. **네 지점을 한 셸로 모은다** |
| **왜 지금이 아닌가** | ③XP는 15b·④업적은 16을 기다린다. **지금 추출하면 빈 영역 둘을 가진 셸이 나온다** |
| **왜 필요한가** | **추출 전에는 결과 화면에 트랙을 둘 이상 붙일 수 없다.** 15b·16·17b가 전부 결과 화면에 온다 |
| **선행** | A(프로필 카드) · D(XP 데이터) · 15b · 16 중 최소 A·15b |
| **성격** | **순차.** 병렬 트랙이 아니다 |

---

## 4. 프로필 화면 — 질문 2의 판정

**질문: C5와 15가 겹치는가.**

### 4.1 겹친다 — 문서상으로는 확실히

| | 요구 | 출처 |
|---|---|---|
| C5 | 프로필에 카드 전부 — 아이콘·칭호·배지 3·프레임·배경·**레벨** | C5 §4 `[문서]` |
| 15 | "프로필에 현재 레벨·현재/다음 XP 표시" | `15` §6 `[문서]` |

**둘이 같은 파일의 같은 영역을 요구한다** — `pages/ProfilePage.jsx`. 게다가 C5의 카드 형태
자체가 `level: integer | null`을 품고 있다 (C5 §2).

### 4.2 이 웨이브에서는 겹치지 않는다 — **15a가 UI를 갖지 않기 때문이다**

| 트랙 | ProfilePage.jsx | 판정 |
|---|:-:|---|
| **A** | **소유** | 아바타·이름 fallback·카드 골격 |
| **D (15a)** | **접근 금지** | 15a는 원장·RPC·규칙까지다. 레벨 표시는 **15b** (§6) |
| 15b (미개시) | **A 다음** | A가 만든 `ProfileCard`의 `level` 슬롯을 채운다 |
| 17b (미개시) | **A 다음** | 장착 편집 진입점 |

**순서: A → 15b → 17b.** 근거는 방향이다 — **A는 슬롯을 만들고 나머지는 슬롯을 채운다.**
반대로 하면 15b가 만든 레벨 표시를 A가 카드로 옮기며 다시 쓴다.

### 4.3 같은 화면의 DB 축은 또 다른 문제다

**`ProfilePage.jsx`는 C3-①의 대상이기도 하다** — `:85-87`이 `nickname`을, `:147-150`이
`profile_image_url`을 **클라이언트에서 직접 update한다** `[코드]`. 이것은 **파일 충돌이 아니라
권한 충돌**이며 창에서 처리한다 (§7.1-③). **A는 이 두 update 호출의 payload를 바꾸지 않는다** —
바꾸면 창의 grant 목록이 틀어진다.

---

## 5. 공통 컴포넌트 — 질문 3의 판정

**질문: C5가 만드는 것을 다른 트랙이 쓰는가. 쓴다면 C5가 선행이다.**

### 5.1 쓴다. 그리고 C5는 선행이다 — 다만 **이 웨이브에서는 아니다**

| 소비자 | `ProfileCard`/`ProfileAvatar`를 쓰는가 | 시점 |
|---|:-:|---|
| **B (17a-2)** | **이 웨이브에서는 안 쓴다** | 싱글 결과 화면에 아바타가 없다 `[코드]` |
| **C (14)** | **이 웨이브에서는 안 쓴다** | §5.2 |
| **D (15a)** | 안 쓴다 | UI 없음 |
| 15b | **쓴다** | 랭킹 행의 레벨·프로필 (C5 §4) |
| 16 | **쓴다** | 배지·칭호 (C1) |
| 17b | **쓴다** | 장착 상태 표시 |
| 트랙 E | **쓴다** | 결과 화면 = C5의 5번째 지점 |

> **"C5가 선행"은 사실이지만, 지금 A를 기다리는 트랙은 없다.**
> 넷을 동시에 열기 위해 **A의 소비자를 이 웨이브 밖으로 몰아냈다.** 그 대가는 §5.2다.

### 5.2 대가 — **C5의 적용 지점이 4곳도 5곳도 아니라 8곳이다** `[코드, 2026-09-02 실측]`

C5 §1이 4곳을, §4가 결과 화면을 더해 5곳을 셌다. **저장소를 전수 검색하면 8곳이다:**

| # | 위치 | 이름 fallback | C5 §1에 있나 | **이 웨이브** |
|---:|---|---|:-:|---|
| 1 | `ProfilePage.jsx:191-201` | `"-"` (`:64`) | 있다 | **A** |
| 2 | `RankingPage.jsx:145-150` | `"Unknown"` (`:132`) | 있다 | **A** |
| 3 | `GroupRoomPage.jsx:496-505` | `"U"` (`:503`) | 있다 | **A** |
| 4 | `GroupGamePage.jsx:1330` | `"참가자"` | 있다 | **동결** (§2.1) |
| 5 | `UserProfileModal.jsx:74-79` | 없음 (`alt="profile"`) | **없다** | **A** |
| 6 | `RoomPage.jsx:477-483` | **`"나"`** | **없다** | **C — 범위 밖** |
| 7 | `RoomPage.jsx:596-604` | **`"상대"`** | **없다** | **C — 범위 밖** |
| 8 | `MultiplayerGamePage.jsx:1398-1402` | **`"상대"`** | **없다** | **C — 범위 밖** |
| (+) | `VsIntroOverlay.jsx:22·35` | 이니셜 prop만 | **없다** | **C — 범위 밖** |

**이름 fallback은 4종이 아니라 6종이다** — `-` · `Unknown` · `U` · `참가자` · **`나`** · **`상대`**.
**A는 5곳(1·2·3·5 + 신규 컴포넌트)을 닫고, 4곳은 남는다.**

| 남는 곳 | 왜 남기나 |
|---|---|
| #4 `GroupGamePage.jsx` | 파일이 동결이다 (§2.1). **그룹 트랙이 열릴 때 닫는다** |
| #6·#7·#8·(+) | **C의 파일이다.** C가 A의 컴포넌트를 쓰면 C가 A에 종속되고 **병렬이 깨진다** |

> **이것을 숨기지 않는 이유.** "C5 구현 완료"라고 적으면 다음 세션은 8곳이 닫혔다고 읽는다.
> **닫히는 것은 5곳이고, 남은 4곳은 트랙 C·그룹 트랙의 후속이다.** A의 수용조건(§8-A)에
> 그 4곳을 **명시적으로 범위 밖으로 적었다.**

---

## 6. 작업 2 — 15를 두 조각으로 분리

### 6.1 판정: **성립한다.** 단 조건 둘이 붙는다

| | 사용자 제시 | 판정 |
|---|---|---|
| **15a** | ledger 테이블·지급 RPC·감쇠·멱등성 — 신규 테이블만 쓰므로 창 무관 | **성립.** 조건 C1·C2 |
| **15b** | `profiles.total_xp` 컬럼 추가·랭킹 정렬 — C3-① grant 축소에 종속 | **성립. 그대로 맞다** |

#### 조건 C1 — **`grant_xp_v1`이 `profiles`를 쓰면 분리가 무너진다**

C3 §5는 지급 경로를 이렇게 적었다 `[문서]`:

```sql
if found then
  update public.profiles set total_xp = total_xp + p_amount ...
```

**이 `update` 한 줄이 15a를 15b에 종속시킨다.** 그래서 조각을 이렇게 가른다:

| | 15a의 `grant_xp_v1` | 15b의 `grant_xp_v1` (교체본) |
|---|---|---|
| 원장 insert | **한다** (`on conflict … do nothing`) | 같다 |
| `profiles` update | **하지 않는다** | **추가한다** |
| 반환 `total_xp` | **원장 합계로 계산한다** — `sum(amount)` over `xp_ledger where user_id = p_user_id` | `profiles.total_xp`에서 읽는다 |
| `level_before`/`after` | 같은 합계에 `level_from_total_xp()` 적용 | 같다 |

- **비용:** 지급 1회당 사용자 1명의 원장 합산 1회. `xp_ledger_user_granted_idx`가 정확히 그
  쿼리를 받고, 현재 규모는 `users` 145 · `game_records` 59행이다
  (`PROD-SNAPSHOT-2026-09-02.md`) `[문서]` → **무시할 수준** `[추정]`.
- **`create or replace function`은 forward-only 교체다** — 15a의 파일을 고치지 않는다 (R5).
- **불변식(C3 §6)은 15b에서 처음 의미를 갖는다.** 15a에는 `profiles.total_xp`가 없으므로
  "원장 합계 = 컬럼" 검증 대상이 없다. **15b가 backfill과 함께 그 쿼리를 도입한다.**

#### 조건 C2 — **"신규 테이블만 쓴다"는 엄밀히는 참이 아니다**

`xp_ledger.user_id`가 `public.profiles(id)`를 참조한다 (C2 §1). **FK 생성은 참조되는 쪽에
잠금을 건다** — `SHARE ROW EXCLUSIVE`로 `profiles`의 쓰기를 순간 차단한다 `[추정]`.
읽기는 막지 않고, `profiles` 145행 규모에서 체감되지 않는다 `[추정]`.

> **구조 변경이 아니라 잠금 한 순간이다.** 그래서 **"창 무관"은 유지된다** —
> 다만 **"기존 객체를 전혀 건드리지 않는다"는 표현은 정확하지 않다.**

### 6.2 그리고 **"창 무관" ≠ "승인 무관"**

15a의 migration을 운영에 적용하는 것은 **`AGENTS.md` §1의 건별 승인 대상이다.**
"창 무관"이 뜻하는 것은 셋뿐이다: ① **3코스 창을 기다리지 않는다** ② **C3-① 결정을
기다리지 않는다** ③ **유지보수 게이트가 필요하지 않다** `[추정]`.

### 6.3 15a 범위 확정

| | 범위 안 | 범위 밖 |
|---|---|---|
| **DDL** | `xp_ledger` 테이블 + 이름 붙은 제약 6개 + 인덱스 2개 (C2 §1 그대로) | `profiles.total_xp` · `profiles` 인덱스·CHECK |
| **함수** | `xp_to_next_level` · `level_from_total_xp` (C3 §4, `immutable`) · **`grant_xp_v1`(원장 전용판)** · `get_xp_summary_v1` | **`get_weekly_xp_ranking_v1`** — §6.4 |
| **RLS** | `enable rls` + 본인 select 정책 + `revoke insert/update/delete` (C2 §6) | — |
| **권한** | `grant_xp_v1`은 `authenticated`에 `execute`를 주지 않는다 (C2 §7) | — |
| **규칙(프론트)** | 감쇠 비율 표(1~3/4~5/6+) · **`floor`** (C2 §8-①) · **KST 경계** (C2 §8-②) | 결과 화면 XP 표시 · 레벨업 연출 (`15` §6) |
| **연결** | **없다** | **결과 확정 경로 연결 = 15c.** `finalize_group_room_if_expired` · duel 결과 · `apply_single_move_v2`를 교체하는 일이며 **살아 있는 결과 경로를 바꾼다.** 15a가 "신규 테이블만"인 이유가 여기서 끝난다 |
| **테스트** | pgTAP(멱등 2회 호출 → 1행 · CHECK 위반 거부 · 감쇠 정합 · 0 XP 행) + `tests/xpLedger.test.js`(규칙 순수함수) | — |

> **15a는 "지급할 수 있는 원장"까지다. "실제로 지급되는 상태"는 15c다.**
> 이 선을 긋지 않으면 15a가 그룹·1:1 결과 함수를 건드리게 되고, **트랙 C와 동결된 그룹
> 경로를 동시에 침범한다.**

### 6.4 `get_weekly_xp_ranking_v1`을 15a에서 뺀 이유

원장만 읽으므로 **기술적으로는 15a에 들어갈 수 있다.** 그런데 **C2-⑤(주간 동점 tie-break)가
미확정**이다 — `15` §5.2가 "현재 데이터로 일관된 tie-break를 문서화"라고만 한다 `[문서]`.
**15a의 나머지는 전부 완전 정의 상태다.** 미확정 하나를 섞으면 트랙 전체가 그 질문을 기다린다.
→ **주간·레벨 랭킹은 15b(랭킹 정렬)로 함께 보낸다.**

---

## 7. 3코스 창 — **범위 확정 (2026-09-02)** `[사용자 확정]`

### 7.1 창 = **4항목**

| # | 항목 | 대상 | DDL 초안 | 성격 |
|---|---|---|---|---|
| **①** | **`daily_challenges` 제약 교체 + `course_slot`** | `daily_challenges` | `add column course_slot` + `1..3` CHECK · `drop constraint daily_challenges_challenge_date_key` · `add constraint unique (challenge_date, course_slot)` · **`ensure_today_daily_challenge` 재생성** (§7.2) | **창의 본체** |
| **②** | **`game_records.result_status` CHECK 1건** | `game_records` | `add constraint game_records_result_status_check` — 값 집합은 C4 §4.1 그대로 | **`match_end_reason`은 제외** — C4 §4.2가 죽은 컬럼으로 보존 결정 |
| **③** | **`profiles` 컬럼 단위 grant 축소 — 3컬럼** | `profiles` 권한 | `revoke update ... from anon, authenticated` → `grant update (nickname, profile_image_url, updated_at) ... to authenticated` (C3 §5.1) | **`updated_at` 포함이 확정됐다** — 빼면 배포된 프론트가 깨진다 |
| **④** | **`profiles.total_xp` 컬럼 추가** | `profiles` 구조 | `add column total_xp bigint not null default 0` + `profiles_total_xp_check` + `profiles_total_xp_idx` (+ 원장 backfill) | **③ 다음이어야 한다** |
| ~~⑤~~ | ~~**G2-② `room_events` INSERT 회수**~~ | — | — | **제외됐다 (§7.4)** `[사용자 확정]` |

**대상 객체 3개(`daily_challenges`·`game_records`·`profiles`)가 서로 겹치지 않는다. DDL 충돌 없음.**

> **`daily_challenge_pool`은 건드리지 않는다.** 확정 스펙 §3.3의 "시작 후보 × 목표 후보 무작위
> 연결"을 완전히 만족시키려면 풀 구조를 바꿔야 하지만, **오늘 코스가 3개가 되는 것과는 별개다** —
> 기존 풀에서 3행을 뽑으면 되고 `start_title`은 지금처럼 비어 있다
> (`DAILY_POOL_INSERT.sql`이 전부 null로 넣는다) `[코드]`.
> **풀 개편은 창 범위 밖이고 후속이다.**

### 7.2 ⚠ ①은 `create or replace`로 되지 않는다 — **`drop function`이 필요하다** `[코드]`

`ensure_today_daily_challenge`의 현재 시그니처는
`returns table(challenge_date date, start_title text, target_title text, hint text)`다
(`baseline:62`). **`course_slot`을 반환에 넣으면 반환 타입이 바뀌고, PostgreSQL은
`create or replace`로 반환 타입 변경을 허용하지 않는다.**

| 따라오는 것 | 처리 |
|---|---|
| **`drop function` + `create function`이 된다** | **같은 migration(한 트랜잭션) 안에서 연달아 한다.** 이름과 인자 목록은 유지되므로 **8월 창의 "함수 삭제 → 구버전 세션 붕괴"와 성격이 다르다** — 트랜잭션이 끝나면 같은 이름의 함수가 있다 |
| **⚠ `drop`이 ACL을 지운다** | 지금 `anon`·`authenticated`·`service_role`에 `GRANT ALL`이 있다 (`baseline:1362-1364`) `[코드]`. 재생성 후 **명시적으로 다시 부여해야 한다.** 빠뜨리면 **게스트의 오늘 코스가 사라진다** — `anon` EXECUTE가 그 경로다 |
| **의존 객체** | **없다.** SQL 안의 호출자 0건, 정책·뷰 참조 0건. 유일한 호출자는 프론트다 (`dailyChallengeService.js:78`) `[코드]` |
| `search_path` | 현재 `set search_path to 'public'`. 재생성 시 계약 규칙대로 비운 값으로 갈 수 있다 — 본문 참조가 이미 전부 스키마 한정이다 `[코드]` |
| **경합 가드** | `where not exists`를 **`on conflict (challenge_date, course_slot) do nothing`으로 바꾼다.** UNIQUE 교체가 이중 안전장치를 없애기 때문이다 (`PACKET-CONTRACT-GAPS.md` §5.2) |

> **`PACKET-CONTRACT-GAPS.md` §5.5.2의 "함수 삭제는 없다"는 전제를 이 발견이 정정한다.**
> 삭제는 있다. **다만 같은 트랜잭션 안의 재생성이므로 게이트 사유가 되지 않는다** `[추정]`.
> **ACL 복구가 진짜 위험이고, 그것은 migration 본문과 T4 검증으로 막는다.**

### 7.3 적용 순서 — **강제되는 것 2건**

**15a → ③ → ④ → ① → ②**

| 순서 | 근거 |
|---|---|
| **③ → ④** | **PostgreSQL 컬럼 권한 의미.** 지금 `profiles`에 `GRANT ALL`이 있고 (`baseline:1467-1468`) **테이블 단위 UPDATE는 나중에 추가되는 컬럼까지 덮는다.** ③을 먼저 하면 뒤에 생긴 `total_xp`에는 아무 권한이 붙지 않는다. 반대로 하면 창 안에 위조 가능 구간이 생긴다 |
| **15a → ④** | ④의 backfill과 `grant_xp_v1` 교체본이 `xp_ledger`를 참조한다. **15a가 없으면 ④가 실패한다** |
| ① · ② | 다른 테이블이라 순서 자유. **실패 확률이 가장 높은 ②를 마지막에 둔다** (§7.7) |

> **15a를 창의 맨 앞에 싣는 것을 권한다.** 창 무관이지만 ④가 종속되므로 어차피 먼저 적용돼야
> 하고, 한 창에 넣으면 **건별 승인이 한 번으로 줄고 순서가 문서로 고정된다** (§6.2).
> **15a를 창에 넣지 않기로 하면 ④를 창에서 빼야 한다** — 순서만 흐려진다.

### 7.4 G2-② 제외 — **순서를 뒤집는다** `[사용자 확정, 2026-09-02]`

**`room_events` INSERT 권한 회수를 이 창에서 뺀다.**

| | |
|---|---|
| **근거** | 배포된 프론트가 **10곳에서 직접 INSERT한다** (`MultiplayerGamePage.jsx:191-204`의 `emitRoomEvent`, 호출 `:722 :747 :751 :755 :784 :802 :808 :818 :849 :873`) `[코드]`. 회수하면 **1:1 아이템이 즉시 깨지고**, 프론트를 배포해도 **이미 로드된 구버전 번들**이 계속 INSERT한다 — **drain 문제**다. **게이트가 해제되어 그것을 가려 줄 수단이 없다** |
| **뒤집은 순서** | **① 트랙 C가 서버 INSERT(SECURITY DEFINER)로 전환한다 → ② 프론트를 배포한다 → ③ 클라이언트 INSERT 경로가 없어진 것을 확인한다 → ④ 별도 창에서 회수한다** |
| **선례** | **관전 이모티콘이 정확히 그 형태다** — `send_group_spectator_emoji_v13`(SECURITY DEFINER)가 서버에서 `room_events`에 INSERT하고 클라이언트는 읽기만 한다 (`20260814123000:136-145`) `[코드]` |
| **③의 확인 방법** | `grep -rn 'from("room_events").insert' pages components services` **0건** + 배포된 번들에서 같은 확인. **경로가 코드에 없어야 회수가 무해해진다** |
| **그때까지의 방어** | 지금과 같다 — **수신 측 무시.** `MultiplayerGamePage.jsx:928-930`이 위조 이벤트를 무시하는 주석과 함께 그 방어를 하고 있다 `[코드]` |
| **회수 형태 (그때)** | RLS가 켜져 있으므로 (`baseline:1168`) **`Duel players can insert their own room events` 정책 하나를 drop하면 경로가 닫힌다** (`20260813072952:898-918`). `revoke insert`는 방어층 하나 더. 서버 함수는 SECURITY DEFINER라 영향 없다 `[코드]` |

> **회수를 포기한 것이 아니라 순서를 바꾼 것이다.** 회수는 **경로가 사라진 뒤에 하면 무해하고,
> 그 전에 하면 사용자가 겪는다.** 8월 창은 "프론트 먼저"였고 3코스 창은 "DB 먼저"인데,
> **G2-②는 다시 "프론트 먼저"다** — 매번 "어느 쪽이 우아하게 낡는가"로 정한다는 원칙의 결과다.

### 7.5 게이트 없이 가능한가 — **최종 판정: 가능하다** `[추정]`

| 항목 | 구버전 프론트가 우아하게 낡는가 | 게이트 |
|---|---|:-:|
| **①** `daily_challenges` | **낡는다.** `dailyChallengeService.js:81`이 `ensuredData[0]`만 취해 **1코스만 보이는 상태로 정상 동작**한다. 여분 컬럼 `course_slot`은 무시된다 `[코드]` | 불필요 |
| **②** CHECK | **무관하다.** 쓰는 곳이 서버 함수뿐이고 `apply_single_move_v2:322`가 완주 값만 넣는다 `[코드]` | 불필요 |
| **③** grant 축소 | **낡는다 — 3컬럼일 때만.** 두 update가 보내는 컬럼이 정확히 그 3개다 `[코드]` | 불필요 |
| **④** `total_xp` | **낡는다.** 아무도 읽지 않는 컬럼이 하나 생긴다. `add column`+`default 0`은 PG11+에서 테이블 rewrite가 없고, `profiles` 145행에서 CHECK·인덱스도 순간이다 `[추정]` | 불필요 |

**판정: 유지보수 게이트 없이 실행 가능하다** `[추정]`. **성립 조건 3개를 명시한다:**

1. **③의 grant 목록이 3컬럼이다.** 2컬럼이면 사용자가 즉시 겪는다 (C3 §0).
2. **①의 함수 재생성이 ACL을 복구한다.** 빠뜨리면 게스트의 오늘 코스가 사라진다 (§7.2).
3. **T5 스모크를 실사용자와 같은 경로로 수행한다.** 게이트가 없으므로 바이패스 토큰이 필요 없고,
   동시에 **문제를 사용자보다 먼저 만나는 유일한 방법이 이 스모크다.**

> **⚠ 남는 하나 — 폴백 경로는 우아하게 낡지 않는다.**
> RPC 1차 경로가 실패했을 때만 타는 폴백이 `.maybeSingle()`이라 **3행에서 오류가 되고**
> 하드코딩 `FALLBACK_DAILY_POOL`로 떨어진다 (`dailyChallengeService.js:93-97`) `[코드]`.
> **G14가 이미 등재한 결함이다.** 1차 경로가 정상인 동안은 드러나지 않지만
> **"모든 사용자 동일 코스"가 그 실패 모드에서 깨진다** — 그래서 **프론트 변경을 창 직후에
> 배포하는 것을 권한다.** 게이트 사유는 아니다.

### 7.6 창 절차 초안 — **T-1 ~ T6** (8월 W0~W11의 축소판)

**뼈대는 `CUTOVER-PLAN.md`를 그대로 쓴다.** 아래는 **무엇을 빼고 무엇을 남겼는지**와
이 창에만 있는 항목이다. **명령 표기 규칙(`npx` 접두 등)은 CUTOVER-PLAN §0.1을 따른다.**

| 단계 | 내용 | 8월 대응 | 근거 |
|---|---|---|---|
| **T-1** | **창 밖 준비 (전날).** migration 파일 작성 완료 · **로컬 스택에서 전량 적용 + T4 검증 쿼리 리허설** · `npm run supabase:preflight` 통과 · `backup/` 디렉터리 실재 확인 · 프로젝트 Active 확인 | W-1 | CUTOVER-PLAN §0.2·§7 |
| **T0** | **건별 승인 확인 + 재고 4쿼리** (§7.7). 실패한 항목은 **그 항목만 뺀다** | (신설) | `AGENTS.md` §1 |
| **T1** | **백업 덤프 4종** — 스키마 / 데이터 전체 / **데이터 `public` 전용** / 롤 | **W2 그대로** | CUTOVER-PLAN §4.3. **`public` 전용을 빠뜨리지 않는다** — 8월에 빠졌다 |
| **T2** | **`db push --dry-run --linked`** → pending이 **정확히 예상 개수**이고 순서가 §7.3과 일치 | W5 | CUTOVER-PLAN §3.2 |
| **T3** | **`db push --linked`** ← **되돌릴 수 없는 지점** | W6 | CUTOVER-PLAN §2.1 |
| **T4** | **검증** (§7.8) | W7 | — |
| **T5** | **스모크 — 실사용자 경로.** 오늘 코스 표시 · **닉네임 저장 1회** · **프로필 사진 변경 1회** · 랭킹 진입 · 게스트로 오늘 코스 조회 | W9 | §7.5 조건 3 |
| **T6** | **기록.** `docs/ops/CUTOVER-LOG-YYYY-MM-DD.md` 작성 → `CURRENT.md`·`PROD-SNAPSHOT` 갱신 판단 | W11 | CUTOVER-LOG-TEMPLATE |

**T5의 항목이 왜 그것들인가:** **각 DDL이 깨뜨릴 수 있는 사용자 경로와 1:1로 대응시켰다** —
오늘 코스=①, 닉네임 저장·사진 변경=③, 게스트 오늘 코스=①의 ACL, 랭킹=④의 인덱스·컬럼 추가.

**뺀 것과 이유:**

| 뺀 단계 | 이유 |
|---|---|
| **W0 게이트 on · W1 프론트 선배포 · W10 게이트 해제** | **§7.5 판정.** 그리고 이 창은 **프론트 변경이 필요 없다** — 4항목 전부 DB 전용이다 |
| **W2.5 과거 방 이력 삭제** | 대상이 없다. `game_rooms`를 건드리지 않는다 |
| **W3 baseline `migration repair` · W4 이력 확인** | **이미 끝났다.** `schema_migrations` 이력 12행이 8월 창에서 확립됐다 (`PROD-SNAPSHOT-2026-09-02.md`) `[문서]` |
| **W8 Edge Function 배포** | 배포 대상이 없다 |

**롤백 — 8월과 근본적으로 다르다:**

| 축 | 8월 창 | **3코스 창** |
|---|---|---|
| 되돌림 수단 | **덤프 복원이 유일**했다 (CUTOVER-PLAN §6.1) | **4항목 전부 역DDL이 있다** — `drop constraint` / `revoke`+`grant` / `drop column` / 함수는 baseline 원본으로 재생성 |
| 데이터 손실 DDL | 있었다 (W2.5 삭제) | **없다.** `add column`·`add constraint`·`grant`·함수 교체뿐이다 |
| `total_xp` 되돌리기 | — | 컬럼 drop은 값을 버리지만 **원장에서 재계산 가능**하다 (C3 §6) |
| **그래도 T1을 하는 이유** | — | **역DDL이 있다는 것은 "복원이 필요 없다"가 아니다.** 예상 밖 실패에서 덤프가 유일한 바닥이다 |

> **되돌림은 `AGENTS.md` §4대로 forward-only 보정 migration으로 한다.**
> 적용된 migration 파일을 고쳐서 되돌리지 않는다.

### 7.7 T0 재고 4쿼리 — **창 안에서 먼저 확인한다**

| # | 확인 | 실패하면 |
|---|---|---|
| ② | `game_records.result_status`의 distinct 값이 C4 §4.1의 값 집합 안에 있는가 | **add constraint가 실패한다.** 무변경으로 끝나므로 값 집합을 다시 정하고 **②만 뺀다** |
| ① | 같은 `challenge_date`에 2행 이상 있는가 — **0행이어야 한다** (UNIQUE가 막고 있었다) | 제약 교체 전에 정리 |
| ③ | `profiles`를 update하는 클라이언트 경로가 **2곳뿐인가** — 2026-09-02 전수 검색 결과 2곳 (`ProfilePage.jsx:85·148`) `[코드]` | 3곳 이상이면 **grant 목록을 다시 만든다** |
| ④ | `profiles`에 `total_xp`가 이미 있는가 — 없어야 정상 | 있으면 이미 적용된 상태다. 무해 |

### 7.8 T4 검증 항목

| # | 확인 | 기대 |
|---|---|---|
| 1 | `daily_challenges`의 UNIQUE 제약 | `(challenge_date, course_slot)` 1개. **`challenge_date` 단독 제약 부재** |
| 2 | `course_slot` CHECK | `1..3` |
| 3 | **`ensure_today_daily_challenge`의 ACL** | **`anon`·`authenticated`·`service_role`에 EXECUTE.** §7.2의 진짜 위험 |
| 4 | 같은 함수 3회 연속 호출 | **행 3개 유지.** 중복 생성 0 — `on conflict` 가드 확인 |
| 5 | `game_records_result_status_check` | 존재하고 `convalidated = true` |
| 6 | `profiles`의 UPDATE 권한 | **컬럼 단위 3개만.** 테이블 단위 UPDATE **부재**, `total_xp` **미포함** |
| 7 | `profiles.total_xp` | 존재 · `not null` · `default 0` · CHECK · 인덱스 |
| 8 | 불변식 | C3 §6 쿼리가 **0행** (backfill 직후) |
| 9 | `rls_off_tables` · publication 4테이블 | 8월 W7과 같은 쿼리로 **변화 0** |

> **3번과 6번이 이 창에만 있는 검증이다.** 나머지는 8월 W7의 형태를 그대로 가져왔다.
> **권한을 바꾸는 창은 권한을 검증해야 한다** — 8월 창에는 그 항목이 없었다
> (`GRANT` 대조는 W2의 덤프 비교로 했다).
---

## 8. 트랙별 티켓

### 8-A. C5 프로필 카드 공통 컴포넌트

| | |
|---|---|
| **목표** | **네 지점이 서로 다르게 그리던 프로필 표시를 컴포넌트 2개로 단일화한다.** 이름 fallback 1종·`alt` 규칙 1종·이미지 우선순위 4단계를 C5 §3대로 구현한다 |
| **범위 밖** | ① **결과 화면**(C5 5번째 지점) — §3.2 ② **`GroupGamePage.jsx:1330`**(동결) ③ **`RoomPage.jsx:477·596` · `MultiplayerGamePage.jsx:1398` · `VsIntroOverlay.jsx`**(C 소유, §5.2) ④ **레벨·칭호·배지 실데이터** — C1/C3 DDL 미적용. **슬롯만 만들고 `null`로 둔다** ⑤ `profiles` update payload 변경(§4.3) ⑥ 장착 편집 UI(17b) ⑦ 스냅샷 컬럼 확장(C5-②, DDL 판단) |
| **읽을 파일** | `docs/contracts/C5-PROFILE-CARD.md`(전문) · `C1` §3·§4 · `C3` §1 · `21-SCREEN-MATRIX.md` §9·§10·§11 · `17-EXPLORATION-PROFILE-GUEST.md` §5·§5.1 · `docs/design/MOBILE-VALIDATION-CORRECTIONS.md` · `rankingService.js:195-229` · `services/profileStatsService.js:132-146` |
| **건드릴 파일** | **신규** `components/ProfileCard.jsx` · `components/ProfileAvatar.jsx` · `css/profileCard.css` · `tests/profileCard.test.js` — **기존** `pages/ProfilePage.jsx` · `pages/RankingPage.jsx` · `components/UserProfileModal.jsx` · `pages/GroupRoomPage.jsx` · `appStyles.js` |
| **수용조건** | ① 네 지점이 전부 신규 컴포넌트를 import한다 — `grep -l ProfileAvatar` **4/4** ② 그 4파일에서 `"Unknown"`·`"U"`·`"-"` 이름 fallback **0건** ③ 아바타 `alt` 빈 문자열 **0건**, 전부 `{이름}의 프로필 이미지` 형태 ④ 아바타 인라인 `style` **0건** (`GroupRoomPage.jsx:493·500` 해소) ⑤ `onError`가 이니셜로 내려가고 장착 상태 데이터를 건드리지 않는다 ⑥ `UserProfileModal` prop 3키 불변 — 호출 3곳 유지 ⑦ `npm test` 전량 통과 + 신규 테스트 수를 **기준 커밋과 날짜와 함께** 기록 ⑧ `npm run build` exit 0 ⑨ **§5.2의 남은 4곳을 완료 보고에 명시한다** |
| **의존** | **없다.** A는 아무 트랙도 기다리지 않는다. **단 A는 15b·16·17b·트랙 E의 선행이다** |

### 8-B. 17a-2 기록·게스트

| | |
|---|---|
| **목표** | **기록·경로를 서버 권위 결과에서 읽게 하고, 게스트가 영구 데이터를 만들지 못하는 경계를 확정한다** (17 §4·§6). 싱글 결과 화면의 순위 표시를 클라이언트 추측에서 서버 값으로 바꾼다 |
| **범위 밖** | ① **오늘 3코스 전부** — `services/dailyChallengeService.js`(동결) · `MainPage.jsx`의 코스 블록 · `course_slot` ② **프로필 화면**(A 소유) ③ **랭킹 화면 UI**(A 소유) — `rankingService.js`의 **데이터**는 B 소유 ④ **XP·레벨**(D/15b) ⑤ **1:1·그룹 결과**(C/동결) ⑥ **싱글 아이템 감사**(17 §7) — `data/items.js` 계열은 C 소유 ⑦ `MainPage.jsx`의 랭킹 탭 블록 |
| **읽을 파일** | `17-EXPLORATION-PROFILE-GUEST.md` §1·§2·§4·§6·§8 · `docs/contracts/C4-RESULT-REASON.md` §3.3(싱글 3경우) · `supabase/migrations/20260814091000_server_authority_rpc_v2.sql:15-45`(`single_game_runs` — 경로·게스트 해시가 이미 있다) · `tests/guestSingleSession.test.js` · `tests/appRouting.test.js` |
| **건드릴 파일** | `pages/GamePage.jsx` · `components/SuccessOverlay.jsx` · `css/SuccessOverlay.css` · `pages/MainPage.jsx`(게스트 영역만) · `pages/IntroPage.jsx` · `pages/LoginPage.jsx` · `services/singleGameService.js` · `utils/singleGameSession.js` · `utils/localAuthSession.js` · `authContext.jsx` · `App.jsx` · `rankingService.js` · `services/profileStatsService.js` · `services/analyticsService.js` · `tests/appRouting.test.js` · `tests/guestSingleSession.test.js` · **신규** `utils/resultReasonLabels.js` · `tests/explorationRecords.test.js` |
| **수용조건** | ① **`SuccessOverlay.jsx:32-35`의 클라이언트 순위 추측이 제거된다** — `findIndex`로 `elapsedSeconds`·`clickCount`를 맞춰 순위를 만드는 코드 **0건** ② 결과 화면과 프로필 history가 같은 서버 결과에서 읽는다 (동일 조회 경로를 테스트가 고정) ③ 게스트가 만드는 영구 행 **0** — 기존 게스트 계약 테스트 전량 통과 ④ `tests/appRouting.test.js`의 기존 계약 문자열 2개(`onReturnToLobby={handleGiveUp}` · `onClick={onReturnToLobby}`) 유지, 또는 **같은 커밋에서 테스트를 갱신하고 이유를 적는다** ⑤ **같은 파일의 1:1·그룹 assert(`:167-175`)는 건드리지 않는다** ⑥ 게이트 관련 assert(`maintenanceGate.test.js:309`) 유지 ⑦ **`useAuth()` 반환 키 불변** — `user`·`loading`·`logout`·`user.isGuest`·`user.id`·`user.displayName` (§2.3-⑦. **13개 파일이 import한다**) ⑧ **`"wiki-single-items"` 정리 경로 유지** — `grep -rc` 합계 4 (§2.3-④) ⑨ `utils/resultReasonLabels.js`가 **C4 §3.1~§3.3 세 표를 전부** 담는다 — C가 호출만으로 1:1 표시를 만들 수 있어야 한다 ⑩ `npm test` 전량 통과 + 수치·기준 커밋 기록 ⑪ `npm run build` exit 0 |
| **의존** | **없다.** C5 컴포넌트를 쓰지 않는다 — 싱글 결과에 아바타가 없다 `[코드]`. **단 C가 B의 `resultReasonLabels.js`를 읽는다** — B가 먼저 그 파일을 만들어 두면 C의 1:1 결과 표시가 막히지 않는다 |

### 8-C. 14 아이템 서버 권위

| | |
|---|---|
| **목표** | **클라이언트가 직접 INSERT하던 아이템 이벤트를 서버 RPC 경유로 옮긴다** (spec §5.1, G2). 사용·차단·반사·소비를 서버가 확정하고 클라이언트는 읽는다 |
| **범위 밖** | ① **`room_events` INSERT 권한 회수(G2-②)** — **3코스 창에서 제외됐다.** C가 서버 INSERT로 전환하고 프론트를 배포한 **뒤에, 별도 창에서** 회수한다 (§7.4) `[사용자 확정]`. **C는 RPC 경로를 만들 뿐 권한을 회수하지 않는다** ② **`SINGLE_ITEM_IDS` 변경·삭제 — 동결** `[사용자 확정]`. `data/itemPools.js`는 C 소유지만 **`MULTI_ITEM_IDS` 배열만 수정한다** (§2.3-①) ③ `ItemBar.jsx` prop 계약·`useItemSystem` 반환 형태 변경 (§2.3-③) ④ **`"wiki-single-items"` 문자열 변경** (§2.3-④) ⑤ **기존 `mp-*` CSS 규칙 개명·삭제** (§2.3-⑤) ⑥ `mini_game_*` 3종 삭제 (`AGENTS.md` §4) — **event_type 유지 여부만 문서로 결정** ⑦ 아이템 XP 연결 — 없다 (`14 ↮ 15`, `PACKET-CONTRACT-GAPS.md` §2.1) ⑧ 1:1 아바타 4곳(§5.2) ⑨ `utils/onlineGameSession.js`의 1:1 세션 복구 — 동결 (§2.3-②) ⑩ 그룹 경로 전부 |
| **읽을 파일** | **`G7 확정 문서`(선행)** · `14-DUEL-ITEMS.md` 전문 · `01-CONFIRMED-SPEC.md` §5 · `PACKET-CONTRACT-GAPS.md` §1.1·§1.2·§3.3 · `docs/contracts/C4-RESULT-REASON.md` §3.2 · `supabase/migrations/20260814090000_server_authority_v2.sql:55-96`(event_type CHECK 5종 · `item_event_id` · `game_mutation_requests`) · `20260814094000_duel_item_authority_v2.sql`(`SWAP_DISABLED` 스텁과 그 주석의 선행 조건 4개) · `20260814123000:136-145`(**따라야 할 선례** — SECURITY DEFINER가 이벤트를 INSERT한다) |
| **건드릴 파일** | **신규** `data/duelItems.js` · `components/DuelItemBar.jsx` · `services/duelItemService.js` · `supabase/migrations/20260903100000_duel_item_authority_v3.sql` · `supabase/tests/duel_item_authority_v3.sql` — **기존** `pages/MultiplayerGamePage.jsx` · `pages/MultiplayerPage.jsx` · `pages/RoomPage.jsx` · `components/VsIntroOverlay.jsx` · `services/multiplayerService.js` · `css/multiplayer.css` · `data/items.js` · `data/itemPools.js` · `utils/itemSystem.js` · `hooks/useItemSystem.js` · `components/ItemBar.jsx` · `tests/duelSwapDisabled.test.js` · `tests/serverAuthorityMigration.test.js` |
| **수용조건** | ① **G7 확정 문서가 먼저 존재한다.** 아이템 ID 표 + event_type 명명 + payload 키. **없으면 착수하지 않는다** ② 아이템 사용이 RPC로만 발생한다 — `pages/`에서 `from("room_events").insert` **0건**. **이 0건이 G2-② 창의 선행 조건이다** (§7.4-③) ③ **`git diff data/itemPools.js`에 `SINGLE_ITEM_IDS` 블록 변경이 없다.** `grep -c 'highlight_links' data/itemPools.js` = **2 유지** ④ `GamePage.jsx`를 수정하지 않고 싱글 아이템이 회귀 없이 동작한다 — `ItemBar.jsx` prop·`useItemSystem` 반환 키 불변 ⑤ `grep -rc '"wiki-single-items"'` 합계 **4 유지** (§2.3-④) ⑥ `css/multiplayer.css`의 기존 `mp-*` 선택자 **삭제·개명 0건** — 추가만 (§2.3-⑤) ⑦ 새 RPC가 계약 형태를 따른다 — `security definer` · 빈 `search_path` · `jsonb` 반환 (contracts README) ⑧ pgTAP 신규 파일 통과 수치·기준 커밋 기록 ⑨ `npm test` 전량 통과 ⑩ `npm run build` exit 0 ⑪ **운영 미적용** (R6) ⑫ `navigate("/multiplayer", { replace: true })` 문자열 유지 (§2.2) |
| **의존** | **G7 — 차단.** 그리고 **G2-②는 C의 산출이 아니라 C 이후의 창 항목이다** |

### 8-D. 15a XP ledger·지급·감쇠

| | |
|---|---|
| **목표** | **결과 ID당 한 번만 지급되는 XP 원장과 지급 RPC를 만든다.** 감쇠 전/후 값을 함께 남기고, 재호출이 몇 번 와도 1행이 되게 한다 (C2 §1·§4·§5) |
| **범위 밖** | ① **`profiles.total_xp`** — 15b ② **`grant_xp_v1`의 `profiles` update** — 15b 교체본 (§6.1) ③ **주간·레벨 랭킹** — 15b (§6.4) ④ **결과 확정 경로 연결** — 15c (§6.3) ⑤ **결과 화면 XP 표시·레벨업 연출** — `15` §6, 트랙 E ⑥ **프로필 레벨 표시** — 15b, 그리고 파일은 A 소유 ⑦ 업적 XP 지급 — 16 ⑧ 운영 적용 |
| **읽을 파일** | `docs/contracts/C2-XP-LEDGER.md` 전문 · `C3-LEVEL-STORAGE.md` §4(검산 표) · `contracts/README.md`(DDL·RPC·RLS 규칙) · `01-CONFIRMED-SPEC.md` §7 · `15-XP-LEVEL-RANKING.md` §1~§4·§7 · 형태 참고용으로 `20260814103000_group_final_gaps_v13.sql` · `supabase/tests/group_final_gaps_v13.sql`(pgTAP 형태) |
| **건드릴 파일** | **전부 신규** — `supabase/migrations/20260903090000_xp_ledger_v1.sql` · `supabase/tests/xp_ledger_v1.sql` · `services/xpService.js` · `utils/xpRules.js` · `tests/xpLedger.test.js` |
| **수용조건** | ① migration이 `create table if not exists` + **이름 붙은 제약** + 인덱스 2개로 작성된다 (C2 §1과 동일) ② **`update public.profiles` 0건** ③ 멱등: 같은 `(user_id, source_type, source_id)` 2회 호출 → **행 1개**, 두 번째는 `granted:false` ④ 감쇠 정합: `decay_reason`이 없으면 `amount = base_amount`, 있으면 `amount <= base_amount` — CHECK가 위반을 거부하는 것을 pgTAP가 확인 ⑤ **`floor` 판정** — base 25의 50%가 **12** ⑥ 0 XP 행이 남는다 (`duel_loss_forfeit`·`group_retire`) ⑦ `level_from_total_xp` 검산이 C3 §4 표와 일치 (특히 `3975 → 27`) ⑧ RLS: 본인 행만 select, `insert/update/delete` 거부 ⑨ `grant_xp_v1`에 `authenticated` execute **없음** ⑩ pgTAP·`npm test` 수치를 **기준 커밋과 날짜와 함께** 기록 ⑪ **운영 미적용** (R6) |
| **의존** | **없다.** C2-①(`floor`)·②(KST)는 제안값으로 진행하고 **결정 사실을 커밋 메시지와 C2에 남긴다.** C2-③은 C2 §4가 이미 3열 유니크로 열어 두었다 — **좁히는 결정이 나면 forward-only 보정** |

---

## 9. 문서 불일치 — **4건. 1건은 계약을 고쳤다**

| # | 불일치 | 실측 | 상태 |
|---|---|---|---|
| **①** | **C5 §1 "네 곳" · §4 "5곳"** | **8곳 + `VsIntroOverlay` 2지점.** 이름 fallback은 4종이 아니라 **6종**(`나`·`상대`가 빠졌다) `[코드]` | **계약 문구는 고치지 않았다** (정정 승인 없음). **A의 완료 정의는 §5.2가 확정한다** — 닫는 곳 5, 남는 곳 4 |
| **②** | **C4 §5·contracts README·GAPS가 "CHECK 2건"** | **추가는 1건이다.** C4 §4.2가 `match_end_reason`에 **CHECK를 붙이지 않기로 결정**했다 `[문서]`. **"판정 2건, 추가 1건"이 정확한 표현** | **계약 문구는 고치지 않았다.** **창 범위는 §7.1이 1건으로 확정한다** `[사용자 확정]` |
| **③** | **C3 §5-①이 `grant update`를 2컬럼으로 적었다** | **`updated_at`이 빠졌다.** 배포된 프론트의 두 update가 **모두 그것을 함께 보낸다** — `ProfilePage.jsx:86`·`:149` `[코드]` | **✅ 정정 완료 (2026-09-02).** **3컬럼으로 확정**하고 `C3-LEVEL-STORAGE.md` **§0에 정정 이력**, **§5.1에 확정 DDL**을 남겼다. contracts README에도 정정 이력 표를 신설했다 `[사용자 결정]` |
| **④** | **C4 §3.1이 `grace_timeout`·`time_limit`의 부제를 "시안에 문구 없음 → 발명하지 않는다"로 남겼다** | **문구가 코드에 이미 있다** — `utils/groupResultFormatter.js:2-3`이 `time_limit → "제한 시간 초과"`, `grace_timeout → "유예 시간 초과"`를 **운영에서 쓰고 있다** `[코드]`. `disconnected_timeout`은 **"연결 끊김"**으로 C4의 "몰수 — 재접속 유예 종료"와 다르다 | **미결. 이 세션에서 결정하지 않았다** — C4-①은 여전히 열려 있다. **다만 "발명하지 않는다"의 근거가 바뀌었다: 발명이 아니라 기존 문자열 채택이라는 선택지가 있다** |

> **④는 새로 찾은 것이다.** C4 §5-①이 "근거가 없으면 만들지 않는다"고 적었는데
> **근거가 코드에 있었다.** 반대로 `disconnected_timeout`은 **코드와 계약이 어긋난다** —
> 계약은 "몰수", 코드는 "연결 끊김"이다. **B가 `resultReasonLabels.js`를 쓸 때 이 셋을
> 마주친다** (§2.2). 결정 없이 진행하려면 **C4에 있는 값을 쓰고 기존 문자열은 건드리지 않는다** —
> `groupResultFormatter.js`는 동결이므로 충돌이 실제로 발생하지는 않는다.

> **동결 계약을 고칠 때의 규칙이 ③에서 만들어졌다** (C3 §0):
> ① 무엇이 왜 바뀌었는지 정정 표에 남긴다 ② 옛 값을 지우지 않고 취소선으로 남긴다
> ③ **근거는 코드 실측이어야 한다** — 문서 대 문서의 취향 차이로는 고치지 않는다.

---

## 9.1 확정된 결정 3건 — 2026-09-02 `[사용자 확정]`

| # | 결정 | 어디에 반영됐나 |
|---|---|---|
| **1** | **C3-① grant 컬럼 = 3개** (`nickname` · `profile_image_url` · `updated_at`) | `C3-LEVEL-STORAGE.md` §0·§5.1·§7 · `contracts/README.md` 정정 이력 · 이 문서 §7.1-③·§7.5 |
| **2** | **G2-②를 3코스 창에서 제외.** 14 → 프론트 배포 → 경로 부재 확인 → **별도 창**에서 회수 | 이 문서 §7.1·§7.4·§8-C · `PACKET-CONTRACT-GAPS.md` §3.3·§5.5.1·§6.2·§6.4 |
| **3** | **`highlight_links` 이중 등록:** C는 **`MULTI_ITEM_IDS`만** 수정. `SINGLE_ITEM_IDS`는 동결 | 이 문서 §2.2·§2.3-①·§8-C(범위 밖 ②·수용조건 ③) |
## 10. 참조

| 문서 | 역할 |
|---|---|
| `docs/agent/CURRENT.md` | **현재 상태의 단일 기준.** 이 문서와 어긋나면 그쪽이 우선한다 |
| `docs/agent/PACKET-CONTRACT-GAPS.md` | 공백 G1~G20 · 웨이브 §6.2 · 3코스 창 §5.5 |
| `docs/contracts/` C1~C5 | **트랙이 구현할 계약.** 동결 대상 |
| `AGENTS.md` §1·§1.1·§4·§6·§7 | 운영 DB 금지 · `main` push 금지 · append-only · 수치 기재 · `CURRENT.md` 갱신 |
| `docs/ops/CUTOVER-PLAN.md` W2·W5·W6·W7 | 창 절차. §7의 창이 그대로 쓴다 |
| `docs/ops/PROD-SNAPSHOT-2026-09-02.md` | 운영 실측. 규모 판단의 근거 |
| `wiki-race-2.0-handoff/design/21-SCREEN-MATRIX.md` §7 | 결과 화면 읽는 순서 6영역 (§3) |
| `wiki-race-2.0-handoff/code/14·15·17` | 패킷 계획 |
