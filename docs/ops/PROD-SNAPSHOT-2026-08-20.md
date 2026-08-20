# 운영 Supabase 스냅샷 — 2026-08-20

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

> 이 문서는 2026-08-20 작성 후 같은 날 §9(baseline 대조)가 추가되며 §2가 위와 같이 정정되었다.
> §4.1(avatars 객체 실측)도 같은 날 추가되었다. 그 외 절의 관찰값은 최초 기록 그대로다.

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
| `supabase_migrations.schema_migrations` 부재 → 첫 push 시 baseline 재적용 위험 | **cutover 차단 요소.** `migration repair --status applied 20260730170602` 등 baseline 처리 절차를 cutover 계획에 선행 단계로 추가해야 한다. **대조 결과와 repair 판단은 §9** |
| 운영 PostgreSQL 17.6 + 권한 거부 경로 SIGSEGV | **릴리스 게이트 추가 대상.** 로컬 게이트로 대체 불가 |
| `finish_group_player` cutover 시 삭제 → 운영 클라이언트 파손 | **배포 순서 설계 필요.** 프론트/DB 적용 순서와 다운타임 허용 여부 결정 |
| 운영 격차가 V2 이전 3개 migration까지 포함 | **cutover 범위 재산정.** 8/4·8/7·8/13 migration의 운영 적용 영향도 미검토 |

---

## 8. 미실행 / 남은 확인

- `avatars` 객체 소유자 **계정 식별** — UUID는 확보(§4.1), `auth.users` 대조 남음
- `git status -sb`로 원격 반영 여부
- 운영 Realtime publication 구성
- 운영 RLS 활성 테이블 목록 (`user_profile_stats`, `group_match_history` 포함)
- 운영 Edge Function 배포 목록
- 8/4·8/7·8/13 migration이 운영 적용 시 기존 데이터에 미치는 영향
- **운영 컬럼·제약 수준 대조** — §9.5에서 미수행. `migration repair` 전 확인 항목(§9.7)

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

**(a) 조건부 성립.** `repair --status applied 20260730170602`을 막는 차이는 대조에서 발견되지 않았다.

- 이 명령은 스키마를 변경하지 않는다. `supabase_migrations.schema_migrations`(§1에서 부재 확인)를
  생성하고 해당 버전 행만 기록한다. 목적은 **이후 `db push`가 baseline을 운영에 재적용하는 사고를
  막는 것**이며, 명령 자체의 스키마 변경 위험은 없다.
- repair 전 필요한 처리 — 차단 요소가 아니라 확인 항목이다:
  1. **컬럼·제약 수준 대조 1회.** `information_schema.columns` / `pg_constraint` 읽기 전용 조회.
     운영 조회이므로 건별 승인 필요(`AGENTS.md` §1).
  2. **RLS 정책·publication·GRANT 대조.** §8의 미실행 항목과 동일 범위.
     baseline에서 `group_match_history`·`user_profile_stats`는 RLS ENABLE이 없으므로 이 두 개를 포함한다.
  3. **`picked` 처리 결정.** repair로 baseline이 "적용됨"으로 확정되면 `picked`는 이후 모든
     로컬 재구성에 계속 포함된다. drop 여부는 별도 승인 사안(`AGENTS.md` §4).
- **(a)를 무조건이 아니라 조건부로 두는 이유:** 1·2가 미실행인 상태에서 baseline을 "적용됨"으로
  기록하면, 미검출 차이가 실재할 경우 그 차이는 이후 어떤 migration으로도 교정되지 않고
  영구히 이력 밖에 남는다. 집합 대조는 그 가능성을 좁혔을 뿐 제거하지 않았다.
