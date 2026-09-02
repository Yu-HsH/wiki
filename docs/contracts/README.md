# 공통 계약 — 패킷 14~17이 공유하는 것

갱신 날짜: 2026-09-02
기준 커밋: `682fc9c`
브랜치: `feat/group-final-gaps`

> ## 이 디렉터리의 문서는 **어느 패킷도 재정의하지 않는다**
>
> 패킷 단위로 계약을 고정하면 **"두 패킷이 같은 것을 각자 정의하는" 항목이 어디서도 닫히지
> 않는다.** 그래서 공유 대상을 먼저 동결한다. `10-CODE-MASTER-TODO.md` §4가 이미 이 자리를
> 가리키고 있었고, 이 디렉터리가 그것을 실제 계약으로 구체화한 것이다.
>
> **소유자는 전부 `공통`이다.** 패킷 14·15·16·17은 **소비자**이며,
> 자기 문서에서 이 테이블·함수를 다시 정의하지 않는다.

---

## 계약 목록

| # | 계약 | 대상 | 닫는 공백 | 소비 패킷 |
|---|---|---|---|---|
| **C1** | [보상 3테이블](C1-REWARD-TABLES.md) | `reward_catalog` · `user_reward_inventory` · `user_profile_equipment` | **G1** | 16 · 17 |
| **C2** | [XP 원장](C2-XP-LEDGER.md) | `xp_ledger` | **G4** | 15 · 16 |
| **C3** | [레벨 저장 위치](C3-LEVEL-STORAGE.md) **⚠ 정정 1건** | `profiles.total_xp` + `level_from_total_xp()` | **G6** | 15 · 16 · 17 |
| **C4** | [결과 사유 어휘](C4-RESULT-REASON.md) | 표시 매핑 + CHECK 2건 | **G11** | 14 · 15 · 16 · 17 |
| **C5** | [프로필 카드 렌더 계약](C5-PROFILE-CARD.md) | 4개 렌더 지점 공통 규칙 | **G10** | 15 · 16 · 17 |

---

## 공통 규칙

**전부 아래를 따른다. 개별 문서에서 반복하지 않는다.**

### 작성 규칙

- **확정 스펙(`01-CONFIRMED-SPEC.md`)과 어긋나는 것을 만들지 않는다.** 어긋나면 스펙이 이긴다.
- **근거 없는 값을 발명하지 않는다.** 없으면 `확인 필요`로 남긴다.
- **Freeze v1도 무오류가 아니다** — G17이 그 선례다(`05-05`와 `03-02`가 어긋났다).
  시안을 근거로 쓸 때 **화면 단위로 확정 스펙과 대조한다.**
- 값·경로에는 근거 태그를 붙인다: `[코드]` / `[문서]` / `[산출물]` / `확인 필요`.

### DDL 규칙 — 기존 migration과 같은 형태를 쓴다 `[코드]`

- `create table if not exists` · `create index if not exists` — 재실행 안전
- 제약에 **이름을 붙인다** (`<table>_<column>_check`). 이름 없는 제약은 나중에 교체할 수 없다
- **기존 migration을 수정하지 않는다.** forward-only 보정 migration을 추가한다 (`AGENTS.md` §4)
- 소문자 SQL. 기존 파일과 같은 스타일

### RPC 규칙 `[코드]`

모든 신규 RPC는 **기존 V2 RPC와 같은 형태**를 따른다:

```sql
create or replace function public.<name>(...)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$ ... $$;

revoke all on function public.<name>(...) from public, anon;
grant execute on function public.<name>(...) to authenticated;
```

- **`set search_path = ''`는 생략하지 않는다.** 기존 V2 RPC 전부가 이것을 쓴다
- 반환은 **`jsonb`**. 성공은 `{ok: true, ...}`, 실패는 `{ok: false, code: '<CODE>'}` 또는 `raise exception`
- **게스트 차단이 필요한 RPC는 `auth.uid() is null`에서 `AUTH_REQUIRED`로 즉시 실패**한다

### RLS 규칙

- **신규 테이블은 전부 `enable row level security`.** 운영 실측 기준 21/21이 활성이고
  이 관행을 깨지 않는다 (`PROD-SNAPSHOT-2026-09-02.md` §4)
- **클라이언트 직접 write를 허용하지 않는다.** `revoke insert, update, delete ... from anon, authenticated`
  후 RPC로만 쓴다. 서버 권위 V2가 세운 원칙이다
- **읽기 범위를 명시적으로 정한다.** "본인만" / "같은 방 참가자" / "전체 공개"를 표에 적는다

### Realtime

- **신규 테이블을 publication에 넣지 않는다.** 넣으려면 `alter publication`이 필요하고
  그것은 **새 cutover 창**이다 (`PROD-SNAPSHOT-2026-09-02.md` §5.4)
- 이 5개 계약 중 **realtime이 필요한 것은 없다** — 전부 결과·프로필 화면에서 조회된다

---

## 운영 적용

**이 문서들은 계약이지 migration이 아니다.** 실제 적용은 별도이며
`AGENTS.md` §1의 **건별 승인** 대상이다.

| 계약 | DDL 필요 | 창 필요 |
|---|---|---|
| C1 | 신규 테이블 3 + RPC | **신규 테이블은 창이 가볍다** — 기존 객체를 건드리지 않는다 |
| C2 | 신규 테이블 1 + RPC | 동일 |
| C3 | **`profiles` 컬럼 추가** + 함수 + **컬럼 단위 grant 축소(C3-①)** | 기존 테이블 변경. `add column`은 잠금이 짧다 `[추정]`. **grant 축소 → `total_xp` 추가 순서가 강제된다** — `docs/agent/TRACKS.md` §7.2 |
| C4 | **CHECK 추가 2건** | **기존 테이블 제약 변경** → `PACKET-CONTRACT-GAPS.md` §5.5의 **3코스 창에 묶는다** |
| C5 | **없음** | 프론트 전용 |

> **C5는 DDL이 전혀 없다.** 가장 먼저 착수할 수 있고 다른 넷을 기다리지 않는다.

### 정정 이력

**계약은 동결이지만 무오류는 아니다.** 고칠 때는 해당 문서에 정정 표를 남긴다.

| 날짜 | 계약 | 무엇을 | 근거 |
|---|---|---|---|
| **2026-09-02** | **C3** | C3-①의 grant 컬럼을 **2개 → 3개**(`updated_at` 추가)로 정정하고 **확정으로 전환** | **코드 실측.** 배포된 프론트의 두 update가 `updated_at`을 함께 보내므로 2컬럼안은 닉네임·사진 저장을 깬다. **C3 §0** |
| **2026-09-02** | **C4** | **부제 문구 2개를 `확인 필요` → 확정**(코드 문자열 채택) · **`disconnected_timeout`의 코드 문자열을 정정 대상으로 등재** · 매핑 모듈을 **신규 `utils/resultReasonLabels.js`로 확정** | **시안 > 코드 > 발명** 규칙. 부제는 코드에 근거가 있었고, `몰수`는 시안이 상위다. 두 문자열이 **같은 상태**임을 코드로 확인했다. **C4 §0.-1·§3.1·§3.1.1** |

---

## 참조

| 문서 | 역할 |
|---|---|
| `docs/agent/PACKET-CONTRACT-GAPS.md` | **공백 G1~G20의 단일 기준.** 이 계약들이 닫는 공백의 배경 |
| `docs/agent/CURRENT.md` | 현재 상태의 단일 기준 |
| `wiki-race-2.0-handoff/01-CONFIRMED-SPEC.md` | **게임 규칙 단일 기준선.** 충돌 시 이것이 이긴다 |
| `wiki-race-2.0-handoff/code/10-CODE-MASTER-TODO.md` §4 | 이 디렉터리의 원본 목록 |
| `docs/design/MOBILE-VALIDATION-CORRECTIONS.md` | 시안을 근거로 쓸 때 먼저 읽는다 |
