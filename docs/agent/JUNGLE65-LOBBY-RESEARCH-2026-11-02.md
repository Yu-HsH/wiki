# Jungle65 2단계 로비 — 사전 조사와 독립 시안

기준: **`bd87c4dd88857b74da19c585660c8c65f605b91e` + 조사 시작 시점의 기존 미커밋 작업 트리, 2026-11-02 KST**. 본 문서의 실행 수치·스크린샷·Git 대조는 모두 이 기준/날짜다. Windows / PowerShell / Node 24.18.0 / npm 11.16.0 / 기존 package-lock.json·Playwright 사용. **분석·캡처·독립 시안만 수행. 제품 파일 수정·stage·commit·push·merge·DB/Edge/API 계약 변경·운영 배포 없음. HOLD 유지.**

권고 방향은 **“탐험가 집결지”**다. 공통 목재 헤더·양피지 정보면을 사용하되, 1:1은 **대결과 공통 목표**, 그룹은 **참가 슬롯과 내 후보 준비**, 방 찾기는 **공개 모집 목록**에 위계를 준다. 그림과 정보면은 공간을 분리한다. 현재 정상인 게임 흐름은 디자인 변경 대상이 아니다.

표기: **[코드]** 저장소 구현 확인 / **[문서]** 기존 기록 / **[산출물]** 이번 실행 / **[제안]** 아직 미적용 / **[미확인]** 이번 조사로 입증하지 않은 동작.

## 1. 현재 Git 상태와 기존 변경 보존

| 항목 | 이번 확인 결과 |
|---|---|
| 브랜치 / HEAD | `feat/jungle65-design-20261030` / `bd87c4d` |
| 시작 시 추적 수정 | 9파일, 317행 추가 / 195행 삭제 |
| 시작 시 미추적 | 실제 파일 17개. Git status의 디렉터리 축약 표시와 구분 |
| staged | 없음 |
| 실제 원격 main | `8da7d25f4c364f431f8baf8b1abc685a3bee9e6e` |
| 실제 원격 디자인 브랜치 | `bd87c4dd88857b74da19c585660c8c65f605b91e` |
| 로컬 origin/main과 차이 | main 쪽만 0 / 현재 브랜치 쪽만 10커밋. 로컬 ref와 `ls-remote` 응답 해시 동일 |
| 로비 핵심 파일 차이 | main ↔ HEAD ↔ 현재 작업 트리의 입장·두 대기방·서비스·LobbyParts·로비 전용 CSS 동일 |
| 이번 보존 검사 | 시작 당시 추적·미추적 파일 534개의 SHA-256 동일, 소실 0, 기존 binary diff·HEAD·staged 동일 |

원격 조회는 최초 샌드박스 DNS 실패 후 읽기 전용 재조회로 확인했다. fetch/push하지 않았다. main이 운영에 실제 배포된 버전인지는 이번에 Vercel을 조회하지 않았으므로 단정하지 않는다. GitHub 화면 자체와 픽셀 동일성을 비교하지도 않았다. **코드 동일성만 확인**했다 [산출물: Git 조회 및 `../../.temp/jungle65-lobby-review/{preservation-before.json,preservation-after.json,starting.patch}`].

기존 추적 수정: `components/wiki-race/ExpeditionHero.jsx`, `css/jungle65.css`, `css/wikiRaceBase.css`, `pages/{IntroPage,LoginPage,MainPage,PlayPage}.jsx`, `tests/{jungle65DesignEntry,publicRooms}.test.js`. 미추적은 기존 WebP 원본 패키지·복사본, Jungle65 조사 문서 4개, 기존 smoke 스크립트 2개다. **모두 원문 보존**했다 [산출물: preservation JSON].

**CURRENT 불일치:** [CURRENT.md](CURRENT.md)는 `078a690`·2026-10-29 기준으로 HEAD보다 **57커밋** 뒤처졌다. 문서 날짜는 조사일보다 4일 전이며, 그 뒤 커밋은 주로 10월 30일이다. 브랜치 `main`, 원격 `4830b38`, 이후 릴리스·공개방 hotfix·성능 개선·Jungle65 작업이 현재 Git과 맞지 않는다. 이 차이는 기존 [에셋 조사](JUNGLE65-ASSET-HOVER-2026-10-31.md)에도 기록돼 있다. AGENTS §7의 디자인 트랙 예외에 따라 읽고 보고하며 수정하지 않았다. 빈칸을 추정해 운영 상태로 채우지 않는다 [문서/산출물].

## 2. 전체 화면·라우트·컴포넌트 구조

```text
/play → MainPage(view=play) → PlayPage
  ├─ 대전 시작 → /multiplayer?mode=duel ┐
  └─ 그룹 로비 → /multiplayer?mode=group┴→ MultiplayerPage
       ├─ 화면 안 생성 카드 (모달 아님)
       ├─ 화면 안 코드 참가 카드 (모달 아님)
       ├─ 공개방 목록 + 새로고침
       └─ 규칙·아이템 안내 모달

/multiplayer (mode 없음) → 같은 페이지의 로컬 모드 선택기
/multiplayer/room/:roomId → RoomPage → /multiplayer/game/:roomId
/multiplayer/group/room/:roomId → GroupRoomPage
                                      → /multiplayer/group/game/:roomId
```

`?mode=duel|group`는 PLAY에서 선택한 모드를 고정한다. 별도 `/group` 목록 페이지는 없다. URL에 유효한 mode가 없을 때만 같은 페이지에 모드 선택기가 나타난다. 온라인 경로는 `OnlineRoute`가 보호하며, 미인증은 `/login`, 로컬 게스트는 `/play`로 보낸다 [코드: [App.jsx](../../App.jsx), [PlayPage](../../pages/PlayPage.jsx), [multiplayerModeSelection](../../utils/multiplayerModeSelection.js), [appRoutes](../../utils/appRoutes.js)].

| 범위 | 실제 구성 / 책임 |
|---|---|
| 공통 헤더 | `WikiRaceShell`·`WikiRaceHeader`: HOME/PLAY/랭킹/업적, 본인 프로필, 로그아웃, skip link |
| 입장 화면 | `MultiplayerPage`: 두 모드 생성·코드 참가, 공개방 조회·참가, pending/error, 도움말 |
| 대기방 프레임 | `LobbyShell` → `WikiRaceShell(view=lobby)`, `LobbyHeader`, `LobbyStateScreen` |
| 공통 작은 UI | `HostTag`, `MeTag`, `StatusMark`, `CopyCodeButton`, `LobbyIcon`, `TrailLine` |
| 1:1 | `RoomPage`: 방/참가자 읽기, 방장 목표 검색·저장, 시작, 두 슬롯, 프로필 모달 |
| 그룹 | `GroupRoomPage`: 참가자 명단, 후보 선택/READY, 시작, 방장 승계 알림, 명단 접기 |
| 프로필 | `ProfileAvatar`·`ProfileCard`, `useProfileCards`로 장착 상태 배치 조회, `UserProfileModal` |
| 소리 | 전역 `AudioControls`와 `useLobbyAudio`; 로비 이벤트 소리 유지 대상 |
| 서버 접근 | `multiplayerService`, `groupMultiplayerService`, `publicRoomService`; 목표 검색은 wikiService/snapshotService |

근거: [LobbyParts](../../components/wiki-race/LobbyParts.jsx), [WikiRaceShell](../../components/wiki-race/WikiRaceShell.jsx), [RoomPage](../../pages/RoomPage.jsx), [GroupRoomPage](../../pages/GroupRoomPage.jsx), [MultiplayerPage](../../pages/MultiplayerPage.jsx) [코드].

## 3. 구현된 기능·없는 기능·표시 전용 기능

### 3.1 반드시 보존할 실제 계약

| 항목 | 확인된 구현 | 디자인 시 지킬 점 |
|---|---|---|
| 공개/비공개 생성 | 두 모드 모두 기본 비공개. 공개 checkbox opt-in | 미선택을 공개로 바꾸지 않음 |
| 공개방 노출 | 인증 회원, 공개·waiting·정원 미달·host 참가자 행 존재, 선택 모드, 생성 최신순, 최대 50개 | 전체 방 목록을 클라이언트에서 꾸며 만들지 않음. 게임 중/정원 초과/host 없는 방 카드는 없음 |
| 공개 목록 정보 | room_id/mode/방장 닉네임/현재·최대 인원/use_items/created_at | 방 코드·참가자 UUID·경로는 응답 필드가 아님. 공개 카드에 코드 추가 금지 |
| 공개방 참가 | `join_public_room_v1` → 모드별 기존 join, 상태·host·정원 재판정 | 목록 표시만으로 참가 성공 처리 금지. 실패 후 목록 재조회 유지 |
| 코드 참가 | trim/대문자화. duel은 `join_duel_room_v2`; group은 `find_room_by_code_v1` → `join_group_room` | 모드별 경로 유지. 코드 참가는 비공개 전용으로 강제된 것이 아니며 공개방도 가능 |
| 코드 형식 | 공통 lookup은 영문 대문자·숫자 6자리 검증 | 임의의 새 초대 URL/QR/긴 토큰 계약으로 바꾸지 않음 |
| 1:1 목표 | 방장만 검색→결과 선택→snapshot 확인→`set_duel_target_v2` 즉시 저장, 상대는 저장된 목표 읽기 | 입력한 검색어와 확정된 목표를 구분 |
| **1:1 시작** | **READY 없음**. 방장·정확히 2명·저장 목표 title/page_id·waiting, 검색/저장/시작 중 아님·저장 실패 없음 | 입장 완료를 READY로 바꾸거나 상대 READY 버튼 추가 금지 |
| 1:1 출발 | 시작 직전 목표와 다른 랜덤 문서의 snapshot identity를 시작 RPC로 전달 | 대기방에서 출발 문서를 임의로 확정 표시하지 않음 |
| 1:1 아이템 | 생성 시 사용 여부 선택(기본 true), 시작 시 서버 지급 5칸, 안내는 활성 카탈로그 기반 | 개별 장비 선택·슬롯 재추첨·새 준비 단계 없음 |
| 그룹 설정 | 정원 3–8 선택·기본 6. 20분·무아이템·동일 코스 | 인원/시간/아이템을 새 설정 UI로 확장하지 않음 |
| 그룹 READY | 검색 후보 선택은 로컬 상태. READY 때 snapshot 확인→후보 제출 RPC→`set_group_ready(true)`; 준비 취소 지원 | ‘선택’, ‘제출·잠김’, ‘준비 중’을 구분. 로컬 선택만으로 제출/READY 표시 금지 |
| **그룹 시작** | **3명 이상·전원 READY + 제출 page_id·서로 다른 page_id 2개 이상·waiting·방장만** | 서로 다른 제목 문자열 개수가 아닌 기존 `getGroupStartState` 판정 재사용 |
| 그룹 코스 | 제출 후보 중 서로 다른 두 문서로 출발·목표 결정 | 내 후보가 반드시 목표라는 표현 금지. 남의 후보 제목을 명단에 새로 노출하지 않음 |

근거: [공개방 최초 migration](../../supabase/migrations/20261030032252_public_room_discovery_v1.sql), **[최신 host 존재 보정](../../supabase/migrations/20261030034358_public_room_host_presence_v1.sql)**, [publicRoomService](../../services/publicRoomService.js), [multiplayerService](../../services/multiplayerService.js), [groupMultiplayerService](../../services/groupMultiplayerService.js), [groupLobbyState](../../utils/groupLobbyState.js), [duelItems](../../data/duelItems.js), [1:1 최신 목표 계약](../../supabase/migrations/20261001100000_duel_host_target_v2.sql) [코드]. 1:1 READY 폐기는 [확정 스펙의 2026-10-01 정정](../../wiki-race-2.0-handoff/01-CONFIRMED-SPEC.md)과 [UI Freeze manifest](../ui-freeze/UI_FREEZE_2026-10-06/UI_FREEZE_MANIFEST_2026-10-06.md)에도 명시돼 있다 [문서]. 운영 DB 적용 상태는 이번 조사 범위에서 미조회다.

### 3.2 F5·연결·이탈·역할

- **대기방 F5:** URL의 roomId로 방/참가자를 다시 읽는다. waiting이면 기존 join을 재호출한다. duel은 host의 저장 목표, group은 본인의 제출 후보/READY를 복원한다. 미제출 검색어·로컬 후보 선택은 영구 저장 계약이 아니다. fixture에서는 저장된 후보의 재렌더를 확인했으며, 실제 DB/Auth 복구를 새로 검증한 것은 아니다 [코드: 두 RoomPage의 초기 effect·복원 effect; 산출물: capture-report].
- **실시간 상태:** duel은 Realtime 재조회 + 연결 시 재조회 + 대기 중 3초 재조회 + focus/visibility 복귀 재조회, 늦은 응답 세대 검사와 `syncFailed` 안내가 있다. group은 Realtime 이벤트로 재조회하고 연결 상태를 안내한다. group에 duel의 3초 보정 기능이 있다고 설명하지 않는다 [코드: RoomPage 84–284, GroupRoomPage 141–195].
- **화면 전환:** duel 대기방은 starting/playing을 보고 게임으로 이동한다. group 대기방은 starting에서 entry marker를 만들고 게임으로 이동한다. 실제 게임 URL의 복구는 별도의 GamePage 로직이다. 이번 waiting 캡처를 경기 중/F5/결과 복구 검증으로 확대하지 않는다 [코드: RoomPage 시작 effect, GroupRoomPage 199–210, [groupGameFlow](../../utils/groupGameFlow.js), 두 GamePage].
- **내비게이션:** 대기방의 헤더 링크/로그아웃은 `onNavigate`/`isStillWaiting` 경유. 초기 join이 끝난 후 현재 방 상태를 읽고 waiting일 때 기존 leave를 먼저 보낸다. 새 메뉴에서 직접 navigate하면 이 계약이 빠질 수 있다. 명시적 방 나가기도 기존 handler 유지 [코드: RoomPage 480–509, GroupRoomPage 342–370, WikiRaceShell guard].
- **그룹 방장 이탈:** waiting 방에서 서버 trigger가 남은 참가자 중 입장 순서(created_at,id)의 다음 방장을 정하며, 마지막 참가자가 나가면 방을 삭제한다. UI는 host_user_id 변경 후 태그·안내만 갱신한다. 브라우저를 닫기만 하면 언제나 즉시 이탈/승계된다는 보장은 확인되지 않았다 [코드: [그룹 security migration](../../supabase/migrations/20260813072952_group_security_phase2c.sql)의 reconcile trigger·leave_group_waiting_room, GroupRoomPage hostNotice].
- **duel 방장 이탈:** waiting leave는 본인 행을 제거하고 아무도 없으면 방을 삭제한다. 공개 조회는 host 행 없는 방을 숨기며, duel 초기 진입도 host 부재를 오류 처리한다. 그룹과 같은 방장 승계를 가정하지 않는다 [코드: [duel authority](../../supabase/migrations/20260814092000_duel_authority_v2.sql)의 leave_duel_room_v2, host_presence migration, RoomPage 초기 조회].

### 3.3 존재하지 않거나 표시 전용인 것

| 분류 | 내용 |
|---|---|
| 현재 구현 없음 | 방 이름 검색·아이템/인원 필터·정렬 UI·페이지네이션·자동 매칭·새로고침 없는 목록 실시간 갱신 |
| 현재 구현 없음 | 생성/코드 참가 전용 모달, 방 생성 후 정원·공개 설정 변경 UI, 1:1 READY·개별 아이템 장착 선택, 그룹 아이템 선택 |
| 현재 구현됨 | 위 표의 생성/참가/READY/시작은 서비스/RPC에 연결돼 있다. ‘UI만 있는 버튼’이라고 분류할 근거 없음 |
| 기존 표시 전용 | 빈 슬롯, VS 대신 목표를 놓은 duel 중앙, 상태 배지, 그룹 명단 접기, 로컬 후보 ‘다시 선택’, 방장 변경 안내 |
| 알림의 종류 | 복사 결과는 inline live status, 방장 변경은 inline status, 제출/목록 오류는 alert. 별도 로비 toast stack은 없음 |
| 이번 독립 시안 | 모든 게임 조작 버튼은 연결되지 않은 검토 표시. 상단 시안 전환과 입력/checkbox의 로컬 변화만 가능. 실제 계정/방 생성·저장 없음 |

근거: MultiplayerPage 전체 UI·effect, LobbyParts, 두 RoomPage, [독립 wireframe](../../.temp/jungle65-lobby-review/wireframe.html) [코드/제안].

## 4. 대표 화면 스크린샷과 재현 범위

**실제 현재 React/CSS + 합성 인증·REST/RPC·Realtime 응답**이다. 기존 `scripts/ui-phase2-browser.mjs`의 응답 fixture 방식과 Jungle65 smoke의 env 격리를 참고해, 별도 [capture.mjs](../../.temp/jungle65-lobby-review/capture.mjs)를 만들었다. Vite는 `configFile:false`·`envFile:false`와 가짜 loopback API를 사용하며 실제 `.env`를 읽지 않는다. HTTP·WebSocket 외부 요청은 모두 가로챘다. 브라우저의 요청 성공은 운영 또는 로컬 Supabase가 성공했다는 뜻이 아니다 [산출물].

| 현재 화면 | 1440×1000 | 390×844 |
|---|---|---|
| 1:1 공개방 찾기 / 생성·코드 참가 카드 | [데스크톱](../../.temp/jungle65-lobby-review/duel-list-1440.png) | [모바일](../../.temp/jungle65-lobby-review/duel-list-390.png) |
| 1:1 대기방 · 방장 · 목표 확정 | [데스크톱](../../.temp/jungle65-lobby-review/duel-room-1440.png) | [모바일](../../.temp/jungle65-lobby-review/duel-room-390.png) |
| 그룹 공개방 찾기 / 생성·코드 참가 카드 | [데스크톱](../../.temp/jungle65-lobby-review/group-list-1440.png) | [모바일](../../.temp/jungle65-lobby-review/group-list-390.png) |
| 그룹 대기방 · 3/6명 · READY 2/3 | [데스크톱](../../.temp/jungle65-lobby-review/group-room-1440.png) | [모바일](../../.temp/jungle65-lobby-review/group-room-390.png) |

보충 7장: [duel 참가자](../../.temp/jungle65-lobby-review/duel-guest-room-390.png), [group 참가자](../../.temp/jungle65-lobby-review/group-guest-room-390.png), [그룹 전원 준비](../../.temp/jungle65-lobby-review/group-all-ready-390.png), [빈 목록](../../.temp/jungle65-lobby-review/duel-list-empty-390.png), [목록 오류](../../.temp/jungle65-lobby-review/duel-list-error-390.png), [목록 로딩](../../.temp/jungle65-lobby-review/duel-list-loading-390.png), [실제 도움말 모달](../../.temp/jungle65-lobby-review/help-modal-390.png). 여기서 ‘참가자’는 로그인한 비방장 회원이다. 익명 게스트의 온라인 참가를 뜻하지 않는다.

캡처는 전체 페이지이므로 PNG 높이가 viewport보다 길다. 목록의 예시 방은 참가 가능한 waiting 상태이고, 대기방 예시는 별도 상태 fixture다. 동일 방이 동시에 목록의 1명/대기방의 2명으로 운영에 존재했다고 해석하지 않는다. 방 생성/참가 모달은 존재하지 않아 캡처하지 않았다. 입력 카드가 대표 목록 화면에 포함돼 있다. 외부 웹폰트도 차단했으므로 **시스템 대체 폰트** 기준이며 실제 기기 글꼴과 픽셀 동일성을 보장하지 않는다 [산출물: [capture-report.json](../../.temp/jungle65-lobby-review/capture-report.json)].

## 5. 현재 UI 문제점과 개선 우선순위

| 우선순위 | 관찰 / 문제 | 개선 방향 |
|---|---|---|
| P1 정보 구조 | 공개방이 생성·코드 참가 카드 뒤 ‘03’에 위치. 최초 목록 상단 y: desktop duel 857 / group 813, mobile duel 1243 / group 1230 CSS px | 공개방 목록을 본문 첫 영역으로, 생성·코드 참가는 옆/아래. 신규 검색 API 불필요 |
| P1 역할 이해 | 1:1은 READY 없는 입장 상태, 그룹은 후보 제출을 포함한 READY. 같은 녹색 배지라도 의미가 다름 | duel은 ‘입장 완료’, group은 ‘READY/준비 중/후보 잠김’ 문구 유지 |
| P1 선택 확정 | 그룹 후보 ‘선택’과 ‘READY 시 제출’을 혼동할 여지 | 내 준비 영역의 단계·잠김을 명확히. 기존 후보 설명 유지 |
| P1 브랜드 연결 | HOME/PLAY 목재 헤더·큰 그림·양피지 카드에서 로비의 옅은 평면 헤더/얇은 선으로 바뀜 | 기존 wr65 토큰을 entry/lobby 범위에 연결 |
| P1 모바일 위계 | 긴 브리핑→내 준비→명단→코스→시작 순서. 상태 확인과 시작 CTA까지 스크롤이 길어짐 | 브리핑 압축, 상태 요약 유지, 내 조작→명단→시작 순서 유지하면서 여백 축소 |
| P2 대결 인지 | duel 좌우 구조는 이미 있음. 중앙 공통 목표와 하단 목표가 반복됨 | 중앙은 VS, 저장 목표는 별도 한 영역. 텍스트를 장식 이미지에 포함하지 않음 |
| P2 슬롯 인지 | 그룹 2열 명단·빈 자리 이미 존재. 모바일 빈 슬롯은 숨기고 요약 제공 | 이를 보존하며 슬롯 경계·방장/나 배지를 강화. 모바일 빈 자리 수는 텍스트로 충분 |
| P2 네이밍 | ‘단체모드/단체 방/그룹’ 표현 혼용, 생성 CTA도 ‘대전 시작’ 진입과 게임 시작 사이 맥락 차이 | UI 명칭은 ‘그룹’으로 정리하되 route/API명 유지, 진입·생성·실제 시작 구별 |
| P2 상태 안내 | 연결/로딩·오류가 텍스트 중심. 로딩은 목록 버튼 문구에 집중 | 기존 status/alert 영역의 공간·대비 개선, empty/error/loading 구별 |

긍정적으로 유지할 부분도 있다. 현재 캡처에서 **가로 넘침이 없으며, 보이는 main 버튼은 모두 높이 44px 이상**이다. 명단의 나/방장 태그, 색과 글자·아이콘을 함께 쓰는 상태, 비활성 사유, 코드 복사 피드백, keyboard help modal이 이미 있다. ‘모바일 버튼이 모두 너무 작다’고 진단하지 않는다. 숨김 버튼의 0px 측정은 결함으로 세지 않았다 [산출물: capture-report의 metrics; 코드: wikiRacePreparation.css·LobbyParts].

현재 하단 CTA는 **sticky가 아니다**. `wikiRaceLobby.css`의 모바일 sticky 선언을 이후 `wikiRacePreparation.css`의 `.wr-room .wr-lobby-actions { position: static; }`이 덮는다. 이번 기본 시안도 흐름 안의 하단 CTA다. sticky 도입은 소리 패널·검색 키보드·safe area 충돌 검증을 포함한 별도 선택으로 남긴다 [코드/제안].

## 6. Jungle65 스타일과 공통 CSS 적용 설계

현재 스타일은 단일 파일이 아니다. `main.jsx`→`appStyles.js`가 legacy multiplayer/group → tokens/motion/base → lobby → expansion/notebook → preparation 등 순서로 불러오며, `jungle65.css`는 IntroPage/MainPage가 import한다. 뒤쪽 규칙에 따라 entry 폭은 **min(960px,100%)**, 버튼은 44–48px, roster 상태·하단 CTA 속성도 보정된다. 로비 CSS 첫 파일만 보고 최종 크기/상태를 판단하면 틀린다 [코드: [appStyles.js](../../appStyles.js), [wikiRaceLobby.css](../../css/wikiRaceLobby.css), [wikiRacePreparation.css](../../css/wikiRacePreparation.css)].

기존 [DESIGN-SYSTEM.md](../design/DESIGN-SYSTEM.md)는 과거의 최소 등재다. 현재 적용 시각 근거는 [jungle65.css](../../css/jungle65.css), [시각 복구 문서](JUNGLE65-VISUAL-REPAIR-2026-11-02.md), HOME/PLAY 실제 구현이다. 옛 Freeze HTML은 게임 상태 계약 참고용이며 Jungle65 최종 시각 기준으로 사용하지 않는다 [문서/코드].

| 재사용 토큰/요소 | 값 또는 사용법 |
|---|---|
| forest / wood / edge | `--wr65-forest #273b30`, `--wr65-wood #795b3e`, `--wr65-wood-edge #af936b` |
| parchment / gold / blue | `--wr65-parchment #f9f1de`, `--wr65-gold #b88d3c`, `--wr65-blue #4869aa` |
| 글꼴 | 기존 wr65 heading/body 스택. 외부 폰트 패키지 추가 없음 |
| 기능 컴포넌트 | LobbyShell/Header/StateScreen, CopyCodeButton, HostTag/MeTag/StatusMark, ProfileCard/Avatar, ExpeditionDialog |
| 장식 | 기존 TrailLine·flag/search icon, 기존 나침반·모드 그림. 실제 획득 아이콘/프레임 체계 유지 |
| 상태 의미 | READY/입장 완료의 초록, 목표의 금색, 주 CTA의 파랑. 텍스트·아이콘 동반 |

[제안] root 토큰이나 `.wr-page`/`.wr-btn` 전체를 덮지 말고 **`.wr-page.wr-entry`와 `.wr-page.wr-lobby` 안의 표현에 한정**한다. HOME/PLAY 1400px 최대 폭은 유지하고, entry/lobby는 우선 현재 공통 1200px shell을 활용한다. 넓은 바깥 여백은 장식 공간으로만 사용한다. 스타일 계층을 더 쌓기보다 기존 Jungle65 파일 끝의 명확한 범위에서 검토한다. 이미지 위 불투명 컨테이너, 텍스트 이미지화, 동일 목표 반복, 거대 배경 장식은 피한다 [제안].

## 7. 화면별 레이아웃 설계와 독립 와이어프레임

**[wireframe.html 열기](../../.temp/jungle65-lobby-review/wireframe.html)** — 상단에서 1:1/그룹/공개방 시안 전환. 별도 [wireframe.css](../../.temp/jungle65-lobby-review/wireframe.css) 사용. 실제 App·라우트·게임 컴포넌트에 import하지 않는다. 버튼은 게임 handler에 연결되지 않는다. 초기 방향을 보는 정적 시안이며 최종 세부 디자인·정보 밀도 승인을 대신하지 않는다 [제안/산출물].

| 화면 | 기존 → 제안 | 재사용/표현 컴포넌트 후보 | 모바일 | 기능 회귀 위험 |
|---|---|---|---|---|
| 1:1 찾기 | 생성/참가→공개 목록 → **공개 목록 우선**, 옆 코드 참가+생성 | 기존 handler 유지. 필요하면 `PublicRoomBoard`/`RoomEntryTools`만 표시 분리 | 목록→코드 참가→생성 카드 | mode 고정·pending·실패 후 새로고침·기본 비공개 누락 |
| 그룹 찾기 | 같은 구조 → 같은 게시판, 그룹 인원 표시/생성 정원 select | duel과 같은 목록 표현. group 설정 필드 유지 | 위와 같고 정원 3–8 선택은 full-width | 기본 정원 6과 선택값 타입·생성 RPC 보존 |
| 1:1 대기방 | 두 선수 사이 목표+하단 목표 → **왼쪽 방장 / VS / 오른쪽 상대**, 하단 공통 목표 한 영역 | 기존 player renderer·ProfileAvatar/프로필 클릭·태그, 목표 검색 JSX 재사용. `DuelStage` 추출은 선택 | 390에서 두 작은 카드+VS 비교, 긴 닉네임 줄바꿈. 320은 세로 카드 대안도 검토 | host-only 목표 변경·상대 읽기·canStart·F5 복원 |
| 그룹 대기방 | 얇은 2열 명단+내 후보 aside → **캠프 슬롯 2열 + 내 준비 보드**, 코스 안내와 하단 이유/시작 | 기존 ProfileCard/roster toggle/getGroupStartState. `CampSlot`은 순수 표시만 | 내 준비→명단 한 열→코스→시작. 빈 슬롯은 숨기고 남은 자리 수 | 방장 승계·READY 전송/잠김·distinct page_id·접기/복원 |
| 도움말/프로필 | 기존 모달 유지, 양피지 여백·테두리 정도 | 도움말은 ExpeditionDialog의 포커스·Escape·복귀 보존. 프로필 prop 계약 유지 | max-height/내부 스크롤/44px 닫기 | 모달 공통화로 프로필 전체 호출처에 영향 주지 않음 |

**1:1 상태별 설계:** 상대 없음=빈 슬롯+코드 안내. 목표 없음=방장 검색/후보 목록, 상대 ‘방장이 고르는 중’. 검색/저장 중=기존 pending 문구와 비활성. 저장 실패=원래 오류+재선택. 두 명+목표 확정=방장 시작 활성. 참가자=목표 읽기·방장 시작 대기. starting=실제 room.status 이동 흐름 유지 [코드→제안: RoomPage].

**그룹 상태별 설계:** 후보 미선택=검색+비활성 READY; 선택=‘READY 시 제출’+다시 선택; 서버 준비 완료=‘잠김’+준비 취소. roster는 방장 먼저·나 태그·개별 READY/준비 중·빈 자리. 3명 미달/미준비/후보 중복은 기존 startState.reason 순서 그대로. 참가자는 START 대신 대기 안내, 새 방장은 서버 변경 반영 후 START 표시 [코드→제안: GroupRoomPage·groupLobbyState].

**목록 상태별 설계:** loading=기존 새로고침 문구·조작 비활성; empty=안내+기존 생성 카드로 시선 연결; error=실제 표시 오류+기존 새로고침; join pending=기존 중복 요청 잠금. 정원 초과·이미 시작·host 부재는 참가 오류와 목록 재조회로 처리하고, 목록에 허구의 ‘진행 중’ 카드를 추가하지 않는다. 검색창·필터는 시안에 넣지 않았다 [코드→제안: MultiplayerPage].

| 시안 캡처 | 데스크톱 | 모바일 |
|---|---|---|
| 1:1 대결 | [1440px](../../.temp/jungle65-lobby-review/wireframe-duel-1440.png) | [390px](../../.temp/jungle65-lobby-review/wireframe-duel-390.png) |
| 그룹 캠프 | [1440px](../../.temp/jungle65-lobby-review/wireframe-group-1440.png) | [390px](../../.temp/jungle65-lobby-review/wireframe-group-390.png) |
| 공개 모집 게시판 | [1440px](../../.temp/jungle65-lobby-review/wireframe-board-1440.png) | [390px](../../.temp/jungle65-lobby-review/wireframe-board-390.png) |

시안은 새 표면·슬롯을 비교하기 위한 것으로 여백이 넉넉하다. **특히 그룹 모바일 전체 길이는 현재보다 길어져, 구현 전 후보 보드·명단 여백을 더 압축해야 한다.** 기존 CTA가 더 빨리 보이게 됐다고 주장하지 않는다. 보고서에서는 공개방 노출 순서 개선과 분위기 결정을 먼저 검토하고, 최종 밀도는 후속 실측으로 결정한다 [산출물: wireframe-qa.json와 현재 capture-report].

## 8. 새 이미지 에셋 필요 여부

**필수 새 이미지 없음.** 목재·양피지·슬롯 경계·버튼은 CSS, 깃발·경로·상태는 기존 아이콘, 선수는 실제 ProfileAvatar/ProfileCard로 구성 가능하다. 기존 `duel-expedition.webp`/`group-expedition.webp`는 제목 옆 별도 영역에 `contain`으로 작게 재사용할 수 있다. 이번 시안 공개방 화면은 기존 duel 이미지만 분리 배치했고 그림 위에 카드/문구를 겹치지 않았다 [코드/제안: 기존 public/assets/wiki-race/jungle65·wireframe].

후속에서 필요할 때만 검토할 선택 에셋:

| 용도 | 권장 크기/형식 | 배치 제약 |
|---|---|---|
| 문구 없는 캠프 전경 | 원본 1200×360, WebP 또는 투명 PNG | 600×180 이하 독립 띠. 입력/CTA/명단을 덮지 않음 |
| 비어 있는 게시판 모서리 장식 | 512×256, 투명 PNG/WebP | 패널 바깥 128×64 이하. 텍스트/로고 없이 테두리에만 |
| 빈 목록 탐험가 소품 | 320×320, 투명 PNG/WebP | 80–112px, 안내 문구와 분리. 기존 그림이 충분하면 생략 |

이번에는 이미지 생성·다운로드·편집·실제 앱 적용을 하지 않았다. 랜딩/HOME 원본을 로비 배경으로 끌어와 다시 가리는 방식도 제안하지 않는다 [산출물/제안].

## 9. 모바일 대응 설계

- **390px 우선·320px 하한:** 한 열 흐름, 12–16px 안쪽 여백, 텍스트 줄바꿈. 숫자·READY는 고정 최소 공간, 긴 닉네임/목표 문서는 줄바꿈으로 처리. 초대 코드는 자간만 조정하며 복사 target 44px 유지 [제안].
- **duel:** 대결 비교를 위해 390px의 두 작은 카드를 시안으로 제시. 실데이터의 긴 닉네임/칭호/장착 프레임이 좁으면 기존 세로 배치가 안전한 fallback이다. 프로필 클릭 가능 여부와 장착 상태를 새 캐릭터 일러스트로 대체하지 않는다 [제안; 코드 근거: RoomPage renderPlayer·ProfileAvatar].
- **group:** 내 후보 선택/READY를 먼저, 참가 인원/READY 요약 다음 명단, 코스와 CTA 순서. 기존 명단 접기와 남은 자리 요약을 유지한다. 모바일에 큰 빈 슬롯 5개를 쌓지 않는다 [제안; 코드 근거: GroupRoomPage rosterOpen·emptySlots].
- **목록:** 생성 카드보다 목록을 먼저. code input은 `autoCapitalize`, 자동완성 해제·오타 검사 해제, 실제 form Enter 제출을 보존한다. 모바일 키보드가 표시될 때 입력·오류·CTA 가림을 실제 구현 후 확인한다 [코드/제안: MultiplayerPage].
- **소리/모달:** 실제 AudioControls가 상단 흐름에 있고 펼친 패널만 overlay다. 고정 하단 장식을 추가해 버튼/키보드와 겹치게 하지 않는다. 도움말은 기존 키보드 계약 유지. 프로필 모달은 도움말과 달리 `ExpeditionDialog`를 사용하지 않으므로 같은 포커스 처리라고 설명하지 않는다 [코드: AudioControls·ExpeditionDialog·UserProfileModal].
- **접근성:** 상태는 색만 쓰지 않고 글자+아이콘, 기존 alert/status/aria-describedby 유지. hover 전용 정보 금지, visible focus·reduced-motion 유지. 정적 시안은 1440/390/320px에서 넘침·이미지·버튼 크기를 확인했지만 실기기/Safari/스크린리더·명암비 전수 검증은 하지 않았다 [산출물: wireframe-qa; 제안].

## 10. 예상 수정 파일과 회귀 위험

다음은 **다음 구현 시 후보**이며 이번에 수정한 제품 파일 목록이 아니다.

| 파일 후보 | 목적 | 주의점 |
|---|---|---|
| `css/jungle65.css` | entry/lobby 한정 팔레트·헤더·양피지·CTA·반응형 | 기존 미커밋 변경과 HOME/PLAY 선택자 보존, 공통 root 덮어쓰기 금지 |
| `pages/MultiplayerPage.jsx` | 공개 목록 우선 순서, 생성/코드 참가 카드 배치 | form·handler·pending/submitting·mode·옵션 기본값 유지 |
| `pages/RoomPage.jsx` | VS 표현과 목표 중복 정리, 코드 위치 조정 | effect/ref/세대 guard·canStart·role·snapshot·navigate 유지 |
| `pages/GroupRoomPage.jsx` | 슬롯 표현, 내 준비/명단 위계와 밀도 | startState·순서·READY·잠김·hostNotice·entry token 유지 |
| `components/wiki-race/LobbyParts.jsx` | 공통 헤더·상태·코드 표현만 필요 시 | CopyCodeButton 타이머/실패 feedback/live region, leave callback 보존 |
| `css/publicRooms.css` | 공개 목록 card 배치 조정이 필요한 경우 | `.wr-entry` 안으로 한정. 두 모드의 공통 구조 유지 |
| 새 표현 컴포넌트(선택) | PublicRoomBoard/RoomEntryTools 또는 CampSlot, DuelStage | 표시 props만. 서비스·타이머·게임 상태 로직 이동 없이 필요한 경우에만 추출 |
| 관련 기존 테스트/smoke | 새 DOM에서 계약과 접근성 확인 | 테스트를 새 구조 문자열에만 맞추지 말고 실제 역할/동작을 확인 |

App/Auth·게임 페이지·services/hooks·item catalog·migration·Supabase·Edge·package/lockfile·workflow는 디자인만을 위해 바꿀 이유가 없다. 공통 헤더는 기존 onNavigate를 유지한 채 CSS로 표현한다 [제안; 근거: 위 조사].

별도 기능 검토로 남길 **기존 코드상 확인 필요점**:

1. group 초기 waiting join 오류는 `.catch(() => {})`로 삼킨 후 명단을 그린다. 서버의 기존 방 구성원 확인이 UI에 충분히 반영되는지 실제 오류 시나리오 검증이 필요하다. 이번에는 결함 확정·수정하지 않았다 [코드: GroupRoomPage 122].
2. group 대기 URL 직접 진입 시 room.status=`playing`이면 starting 전용 navigate effect가 적용되지 않는다. 실제 접근 경로/RLS에 따라 화면 결과가 달라질 수 있어, ‘항상 경기로 자동 복구’라고 문서화하지 않는다 [코드: GroupRoomPage 200; 미확인].
3. group의 늦은 응답·재연결 보정은 duel과 동일한 구조가 아니다. 시각 개편 중 둘을 통합하거나 보정 timer를 임의 추가하지 않는다 [코드: 두 RoomPage effect; 미확인].

## 11. 검증 결과와 다음 구현 단계

| 이번 검증 | 결과 / 한계 |
|---|---|
| npm test | **746/746 통과**, fail/skip/cancel 0 |
| npm run build | **exit 0**, 기존 minified 500kB 초과 chunk 경고 |
| git diff --check | exit 0 |
| 실제 React fixture 캡처 | **15장 / 16개 확인**, page error 0, 예상 밖 API 경로 0. 정상 상태 console error 0. 의도한 목록 400 응답 오류는 별도 기록 |
| 대표 화면 레이아웃 | 1440×1000·390×844 캡처 모두 가로 넘침 없음. 보이는 main 버튼 높이 44px 이상 |
| 정적 시안 | 3화면 × 1440/390/320px = **9가지 레이아웃 확인**, PNG 6장. 가로 넘침/깨진 이미지/44px 미만 버튼/JS 오류/외부 요청 없음 |
| 기존 파일 보존 | **534파일** 원문 SHA 동일, 소실 0, HEAD/staged/기존 binary diff 동일 |
| lint | package.json에 lint script가 없어 실행하지 않음 |
| 미검증 | 실제 Supabase/운영 데이터·실제 2–8계정 동시성·방 생성/START·RPC 권한/지급·실 Realtime 장애·경기/결과 F5·실기기/Safari·전체 접근성 |

산출물은 [검토 폴더](../../.temp/jungle65-lobby-review/), [capture-report](../../.temp/jungle65-lobby-review/capture-report.json), [시안 QA](../../.temp/jungle65-lobby-review/wireframe-qa.json), [보존 대조](../../.temp/jungle65-lobby-review/preservation-after.json), `npm-test.log`, `build.log`, `diff-check.log`다. `.temp/`는 기존 Git ignore 대상이며 force-add하지 않았다. npm build는 통상적인 ignored dist 산출물만 만들었다 [산출물].

다음 작업 권고 순서 [제안]:

1. **방향 검토:** 목재/양피지 강도, duel VS, 그룹 슬롯 밀도, 공개 목록 우선 배치를 결정한다. 그룹 모바일 시안 길이는 더 압축한다.
2. **공통 표현부터:** entry/lobby에만 토큰·헤더·버튼을 연결하고 기존 HOME/PLAY 및 소리·모달을 비교한다.
3. **방 찾기:** 기존 form/handler 그대로 순서와 카드만 바꾼다. 새 검색/필터/생성 모달은 범위에 넣지 않는다.
4. **duel → group:** 모드별 한 화면씩 구현·검토. 1:1 READY 없음과 그룹 후보 제출·잠김 차이를 보존한다.
5. **검증 후 별도 통합 판단:** 기존 unit/build, fixture의 방장/참가자·실패·복사·키보드·모바일, 허용된 로컬 환경의 실제 다계정/F5/이탈·승계/중복 클릭을 확인한다. 운영 데이터로 테스트 방을 만들지 않는다. commit/push/merge/배포는 이번 조사에 포함되지 않는다.

재현 명령(프로젝트 루트 PowerShell, 기존 브라우저 설치 사용):

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = 'C:\Users\SSAFY\AppData\Local\ms-playwright'
node .temp/jungle65-lobby-review/capture.mjs
node .temp/jungle65-lobby-review/verify.mjs
npm test
npm run build
git diff --check
```

캡처/QA 스크립트를 다시 실행하면 이 조사 폴더의 해당 PNG/JSON을 갱신한다. 게임·기존 디자인 소스를 바꾸지는 않는다. `verify.mjs`는 이번 시작 스냅샷과 비교하므로 후속 구현으로 제품 파일이 달라지면 의도대로 보존 검사에 실패한다. 시안은 `wireframe.html`을 파일로 열어도 검토할 수 있다 [코드: capture.mjs·verify.mjs].
