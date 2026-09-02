# 운영 Supabase 스냅샷 — 2026-08-20

> ## ⚠ 이 문서는 무효다 — 현재 기준은 **`docs/ops/PROD-SNAPSHOT-2026-09-02.md`**
>
> 2026-08-27~28 cutover 창이 운영을 바꿨고(테이블 14→21, 함수 7→36, RLS off 2→0,
> 이력 부재→12행), 2026-09-02 스냅샷이 이 문서를 대체했다.
> **이 문서는 서두 규칙대로 보존하며 역사 기록으로만 읽는다.**
> **현재 운영 상태의 근거로 인용하지 않는다** (`AGENTS.md` §1.1).
>
> **예외 2건 — 09-02에 재조회되지 않아 여기가 여전히 마지막 실측이다:**
> **§4.1 `avatars` 객체**(1건, 소유자 `roeehd2`)와 **§5 런타임 버전**(PostgreSQL 17.6).

> 읽기 전용 확인 결과. 변경은 수행하지 않음.
> 이 문서는 특정 시점의 관찰 기록이며, 운영에 변경이 가해지면 무효가 된다.
> 갱신 시 새 날짜 파일을 만들고 이 문서는 보존한다.
>
> 저장 위치 제안: `docs/ops/PROD-SNAPSHOT-2026-08-20.md`

---

## 0. 확인 방법

Supabase 대시보드 SQL Editor 및 Storage 화면에서 `select` 전용 조회.
비교 기준선은 동일 시점의 로컬 스택(`wiki-packet13-r2-clean158`) — **즉 migration 11개가 적용된 상태**다.
baseline(`20260730170602`) 자체와의 대조는 최초 작성 시 수행하지 않았고, §9에서 별도로 수행했다.

### 정정 이력

| 날짜 | 대상 | 내용 |
|---|---|---|
| 2026-08-20 | §2 | `finish_group_player`의 "운영 전용" 분류를 정정. 운영 함수 7개는 **전부 baseline에 있다.** 이 함수는 운영 전용이 아니라 cutover migration이 삭제하여 현재 로컬에만 없는 함수다. §9 baseline 대조로 확인. cutover 시 클라이언트 파손 위험이라는 **결론은 유지**되고 근거만 정확해졌다 |
| 2026-08-20 | §9.7 | 제약·RLS 실측(§10) 반영. baseline 대응 판단을 "(a) 조건부 성립"에서 **"(a) 성립"**으로 갱신. 잔여 항목(publication·`GRANT`)은 repair가 아니라 **첫 `db push`의 선행 조건**으로 재분류 |
| 2026-08-20 | §8 | 해소된 항목(RLS 목록·제약 대조) 취소선 처리, 잔여 항목을 §10.5 기준으로 세분 |

> 이 문서는 2026-08-20 작성 후 같은 날 §9(baseline 테이블·함수 대조)와 §10(제약·RLS 대조)이
> 추가되며 §2가 정정되고 §9.7이 갱신되었다. §4.1(avatars 객체 실측)도 같은 날 추가되었다.
> 그 외 절의 관찰값은 최초 기록 그대로다.

---

## 1. migration 적용 상태

**결과: `supabase_migrations.schema_migrations` 관계가 존재하지 않음 (42P01)**

```
ERROR: 42P01: relation "supabase_migrations.schema_migrations" does not exist
```

### 해석

- Supabase CLI를 통한 migration push가 **이 프로젝트에서 한 번도 수행된 적 없음**
- 운영 스키마는 CLI 이력 밖에서(수동 SQL 또는 대시보드) 구성된 상태
- 로컬 `20260730170602_baseline_remote_schema`는 이 운영 상태를 덤프한 것으로 보이며,
  운영은 그 시점 이후 어떤 migration도 받지 않았다

### 미적용 migration (로컬 기준 11개)

| version | name |
|---|---|
| 20260804004535 | group_security_hardening_phase1 |
| 20260807003609 | group_match_lifecycle_phase2a |
| 20260813072952 | group_security_phase2c |
| 20260814090000 | server_authority_v2 |
| 20260814091000 | server_authority_rpc_v2 |
| 20260814092000 | duel_authority_v2 |
| 20260814093000 | server_authority_cutover_v2 |
| 20260814094000 | duel_item_authority_v2 |
| 20260814103000 | group_final_gaps_v13 |
| 20260814113000 | group_final_gaps_v13_hardening |
| 20260814123000 | group_spectator_emoji_atomicity_fix |

> 핸드오프 §4.1은 "V2 미적용"으로 기록했으나, 실제 격차는 그보다 3개 migration(8/4, 8/7, 8/13) 더 크다.

---

## 2. RPC 목록

| 구분 | 개수 |
|---|---|
| 로컬 `public` 스키마 함수 (migration 11개 적용 후) | 36 |
| 운영 `public` 스키마 함수 | 7 |
| 양쪽 공통 | 6 |
| baseline에 존재하나 cutover migration이 삭제 예정 | 1 |
| 로컬에만 존재 | 30 |

> **정정(2026-08-20, §9 대조 반영).** 이 표의 4행은 최초 "운영에만 존재 1"이었다.
> 사실은 운영 7개 **전부**가 baseline에 있다. `finish_group_player`는 운영 전용 객체가 아니라,
> `20260814093000_server_authority_cutover_v2`가 삭제하기 때문에 **현재 로컬 카탈로그에만 없는** 함수다.
> 비교 기준이 baseline이 아니라 "migration 적용 후 로컬"이었던 데서 생긴 표현 오류다.

### 운영에 존재하는 7개

| proname | args | 비고 |
|---|---|---|
| `can_join_room` | `p_room_id uuid` | 공통 |
| `ensure_today_daily_challenge` | (없음) | 공통. 하루 1코스 반환 — 확정 스펙의 3코스와 불일치 |
| `finish_group_player` | `p_room_id uuid, p_elapsed_seconds integer, p_move_count integer, p_current_title text, p_path_titles text[]` | **baseline:122에 존재.** cutover migration이 삭제 예정이므로 현재 로컬에만 없다. 클라이언트 값 신뢰 구버전 |
| `is_room_member` | `p_room_id uuid` | 공통 |
| `is_room_participant` | `p_room_id uuid` | 공통. `is_room_member`와 중복 |
| `set_updated_at` | (없음) | 공통. 트리거 함수 |
| `start_group_room_game` | `p_room_id uuid` | 공통 |

### 주의: `finish_group_player`는 cutover에서 삭제된다

`20260814093000_server_authority_cutover_v2`가 legacy 그룹 RPC를 삭제한다.
근거는 **baseline:122에 있던 함수가 migration 11개 적용 후 로컬 카탈로그에서 사라진다는 사실**이다
(최초 서술은 "운영 전용"을 근거로 들었으나, 정확한 근거는 이것이다 — 위 정정 참조).

**결론은 그대로다.** 현재 운영 클라이언트가 이 함수를 호출 중이라면 cutover 시점에 **즉시 깨진다.**
운영에 실재하는 함수가 cutover로 삭제된다는 사실은 정정 전후로 달라지지 않는다.
프론트 배포와 migration 적용의 순서·동시성 계획이 필요하다.

---

## 3. Storage — `avatars` 버킷

```sql
select count(*) as objects, count(distinct owner) as owners
from storage.objects where bucket_id = 'avatars';
```

| objects | owners |
|---|---|
| 1 | 1 |

### 해석

- 업로드 기능(`pages/ProfilePage.jsx:132-154`)이 운영에서 **실제로 사용된 이력이 있다**
- 객체가 0이 아니므로 "무해한 즉시 제거" 대상이 아니다
- 소유자가 1명이므로 실제 사용자인지 개발 테스트 계정인지 확인 후 판단 가능

### 후속 확인 쿼리 → **실행됨.** 결과는 §4.1

```sql
select name, owner, created_at from storage.objects where bucket_id = 'avatars';
```

---

## 4. avatar / achievement / reward 관련 스키마

```sql
select table_name, column_name
from information_schema.columns
where table_schema in ('public','storage')
  and (column_name ilike '%avatar%'
       or table_name ilike '%achievement%'
       or table_name ilike '%reward%');
```

**결과: 0행**

### 해석

- 운영에 업적·보상 관련 테이블이 존재하지 않음
- `onboarding_full_avatar`를 저장할 구조 자체가 없음
  → **업적 ID rename이 안전하다.** `onboarding_profile_complete`로 변경 시 legacy 보존 절차 불필요
- 핸드오프 §4.1의 "확인 전 rename/update 마이그레이션 금지" 제약 **해소됨**

> 단, 이름에 `avatar`를 포함하지 않는 컬럼(`profiles.profile_image_url` 등)은 이 쿼리에 잡히지 않는다.
> 프로필 이미지 컬럼 자체는 별도로 존재할 수 있다.

### 4.1 `avatars` 객체 실측 (2026-08-20)

§3의 후속 확인 쿼리(`select name, owner, created_at ...`) 실행 결과다.

| 항목 | 값 |
|---|---|
| 객체 수 | 1 |
| 생성 시각 | 2026-04-22 |
| `owner` | UUID 1개. 값은 개인 식별 가능 정보이므로 이 문서에 기재하지 않는다 |
| `name` | 미기록 |

#### 해석

- 업로드 시점이 **2026-04-22**이다. 서버 권위 V2·Packet 13 작업(8월)보다 앞서고,
  `origin/main`의 5월 상태(`e6d8eee`)보다도 앞선다.
  즉 **현재 작업 브랜치와 무관한, 5월 이전의 운영 사용 기록**이다.
- `owner`가 UUID로 채워져 있으므로 익명·서비스 롤 업로드가 아니다. `auth.users`의 특정 계정에 귀속된다.
- 남은 것은 그 UUID가 실사용자 계정인지 개발 테스트 계정인지의 **식별**이다.
  `auth.users`·`profiles` 대조가 필요하고, 운영 조회이므로 건별 승인이 필요하다(`AGENTS.md` §1).
- 삭제·이동·변환은 하지 않는다(`AGENTS.md` §4).

---

## 5. 런타임 버전

```
PostgreSQL 17.6 on aarch64-unknown-linux-gnu,
compiled by gcc (GCC) 15.2.0, 64-bit
```

### 해석 — 신규 위험 항목

핸드오프 §3.2 Crash Diagnostic(08-14)은 로컬 PostgreSQL의 **`anon` 권한 거부 경로에서 signal 11(SIGSEGV)** 재현을 기록했다.
운영도 동일한 17.6 계열이다.

`20260814093000_server_authority_cutover_v2`는 `public`·`anon`의 실행 권한을 회수하므로,
cutover 직후 운영에서 권한 거부 경로 발생 빈도가 크게 증가한다. 크래시가 관측됐던 바로 그 경로다.

로컬 `CODE GO`는 승인된 이미지 `.158` + CLI `2.114.0` 범위에서만 유효하며,
**운영 런타임은 그 고정 범위 밖이다.**

단, `.104`/`.158`은 CLI 로컬 개발용 이미지이고 운영은 별도 관리형 배포판이므로
동일 빌드인지는 확인되지 않았다. **확정 위험이 아니라 검증 대상으로 분류한다.**

---

## 6. 이 스냅샷이 해소한 핸드오프 §4.1 항목

| 항목 | 상태 |
|---|---|
| 운영/linked Supabase의 실제 migration 적용 상태 | **해소** — 미적용 11개, CLI 이력 자체 없음 (§1) |
| 운영 PostgreSQL 런타임 버전 | **해소** — 17.6 aarch64 (§5) |
| 운영 DB의 `onboarding_full_avatar` 사용 여부 | **해소** — 저장 구조 없음, rename 안전 (§4) |
| `avatars` 버킷의 실제 업로드 이미지 존재 여부 | **부분 해소** — 1개 존재(2026-04-22 생성, `owner` UUID 확보). 계정 식별 남음 (§3·§4.1) |
| `37adc69`·`450f63a`의 원격 포함 여부 | **미해소** — `git status -sb` 필요 |

---

## 7. 이 스냅샷이 새로 만든 항목

| 항목 | 성격 |
|---|---|
| `supabase_migrations.schema_migrations` 부재 → 첫 push 시 baseline 재적용 위험 | **cutover 차단 요소.** `migration repair --status applied 20260730170602` 등 baseline 처리 절차를 cutover 계획에 선행 단계로 추가해야 한다. **대조 결과는 §9·§10, repair 판단은 §9.7 — (a) 성립으로 갱신됨** |
| 운영 PostgreSQL 17.6 + 권한 거부 경로 SIGSEGV | **릴리스 게이트 추가 대상.** 로컬 게이트로 대체 불가 |
| `finish_group_player` cutover 시 삭제 → 운영 클라이언트 파손 | **배포 순서 설계 필요.** 프론트/DB 적용 순서와 다운타임 허용 여부 결정 |
| 운영 격차가 V2 이전 3개 migration까지 포함 | **cutover 범위 재산정.** 8/4·8/7·8/13 migration의 운영 적용 영향도 미검토 |
| Packet 13 그룹 제약(3~8명, `finish_rank_limit=3`, `use_items=false`) 대비 운영 `game_rooms` 데이터 적합성 | **cutover 선행 점검.** 운영의 `min>=2`/`max<=30`은 미적용 상태의 정상값이며 불일치가 아니다. 제약은 `not valid`로 추가되므로 **migration은 실패하지 않지만**, 위반 행이 있으면 hardening의 `validate`가 생략되고 이후 UPDATE·RPC 경로가 런타임에 깨진다. 점검 쿼리와 판단 근거는 `docs/agent/CURRENT.md` §5-2 |

---

## 8. 미실행 / 남은 확인

- `avatars` 객체 소유자 **계정 식별** — UUID는 확보(§4.1), `auth.users` 대조 남음
- `git status -sb`로 원격 반영 여부
- 운영 Realtime publication 구성 — baseline은 4테이블 등록(§10.5)
- ~~운영 RLS 활성 테이블 목록~~ → **해소.** 14/14 일치, 정책 수까지 일치 (§10.3)
- 운영 Edge Function 배포 목록
- 8/4·8/7·8/13 migration이 운영 적용 시 기존 데이터에 미치는 영향
- ~~운영 제약 수준 대조~~ → **해소.** 52/52 일치 (§10.1·§10.2)
- 운영 `GRANT`/ACL 대조 — baseline `GRANT` 70행 (§10.5)
- 운영 비제약 인덱스(22건)·트리거(2건) 대조 (§10.5)
- 운영 **컬럼 전체 목록** 대조 — 제약이 걸리지 않은 잉여 컬럼은 §10의 방법으로 검출되지 않는다

---

## 9. 운영 `public` 테이블 목록과 baseline 대조 (2026-08-20)

대조 기준: `supabase/migrations/20260730170602_baseline_remote_schema.sql`
(= `supabase/baseline/remote_schema.sql`와 공백 줄 외 동일).
운영 DB에는 접근하지 않았다. 운영 측 입력은 이 날짜의 사용자 실측 보고다.

### 9.1 운영 `public` 테이블 14개

| # | 테이블 | baseline 수록 | 비고 |
|---|---|---|---|
| 1 | `analytics_events` | 있음 | |
| 2 | `daily_challenge_pool` | 있음 | PK `sort_order`, UNIQUE `target_title` |
| 3 | `daily_challenges` | 있음 | |
| 4 | `game_records` | 있음 | |
| 5 | `game_rooms` | 있음 | |
| 6 | `group_match_history` | 있음 | baseline에 RLS ENABLE 없음 |
| 7 | `group_match_results` | 있음 | |
| 8 | `match_history` | 있음 | |
| 9 | `picked` | 있음 | 제약·기본값 없는 사본 형태. §9.4 |
| 10 | `profiles` | 있음 | |
| 11 | `room_events` | 있음 | |
| 12 | `room_players` | 있음 | |
| 13 | `target_candidates` | 있음 | |
| 14 | `user_profile_stats` | 있음 | baseline에 RLS ENABLE 없음 |

### 9.2 baseline에만 있는 테이블

**없음.** baseline의 `public` 스키마 `CREATE TABLE`은 정확히 14개이며 위 목록과 1:1로 일치한다.
`CREATE VIEW` / `CREATE MATERIALIZED VIEW`는 0개다.

### 9.3 운영에만 있는 테이블

**없음.** `picked` 포함.

### 9.4 `picked`

- baseline 612~622행에 수록되어 있다.
- 컬럼: `sort_order integer`, `start_title text`, `target_title text`, `hint text`,
  `is_active boolean`, `created_at timestamptz`.
  이름·순서·타입이 `daily_challenge_pool`과 동일하다 — 운영 실측 보고와 일치한다.
- 단 `daily_challenge_pool`과 달리 NOT NULL·DEFAULT·PK(`sort_order`)·UNIQUE(`target_title`)가
  **전부 없다.** `create table as select` 계열로 만들어진 사본의 형태다.
- RLS는 ENABLE(1158행)이고 정책은 **0개**다. `anon`/`authenticated`에 `GRANT ALL`이 있으나
  정책이 없어 `service_role` 외에는 실질 접근 경로가 없다.
- 후속 migration 11개는 `picked`를 한 번도 참조하지 않는다. 앱 코드에도 참조가 없다
  (`services/dailyChallengeService.js` 등은 `daily_challenge_pool`·`daily_challenges`만 사용).
- **판정: CLI 이력 밖에서 생성된 테이블이지만 baseline 덤프에는 포함되어 있다.**
  "baseline에 없는 테이블"이 아니므로 신규 미기록 객체로 표기할 필요는 없다.
  정리(drop) 여부만 §9.7의 결정 항목으로 남긴다.

### 9.5 양쪽에 있으나 컬럼이 다른 테이블

**대조 불가 — 수행하지 못했다.** 운영 컬럼 목록이 이번 실측에서 수집되지 않았고,
운영 DB 접근은 금지되어 있다(`AGENTS.md` §1). 이름 단위 대조만 완료했다.

간접 정합성 근거 2건 (모순 없음):

- §4의 `information_schema.columns` 조회 결과 `%avatar%` 컬럼 0행 →
  baseline에도 `avatar`를 포함하는 컬럼이 0개다. 일치.
- §2의 운영 `public` 함수 7개는 baseline의 `CREATE FUNCTION` 7개와 이름·인자가 **완전히 일치**한다:
  `can_join_room`, `ensure_today_daily_challenge`, `finish_group_player`, `is_room_member`,
  `is_room_participant`, `set_updated_at`, `start_group_room_game`.
  `finish_group_player`도 baseline 122행에 있다 — **이 대조가 §2의 "운영 전용" 분류를 정정한 근거다**
  (운영에만 있는 것이 아니라, 후속 migration이 삭제하기 때문에 현재 로컬 목록에 없다).
  정정 내용은 §0 정정 이력과 §2 본문에 반영되어 있다.

### 9.6 결론 — baseline은 이 운영 상태의 덤프로 볼 수 있는가

**테이블 집합과 함수 집합 수준에서는 확정할 수 있다.**

- 테이블 14/14 일치, baseline-only 0건, 운영-only 0건
- 함수 7/7 일치 (이름·인자)
- `avatar` 컬럼 부재 일치

§1의 "덤프한 것으로 **보이며**"를 이 두 집합 수준에서는 확정으로 올린다.

**미확정으로 남는 것:** 컬럼·제약·인덱스·RLS 정책·`supabase_realtime` publication·GRANT 수준의
동일성. 2026-07-30 덤프 이후 21일간의 무기록 변경 가능성은 위 두 집합 대조로만 배제됐다.

### 9.7 `migration repair` 판단

> **갱신(2026-08-20, §10 실측 반영).** 최초 판단은 "(a) 조건부 성립 — 컬럼·제약·RLS 대조 미수행"이었다.
> 제약(52/52)과 RLS(14/14)가 실측으로 해소되어 아래와 같이 갱신한다.

**(a) 성립. `repair --status applied 20260730170602`이 적절한 처리다.**

`repair`는 스키마를 변경하지 않는다. `supabase_migrations.schema_migrations`(§1에서 부재 확인)를
생성하고 해당 버전 행만 기록한다. 목적은 **이후 `db push`가 baseline을 운영에 재적용하는 사고를
막는 것**이며, 명령 자체의 스키마 변경 위험은 없다.

#### 해소된 대조 축 (4/4 차이 0건)

| 축 | 결과 | 근거 |
|---|---|---|
| 테이블 | 14/14, 양방향 잉여 0 | §9.1~§9.3 |
| 함수 | 7/7, 이름·인자 일치 | §9.5 |
| 제약 | 52/52, 정의·FK 동작까지 일치 | §10.1·§10.2 |
| RLS + 정책 수 | 14/14, 정책 합계 29 일치 | §10.3 |

#### 잔여 항목과 repair 차단 여부

| 잔여 | repair를 막는가 | 근거 |
|---|---|---|
| `supabase_realtime` publication (baseline 4테이블) | **막지 않음** | repair는 publication을 읽지도 쓰지도 않는다 |
| `GRANT`/ACL (baseline 70행) | **막지 않음** | 동일 |
| 비제약 인덱스 22건·트리거 2건 | **막지 않음** | 동일 |
| 컬럼 전체 목록(잉여 컬럼 검출) | **막지 않음** | 동일 |

**근거 — 왜 잔여 항목이 repair를 막지 못하는가.** `repair`는 대상 스키마를 검사하지 않고
이력 테이블에 행 하나를 기록하는 연산이다. 따라서 잔여 드리프트가 있든 없든 repair의 성공·실패는
달라지지 않는다. 잔여 항목이 실제로 작용하는 시점은 **repair 이후의 첫 `db push`**이며,
그때의 실패 양상이 두 갈래로 갈린다.

- **큰 소리로 실패하는 것 (안전):** 컬럼·인덱스·트리거 드리프트. 미적용 migration 11개가 존재하지 않는
  컬럼을 `ALTER`하거나 중복 객체를 만들려 하면 해당 migration이 트랜잭션 안에서 실패한다.
  드리프트가 즉시 드러나므로 조용히 잘못되지 않는다.
- **조용히 실패하는 것 (위험):** **publication과 `GRANT`**. 운영의 publication 멤버십이
  baseline과 다르면 어떤 migration도 실패하지 않지만 Realtime 이벤트가 전달되지 않는다.
  `GRANT` 역시 `20260814093000_server_authority_cutover_v2`가 `public`·`anon` 실행 권한을
  **회수**하는 쪽이므로, 사전 상태가 달라도 회수는 성공하고 차이는 런타임 권한 거부로만 나타난다.
  §5의 17.6 권한 거부 경로 SIGSEGV 위험과 직결된다.

→ 따라서 publication·GRANT 대조는 **repair의 선행 조건이 아니라 cutover(첫 push)의 선행 조건**이다.
이 둘을 분리하는 것이 이번 갱신의 핵심이다.

#### repair와 함께 결정할 항목 (차단 요소 아님)

- **`picked` 처리.** repair로 baseline이 "적용됨"으로 확정되면 `picked`는 이후 모든 로컬 재구성에
  계속 포함된다. 제약 0건·정책 0건으로 운영에서도 사실상 비활성이다(§10.2). drop 여부는
  별도 승인 사안(`AGENTS.md` §4).
- **실행 승인.** `migration repair`는 `AGENTS.md` §1의 건별 승인 대상이다. 이 문서의 판단은
  기술적 적절성에 대한 것이며 실행 승인을 대체하지 않는다.

---

## 10. 제약·RLS 실측과 baseline 대조 (2026-08-20)

입력: 운영에서 읽기 전용으로 조회한 `pg_constraint` 목록과
`pg_class.relrowsecurity` + `pg_policy` 집계. 운영 DB에 접근하지 않았고, 값은 사용자 제공 결과다.
대조 기준은 `supabase/migrations/20260730170602_baseline_remote_schema.sql`이다.

> **수량 표기 주의.** 붙여넣은 제약 결과는 **52행**이다(아래 종류별 합계와 일치).
> 지시문 본문의 "제약 51건"과 1건 차이가 있으므로, 이 문서는 실제 행 수인 52를 기록한다.
> 행 목록과 요약 수치가 어긋날 경우 행 목록을 우선한다.

### 10.1 제약 — 52/52 완전 일치

| contype | 운영 | baseline | 일치 |
|---|---|---|---|
| `p` PRIMARY KEY | 13 | 13 | ✓ |
| `f` FOREIGN KEY | 15 | 15 | ✓ |
| `u` UNIQUE | 10 | 10 | ✓ |
| `c` CHECK | 14 | 14 | ✓ |
| **합계** | **52** | **52** | ✓ |

baseline 측 내역: `ALTER TABLE ... ADD CONSTRAINT` 38건 + `CREATE TABLE` 인라인 `CHECK` 14건 = 52건.

- **baseline에만 있는 제약: 0건**
- **운영에만 있는 제약: 0건**

이름 단위로 52개가 1:1 대응하며, 어느 쪽에도 잉여가 없다.

### 10.2 정의 수준 일치

이름뿐 아니라 정의도 대조했다.

- **CHECK 14건** — 술어 문자열이 전부 일치한다.
  `game_rooms_player_count_check`의 `((min_players >= 2) AND (max_players >= min_players)
  AND (max_players <= 30))`을 포함한다(스펙 대비 차이는 §7의 cutover 선행 점검 항목 참조).
- **FOREIGN KEY 15건** — 참조 테이블·참조 컬럼·`ON DELETE` 동작이 전부 일치한다.
  참조 대상 분포: `auth.users` 6건, `public.profiles` 5건, `public.game_rooms` 4건.
  동작 분포: `CASCADE` 10건, `SET NULL` 5건.
- **UNIQUE 10건** — 대상 컬럼 조합 일치. `match_history_room_unique`,
  `group_match_history_room_user_unique`처럼 명명 규칙이 다른 것들도 양쪽에 동일하게 존재한다.
- **`picked` 제약 0건** — 운영 목록에 단 한 행도 없다. §9.4의 "NOT NULL·DEFAULT·PK·UNIQUE 전무"
  관찰과 일치한다. 사본 테이블이라는 판정을 운영 측에서 독립적으로 확인한 셈이다.
- **`group_match_history`에 `room_id` FK 없음** — 양쪽 동일하다. `room_id`는 nullable이고
  FK가 걸려 있지 않아 방이 삭제돼도 기록이 남는 구조다. 드리프트가 아니라 baseline 그대로다.

### 10.3 RLS — 14/14 완전 일치

| 테이블 | 운영 `relrowsecurity` | 운영 정책 수 | baseline RLS | baseline 정책 수 | 일치 |
|---|---|---|---|---|---|
| `analytics_events` | true | 1 | ENABLE | 1 | ✓ |
| `daily_challenge_pool` | true | 0 | ENABLE | 0 | ✓ |
| `daily_challenges` | true | 1 | ENABLE | 1 | ✓ |
| `game_records` | true | 4 | ENABLE | 4 | ✓ |
| `game_rooms` | true | 5 | ENABLE | 5 | ✓ |
| `group_match_history` | **false** | 0 | **없음** | 0 | ✓ |
| `group_match_results` | true | 3 | ENABLE | 3 | ✓ |
| `match_history` | true | 2 | ENABLE | 2 | ✓ |
| `picked` | true | 0 | ENABLE | 0 | ✓ |
| `profiles` | true | 5 | ENABLE | 5 | ✓ |
| `room_events` | true | 2 | ENABLE | 2 | ✓ |
| `room_players` | true | 4 | ENABLE | 4 | ✓ |
| `target_candidates` | true | 2 | ENABLE | 2 | ✓ |
| `user_profile_stats` | **false** | 0 | **없음** | 0 | ✓ |

RLS 활성 12개 / 비활성 2개, 정책 합계 29개가 양쪽 동일하다.
`picked`는 RLS ENABLE + 정책 0개이므로 `service_role` 외 실질 접근 경로가 없다(§9.4 재확인).

### 10.4 RLS off 2건은 드리프트가 아니라 기록된 상태다

`group_match_history`·`user_profile_stats`의 RLS 비활성은 **문서에 이미 기록된 의도된 상태**다.

- `docs/WIKI_RACE_GROUP_DB_SECURITY_SPEC.md` **§4.4** "Phase 1에서 의도적으로 남긴 항목" —
  "`group_match_history`, `user_profile_stats` RLS 비활성화"로 명시
- 같은 문서 **§5.4** "기록·통계 테이블" — "다음 테이블은 현재 RLS 최종 잠금이 필요하다"로 재확인

따라서 **운영 실측 = baseline = 문서 기록의 3자 일치**다. 미기록 드리프트가 아니다.

해소 시점도 저장소에 있다: `20260813072952_group_security_phase2c.sql:765-766`이
두 테이블에 `enable row level security`를 적용한다. 이 migration은 **운영 미적용 11개 중 하나**이므로
(§1), 현재의 RLS off는 미적용 상태에서 예상되는 값이다.

> 단, `docs/WIKI_RACE_GROUP_DB_SECURITY_SPEC.md`는 `docs/agent/CURRENT.md` §6에서 **stale**로
> 표시돼 있다(그룹 시간 규칙이 15분/3분으로 남아 있음). RLS off 항목은 그 stale 범위와 무관한
> 별개 사실이며, 위 3자 일치로 독립 확인됐다.

### 10.5 이 실측이 해소한 것과 남긴 것

**해소:** 제약(52/52), RLS 활성 여부(14/14), 정책 수(14/14).
§8의 "운영 RLS 활성 테이블 목록" 항목이 해소된다.

**남는 것 — 대조되지 않은 baseline 객체:**

| 대상 | baseline 수량 | 미확인 이유 |
|---|---|---|
| `supabase_realtime` publication 멤버십 | 4테이블 | 조회하지 않음 |
| `GRANT`/ACL | `GRANT` 구문 70행 | 조회하지 않음 |
| 비제약 인덱스 | `CREATE INDEX` 22건 | 조회하지 않음. UNIQUE 제약은 §10.1에서 확인됨 |
| 트리거 | 2건(`room_players`) | 조회하지 않음 |
| 컬럼 전체 목록·타입·기본값·nullable | — | 제약이 참조하는 컬럼은 간접 확인됐으나, **제약이 걸리지 않은 잉여 컬럼은 이 방법으로 검출할 수 없다** |

### 10.6 불일치가 repair를 막는가

**막지 않는다. 불일치 자체가 0건이다.**

제약·RLS 두 축에서 baseline과 운영의 차이가 발견되지 않았으므로,
`repair --status applied 20260730170602`을 보류할 근거가 이 실측에서 나오지 않았다.
갱신된 종합 판단은 §9.7에 있다.
