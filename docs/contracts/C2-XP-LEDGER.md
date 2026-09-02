# C2 — XP 원장

**소유자: 공통.** 패킷 15가 쓰고 16이 쓴다. 둘 다 재정의하지 않는다.
닫는 공백: **G4**. 공통 규칙은 [README](README.md).

**근거 문서:** `01-CONFIRMED-SPEC.md` §7 · `15-XP-LEVEL-RANKING.md` §1~§5 ·
`16-ACHIEVEMENTS-REWARDS.md` §1.

---

## 1. `xp_ledger`

```sql
create table if not exists public.xp_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  xp_class text not null,
  source_type text not null,
  source_id uuid not null,
  base_amount integer not null,
  amount integer not null,
  decay_reason text,
  granted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  constraint xp_ledger_idempotent_uq
    unique (user_id, source_type, source_id),

  constraint xp_ledger_xp_class_check
    check (xp_class = any (array['gameplay', 'achievement', 'admin']::text[])),

  constraint xp_ledger_source_type_check
    check (source_type = any (array[
      'single_random_finish',
      'single_target_first_finish',
      'daily_course_first_finish',
      'duel_win_normal',
      'duel_loss_normal',
      'duel_win_forfeit',
      'duel_loss_forfeit',
      'group_rank_1',
      'group_rank_2',
      'group_rank_3',
      'group_rank_other',
      'group_retire',
      'achievement_unlock',
      'admin_adjustment'
    ]::text[])),

  constraint xp_ledger_class_source_check
    check (
      (xp_class = 'achievement' and source_type = 'achievement_unlock')
      or (xp_class = 'admin' and source_type = 'admin_adjustment')
      or (xp_class = 'gameplay' and source_type not in ('achievement_unlock', 'admin_adjustment'))
    ),

  constraint xp_ledger_amount_sign_check
    check (xp_class = 'admin' or (amount >= 0 and base_amount >= 0)),

  constraint xp_ledger_decay_range_check
    check (xp_class = 'admin' or amount <= base_amount),

  constraint xp_ledger_decay_reason_check
    check (
      (decay_reason is null and amount = base_amount)
      or (decay_reason is not null and decay_reason = any (array[
        'duel_repeat_half', 'duel_repeat_zero'
      ]::text[]))
    )
);

create index if not exists xp_ledger_user_granted_idx
  on public.xp_ledger (user_id, granted_at desc);

create index if not exists xp_ledger_weekly_idx
  on public.xp_ledger (granted_at, user_id)
  where xp_class = 'gameplay';
```

---

## 2. `xp_class` — 이 계약의 핵심

**`source_type` 하나로는 주간 랭킹을 만들 수 없다.** 값이 늘어날 때마다 랭킹 쿼리의
제외 목록을 고쳐야 하기 때문이다. **분류 축을 따로 둔다.**

| `xp_class` | 뜻 | **누적 XP·레벨** | **주간 탐험가 랭킹** |
|---|---|:-:|:-:|
| `gameplay` | 경기 결과로 지급 | **포함** | **포함** |
| `achievement` | 업적 해금 (16, 30/60/120) | **포함** | **제외** |
| `admin` | 운영 보정 | **포함** | **제외** |

**근거** `[문서]`:
- `01-CONFIRMED-SPEC.md` §8 · §7.2 — **"업적 XP는 주간 탐험가 점수에 포함하지 않는다"**,
  "업적 XP와 운영 보정 XP는 주간 플레이 랭킹에서 제외한다"
- `15` §5.2 — 주간은 "정상 gameplay XP 합계", "업적 XP·운영 보정 XP 제외"
- `15` §5.3 · §4 — 누적 XP는 "원장 합계"이고 레벨의 근거다. **제외 규정이 없다**
- `16` §1 — "업적 XP는 주간 탐험가 점수에 포함하지 않는다"

> **업적 XP는 레벨에는 들어가고 주간 랭킹에서만 빠진다.** 두 문서가 "주간"만 제외하고
> 누적은 제외하지 않으므로 이 해석이 맞다. **`xp_class`가 그 한 줄 차이를 담는다.**

**주간 랭킹 쿼리는 이 한 줄로 고정된다:**

```sql
where xp_class = 'gameplay' and granted_at >= <월요일 00:00 KST>
```

`granted_at` 부분 인덱스가 정확히 이 쿼리를 받는다.

---

## 3. `source_type` 14종과 확정 XP 값

**값은 `01-CONFIRMED-SPEC.md` §7.1이 단일 기준이다.** 15 §1과 완전히 일치한다 `[문서]`.

| `source_type` | XP | `source_id`가 가리키는 것 | 스펙 근거 |
|---|---:|---|---|
| `single_random_finish` | **20** | `game_records.id` | §7.1 랜덤 탐험 완주 |
| `single_target_first_finish` | **15** | `game_records.id` | §7.1 목표 지정 + §7.2 최초만 |
| `daily_course_first_finish` | **25** | `game_records.id` | §7.1 + §7.2 코스별 최초만 |
| `duel_win_normal` | **50** | `match_history.id` | §7.1 1:1 정상 승리 |
| `duel_loss_normal` | **25** | `match_history.id` | §7.1 1:1 정상 패배 |
| `duel_win_forfeit` | **30** | `match_history.id` | §7.1 상대 기권으로 승리 |
| `duel_loss_forfeit` | **0** | `match_history.id` | §7.1 직접 기권·연결 이탈 패배 |
| `group_rank_1` | **70** | `group_match_results.id` | §7.1 그룹 1위 |
| `group_rank_2` | **55** | `group_match_results.id` | §7.1 그룹 2위 — **시안의 40이 아니다 (G16)** |
| `group_rank_3` | **45** | `group_match_results.id` | §7.1 그룹 3위 |
| `group_rank_other` | **35** | `group_match_results.id` | §7.1 4위 이후 정상 완주 |
| `group_retire` | **0** | `group_match_results.id` | §7.1 그룹 RETIRE |
| `achievement_unlock` | **30 / 60 / 120** | `user_achievement_unlocks.id` | `16` §1 기본 단계 XP |
| `admin_adjustment` | 임의 (음수 허용) | 운영 기록 ID | `15` §2 |

> **0 XP도 행을 남긴다.** `duel_loss_forfeit`·`group_retire`가 그렇다.
> 행이 없으면 "아직 지급 안 됨"과 "0으로 지급됨"이 구분되지 않아 **재실행 때 판단이 흔들린다.**
> 멱등성 유니크가 0 행에도 걸리므로 중복 처리도 함께 막힌다.

> **`15` §1의 "목표 지정 탐험 **최초** 완주"와 §7.1의 "목표 지정 탐험 완주"는 같은 뜻이다** —
> §7.2가 "최초 완주만 기본 XP"를 따로 규정한다. **`source_type` 이름에 `first`를 넣어
> 그 조건을 이름에 담았다.**

> **Freeze v1 `05-05`의 싱글 완주 `+40`은 쓰지 않는다** — 확정 스펙의 어느 값도 아니다 (G17).

---

## 4. 멱등성 — `result_id 단위`

```sql
constraint xp_ledger_idempotent_uq unique (user_id, source_type, source_id)
```

**`15` §2 "서버 결과 ID당 한 번만 지급"의 구현이다.**

| 왜 이 3열인가 | 근거 |
|---|---|
| `source_id`만으로 부족 | **그룹 결과 하나가 여러 사용자에게 지급한다.** `user_id`가 있어야 8명이 각자 1행을 갖는다 |
| `source_type`도 필요 | 같은 `game_records.id`가 **랜덤 완주이면서 오늘 코스 최초 완주**일 수 있다 `확인 필요` — 두 XP를 겹쳐 줄지가 정해지지 않았다. **열어 두는 쪽이 안전하므로 포함한다** |
| `user_id` FK + `not null` | **게스트 지급 금지** (`15` §2, §3.4). `profiles` 참조라 게스트는 행을 만들 수 없다 |

**지급은 `insert ... on conflict on constraint xp_ledger_idempotent_uq do nothing`으로 한다.**
재시도·F5·중복 finish가 몇 번 와도 1행이다 (`15` §2).

> **CANCELLED·무효 경기는 애초에 호출하지 않는다** (`15` §2).
> 원장에 "취소됨" 상태를 두지 않는다 — **원장은 append-only이고 취소는 `admin_adjustment`
> 음수 행으로 표현한다.** `15` §2의 "음수 보정은 관리자 경로에서만"과 맞는다.

---

## 5. 감쇠 — 원래 값과 지급 값을 함께 남긴다

`15` §3: **"감쇠 XP와 원래 XP를 ledger에 함께 기록"**, "승패·기록 자체는 XP 감쇠와 무관하게 저장".

| 컬럼 | 뜻 |
|---|---|
| `base_amount` | **감쇠 전** 확정 XP (§3 표의 값) |
| `amount` | **실제 지급** XP |
| `decay_reason` | `null`(감쇠 없음) · `duel_repeat_half` · `duel_repeat_zero` |

**감쇠 규칙** (`01-CONFIRMED-SPEC.md` §7.2 · `15` §3) — 같은 상대와 1:1:

| 하루 경기 수 | 비율 | `decay_reason` |
|---|---|---|
| 1~3 | 100% | `null` |
| 4~5 | 50% | `duel_repeat_half` |
| 6+ | 0% | `duel_repeat_zero` |

**CHECK가 정합성을 강제한다** — `decay_reason`이 없으면 `amount = base_amount`여야 하고,
있으면 `amount <= base_amount`여야 한다.

> **`확인 필요` 2건.**
> ① **"50%의 정수 처리"** — `15` §7이 테스트 항목으로 열거하지만 **반올림/내림이 정해지지 않았다.**
> 25 XP의 50%는 12인가 13인가. **`floor` 제안** (사용자에게 유리한 쪽이 아니라 예측 가능한 쪽).
> ② **일일 경계의 기준 시간대** — `15` §3이 "서비스 기준 시간대를 명확히 사용"이라고만 한다.
> **KST 제안** — `ensure_today_daily_challenge`가 이미 `now() at time zone 'Asia/Seoul'`을 쓴다 `[코드]`.

---

## 6. RLS

```sql
alter table public.xp_ledger enable row level security;
revoke all on table public.xp_ledger from anon, authenticated;
grant select on table public.xp_ledger to authenticated;

create policy "Users can read own xp ledger"
on public.xp_ledger for select to authenticated
using ((select auth.uid()) = user_id);
```

| 축 | 값 | 근거 |
|---|---|---|
| 읽기 | **본인만** | 결과 화면의 "이번 XP와 지급 이유"(`15` §6)는 본인 것이다. **남의 원장은 공개 대상이 아니다** |
| 쓰기 | **없다.** RPC 전용 | `15` §7 "직접 ledger/table 위조 차단" |
| 랭킹은? | **원장을 직접 읽지 않는다.** 주간 랭킹은 집계 RPC가 `security definer`로 계산해 돌려준다 (§7) | 본인만 정책과 충돌하지 않게 하는 유일한 방법 |

---

## 7. RPC 시그니처

```sql
-- 지급. 결과 확정 RPC가 내부에서 호출하거나, 결과 ID를 받아 별도 호출한다.
create or replace function public.grant_xp_v1(
  p_user_id uuid,
  p_source_type text,
  p_source_id uuid,
  p_base_amount integer,
  p_amount integer,
  p_decay_reason text default null
) returns jsonb

-- 주간 탐험가 랭킹.
create or replace function public.get_weekly_xp_ranking_v1(
  p_limit integer default 50
) returns jsonb

-- 본인 XP 요약 — 누적·레벨·다음 레벨까지.
create or replace function public.get_xp_summary_v1(
  p_user_id uuid
) returns jsonb
```

| 함수 | 반환 | 실패 코드 |
|---|---|---|
| `grant_xp_v1` | `{ok:true, granted:bool, ledger_id:uuid, total_xp:bigint, level_before:int, level_after:int}` | `AUTH_REQUIRED` · `XP_SOURCE_INVALID` · `XP_AMOUNT_INVALID` |
| `get_weekly_xp_ranking_v1` | `{ok:true, week_start:timestamptz, rows:[{user_id, nickname, total, rank}]}` | — |
| `get_xp_summary_v1` | `{ok:true, total_xp, level, next_level_xp, current_level_xp}` | `PROFILE_NOT_FOUND` |

- **`granted: false`는 오류가 아니다** — 멱등 재호출이 조용히 통과했다는 뜻이다.
- **`grant_xp_v1`은 `p_user_id`를 인자로 받는다.** 그룹 결과가 8명에게 지급하므로
  `auth.uid()`만으로는 부족하다. → **`authenticated`에 직접 `execute`를 주지 않고
  `service_role`과 다른 `security definer` 함수에서만 호출한다.** 이 점이 다른 RPC와 다르다.
- **`level_before`/`level_after`를 돌려준다.** `15` §6의 "레벨업 발생 시 결과 확정 뒤 연출"과
  `16` §6의 소비 이벤트 `level changed`가 이 값을 쓴다.

---

## 8. 확정된 것 / 확인 필요

| 상태 | 항목 |
|---|---|
| **확정** | 테이블 DDL · **`xp_class` 3종과 주간 제외 규칙** · `source_type` 14종과 XP 값 · 멱등성 3열 유니크 · 감쇠 3열 구조 · RLS · RPC 3개 시그니처 · 0 XP 행 기록 |
| **확인 필요** | ① **50% 감쇠의 정수 처리** (`floor` 제안) ② **일일/주간 경계 시간대** (KST 제안) ③ **한 완주가 랜덤·오늘 코스에 동시 해당할 때 XP를 겹쳐 주는가** ④ `admin_adjustment`의 `source_id`가 가리킬 운영 기록 테이블이 아직 없다 ⑤ **주간 동점 tie-break** — `15` §5.2가 "현재 데이터로 일관된 tie-break를 문서화"라고만 한다 |

> **③이 스키마에 영향을 준다.** 겹쳐 주지 않기로 하면 `source_type`을 유니크에서 빼고
> `(user_id, source_id)`로 좁히는 편이 안전하다. **지금은 겹침을 허용하는 쪽으로 열어 두었다.**
