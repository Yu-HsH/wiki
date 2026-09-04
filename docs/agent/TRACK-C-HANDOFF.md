# 트랙 C → 통합 세션 인계

작성: 2026-09-04 · 분기점 `1234c37` · worktree `C:\Project\wiki-c` · 브랜치 `feat/track-c`

> **이 파일은 트랙 C가 만든다. `TRACKS.md`·`CURRENT.md`·`docs/contracts/`는 수정 금지이므로
> (§8-C 제약), 그 문서들에 반영해야 할 것을 여기 모아 통합 세션에 넘긴다.**
> 트랙이 SSOT를 직접 고치지 않는 것은 `AGENTS.md` §7의 트랙 예외 그대로다.

---

## 1. `TRACKS.md` §2.3-① 불변식을 교체해야 한다 — **개수 → 배열 검사**

`[사용자 판정, 2026-09-04]`

### 현재 문구

> **`grep -c 'highlight_links' data/itemPools.js` = 2 유지**
> (§2.3-① · §8-C 수용조건 ③)

### 왜 틀렸는가 — 두 가지가 겹쳤다

| # | 문제 | 근거 |
|:-:|---|---|
| **1** | **G7 결정 이후 2는 달성 불가능하다** | 원래의 2 = `SINGLE_ITEM_IDS` 1 + `MULTI_ITEM_IDS` 1. **후자를 빼는 것이 G7 결정(A안) 자체다.** 코드 등장은 필연적으로 1이 된다 `[코드, 2026-09-04]` |
| **2** | **`grep -c`가 주석까지 센다** | 이 트랙이 `MULTI_ITEM_IDS` 위에 변경 이유 주석을 달자 합계가 **3**이 됐다. 2로 맞추려면 **설명을 깎아야 했다** — 실제로 한 번 깎았다가 되돌렸다 |

**불변식이 문서 품질을 떨어뜨리면 그 불변식이 틀린 것이다.** 지키려던 것은 개수가 아니라
**"`SINGLE_ITEM_IDS`가 그대로인가"** 다.

### 교체 제안

> **`SINGLE_ITEM_IDS`가 `["highlight_links", "search_once", "go_back", "random_teleport"]`와
> 순서까지 일치한다.** 기계 검사는 `tests/duelItemAuthority.test.js`가 갖는다.
> **`grep -c`는 쓰지 않는다** — 주석을 세므로 문서를 깎게 만든다.

**현재 상태:** `SINGLE_ITEM_IDS` 블록은 분기점 `1234c37`과 **byte 동일**이고,
`grep -c 'highlight_links' data/itemPools.js`는 **3**이다 (코드 1 + 주석 2).
**셋 다 정상이다.**

### 같은 성격의 불변식 점검 — §2.3 전수 `[코드, 2026-09-04]`

| # | 불변식 | 형태 | 판정 |
|:-:|---|---|---|
| **①** | `grep -c 'highlight_links' data/itemPools.js` = 2 | 식별자 개수 | **취약 + 달성 불가.** 위 참조 |
| **③** | `grep -c 'itemSystem\.' pages/GamePage.jsx` = 13 | 멤버 접근 개수 | **같은 취약성.** `itemSystem.` 을 언급하는 주석 한 줄이면 14가 된다. 다만 파일이 **트랙 B 소유**이고 C는 읽기만 하므로 이번 웨이브에서는 드러나지 않는다. **교체 제안: `useItemSystem` 반환 키 13개를 배열로 assert** |
| **④** | `grep -rc '"wiki-single-items"'` 합계 = 6 | 리터럴 개수 | **같은 취약성이고, 회피가 두 번 일어났다.** ⓐ `tests/explorationRecords.test.js:28-35`의 주석이 이 키를 설명하면서 **일부러 따옴표로 적지 않는다.** ⓑ 이 트랙이 `tests/duelItemAuthority.test.js`의 주석에 그 키를 인용했다가 **합계가 즉시 7이 되어 되돌렸다** `[2026-09-04 실측]`. **④는 ①과 달리 지키는 대상이 실재한다**(복제된 리터럴 4파일) — 그래서 개수를 유지하되, **검사 형태는 "네 파일이 같은 키를 쓴다"를 assert하는 쪽으로 옮기는 것이 맞다** |
| **⑤** | `grep -c '^\.mp-' css/multiplayer.css` = 131 | **줄머리 앵커** | **견고하다.** 주석은 `.mp-`로 줄을 시작할 수 없다. 이 형태가 모범이다 |
| ② ⑥ ⑦ | 동결·어휘·반환 형태 | 개수 아님 | 해당 없음 |

**요지: 개수 세기 불변식은 ⑤처럼 앵커가 있을 때만 쓴다.** 식별자·리터럴을 세는 ①③④는
**해당 자료구조를 직접 assert하는 테스트로 옮기는 것이 맞다.**

---

## 2. `TRACKS.md` §2.4 migration 파일명 — C 블록이 바뀌었다

| | 예약 | **실제** |
|---|---|---|
| C | `20260903100000_duel_item_authority_v3.sql` | **`20260904090000_duel_item_authority_v3.sql`** |

**사용자 확정 (2026-09-04):** "오늘 날짜다. 15a의 날짜 어긋남을 반복하지 않는다."
§2.4가 D에 대해 기록한 ⚠(파일명 timestamp가 작성일과 하루 어긋남)의 재발을 막는 결정이다.
**순서 관계는 그대로 유지된다** — `20260904090000 > 20260903090000 > 20260814123000`.

---

## 3. G7 부수 결정 4건 — 계약 문서에 반영이 필요할 수 있다

`[사용자 확정, 2026-09-04]`

| # | 결정 | 영향 |
|:-:|---|---|
| **Q2** | `cleanse_shield`는 **spec §5.4를 따른다** — 8초·첫 공격 1회 차단. 기존 "10초 면역 + 방해 해제"를 대체한다 | `PACKET-CONTRACT-GAPS.md` §1.2가 `확인 필요`로 남긴 **"`cleanse_shield`↔`edit_protection` 수치 일치"가 닫혔다.** 코드의 10초(`data/items.js:65`)와 7초(`MultiplayerGamePage.jsx:213`) 불일치도 정리 대상으로 등재 |
| **Q3** | `random_teleport`는 **기존 동작 유지** (현재 문서의 랜덤 유효 링크). 표시명만 "특수:임의 문서" | **spec §5.5 미충족 부채.** 등재 지점은 `data/duelItems.js` 머리 주석. 진짜 무작위 문서 풀은 후속 |
| **Q5** | `mini_game` **발동 경로 제거 승인.** 정의(`data/items.js`)와 `room_events`의 `mini_game_*` 3종은 **보존** | §8-C 범위 밖 ⑥ "event_type 유지 여부만 문서로 결정"의 **답이다 — 유지한다** |
| **Q6** | `room_events.event_type` = **`duel_item_event` 단일값** + payload 판별 | `PACKET-CONTRACT-GAPS.md` §3.3의 "14가 결정해야 할 것 3가지" 중 **1번이 닫혔다** |

---

## 3.1 스펙 공백 2건이 결정으로 닫혔다 — 확정 스펙에 반영이 필요하다

`[사용자 확정, 2026-09-04]` · 구현 위치 `supabase/migrations/20260904090000_duel_item_authority_v3.sql`

**둘 다 `01-CONFIRMED-SPEC.md` §5가 답을 갖고 있지 않아 트랙이 멈춘 지점이었다.**
스펙 문서를 고치는 것은 트랙 밖이므로 여기 남긴다.

| # | 스펙이 말하지 않은 것 | **결정** | 근거 |
|:-:|---|---|---|
| **1** | **편집 보호와 역링크가 동시에 대기 중일 때** 무엇이 먼저인가. §5.4가 둘을 따로 정의하고 우선순위를 말하지 않는다 | **편집 보호 우선** | 방어는 **맞지 않는 것**이고 반사는 **맞고 되돌려주는 것**이다. 보호가 먼저 먹으면 공격이 성립하지 않으므로 **반사할 대상 자체가 없다** — 순서가 아니라 인과다. 그리고 **보호 소진이 반사 소진보다 손해가 작다** |
| **2** | **역사 되감기에서 한쪽만 직전 문서가 있을 때.** §5.5는 "각각 자신의 직전 문서로 **동시에** 이동시킨다"까지만 말한다 | **가능한 쪽만 이동.** 양쪽 다 불가일 때만 미소비 거부 | **미소비 거부는 조커 하나를 통째로 날리는 것이라 과하다.** §5.5의 "동시에"는 **양쪽 이력이 있는 정상 케이스 전제**이지 예외를 거부로 처리하라는 뜻이 아니다 |

> **②에는 조건이 붙었다** — `room_events` payload에 **`rewoundUserIds`로 실제로 이동한 대상을 남긴다.**
> 없으면 한쪽만 움직인 것을 사용자가 **버그로 읽는다.** pgTAP가 그 키의 존재까지 검사한다.

**초안 단계에서는 둘 다 반대로 구현했다가 뒤집었다** — 반사 우선 · 미소비 거부.
migration 주석의 `확인 필요` 표시는 `사용자 확정 2026-09-04`로 교체됐고 근거가 함께 적혀 있다.

## 3.2 ⚠ 다음 트랙이 밟지 않아야 할 함정 — `now()`는 경과 시간을 재지 못한다

`[코드, 2026-09-04 실측]`

**`now()`는 트랜잭션 타임스탬프다. 한 트랜잭션 안에서 절대 움직이지 않는다.**

```
select now() = now(), now() = clock_timestamp();   →   t | f
```

트랙 C가 쿨타임(2.5초)과 지속효과 만료를 `now()`로 재도록 처음 작성했고,
**롤백 스모크에서 `pg_sleep(2.6)` 뒤에도 쿨타임이 풀리지 않아** 발견했다.
운영에서는 RPC 호출마다 트랜잭션이 갈리므로 **증상이 드러나지 않는 종류의 결함**이다 —
드러나는 것은 한 트랜잭션이 길어질 때, 즉 **가장 나쁜 순간**이다.

**저장소가 이미 같은 결론에 도달해 있었다.** 그룹 관전 이모티콘의 rate limit이
`clock_timestamp()`를 쓴다 (`20260814123000:70`·`:106`). 트랙 C는 그 선례에 맞췄다.

| 무엇을 재는가 | 써야 할 것 |
|---|---|
| **쿨타임·rate limit·지속효과 만료 — 경과 시간** | **`clock_timestamp()`** |
| 행의 생성·갱신 시각 (한 트랜잭션이 한 시점이어야 하는 것) | `now()` — `apply_duel_move_v2`가 그렇게 한다 |

**패킷 16(업적 쿨다운)·17(일일 경계)이 같은 함정을 밟을 자리에 있다.**

---

## 3.3 P4 이어받기 — 세션 인계 `[2026-09-04]`

**P1~P3(서버)이 끝났고 P4부터 프론트다.** 성격이 바뀌었고 이 세션이 migration 1040줄 +
pgTAP 1005줄을 담고 있어, **P4~P8은 새 세션에서 이어간다** `[사용자 결정]`.

### 완료된 커밋과 산출물

| 단계 | 커밋 | 산출물 |
|:-:|---|---|
| **P1** | `ec64787` | `data/duelItems.js` **신규 307줄** · `data/itemPools.js` `MULTI_ITEM_IDS`만 교체 |
| **P1-보강** | `1f6f25b` | `tests/duelItemAuthority.test.js` **신규 92줄(5건)** · 이 문서 §1 · `itemPools.js` 주석 복원 |
| **P2** | `dbebe8f` | `supabase/migrations/20260904090000_duel_item_authority_v3.sql` **신규 1040줄** |
| **P3** | `c8cdf67` | `supabase/tests/duel_item_authority_v3.sql` **신규 1005줄(143건)** · `duel_item_concurrency_v3.ps1` **신규 233줄** · migration 89줄 수정(판정 2건 반영) · 이 문서 §3.1·§3.2 |
| **P3-보강** | `5b1aead` | 하네스가 실패한 시나리오에도 `PASS`를 찍던 결함 수정 |

**기준선 (`5b1aead`, 2026-09-04):** `npm test` **265/265** · pgTAP **143/143 `not ok` 0** ·
`supabase:preflight` **11/11** · 동시성 하네스 **3시나리오 x 5회 exit 0, 데드락 0** ·
저장소 migration **14개**, **운영은 12개 그대로** (R6).

### 남은 단계와 검증 게이트

| 단계 | 내용 | **게이트** |
|:-:|---|---|
| **P4** | `services/duelItemService.js` **신규** — RPC 3개 래퍼 + 응답 정규화 | `tests/duelItemAuthority.test.js` 확장 · `npm test` 통과 |
| **P5** | `components/DuelItemBar.jsx` **신규** (5슬롯 HUD, `link_preview` UI 포함 — Q4) + `css/multiplayer.css` **추가만** | **`grep -c '^\.mp-' css/multiplayer.css` = 131 유지** (개명·삭제 0건) · `ItemBar.jsx` **무수정** |
| **P6** | **`pages/MultiplayerGamePage.jsx` 이전** — 아래 별도 항목 | **`grep -rn 'from("room_events").insert' pages components services` = 0건** · `navigate("/multiplayer", { replace: true })` **3곳 유지** |
| **P7** | `pages/MultiplayerPage.jsx` 아이템 설명 10개를 새 카탈로그로 | `tests/appRouting.test.js` 통과 · 신규 파일에 `"/main"` 리터럴 0 |
| **P8** | 전량 검증 | `npm test` 전량 · `npm run build` exit 0 · preflight 11/11 · pgTAP 재실행 · **§2.3 불변식 7개 전수 재측정** · 2세션 수동 스모크 |

### ⚠ P6이 가장 크고 위험하다

**`pages/MultiplayerGamePage.jsx` 1458줄에 세 가지가 한꺼번에 들어간다.**

| # | 무엇을 | 지금 어디에 |
|:-:|---|---|
| **1** | **localStorage 인벤토리 제거** | 지급 `:508-565` · 소비 `markUsed :568-582` · 복구 `:418-426`·`:514-524`. **키 `wiki-mp-game:{roomId}:{userId}`의 이동 상태(`currentTitle`·`pathTitles`·`historyStack`·`clickCount`)는 그대로 둔다** — 인벤토리 필드만 걷어낸다 |
| **2** | **수신 switch 재작성** | `handleIncomingEvent :886-1006`. 아이템 ID별 8분기를 **`duel_item_event` 1값 + `payload.result` 기반**으로 바꾼다. **`mini_game_*` 3분기는 보존** (Q5 조건). 클라이언트가 스스로 차단·반사를 판정하던 `isImmune()` 경로(`:216-222`·`:901`·`:913`·`:934`)가 전부 사라진다 — **서버가 준 `result`를 읽는다** |
| **3** | **복구 경로 교체** | `recoverGame :396-462`이 읽던 인벤토리를 `get_duel_item_state_v3`로. 쿨타임·지속효과·보호 대기가 전부 서버에서 온다 |

그리고 **`emitRoomEvent :191-204`를 지운다** — 저장소에서 `from("room_events").insert`를
하는 **유일한 지점**이고, 그 0건이 **G2-② 창의 선행 조건**이다 (`TRACKS.md` §7.4-③).

**권고: P6을 한 커밋으로 만들지 않는다.** 위 1·2·3 + `emitRoomEvent` 제거를 나눠
각 단계마다 `npm test`와 불변식 grep을 돌린다. 되돌림 단위를 작게 유지하는 것이
이 파일에서 특히 중요하다 — **1:1 결과 화면(`:1437-1454`)도 같은 파일에 있다.**

### RPC 3개 — 시그니처와 반환

**전부 `security definer` · `search_path=""` · `jsonb` 반환.**
ACL 실측: 공개 3개 `{postgres, authenticated, service_role}` — **`anon` 없음, `PUBLIC` 아님.**

```
public.ensure_duel_item_grant_v3(p_room_id uuid)
  → {ok, code: GRANTED|ITEMS_DISABLED, use_items, grants[], server_now}

public.get_duel_item_state_v3(p_room_id uuid)
  → {ok, code: STATE, use_items, room_status, grants[],
     cooldown_until, active_effects[], pending_defenses[], server_now}

public.use_duel_item_v3(p_room_id uuid, p_grant_id uuid,
                        p_request_id uuid, p_correlation_id uuid default null)
  → {ok, code: ITEM_USED, result, item_id, target_user_id, item_event_id,
     room_event_id, effect_expires_at, cooldown_until, metadata,
     room, player, opponent, server_now}
```

`grants[]` 행은 `{id, room_id, user_id, slot_index, slot_role, is_wildcard, item_id,
consumed_at, consumed_event_id, created_at}` — `data/duelItems.js`의 `buildDuelInventory()`가
이 형태를 받도록 이미 작성돼 있다.

`result`는 **`applied` · `blocked` · `reflected` · `void`** 4값 (`DUEL_ITEM_RESULT`).
`metadata`는 `link_censorship`이면 `{censoredTitles: [...]}`, `history_rewind`면
`{rewoundUserIds: [...]}`.

### 실패 코드 — pgTAP가 고정한 것

**`{ok: false, code}`로 반환** (12종). 클라이언트가 분기해야 하는 것들이다:

| 코드 | 언제 |
|---|---|
| `ITEMS_DISABLED` | `use_items = false` 방 |
| `GAME_NOT_ACTIVE` | 방이나 플레이어가 `playing`이 아니다 — **완주 확정 뒤 도착한 이벤트 포함** |
| `ITEM_NOT_OWNED` | 남의 슬롯이거나 다른 방의 슬롯 |
| `ITEM_ALREADY_USED` | 이미 쓴 슬롯. **쿨타임보다 먼저 검사한다** |
| `ITEM_COOLDOWN` | 2.5초 공통 쿨타임. `cooldown_until` 동봉 |
| `ITEM_NOT_IN_CATALOG` | 서버 카탈로그에 없는 `item_id` |
| `OPPONENT_NOT_FOUND` | 공격인데 상대 행이 없다 |
| `NO_ELIGIBLE_LINK` | 강제 이동·텔레포트할 링크가 없다 — **아이템을 소비하지 않는다** |
| `UNDO_UNAVAILABLE` | 되돌릴 이동이 없다 (시작 문서) — **미소비** |
| `REWIND_UNAVAILABLE` | 양쪽 다 직전 문서가 없다 — **미소비** |
| `LINK_SNAPSHOT_MISSING` | 목적지 revision을 해석하지 못했다 |
| `ITEM_MOVE_REJECTED` | 헬퍼가 위 사유 없이 거부했다 (방어적) |

**`raise exception`으로 던지는 것 6종** — `try/catch`가 필요하다:
`AUTH_REQUIRED` · `REQUEST_ID_REQUIRED` · `DUEL_ROOM_NOT_FOUND` · `NOT_A_PARTICIPANT` ·
`DUEL_PARTICIPANTS_REQUIRED` · `DUEL_ITEM_POOL_EXHAUSTED`.

> **미소비 3종(`NO_ELIGIBLE_LINK`·`UNDO_UNAVAILABLE`·`REWIND_UNAVAILABLE`)은 HUD가
> 슬롯을 되살려야 한다.** 나머지는 슬롯 상태가 그대로다.

### P4가 재사용할 것

| 대상 | 위치 | 비고 |
|---|---|---|
| `createRequestId()` · `createCorrelationId()` | **`utils/serverAuthority.js`** | **동결 파일.** 읽기 전용 import만 한다 (§2.1). `services/multiplayerService.js:3`이 이미 그렇게 쓴다 |
| `normalizeRpcRow(data)` 형태 | `services/multiplayerService.js:12-14` | `Array.isArray(data) ? data[0] \|\| null : data \|\| null`. **C 소유 파일이지만 복사해 쓰는 편이 낫다** — 그 파일의 export 목록을 넓히면 소비자가 늘어난다 |
| `requireSupabase()` 형태 | 같은 파일 `:6-10` | 동일 |
| `buildDuelInventory()` · `canUseDuelItem()` | **`data/duelItems.js`** (P1 산출) | 서버 행 → HUD 형태. **이미 서버 반환 형태에 맞춰 작성돼 있다** |
| `getDuelResultLabel()` | `utils/resultReasonLabels.js` | **B 소유. 읽기 전용 호출만** (§2.2) |

---

## 4. 미해결로 남기는 것

- **G2-② `room_events` INSERT 권한 회수** — C의 산출이 아니다. C가 클라이언트 INSERT를
  0건으로 만들고 **프론트가 배포된 뒤** 별도 창에서 회수한다 (§7.4). C는 경로만 만든다.
- **`docs/design/ITEM-IDEAS.md`** — 새 아이템 아이디어(삭제 토론 등)는 C 범위 밖.
  사용자가 별도 보관 예정이라고 밝혔다. 이 트랙은 만들지 않는다.
