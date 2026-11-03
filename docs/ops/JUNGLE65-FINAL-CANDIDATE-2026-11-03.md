# Jungle65 최종 운영 배포 후보 — 제한 복구·QA 게이트

2026-11-03 KST. 기준 `0b93be93bf8fa19ae9f74bcfd9174a7b3613a04d` / source fingerprint `4c7162b768bd5ee28485a53d8a4ce607f746190e80a62293598525573f751dfb`. **로컬 후보 검증 통과 / Production HOLD / 운영 변경0**. 테스트 수치는 이 소스와 같은 작업 트리에서 측정했다. 최종 문서 커밋 head의 CI/Preview는 [Draft PR #8](https://github.com/Yu-HsH/wiki/pull/8) 최신 SHA 및 최종 실행 보고로 확인한다. 디자인 PR #7·20b50fb·보안 fdd7190을 보존한다. HOME Issue #9 및 후속 기능 변경0.

## 1. 제한 복구 RPC와 관리자 권한

신규 `public.admin_recover_legacy_duel_v1(uuid,uuid,text,text)`는 postgres만 실행한다. PUBLIC/anon/authenticated/service_role은 EXECUTE가 없다. helper·대상/영수증/요청 감사 테이블도 API 역할의 직접 접근을 revoke했고 RLS를 켰다. 사용자를 가장하는 JWT/기권 호출은 없다.

고정된 D01/D02/D28/D32 네 방의 UUID SHA256과 전체 사전 상태 지문만 설치한다. ID/방 코드/사용자 이름은 저장소에 넣지 않았다. 추가 대상 등록 RPC는 없다. request advisory lock → 방 FOR UPDATE → user_id 순 참가자 FOR UPDATE → control FOR SHARE 순으로 잠그고, 사례별 status/roster·start/current snapshot 부재·30일 미활동·새 heartbeat/이동/이벤트 없음·기존 결과/XP 없음·승인 지문을 다시 검사한다. 제어 행이 없거나 입장/검색이 열렸으면 최초 실행을 거부한다. 새 활동이 생겨도 지문을 자동 갱신하지 않는다.

무승자 finished/cancelled, 기존 CHECK에 맞는 retired/disconnected_timeout, cancelled/disconnect_cancelled 결과1행만 만든다. 새 XP/업적0을 기존 트리거를 유지한 채 검증했다. request ID/근거/시각/database_actor와 완료 영수증을 private에 보존한다. 동일 ID·새 ID 재시도는 같은 정산 응답이다. 같은 ID에 다른 입력이면 거부한다. 완료 뒤 정상 ALREADY_FINISHED 나가기 요청 이력은 허용하며, 방/참가자/결과/XP 정산 내용이 바뀌면 영수증 drift로 거부한다. 감사 기록 자동 삭제는 없다.

## 2. 32건의 정상 만료와 경합 한계

기존 `finalize_duel_if_expired` 원문은 변경0이다. 실제 백업 복원본에서32건 모두 정상 cancelled/신규 XP0/재시도 동일이었다. 실제 두 연결에서 양쪽 heartbeat가 살아 있으면 no-op, 한쪽 heartbeat가 먼저 잠금을 잡고 갱신하면 그 사용자의 정상 disconnect_forfeit 승리·30 XP가 보존됐다.

따라서 32건의 “항상 무승자·0 XP”를 기존 API로 원자 보장할 수는 없다. 별도의 조건부 관리 경로가 있어야 취소만 보장할 수 있다. 이번 구현은 사용자 지시대로32건 정상 RPC를 유지했고 그 추가 경로를 만들지 않았다. 운영에서는 호출 직전/직후 재검증, 새 활동 발견 시 해당 건 중단·재분류, 정상 서버 결과/XP 임의 취소 금지를 적용한다. 4건 전용 복구를32건으로 확장하지 않는다.

## 3. QA 두 계정 입장

신규 `public.admin_set_duel_qa_v1(uuid[],uuid,text,integer default 3600)`는 postgres 전용이다. 최대2 auth.uid, 중복/NULL/제3계정 거부, 기본3600초·최대7200초다. 실제 Auth/profile 존재와 닫힌 gate/current protocol을 확인한다. 설치 시 명단은 비어 있다. API 역할은 명단 읽기·변경·관리 함수 실행이 불가하다. header/요청 파라미터는 QA 신원을 정하지 않는다.

관리 요청도 request ID/근거/시각/actor를 감사하며 재시도는 TTL을 갱신하지 않는다. entry_open=false인 일반 사용자는 기존 DUEL_ENTRY_PAUSED 계약을 유지한다. 유효 QA라도 구형 protocol은 거부한다. 기존 소유권/RLS/host·아이템·승패·XP는 그대로다. TTL 만료/회수는 새 생성·참가·시작만 막고 기존 starting 초기화·playing 이동·heartbeat·기권·정산을 허용한다. QA 표의 slot CHECK도1/2만 허용한다. 명단은 운영에서 아직 등록하지 않았고 실제 사용자 인증정보를 받거나 저장하지 않았다.

## 4. migration 전체 및 Edge

**후보51개 = 운영 기준45 + pending6(기존4 + 신규2)**. 11월3일 작성한 두 파일은 기반 제어 다음·검색 이전 의존 슬롯에 배치했다. 기존4개는 승인한 작업 트리 raw SHA256과20b50fb의 Git LF 원문을 모두 엄격 비교해 동일했다. Windows CRLF 파일의 raw 해시와 Git LF blob 해시는 다르므로 JSON에 둘 다 기록한다. 아래 표는 검증에 사용한 raw 해시다. 적용 시 선택한 bytes/hash를 정확히 대조한다. 운영 적용0, 자동 일괄 push0. 복원 검증은 각 SQL을 직접 순차 실행했으며 Supabase 이력 행을 인위적으로51개로 만들지 않았다.

| 적용 순서 | 파일 | SHA256 |
|---|---|---|
| 1 | `20261102080000_duel_release_controls_v1.sql` | `8254178b20458ec76987773165479b9d65e74ffa5cf461816291d4a451958afd` |
| 2 | `20261102081000_duel_legacy_recovery_v1.sql` | `fb38bc23bae9591f77255a7666900a5655148b1a6de2b595d45bb4b997a77f86` |
| 3 | `20261102082000_duel_qa_admission_v1.sql` | `64a7510ea665827800ca27dcadd7e5f2b337f62e046be17bd373c8f6ea483ef9` |
| 4 | `20261102090000_duel_search_authority_v1.sql` | `de99cb75859833b6aadefd7eb16cdfe32b2f8caf039cd4b19cf12acc82de6516` |
| 5 | `20261103090000_duel_search_release_guard_v1.sql` | `0558bafa6c4c9580a47e26f813f6cf5f78febefd0bf3c578ae3c1494d00297ea` |
| 6 | `20261103100000_duel_search_retention_v1.sql` | `4da905168d9b4058fe98af0b38309458fb59fac8dd3597713cbc1850b60c45c4` |

기반1개 설치 → 진입/검색 닫기·protocol 고정 → 복구/QA2개 설치(자동 종료/등록0) →36건/활성 검색 drain0 → 검색/guard/retention3개 → duel-search1개 → 새 프론트 순서다. 공식 CLI는 검토된 staging project에 이전 이력 파일과 이번 한 파일만 노출하여 pending=1을 확인한 뒤 파일마다 별도로 적용하는 계획이다. 자동 전체 push·repair·기존 migration 수정은 하지 않는다.

duel-search는20b50fb의 index/handler/document/singleflight 원문과 동일하다. 신규 배포 대상1개, verify_jwt=false + handler auth.getUser 필수, 기존 Edge8개 재배포0 계획이다. 파일별 hash는 [JSON](JUNGLE65-FINAL-CANDIDATE-2026-11-03.json)에 있다. 운영 Edge 배포/새 버전 생성은 아직0이다.

## 5. 실제 백업·SQL·통합 검증

DB archive3,019,987bytes / SHA256 `56ec8b3f87cdc8d4bc062a43d770a51d0539209d6671aeca41dc6734aba97dab`를 새 빈 DB OWNER postgres에 실제 복원했다. 원래77테이블 데이터/125함수/41정책/76RLS·ACL·owner/24기본권한 동일. 기반·복구·QA만 설치한 단계에서36건 동시 전체 drain=0·XP 신규0·검색 스키마 미설치를 확인하고 rollback했다. 이후 나머지3개를 적용했다. rollback 뒤86테이블 데이터 동일. 실제 동시 요청·heartbeat 경합은 별도 복사본에서만 commit했다. 운영 처리 결과로 부르지 않는다.

| 검증 | 결과 |
|---|---|
| npm test / build / diff | 765/765, fail/skip0 / PASS(기존 chunk 경고) / PASS |
| 기존 SQL | 23+157+34 PASS |
| 신규 SQL | 복구28 + QA33 PASS, 전체275 |
| 백업 실제36건 | 정상32 cancelled/XP0, 제한4 무승자 cancelled/XP·업적0, 반복 동일 |
| 복원본 실제 Auth/HTTP/Realtime/React | 14 PASS: A 생성/B 참가/host 시작, 비명단·위조 header·구형 protocol·관리 권한 거부, RLS, TTL/회수, 기존 이동/정산,50/25 XP·F5·320/390px |
| 실제 로컬 Auth/DB/Edge/React 검색 | 22 PASS: JWT, 동시8성공요청→성공1, 동일ID,429/timeout,15초,상태변조,F5,disable/recovery |
| 실제1:1·아이템·그룹 관전/결과/XP | 23 PASS |
| 실제 싱글 custom/random/daily | 9 PASS,15/0·20·25/0 XP·F5 |
| Jungle65 화면 | design69, 전체154/108화면, duel116/38화면, 모바일HUD78 PASS |

복원본 HTTP는 별도 로컬 Auth/PostgREST/Realtime를 loopback에 연결했다. 관리형 백업에 없는 로컬 _realtime 플랫폼 스키마만 보완했고 원래 서비스/사용자 로컬 스택은 교체하지 않았다. QA 원문 계정/토큰/비밀번호는 저장0이다. 외부 Wiki transport는 이 QA/게임 회귀에서 fixture이며 다음 성능 검사는 실제 Wikipedia다.

초기 검증에서 winner_user_ids NOT NULL을 발견해 신규 RPC에 빈 배열을 사용했다. 기존 paused 오류 우선순위도 보존했다. 완료 후 정상 요청 로그가 늘어도 재시도 가능하게 사전 전체 지문과 완료 정산 지문을 구분했다. 테스트 수정은 서버 소유 코스에 맞는 숫자 identity·외부 transport fixture와 실제 daily 시작/목표 선택자 보완이다. 기존 검사 삭제/skip/허용오차 확대0이다. 과거 bd87c4d 화면 baseline은 현재 승인20b50fb와 혼동하지 않고20b50fb의 보존 소스로 동일한 픽셀 비교를 다시 통과했다.

## 6. 검색 CPU·15초 재확인

정제기 소스 변경0. 기존5문서·revision·75회 조건을 유지했고 성공75/실패0, 대형 실제 Cold20/20 + hit10/10, 실제320/390px UI20/20이다. CPU hard limit0. 모든 시도와 실패 배열을 JSON에 남겼으며 성공 표본만 골라 백분위수를 산출하지 않았다. p50/p95는 전체 시도 nearest-rank다.

| 표본 | 성공/실패 | 준비·노출 p50/p95/max ms | 15초 중 최소 잔여 ms |
|---|---|---|---|
| 기존75회 조건 | 75/0 | 101 / 3,226 / 10,874 | 4,126 |
| 대형 Cold20 | 20/0 | 3,325 / 3,723 / 4,122 | 10,878 |
| 대형 hit10 | 10/0 | 107 / 124 / 124 | 14,876 |
| 실제 UI20 | 20/0 | 841 / 3,372 / 3,458 | 11,542 |

최적화 전 같은75회는68성공/7 WORKER_LIMIT였고20b50fb 및 이번 후보는 각각75/0이다 [과거 근거: SEARCH-CPU-2026-11-03.md]. 이번 대형 추가Cold20의 실제 준비 잔여 최저는10,878ms, 화면 기준 전체UI20의 최소 잔여는11,542ms다. 만료는 여전히15초이며 자동 환급/재활성화/연장0이다. 서버 Timing parse는 wall 구간이며 직접 Edge CPU 계측으로 혼동하지 않는다.

## 7. 보존·복구·운영 승인

검색 캐시의 기존 snapshot/revision·policy/hash·7일 이상 session/request·30일 생성 기준 무참조 문서 청소 정책은 변경0이다. 청소는 기존 postgres 수동 함수이며 Cron0. 신규 승인4행/완료영수증최대4행/관리 요청 감사와 QA최대2행·관리 요청 감사는 자동 삭제하지 않는다. client 요청으로 감사 데이터를 늘릴 권한은 없다. 원래 검색 재시도/활성 참조/아이템·이동·XP 원장은 보존한다.

향후 아래 항목은 모두 **운영 명시적 승인 필요**다. 이번 구현 승인을 운영 실행 승인으로 확대하지 않는다.

| 승인 대상 | 선행 조건/영향 |
|---|---|
| 6개 migration 각각 + 진입/검색 닫기·protocol 고정 | 최신45/권한·원문/hash·실제 새 백업/restore 통과, 파일1개씩 pending/이력 확인 |
| 기존32건 정상 만료 RPC | 최신 활동/roster/결과·XP 재조회. 재접속 경합 시 정상 기권승/XP 가능성을 승인 범위에 포함, 변화 시 중단 |
| 고정4건 제한 복구 RPC | 정확한 target/지문/request ID/근거 승인. 지문 변화는 재승인 없이는 실행 불가 |
| duel-search Edge1개 배포 | 모든 경기·활성 검색0, DB/ACL/disable guard 완료 |
| QA2계정 등록·경기·아이템·XP 생성 | 새 Production Ready 뒤 사용자가 직접 로그인/UI 수행, entry=false 유지·TTL·최대2, 인증정보 공유0 |
| PR8 main 병합·자동 Production1회 | 최종 SHA CI/Preview Ready, DB·Edge·완전drain 통과 |
| QA PASS 후 정상화 | QA 경기/세션0·명단 회수, required_protocol 유지, 실제 구형 탭 거부 후 entry/search 해제 |

실행 직전 백업 재생성·실제 복원과 최신 활동/함수/권한/Edge/main/배포 artifact를 다시 확인한다. DB 논리 복원 검증을 Storage 본문·Edge secrets·관리형 PITR 검증으로 부르지 않는다. 운영 복구 담당자·이전 Ready artifact·provider 복구 경로 확인이 필요하다. drain 뒤 새 정상 결과/XP가 담긴 checkpoint도 남긴다.

장애 시 entry=false + search=false + required_protocol 유지, 정상 진행/기권/결과·XP 허용을 기본으로 한다. 원장/영수증/명단 감사와 새 서버 권위 DB·Edge·프론트를 보존한다. 구형 프론트로 우회를 되살리는 rollback, 전체 DB 과거 덮어쓰기, 임의 winner/XP 조작은 하지 않는다. [실행 단계·중단 조건](JUNGLE65-DEPLOY-PROCEDURE-2026-11-03.md)을 따른다.

현재 운영 migration 적용0, 종료/복구 RPC0, QA 경기·XP0, main 병합0, Production 배포0, 진입 제한 설치/해제0이다. 실제 서비스 QA/Production GO로 선언하지 않는다. [전체 JSON·해시·실측](JUNGLE65-FINAL-CANDIDATE-2026-11-03.json).
