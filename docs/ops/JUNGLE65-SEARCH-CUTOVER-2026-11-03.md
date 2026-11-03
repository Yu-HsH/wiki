# Jungle65 검색 최적화 전환·복구 후보 — 운영 미실행

2026-11-03 KST, 기준 `96fec9b` + 이번 미커밋 후보. **운영 HOLD**. 이 문서와 SQL 예시는 실행 승인이 아니다. 운영 DB/Edge/main/Production 변경은 0이다. 사용자 제공 운영 migration45/Edge8 ACTIVE는 이번 세션의 실측으로 바꾸어 쓰지 않으며 적용 직전에 다시 조회한다.

## 전환 순서와 승인 단위

1. 적용 직전 운영 migration 원문/이력·RPC 정의/EXECUTE·RLS·직접 쓰기 권한·Edge 버전/JWT·main/Production SHA/alias·복구 artifact를 읽기 재확인한다. 검증된 백업과 복구 담당자를 확보한다. 예상과 다르면 HOLD한다.
2. **기반 게이트** `20261102080000_duel_release_controls_v1.sql`만 건별 승인 후 적용한다. 이 파일은 검색 테이블/RPC에 의존하지 않으므로 기존45개 뒤, 아직 미적용인 `20261102090000`보다 먼저 실행할 수 있다. 기본값은 기존 동작을 유지한다. 일괄 db push로 나머지 pending을 같이 적용하지 않는다.
3. 별도 승인한 서버 제어 트랜잭션으로 신규 진입과 신규 검색 활성화를 닫는다. 프론트 점검 화면은 보조 수단이다.
4. 기존 `starting` 경기를 초기화하고 기존 경기의 이동·heartbeat·기권·결과·XP를 마칠 수 있게 둔다. 아래 drain 조건을 모두 충족할 때까지 유지한다. 오래된 행을 heartbeat만 보고 제외하거나 삭제/직접 정산하지 않는다.
5. drain 후 기존 검색 후보 `20261102090000_duel_search_authority_v1.sql`, 연결 `20261103090000_duel_search_release_guard_v1.sql`, 보존 `20261103100000_duel_search_retention_v1.sql`을 각각 승인한 정확한 원문으로 적용한다. 기존45개가 변함없다면 전체49개가 예상이지만 실제 이력 대조가 우선이다. 로컬 수동 SQL 검사는 migration 이력49개를 증명하지 않는다.
6. 신규 `duel-search` Edge 한 개만 승인 후 배포한다. 정제기·single-flight 포함 번들, handler 회원 인증, private 테이블/함수 ACL, 정상/위조 JWT, 서버 성공1회,15초,오류 정책을 검증한다. 기존 Edge8개 재배포는 필요 없다.
7. 서버 진입 제한을 유지한 상태에서 승인한 PR #8의 정확한 SHA를 main으로 반영하고 Git 연동 Production 배포 한 번을 기다린다. Ready/alias/SHA와 새 프론트 RPC의 protocol 헤더를 확인한다. Preview 성공은 운영 backend 검증을 대체하지 않는다.
8. `required_protocol='search-authority-v1'`를 먼저 고정한 뒤 승인된 정상화에서 검색과 진입을 다시 연다. 새 프론트를 확인하기 전에는 열지 않는다. 구형 탭의 생성/새 참가/시작은 이후에도 거부한다. 승인된 실제 다계정/XP 스모크와 관찰이 필요하다.

```sql
-- 승인 창 전용 예시. 반드시 실제 대상 프로젝트/백업/담당자를 재확인한다.
begin;
update private.duel_release_control_v1
set entry_open=false, search_enabled=false where singleton;
commit;

-- 재개 전: 신규 프론트가 실제 배포됐는지 확인한 뒤 수행한다.
begin;
update private.duel_release_control_v1
set required_protocol='search-authority-v1' where singleton;
-- 이 트랜잭션에서는 아직 열지 않는다.
commit;

-- 별도로 승인한 정상화 단계에서만:
begin;
update private.duel_release_control_v1
set search_enabled=true,entry_open=true where singleton;
commit;
```

게이트의 `FOR SHARE`는 진입/검색 활성화 트랜잭션이 끝날 때까지 유지된다. 제어 UPDATE는 앞서 허용된 트랜잭션이 끝나기를 기다린다. 제어 트랜잭션은 방/참가자/세션을 잠그지 않는다. gate UPDATE와 drain count는 **분리된 트랜잭션**이어야 한다. 잠금 timeout/오류가 나면 닫혔다고 추정하지 않고 실제 singleton을 다시 읽는다.

## drain 조건

```sql
select entry_open,search_enabled,required_protocol
from private.duel_release_control_v1;

select count(*) as unfinished_duels
from public.game_rooms where mode='duel' and status in('starting','playing');

-- 검색 migration 이전에도 존재하는 기존 이벤트를 확인한다.
select count(*) as live_search_effects
from public.duel_item_events
where item_id='search_once' and effect_expires_at>clock_timestamp();

-- 검색 migration이 이미 존재하는 환경에서는 이 조건도 함께 확인한다.
select count(*) as live_search_sessions
from private.duel_search_sessions_v1 where expires_at>clock_timestamp();
```

게이트가 닫혔고 위의 해당 count가 모두0이어야 한다. 검색 테이블이 아직 없으면 마지막 조회를 실행하지 않으며 이벤트의 기존15초 창을 사용한다. 완료/기권 등 정상 RPC로도 처리되지 않는 오래된 `starting/playing` 행은 별도 복구 판단이 필요하다. 자동 삭제·임의 XP 보정으로0을 만들지 않는다. 닫힌 뒤 새 진입이 없는지 다시 측정하고 통과 시각을 기록한다.

## 진입 경로 감사

저장소와 격리 DB `pg_proc/proacl` 실측, 2026-11-03 KST:

|경로|서버 경계|
|---|---|
|`create_duel_room_v2(boolean)` / `create_discoverable_duel_room_v1(boolean,boolean)`|duel `game_rooms INSERT`, 이어 host 참가자 INSERT|
|`join_duel_room_v2(text)` / `join_public_room_v1(uuid)`|duel 참가자 INSERT. public wrapper는 원래 잠금/인원 검사를 유지|
|`start_duel_room_v2(uuid,text,text,text)`|waiting → starting 전환|
|`initialize_duel_player_v2(uuid,text,text,text)`|이미 starting인 경기의 참가자 UPDATE·starting→playing. drain 중 계속 허용|
|직접 쓰기·향후 wrapper|테이블 INSERT, mode→duel 변경, room_id 변경, waiting→starting/playing 트리거로 검사|
|그룹 wrapper/싱글|duel 조건에 해당하지 않아 기존 동작 유지|

legacy `create_duel_room_v2`가 여전히 authenticated/service_role EXECUTE인 점을 확인했다. wrapper만 막으면 우회 경로가 남는다. 직접 game_rooms/room_players INSERT/UPDATE/DELETE는 기존 cutover migration에서 anon/authenticated에 revoke됐다. 현재 public 함수 목록은 격리 DB 감사 산출물이며 운영에서 추가된 함수·grant는 적용 직전 별도 대조한다.

protocol 헤더는 호환성 표식이다. 인증/회원 권한을 대신하지 않고 악의적 클라이언트의 암호학적 증명도 아니다. 새 브라우저는 PostgREST RPC에만 헤더를 보낸다. Auth/Edge/Wikipedia 헤더·CORS 계약은 변경하지 않는다. 헤더 없는 구형 탭은 `DUEL_CLIENT_RELOAD_REQUIRED`로 새 경기 진입을 거부한다. 이미 가진 HTML을 로컬에서 계산하는 행위 자체를 막는 기능이라고 주장하지 않는다.

## 검색만 안전하게 닫는 복구

```sql
-- 건별 승인한 복구 단계 전용. 다른 아이템과 경기 정산은 유지한다.
begin;
update private.duel_release_control_v1 set search_enabled=false where singleton;
commit;
```

기반 게이트가 신규 `search_once` 활성화를 슬롯/이벤트/쿨타임 변경 전에 거부한다. 검색 guard 연결 후에는 기존 세션 prepare/commit도 `SEARCH_DISABLED`로 닫힌다. 원장과 이미 소비된 슬롯은 보존한다. 진행 중이던 요청은 제어 UPDATE의 잠금 경계 전에 마칠 수 있으므로, UPDATE 성공 뒤 세션/이벤트와 응답을 다시 확인한다.

권장 복구는 서버 권위 프론트·DB·Edge를 유지한 채 검색만 닫거나 전체 새 진입을 닫고 수정 후보를 검증하는 것이다. 구형 프론트 alias 복구는 검색 우회를 되살리므로 정상 rollback으로 간주하지 않는다. 보안 프론트 Ready artifact가 없는 첫 전환에서 구형 프론트로 돌아가야 한다면 **검색 중지 + 모든 기존 경기/검색 drain + 새 진입 제한**을 유지하고 별도 위험 승인 없이 정상화하지 않는다.

복구 후 `search_enabled=true`만 바꾸어도 기존 소비·request 기록·기존 expires_at은 그대로다. 만료된 아이템 재활성화/자동 환급/15초 연장/임의 슬롯 지급은 없다. 새 성공을 만들지 않는 동일 ID 재시도와 한 번 소비는 SQL 및 실제 Auth/DB/Edge 검사에서 확인했다.

## 보존·청소·버전

- snapshot은 기존 page/revision 유일성을 따른다. 한 snapshot의 HTML/hash/textNodes는 재사용하며 참가자/방마다 복제하지 않는다.
- 같은 worker 안의 동일 policy/page/revision Cold 작업은 pending promise 하나를 공유한다. 각 사용자마다 put RPC에서 소유권·문서·만료를 다시 검사한다. pending 상한4, 실패/완료 시 즉시 해제다. 서로 다른 isolate 사이의 계산 중복을 막는 distributed lease는 **미구현**이며 별도 설계 대상으로 남긴다.
- 현재 policy는 `search-html-v1`을 그대로 유지한다. canonical 출력이 동일하므로 무효화할 이유가 없다. 미래 policy 변경은 hash prefix와 DB CHECK/읽기/쓰기를 함께 바꾸는 별도 forward migration과 drain이 필요하다. 살아 있는 세션이 참조한 문서·동일 ID 응답을 덮어쓰거나 먼저 삭제하지 않는다.
- `private.prune_duel_search_v1(batch)`는 **postgres 전용 수동 함수**다. 자동 Cron은 설치하지 않았다. sessions/requests는 기존 절대 만료 후7일 이상, 경기 finished 조건까지 보존한다. requests는 부모 세션과 함께 cascade한다. 영구 item/move/XP 이벤트는 삭제하지 않는다.
- documents는 생성 후30일 초과이고 어떤 세션 참조도 없을 때만 청소한다. 최근 접근일 TTL이라고 부르지 않는다. snapshot 행을 잠근 뒤 별도 SQL statement에서 참조를 다시 확인하며 새 activation의 FK 잠금과 직렬화한다. 다른 작업의 잠긴 snapshot은 SKIP LOCKED로 넘긴다. 중단한 경기의 참조 문서는 보존되므로 용량이 증가할 수 있다.
- 기본 batch100/상한1000, expiry/snapshot/created_at 인덱스3개다. 하루1회 점검·필요 시 여러 batch 수동 실행을 운영 제안으로 남긴다. Cron/보존 기간 자동 변경은 이번에 실행하지 않았다.
- 실제5문서의 논리 HTML+manifest 평균591,629bytes로 unique revision1,000개는 약591.6MB다. 가장 큰 표본만1,000개는 약1,332.3MB다. 전체 증가식은 `unique revision × 평균문서크기 + 7일이상 세션수 × (세션크기 + 세션당 요청수 × 요청크기) + 인덱스/TOAST/WAL/백업`이다. 미발견 요청도 저장하므로 성공1회만으로 요청 수가1개가 되지는 않는다. 별도 서버 rate limit은 추가하지 않았다. 최대 길이 검색어·요청 빈도에 따라 증가하므로 운영 실측이 필요하다.

## 검색 준비 실패 정책 결정

현재 정책을 유지하며 안내만 구체화했다. 활성화 뒤 준비가 실패하면 슬롯은 이미 사용되었고 성공 예산은 미소비, deadline은 원래15초다. 실패한 요청의 실사용 시간은0이다. 위키 timeout 주입 약12초에서도 deadline을 늘리지 않았다.

|대안|검토 결과 / 이번 구현|
|---|---|
|경기 시작 전 전체 prewarm|시작을 지연하거나 외부 API·CPU를 낭비할 수 있다. 이번에 시작/링크 이동의 선행 조건으로 넣지 않았다|
|입장 후 비동기 prewarm|장기 대안. 소유권·현재 snapshot 확인, 제한된 worker queue, 취소·이동·lease·용량 정책을 별도 설계해야 한다. 미구현|
|크기 기반 준비 가능 검사|기존 raw8MB/정제4MB 제한은 유지. 바이트 크기만으로 CPU를 보장할 수 없고, 새로 대형 문서를 일괄 금지하지 않았다|
|준비 불가 fail-closed|구현 유지 및 UI 안내 보완. 서버 승인 없는 로컬 fallback 없음. 재활성화/환급/시간 연장 없음|

대형20 Cold 성공과 UI 실사용 시간이 이번 최적화의 근거다. prewarm을 했다는 주장으로 Cold 실패를 감추지 않는다. 호스팅 환경의 CPU/지연·용량 관찰 및 운영 승인·최신 상태 대조가 남아 있으므로 Production은 HOLD다.
