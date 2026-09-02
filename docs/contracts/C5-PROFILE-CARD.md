# C5 — 프로필 카드 렌더 계약

**소유자: 공통.** 패킷 15·16·17이 전부 이 계약을 따른다.
닫는 공백: **G10**. 공통 규칙은 [README](README.md).

**근거 문서:** `17-EXPLORATION-PROFILE-GUEST.md` §5·§5.1 · `01-CONFIRMED-SPEC.md` §10 ·
`21-SCREEN-MATRIX.md` §9·§10·§11 · Freeze v1 `07-12 ProfileIconFallback`·`07-13 Badge-0-1-3`.

> **이 계약에는 DDL이 없다.** 전부 프론트 규칙이므로 **다른 계약을 기다리지 않고 착수할 수 있다.**

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
  badges: RewardRef[]          // 최대 3. 없으면 []
  icon: RewardRef | null       // 시스템 프로필 아이콘
  frame: RewardRef | null
  background: RewardRef | null
  legacyImageUrl: string | null  // profiles.profile_image_url 또는 스냅샷
  source: 'live' | 'snapshot'
}

RewardRef { rewardId: string, displayName: string, assetRef: string | null }
```

### 2.1 두 출처, 한 형태

| `source` | 어디서 | 쓰는 화면 |
|---|---|---|
| **`live`** | `get_profile_card_v1(user_id)` ([C1](C1-REWARD-TABLES.md) §4) | 프로필 · 공개 프로필 · 랭킹 |
| **`snapshot`** | `room_players.nickname_snapshot` · `profile_image_snapshot` `[코드]` | **그룹·1:1 참가자 행, 진행 중 화면** |

> **스냅샷을 유지하는 이유.** `room_players`가 참가 시점 값을 이미 들고 있고
> (`baseline:657-658`), **경기 중에 남의 프로필을 매번 조회하지 않기 위해서다.**
> `17` §5.1이 이 컬럼을 "호환 값"으로 기록해 두었다.
>
> **`확인 필요`: 스냅샷을 꾸미기까지 확장할 것인가.** 지금은 닉네임·이미지 2개뿐이다.
> 참가자 행에 칭호·배지를 보이려면(`21-SCREEN-MATRIX.md` §5가 "대표 칭호"를 요구한다)
> **스냅샷 컬럼을 늘리거나 실시간 조회로 바꿔야 한다.** 전자는 DDL, 후자는 쿼리 비용이다.
> **17 착수 시 결정한다.**

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
| 장착 보상은 **screen reader 이름**을 갖는다 — 배지·칭호·프레임 | §11 "보상 장착 상태의 screen reader 이름" |
| **색상만으로 상태를 구분하지 않는다** | §11 |
| 터치 대상 **44×44px 이상** | §11 |

### 3.5 배지 0/1/3

Freeze v1 `07-13 Badge-0-1-3`이 세 상태를 다룬다.

| 개수 | 규칙 |
|---|---|
| 0 | **자리를 비워 두지 않는다.** 배지 영역 자체를 렌더하지 않는다 `확인 필요` |
| 1~3 | 순서대로. **[C1](C1-REWARD-TABLES.md) §3의 `slot_index` 순** |
| 4+ | **발생할 수 없다** — `slot_index` CHECK가 막는다 |

---

## 4. 4개 지점별 적용 범위

| 지점 | source | 표시 요소 | 비고 |
|---|---|---|---|
| **프로필** (`ProfilePage`) | `live` | 전부 — 아이콘·칭호·배지 3·프레임·배경·레벨 | 장착 편집 진입점 |
| **공개 프로필** | `live` | 전부. **편집 없음** | Freeze v1 `02-03` |
| **랭킹** (`RankingPage`) | `live` | 아이콘·닉네임·레벨·**칭호** | `21-SCREEN-MATRIX.md` §1 "닉네임·레벨·대표 칭호" |
| **그룹 참가자 행** | `snapshot` | 아이콘·닉네임·**칭호** | §5. **칭호는 §2.1의 `확인 필요`에 걸린다** |
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
| **확인 필요** | ① **이름 fallback `"탐험가"`** — 근거 문자열이 스펙에 없다 ② **참가자 행에 칭호를 보이려면 스냅샷 확장이 필요하다**(§2.1) — DDL 여부가 갈린다 ③ 배지 0개일 때 영역을 숨길지 자리를 남길지 ④ **시스템 기본 이미지의 실물** — `01-CONFIRMED-SPEC.md` §10이 "시스템 제공 4~6종"이라고만 한다 ([C1](C1-REWARD-TABLES.md) §5-④와 같은 항목) |

> **②가 이 계약에서 유일하게 DDL로 번질 수 있는 항목이다.** 나머지는 전부 프론트에서 닫힌다.
