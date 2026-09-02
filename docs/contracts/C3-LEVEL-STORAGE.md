# C3 — 레벨 저장 위치

**소유자: 공통.** 패킷 15·16·17이 읽는다.
닫는 공백: **G6**. 공통 규칙은 [README](README.md).

**근거 문서:** `01-CONFIRMED-SPEC.md` §7.3 · `15-XP-LEVEL-RANKING.md` §4 ·
`21-SCREEN-MATRIX.md` §1 · Freeze v1 `02-01`·`02-02`·`02-03`.

---

## 0. ⚠ 정정 이력 — **동결 계약을 한 번 고쳤다**

| 날짜 | 무엇을 | 어떻게 | 왜 |
|---|---|---|---|
| **2026-09-02** | **§5의 C3-① 대응안 ①** | `grant update (nickname, profile_image_url)` **2컬럼** → **`(nickname, profile_image_url, updated_at)` 3컬럼**. 그리고 **"권한다"에서 "확정"으로** `[사용자 결정]` | **2컬럼으로 적용하면 배포된 프론트가 깨진다.** `ProfilePage.jsx:86`·`:149`의 두 update가 **`updated_at`을 함께 보낸다** `[코드]`. 컬럼 권한이 없는 컬럼을 UPDATE 목록에 넣으면 PostgreSQL이 거부하므로 **닉네임 저장과 프로필 사진 변경이 둘 다 실패한다.** 게이트가 해제된 상태여서 사용자가 즉시 겪는다 (`AGENTS.md` §1.1) |

**정정의 성격:** 결정을 바꾼 것이 아니라 **결정을 실행 가능하게 만든 것이다.**
저장 위치(§1)·레벨 비저장(§3)·함수 정의(§4)는 바뀌지 않았고, **`total_xp` 보호도 그대로다** —
3컬럼 목록에 `total_xp`가 없기 때문이다.

> **동결 계약을 고칠 때의 규칙을 이 항목이 만든다.**
> ① 무엇이 왜 바뀌었는지 이 표에 남긴다 ② 본문에서 옛 값을 지우지 않고 취소선으로 남긴다
> ③ 근거는 코드 실측이어야 한다. **문서 대 문서의 취향 차이로는 고치지 않는다.**

---

## 1. 결정

| | 결정 |
|---|---|
| **저장** | **`profiles.total_xp bigint`** — 누적 XP만 저장한다 |
| **레벨** | **저장하지 않는다.** `public.level_from_total_xp(bigint)` 함수로 계산한다 |
| **위치가 `profiles`인 이유** | **`user_profile_stats`는 본인만 읽을 수 있어서 쓸 수 없다** — §2 |
| **레벨을 저장하지 않는 이유** | 레벨은 누적 XP의 순증가 파생값이라 **드리프트만 만들고 얻는 것이 없다** — §3 |

```sql
alter table public.profiles
  add column if not exists total_xp bigint not null default 0;

alter table public.profiles
  add constraint profiles_total_xp_check check (total_xp >= 0);

create index if not exists profiles_total_xp_idx
  on public.profiles (total_xp desc);
```

---

## 2. 왜 `user_profile_stats`가 아닌가 — **RLS가 결정했다** `[코드]`

```
20260813072952_group_security_phase2c.sql:791-795
create policy "Users can view their own profile stats"
on public.user_profile_stats for select to authenticated
using ((select auth.uid()) = user_id);
```

**`user_profile_stats`는 본인 행만 읽힌다.** 그런데 레벨은 **남의 것을 읽어야 하는 값**이다:

| 화면 | 누구의 레벨인가 | 근거 |
|---|---|---|
| 상단 내비 | 본인 | `21-SCREEN-MATRIX.md` §1 "닉네임·레벨·대표 칭호" |
| **탐험가 레벨 랭킹** | **전원** | `01-CONFIRMED-SPEC.md` §8, Freeze v1 `02-02` `EXPLORER / Lv.27 / 누적 12,480 XP` |
| **그룹 참가자 행** | **다른 참가자** | `21-SCREEN-MATRIX.md` §5 |
| **공개 프로필** | **남** | Freeze v1 `02-03` |

→ **`user_profile_stats`에 두면 랭킹과 참가자 행이 성립하지 않는다.** 정책을 넓히는 선택지도
있으나 **그 테이블은 개인 전적(승/패 등)을 담고 있어 공개 범위를 넓히는 비용이 크다.**

**`profiles`는 이미 공개 읽기다** — baseline 정책 `Anyone can read public profiles`(SELECT USING true)와
`Authenticated users can view public profile cards`가 있고, **`rankingService.js:205`가 이미
`profiles`에서 `id, nickname, profile_image_url`을 조인해 온다** `[코드]`.
**레벨을 여기 두면 랭킹 행에 조인이 하나도 늘지 않는다.**

---

## 3. 왜 레벨을 저장하지 않는가

| 논점 | 판단 |
|---|---|
| **조회 빈도가 높다 (상단 내비가 매 화면)** | **저장 이유가 되지 않는다.** 레벨은 `total_xp` 하나에서 나오고, 그 값은 어차피 같은 행에서 읽는다. **추가 I/O가 0이다** |
| **갱신 시점** | XP 지급 시 1회. **드물다** |
| **저장하면 생기는 것** | `total_xp`와 `level`이 어긋날 수 있는 상태. 공식이 바뀌면 **전 행 백필**이 필요하다 |
| **정렬 성능** | 레벨 정렬 = `total_xp` 정렬이다. **레벨은 누적 XP의 단조 증가 함수**이므로 `total_xp desc` 인덱스가 그대로 레벨 랭킹 인덱스다 |

> **`15` §5.3 "같은 레벨이면 누적 XP 우선"도 자동으로 만족된다** — `total_xp desc` 하나로
> 레벨 정렬과 동점 처리가 동시에 끝난다.

**결론: 파생값을 두 벌 갖지 않는다.**

---

## 4. 레벨 함수

**공식은 `01-CONFIRMED-SPEC.md` §7.3 = `15` §4다** `[문서]`:

```
다음 레벨 필요 XP = min(100 + 25 × floor((현재 레벨 − 1) / 5), 500)
```

```sql
-- 레벨 L에서 L+1로 가는 데 필요한 XP.
create or replace function public.xp_to_next_level(p_level integer)
returns integer
language sql
immutable
as $$
  select least(100 + 25 * ((greatest(p_level, 1) - 1) / 5), 500);
$$;

-- 누적 XP로부터 현재 레벨. 최대 레벨 없음.
create or replace function public.level_from_total_xp(p_total_xp bigint)
returns integer
language plpgsql
immutable
as $$
declare
  v_level integer := 1;
  v_remaining bigint := greatest(coalesce(p_total_xp, 0), 0);
  v_need integer;
begin
  loop
    v_need := public.xp_to_next_level(v_level);
    exit when v_remaining < v_need;
    v_remaining := v_remaining - v_need;
    v_level := v_level + 1;
  end loop;
  return v_level;
end;
$$;
```

**검산** `[산출물, 2026-09-02]` — 이 정의가 확정 스펙과 맞는지 손으로 확인했다:

| 입력 | 결과 | 확인 |
|---|---|---|
| `xp_to_next_level(1..5)` | 100 | §7.3 "1~5레벨: 레벨당 100 XP" ✓ |
| `xp_to_next_level(6)` | 125 | "이후 5레벨마다 25 증가" ✓ |
| `xp_to_next_level(27)` | **225** | `floor(26/5)=5` → `100+125` ✓ |
| `xp_to_next_level(81)` | 500 | `floor(80/5)=16` → `100+400=500` ✓ "81레벨부터 500" |
| `xp_to_next_level(200)` | 500 | `least(...)`가 상한을 건다 ✓ |
| `level_from_total_xp(0)` | 1 | ✓ |
| `level_from_total_xp(3975)` | **27** | 누적 500+625+750+875+1000+225 = 3,975 ✓ |

> **`15` §4 "여러 레벨을 한 번에 오르는 XP 처리"가 이 루프로 충족된다.**
> 한 번의 큰 지급이 여러 단계를 넘어도 정확하다.

> **시안의 `Lv.27 / 340·400 XP / 누적 12,480`은 이 함수와 맞지 않는다.**
> Lv.27의 필요 XP는 225이고 누적 3,975다. **목업 샘플로 판정됐다 (G13)** —
> `docs/design/MOBILE-VALIDATION-CORRECTIONS.md` §1.2. **함수는 스펙을 따른다.**

### 4.1 `immutable`로 선언한 이유와 그 대가

`immutable`이면 인덱스·생성 컬럼에 쓸 수 있다. **다만 공식이 바뀌면 그 인덱스가 조용히
잘못된다.** 그래서 **인덱스나 generated column으로 쓰지 않는다** — 정렬은 `total_xp`로 한다(§3).
`immutable`은 쿼리 플래너가 상수 폴딩할 수 있게 하는 용도로만 둔다. `확인 필요` — 공식 변경
가능성을 낮게 보지만, 바뀌면 이 선언을 다시 본다.

---

## 5. 갱신 경로

**`total_xp`를 갱신하는 곳은 [C2](C2-XP-LEDGER.md)의 `grant_xp_v1` 하나다.**

```sql
-- grant_xp_v1 내부 (개념)
insert into public.xp_ledger (...) values (...)
  on conflict on constraint xp_ledger_idempotent_uq do nothing;

if found then
  update public.profiles
     set total_xp = total_xp + p_amount, updated_at = now()
   where id = p_user_id;
end if;
```

| 규칙 | 이유 |
|---|---|
| **원장 삽입이 실제로 일어났을 때만 더한다** | 멱등 재호출에서 `total_xp`가 두 번 늘면 안 된다 |
| **`total_xp`는 원장 합계와 항상 같아야 한다** | 불변식. **검증 쿼리를 §6에 둔다** |
| 클라이언트는 `profiles.total_xp`를 **직접 쓸 수 없다** | `20260814093000` cutover가 `profiles`의 write를 회수하지 않았으므로 **`확인 필요`** — 아래 |

> **⚠ `profiles`의 클라이언트 write 경로가 열려 있다** `[코드]`.
> `ProfilePage.jsx:86`이 `profiles.update({nickname})`을, `:149`가 `update({profile_image_url})`을
> **클라이언트에서 직접** 한다. baseline 정책에 `Users can update own profile`류가 있기 때문이다.
> **`total_xp`가 같은 테이블에 들어가면 그 경로로 XP를 위조할 수 있다.**
>
> **대응 2안:** ① 컬럼 단위 grant로 좁힌다 — **DDL이므로 창 대상**,
> ② `total_xp`를 별도 테이블(`user_xp_totals`)에 두고 공개 읽기 정책을 준다.
> **①로 확정됐다** `[사용자 결정, 2026-09-02]` — 조인이 늘지 않는다는 §2의 이점을 지키기 때문이다.

### 5.1 C3-① 확정 — 컬럼 **3개** `[사용자 결정, 2026-09-02]`

```sql
-- 테이블 단위 UPDATE를 회수한다. 나중에 추가되는 컬럼까지 덮기 때문이다.
revoke update on table public.profiles from anon, authenticated;

-- 배포된 프론트가 실제로 쓰는 컬럼만 되돌려 준다.
grant update (nickname, profile_image_url, updated_at)
  on table public.profiles to authenticated;
```

| 컬럼 | 왜 목록에 있는가 | 근거 |
|---|---|---|
| `nickname` | 닉네임 저장 | `ProfilePage.jsx:85-87` `[코드]` |
| `profile_image_url` | 프로필 사진 변경 | `ProfilePage.jsx:147-150` `[코드]` |
| **`updated_at`** | **두 update가 모두 이것을 함께 보낸다.** 빠지면 둘 다 권한 오류로 실패한다 | `:86`(`{nickname, updated_at}`) · `:149`(`{profile_image_url, updated_at}`) `[코드]` |
| ~~`total_xp`~~ | **넣지 않는다.** 이것이 이 항목의 목적이다 | §5의 ⚠ |

- ~~`grant update (nickname, profile_image_url)`~~ — **2컬럼안은 폐기됐다** (§0).
- **`anon`에서도 회수한다.** `anon`은 `auth.uid() = id` 정책을 만족할 수 없어 동작 변화는 없지만,
  `GRANT ALL`이 남아 있을 이유도 없다 (`baseline:1467`) `[코드]`.
- **RLS 정책은 건드리지 않는다.** `Users can update own profile`·`Users can update their own profile`
  두 정책이 그대로 남는다 (`baseline:1117`·`1125`) `[코드]`. **컬럼 권한과 정책은 별개의 층이고,
  컬럼 권한만으로 `total_xp` 위조가 막힌다.**
- **INSERT 경로는 영향이 없다.** `username-signup` Edge Function이 `profiles`에 insert하지만
  회수 대상은 UPDATE뿐이다 (`supabase/functions/username-signup/index.ts:166`) `[코드]`.
- **적용 순서가 중요하다** — 이 회수를 **`total_xp` 추가보다 먼저** 해야 한다.
  테이블 단위 UPDATE는 나중에 추가되는 컬럼까지 덮으므로, 순서를 바꾸면 창 안에 위조 가능 구간이
  생긴다. `docs/agent/TRACKS.md` §7.2.
- **재검증 방법:** 창 후 `ProfilePage`에서 닉네임 저장·사진 변경을 각각 1회 수행한다.
  실패하면 grant 목록이 부족하다는 뜻이며, `profiles`를 update하는 클라이언트 경로가
  **2곳뿐임을 다시 확인한다** (2026-09-02 전수 검색 결과 2곳) `[코드]`.

---

## 6. 불변식 검증 쿼리

```sql
-- 원장 합계와 profiles.total_xp가 어긋난 사용자를 찾는다. 0행이어야 한다.
select p.id, p.total_xp, coalesce(sum(l.amount), 0) as ledger_total
from public.profiles p
left join public.xp_ledger l on l.user_id = p.id
group by p.id, p.total_xp
having p.total_xp <> coalesce(sum(l.amount), 0);
```

**`15` §7의 "직접 ledger/table 위조 차단" 테스트가 이 쿼리를 쓴다.**

---

## 7. 확정된 것 / 확인 필요

| 상태 | 항목 |
|---|---|
| **확정** | **저장 위치 = `profiles.total_xp`** (근거: `user_profile_stats`의 본인만 RLS) · **레벨은 저장하지 않고 함수로 계산** · `xp_to_next_level`·`level_from_total_xp` 정의와 검산 · 갱신 경로 단일화 · 불변식 쿼리 · **C3-① = 컬럼 단위 grant 3개(`nickname`·`profile_image_url`·`updated_at`)와 그 적용 순서** (§5.1, 2026-09-02) |
| **확인 필요** | ~~① `profiles`의 클라이언트 update 경로를 좁힐 것인가~~ → **확정 (2026-09-02). §5.1** ② `immutable` 선언 유지(§4.1) ③ **누적 XP 표시 단위** — Freeze v1 `02-02`가 `누적 12,480 XP`를 랭킹에 노출하는데 `15` §5.3은 "누적 XP와 현재 레벨 표시"만 규정한다. 표시 형식은 프론트 판단 |
