# random_teleport 최소 변경 기록

기준: e4fb483 + 기존 변경을 포함한 미커밋 작업 트리, 2026-10-06. commit/push/DB 적용 없음.

확정 스펙 `wiki-race-2.0-handoff/01-CONFIRMED-SPEC.md` §5.5는 이동 가능한 임의 문서·목표 직접 도착 제외·이동 +1을 명시한다. 기존 Q3 현재 링크 풀 유지 부채를 이번 사용자 요청에 따라 해결한다. ID/이름/조커·자신 대상/기존 UI 유지.

인증된 `supabase/functions/duel-random-teleport/index.ts`가 namespace 0 random → redirect canonical → 기존 wiki-snapshot의 정확한 page/revision 검증을 수행한다. 현재/목표 ID·제목과 outgoing link 없는 문서 제외. 거의 없는 링크의 수치 기준은 명세에 없어 추가하지 않았다. 최대 12회·조회 전체 20초 제한.

클라이언트는 방/지급/요청/상관 ID만 전달한다. user/title/page 입력 거부. auth.getUser()의 사용자만 서비스 전용 register RPC에 전달한다. private ticket은 page/revision·현재/목표·기대 version·grant·요청에 결합되고 2분 만료한다. 일반 클라이언트는 등록·수정·읽기 불가.

기존 use_duel_item_v3 권한/상태/쿨타임/소유 검증 → 읽기 전용 준비 응답 → trusted ticket → RPC 재호출. 최종 기존 잠금 아래에서 version/current/target 재검증 후 이동·path·move_count·version·ledger·grant·공개 신호/event를 같은 트랜잭션에 기록한다. 실패는 소비 전에 반환한다. M1 마스킹·SF-A3 경계 유지. 일반 apply_duel_move_v2의 RANDOM_TELEPORT 직접 호출은 ITEM_RPC_REQUIRED로 거절한다.

중복 요청은 기존 원장 replay. 준비된 요청은 첫 RPC도 소비할 수 있어 응답 유실은 ITEM_STATE_UNKNOWN으로 안내하고 inventory/경기를 복구한다. 확실한 조회 실패만 미소비 안내. go_back/REWIND·일반/강제 이동 코어 유지.

새 migration `20261006002015_duel_random_teleport_v1.sql`·pgTAP `duel_random_teleport_v1.sql` 작성. 기존 duel_item_authority_v3.sql 조커 테스트에는 trusted 준비 fixture 추가. historical migration 수정 없음.

관련 Node 111/111·전체 496/496·production build exit 0·diff check exit 0 — e4fb483 + 미커밋, 2026-10-06. Edge/선정 함수 mock 실행은 DB 원자성 실측이 아니다. Docker 미가동으로 pgTAP 미실행. 실제 Wikimedia/Edge/2계정 browser 미실행. SQL rollback/권한/동시성·heartbeat 중 version conflict 빈도 확인 필요.

후속 승인 후 순서: 로컬 pgTAP·2계정 smoke → 새 migration 운영 적용 승인/검증 → 새 Edge 배포 승인/검증 → 프론트 배포 승인. 이번에는 어느 적용도 실행하지 않았다. 기존 미커밋 M2/run_mode migration 자동 동반 적용 금지.

로컬 DB가 이미 실행된 환경에서만 `npx supabase test db supabase/tests/duel_random_teleport_v1.sql` 및 기존 duel_item_authority_v3.sql·duel_players_rls_v1.sql 회귀를 실행한다. 원격 연결 옵션 사용 금지.
