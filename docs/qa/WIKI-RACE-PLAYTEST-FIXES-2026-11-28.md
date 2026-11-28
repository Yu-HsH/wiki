# Wiki Race 실전 피드백과 R1~R4 수정 후보

2026-11-28 KST · 기준 `5976219fe805cada1f989258253f5fec2f59a85b` (PR #69) · `codex/wiki-race-playtest-fixes-20261128` 미커밋 후보.

원래 작업 트리 `d280b87`의 기존 수정 14개와 미추적 상태 258개를 이전 기록과 대조했다. 기준의 `CURRENT.md`는 `d79eeef`와 PR #64를 기록한다. 작업 기준과 21커밋, 2일 차이가 있다. Git 기준의 migration 73개와 A~F SQL의 파일 내용은 유지하고 R2 SQL을 추가했다. 운영 migration 수는 이전 인계값이다.

## R1~R4 보완

| 항목 | 수정 내용과 이유 | 확인 방법 |
|---|---|---|
| R1 시계 보정 | 느린 첫 응답은 서버 관측 시각부터 표시하고, 빠른 표본을 받으면 왕복 시간을 반영해 다시 맞춘다. 최근 표본의 시간 범위보다 오래된 응답은 건너뛴다. | 검토서의 입력값과 S5 presentation을 재실행한다. Chromium에서 각 모드의 첫 진입과 복구 후 첫 상태 요청을 서버 도착 전에 7초 지연시키고 빠른 정상 조회 뒤 새 공격을 보낸다. |
| R2 룰렛과 저주 구분 | 개인 S5 상태에 포함할 약화저주를 엔진 영수증의 성공 코드, 상대 시전자, 수신자와 연결했다. 룰렛 예약은 원래 약화를 적용한다. 피격 문구와 연출에는 저주 성공 영수증이 필요하다. | 실제 룰렛 실패, 빈 가방에 예약된 저주, 확률 실패, 무효 대상과 같은 요청 재전송을 SQL로 확인한다. 세 브라우저의 피격 문구와 재생 횟수도 대조한다. |
| R3 기권 잠금 | 방 상태와 아이템 상태의 마지막 읽기 결과를 함께 확인한다. 진행 중 아이템 상태가 실패하면 기권 버튼과 이미 열린 확인창을 잠그고, 명령 시점에도 검사한다. | 방 RPC는 통과시키면서 아이템 상태 RPC에만 503을 반환한다. 기존 문서와 슬롯을 확인하고 기권 RPC를 센다. 정상 조회 뒤 화면과 제출을 확인한다. |
| R4 첫 시작음 | 인트로가 시작되기 전에는 오디오에 음수 위치를 전달해 0초 효과음을 보류한다. | 브라우저에서 재생 성공 여부와 시간을 기록한다. 시작 전 건너뛰기와 예약 중 재입장에서는 인트로 소리를 별도로 센다. |

S5의 1.5초와 기존 2초 설정, v4의 2초 패링 마감과 8초 시작 예약은 서버가 판정한다. 브라우저 요청과 DB가 다른 방향에서 지연될 수 있으므로 표시 시각은 추정값이다. 그룹은 방 조회에서 `playing`을 확인한 뒤 조작을 연다.

## A~F 변경과 증거

| 항목 | 수정 내용과 이유 | 이전 A~F 제출의 증거 |
|---|---|---|
| A 로그인과 복귀 | 일반 로그아웃은 현재 세션을 종료한다. 인증 서버가 세션 상실을 확인하면 로그인 후 원래 방으로 돌아간다. 상태 조회의 네트워크 오류 중에는 문서·아이템을 유지하고 이동·사용·기권을 잠근다. 권한 거절, 닫힌 방, 재인증, 일시 장애에 서로 다른 안내를 표시한다. | 실 Auth에서 같은 계정의 독립 세션 중 한쪽만 `scope=local` 204. 전역 폐기 후 다른 세션은 403 `session_not_found`, 로그인 폼으로 같은 v4 방과 경로·아이템 복구. S5 520 중 기사 본문과 슬롯이 유지됐다. |
| B 패링 | S5의 `PARRY_CLOSED`와 중복·대상·등급 사유를 실제 코드에 맞춰 표시한다. 빠른 왕복 관측값으로 서버 시계를 추정하고 관측 시각과 응답 수신 사이의 지연을 반영한다. 전송 중 중복 입력을 잠근다. | 실제 RPC의 마감 전 일반·강화 반사, 약화 차단, 마감 뒤 거절, 같은 요청 재시도 영수증을 확인했다. Chromium에서 관측 전 1.4초 지연에도 버튼이 남고, 단위 테스트에서 관측 후 지연이 만료 시각에 반영됐다. 별도 브라우저에서 마감 608ms 전 클릭을 지연시켜 마감 179ms 뒤 서버에 접수했다. 실제 `PARRY_CLOSED` 안내가 나왔고 이중 클릭에도 RPC 한 건만 전송됐다. |
| C 탐험 힌트 | 첫 실패에도 상단 접근점이 남는다. 로딩, 공개 대기, 재시도, 인증과 권한 거절을 구분한다. 서버 공개 제목을 계정·방 단위로 읽음 처리하고, 미읽은 수를 안내한다. 패널은 사용자가 열 때만 펼쳐진다. | 전용 Edge의 첫 503 후 UI가 복구됐다. 5분·10분 경계 직전으로 격리 DB 시계를 맞춰 실제 RPC가 0→3→6개를 공개하는지 확인했다. 세 인증 세션의 Edge 응답이 일치했고, 백그라운드 복귀 뒤에도 패널은 닫힌 채 새 힌트 수를 표시했다. |
| D 약화저주 | S5는 성공 영수증을 확인한 modifier의 ID·발생 시각을 해당 참가자와 참가 세대에 돌려준다. v4는 실제 소비된 저주와 성공 영수증으로 피격을 확인한다. 연출은 사건 ID로 한 번만 표시한다. | S5 3계정에서 피해자 한 명만 피격 안내와 연출을 받았다. 무효 사용과 반복 요청에서 사건이 늘지 않았다. v4는 빈 슬롯에 예약된 성공도 피해자에게만 공개됨을 SQL로 확인했다. |
| E 조작과 시작 | S5 후보 선택과 준비를 한 영역에 놓고 빈 좌석 줄을 줄였다. 키온과 힌트는 스크롤 중 상단 조작 영역에서 접근한다. 서버 예약 8초 안에 인트로, 0.4초 여운, 3·2·1을 배치했다. 상자 설치자는 작은 결과 안내를 받는다. 활성 참가자가 없으면 경로 비교의 진행 안내를 숨긴다. | 두 화면의 시작 전환 기록, 320~430px 레이아웃, 키온 Realtime, 1:1과 그룹의 결과·XP·새 재경기 흐름을 확인했다. 상자 적중·보호 차단은 실제 v4 SQL로 대조했다. |
| F 상태와 문서 조회 | v4에서 상태 읽기를 한 번씩 실행한다. 진행 중 변경 신호가 오면 다음 읽기 한 건으로 합치고, 읽기는 8초에 취소 가능하다. 백그라운드에서도 기존 경기 하트비트를 보낸다. S5 `STALE_DOCUMENT`는 최신 상태와 문서 버전을 재확인한다. | v4의 느린 응답과 520을 재현해 동시에 열린 상태 RPC가 최대 한 건임을 확인했다. S5 브라우저에서 400 뒤 재조회·본문 복구를 확인했고, 이동 뒤 이전 프레임의 실 RPC는 SQL에서 거절됐다. |

패링 표시 시각은 추정값이다. 요청 전달 지연이나 서버 잠금 대기를 제거할 수는 없으며 서버의 마감 판정이 최종이다. 기존 1.5초(S5)·2초(v4) 창을 보존했다. 테스트에서는 클라이언트 왕복 시간, 서버 관측 시각, 서버 접수 시각과 마감을 따로 확인했다. 운영에서 관찰된 약 155ms 지연의 클릭 시각과 v4 PostgREST 40초 지연의 정확한 병목은 확인되지 않았다. v4 상태 RPC는 경기 진행과 하트비트를 처리하며 방 잠금을 계속 사용한다.

시작 예약은 서버가 한 번 정한다. v4는 확정 시작 시각이 돌아오고, S5는 예약 시각을 지나 방 상태가 `playing`으로 확인된 다음 조작을 연다. S5의 20분 제한과 유예 계산은 예약 시작과 연결된다. 지연 복귀 시 지나간 시작 연출을 재생할 필요가 없도록 남은 구간을 표시한다. reduced-motion에서는 정적인 인트로를 사용한다.

## 변경 파일

- 인증과 상태 읽기 · `authContext.jsx`, `App.jsx`, `pages/LoginPage.jsx`, `pages/DuelV4Page.jsx`, `services/{duelV4Service,itemModeEntryService,itemRaceRecovery,itemRaceClock}.js`
- 그룹 경기 · `components/group-items-jungle/{ProductGroupItemsRoute,GroupItemsJungle,FreeWikiCandidateSearch,S5KionDock,Phase2Panels}.jsx`, `authoritySession.js`, `containerAdapters.js`, `groupItemsJungle.css`, `s5KionDock.css`
- 아이템 피드백 · `components/DuelV4ItemFeedback.jsx`, `services/duelV4Presentation.js`, `components/group-items-jungle/{finalAssetEvents,finalAssetPresentation,productPresentation}.js`, `components/group-items-playtest/{AttackWarning,PlaytestItemsHud}.jsx`, `s25InkPresentation.js`
- 공용 경기 UI · `components/wiki-race/ItemRoomLobby.jsx`, `components/wiki-race/race/{ExplorationHintPanel,GroupRaceParts,ItemRaceSlots,ScheduledItemCountdown}.jsx`, 관련 CSS, `pages/duelV4.css`, `components/{VsIntroOverlay,GroupPickOverlay}.jsx`, `hooks/useCinematicFrame.js`, `components/group-items-playtest/useDisplayNow.js`
- 서버 · `supabase/migrations/20261128055613_item_race_start_and_recipient_feedback.sql`, `supabase/migrations/20261128075609_s5_weakening_receipt_feedback.sql`, `supabase/functions/exploration-hints/index.ts`, `services/explorationHintService.js`
- 기권 · `components/ExitGuard.jsx`, `components/group-items-jungle/{GroupItemsJungle,ProductGroupItemsRoute}.jsx`
- 검증 · `tests/{itemRaceClock,itemRaceRecovery,duelV4Presentation,s5FinalAssets,s5ReactionClock,s5RealtimeEvents}.test.js`, `supabase/tests/{duel_v4_private_item_feedback,group_items_s5_free_wiki}.sql`
- 브라우저와 격리 DB · `scripts/{prepare-item-race-review.ps1,item-race-review-checks.mjs,item-race-review-runtime.mjs,verify-s5-duel-v4-browser-ci.mjs,verify-integrated-finish-rematch-ci.mjs}`

## 로컬 검증

기준 `5976219`에 R1~R4를 포함한 미커밋 후보, 2026-11-28 KST. Node 24.18.0, npm 11.16.0, Supabase CLI 2.114.0, PostgreSQL 이미지 17.6.1.158, Chromium Playwright 1.62.1.

### 집중 회귀

- [산출물] 검토서의 입력에서 빠른 재관측 후 표시 시각 110010, 남은 패링 1490ms를 확인했다. 시계 및 S5 연출 Node 20/20, 저주·피격 집중 pgTAP 43/43 통과. 근거 `evidence/focused-node.log`와 `evidence/focused-r2-db.log`.
- [산출물] v4와 S5에서 첫 상태 요청을 7초 지연시킨 뒤 빠른 읽기와 새 공격을 보냈다. 첫 진입에서는 패링이 실제 적용됐다. 복구에서는 화면에 버튼이 열린 동안 이중 클릭하고 전송을 마감 뒤로 늦춰 서버 거절과 안내를 확인했다. 각 공격의 패링 RPC는 한 건이었다. 근거 `evidence/s5-v4-focused/*-r1-*.json`.
- [산출물] 룰렛 실패는 예약 약화를 남기고 피격 문구와 소리 0회였다. 성공 저주는 세션 세 곳 중 피해자 한 명에게만 문구·소리 1회, 재조회·같은 요청 재전송에 동일 사건 ID였다. 빈 가방 예약, 확률 실패, 무효 대상도 SQL에서 검증했다. 근거 `evidence/s5-v4-focused/s5-r2-curse.json`.
- [산출물] 방 읽기 성공과 아이템 읽기 503이 동시에 발생했을 때 마지막 문서가 유지됐다. 슬롯, 기권 버튼과 사전에 열린 확인창이 잠겼다. 장애 중 기권 RPC 0건, 정상 조회 후 확인창에서 1건을 전송했다. 해당 경기 DB에 이탈 상태 한 명이 기록됐다. 근거 `evidence/s5-v4-focused/s5-r3-item-read-outage.json`, `evidence/s5-v4-focused/s5-r3-authority.json`.
- [산출물] v4 2명과 S5 3명이 각 방에서 동일한 서버 시작 시각과 3·2·1을 관측했다. 1280px와 390px의 인트로·카운트다운·문서 화면을 포함했다. S5 첫 효과음은 브라우저 재생 성공 1회, 예약 대기 중 건너뛰기와 예약 중 재입장에서는 인트로 음성 0회였다. 근거 `evidence/s5-v4-focused/*-start-*.json`과 PNG.

| 경기 | 로컬 서버 시작 시각(KST) | 문서 링크 표시 시각 |
|---|---|---|
| v4 2인 | 17:18:53.535 | 시작 후 120·132ms |
| S5 3인 | 17:19:38.695 | 시작 후 279·436·330ms |

표의 링크 시각은 25ms 간격으로 화면을 읽은 관측값이다. 두 방의 모든 참가자에게 숫자 3·2·1이 차례로 보였다.

### 저장소 게이트

- [산출물] Node 950/950, 두 아이템 경로를 켠 Vite 프로덕션 빌드, 하니스 문법 검사와 전체 패치의 공백 검사를 통과했다. 빌드에 청크 크기와 환경 파일 옵션 안내가 있다. `package.json`에는 lint 스크립트가 없다.
- [산출물] 새 DB에 migration 75개를 적용한 뒤 전체 pgTAP 41파일 1728/1728 통과. 저장소가 요구하는 S5 권위 시각 되감기 거절 로그도 확인했다. 근거 `evidence/migrations.log`, `evidence/pgtap.log`, `evidence/s5-clock-diagnostic.log`.
- [산출물] 기본 1:1·3인조의 실제 이동, 완료, 재경기를 로컬 Chromium에서 확인했다. 근거 `evidence/integrated-browser.log`.
- [산출물] v4 2인과 S5 3·4·8인의 문서 이동, 완료, 결과·XP, 재경기를 Chromium에서 통과했다. 320·360·390·430px 화면과 S5 키온 Realtime도 확인했다. 3개 S5 인증 세션에서 같은 예약 다음 시각과 로컬 힌트 Edge 200 응답을 확인했다. 근거 `evidence/full-browser.log`, `evidence/s5-v4-browser/s5-local-hint-edge.json`.
- [산출물] 전체 패치에는 기존 A~F 파일 49개와 추가 경로 7개가 포함된다. 임시 인덱스에서 깨끗한 기준에 패치를 적용한 뒤 다시 만든 diff와 일치하고, 작업 트리에서는 역방향 적용이 가능함을 확인했다. 번들의 `manifest.json`에 패치·SQL·Edge·하니스·검증 증거의 SHA256을 기록했다.

### Windows에서 재실행

번들의 전체 패치는 깨끗한 `5976219`를 기준으로 한다. 하니스는 설치된 Docker와 Playwright Chromium을 사용하며 로컬 프로젝트와 주소를 검사한다. `prepare-item-race-review.ps1`는 전용 경로에 소스를 복사하고 저장소의 로컬 입장 픽스처를 적용한다.

```powershell
npm.cmd ci --no-audit --no-fund
npx.cmd --no-install playwright install chromium
pwsh -NoProfile -File scripts/prepare-item-race-review.ps1
node --test tests/itemRaceClock.test.js tests/s5ReactionClock.test.js tests/s5FinalAssets.test.js
& ./node_modules/.bin/supabase.cmd --workdir .temp/review-r1-r4/stack --network-id wiki-playtest-review-20261128-final-net test db --local supabase/tests/group_items_s5_free_wiki.sql supabase/tests/group_items_s5_events.sql supabase/tests/duel_v4_private_item_feedback.sql
node scripts/verify-s5-duel-v4-browser-ci.mjs --review-local --focused

npm.cmd test
$env:VITE_DUEL_ITEMS_V4_ENTRY = '1'
$env:VITE_GROUP_ITEMS_S5_ENTRY = '1'
$env:VITE_ENABLE_MODE_SERVER_FOLLOWUP = '1'
npm.cmd run build
git diff --check
pwsh -NoProfile -File scripts/prepare-item-race-review.ps1 -DatabaseOnly
& ./node_modules/.bin/supabase.cmd --workdir .temp/review-r1-r4/stack-gate --network-id wiki-playtest-review-20261128-gate-net test db --local
node scripts/verify-integrated-finish-rematch-ci.mjs --review-local
node scripts/verify-s5-duel-v4-browser-ci.mjs --review-local
```

브라우저는 로컬 Auth 계정, PostgreSQL, PostgREST, Realtime과 로컬 Edge를 사용했다. Wikipedia 본문과 링크는 통제한 검증 스냅샷이다. 실기기, Safari, 운영 v4 40초 지연의 원인은 확인 필요다.

## 승인 전 검토안

### 슬롯 버리기

권장 UX는 슬롯을 열었을 때 **사용** 옆에 **버리기**를 두고, 확인 문구에 다음 정시 보급까지의 시간을 표시하는 방식이다. 현재 공급 비율 공격 25%, 방어 25%, 탐색 25%, 조커 10%, 강화·약화 15%는 유지한다. 슬롯 포화는 보급을 못 받은 원인이며 보급 비율 자체를 판단할 자료는 아니다. 같은 방어 아이템을 금지하면 두 종류 방어가 찬 경우는 남고, 확률 조정은 모든 플레이어의 보급에 영향을 준다.

계약 초안은 v4 `act_duel_v4`, S5 `act_group_items_product_v1`의 새 `discard_item` 동작이다. 본인 grant ID와 현재 인벤토리 토큰·버전, 요청 ID를 요구한다. 기존 방 잠금·영수증 트랜잭션에서 소유권을 확인하고 1회 소비한다. 장착된 보호나 공격 경고를 직접 지우지 않는다. 같은 아이템의 사용·피격에 따른 소비와 동시에 도착하면 먼저 확정된 요청만 성공한다. 경계 전에 비운 슬롯은 정시 보급 대상이고, 포화 폐기 뒤 버리면 다음 정시 보급을 기다린다. 검증은 두 모드에서 중복 요청, 사용·피격과 동시 요청, 가방 포화 직전·직후 보급을 고정 시간으로 재현한다. 확정할 사항은 자기 슬롯 버리기 정책 채택 여부다.

### 천둥

아이템 도움말은 성공률 50%와 등급별 감전·봉인 가능성을 안내한다. `THUNDER_SELF_PENALTY`는 실패 반동, `THUNDER_SELF_STUN`은 약화 상태 성공 후 자기 감전으로 표시한다. 일반 성공은 기존 적중·차단 경로에서 확인한다. 확인된 연속 두 번 실패는 일반 등급 결과다. 확률과 효과 수치 변경은 제안 범위에 포함하지 않았다. 소스는 `itemRaceRules.js`, `duel_v4.activate`, S5 `ink_s5_attack_v1_grant`다.

### 재경기

권장 UX는 결과 화면에서 모든 기존 참가자가 **재경기 제안**을 누르고, 다음 방이 생긴 뒤에는 **재경기 준비방 참가**를 누르는 방식이다. 첫 제안자가 새 방장을 맡고 새 방에서 다시 준비한다. 확정할 사항은 첫 제안자와 기존 방장 중 누가 새 방장을 맡을지다.

v4의 `rooms.replay_of`와 S5의 `rooms.previous_room_id`를 재사용한다. S5는 기존 `ready` 상태를 새로 수집한다. v4는 재경기 방의 참가자별 수락·준비 상태를 추가하고 시작 조건에서 확인한다. 기존 원본 방의 참가자·종료 확인을 먼저 하고, 해당 행을 잠근 다음 기존 재경기 방을 조회하거나 하나를 만든다. 고유 키 충돌 때 이미 생성된 방을 돌려준다. 이전 방의 결과·XP와 새 방의 입장·준비·아이템 초기화는 별도 트랜잭션으로 확인한다. 테스트는 2인·3인 동시 제안, 원래 참가하지 않은 계정 거절, 중복 재합류, READY 새로 수집, 재경기 취소·만료를 포함한다. 현재 구현은 `RematchResultAction.jsx`, `duel_v4.run_command`, `get_s5_item_rematch_v1` 및 `join_s5_item_rematch_v1`의 방장 생성과 기존 참가자 수락 계약을 따른다.

### 공개방

권장 UX는 방 생성에서 **공개 대기 목록에 표시**를 선택할 수 있게 하고, 기본은 비공개로 둔다. 목록에는 모드·방장 표시명·현재 인원과 정원·만료 시각만 보인다. 문서 후보, 개인 UUID, 방 코드는 목록에 포함하지 않는다. 코드 초대와 정원은 현재 정책을 따르며 재경기 방은 기존 참가자 전용 비공개로 둔다. 확정할 사항은 목록을 로그인 사용자 전체에 보여줄지와 대기방 만료 시간이다. 기존 일반 공개방이 사용하는 방장 접속 확인 2시간을 첫 제안값으로 삼는다.

기존 일반 모드의 `public_room_discovery_v1`과 `public_waiting_room_expiry_v1`을 참고해 v4/S5 전용 공개 여부, 만료 기준, 인덱스와 최소 정보 목록 RPC를 추가한다. 참가 RPC는 방을 잠근 뒤 대기 상태, 정원, 만료와 입장 자격을 다시 읽는다. 목록에서 사라졌거나 이미 가득 찬 방을 눌러도 참가할 수 없다. 두 계정이 마지막 한 자리를 눌렀을 때 한 계정만 성공하는지, 이미 시작한 방·종료한 방·비공개·재경기 방이 비노출인지, 목록 접근이 오래돼도 기존 코드 초대가 작동하는지 검증한다.

## 출시 후보 증분 검증

2026-11-28 KST, `5976219`의 기존 이력과 승인된 A~F·R1~R4 후보에 출시 이력 검사 보완을 적용한 기준이다.

- [코드·산출물] `scripts/item-mode-launch.psql`은 68·70·72·73과 정확히 두 버전이 더해진 75를 허용한다. 74는 `20261128055613`, 75는 `20261128075609`다. 실제 가드의 10개 사례에서 정상 이력 5개를 허용하고, 74 단독과 같은 개수에서 버전을 바꾼 이력 5개를 거절했다. 근거 `launch-history-matrix.json`.
- [산출물] 기존 73개가 적용된 격리 DB에서 두 파일만 pending으로 확인하고 고정 CLI의 `migration up --local`로 적용했다. 이전 73개 버전은 일치했다. 11개 테이블에서 경기·함정·보급·영수증·S5 결과·XP 원장의 사전 데이터 지문이 일치했다. 스키마·테이블·열·함수 권한, RLS, 역할 멤버십과 publication 지문도 일치했다. 근거 `pending.log`, `migration-up.log`, `snapshot-before.json`, `snapshot-after.json`.
- [산출물] `5976219`의 Vite 빌드를 두 DB 이력에 연결했다. v4의 두 차례 문서 이동과 완주 XP 50, S5 세 참가자의 완주·순위·개별 XP 70·55·45를 실제 RPC와 Chromium으로 확인했다. S5 참가자별 XP 마스킹도 대조했다. Wikipedia 문서와 외부 폰트는 로컬 검증 응답을 사용했다. 근거 `before-legacy-rooms.json`, `after-legacy-rooms.json`, `legacy-upgrade.log`.
- [산출물] 실제 로컬 cron과 유지보수 작업 성공 후 입장을 열었다. 75에서 입장을 닫으면 일반 계정의 새 방 생성이 중지되고 기존 결과는 조회됐다. 다시 열었을 때 두 입장 스위치가 열리고 공용 게이트와 리뷰 정책은 기존 값을 유지했다. 기존 입장 스크립트로 익명 거절과 고정 코스 문서도 확인했다. 근거 `entry-transitions.json`, `observe-launch.log`, `existing-launch-contract.log`.

슬롯 버리기, 재경기 제안, 공개방, 그룹 정원 및 S5 업적은 후속 작업이다.

## 운영 반영 순서

건별 승인 시 운영 기준과 배포 직전 후보를 다시 대조한 뒤 migration 74·75 → `exploration-hints` Edge → 프론트 순서로 적용할 수 있다. 확정 시작 예약이 DB에서 먼저 8초로 바뀌어야 프론트가 전체 연출 구간을 사용할 수 있다. S5의 `weakeningHits`는 독립적인 선택 필드이고 v4 상자 `outcome`는 선택 필드다. 이전 클라이언트는 기존 값을 계속 해석한다. 신규 SQL은 기존 판정과 조회 권한을 유지한다.

문제가 있으면 직전 호환 프론트로 복귀하고 필요 시 Edge도 직전 버전으로 되돌린다. DB까지 되돌려야 하면 다음 migration으로 새 예약시간과 투영 변경을 보정한다. 이미 받은 시작 예약과 확정된 보상은 그대로 읽는 방식으로 복구한다. 이번 검증의 DB와 Edge는 격리 스택을 사용했다.
