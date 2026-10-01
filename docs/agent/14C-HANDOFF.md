# 14c — 방장 공통 목표 · READY 제거 · 정확한 시작 identity

날짜: 2026-10-01. 트랙 세션: `feat/group-final-gaps`, 착수 HEAD `42a3df3`.
`CURRENT.md`·`docs/contracts` 무수정. 통합 세션이 실제 merge 상태를 CURRENT에 반영한다.
운영 DB 미접근, push 없음. 기존 미추적 SQL/설계 산출물은 보존.

## 14c-1 서버

- 신규 `supabase/migrations/20261001100000_duel_host_target_v2.sql` 1개.
  CLI 생성 버전은 `20261001072901`이어서 사용자 요구(기존 최대 `20261001090000` 뒤)에 맞춰 조정했다.
- setter는 인증·waiting·host 검사를 먼저 한다. 비방장 NULL 입력도 `DUEL_HOST_ONLY`.
  방장 행에만 목표를 저장하며 `p_is_ready`는 호환 인자이고 readiness를 변경하지 않는다.
- START는 4인자 필수, 방장 목표 + 2명 조건. 정확한 시작 page/revision 스냅샷의 canonical 제목 사용.
  방장 목표 revision 정규화·양쪽 복사, 기존 초기화 RPC·잠금 계약 유지. `[코드: 위 migration]`
- 구 1인자 함수는 drop(CASCADE 없음). 새 ACL PUBLIC/anon 차단, authenticated/service_role 허용.
  **DB → 프론트 배포 사이 구 번들의 START는 실패한다.** 1인자에는 시작 identity가 없어서
  새 계약을 만족하는 호환 실행을 만들 수 없고 티켓도 fallback·구 서명 부재를 요구한다.
  향후 운영 적용은 중단 창·구 대기실 새로고침 안내를 포함해 별도 건별 승인해야 한다.
- `supabase/tests/server_authority_v2.sql`: #30 호출, #34 목표 누락, #35 READY false+방장 목표만으로 시작 교체.
  #29 상태 거부·#36 정규화 유지. 권한 우선순위·거부 무변경·1/3명·구 서명/ACL·정확한 시작·초기화 추가.

검증 `[산출물, 기준 42a3df3 + 14c-1 미커밋 작업 트리, 2026-10-01]`:

- 고정 로컬 preflight PASS: CLI 2.114.0 · PostgreSQL 17.6 · image 17.6.1.158.
- `npx --no-install supabase migration up --local`: 신규 1개 적용 성공.
- pgTAP 전 10개 스위트 **771/771**, server_authority_v2 **129/129**(기존 97 + 32).
  디렉터리 전체 실행은 TAP 없는 `group_final_gaps_v13_hardening_preflight.sql` 때문에 실행기 FAIL;
  기존 파일을 수정하지 않고 TAP 스위트 목록으로 분리하여 PASS.
- `npm test`: **413/413**. 클라이언트·빌드·UI는 다음 단계에서 검증.

```powershell
$tapFiles = Get-ChildItem supabase/tests/*.sql | Where-Object { $_.Name -ne 'group_final_gaps_v13_hardening_preflight.sql' } | ForEach-Object { $_.FullName }
npx --no-install supabase test db --local @tapFiles
```

## 14c-2 클라이언트

서버 단계 커밋: `3d027ba`. `[코드]`

- `pages/RoomPage.jsx`: host_user_id 기준 검색/선택 권한. 후보 클릭 즉시 summary → snapshot
  반환 identity → setter; READY UI 제거. 서버에 저장된 방장 목표를 양쪽에 공개.
  START는 2명+저장 목표 조건, 검색/저장/시작 및 목표 저장 실패 시 차단. 단일 작업 ref로 중복 호출 방지.
  기존 랜덤 → 본문 → snapshot 경로의 반환 identity를 START에 전달. playing 대기실 재접속도 게임으로 복구.
- `services/multiplayerService.js`: setter의 `p_is_ready=false` 고정; START identity 인자 3개 추가.
- `pages/MultiplayerGamePage.jsx`: host_user_id 행의 공통 목표를 양쪽 HUD/VS 소개에서 읽는다.
- `utils/onlineGameSession.js`: validateDuelGameSession만 변경, host 공통 목표로 starting 조회 조합 복원.
  목표 누락·참가자·진행 검사는 유지. 그룹 함수/공유 helper 무변경.
- `tests/duelHostTarget.test.js`: 서비스 실제 호출·오류 전파·화면 계약.
  `tests/onlineGameSession.test.js`: 1:1 복구 3건 추가, 기존 그룹/공유 helper 테스트 무변경.

검증 `[산출물, 기준 3d027ba + 14c-2 미커밋 작업 트리, 2026-10-01]`:
`npm test` **422/422**(413 + 9), `npm run build` exit 0.
기존 bundle 500 kB 경고는 남아 있다. DB 변경은 14c-1 이후 없음.

## 14c-3 스모크·구독 연결 보정

클라이언트 단계 커밋: `f3ab081`. `[코드]`

로컬 UI 스모크에서 초기 SELECT와 Realtime 구독 연결 사이에 참가 이벤트를 놓치면
방장 목록이 1명으로 남아 START가 비활성인 경우를 재현했다.
`RoomPage.jsx`의 SUBSCRIBED 콜백에서 방·참가자를 한 번 재조회하여 초기 연결/재연결 공백을 보정했다.
`scripts/duel-host-target-smoke.mjs` 추가: 실제 로컬 Auth/RPC/Realtime와 결정적 Wikipedia/snapshot 응답.
기존 의존성(Vite/Playwright/Supabase)만 사용하며, URL을 loopback 54321로 제한한다.
키·세션·비밀번호는 메모리에서만 사용하고 생성 계정·방·문서는 finally에서 삭제한다.

최종 검증 `[산출물, 기준 f3ab081 + 14c-3 미커밋 작업 트리, 2026-10-01]`:

| 검증 | 결과 |
|---|---|
| Node | `npm test` **422/422**, 실패 0 |
| 빌드 | `npm run build` exit 0, 기존 500 kB 번들 경고 유지 |
| UI | `node scripts/duel-host-target-smoke.mjs` **30/30** |
| 로컬 DB | migration **21행**, 최대 `20261001100000`, `start_duel_room_v2(uuid,text,text,text)`만 존재 |
| 런타임 | 고정 preflight PASS, PostgreSQL postmaster/restart count 유지. 과거 전체 로그 판정은 defer |
| 불변식 | 착수 `42a3df3` 대비 그룹 함수·공유 helper·기존 그룹/공유 helper 테스트 내용 불변; 기존 migration·그룹/싱글/아이템/XP 소스·contracts·CSS 무변경 |

UI 범위: 비아이템/아이템 각각 ① 1명·목표 미선택 START 차단 ② 상대 검색/START UI 없음
③ READY false 양쪽·후보 선택 즉시 저장·Realtime 공개 ④ 대기실 F5
⑤ 목표 변경 로딩 차단·Realtime 변경 ⑥ 랜덤 시작 스냅샷 반환 identity 정확히 1회 전달
⑦ VS 양쪽 공통 목표 ⑧ 두 초기화 후 playing·양쪽 동일 시작/목표
⑨ 양쪽 HUD ⑩ 아이템 지급 0/10 ⑪ 플레이 F5 ⑫ 새 로그인 세션으로 방 URL 복구
⑬ 실제 본문 링크→이동 RPC→양쪽 승리/패배 결과. 비아이템에서는 저장 실패/재선택과 상대 퇴장/재참가 추가.
브라우저 pageerror 0. 테스트 계정·방·문서 잔여 0.
로컬 산출물: `.temp/14c-ui/summary.json`, `waiting-{false,true}.png`, `playing-{false,true}.png`(Git ignore).

pgTAP **771/771**은 14c-1(`3d027ba` 직전, 위 표기) 측정값이다. 이후 DB 소스 변경이 없어 재실행하지 않았다.
수용조건의 로컬 구현/실행 검증을 통과했으며 **운영 적용 완료로 읽지 않는다.**

```powershell
npm test
npm run build
node scripts/duel-host-target-smoke.mjs
```

## 통합 세션 인계 · 남은 위험

- 트랙 규칙대로 `CURRENT.md`·`TRACKS.md`·`docs/contracts` 무수정.
  통합 시 14c 로컬 구현 완료·위 커밋/검증 근거를 CURRENT/TRACKS에 반영한다.
- 운영 migration **20**은 사용자 착수 보고이고 이번 트랙에서 재조회하지 않았다.
  저장소/로컬은 **21**이므로 운영 미적용 신규 1개(`20261001100000`)가 남는다.
- 구 START 서명 삭제와 setter host-only 적용 때문에 **운영 DB를 먼저 바꾸면 구 번들의 START·guest READY가 실패**한다.
  구 목표/READY 흐름을 보존하는 fallback은 만들지 않았다. 향후 migration 적용과 프론트 배포는
  각각 별건 승인, DB → 프론트 순서의 중단 창·열려 있는 구 대기실 새로고침 안내를 검토한다.
  이미 starting/playing인 방은 기존 initialize RPC·저장된 공통 시작 계약으로 계속 진행한다. `[코드]`
- Wikipedia/snapshot 응답을 고정한 스모크이며 **실제 Wikipedia 랜덤·실제 Edge 외부 호출은 미검증**이다.
  실제 로컬 DB RPC·Auth·Realtime·이동·결과·XP 기존 스위트는 실행 검증했다.
- 그룹 DB/RPC/READY·아이템·보상 지급·승패를 재설계하지 않았다. 추가 기능/운영 배포는 이번 요청 범위 밖.
