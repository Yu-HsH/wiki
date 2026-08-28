# Wiki Race 2.0 서버 권위 구현 및 배포 절차

> #### ⚠ 봉인 — 이 문서의 **배포 절차는 대체됐다** (2026-08-29 봉인)
>
> **구현 범위·설계 서술은 유효하다. 아래 "적용 순서"의 Release A~D 절차만 대체됐다.**
> 본문은 보존한다 — 어떤 절차가 왜 검토됐는지가 기록으로서 의미가 있다.
>
> | 항목 | 이 문서 | 실제 |
> |---|---|---|
> | 배포 분할 | `Release A`(additive schema/RPC) → `B`(Edge Functions) → `C`(V2 프론트) → `D`(최종 breaking cutover) 4단계 | **U2 결정(2026-08-21)으로 대체.** 미적용 **11개를 한 창에서 순서대로 전량 적용**한다 |
> | 실제 절차 문서 | — | **`docs/ops/CUTOVER-PLAN.md`의 W0~W11.** A~D ↔ W단계 대체 매핑은 그 문서 **§10** |
> | 실행 여부 | "아래 명령은 실제 배포 시 사용할 절차이며, **현재 작업에서는 실행하지 않는다**" | **2026-08-27~28에 W0~W9가 실행됐다.** W10(유지보수 게이트 해제)만 미수행. 기록: **`docs/ops/CUTOVER-LOG-2026-08-27.md`** |
> | linked 명령 금지 | "linked/remote 대상 명령은 승인된 운영 release에서만 실행" | **규칙은 유효하다.** `AGENTS.md` §1이 건별 승인으로 유지한다. 창의 승인은 그 창에서 끝났다 — 다음 적용은 새 승인이 필요하다 |
>
> **이 문서에 없는 실행 제약 2건이 CUTOVER-PLAN에서 추가됐다** (§10, F12·F13):
> `functions deploy`에 **`--prune`을 쓰지 않는다**(로컬 소스가 없는 `target-level`을 삭제한다),
> **함수 이름을 반드시 명시한다**(생략하면 `username-lookup`·`username-signup`까지 덮어쓴다).
> 아래 본문의 `functions deploy` 명령을 그대로 복사해 쓰지 말고 CUTOVER-PLAN §3.2 W8을 본다.
>
> **판정의 현재 값은 `docs/agent/CURRENT.md` §1에서 읽는다.**

## 구현 범위

이번 변경은 게임 결과를 브라우저가 직접 확정하지 않도록 다음 경계를 추가한다.

- 위키 문서의 `page_id`와 `revision_id`를 저장하고, 해당 revision의 링크 스냅샷을 서버 캐시에 보관한다.
- 단일 게임·그룹 게임·듀얼의 이동, 이동 횟수, 경로, 승패, XP, 기록 저장을 RPC 또는 Edge Function에서 처리한다.
- `expected_version`과 `request_id`로 중복 요청과 오래된 Realtime 이벤트를 방어한다.
- F5와 재접속은 진행 중 이탈로 처리하지 않는다. 브라우저 뒤로가기, 로비 이동, 포기 버튼은 확인 후 명시적 leave RPC를 호출한다.
- 듀얼 재접속 유예 시간은 60초이며, 서버가 공통 시작 문서와 현재 상태를 선택·복원한다.

기존 migration 파일은 수정하지 않았다. 아래 5개 migration은 기존 스키마에 순서대로 적용된다.

1. `20260814090000_server_authority_v2.sql`: canonical snapshot, move event, version/idempotency 기반 컬럼과 RLS
2. `20260814091000_server_authority_rpc_v2.sql`: 단일·그룹 서버 RPC와 듀얼 lifecycle RPC
3. `20260814092000_duel_authority_v2.sql`: 듀얼 방 생성·입장·이동·heartbeat·leave·finalize RPC
4. `20260814093000_server_authority_cutover_v2.sql`: 클라이언트의 핵심 테이블 직접 insert/update/delete 차단과 legacy 그룹 mutation RPC의 최종 breaking cutover
5. `20260814094000_duel_item_authority_v2.sql`: 기존 듀얼 문서 교환 아이템 계약을 보존한 `SWAP_DISABLED` RPC

SWAP은 `SWAP` event type과 `apply_duel_swap_v2` signature를 호환 목적으로 보존하지만,
서버 inventory·소비 원장·쿨타임이 구현되기 전까지 `SWAP_DISABLED`로 비활성화한다.

## Legacy 그룹 mutation RPC 최종 breaking cutover

`20260814093000_server_authority_cutover_v2.sql`은 additive patch가 아니라, 모든 지원 클라이언트가 V2로 전환된 뒤 적용하는 의도적인 최종 breaking cutover다. 다음 두 legacy RPC signature를 삭제한다.

```text
update_group_progress(uuid, text, integer, text[], integer)
finish_group_player(uuid, integer, integer, text, text[])
```

두 RPC의 V2 대체 경로는 `apply_group_move_v2`다. cutover 전에 모든 프론트엔드가 이 V2 RPC와 서버가 확정한 completion lifecycle을 사용해야 한다. cutover 이후 구버전 프론트엔드는 지원하지 않는다.

복구가 필요해도 기존 migration을 수정하거나 authenticated의 직접 쓰기 권한을 다시 열지 않는다. 영향 범위와 회수 계획을 포함한 별도 forward-only 보정 migration을 새로 추가해 복구한다.

## 적용 순서

현재 작업 트리의 5개 migration은 하나의 미커밋 작업으로 보존한다. 다만 Supabase CLI의 migration 명령은 특정 파일 하나만 선택하지 않고 pending migration을 순서대로 적용하므로, 운영 배포에서는 아래 release commit과 승인 gate를 분리해 pending 파일 집합을 통제한다. 아래 명령은 실제 배포 시 사용할 절차이며, 현재 작업에서는 실행하지 않는다.

```powershell
supabase --version                         # 2.111.0 확인
supabase login --no-browser                # access token 입력은 CI secret/session으로 처리
supabase link --project-ref <PROJECT_REF>
```

### Release A — additive schema/RPC

`20260814090000`, `20260814091000`, `20260814092000`만 들어 있는 release commit/artifact를 만든 뒤, schema/RPC 사전 검증과 승인 후 다음을 실행한다.

```powershell
supabase db push --linked --yes
```

이 명령은 해당 release artifact에 남아 있는 모든 pending migration을 적용한다. `93000` 또는 `94000`이 같은 artifact에 있으면 함께 적용되므로, cutover 승인 전에는 두 파일을 pending 집합에 포함하지 않는다.

### Release B — Edge Functions

Release A의 DB 적용 성공을 확인한 뒤 별도 Edge Function release와 승인 gate를 통과한다. `single-run`은 게스트가 높은 엔트로피 토큰을 요청 본문으로 전달하므로 `supabase/config.toml`에서 JWT 검증을 끄고, 함수 내부에서 토큰을 SHA-256 해시하여 검증한다. 토큰 원문은 데이터베이스나 이벤트 metadata에 저장하지 않는다. `wiki-snapshot`은 기본 JWT 검증을 유지한다.

```powershell
supabase functions deploy single-run
supabase functions deploy wiki-snapshot
```

### Release C — V2 frontend

Edge Function 성공 경로와 오류 경로를 확인한 뒤 별도 프론트 release를 승인한다. 인증 단일 게임, 게스트 단일 게임, 그룹, 듀얼의 모든 mutation 호출이 V2 RPC/Edge Function을 사용하고 legacy RPC 호출이 남지 않았는지 확인한다. 이 단계가 완료되기 전에는 Release D를 승인하지 않는다.

### Release D — 최종 breaking cutover

모든 지원 프론트의 V2 전환, 구버전 세션 drain, 실제 두 브라우저 smoke test를 승인한 뒤 `93000`을 포함한 cutover release를 적용한다. `93000`은 직접 write 차단과 함께 두 legacy RPC를 삭제한다. `94000`은 별도 SWAP 승인 gate를 거쳐 `SWAP_DISABLED` 정책을 적용한다.

`93000`과 `94000`을 하나의 release artifact에 넣으면 다음 한 번의 명령으로 두 pending migration이 순서대로 함께 적용된다. 두 migration을 별도 승인으로 나누려면 각각을 별도 release commit/artifact로 만들고, 각 artifact에 해당 migration만 pending으로 남긴 뒤 같은 명령을 순차 실행한다.

```powershell
# 93000 release artifact 승인 후
supabase db push --linked --yes

# 94000 release artifact와 SWAP_DISABLED 승인 후
supabase db push --linked --yes
```

운영 배포 전 `supabase db push --dry-run --linked`로 해당 artifact의 pending 목록을 확인할 수 있다. linked/remote 대상 명령은 승인된 운영 release에서만 실행하며, 현재 로컬 작업에서는 실행하지 않는다.

배포 후 브라우저에서 다음 흐름을 확인한다.

1. 인증 사용자와 게스트가 각각 단일 게임을 시작한다.
2. 정상 링크 이동, Undo, F5 복구, 포기 확인을 각각 실행한다.
3. 그룹 방에서 모든 참가자가 canonical 목표를 선택하고 준비한 뒤 시작한다.
4. 듀얼에서 양쪽 목표를 정하고 시작 문서가 양쪽에 동일하게 보이는지 확인한다.
5. 이동 중 한 클라이언트의 네트워크를 잠시 끊고 60초 이내 재접속한다.
6. 두 브라우저에서 같은 `request_id`를 재전송해도 이동 횟수와 기록이 한 번만 증가하는지 확인한다.

## 로컬 검증

Supabase CLI 2.111.0의 실제 help에 있는 flag만 사용한다. 로컬 DB를 초기화하지 않는 검사는 다음과 같다.

```powershell
supabase --version
supabase db diff --local --schema public
supabase db lint --local --schema public --level warning --fail-on error
supabase db advisors --local --type security --level warn --fail-on error
supabase functions serve --no-verify-jwt
npm test
npm run build
```

`supabase db reset --local --no-seed --yes`는 `C:\Project\wiki`의 로컬 DB 전체를 재생성하는 파괴적 명령이다. 운영/linked DB에는 사용하지 않으며, 로컬 데이터 삭제를 확인한 뒤에만 실행한다.

## 장애 시 확인 지점

- `RUN_VERSION_CONFLICT`, `STALE_REALTIME_EVENT`: 클라이언트가 최신 서버 상태를 다시 조회해야 한다.
- `REQUEST_ID_REPLAY`: 같은 요청의 기존 결과를 재사용하는 정상적인 멱등 처리일 수 있다.
- `SNAPSHOT_NOT_FOUND`, `DUEL_START_SNAPSHOT_REQUIRED`: `wiki-snapshot` 배포와 서비스 역할 키, 대상 문서 snapshot 생성 여부를 확인한다.
- `TARGET_IDENTITY_REQUIRED`: 제목만 전달하는 구버전 클라이언트가 남아 있는지 확인한다.
- `GAME_ALREADY_FINALIZED`: 결과 확정 이후의 재요청이며, 클라이언트가 서버 결과를 다시 표시해야 한다.

운영 모니터링에서는 `game_move_events`, `game_mutation_requests`, `match_history.result_status`, `game_records.run_id`를 함께 조회한다. 최종 결과가 서버 event와 기록에 한 번씩만 존재하는지가 핵심 불변식이다.

## 롤백 주의사항

migration은 append-only로 관리한다. 기존 migration을 되돌려 수정하거나 `git reset --hard`로 작업 트리를 복구하지 않는다. cutover migration이 적용된 뒤에는 구버전 프론트가 직접 테이블에 쓰지 못하므로, 장애 시에는 먼저 서버 RPC를 사용하는 호환 프론트를 배포하고 원인을 확인한다. 권한을 임시로 다시 여는 emergency migration이 필요하다면 영향 테이블·기간·회수 migration을 별도 리뷰 후 추가한다.
