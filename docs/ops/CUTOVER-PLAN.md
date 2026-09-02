# 운영 cutover 계획 — Wiki Race 2.0

작성일: 2026-08-21 · 최종 갱신: **2026-09-02 (창 최종 종료 반영 — §0.-1 갱신, §0.-2 신설)**
이전 갱신: 2026-08-28 (창 실행 결과 반영 — §0.-1 신설) / 2026-08-27 (§6.0·§6.3·§6.5)
기준 커밋: `48e3f2d` (이전 `4a78a0d`)
최초 작성 시 기준 커밋: `cdb9e79` (`docs: confirm baseline correspondence with constraint and RLS measurements`)
브랜치: `feat/group-final-gaps` (upstream `origin/feat/group-final-gaps`, 동기화 완료)
`origin/main` 대비: **0 behind / 1 ahead** — `main` = `9eba7e9`(W1-b가 올린 값),
`feat` = `48e3f2d`(문서 전용). **의도된 상태다** (`git ls-remote origin`, 2026-09-02 실측)

**상태: 실행이 끝났다. 창은 2026-09-02에 최종 종료됐다.**
**W0~W9는 2026-08-27~28 창에서, W10·W11은 창 밖 후속에서 수행됐다. 유지보수 게이트는 해제됐다.**
결과 요약은 **§0.-1**, 다음 창을 위한 개선점은 **§0.-2**, 실행 기록 전문은
**`docs/ops/CUTOVER-LOG-2026-08-27.md`** 에 있다.
운영 DB 변경은 `AGENTS.md` §1의 건별 승인 대상이며, 이 문서 존재가 승인을 대체하지 않는다 —
**다음 창도 새 승인이 필요하다.** 이 문서 작성 과정에서 작성자는 운영 DB·운영 Vercel에
접근하지 않았다.

---

## 0.-1 창 실행 결과 — **이 문서를 읽기 전에**

> ## ✅ 창은 최종 종료됐다 (2026-09-02). **W0~W11 전 단계 수행 완료. 서비스가 열려 있다.**
>
> | 구간 | 범위 | 결과 |
> |---|---|---|
> | **창 안** (2026-08-27~28, 2세션) | **W0 ~ W9** | W6·W7·W8 성공, **W9에서 결함 6건 발견 → W10 미수행, G3 경로로 창 종료** |
> | **창 밖 후속** (~2026-09-02) | **W1-b · W8-b · W9-b · W10 · W11-b** | 결함 4건 전건 종결 → **재스모크 통과 → 유지보수 게이트 해제** |
>
> **되돌릴 수 없는 지점(W6)은 창 안에 있었고, 되돌릴 수 있는 나머지는 창 밖에서 시간 압박 없이
> 처리됐다.** 이것이 §6.0.2의 G3가 노린 결과다 — CUTOVER-LOG §6.5.
>
> **다음 창을 여는 세션은 §0.-2(개선점)와 CUTOVER-LOG §6(총평)부터 읽는다.**

### 0.-1-1 창 안 구간 (2026-08-27~28)

| 항목 | 결과 |
|---|---|
| 실행 범위 | **W0 ~ W9.** 2세션 분할 (세션 1 = W0~W2.5 / 세션 2 = W3~W9) |
| **W6 (`db push --linked`)** | **성공 — 11개 전량 적용, 오류 없음.** 되돌릴 수 없는 지점을 넘었다 |
| **W7 (적용 결과 검증)** | **전항목 통과** — 함수 36 / legacy RPC 2개 부재 / v13 제약 2개 `convalidated = true` / `rls_off_tables` 0 / publication 4테이블 / 이력 12행 |
| W8 (Edge Function) | **성공** — `wiki-snapshot`·`single-run` 배포. 이름 명시, `--prune` 미사용 |
| W9 (스모크) | **결함 6건 발견.** 2건 창 안 해결, **4건 미해결** |
| **W10 (게이트 해제)** | **미수행.** 발견 3·4가 그룹 모드 정상 이용을 막는다 |
| **채택 경로** | **G3** — 재개 포기, **유지보수 게이트 켠 채 창 종료** (§6.0.2). 사용자 노출 0 |
| 롤백 | **미발생.** §6.0.3 트리거가 한 건도 발화하지 않았다 |
| 시각 | T0(W6 시작) = 2026-08-28 21:47 / 창 종료 = 23:17. **W6~W9 구간 90분**, U1의 2시간 이내 |

**게이트 설계 검증:** G1은 창 분할로 실질 판정을 하지 않았고, G2는 **롤백이 필요하지 않아
발화하지 않았다** — §6.0.2가 걱정한 "W6 상한에서 G2까지 7분"은 **W6 실패를 전제한 계산**이었고
W6는 성공했다. G3는 **도달 30분 전에 그 게이트가 정의한 행동을 취했다.**

### 0.-1-2 창 밖 후속 구간 (2026-08-29 ~ 09-02)

**창이 넘긴 것을 소화한 구간이다.** 되돌릴 수 없는 조작이 하나도 없어 게이트도 T0도 두지 않았다.

| 단계 | 무엇을 했나 | 결과 |
|---|---|---|
| — (조사) | W9 미해결 4건을 코드에서 조사 | **5는 결함 아님으로 종결, 4는 원인 확정·수정**(`579a338`). 3은 감축 2건 적용(`0ad3cde`) |
| **W1-b** | `main` push (`4a78a0d` → `9eba7e9`) | **프론트 배포 완료.** 발견 4 해소. 발견 3은 **절반만** — Edge Function은 Vercel 배포에 없다 |
| **W8-b** | `npx supabase functions deploy wiki-snapshot` | **Edge Function 배포 완료.** 프론트 → 함수 **순서를 지켰다** |
| **W9-b** | 4인 그룹 재스모크 | **전 경로 통과. 대기실 준비 버튼 502 0건**(124요청 통과), 게임 진입 31요청, 결과 화면 로비 나가기 정상, 관전 화면 본문 정상 렌더 |
| **W10** | `VITE_MAINTENANCE` **삭제** + `9eba7e9` Redeploy | **게이트 해제. 프로덕션에서 앱 정상 렌더** `[사용자 확인]` |
| **W11-b** | 문서 갱신 | 이 문서 · CUTOVER-LOG · `CURRENT.md` · `AGENTS.md` |

**W9 결함 6건의 최종 처리:** 1·2는 창 안에서, **3·4는 배포로**, **5·6은 결함이 아닌 것으로**
종결됐다. **관측은 하나도 취소되지 않았다** (CUTOVER-LOG §5-a).

---

## 0.-2 다음 창을 위한 개선점 — **이 창이 드러낸 7건**

**전부 이미 본문에 반영돼 있다.** 이 절은 **어디에 반영됐는지의 색인**이다 —
다음 창을 여는 세션이 본문을 처음부터 읽지 않아도 "무엇이 바뀌었는지"를 여기서 잡는다.
근거·전문은 CUTOVER-LOG §6.2.

| # | 이 창에서 드러난 사실 | 반영 위치 | 성격 |
|---|---|---|---|
| **1** | `VITE_*`는 Vercel **Secret으로 저장할 수 없다.** Type = **`Config`** | §3.2 **W0** | 실행 중 막힘 |
| **2** | main push 커밋 수는 **31**이었다 (계획 기재 16) | §3.2 **W1** | 수치 갱신 |
| **3** | **`public` 전용 데이터 덤프가 §4.3 명령 목록에 없어 창에서 실제로 빠졌다.** §6.3.3이 "§4.3에 추가"라고만 하고 명령 블록에는 없었다 | **§4.3**(4번째 줄 추가)·**§4.4-5**(존재 검증 항목 추가) | **복원 능력 결손.** 가장 무거운 항목 |
| **4** | **`functions deploy`에 `--linked`는 없다** (`Unrecognized flag`). 앞 단계가 전부 `--linked`를 써서 손이 이어 붙인다 | §3.2 **W8** 경고 + 템플릿 §W8 | 실행 중 막힘 |
| **5** | **W6 종료 시각이 기록되지 않았다** — 전용 란이 있었는데도 비었다. **란의 부재가 아니라 강제의 부재** | §3.2 **W6** + 템플릿. **개선안 1 = `Get-Date` 샌드위치** | 기록 결손 |
| **6** | **W10을 `VITE_MAINTENANCE=false`가 아니라 변수 삭제로 수행했다.** 판정은 동일하다 — `isMaintenanceFlagEnabled`가 정확히 `"true"`만 활성으로 본다 (`utils/maintenanceGate.js:26`) | §3.2 **W10** | 문구 정정 |
| **7** | **W10·W11이 창 밖에서, 여러 세션에 걸쳐 수행됐다.** G3를 타면 이 모양이 된다 | §3.2 **W11** + 템플릿(`-b` 하위 절 형식) | 기록 형식 |

### 0.-2-1 `Get-Date` 샌드위치 — 개선안 5의 실물

**이 창은 W0~W9의 단계별 시각을 거의 전부 남기지 못했다.** 남은 것은 W6 시작(21:47)과 창
종료(23:17)뿐이다. **W6은 템플릿에서 가장 상세한 시각 란(5행)을 가지고 있었는데도 비었다** —
그러므로 **란을 더 만드는 것으로는 풀리지 않는다.**

**명령이 스스로 시각을 출력하게 만든다.** 그러면 "출력을 그대로 붙인다"는 기존 원칙만
지켜도 시각이 자동으로 남는다.

```powershell
# W2·W5·W6·W8에 공통 적용한다. 사람의 기억에 의존하지 않는 유일한 방법이다
Get-Date -Format 'HH:mm:ss'
npx supabase db push --linked
Get-Date -Format 'HH:mm:ss'
```

> **왜 W6만이 아니라 W2·W5·W8에도 붙이는가.** W6에만 붙이면 "가장 중요한 단계 하나"는
> 남지만 **구간별 소요를 못 잰다.** 이 창이 §3.3의 시간 `[추정]`을 하나도 보정하지 못한 이유가
> 그것이다 — 90분이라는 총계 하나로는 어느 단계가 길었는지 알 수 없다 (§11).

### 0.-2-2 나머지 4건의 요지

- **`public` 전용 덤프 (#3).** §4.3 명령 블록의 **3번째 줄**(`--schema public`)이 없으면
  전체 데이터 덤프로는 **복원이 안 된다** — `auth` PK 충돌로 중단된다 (§6.3.3).
  대체 경로 `slice-public.awk`(§6.3.3 (b))가 있어 복원 능력을 잃지는 않지만 **한 단계가 는다.**
  **§4.4의 검증 5번**(파일 존재 + `auth` COPY 0개)이 다음 창에서 이 누락을 잡는다.
- **`auth\.users` grep 함정 (#3에 딸림).** 덤프는 식별자를 따옴표로 감싼다 —
  `COPY "auth"."users" (...)`. **`auth\.users`로 grep하면 0건이 나오고 "백업에 계정이 없다"로
  오진한다.** §4.4의 패턴은 `auth"?\."?users`다. **이 함정은 §4.4 판정 기준 3번에 적혀 있다.**
- **`functions deploy --linked` (#4).** **문서에서 지울 것은 없었다** — 계획에도 템플릿에도
  `--linked`는 원래 없었고, 앞 단계(`db dump`·`migration repair`·`db push`)가 전부 그것을 쓰는
  흐름에서 실행자가 이어 붙인 것이다. **그래서 경고를 더했다.** 받는 flag는 `--prune`·`--use-api`이며
  **`--prune`은 금지다** (`target-level` 삭제 — F12).
- **창 밖 이월의 기록 형식 (#7).** 이 창은 **원본 판정을 고쳐 쓰지 않고 `-b` 접미 하위 절**
  (W1-b·W8-b·W9-b·W11-b)을 덧붙였다. **G3를 타면 반드시 생기는 상황이므로 템플릿에 형식을 넣는다.**

> **다음 창의 범위는 이 창의 이월이 아니다.** DB·배포·게이트 축은 전부 닫혔다.
> 다음 작업 목록은 `docs/agent/CURRENT.md` **§5.0**이며, 그중 DB를 건드리는 것은
> **미구현 패킷 14~17**이다. **그때는 운영이 열려 있는 상태에서 창을 여는 것**이므로
> W0(게이트 on)이 이전보다 더 중요해진다.

이 계획은 `wiki-race-2.0-handoff/code/18-SERVER-AUTHORITY-V2-IMPLEMENTATION.md`의
**Release A~D 절차를 대체한다.** 대체 매핑은 §10에 있다.

---

## 0. 표기 규칙

| 태그 | 뜻 |
|---|---|
| `[코드]` | 이 저장소의 파일·행 번호로 확인됨 |
| `[산출물]` | 이 저장소에서 명령을 실행해 얻은 출력 (명령·날짜 병기) |
| `[문서]` | 저장소 내 다른 문서의 기록 |
| `[실측]` | 운영에서 사용자가 읽기 전용으로 조회해 보고한 값 (날짜 병기) |
| `[외부]` | Supabase/Vercel 플랫폼 동작. 저장소에서 확인되지 않음 |
| `[추정]` | 근거 없는 시간·규모 예상. **실행 판단의 근거로 쓰지 않는다** |

시간 열의 값은 별도 표기가 없으면 전부 `[추정]`이다. **작성 시점에는 운영 대상 실행 이력이
없었다** (`docs/ops/PROD-SNAPSHOT-2026-08-20.md` §1 — CLI push 이력 자체가 없음).

**2026-08-27~28 창이 실행 이력을 만들었지만 시간 열은 여전히 `[추정]`이다** — 창이 단계별 시각을
거의 기록하지 않아 **W6~W9 구간 90분이라는 굵은 값 하나만** 얻었다 (§0.-1, §3.3.2).
다음 창에서 이 표를 채우는 방법은 §3.2 W6의 `Get-Date` 감싸기다.

### 0.1 명령 표기 — **모든 `supabase` 명령은 `npx` 접두를 붙인다**

**전역 `supabase` 설치가 없다.** CLI는 `devDependencies`의 로컬 설치본뿐이다 (P9 실측:
`package.json` 핀·`package-lock.json`·`node_modules` 설치본·런타임 `--version` 네 축이 모두
`2.114.0`). PowerShell에서 `Get-Command supabase`는 아무것도 돌려주지 않는다
(2026-08-27 `[산출물]`).

→ **`npx` 없이 `supabase ...`를 실행하면 `CommandNotFoundException`으로 실패한다.**
설치되지 않았다는 뜻이므로 인증·네트워크 문제로 오진하지 않는다.

```powershell
npx supabase db push --linked      # 이렇게
supabase db push --linked          # 이렇게 하면 CommandNotFoundException
```

**이 문서의 본문에서는 단계 이름으로 `db push`·`db dump`·`migration repair` 같은 짧은 형태를
쓴다.** 그것은 **명령의 이름**이고, 실제로 실행할 때는 예외 없이 `npx supabase`를 앞에 붙인다.
코드 블록 안의 명령은 전부 `npx`가 붙은 실행 가능한 형태다 (2026-08-27 전수 점검 `[산출물]`).

### 0.2 실행 전제 — 창 전에 반드시 확인

명령 자체는 맞아도 **환경이 없어서** 실패하는 것들이다. 전부 창 밖에서 해소한다 (§7).

| 전제 | 없으면 나타나는 증상 | 오진하기 쉬운 것 | 해소 |
|---|---|---|---|
| **`backup/` 디렉터리 실재** | `failed to open dump file: NotFound` | **로그인·권한 문제로 오진한다.** 인증과 DB 접속이 **성공한 뒤** 파일 쓰기에서 실패한다 | §4.3-0. P6 |
| **`npx` 접두** | `CommandNotFoundException` | 설치 문제로 보이지만 로컬 설치는 정상이다 | §0.1. P9 |
| **복원 도구** (§6.3 전용) | `psql : 명령을 찾을 수 없습니다` — **이 머신에 psql이 없다** | 설치가 필요하다고 오진한다. **Docker 이미지의 psql로 해결된다** | §6.3.0 A안. **P14** |
| **Docker 데몬 + 승인 이미지** (§6.3 전용) | `docker run`이 실패하거나 pull을 시작한다 | — | §6.1 표. **P14** |
| **연결 문자열이 IPv6 전용** (§6.3 전용) | 접속 자체가 되지 않는다 | 자격 정보 문제로 오진한다. **컨테이너에 IPv6가 없다** | §6.3.0-1. **P14** |
| `awk` (§6.3.3 (b) 대체 경로만) | `awk : 명령을 찾을 수 없습니다` | — | Git for Windows에 포함돼 있다. 이 머신에서는 `C:\Program Files\Git\usr\bin\awk.exe`로 PATH에 있다 (2026-08-27 `[산출물]`) |

---

## 1. 전제와 결정 사항

### 1.1 확정된 결정

| ID | 결정 | 근거 출처 |
|---|---|---|
| U1 | **다운타임 허용. 창 1~2시간.** | 사용자 결정 (2026-08-21). 운영 최종 플레이 2026-08-04 `[실측]`이므로 사용자 영향이 사실상 없다 |
| U2 | **Release 재분할 불필요. 미적용 11개를 한 창에서 순서대로 전량 적용.** | 사용자 결정 (2026-08-21). `code/18-...md` §적용 순서의 artifact 분할(A~D)을 대체한다 |
| U3 | **구버전 세션 drain은 유지보수 게이트로 해소.** | 사용자 결정 (2026-08-21). 게이트 자체는 미구현 — §7 선행 조건 P1 |
| U7 | **`game_rooms` 위반 167건은 과거 방 이력 삭제로 처리.** | 사용자 결정 (2026-08-21). 절차·범위는 §5 |
| U10 | **`picked` 테이블 보존.** drop 하지 않는다. | 사용자 결정 (2026-08-21) + `AGENTS.md` §4 기본값. 운영 제약 0건·정책 0건으로 실질 비활성 (`PROD-SNAPSHOT-2026-08-20.md` §9.4·§10.2) |
| U11 | **`avatars` 객체 소유자는 `roeehd2` — 사용자 본인 계정.** 따라서 업로드 기능 제거가 안전하다. | 사용자 확인 (2026-08-21). 계정 식별이 남아 있던 항목(`docs/agent/CURRENT.md` §5-3)이 이로써 해소됐다. 객체 삭제는 이 계획 범위 밖이며 `AGENTS.md` §4 적용 |
| U14 | **롤백 판단 기준 확정 (P11).** 창 안 즉흥 수정 금지, 시각 게이트 3개, 롤백 후 프론트는 게이트 유지(`main` force push 없음), W6 이후 부분 롤백 불가·전체 복원만·실행은 승인 사안 | 사용자 결정 (2026-08-27). 전문은 **§6.0**. 단계별 트리거 등급표는 §6.0.3 |
| U15 | **§6.3 전체 복원 절차 리허설 완료.** 비우기 SQL 확정, 소요 시간 실측, 복원되지 않는 항목 확정 | 2026-08-27 로컬 리허설 `[산출물]`. 전문은 **§6.5**. 확정 SQL은 §6.3.2 |

### 1.2 실측으로 해소된 전제 (2026-08-21)

| 항목 | 값 | 계획에 미치는 영향 |
|---|---|---|
| publication 멤버십 | `game_rooms`, `group_match_results`, `room_events`, `room_players` = baseline과 완전 일치. 드리프트 없음 `[실측]` | `PROD-SNAPSHOT-2026-08-20.md` §9.7의 "조용히 실패하는 것" 중 publication 축이 **해소**. Realtime 미전달 위험 제거 |
| `auth.users` | 145 `[실측]` | 백업 대상 규모. 데이터 덤프에 포함된다 (§4.2) |
| `profiles` | 142 `[실측]` | — |
| `game_records` | 57 `[실측]` | — |
| 최종 플레이 | 2026-08-04 `[실측]` | 창 중 동시 쓰기 위험이 사실상 0 (§3.1 잔여 위험 근거) |
| 진행중 방 | 149 (좀비) `[실측]` | §5 삭제 범위 산정 입력 |
| `game_rooms` group 위반 | 167건 `[실측]` | §5 처리 대상 |
| `game_rooms` non-group `host_user_id is null` | 0건 `[실측]` | `game_rooms_non_group_host_required_v13_check`의 `validate`가 조건을 만족한다 (`20260814113000:83-96` `[코드]`) |

baseline 대응(테이블 14/14, 함수 7/7, 제약 52/52, RLS 14/14 차이 0건)은 이미 확정됐다
(`PROD-SNAPSHOT-2026-08-20.md` §9·§10).

### 1.3 이 계획이 근거로 쓰는 저장소 사실

작성 시 새로 확인한 항목이다. 각 항목은 창 절차에서 직접 인용된다.

| # | 사실 | 근거 |
|---|---|---|
| F1 | Supabase CLI 핀은 `2.114.0`이고 실제 실행 버전도 `2.114.0`이다 | `package.json` devDependencies `[코드]`; `npx supabase --version` → `2.114.0`, 2026-08-21 `[산출물]` |
| F2 | 이 계획이 쓰는 flag는 전부 `2.114.0`의 `--help`에 존재한다: `db dump`(`--data-only` `--use-copy` `-f` `--linked` `--schema` `--dry-run` `--role-only`), `migration repair`(`--status applied\|reverted` `--linked`), `db push`(`--dry-run` `--linked` `--include-all`), `migration list --linked`, `functions deploy`(`--prune` `--use-api`) | `npx supabase <cmd> --help`, 2026-08-21 `[산출물]` |
| F3 | **스키마 덤프는 GRANT와 publication 멤버십을 담는다.** `db dump`의 스키마 모드는 `CREATE PUBLICATION "supabase_realtime`과 `ALTER PUBLICATION "supabase_realtime_`(접미 `_`)만 주석 처리하고, `ALTER PUBLICATION "supabase_realtime" ADD TABLE ...` 행은 남긴다. 내부 스키마 대상 `GRANT`/`REVOKE`만 주석 처리하므로 `public` 스키마 GRANT는 보존된다 | `npx supabase db dump --dry-run --local`, 2026-08-21 `[산출물]`. baseline 1186-1198행이 실제로 `ADD TABLE` 형태로 남아 있는 것과 일치 `[코드]` |
| F4 | **스키마 덤프는 `auth`·`storage`·`supabase_migrations` 스키마를 제외한다.** 반면 **데이터 덤프는 `auth`·`storage`를 제외하지 않는다** (`auth.schema_migrations`·`storage.migrations` 두 테이블만 제외). 데이터 덤프는 `supabase_migrations`를 제외한다 | 동일 `[산출물]` |
| F5 | `game_rooms` 삭제 시 CASCADE 대상은 정확히 4개다: `group_match_results`, `match_history`, `room_events`, `room_players` | baseline 955-1005행 `[코드]` |
| F6 | `group_match_history.room_id`는 nullable이고 **FK가 없다.** 방 삭제로 지워지지 않는다 | baseline `group_match_history` 정의 + FK 목록(`user_id`만 존재) `[코드]`; `PROD-SNAPSHOT-2026-08-20.md` §10.2 재확인 |
| F7 | `user_profile_stats`의 FK는 `profiles`뿐이다. 방 삭제로 카운터가 줄지 않는다 | baseline 1014-1015행 `[코드]` |
| F8 | Phase 2C는 `user_profile_stats`의 `group_first/second/third_count`를 `group_match_history` **전량 재집계**로 덮어쓴다 (누적 증가가 아님) | `20260813072952_group_security_phase2c.sql:89-110` `[코드]` |
| F9 | 1:1 전적은 `match_history`를 화면에서 **라이브 카운트**한다 (`winner_user_id`/`loser_user_id` head count) | `services/profileStatsService.js:53-62` `[코드]` |
| F10 | ~~**유지보수 게이트 코드가 저장소에 없다.** `MAINTENANCE` 문자열이 소스에 0건이다~~ → **해소 (2026-08-21, `b24744e`).** `utils/maintenanceGate.js`·`components/MaintenanceScreen.jsx`·`main.jsx`·`tests/maintenanceGate.test.js`가 존재하고, **2026-08-27 W0에서 운영에 켜졌으며 지금도 켜져 있다** | 원 측정: `grep -rn "MAINTENANCE\|maintenance"` → 0건, 2026-08-21 `[산출물]`. 해소 근거: §7 P1, `CUTOVER-LOG-2026-08-27.md` §W0 |
| F11 | `VITE_*`는 **빌드 시점에 인라인**된다. 프론트는 `import.meta.env`로 읽는다 | `supabaseClient.js:7-9` `[코드]`. Vite 규약 `[외부]` |
| F12 | **`target-level` Edge Function은 저장소에 소스가 없다.** 프론트는 이를 호출한다 | `pages/GamePage.jsx:54`, `services/wikiService.js:45` 호출 `[코드]`; `supabase/functions/`에는 `single-run`·`username-lookup`·`username-signup`·`wiki-snapshot` 4개만 존재 `[산출물]`; `README.md:34`에 운영 함수로 기록 `[문서]` |
| F13 | `functions deploy`는 이름을 생략하면 **로컬 전부**를 배포하고, `--prune`은 **로컬에 없는 원격 함수를 삭제한다** | `functions deploy --help` `[산출물]` |
| F14 | 미적용 11개 중 **2개가 운영 데이터를 UPDATE 한다.** `20260814103000:11-17` (group·waiting 행의 duration·`use_items`), `20260814113000:32-40` (group·waiting 행의 `min_players=3`, `max_players` 클램프, `finish_rank_limit=3`, `use_items=false`, duration) | `[코드]` |
| F15 | Packet 13 group 제약은 `not valid`로 추가되고, hardening은 위반 행이 **0건일 때만** `validate`를 실행한다. 재시도 migration은 없다 | `20260814103000:19-39`, `20260814113000:45-72` `[코드]` |
| F15a | **F15에서 "그러므로 migration은 실패하지 않는다"를 도출할 수 없다.** `20260814113000`은 자기가 붙인 `NOT VALID` 제약이 걸린 행을 **스스로 UPDATE**하고(`private.reconcile_group_host_v13`), `NOT VALID` 제약은 UPDATE에 행 단위로 강제된다 → **W2.5를 건너뛰면 W6가 #10에서 `SQLSTATE 23514`로 실패한다** | `20260814113000:150-155` `[코드]`; 2026-08-27 로컬 리허설에서 재현·반사실 확인 `[산출물]` (§6.5.3). 측정 쿼리와 판정은 §5.3-0 |
| F16 | 저장소에 위반 행 조회용 **읽기 전용 preflight SQL이 이미 있다.** status별 집계와 행 목록을 함께 낸다 | `supabase/tests/group_final_gaps_v13_hardening_preflight.sql` `[코드]` |
| F17 | `origin/main`(`e6d8eee`)은 `HEAD`의 조상이다 → main으로 **fast-forward push가 가능**하다 | `git merge-base --is-ancestor e6d8eee HEAD` 성공, 2026-08-21 `[산출물]` |
| F18 | link 상태 파일이 존재한다: `supabase/.temp/project-ref`, `supabase/.temp/linked-project.json` (둘 다 gitignore 대상) | `[산출물]` |
| F19 | `db push`는 migration 적용 **전에 `config.toml`의 vault secret을 갱신**한다 (`--skip-vault`로 생략). 현 `config.toml`의 `[db.vault]`는 주석 처리 상태다 | `db push --help` `[산출물]`; `supabase/config.toml:60-61` `[코드]` |
| F20 | `single-run`은 `verify_jwt = false`로 config에 선언돼 있다 | `supabase/config.toml:423-424` `[코드]` |


### 1.4 W-1 리허설 대조 결과 — U5 해소 (2026-08-27)

**사용자가 운영 스키마 덤프를 뜨고, 그것을 baseline과 대조했다. 차이 0건이다** `[산출물]`.

| 항목 | 값 |
|---|---|
| 덤프 파일 | `backup/rehearsal-schema-2026-08-27.sql` (커밋 대상 아님 — `.gitignore:160`) |
| 크기 / 행 수 | 41,399 bytes / 1,563행 |
| 실행 | 2026-08-27 22:33, 사용자. **읽기 전용** (`db dump`) |
| 대조 대상 | `supabase/migrations/20260730170602_baseline_remote_schema.sql` |
| **결과** | **`cmp` 차이 없음 — 바이트 단위 완전 동일.** md5 양쪽 `e2bfa8059d1b887fdceaa144e052fd0a` |

축별 확인 (전체가 동일하므로 아래는 모두 자동으로 성립한다):

| 축 | 운영 | baseline | 판정 |
|---|---|---|---|
| `^GRANT` 행 수 | 70 | 70 | **일치 (내용·순서까지)** |
| └ 롤별 | `anon` 23 / `authenticated` 23 / `service_role` 23 / `postgres` 1 | 동일 | 일치 |
| `^REVOKE` 행 수 | 0 | 0 | 일치 |
| `ALTER PUBLICATION ... ADD TABLE` | `game_rooms`, `group_match_results`, `room_events`, `room_players` | 동일 | **4테이블 일치** |
| `ALTER PUBLICATION ... OWNER TO` | `postgres` | 동일 | 일치 |
| `ALTER DEFAULT PRIVILEGES` 행 수 | 12 (전부 `FOR ROLE "postgres"`) | 12 | 일치 |
| 그 외 전체 DDL | — | — | 차이 0행 |

**해석 3가지.**

1. **U5가 해소됐다. 권한 드리프트는 없다.** §9 U5가 걱정한 것은 "migration을 실패시키지 않고
   런타임 권한 거부로만 나타나는 차이"였는데, 대조 대상 자체가 동일하므로 그 위험이 사라졌다.
2. **`REVOKE` 표현 차이 문제는 발생하지 않았다.** 양쪽 모두 `REVOKE` 0행이다 — 판정할 표현 차이가
   애초에 없다. (덤프가 owner-only ACL을 `REVOKE`로 내지 않는다는 성질은 §6.3.4에 별도로 있다.)
3. **§5.1-1의 "4개 축 차이 0건"이 더 강한 형태로 재확인됐다.** 그때는 테이블·함수·제약·RLS
   4축을 세어 비교했고, 이번에는 **덤프 전문이 바이트 단위로 같다.** baseline은 이 운영 상태의
   덤프라는 판정(`(a) 성립`)이 그대로 유지된다.

> **이 결과가 말하지 않는 것.** 덤프는 `public` 스키마와 그 GRANT·publication만 담는다 (F3·F4).
> `auth` 설정, Edge Function 배포본, Storage 객체, `supabase_migrations` 이력은 여전히 대조되지
> 않았다 (§4.5). 특히 **`supabase_migrations.schema_migrations` 부재는 이 덤프로 확인되지 않는다** —
> 덤프가 그 스키마를 제외하기 때문이다. W3~W4가 그것을 다룬다.

---

## 2. 되돌릴 수 없는 지점

### 2.1 경계는 W6 (`npx supabase db push --linked`)이다

`db push`가 첫 migration을 커밋하는 순간부터 되돌릴 수 없다. 이유는 세 가지다.

1. **down migration이 존재하지 않는다.** 11개 파일 어디에도 역방향 스크립트가 없다.
   저장소 원칙도 forward-only다 (`AGENTS.md` §4, `code/18-...md` §롤백 주의사항).
2. **파괴적 연산이 포함된다.** `20260814093000_server_authority_cutover_v2`는 legacy RPC
   `update_group_progress`, `finish_group_player`를 **삭제**하고 `public`·`anon`·`authenticated`의
   직접 쓰기 권한을 **회수**한다 (`code/18-...md` §Legacy 그룹 mutation RPC 최종 breaking cutover `[문서]`).
   삭제된 함수 본문은 baseline 덤프에만 남는다.
3. **파일 단위 적용이다.** `db push`는 pending migration을 **파일 하나씩 순서대로** 적용한다.
   각 파일은 자체 `begin/commit`을 갖는다 (`20260814103000:4`, `20260814113000:4` `[코드]`).
   → **중간에서 실패하면 앞선 migration은 적용된 채 남는다.** 전체가 하나의 트랜잭션이 아니다.
   부분 적용 상태에서 되돌릴 수단은 **§6의 덤프 복원뿐이다.**

### 2.2 W6 이전 단계별 되돌림 비용

| 단계 | 운영 스키마 변경 | 운영 데이터 변경 | 중단 시 되돌리는 방법 |
|---|---|---|---|
| W0 Vercel 환경변수 | 없음 | 없음 | 환경변수 삭제 |
| W1 main push + 배포 | 없음 | 없음 | Vercel 이전 배포로 롤백 `[외부]`, 또는 `main`을 `e6d8eee`로 되돌리는 push. **git 이력상 main push 자체는 남는다** |
| W2 덤프 | 없음 | 없음 | 파일 삭제 |
| **W2.5 방 이력 삭제** | 없음 | **있음 (되돌리려면 복원 필요)** | W2 데이터 덤프에서 해당 행만 복원. §6.4 |
| W3 `migration repair` | **없음** (스키마 미검사) | 이력 테이블에 행 1개 기록 + 테이블 생성 (**+ 스키마 자체가 없으면 스키마도 생성** — U12 실측) | `migration repair --status reverted 20260730170602 --linked` — 행이 DELETE된다 `[산출물]`. 단 `supabase_migrations` **스키마와 테이블은 남는다**(빈 테이블). 되돌림은 exit 0이 성공을 증명하지 않으므로 W4 쿼리로 확인한다 (U12, §9) |
| W4 이력 행 확인 | 없음 | 없음 | — |
| W5 `--dry-run` | 없음 | 없음 | — |
| **W6 `db push`** | **있음** | **있음 (F14)** | **없음. §6 덤프 복원이 유일** |

**요약: W5까지 중단하면 손해는 (a) 유지보수 창 시간, (b) main이 배포된 사실, (c) W2.5 삭제분뿐이고
(c)는 W2 덤프에서 복원 가능하다. 운영 스키마는 W5까지 한 글자도 바뀌지 않는다.**
`repair`가 스키마를 검사하지도 변경하지도 않는다는 근거는 `PROD-SNAPSHOT-2026-08-20.md` §9.7이다.

---

## 3. 창 절차 W0~W11

### 3.0 뼈대 대비 조정 사항

| # | 조정 | 근거 | 상태 |
|---|---|---|---|
| A1 | **W-1 신설.** 창 **밖에서** 리허설 스키마 덤프를 떠 U5(GRANT 70행) 대조를 끝낸다 | F3 — 스키마 덤프 자체가 GRANT·publication 기록을 담는다. 창 안에서 70행을 눈으로 대조하는 것보다 안전하고 창 시간을 쓰지 않는다. publication 축은 이미 실측 해소됨(§1.2)이므로 남는 것은 GRANT뿐이다 | **반영** |
| A2 | **W2.5 범위 축소.** 삭제 대상을 `status <> 'waiting'`인 위반 group 행으로 좁힌다 | F14 — `20260814113000:32-40`의 UPDATE가 group·**waiting** 행을 `min_players=3`/`max<=8`/`rank=3`/`use_items=false`로 **자동 정규화**한다. waiting 행은 삭제할 필요가 없다. `AGENTS.md` §4(최소 삭제) | **반영** |
| A3 | **W8에서 `--prune` 금지, 함수 이름 명시.** | F12·F13 — `target-level`은 운영에만 있고 로컬 소스가 없다. `--prune`은 이를 삭제하고, 이름 생략은 `username-*`까지 로컬 소스로 덮어쓴다 | **반영** |
| A4 | W0 이전에 **게이트 구현 커밋이 반드시 있어야 한다** | F10·F11 — 게이트 코드가 없고 `VITE_*`는 빌드 시점 인라인이다. 환경변수만 켜도 아무 일도 일어나지 않는다 | **반영** (§7 P1) |
| A5 | Edge Function 배포를 **W5.5**로 앞당긴다 | (제안 근거였던 것) 창 중 트래픽이 없으므로 함수를 미리 올려도 호출되지 않고, W6 직후 시스템이 즉시 완전해진다 | **기각 (사용자 결정, 2026-08-21).** 이유 두 가지: (1) W6 전 배포는 **존재하지 않는 테이블을 참조하는 함수를 운영에 올리는 것**이다 — `wiki-snapshot`·`single-run`이 쓰는 V2 테이블은 W6에서 생긴다. (2) **검증 순서가 꼬인다** — 배포 성공과 동작 가능을 같은 시점에 확인할 수 없어 W7(스키마) / W8(함수) / W9(흐름)의 실패 지점 구분이 흐려진다. `code/18-...md` Release B의 "DB 적용 성공 후" 순서를 그대로 유지한다. **Edge Function 배포는 W8 고정** |

### 3.1 창 전체에 걸친 잔여 위험

유지보수 게이트는 **클라이언트 측 차단**이다 (F10·F11 — 빌드에 인라인된 플래그).
서버 강제 경계가 아니다. 따라서 **W1~W6 사이에 이론상 쓰기가 들어올 수 있다.**
바이패스 토큰도 번들에 그대로 들어가므로 보안 경계가 아니다.

실제 강제는 W6의 `20260814093000`이 `anon`·`authenticated` 직접 쓰기를 회수할 때 생긴다.
**이 잔여 위험을 수용하는 근거는 트래픽이다** — 최종 플레이 2026-08-04 `[실측]`,
창 시점까지 약 2주 이상 무플레이. 창 중 신규 쓰기 확률을 낮게 본다.
낮다는 것이 0이라는 뜻은 아니므로, W2 덤프와 W6 사이에 들어온 쓰기는 §6 복원 시 유실된다는 점을 남긴다.

### 3.2 단계별 절차

명령은 `C:\Project\wiki`에서 PowerShell로 실행한다. `--linked` 대상 명령은 전부 건별 승인 대상이다.

---

#### W-1 — 창 전 리허설 (**전날**, 창 밖. 별도 승인)

- **목적:** U5(GRANT 70행) 대조를 창 밖에서 끝낸다. 프로젝트 Active 확인. link 대상 확인(U13).
- **명령:**
  ```powershell
  # backup/ 디렉터리를 먼저 만든다 — CLI는 출력 경로의 디렉터리를 만들어 주지 않는다 (§0.2)
  New-Item -ItemType Directory -Force -Path .\backup | Out-Null

  npx supabase projects list
  npx supabase db dump --linked -f .\backup\rehearsal-schema.sql
  Select-String -Path .\backup\rehearsal-schema.sql -Pattern '^GRANT' | Measure-Object -Line
  Select-String -Path .\supabase\baseline\remote_schema.sql -Pattern '^GRANT' | Measure-Object -Line
  Select-String -Path .\backup\rehearsal-schema.sql -Pattern 'ALTER PUBLICATION "supabase_realtime" ADD TABLE'
  ```
- **예상 시간:** 10분 `[추정]`
- **성공 판정:** 프로젝트 상태가 Active. `GRANT` 행 수가 baseline의 70행과 일치하고, 불일치 시 diff가
  설명 가능한 범위. publication `ADD TABLE` 4행이 §1.2 실측과 일치.
- **실패 시:** GRANT 차이가 나오면 그 차이가 W6의 권한 회수 결과에 영향을 주는지 판단하기 전까지 창을 열지 않는다.
  근거: 권한 드리프트는 migration을 실패시키지 않고 런타임 권한 거부로만 나타난다
  (`PROD-SNAPSHOT-2026-08-20.md` §9.7).
- **주의:** `db dump --dry-run --linked`가 접속 없이 스크립트만 출력하는지는 **미확인**이다.
  `--dry-run --local`로만 확인했다 (F3).
- **실행됨 (2026-08-27, 사용자 실행) — 결과: 차이 0건.** 스키마 덤프
  `backup/rehearsal-schema-2026-08-27.sql`(41,399 bytes)를 baseline과 대조한 결과
  **바이트 단위 완전 동일**했다 (`cmp` 차이 없음, md5 `e2bfa805…`) `[산출물]`.
  → `GRANT` 70행 내용·순서 일치, publication `ADD TABLE` 4테이블 일치,
  `ALTER DEFAULT PRIVILEGES` 12행 일치, 전체 1563행 차이 0건. **U5 해소, P7 충족.**
  전문은 §1.4.
- **이때 발견된 실행 전제 2건:** 디렉터리 미생성(`failed to open dump file: NotFound`)과
  `npx` 접두 누락(`CommandNotFoundException`). 둘 다 §0.1·§0.2에 반영했고 위 명령 블록에
  `New-Item`을 추가했다.

---

#### W0 — Vercel `VITE_MAINTENANCE=true` 설정

- **목적:** 이어지는 W1 빌드에 유지보수 플래그를 **인라인**한다.
- **작업:** Vercel 대시보드 → Project Settings → Environment Variables → Production 환경에
  변수 **2개**를 추가한다. `[외부]`

  | 변수 | 값 | **Type** |
  |---|---|---|
  | `VITE_MAINTENANCE` | `true` (정확히 이 소문자 4글자) | **`Config`** |
  | `VITE_MAINTENANCE_BYPASS` | 임의의 문자열. W9 스모크 테스트에서 이 값으로 앱에 진입한다 | **`Config`** |

- **Type은 `Secret`이 아니라 `Config`다 — 선택이 아니라 강제다** (2026-08-27 창 실측 `[외부]`).
  `VITE_` 접두 변수는 빌드 시점에 **클라이언트 번들로 인라인된다**(F11). 값이 브라우저에 그대로
  나가므로 Vercel이 **Secret 저장을 거부한다.** 이것은 F11의 직접적 귀결이며,
  **`VITE_MAINTENANCE_BYPASS`도 마찬가지다** — 바이패스 값은 원리적으로 비밀이 될 수 없다.
  창 안에서 Secret으로 시도했다가 거부당한 뒤 `Config`로 바꿔 통과했다.

- **값 표기 주의 — 조용한 실패:** 게이트는 `VITE_MAINTENANCE`가 **정확히 문자열 `"true"`일 때만**
  켜진다 (`utils/maintenanceGate.js` `isMaintenanceFlagEnabled` `[코드]`).
  `TRUE`·`True`·`1`·`yes`·`on`은 게이트를 켜지 않으며 **오류도 로그도 남기지 않는다.**
  앞뒤 공백은 제거되므로 `" true "`는 켜진다. 대소문자 오타는 W0 성공 판정을 통과한 채
  **점검 화면 없는 프론트가 배포되는 결과**로 이어진다 — 그래서 W1에서 육안 확인이 필수다.
- **`VITE_MAINTENANCE_BYPASS`를 비우면:** 바이패스 수단 자체가 없어진다. 어떤 `?bypass=` 값으로도
  통과하지 못하고, W9를 수행할 방법이 사라진다 (`[코드]` 동일 파일 `getConfiguredBypassToken`).
- **예상 시간:** 5분 `[추정]`
- **성공 판정:** Production 환경에 두 변수가 보인다. `VITE_MAINTENANCE`의 값이 소문자 `true`다
  (Vercel UI에서 값을 펼쳐 눈으로 대조한다 — 이 단계에서 오타를 잡는 유일한 기회다).
- **실패 시:** 창을 열지 않는다.
- **왜 W1보다 먼저인가:** `VITE_*`는 빌드 시점에 값이 박힌다 (F11). W1 push가 트리거하는 빌드가
  이 값을 읽어야 한다. 순서가 뒤바뀌면 **게이트 없는 신버전 프론트가 구버전 DB 위에 라이브로 뜬다.**

---

#### W1 — `main` push → 배포, 점검 화면 확인

- **목적:** 신버전 프론트를 유지보수 화면 상태로 배포한다.
- **명령:**
  ```powershell
  git push origin feat/group-final-gaps:main
  ```
  fast-forward가 가능하다 (F17). 로컬 `main` 체크아웃·머지는 필요 없다.
- **예상 시간:** push 1분 + Vercel 빌드 3~6분 `[추정]`
- **성공 판정:** 배포 성공 + 아래 4항목을 **브라우저에서 직접** 확인한다.

  | # | 확인 | 무엇을 잡는가 |
  |---|---|---|
  | 1 | 프로덕션 URL 접속 시 **점검 화면이 실제로 렌더된다** (문구 육안 확인) | **W0 환경변수 오타.** 값이 `TRUE`·`1` 등이면 게이트가 조용히 꺼진 채 앱이 그대로 뜬다 |
  | 2 | 콘솔에 RPC 404/PGRST 오류가 없다 | 게이트가 앱 초기화(Supabase 클라이언트 생성)를 막고 있다 |
  | 3 | `?bypass=<W0에서 설정한 값>` 접속 시 앱 진입. 이후 쿼리 없이 새로고침해도 앱 유지 | 바이패스 값 오타. **여기서 실패하면 W9를 수행할 수 없다** |
  | 4 | 게이트 해제 상태(3의 바이패스 진입 화면)의 **첫 로딩에서 스타일이 정상 적용된다** | CSS 비동기 청크 전환의 배포 환경 영향 (아래) |

- **왜 4번을 보는가:** 게이트 구현에서 `main.jsx`가 App과 CSS를 동적 import로 바꿨고, 그 결과
  전역 스타일이 진입 청크가 아닌 **비동기 청크**로 분리됐다 (`appStyles.js` `[코드]`).
  `index.html`에 `<link rel="stylesheet">`가 더 이상 없고 스타일이 런타임에 주입된다.
  로컬 preview에서는 정상 적용을 확인했다 `[산출물]`. 다만 CDN·압축·캐시 헤더가 다른 배포 환경에서
  같다는 보장은 저장소 근거로 확인되지 않으므로 `확인 필요`로 두고 이 단계에서 실측한다.
  스타일이 깨져 보이면 창을 중단할 사유는 아니지만(운영 DB 무변경 단계) 기록에 남긴다.
- **바이패스 해제:** `?bypass=off`로 접속하면 저장된 바이패스가 지워지고 점검 화면으로 돌아온다.
  W1 확인을 끝낸 브라우저에 바이패스가 남아 있으면 이후 단계에서 점검 상태를 오판할 수 있다.
- **실패 시:** 빌드 실패면 창 중단 — 운영 DB는 아직 무변경이다. 유지보수 화면이 아니라 앱이 그대로 뜨면
  **즉시 이전 배포로 롤백**하고 창을 닫는다. 이 상태의 프론트는 존재하지 않는 V2 RPC를
  호출한다 (`AGENTS.md` §1.1).
- **주의:** 이 push는 `origin/main`을 5월 상태(`e6d8eee`)에서 여러 커밋 앞으로 옮긴다.
  **`git rev-list --count e6d8eee..HEAD`로 창 당일 반드시 재측정한다** — 이 값은 커밋이 쌓일 때마다
  낡는다. 되돌리려면 force push가 필요하다 — git 이력상 완전히 무해하지는 않은 유일한
  W6 이전 단계다.

  **실측 이력:** 2026-08-21 기재 시점 14 → 문서에 16으로 갱신 → **2026-08-27 창 당일 실측 31**
  (`7a70a04`까지 이동) → W1-a 이후 **36** (`4a78a0d`, 2026-08-28). **"당일 재측정" 지시가
  실제로 값을 냈다** — 창은 문서의 16이 아니라 측정한 31로 진행했다.

---

#### W2 — 백업 덤프 (스키마 / 데이터 전체 / **데이터 public 전용** / 롤)

§4에 전문. 요약: 스키마 덤프 → 데이터 덤프 → 파일 검증.

- **예상 시간:** 10~20분 `[추정]` (운영 규모가 작다 — `auth.users` 145, `game_records` 57 `[실측]`)
- **성공 판정:** §4.4의 검증 4항목 전부 통과.
- **실패 시:** **창 중단.** 덤프 없이 W2.5·W6로 넘어가지 않는다. 무료 요금제에 PITR이 없으므로
  덤프가 유일한 복구 수단이다 (§4.1).

---

#### W2.5 — 과거 방 이력 삭제

§5에 전문. 조정 A2에 따라 대상은 `mode='group' and status <> 'waiting'`인 위반 행이다.

- **예상 시간:** 15분 `[추정]` (측정 → 승인 → 삭제 → 재측정)
- **성공 판정:** 삭제 후 preflight 위반 집계에 `status <> 'waiting'` 행이 0행.
- **실패 시 — 2026-08-27 리허설로 정정됨:** ~~삭제를 하지 않고 W6로 갈 수 있다 — migration은
  실패하지 않는다 (F15)~~ **틀렸다.** 삭제를 건너뛰면 **W6가 10번째
  `20260814113000`에서 SQLSTATE 23514로 실패한다** — 그 migration이 위반 행을 스스로 UPDATE하고
  `NOT VALID` 제약은 UPDATE에 행 단위로 강제되기 때문이다. 실측·기전·반사실 확인은 §6.5.3,
  요약은 §5.3-0에 있다.
  - 정확히는 **위반 행 전부가 아니라 host 참조가 끊긴 위반 행만** 실패를 유발한다.
    그 수를 세는 읽기 전용 쿼리(`w6_blocking_rows`)가 §5.3-0에 있다. **P10에서 이 값을 먼저 측정한다.**
  - `w6_blocking_rows = 0`이면 삭제를 건너뛰어도 W6는 통과한다. 대신 제약이 영구히 `NOT VALID`로
    남고 기존 위반 행의 UPDATE·RPC 경로가 런타임에 깨진다 (`docs/agent/CURRENT.md` §5-2).
    그 상태를 수용할지는 창 안에서 결정하지 않고 미리 정한다 (P10).

---

#### W3 — baseline `migration repair`

- **목적:** `supabase_migrations.schema_migrations`를 만들고 baseline을 "적용됨"으로 기록해,
  첫 `db push`가 baseline을 **운영에 재적용하는 사고**를 막는다.
- **명령:**
  ```powershell
  npx supabase migration repair --status applied 20260730170602 --linked
  ```
- **예상 시간:** 2분 `[추정]`
- **성공 판정:** 명령 exit 0.
- **실패 시:** 실패 원인이 접속/권한이면 재시도. 스키마 관련 실패는 원리상 나오지 않는다 —
  `repair`는 대상 스키마를 검사하지 않는다 (`PROD-SNAPSHOT-2026-08-20.md` §9.7).
- **되돌림 — `--status reverted` 실측 (U12 (c), 2026-08-21):** 로컬 스택에서 5개 경우를 측정했다
  `[산출물]`. CLI `2.114.0`.

  | 사전 상태 | 결과 |
  |---|---|
  | 해당 버전 행이 **있음** | **exit 0. 행이 삭제된다** — 상태 열이 없으므로 `reverted`는 DELETE다 |
  | 행이 **없음** (로컬 파일은 있음) | exit 0. 변화 없음 — **멱등** |
  | 행도 로컬 파일도 **없는 버전** | **exit 0.** "reverted" 보고. 아무것도 넣지 않고 아무것도 지우지 않는다 |
  | **테이블이 없음** | **exit 0. 빈 테이블을 생성한다** (0행) |
  | (대조) `--status applied`에 로컬 파일이 없는 버전 | **exit 1** `LegacyMigrationFileNotFoundError` |

  **되돌림 명령은 `npx supabase migration repair --status reverted 20260730170602 --linked`이며
  W3이 넣은 행 하나를 지운다.** 테이블 자체는 남는다(§2 롤백 표와 일치) — 없으면 오히려 만든다.
- **`reverted`는 버전 오타를 잡지 못한다:** `applied`는 로컬 파일이 없으면 exit 1로 실패하지만,
  `reverted`는 **존재하지 않는 버전에도 exit 0으로 성공 보고**한다 `[산출물]`. 되돌림에서 버전을
  잘못 쓰면 성공처럼 보이고 아무 일도 일어나지 않는다. **되돌림 후에도 W4의 확인 쿼리로
  행 상태를 직접 봐야 한다** — 명령의 exit code를 근거로 삼지 않는다.
- **로컬 재현 실측 (U12 해소, 2026-08-21):** 로컬 스택에서 두 경우를 각각 만들고 실행했다.
  CLI `2.114.0`, container-158 `[산출물]`.

  | 사전 상태 | 결과 |
  |---|---|
  | 스키마 존재, **테이블만 없음** | **exit 0.** 테이블 생성, 1행 기록 |
  | **스키마 자체가 없음** | **exit 0.** 스키마 + 테이블 생성, 1행 기록 |

  두 경우 모두 출력이 동일했다 — `Repaired migration history: [20260730170602] => applied`.
  따라서 **W3 앞에 선행 단계가 필요하지 않다.** 운영에 `supabase_migrations` 스키마가 아예 없어도
  repair가 자력으로 만든다. 재생성된 테이블 구조는 로컬 원본과 같다
  (`version text NOT NULL` PK `schema_migrations_pkey`, `statements` array, `name text`, owner `postgres`).
- **운영 42P01 증거의 한계:** `PROD-SNAPSHOT-2026-08-20.md` §1이 기록한 42P01은
  **"스키마는 있고 테이블만 없음"과 "스키마 자체가 없음"을 구분하지 못한다** — 로컬에서 두 경우의
  에러 메시지가 문자열까지 동일했다 `[산출물]`. 위 실측이 양쪽 모두 exit 0임을 보였으므로
  구분할 필요 자체가 없다. 운영 상태를 추가로 조회하지 않고 W3으로 진행한다.
- **기록되는 행의 내용:** 버전 마커가 아니다. `statements` 배열에 로컬 migration 파일의 SQL이
  **전부** 들어간다 — `20260730170602`의 경우 250개 statement `[산출물]`. 정상 동작이지만
  §4.2-2("`supabase_migrations`는 어느 덤프에도 없다")와 겹쳐 읽으면 **W3이 만든 이력에는
  baseline SQL 본문이 들어 있고 그것은 백업되지 않는다**는 뜻이다. 손실 시 repair 재실행으로
  재생성되므로 위험은 아니다.
- **근거:** 대상 버전 `20260730170602`과 판단 `(a) 성립`은 4개 축 차이 0건으로 확정됐다
  (`docs/agent/CURRENT.md` §5-1).

---

#### W4 — 이력 행 확인

- **목적:** repair가 의도한 **한 행만** 기록했는지 확인한다.
- **명령:**
  ```powershell
  npx supabase migration list --linked
  ```
  또는 SQL Editor에서:
  ```sql
  select version, name, array_length(statements, 1) as statement_count
  from supabase_migrations.schema_migrations
  order by version;
  ```
  `statements`를 함께 본다. repair가 남기는 행은 버전 마커가 아니라 migration 파일의 SQL 본문을
  담는다 (W3 실측). `--status applied`는 로컬 파일이 없으면 exit 1로 **실패**하므로
  (`LegacyMigrationFileNotFoundError`, W3 실측) repair가 만든 행의 `statements`는 `null`일 수 없다.
  **`statements`가 `null`인 행은 repair가 아닌 다른 경로로 들어온 행이다** — 그 경우 중단 대상이다.
- **예상 시간:** 3분 `[추정]`
- **성공 판정:** 행이 정확히 1개, `version = 20260730170602`, `name = baseline_remote_schema`,
  `statement_count = 250` (로컬 실측값 `[산출물]`. 로컬 migration 파일이 바뀌지 않았다면 같아야 한다).
- **실패 시:** 행이 0개면 W3 재실행. 예상 외 버전이 있으면 **중단** — 다른 경로로 push된 이력이
  있다는 뜻이고 §1.2의 전제가 깨진다. `statement_count`만 다르면 중단 사유는 아니고 기록에 남긴다 —
  로컬 파일과 실측 시점(2026-08-21)의 차이를 뜻한다. `statement_count`가 `null`이면 **중단**
  (위 참조 — repair가 만든 행이 아니다).
- **되돌림 후에도 이 단계를 쓴다:** `--status reverted`는 존재하지 않는 버전에도 exit 0을 낸다
  (W3 실측). 되돌림의 성공 여부는 이 쿼리로만 확인된다 — 행이 사라졌는지 직접 본다.

---

#### W5 — `db push --dry-run`

- **목적:** pending 집합이 **정확히 11개**인지, 순서가 맞는지 확인한다.
- **명령:**
  ```powershell
  npx supabase db push --dry-run --linked
  ```
- **예상 시간:** 3분 `[추정]`
- **성공 판정:** pending 목록이 아래 11개와 정확히 일치하고 이 순서다
  (`PROD-SNAPSHOT-2026-08-20.md` §1 `[문서]`, `supabase/migrations/` `[코드]`):

  | # | version | name |
  |---|---|---|
  | 1 | 20260804004535 | group_security_hardening_phase1 |
  | 2 | 20260807003609 | group_match_lifecycle_phase2a |
  | 3 | 20260813072952 | group_security_phase2c |
  | 4 | 20260814090000 | server_authority_v2 |
  | 5 | 20260814091000 | server_authority_rpc_v2 |
  | 6 | 20260814092000 | duel_authority_v2 |
  | 7 | 20260814093000 | server_authority_cutover_v2 |
  | 8 | 20260814094000 | duel_item_authority_v2 |
  | 9 | 20260814103000 | group_final_gaps_v13 |
  | 10 | 20260814113000 | group_final_gaps_v13_hardening |
  | 11 | 20260814123000 | group_spectator_emoji_atomicity_fix |

- **실패 시:** 12개(baseline 포함)가 나오면 **중단** — W3가 반영되지 않았다.
  10개 이하거나 순서가 다르면 중단하고 로컬 파일 집합을 확인한다.
- **주의:** `--include-all`은 쓰지 않는다. 11개 전부 baseline보다 뒤 버전이므로 필요 없고,
  이 flag는 순서 밖 migration까지 끌어들인다 (F2).

---

#### W6 — `db push --linked` ← **되돌릴 수 없는 지점**

- **목적:** migration 11개를 순서대로 전량 적용한다.
- **명령 — 시각을 명령이 출력하게 한다:**
  ```powershell
  Get-Date -Format 'HH:mm:ss'     # ← 시작 시각. 기록 파일 §W6에 그대로 붙인다
  npx supabase db push --linked
  Get-Date -Format 'HH:mm:ss'     # ← 종료 시각. 이것을 빠뜨리면 소요를 영영 알 수 없다
  ```
  `--yes`는 붙이지 않는다. 프롬프트를 사람이 읽고 넘긴다.

  > **왜 시각을 명령이 출력하게 하는가 (2026-08-28 추가).** 2026-08-27 창에서 **W6 종료 시각이
  > 기록되지 않았다.** 기록 템플릿 §W6은 시작·종료·소요를 각각 독립 행으로 둔 **가장 상세한
  > 시각 란**을 갖고 있었는데도 비었다 — **란의 부재가 아니라 채우게 만드는 강제의 부재가
  > 원인이다.** push가 끝난 직후 주의는 "성공했는가"로 쏠리고, 시각은 그 순간에만 얻을 수 있다.
  > 위 형태로 실행하면 **시각이 명령 출력의 일부가 되므로** "출력을 그대로 붙인다"는 기존
  > 원칙만 지켜도 자동으로 남는다. **같은 방식을 W2·W5·W8에도 적용한다.**
  > 그 결과 §3.3.2의 "W6 최대 20분 `[추정]`"은 **아직 운영 실측으로 보정되지 않았다.**
- **예상 시간:** **최대 20분** `[추정]` (사용자 제시. 무료 요금제 리소스 기준).
  **2026-08-27 창에서도 실측되지 않았다** — 시작 21:47만 기록됐다 (CUTOVER-LOG §W6).
- **성공 판정:** 11개 전부 적용. exit 0. 오류 출력 없음. **+ 종료 시각을 기록했다.**
- **실패 시 — 이 항목이 이 문서의 핵심이다:**
  - `db push`는 **파일 단위**로 적용하며 각 파일이 자체 트랜잭션이다 (§2.1-3 `[코드]`).
    **N번째에서 실패하면 1~N-1번째는 적용된 채 남는다.**
  - **down migration이 없다.** 부분 적용 상태를 코드로 되돌릴 수단이 저장소에 존재하지 않는다.
  - → **유일한 되돌림 수단은 §6의 덤프 복원이다.** 재시도(`db push` 재실행)는 실패한 파일부터
    이어서 적용하므로, 실패 원인이 파일 내용이면 같은 지점에서 다시 멈춘다.
  - **적용 경계는 항상 깨끗한 파일 경계다.** `db push`는 파일 하나를 원자적으로 적용한다 —
    `begin;`/`commit;`이 없는 `20260814093000`으로 프로브를 돌려도 실패 앞 문장까지 전부
    롤백됐다 (2026-08-27 실측 `[산출물]`, §6.5.3). **"반쯤 적용된 파일"이라는 상태는 없다.**
  - 실패 시 즉시 할 일: (1) 실패 파일명·에러 전문 보존, (2) `migration list --linked`로 적용 경계 확정,
    (3) **§6.0.3의 W6 등급표에서 실패한 파일 번호의 등급을 읽는다.**
  - **판단 기준은 §6.0에서 확정됐다 (P11).** 창 안에서 즉흥적으로 forward 보정 SQL을 쓰지 않는다
    — 금지다 (§6.0.1 R1, `AGENTS.md` §3·§4). 선택지는 **복원** 또는 **창을 닫고 다음 창**이다.
- **부수 효과 2건:**
  - **운영 데이터가 변경된다.** F14의 두 UPDATE가 group·waiting 방의 인원·아이템·시간 규칙을
    덮어쓴다. 이는 승인 범위에 포함된다 (`docs/agent/CURRENT.md` §5-2).
  - `db push`는 migration 전에 `config.toml`의 vault secret을 갱신한다 (F19).
    현재 `[db.vault]`는 주석 처리 상태라 갱신할 secret이 없다 — 그래도 동작을 알고 있어야 한다.
    갱신을 원치 않으면 `--skip-vault`를 쓴다.

---

#### W7 — 적용 결과 검증

- **목적:** 함수·제약·RLS·publication이 기대 상태인지 확인한다.
- **명령 (운영 SQL Editor, 읽기 전용):**
  ```sql
  -- 1. public 함수 수. 기대 36
  select count(*) from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public';

  -- 2. legacy RPC 삭제 확인. 기대 둘 다 null
  select to_regprocedure('public.finish_group_player(uuid,integer,integer,text,text[])') as finish_group_player,
         to_regprocedure('public.update_group_progress(uuid,text,integer,text[],integer)') as update_group_progress;

  -- 3. Packet 13 제약이 validate 됐는지. 기대 둘 다 true
  select conname, convalidated
  from pg_constraint
  where conname in ('game_rooms_group_limits_v13_check',
                    'game_rooms_non_group_host_required_v13_check');

  -- 4. RLS. group_match_history·user_profile_stats가 true로 바뀌어야 한다
  select c.relname, c.relrowsecurity, count(pol.polname) as policies
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  left join pg_policy pol on pol.polrelid = c.oid
  where n.nspname = 'public' and c.relkind = 'r'
  group by 1, 2 order by 1;

  -- 5. publication 멤버십
  select tablename from pg_publication_tables
  where pubname = 'supabase_realtime' order by 1;

  -- 6. 이력
  select version from supabase_migrations.schema_migrations order by version;
  ```
- **예상 시간:** 15분 `[추정]`
- **성공 판정:**
  - 함수 36개 (`PROD-SNAPSHOT-2026-08-20.md` §2 — 로컬 11개 적용 후 값 `[문서]`)
  - legacy RPC 2개가 `null`
  - 제약 2개 `convalidated = true` — **W2.5를 수행했을 때만** 참이다 (F15)
  - `group_match_history`·`user_profile_stats`의 `relrowsecurity = true`
    (`20260813072952:765-766` `[코드]`)
  - publication에 `group_spectator_emoji_rate_limits`가 **없다**
    (의도적 미등록, `20260814103000:41-43` 주석 `[코드]`)
  - 이력 12행 (baseline + 11)
- **실패 시:** **불일치 항목별 등급은 §6.0.3의 W7 표가 정한다 (P11).** 요약하면 함수 수 불일치·
  legacy RPC 잔존·RLS 불일치·제약 부재는 **롤백**, `convalidated = false`와 publication 불일치는
  **판단**이다. `convalidated = false`는 **W2.5를 수행했다면 예상 상태가 아니다** — 리허설에서
  W2.5 후 두 제약 모두 `convalidated = t`였다 (§6.5.3). 기능 자체는 동작하므로 창을 닫고
  별도 보정 migration으로 처리한다 (`AGENTS.md` §4 — forward-only).

---

#### W8 — Edge Function 배포

- **목적:** V2 프론트가 의존하는 Edge Function을 올린다.
- **명령:**
  ```powershell
  npx supabase functions deploy wiki-snapshot
  npx supabase functions deploy single-run
  ```
- **⚠ `--linked`를 붙이지 않는다 — `functions deploy`에는 그런 flag가 없다** (2026-08-27 창 실측):

  ```
  Unrecognized flag: --linked
  ```

  **이 단계 직전까지의 명령이 전부 `--linked`를 쓴다** — `db dump`, `migration repair`,
  `db push --dry-run`, `db push`, `migration list`. 그 흐름에서 손이 자동으로 붙이게 되고,
  창에서 실제로 그렇게 실패했다. **플래그를 떼면 성공한다.**
  `functions deploy`가 받는 flag는 `--prune`·`--use-api`다 (F2, `--help` `[산출물]`) —
  그중 `--prune`은 아래 금지 사항이다.
- **예상 시간:** 10분 `[추정]`
- **성공 판정:** 두 함수 배포 성공. `single-run`이 `verify_jwt = false`로 반영됐다 (F20 `[코드]`).
- **실패 시:** 배포 실패는 W6를 되돌리지 않는다. 재시도한다. 재시도가 계속 실패하면 앱은
  단일 게임 경로에서 동작하지 않으므로 **W10을 하지 않고 유지보수 상태를 유지**한다.
- **금지 사항 2건 (조정 A3):**
  - **`--prune`을 쓰지 않는다.** `target-level`은 운영에 있고 로컬 소스가 없다 (F12).
    `--prune`은 이를 삭제하며, 삭제하면 이 저장소에서 복구할 수 없다.
  - **함수 이름을 반드시 명시한다.** 생략하면 로컬 4개 전부를 배포해 현재 정상 동작 중인
    `username-lookup`·`username-signup`을 로컬 소스로 덮어쓴다 (F13).
- **미결정:** 운영 배포 목록 자체가 확인되지 않았다 (U9, §9).

---

#### W9 — 바이패스 스모크 테스트

- **목적:** 유지보수 화면을 유지한 채 실제 흐름을 확인한다.
- **작업:** 바이패스 URL로 접속해 다음을 순서대로 확인한다
  (`code/18-...md` §배포 후 브라우저 확인 1~6 축약 `[문서]`):
  1. 인증 사용자 단일 게임 시작 → 링크 이동 → Undo → F5 복구 → 포기 확인
  2. 게스트 단일 게임 (`single-run` 경로, 토큰 검증)
  3. 그룹 방: 3명 이상으로 생성·준비·시작 — **신규 방이 Packet 13 제약을 통과하는지**가 핵심
  4. 1:1: 양쪽 목표 설정, 시작 문서 동일성
  5. 같은 `request_id` 재전송 시 이동 횟수·기록이 한 번만 증가
  6. 프로필 화면의 전적 표시 — §5.5의 삭제 영향이 화면에 어떻게 보이는지 확인
- **예상 시간:** 20~30분 `[추정]`
- **성공 판정:** 위 6항목 전부 통과. 콘솔에 `SNAPSHOT_NOT_FOUND`·`TARGET_IDENTITY_REQUIRED`·
  `RUN_VERSION_CONFLICT`가 정상 흐름에서 나오지 않는다 (`code/18-...md` §장애 시 확인 지점 `[문서]`).
- **실패 시:** **W10을 하지 않는다.** 유지보수 상태를 유지한 채 원인을 조사한다.
  유지보수 게이트를 켠 채 조사할 수 있다는 점이 이 계획 구조의 이점이다.
  **W9 실패는 기본적으로 롤백 트리거가 아니다** — 항목별 등급은 §6.0.3의 W9 표에 있다 (P11).
  이 단계가 보는 것은 프론트·Edge Function·RPC 호출 경로이고, **DB를 되돌려도 고쳐지지 않는
  층이 대부분**이기 때문이다. **+120분(G3)에 도달하면 재개를 포기하고 게이트를 켠 채 창을 닫는다**
  (§6.0.2).
- **주의:** 운영 17.6의 권한 거부 경로 SIGSEGV 위험(U6, §9)이 실제로 나타난다면 이 단계다.
  `anon`으로 차단된 경로를 의도적으로 한 번 밟아 보고, 응답이 오는지·연결이 끊기는지 기록한다.

---

#### W10 — `VITE_MAINTENANCE` 해제 + 재배포

- **목적:** 서비스를 다시 연다.
- **작업:** Vercel 환경변수 `VITE_MAINTENANCE`를 **삭제하거나** `false`로 바꾸고 **재배포**한다.
  값 변경만으로는 반영되지 않는다 — `VITE_*`는 빌드 시점 인라인이다 (F11).
  Vercel 대시보드에서 **최신 Production 배포를 Redeploy** 하거나:
  ```powershell
  git commit --allow-empty -m "chore: rebuild after cutover"
  git push origin HEAD:main
  ```
- **⚠ 삭제와 `false`는 판정이 같다 — 삭제 쪽을 권한다** (2026-09-02 실측):
  `isMaintenanceFlagEnabled`는 **정확히 문자열 `"true"`만 활성으로 본다**
  (`utils/maintenanceGate.js:26`) `[코드]`. 변수가 없으면 `""`가 되어 `"false"`와 결과가 같다.
  **`false`가 남아 있는 것보다 삭제가 낫다** — 다음 창에서 값만 고치다 오타로 켜질 여지가 없다.
  **2026-09-02 W10은 삭제로 수행했다** (CUTOVER-LOG §W10).
- **⚠ `VITE_MAINTENANCE_BYPASS`는 지우지 않는다.** 지우면 **다음 창의 W0가 바이패스 수단 없이
  시작된다** — W9 스모크를 할 방법이 사라진다. 게이트가 꺼져 있는 동안 이 값은 판정에
  영향을 주지 않는다 `[코드]`.
- **예상 시간:** 10분 `[추정]`
- **성공 판정:** 프로덕션 URL이 앱을 정상 표시. 로그인·단일 게임 진입 확인.
- **실패 시:** 환경변수를 `true`로 되돌리고 재배포해 유지보수 상태로 복귀한다. DB는 이미 신버전이므로
  **구버전 프론트로 되돌리지 않는다** — legacy RPC가 삭제된 상태라 구버전은 깨진다
  (`code/18-...md` §롤백 주의사항 `[문서]`).

---

#### W11 — 사후 확인

- **목적:** 창을 닫기 전 마지막 상태 기록.
- **작업:**
  - §8.1의 창 후 검증 항목 실행
  - 창 중 실행한 명령·출력·판정을 실행 기록 파일로 남긴다
    — `docs/ops/CUTOVER-LOG-TEMPLATE.md`를 `docs/ops/CUTOVER-LOG-YYYY-MM-DD.md`로 **복사해** 채운다 (P12).
    빈칸 형식이라 창 안에서 형식을 고민하지 않는다. 수치에는 기준 커밋과 날짜를 병기한다
    (`AGENTS.md` §6).
  - `docs/agent/CURRENT.md`의 `RELEASE HOLD` 판정과 §5 다음 작업을 갱신한다.
  - `docs/ops/PROD-SNAPSHOT-2026-08-20.md`는 **운영이 변경된 시점에 무효**가 된다.
    같은 문서 서두 규칙에 따라 새 날짜 스냅샷을 만들고 기존 파일은 보존한다.
- **예상 시간:** 20분 `[추정]`
- **⚠ 창이 W10을 창 밖으로 넘겼다면(G3) W11도 두 번 쓴다** (2026-09-02 실측):
  창 종료 시점의 W11을 쓰고, 이월분을 소화한 뒤 **`-b` 접미 하위 절**을 덧붙인다.
  **원본 판정은 고쳐 쓰지 않는다** — 그 시점에 그 판정이 옳았다는 사실이 기록의 값이다.
  이 창이 쓴 형식: `#### W1-b` / `#### W8-b` / `#### W9-b` / `#### W11-b`,
  그리고 W10은 `(1) 미수행 판정 [보존]` + `(2) 실행 완료` 두 블록
  (CUTOVER-LOG §W10). **템플릿에도 이 형식을 둔다.**

### 3.3 창 경계와 예상 총 시간

**결정 (사용자, 2026-08-21): 선택지 (c)를 채택한다. 창은 W0부터 시작한다.**

#### 창 밖 — 전날 완료 (창 시간에 포함되지 않는다)

| 항목 | 내용 |
|---|---|
| W-1 | 리허설 스키마 덤프, `projects list`, GRANT 70행 대조, publication `ADD TABLE` 4행 확인 (§3.2 W-1) |
| P1~P8 | 게이트 구현·커밋·로컬 확인(P1~P3), 프로젝트 Active(P4), 접속 자격(P5), `backup/` gitignore 반영(P6), GRANT 대조(P7), link 대상 확인(P8) |

**P4(프로젝트 Active)만 예외다.** 전날 확인하고 **창 당일에 한 번 더** 확인한다.
무료 요금제는 7일 무활동 시 자동 일시정지되므로 `[외부]` 전날 값이 당일을 보장하지 않는다.

P9~P13은 창 밖 어느 시점이어도 되지만, 늦어도 전날까지 끝낸다.
**전날 항목이 하나라도 미완이면 창을 열지 않는다.**

#### 창 안 — W0부터

| 구간 | 시간 `[추정]` |
|---|---|
| W0~W1 (환경변수·main push·배포 확인) | 10~15분 |
| W2 (백업 덤프 2종 + 검증) | 10~20분 |
| W2.5 (측정·승인·삭제·재측정) | 15분 |
| W3~W5 (repair·이력 확인·dry-run) | 8분 |
| W6 (push) — **되돌릴 수 없는 지점** | 최대 20분 |
| W7 (적용 결과 검증) | 15분 |
| W8 (Edge Function 배포) | 10분 |
| W9 (바이패스 스모크) | 20~30분 |
| W10~W11 (재개방·기록) | 30분 |
| **합계** | **약 1시간 50분 ~ 2시간 45분** |

**U1의 허용 창(1~2시간)과 여전히 여유가 없다.** (c) 채택으로 W-1·선행 점검(약 10~20분)이
창 밖으로 빠졌지만, W2.5·W9의 상한이 크고 W6의 20분이 `[추정]`이라 상한 시나리오는 2시간을 넘는다.
A5는 기각됐으므로(§3.0) 함수 배포 10분은 창 안에 남는다.

#### 3.3.1 상한 누계와 시각 게이트 (2026-08-27 갱신)

위 표의 **상한**을 누계하면 각 단계가 끝나는 시각이 나온다. §6.0.2의 게이트는 이 누계 위에 놓인다.

| 종료 시점 | 단계 | 누계 (상한) | 게이트 |
|---|---|---|---|
| W1 | 환경변수·배포 | +15분 | |
| W2 | 백업 덤프 | +35분 | |
| W2.5 | 방 이력 삭제 | +50분 | |
| **W5** | dry-run | **+58분** | **G1 = +60분 — 여기까지 못 오면 W6를 시작하지 않는다** |
| **W6** | push — 되돌릴 수 없는 지점 | **+78분** | G2까지 **7분**. 벼랑이 아니라 경계선이다 (§6.0.2-1) |
| — | (W7 진행 중) | **+85분** | **G2 — 이후 확정된 W6 실패는 복원을 창 밖으로 넘긴다.** 실패가 아니라 예정된 경로다 (§6.0.2-1) |
| W7 | 적용 결과 검증 | +93분 | |
| W8 | Edge Function | +103분 | |
| — | — | **+120분** | **G3 = 사용자 결정 +2시간 — W10 미수행이면 재개 포기** |
| W9 | 바이패스 스모크 | +133분 | **G3를 이미 넘는다** |
| W11 | 재개방·기록 | +163분 | |

**"+2시간에 롤백 판단으로 전환"을 그대로 두면 겨냥이 어긋난다.** +120분의 계획 위치가 **W9**이고,
W9 실패는 원래 롤백 트리거가 아니라 "유지보수 유지 + 조사"이기 때문이다(§3.2 W9 실패 시,
§6.0.3 W9 표). 되돌릴 수 없는 지점은 그보다 **42분 앞(+78분)** 에서 이미 지나간다.
→ **+2시간은 뜻을 바꿔 G3로 유지하고, 실제로 판단이 필요한 자리에 G1·G2를 세웠다** (§6.0.2).

**복원 시간이 판단 전환을 앞당기지는 않는다.** 리허설 실측으로 §6.3의 DB 작업은
**로컬 4.4초**, 운영 보정 후에도 **6~14분** `[추정]`이다 (§6.0.4·§6.5.5).
전체 복원 26~34분의 대부분은 **보고·승인·검증**이며, 그래서 경계가 +85분(G2)으로
+120분에서 35분 앞선다.

**G2·G3는 "실패 시각"이 아니다.** 둘 다 유지보수 게이트를 켠 채 남은 일을 창 밖으로 넘기는
지점이며 — G2는 **복원**을, G3는 **서비스 재개**를 넘긴다 — **넘기는 것이 정상 경로다.**
롤백 후에도 프론트는 게이트를 켠 채 유지하기로 확정됐고(R3), 최종 플레이가 2026-08-04 `[실측]`이라
**점검 화면 연장 비용이 사실상 0**이기 때문이다. 그래서 **W6 상한에서 G2까지 7분이 남는 것은
벼랑이 아니라 경계선이고**, 그 구간에서 서두르는 것이 복원을 창 밖으로 넘기는 것보다 위험하다.
근거 전문은 §6.0.2-1.

**남은 압축 여지는 W9뿐이다.** 상한을 넘길 조짐이 보이면 W9 항목 1·3(인증 단일 게임, 그룹 방 생성)만
창 안에서 하고 항목 2·4·5·6은 유지보수 해제 후로 미룬다. **이 판단은 G3가 대신한다** —
+120분에 W10을 포기하고 남은 것을 창 밖으로 넘기므로, 창 안에서 W9 축소를 즉흥 판단할 필요가 없다.
**W7은 축소하지 않는다.** 부분 적용 여부를 판정하는 단계다.

#### 3.3.2 실측 앵커 (2026-08-27 로컬 리허설 `[산출물]`)

위 표의 값은 여전히 `[추정]`이다. 다만 이제 **로컬 실측 앵커**가 있다. 전문은 §6.5.5.

| 구간 | 계획 `[추정]` | 로컬 실측 | 비고 |
|---|---|---|---|
| W2 (덤프) | 10~20분 | 덤프 4종 **13.5초** | 계획값의 대부분은 §4.4 육안 검증 시간이다 |
| W2.5 (삭제) | 15분 | 삭제 SQL **0.38초** (120방 + CASCADE 840행) | 계획값의 대부분은 측정·승인 시간이다 |
| W5 (dry-run) | 3분 | **2.35초** | |
| W6 (push) | 최대 20분 | 11개 성공 **5.97초** | 사용자 제시 상한을 그대로 둔다 — 운영은 네트워크·공유 CPU다 |
| §6.3 (전체 복원) | (없었음) | **4.4초** | 새로 측정. §6.0.4에서 운영 6~14분으로 보정 |

**계획 시간을 낮추지 않는다.** 로컬은 localhost·전용 CPU이고 운영은 네트워크·무료 요금제
공유 인스턴스다 `[외부]`. 실측은 **상한이 비현실적이지 않은지 확인하는 용도**이지 단축 근거가 아니다.

> **2026-08-27~28 창은 운영 앵커를 만들지 못했다.** 단계별 시각이 거의 전부 미기록이고
> 남은 것은 **W6 시작 21:47과 창 종료 23:17** 둘뿐이다 — 즉 **W6~W9 구간 90분**이라는
> 굵은 값 하나만 얻었다. 위 표의 어느 행도 운영 값으로 보정되지 않았다.
> 다음 창에서 이 표를 채우려면 **§3.2 W6의 `Get-Date` 감싸기를 W2·W5·W6·W8에 적용해야 한다.**

---

## 4. 백업 절차 (W2 전문)

### 4.1 전제 — PITR이 없다

무료 요금제에는 Point-in-Time Recovery가 없다 `[외부]`. 자동 일일 백업의 보존·복원 가능 여부도
이 저장소에서 확인되지 않는다. **따라서 W2의 덤프 2종이 유일한 복구 수단이다.**
이 사실이 §6 롤백 절차의 전제다.

### 4.2 덤프 2종의 범위 (F3·F4로 확인)

| 덤프 | 명령 | 포함 | 제외 |
|---|---|---|---|
| 스키마 | `db dump --linked -f schema.sql` | `public` 스키마 DDL, **`public` GRANT**, **`ALTER PUBLICATION ... ADD TABLE`** | `auth`·`storage`·`supabase_migrations`·`extensions` 등 내부 스키마, `CREATE PUBLICATION` 문, event trigger |
| 데이터 | `db dump --linked --data-only --use-copy -f data.sql` | `public` 데이터 + **`auth` 데이터(`auth.users` 145행 포함)** + `storage` 데이터 | `auth.schema_migrations`, `storage.migrations`, `supabase_functions.migrations`, `supabase_migrations` 전체 |

**이 범위에서 나오는 두 가지 결과:**

1. **`auth.users`가 데이터 덤프에 들어간다.** 계정 유실은 복원으로 되돌릴 수 있다.
2. **`supabase_migrations`는 어느 덤프에도 없다.** W3 repair로 만든 이력은 백업되지 않는다.
   복원 후에는 repair를 다시 해야 한다 (§6.3-4).

### 4.3 명령

#### 4.3-0 첫 줄이 디렉터리 생성인 이유 — **건너뛰면 오진한다**

**`db dump`는 출력 경로의 디렉터리를 만들어 주지 않는다.** `backup/`이 없으면 이렇게 실패한다:

```
failed to open dump file: NotFound
```

**이 실패는 파일 쓰기 단계에서 일어난다 — 로그인과 DB 접속은 그 전에 이미 성공한 상태다.**
CLI 출력에 `Initialising login role...`까지 정상으로 찍힌 뒤 마지막에 이 줄이 나오므로,
**증상만 보면 자격 증명·권한·네트워크 문제로 보인다.** 실제 원인은 디렉터리 부재다.
2026-08-27 W-1 리허설에서 실제로 이 순서로 발생했다 `[산출물]`.

→ **`Initialising login role`이 찍혔다면 인증은 성공한 것이다.** 그 뒤의 실패는 인증 문제가 아니다.
`supabase login`을 다시 하거나 비밀번호를 의심하기 전에 **`Test-Path .\backup`을 먼저 본다.**

`-Force`가 붙어 있으므로 이미 있으면 아무 일도 하지 않는다. 매번 실행해도 안전하다.
W-1(§3.2)에도 같은 줄이 들어 있다 — 전날 리허설이 먼저 만들면 창 당일에는 이미 존재한다.

```powershell
New-Item -ItemType Directory -Force -Path .\backup | Out-Null
$stamp = '20260821-1900'   # 실제 창 시각으로 교체

npx supabase db dump --linked -f ".\backup\prod-schema-$stamp.sql"
npx supabase db dump --linked --data-only --use-copy -f ".\backup\prod-data-$stamp.sql"

# ↓ 복원의 실제 소스다. 빠뜨리지 않는다 (§6.3.3 (a))
npx supabase db dump --linked --data-only --use-copy --schema public -f ".\backup\prod-data-public-$stamp.sql"

npx supabase db dump --linked --role-only -f ".\backup\prod-roles-$stamp.sql"   # 선택
```

> **3번째 줄은 2026-08-28에 추가됐다 — 그전에는 없어서 창에서 실제로 빠졌다.**
> §6.3.3 (a)가 "§4.3에 추가"라고 지시해 두었으나 **이 명령 블록에 반영되지 않은 채로 있었고**,
> 2026-08-27 창의 W2는 이 블록을 그대로 실행해 **3종만 떴다** (CUTOVER-LOG §W2 `[산출물]`).
> **전체 데이터 덤프로는 복원할 수 없다** — `auth` PK 충돌로 중단된다(§6.3.3).
> 빠뜨렸다면 §6.3.3 **(b)** 의 `slice-public.awk`로 잘라내는 경로가 남아 있지만 복원 시
> 한 단계가 늘어난다.

`--use-copy`는 `COPY` 문을 쓴다. 기본값인 `--column-inserts`보다 파일이 작고 복원이 빠르다 (F2·F4).

**덤프 파일을 커밋하지 않는다.** `auth.users` 전체가 들어 있다 (§4.2).
`.gitignore`에 `backup/` 규칙과 그 이유를 이 계획과 함께 반영했다 `[코드]`.
**창 전에 반영 여부를 다시 확인한다** (§7 P6) — 규칙이 없는 상태에서 덤프를 뜨면 계정 정보가
git 이력에 영구히 남을 수 있고, 그것은 되돌릴 수 없다.

```powershell
git check-ignore -v backup/    # 규칙이 출력되어야 한다
```

### 4.4 파일 검증 (4항목 전부 통과해야 W2.5로 간다)

```powershell
Get-ChildItem .\backup\prod-*-$stamp.sql | Select-Object Name, Length

# 1. 스키마 덤프에 14개 테이블이 있는가
Select-String -Path ".\backup\prod-schema-$stamp.sql" -Pattern 'CREATE TABLE' | Measure-Object -Line

# 2. GRANT·publication이 담겼는가 (F3)
Select-String -Path ".\backup\prod-schema-$stamp.sql" -Pattern '^GRANT' | Measure-Object -Line
Select-String -Path ".\backup\prod-schema-$stamp.sql" -Pattern 'ADD TABLE'

# 3. 데이터 덤프에 auth.users가 담겼는가 (F4)
Select-String -Path ".\backup\prod-data-$stamp.sql" -Pattern 'auth"?\."?users' | Select-Object -First 3

# 4. 잘리지 않았는가 — 마지막 줄 확인
Get-Content ".\backup\prod-data-$stamp.sql" -Tail 3

# 5. public 전용 덤프가 실제로 있고 auth를 담지 않는가 (2026-08-28 추가)
Test-Path ".\backup\prod-data-public-$stamp.sql"
Select-String -Path ".\backup\prod-data-public-$stamp.sql" -Pattern '^COPY "auth"' | Measure-Object -Line
```

| # | 판정 기준 |
|---|---|
| 1 | `CREATE TABLE` 14건 — 운영 `public` 테이블 14개와 일치 (`PROD-SNAPSHOT-2026-08-20.md` §9.1) |
| 2 | `GRANT` 행 수가 baseline 70행과 대조 가능. `ADD TABLE` 4행 = §1.2 실측 |
| 3 | `auth.users` COPY/INSERT 블록 존재. **덤프는 식별자를 따옴표로 감싼다** — `COPY "auth"."users" (...)` 형태이므로 `auth\.users`로 grep하면 **0건이 나온다.** 위 패턴처럼 `auth"?\."?users`로 찾는다 |
| 4 | 데이터 덤프가 `RESET ALL;`로 정상 종료. 중간에서 끊기지 않았다. **스키마 덤프에는 `RESET ALL;`이 없다** — 이 항목은 데이터 덤프에만 적용된다 |
| **5** | **`prod-data-public-$stamp.sql`이 존재하고 `auth` COPY 블록이 0개다.** 없으면 §6.3 복원의 소스가 없다 (2026-08-28 추가 — 창에서 실제로 빠졌다) |

한 항목이라도 실패하면 **W2.5·W6로 넘어가지 않는다.**

> **2026-08-27 창 실측 `[산출물]`:** 1~4는 전부 통과했다 (14 / 70 / 4 / `auth.users` 존재 /
> `RESET ALL;`). **5는 파일 자체가 없어 판정 불가였다.** 데이터 덤프의 COPY 블록은
> `auth` 22 / `public` 14 / `storage` 7이었고, `public` 14가 운영 테이블 14개와 일치했다.

### 4.5 이 절차로 백업되지 않는 것

| 대상 | 왜 |
|---|---|
| Edge Function 소스 (운영 배포본) | `db dump` 범위 밖. `target-level`은 로컬 소스도 없다 (F12) → **운영 배포본을 잃으면 복구 불가** |
| Storage 객체 바이너리 | `storage.objects` **행**은 데이터 덤프에 들어가지만 파일 본체는 아니다. `avatars` 1건 (U11) |
| `supabase_migrations` 이력 | 덤프 제외 (F4) |
| Vercel 환경변수·배포 이력 | DB 밖 |
| auth 설정(provider, JWT secret 등) | `db dump` 범위 밖 |

---

## 5. 과거 방 이력 삭제 절차 (W2.5 전문)

### 5.1 왜 하는가

Packet 13은 group 방에 다음 제약을 건다: `min_players between 3 and 8` **and**
`max_players between min_players and 8` **and** `finish_rank_limit = 3` **and** `use_items = false`
(`20260814103000:28-37` `[코드]`).

제약은 `not valid`로 추가되므로 **migration은 실패하지 않는다.** 대신 위반 행이 남아 있으면
hardening의 `validate`가 생략되고 (F15), 다음 세 가지가 따라온다
(`docs/agent/CURRENT.md` §5-2 `[문서]`):

1. 제약이 영구히 `NOT VALID`로 남는다. 재시도 migration이 없다.
2. `NOT VALID` 제약도 INSERT·UPDATE 시에는 행 단위로 강제된다 → 기존 위반 행을 갱신하는 모든 경로가 런타임 실패.
3. Packet 13 RPC는 `min_players <> 3` 또는 `max_players not between 3 and 8`인 방에서 예외를 던진다
   (`20260814103000:287,336` `[코드]`) → legacy 방은 RPC 경로에서 깨진다.

### 5.2 대상 범위 — `status <> 'waiting'`만 (조정 A2)

실측 위반은 167건이다 `[실측]`. 이 전부를 지울 필요는 없다.

`20260814113000:32-40`의 UPDATE가 **`mode='group' and status='waiting'`** 행을
`min_players=3`, `max_players=greatest(3, least(max_players,8))`, `finish_rank_limit=3`,
`use_items=false`로 **자동 정규화한다** `[코드]`. 정규화 결과는 제약을 만족한다.

따라서 **`validate`를 막는 것은 `status <> 'waiting'`인 위반 행뿐이다.**
`AGENTS.md` §4(감사 전 임의 삭제 금지·최소 범위)에 따라 삭제 범위를 여기로 좁힌다.

> `20260814103000:11-17`의 UPDATE도 group·waiting 행만 손대며, `use_items`와 duration만 바꾼다.
> `min_players`는 건드리지 않는다 — 인원 정규화는 hardening이 한다.

### 5.3 절차

#### 5.3-0 먼저 — 삭제를 건너뛰면 W6가 실패한다 (2026-08-27 실측)

**§5.1의 "migration은 실패하지 않는다"는 #9까지만 참이다.** 10번째
`20260814113000_group_final_gaps_v13_hardening`은 **자기가 붙인 `NOT VALID` 제약이 걸린 행을
스스로 UPDATE한다** — `private.reconcile_group_host_v13`가
`update public.game_rooms set host_user_id = ..., state_version = state_version + 1`을 실행한다
(`20260814113000:150-155` `[코드]`). `NOT VALID` 제약도 UPDATE에는 행 단위로 강제되므로(§5.1-2)
그 순간 `SQLSTATE 23514`로 실패하고 **9개만 적용된 채 멈춘다.**

로컬 리허설에서 재현했고, 삭제를 수행한 뒤에는 11개 전부 적용됐다 (§6.5.3 `[산출물]`).

**실패를 유발하는 것은 위반 행 전부가 아니라 `host` 참조가 끊긴 위반 행뿐이다.**
운영 SQL Editor에서 **삭제 전에** 이 값을 먼저 측정한다 — 읽기 전용이다.

```sql
-- W6 #10을 실패시키는 행 수. 0이면 삭제를 건너뛰어도 #10은 통과한다
select count(*) as w6_blocking_rows
from public.game_rooms room
where room.mode = 'group'
  and room.status <> 'waiting'
  and not (
    room.min_players between 3 and 8
    and room.max_players between room.min_players and 8
    and room.finish_rank_limit = 3
    and room.use_items = false
  )
  and (
    (room.host_user_id is null
     and exists (select 1 from public.room_players p where p.room_id = room.id))
    or
    (room.host_user_id is not null
     and not exists (select 1 from public.room_players p
                     where p.room_id = room.id and p.user_id = room.host_user_id))
  );
```

**이 쿼리는 근사가 아니라 정확하다.** 실제 `do` 블록은 `player_status <> 'retired'`로 한 번 더
거르지만 `player_status`는 #2(`20260807003609:37`)가 추가하며 기존 행을
`waiting`/`playing`/`finished` 중 하나로만 backfill한다 — **`retired`는 생기지 않는다** `[코드]`.
(`player_status` 컬럼은 W6 이전 운영에 **없으므로** 이 쿼리에서 빼는 것이 맞다.)

| 측정값 | 뜻 |
|---|---|
| `w6_blocking_rows > 0` | **삭제는 선택이 아니다.** 건너뛰면 W6가 #10에서 실패한다 |
| `w6_blocking_rows = 0` | 삭제를 건너뛰어도 W6는 통과한다. 대신 제약이 영구히 `NOT VALID`로 남는다 (§5.1의 3가지 결과). 수용 여부는 P10에서 정한다 |

**(1) 측정 — 저장소의 읽기 전용 preflight를 그대로 쓴다 (F16)**

`supabase/tests/group_final_gaps_v13_hardening_preflight.sql`을 운영 SQL Editor에서 실행한다.
status별 위반 집계와 행 목록이 나온다. 결과를 창 기록에 그대로 남긴다.
이 시점에 `waiting` 행이 몇 건인지가 삭제 범위와 자동 정규화 범위를 가른다.

**(2) CASCADE 영향 측정 — 삭제 전에 반드시**

```sql
with victims as (
  select id from public.game_rooms
  where mode = 'group'
    and status <> 'waiting'
    and not (
      min_players between 3 and 8
      and max_players between min_players and 8
      and finish_rank_limit = 3
      and use_items = false
    )
)
select
  (select count(*) from victims) as rooms,
  (select count(*) from public.room_players        t join victims v on v.id = t.room_id) as room_players,
  (select count(*) from public.room_events         t join victims v on v.id = t.room_id) as room_events,
  (select count(*) from public.group_match_results t join victims v on v.id = t.room_id) as group_match_results,
  (select count(*) from public.match_history       t join victims v on v.id = t.room_id) as match_history,
  (select count(*) from public.group_match_history t join victims v on v.id = t.room_id) as group_match_history_dangling;
```

앞의 4개 열이 **CASCADE로 함께 삭제되는 행 수**다 (F5). 마지막 열은 삭제되지 않고
**`room_id`가 가리킬 대상을 잃는 행 수**다 (F6).

**(3) 승인** — 이 수치를 보고 삭제를 승인한다. `AGENTS.md` §4·§1의 건별 승인 대상이다.

> **승인 전에 반드시 읽을 것 — 되돌림에는 시한이 있다.**
>
> 이 삭제는 W2 데이터 덤프에서 복원할 수 있지만, **그 창은 W6에서 닫힌다.**
> W6이 적용하는 `20260814093000`이 직접 쓰기 권한을 회수하고, Packet 13의 `NOT VALID` 제약이
> INSERT를 **행 단위로 강제**하기 때문이다 (§5.1-2). 삭제 대상은 정의상 그 제약을 위반하는 행이므로
> **W6 이후에는 다시 넣을 수 없다.**
>
> → **되돌리려면 W6 이전에 결정해야 한다.** W6를 지나면 이 삭제는 영구적이다. 절차는 §6.4.

**(4) 삭제**

```sql
begin;

delete from public.game_rooms
where mode = 'group'
  and status <> 'waiting'
  and not (
    min_players between 3 and 8
    and max_players between min_players and 8
    and finish_rank_limit = 3
    and use_items = false
  );

-- 남은 위반이 waiting뿐인지 같은 트랜잭션에서 확인
select status, count(*) from public.game_rooms
where mode = 'group'
  and not (
    min_players between 3 and 8
    and max_players between min_players and 8
    and finish_rank_limit = 3
    and use_items = false
  )
group by status;

commit;
```

`select` 결과가 `waiting`만 남았거나 0행이면 `commit`, 예상 밖이면 `rollback`.

**(5) 재측정** — preflight를 다시 실행해 `status <> 'waiting'` 위반이 0행인지 확인한다.

> **NULL 주의.** baseline의 `use_items`는 `NOT NULL`이 아니다 (`default true`만 있다 `[코드]`).
> `use_items IS NULL`인 행은 `use_items = false`가 NULL이 되어 위 `not (...)` 조건에 **잡히지 않고**,
> 같은 이유로 `CHECK` 제약도 위반하지 않는다(SQL의 CHECK는 NULL을 통과시킨다).
> 즉 실측 167건에 NULL 행은 포함되지 않으며, 삭제 대상도 아니고 `validate`도 막지 않는다.

### 5.4 `user_profile_stats` 별도 처리

**`user_profile_stats`는 CASCADE 대상이 아니다.** FK가 `profiles`뿐이다 (F7).
방을 지워도 누적 카운터는 그대로 남는다. 컬럼별로 결과가 다르다.

| 컬럼 | 삭제 후 상태 | 근거 |
|---|---|---|
| `group_first_count`, `group_second_count`, `group_third_count` | **정합성 유지.** Phase 2C가 이 값을 `group_match_history` **전량 재집계**로 덮어쓰고, `group_match_history`는 방 삭제로 지워지지 않는다 | F6·F8 |
| `single_success_count` | 영향 없음. `game_rooms`와 무관 | F7 |
| `multiplayer_win_count`, `multiplayer_loss_count` | **`match_history`와의 도출 관계가 끊긴다.** 카운터는 남지만 근거 행은 CASCADE로 사라진다 | F5·F7 |

**결정: 카운터를 재계산하지 않고 그대로 보존한다.** 근거 세 가지:

1. `AGENTS.md` §4 — 운영 데이터를 근거 없이 파괴적으로 변환하지 않는다.
2. 이 카운터를 재계산하는 migration·RPC가 저장소에 없다. 창 안에서 즉흥 SQL을 쓰지 않는다.
3. group 방만 지우므로 `match_history`(1:1 기록) 영향은 (2)의 측정에서 0으로 나올 가능성이 높다.
   **0이 아니면 그 수치를 보고 다시 판단한다.**

### 5.5 화면에 보이는 영향

- **1:1 전적은 `match_history`를 화면에서 라이브 카운트한다** (F9).
  (2)의 `match_history` 열이 0이 아니면 **해당 사용자의 1:1 전적 숫자가 실제로 줄어든다.**
  이는 DB 정합성 문제가 아니라 사용자 눈에 보이는 변화다. 0이 아닐 경우 삭제 승인 시 함께 판단한다.
- **그룹 전적은 `group_match_history`를 읽으므로 변하지 않는다**
  (`services/profileStatsService.js:87-91` `[코드]`, F6).
- W9 스모크 6항목에서 이 부분을 육안 확인한다.

### 5.6 되돌리기

W2 데이터 덤프에 삭제된 행이 그대로 있다. 복원 방법은 §6.4.
**단, W6 이후에는 위반 행을 되돌릴 수 없다** — §6.4의 주의 참조.

---

## 6. 롤백 절차

### 6.0 롤백 판단 기준 (P11 — 확정)

**창 중에 이 절만 펼치면 판단이 끝나도록 쓴다.** W6·W7·W9의 "실패 시" 항목이 전부 이 절을 가리킨다.

확정: 사용자 결정 2026-08-27. 등급표의 근거는 2026-08-27 로컬 복원 리허설 `[산출물]`이며 전문은 §6.5에 있다.

#### 6.0.1 확정 원칙 4가지

| # | 원칙 | 근거 |
|---|---|---|
| R1 | **W6 중간 실패 시 즉흥 수정 금지.** 실패한 migration을 창 안에서 손으로 고쳐 이어서 push하지 않는다. 수정은 로컬 재현·검증을 거쳐 **다음 창**으로 넘긴다 | 사용자 결정 (2026-08-27). 창 안에서 고치면 로컬과 운영이 영구히 갈라지고, 그 뒤로는 `db push`가 근거를 잃는다. `AGENTS.md` §3·§4(forward-only, 감사 전 변경 금지)와 같은 방향이다 |
| R2 | **시각 기준을 둔다.** §6.0.2의 게이트 3개를 쓴다 | 사용자 결정 (2026-08-27) — 창 시작 +2시간. §6.0.2에서 실측 복원 시간을 반영해 게이트를 3개로 분리했다 |
| R3 | **롤백 후 프론트는 유지보수 게이트를 켠 채 유지한다. `main`을 `e6d8eee`로 force push 하지 않는다** | 사용자 결정 (2026-08-27). 이력 보존, 실사용자 사실상 없음(최종 플레이 2026-08-04 `[실측]`). **→ §6.3의 5번 단계를 폐기한다** |
| R4 | **W6 이후 부분 롤백은 선택지가 아니다.** W6를 지난 뒤의 되돌림은 **전체 복원 하나뿐**이다 | W2.5 삭제분은 정의상 새 CHECK 제약을 위반하는 행이고, `NOT VALID` 제약도 INSERT에 **행 단위로 강제**된다 (§5.1-2). 승인 여부와 무관하게 기술적으로 불가능하다. **단 전체 복원의 실행은 승인 사안이다** — 트리거 충족은 자동 실행이 아니라 **보고 → 승인 → 실행** 순서다 (`AGENTS.md` §1) |

> **R4의 범위 주의.** "부분 롤백 불가"는 **데이터를 되돌리는 것**에 대한 서술이다.
> W6 자체의 실패는 파일 단위로 깨끗하게 멈춘다(§6.0.3 머리말) — 그 둘은 다른 이야기다.

#### 6.0.2 시각 게이트 3개

사용자 결정은 **창 시작 +2시간**이었다. 실측 복원 시간을 넣어 보니 그 한 점만으로는 판단이 서지 않는다.
**+2시간 시점의 계획 위치가 W9**이기 때문이다 (§3.3 누계: W8 종료 +103분, W9 종료 +133분).
W9 실패는 원래 롤백 트리거가 아니라 "유지보수 유지 + 조사"다 (§3.2 W9 실패 시). 즉 +2시간 단일 기준은
**롤백이 답이 아닌 구간에서 발화한다.** 그래서 **+2시간은 유지하되 뜻을 바꾸고, 앞에 게이트 2개를 세운다.**

| 게이트 | 시점 | 조건 | 행동 |
|---|---|---|---|
| **G1 — W6 진입 컷오프** | **창 시작 +60분** | 이 시점까지 **W5가 끝나지 않았다** | **W6를 시작하지 않는다.** W5에서 창을 닫는다. 손해는 창 시간·main 배포 사실·W2.5 삭제분뿐이고 운영 스키마는 한 글자도 바뀌지 않았다 (§2.2). W2.5를 했다면 §6.4로 되돌린다 |
| **G2 — 복원 창내 완료 경계** | **창 시작 +85분** | W6 실패가 **이 시점 이후**에 확정됐다 | **복원을 창 밖으로 넘긴다.** 유지보수 게이트를 **켠 채** 창을 닫고, 증거 보존·보고·승인·복원을 창 밖에서 진행한다. 근거: 전체 복원에 **최대 34분**이 든다 `[추정]` (§6.0.4) → +85분을 넘기면 +2시간 안에 끝나지 않는다. **이것은 실패가 아니라 예정된 경로다 — §6.0.2-1 참조** |
| **G3 — 서비스 재개 포기 시점** | **창 시작 +120분 (= 사용자 결정 +2시간)** | W10이 아직 수행되지 않았다 | **재개를 포기한다.** 유지보수 게이트를 **켠 채** 창을 닫고, W9 잔여 항목과 W10을 창 밖으로 넘긴다. DB는 이미 신버전이므로 구버전 프론트로 되돌리지 않는다 (§3.2 W10 실패 시) |

**G1이 +60분인 이유:** §3.3 상한 누계로 W5 종료가 +58분이다. +60분은 계획 경계 그 자체이며 여유를
얹은 값이 아니다. 이 시점에 W5에 못 갔다면 이미 계획 밖이고, 그 상태로 **되돌릴 수 없는 지점을
넘을 이유가 없다.**

**G2가 +85분인 이유:** +120분 − 복원 상한 34분 = +86분 → 안전하게 **+85분**으로 둔다.
34분의 내역은 §6.0.4에 있다. 계획상 W6 종료가 +78분이므로 **여유는 7분이다.**

##### 6.0.2-1 G2를 넘는 것은 실패가 아니다

**G2와 G3는 같은 성격의 게이트다.** 둘 다 "창 안에서 못 끝낸다"를 확인하고
**유지보수 게이트를 켠 채 나머지를 창 밖으로 넘기는** 지점이다. 넘기는 대상만 다르다 —
G2는 **복원**을, G3는 **서비스 재개**를 넘긴다. **어느 쪽도 사고가 아니라 예정된 경로다.**

근거 두 가지:

1. **롤백 후 프론트는 유지보수 게이트를 켠 채 유지한다** (R3, 사용자 결정 2026-08-27).
   즉 복원이 끝날 때까지 사용자에게 보이는 것은 점검 화면이고, 그 상태는 창 안이든 밖이든 같다.
   **복원을 창 밖으로 넘긴다고 해서 나빠지는 것이 없다.**
2. **점검 화면 연장 비용이 사실상 0이다.** 운영 최종 플레이가 **2026-08-04** `[실측]`이다.
   창 시점까지 3주 이상 무플레이이므로 점검 화면이 몇 시간 더 걸려 있어도 영향받는 사용자가 없다.
   U1(다운타임 허용)이 선 근거와 같다.

> **7분은 벼랑이 아니라 경계선이다.** W6가 상한(20분)까지 걸려 G2까지 7분만 남는 상황은
> **정상 시나리오 안에 있다.** 이때 창 안에서 복원을 끝내려고 서두르는 것이
> **복원을 창 밖으로 넘기는 것보다 위험하다** — 증거 보존(§6.0.5의 4가지)과 승인 절차(R4)를
> 압박 속에서 건너뛰게 되고, 그것이 §6.0.1 R1이 금지한 "창 안 즉흥 판단"으로 이어진다.
> **G2를 넘겼다면 서두르지 말고 넘긴다.**

**따라서 G2 이후의 행동은 단일하다** — (a)/(b) 중 고르는 것이 아니라
**게이트를 켠 채 창을 닫고 복원을 창 밖에서 수행한다.**
창을 연장해서라도 창 안에 끝내야 할 근거는 위 2가지에 비춰 존재하지 않는다.
예외는 사용자가 그 시점에 명시적으로 연장을 지시하는 경우뿐이며, 그것은 새 결정이다.

> **G1~G3은 시계일 뿐 트리거가 아니다.** 무엇을 근거로 롤백하는지는 §6.0.3의 등급표가 정한다.
> 시계와 등급이 충돌하면(예: +50분에 W6 #7 실패) **등급이 우선한다.**
> 시계는 **언제까지 창 안에서 하는가**만 정하고, 등급은 **무엇을 하는가**를 정한다.

##### 6.0.2-2 창을 분할하면 T0를 재설정한다 (2026-08-28 추가)

**2026-08-27~28 창은 2세션으로 분할됐다** (세션 1 = W0~W2.5 / 세션 2 = W3~W9, 간격 약 20시간).
§3.3은 단일 연속 창을 전제하므로 이 상황의 T0 처리가 정의돼 있지 않았다. **창에서 내린 판단을
규칙으로 승격한다** `[사용자 결정, 2026-08-28]`:

> **창을 분할하면 원 T0를 무효화하고, 되돌릴 수 없는 지점을 포함한 세션의 W6 시작 시각을
> 새 T0로 삼는다.**

근거: **게이트가 재는 것은 "창 안에서 되돌릴 시간이 남았는가"이지 달력 시간이 아니다.**
원 T0를 유지하면 `+60/+85/+120분`이 세션 2 시작 시점에 이미 전부 지나 있어 세 게이트가 동시에
발화하고, 그것은 게이트가 의도한 판정이 아니다.

**부작용 하나를 알고 쓴다 — G1이 무력해진다.** G1은 "T0+60분까지 W5가 안 끝났으면 W6를 시작하지
마라"인데, T0를 W6 시작으로 잡으면 **G1은 정의상 언제나 충족된다.** 2026-08-27~28 창에서 실제로
그랬다. **G1의 보호를 유지하려면 분할 시 세션 2의 시작(W3 진입)을 별도로 적어 두고
"W3 진입 → W6 시작"이 60분을 넘지 않는지 사람이 본다.** G2·G3는 W6 이후를 재므로 영향받지 않는다.

#### 6.0.3 단계별 트리거 등급표

등급은 3개다.

| 등급 | 뜻 | 행동 |
|---|---|---|
| **롤백** | 전체 복원을 **제안한다** | 즉시 진행을 멈추고 증거를 보존한 뒤 **보고 → 승인 → §6.3 실행** (R4) |
| **판단** | 자동으로 정해지지 않는다 | 멈추고 §6.0.5의 판단 입력 4가지를 채워 보고한다. 승인 없이 전진도 복원도 하지 않는다 |
| **롤백 아님** | 창을 계속한다 | 기록에만 남긴다 |

##### W6 — `db push --linked` 실패 위치별

**전제 (2026-08-27 실측 `[산출물]`): `db push`는 migration 파일 하나를 원자적으로 적용한다.**
11개 중 10개는 파일 안에 `begin;`/`commit;`이 있고 `20260814093000_server_authority_cutover_v2`
**하나만 없다** `[코드]`. 그럼에도 begin/commit이 없는 파일로 프로브를 돌린 결과
**실패 앞 문장까지 전부 롤백됐다** — CLI가 파일 단위 트랜잭션을 보장한다 `[산출물]`.
→ **적용 경계는 항상 깨끗한 파일 경계다.** "반쯤 적용된 파일"이라는 상태는 없다.
따라서 등급은 **실패한 파일 번호만으로** 정해진다.

| 실패 위치 | 파일 | 등급 | 근거 |
|---|---|---|---|
| **#1~#3** | `20260804004535` phase1<br>`20260807003609` phase2a<br>`20260813072952` phase2c | **롤백** | 이 3개는 **운영이 baseline과 같다는 전제 위에서만** 성립한다. 실패는 그 전제(4개 축 차이 0건, §5.1-1)가 깨졌다는 뜻이므로 이후 8개의 성공 예측이 전부 무효가 된다. 계속 밀어붙일 근거가 없다 |
| **#4~#6** | `20260814090000` server_authority_v2<br>`20260814091000` server_authority_rpc_v2<br>`20260814092000` duel_authority_v2 | **판단** | 이 3개는 **추가만 한다** — 새 테이블·새 함수. 삭제·권한 회수가 없다. 실패 시 DB는 "baseline + 일부 신규 객체"이고 legacy RPC가 **살아 있다.** 되돌리지 않고 창을 닫아도 운영은 구버전 계약대로 동작한다. 복원과 전진 중 어느 쪽도 강제되지 않는다 |
| **#7** | `20260814093000` server_authority_cutover_v2 | **롤백** | **유일한 파괴적 migration이다** — legacy RPC `finish_group_player`·`update_group_progress`를 DROP하고 `anon`·`authenticated` 직접 쓰기를 REVOKE한다 (§2.1-2). 원자성이 보장되므로 실패해도 효과는 남지 않지만, **이 파일이 실패했다는 것 자체가 운영 권한 상태가 예상과 다르다는 신호**다. 뒤의 4개(#8~#11)는 전부 이 cutover가 성립한 뒤를 가정한다 |
| **#8~#9** | `20260814094000` duel_item_authority_v2<br>`20260814103000` group_final_gaps_v13 | **판단** | #7이 이미 성공했으므로 legacy RPC는 사라졌고 **구버전 계약으로 되돌아갈 수 없다.** 그러나 신규 RPC 계약은 #7까지로 이미 성립한다. 남은 것은 Packet 13 기능이다. "복원" vs "기능 일부 없이 개방" 판단 |
| **#10** | `20260814113000` group_final_gaps_v13_hardening | **판단** | **W2.5를 건너뛰면 여기서 실패한다** — 2026-08-27 실측으로 재현했다 (§6.5-3). 실패 시 상태는 `NOT VALID` 제약 1개만 존재, `game_rooms_non_group_host_required_v13_check` 부재, host 정합성 보정 미수행. **원인이 "W2.5 미수행"으로 확인되면 복원이 아니라 창을 닫고 다음 창에서 W2.5부터 다시 하는 쪽이 싸다** — #1~#9는 재적용할 필요가 없다 |
| **#11** | `20260814123000` group_spectator_emoji_atomicity_fix | **롤백 아님** | 관전 이모티콘 원자성 보정 하나다. 없어도 나머지 전부가 동작한다. 창을 닫고 다음 창에서 이 1개만 적용한다 |

> **사용자 초안 대비 변경 2건과 근거**
>
> 1. 초안은 "4~11번 실패 → 판단"이었다. **#7을 판단에서 롤백으로 올린다.** #7만이 파괴적이고
>    (DROP FUNCTION + REVOKE), #8 이후 전부가 #7 성립을 전제하기 때문이다 (§2.1-2 `[코드]`).
> 2. 초안은 #11도 판단이었다. **#11을 롤백 아님으로 내린다.** 단일 기능 보정이고 다른 파일과
>    의존이 없다 (`20260814123000` `[코드]`).
>
> 또한 초안이 전제한 "부분 적용 범위 확인"은 **파일 경계로 확정된다** — 위 원자성 실측 덕분에
> 창 안에서 범위를 추정할 일이 없다. 확인 명령은 `npx supabase migration list --linked` 하나다.

##### W7 — 적용 결과 검증, 불일치 항목별

| 불일치 | 등급 | 근거 |
|---|---|---|
| **`public` 함수 수 ≠ 36** | **롤백** | `db push`가 exit 0인데 함수 수가 다르면 W6 성공 판정 자체가 거짓이다. 어떤 파일이 어디까지 반영됐는지 알 수 없다는 뜻이므로 W6 등급표로는 판단할 수 없다 |
| **legacy RPC 2개가 `null`이 아니다** | **롤백** | #7이 반영되지 않았는데 이력에는 적용으로 남아 있다는 뜻이다. 위와 같은 사유 |
| **RLS 불일치** (`group_match_history`·`user_profile_stats`가 `true`가 아니다) | **롤백** | Phase 2C(`20260813072952:765-766` `[코드]`)가 반영되지 않았다는 뜻이다. 이 두 테이블은 잠금 전까지 **정책 없이 노출된다** |
| **제약이 존재하지 않는다** (`game_rooms_group_limits_v13_check` 또는 `game_rooms_non_group_host_required_v13_check` 부재) | **롤백** | #9 또는 #10 미반영. 위와 같은 사유 |
| **`convalidated = false`** (제약은 있으나 validate 안 됨) | **판단** | 초안은 "롤백 아님(예상된 상태)"이었다. **수정 제안:** W2.5를 수행했다면 `true`가 정상이다 — 2026-08-27 리허설에서 W2.5 후 두 제약 모두 `convalidated = t`였다 `[산출물]`. 따라서 `false`는 **W2.5가 위반 행을 다 걷어내지 못했다는 신호**이지 예상 상태가 아니다. 다만 기능은 동작하므로(신규 행은 계속 강제된다) 롤백은 아니다. **W2.5를 의도적으로 건너뛴 경우에만 "롤백 아님, 예상된 상태"다** |
| **publication 멤버십 불일치** | **판단** | 초안 유지. 멤버십은 migration이 바꾸지 않는다 — 2026-08-27 리허설에서 W6 전후 모두 4개로 동일했다 `[산출물]`. 불일치는 migration 밖 원인을 뜻하므로 원인 규명 전에는 등급이 정해지지 않는다. 증상은 Realtime 미전달이며 DB 정합성 문제가 아니다 |
| **`group_spectator_emoji_rate_limits`가 publication에 있다** | **롤백 아님** | 의도적 미등록이다 (`20260814103000:41-43` 주석 `[코드]`). 있으면 기록에 남기고 창 밖에서 제거한다 |
| **이력 행 ≠ 12** | **판단** | 12보다 적으면 부분 적용 → W6 등급표로 간다. 많으면 다른 경로로 들어온 이력이므로 §1.2 전제가 깨진다 |

##### W9 — 바이패스 스모크 실패 항목별

**대전제: W9 실패는 기본적으로 롤백 트리거가 아니다.** 유지보수 게이트가 켜져 있어 사용자 영향이 0이고,
W9가 보는 것은 프론트·Edge Function·RPC 호출 경로다. **DB를 되돌려도 고쳐지지 않는 층이 대부분이다.**
§3.2 W9의 "실패 시"(W10을 하지 않고 유지보수 상태를 유지한 채 조사)가 모든 항목의 기본값이다.

| 실패 항목 | 등급 | 근거 |
|---|---|---|
| **싱글 플레이 불가** | **판단** | 초안은 롤백이었다. **수정 제안:** 싱글 경로는 `single-run` Edge Function(W8)과 `create_single_game_run`·`apply_single_move_v2`(W6)에 걸쳐 있다. **원인이 W8이면 재배포로 끝나고 DB 복원은 무관하다** (§3.2 W8 실패 시). 원인을 W7 축으로 좁힌 뒤에야 등급이 정해진다 |
| **그룹 방 생성·참가 불가** | **판단** | 초안은 롤백이었다. **수정 제안:** 같은 이유에 더해, 이 경로의 대표적 실패 원인이 **Packet 13 제약 위반**이고 그것은 §5.3 삭제 범위 문제이지 복원 대상이 아니다. `20260814103000:287,336`은 `min_players <> 3` 등에서 예외를 던진다 `[코드]` — 신규 방이 이걸 밟으면 RPC 인자 문제이지 DB 파손이 아니다 |
| **관전·이모티콘 불가** | **롤백 아님** | 초안은 판단이었다. **수정 제안:** `20260814123000`(#11) 하나에 대응하는 기능이고 다른 경로와 의존이 없다. W6 등급표에서 #11을 "롤백 아님"으로 둔 것과 같은 근거로 내린다 |
| **스타일 깨짐** | **롤백 아님** | 초안 유지. 운영 DB와 무관하다. §3.2 W1-4의 CSS 비동기 청크 항목과 같은 사안이며 기록 대상이다 |
| **권한 거부 경로에서 연결이 끊긴다 (SIGSEGV 의심)** | **판단** | 초안에 없던 항목. U6의 관측 대상이 실제로 나타난 경우다 (§9). 복원해도 재현될 수 있으므로(운영 런타임 문제이지 스키마 문제가 아니다) 자동 롤백이 아니다. §8.2-1의 사후 관측으로 넘긴다 |

#### 6.0.4 전체 복원에 드는 시간

로컬 리허설 실측이 앵커다. 운영 값은 전부 `[추정]`이며 근거는 §6.5-5에 있다.

| 항목 | 로컬 실측 `[산출물]` | 운영 `[추정]` |
|---|---|---|
| 증거 보존 + 적용 경계 확정 (W6 실패 시 (1)(2)) | — | 5분 |
| 보고 → 승인 (R4) | — | **사용자 의존.** 최소 5분으로 잡는다 |
| §6.3-2 비우기 SQL | **0.45초** | 1~3분 |
| §6.3-3 스키마 덤프 복원 | **1.09초** | 2~5분 |
| §6.3-3 데이터 덤프 복원 (public 전용) | **0.45초** | 1~3분 |
| §6.3-4 `migration repair` | **2.41초** | 2~3분 |
| 복원 검증 (W7 쿼리 재실행) | — | 10분 |
| **합계** | **약 4.4초** (DB 작업만) | **26~34분** |

**핵심: 복원 자체는 병목이 아니다.** DB 작업은 로컬에서 5초 미만이고, 운영에서 수십 배 느려져도
분 단위다. **시간을 쓰는 것은 보고·승인·검증이다** — 26~34분 중 DB 작업은 6~14분뿐이다.

#### 6.0.5 "판단" 등급에서 보고할 입력 4가지

판단 등급에서는 아래를 채워 보고한다. 창 안에서 추측으로 채우지 않는다 (`AGENTS.md` §5).

1. **적용 경계** — `npx supabase migration list --linked` 출력 전문. 파일 경계로 확정된다 (§6.0.3 머리말).
2. **실패 전문** — 실패 파일명, SQLSTATE, `At statement: N`, 에러 메시지 전문.
3. **현재 운영 상태** — §3.2 W7의 6개 쿼리 결과. 함수 수·legacy RPC·제약·RLS·publication·이력.
4. **경과 시각** — 창 시작으로부터 몇 분인지. §6.0.2의 어느 게이트 구간인지.

#### 6.0.6 이 절이 바꾼 기존 서술

| 위치 | 기존 | 변경 |
|---|---|---|
| §3.2 W6 "실패 시" (3) | "복원과 전진(보정 migration 추가) 중 어느 쪽인지 결정" | **전진 = 창 안 즉흥 보정은 금지다 (R1).** 선택지는 "복원" 또는 "창을 닫고 다음 창"이다 |
| §3.2 W2.5 "실패 시" | "삭제를 하지 않고 W6로 갈 수 있다 — migration은 실패하지 않는다 (F15)" | **틀렸다. §5.3-0 참조** — 삭제를 건너뛰면 #10이 실패한다 (2026-08-27 실측) |
| §6.3 5번 단계 | "`main`을 `e6d8eee`로 되돌리고(force push) 유지보수 게이트를 해제한다" | **폐기 (R3).** 게이트를 켠 채 유지하고 force push 하지 않는다 |
| §3.3 "남은 압축 여지는 W9뿐" | W9 축소 판단을 P11 합의에 포함 | **G3(+120분)로 대체한다.** 창 안에서 W9를 축소할지 고민하지 않고, +120분에 W10을 포기하고 남은 것을 창 밖으로 넘긴다 |

### 6.1 원칙 — 덤프 복원이 유일한 수단이다

- **down migration이 존재하지 않는다.** 11개 파일 전부 forward-only다
  (`AGENTS.md` §4, `code/18-...md` §롤백 주의사항 `[문서]`).
- **PITR이 없다** (§4.1).
- **`npx supabase db reset --linked`를 롤백에 쓰지 않는다.** 이 명령은 대상 DB를 **로컬 migration 기준으로
  재생성**한다 (`db reset --help` `[산출물]`). 데이터를 지우면서도 되돌리려는 상태로 가지 않는다.
- **구버전 프론트로 되돌리는 것은 롤백이 아니다.** W6 이후에는 legacy RPC가 삭제돼 있어 구버전이 깨진다.

**이 절 전체가 하나의 도구 전제 위에 서 있다 — `psql`을 실행할 수 있어야 한다.**
이 머신에는 `psql`이 설치돼 있지 않고, 확정 경로는 **Docker 컨테이너의 `psql`**이다 (§6.3.0 A안).
따라서 **§6의 모든 복원 절차(§6.3 전체 복원, §6.4 W2.5 삭제분 복원)는 다음을 함께 요구한다:**

| 전제 | 확인 | 없으면 |
|---|---|---|
| **Docker 데몬이 동작 중** | `docker version` | **복원 수단이 없다.** §6.3.0-4에 대안이 없음을 적었다 |
| **승인 이미지가 로컬에 있음** | `docker images public.ecr.aws/supabase/postgres:17.6.1.158` | `docker run`이 pull을 시도한다 — 네트워크와 시간이 든다 |
| **연결 문자열이 IPv4로 해석됨** | §6.3.0-1의 확인 명령 | 컨테이너에 IPv6가 없어 접속되지 않는다 |

**세 가지 모두 P14로 창 전에 확인한다** (§7). **로컬 Supabase 스택이 떠 있을 필요는 없다** —
A안은 `docker run`이라 스택과 무관하다. 스택이 떠 있으면 B안(`docker exec`)도 쓸 수 있지만
결과는 같다.

> **왜 이것이 §6.1에 있는가.** 되돌릴 수 없는 지점(W6)을 넘는 판단은 "되돌릴 수단이 있다"를
> 전제한다. 그 수단이 도구 하나에 걸려 있고 그 도구가 기본 설치가 아니라면, **그 사실은 롤백
> 절차의 세부가 아니라 원칙 자리에 있어야 한다.**

### 6.2 W6 이전 중단

§2.2 표 그대로. 스키마 무변경이므로 복원할 것이 없다.
W2.5를 이미 했다면 §6.4로 해당 행만 복원한다.

### 6.3 W6 이후 — 전체 복원

이것은 **최후 수단**이며, 실행하면 창 중 들어온 모든 쓰기가 사라진다.
실행 조건과 등급은 §6.0이 정한다. **트리거 충족은 자동 실행이 아니다 — 보고 → 승인 → 실행이다** (R4).

**이 절차는 2026-08-27에 로컬 스택에서 리허설했다.** 아래 SQL·순서·시간은 그 실측 결과다.
리허설 전문·한계는 §6.5에 있다.

#### 6.3.1 순서

| # | 단계 | 명령 | 로컬 실측 `[산출물]` |
|---|---|---|---|
| 1 | 유지보수 게이트가 켜져 있는지 확인 (또는 다시 켠다) | Vercel `VITE_MAINTENANCE=true` + 재배포 (F11) | — |
| 2 | **복원 대상 스키마 비우기** | §6.3.2의 SQL | **0.45초** |
| 3a | **스키마 덤프 복원** | `psql -v ON_ERROR_STOP=1 -f prod-schema-<stamp>.sql` | **1.09초** |
| 3b | **데이터 덤프 복원 — `public`만** | §6.3.3 참조. `psql -v ON_ERROR_STOP=1 -f prod-data-public-<stamp>.sql` | **0.45초** |
| 4 | migration 이력 재기록 | `npx supabase migration repair --status applied 20260730170602 --linked` | **2.41초** |
| 5 | ~~`main`을 `e6d8eee`로 force push~~ | **폐기 (R3)** — 게이트를 켠 채 유지한다 | — |
| 6 | Edge Function은 되돌리지 않는다 | `--prune`을 쓰지 않았으므로 `target-level`은 그대로 있다 (W8) | — |
| 7 | **복원 검증** | §3.2 W7의 6개 쿼리를 다시 돌려 baseline 값(테이블 14 / 함수 7 / 이력 1행)과 대조 | — |

3a → 3b **순서를 바꾸지 않는다.** 데이터 덤프는 `SET session_replication_role = replica;`로
시작해 트리거·FK 검사를 끈 상태를 전제한다 `[산출물]`. 로컬 `postgres` 롤이 이 설정을 바꿀 수
있음은 확인했다 `[산출물]`. 운영의 관리형 `postgres` 롤도 같은지는 **확인 필요** — 다만 이 문장은
CLI가 만든 덤프 자신의 첫 줄이므로 Supabase가 상정한 복원 경로다 `[외부]`.

#### 6.3.0 실행 도구 — **확정 (P14, 2026-08-27)**

**`psql`은 이 머신에 설치돼 있지 않다** (PowerShell `Get-Command psql` → 없음. `pg_dump`·`pg_restore`도
없다. 2026-08-27 `[산출물]`). 대신 **Docker 컨테이너의 `psql`을 쓴다.** 아래 A안이 확정 경로다.

##### A안 (확정) — `docker run`으로 일회성 `psql`

```powershell
# <CONN> = 운영 연결 문자열. 자격 정보이므로 문서·창 기록·커밋에 적지 않는다 (§6.3.0-2)
$IMG = 'public.ecr.aws/supabase/postgres:17.6.1.158'

docker run --rm -i --entrypoint psql $IMG "<CONN>" -v ON_ERROR_STOP=1 -f - < .\docs\ops\wipe-public.sql
```

- **`--entrypoint psql`이 필수다.** 이 이미지의 기본 entrypoint는 Postgres 서버 기동이다.
- **`-f -`로 stdin에서 읽는다.** 파일을 컨테이너에 복사하거나 마운트할 필요가 없다.
- **`-v ON_ERROR_STOP=1`을 반드시 붙인다.** 없으면 오류를 넘기고 계속 진행해 **부분 복원으로
  끝나고, 그것이 성공처럼 보인다.**
- 이미지는 **CODE GO 승인 이미지와 같은 것**이고 이미 로컬에 있다 — 새로 내려받지 않는다.
  `docker images`로 확인된다 `[산출물]`. 없으면 `docker run`이 pull을 시도하므로 네트워크가 필요하다.
- **로컬 Supabase 스택이 꺼져 있어도 동작한다.** Docker 데몬과 이미지만 있으면 된다.
  2026-08-27 검증: 스택을 건드리지 않고 `docker run … psql`로 쿼리가 실행됐다 `[산출물]`.

##### B안 (동등) — 스택이 떠 있으면 `docker exec`

```powershell
docker exec -i supabase_db_wiki-packet13-r2-clean158 psql "<CONN>" -v ON_ERROR_STOP=1 -f - < .\docs\ops\wipe-public.sql
```

- 컨테이너 이름은 `npx supabase status`로 확인한다. 프로젝트는 `wiki-packet13-r2-clean158`이다.
- **A안보다 전제가 하나 많다** (스택이 up이어야 한다). 결과는 같으므로 **A안을 기본으로 쓴다.**

##### C안 — `psql`을 설치한다

PostgreSQL 클라이언트를 PATH에 넣으면 `psql "<CONN>" -v ON_ERROR_STOP=1 -f <파일>` 형태가 그대로
동작한다. **설치는 창 밖에서 한다.** 창 안에서 설치하지 않는다.

##### 6.3.0-1 **연결 문자열은 IPv4로 해석돼야 한다**

**컨테이너에 IPv6가 없다.** 2026-08-27 실측 `[산출물]`:

| 확인 | 결과 |
|---|---|
| 컨테이너 IPv6 주소 | `inet6 ::1/128 scope host` **하나뿐** — 전역 주소 없음 |
| Docker bridge 네트워크 | `EnableIPv6 = false` |
| `curl -6` 외부 접속 | **실패** (exit 6) |
| `curl -4` 외부 접속 | 성공 (exit 0) |
| `nc 1.1.1.1 443` | 연결됨 → **IPv4 TCP egress 정상** (대조군 `192.0.2.1`은 실패) |

→ **IPv6로만 해석되는 호스트에는 연결할 수 없다.** A안·B안 모두 같은 bridge를 쓰므로 동일하다.

**연결 문자열을 어디서 얻는가:** Supabase 대시보드 → **Project Settings → Database →
Connection string**. 여기에는 **여러 형태가 제시된다** (direct connection / connection pooling 등).
어느 것이 IPv4로 해석되는지는 플랫폼 속성이며 이 저장소에서 확인되지 않는다 `[외부]`.
**따라서 값을 고른 뒤 아래로 직접 확인한다** — P14의 판정 항목이다.

```powershell
# 창 전에 한 번. 읽기 전용이며 스키마를 건드리지 않는다
docker run --rm -i --entrypoint psql $IMG "<CONN>" -v ON_ERROR_STOP=1 -c "select 1 as connectivity_ok;"
```

- `1`이 돌아오면 그 문자열로 §6.3을 실행할 수 있다.
- 연결이 안 되면 **다른 형태의 문자열을 고른다** (pooler 계열이 IPv4를 제공하는 경우가 많다 `[외부]`).
  그래도 안 되면 C안(로컬 설치)으로 간다 — 호스트에는 IPv6가 있을 수 있다.
- **이 확인을 창 안으로 미루지 않는다.** W6가 실패한 시점에 연결 문자열을 고르기 시작하면
  G2(+85분)를 그냥 넘긴다.

##### 6.3.0-2 자격 정보 취급

- **연결 문자열을 이 문서, `CUTOVER-LOG-YYYY-MM-DD.md`, 커밋 메시지에 적지 않는다.**
- 명령 인자로 넘기므로 **PowerShell 히스토리와 `docker` 프로세스 인자에 남는다.**
  창이 끝나면 히스토리를 정리한다 (`(Get-PSReadlineOption).HistorySavePath`의 파일).
- 창 기록에는 "연결 확인됨 / 사용한 문자열 형태(direct 또는 pooler)"만 적는다.
- 근거: `AGENTS.md` §5의 식별자 비기재 원칙과 같은 방향이다.

##### 6.3.0-3 리허설이 쓴 명령과의 차이

**전달 방식은 같고 접속 대상만 다르다.**

| 축 | 리허설 (2026-08-27, §6.5) | 운영 (§6.3) |
|---|---|---|
| 실행 방식 | `docker exec -i <컨테이너> psql` | **`docker run --rm -i --entrypoint psql <이미지>`** (A안) |
| 접속 인자 | `-U postgres -d postgres` (컨테이너 자신의 DB) | **`"<CONN>"` 연결 문자열** |
| 파일 전달 | `-f -` + stdin 리다이렉트 | **동일** |
| 오류 중단 | `-v ON_ERROR_STOP=1` | **동일** |

**따라서 리허설이 검증한 것은 "파일을 stdin으로 psql에 밀어 넣어 실행하는 경로"까지다.**
`"<CONN>"` 형태가 동작하는 것은 별도로 확인했다 — 컨테이너 psql에 URI를 주고
stdin 파이프까지 함께 테스트해 통과했다 (로컬 대상, 2026-08-27 `[산출물]`).
**운영 호스트로의 실제 접속은 §6.3.0-1의 확인 명령으로 창 전에 사용자가 검증한다.**

##### 6.3.0-4 Docker도 `psql`도 없다면 — **대안이 없다**

검토했고, **성립하는 차선책이 없다.** 추측으로 만들지 않고 사실만 적는다.

| 후보 | 판정 | 근거 |
|---|---|---|
| **Studio SQL Editor로 전체 복원** | **불가** | 데이터 덤프가 `COPY "public"."x" (...) FROM stdin;` + 데이터 + `\.` 형태다 (`--use-copy`). **`COPY … FROM stdin`은 클라이언트 프로토콜 연산이라 웹 SQL 에디터가 스트림을 공급할 수 없다.** 스키마 덤프(41KB)는 붙여넣기가 이론상 가능하지만 데이터는 원리적으로 불가능하다 |
| 데이터 덤프를 `--use-copy` 없이 다시 뜬다 (INSERT 형태) | **불가** | 되돌려야 하는 시점에는 이미 W6가 적용돼 있다. **그 시점의 DB에서 다시 뜬 덤프는 되돌리려는 상태가 아니다.** W2 시점 덤프만이 복원 소스다 |
| `npx supabase db reset --linked` | **금지** | 로컬 migration 기준으로 재생성한다 — 되돌리려는 상태로 가지 않는다 (§6.1) |
| 스키마 덤프를 migration 파일로 만들어 `db push` | **채택하지 않는다** | 이력을 오염시키고 `AGENTS.md` §4의 append-only 원칙을 깬다. 데이터 복원 문제도 해결하지 못한다 |
| Supabase 자동 일일 백업 | **미확인** | 무료 요금제의 보존·복원 가능 여부가 이 저장소에서 확인되지 않았다 (§4.1). **복원 수단으로 계산에 넣지 않는다** |

→ **Docker와 `psql` 둘 다 없으면 §6.3을 실행할 수 없다.** 그래서 P14가 창 전 조건이다.
**되돌릴 수 없는 지점(W6)을 넘기 전에 되돌릴 수단이 준비돼 있어야 한다.**

#### 6.3.1-0 `wipe-public.sql`은 **리허설 실행이 불가능하다**

`docs/ops/wipe-public.sql`은 **파일 안에 자체 `begin;`과 `commit;`을 갖고 있다** (§6.3.2).
따라서 **바깥에서 트랜잭션으로 감싸도 보호되지 않는다.**

```powershell
# 이렇게 하면 안전하지 않다 — 파일 안의 commit; 이 먼저 실행되어 drop이 확정된다
# begin;  <파일 내용>  rollback;   ← rollback 할 트랜잭션이 이미 없다
```

2026-08-27에 이 방식으로 "구문만 검사"하려다 **로컬 public 스키마가 실제로 비워졌다** `[산출물]`.
`WARNING: there is already a transaction in progress` → 파일의 `commit;` 실행 →
`WARNING: there is no transaction in progress`로 끝났고, 21테이블·36함수가 사라졌다.
(로컬은 §6.5의 안전 백업으로 복원했고 지문이 일치했다.)

→ **이 파일은 실행하면 실행된다. 시험 실행이라는 것은 없다.**
확인이 필요하면 **§6.3.2의 `[1] 사전 확인` 세 쿼리만 따로 떼어** 돌린다 — 그 부분은 읽기 전용이다.
운영에서 이 파일을 돌리는 것은 **롤백이 승인된 뒤 단 한 번**이다 (R4).

#### 6.3.2 확정된 비우기 SQL (2단계)

**파일: [`docs/ops/wipe-public.sql`](wipe-public.sql)** — 아래 내용과 동일하다.
창 안에서는 문서에서 복사하지 말고 **파일을 그대로 쓴다.**

**실행 명령 (§6.3.0 A안):**

```powershell
$IMG = 'public.ecr.aws/supabase/postgres:17.6.1.158'
docker run --rm -i --entrypoint psql $IMG "<CONN>" -v ON_ERROR_STOP=1 -f - < .\docs\ops\wipe-public.sql
```

> **한 번만 실행한다.** 이 파일은 자체 `commit;`을 갖고 있어 시험 실행이 없다 (§6.3.1-0).
> 미리 보고 싶으면 아래 `[1] 사전 확인` 세 쿼리만 떼어 `-c`로 돌린다 — 그 부분은 읽기 전용이다.

리허설에서 **post-W6 상태(테이블 21 / `public` 함수 36 / `private` 함수 10)에 두 번 실행해
둘 다 잔존 객체 0으로 끝났다** `[산출물]`.

```sql
-- ============================================================================
-- CUTOVER-PLAN §6.3 2단계 — 복원 대상 스키마 비우기
-- 실행 (§6.3.0 A안 — psql은 이 머신에 설치돼 있지 않다. Docker 이미지의 psql을 쓴다):
--   docker run --rm -i --entrypoint psql public.ecr.aws/supabase/postgres:17.6.1.158 "<CONN>" \
--     -v ON_ERROR_STOP=1 -f - < docs/ops/wipe-public.sql
-- 주의: 이 파일은 자체 begin;/commit;을 갖는다. 바깥에서 감싸도 롤백되지 않는다 (§6.3.1-0)
-- 전제: 이 SQL 직후에 W2 스키마 덤프 → 데이터 덤프(public 전용)를 복원한다
-- ============================================================================

\set ON_ERROR_STOP on

-- [1] 사전 확인 — 무엇이 사라지는지 눈으로 본 뒤 진행한다
select n.nspname as schema,
       count(*) filter (where c.relkind = 'r') as tables,
       count(*) filter (where c.relkind = 'v') as views
from pg_namespace n left join pg_class c on c.relnamespace = n.oid
where n.nspname in ('public', 'private') group by 1 order by 1;

select n.nspname as schema, count(*) as functions
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'private') group by 1 order by 1;

select count(*) as migration_history_rows from supabase_migrations.schema_migrations;

-- [2] 비우기
begin;

-- public: 덤프가 CREATE SCHEMA를 내지 않으므로 여기서 다시 만든다
drop schema if exists public cascade;

-- private: 20260813072952(Phase 2C)가 만드는 스키마다. public을 cascade drop해도
-- public 객체를 참조하지 않는 함수는 살아남는다 (로컬 실측: 10개 중 7개 잔존).
-- 스키마 덤프는 private를 제외 목록에 넣지 않으므로 CREATE SCHEMA IF NOT EXISTS "private"와
-- 함수 전체를 담는다 → 여기서 지우고 덤프가 복원하게 둔다.
drop schema if exists private cascade;

create schema public;
-- 덤프가 담지 않는 스키마 수준 속성 2가지를 여기서 복원한다.
--   owner : 덤프에 ALTER SCHEMA "public" OWNER TO 가 없다
--   PUBLIC 롤 USAGE : 덤프의 GRANT는 postgres/anon/authenticated/service_role 4개뿐이다
-- (COMMENT ON SCHEMA "public"과 ALTER DEFAULT PRIVILEGES 12행은 덤프가 담는다)
alter schema public owner to pg_database_owner;
grant usage on schema public to public;

-- migration 이력: 어느 덤프에도 없다 (§4.2-2). 비워야 복원 후 repair가 baseline 한 행만 남긴다
do $$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations;
  end if;
end
$$;

commit;

-- [3] 사후 확인 — 5개 값이 모두 기대치여야 복원으로 넘어간다
select nspname, pg_get_userbyid(nspowner) as owner, array_to_string(nspacl, ',') as acl
from pg_namespace where nspname in ('public', 'private');
-- 기대: public 1행만. owner = pg_database_owner,
--       acl = pg_database_owner=UC/pg_database_owner,=U/pg_database_owner
--       private 행은 없어야 한다

select count(*) as remaining_objects
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname in ('public', 'private');            -- 기대 0

select count(*) as remaining_functions
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'private');            -- 기대 0

select count(*) as migration_history_rows
from supabase_migrations.schema_migrations;          -- 기대 0

select count(*) as realtime_publication_members
from pg_publication_tables where pubname = 'supabase_realtime';   -- 기대 0 (덤프가 4로 되돌린다)
```

**설계 근거 4가지 (전부 2026-08-27 실측 `[산출물]`)**

| # | 사실 | 그래서 SQL이 하는 일 |
|---|---|---|
| 1 | `drop schema public cascade`는 **`private` 스키마의 함수 10개 중 3개만 끌고 간다.** `public` 타입을 참조하지 않는 7개(`normalize_wiki_title`, `reconcile_group_host_v13`, `sync_group_records` 등)는 **살아남는다** | `drop schema if exists private cascade`를 추가했다. 스키마 덤프가 `CREATE SCHEMA IF NOT EXISTS "private"`와 함수 전체를 담으므로 지워도 복원된다 |
| 2 | 덤프에 **`CREATE SCHEMA "public"`도 `ALTER SCHEMA "public" OWNER TO`도 없다.** `public` 소유자는 `pg_database_owner`다 | `create schema public` + `alter schema public owner to pg_database_owner` |
| 3 | 덤프의 `GRANT USAGE ON SCHEMA "public"`은 **postgres/anon/authenticated/service_role 4행뿐**이고 `PUBLIC` 롤 항목(`=U`)이 없다 | `grant usage on schema public to public` |
| 4 | `supabase_realtime` publication은 스키마 밖 객체라 **drop에 살아남고**, 테이블이 사라지면서 멤버십만 비워진다. 덤프의 `ALTER PUBLICATION ... ADD TABLE` 4행이 되돌린다 | 별도 처리 불필요. 사후 확인에서 0을 기대값으로 둔다 |

> **`public` 밖은 건드리지 않는다.** 리허설에서 `auth`·`storage`·`realtime`·`extensions`·`vault`·
> `supabase_functions` 테이블/함수 수, event trigger 6개, publication 2개, 롤 16개를 실행 전후로
> 대조해 **차이 0건**이었다 `[산출물]`. `auth`·`storage` 트리거가 `public` 함수를 참조하지 않음도
> 확인했다 — 그래서 cascade가 인증을 조용히 망가뜨리지 않는다.

#### 6.3.3 데이터 덤프는 `public`만 복원한다 — **§6.3의 가장 큰 수정**

**기존 서술("데이터 덤프 복원")대로 하면 실패한다.** 리허설에서 재현했다 `[산출물]`.

- §4.2 데이터 덤프는 `public`뿐 아니라 **`auth`·`storage` 데이터도 담는다** (F4).
- §6.3 2단계는 **`public`만 비운다.** `auth`·`storage`는 W6가 건드리지 않았으므로 비울 이유도 없다.
- 따라서 전체 데이터 덤프를 복원하면 **이미 있는 `auth` 행과 PK가 충돌한다.**
  실측 결과: `ERROR: duplicate key value violates unique constraint "audit_log_entries_pkey"`,
  `psql` 종료 코드 3, **`public` 복원 행 0** — `auth` 블록이 파일 앞쪽에 있어 public까지 가지도 못한다.
- `SET session_replication_role = replica`는 **트리거·FK만 끄고 PK/UNIQUE는 끄지 못한다.**

**해결 — 둘 중 하나. (a)를 권장한다.**

**(a) W2에서 `public` 전용 데이터 덤프를 하나 더 뜬다** (권장)

```powershell
# §4.3에 추가. 기존 2종은 그대로 두고 3번째를 더 뜬다
npx supabase db dump --linked --data-only --use-copy --schema public -f ".\backup\prod-data-public-$stamp.sql"
```

- `--schema public`은 `2.114.0`에 존재한다 `[산출물]`. `pg_dump --schema "public"`으로 내려간다.
- 전체 덤프는 **버리지 않는다.** `auth.users` 145행의 유일한 백업이며(§4.2-1), 계정 유실 시 그쪽을 쓴다.
- 리허설에서 이 덤프는 `COPY "public"` 블록 14개 + `public` 시퀀스 `setval` 1개를 담았고
  `auth` 블록은 0개였다 `[산출물]`.

**(b) 이미 뜬 전체 덤프에서 `public`만 잘라낸다** (W2에서 (a)를 잊었을 때)

```awk
# slice-public.awk — 전체 데이터 덤프에서 public 이외 스키마의 COPY 블록과 setval만 제거한다.
# 나머지(preamble의 SET 문, 주석, RESET ALL)는 그대로 통과시킨다.
# COPY 블록 종료는 단독 종료행뿐이다 — 데이터 행이 --로 시작할 수 있으므로 주석을 지우지 않는다.
BEGIN { TERM = sprintf("%c.", 92); mode = 0 }
mode == 1 { print; if ($0 == TERM) mode = 0; next }          # public COPY 본문: 통과
mode == 2 { if ($0 == TERM) mode = 0; next }                 # 비-public COPY 본문: 제거
index($0, "COPY \"public\".") == 1 { print; mode = 1; next }
index($0, "COPY \"") == 1 { mode = 2; next }
index($0, "setval") > 0 && index($0, "\"public\".") == 0 { next }
{ print }
```

**파일: [`docs/ops/slice-public.awk`](slice-public.awk)** — 위 내용과 동일하다. 저장소에 있으므로
창 안에서 새로 만들 필요가 없다.

```powershell
awk -f .\docs\ops\slice-public.awk ".\backup\prod-data-$stamp.sql" > ".\backup\prod-data-public-$stamp.sql"
```

- **`awk`는 Git for Windows에 포함돼 있다.** 이 머신에서는 `C:\Program Files\Git\usr\bin\awk.exe`로
  PATH에 있다 (2026-08-27 `[산출물]`). Git이 없는 환경이라면 이 경로 자체를 쓸 수 없다 — (a)를 쓴다.
- 2026-08-27 재검증: 이 파일로 리허설 덤프를 잘라 `db dump --schema public` 출력과 대조해
  **실행문 차이 0행**이었다 `[산출물]`.

**검증됨:** 같은 DB에서 (b)의 출력과 (a)의 출력을 대조해 **실행문 차이 0행**이었다
(차이는 제거된 테이블의 주석 헤더뿐) `[산출물]`.

> **`--exclude`(`-x`)로 auth를 빼는 방법은 쓰지 않는다.** `auth` 테이블이 23개, `storage`가 10개라
> 열거가 길고 플랫폼이 테이블을 늘리면 조용히 깨진다. `--schema public`이 화이트리스트라 안전하다.

##### 6.3.3-1 복원 실행 명령 (3단계 전문)

**순서를 바꾸지 않는다 — 스키마 → 데이터.** 반대로 하면 FK가 깨진다.

```powershell
$IMG = 'public.ecr.aws/supabase/postgres:17.6.1.158'
$stamp = '20260901-1900'   # W2에서 쓴 값과 같아야 한다

# 3-a. 스키마 덤프 복원
docker run --rm -i --entrypoint psql $IMG "<CONN>" -v ON_ERROR_STOP=1 -f - < ".\backup\prod-schema-$stamp.sql"

# 3-b. 데이터 덤프 복원 — public 전용 파일이어야 한다 (§6.3.3)
docker run --rm -i --entrypoint psql $IMG "<CONN>" -v ON_ERROR_STOP=1 -f - < ".\backup\prod-data-public-$stamp.sql"
```

- **`prod-data-$stamp.sql`(전체 덤프)을 쓰지 않는다.** `auth` PK 충돌로 실패하고 `public`은
  한 행도 복원되지 않는다 (§6.3.3). 파일 이름에 `-public-`이 있는지 눈으로 확인한다.
- 데이터 덤프는 첫 줄에 `SET session_replication_role = replica;`를 담고 있어 트리거·FK가
  꺼진 상태로 들어간다 — 별도 조치가 필요 없다 `[산출물]`.
- **각 명령의 exit code를 본다.** `-v ON_ERROR_STOP=1` 덕분에 0이 아니면 중단된 것이다.
  0이 아닌 채로 다음 단계로 넘어가지 않는다.
- 4단계(`migration repair`)는 `npx supabase migration repair --status applied 20260730170602 --linked`
  이며 Docker를 쓰지 않는다 — CLI가 직접 접속한다.

#### 6.3.4 복원되지 않는 것

| 대상 | 복원 여부 | 비고 |
|---|---|---|
| `public` 스키마 구조·데이터 | **완전 복원** | 리허설에서 구조 지문·행 수·이력 **차이 0건** (§6.5-4) |
| `private` 스키마 | **완전 복원** | 스키마 덤프가 담는다 (§6.3.2 근거 1) |
| `supabase_realtime` publication 멤버십 | **완전 복원** | 덤프의 `ADD TABLE` 4행 |
| `supabase_migrations.schema_migrations` | **재생성** (복원 아님) | 어느 덤프에도 없다 (F4·§4.2-2). 4단계 `repair`가 **로컬 파일에서** 다시 만든다. 운영에 있던 원본이 아니라 동등물이다 |
| **`supabase_admin` 소유 default privileges 3행** | **복원 불가** | **새로 확인된 항목.** `drop schema public cascade`가 `pg_default_acl` 항목을 지우는데, 덤프에는 `ALTER DEFAULT PRIVILEGES FOR ROLE "postgres"` 12행만 있고 `supabase_admin` 것은 **0행**이다. 게다가 `postgres` 롤로는 재생성할 수 없다 — `ERROR: permission denied to change default privileges` `[산출물]`. **영향:** `supabase_admin`이 `public`에 새로 만드는 객체에만 걸리는 설정이라 이 앱의 동작에는 영향이 없다(앱 migration은 `postgres`로 실행되고 그쪽 12행은 복원된다). 그러나 **되돌릴 수 없는 플랫폼 설정 드리프트**이며, 필요하면 Supabase 지원을 통해야 한다 |
| 제약의 **텍스트 표현** | 의미 동일, 표현 다름 | `pg_get_constraintdef` 렌더링이 덤프 왕복에서 괄호 구조만 달라진다(`between`이 평탄화된다). 술어는 같다. 덤프 기반 복원의 고유 성질이다 |
| `REVOKE`로 소유자 전용이 된 테이블 ACL | 의미 동일, 표현 다름 | `relacl`이 명시값에서 `null`로 돌아간다. 둘 다 "소유자만"이라 효과가 같다 |
| Edge Function 소스(운영 배포본), Storage 객체 바이너리, Vercel 환경변수, auth 설정 | **복원 대상 아님** | §4.5 그대로 |
| **W2 덤프 이후 창 중에 들어온 쓰기** | **유실** | §3.1의 수용된 잔여 위험 |

### 6.4 W2.5 삭제분만 복원

전체 복원보다 훨씬 좁다.

1. W2 데이터 덤프에서 `game_rooms`와 CASCADE 4테이블의 해당 행 블록을 발췌한다.
   `--use-copy`로 떴다면 테이블별 `COPY` 블록 단위로 잘라내면 된다.
2. `game_rooms` → `room_players`/`room_events`/`group_match_results`/`match_history` 순으로 삽입한다.
   FK 방향이 이 순서를 요구한다 (F5).
3. `user_profile_stats`는 건드리지 않는다 (§5.4에서 변경하지 않았으므로 복원 대상이 아니다).

**주의 — 시점이 중요하다.** W6 이후에는 `20260814093000`이 직접 쓰기 권한을 회수한 상태이고,
`NOT VALID` 제약이 INSERT를 **행 단위로 강제한다** (§5.1-2).
즉 **W6 이후에는 위반 행을 되돌려 넣을 수 없다.** W2.5 삭제를 되돌리려면 W6 이전에 해야 한다.

---

### 6.5 복원 리허설 기록 (2026-08-27, 로컬)

§9의 미결정 항목 "§6.3 전체 복원의 2번 단계 SQL — 미작성, 복원 리허설 자체가 없다"를 해소한 기록이다.

**환경:** 로컬 스택 `wiki-packet13-r2-clean158`, 이미지 `public.ecr.aws/supabase/postgres:17.6.1.158`,
CLI `2.114.0`, 기준 커밋 `77094d1`, 2026-08-27 `[산출물]`.
**운영 DB에는 접근하지 않았다.** `--linked`를 쓴 명령은 하나도 없다.

#### 6.5.1 무엇을 재현했는가

리허설은 §6.3이 실제로 놓이는 상황을 그대로 만들었다 — **W2 시점 상태에서 덤프를 뜨고, W6를
적용해 되돌릴 수 없는 지점을 넘긴 뒤, 그 상태에서 복원**한다.

| 단계 | 한 일 |
|---|---|
| A | 로컬을 **운영 baseline 상태**로 되돌렸다 — `supabase/baseline/remote_schema.sql`(실제 운영 덤프)을 복원해 테이블 14 / 함수 7 / publication 4를 만들었다. 운영 실측(`PROD-SNAPSHOT-2026-08-20.md` §2·§9.1, §1.2)과 일치한다 |
| A | **운영 비례 데이터를 시드했다** — `auth.users` 145, `profiles` 142, `game_records` 57, `game_rooms` 316(**group 위반 167건 = 실측치와 동일**, 그중 `status <> 'waiting'` 120 / `waiting` 47), `room_players` 632, `room_events` 948, `group_match_results` 414, `match_history` 109, `group_match_history` 453. `public` 합계 **4108행** |
| A | `migration repair --status applied 20260730170602 --local` → 이력 1행, `statements` **250개** (W4 기대값과 일치) |
| B | **W2 덤프 4종**을 떴다. §4.4 검증 4항목 전부 통과 |
| C | **W6를 적용했다** (`db push --local`) |
| D | **§6.3 전체 복원을 실행했다** |
| E | **W2.5 반사실 검증** — 삭제를 한 경우와 안 한 경우를 각각 돌렸다 |
| F | **로컬을 실험 전 상태로 원복했다** |

#### 6.5.2 W2 덤프 검증 (§4.4 4항목)

| # | 항목 | 결과 |
|---|---|---|
| 1 | 스키마 덤프의 `CREATE TABLE` | **14** — 운영 `public` 테이블 수와 일치 |
| 2 | 스키마 덤프의 `^GRANT` 행 수 | **70** — `supabase/baseline/remote_schema.sql`의 70행과 **정확히 일치** |
| 2 | `ALTER PUBLICATION "supabase_realtime" ADD TABLE` | **4** — §1.2 실측과 일치 |
| 3 | 데이터 덤프의 `auth.users` COPY 블록 | **존재** (F4 확인) |
| 4 | 파일 종료 | `RESET ALL;` 정상 종료 |

> **P7(U5)에 대한 참고.** 이 70행 일치는 **로컬 baseline 파일끼리의 일치**이지 운영 대조가 아니다.
> P7은 여전히 미완이며 W-1 리허설 덤프로만 해소된다. 다만 **덤프 명령이 GRANT 70행을 그대로
> 실어 나른다는 것(F3)은 이번에 실측으로 확인됐다.**

#### 6.5.3 W6에서 나온 사실 2건 — **계획 수정 사유**

**(1) `db push`는 migration 파일을 원자적으로 적용한다.**

11개 중 `20260814093000_server_authority_cutover_v2` 하나만 `begin;`/`commit;`이 없다 `[코드]`.
begin/commit 없는 파일에 일부러 실패 문장을 넣은 프로브를 별도 workdir로 돌린 결과
(`db push --db-url <local> --workdir <temp>`), **실패 앞의 `create table` 2개와 `insert` 1개가
전부 롤백됐다** `[산출물]`. → **CLI가 파일 단위 트랜잭션을 보장한다.**
그래서 §6.0.3의 W6 등급표를 **파일 번호만으로** 세울 수 있다.
(프로브는 임시 디렉터리에서만 돌렸고 저장소 `supabase/migrations/`는 변경하지 않았다.)

**(2) W2.5를 건너뛰면 W6가 #10에서 실패한다. §3.2 W2.5의 "실패 시" 서술은 틀렸다.**

W2.5 삭제 없이 `db push`를 돌리자 **9개까지 적용되고 10번째
`20260814113000_group_final_gaps_v13_hardening`이 실패**했다 `[산출물]`.

```
ERROR: new row for relation "game_rooms" violates check constraint
       "game_rooms_group_limits_v13_check" (SQLSTATE 23514)
At statement: 8
```

**기전:** #9(`20260814103000`)가 제약을 `not valid`로 추가한다. #10의 8번째 문장은
`private.reconcile_group_host_v13`를 도는 `do` 블록이고, 그 함수는
`update public.game_rooms set host_user_id = ..., state_version = state_version + 1`을 실행한다
(`20260814113000:150-155` `[코드]`). **`NOT VALID` 제약도 UPDATE에는 행 단위로 강제되므로**
(§5.1-2에 이미 적혀 있던 성질) 위반 행을 갱신하는 순간 23514가 난다.

**반사실 확인:** 같은 DB에서 §5.3 (4)의 삭제 SQL을 돌려 120행을 지운 뒤 다시 `db push`하자
**11개 전부 적용, exit 0**이었다 `[산출물]`. 그리고 W7 성공 판정이 전부 충족됐다 —
함수 36, legacy RPC 2개 `null`, 이력 12행, publication 4,
**두 제약 모두 `convalidated = t`**, `group_match_history`·`user_profile_stats` RLS `true`.

→ **F15의 "제약이 `not valid`라서 migration은 실패하지 않는다"는 #9까지만 참이다.**
#10은 그 제약이 붙은 행을 스스로 UPDATE하므로 예외다. 수정 반영: §5.3-0, §3.2 W2.5.

**실패를 유발하는 행의 정확한 조건.** 위반 행 전부가 아니라 **host 참조가 끊긴 위반 행**만이다.
창 밖(P10)에서 운영에 다음 읽기 전용 쿼리를 돌려 수를 확인한다.

```sql
-- W6 #10을 실패시키는 행 수. W2.5 전에 측정한다. 0이면 삭제를 건너뛰어도 #10은 통과한다
select count(*) as w6_blocking_rows
from public.game_rooms room
where room.mode = 'group'
  and room.status <> 'waiting'
  and not (
    room.min_players between 3 and 8
    and room.max_players between room.min_players and 8
    and room.finish_rank_limit = 3
    and room.use_items = false
  )
  and (
    (room.host_user_id is null
     and exists (select 1 from public.room_players p where p.room_id = room.id))
    or
    (room.host_user_id is not null
     and not exists (select 1 from public.room_players p
                     where p.room_id = room.id and p.user_id = room.host_user_id))
  );
```

**이 쿼리는 근사가 아니라 정확하다.** 실제 `do` 블록은 `player_status <> 'retired'`로 한 번 더
거르지만, `player_status`는 #2(`20260807003609:37`)가 `default 'waiting'`으로 추가하고
`waiting`/`playing`/`finished` 중 하나로만 backfill한다 — **기존 행에 `retired`는 생기지 않는다**
`[코드]`. 그래서 W6 이전 시점의 위 쿼리가 #10 시점의 대상 집합과 같다.
(`player_status` 컬럼은 W6 이전 운영에 **없다.** 그래서 이 쿼리에서 빼는 것이 맞다.)

#### 6.5.4 복원 결과 — 대조

복원은 **부분 적용 상태(9/11)** 에서 시작했다. 이것이 §6.3이 실제로 놓이는 자리다.

| 대조 축 | 덤프 시점 (W2) | 복원 후 | 판정 |
|---|---|---|---|
| 구조 지문 md5 (테이블·컬럼·제약·인덱스·RLS·정책·함수·트리거·시퀀스·ACL·default privileges·publication·소유자 **631행**) | `a806ad9c…09506` | `a806ad9c…09506` | **완전 일치** |
| `public` 테이블 수 | 14 | 14 | 일치 |
| `public` 함수 수 | 7 | 7 | 일치 |
| `public` 행 수 (14테이블 합계) | 4108 | 4108 | **테이블별 전부 일치** |
| `auth` / `storage` 행 수 | — | — | **손대지 않음** (비우기 대상이 아니다) |
| migration 이력 | 1행 `20260730170602` / `statements` 250 | 동일 | 일치 |
| `public` 밖 전역 상태 (스키마별 테이블·함수 수, event trigger 6, publication 2, 롤 16) | — | — | **차이 0건** |

즉 **§6.3은 `public`을 W2 시점으로 정확히 되돌린다.** 되돌리지 못하는 것은 §6.3.4의 표에 있고,
그중 실질적인 항목은 **`supabase_admin` default privileges 3행 하나뿐**이다.

#### 6.5.5 시간 실측과 운영 환경 보정

**로컬 실측** (Docker, localhost, `public` 4108행 + `auth.users` 145):

| 명령 | 실측 |
|---|---|
| §6.3-2 비우기 SQL (post-W6 21테이블/36함수/private 10함수) | **0.45초** |
| §6.3-3a 스키마 덤프 복원 (41KB, 14테이블/7함수) | **1.09초** |
| §6.3-3b 데이터 덤프 복원 (public 전용, 701KB, 4108행) | **0.45초** |
| §6.3-4 `migration repair` | **2.41초** |
| **§6.3 합계 (DB 작업만)** | **약 4.4초** |
| W2 스키마 덤프 | 3.28초 |
| W2 데이터 덤프 (전체) | 3.14초 |
| W2 데이터 덤프 (public 전용) | 3.98초 |
| W2 롤 덤프 | 3.11초 |
| **W2 합계 (4종)** | **약 13.5초** |
| W2.5 삭제 (120방 + CASCADE 840행) | 0.38초 |
| W5 `db push --dry-run` | 2.35초 |
| W6 `db push` 11개 성공 | 5.97초 |
| W6 `db push` #10 실패까지 (9개 적용) | 3.25초 |

> **`npx supabase` 명령에는 2~3초의 고정 오버헤드가 있다** — 위 표에서 CLI 명령이 전부
> 3초 안팎인 것은 그 때문이다. 순수 SQL 작업(`psql`)은 전부 1초 미만이다.

**운영(무료 요금제)에서 달라질 수 있는 요인 — 전부 `[추정]`이며 저장소로 확인되지 않는다 `[외부]`**

| 요인 | 방향 | 크기 `[추정]` |
|---|---|---|
| **네트워크** | 느려짐 | localhost → 인터넷. 스키마 복원은 약 1500개 DDL 문장을 순차 전송하므로 **왕복 지연에 선형으로 비례한다.** 여기가 가장 큰 배수다 |
| **공유 CPU** | 느려짐 | 무료 요금제는 공유·버스트 인스턴스다. DDL은 카탈로그 쓰기가 많아 영향을 받는다 |
| **데이터 크기** | 거의 동일 | 운영 실측 규모(`auth.users` 145, `profiles` 142, `game_records` 57)가 리허설 시드와 같은 자릿수다. **COPY 스트리밍이라 행 수는 병목이 아니다** |
| **자동 일시정지** | **차단 요인** | 7일 무활동 시 일시정지된다. 정지 상태면 복원 자체가 불가능하고 먼저 복구해야 한다 (P4가 창 당일 확인을 요구하는 이유) |
| **PITR 부재** | — | 대안이 없다는 뜻. 덤프가 유일한 수단이라는 §4.1 전제 그대로 |

이 요인들을 넣어 §6.0.4에서 **DB 작업 4단계를 6~14분**으로 잡았다. 로컬 4.4초의 **약 100~200배**다.
보수적으로 크게 잡은 값이며, **실제로는 훨씬 짧을 가능성이 높다.**
그렇게 잡아도 §6.0.4 합계 26~34분에서 DB 작업은 절반 이하다 — **병목은 보고·승인·검증이다.**

#### 6.5.6 로컬 원복 증거

실험 전 상태(post-migration, 테이블 21 / `public` 함수 36 / 이력 12행)로 되돌렸다.

| 대조 축 | 실험 전 | 원복 후 | 판정 |
|---|---|---|---|
| 구조 지문 md5 (631행) | `d742830bd8b3cacb6accc964dc4d0940` | `d742830bd8b3cacb6accc964dc4d0940` | **완전 일치** |
| 행 수 지문 md5 (`public`·`auth`·`storage` 전 테이블) | `1adf0356f94847acacc827f6d5edf5f3` | 동일 | **완전 일치** |
| migration 이력 12행 (`statements` 개수 포함) | 250/22/27/64/41/57/14/13/5/37/16/8 | 동일 | **완전 일치** |
| `public` 밖 전역 상태 | — | — | **차이 0건** |
| `npm run supabase:preflight` | 11/11 PASS (2026-08-23, `032caba`) | **11/11 PASS** | 일치 |
| `postmaster` 시작 시각 | `2026-08-23 14:01:28.07022+00` | **동일**, restart 0/0 | **컨테이너 재시작 없음** |

원복 과정에서 **`postgres` 롤로 되돌릴 수 없는 항목 1건**이 나왔고, 이것이 §6.3.4의
`supabase_admin` default privileges 항목의 근거다. 로컬에서는 `supabase_admin`(superuser)으로
접속해 복구했으나 **운영에서는 그 경로가 없다.**

저장소 변경은 없었다 — `git status supabase/` 무변경 확인 `[산출물]`.

#### 6.5.7 이 리허설이 증명하지 않는 것

- **운영에서의 동작.** 전부 로컬 실측이다. 운영은 관리형 배포판이고 `postgres` 롤 권한이 다를 수 있다.
  특히 `drop schema public cascade`와 `set session_replication_role = replica`의 **운영 실행 권한은
  확인되지 않았다** — 로컬에서는 둘 다 `postgres`로 성공했다 `[산출물]`.
- **운영 데이터 고유의 실패.** 시드는 운영 규모를 흉내 낸 것이지 운영 데이터가 아니다.
  §6.5.3의 `w6_blocking_rows` 실측이 필요한 이유다.
- **P7(GRANT 70행 운영 대조).** 여전히 미완이다 (§6.5.2 주석).
- **창 중 들어온 쓰기의 유실.** 리허설은 그 상황을 만들지 않았다. §3.1의 수용된 위험 그대로다.

---

## 7. 창 전 선행 조건 체크리스트

전부 창 **밖에서** 끝낸다. 하나라도 미완이면 창을 열지 않는다.

**P1~P3·P5~P14는 완료됐다.** 절차·확정 항목은 남아 있지 않다 (§3.3 (c) 채택).
**P4만 예외로 창 당일에 한 번 더 확인한다** — 무료 요금제의 자동 일시정지 때문에 전날 값이
당일을 보장하지 않는다.

| ID | 상태 | 항목 | 판정 기준 | 근거 |
|---|---|---|---|---|
| P1 | [x] | **유지보수 게이트 구현·커밋** | `VITE_MAINTENANCE=true`인 빌드가 점검 화면을 표시하고, 바이패스 수단(`?bypass=...` 등)으로 앱에 진입할 수 있다. **구현은 이 문서 범위 밖** | F10 **해소** — `b24744e`가 `utils/maintenanceGate.js`·`components/MaintenanceScreen.jsx`를 추가하고 `main.jsx`에서 분기한다 |
| P2 | [x] | 게이트가 `main`에 들어갈 커밋에 포함됨 | W1이 push할 커밋에 P1이 포함 | F11 — 빌드 시점 인라인이므로 배포 시점에 코드가 있어야 한다. `b24744e`가 `feat/group-final-gaps` 최신이며 W1의 push 대상에 포함된다 |
| P3 | [x] | 게이트 로컬 확인 | `VITE_MAINTENANCE=true`로 `npm run build` → `npm run preview`에서 점검 화면·바이패스 진입 확인 | 확인함 — 점검 화면 렌더, 요청 2건(문서+진입 청크), `?bypass=<값>` 진입·새로고침 유지·`?bypass=off` 해제 `[산출물]` |
| P4 | [ ] | **프로젝트 Active 확인** | 창 **당일** Supabase 대시보드에서 Active. Paused면 먼저 복구 | 무료 요금제는 7일 무활동 시 자동 일시정지 `[외부]`. 최종 플레이 2026-08-04 `[실측]` → 일시정지 가능성이 낮지 않다 |
| P5 | [x] | DB 접속 자격 준비 | **충족 (2026-08-27).** W-1 리허설 덤프가 성공했다 — `npx supabase db dump --linked`가 `Initialising login role...` → `Dumped schema`까지 완주해 41,399 bytes를 냈다 (사용자 실행) `[산출물]`. **로그인 세션과 DB 비밀번호가 유효하다는 것이 실행으로 증명됐다.** 창 당일 세션이 만료되면 `npx supabase login`을 다시 한다 | F2 — 두 명령 모두 `--password` 옵션 보유. 자격 값 자체는 이 문서에 적지 않는다 |
| P6 | [x] | **`backup/` gitignore 반영 + 디렉터리 실재** | **두 축 모두 충족.** ① **gitignore** (2026-08-21) — `.gitignore:160`의 `backup/`, `git check-ignore -v backup/` → `.gitignore:160:backup/` `[산출물]`. ② **디렉터리 실재** (2026-08-27) — `backup/`이 실제로 존재하고 W-1 덤프 파일이 들어 있으며 `git status`에 나타나지 않는다 `[산출물]`. **②가 없으면 `db dump`가 `failed to open dump file: NotFound`로 실패하고 인증 문제로 오진한다** (§4.3-0) | §4.2·§4.3 — 데이터 덤프에 `auth.users` 145행이 들어간다. 한 번 커밋되면 계정 정보가 git 이력에 영구 잔존한다. ②는 2026-08-27 실제 실패로 확인된 전제다 |
| P7 | [x] | W-1 리허설 덤프로 GRANT 대조 | **충족 (2026-08-27) — 차이 0건.** 운영 스키마 덤프와 baseline이 **바이트 단위 완전 동일**하다 (`cmp` 차이 없음, md5 양쪽 `e2bfa805…`) `[산출물]`. `GRANT` 70행 내용·순서 일치, publication `ADD TABLE` 4테이블 일치, `ALTER DEFAULT PRIVILEGES` 12행 일치, 전체 1563행 차이 0건. 전문은 **§1.4** | **U5 해소.** 권한 드리프트는 migration을 실패시키지 않고 런타임 권한 거부로만 나타나는데(`PROD-SNAPSHOT-2026-08-20.md` §9.7), 대조 대상이 동일하므로 그 위험이 사라졌다 |
| P8 | [x] | link 대상이 운영인지 확인 | **주 축:** `supabase/.temp/project-ref`의 값 == Vercel `VITE_SUPABASE_URL` 호스트의 project ref. **보조 축:** `supabase/.temp/linked-project.json`의 `name`·`organization_slug`가 Supabase 대시보드의 운영 프로젝트와 일치 | **주 축 일치 확인 — 사용자가 Vercel Production의 `VITE_SUPABASE_URL`과 `supabase/.temp/project-ref`를 직접 대조, 2026-08-21 `[사용자 확인]`.** 값은 식별자이므로 이 문서에 기재하지 않는다. F18. U13 해소 경로 (§9). 보조 축은 해당 필드가 실재함을 확인했다 (2026-08-21 `[산출물]`) |
| P9 | [x] | CLI 버전 확인 | **충족 (2026-08-27).** `npx supabase --version` → `2.114.0` `[산출물]`. 네 축이 모두 같은 값이다 — `package.json` devDependencies `"supabase": "2.114.0"`(캐럿 없는 정확한 핀), `package-lock.json`의 `node_modules/supabase` → `2.114.0`, `node_modules/supabase/package.json` → `2.114.0`, 런타임 `--version` → `2.114.0` | F1. **CODE GO의 유효 조건**이므로 불일치는 창 차단 요소다 (`docs/agent/CURRENT.md` §1). 설치·업그레이드는 하지 않았다 |
| P10 | [x] | **삭제 필수성과 측정 절차 확정** | **충족 (2026-08-27).** P10이 확정하는 것은 **범위 값이 아니라 절차와 필수성**이다 — 실제 측정은 운영 조회이므로 창 안 **W2.5**에 속한다. 확정 3가지: **① 삭제를 건너뛰는 선택지는 없다** (`w6_blocking_rows > 0`이면 W6가 #10에서 `SQLSTATE 23514`로 실패, §6.5.3 리허설 근거). **② 범위는 창 안에서 §5.3-0의 `w6_blocking_rows`와 §5.3 (1)(2)로 측정해 확정한다.** **③ 측정 → 승인 → 삭제 순서를 지킨다** (`AGENTS.md` §1의 건별 승인). **남는 승인 대상은 "삭제할지"가 아니라 "어디까지"다** | `AGENTS.md` §4. **2026-08-27에 성격이 바뀌었다** — 리허설이 F15의 "삭제를 건너뛰어도 migration은 실패하지 않는다"를 반증했다. F15a·§5.3-0·§6.5.3 |
| P11 | [x] | **롤백 판단 기준 사전 합의** | **충족 (2026-08-27).** §6.0에 확정 원칙 4가지(R1~R4), 시각 게이트 3개(G1~G3), W6·W7·W9 단계별 트리거 등급표, 판단 등급 보고 입력 4가지가 들어갔다. 근거가 된 복원 리허설은 §6.5 | 사용자 결정 2026-08-27 (U14) + 로컬 리허설 `[산출물]` (U15). **P11의 전제였던 "복원 절차가 리허설되지 않았다"가 해소됐다** — §6.3이 실측 SQL·시간을 담는다 |
| P12 | [x] | 창 기록 파일 준비 | **충족 (2026-08-27).** `docs/ops/CUTOVER-LOG-TEMPLATE.md`를 만들었다. 창 당일 `docs/ops/CUTOVER-LOG-YYYY-MM-DD.md`로 **복사해서** 쓰고 원본은 남긴다. W0~W11 단계별 시각·판정란, G1~G3 게이트란, W2.5 측정값(`w6_blocking_rows` + CASCADE 6열), W4/W5/W6/W7/W9 결과란, 롤백 발생 시 트리거·등급·승인 시각·복원 소요란, 창 후 이월란을 빈칸으로 담았다 | `AGENTS.md` §6. 각 란의 기대값은 §3.2의 성공 판정, 등급은 §6.0.3에서 옮겼다 |
| P13 | [x] | (선택) `npm test`·`npm run build` 커밋 기준 재실행 | **기준 `b24744e`, 2026-08-21 재실행 완료** — `npm test` 142/142 (베이스라인 129 + 게이트 13), `npm run build` 성공 `[산출물]` | `docs/agent/CURRENT.md` §2 `[문서]`가 지적한 "`339fb77` 이후 build 재실행 기록 없음"이 해소됐다 |
| **P14** | [x] | **복원 도구 경로 확정 + 실행 전제 확인** | **판정 2축. ① 명령 형태 확정 — 충족 (2026-08-27).** §6.3.0 A안으로 확정했다: `docker run --rm -i --entrypoint psql <승인이미지> "<CONN>" -v ON_ERROR_STOP=1 -f - < <파일>`. `--entrypoint` 필요성, `-f -` stdin 전달, URI 접속 인자를 로컬 대상으로 실측 검증했다 `[산출물]`. 각 단계 명령은 §6.3.2·§6.3.3-1에 있다. **② 실행 전제 — 창 전 확인 3항목** (§6.1 표): **(i)** `docker version` 동작, **(ii)** `docker images public.ecr.aws/supabase/postgres:17.6.1.158`이 이미지를 반환, **(iii)** §6.3.0-1의 연결 확인 명령이 `1`을 반환. **(iii)만 운영 접속이며 읽기 전용이다** | **2026-08-27 신설·확정.** 이 머신에 `psql`·`pg_dump`·`pg_restore`가 **없다** `[산출물]`. **로컬 Supabase 스택 up은 요구하지 않는다** — A안이 `docker run`이라 스택과 무관하다 (검증됨 `[산출물]`). 대안 없음은 §6.3.0-4. Docker 29.6.2 + 승인 이미지 로컬 존재 확인 `[산출물]` |

**완료 13건: P1·P2·P3·P6·P8·P13 (2026-08-21), P5·P7·P9·P10·P11·P12·P14 (2026-08-27).**
**남은 것은 P4 하나**이며 **창 당일에만 확인할 수 있는 항목이다.**

| ID | 남은 항목 | 성격 | 언제 | 창을 막는가 |
|---|---|---|---|---|
| P4 | 프로젝트 Active 확인 | 외부 (Supabase 대시보드) | **창 당일** — 전날 확인이 당일을 보장하지 않는다 | 막는다 (Paused면 아무것도 못 한다) |

**P14의 실행 전제 3항목은 완료 표기와 별개로 창 당일 §0.0에서 다시 본다** —
Docker가 꺼져 있을 수 있고, 연결 문자열 유효성도 시간에 따라 달라질 수 있다 (§6.1 표).
**절차·명령 형태는 확정됐고, 남은 것은 그날의 확인뿐이다.**

- **P1~P3·P13** — 기준 커밋 `b24744e`. 게이트 구현 커밋이 `feat/group-final-gaps`에 들어가
  `origin`에 push됐고 `origin/main`은 무변경(`e6d8eee`)이다. 같은 커밋 기준으로
  `npm test` 142/142 (베이스라인 129 + 게이트 13), `npm run build` 성공 — P13 근거다.
  P1의 판정 기준에 있는 "구현은 이 문서 범위 밖"은 작성 시점 서술이다. 구현은 완료됐고
  사용법은 `README.md` §유지보수 게이트, 동작 계약은 `tests/maintenanceGate.test.js`에 고정돼 있다.
- **P5** (2026-08-27) — **덤프 실행 성공이 곧 증명이다.** `Initialising login role...` → `Dumped schema`로
  완주했으므로 로그인 세션과 DB 비밀번호가 유효하다. 창 당일 세션 만료 시 재로그인만 하면 된다.
- **P6** — 두 축을 모두 본다. gitignore(2026-08-21)와 **디렉터리 실재**(2026-08-27).
  후자는 W-1에서 실제로 `NotFound`가 나면서 추가된 항목이다 (§4.3-0).
- **P7** (2026-08-27) — **차이 0건.** 운영 덤프와 baseline이 바이트 단위로 같다 (§1.4). U5 해소.
- **P8** — 사용자가 Vercel Production 값과 `supabase/.temp/project-ref`를 직접 대조해 일치 확인
  `[사용자 확인]`. 이로써 §9 U13이 해소됐다.
- **P9** (2026-08-27) — 네 축(`package.json` 핀·`package-lock.json`·`node_modules` 설치본·런타임
  `--version`)이 모두 `2.114.0`이다 `[산출물]`. **CODE GO의 유효 조건**이므로 불일치는 창 차단
  요소였고, 일치가 확인됐다. 설치·업그레이드는 하지 않았다.
- **P10** (2026-08-27) — 리허설로 성격이 바뀌었다. **삭제가 선택에서 필수가 됐으므로** P10에서
  합의할 "삭제 여부"가 사라졌다. **P10이 확정하는 것은 절차와 필수성이고, 범위 값은 창 안
  W2.5에서 측정한다** — 측정 자체가 운영 조회이므로 창 밖에서 미리 정할 수 없다 (§5.3-0).
- **P12** (2026-08-27) — `docs/ops/CUTOVER-LOG-TEMPLATE.md`. 창 당일 날짜를 넣어 복사해 쓴다.
- **P14** (2026-08-27 신설·확정) — `psql`이 없다는 실측에서 시작해 **Docker 이미지의 `psql`로
  경로를 확정**했다 (§6.3.0 A안). **초안의 "로컬 스택 up"은 요구 조건에서 빠졌다** —
  `docker run`은 스택과 무관하게 동작하는 것이 검증됐고, 그래서 전제가 하나 줄었다.
  남은 전제는 Docker·이미지·IPv4 연결 3항목이며 §6.1에 원칙으로 올렸다.
  **대안 경로는 없다** — Studio SQL Editor는 `COPY … FROM stdin`을 공급할 수 없어
  데이터 복원이 원리적으로 불가능하다 (§6.3.0-4).

---

## 8. 창 후 검증 항목

> **2026-09-02 실행 결과: §8.1은 7/8 통과, 1건 부분(7 — `target-level` 실물 미확인).**
> **§8.2는 6건 중 3건이 부분 소화됐고 3건은 미수행이다.** 항목별 현황은
> CUTOVER-LOG §3·§5이며, **다음 작업 목록은 `docs/agent/CURRENT.md` §5.0**이다.
> **게이트가 해제됐으므로 §8.2의 미수행 항목은 이제 실사용자가 먼저 밟을 수 있다.**

### 8.1 즉시 (W11)

| # | 항목 | 판정 |
|---|---|---|
| 1 | `public` 함수 수 | 36 (`PROD-SNAPSHOT-2026-08-20.md` §2) |
| 2 | legacy RPC 2개 부재 | `to_regprocedure` 둘 다 null |
| 3 | Packet 13 제약 2개 | `convalidated = true` (W2.5 수행 시) |
| 4 | RLS 14/14 | `group_match_history`·`user_profile_stats`가 true로 전환 |
| 5 | publication | 4테이블 유지, `group_spectator_emoji_rate_limits` 미포함 |
| 6 | migration 이력 | 12행 (baseline + 11) |
| 7 | Edge Function | `wiki-snapshot`·`single-run` 배포됨. **`target-level` 여전히 존재** |
| 8 | 프론트 | 유지보수 해제 후 로그인·단일 게임 진입 |

### 8.2 창 다음날 이후

| # | 항목 | 왜 |
|---|---|---|
| 1 | **권한 거부 경로 SIGSEGV 관측** — Supabase 로그에서 signal 11/PANIC 검색 | 운영 17.6 + cutover의 권한 회수 조합. 로컬에서 재현된 위험 (`PROD-SNAPSHOT-2026-08-20.md` §5). **창 안 20분으로는 관측 표본이 부족하다** |
| 2 | 실제 브라우저 다중 세션 Realtime (2~8세션) | `qa/30-INTEGRATION-CHECKLIST.md` §21 미완 항목 |
| 3 | 실제 Wikipedia snapshot smoke (B2) | B1은 fixture 인터셉트다 (`docs/agent/CURRENT.md` §5-4) |
| 4 | 모바일 viewport / 키보드 / reduced-motion | `docs/agent/CURRENT.md` §1 RELEASE HOLD 표 |
| 5 | 불변식 모니터링 | `game_move_events`, `game_mutation_requests`, `match_history.result_status`, `game_records.run_id` — 최종 결과가 event·기록에 각각 한 번만 (`code/18-...md` §장애 시 확인 지점) |
| 6 | 새 운영 스냅샷 작성 | `PROD-SNAPSHOT-2026-08-20.md`는 이 창으로 무효가 된다 |

---

## 9. 미결정 항목과 해소 방법

| ID | 항목 | 상태 | 해소 방법 | 창을 막는가 |
|---|---|---|---|---|
| U5 | `GRANT` 70행 운영 대조 | **해소 (2026-08-27). 차이 0건** | W-1 리허설 스키마 덤프를 baseline과 대조했다 — **바이트 단위 완전 동일**(`cmp` 차이 없음, md5 양쪽 `e2bfa805…`, 1563행 차이 0) `[산출물]`. `GRANT` 70행이 내용·순서까지 같고 `REVOKE`는 양쪽 0행이라 표현 차이를 판정할 대상 자체가 없었다. publication `ADD TABLE` 4테이블·`ALTER DEFAULT PRIVILEGES` 12행도 일치. 전문은 §1.4 | **더 이상 막지 않는다.** P7 충족. 드리프트가 런타임 권한 거부로만 나타나는 위험(`PROD-SNAPSHOT-2026-08-20.md` §9.7)은 대조 대상이 동일하므로 사라졌다 |
| — | **`psql` 부재** | **해소 (2026-08-27). 경로 확정** | 이 머신에 `psql`·`pg_dump`·`pg_restore`가 없다 `[산출물]`. **Docker 이미지의 `psql`로 확정** — `docker run --rm -i --entrypoint psql <승인이미지> "<CONN>" -v ON_ERROR_STOP=1 -f -` (§6.3.0 A안). 로컬 대상으로 `--entrypoint`·`-f -` stdin·URI 접속을 실측 검증했고 **로컬 스택이 꺼져 있어도 동작한다** `[산출물]`. 남은 전제 3개(Docker·이미지·IPv4 연결)는 §6.1·P14. **대안 경로는 없다** — Studio SQL Editor는 `COPY … FROM stdin`을 공급할 수 없어 데이터 복원이 원리적으로 불가능하다 (§6.3.0-4) | **더 이상 막지 않는다.** P14 충족. 남은 것은 창 당일 §0.0의 확인 3항목이다 |
| U6 | 운영 17.6 SIGSEGV 빌드 동일성 | **미결정. 검증 수단 미확정** | 로컬 `.158`과 운영 관리형 배포판의 동일성을 확인할 수단이 없다 (`PROD-SNAPSHOT-2026-08-20.md` §5). 차선책: W9에서 `anon` 차단 경로를 의도적으로 1회 밟고, §8.2-1로 사후 관측 | **막지 않는다.** 확정 위험이 아니라 검증 대상 |
| U9 | Edge Function 운영 배포 목록, `target-level` 취급 | **부분 확정** | 확정: `target-level`은 로컬 소스가 없다 (F12) → **`--prune` 금지, 이름 명시 배포** (A3). 미확정: 운영에 실제 배포된 함수 전체 목록. 대시보드 Functions 화면에서 읽기 전용 확인 가능 | **막지 않는다.** A3가 사고를 차단한다 |
| U12 | `repair`의 `schema_migrations` 생성 동작 | **해소 (2026-08-21).** (a)(b)(c) 전부 측정 완료 | 로컬 스택(CLI `2.114.0`, container-158)에서 재현 `[산출물]`. **(a) 테이블이 생성된다 — 스키마 자체가 없어도 스키마까지 만든다.** 두 경우 모두 exit 0. **(b) 행은 정확히 1개**이며 `statements`에 migration SQL 250개가 들어간다. 따라서 **W3 앞 선행 단계 불필요.** **(c) `--status reverted`는 행을 DELETE한다** (상태 열이 없다). 행이 없으면 멱등, 테이블이 없으면 빈 테이블을 만든다. **존재하지 않는 버전에도 exit 0** — 반면 `--status applied`는 로컬 파일이 없으면 exit 1(`LegacyMigrationFileNotFoundError`)로 실패한다. 되돌림은 exit code로 검증되지 않으므로 W4 쿼리로 확인한다. 부수 확인: 운영의 42P01은 "테이블만 없음"과 "스키마 없음"을 구분하지 못한다(에러 문자열 동일) — 그러나 양쪽 모두 exit 0이므로 구분할 필요가 없다. 전문은 §3.2 W3·W4 | **막지 않는다.** W4가 결과를 사후 확인한다 |
| U13 | link 대상 ref가 운영인지 | **해소 (2026-08-21).** 두 축이 모두 일치 | **주 축 — 사용자가 Vercel Production의 `VITE_SUPABASE_URL`과 `supabase/.temp/project-ref`를 직접 대조해 일치 확인 `[사용자 확인]` (P8).** 저장소 축 `[산출물]`: `.temp/project-ref`가 정상 ref 형식이고, `.temp/linked-project.json`의 `ref`와 **일치**하며, `.env.local.remote-backup`의 `VITE_SUPABASE_URL` 호스트 ref와도 **일치**한다. (`.env.local`은 `127.0.0.1`로 로컬 스택을 가리켜 대조 대상이 아니다.) 두 축이 독립적으로 같은 ref를 지목한다. 값은 식별자이므로 이 문서에 기재하지 않는다 | **더 이상 막지 않는다.** P8 충족. 남은 관련 위험은 창 당일 link 상태가 바뀌는 경우뿐이며 W-1의 link 대상 확인이 그것을 잡는다 |
| — | §6.3 전체 복원의 2번 단계 SQL | **해소 (2026-08-27).** 확정·리허설 완료 | 로컬 스택에서 전 과정을 리허설했다 `[산출물]`. **비우기 SQL 확정 → §6.3.2** (post-W6 상태에 2회 실행, 잔존 객체 0). **복원 결과 → §6.5.4** (구조 지문·행 수·이력 차이 0건). **소요 시간 → §6.5.5** (DB 작업 로컬 4.4초). 리허설이 잡아낸 수정 2건: (a) `private` 스키마를 함께 지워야 한다, (b) 데이터 덤프는 `public`만 복원해야 한다 — 전체 덤프는 `auth` PK 충돌로 실패한다 (§6.3.3). 복원되지 않는 항목도 확정됐다 (§6.3.4) | **막지 않는다.** P11이 이 결과 위에서 확정됐다 (§6.0) |
| — | W2.5의 `match_history` 영향 | **측정 대기** | §5.3 (2) 쿼리로 창 안에서 측정. 0이 아니면 사용자 화면 1:1 전적이 줄어든다 (F9·§5.5) | **막지 않는다.** 삭제 승인 시 함께 판단 |
| — | Edge Function 선배포 (A5) | **해소 — 기각 (2026-08-21)** | W6 전 배포는 존재하지 않는 테이블을 참조하는 함수를 올리게 되고 검증 순서가 꼬인다. **Edge Function 배포는 W8 고정.** 근거 전문은 §3.0 A5 | — |
| — | 창 시간 초과 | **해소 (2026-08-27)** | (c) 채택 — W-1·P1~P8을 전날로 분리, 창은 W0부터. §3.3. 상한 시나리오는 여전히 2시간을 넘지만 **시각 게이트 3개(G1 +60분 / G2 +85분 / G3 +120분)로 처리한다** (§6.0.2·§3.3.1). **G2·G3는 넘기는 지점이지 실패 지점이 아니다** — 게이트를 켠 채 복원(G2)·재개(G3)를 창 밖으로 넘기며, 점검 화면 연장 비용이 사실상 0이라 그것이 서두르는 것보다 안전하다 (§6.0.2-1) | 막지 않는다 |

---

## 10. Release A~D 대체 매핑

### 10.1 `code/18-SERVER-AUTHORITY-V2-IMPLEMENTATION.md`

| 원 항목 | 이 계획에서 | 대체 근거 |
|---|---|---|
| §적용 순서 — release commit/artifact로 pending 집합 통제 | **폐기.** 한 창에서 11개 전량 적용 | U2. artifact 분할의 목적은 단계적 무중단 배포였고, U1(다운타임 허용)이 그 전제를 제거한다 |
| §적용 순서 — `supabase --version` **2.111.0 확인** | **갱신.** `2.114.0` | F1 — 저장소 핀이 `2.114.0`. 18번 문서의 2.111.0은 stale |
| §적용 순서 — `supabase login` / `link --project-ref` | **P5·P8로 이동** | link는 이미 존재한다 (F18). 남은 것은 대상 확인(U13) |
| **Release A** — `90000`·`91000`·`92000`만 push | **W6에 흡수** | U2. 운영 격차가 V2 이전 3개(8/4·8/7·8/13)까지 포함되므로 A의 3개 집합 자체가 실제 격차와 맞지 않는다 (`PROD-SNAPSHOT-2026-08-20.md` §1 `[문서]`) |
| **Release B** — Edge Function 별도 승인 gate | **W8 고정** | 두 함수 배포 자체는 유지. 별도 승인 gate만 창 안 단계로 흡수. **"DB 적용 성공 후"라는 순서 자체는 유지한다** — 앞당기는 안(A5)은 기각됐다 (§3.0) |
| Release B — `functions deploy single-run` / `wiki-snapshot` | **W8, 단 이름 명시·`--prune` 금지 조건 추가** | F12·F13 — 18번 문서에 없는 제약이다. `target-level` 삭제 사고를 막는다 |
| **Release C** — V2 프론트 별도 release | **W1로 이동. 순서가 뒤집힌다** | 18번 문서는 프론트(C) → cutover(D) 순서였다. 이 계획은 **프론트를 먼저 배포하되 유지보수 게이트로 가려둔다.** 게이트가 C→D 사이의 "구버전/신버전 공존" 문제를 대체한다 (U3) |
| Release C — "legacy RPC 호출이 남지 않았는지 확인" | **P13·W9로 분산** | 코드 확인은 창 밖(P13), 실제 흐름 확인은 창 안(W9) |
| **Release D** — 구버전 세션 drain 후 `93000` 적용 | **W6에 흡수** | U3 — drain을 유지보수 게이트로 대체. §3.1의 잔여 위험(게이트는 클라이언트 측 차단)을 명시적으로 수용 |
| Release D — `93000`/`94000`을 별도 artifact로 분리 가능 | **폐기** | U2 |
| §적용 순서 — `db push --dry-run --linked`로 pending 확인 | **W5로 유지.** 기대 개수 11개를 명시 | 유지 |
| §배포 후 브라우저 확인 1~6 | **W9로 유지.** 바이패스 경유 + 6항목(전적 확인) 추가 | §5.5 영향 확인을 위해 항목 추가 |
| §롤백 주의사항 — forward-only, 구버전 프론트 복귀 금지 | **§6에서 유지·강화** | 유지. 덤프 복원이 유일한 수단임을 §6.1에 명시 |
| §로컬 검증 명령 목록 | **유지. 대체하지 않는다** | 로컬 게이트는 이 계획 범위 밖 |
| (18번 문서에 없음) | **§4 백업, §5 데이터 삭제, W3·W4 baseline repair, §7 선행 조건** | 18번 문서 작성 시점에는 `schema_migrations` 부재와 `game_rooms` 위반 167건이 알려지지 않았다 (`PROD-SNAPSHOT-2026-08-20.md` §7) |

### 10.2 `qa/30-INTEGRATION-CHECKLIST.md` §21 미완 체크박스

§21의 마지막 미완 항목은 다음을 한 줄에 묶고 있다.

| §21 미완 항목 | 이 계획에서 | 비고 |
|---|---|---|
| browser 2~8세션 Realtime | **§8.2-2 (창 후)** | 창 안 W9는 최소 흐름만. 다중 세션은 창 후 |
| F5 / offline / throttle | **W9 항목 1·5 (부분)** + §8.2-2 | throttle은 창 후 |
| 운영/linked runtime read-only confirmation | **완료** | `PROD-SNAPSHOT-2026-08-20.md` §5(17.6) + §1.2 실측 → **2026-08-28 W7이 운영 실측으로 재확인** (함수 36 / RLS 14/14 / publication 4테이블 / 이력 12행) |
| 운영 dry-run | **W5 — 완료** | pending 정확히 11개, 순서 일치 |
| Release A~D 승인 | **폐기 → 이 문서의 승인으로 대체** | U2. 2026-08-27~28 창이 그 승인 아래 실행됐다 |
| (§21에 없음) | **§8.2-1 SIGSEGV 사후 관측**, **§8.2-3 B2 실제 Wikipedia smoke** | §21 이후에 식별된 항목. **둘 다 창에서 해소되지 않았다** — 8.2-1은 W9에서 수행하지 않았고, 8.2-3의 형식적 하네스는 여전히 없다(다만 W9 발견 1·3이 그 경로를 운영에서 실제로 밟았다) |

**§21 처리 (2026-08-29):** 이 창을 실행한 뒤 §21에 **봉인 헤더**를 붙였다 — 체크박스와 판정줄은
2026-08-18 실행 기록이므로 **지우지 않고 보존**하고, `RELEASE HOLD` 판정이 유지되되 **사유가
W9 미해결 4건으로 바뀌었다는 사실**과 미체크 4항목이 창에서 어떻게 닫혔는지를 헤더에 적었다.
**새 게이트 기록(§22)은 아직 작성되지 않았다** — `docs/agent/CURRENT.md` §5.6-8.
(`AGENTS.md` §6 — 기준 커밋·날짜 병기.)

---

## 11. 이 문서의 한계

> **2026-09-02 갱신.** 아래 목록에서 **"미실행"이 사라진 항목과 남은 항목을 구분했다.**
> **창 절차 자체는 전 단계가 실행됐다. 여전히 미검증인 것은 §6.3 전체 복원 하나다.**

- ~~창 절차를 **운영에서 실행하지 않았다.**~~ → ~~W10·W11만 미실행이다~~ →
  **W0~W11 전 단계가 운영에서 실행됐다** (§0.-1, `docs/ops/CUTOVER-LOG-2026-08-27.md`).
  W-1과 W2~W6은 그에 앞서 2026-08-27 로컬 리허설도 거쳤다 (§6.5).
  **다만 W10·W11은 창 밖에서 실행됐다** — 이 문서가 전제한 "한 창 안에서 끝나는 절차"와
  실제 실행 형태가 다르다 (§0.-2 개선점 7).
- **§6.3 전체 복원은 여전히 운영에서 실행되지 않았다.** 창에서 롤백이 발생하지 않았기 때문이다.
  §6.5.7의 미검증 목록은 **그대로 유효하다** — 특히 `drop schema public cascade`와
  `set session_replication_role = replica`의 **운영 `postgres` 롤 실행 권한은 확인되지 않았다.**
  **창은 이 미검증을 해소하지 않았을 뿐 아니라 §0.0의 실행 전제 3항목(Docker·승인 이미지·IPv4
  연결)조차 당일 확인 기록을 남기지 않았다** (CUTOVER-LOG §0.0).
- ~~**W10만 어떤 형태로도 수행되지 않았다.**~~ → **W10도 수행됐다 (2026-09-02).**
  `VITE_MAINTENANCE` 삭제 + Redeploy로 게이트가 해제됐고 프로덕션에서 앱 렌더를 확인했다
  (CUTOVER-LOG §W10). **이 문서에서 "미실행"으로 남은 창 단계는 없다.**
- 시간 값은 별도 표기가 없으면 여전히 `[추정]`이다. ~~저장소에 **운영 대상** 실행 이력이 없다~~
  → **2026-08-27~28 창이 실행 이력을 만들었다** (`CUTOVER-LOG-2026-08-27.md`). **그런데도 시간 값은
  보정되지 않았다** — 창이 단계별 시각을 거의 기록하지 않아 **W6~W9 구간 90분** 하나만 남았다
  (§0.-1, §3.3.2). **창 밖 후속(W1-b·W8-b·W9-b·W10)도 시각이 미기록이라 보정 자료가 늘지 않았다.**
  §6.5.5의 `[산출물]` 값은 **로컬 실측**이며 운영 값이 아니다 —
  운영 보정은 §6.5.5의 표에 `[추정]`으로 따로 적었다.
  **§0.-2-1의 `Get-Date` 샌드위치가 이 한계를 겨냥한 개선안이다.**
- `[실측]` 값은 사용자가 운영에서 읽기 전용으로 조회해 보고한 것이다. 작성자는 운영 DB에 접근하지 않았다.
- Vercel 관련 서술(환경변수, 배포 트리거, 이전 배포 롤백)은 `[외부]`다.
  저장소의 `vercel.json`은 SPA rewrite만 담고 있어 git 연동을 증명하지 않는다 (`AGENTS.md` §1.1).
- 유지보수 게이트와 바이패스의 **구현은 이 문서 범위 밖**이며 §7 P1~P3의 선행 조건으로만 다룬다.
