# C4 — 결과 사유 어휘

**소유자: 공통.** 패킷 14·15·16·17이 전부 읽는다.
닫는 공백: **G11**. 공통 규칙은 [README](README.md).

**근거 문서:** `01-CONFIRMED-SPEC.md` §4.2·§6.2 · `10-CODE-MASTER-TODO.md` §4 ·
모바일 시안 §07 RESULT · Freeze v1 `05-04`·`05-05`.

---

## 0.-1 ⚠ 정정·확정 이력

**규칙은 C3 §0이 만들었다** — 무엇이 왜 바뀌었는지 남기고, 옛 값은 취소선으로 보존하며,
**근거는 코드 실측 또는 상위 문서여야 한다.**

| 날짜 | 무엇을 | 어떻게 | 근거 |
|---|---|---|---|
| **2026-09-02** | **§3.1의 부제 문구 2개** (`time_limit`·`grace_timeout`) | `확인 필요` → **확정.** `제한 시간 초과` · `유예 시간 초과` | **코드 채택.** `utils/groupResultFormatter.js:2-3`이 운영에서 쓰는 문자열이다 `[코드]`. **발명이 아니라 채택이라는 선택지가 있었다** — 새 문구를 만들면 같은 상태에 두 표현이 생긴다 `[사용자 결정]` |
| **2026-09-02** | **`disconnected_timeout`의 표시** | **계약의 `몰수` + 부제 `재접속 유예 종료`를 정답으로 확정.** 코드의 `"연결 끊김"`을 **정정 대상으로 등재** | **시안이 상위다** — §07 RESULT가 `몰수 — 재접속 유예 종료`를 표시한다 `[문서]`. **두 문자열이 같은 상태를 가리킨다는 것을 코드로 확인했다** — §3.1.1 `[사용자 결정]` |
| **2026-09-02** | §4의 창 귀속 | **3코스 창 = 4항목으로 확정.** `game_records` CHECK **1건**만 이 창에 실린다 | `docs/agent/TRACKS.md` §7.1 `[사용자 확정]` |

> **§5의 "CHECK 2건" 표기는 이 정정에 포함되지 않았다.** §4.2가 `match_end_reason`에
> CHECK를 붙이지 않기로 결정했으므로 **정확한 표현은 "판정 2건, 추가 1건"이다.**
> **문구 정정은 승인되지 않았고, 창 범위는 `TRACKS.md` §7.1이 1건으로 확정한다.**

---

## 0. 결정 — 통일하지 않는다

**`10-CODE-MASTER-TODO.md` §4는 `FINISHED`/`FORFEIT`/`RETIRE`/`CANCELLED` 4값 통일을
목표로 적었다. 그 목표를 채택하지 않는다** `[사용자 결정, 2026-09-02]`.

**이유:** 시안 §07 RESULT가 **완주 / 리타이어 / 몰수 / 기권** 4개 용어를 표시하는데,
그 구분은 **`result_status`(2값)가 아니라 `retire_reason`(5값)에서 나온다.**
어휘를 4값으로 줄이면 **표시에 필요한 정보를 버리게 된다.**

→ **저장은 현재 어휘를 유지하고, 표시 계층에서 매핑한다.**

---

## 1. ⚠ 이전 조사 두 건을 정정한다 `[코드, 2026-09-02]`

> **정정 1 — "`time_limit`·`grace_timeout`·`disconnected_timeout`은 쓰는 경로가 없다"는 틀렸다.**
> `leave_group_player`만 보고 판단한 결과다. **세 값은 전부 finalizer가 기록한다:**
> `20260807003609:438·440·451` · `20260814103000:501·502·513` · `20260814091000:957·962`.
>
> **정정 2 — "`game_rooms.match_end_reason`이 CHECK 없는 방 종료 사유 컬럼"이라는 서술도
> 오해를 부른다.** 실제 방 종료 사유 컬럼은 **`game_rooms.finished_reason`이고 CHECK가 있다**
> (`20260814091000:10-13`, 6값). **`match_end_reason`은 `20260814090000:105`가 추가한 뒤
> 어떤 migration도 쓰지 않는 죽은 컬럼이다.**

---

## 2. 저장 어휘 전수 — 7축 `[코드]`

| # | 컬럼 | 값 | CHECK | 쓰는 곳 |
|---|---|---|---|---|
| 1 | `game_rooms.finished_reason` | `all_resolved` · `time_limit` · `grace_timeout` · `cancelled` · `forfeit` · `normal_finish` (**6**) | **있음** `20260814091000:10-13` | 그룹 finalizer, duel RPC |
| 2 | `game_rooms.match_end_reason` | — | **없음** | **없음 — 죽은 컬럼** |
| 3 | `group_match_results.result_status` | `finished` · `retired` (**2**) | **있음** `20260807003609:89` | 그룹 결과 확정 |
| 4 | `group_match_results.retire_reason` · `room_players.retire_reason` | `left` · `forfeited` · `time_limit` · `grace_timeout` · `disconnected_timeout` (**5**) | **있음** `20260807003609:91-92` | `leave_group_player`(앞 2개) · finalizer(뒤 3개) |
| 5 | `single_game_runs.status` | `active` · `completed` · `abandoned` · `expired` (**4**) | **있음** `20260814091000:19` | 싱글 런 RPC |
| 6 | `game_records.result_status` | default `'completed'` | **없음** | `apply_single_move_v2:322` — **`'completed'`만 쓴다** |
| 7 | `match_history` | 승자/패자 컬럼만. **사유 컬럼 없음** | — | duel 결과 |

**진짜로 CHECK가 없으면서 쓰이는 컬럼은 6번 하나다.**

---

## 3. 표시 매핑 — DB → 4용어

**시안 §07 RESULT의 그룹 최종 순위가 요구하는 4용어를 저장 값에서 유도한다.**

### 3.1 그룹

| 표시 | 조건 | 근거 |
|---|---|---|
| **완주** | `result_status = 'finished'` | 순위·시간·이동을 함께 표시 |
| **기권** | `result_status = 'retired'` **and** `retire_reason in ('forfeited', 'left')` | **사용자가 스스로 나간 경우.** 시안 `링크수집가 기권` |
| **리타이어** | `retired` **and** `retire_reason in ('time_limit', 'grace_timeout')` | **시간이 끝나 남은 사람이 정리된 경우.** 시안 `빠른발 리타이어` |
| **몰수** | `retired` **and** `retire_reason = 'disconnected_timeout'` | **연결이 끊겨 유예가 지난 경우.** 시안 `밤샘독서 몰수 — 재접속 유예 종료` |

> **시안의 부제 `재접속 유예 종료`가 `disconnected_timeout`과 정확히 대응한다.**
> 이 대응이 매핑 전체의 검증점이다.

**부제 문구** — **확정 (2026-09-02)** `[사용자 결정]`. 규칙은 **시안 > 코드 > 발명**이다.

| `retire_reason` | **부제 (확정)** | 출처 | 옛 값 |
|---|---|---|---|
| `disconnected_timeout` | **재접속 유예 종료** | **시안** §07 RESULT `밤샘독서 몰수 — 재접속 유예 종료` `[문서]` | — |
| `grace_timeout` | **유예 시간 초과** | **코드** — `utils/groupResultFormatter.js:3`이 운영에서 쓰는 문자열 `[코드]` | ~~유예 시간 종료 `확인 필요`~~ |
| `time_limit` | **제한 시간 초과** | **코드** — `groupResultFormatter.js:2` `[코드]` | ~~제한 시간 종료 `확인 필요`~~ |
| `forfeited` · `left` | 없음 | — | — |

> **왜 코드 문자열을 채택하는가.** `01-CONFIRMED-SPEC.md`도 시안도 이 둘의 문구를 정하지
> 않았고, **운영에는 이미 문자열이 있다.** 새로 만들면 **같은 상태에 두 표현이 생긴다** —
> 사용자가 이미 보고 있는 표현을 정답으로 둔다. **§5-①의 "발명하지 않는다"는 규칙은 유지되고,
> 발명 대신 채택이라는 세 번째 선택지가 있었을 뿐이다** `[사용자 결정]`.

#### 3.1.1 `disconnected_timeout` — **"몰수"와 "연결 끊김"은 같은 상태다** `[코드, 2026-09-02 확인]`

**판정: 같은 상태를 가리킨다. 따라서 정정이고, 둘 다 필요한 것이 아니다.**

| 확인한 것 | 결과 |
|---|---|
| `formatGroupRetireReason`이 받는 값 | **`retire_reason`뿐이다** — `GroupGamePage.jsx:1336`·`:1483`이 `player.retire_reason \|\| player.leave_reason`을 넘긴다 `[코드]` |
| `"연결 끊김"`이 다른 상태에도 쓰이는가 | **아니다.** 저장소 전체에서 그 문자열은 `groupResultFormatter.js:6` **한 곳**뿐이다 `[코드]` |
| **살아 있는 끊김 상태(`player_status = 'disconnected'`)에 라벨이 있는가** | **없다.** `INACTIVE_STATUSES`에 `'disconnected'`가 **없어서**(`groupGameFlow.js:14-22`) 유예 중인 참가자는 `진행 중` 분기로 렌더된다 `[코드]`. **즉 "연결 끊김"이 그 상태를 표시하고 있는 것이 아니다** |
| 비슷해 보이는 다른 문자열 | `"실시간 연결이 끊겼습니다..."`(`GroupGamePage.jsx:772` 등)는 **보는 사람 자신의 realtime 복구 배너**다. 참가자 상태 라벨이 아니다 `[코드]` |

**두 문자열은 서로 다른 표시 슬롯에 있다:**

| 슬롯 | 지금 코드 | **계약의 정답** |
|---|---|---|
| **헤드라인 용어** | `"RETIRE"` **고정** — `retire_reason`을 보지 않는다 (`GroupGamePage.jsx:1479`) `[코드]` | **§3.1의 4용어** (완주/기권/리타이어/**몰수**) |
| **부제** | `formatGroupRetireReason(...)` → `"연결 끊김"` | **`재접속 유예 종료`** (위 표) |

> **그래서 4용어 매핑은 아직 코드에 존재하지 않는다.** `"RETIRE"`가 모든 retired를 덮고 있고
> 구분은 부제에서만 난다. **`"연결 끊김"` 하나를 고치는 것이 아니라 두 슬롯을 함께 구현하는
> 일이며, 그것이 이 계약이 요구하는 것이다.**

**정정 대상 등재 — 실행 트랙과 시점** `[사용자 결정]`:

| 항목 | 내용 |
|---|---|
| **대상** | `utils/groupResultFormatter.js:6`의 `disconnected_timeout: "연결 끊김"` → **`"재접속 유예 종료"`** · `GroupGamePage.jsx:1479`의 `"RETIRE"` 고정 → **4용어 매핑** |
| **누가** | **그룹 결과 화면을 소유하는 트랙** (그룹 트랙 또는 결과 화면 셸 트랙). **패킷 17a-2(트랙 B)가 아니다** |
| **왜 B가 아닌가** | `groupResultFormatter.js`의 **유일한 소비자가 `GroupGamePage.jsx`**이고 그 파일은 이 웨이브에서 **동결**이다 (`docs/agent/TRACKS.md` §2.1). 문구만 바꾸면 **동결된 화면의 표시가 편집 없이 바뀐다.** 게다가 `tests/groupResultFormatter.test.js:11`이 옛 문자열을 assert한다 `[코드]` |
| **그동안** | **B의 `utils/resultReasonLabels.js`에 정답을 먼저 담는다** — 위 표 그대로. **두 모듈이 잠시 공존하고, 통합 시점에 `groupResultFormatter.js` 호출이 새 모듈로 교체된다** |
| **위험** | 공존 기간에 **같은 상태에 두 문구가 존재한다.** 다만 **화면에 동시에 나타나지는 않는다** — 그룹 결과는 옛 모듈만, 새 모듈은 싱글·1:1만 쓴다 `[코드]` |

### 3.2 1:1

`match_history`에 사유 컬럼이 없으므로 **`game_rooms.finished_reason`에서 유도한다.**

| 표시 | 조건 | XP `source_type` ([C2](C2-XP-LEDGER.md)) |
|---|---|---|
| **승리** | `finished_reason = 'normal_finish'` and 본인 = `winner_user_id` | `duel_win_normal` (50) |
| **패배** | `normal_finish` and 본인 ≠ winner | `duel_loss_normal` (25) |
| **승리 · 상대 기권/이탈** | `finished_reason = 'forfeit'` and 본인 = winner | `duel_win_forfeit` (30) |
| **패배 · 기권** | `forfeit` and 본인 ≠ winner | `duel_loss_forfeit` (0) |
| **무효** | `finished_reason = 'cancelled'` | **XP 지급 없음** (`15` §2) |

**시안 §07의 `WIN_NORMAL`은 `normal_finish` + winner의 표시 토큰이다.**
시안이 `몰수승은 부제 + 30 XP + 완주 기록 없음`이라고 적은 것과 위 표가 일치한다.

### 3.3 싱글

| 표시 | 조건 |
|---|---|
| **완주** | `single_game_runs.status = 'completed'` (= `game_records` 행 존재) |
| **포기** | `status = 'abandoned'` |
| **만료** | `status = 'expired'` |

### 3.4 매핑이 사는 곳

**DB에 표시 문자열을 저장하지 않는다.** 매핑은 **프론트 단일 모듈**에 둔다:

```
utils/resultReasonLabels.js   ← 신규. 이 문서의 §3.1~§3.3을 구현한다
```

**선례가 있다** — `utils/groupResultFormatter.js:4-5`가 이미 라벨 대응을 하고 있다 `[코드]`.
**그 파일을 확장할지 새로 만들지는 15/16 착수 시 정한다** `확인 필요`.

---

## 4. CHECK 추가 — **3코스 창 대상**

### 4.1 `game_records.result_status`

```sql
alter table public.game_records
  add constraint game_records_result_status_check
  check (result_status = any (array['completed', 'abandoned', 'expired']::text[]));
```

| 논점 | 판단 |
|---|---|
| 값 집합 | **`single_game_runs.status`에서 `active`를 뺀 3값.** `game_records`는 런이 끝난 뒤에만 행이 생기므로 `active`가 올 수 없다 |
| 현재 실제 값 | **`'completed'`만 쓰인다** (`apply_single_move_v2:322`). 나머지 둘은 **미래 대비** |
| 위험 | **기존 행에 다른 값이 있으면 제약 추가가 실패한다.** 운영 데이터는 확인하지 않았다 → **창 안에서 먼저 `select distinct result_status`로 재고 붙인다** |

> **`확인 필요`: `abandoned`·`expired` 기록을 `game_records`에 남길 것인가.**
> 지금은 완주만 기록한다. **남기지 않기로 하면 CHECK를 `('completed')` 하나로 좁히는 편이
> 의도를 더 잘 드러낸다.** 17 착수 시 결정한다.

### 4.2 `game_rooms.match_end_reason` — **CHECK를 붙이지 않는다**

**죽은 컬럼에 제약을 붙이는 것은 의미가 없다.** 선택지 둘:

| 안 | 내용 | 평가 |
|---|---|---|
| **A (권장)** | **그대로 둔다.** 문서에 "미사용"이라고 적고 아무도 쓰지 않게 한다 | `AGENTS.md` §4 — 사용 여부가 확인되지 않은 컬럼은 삭제·rename 대상이 아니다 |
| B | `drop column` | **금지에 가깝다.** 운영 사용 여부를 확인하지 않았다 |

→ **A를 채택한다.** 이 문서가 그 기록이다. **`finished_reason`이 유일한 방 종료 사유 컬럼이다.**

### 4.3 창에 묶는 이유

**두 CHECK는 단독으로 창을 열 만한 항목이 아니다.** `PACKET-CONTRACT-GAPS.md` §5.5의
**`17a-1 오늘 3코스` 창에 함께 싣는다.** 그 창은 이미 `daily_challenges`의 제약을 교체하므로
같은 성격의 DDL이 하나 더 붙는 것이다.

---

## 5. 확정된 것 / 확인 필요

| 상태 | 항목 |
|---|---|
| **확정** | **통일하지 않는다는 방향** · **저장 어휘 7축 전수** · **그룹 4용어 매핑** · **1:1 5경우 매핑과 XP 연결** · 싱글 3경우 · **매핑은 프론트 단일 모듈 = `utils/resultReasonLabels.js` (신규, 트랙 B 소유)** · `match_end_reason`은 죽은 컬럼으로 보존 · CHECK 판정 2건(**추가 1건**)의 창 귀속 · **부제 문구 3개와 `시안 > 코드 > 발명` 규칙** (§3.1) · **`"연결 끊김"`은 `몰수`와 같은 상태이며 정정 대상** (§3.1.1) |
| **확인 필요** | ~~① `grace_timeout`·`time_limit`의 부제 문구~~ → **확정 (2026-09-02). §3.1** ② `game_records`에 미완주 기록을 남길 것인가 (§4.1) ~~③ 매핑 모듈을 `groupResultFormatter.js` 확장으로 할지 신규로 할지~~ → **신규 모듈로 확정.** `utils/resultReasonLabels.js`, 소유는 트랙 B (`TRACKS.md` §2.2·§3.1.1) ④ **`cancelled` 결과의 화면 표시** — 확정 스펙 §4.2가 "양쪽 서버 장애는 무효 처리 가능"이라고만 하고 표시를 규정하지 않는다 |

> ~~**①이 남은 이유를 적어 둔다.** 시안은 `몰수 — 재접속 유예 종료` 하나만 부제를 보여준다.
> 나머지 둘의 문구를 발명하지 않았다~~ → **①은 닫혔다 (2026-09-02).**
> **"근거가 없으면 만들지 않는다"는 규칙은 유지된다** — 근거가 **코드에 있었고**,
> 발명 대신 채택했다. 규칙은 **시안 > 코드 > 발명**으로 명시됐다 (§3.1).

> **③도 함께 닫혔다.** `groupResultFormatter.js`를 확장하지 않는 이유는 계약이 아니라
> **소유권이다** — 그 파일의 유일한 소비자가 동결된 `GroupGamePage.jsx`다 (§3.1.1).
