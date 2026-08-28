# Wiki Race 2.0 코드 작업 마스터 TODO

기준 문서: `../01-CONFIRMED-SPEC.md`  
원칙: 저장소 감사 후 기능별 채팅에서 순차 구현

## 1. 코드 상태 — **2026-08-14 시점 기록 (봉인)**

> #### ⚠ 이 절은 현재 상태가 아니다 (2026-08-29 봉인)
>
> **아래는 2026-08-14 조사 시점의 관찰이다. 본문은 보존한다.** 절 끝의 "이 목록은 인수인계
> 정보이지 현재 저장소의 사실을 대신하지 않는다"가 원래 있었지만 **본문 아래에 있어 먼저 읽히지
> 않았다.** 그래서 머리로 옮긴다.
>
> **특히 낡은 3건:**
>
> | 본문 | 실제 |
> |---|---|
> | "upstream은 설정되어 있지 않으며 working tree에는 서버 권위 V2 원자적 작업이 **미커밋 상태**로 남아 있다" | upstream은 `origin/feat/group-final-gaps`로 **설정돼 있고**, V2·Packet 13은 **커밋됐다**(`450f63a`·`339fb77`). `origin/main`까지 올라갔다(2026-08-28 W1·W1-a) |
> | "위 커밋은 현재 브랜치 HEAD에 포함됐지만 **원격 포함 여부는 확인되지 않았다**" | `origin/main`·`origin/feat/group-final-gaps` 양쪽에 포함 (`ls-remote` 실측) |
> | "**Supabase CLI가 없어** SQL lint, 로컬 DB 적용, RPC/RLS 실제 호출과 다중 세션 수동 검증은 아직 완료되지 않았다" | CLI `2.114.0` 고정 사용 중. 로컬 pgTAP·concurrency 게이트 통과, **운영 적용까지 완료**(2026-08-28 W6·W7) |
>
> 현재 상태의 단일 기준은 **`docs/agent/CURRENT.md`**, 작업 순서는 이 문서 **§2**(날짜 있는 표)다.

- 2026-08-14 확인 브랜치: `chore/local-supabase-validation`
- 확인 HEAD: `37adc698c40356ec61af0faf0aff84eb6fadf90b` (`feat: secure group mode database writes`)
- upstream은 설정되어 있지 않으며 working tree에는 서버 권위 V2 원자적 작업이 미커밋 상태로 남아 있다.
- 그룹 DB/RPC/RLS 안정화 완료 보고 커밋: `37adc698c40356ec61af0faf0aff84eb6fadf90b`
- 위 커밋은 현재 브랜치 HEAD에 포함됐지만 원격 포함 여부는 확인되지 않았다.
- 그룹 direct write 제거, history/stats 서버화, 방장 승계, 모드별 RLS, authenticated 직접 DB 공격 차단 검증이 완료됐다고 보고됐다.
- 그룹 4등 정상 완주, grace/RETIRE, F5/Realtime, history/profile/ranking, 1:1 회귀 검증이 완료됐다고 보고됐다.
- 기존 링크 안정화: plcontinue 전체 수집, redirect/canonical 통일, HTML/API 교집합, 빠른 링크 고정, 중복 이동 방지.
- 서버 권위 V2 작업에는 canonical page/revision snapshot, 싱글·그룹·듀얼 이동 RPC, expected version/request ID, 명시적 이탈, F5/재접속, 직접 write cutover가 추가됐다.
- 자동 검증은 기준 문서 작성 당시 `npm test` 108개와 Vite 무출력 빌드가 통과했다.
- Supabase CLI가 없어 SQL lint, 로컬 DB 적용, RPC/RLS 실제 호출과 다중 세션 수동 검증은 아직 완료되지 않았다.
- 프로필은 `profile_image_url` 단일 이미지와 `profile_image_snapshot`을 사용하며, 4부위·cosmetic inventory/equipped 구조는 로컬 코드와 schema에 없다.
- `ProfilePage.jsx`의 사용자 이미지 업로드는 확정된 시스템 아이콘 정책과 불일치하며 프로필 기능 단계에서 교체한다.

이 목록은 인수인계 정보이지 현재 저장소의 사실을 대신하지 않는다. 첫 작업에서 다시 검증한다.

## 2. 작업 순서

> **최종 갱신: 2026-08-29 · 기준 커밋 `29a21d0` · 브랜치 `feat/group-final-gaps`**
>
> **이 표는 날짜가 붙은 현재 상태표다.** 갱신 없이 두면 낡은 값이 현재 사실처럼 읽힌다 —
> 실제로 2026-08-28 cutover 창까지 순서 1이 `[~] DB 런타임 검증 필요`, 순서 2가 `[ ]`로 남아
> 있었고 둘 다 사실이 아니었다. **표를 바꿀 때 위 세 값(날짜·커밋·브랜치)을 함께 바꾼다**
> (`AGENTS.md` §6). 상태 판정의 단일 기준은 `docs/agent/CURRENT.md`다.

| 순서 | 기능 묶음 | 파일 | 선행 조건 | 상태 |
|---:|---|---|---|---|
| 0 | 저장소 감사·차이 분석 | `11-REPOSITORY-AUDIT.md` | 없음 | `[x]` 저장소·프로필 감사 완료 |
| 1 | 서버 권위·복구·명시적 이탈 | `12-SERVER-AUTHORITY-RECOVERY.md`, `18-SERVER-AUTHORITY-V2-IMPLEMENTATION.md` | 감사 완료 | **`[x]`** 코드·JS 검증 완료. **DB 런타임 검증 완료 — 2026-08-28 W6로 운영 적용, W7 전항목 통과** (함수 36 / legacy RPC 0 / 이력 12행). 근거: `docs/ops/CUTOVER-LOG-2026-08-27.md` §W6·§W7 |
| 2 | 그룹 최종 차이 | `13-GROUP-FINAL-GAPS.md` | 1 또는 영향 분석 | **`[x]`** 코드 완료·커밋 `339fb77`(2026-08-20), **운영 적용 완료 2026-08-28 W6.** Packet 13 제약 2개 `convalidated = true` 확인 (W7). **단 W9에서 그룹 경로 결함 4건이 남았다** — `docs/agent/CURRENT.md` §5.5 |
| 3 | 1:1·아이템전 | `14-DUEL-ITEMS.md` | 서버 이벤트 계약 | `[ ]` |
| 4 | XP·레벨·랭킹 | `15-XP-LEVEL-RANKING.md` | 결과 서버 권위 | `[ ]` |
| 5 | 업적·보상 카탈로그·프로필 꾸미기 데이터 | `16-ACHIEVEMENTS-REWARDS.md` | 3·4 이벤트 계약 | `[ ]` |
| 6 | 탐험·프로필 카드·게스트 | `17-EXPLORATION-PROFILE-GUEST.md` | 4·5 | `[ ]` |
| 7 | 확정 디자인 통합 | 별도 디자인 결과물 | 디자인 승인 | `[~]` 디자인 작업 별도 진행 중 |
| 8 | 통합 QA | `../qa/30-INTEGRATION-CHECKLIST.md` | 1~7 | `[~]` §21까지 기록됨. **§21에 2026-08-29 봉인 헤더로 창 결과를 반영했다. 새 게이트 기록(§22)은 미작성** — `docs/agent/CURRENT.md` §5.6-8 |

> **순서 1·2가 `[x]`가 됐다고 사용자-facing 릴리스가 열린 것은 아니다.**
> `RELEASE HOLD`는 유지되며 사유는 **W9 미해결 4건**이다. 유지보수 게이트가 켜진 채이고
> W10(게이트 해제)은 수행되지 않았다. 판정의 현재 값은 `docs/agent/CURRENT.md` §1에서 읽는다 —
> **이 파일 §9.8의 판정줄은 2026-08-18 시점 기록이다.**

## 3. 우선순위 원칙

1. 서버 판정과 상태 복구를 UI보다 먼저 안정화한다.
2. 기존 그룹 안정화 코드는 최소 수정하고, 20분 변경 등 확정 차이만 반영한다.
3. XP·업적은 클라이언트 계산이 아니라 확정 결과 이벤트를 소비한다.
4. 디자인이 확정되기 전에는 대규모 CSS 재작성과 화면 구조 교체를 하지 않는다.
5. 기능 구현 중 임시 UI가 필요하면 의미가 분명한 최소 UI만 추가한다.
6. 프로필·업적 단계 전에는 현재 서버 권위 V2 변경을 삭제하거나 처음부터 재작성하지 않는다.
7. 운영 DB migration/RPC 적용은 별도 명시적 승인 없이는 수행하지 않는다.

## 4. 공통 데이터·서비스 TODO

- [ ] 게임 모드·결과·종료 사유 enum을 한 곳에서 정의
- [ ] `FINISHED`, `FORFEIT`, `RETIRE`, `CANCELLED` 의미 통일
- [ ] canonical 문서 ID와 표시 제목 분리
- [ ] 이동 이벤트에 정상·강제·되돌리기·텔레포트·교환·되감기 구분 저장
- [ ] 서버 시간 기반 시작·마감·지속 효과 종료 시각 사용
- [ ] 결과 확정 idempotency key 또는 동일 효력 장치 확인
- [ ] XP 규칙을 설정/테이블/카탈로그로 분리
- [ ] 아이템 정의와 수치를 카탈로그로 분리
- [ ] 업적 정의·조건·보상·활성 상태 분리
- [ ] 보상 카탈로그·안정적인 reward bundle ID·보유 inventory·장착 상태 분리
- [ ] 프로필 아이콘·칭호·배지 최대 3개·프레임·배경·경로/완주 효과·관전 이모티콘 장착 계약
- [ ] 보유하지 않은 꾸미기 장착을 서버에서 거부하고 장착 결과를 서버 확정 상태로 저장
- [ ] `profile_image_url`과 기존 4부위 값이 발견될 경우 legacy fallback으로 보존
- [ ] `onboarding_full_avatar`의 운영 사용 여부 확인 후 `onboarding_profile_complete` 추가/안전 변경 결정
- [ ] 모든 신규 테이블과 RPC의 RLS·권한·직접 write 공격 테스트
- [ ] 마이그레이션 순서와 롤백/복구 전략 기록

## 5. 공통 프론트엔드 TODO

- [ ] 로딩·카운트다운·진행·연결 끊김·복구·완주·관전·결과 상태를 명시적 state로 관리
- [ ] F5 복구와 명시적 게임 나가기를 별도 이벤트로 처리
- [ ] 서버 종료 시각으로 타이머 렌더링
- [ ] stale Realtime 이벤트 무시
- [ ] 모바일 44px 터치 대상과 16px 본문 확인
- [ ] 키보드 포커스·모달 focus trap·Escape 처리
- [ ] `prefers-reduced-motion` 대응
- [ ] 색상 외 텍스트·아이콘으로 연결/순위/효과 상태 표시
- [ ] 시스템 제공 프로필 이미지 4~6종과 로딩 실패 기본 이미지
- [ ] 프로필·랭킹·그룹 참가자·결과에서 동일한 프로필 카드 표시 계약 사용
- [ ] 사용자 이미지 업로드와 복잡한 4부위/프리셋 편집 UI 제거

## 6. 공통 테스트 TODO

- [ ] DB 단위/RPC 테스트
- [ ] RLS authenticated 공격 테스트
- [ ] JS/TS 단위 테스트
- [ ] 빌드와 lint
- [ ] 2브라우저 또는 2세션 1:1 수동 검증
- [ ] 4인 이상 그룹 lifecycle 수동 검증
- [ ] F5·네트워크 끊김·복귀·명시적 나가기 검증
- [ ] 동일 요청 중복·지연·역순 이벤트 검증
- [ ] PC·모바일 반응형과 키보드 검증
- [ ] 프로필 장착 저장·F5·재로그인·legacy fallback·guest 차단 검증
- [ ] 경기 아이템 inventory 회귀 검증

## 7. 기능 완료 보고 형식

```md
## 작업 결과
- 기준 브랜치/커밋:
- 구현 범위:
- 변경 파일:
- DB 마이그레이션/RPC:
- 테스트:
- 수동 검증:
- 명세와 달리 판단한 부분:
- 남은 위험/TODO:
```

## 8. 하지 말아야 할 작업

- 그룹 아이템 추가
- 확정 규칙을 코드 편의 때문에 변경
- 기존 안정화 마이그레이션을 이유 없이 합치거나 재작성
- 클라이언트가 보낸 순위·XP·업적을 그대로 신뢰
- 관련 없는 리팩터링과 대규모 파일 이동
- 사용자 변경 파일 되돌리기
- 디자인 승인 전에 전 화면 CSS 교체
- 상점·재화·신고·시즌제 구현
- 머리·얼굴·의상·손 4부위 조합형 아바타나 아바타 프리셋 구현
- 사용자 프로필 이미지 업로드 추가 또는 유지
- 불확실한 운영 보상·장착 데이터를 삭제하거나 기존 업적 ID 조건을 덮어쓰기

## 9. 2026-08-14 Packet 13 구현 상태

- 기준 브랜치: `feat/group-final-gaps`
- 서버 권위 V2 기준 커밋: `450f63a` (`feat: complete server authority v2 cutover`)
- Packet 13은 아직 commit/push하지 않은 작업 트리 변경이다.
- 구현 완료: 그룹 3~8명·무아이템·20분 hard deadline·3등 이후 2분 grace의 `min` 규칙, 전원 resolved 즉시 종료, 경기 전/중/완주 후 방장 승계, RETIRE/late finish/DNF 처리, preset 관전 이모티콘·3초 서버 제한·사용자별/전체 음소거, canonical Wikipedia page/revision 기반 읽기 전용 관전.
- 자동 검증 완료: `npm test` 118개 통과, `npm run build` 성공, 변경 파일 whitespace 검사 통과.
- SQL 계약 검증 추가: `supabase/tests/group_final_gaps_v13.sql`.
- 확인 불가: 이 환경에 Supabase CLI·psql·sqlfluff가 없고 Docker 로컬 DB도 접근할 수 없어 migration 적용, pgTAP/RPC/RLS 실제 호출, Realtime cloud smoke, 2~8세션 브라우저 검증은 아직 실행하지 못했다.
- 릴리스 판정: 기능 코드와 정적/JS 검증은 완료했지만 DB 런타임 게이트가 남아 Packet 13 전체는 `부분 완료/출시 보류` 상태다.

### 9.1 2026-08-14 Packet 13 Hardening 후속 상태

- 기존 Packet 13 migration은 보존하고 `supabase/migrations/20260814113000_group_final_gaps_v13_hardening.sql`을 additive 후속 migration으로 추가했다.
- 빈 `finished` 방에서 활성 구성원이 없으면 `host_user_id`를 NULL로 정리하고, 구성원이 남아 있으면 `created_at ASC, id ASC`의 단일 후보와 `room_players.role='host'`를 원자적으로 일치시킨다. 결과·전적 row는 삭제하지 않는다.
- spectator emoji RPC는 row lock → group mode → 참가자/완주 관전자 → hard/grace 중 빠른 deadline → authoritative finalizer → 최신 상태 확인 → preset/rate/event 순서를 강제한다.
- `finalize_group_room_if_expired`는 room row를 잠근 직후 `mode='group'`을 확인하고, duel 호출은 `NOT_A_GROUP`으로 거부한다.
- local Docker DB에 raw `psql`로 후속 migration을 적용했다. Supabase migration runner 이력은 조작하지 않았고 운영 DB·Edge Function에는 적용하지 않았다.
- 마지막 spectator emoji atomicity 결함은 `supabase/migrations/20260814123000_group_spectator_emoji_atomicity_fix.sql`에서 동일 RPC signature의 반환을 JSONB로 명시적으로 교체해 해결했다. 만료 요청은 `accepted=false` 구조화 결과로 반환되며 finalization을 commit한다.
- 검증 완료: Packet 13 pgTAP 33개, Server Authority V2 97개, Phase 2C 49개, host/emoji/grace/third-finish 동시성 harness, 동일 `request_id` 재시도 harness, duel mode boundary.
- 추가 검증 완료: hard/grace 단독 만료 emoji 22개 pgTAP, 단독·동시 만료 emoji harness, 정상 preset 응답 정규화. `game_rooms.host_user_id` 전용 index는 실제 catalog·조회 경로에서 근거가 없어 추가하지 않고 운영 EXPLAIN 점검 항목으로 남겼다.
- 최신 Node 검증은 `npm test` 119/119 통과와 production build 성공으로 확인했다. clean migration runner, 실제 2~8세션 Realtime/브라우저, Wikipedia 429 없는 snapshot, 운영 dry-run, Release A~D 승인은 계속 release gate다.

### 9.2 2026-08-14 Packet 13 Crash Diagnostic

- 로컬 PostgreSQL 로그에서 `2026-08-14 13:23:17.560 UTC` anon/auth-check 호출과 `13:27:03.581 UTC` 정상 direct `SELECT`가 각각 signal 11로 backend를 종료시킨 사실을 확인했다. 이후 diagnostic에서도 `14:04:09.593 UTC` anon target RPC, `14:05:35.710 UTC` 동일 ACL의 rollback `RETURNS jsonb` guard, `14:06:29.472 UTC` commit 후 새 연결의 `RETURNS jsonb` guard가 재현됐다.
- 최소 단계 bisection은 room/player lock, preset, rate ledger, `room_events` insert, `RETURNING * INTO`, `to_jsonb(v_event)`, JSONB envelope, rate upsert, 최종 JSONB 반환까지 full/minimal fixture 모두 통과했다. 따라서 Packet 13 함수 body, composite 변환, room_events trigger/FK/RLS는 최소 crash 지점으로 확인되지 않았다.
- 더 작은 재현은 room/fixture 없이도 EXECUTE 권한이 없는 `RETURNS jsonb` 함수를 `anon` role이 direct psql로 호출할 때 발생했다. 현재 증거상 원인은 SQL 함수 계약이 아니라 로컬 Supabase/PostgreSQL 17.6 runtime 또는 preload extension/catalog privilege 경로의 backend crash이며, core/backtrace가 없어 내부 원인은 미확정이다.
- 환경은 `public.ecr.aws/supabase/postgres:17.6.1.104`, PostgREST `v14.5`, Windows host/Alpine 3.23.3 WSL2 container, direct PostgreSQL 5432(호스트 54322), pooler disabled, `@supabase/supabase-js`/PostgREST 및 psql이다. 컨테이너 restart는 없었지만 server process와 다른 세션은 매 crash마다 recovery로 종료됐다.
- authenticated direct, service_role, 새 연결, prepared/unprepared, 장기 연결, transaction 밖 `DISCARD PLANS`, full/minimal accepted 호출은 안정적이었지만 anon 권한 거부 경로에서 crash가 남아 있다. 따라서 Packet 13은 `CODE NO-GO`이며, 운영 적용·clean migration runner·20/100회 안정성 검증·Release 승인을 보류한다.
- 후속 backend-crash migration은 만들지 않았다. PostgreSQL/Supabase runtime 버전 비교, disposable clean DB, 공식 backtrace 수집이 선행되어야 한다.

### 9.3 2026-08-15 Packet 13-R Local Supabase PostgreSQL Runtime Gate

- 공식 [Supabase Postgres issue #2112](https://github.com/supabase/postgres/issues/2112)와 [Supabase Docker changelog](https://github.com/supabase/supabase/blob/master/docker/CHANGELOG.md)를 대조했다. `.104`의 reserved-role permission-denied SIGSEGV는 기존 관찰과 동일한 범위다.
- 이미지 비교 결과: `.095` control은 denied `42501` 및 full Stress PASS, `.104`는 denied 1회에서 SIGSEGV/recovery를 재현해 즉시 중단, `.136` candidate와 CLI가 실제 선택한 `.158`은 integer/text/jsonb의 denied/allowed 20회 새 연결·100회 동일 연결·prepared/DISCARD를 모두 PASS했다.
- 실제 프로젝트 CLI probe는 Supabase CLI `2.114.0`이 `major_version=17`에서 `public.ecr.aws/supabase/postgres:17.6.1.158` (`sha256:99b1729aeb0bac314445024fc149fbd39306170b61dd50800ccf180327ab3459`)을 선택함을 확인했다. `supabase/config.toml`에 이 CLI pin과 preflight를 기록했다.
- `.158` clean DB 1·DB 2에 `supabase db push --db-url ... --include-all --skip-vault`로 12개 migration을 처음부터 적용했다. 두 DB 모두 `103000/113000/123000` history, Packet13 33/33, Atomicity 22/22, V2 97/97, Phase2C 49/49, hard/grace/lock-order concurrency, crash regression을 통과했다.
- false-green 방지 harness는 stdout/stderr 비동기 보존, process exit code, SQLSTATE `42501`, connection loss/signal 11/recovery, postmaster start time, container restart count와 log marker를 case별로 판정한다. `supabase_runtime_preflight.ps1`는 현재 `.104` container를 의도적으로 FAIL시켰다.
- Packet13 business migration과 반환 계약은 수정하지 않았다. 변경은 pgTAP의 명시적 pgtap 준비, concurrency container 인자 전달, diagnostic/runtime/clean-runner/preflight harness와 문서뿐이다.
- CODE 판정(2026-08-15 snapshot): `CODE GO — verified target runtime constrained`는 CLI `2.114.0` + image `.158` preflight를 통과하는 환경에 한해 적용한다. 당시 로컬 `supabase_db_wiki`는 `.104`이므로 preflight FAIL 상태였고, 그 환경에서는 `CODE NO-GO`를 유지했다. 운영 runtime·브라우저/Realtime·dry-run·Release A~D는 별도 `RELEASE HOLD`다.

### 9.4 2026-08-17 Packet 13-R2 Local Runtime Enforcement & PostgREST Smoke

- Supabase CLI를 npm devDependency와 lockfile에 `2.114.0` exact로 고정하고 `supabase:start`, `supabase:preflight`, `supabase:clean-gate`, `supabase:postgrest-smoke` entrypoint를 추가했다. Node 표준 라이브러리 기반 preflight는 fail-closed로 동작하며 PowerShell 7 미만과 `ArgumentList` 미지원은 PASS로 처리하지 않는다.
- 기존 `.104` `supabase_db_wiki` stack은 공식 stop으로 중지했다. CLI stop이 container object는 제거했지만 `supabase_db_wiki` volume은 남아 있으며, `.104`를 새 `.158` volume에 연결하지 않았다. 잘못 선택된 격리 `.104` target도 중지·보존하고 기본 경로에서 제외했다.
- CLI 생성 상태가 `.104`를 가리키는 것을 확인한 뒤 새 project ID `wiki-packet13-r2-clean158`와 새 volume `supabase_db_wiki-packet13-r2-clean158`을 사용했다. safe start는 `supabase/.temp/postgres-version=17.6.1.158`과 approved image tag/ID/digest를 먼저 확인하며 mismatch이면 ACL/RPC probe 전에 중단한다.
- 현재 기본 local stack은 `public.ecr.aws/supabase/postgres:17.6.1.158`, digest `sha256:99b1729aeb0bac314445024fc149fbd39306170b61dd50800ccf180327ab3459`, PG `17.6`, app URL `http://127.0.0.1:54321`, DB port `54322`, healthy, restart `0`이다. 공식 `supabase db reset --local --no-seed --yes` 후 `db push --local`과 migration history `103000/113000/123000`을 확인했다.
- full preflight는 RPC `jsonb` 반환/OID/owner/volatility/SECURITY DEFINER/empty `search_path`, anon·PUBLIC EXECUTE 거부와 authenticated·service_role 허용, 안전한 denied `42501`, postmaster/restart/log stability를 모두 PASS했다. `.104`가 선택된 첫 시도는 image mismatch로 fail-closed되었고 ACL 호출은 하지 않았다.
- reset 후 clean gate에서 TAP `33/33`, `22/22`, `97/97`, `49/49`, deterministic hard/grace/lock-order concurrency, full/minimal/prepared/DISCARD/long-lived/service-role crash regression을 통과했다. full fixture는 canonical page/revision·4명·state_version 12, minimal은 nullable canonical 값·3명·state_version 0이며 auth/role/transaction/trigger/publication 조건은 동일하게 맞췄다.
- 실제 PostgREST/Supabase client smoke에서 authenticated accepted, 즉시 rate limit, 4초 retry, hard/grace 만료 구조화 거부, latest room/results, nonmember/unfinished/invalid preset/duel 거부, anon RPC와 직접 `room_events` insert RLS 거부를 확인했다. event/rate/game_end cardinality와 runtime stability도 PASS했다. service-role key는 frontend/client smoke에 사용하지 않았다.
- 최종 판정: `CODE GO — local default clean158 + CLI 2.114.0 + preflight constrained`. 운영 DB/Edge Function, linked project, 브라우저/Realtime 2~8세션, 운영 dry-run 및 Release A~D는 별도 `RELEASE HOLD`다. `.104` image/volume이 기본 경로로 돌아오면 즉시 `CODE NO-GO`다.

### 9.5 2026-08-18 Packet 13-R3 Deterministic Concurrency Gate Closure

- 공식 `supabase/tests/group_final_gaps_v13_hardening_concurrency.ps1`를 보강해 coordinator advisory lock, `pg_stat_activity`, `pg_locks`, `pg_blocking_pids()`로 session A room-lock owner와 session B waiter/blocker를 관측한다. 고정 sleep이나 거의 동시에 시작한 `Start-Job`만으로 순서를 주장하지 않는다.
- 고유 room/user/fixture를 매번 생성해 finalizer-first hard/grace, emoji-first hard/grace, hard deadline equality, grace deadline equality를 한 harness에서 실행했다. 각 session의 PID·xact start·wait event·blocker PID·barrier release·RPC result·commit/exit evidence를 stdout에 보존한다.
- fresh fixture 3회 반복에서 6/6 시나리오가 모두 PASS했다. hard/grace는 `finished`, 각각 `time_limit`/`grace_timeout`, results=3, retired=2, `player_retired`=2, `game_end`=1, emoji event/rate ledger=0, host invariant을 확인했다. equality는 동일 DB `clock_timestamp()` deadline과 production `>=` 경계를 확인했다.
- `scripts/supabase-runtime-validation.mjs`의 pure validator와 `tests/supabaseRuntimeValidation.test.js`를 추가해 wrong CLI/image/digest/migration/RPC/ACL, nonzero/connection loss/recovery/signal 11, TAP count/not ok/Bail out/skip/todo/plan mismatch negative control을 실제 테스트로 reject한다. production debug flag나 bypass 환경변수는 만들지 않았다.
- `supabase:start`는 공식 CLI `--exclude vector`를 사용한다. Vector는 `host.docker.internal:2375` Docker log source 연결 실패로 재시작했지만 Wiki Race 기능 경로에서 사용하지 않는 선택적 observability 서비스다. target `.158`을 재기동해 vector 제외 후 DB/Auth/PostgREST/Realtime/Storage 흐름을 확인했다.
- Vite 약 688KB chunk warning은 기능 회귀가 아닌 성능 backlog로 유지한다. Packet 13에 lazy loading/chunk split은 섞지 않았다.
- 최종 판정: `CODE GO — default local runtime and deterministic gate verified`는 approved `.158`/digest와 CLI `2.114.0` preflight를 통과한 local/CI 범위에 한정한다. 운영/linked DB, Edge Function, browser Realtime 2~8세션, F5/offline/throttle, Wikipedia 429 없는 snapshot, 운영 dry-run, Release A~D는 `RELEASE HOLD`다.

### 9.6 2026-08-18 Packet 13-R3.1 Harness Evidence Preservation Closure

- 공식 concurrency harness의 child 실행은 `2>&1` 병합을 제거하고 `ProcessStartInfo`의 stdout/stderr 비동기 스트림을 각각 보존한다. worker/scenario 이름, process ID, 시작·종료 시각, exit code, raw stdout/stderr, timeout, connection-loss 분류와 cleanup 상태를 구조화해 기록한다. stderr만 존재하는 경우에는 실패로 단정하지 않고 exit/timeout/dangerous marker 계약으로 판정한다.
- `Stop-Job`·`Receive-Job`·`Remove-Job`은 무조건 계속 무시하지 않는다. 세 단계 모두 best-effort로 실행하되 각 단계의 pass/skip/fail, job ID, 원래 예외를 집계하고, primary failure와 cleanup failure를 함께 stderr에 보고한다. cleanup failure만 있어도 parent exit는 nonzero이며 fixture·job 정리 실패가 false-green이 되지 않는다.
- `supabase/tests/group_final_gaps_v13_hardening_concurrency_self_test.ps1`를 추가해 실제 DB 없이 stdout/stderr 분리와 nonzero child, Stop/Receive/Remove 각 fail injection, primary+cleanup aggregate, timeout 후 orphan process 0을 검증한다. `scripts/supabase-clean-gate.mjs`는 TAP/concurrency 전에 self-test를 실행하고 실패 시 즉시 fail-closed한다.
- 변경 범위는 concurrency harness/helper/self-test/clean gate와 이 문서화뿐이다. Packet 13 business migration, RPC 반환 계약, Server Authority V2, Phase 2C-5, 운영 DB/Edge Function, 새 dependency는 건드리지 않았다. 기존 R3 lock-order 동기화·6개 시나리오·3회 반복 계약은 유지한다.
- 이번 turn의 DB 비의존 검증은 self-test PASS, 실제 Job cleanup probe PASS, Node/PowerShell syntax PASS, `npm test` 124/124, `npm run build` PASS, `git diff --check` PASS다. 공식 clean gate도 self-test를 먼저 PASS한 뒤 Docker 미기동 `ECONNREFUSED 127.0.0.1:54322`에서 migration runner를 nonzero로 중단했다. Vite 약 689KB chunk warning은 기존 성능 backlog다.

판정: 하네스 fail-closed 구현과 self-test는 `GO`; approved `.158` local runtime clean gate 재실행 전 Packet 13 runtime 판정은 `NO-GO`/`RELEASE HOLD`를 유지한다.

### 9.7 2026-08-18 Packet 13-R3.2 Third-Finish Parser Final Closure

- third-finish의 기존 parser는 worker stdout 전체(`SET`, `SET`, `APPLIED`)를 허용 code 집합과 직접 비교해 `codes=[]`를 만들었다. production RPC의 반환값이나 migration은 원인이 아니었다.
- harness SQL에만 `PACKET13_RESULT|third-finish-one|<code>` / `PACKET13_RESULT|third-finish-two|<code>` marker를 추가하고, 공통 helper가 LF/CRLF line split, exact prefix, worker당 단일 marker, worker/code 집합, exit/timeout/connection-loss와 stderr SQL error를 fail-closed 검증한다.
- parser self-test는 psql `SET` noise, LF/CRLF, `PACKET13_RESULT=APPLIED`, conflict code positive와 marker 없음/중복/malformed/empty/unknown/worker mismatch/wrong prefix/nonzero/connection loss/stderr SQL error negative를 모두 PASS했다.
- approved `.158` third-finish 단독 실행과 전체 concurrency harness가 PASS했다. 실제 worker marker는 `third-finish-one=APPLIED`, `third-finish-two=GAME_NOT_ACTIVE`이며 각 marker 1개, exit 0, connection loss 없음, fixture cleanup PASS다.
- 공식 clean gate는 self-test와 migration runner는 PASS했지만 runtime preflight의 기존 `postgres-log dangerous_marker=true`에서 중단됐다. `.158` log에 startup recovery/`database system was not properly shut down`/`unexpected EOF` evidence가 남아 있어 clean gate exit 0 조건은 아직 충족하지 못했다. preflight나 로그를 우회·삭제하지 않았다.
- `npm test` 124/124, `npm run build`, Node/PowerShell syntax, `git diff --check`는 PASS했다. Packet 13 migration/RPC/RLS/JSONB 계약, `.104`, vector 제외, Vite warning은 수정하지 않았다.

판정: parser closure와 third-finish harness는 `GO`; 공식 clean gate exit 0이 아니므로 Packet 13 최종 `CODE NO-GO`, runtime/release `RELEASE HOLD`다.

### 9.8 2026-08-18 Packet 13 Final Log-Window Gate

- `scripts/supabase-runtime-validation.mjs`에 run-scoped `PACKET13_GATE_START|<run-id>` → test logs → `PACKET13_GATE_END|<run-id>` 판정과 container ID/postmaster/restart baseline 비교를 추가했다. `signal 11`, segfault, server termination, reinitializing/recovery/interrupted, unexpected EOF, connection loss, `PANIC`, `57P02`는 현재 window 안에서만 fatal이다.
- marker는 production schema/function이 아닌 `RAISE LOG` test-only SQL로 기록한다. PostgreSQL statement logging으로 marker가 중복 보이지 않도록 phase/run-id 인자를 분리했고, parser self-test는 marker 누락·중복·역순·현재 fatal·runtime 변화와 정상 historical marker를 모두 검증한다.
- approved `.158` runtime은 CLI `2.114.0`, image `public.ecr.aws/supabase/postgres:17.6.1.158`, digest `sha256:99b1729aeb0bac314445024fc149fbd39306170b61dd50800ccf180327ab3459`, PG `17.6`, container restart `0`, postmaster `2026-08-18 01:31:36.816875+00`이었다.
- clean gate run `packet13-f7f2779b-9d76-4670-a65a-bb8172adfeda`: START 1개, END 1개, 순서 정상, current fatal 0, historical fatal 30, container/postmaster/restart 불변. migration runner, TAP 33/22/97/49, concurrency 3회, crash regression 4종, cleanup과 final gate가 모두 exit 0이었다.
- 독립 PostgREST run `packet13-bd859f66-7d1e-4f6b-8cbc-cc148778a5c4`: authenticated accepted/rate-limit/retry/expired/RLS/cardinality smoke와 START/END 1개, current fatal 0, baseline 불변을 통과했다.
- historical recovery/EOF/startup evidence는 timestamp·PID·container context와 함께 window 밖 historical evidence로 별도 보고하며 현재 실행 verdict에는 포함하지 않는다. 로그 삭제·회전·allowlist·container 재생성·production SQL/RPC/migration 변경은 하지 않았다.
- DB-free log-window self-test, `npm test` 126/126, `npm run build`, Node/PowerShell syntax, `git diff --check`가 통과했다. 판정은 approved local `.158` + CLI `2.114.0` 범위에서 `CODE GO`; browser/Realtime, 운영·linked DB, 운영 dry-run, Release A~D는 계속 `RELEASE HOLD`다.
