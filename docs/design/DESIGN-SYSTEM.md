# 디자인 시스템 — 최소판

작성: 2026-10-03 (16d-0) · 상태: **최소 등재.** 디자인 작업에서 확정된 시스템 중 **16d(배지 폐지 · 프레임 단계 · 경기 표현)가 쓰는 부분만** 옮겼다 `[사용자 결정, 2026-10-03 — docs/agent/16-HANDOFF.md §10]`.
**디자인 세션이 이 문서를 확장한다** — 배경 패턴 · 타이포 스케일 · 간격 · 그림자 · 컴포넌트는 아직 없다.

---

## 1. 팔레트 — 5색

| 이름 | 값 | 의미 |
|---|---|---|
| 파랑 `blue` | `#2E6DB4` | 링크 · 현재 · 플레이 |
| 보라 `purple` | `#6E56C9` | 방문 · 기록 |
| 금 `gold` | `#B98A12` | 목표 · 승리 |
| 청록 `teal` | `#1D8B81` | 발견 · 위키 |
| 산호 `coral` | `#DE5F49` | 반응 · 경고 |

### 1.1 색을 쓰는 곳

- **테두리 · 노드 · 아이콘 · 경로에만** 쓴다.
- **배경 채움 금지** — 면을 팔레트 색으로 칠하지 않는다.
- 바탕은 **종이 톤**이다. 정확한 값은 디자인 세션이 정한다 `확인 필요`.
- 서체: **Pretendard Variable**.

> **현재 앱 토큰과의 관계.** `css/app.css`의 `--brand`(`#00a495`) 등 기존 토큰은 이 팔레트 이전 것이다.
> 앱 전체를 이 팔레트로 옮기는 일은 디자인 세션 범위이고, 16d는 **프레임 · 경로 색상 · 완주 효과**에만 이 팔레트를 쓴다.

## 2. 프로필 프레임 — 단계

프레임은 아이콘 둘레의 링이다 (Freeze v1 "Frame=아이콘 2중 테두리"). 단계는 보상의 `asset_ref` 토큰으로 정한다 (§4).

| 토큰 | 모양 |
|---|---|
| `frame:tier-1` | 1px 잉크 링 (잉크 = 본문 글자색) |
| `frame:tier-2` | 이중 링 |
| `frame:tier-3` | 금 링 |
| `frame:special` (히든) | 청록 점선, 회전 — **`prefers-reduced-motion: reduce`이면 정적** |

## 3. 경기 표현 — 경로 색상 · 완주 효과

| 토큰 | 뜻 |
|---|---|
| `path:<이름>` | 결과 화면 경로 타임라인의 선·노드 색. **이름은 §1의 5색 중 하나만** (`path:blue` · `path:purple` · `path:gold` · `path:teal` · `path:coral`) |
| `finish:tier-1` · `finish:tier-2` · `finish:tier-3` · `finish:special` | 결과 화면의 완주 연출. 단계가 오를수록 금(목표·승리) 링이 두꺼워지고, tier-3·special은 한 번 퍼지는 링이 더해진다. **모션 감소면 정적.** 임시 — 디자인 세션이 교체한다 |

적용 범위 (16d 판정 4): **싱글** 결과 화면 = 경로 색상 + 완주 효과 · **1:1** = 승자 카드에 완주 효과만 · **그룹** = 동결로 제외.

## 4. `asset_ref` 토큰 문법

| 형태 | 쓰는 kind |
|---|---|
| `/profile-icons/…svg` (루트 상대 URL) | `profile_icon` — 그대로 `<img src>` |
| `frame:tier-1` · `frame:tier-2` · `frame:tier-3` · `frame:special` | `frame` |
| `finish:tier-1` · `finish:tier-2` · `finish:tier-3` · `finish:special` | `finish_effect` |
| `path:blue` · `path:purple` · `path:gold` · `path:teal` · `path:coral` | `path_color` |
| `null` | 아트·토큰 없음 — 기본 모양으로 떨어진다 |

**프론트는 `reward_id`로 모양을 정하지 않는다** — 히든 보상 ID가 JS에 들어가면 G5를 깬다 (`docs/agent/16-HANDOFF.md` §4). 알 수 없는 토큰은 기본 모양으로 그린다.

## 5. 획득형 프로필 아이콘 — 임시 SVG

기본 6종(`public/profile-icons/*.svg`)과 같은 형식: `viewBox="0 0 64 64"` · 바탕 `#334155` 사각형 · 선 `#e2e8f0` 3px 둥근 끝 · `<title>`.
**히든 보상 아이콘은 불투명 파일명 + 일반 `<title>`** (16d 판정 5) — `public/`은 누구나 받을 수 있다. 화면의 대체 텍스트는 서버 표시명을 쓴다.
