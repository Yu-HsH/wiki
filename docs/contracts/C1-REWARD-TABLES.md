# C1 — 보상 3테이블

**소유자: 공통.** 패킷 16·17은 소비자이며 이 테이블을 재정의하지 않는다.
닫는 공백: **G1**. 공통 규칙은 [README](README.md).

**근거 문서:** `16-ACHIEVEMENTS-REWARDS.md` §5.3(필드 목록) · §1(공통 규칙) ·
`17-EXPLORATION-PROFILE-GUEST.md` §5 · `01-CONFIRMED-SPEC.md` §10.

---

## 0. 왜 공통인가

16 §5.3이 이 셋을 **정의**하고 17 §5가 같은 3분리를 **요구**한다. 한쪽에 소유권을 주면
나머지가 대기하므로 **어느 패킷에도 주지 않는다** `[사용자 결정, 2026-09-02]`.

**16과 17의 요구를 대조한 결과 빠진 것은 없다.** 두 문서가 같은 것을 다른 말로 적고 있었다:

| 요구 | 16 §5.3 | 17 §5 | 계약 |
|---|---|---|---|
| 카탈로그·보유·장착 3분리 | 정의 | 요구 | **§1·§2·§3** |
| 보유하지 않은 보상 장착 차단 | "서버가 보유 여부를 검증" | "서버 차단" | **§3의 FK가 구조로 막는다** |
| 배지 최대 3 | §5.3 | §5 | **§3의 `slot_index` CHECK** |
| 게스트 차단 | §8 테스트 | §6 | **§4 RPC가 `AUTH_REQUIRED`** |
| legacy `profile_image_url` 보존 | §5.3 말미 | §5 | **삭제하지 않는다 — [C5](C5-PROFILE-CARD.md)** |

## 0.1 `reward_bundles`는 이 계약에 넣지 않는다

16 §5.3은 `reward_bundles`·`reward_bundle_items`도 열거한다. **그러나 그 둘은 공통이 아니다** —
**번들은 지급 주체의 것이고 지급은 16만 한다.** 17은 번들을 읽지 않고 카탈로그·보유·장착만 쓴다.

→ **번들은 패킷 16이 소유한다.** 이 계약의 `user_reward_inventory.grant_source_id`가
번들 지급 기록을 가리킬 수 있게만 열어 둔다 (§2). `확인 필요` — 16 착수 시 재확인한다.

---

## 1. `reward_catalog`

```sql
create table if not exists public.reward_catalog (
  reward_id text primary key,
  kind text not null,
  display_name text not null,
  description text,
  asset_ref text,
  active boolean not null default true,
  retired boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reward_catalog_kind_check check (kind = any (array[
    'profile_icon', 'title', 'badge', 'frame', 'background',
    'path_color', 'path_effect', 'finish_effect', 'spectator_emoji'
  ]::text[])),
  constraint reward_catalog_reward_id_format_check
    check (reward_id ~ '^[a-z][a-z0-9_]{2,63}$')
);

create index if not exists reward_catalog_kind_active_idx
  on public.reward_catalog (kind, active) where retired = false;
```

| 컬럼 | 결정 근거 |
|---|---|
| `reward_id text` (uuid 아님) | **16 §1: "업적 ID는 출시 후 바꾸지 않는다".** 보상도 같은 성질이며, 사람이 읽는 안정 ID여야 카탈로그를 코드 재배포 없이 다룰 수 있다 |
| `kind` **9종** | `01-CONFIRMED-SPEC.md` §10이 정확히 이 9종을 열거한다 — 프로필 아이콘 / 칭호 / 배지 / 프레임 / 배경 / 경로 색상 / 경로 효과 / 완주 효과 / 관전 이모티콘 `[문서]` |
| `asset_ref` **nullable** | 16 §2: "profile cosmetic asset ID는 제작 단계에서 연결하되 안정적인 reward ID는 유지한다". **아트가 없어도 보상을 정의할 수 있어야 한다** |
| `active` / `retired` **분리** | 16 §1: "삭제 대신 `active=false` 또는 `retired=true`로 기록을 보존한다". **둘은 다른 뜻이다** — `active=false`는 일시 비활성, `retired=true`는 영구 은퇴 |

**RLS**

```sql
alter table public.reward_catalog enable row level security;
revoke all on table public.reward_catalog from anon, authenticated;
grant select on table public.reward_catalog to authenticated;

create policy "Authenticated users can read live rewards"
on public.reward_catalog for select to authenticated
using (retired = false);
```

| 축 | 값 |
|---|---|
| 읽기 | **로그인 사용자 전체.** 카탈로그는 공개 정보다 |
| `retired` 노출 | **막는다.** 은퇴 보상은 카탈로그에 안 보인다. **단 보유·장착한 사용자에게는 §2·§3으로 계속 보인다** |
| 쓰기 | **없다.** 카탈로그는 migration/seed로만 채운다 |

> **`retired` 보상을 이미 장착한 사용자는 어떻게 되나 — `확인 필요`.**
> 16 §1이 "기록을 보존한다"고만 하고 장착 해제 여부를 규정하지 않는다.
> **이 계약은 강제 해제하지 않는 쪽으로 열어 둔다**(§3의 FK가 inventory만 보므로 자동 유지된다).

---

## 2. `user_reward_inventory`

```sql
create table if not exists public.user_reward_inventory (
  user_id uuid not null references public.profiles(id) on delete cascade,
  reward_id text not null references public.reward_catalog(reward_id),
  grant_source_type text not null,
  grant_source_id uuid,
  acquired_at timestamptz not null default now(),
  primary key (user_id, reward_id),
  constraint user_reward_inventory_grant_source_type_check
    check (grant_source_type = any (array[
      'achievement_unlock', 'reward_bundle', 'admin', 'system_default'
    ]::text[])),
  constraint user_reward_inventory_grant_source_id_check
    check ((grant_source_type in ('admin', 'system_default')) or grant_source_id is not null)
);

create index if not exists user_reward_inventory_user_idx
  on public.user_reward_inventory (user_id, acquired_at desc);
```

**멱등성은 PK가 만든다.** `primary key (user_id, reward_id)` 위에서 지급을
`insert ... on conflict do nothing`으로 하면 **같은 이벤트를 몇 번 재처리해도 1행이다.**
16 §1의 "동일 이벤트 재처리로 업적·보상이 중복되지 않는다"가 이 한 줄로 충족된다.

> **`unique (user_id, grant_source_id)`를 쓰지 않은 이유.**
> **번들 하나가 여러 보상을 지급한다** (16 §5.3: "프레임+배경처럼 여러 보상을 한 번에").
> source 단위 unique를 걸면 번들이 깨진다. **보유의 불변식은 "같은 보상을 두 번 갖지 않는다"이지
> "한 source가 한 행만 만든다"가 아니다.**

**RLS**

```sql
alter table public.user_reward_inventory enable row level security;
revoke all on table public.user_reward_inventory from anon, authenticated;
grant select on table public.user_reward_inventory to authenticated;

create policy "Users can read own inventory"
on public.user_reward_inventory for select to authenticated
using ((select auth.uid()) = user_id);
```

| 축 | 값 |
|---|---|
| 읽기 | **본인만.** 남의 보유 목록은 공개 대상이 아니다 — 공개되는 것은 **장착 결과**뿐이다(§3) |
| 쓰기 | **없다.** 16의 지급 RPC가 `security definer`로 쓴다 |
| 게스트 | **불가.** `user_id`가 `profiles` FK이고 정책이 `authenticated` 전용이다. 17 §6·16 §8의 "guest가 영구 보상 inventory를 만들지 못함"이 구조로 충족된다 |

---

## 3. `user_profile_equipment`

```sql
create table if not exists public.user_profile_equipment (
  user_id uuid not null,
  slot text not null,
  slot_index smallint not null default 1,
  reward_id text not null,
  equipped_at timestamptz not null default now(),
  primary key (user_id, slot, slot_index),
  constraint user_profile_equipment_slot_check
    check (slot = any (array[
      'profile_icon', 'title', 'badge', 'frame', 'background',
      'path_color', 'path_effect', 'finish_effect', 'spectator_emoji'
    ]::text[])),
  constraint user_profile_equipment_slot_index_check
    check ((slot = 'badge' and slot_index between 1 and 3)
        or (slot <> 'badge' and slot_index = 1)),
  constraint user_profile_equipment_owned_fk
    foreign key (user_id, reward_id)
    references public.user_reward_inventory (user_id, reward_id)
    on delete cascade
);

create unique index if not exists user_profile_equipment_unique_reward_idx
  on public.user_profile_equipment (user_id, reward_id);
```

### 3.1 이 설계가 규칙 두 개를 구조로 강제한다

| 규칙 | 어떻게 강제되나 |
|---|---|
| **"보유하지 않은 보상은 장착할 수 없다"** (`01-CONFIRMED-SPEC.md` §10) | **복합 FK `(user_id, reward_id) → user_reward_inventory`.** RPC 로직이 아니라 **DB가 거부한다.** 보유가 취소되면 `on delete cascade`로 장착도 사라진다 |
| **"대표 배지 최대 3개, 나머지는 1개"** (§10) | `slot_index` CHECK + PK. **4번째 배지를 넣을 자리가 없다** |

**추가 유니크 인덱스**는 같은 보상을 두 슬롯에 겹쳐 장착하는 것을 막는다.

> **막지 못하는 것 하나 — `kind`와 `slot`의 일치.**
> 프레임 보상을 `badge` 슬롯에 넣는 것은 이 DDL이 막지 못한다
> (`reward_catalog.kind`가 이 테이블에 없기 때문이다).
> **RPC가 검증한다**(§4). 대안은 `kind`를 비정규화해 FK에 포함하는 것인데,
> **카탈로그의 `kind`가 바뀌면 장착이 깨지므로 채택하지 않았다.** `확인 필요` — 16 착수 시 재검토.

### 3.2 RLS — **여기만 공개 읽기다**

```sql
alter table public.user_profile_equipment enable row level security;
revoke all on table public.user_profile_equipment from anon, authenticated;
grant select on table public.user_profile_equipment to authenticated;

create policy "Authenticated users can read equipment"
on public.user_profile_equipment for select to authenticated
using (true);
```

| 축 | 값 | 근거 |
|---|---|---|
| 읽기 | **로그인 사용자 전체 공개** | **랭킹·그룹 참가자 행·결과 화면이 남의 카드를 그린다** (`21-SCREEN-MATRIX.md` §5·§9, [C5](C5-PROFILE-CARD.md)). 본인만으로 막으면 그 화면들이 성립하지 않는다 |
| 쓰기 | **없다.** RPC 전용 | §4 |

> **보유(§2)는 비공개, 장착(§3)은 공개다.** 이 비대칭이 의도다 —
> 남이 무엇을 **가졌는지**는 사생활이고 무엇을 **걸었는지**는 표시 정보다.

---

## 4. RPC 시그니처

```sql
-- 장착. 보유 검증은 FK가 하고, 이 함수는 kind·slot 일치와 게스트 차단을 본다.
create or replace function public.equip_profile_reward_v1(
  p_slot text,
  p_slot_index smallint,
  p_reward_id text
) returns jsonb

-- 해제.
create or replace function public.unequip_profile_reward_v1(
  p_slot text,
  p_slot_index smallint
) returns jsonb

-- 카드 조회. C5의 4개 렌더 지점이 이것 하나를 쓴다.
create or replace function public.get_profile_card_v1(
  p_user_id uuid
) returns jsonb
```

| 함수 | 반환 | 실패 코드 |
|---|---|---|
| `equip_profile_reward_v1` | `{ok:true, equipment:[...]}` — **갱신 후 전체 장착 상태** | `AUTH_REQUIRED` · `REWARD_NOT_OWNED` · `SLOT_KIND_MISMATCH` · `SLOT_INDEX_INVALID` · `REWARD_RETIRED` |
| `unequip_profile_reward_v1` | 동일 | `AUTH_REQUIRED` · `SLOT_EMPTY` |
| `get_profile_card_v1` | `{ok:true, card:{...}}` — [C5](C5-PROFILE-CARD.md) §2의 형식 | `PROFILE_NOT_FOUND` |

- **전부 `security definer` + `set search_path = ''`**, `authenticated`에만 `execute`.
- **원자성:** 16 §5.3의 "원자적으로 갱신"은 단일 `insert ... on conflict (user_id, slot, slot_index) do update`로 충족된다. 별도 트랜잭션 제어가 필요 없다.
- **`REWARD_NOT_OWNED`는 FK 위반을 잡아 옮긴 것이다.** 함수가 미리 확인해도 되지만
  **최종 방어는 FK다.**

---

## 5. 확정된 것 / 확인 필요

| 상태 | 항목 |
|---|---|
| **확정** | 3테이블 DDL · `kind`/`slot` 9종 · 배지 3개 제한 · 보유 검증(FK) · RLS 3종 · RPC 3개 시그니처 · 멱등 지급 방식 |
| **확인 필요** | ① `reward_bundles` 소유가 16이라는 판단(§0.1) ② `retired` 보상의 장착 유지 여부(§1) ③ `kind`↔`slot` 검증을 RPC에 두는 선택(§3.1) ④ **시스템 기본 프로필 아이콘 4~6종의 `reward_id`와 지급 방식** — `01-CONFIRMED-SPEC.md` §10이 "시스템 제공 4~6종"이라고만 하고 **개수도 ID도 정하지 않았다** `[문서]` |

> **④가 가장 크다.** 기본 아이콘을 `system_default`로 전원에게 지급할지, 카탈로그에만 두고
> 장착 시 보유를 생성할지가 정해지지 않았다. **17 착수 시 결정한다.**
