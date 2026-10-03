# C1 — 보상 3테이블

**소유자: 공통.** 패킷 16·17은 소비자이며 이 테이블을 재정의하지 않는다.
닫는 공백: **G1**. 공통 규칙은 [README](README.md).

**근거 문서:** `16-ACHIEVEMENTS-REWARDS.md` §5.3(필드 목록) · §1(공통 규칙) ·
`17-EXPLORATION-PROFILE-GUEST.md` §5 · `01-CONFIRMED-SPEC.md` §10.

> **구현·운영 상태 (2026-10-01).** 이 계약은 17b가 **`supabase/migrations/20261001090000_c1_reward_tables_v1.sql`**
> 하나로 구현했고 운영에 적용됐다 — migrations 20 · `reward_catalog` 6 · `user_reward_inventory` 858(=프로필 143 × 기본 아이콘 6)
> `[사용자 실행·검증]`. pgTAP `supabase/tests/c1_reward_tables_v1.sql` 96건 `[산출물, 기준 dc388d9]`.
> **§5의 확인 필요 ①~④는 17b 착수 판정으로 전부 해소됐다** `[사용자 결정, 2026-10-01]`. §1~§3의 DDL·RLS는 계약 원문 그대로 적용됐다.
>
> **16a 개정 (2026-10-02) — `reward_catalog.listed` + 읽기 정책 교체** `[사용자 승인, 16 계획 판정 1]`.
> `supabase/migrations/20261002090000_achievements_rewards_v1.sql`이 적용한다 — **로컬 적용·pgTAP만, 운영 미적용** `[산출물, 기준 c6172fd]`.
> 상세는 **§1.1**. §4.1의 마지막 `확인 필요`(`active=false` 장착)도 16 계획 판정으로 닫혔다 — **막지 않는다**.

> **16d 개정 (2026-10-03) — 배지 kind 폐지** `[사용자 결정, 2026-10-03 — 16-HANDOFF §10]`. 아래 §0.-1 정정 이력. **계약만 고쳤다 — 구현은 16d-2 forward migration(운영 미적용).**

---

## 0.-1 ⚠ 정정 이력 — 동결 계약을 고칠 때의 기록

형식은 [C3](C3-LEVEL-STORAGE.md) §0 — ① 이 표에 남기고 ② 본문의 옛 값은 취소선 ③ 근거를 적는다.

| 날짜 | 무엇을 | 어떻게 | 왜 |
|---|---|---|---|
| **2026-10-03** | **`kind`·`slot` 9종의 `badge`** · §3 `slot_index` 규칙 · §3.1 "대표 배지 최대 3개" · §4.1 카드 슬롯 5종·이동(배지 순서) · §5 "배지 3개 제한" | **배지 kind 폐지 — 8종.** `slot_index`는 모든 slot에서 1. 카드 슬롯은 `profile_icon`·`title`·`frame`·`background` 4종. 카드 응답의 `badges` 키는 옛 프론트 호환을 위해 **`[]` 상수로 남긴다**. RPC 시그니처(`p_slot_index`)는 무변경 | **사용자 결정** — 칭호와 배지가 같은 의미를 중복하고 그림 배지는 아이콘과 겹친다 (`docs/agent/16-HANDOFF.md` §10). 기존 배지 보상 11개는 **`kind` 갱신**으로 아이콘 7·칭호 4가 된다 — `reward_id` 불변, 보유 행 그대로. **구현: 16d-2 forward migration** (`20261002090000`·`20261001090000` 무편집, R5) |

> 이 정정의 근거는 코드 실측이 아니라 **사용자 결정**이다 — C3 §0 규칙 ③이 막는 "문서 대 문서의 취향 차이"가 아니다 (spec §0 2026-10-03과 같은 성격).

## 0. 왜 공통인가

16 §5.3이 이 셋을 **정의**하고 17 §5가 같은 3분리를 **요구**한다. 한쪽에 소유권을 주면
나머지가 대기하므로 **어느 패킷에도 주지 않는다** `[사용자 결정, 2026-09-02]`.

**16과 17의 요구를 대조한 결과 빠진 것은 없다.** 두 문서가 같은 것을 다른 말로 적고 있었다:

| 요구 | 16 §5.3 | 17 §5 | 계약 |
|---|---|---|---|
| 카탈로그·보유·장착 3분리 | 정의 | 요구 | **§1·§2·§3** |
| 보유하지 않은 보상 장착 차단 | "서버가 보유 여부를 검증" | "서버 차단" | **§3의 FK가 구조로 막는다** |
| ~~배지 최대 3~~ → **배지 폐지 (2026-10-03, §0.-1)** | §5.3 | §5 | ~~**§3의 `slot_index` CHECK**~~ → `slot_index`는 항상 1 |
| 게스트 차단 | §8 테스트 | §6 | **§4 RPC가 `AUTH_REQUIRED`** |
| legacy `profile_image_url` 보존 | §5.3 말미 | §5 | **삭제하지 않는다 — [C5](C5-PROFILE-CARD.md)** |

## 0.1 `reward_bundles`는 이 계약에 넣지 않는다

16 §5.3은 `reward_bundles`·`reward_bundle_items`도 열거한다. **그러나 그 둘은 공통이 아니다** —
**번들은 지급 주체의 것이고 지급은 16만 한다.** 17은 번들을 읽지 않고 카탈로그·보유·장착만 쓴다.

→ **번들은 패킷 16이 소유한다.** 이 계약의 `user_reward_inventory.grant_source_id`가
번들 지급 기록을 가리킬 수 있게만 열어 둔다 (§2). ~~`확인 필요` — 16 착수 시 재확인한다.~~
→ **확정 (①)** `[사용자 결정, 2026-10-01]` — 17b migration은 `reward_bundles`·`reward_bundle_items`를 만들지 않았다. 16이 만든다.

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
| `kind` ~~**9종**~~ → **8종 (2026-10-03, §0.-1)** | `01-CONFIRMED-SPEC.md` §10이 ~~정확히 이 9종을 열거한다 — 프로필 아이콘 / 칭호 / 배지 / 프레임 / 배경 / 경로 색상 / 경로 효과 / 완주 효과 / 관전 이모티콘~~ → **배지를 뺀 8종 — 프로필 아이콘 / 칭호 / 프레임 / 배경 / 경로 색상 / 경로 효과 / 완주 효과 / 관전 이모티콘** (spec §0 2026-10-03). 위 DDL은 17b 원문이고, 16d-2 forward migration이 CHECK에서 `badge`를 뺀다 `[문서]` |
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

> **`retired` 보상을 이미 장착한 사용자는 어떻게 되나 — 확정 (②)** `[사용자 결정, 2026-10-01]`.
> **강제 해제하지 않는다.** 이미 장착된 은퇴 보상은 장착 상태로 남고 **남의 카드에도 계속 보인다** —
> 카드 조회 RPC(§4)가 `security definer`라 위 `retired = false` 정책에 가려지지 않는다.
> **새로 장착하는 것만** `REWARD_RETIRED`로 거부한다. 해제한 뒤에는 다시 장착할 수 없다.
> 카드의 RewardRef는 `retired: true` 표식을 실어 편집 UI가 구분하게 한다 (§4).
> 보유 목록 select(본인 RLS + 카탈로그 embed)에서는 은퇴 보상의 카탈로그가 `null`로 오므로 편집 후보에서 빠진다 `[코드]`.

### 1.1 개정 — `listed` (16a, 2026-10-02) `[사용자 승인]`

**왜.** 히든 업적 보상(예: 칭호 이름)이 카탈로그에 공개되면 **업적 이름이 달성 전에 드러난다** — 16 §1 "히든 업적은 달성 전 모든 정보를 숨긴다",
spec §9.2, 공백 **G5**. 위 정책 `using (retired = false)`로는 막을 방법이 없다.

```sql
alter table public.reward_catalog
  add column if not exists listed boolean not null default true;

drop policy if exists "Authenticated users can read live rewards" on public.reward_catalog;
create policy "Authenticated users can read live rewards"
on public.reward_catalog for select to authenticated
using (
  retired = false
  and (
    listed
    or exists (
      select 1 from public.user_reward_inventory owned
       where owned.reward_id = reward_catalog.reward_id
         and owned.user_id = (select auth.uid())
    )
  )
);
```

| 축 | 값 |
|---|---|
| `listed = true` (기본) | 지금까지와 같다 — 로그인 사용자 전체에 공개. **기존 6행(기본 아이콘)은 `true`** |
| `listed = false` | **보유자에게만 보인다.** 16a는 히든 업적 보상 15행을 `false`로 시드한다 |
| 본인 보유 예외가 필요한 이유 | 17b 편집기의 보유 목록 select(inventory → catalog embed)가 보유한 히든 보상에서 `null`이 되지 않게 하기 위해서다 |
| 장착 후 | **공개된다.** 카드 조회 RPC(§4)는 `security definer`라 이 정책과 무관하다 — 무엇을 **걸었는지**는 표시 정보다 (§3.2) |
| 테이블 ACL·RPC | **불변.** `authenticated` SELECT만, 쓰기 없음. §2·§3 DDL·§4 시그니처도 그대로다 |

**검증:** `supabase/tests/achievements_rewards_v1.sql` §1·§6 — 미보유자에게 비공개 0행 · 보유자에게 보유분만 · 미보유 히든 보상 장착 응답이
**존재하지 않는 ID와 같은 `REWARD_NOT_OWNED`**(존재 여부를 알려 주지 않는다). 기존 `c1_reward_tables_v1` 96건 회귀 0 `[산출물, 로컬, 기준 c6172fd, 2026-10-02]`.

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

> **2026-10-03 정정 (§0.-1):** 위는 17b 원문이다. 16d-2 forward migration이 `slot` CHECK에서 `badge`를 빼고(8종),
> `slot_index` CHECK를 **`slot_index = 1`** 로 바꾼다. 그 전에 `slot = 'badge'` 장착 행을 지운다(자동 재장착 없음).
> `slot_index` 컬럼과 PK는 호환을 위해 남긴다.

### 3.1 이 설계가 규칙 두 개를 구조로 강제한다

| 규칙 | 어떻게 강제되나 |
|---|---|
| **"보유하지 않은 보상은 장착할 수 없다"** (`01-CONFIRMED-SPEC.md` §10) | **복합 FK `(user_id, reward_id) → user_reward_inventory`.** RPC 로직이 아니라 **DB가 거부한다.** 보유가 취소되면 `on delete cascade`로 장착도 사라진다 |
| ~~**"대표 배지 최대 3개, 나머지는 1개"** (§10)~~ → **배지 폐지, 모든 slot 1개 (2026-10-03, §0.-1)** | ~~`slot_index` CHECK + PK. **4번째 배지를 넣을 자리가 없다**~~ → `slot_index = 1` CHECK + PK |

**추가 유니크 인덱스**는 같은 보상을 두 슬롯에 겹쳐 장착하는 것을 막는다.

> **막지 못하는 것 하나 — `kind`와 `slot`의 일치.**
> 프레임 보상을 `badge` 슬롯에 넣는 것은 이 DDL이 막지 못한다
> (`reward_catalog.kind`가 이 테이블에 없기 때문이다).
> **RPC가 검증한다**(§4). 대안은 `kind`를 비정규화해 FK에 포함하는 것인데,
> **카탈로그의 `kind`가 바뀌면 장착이 깨지므로 채택하지 않았다.** ~~`확인 필요` — 16 착수 시 재검토.~~
> → **확정 (③)** `[사용자 결정, 2026-10-01]` — CHECK는 다른 테이블을 볼 수 없고, 세 테이블 모두 쓰기 grant가 없어
> **장착 RPC가 유일한 쓰기 경로**이므로 RPC 검증으로 충분하다. 알 수 없는 slot도 어떤 kind와도 맞지 않아 `SLOT_KIND_MISMATCH`가 된다 `[코드]`.

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

-- 카드 배치 조회 (2026-10-01 추가). 랭킹 50행·그룹 대기실이 행마다 단건을 부르지 않게 한다.
create or replace function public.get_profile_cards_v1(
  p_user_ids uuid[]
) returns jsonb
```

| 함수 | 반환 | 실패 코드 |
|---|---|---|
| `equip_profile_reward_v1` | `{ok:true, equipment:[...]}` — **갱신 후 전체 장착 상태** | `AUTH_REQUIRED` · `REWARD_NOT_OWNED` · `SLOT_KIND_MISMATCH` · `SLOT_INDEX_INVALID` · `REWARD_RETIRED` |
| `unequip_profile_reward_v1` | 동일 | `AUTH_REQUIRED` · `SLOT_EMPTY` |
| `get_profile_card_v1` | `{ok:true, card:{...}}` — [C5](C5-PROFILE-CARD.md) §2의 형식 | `PROFILE_NOT_FOUND` |
| **`get_profile_cards_v1`** | `{ok:true, cards:{ "<user_id>": card, ... }}` — 카드 형식은 단건과 같다. **중복·`null` ID는 제거하고, 프로필이 없는 ID는 결과에서 빠진다.** 빈 입력·`null`은 `cards:{}` | `TOO_MANY_USERS` (중복 제거 후 100개 초과) |

- **전부 `security definer` + `set search_path = ''`**, `authenticated`에만 `execute`.
- **원자성:** 16 §5.3의 "원자적으로 갱신"은 단일 `insert ... on conflict (user_id, slot, slot_index) do update`로 충족된다. 별도 트랜잭션 제어가 필요 없다.
- **`REWARD_NOT_OWNED`는 FK 위반을 잡아 옮긴 것이다.** 함수가 미리 확인해도 되지만
  **최종 방어는 FK다.** 구현은 미리 확인하고(카탈로그에 없는 ID도 `REWARD_NOT_OWNED`), 그 사이 보유가 취소되면 FK 위반을 같은 코드로 바꾼다 `[코드]`.

### 4.1 구현에서 정해진 것 `[코드, 20261001090000]`

| 항목 | 값 |
|---|---|
| **배치 RPC** | `get_profile_cards_v1`은 이 계약 원문(RPC 3개)에 없던 **네 번째 RPC**다 `[사용자 결정, 2026-10-01]`. 단건 `get_profile_card_v1`은 **같은 내부 빌더**(`private.profile_cards_v1`)의 1개짜리 호출이라 카드 형태의 출처가 하나다. 상한 100 |
| **판정 순서** (`equip`) | `AUTH_REQUIRED` → `SLOT_INDEX_INVALID` → `REWARD_NOT_OWNED` → `REWARD_RETIRED` → `SLOT_KIND_MISMATCH`. `p_slot_index`가 `null`이면 1 |
| **이동** | 이미 다른 자리에 장착된 보상을 장착하면 **옮긴다**(원래 자리는 비고, 대상 자리의 기존 보상은 교체된다). `unique (user_id, reward_id)`를 지키는 방식이며 ~~배지 순서 변경이 이것이다~~ (배지 폐지 후 slot마다 자리가 1개라 순서 변경은 없다 — §0.-1) |
| **반환 `equipment[]`** | `{slot, slotIndex, rewardId, equippedAt, reward: RewardRef}` — 경기 표현 4종 슬롯 포함 전체 |
| **RewardRef** | C5 §2의 `{rewardId, displayName, assetRef}`에 **`kind`·`slotIndex`·`retired`가 덧붙는다** |
| **카드에 들어가는 슬롯** | ~~`profile_icon`·`title`·`badge`·`frame`·`background` 5종만.~~ → **`profile_icon`·`title`·`frame`·`background` 4종** — `badges` 키는 `[]` 상수로 남는다 (§0.-1, 16d-2). `path_color`·`path_effect`·`finish_effect`·`spectator_emoji`는 장착은 되지만 카드 키가 아니다 |
| **`active=false`** | 보유한 비활성 보상의 장착은 **막지 않는다** — 이 계약에 해당 실패 코드가 없다. ~~필요하면 16이 정한다 `확인 필요`~~ → **확정: 막지 않는다** `[사용자 결정, 2026-10-01 — 16 계획 판정]`. `active`는 **신규 지급**(16 지급 파이프라인이 `active=false` 보상을 건너뛴다) 여부이지 보유 무효가 아니다. RPC 무변경 |
| **실행 권한** | 4개 모두 `authenticated`·`service_role`. `anon`·`public`은 회수 |

---

## 5. 확정된 것 / 확인 필요

| 상태 | 항목 |
|---|---|
| **확정** | 3테이블 DDL · `kind`/`slot` ~~9종~~ → **8종** · ~~배지 3개 제한~~ → **배지 폐지 (2026-10-03, §0.-1)** · 보유 검증(FK) · RLS 3종 · RPC 3개 시그니처 · 멱등 지급 방식 · **배치 RPC `get_profile_cards_v1` (§4)** · **아래 ①~④** |
| ~~확인 필요~~ → **확정** `[사용자 결정, 2026-10-01 — 17b 착수 판정]` | ① **`reward_bundles`는 16 소유** (§0.1) ② **`retired` 장착은 유지, 신규 장착만 `REWARD_RETIRED`** (§1) ③ **`kind`↔`slot` 검증은 RPC** (§3.1) ④ **기본 프로필 아이콘 6종** — 아래 |
| ~~**확인 필요 (남은 것)**~~ → **확정** | ~~`active=false` 보유 보상의 장착 차단 여부 (§4.1) — 16이 정한다~~ → **막지 않는다** (§4.1) · **`listed` 개정** (§1.1) `[사용자 결정, 2026-10-01]`. **이 계약에 남은 `확인 필요`는 없다** |

> **④ — 기본 프로필 아이콘 6종** `[사용자 결정, 2026-10-01]` `[코드, 20261001090000]`
>
> | `reward_id` | `display_name` | `asset_ref` |
> |---|---|---|
> | `icon_default_compass` | 나침반 | `/profile-icons/compass.svg` |
> | `icon_default_book` | 펼친 책 | `/profile-icons/book.svg` |
> | `icon_default_globe` | 지구본 | `/profile-icons/globe.svg` |
> | `icon_default_lantern` | 등불 | `/profile-icons/lantern.svg` |
> | `icon_default_map` | 지도 | `/profile-icons/map.svg` |
> | `icon_default_quill` | 깃펜 | `/profile-icons/quill.svg` |
>
> - **지급 방식:** `system_default`로 **전원 보유.** migration이 기존 프로필 전원에 backfill하고, `profiles` **AFTER INSERT 트리거**
>   (`profiles_grant_default_profile_icons` → `private.grant_default_profile_icons_v1`)가 신규 가입자에게 준다.
>   가입은 Edge Function `username-signup`이 `profiles`에 insert하므로 **함수 재배포 없이** 덮인다. 지급은 PK 위 `on conflict do nothing`이라 멱등이다.
> - ID 목록의 단일 정의는 `private.default_profile_icon_ids_v1()`이다.
> - **아트는 임시 SVG다** (`public/profile-icons/*.svg`). ID는 바꾸지 않고(16 §1) 최종 아트는 `asset_ref`만 갱신해 교체한다.
>   정확한 아트 수량·외형은 디자인 단계에서 정한다 (`01-CONFIRMED-SPEC.md` §10).
