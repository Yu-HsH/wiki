# 운영 Supabase 스냅샷 — 2026-08-20

> 읽기 전용 확인 결과. 변경은 수행하지 않음.
> 이 문서는 특정 시점의 관찰 기록이며, 운영에 변경이 가해지면 무효가 된다.
> 갱신 시 새 날짜 파일을 만들고 이 문서는 보존한다.
>
> 저장 위치 제안: `docs/ops/PROD-SNAPSHOT-2026-08-20.md`

---

## 0. 확인 방법

Supabase 대시보드 SQL Editor 및 Storage 화면에서 `select` 전용 조회.
비교 기준선은 동일 시점의 로컬 스택(`wiki-packet13-r2-clean158`).

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
| 로컬 `public` 스키마 함수 | 36 |
| 운영 `public` 스키마 함수 | 7 |
| 양쪽 공통 | 6 |
| 운영에만 존재 | 1 |
| 로컬에만 존재 | 30 |

### 운영에 존재하는 7개

| proname | args | 비고 |
|---|---|---|
| `can_join_room` | `p_room_id uuid` | 공통 |
| `ensure_today_daily_challenge` | (없음) | 공통. 하루 1코스 반환 — 확정 스펙의 3코스와 불일치 |
| `finish_group_player` | `p_room_id uuid, p_elapsed_seconds integer, p_move_count integer, p_current_title text, p_path_titles text[]` | **운영 전용.** 클라이언트 값 신뢰 구버전 |
| `is_room_member` | `p_room_id uuid` | 공통 |
| `is_room_participant` | `p_room_id uuid` | 공통. `is_room_member`와 중복 |
| `set_updated_at` | (없음) | 공통. 트리거 함수 |
| `start_group_room_game` | `p_room_id uuid` | 공통 |

### 주의: `finish_group_player`는 cutover에서 삭제된다

`20260814093000_server_authority_cutover_v2`가 legacy 그룹 RPC를 삭제하며, 로컬 목록에 이 함수가 없는 것이 그 근거다.
현재 운영 클라이언트가 이 함수를 호출 중이라면 cutover 시점에 **즉시 깨진다.**
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

### 후속 확인 쿼리 (미실행)

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
| `avatars` 버킷의 실제 업로드 이미지 존재 여부 | **부분 해소** — 1개 존재. 소유자 식별 남음 (§3) |
| `37adc69`·`450f63a`의 원격 포함 여부 | **미해소** — `git status -sb` 필요 |

---

## 7. 이 스냅샷이 새로 만든 항목

| 항목 | 성격 |
|---|---|
| `supabase_migrations.schema_migrations` 부재 → 첫 push 시 baseline 재적용 위험 | **cutover 차단 요소.** `migration repair --status applied 20260730170602` 등 baseline 처리 절차를 cutover 계획에 선행 단계로 추가해야 한다 |
| 운영 PostgreSQL 17.6 + 권한 거부 경로 SIGSEGV | **릴리스 게이트 추가 대상.** 로컬 게이트로 대체 불가 |
| `finish_group_player` cutover 시 삭제 → 운영 클라이언트 파손 | **배포 순서 설계 필요.** 프론트/DB 적용 순서와 다운타임 허용 여부 결정 |
| 운영 격차가 V2 이전 3개 migration까지 포함 | **cutover 범위 재산정.** 8/4·8/7·8/13 migration의 운영 적용 영향도 미검토 |

---

## 8. 미실행 / 남은 확인

- `avatars` 객체 소유자 식별
- `git status -sb`로 원격 반영 여부
- 운영 Realtime publication 구성
- 운영 RLS 활성 테이블 목록 (`user_profile_stats`, `group_match_history` 포함)
- 운영 Edge Function 배포 목록
- 8/4·8/7·8/13 migration이 운영 적용 시 기존 데이터에 미치는 영향
