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

#### 실제로 깨진 지점 — **한 웨이브에서 다섯 번** `[P6·P7·P8 실측, 2026-09-04]`

**위 표가 "취약하다"고 쓴 것이 무엇인지, P6이 실물로 보여 줬다.** 다섯 번 전부 같은
결함이고 우연이 아니다.

| # | 불변식 | 무엇이 깨뜨렸나 | 방향 | 어떻게 됐나 |
|:-:|---|---|:-:|---|
| **1** | ① `highlight_links` = 2 | G7(A안)이 `MULTI_ITEM_IDS`에서 뺐다 | **감소** | **달성 불가.** 배열 검사로 교체 대상 |
| **2** | ④ 싱글 저장 키 = 6 | 이전 트랙이 테스트 주석에 키를 인용 | 증가 | 인용을 지워 되돌림 |
| **3** | ④ 싱글 저장 키 = 6 | **P6c가 같은 함정을 다시 밟았다** — 새 테스트 주석이 키를 인용해 7 | 증가 | 문구를 바꿔 되돌림 |
| **4** | `tests/duelSwapDisabled.test.js:43` — `case "swap_current"` 분기 ≥ 2 | P6c·P6d가 아이템 ID 분기를 정당하게 없앴다 (3 → 1 → 0) | **감소** | **의도 assert로 교체** (`3e84fdc`·`ad879e0`) |
| **5** | `navigate("/multiplayer", …)` = 3곳 | **P6c의 주석이 그 호출을 인용해 4곳** | 증가 | 문구를 바꿔 되돌림 |
| **6** | ⑥ 완주 어휘 = 5 | P6c가 완주 판정을 두 경로에 복제 | 증가 | `hasSolved` 한 곳으로 (`f0a4d86`) |

**읽어야 할 것 셋:**

1. **양방향으로 취약하다.** 2·3·5·6은 **한 줄이 늘어서** 깨졌고, 1·4는 **정당한 제거로
   줄어서** 깨졌다. "개수를 고정한다"는 늘어나는 쪽만 막는 것이 아니다.
2. **4는 개수 불변식이 더 안전해진 코드를 실패로 판정한 사례다.** 분기가 있으면서
   `handleMove`를 안 부르는 것보다 **분기가 아예 없는 것**이 강한 보장인데,
   개수를 세는 형태는 그것을 구별하지 못한다.
3. **3·5는 문서를 쓰면 깨진다.** 왜 그렇게 돼 있는지 적으려면 그 값을 인용해야 하는데,
   인용이 곧 위반이다. **불변식이 주석을 검열한다** — ①에 대해
   `data/itemPools.js` 머리말이 이미 "불변식이 문서 품질을 떨어뜨리면 그 불변식이
   틀린 것이다"라고 적어 둔 그것이 네 번 더 일어났다.

**처방은 하나다: 개수가 아니라 그 개수가 지키려던 사실을 assert한다.**
`tests/duelSwapDisabled.test.js`가 그 예시이고(`from("room_events")` 부재 · 아이템 ID
분기 부재 · `mini_game_*` 3분기 존재), `tests/duelItemAuthority.test.js`의
`P7 — 아이템 안내를 카탈로그에서 만든다`도 같은 형태다 — 문구를 세지 않고
**리터럴 항목이 없다는 것**과 **역할 합계가 지급 풀과 같다는 것**을 본다.

**⑤만 이 웨이브에서 한 번도 깨지지 않았다.** 줄머리 앵커라 주석이 셀 수 없다.

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
| **P4** | `4d7e2a3` | `services/duelItemService.js` **신규 405줄** · `tests/duelItemAuthority.test.js` **+27건(5→32)** · `data/duelItems.js` `buildDuelInventory` 결함 수정 |
| **P5** | `4217de0` | `components/DuelItemBar.jsx` **신규 424줄** · `css/multiplayer.css` **+464줄 추가만** · 서비스에 `refetchState` 추가 · 테스트 **+22건(32→54)** |
| **P6 판정** | `80f0618` | 미니게임 (c) 비활성 판정 · 확정 4분할 · §1에 개수 불변식 세 번째 사례 |
| **P6a** 복구 | `ba6d715` | `recoverGame`의 localStorage 인벤토리 읽기 → `get_duel_item_state_v3`. **16↑/8↓** |
| **P6b** 지급 | `fb11e68` | COUNTDOWN의 클라이언트 추첨 → `ensure_duel_item_grant_v3` · `ItemBar` → `DuelItemBar`. **74↑/57↓** |
| **P6c** 사용 | `3e84fdc` | `handleUseItem` → `use_duel_item_v3` · **`emitRoomEvent` 제거 → `room_events` insert 0** · 미니게임 발동 경로 제거. **255↑/301↓** |
| **P6d** 수신 | `ad879e0` | switch → `normalizeDuelItemEvent` + `result` 4값 · `isImmune` 경로 제거 · `mini_game_*` 3분기 보존. **173↑/124↓** |
| **P7a** | `294081f` | `pages/MultiplayerPage.jsx` 아이템 안내를 카탈로그 생성으로. 테스트 **+1(54→55)** |
| **P7b** | `d68f924` | **부채 ① 닫힘** — `handlePreviewLink`가 `fetchPageSummary`로 `entries`를 채운다. 테스트 **+2(55→57)** |
| **P8** | `f0a4d86` | 완주 판정 어휘를 `hasSolved` 한 곳으로 (§2.3-⑥ 6 → 5 복원) |

**기준선 (`5b1aead`, 2026-09-04):** `npm test` **265/265** · pgTAP **143/143 `not ok` 0** ·
`supabase:preflight` **11/11** · 동시성 하네스 **3시나리오 x 5회 exit 0, 데드락 0** ·
저장소 migration **14개**, **운영은 12개 그대로** (R6).

**기준선 (`4217de0`, 2026-09-04) — P5까지:** `npm test` **314/314** · `npm run build` exit 0 ·
`grep -c '^\.mp-' css/multiplayer.css` **131**이고 선택자 목록이 `3263e67`과 **바이트 동일** ·
`ItemBar.jsx`·`utils/serverAuthority.js`·`services/multiplayerService.js`·`docs/contracts/`·
`CURRENT.md`·`TRACKS.md` **전부 무수정** · **migration·pgTAP 무수정** (P4·P5는 서버를 건드리지
않으므로 preflight·pgTAP 수치는 `5b1aead`의 것이 그대로 유효하다). `feat/track-c`에 push 완료.

**기준선 (`f0a4d86`, 2026-09-04) — P6·P7·P8 완료:** `npm test` **317/317** ·
`npm run build` exit 0 · `supabase:preflight` **11/11** · pgTAP **143/143 `not ok` 0**
(재실행 실측 — migration 무수정이므로 `5b1aead`와 동일) ·
**`grep -rn 'from("room_events").insert' pages components services` = 0건** ✅ ·
`navigate("/multiplayer", …)` **3곳** · §2.3 불변식 7개 전수 아래 표 ·
`pages/MultiplayerGamePage.jsx` **1458 → 1558줄** (P6이 1458→1444로 줄였고 P7b의 요약 조회가 다시 늘렸다) · **1:1 결과 화면 무수정** ·
`ItemBar.jsx`·`useItemSystem`·`serverAuthority.js`·`multiplayerService.js`·
`EffectOverlay.jsx`·`onlineGameSession.js`·`authContext.jsx`·`docs/contracts/`·
`CURRENT.md`·`TRACKS.md`·**migration·pgTAP 전부 무수정**. `feat/track-c`에 push 완료.

#### §2.3 불변식 7개 전수 재측정 `[P8 실측, f0a4d86]`

| # | 불변식 | 값 | 판정 |
|:-:|---|---|---|
| **①** | `grep -c 'highlight_links' data/itemPools.js` = 2 | **4** | **불변식이 폐기 대상이다.** G7(A안) 이후 2는 달성 불가이고 `data/itemPools.js` 머리말이 그 이유를 적고 있다. **이 웨이브는 그 파일을 건드리지 않았다** (diff 0줄) — 값이 변한 것이 아니다. `SINGLE_ITEM_IDS`도 무변경 |
| **②** | `utils/onlineGameSession.js` 동결 | **diff 0줄** | ✅ |
| **③** | `useItemSystem` 반환 키 · `itemSystem.` 13줄 | **13** · 훅 diff 0줄 | ✅ |
| **④** | `"wiki-single-items"` 4파일 6줄 | **6** | ✅ (⚠ 이 웨이브에서 한 번 7이 됐다 — 아래 §1 참고) |
| **⑤** | `grep -c '^\.mp-' css/multiplayer.css` = 131 | **131** · CSS diff 0줄 | ✅ **P6·P7은 CSS를 한 줄도 붙이지 않았다** — P5의 `.duel-item-*`로 충분했다 |
| **⑥** | retire/result 5값 어휘 무변경 | 완주값 **5** (=`637ee74`) · 동결 4파일 diff 0줄 | ✅ (⚠ 한 번 6이 됐다 — `f0a4d86`이 되돌렸다) |
| **⑦** | `useAuth` 반환 형태 | `authContext.jsx` **diff 0줄** | ✅ B 소유 파일 무접촉 |

### 남은 단계와 검증 게이트

| 단계 | 내용 | **게이트** |
|:-:|---|---|
| ~~**P4**~~ | ✅ `services/duelItemService.js` — RPC 3개 래퍼 + 응답 정규화 (`4d7e2a3`) | 통과 |
| ~~**P5**~~ | ✅ `components/DuelItemBar.jsx` + `css/multiplayer.css` 추가만 (`4217de0`) | 통과 |
| ~~**P6**~~ | ✅ **`pages/MultiplayerGamePage.jsx` 이전** — 4커밋 (`ba6d715`·`fb11e68`·`3e84fdc`·`ad879e0`). 실행 기록은 **§3.5** | **통과 — `room_events` insert 0건 ✅** · `navigate` 3곳 유지 |
| ~~**P7**~~ | ✅ 아이템 안내를 카탈로그 생성으로 (`294081f`) + **부채 ① 닫음** (`d68f924`) | 통과 — `appRouting` 10/10 · `"/main"` 0 |
| **P8** | 전량 검증 | ✅ `npm test` **317/317** · `npm run build` exit 0 · preflight **11/11** · pgTAP **143/143 `not ok` 0** · §2.3 전수 재측정 완료 · ⚠ **2세션 수동 스모크만 남았다 — §3.6** |

### ⚠ P6이 가장 크고 위험하다

**→ §3.4로 옮겼다.** 이 절이 갖고 있던 줄 번호 일부가 실제와 어긋나 있었고
(`recoverGame`·`markUsed`·`isImmune`), P4·P5를 끝낸 시점에 **실측으로 다시 적었다.**
§3.4를 보라 — 옛 번호를 쫓지 않도록 여기서는 표를 지웠다.

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

#### ⚠ 정정 — 위 표는 12종이 아니라 **15종**이다 `[P4 실측, 2026-09-04]`

위 표는 **pgTAP가 주장한 것만** 옮겼다. 클라이언트에는 **3종이 더 도착한다:**

| 코드 | 어디서 | 어떻게 새는가 |
|---|---|---|
| `PLAYER_NOT_FOUND` | migration `:312` | `private.apply_duel_move_internal_v3`가 반환하고, |
| `PLAYER_NOT_PLAYING` | `:316` | `use_duel_item_v3`가 헬퍼 실패를 |
| `UNSUPPORTED_EVENT_TYPE` | `:399` | `coalesce(v_move->>'code', 'ITEM_MOVE_REJECTED')`(`:938`)로 흘려보낸다 |

**`ITEM_MOVE_REJECTED`로 뭉개지지 않고 원래 코드 그대로 올라온다.** 이름을 붙여 두지
않으면 HUD가 "모르는 코드"로 받는다. `services/duelItemService.js`가
`DUEL_ITEM_HELPER_FAILURE_CODES`로 등재했고, **테스트가 migration에서 코드를 뽑아
대조하므로 서버가 코드를 늘리면 `npm test`가 먼저 깨진다.**

**`raise exception`으로 던지는 것 6종** — `try/catch`가 필요하다:
`AUTH_REQUIRED` · `REQUEST_ID_REQUIRED` · `DUEL_ROOM_NOT_FOUND` · `NOT_A_PARTICIPANT` ·
`DUEL_PARTICIPANTS_REQUIRED` · `DUEL_ITEM_POOL_EXHAUSTED`.
(이 6종은 실측으로 표와 정확히 일치했다. `error.code`가 아니라 **`error.message`** 로
온다 — SQLSTATE는 전부 `P0001`이다.)

#### ⚠ 정정 — 슬롯 소비 판정 `[P5 실측, 2026-09-04]`

이 절은 원래 **"미소비 3종은 HUD가 슬롯을 되살려야 한다. 나머지는 슬롯 상태가 그대로다"**
라고 적고 있었다. 그 문장이 오해를 만든다.

**실패 코드 15종 어느 것도 슬롯을 소비하지 않는다.** migration에서 `consumed_at`을 쓰는
곳은 **`:984` 하나**이고, 그것은 원장 INSERT(`:970`) **뒤**, 즉 성공 경로에만 있다.
모든 실패 반환은 그보다 앞에 있다. 쿨타임도 같다 — 원장에 행이 없으니 올라가지 않는다.

즉 **"미소비 3종"은 게임 규칙(`14-DUEL-ITEMS.md` §4)의 진술이지 클라이언트 상태의
진술이 아니다.** 그래서 P4·P5는 두 층으로 나눠 답했다:

1. **구조로 없앤다** — HUD는 슬롯을 **낙관적으로 소비 표시하지 않는다.** `item.used`는
   서버 지급 행의 `consumed_at`에서만 오고, 누른 동안에는 `pendingGrantId`로 대기 표시만
   한다. **잃을 슬롯이 애초에 없다.**
2. **그 위에서 두 신호를 나눈다:**

| 값 | 뜻 | HUD |
|---|---|---|
| `failure.slotRestored` | **로컬에서 증명 가능한** 미소비 (계약 3종) | 서버에 다시 묻지 않고 즉시 되살린다 |
| `failure.refetchState` | 내 슬롯 관점이 서버와 갈렸을 수 있다 (`rejected` 갈래) | `fetchDuelItemState`로 맞춘다 |

> **`slotRestored === false`를 "소비됐다"로 읽으면 안 된다.** **헬퍼 3종이 정확히 그
> 함정이다** — 소비되지 않았는데 계약 3종에는 없다. 그 셋은 `refetchState`가 잡고,
> **모르는 코드도 `refetchState`로 떨어진다** (묻는 것이 잃는 것보다 낫다).
>
> 두 신호는 **동시에 참이 되지 않는다**(테스트가 고정). 둘 다 거짓인 코드는
> 슬롯 관점을 건드릴 필요가 없는 셋뿐이다 — `ITEM_COOLDOWN`·`ITEMS_DISABLED`·`GAME_NOT_ACTIVE`.

### P4가 재사용할 것

| 대상 | 위치 | 비고 |
|---|---|---|
| `createRequestId()` · `createCorrelationId()` | **`utils/serverAuthority.js`** | **동결 파일.** 읽기 전용 import만 한다 (§2.1). `services/multiplayerService.js:3`이 이미 그렇게 쓴다 |
| `normalizeRpcRow(data)` 형태 | `services/multiplayerService.js:12-14` | `Array.isArray(data) ? data[0] \|\| null : data \|\| null`. **C 소유 파일이지만 복사해 쓰는 편이 낫다** — 그 파일의 export 목록을 넓히면 소비자가 늘어난다 |
| `requireSupabase()` 형태 | 같은 파일 `:6-10` | 동일 |
| `buildDuelInventory()` · `canUseDuelItem()` | **`data/duelItems.js`** (P1 산출) | 서버 행 → HUD 형태. ~~이미 서버 반환 형태에 맞춰 작성돼 있다~~ **→ 아니었다. 아래 정정** |
| `getDuelResultLabel()` | `utils/resultReasonLabels.js` | **B 소유. 읽기 전용 호출만** (§2.2). P4·P5는 **부르지 않았다** — 경기 결과 어휘와 아이템 거부 문구는 축이 다르다. 테스트가 "부른다면 이 하나만"을 강제한다 |

#### ⚠ 정정 — `buildDuelInventory`의 P1 결함 `[P4 발견, 2026-09-04]`

`buildDuelInventory`는 지급 행의 **`grant_id`** 를 읽고 있었다. 그런데 `ensure`·`get`은
`to_jsonb(grant_row)`(migration `:593`·`:643`)로 내보내므로 **열 이름이 그대로 나오고,
`duel_item_grants`의 PK 열 이름은 `id`다** (`:105`) — `grant_id`가 아니다.

**고치지 않았으면 `grantId`가 전부 `null`이라 `use_duel_item_v3`에 넘길 `p_grant_id`가
없고, 아이템을 한 번도 쓰지 못했을 것이다.** `instanceId`도 fallback으로 떨어져 슬롯 key가
`{item_id}-{slot_index}`가 된다.

`row?.grant_id ?? row?.id`로 **둘 다 받도록** 고쳤다 (`grant_id`는 `duel_item_events` 쪽
열 이름이라 원장 행이 들어오는 경로도 있다). 회귀 테스트를 붙였다 —
`P4 — 지급 행의 PK 열은 'id'이고 그것이 grantId가 된다`.

**교훈:** §3.3이 "이미 맞춰져 있다"고 적은 것을 P4가 검증 없이 믿었다면 런타임에서야
발견됐다. **인계 문서의 "이미 돼 있다"는 진술도 실측 대상이다.**

---

## 3.4 P6 이어받기 — 세션 인계 `[2026-09-04]`

**P4·P5(프론트 신규 파일)가 끝났고 P6부터 기존 파일 이전이다.** 성격이 또 바뀐다 —
지금까지는 새 파일만 만들어 되돌림이 쌌지만, **P6은 1458줄 파일을 뜯는다.**
`P6은 새 세션에서 이어간다` `[사용자 결정]`.

### P4·P5가 만든 것 — 소비자 관점 요약

| 파일 | 상태 | P6이 알아야 할 것 |
|---|---|---|
| `services/duelItemService.js` | **신규 405줄** (`4d7e2a3`) | RPC 3개 래퍼. **실패 12+3종을 정규화해서 준다** |
| `components/DuelItemBar.jsx` | **신규 424줄** (`4217de0`) | 5슬롯 HUD + `link_preview` 패널. **완전 presentational** — RPC를 부르지 않는다 |
| `css/multiplayer.css` | **+464줄 추가만** | 새 어휘는 전부 `.duel-item-*`. **`mp-` 접두사를 쓸 수 없다** — 이유는 아래 |
| `data/duelItems.js` | `buildDuelInventory` 1곳 수정 | §3.3의 정정 참고 |
| `tests/duelItemAuthority.test.js` | **5 → 54건** | P6이 깨면 여기서 걸린다 |

### 서비스 시그니처 — `services/duelItemService.js`

```js
ensureDuelItemGrant(roomId)
  // → { ok, code: "GRANTED"|"ITEMS_DISABLED", useItems,
  //     grants[], inventory[], cooldownUntil, serverNow, clockSkewMs, snapshot }

fetchDuelItemState(roomId)
  // → 위 + { roomStatus, activeEffects[], pendingDefenses[] }

useDuelItem({ roomId, grantId, requestId?, correlationId? })
  // 성공 → { ok:true, code:"ITEM_USED", failure:null, result, itemId, targetUserId,
  //          itemEventId, roomEventId, effectExpiresAt, cooldownUntil, metadata,
  //          room, player, opponent, requestId, serverNow, clockSkewMs, snapshot }
  // 실패 → { ok:false, code, failure:{...}, requestId, serverNow, clockSkewMs, snapshot }
```

**순수 export** (RPC를 부르지 않는다 — P6이 자유롭게 쓴다):

| export | 무엇 |
|---|---|
| `normalizeDuelItemEvent(payload, { skewMs })` | **P6의 수신 switch 입구.** 아래 별도 항목 |
| `normalizeDuelItemFailure(response, { skewMs })` | 실패 봉투 만들기 (`useDuelItem`이 내부에서 쓴다) |
| `toClientTime(serverEpochMs, skewMs)` | 서버 시각 → 클라이언트 시계 |
| `isUnconsumedFailure(code)` · `getDuelItemFailureMessage(code)` | 코드 분류·문구 |
| `FAILURE_KIND` | `unconsumed`·`cooldown`·`unavailable`·`rejected`·`fault` |
| `DUEL_ITEM_FAILURE_CODES` (12) · `DUEL_ITEM_HELPER_FAILURE_CODES` (3) · `DUEL_ITEM_THROWN_CODES` (6) | 코드 목록 |

**실패 봉투 `failure`:**

```js
{ code, kind, slotRestored, refetchState, retryable,
  cooldownUntil, retryAfterMs, message, room, player, snapshot }
```

#### ⚠ 실패 12종을 throw하지 않고 **반환**한다

`services/multiplayerService.js`의 `applyDuelMoveV2`는 `ok:false`를 throw로 바꾼다.
**이 서비스는 그러지 않는다** — 서버 자신이 실패를 두 갈래로 나눠 놓았기 때문이다
(`return {ok:false}` = 경기 중 판정 / `raise exception` = 세션·호출 오류).
쿨타임에 `try/catch`를 강요하면 HUD가 정상 흐름을 예외로 다룬다.
**12+3종은 봉투로 반환하고, 6종과 전송 오류만 throw한다.**

#### 시각은 **클라이언트 시계**로 나온다

`cooldownUntil`·`effectExpiresAt`은 `server_now`로 편차를 재서 보정한 **epoch ms**다.
그대로 `Date.now()`와 비교하면 되고 `canUseDuelItem`이 그렇게 쓴다.
**P6이 다시 보정하면 두 번 빼진다.** 원본은 `serverNow`·`clockSkewMs`로 남아 있으니
진단에만 쓴다.

### HUD prop 계약 — `components/DuelItemBar.jsx`

```jsx
<DuelItemBar
  inventory={[]}            // buildDuelInventory() 결과. used는 여기서만 온다
  useItems={true}           // false면 "아이템을 쓰지 않는 경기입니다"만 그린다
  phaseReady={false}        // 방·플레이어가 playing인가
  cooldownUntil={null}      // 클라 시계 epoch ms (서비스가 보정해서 준다)
  linkCount={0}             // 사전 검증용 — random_link_move·random_teleport
  historyLength={0}         // 사전 검증용 — go_back
  activeEffects={[]}        // fetchDuelItemState().activeEffects
  pendingDefenses={[]}      // 대기 중인 편집 보호·역링크
  pendingGrantId={null}     // 응답 대기 중인 슬롯. 대기 중 전체 잠금
  failure={null}            // useDuelItem()의 failure 봉투
  linkPreview={null}        // { active, expiresAt, candidates[], entries{},
                            //   selectedTitle, usedPreviews, maxPreviews }
  onUseItem={(grantId) => {}}
  onDismissFailure={() => {}}
  onRequestStateRefresh={() => {}}   // failure.refetchState일 때 호출
  onPreviewLink={(title) => {}}      // 부모가 요약을 가져와 entries에 넣는다 — 부채 ①
  onClosePreview={() => {}}
/>
```

**주의 3건:**

1. `onUseItem`은 **`grantId`** 를 넘긴다 — `instanceId`가 아니다. `use_duel_item_v3`의
   `p_grant_id`가 그것이다. (`ItemBar.jsx`는 `instanceId`를 넘긴다 — **다른 계약이다.**)
2. **같은 실패 객체로 `onRequestStateRefresh`를 두 번 부르지 않는다.** 컴포넌트가
   `useRef`로 봉투 정체성을 검사한다. 부모가 매 렌더 **새 객체**로 `failure`를 만들면
   그 방어가 무력해진다 — 거부 하나가 조회 폭풍이 된다. **`failure`는 안정적인 참조로
   내려야 한다.**
3. HUD는 **낙관적 갱신을 하지 않는다.** 누른 슬롯을 `used`로 칠하지 말고
   `pendingGrantId`만 넘긴다. 응답이 오면 새 `inventory`를 내려 준다.

**`linkPreview.entries`가 비어 있어도 화면은 정상이다** — 패널이 "요약 연결은 준비 중"
안내를 그린다. 부채 ①이 닫히기 전까지 실제로 보이는 상태다.

### `normalizeDuelItemEvent` — P6의 수신 switch 입구가 이미 있다

```js
normalizeDuelItemEvent(payload, { skewMs })
// → { itemEventId, itemId, slotRole, actorUserId, targetUserId,
//     result, effectExpiresAt, moveEventId, metadata, serverTimestamp }
```

서버가 `room_events.payload`에 이미 camelCase로 넣어 두므로 하는 일은 **시각 보정과
`result` 검증**이다. **모르는 `result`는 `null`로 둔다** — `void`로 뭉개지 않는다.
그러면 새 판정값이 생겼을 때 화면이 "아무 일도 없었다"로 조용히 굴기 때문이다.
`metadata`는 `null`이면 `{}`로 준다 (HUD가 `metadata.censoredTitles`를 바로 읽는다).

**P6은 이 함수를 부르고 `result` 4값으로 분기하면 된다.** 아이템 ID별 분기를 다시
만들지 않는다.

### ⚠ P6이 이 트랙에서 가장 크고 위험하다

**`pages/MultiplayerGamePage.jsx` 1458줄에 네 가지가 한꺼번에 들어간다.**
아래 줄 번호는 **`4217de0` 시점 실측**이다 (§3.3의 옛 번호 일부가 어긋나 있었다).

| # | 무엇을 | 지금 어디에 |
|:-:|---|---|
| **1** | **localStorage 인벤토리 제거** | 상태 `inventory :120` · 저장 키 `:128` · 저장/읽기/삭제 `:136-162` · 지급 `:567` · 소비 `markUsed :571-582`(호출 `:797`) · 복구 `:419-426`·`:516-522` · 렌더 `:1328`. **키 `wiki-mp-game:{roomId}:{userId}`의 이동 상태(`currentTitle`·`pathTitles`·`historyStack`·`clickCount`)는 그대로 둔다** — 인벤토리 필드만 걷어낸다 |
| **2** | **수신 switch 재작성** | `handleIncomingEvent :887-1006`. 아이템 ID별 분기를 **`duel_item_event` 1값 + `payload.result`** 로 바꾼다 (`normalizeDuelItemEvent` 사용). **`mini_game_*` 3분기(`:948`·`:962`·`:975`)는 보존** (Q5 조건). 클라이언트가 스스로 차단·반사를 판정하던 `isImmune()` 경로(**선언 `:189` · `immuneUntil` 세팅 `:211`·`:218` · 사용 `:895`·`:905`·`:914`·`:936` · 렌더 `:1336`**)가 전부 사라진다 — **서버가 준 `result`를 읽는다** |
| **3** | **복구 경로 교체** | `recoverGame :333-465`(ref `:92`·`:466`, 호출 `:266`·`:270`·`:304`·`:308`·`:469`·`:476`·`:478`)이 읽던 인벤토리를 `get_duel_item_state_v3`로. **쿨타임·지속효과·보호 대기가 전부 서버에서 온다** |
| **4** | **`emitRoomEvent` 제거** | **선언 `:191`, INSERT `:194`.** 호출 지점 10곳 — `:722`·`:747`·`:751`·`:755`·`:784`·`:802`·`:808`·`:818`·`:849`·`:873`. **이 중 `mini_game_*` 3곳(`:722`·`:784`·`:873`)은 Q5 조건상 보존 대상이므로 대체 경로가 필요하다** — 아이템 이벤트만 RPC로 옮기고 미니게임 이벤트를 어떻게 보낼지가 **P6의 미해결 지점이다** |

**`:194`가 저장소에서 `from("room_events").insert`를 하는 유일한 지점이고, 그 0건이
수용조건 ②이며 G2-② 창의 선행 조건이다** (`TRACKS.md` §7.4-③·§8-C 수용조건 ②).

> ⚠ **위 #4가 §3.3이 놓친 지점이다.** §3.3은 "`emitRoomEvent`를 지운다"고만 적었지만
> **`mini_game_*` 보존(Q5)과 정면으로 부딪친다.** 미니게임 3종은 아이템 RPC를 타지
> 않으므로, `emitRoomEvent`를 지우면 그 3종의 전송 경로가 함께 사라진다.
> **P6 착수 전에 이것을 먼저 결정해야 한다** — 선택지는 (a) 미니게임용 좁은 RPC를
> 추가한다 (migration 변경 → P2·P3 재검증), (b) `emitRoomEvent`를 미니게임 전용으로
> 남긴다 (수용조건 ② "0건"을 못 맞춘다), (c) 미니게임을 이 창에서 비활성한다.
> **셋 다 대가가 있고 사용자 판정이 필요하다.**

#### ✅ 판정 — **(c) 미니게임 비활성** `[사용자 확정, 2026-09-04]`

**위 세 선택지 중 (c)로 간다. 별개 판정이 아니라 Q5의 연장이다** — Q5에서 이미
발동 경로 120줄 제거를 승인했고, **지급에서 빠져 도달 불가능해진 코드**이므로
`emitRoomEvent` 호출 3곳(`:722`·`:784`·`:873`)도 그 제거 범위 안에 있다.

| | 왜 버렸는가 |
|---|---|
| **(a)** 미니게임용 좁은 RPC | migration을 다시 건드려 **P2·P3 재검증이 붙는다.** 기본 지급에서 빠진 기능에 RPC를 팔 값어치가 없다 |
| **(b)** `emitRoomEvent` 잔존 | 수용조건 ② "0건"을 못 채워 **G2-② 창의 선행 조건이 미달이다.** 그러면 C의 목적 자체가 미달이다 |

**보존하는 것 3건:**

- `data/items.js`의 `mini_game` 정의
- `room_events`의 `mini_game_*` event_type 3종 — **DDL 무변경**
- 수신 switch의 `mini_game_*` 3분기(`:948`·`:962`·`:975`) — **구버전 번들이 아직 그
  이벤트를 보낼 수 있다. 받는 쪽은 남긴다**

**파생 — overlay는 표시 전용이 된다** `[승인, 2026-09-04]`. 발신이 전부 사라지므로
`handleMiniGameChoice`(`:713-726`)가 없어져 가위바위보 버튼은 핸들러를 잃고,
`resolveMiniGame` effect(`:1134-1178`)도 승패 판정 + 보상 발동, 즉 발신 경로라 사라진다.
overlay(`:1341-1389`)는 "상대가 미니게임을 시작했습니다"와 보상 결과 문구만 그리고
타이머로 닫는 형태로 축약한다. **수신 3분기가 있고 표시가 되면 "받는 쪽은 남긴다"의
목적이 충족된다** — 구버전 이벤트가 `default`로 조용히 떨어지지 않는 것이 그 목적이다.

### 권고 → **확정 — P6은 4커밋이다** `[사용자 확정, 2026-09-04]`

**한 커밋으로 만들지 않는다.** 되돌림 단위를 작게 유지하는 것이 이 파일에서 특히
중요하다 — **1:1 결과 화면(`:1437-1454`)이 같은 파일에 동거한다.** 아이템 이전이
깨지면 결과 화면까지 함께 되돌려야 하는 상황을 만들지 않는다.
**결과 화면은 이 웨이브 범위 밖이고 P6은 건드리지 않는다.**

**아래가 확정 분할이며 이 절의 옛 권고표를 대체한다.** 자르는 축이 "무엇을
배선하는가"에서 **"어느 경로를 옮기는가"** 로 바뀌었다 — 옛 표는 6a에 서비스·HUD
배선을 몰아 두었으나, **경로별로 자르면 되돌림 단위가 실제 장애 단위와 맞는다.**

| 커밋 | 경로 | 무엇을 | 끝에 돌릴 것 |
|:-:|:-:|---|---|
| **6a** | **복구** | `recoverGame`의 인벤토리 읽기(`:419-426`)를 `get_duel_item_state_v3`로. **localStorage 인벤토리 읽기만 제거** — 이동 상태(`currentTitle`·`pathTitles`·`historyStack`·`clickCount`)는 건드리지 않는다 | `npm test` · 이동 상태 키 잔존 확인 |
| **6b** | **지급** | COUNTDOWN effect(`:513-569`)를 `ensure_duel_item_grant_v3`로. `use_items` 게이트. **`ItemBar` → `DuelItemBar` 교체가 여기다** | `npm test` |
| **6c** | **사용** | `handleUseItem`(`:792-885`)을 `useDuelItem`으로. 미니게임 발동 경로 제거. **`emitRoomEvent` 제거 → 여기서 `room_events` insert가 0이 된다** | **`grep -rn 'from("room_events").insert' pages components services` = 0건** |
| **6d** | **수신** | switch(`:887-1009`)를 `normalizeDuelItemEvent` 기반으로 재작성. `isImmune()` 클라이언트 판정 제거. **`mini_game_*` 3분기 보존** | `npm test` · 2세션 수동 스모크 |

**범위 재배정 2건** `[P6 실측, 2026-09-04]`:

1. **`:513-569`는 전부 6b다.** 표 #1이 "복구"로 분류한 localStorage 인벤토리 읽기가
   두 곳(`:419-426`·`:516-522`)인데 **뒤쪽은 6b가 통째로 재작성할 COUNTDOWN effect의
   머리다.** 6a가 그것을 고치면 6b가 덮어쓴다. **6a는 `:419-426`만 만진다.**
2. **`DuelItemBar` mount는 6b다.** `use_items` 게이트가 `DuelItemBar`의 `useItems`
   prop이므로 6b가 그것을 요구한다. 6b~6c 사이에는 `onUseItem`이 구 `handleUseItem`으로
   남지만, `buildDuelInventory`가 `instanceId = grantId`로 채우므로 배선은 성립한다.

**렌더 블록 `:1325-1390`에 6b·6c·6d가 셋 다 들어오지만 줄 구간이 겹치지 않는다**
(6b `:1325-1330` · 6d `:1336` · 6c `:1341-1389`). **순서 조정은 필요 없다.**

#### ⚠ 6a 단독 시점의 1커밋 창 — 새로고침 인벤토리가 빈다 `[수용, 2026-09-04]`

6a 후 `recoverGame`은 `fetchDuelItemState`를 읽지만 **지급이 아직 6b에 있어 grant 행이
0이다.** 경기 중 새로고침은 `enteredPlaying=true`로 COUNTDOWN을 건너뛰므로 인벤토리가
빈 채 들어간다. **6a+6b가 함께 닫는 창이고, 순서를 6b→6a로 바꿔도 해소되지 않는다** —
그 경우 `:419-426`이 읽을 localStorage 인벤토리가 더 이상 써지지 않아 결과가 같다.
**브랜치 내부이며 배포되지 않으므로 수용한다.** 6a 커밋 메시지가 이 사실을 남긴다 —
**6a만 체크아웃하는 사람이 알아야 한다.**

각 커밋 끝에 **§2.3 불변식 grep을 전수**로 돌린다. 특히:

```
grep -c '^\.mp-' css/multiplayer.css                                  # 131
grep -rn 'from("room_events").insert' pages components services       # 6c에서 0
grep -rn 'navigate("/multiplayer", { replace: true })' pages          # 3곳 유지 (MultiplayerGamePage)
```

> ⚠ **`room_events` 0건은 6c다 — 옛 표의 6d가 아니다.** `emitRoomEvent` 제거가 사용
> 경로와 같은 커밋에 들어가기 때문이다. **호출 지점 10곳이 전부 사용 경로와 미니게임
> 발동 경로 안에 있어서** 그 둘을 옮기면 남는 호출자가 없다.

### ⚠ CSS 게이트의 함정 — `mp-` 접두사를 쓸 수 없다

§2.3-⑤의 불변식은 `grep -c '^\.mp-' css/multiplayer.css` = **131**이다.
**개명·삭제만 막는 것이 아니라 개수 자체를 고정한다.** 그래서:

- 새 규칙에 `mp-`를 붙이면 132가 되어 게이트가 깨진다.
- **하위 선택자조차 못 쓴다** — `.mp-game-main .duel-item-bar`는 줄 맨 앞이 `.mp-`라 세어진다.

P5는 그래서 전부 `.duel-item-*`으로 갔다 (`.item-panel`·`.item-effect-pop` 선례).
**P6이 CSS를 더 붙일 때도 같은 규칙을 따라야 한다.**

부수 실측: 기존 파일에 **중복 `.mp-` 선택자 2건**이 있다 — `.mp-game-page`와
`.mp-opponent-panel`이 각각 두 번 선언된다. **P5가 만든 것이 아니고, 개명·삭제 0건
제약상 고치지 않았다.** 테스트가 중복 수를 2로 고정해 늘지 않게만 막는다.

### 등재된 부채 2건 — `link_preview`

**부채 ① `linkPreview.entries` 채우기 — 소유자 P6/P7**

확정 스펙 §5.5의 "연결 문서 **첫 문장**"은 `services/wikiService.js`의
**`fetchPageSummary(title)`** 가 주는 `extract`다. **위키백과 REST를 부르며 우리
Supabase가 아니다 — 새 RPC가 필요하지 않다.**

P5에서 부르지 않은 이유: 컴포넌트가 fetch를 가지면 **abort·캐시·중복요청**을 함께
갖게 되고, 그 셋은 이미 `MultiplayerGamePage`가 `pageData.links`와 함께 들고 있다.
있는 자리에 붙이는 것이 맞다. `onPreviewLink(title)` → 부모가 가져와 `entries[title]`에
`{ status: "loading"|"ready"|"unavailable", extract, description, thumbnailUrl }`을 넣는다.

**부채 ② ⚠ `maxPreviews: 3`에 서버 권위가 없다 — v4**

`data/duelItems.js`에만 있는 값이고 **migration에는 미리보기 카운터가 아예 없다.**
실측: `"preview"`가 migration에 나오는 곳은 **2곳뿐이고 둘 다 아이템 ID다** —
카탈로그 행(`:79`, `duration_ms 15000` · `charges 0`)과
`duel_item_grants_item_id_check`(`:135`).

즉 **3회 제한은 클라이언트만 세고 서버는 모른다. 우회가 가능하다.**
확정 스펙 §5.1이 아이템 권위를 서버에 두기로 한 것과 어긋나는 **유일한 잔여 지점**이다.
닫으려면 원장에 미리보기 행을 남기는 RPC가 필요하고 **v4 범위**다.

`tests/duelItemAuthority.test.js`의
`P5 — ⚠ maxPreviews에 서버 권위가 없다는 것이 사실이다 (실측)`가 이 사실을 고정한다 —
**서버가 미리보기를 세기 시작하면 그 테스트가 깨져 부채를 닫을 때를 알려 준다.**

(같은 성격의 선례: `random_teleport` 부채 — `data/duelItems.js` 머리말.)

### P6이 손대지 말아야 할 것

| 대상 | 왜 |
|---|---|
| `components/ItemBar.jsx` | **무수정.** 싱글 아이템의 소비자가 `GamePage.jsx`이고 prop 계약이 동결(§2.3-③). 3키 `{inventory, onUseItem, canUseItem}` — 테스트가 고정한다 |
| `utils/serverAuthority.js` | **동결.** 읽기 전용 import만 (§2.1) |
| `services/multiplayerService.js` | `requireSupabase`·`normalizeRpcRow`는 **복사해 쓴다.** export 목록을 넓히면 소비자가 늘어난다 |
| `utils/resultReasonLabels.js` | **B 소유.** `getDuelResultLabel` 읽기 전용 호출만 (§2.2) |
| `data/itemPools.js`의 `SINGLE_ITEM_IDS` | **동결** (§8-C 범위 밖 ②) |
| migration · pgTAP | P4·P5가 안 건드렸다. **P6도 건드리지 않는 것이 기본**이고, 위 "미해결 지점 (a)"를 고르면 그때만 열린다 — 그러면 **P2·P3 재검증이 붙는다** |

---

## 3.5 P6·P7 실행 기록 — 착수 전에 몰랐던 것 `[2026-09-04]`

**§3.4의 줄 번호는 하나도 어긋나지 않았다.** `MultiplayerGamePage.jsx`가 `4217de0`
이후 무변경이었기 때문이다. 어긋난 것은 줄 번호가 아니라 **아래 셋**이고, 전부
코드를 실제로 옮기면서 드러났다.

### 발견 ① 서버가 이동까지 한다 — 사용 경로가 부르면 **두 번 이동한다**

`use_duel_item_v3`가 `private.apply_duel_move_internal_v3`를 호출해
`current_page_id`·`current_title`·`move_count`를 갱신하고 `game_move_events` 행까지
넣는다 (migration `:417-446`). **즉 강제 이동은 공격자의 트랜잭션 안에서 이미 끝나 있다.**

§3.3·§3.4는 RPC 반환 형태만 적었고 이동 주체를 적지 않았다. 그대로 읽고
`handleMove`(→`applyDuelMoveV2`)를 이어 붙였다면 **한 번의 사용이 두 번 이동한다.**

**대응:** `syncAfterItemUse`는 서버가 준 권위 행을 화면에 반영만 한다. **아이템 ID로
갈라지지 않는다** — 이동이 있었는지는 `player.current_title`이 말해 준다.

### 발견 ② `reflected`는 수신 이벤트로 오지 않는다 — **시전자 자신의 응답으로 온다**

수신 채널이 `event.user_id === user.id`를 걸러내므로 **시전자는 자기 이벤트를 받지
않는다.** 그런데 반사는 **시전자가 맞는** 판정이다. 즉 반사를 수신 경로에서만 처리하면
맞는 쪽 화면에 아무 일도 일어나지 않는다.

**대응:** `handleUseItem`의 성공 경로가 `REFLECTED`를 처리한다 (`ad879e0`).
서버는 이미 그 효과를 시전자 앞으로 기록해 두었고, 화면 연출만 맞추면 된다.

### 발견 ③ `forceMoveByItem`이 6d에서 죽었다

수신 switch의 `random_link_move` 분기가 **유일한 호출자**였다. 발견 ①로 그 분기가
이동을 부르지 않게 되면서 함수 전체가 도달 불가능해졌고, `ad879e0`이 제거했다.

**파생 — 확인만 하고 두는 것:** 그 결과 `handleMove`의 `FORCED_LINK`·`RANDOM_TELEPORT`
event_type이 이 화면에서 도달 불가능해졌다. **파라미터는 그대로 뒀다** — V2 계약을
좁히는 것은 이 웨이브가 건드릴 이유가 없고, `applyDuelMoveV2`는 §2.2상 **복사해 쓰는**
대상이지 좁히는 대상이 아니다. **다음 트랙이 판단할 것으로 남긴다.**

### 부채 현황 — ①은 닫혔고 ②는 그대로다

| | 상태 |
|---|---|
| **부채 ①** `linkPreview.entries` | ✅ **닫힘 (`d68f924`, P7b).** `handlePreviewLink`가 `fetchPageSummary`로 채운다. **새 RPC 없음** — 위키백과 REST다. abort·만료 취소·늦은 응답 폐기를 부모가 든다 (P5가 컴포넌트에 두지 않은 이유가 그것이었고 그 이유는 유효하다 — `DuelItemBar`는 여전히 fetch를 갖지 않는다). **횟수는 `loading`·`ready`만 센다** — 요약을 못 가져온 클릭은 한도를 깎지 않는다 (6c가 세운 규칙 그대로) |
| **부채 ②** `maxPreviews: 3` 서버 권위 부재 | ⚠ **열려 있다. v4 범위 그대로.** 한도는 여전히 카탈로그 값이고 서버는 미리보기를 세지 않는다. `tests/duelItemAuthority.test.js`의 migration 검사가 **서버가 세기 시작하는 날 깨져서** 닫을 때를 알려 준다 |

---

## 3.6 2세션 수동 스모크 — 항목표 `[P8, 2026-09-04]`

**자동으로 못 돌린다.** 브라우저 두 세션이 필요하고, 확인할 것의 절반이 "두 화면이
같은 것을 말하는가"이기 때문이다 — 그것이 P6이 고친 결함의 성격이다.

**준비:** 서로 다른 계정 둘, 각각 다른 브라우저 프로필(또는 시크릿). A = 방장, B = 참가자.
콘솔을 양쪽 다 열어 둔다 — **`room_events insert 실패`가 한 번도 찍히면 안 된다**
(그 코드는 사라졌으므로 찍힐 수 없다. 찍히면 구버전 번들을 보고 있는 것이다).

| # | 시나리오 | 무엇을 누르나 | **무엇을 확인하나** |
|:-:|---|---|---|
| **1** | **아이템전 지급** | A가 아이템전으로 방 생성 → B 입장 → 시작 | 카운트다운이 끝나면 **양쪽 다 5칸**이 뜬다. 칸마다 역할 아이콘(⚔🔍🛡🃏)이 있고 **마지막 칸이 변칙 슬롯**이다. 두 사람의 구성이 서로 달라도 정상이다 |
| **2** | **비아이템전** | 아이템 사용 끄고 방 생성 → 시작 | HUD 자리에 **"아이템을 쓰지 않는 경기입니다"** 만 뜬다. 빈 슬롯 5칸이 뜨면 **틀렸다** (`use_items` 게이트가 안 먹은 것) |
| **3** | **F5 — 지급 멱등** | 1의 상태에서 A가 새로고침 | **같은 5칸이 그대로** 돌아온다. 아이템이 **다시 뽑히면 틀렸다** — 멱등성이 깨진 것이고 이 웨이브의 핵심이다. 이미 쓴 칸은 **쓴 상태 그대로** 돌아온다 |
| **4** | **F5 — 쿨타임 유지** | A가 아이템 하나 쓴 직후 2초 안에 새로고침 | 쿨타임이 **남은 시간부터 이어진다.** 0으로 초기화되면 틀렸다 (서버가 원장에서 다시 계산하는 값이다) |
| **5** | **적용** | A가 **먹물 공격** 사용 | **B 화면이 4초간 가려진다.** A에게는 "아이템이 적용됐습니다!". **A 화면은 가려지지 않는다** |
| **6** | **차단** | B가 **편집 보호**를 먼저 쓰고 8초 안에 A가 먹물 공격 | **B 화면이 가려지지 않는다.** A에게 **"상대가 막았습니다"**, B에게 **"방어 성공"**. ⚠ **양쪽 문구가 같은 사건을 말해야 한다** — 예전에는 서버가 적용으로 기록하고 B만 방어로 보이는 어긋남이 가능했다. 그것이 이 항목의 이유다 |
| **7** | **반사** | B가 **역링크**를 먼저 쓰고 6초 안에 A가 먹물 공격 | **A 화면이 가려진다.** A에게 "반사됐습니다! 내가 대신 맞았습니다", B에게 "반사 성공". **B는 멀쩡해야 한다** |
| **8** | **강제 이동** | A가 **잘못된 링크** 사용 | **B가 현재 문서의 다른 링크로 옮겨져 있고 이동 횟수가 +1.** B 화면이 새 문서를 그린다. ⚠ **이동이 두 번 일어나면 안 된다** — 이동 횟수가 +2면 발견 ①이 되살아난 것이다 (§3.5) |
| **9** | **조커 — 임의 문서** | A가 **특수:임의 문서** 사용 | **A 자신이** 무작위 문서로 옮겨지고 이동 +1. 상대는 그대로 |
| **10** | **조커 — 역사 되감기** | A가 **역사 되감기** 사용 (양쪽 다 2회 이상 이동한 뒤) | **두 사람 모두** 각자 직전 문서로 이동하고 **양쪽 이동 +1** |
| **11** | **탐색 — 링크 미리보기** | A가 **링크 미리보기** 사용 후 링크 3개 클릭 | 패널에 **연결 문서 첫 문장**이 뜬다 (부채 ① 닫힘 확인). **남은 횟수가 3→2→1→0**. 4번째 링크는 눌리지 않는다. **15초 뒤 패널이 스스로 닫힌다** |
| **11-b** | **미리보기 — 실패 환불** | 11에서 존재하지 않거나 요약이 없는 링크를 눌러 본다 | "요약을 불러오지 못했습니다"가 뜨고 **남은 횟수가 줄지 않는다.** 줄면 틀렸다 |
| **12** | **탐색 — 링크 검열** | A가 **링크 검열** 사용 | B 화면에서 **링크 절반쯤이 봉인 표시**되고 6초 뒤 풀린다. **최소 2개는 남아 있어야 한다** (B가 갇히면 안 된다) |
| **13** | **완주 경계 — 정상** | B가 목표 문서에 정상 도달 | B에 성공 화면 → 2.2초 뒤 로비. A에 상대 승리 화면 → 로비 |
| **14** | **완주 경계 — 아이템이 끝냈다** | A가 **잘못된 링크**/**임의 문서**로 상대(또는 자신)를 **목표 문서에 떨어뜨린다** | **성공 화면이 뜬다.** ⚠ 여기서 "이미 종료된 게임입니다" 복구 패널이 뜨면 틀렸다 — `enterSolvedState`가 안 걸린 것이고, `3e84fdc`가 그것 때문에 만들어졌다. **재현이 어려우면 13으로 갈음하고 이 항목을 미검증으로 남긴다** |
| **15** | **미니게임 — 구버전 수신** | (선택) 구버전 번들을 띄울 수 있을 때만 | 이 버전은 **미니게임을 보내지 않는다.** 받으면 **표시 전용 오버레이**가 잠깐 뜨고 스스로 닫힌다. 가위바위보 버튼이 보이면 틀렸다. **띄울 수 없으면 미검증으로 남긴다** — 보내는 쪽이 없으므로 정상 경로에서는 재현되지 않는다 |

**전 항목 공통:** 콘솔에 `room_events insert 실패`가 없어야 하고, Network 탭에
**`room_events`로 가는 POST가 없어야 한다** (GET/구독은 정상). 그것이 수용조건 ②를
눈으로 확인하는 방법이다.

---

## 3.7 스모크 회귀 — 카운트다운 정지와 지급 0행 `[2026-09-05]`

§3.6의 스모크를 실제로 돌렸고 **1번 항목에서 멈췄다.** 두 증상이 보고됐다:
시작 버튼 뒤 화면이 진행되지 않고, `duel_item_grants`가 **0행**이었다.

### 진단 — 지급 effect는 실패한 것이 아니라 **돌지 않았다**

의심은 6b가 다시 쓴 COUNTDOWN effect였다. 그것이 아니었다. 게이트웨이 로그가
바로 답했다:

```
21  POST /rest/v1/rpc/get_duel_item_state_v3     ← 복구 경로
75  POST /rest/v1/rpc/heartbeat_duel_v2          ← PLAYING 전용
 0  POST /rest/v1/rpc/ensure_duel_item_grant_v3  ← 한 번도 없다
```

**호출이 0건이면 async도, 삼킨 예외도, effect deps도 용의자가 아니다.** `phase`가
COUNTDOWN에 닿지 않았다는 뜻이고, 그 정지가 유일한 원인이다. 지급은 카운트다운
한 곳에서만 일어나므로 (`ensure_duel_item_grant_v3`) 정지가 곧 0행이다.

방 자신의 타임스탬프가 정지의 폭을 그대로 보여 준다:

| 사건 | 시각 |
|---|---|
| `started_at` — `waiting → starting` | `11:40:01.373` |
| `game_starts_at` — `starting → **playing**` | `11:40:01.832` |
| 복구 완료 (`get_duel_item_state_v3`) | `11:40:03` |
| **로그 완전 침묵** | `11:40:03 → 11:43:54` (3분 51초) |
| 새로고침 — 상태 조회 + 하트비트 동시 | `11:43:54` |

`RoomPage`는 `starting`에서 이동하므로 게임 화면은 **459ms 창 안에서** 뜨고 방을
`starting`으로 읽는다. 전이는 그 0.5초 뒤, **복구가 아직 위키 문서를 받고 있는
중에** 일어난다. `initialize_duel_player_v2`가 그것을 일으키면서
**참가자 행만 돌려주므로** 부른 쪽조차 방이 바뀐 것을 모른다. realtime은 제대로
실어 왔다 (`game_rooms`는 publication에 있다) — 그런데 복구가 1.5초 뒤에
자기 스냅샷으로 **그것을 덮었다.**

덮은 결과가 조용하지 않다. `game_rooms`는 다시 바뀌지 않고, 하트비트와 타임아웃
확정은 **PLAYING 게이트 안에만** 있으므로 아무도 방을 다시 읽지 않는다. 새로고침이
유일한 탈출구이고, 새로고침은 복구 경로여서 카운트다운을 건너뛴다 — **지급도 함께
사라진다.** 두 증상이 한 원인이었다.

### 6b 귀속 — 원인은 pre-track-C이고, 6b가 드러냈다

`setRoom(session.room)`과 phase 결정은 `450f63a`에서 **글자까지 그대로**이고
`CountdownOverlay`도 이 트랙이 건드리지 않았다. 6b가 한 것은 둘이다:
**지급을 카운트다운 한 곳으로 모았고** (그전에는 같은 effect가 로컬에서 뽑았으므로
같은 정지가 "빈 HUD"로 보였을 것이다), 6a가 그 자리의 동기 localStorage 읽기를
`await fetchDuelItemState(roomId)`로 바꿔 **덮는 창을 왕복 한 번만큼 넓혔다.**
`450f63a` 대조는 하지 않았다 `[사용자 판정, 2026-09-05]` — 원인이 이전 코드라는
것과 6b가 보이게 했다는 것, 둘 다 기록되면 충분하다는 판단이다.

### 수정 — 4곳, 전부 `pages/MultiplayerGamePage.jsx`

| | 무엇 | 왜 |
|:-:|---|---|
| **1** | 초기화 RPC 뒤에 **방과 참가자를 다시 읽는다** | 그 RPC가 방을 넘기면서 참가자 행만 돌려준다 — 부른 쪽에서 하필 그 순간에 낡는다 |
| **2** | 발행과 phase 결정이 **`classifyRealtimeVersion`으로 걸러진 방**을 본다 | 1만으로는 절반이다. **먼저 초기화한 쪽**은 재조회에서도 `starting`을 보고, 상대의 초기화가 그 뒤에 방을 넘긴다. realtime 핸들러가 이미 쓰는 규칙을 복구에도 적용한다 — 참가자는 `progress_version`으로 같이 |
| **3** | `enteredPlaying`을 `room.status`에서 유도하지 않는다 (`session.moveCount > 0`) | "방이 진행 중"은 **그 사람이 연출을 봤다는 증거가 아니다.** 섞어 쓰면 첫 입장이 공짜로 "이미 시작함"이 되고 그 기록은 되돌아오지 않는다 |
| **4** | 복구는 첫 입장을 **LOADING으로 내려놓는다** | 방을 보는 게이트가 VS_INTRO를 고르게 한다. 복구가 연출을 건너뛸 수는 있어도 **결정하지는 않는다** |

**2는 승인된 3건 밖이다** — 1이 관측된 실패는 닫지만 먼저 초기화한 쪽에는 같은
정지가 남아서, 그 상태로 회귀 테스트를 박으면 **구멍이 있는 수정을 고정한다.**

**방어선(진입 시 `inventory.length === 0`이면 재지급)은 깔지 않았다**
`[사용자 판정, 2026-09-05]`. 그 조건은 "아직 안 받았다"와 "다 썼다"를 구분하지
못해 **호출 이유를 설명할 수 없는 코드**가 되고, 더 나쁘게는 **phase 정지가
재발해도 아이템은 나오므로 가려진다.** 이번 정지가 보인 유일한 이유가 지급이 한
곳에만 있었던 것이다. 그 사실을 `tests/duelItemAuthority.test.js`의
"6b 회귀 ③"이 고정한다.

### ⚠ 관찰 — 조용한 몰수는 구조로 남는다

정지한 3분 51초 동안 **하트비트가 나가지 않았다.** 하트비트와 타임아웃 확정이
둘 다 PLAYING 게이트 안에 있기 때문이다. 그 결과가 DB에 남아 있다:

```
e59e4957  player_status = retired   move_count = 0
36d0e342  player_status = playing   move_count = 0
방 status = finished
```

**정지 자체가 경기를 잃게 만드는 경로다.** 한 사람은 한 번도 움직이지 못한 채
`disconnected_timeout`으로 은퇴 처리됐고, 화면에는 그 이유가 아무것도 나오지 않았다.

이번 수정이 정지를 없애므로 **증상은 사라진다.** 그러나 남는 구조는 그대로다:

> **PLAYING 게이트 밖에서는 아무도 방을 다시 읽지 않는다.**
> 하트비트(`:1255`)·타임아웃 확정(`:1274`)·경과 시간(`:1227`)이 전부
> `phase !== PHASE.PLAYING`에서 돌아선다. LOADING·VS_INTRO·COUNTDOWN에 머무는
> 동안 클라이언트는 **서버에 자기가 살아 있다고 말하지 않는다.**

그래서 **PLAYING 앞에서 무슨 이유로든 멈추면 그 멈춤은 몰수로 끝난다** — 조용히.
이번에는 낡은 방 스냅샷이 멈춤의 이유였고 그것은 닫혔다. 다른 이유가 생기면 같은
결말이 나온다. **관찰로 등재한다** `[사용자 지시, 2026-09-05]`. 닫는 방법은 이
웨이브의 범위가 아니다 — 하트비트를 phase에서 떼어내는 것은 v2 권위 계약을
건드리는 일이고, 그 판단은 이 트랙의 것이 아니다.

### ⚠ 수정이 만든 것 — 인트로가 다시 시작될 수 있다

복구는 `visibilitychange`에서도 돈다 (`:545-556`). 2세션 스모크는 창을 번갈아
보므로, **아직 움직이지 않은 상태에서 창을 전환하면** 이제 PLAYING으로 직행하는
대신 VS_INTRO가 다시 시작된다 (7.6초). 전환이 그보다 잦으면 인트로가 반복된다.

**아이템을 잃지는 않는다** — 지급은 방 단위이고 한 트랜잭션에서 두 사람 몫을
같이 넣으므로, 한쪽이 카운트다운에 닿으면 양쪽 행이 생기고 다른 쪽은
`get_duel_item_state_v3`로 그것을 읽는다. 연출만 반복된다. 정지와 맞바꾼
것이므로 수용하지만, **재스모크에서 창 전환을 조금 참으면** 1번 항목이 깨끗하게
보인다.

### 재스모크에서 먼저 볼 것

§3.6의 표는 그대로 유효하다. 이번 수정이 바꾼 것만 앞세우면:

1. **1번 항목** — 시작 뒤 **VS 인트로 → 3·2·1·시작! 이 실제로 보이고**, 끝나면
   양쪽 다 5칸이 뜬다. 인트로가 안 보이고 곧바로 게임이면 4가 되돌아간 것이다.
2. `select count(*) from duel_item_grants where room_id = …` → **10행**
   (두 사람 × 5칸). 0행이면 카운트다운에 닿지 않은 것이다.
3. **3번 항목**(F5 멱등)이 여전히 **연출 없이** 돌아오는가 — 3이 과하게
   적용됐다면 새로고침이 인트로를 다시 튼다.

### 게이트

`npm test` **320/320** (317 + 회귀 3) · `npm run build` exit 0 ·
§2.3 불변식 7개 전수 유지 (① 4 · ② diff 0줄 · ③ 13 · ④ 6 · ⑤ 131 · ⑥ 완주값 5 ·
⑦ diff 0줄) · `room_events` insert **0건** ·
`navigate("/multiplayer", { replace: true })` **3곳**(MultiplayerGamePage) ·
migration·pgTAP **무수정** (원인이 전부 클라이언트다) ·
동결 파일 전부 무접촉. **회귀 2건은 수정 전 소스에서 5개 단정이 모두 실패하는 것을
확인했다** — ③은 수정 전에도 통과한다 (이미 참인 결정을 앞으로 지키는 쪽이다).

---

## 3.8 두 번째 스모크 — 지급은 통과, 사용이 실패 `[2026-09-06]`

§3.7의 수정 뒤 다시 돌렸다. **지급은 정상이다** — 두 방에서 `duel_item_grants`
**10행**(2인 × 5칸)이 나왔고 6칸이 소비됐다. 즉 phase 정지는 닫혔다. 실패한 것은
**사용**이고, 두 갈래였다.

### 증상 1 — `STATE_VERSION_CONFLICT` (평범한 링크 클릭)

**아이템 응답이 아니다.** `use_duel_item_v3`는 성공 응답에 행 둘을 실어 준다
(`20260904090000:1036-1037` `'player', to_jsonb(v_actor), 'opponent', to_jsonb(v_opponent)`),
`useDuelItem`이 둘 다 옮기고 (`duelItemService.js:473-475`) `syncAfterItemUse`가
`players`에 반영한다. **6c·6d는 버전을 제대로 반영하고 있었다.**

진짜 원인은 하트비트다. `heartbeat_duel_v2` (`20260814091000:928`):

```sql
progress_version = progress_version + 1,
```

**이동의 낙관적 동시성 토큰을 살아 있다는 신호가 10초마다 올린다.** 방의 실측이
그것을 그대로 보여 준다 — `move_count` 1·3에 `progress_version` **88·86**.
이동 4번에 버전 88이다.

거부되는 이유는 값을 **읽는 시점**이었다. `handleMove`는 클릭 시점 렌더 클로저의
`myPlayer`를 잡아 두고, `fetchPageData` · `ensureWikiSnapshot`(1~1.5초) **뒤에**
`expectedVersion`을 보낸다. 서버는 정확히 일치하는 값만 받으므로
(`p_expected_version is distinct from v_player.progress_version`),
**10초 중 1.5초가 지는 창**이었다 — 클릭 6~7번에 한 번.

아이템과 무관하고 새것도 아니다. 아이템 사용 경로가 await를 1.6초 더 붙이므로
아이템 작업 옆에서 눈에 띈 것뿐이다.

**수정 (클라이언트만, migration 없음)** — 버전을 **호출 시점에 `playersRef.current`
에서 읽는다.** 그 ref는 하트비트·이동·아이템·realtime·복구가 쓴 마지막 커밋을
전부 담고 있다. 15% → 약 1%. 남는 것은 **요청이 이미 날아가 있는 하트비트 하나**다.

### ⚠ 관찰 — liveness ping이 동시성 토큰을 올린다

남는 1%는 클라이언트에서 닫을 수 없다. 구조가 이렇다:

> **`progress_version`은 두 가지 일을 겸한다** — 이동의 낙관적 동시성 토큰이면서,
> 10초마다 도는 생존 신호의 카운터다. 전자는 "내가 본 상태가 아직 맞는가"를 묻고
> 후자는 상태를 **바꾸지 않는다.** 그런데 같은 숫자를 올린다.

그래서 클라이언트는 **영구히 경합한다** — 아무것도 안 해도 서버 버전이 6번/분
올라간다. 분리하면 닫히지만 분리는 **배포된 v2 권위 계약을 건드리는 일**이고,
그 bump가 `room_players` realtime 이벤트를 만들어 **상대 생존 표시**를 굴리고
있다 (`classifyRealtimeVersion`이 `progress_version`으로 순서를 가린다). 둘을
떼어내려면 생존 신호에 별도 컬럼과 별도 publication 경로가 필요하다.

**C 범위 밖이다** `[사용자 판정, 2026-09-06]`. 관찰로 등재한다.

### 증상 2 — `LINK_SNAPSHOT_MISSING` (강제 이동 계열)

**타입 캐스팅이 아니었다.** 네 컬럼이 전부 `text`다 —
`wiki_snapshot_links.target_page_id` · `wiki_page_snapshots.page_id` ·
`room_players.current_page_id` · `current_revision_id`. 실제 조인은 **9행**을 낸다.

원인은 **목적지 스냅샷 커버리지**다. `private.resolve_wiki_revision`
(`20260814090000:188-193`)은 **목적지 문서의** `wiki_page_snapshots` 행에서
revision을 읽고, 그 행은 **누군가 그 문서를 스냅샷한 뒤에만** 존재한다 — 그것이
이동 계약이다 (`services/wikiSnapshotService.js`: 이동 RPC 전에 목적지를 스냅샷한다).

**아이템 강제 이동은 그 계약을 구조적으로 지킬 수 없다.** 목적지를 서버가 자기
트랜잭션 안에서 고르므로 그 사이에 클라이언트의 차례가 없다. 실측 `[2026-09-06]`:

| 문서 | 링크 | 해석 가능 |
|---|---:|---:|
| 대한민국 | 1399 | **1** |
| 일본 | 1246 | **1** |
| WWE | 251 | 2 |
| 김용화 (영화 감독) | 123 | 1 |
| 프로레슬링 | 81 | 2 |
| 마크 멀랜슨 | 25 | **0** |
| 꼼 | 18 | **0** |
| 네이선 존스 | 10 | 2 |
| 존 하이든라히 | 9 | 3 |
| 베라 랠스턴 | 4 | **0** |

스냅샷 10개, 링크가 가리키는 서로 다른 문서 **2,809개**. 링크 3,166행 전부
`target_revision_id`가 null이다 — 2026-08-29에 목적지 revid 배치를 의도적으로
없앴기 때문이고(`supabase/functions/wiki-snapshot:108-118`), 그래서 해석은
**목적지에 스냅샷이 하나라도 있는지**에만 걸린다.

선택 쿼리는 후보를 **먼저 하나 뽑고** 그다음에 해석해서 실패했다. 대한민국에서는
1399분의 1이었다. **위치와 무관한 이유가 이것이다** — 시작 문서에서도, 이동한
뒤에도 같았다.

**pre-track-C 결함이다.** `apply_duel_move_v2`의 FORCED_LINK 분기가 같은 모양이고
(`20260814092000:124-130`), 6c 이전의 피해자 경로는 `handleMove`를
`serverSelectedMove = true`로 불러 **현재 문서**를 스냅샷했다 — 목적지는 누구도
스냅샷하지 않았다. **강제 이동 계열은 어느 버전에서도 동작한 적이 없다.**
이 웨이브는 아이템을 HUD 슬롯으로 만들어 그것을 드러냈다.

### 수정 — A안, `20260904100000`

선택 쿼리에 **해석 가능성 필터**를 넣었다. 술어는 해석기의 WHERE 절을 그대로
쓴다 — 따로 적으면 규칙 둘이 어긋나기 시작하므로 **풀을 해석기가 정의하게** 한다.

```sql
and exists (
  select 1 from public.wiki_page_snapshots destination
  where destination.page_id = link.target_page_id
    and (link.target_revision_id is null
         or destination.revision_id = link.target_revision_id)
)
```

비면 기존 `NO_ELIGIBLE_LINK`가 나가고 **그 코드는 아무것도 소비하지 않는다**
(14 §4 · `consumed_at`은 성공 경로의 원장 INSERT 뒤에만 써진다). **도달할 수 없는
문서가 아이템을 먹지 않는다** — 가드를 느슨하게 푸는 대신 풀을 좁힌 이유다.

`v_to_revision is null` 가드는 **남겨 두었다.** 필터가 도달 불가로 만들지만,
select와 resolve 사이에 스냅샷이 지워지는 경합이 남는다. **한 번도 안 터지는
가드가 안 터짐을 증명하는 것보다 싸다.**

효과 실측 (같은 fixture 모양에 request_id 400개):

| 풀 | 목적지 분포 |
|---|---|
| **옛것** (필터 없음) | `p2` 119 · `p1` 99 · `gone4` 95 · `gone3` 87 → **281/400 = 70%가 해석 불가** |
| **A안** | `p2` **400/400** |

#### ❌ 채택하지 않은 B안 — 한 번의 실패를 영구 벽돌로 바꾼다

목적지 revision을 null로 통과시키는 쪽이 작아 보이고 훨씬 나쁘다. UPDATE가
`current_revision_id = coalesce(v_to_revision, current_revision_id)`이므로 피해자는
**새 `page_id`에 옛 `revision_id`**를 달게 된다. `apply_duel_move_v2`의 NORMAL_LINK는
`snapshot.page_id = current_page_id AND snapshot.revision_id = current_revision_id`를
요구하므로 (`20260814092000:119-120`) 그 짝에 맞는 스냅샷이 없고,
**이후 모든 링크 클릭이 `LINK_NOT_ALLOWED`가 된다** `[사용자 판정, 2026-09-06]`.

### ⚠ fixture가 이 결함을 새게 했다 — 그것부터 고쳤다

`supabase/tests/duel_item_authority_v3.sql`의 Page A는 목적지 `p1`…`p8`을 **전부
스냅샷하고** 링크마다 `target_revision_id`까지 채웠다. **해석 가능률 100%인
세계**다. 실제 데이터는 약 0.2%다. 그래서 143건이 통과하는 동안 제품이 깨졌다.

추가한 fixture는 실제 데이터의 모양을 재현한다 — 해석기 WHERE의 두 분기마다 하나씩:

| 문서 | 링크 | 왜 해석 불가인가 |
|---|---|---|
| **Page U** | `gone1`·`gone2` (revid null) | `wiki_page_snapshots` 행 자체가 없다 |
| | `p1` + `rWRONG` | 스냅샷은 있지만 그 revision이 아니다 |
| **Page M** | 위 셋 + `p2` (revid null) | 해석 가능한 목적지가 **정확히 하나** |

새 단정 5건 (plan 143 → **148**):

1. **fixture 자신의 모양** — 해석 불가한 목적지가 존재한다. 누가 Page A처럼
   "정리"하면 아래 넷은 여전히 통과하면서 제품이 다시 깨지므로, **이것을 먼저 박았다.**
2. Page U에서 `NO_ELIGIBLE_LINK`다 — `LINK_SNAPSHOT_MISSING`이 아니다.
3. 그리고 그 칸은 `consumed_at`이 null이다.
4. Page M에서는 `applied`다.
5. 목적지는 해석 가능한 `p2` **하나**다 — 뽑기 운이 아니다.

### 등재 — 부채 ③ 스냅샷 커버리지 (C안)

A안은 아이템을 **정직하게** 만들었을 뿐 좋게 만들지 않았다. 목적지가 "누군가
이미 방문한 몇 개"에서 뽑히므로 강제 이동이 피해자를 **가 봤던 곳으로** 보내는
경향이 생기고, 문서에 따라 여전히 쓸 수 없다 (실측 10개 중 3개가 후보 0). 진짜
해결은 커버리지를 올리는 것 — 이동 전에 후보 목적지를 미리 스냅샷하는 파이프라인
작업이고 **별도 웨이브다** `[사용자 판정, 2026-09-06]`.

| | 상태 |
|---|---|
| **부채 ③** 강제 이동 목적지 커버리지 | ⚠ **열림.** A안이 풀을 해석 가능한 것으로 좁혀 실패를 미소비로 바꿨다. 후보를 넓히려면 스냅샷 파이프라인이 목적지를 미리 채워야 한다. pgTAP의 fixture 모양 단정이 **커버리지가 올라가도 깨지지 않는다** — 해석 불가 링크는 fixture에 남는다 |

### ⚠ 관찰 — 그룹 경로에 같은 잠재 벽돌이 있다 (확인만 함)

`apply_group_move_v2`(`20260814103000:745-798`)는 `resolve_wiki_revision`을 부르고
**`LINK_SNAPSHOT_MISSING` 가드가 없다** — null이 그대로
`coalesce(v_to_revision, current_revision_id)`로 들어간다. 즉 B안이 1:1에서 만들
뻔한 어긋난 짝이 그룹에서는 **이미 표현 가능하다**, 그리고 같은 NORMAL_LINK 조회가
그 뒤 모든 클릭을 `LINK_NOT_ALLOWED`로 만든다.

**노출은 좁다.** 그룹은 아이템이 강제로 꺼져 있어
(`20260814103000:339` `GROUP_ITEMS_DISABLED`) **서버가 목적지를 고르는 경로가
없다.** NORMAL_LINK는 클라이언트가 목적지를 먼저 스냅샷하므로 null이 되려면 그
스냅샷 쓰기가 실패했거나 사이에 지워졌어야 한다. 설계상 도달하는 길은 아니다.

**고치지 않았다** — 동결 영역이고 이 웨이브 범위 밖이다 `[사용자 지시, 2026-09-06]`.

### `migration 무수정` 연속이 여기서 끊긴다 — P2·P3 재검증

`20260904100000_duel_item_link_resolvable_v3.sql` **신규**. 함수 하나
(`private.apply_duel_move_internal_v3`) `create or replace`, 그 외 **표·인덱스·
정책·publication·권한·반환 형태 무변경**. 함수 본문은 `20260904090000`의 것과
**추가된 필터 12줄을 빼면 바이트 동일**하다 (diff로 확인). `public.apply_duel_move_v2`
는 건드리지 않았다 — 옛 번들이 그것을 부른다.

| 게이트 | 결과 |
|---|---|
| `npx supabase db reset --local` | 처음부터 **15개 migration 전부 적용**, 새 파일 포함 exit 0 |
| pgTAP | **148/148 · `not ok` 0** · `finish()` 진단 0행 |
| `npm run supabase:preflight` | **11/11 PASS** (image·ACL·postmaster 안정성 포함) |
| A안 효과 실측 | 옛 풀 70% 해석 불가 → 새 풀 400/400 해석 가능 |

### 게이트

`npm test` **322/322** (320 + 회귀 2) · `npm run build` exit 0 ·
pgTAP **148/148** · preflight **11/11** ·
§2.3 불변식 7개 전수 유지 (① 4 · ② diff 0줄 · ③ 13 · ④ 6 · ⑤ 131 · ⑥ 완주값 5 ·
⑦ diff 0줄) · `room_events` insert **0건** ·
`navigate("/multiplayer", { replace: true })` **3곳**(MultiplayerGamePage) ·
동결 파일 전부 무접촉 (`ItemBar.jsx` · `useItemSystem` · `serverAuthority.js` ·
`multiplayerService.js` · `onlineGameSession.js` · `authContext.jsx` ·
`EffectOverlay.jsx` · `docs/contracts/` · `CURRENT.md` · `TRACKS.md`) ·
**기존 migration 14개 무수정** · 증상 1의 단정 3건은 수정 전 소스에서 실패하는 것을 확인.

### 재스모크에서 볼 것

1. **평범한 링크 클릭이 연속으로 먹는가.** 6~7번에 한 번 거부되던 것이 증상 1이다.
   콘솔에 `STATE_VERSION_CONFLICT`가 보이면 남은 1%(하트비트 in-flight)이거나
   ref 경로가 되돌아간 것이다.
2. **§3.6 8번 — 잘못된 링크.** 이제 `applied`가 나오고 피해자가 실제로 옮겨져야
   한다. 이동 횟수는 **+1**이다 (+2면 §3.5 발견 ①이 되살아난 것).
3. **후보가 없는 문서**에서 눌러 보면 "이동할 수 있는 링크가 없습니다" 계열
   안내가 뜨고 **칸이 그대로 남는다.** 칸이 사라지면 미소비 계약이 깨진 것이다.
   부채 ③ 때문에 이 경우가 드물지 않다 — 실패가 아니라 **정상 동작**이다.
4. **9·10번 조커** — `특수:임의 문서`는 같은 필터를 쓰므로 함께 좋아졌고,
   `역사 되감기`는 목적지가 이미 방문한 문서라 원래 영향이 없었다.

---

## 4. 미해결로 남기는 것

- **G2-② `room_events` INSERT 권한 회수** — C의 산출이 아니다. C가 클라이언트 INSERT를
  0건으로 만들고 **프론트가 배포된 뒤** 별도 창에서 회수한다 (§7.4). C는 경로만 만든다.
- **`docs/design/ITEM-IDEAS.md`** — 새 아이템 아이디어(삭제 토론 등)는 C 범위 밖.
  사용자가 별도 보관 예정이라고 밝혔다. 이 트랙은 만들지 않는다.
