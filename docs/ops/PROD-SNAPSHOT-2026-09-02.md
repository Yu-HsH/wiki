# 운영 Supabase 스냅샷 — 2026-09-02

> 읽기 전용 확인 결과. 변경은 수행하지 않음.
> **이 문서는 특정 시점의 관찰 기록이며, 운영에 변경이 가해지면 무효가 된다.**
> 갱신 시 새 날짜 파일을 만들고 이 문서는 보존한다.
>
> **이 스냅샷은 `docs/ops/PROD-SNAPSHOT-2026-08-20.md`를 대체한다.** 그 문서는
> 2026-08-27~28 cutover 창이 운영을 바꾸면서 무효가 됐다 — 무엇이 어떻게 바뀌었는지는 **§1**.
> **08-20 문서는 삭제하지 않고 역사 기록으로 보존한다** (`AGENTS.md` §4).

**작성 시점의 저장소 상태:** 기준 커밋 `a32d362`, 브랜치 `feat/group-final-gaps`,
`origin/main` = `9eba7e9`. 운영 프론트는 `9eba7e9` 빌드다 (W10 Redeploy).

---

## 0. 확인 방법과 이 문서의 한계

**운영 측 값은 전부 사용자가 Supabase 대시보드 SQL Editor에서 `select` 전용으로 조회해 보고한
것이다** `[실측]`. **작성자는 운영 DB에 접근하지 않았다** (`AGENTS.md` §1).

저장소에서 파생한 값은 `[코드]`로 구분한다. **이 둘을 섞지 않는다** — 파생값은 "이렇게 되어
있어야 한다"이고 실측값은 "이렇게 되어 있다"이다. 두 축이 일치하는 곳은 그 사실을 명시했다.

### 0.1 이 스냅샷이 담은 것

| 축 | 실측 여부 |
|---|---|
| 테이블 수·목록 (21개) | **실측** |
| `public` 함수 수 (36개) | **실측** (수치만. 이름 목록은 미수집) |
| migration 이력 (12행, 최신 `20260814123000`) | **실측** |
| RLS 활성 여부 (off = 0) | **실측** |
| 정책 0개 테이블 (7개) | **실측** |
| `supabase_realtime` publication 멤버십 (4테이블) | **실측** |
| 데이터 규모 (users 145 / game_records 59 / last_play) | **실측** |

### 0.2 이 스냅샷이 담지 **않은** 것 — 다음 조회 대상

| 대상 | 왜 없나 |
|---|---|
| **테이블별 정책 수 표** | **조회 결과가 이 문서에 전달되지 않았다.** 요청에 `[결과 표 붙여넣기]` 자리표시자가 그대로 남아 있었다. **정책 합계도 미측정이다** — §4.2에 저장소 파생 기대값을 따로 두었으니 값이 들어오면 그 표와 대조한다 |
| `public` 함수 **이름 목록** | 수(36)만 보고됐다. 08-20 스냅샷은 7개 이름을 전부 담았다 |
| 제약·인덱스·트리거·컬럼 | 조회하지 않았다. 08-20의 §10.1(제약 52/52)에 해당하는 축이 이번엔 없다 |
| `GRANT`/ACL | 조회하지 않았다. **창 W2 덤프가 baseline과 바이트 동일**이었던 것은 창 시점 사실이며(CUTOVER-LOG §W2), migration 11개 적용 **후** 상태는 대조되지 않았다 |
| Storage `avatars` 객체 | 조회하지 않았다. 08-20 §4.1의 1건(소유자 `roeehd2`)이 마지막 실측이다 |
| Edge Function 배포 목록 (`target-level` 실물) | **여전히 미확인.** `docs/agent/CURRENT.md` §5.6-4 |
| 런타임 버전 | 조회하지 않았다. 08-20 §5의 PostgreSQL **17.6**이 마지막 실측이다 |

---

## 1. 2026-08-20 대비 변화 — cutover 창이 만든 것

**네 축이 전부 움직였고, 전부 `db push --linked`(W6)가 적용한 migration 11개가 만든 것이다.**

| 축 | 2026-08-20 | **2026-09-02** | 만든 단계 |
|---|---|---|---|
| `public` 테이블 | **14** | **21** (+7) | W6 — §3.2의 3개 migration |
| `public` 함수 | **7** | **36** (+31, −2) | W6 — §7 |
| RLS 비활성 테이블 | **2** (`group_match_history`·`user_profile_stats`) | **0** | W6 — `20260813072952_group_security_phase2c.sql:765-766` |
| migration 이력 | **테이블 자체가 부재** (42P01) | **12행**, 최신 `20260814123000` | W3(`repair`) + W6 |
| publication 멤버십 | 4테이블 | **4테이블 — 변화 없음** | §5 |

### 1.1 migration 이력 0 → 12의 성격이 다른 셋과 다르다

**나머지 세 축은 W6가 만들었지만 이력 12행 중 1행은 W3가 만들었다.**

- **1행 = baseline `20260730170602`** — `migration repair --status applied`가 기록했다.
  **스키마를 바꾸지 않고 이력 행만 남기는 연산**이다 (CUTOVER-PLAN U12).
- **11행 = W6의 `db push --linked`** — 실제 적용.

즉 **12 = 1(repair) + 11(push)** 이며, 08-20의 "42P01, 관계 자체가 없음"은
**"CLI push가 한 번도 없었다"는 뜻**이었다 (08-20 §1). 그 상태는 W3에서 끝났다.

> **이 창 이전의 운영 스키마는 CLI 이력 밖에서 구성돼 있었다.** baseline은 그 상태의 덤프이고,
> 창 W2의 덤프가 baseline과 **바이트 단위로 동일**했다는 것이 그 해석을 확정했다
> (CUTOVER-LOG §W2, md5 양쪽 `e2bfa805…`). **지금은 그렇지 않다** — 운영 스키마는
> 이제 로컬 migration 12개와 같은 상태이고, **`supabase/migrations/`가 그 단일 기준이다.**

### 1.2 RLS off 2 → 0은 "결함 수정"이 아니라 예정된 잠금이다

08-20 §10.4가 이미 적어 두었다 — `group_match_history`·`user_profile_stats`의 RLS 비활성은
**운영 실측 = baseline = 문서 기록의 3자 일치**였고, 잠금은
`20260813072952_group_security_phase2c.sql:765-766`이 하기로 되어 있었다 `[코드]`.
**그 migration이 W6에 포함돼 적용됐고 값이 0이 됐다.** 예정대로다.

---

## 2. migration 적용 상태 (2026-09-02)

| 항목 | 값 |
|---|---|
| `supabase_migrations.schema_migrations` 행 수 | **12** `[실측]` |
| 최신 version | **`20260814123000`** `[실측]` |
| 로컬 `supabase/migrations/*.sql` 수 | **12** `[코드]` |
| pending | **0으로 읽힌다** — 최신 version이 로컬 최신 파일과 같다 |

로컬 12개 (`[코드]`):

| # | version | name | 이 스냅샷에서의 역할 |
|---|---|---|---|
| 1 | `20260730170602` | `baseline_remote_schema` | W3 `repair`로 이력에 기록. 테이블 14 / 함수 7 / 정책 29의 출처 |
| 2 | `20260804004535` | `group_security_hardening_phase1` | 새 테이블 0, 새 함수 0 (기존 2개 재정의) |
| 3 | `20260807003609` | `group_match_lifecycle_phase2a` | 새 함수 3 |
| 4 | `20260813072952` | `group_security_phase2c` | **RLS off 2건 잠금.** 새 함수 7, 정책 9 생성·10 삭제 |
| 5 | `20260814090000` | `server_authority_v2` | **새 테이블 5** |
| 6 | `20260814091000` | `server_authority_rpc_v2` | **새 테이블 1**, 새 함수 14 |
| 7 | `20260814092000` | `duel_authority_v2` | 새 함수 4 |
| 8 | `20260814093000` | `server_authority_cutover_v2` | **함수 2개 삭제** |
| 9 | `20260814094000` | `duel_item_authority_v2` | 새 함수 1 |
| 10 | `20260814103000` | `group_final_gaps_v13` | **새 테이블 1**, 새 함수 1 |
| 11 | `20260814113000` | `group_final_gaps_v13_hardening` | 새 테이블·함수 0 (재정의 2) |
| 12 | `20260814123000` | `group_spectator_emoji_atomicity_fix` | 새 테이블·함수 0 (재정의 1) |

**적용 검증은 창 W7에서 전항목 통과했다** (CUTOVER-LOG §W7) — 함수 36 / legacy RPC 2개 부재 /
Packet 13 제약 2개 `convalidated = true` / `rls_off_tables` 0 / publication 4테이블 / 이력 12행.
**이 스냅샷의 실측이 그중 네 값을 2026-09-02에 재확인한 셈이다.**

---

## 3. `public` 테이블 21개

### 3.1 전체 목록 `[실측]`

| # | 테이블 | 08-20에 있었나 | 만든 migration |
|---:|---|---|---|
| 1 | `analytics_events` | 있음 | baseline |
| 2 | `daily_challenge_pool` | 있음 | baseline |
| 3 | `daily_challenges` | 있음 | baseline |
| 4 | **`game_move_events`** | **없음 — 신규** | `20260814090000_server_authority_v2.sql:47` |
| 5 | **`game_mutation_requests`** | **없음 — 신규** | `20260814090000_server_authority_v2.sql:87` |
| 6 | `game_records` | 있음 | baseline |
| 7 | `game_rooms` | 있음 | baseline |
| 8 | `group_match_history` | 있음 | baseline |
| 9 | `group_match_results` | 있음 | baseline |
| 10 | **`group_spectator_emoji_rate_limits`** | **없음 — 신규** | `20260814103000_group_final_gaps_v13.sql:45` |
| 11 | `match_history` | 있음 | baseline |
| 12 | `picked` | 있음 | baseline (§6) |
| 13 | `profiles` | 있음 | baseline |
| 14 | `room_events` | 있음 | baseline |
| 15 | `room_players` | 있음 | baseline |
| 16 | **`single_game_runs`** | **없음 — 신규** | `20260814091000_server_authority_rpc_v2.sql:15` |
| 17 | `target_candidates` | 있음 | baseline |
| 18 | `user_profile_stats` | 있음 | baseline |
| 19 | **`wiki_page_snapshots`** | **없음 — 신규** | `20260814090000_server_authority_v2.sql:16` |
| 20 | **`wiki_pages`** | **없음 — 신규** | `20260814090000_server_authority_v2.sql:6` |
| 21 | **`wiki_snapshot_links`** | **없음 — 신규** | `20260814090000_server_authority_v2.sql:30` |

**14개 전부 그대로 있고 삭제된 테이블은 없다.** 08-20 §9.1의 14개 목록과 이름 단위로 1:1
대응한다 — **21 = 14 + 7**이며 잉여도 결손도 없다.

### 3.2 새 테이블 7개는 3개 migration이 만들었다 `[코드]`

| migration | 만든 테이블 | 무엇을 위한 것인가 |
|---|---|---|
| **`20260814090000_server_authority_v2`** | `wiki_pages` · `wiki_page_snapshots` · `wiki_snapshot_links` · `game_move_events` · `game_mutation_requests` | **5개.** 앞 3개는 **위키 문서 캐시**(서버가 확정한 문서·리비전·링크 집합), 뒤 2개는 **서버 권위 이벤트 로그와 멱등성 원장** |
| **`20260814091000_server_authority_rpc_v2`** | `single_game_runs` | **1개.** 싱글 게임의 서버 측 런 상태 |
| **`20260814103000_group_final_gaps_v13`** | `group_spectator_emoji_rate_limits` | **1개.** 관전 이모티콘 3초 쿨타임 원장 |

**7개 전부 `create table if not exists`로 만들어졌다** `[코드]`. 즉 재실행에 안전한 형태이며,
W6가 11개를 한 번에 적용할 때 순서 의존이 문제되지 않았던 이유 중 하나다.

> **성격이 명확히 갈린다.** 7개 중 **사용자 입력을 직접 받는 테이블은 하나도 없다.**
> 전부 **서버가 쓰고 서버가 읽는** 캐시·원장·이벤트 로그다. §4의 접근 설계가 그 성격을 그대로
> 반영한다.

---

## 4. RLS와 정책

### 4.1 실측된 것 `[실측]`

| 항목 | 값 |
|---|---|
| RLS **비활성** 테이블 수 | **0** — 21개 전부 활성 |
| RLS 활성 + **정책 0개**인 테이블 | **7개** |
| 그 7개 | 신규 5개(`game_mutation_requests`·`group_spectator_emoji_rate_limits`·`wiki_page_snapshots`·`wiki_pages`·`wiki_snapshot_links`) + `picked` + `daily_challenge_pool` |
| **테이블별 정책 수 / 정책 합계** | **미측정 — §0.2** |

### 4.2 저장소 파생 기대값 — **실측이 아니다** `[코드]`

**정책 수 표가 없어 대조를 못 했으므로, 대신 저장소에서 기대값을 계산해 둔다.**
값이 들어오면 이 표와 대조한다.

계산 방법: baseline의 `CREATE POLICY` 29개에 migration 11개의 `create policy` 9+1+1개를
더하고 `drop policy` 중 **실제로 존재하던 대상만** 뺐다 (`drop ... if exists`가 대부분
no-op이라 단순 가감이 성립하지 않는다).

| 테이블 | 08-20 실측 | **기대값** | 변화를 만든 것 |
|---|---:|---:|---|
| `analytics_events` | 1 | 1 | — |
| `daily_challenge_pool` | 0 | **0** | — |
| `daily_challenges` | 1 | 1 | — |
| `game_move_events` | — | **1** | `20260814090000:281` "Members can read move events" |
| `game_mutation_requests` | — | **0** | — |
| `game_records` | 4 | 4 | — |
| `game_rooms` | 5 | **5** | phase2c가 3개 삭제 후 duel용 3개 재생성 (`:798-800` → `:802·:811·:830`) |
| `group_match_history` | 0 | **1** | phase2c `:783` — RLS 잠금과 함께 조회 정책 신설 |
| `group_match_results` | 3 | 3 | — |
| `group_spectator_emoji_rate_limits` | — | **0** | — |
| `match_history` | 2 | 2 | — |
| `picked` | 0 | **0** | — |
| `profiles` | 5 | 5 | — |
| `room_events` | 2 | **2** | phase2c `:898` 삭제 → `:900` 재생성 |
| `room_players` | 4 | **4** | phase2c `:839-843` 3개 삭제 → `:846·:861·:884` 재생성 |
| `single_game_runs` | — | **1** | `20260814091000:59` "Users can read own single runs" |
| `target_candidates` | 2 | 2 | — |
| `user_profile_stats` | 0 | **1** | phase2c `:791` |
| `wiki_page_snapshots` | — | **0** | — |
| `wiki_pages` | — | **0** | — |
| `wiki_snapshot_links` | — | **0** | — |
| **합계** | **29** | **33** | +4 |

> **이 파생이 신뢰할 만한 이유 2가지.**
> ① 같은 방법으로 baseline만 계산하면 **정확히 29 / 14테이블**이 나오고, 이는 08-20 §10.3의
> **실측과 완전히 일치한다.**
> ② 위 표가 예측한 "정책 0개 테이블 7개"의 **구성**(신규 5 + `picked` + `daily_challenge_pool`)이
> **2026-09-02 실측과 정확히 같다.**
> **그래도 이것은 파생값이다.** 합계 33은 **확인된 값이 아니다.**

### 4.3 정책 0개 테이블 7개는 결함이 아니다 — 접근이 3계층으로 설계돼 있다

**"RLS 활성 + 정책 0개"는 그 테이블에 대한 `anon`/`authenticated`의 행 접근이 전면 차단됐다는
뜻이다.** 정책이 없으면 통과할 조건 자체가 없기 때문이다. **이것은 누락이 아니라 설계다** —
근거는 migration의 권한 구문과 주석에 명시돼 있다 `[코드]`.

| 계층 | 테이블 | 권한 구문 | 클라이언트가 읽을 수 있나 |
|---|---|---|---|
| **A. 정책으로 열린 것** | `game_move_events` `single_game_runs` | `revoke all from anon, authenticated` → `grant select to authenticated` **+ 정책 1개** | **예, 범위 한정.** 이벤트는 같은 방 참가자만(`20260814090000:281-291`), 런은 본인 것만(`20260814091000:59-63`) |
| **B. 권한은 있으나 정책이 없어 행이 안 나오는 것** | `wiki_pages` `wiki_page_snapshots` `wiki_snapshot_links` | `revoke all` → `grant select to authenticated, service_role` **+ 정책 0개** | **아니오.** SELECT 권한은 있지만 RLS가 전부 막는다 |
| **C. 권한 자체가 회수된 것** | `game_mutation_requests` `group_spectator_emoji_rate_limits` | `revoke all` (후자는 **`service_role`에서까지** 회수) | **아니오** |

**의도가 주석에 적혀 있다** `[코드]`:

- `20260814090000_server_authority_v2.sql:268` — 위키 캐시 3개 바로 위에
  **"This is intentionally service-role only. The browser never writes the cache directly."**
- 같은 파일 `:296` — **"The service role owns cache writes; RPCs own event and projection writes."**
- `20260814103000_group_final_gaps_v13.sql:42-44` — 쿨타임 원장 바로 위에
  **"only an atomic server-side rate-limit ledger... not a client-readable chat or inventory table
  and is deliberately not published to Realtime."**

**계층 C가 어떻게 동작하는가 — 이것이 설계의 핵심이다.**
`group_spectator_emoji_rate_limits`는 `public`·`anon`·`authenticated`·**`service_role` 전부에서**
권한이 회수돼 있다 (`:53-54`). 그런데도 쿨타임은 동작한다 —
`send_group_spectator_emoji_v13`이 **`security definer`**이고 `set search_path = ''`이기 때문이다
(`20260814123000:10-18`). **함수 소유자 권한으로 실행되므로 호출자 권한과 무관하게 원장을
읽고 쓴다.** 클라이언트에게는 `grant execute ... to authenticated`로 **함수만** 열려 있다
(`:159-161`). **즉 접근 경로가 테이블이 아니라 함수 하나로 좁혀져 있다.**

> **계층 B에 대한 관찰 1건 — 결함은 아니나 기록해 둔다.**
> 위키 캐시 3개는 `grant select`를 받았는데 정책이 없어 **그 권한이 현재 아무 효과가 없다.**
> 위 주석("intentionally service-role only")과 대조하면 **권한 부여 쪽이 관대하고 RLS가 닫는
> 형태**이며, 결과는 의도와 같다(닫힘). **다만 나중에 이 테이블을 클라이언트에서 직접 읽고
> 싶어지면 부족한 것은 `grant`가 아니라 `policy`다** — `grant`만 다시 보고 "이미 열려 있다"고
> 읽으면 오진한다. 지금 이 캐시는 Edge Function `wiki-snapshot`과 `replace_wiki_snapshot_v2`
> (`service_role` 전용 execute, `:300-301`)를 통해서만 오간다.

**`daily_challenge_pool`은 성격이 다르다.** baseline 시절부터 정책 0개였고
`anon`/`authenticated`/`service_role`에 `GRANT ALL`이 있다
(`20260730170602:1425-1427`) — **즉 권한은 넓은데 RLS가 전부 막는 형태**로 계층 B와 같다.
접근 경로는 `ensure_today_daily_challenge`이며 이 함수도 **`SECURITY DEFINER`**다
(`20260730170602:66`, `:76`에서 이 테이블을 읽는다) `[코드]`.
**따라서 정책 0개는 이 테이블에서도 의도된 상태다.**

---

## 5. `supabase_realtime` publication — 4테이블, 변화 없음

### 5.1 실측 `[실측]`

`game_rooms` · `group_match_results` · `room_events` · `room_players` — **4개.**
**08-20 이후 변하지 않았다.** 창 W7에서도 같은 값이 확인됐다 (CUTOVER-LOG §W7 #5).

### 5.2 새 테이블 7개는 하나도 발행되지 않았다 `[코드]`

**`ALTER PUBLICATION ... ADD TABLE`은 저장소 전체에서 baseline 4행이 전부다**
(`20260730170602:1186·1190·1194·1198`). **migration 11개는 publication을 한 번도 건드리지
않는다** — 추가도 제거도 없다. 실측 4테이블은 그 사실과 정확히 일치한다.

`group_spectator_emoji_rate_limits`의 미발행은 **명시적 의도**다 — §4.3이 인용한 주석이
"deliberately not published to Realtime"이라고 적는다.

### 5.3 지금은 무해하다 — 프론트 구독이 부분집합이기 때문이다 `[코드]`

앱이 `postgres_changes`로 구독하는 테이블은 **3개뿐**이다:

| 테이블 | 구독 위치 |
|---|---|
| `game_rooms` | `pages/GroupGamePage.jsx:706` · `GroupRoomPage.jsx:102` · `MultiplayerGamePage.jsx:253` · `RoomPage.jsx:110` |
| `room_players` | `GroupGamePage.jsx:728` · `GroupRoomPage.jsx:119` · `MultiplayerGamePage.jsx:279` · `RoomPage.jsx:127` |
| `room_events` | `GroupGamePage.jsx:752` · `MultiplayerGamePage.jsx:1027` |

**{`game_rooms`, `room_players`, `room_events`} ⊂ publication 4테이블**이므로
**구독하는 것은 전부 발행돼 있다.** `group_match_results`는 발행돼 있으나 실시간 구독은 없고
RPC·REST로 읽는다 — **잉여이지 결손이 아니다.**

### 5.4 향후 제약 — 실시간이 필요해지면 publication 추가가 **선행 조건**이다

**`game_move_events`처럼 발행되지 않은 테이블에 `postgres_changes` 구독을 붙이면 이벤트가
오지 않는다.** 그리고 그 증상은 **조용하다** — 구독 자체는 성공하고 payload만 영원히 오지
않으므로 클라이언트 코드에서는 정상과 구분되지 않는다.

**따라서 새 실시간 기능의 순서는 이렇게 고정된다:**

1. `alter publication supabase_realtime add table public.<t>;` 를 **forward-only migration으로**
   추가한다 (`AGENTS.md` §4 — 기존 migration을 되돌려 고치지 않는다).
2. **운영 적용은 새 창이고 새 승인이다** (`AGENTS.md` §1). 게이트가 해제된 지금은
   W0(게이트 on)부터 다시 밟는 것이 더 중요해졌다 — `CUTOVER-PLAN.md` §0.-2.
3. 그 다음에 프론트 구독을 붙인다. **역순이면 조용히 실패한다.**

> **RLS도 함께 본다.** publication에 넣어도 **정책이 없으면 클라이언트에 행이 가지 않는다.**
> §4.3의 계층 B·C 테이블은 **publication 추가만으로는 실시간이 동작하지 않으며 정책도
> 필요하다.** 두 축을 같이 바꿔야 한다.

---

## 6. `picked` — 여전히 존재하고 여전히 정책 0개

| 항목 | 값 |
|---|---|
| 존재 | **있음** `[실측]` — 21개 목록 12번 |
| RLS | **활성**, 정책 **0개** `[실측]` |
| 권한 | `anon`·`authenticated`·`service_role`에 `GRANT ALL` (`20260730170602:1461-1463`) `[코드]` |
| 참조 | **migration 12개·앱 코드 모두 0건** — 08-20 §9.4의 확인이 지금도 유효하다 |

**08-20 이후 이 테이블에 대해 바뀐 것은 없다.** `daily_challenge_pool`의 제약 없는 사본
형태이고(08-20 §9.4), 보존 결정(U10)에 따라 창에서도 건드리지 않았다.

> **⚠ 저장소 루트의 `GROUP_SPECTATOR_MIGRATION.sql`과 혼동하지 않는다.**
> 그 파일은 **폐기 판정**을 받은 미추적 제안 파일로, 적용하면 v13 계약이 깨진다
> (`docs/agent/CURRENT.md` §4). **`picked`와는 무관한 별개 사안**이며,
> 두 항목의 공통점은 "존재하지만 쓰이지 않는다"뿐이다.

**정리(drop) 여부는 여전히 미결정이며 이 스냅샷이 바꾸지 않는다.** `AGENTS.md` §4에 따라
운영에서 사용 여부가 확인되지 않은 객체는 삭제 대상이 아니다.

---

## 7. `public` 함수 7 → 36

### 7.1 실측 `[실측]`

**36개.** 이름 목록은 이번 조회에 포함되지 않았다 (§0.2).

### 7.2 저장소 파생과 정확히 일치한다 `[코드]`

| 단계 | 수 |
|---|---:|
| baseline `public` 함수 | 7 |
| migration 11개가 **새로 도입**한 이름 | **+31** |
| `20260814093000_server_authority_cutover_v2`가 삭제 | **−2** (`finish_group_player` · `update_group_progress`) |
| **합계** | **36** |

**실측 36과 일치한다.** 창 W7의 실측(36)과도 같다.

### 7.3 어느 migration이 무엇을 도입했나 `[코드]`

| migration | 새 함수 | 이름 |
|---|---:|---|
| `20260804004535` phase1 | **0** | 없음 — `finish_group_player`·`start_group_room_game` **재정의**만 |
| `20260807003609` phase2a | 3 | `activate_group_room_game` · `finalize_group_room_if_expired` · `leave_group_player` |
| `20260813072952` phase2c | 7 | `create_group_room` · `finalize_group_records` · `join_group_room` · `leave_group_waiting_room` · `set_group_ready` · `submit_group_target` · `update_group_progress` |
| `20260814090000` v2 | 1 | `replace_wiki_snapshot_v2` |
| `20260814091000` rpc_v2 | **14** | `apply_group_move_v2` · `apply_guest_single_move_v2` · `apply_single_move_v2` · `create_single_game_run` · `finalize_duel_if_expired` · `get_single_game_run` · `heartbeat_duel_v2` · `initialize_duel_player_v2` · `leave_single_game_run` · `set_duel_target_v2` · `start_duel_room_v2` · `start_group_room_game_v2` · `start_group_room_game_v2_safe` · `submit_group_target_v2` |
| `20260814092000` duel_v2 | 4 | `apply_duel_move_v2` · `create_duel_room_v2` · `join_duel_room_v2` · `leave_duel_room_v2` |
| `20260814093000` cutover_v2 | **0 (−2)** | `finish_group_player` · `update_group_progress` **삭제** |
| `20260814094000` duel_item_v2 | 1 | `apply_duel_swap_v2` |
| `20260814103000` v13 | 1 | `send_group_spectator_emoji_v13` |
| `20260814113000` v13_hardening | 0 | 재정의 2 (`finalize_group_room_if_expired` · `send_group_spectator_emoji_v13`) |
| `20260814123000` emoji_atomicity | 0 | 재정의 1 (`send_group_spectator_emoji_v13`) |

> **`update_group_progress`는 phase2c가 만들고 cutover_v2가 지웠다** — 세 창 사이에 생겼다
> 사라진 함수다. 08-20 스냅샷에 없는 이유가 이것이다(그때는 phase2c가 미적용이었다).
> **`finish_group_player`만 baseline에 있었고 삭제됐다** — 창의 배포 순서
> W0→W1→W6가 이 삭제의 파손 위험을 막았다 (CUTOVER-LOG §W1·§W6·§W7).

**legacy RPC 2개 부재는 W7에서 `to_regprocedure` 둘 다 `null`로 확인됐다** (CUTOVER-LOG §W7 #2).

---

## 8. 데이터 규모 `[실측]`

| 항목 | 값 |
|---|---|
| users | **145** |
| `game_records` | **59** |
| 마지막 플레이 | **2026-08-28 13:49:33 UTC** |

### 8.1 마지막 플레이는 창의 스모크로 읽힌다 — 실사용자 기록이 아니다

**2026-08-28 13:49:33 UTC = 2026-08-28 22:49 KST**이고, 이는 **창 세션 2 구간
(21:47~23:17 KST) 안**이다 (CUTOVER-LOG §0). 그 구간에서 W9가
**"인증 사용자 단일 게임 시작 → 이동 → 완주"를 통과**시켰다 (§W9 통과 표).

`game_records`에 행을 넣는 곳은 **`apply_single_move_v2` 한 군데**이며, **싱글 런이
`completed`가 될 때만** 쓴다 (`20260814091000_server_authority_rpc_v2.sql:322`) `[코드]`.
**그룹 완주는 이 테이블에 쓰지 않는다** — `group_match_results`·`group_match_history`로 간다.

**그래서 두 가지가 동시에 설명된다:**
- 마지막 값이 08-28인 이유 → **W9의 싱글 완주**
- **2026-09-02의 W9-b(4인 그룹 재스모크)가 이 값을 밀지 않은 이유** → 그룹 경로는
  `game_records`를 건드리지 않는다

> **`docs/agent/CURRENT.md`가 여러 곳에 적어 온 "최종 플레이 2026-08-04 `[실측]`"과 모순되지
> 않는다.** 08-04는 **실사용자** 최종 플레이이고 08-28은 **창이 만든 스모크 기록**이다.
> **즉 실사용자 플레이는 2026-08-04 이후 여전히 없는 것으로 읽힌다.**
> **다만 이것은 정황 추론이다** — 행 단위로 `user_id`·`run_id`를 대조하지 않았다.
> 확정하려면 `game_records`에서 08-04 이후 행의 소유자를 확인해야 한다 `[미확인]`.

### 8.2 users 145 vs game_records 59

**해석하지 않는다.** 가입자 수와 싱글 완주 기록 수는 단위가 다르고
(한 사용자가 여러 번 완주할 수 있고, 한 번도 안 할 수도 있다),
**전환율로 읽을 근거가 이 두 값에 없다.** 08-20 스냅샷에는 대응 값이 없어 증감도 알 수 없다.

---

## 9. 이 스냅샷이 새로 만들거나 남긴 항목

| # | 항목 | 성격 |
|---|---|---|
| 1 | **테이블별 정책 수 미측정** | 이 문서의 가장 큰 공백. §4.2의 기대값(합계 33)과 대조하면 닫힌다 |
| 2 | **`public` 함수 이름 36개 미수집** | 수는 맞지만 목록 대조는 못 했다. 08-20은 7개 이름을 전부 담았다 |
| 3 | **제약·인덱스·트리거·컬럼 미대조** | 08-20 §10.1의 52/52에 해당하는 축이 이번엔 없다. W7이 Packet 13 제약 2개만 확인했다 |
| 4 | **`GRANT`/ACL 미대조** | migration 11개 적용 **후** 상태는 한 번도 대조되지 않았다 |
| 5 | `target-level` Edge Function 실물 미확인 | 08-20부터 이어진 항목. `CURRENT.md` §5.6-4 |
| 6 | 마지막 플레이 08-28의 소유자 미확인 | §8.1의 추론을 확정하려면 필요 |
| 7 | **무료 요금제 7일 자동 일시정지** | **게이트 해제로 성격이 바뀐 운영 위험.** `CURRENT.md` §5.0 D |

### 9.1 항목 7 — 자동 일시정지가 이제 사용자에게 보인다

**사실 `[외부]`:** 무료 요금제는 일정 기간 무활동 시 프로젝트를 자동 일시정지한다.
CUTOVER-PLAN §3.3이 **7일**로 적고 있으며, 창 절차가 **P4(프로젝트 Active)를 전날과 당일에
각각 확인하도록** 만든 근거가 이것이다.

**무엇이 바뀌었나.** 창 기간에는 일시정지가 **개발자만 겪는 문제**였다 — 유지보수 게이트가
켜져 있어 사용자는 어차피 점검 화면만 봤다. **W10 이후에는 사용자가 깨진 사이트를 만난다.**
프론트는 Vercel에 정적으로 떠 있으므로 **앱은 뜨고 DB 호출만 실패하는 형태**가 된다 —
점검 화면보다 나쁜 경험이다.

**확인된 마지막 DB 활동은 2026-09-02**다 (W9-b 재스모크·W10). **그 이전 활동은 08-28이었고
그 사이 5일은 활동이 없었던 것으로 읽힌다** — 창이 닫힌 뒤 재스모크까지의 공백이다.

> **정지 조건의 정확한 판정 기준·유예·알림 여부는 확인하지 않았다** `[미확인]`.
> "7일"은 CUTOVER-PLAN의 기재값이며 이 스냅샷이 재확인한 값이 아니다.
> **따라서 "9월 9일에 멈춘다"고 단정하지 않는다.**

**완화책은 단순하다 — 주 1회 접속.** 실사용자 트래픽이 정착하면 자연히 해소되는 항목이므로
**영구 조치가 아니라 한시적 운영 습관**으로 다룬다. 트래픽이 붙었는지의 판단 기준은
§8의 `game_records`·`last_play`를 다시 재는 것이다.

---

## 10. 관계 문서

| 문서 | 관계 |
|---|---|
| **`docs/ops/PROD-SNAPSHOT-2026-08-20.md`** | **이 문서가 대체한다. 역사 기록으로 보존.** 그 문서의 §1(migration 미적용)·§2(함수 7개)·§9.1(테이블 14개)·§10.3(RLS 12/14, 정책 29)은 **전부 낡았다** — 무엇이 바꿨는지는 §1. **§4.1(avatars 객체)·§5(런타임 17.6)는 이번에 재조회하지 않았으므로 그쪽이 여전히 마지막 실측이다** |
| `docs/agent/CURRENT.md` | **지금 상태의 단일 기준.** 판정·다음 작업. 이 스냅샷은 그 §5.0의 B1을 닫는다 |
| `docs/ops/CUTOVER-LOG-2026-08-27.md` | 이 변화를 만든 창의 실행 기록. §W3·§W6·§W7이 이 문서 §1·§2의 근거다 |
| `docs/ops/CUTOVER-PLAN.md` | 창 절차. **다음 창(패킷 14~17의 DB 변경)에서 다시 쓴다** — 개선점은 §0.-2 |
| `supabase/migrations/` | **운영 스키마의 단일 기준이 됐다.** 창 이전에는 아니었다 (§1.1) |
| `docs/WIKI_RACE_GROUP_DB_SECURITY_SPEC.md` (봉인) | RLS 설계 의도의 출처. **§5.4의 "현재 RLS 잠금이 필요하다"는 이 스냅샷의 `rls off = 0`으로 해소됐다** |
