# Jungle65 최종 배포 절차 — 실행 보류

2026-11-03 KST / 기준 후보 **20b50fb63cd8fe1eee10130892c439a6a2af64be + 제한 복구·QA 게이트** / Draft PR #8. **Production HOLD, 운영 변경·배포 0**. 최신 사용자 지시는 구현·백업 복원본 검증·CI/Preview까지이며 운영 실행은 금지다. [최종 후보·전체 원문 hash·검증 결과](JUNGLE65-FINAL-CANDIDATE-2026-11-03.md)가 구현 후 기준이다. 이 문서는 실행 승인이 아니다. 원래 4개 migration·Edge 1개·디자인 소스는 수정하지 않았다. HOME 배너는 Issue #9, 튜토리얼·아이템 이펙트·공지·관전 이모티콘·채팅은 후속 범위로 보존한다.

## 1. 시작 전에 해결할 두 가지

1. [36건 분석](JUNGLE65-DRAIN-REVIEW-2026-11-03.md)의 **4건(D01/D02/D28/D32)**에는 신규 postgres 전용 `admin_recover_legacy_duel_v1`을 사용한다. 정확한 4개 room hash·전체 상태 지문·사례별 roster/snapshot·30일 미활동·결과/XP 부재를 잠금 안에서 재검증한다. 구현 승인은 운영 실행 승인이 아니며 네 건의 실행은 별도 승인한다. 32건은 기존 만료 RPC를 유지하고 네 건을 drain 집계에서 제외하지 않는다.
2. **QA 2계정 예외는 신규 migration으로 구현**했다. 관리자 DB 함수 `admin_set_duel_qa_v1`로 정확한 auth.uid 최대2개/기본60분/최대2시간을 관리한다. 비밀번호·토큰을 요구하지 않는다. 설치 직후 명단은 비어 있다. 운영의 실제 2계정 등록·경기/아이템/XP 생성은 새 Production 배포 후 별도 승인 아래 사용자가 직접 진행한다.

복구/QA를 포함한 SQL 6개 원문·파일별 hash·권한·재시도·동시성 검증은 최종 manifest로 확정한다. 운영 적용 범위의 명시적 승인을 받은 뒤에만 작업 창을 시작한다. 새 SHA의 CI/Preview Ready를 확인하며 기존 승인 대상에 추가 migration을 조용히 포함하거나 동결된 원래 파일을 고치지 않는다.

후보 파일은 **51개 = 운영 기준45 + pending6(기존4+신규2)**다. 신규 파일은 `20261102081000_duel_legacy_recovery_v1.sql`, `20261102082000_duel_qa_admission_v1.sql`이다. 11월3일 작성했으며 기반 제어와 검색 사이 의존 슬롯에 배치했다. **운영 적용은 0**이며 실제 이력 수는 승인 창에서 다시 조회한다.

## 2. 확인한 운영·배포 기준과 한계

| 항목 | 2026-11-03 읽기 전용 확인 / 출처 |
|---|---|
| DB | migration 45개, 마지막 20261030044026, remote-only 0. public 함수72/테이블36/정책37, private 테이블5 [산출물: preflight] |
| 제어·검색 테이블 | release_control/search_sessions 없음. 신규 서버 제어는 아직 운영에 없음 |
| 미종료 1:1 | starting2 + playing34=36, waiting21. waiting21도 시작 경계에서 막아야 함. 최근 5분 활동0은 drain=0과 다름 |
| 실제 Edge | target-level v10, target-generate v3, username-signup v2, username-lookup v2, wiki-snapshot v4, single-run v3, duel-random-teleport v1, duel-link-preview v1 — 8개 ACTIVE, duel-search 없음 [기존 이번 창 CLI 읽기 산출물] |
| 기존 JWT 설정 | 위 순서 중 single-run/duel-link-preview는 verify_jwt=false, 나머지 true. 함수별 기존 설정을 불필요하게 바꾸지 않음 |
| 후보 | PR #8 Draft / head20b50fb / GitHub CI41551776807 success / Preview FHZm9ZKxgbQF8m4MaRDFT95zsPrR success, 동일 SHA [이번 창 앞선 원격 조회] |
| main / Production | main8da7d25, GitHub Production deployment7434143499 success/동일 SHA. 실제 Vercel 현재 alias·deployment ID는 실행 창에서 다시 확인 필요 |
| 36건 재확인 | 10:37:28→10:47:50 KST 방·참가자·활동·결과·XP 및 관련 함수/트리거 동일. 최신 snapshot 존재 조회10:49:40 |

위 표는 미래 실행 시점의 상태가 아니다. 실제 시작 전 PR head/base/diff·CI·Preview 및 main·Vercel Production SHA/Ready/alias/이전 artifact를 다시 읽고 기록한다. 20b50fb가 바뀌면 hash를 비교하고 그 변경의 승인을 받는다. Preview가 준비됐다는 이유로 main/Production이 바뀌었다고 판단하지 않는다.

## 3. 실제 백업과 복구 준비

실제 읽기 전용 DB archive가 **2026-11-03 10:14:49 KST, 3,019,987 bytes**로 생성됐고 SHA256은 `56ec8b3f87cdc8d4bc062a43d770a51d0539209d6671aeca41dc6734aba97dab`다. 새 빈 격리 DB에 실제 복원하여 77테이블 데이터/125함수/41정책/76보안·RLS·ACL/24기본권한 동일성을 확인했다. 원래 4개 SQL도 그 복사본에서 적용·검증했다 [산출물: 분석 JSON].

복원 대상 DB를 **OWNER postgres**로 만들어 운영 DB 소유권과 public의 pg_database_owner 권한을 맞춘다. 로컬 기본 owner=supabase_admin인 복사본에서는 함수 생성 권한이 달라질 수 있으므로 역할/extension/소유권 전제를 데이터 동일성과 별도로 검증한다. 운영 grant를 바꿔 이 차이를 감추지 않는다.

실행 창의 첫 운영 변경 전에 새 백업을 다시 만들고 before/after fingerprint, archive hash/TOC, 새 빈 DB 실제 restore와 metadata/데이터 비교를 통과시킨다. 통과 시각·보관 위치·접근권한·복구 담당자를 기록한다. 실패·진행 데이터 변경 시 재백업 또는 HOLD한다. drain으로 새 정상 결과가 생긴 뒤에는 다음 DB 단계 전 추가 checkpoint를 남겨 그 결과를 보존한다.

보호 범위는 DB 논리 archive와 비밀번호 없는 role metadata다. Storage 객체 본문·Edge secret·관리형 PITR 검증을 완료했다고 주장하지 않는다. 이번 변경이 Storage를 쓰지는 않지만 기존 object/설정 복구 및 Edge secret 재구성 가능 여부와 이전 배포 artifact 접근을 확인한다. 전체 DB 과거 덮어쓰기는 정상 결과·XP를 잃을 수 있어 기본 복구안이 아니다.

## 4. 원래 승인 대상 원문과 의존 순서

| 순서 | 원래 파일 | SHA256 | 적용 조건 |
|---|---|---|---|
| 1 | 20261102080000_duel_release_controls_v1.sql | 8254178b20458ec76987773165479b9d65e74ffa5cf461816291d4a451958afd | 기존45개/함수 anchor/백업 검증 완료 |
| 1-a | 20261102081000_duel_legacy_recovery_v1.sql | 최종 manifest의 전체 SHA256 | 기반 제어 설치·진입/검색 닫힘. 설치는 종료 RPC를 실행하지 않음 |
| 1-b | 20261102082000_duel_qa_admission_v1.sql | 최종 manifest의 전체 SHA256 | 기반 제어 설치. 명단은 비어 있고 별도 등록 전 QA 입장 없음 |
| 2 | 20261102090000_duel_search_authority_v1.sql | de99cb75859833b6aadefd7eb16cdfe32b2f8caf039cd4b19cf12acc82de6516 | 서버 게이트 닫힘, 미종료·활성 검색0 |
| 3 | 20261103090000_duel_search_release_guard_v1.sql | 0558bafa6c4c9580a47e26f813f6cf5f78febefd0bf3c578ae3c1494d00297ea | 검색 DB 객체 설치 완료 |
| 4 | 20261103100000_duel_search_retention_v1.sql | 4da905168d9b4058fe98af0b38309458fb59fac8dd3597713cbc1850b60c45c4 | 검색 DB 객체 설치 완료 |
| Edge | duel-search / index.ts + handler.mjs + document.mjs + singleflight.mjs | 최종 SHA의 전체 번들 manifest로 재확정 | 위 DB·ACL·disable guard 완료 |

원래 파일 순서는 유지한다. 기반 제어 → **닫기** → 승인된 복구/QA 추가 객체(필요 시) → **완전 drain 확인** → 검색 DB/guard/retention → Edge → 프론트 → QA → 정상화 순서다. 추가 객체의 migration version/의존 순서는 등록 전에 이 순서에 맞게 검토한다. 모든 pending을 자동으로 적용하는 일괄 push는 게이트 전후 단계를 보장하지 못하므로 사용하지 않는다. 단계별로 승인한 파일만 전달하는 격리 manifest/공식 적용 경로와 migration 기록을 로컬에서 먼저 리허설한다. 성공 여부가 불분명하면 재실행/repair하지 말고 실제 이력·객체·hash를 먼저 조회한다.

## 5. 기반 게이트를 적용하고 닫기 — 향후 승인 단계

1. 새 백업·원격 상태·원문·담당자·창을 확인한 뒤 기반 1개만 적용한다. 기본값은 기존 동작을 유지하므로 **파일 적용만으로 점검 진입이 막혔다고 판단하지 않는다.**
2. 별도 짧은 제어 트랜잭션에서 entry_open=false, search_enabled=false, required_protocol=search-authority-v1로 설정하고 commit한다. 제어 UPDATE는 앞선 entry/search의 FOR SHARE 잠금이 끝나기를 기다린다. 제어 트랜잭션에서 방/참가자/검색 세션 잠금을 함께 잡지 않는다.
3. commit 뒤 별도 읽기 트랜잭션으로 실제 제어값과 진행 수를 확인한다. lock timeout/오류가 나면 닫혔다고 추정하지 않는다.
4. 생성 create_duel_room_v2·create_discoverable_duel_room_v1, 참가 join_duel_room_v2·join_public_room_v1, waiting→시작 start_duel_room_v2와 테이블 진입 트리거를 확인한다. 일반 회원 직접 쓰기는 계속 revoke/RLS 상태여야 한다. 기존 waiting 방 시작도 차단한다.
5. 기존 starting 초기화, playing 이동/heartbeat/기권/결과·XP 경로는 계속 둔다. 그룹/싱글 권한을 임의 변경하지 않는다. 종료/XP 트리거를 끄거나 전체 API를 차단하지 않는다.

일반 사용자에 대한 음성 테스트는 실제 새 운영 경기 생성 없이 게이트 함수/권한과 거부 응답으로 검증한다. 사용자 본인이 가진 구형 탭과 승인 QA 신원을 쓰는 최종 거부 검증은 새 프론트 Ready 뒤에 진행한다. 검사 실패 시 열어서 확인하지 않는다.

## 6. 36건 drain 실행 규칙 — 현재는 미실행

운영 시작 직전 D01–D36 private 매핑·방 version/roster·heartbeat/last_seen/이동/아이템/요청·기존 결과/XP를 새로 조회한다. 새 경기/활동이 있으면 최초 목록에 고정하지 말고 전체 미종료를 다시 분류한다.

**32건:** 현재와 동일한 playing/정확히2명/양쪽 playing 또는 disconnected/양쪽 만료/기존 결과 없음 조건을 건별 확인한다. 실제 권한을 가진 서버 실행자가 기존 `finalize_duel_if_expired(p_room_id)`만 순차 호출한다. 일반 참가자는 자기 경기만 호출 가능하고, service_role 서버 호출은 실제 운영 키로 인증한다. JWT claim/사용자 UID를 SQL로 위조하거나 키를 브라우저·로그에 노출하지 않는다.

각 호출 전후를 기록하고 정상 cancelled 결과1/retired2/신규 XP0을 확인한다. 실패 응답, 응답 유실, 새로운 heartbeat·이동·인원/결과 변화 시 그 경기는 중단·재조회한다. finished 재호출은 기존 결과를 보존하는 동일 RPC로 확인할 수 있다. 함수 자체에 expected version 인자가 없으므로 사전 조회와 호출의 경쟁은 남는다. 한쪽이 재개해 정상 forfeit/XP가 확정되면 임의로 되돌리지 않는다. 취소만 원자적으로 허용하는 별도 보장은 새 승인·RPC가 있어야 한다.

**4건:** 승인한 신규 postgres 전용 `admin_recover_legacy_duel_v1(room_id,request_id,expected_fingerprint,rationale)`만 사용한다. private 대상 지문은 고정4개이고 등록 RPC가 없다. 새 heartbeat/이동/roster·identity·결과/XP 변화 시 거부하고 manifest를 자동 갱신하지 않는다. 정상 CHECK/트리거를 유지한 무승자 cancelled 결과1행, 신규 XP/업적0을 확인한다. 원래 참가자가 finished 방에서 정상 leave를 호출해 요청 이력만 늘어도 복구 재시도 결과는 유지한다. 요청 ID 충돌이나 정산 데이터 변조는 거부한다. 운영자가 사용자 기권을 대신 호출하지 않는다.

신선한 다음 읽기 조건이 모두0이어야 검색 DB/Edge 단계로 간다.

```sql
-- 승인 창에서 읽기 전용 확인. 운영 변경 명령이 아니다.
begin read only;
select entry_open, search_enabled, required_protocol
from private.duel_release_control_v1;
select count(*) as unfinished_duels
from public.game_rooms
where mode='duel' and status in ('starting','playing');
select count(*) as live_search_effects
from public.duel_item_events
where item_id='search_once' and effect_expires_at > clock_timestamp();
-- 검색 테이블이 이미 있을 때만 다음 별도 조회도 수행:
-- select count(*) from private.duel_search_sessions_v1
-- where expires_at > clock_timestamp();
rollback;
```

게이트 닫힘 commit 후 기존 검색의 최대15초가 지나고 활성 효과/세션0을 다시 확인한다. 함수가 아직 없다면 세션 조회를 실행하지 않고 기존 효과를 확인한다. 남은 방이 4건이든 1건이든 다음 단계는 HOLD다. 오래된 row를 빼거나 상태를 직접 고쳐0을 만들지 않는다.

## 7. 나머지 DB·Edge 설치, 새 프론트 배포

1. drain 결과와 새 정상 결과·XP가 담긴 checkpoint를 보존한다.
2. 원래 검색·guard·retention 3개 및 승인된 추가 파일을 의존 순서대로 건별 적용한다. 실제 이력 수·파일별 원문·테이블/RLS/grant/EXECUTE·service-only commit/put·postgres-only 청소·policy/hash 계약을 확인한다. 자동 Cron은 설치하지 않는다.
3. duel-search 한 개만 배포한다. 설정은 **verify_jwt=false + handler의 auth.getUser 필수 검증**이며 무인증 허용이 아니다. 신규 실제 배포 버전/ID·번들 SHA를 기록한다. 기존 Edge8개를 재배포하지 않는다. anon/service/member의 JWT와 역할 구분, prepare/commit의 실제 사용자/문서/만료 검증을 확인한다. 신규 게임이 필요한 검사는 아직 실행하지 않는다.
4. 최종 후보의 CI·Preview Ready·제품 diff·원문 hash가 일치하고 DB/Edge 게이트가 통과하면 PR #8 Draft를 해제하고 승인된 정확한 head를 main에 병합한다. main 변경은 **이 한 번**만 수행하고 Git 연동 자동 Production 배포를 기다린다. CLI production deploy·수동 redeploy·배너 수정·문서만의 후속 main push를 추가하지 않는다.
5. GitHub main SHA, Vercel deployment ID/Ready/Production alias, 실제 HTML/JS의 신규 검색 프로토콜·번들 SHA를 각각 확인한다. merge/squash 정책에 따라 main SHA가 PR head와 다를 수 있으므로 최종 Git tree와 승인 후보를 대조한다. 예전 Preview URL을 Production 증거로 쓰지 않는다.

## 8. 새 Production에서 사용자 직접 QA — 일반 입장은 계속 닫힘

전제: 검증된 QA 서버 migration이 운영 승인 아래 적용됐고 실제 후보가 Production Ready이며 일반 미종료0/활성 검색0이다. 이 조건을 충족하기 전에 실제 QA 예외를 등록하지 않는다.

1. 사용자가 직접 사용할 기존 회원 2개를 소유자 확인 후 보호된 관리 명단의 auth.uid 두 개에만 등록한다. 인증정보/비밀번호/토큰은 받지 않는다. ID는 비밀 인증수단이 아니며 이름 유사성만으로 대상을 추측하지 않는다. 정확한 식별이 어려우면 HOLD한다.
2. entry_open=false, required_protocol=search-authority-v1 유지, QA TTL 기본60분/최대2시간 제안. 검색 검증 동안 search_enabled=true를 허용한다. 일반 진행/세션이 이미0이므로 이 동안 신규 검색을 활성화할 수 있는 경기 참가자는 QA뿐이어야 한다. QA 진입과 다른 권한을 분리한다.
3. 실제 두 계정은 일반 로그인·정상 UI/정상 RPC로 비공개 1:1 방을 만들고 참가·시작한다. 명단만으로 타인 방장·진행/아이템·RLS 권한을 얻지 않는다. 검색 아이템은 정상 획득/선택 절차를 사용하고 임의 grant·slot 환급·쿨타임 변경을 하지 않는다.
4. 사용자가 검색 성공1회·15초 만료·링크 이동·F5·정상 승패/기권·결과/XP 및 모바일320/390px를 확인한다. 실제 성공 표본과 실패/로딩 시간을 함께 기록한다. 같은 상대 감쇠 때문에 XP가 기본값과 다를 수 있어 서버 규칙/원장으로 판단한다. 검색 비활성화·동시 요청·동일 ID 재시도는 승인된 QA 경기와 사용자 본인 브라우저에서만 검증하며 토큰을 전달받지 않는다. 격리 테스트 성공을 운영 실측으로 바꾸어 쓰지 않는다.
5. 작업자는 그 승인된 경기·검색 요청·원장만 읽기 전용으로 비교한다. F5/재요청 전후 결과/XP가 중복되지 않아야 한다. 별도 운영 게임/XP 데이터를 임의로 만들거나 정산하지 않는다. 그룹3계정 Production QA는 이 2계정 승인 범위에서 완료로 표시하지 않는다.
6. 승인된 사용자 본인의 구형 탭은 protocol 누락으로 새 생성/참가/기존 waiting 시작이 거부돼야 한다. QA 명단에 있어도 구형 protocol을 통과시키지 않는다. 최신 protocol을 쓰는 비명단 사용자도 entry_open=false에서 거부돼야 한다. 실패하면 일반 진입을 열지 않는다.
7. QA 명단 만료/회수는 새 진입만 막고 이미 starting/playing인 QA 경기의 초기화·heartbeat·기권·정산을 허용해야 한다. 명단 만료로 진행 중 QA 결과/XP를 중단하지 않는다.

계정별 진입 예외는 일반 사용자를 무조건 개방하는 절차가 아니며 정상 Auth/JWT·RLS·소유권 검사를 우회하는 관리 토큰도 아니다. protocol은 구형 클라이언트 거부용 호환성 표식이지 악의적 클라이언트에 대한 신원 증명이 아니다.

## 9. 정상화·검색 비활성화·복구

사용자 QA PASS, 실제 권한/검색 보안/결과·XP/F5/모바일 확인, 오류·리소스 이상 없음, QA 경기 정상 종료 및 검색15초 drain0을 확인한 뒤 QA 예외를 회수/만료한다. required_protocol은 유지한 채 별도 승인된 정상화 제어에서 entry_open=true, search_enabled=true로 전환한다. 실제 제어값을 재조회하고 최신 프론트 신규 진입/구형 탭 거부를 확인한다. 프론트 배너 삭제를 위한 추가 재배포는 필요 없다. 게이트 해제 시각·조건·실제 Production ID를 기록한다.

문제가 생기면 **entry_open=false + search_enabled=false + required_protocol 유지**를 우선한다. 기존 경기 이동·기권·결과/XP를 끊지 않는다. 검색 disable UPDATE가 진행 중 제어 잠금의 종료를 기다린 뒤 성공했는지 확인한다. search_once 신규 활성화와 기존 서버 prepare/commit을 닫되 이미 소비된 slot/request/기존 deadline을 보존한다. 복구 후 자동 환급·15초 연장·재활성화가 생기면 안 된다.

서버 권위 DB/Edge/프론트를 유지하고 새 수정 후보를 검증하는 것이 기본 복구다. 구형 프론트로 돌아가 우회를 복원하는 것을 정상 rollback으로 간주하지 않는다. 기존 Production은 문제 분석용 복구 artifact이며 자동으로 승격하지 않는다. DB 전체 덮어쓰기·RPC/RLS 삭제·임의 결과/XP 재정산은 별도 복구 승인 없이는 하지 않는다. 보안 Ready artifact가 없는 경우에도 닫힌 상태로 HOLD한다.

## 10. 현재 미실행 상태와 이후 보고 항목

현재 적용 migration **0**, duel-search 운영 버전 **없음**, main 변경 **0**, 신규 Vercel Production 배포 **0**, 운영 QA 게임/XP 생성 **0**, 서버 점검 게이트 **미설치·미해제**다. 서비스가 점검 중이라고 표시하지 않는다.

다음 실행 보고에는 승인된 전체 파일/version/hash·실제 Edge 버전/ID·main SHA·Vercel deployment ID/alias·36건 처리 결과·신규 결과/XP 보존·실제 QA PASS/FAIL·게이트 값/해제 시각을 남기고 DEPLOYED/HOLD/ROLLED BACK 중 하나로 판정한다. 현재 판정은 **HOLD — 4건 복구 결정, QA 계정별 진입 기능의 별도 구현/검증/승인, 최종 갱신 후보의 CI/Preview 및 실행 창 승인 필요**다.
