# C5 — 프로필 카드 렌더 계약

**소유자: 공통.** 패킷 15·16·17이 전부 이 계약을 따른다.
닫는 공백: **G10**. 공통 규칙은 [README](README.md).

**근거 문서:** `17-EXPLORATION-PROFILE-GUEST.md` §5·§5.1 · `01-CONFIRMED-SPEC.md` §10 ·
`21-SCREEN-MATRIX.md` §9·§10·§11 · Freeze v1 `07-12 ProfileIconFallback`·`07-13 Badge-0-1-3`.

> **이 계약에는 DDL이 없다.** 전부 프론트 규칙이므로 **다른 계약을 기다리지 않고 착수할 수 있다.**

## 0. ⚠ 정정 이력 — 동결 계약을 고칠 때의 기록

형식은 [C3](C3-LEVEL-STORAGE.md) §0 — ① 이 표에 남기고 ② 본문의 옛 값은 취소선 ③ 근거를 적는다.

| 날짜 | 무엇을 | 어떻게 | 왜 |
|---|---|---|---|
| **2026-10-03** | §2 카드 형태 `badges` · RewardRef `slotIndex` · §2.2 병합 키 · §3.4 screen reader 이름 · **§3.5 배지 0/1/3** · §4 프로필 표시 요소 · §6 확인 필요 ③ · **§3.6 신설(`asset_ref` 토큰)** | **배지 폐지.** 카드 요소 = 아이콘 · 칭호 · 프레임 · 배경. 렌더는 `badges`를 읽지 않는다(서버는 `[]`를 계속 싣는다). §3.5는 폐지, §6-③은 대상 소멸. 프레임·완주 효과·경로 색상의 모양은 **`asset_ref` 토큰**으로 정한다(§3.6) | **사용자 결정** `[2026-10-03 — docs/agent/16-HANDOFF.md §10]`. 토큰 문법은 `docs/design/DESIGN-SYSTEM.md` §4. **구현: 16d-1 프론트** — 그 전까지 코드는 옛 규칙 그대로다 |

> 이 정정의 근거는 **사용자 결정**이다 (spec §0 2026-10-03 · [C1](C1-REWARD-TABLES.md) §0.-1과 같은 건).

---

## 1. 문제 — 4곳이 서로 다르게 그린다 `[코드, 2026-09-02 실측]`

`17` §5.1이 이미 결함으로 기록했다: "프로필/공개 프로필/랭킹/그룹 참가자는 단일 이미지와
글자 placeholder를 서로 다르게 렌더링한다. **공통 fallback 컴포넌트 또는 동일 표시 계약이 필요하다.**"

**실측 결과 네 곳이 전부 다르다:**

| 위치 | 이미지 소스 | 이미지 없을 때 | 이름 fallback | `alt` |
|---|---|---|---|---|
| `ProfilePage.jsx:191-201` | `profiles.profile_image_url` | `.profile-avatar-placeholder` + 닉네임 첫 글자 | **`"-"`** (`:64`) | `"프로필 이미지"` |
| `RankingPage.jsx:145-150` | `record.profileImageUrl` | `.ranking-avatar-fallback` + 첫 글자 | **`"Unknown"`** (`:132`) | **`""` (빈 문자열)** |
| `GroupRoomPage.jsx:496-505` | `player.profile_image_snapshot` | **인라인 스타일** + 첫 글자 | **`"U"`** (`:503`) | `"avatar"` |
| `GroupGamePage.jsx:1330` 등 | **이미지 없음 — 이름만** | — | **`"참가자"`** | — |

**어긋난 축이 넷이다:** 이름 fallback 4종(`-` / `Unknown` / `U` / `참가자`) ·
CSS 클래스 3계열 + 인라인 1 · `alt` 3종(빈 문자열 포함) · 그룹 게임 화면에는 아바타 자체가 없다.

> **`alt=""`는 접근성 문제다.** `21-SCREEN-MATRIX.md` §11이 **"아이콘에 accessible name"**,
> **"프로필 아이콘 대체 텍스트"**를 완료 기준으로 요구한다.

---

## 2. 카드 데이터 계약

**모든 렌더 지점은 아래 형태를 받는다.** 출처가 달라도 **형태는 같다.**

```
ProfileCard {
  userId: uuid | null          // 게스트·탈퇴는 null
  nickname: string | null      // 없을 수 있다
  level: integer | null        // C3의 level_from_total_xp
  title: RewardRef | null      // 대표 칭호 1
  badges: RewardRef[]          // ~~최대 3. 없으면 []~~ → 폐지 (2026-10-03, §0) — 서버는 [] 상수, 렌더는 읽지 않는다
  icon: RewardRef | null       // 시스템 프로필 아이콘
  frame: RewardRef | null
  background: RewardRef | null
  legacyImageUrl: string | null  // profiles.profile_image_url 또는 스냅샷
  source: 'live' | 'snapshot'
}

RewardRef { rewardId: string, displayName: string, assetRef: string | null }
```

> **RewardRef 덧붙은 필드 (2026-10-01, 17b)** `[코드]` — 서버(C1 §4.1)는 위 세 필드에 더해
> **`kind`** · **`slotIndex`**(~~배지 순서, §3.5~~ → 배지 폐지 후 항상 1, §0) · **`retired`**(C1-② 은퇴 장착 표식)를 싣는다.
> 렌더 규칙은 이 셋에 의존하지 않고, 편집 UI가 `retired`로 "은퇴" 표식을 붙인다.
> 정규화는 `utils/profileCard.js`의 `normalizeRewardRef` · `cardFromServer`가 한다.

### 2.1 두 출처, 한 형태

| `source` | 어디서 | 쓰는 화면 |
|---|---|---|
| **`live`** | `get_profile_card_v1(user_id)` ([C1](C1-REWARD-TABLES.md) §4) | 프로필 · 공개 프로필 · 랭킹 |
| **`snapshot`** | `room_players.nickname_snapshot` · `profile_image_snapshot` `[코드]` | **그룹·1:1 참가자 행, 진행 중 화면** |

> **스냅샷을 유지하는 이유.** `room_players`가 참가 시점 값을 이미 들고 있고
> (`baseline:657-658`), **경기 중에 남의 프로필을 매번 조회하지 않기 위해서다.**
> `17` §5.1이 이 컬럼을 "호환 값"으로 기록해 두었다.
>
> ~~**`확인 필요`: 스냅샷을 꾸미기까지 확장할 것인가.**~~ → **확정 (②): 확장하지 않는다. 대기실은 실시간 배치 조회다**
> `[사용자 결정, 2026-10-01]`. 닉네임·이미지는 계속 스냅샷에서 읽고, **보상 슬롯 5개만** 대기실에서
> `get_profile_cards_v1`(C1 §4)을 **참가자 집합이 바뀔 때만 1회** 불러 덧씌운다 (`hooks/useProfileCards.js` →
> `mergeRewardSlots`). 이 병합은 `source`를 바꾸지 않는다 — 행은 여전히 `snapshot`이다.
> **스냅샷 DDL은 없다.** 경기 중 화면(`GroupGamePage`, 동결)과 1:1 화면(트랙 C 소유)은 아직 적용 대상이 아니다.

### 2.2 live 보상 병합 — 지점이 가진 행 데이터는 그대로 둔다 `[코드, 2026-10-01]`

| 함수 | 역할 |
|---|---|
| `mergeRewardSlots(rowCard, serverCard)` | `icon`·`title`·~~`badges`·~~`frame`·`background`만 서버 카드에서 가져온다 (배지 폐지, §0). 닉네임·레벨·`legacyImageUrl`·`source`는 행 값을 유지한다. 서버 카드가 없거나 조회가 실패하면 **행 그대로** 그린다 |
| `applyEquipment(card, equipment[])` | 장착·해제 응답(전체 장착 상태)으로 슬롯을 다시 만든다. **서버가 확정한 상태만 표시한다** (spec §10) |

**N+1 금지.** 행 목록 화면(랭킹·대기실)은 행마다 단건을 부르지 않고 배치 1회를 쓴다. 단건 `get_profile_card_v1`은 프로필·공개 프로필 모달만 쓴다.

---

## 3. 렌더 규칙 — 4곳 공통

### 3.1 이미지 우선순위 (**위에서부터, 먼저 있는 것을 쓴다**)

1. **`icon.assetRef`** — 시스템 제공 프로필 아이콘 (`01-CONFIRMED-SPEC.md` §10)
2. **`legacyImageUrl`** — 기존 `profile_image_url` 또는 참가 시점 스냅샷
3. **이니셜 placeholder** — `nickname`의 첫 글자 대문자
4. **시스템 기본 이미지** — 닉네임도 없을 때

> **2번을 지운다는 뜻이 아니다.** `01-CONFIRMED-SPEC.md` §10과 `17` §5는
> **"삭제하거나 파괴적으로 변환하지 않고 `legacy avatar/profile icon` fallback으로 호환한다"**
> 를 요구한다. **업로드 UI는 없어지지만 값은 계속 읽는다.**

### 3.2 에셋 로딩 실패

`21-SCREEN-MATRIX.md` §10의 `profile asset error` 상태:
**"시스템 기본 이미지·장착 상태는 유지"** `[문서]`.

→ **`onError`에서 3단계(이니셜)로 내려간다. 장착 상태 데이터는 건드리지 않는다.**
Freeze v1 `07-12 ProfileIconFallback`이 같은 화면이다.

### 3.3 이름 fallback — **하나로 통일한다**

| 상황 | 표시 |
|---|---|
| `nickname`이 있다 | 그대로 |
| 없고 그룹·1:1 참가자 행 | **`"참가자"`** |
| 없고 그 외 | **`"탐험가"`** `확인 필요` |

> **현재의 `-` / `Unknown` / `U`는 전부 폐기한다.**
> `Unknown`은 한국어 화면에 영어가 섞이고, `-`는 이름으로 읽히지 않으며,
> `U`는 이니셜 자리에만 맞는 값이다.
>
> **`"탐험가"`는 제안이다.** 확정 스펙에 근거 문자열이 없어 `확인 필요`로 둔다.
> **`"참가자"`는 `GroupGamePage`가 이미 쓰는 값이라 근거가 있다** `[코드]`.

### 3.4 접근성 — 전 지점 공통

| 규칙 | 근거 |
|---|---|
| 아바타 `alt`는 **`"{이름}의 프로필 이미지"`**. **빈 `alt` 금지** | `21-SCREEN-MATRIX.md` §11 "아이콘에 accessible name", "프로필 아이콘 대체 텍스트" |
| 장착 보상은 **screen reader 이름**을 갖는다 — ~~배지·~~칭호·프레임 (§0) | §11 "보상 장착 상태의 screen reader 이름" |
| **색상만으로 상태를 구분하지 않는다** | §11 |
| 터치 대상 **44×44px 이상** | §11 |

### 3.5 ~~배지 0/1/3~~ → **폐지 (2026-10-03, §0)**

~~Freeze v1 `07-13 Badge-0-1-3`이 세 상태를 다룬다.~~ 배지 kind가 없어졌으므로 아래 표는 기록으로만 남는다. Freeze v1의 `07-13 Badge-0-1-3`·`07-17 BadgeEquipFlow`는 대응 화면이 없다.

| 개수 | 규칙 |
|---|---|
| 0 | **자리를 비워 두지 않는다.** 배지 영역 자체를 렌더하지 않는다 `확인 필요` |
| 1~3 | 순서대로. **[C1](C1-REWARD-TABLES.md) §3의 `slot_index` 순** |
| 4+ | **발생할 수 없다** — `slot_index` CHECK가 막는다 |

### 3.6 `asset_ref` 토큰 — 프레임 · 완주 효과 · 경로 색상 (2026-10-03, §0)

| kind | `asset_ref` | 렌더 |
|---|---|---|
| `profile_icon` | 루트 상대 URL (`/profile-icons/…svg`) | 그대로 `<img src>` (§3.1 1단계) |
| `frame` | `frame:tier-1` · `frame:tier-2` · `frame:tier-3` · `frame:special` | 단계별 링. 알 수 없거나 `null`이면 기본 링 |
| `finish_effect` | `finish:tier-1..3` · `finish:special` | 결과 화면 완주 연출 (카드 요소 아님) |
| `path_color` | `path:blue` · `path:purple` · `path:gold` · `path:teal` · `path:coral` | 결과 화면 경로 선·노드 색 (카드 요소 아님) |

**모양은 `reward_id`로 정하지 않는다** — 히든 보상 ID가 프론트에 들어가면 G5를 깬다. 색·모양의 정의는 `docs/design/DESIGN-SYSTEM.md`. 모션은 `prefers-reduced-motion: reduce`에서 정적.

---

## 4. 4개 지점별 적용 범위

| 지점 | source | 표시 요소 | 비고 |
|---|---|---|---|
| **프로필** (`ProfilePage`) | `live` | 전부 — 아이콘·칭호·~~배지 3·~~프레임·배경·레벨 (§0) | 장착 편집 진입점 |
| **공개 프로필** | `live` | 전부. **편집 없음** | Freeze v1 `02-03` |
| **랭킹** (`RankingPage`) | `live` | 아이콘·닉네임·레벨·**칭호** | `21-SCREEN-MATRIX.md` §1 "닉네임·레벨·대표 칭호". 보상 슬롯은 배치 1회 (§2.2) |
| **그룹 참가자 행** | `snapshot` + live 보상 병합 | 아이콘·닉네임·**칭호** | §5. ~~칭호는 §2.1의 `확인 필요`에 걸린다~~ → **§2.1 확정 — 대기실(`GroupRoomPage`)에서 배치 병합** (2026-10-01) |
| (결과 화면) | `live` | 프로필 카드 표시 | `17` §5.1: **"결과 화면은 프로필 카드 표시를 아직 제공하지 않는다"** — 신규 |

> **`17` §5.1이 결과 화면을 별도로 짚었다.** 4곳이 아니라 **5곳이 된다.**
> 이 계약은 5곳 전부에 적용된다.

---

## 5. 구현 형태

**공통 컴포넌트 하나를 만든다.**

```
components/ProfileCard.jsx      ← 신규. §2의 형태를 받아 §3 규칙대로 그린다
components/ProfileAvatar.jsx    ← 신규. §3.1~§3.4의 이미지·이니셜·alt만 담당
```

| 규칙 | 이유 |
|---|---|
| **네 지점이 같은 컴포넌트를 쓴다** | `17` §8 "프로필·랭킹·그룹 참가자·결과가 같은 프로필 카드 fallback 규칙을 사용한다" |
| **크기·밀도만 prop으로 받는다** (`size`, `density`) | 랭킹 행과 프로필 헤더는 크기가 다르지만 **fallback 규칙은 같아야 한다** |
| **인라인 스타일을 쓰지 않는다** | `GroupRoomPage.jsx:500`의 현재 인라인 스타일이 불일치의 원인 중 하나다 |
| **모바일: 카드 다음에 보상 inventory를 접는다** | `21-SCREEN-MATRIX.md` §9, `17` §5 |

---

## 6. 확정된 것 / 확인 필요

| 상태 | 항목 |
|---|---|
| **확정** | **불일치 4축 실측** · 카드 데이터 형태 · **두 출처 한 형태(`live`/`snapshot`)** · 이미지 우선순위 4단계 · legacy 보존 · 에셋 실패 시 동작 · 접근성 4규칙(**빈 `alt` 금지 포함**) · 공통 컴포넌트 2개 · **적용 지점이 4곳이 아니라 5곳** |
| **확정 (2026-10-01, 17b)** `[사용자 결정]` | ② **스냅샷 확장 없음 — 대기실은 live 배치 병합** (§2.1·§2.2). DDL 0 · RewardRef 덧붙은 필드 `kind`·`slotIndex`·`retired` (§2) |
| **부분 해소** | ④ **시스템 제공 프로필 아이콘 6종은 임시 SVG로 존재한다** ([C1](C1-REWARD-TABLES.md) §5-④, `public/profile-icons/*.svg`) — §3.1의 **1단계(`icon.assetRef`)** 에 쓰인다. **§3.1 4단계 "시스템 기본 이미지"(닉네임도 없을 때)의 실물은 여전히 중립 도형이다** `확인 필요`. 최종 아트는 디자인 단계 |
| **확인 필요 (남은 것)** | ① **이름 fallback `"탐험가"`** — 근거 문자열이 스펙에 없다 ~~③ 배지 0개일 때 영역을 숨길지 자리를 남길지 (현재 구현: 숨김)~~ → **대상 소멸 — 배지 폐지 (§0)** ④의 남은 부분(위) |

> ~~**②가 이 계약에서 유일하게 DDL로 번질 수 있는 항목이다.**~~ → **②는 DDL 없이 닫혔다.** 남은 항목은 전부 프론트에서 닫힌다.
