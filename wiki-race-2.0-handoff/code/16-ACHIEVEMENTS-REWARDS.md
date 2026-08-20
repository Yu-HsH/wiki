# 기능 패킷 05 — 업적·보상 카탈로그

기준 문서: `../01-CONFIRMED-SPEC.md`  
목표: 코드 재배포 없이 업적을 추가·비활성화할 수 있고, 서버 결과에서 한 번만 달성·보상되는 구조 구현

## 1. 공통 규칙

- 일반 업적은 이름·조건·진행도·보상을 공개한다.
- 히든 업적은 달성 전 모든 정보를 숨긴다.
- 달성 즉시 보상을 자동 지급하며 `보상 받기` 버튼을 두지 않는다.
- 기본 단계 XP: 30 / 60 / 120.
- 업적 XP는 주간 탐험가 점수에 포함하지 않는다.
- 게임 능력치를 높이는 보상은 없다.
- 동일 이벤트 재처리로 업적·보상이 중복되지 않는다.
- 업적 ID는 출시 후 바꾸지 않는다.
- 삭제 대신 `active=false` 또는 `retired=true`로 기록을 보존한다.
- 누적 통계 업적은 기존 데이터로 소급할 수 있다.
- 특정 경기 상황 업적은 근거 이벤트가 없으면 활성화 이후부터 판정한다.
- 머리·얼굴·의상·손 4부위 조합형 아바타와 아바타 프리셋은 구현하지 않는다.
- 보상 카탈로그, 보유 inventory, 장착 상태를 분리하고 장착은 서버가 보유 여부를 검증해 확정한다.
- 프로필 꾸미기는 시스템 제공 아이콘/일러스트 4~6종, 대표 칭호, 대표 배지 최대 3개, 프레임, 배경, 경로 색상·효과, 완주 효과, 관전 이모티콘으로 제한한다.
- 사용자 이미지 업로드는 구현하지 않는다.
- 경기 아이템 inventory는 업적 보상 inventory와 별도 시스템으로 유지한다.

### 1.1 Legacy 보상 종류 대응

| 기존 보상 종류 | 2.0 프로필 카드 대응 |
|---|---|
| 머리 장식 | 배지 또는 프로필 아이콘 |
| 얼굴 장식 | 프로필 프레임 |
| 의상 | 프로필 배경 또는 특별 프로필 일러스트 |
| 손 아이템 | 관전 이모티콘 또는 배지 |
| 의상 세트 | 프레임+배경 reward bundle |
| 4부위 장착 | 프로필 카드 설정 완료 |

기존 데이터가 발견되면 위 대응은 새 보상의 의미를 정하는 기준으로만 사용한다. 사용자 레코드를 삭제하거나 일괄 변환하는 근거로 사용하지 않는다.

## 2. 초기 일반 업적 18계열

구체적인 profile cosmetic asset ID는 제작 단계에서 연결하되 안정적인 reward/reward bundle ID와 보상 종류·단계는 유지한다. 없는 4부위 에셋을 새로 만들거나 임의의 최종 아트로 채우지 않는다.

### 2.1 초반 안내 4

| ID 예시 | 이름 | 조건 | 주요 보상 |
|---|---|---|---|
| `onboarding_tutorial` | 첫걸음 | 핵심 튜토리얼 완료 | 종이 지도 계열 배지 또는 프로필 아이콘 |
| `onboarding_first_finish` | 첫 도착 | 처음으로 정상 완주 | 기본 배지 |
| `onboarding_all_modes` | 모든 길의 시작 | 랜덤·목표 지정·오늘·1:1·그룹 각 1회 정상 완료 | 동명 칭호 |
| `onboarding_profile_complete` 후보 | 준비된 탐험가 | 프로필 아이콘 선택 + 대표 칭호 또는 배지 1개 장착 | 기본 프로필 프레임 |

`onboarding_full_avatar`가 코드·운영 DB·사용자 해금 기록에 사용됐으면 조건을 덮어쓰거나 ID를 재사용하지 않는다. 기존 정의와 해금은 legacy/retired로 보존하고 `onboarding_profile_complete`를 신규 ID로 추가한다. 미배포 상태이며 사용자 기록이 없다는 사실이 확인될 때만 기존 후보 ID를 안전하게 이름 변경할 수 있다.

### 2.2 일반 탐험 4

| 이름 | 단계 조건 | 주요 보상 방향 |
|---|---|---|
| 꾸준한 탐험 | 랜덤 탐험 10 / 50 / 200회 완주 | 경로 색상·프로필 배경 |
| 정해진 목적지 | 목표 지정 5 / 25 / 100회 완주 | 칭호·배지 |
| 넓어진 세계 | 고유 문서 100 / 500 / 2,000개 방문 | 프로필 프레임 |
| 더 나은 길 | 동일 코스 개인 기록 5 / 20 / 50회 단축 | 완주 효과 |

고유 문서는 canonical ID로 한 번만 집계한다.

### 2.3 오늘의 탐험 3

| 이름 | 단계 조건 | 주요 보상 방향 |
|---|---|---|
| 오늘도 탐험 | 서로 다른 날짜의 코스 10 / 50 / 200개 완주 | 배지 또는 프로필 아이콘 |
| 오늘의 올클리어 | 하루 세 코스 완료 1 / 10 / 50회 | 프로필 프레임+배경 reward bundle |
| 이어지는 발걸음 | 서로 다른 날짜에 7 / 30 / 100일 참여 | 칭호·완주 효과 |

연속 출석 스트릭이 아니라 누적 참여일이다.

### 2.4 1:1 4

| 이름 | 단계 조건 | 주요 보상 방향 |
|---|---|---|
| 맞수와의 만남 | 정상 대전 10 / 50 / 200회 완료 | VS 테두리 |
| 승부사 | 10 / 50 / 150승 | 칭호·완주 효과 |
| 순수한 승부 | 비아이템전 10 / 50승 | 배지·프로필 배경 |
| 완벽한 대응 | 편집 보호·되돌리기·역링크 성공 합계 10 / 50회 | 방패형 배지 또는 이모티콘 |

기권·잠수·XP 0% 반복 경기는 정상 대전 진행도에서 제외한다.

### 2.5 그룹 3

| 이름 | 단계 조건 | 주요 보상 방향 |
|---|---|---|
| 함께하는 탐험 | 그룹 레이스 10 / 50 / 200회 정상 완주 | 그룹 배지·프로필 배경 |
| 여덟 명의 원정대 | 8인 방에서 정상 완주 | 칭호 `원정대원` |
| 끝까지 함께 | 완주 후 최종 종료까지 10회 관전 유지 | 관전 이모티콘 |

`끝까지 함께`는 관전 진입 뒤 실제 방 종료까지 연결을 유지해야 한다.

## 3. 추후 활성화 가능한 일반 업적

초기 엔진이 지원하되 아트·운영 시점에 활성화한다.

- 한 번도 겹치지 않은 길
- 오늘의 선두권
- 변수의 주인
- 앞서가는 탐험가
- 선두 도착
- 수집함이 북적북적
- 이름 앞의 한마디

4부위 장착이나 아바타 프리셋을 전제로 한 기존 후보 업적은 2.0에서 활성화하지 않는다. 이미 배포된 ID가 발견되면 삭제하지 않고 legacy/retired 상태로 보존한다.

## 4. 히든 업적 13개

| ID 예시 | 이름 | 서버 판정 조건 | 유형/XP | 보상 방향 |
|---|---|---|---:|---|
| `hidden_one_move` | 출발했는데 도착입니다 | 랜덤·목표 지정·오늘에서 정확히 1회 이동 완주 | 재미 30 | `한 칸이면 충분해` 칭호·배지 |
| `hidden_redirect` | 새 문서인 줄 알았는데요? | raw title과 canonical title이 다른 redirect 이동을 포함해 완주 | 발견 60 | 순환 화살표 배지 또는 프로필 아이콘 |
| `hidden_improve_one` | 한 칸만 줄여 달랬잖아요 | 동일 코스 기록을 정확히 1이동 단축 | 재미 30 | `한 칸의 차이` 칭호·경로 색상 |
| `hidden_disjoint_retry` | 전과 다른 길입니다, 정말로요 | 두 경로 모두 5회 이상이며 이전 완주와 중간 canonical 문서가 겹치지 않음 | 도전 120 | 갈림길 경로 효과 |
| `hidden_daily_same_moves` | 오늘 숫자는 이걸로 통일합니다 | 하루 세 오늘 코스를 같은 이동 횟수로 완주 | 재미 30 | `똑같네?` 이모티콘 |
| `hidden_attack_helped` | 그 공격, 길 안내 맞죠? | 잘못된 링크를 받은 뒤 되돌리기 없이 다음 2회 이동 이내 완주·승리 | 발견 60 | 이정표 배지 또는 이모티콘 |
| `hidden_return_to_sender` | 반송 처리되었습니다 | 역링크로 공격을 반사하고 같은 경기 승리 | 도전 120 | 움직이는 역링크 테두리 |
| `hidden_swap_win` | 남의 문서가 더 가까웠다 | 문서 맞교환 뒤 직접 링크 3회 이내 완주·승리 | 도전 120 | 문서 교환 완주 효과 |
| `hidden_random_win` | 특수:운이_좋았습니다 | 특수:임의 문서 뒤 직접 링크 5회 이내 완주·승리 | 발견 60 | 주사위 지구본 프로필 아이콘 또는 배지 |
| `hidden_same_document` | 여기 제 자리인데요? | 양쪽이 시작·목표가 아닌 같은 중간 canonical 문서를 동시에 봄, 경기 정상 종료 | 재미 30 | 겹친 문서 배지·이모티콘 |
| `hidden_same_group_path` | 앞사람만 따라왔습니다 | 같은 그룹의 다른 완주자와 전체 canonical 경로 일치 | 재미 30 | 발자국 이모티콘·칭호 |
| `hidden_three_disjoint` | 어디서들 오셨어요? | 1·2·3위의 중간 canonical 경로가 서로 겹치지 않음 | 도전 120 | 세 갈래 경로 배경 |
| `hidden_three_close` | 문은 하나인데 세 분이 오셨네요 | 서버 finished_at 기준 1·2·3위가 1초 안에 연속 완주 | 발견 60 | 동시 도착 이모티콘·배지 |

그룹 히든 지급 대상:

- 동일 경로: 일치한 완주자들
- 세 경로 불일치: 1·2·3위
- 1초 동시 도착: 1·2·3위

## 5. 권장 데이터 구조

### 5.1 정의

- `achievement_definitions`
  - immutable `achievement_id`
  - category, hidden, active, retired
  - trigger type
  - condition payload/version
  - progress display policy
  - reward bundle ID
  - start/end time optional

### 5.2 상태

- `user_achievement_progress`
  - user/achievement/version
  - current value and condition-specific state
  - updated_at
- `user_achievement_unlocks`
  - user/achievement
  - source event ID
  - unlocked_at
  - unique constraint
- `reward_grants`
  - user/reward bundle/source unlock
  - idempotent unique constraint

### 5.3 보상 카탈로그·보유·장착

- `reward_catalog`
  - immutable reward ID, 종류, asset reference, active/retired
  - 프로필 아이콘/칭호/배지/프레임/배경/경로 색상·효과/완주 효과/관전 이모티콘
- `reward_bundles`, `reward_bundle_items`
  - 업적과 분리된 안정적인 bundle ID
  - 프레임+배경처럼 여러 보상을 한 번에 지급 가능
- `user_reward_inventory`
  - user/reward/grant source/acquired_at
  - 동일 지급의 idempotent unique constraint
- `user_profile_equipment`
  - 프로필 아이콘 1, 대표 칭호 1, 대표 배지 최대 3, 프레임 1, 배경 1
  - 경로 색상·효과, 완주 효과, 관전 이모티콘 선택 상태
  - 서버가 보유 inventory를 확인한 뒤 원자적으로 갱신

실제 테이블 이름과 기존 운영 데이터는 구현 직전 다시 감사한 뒤 확정한다. 기존 `profile_image_url`과 발견 가능한 4부위 값은 삭제하지 않고 legacy fallback으로만 읽는다.

## 6. 이벤트 계약

업적 엔진은 최소 다음 서버 확정 이벤트를 소비한다.

- tutorial completed
- document moved with movement type/raw/canonical
- exploration finished with course/path/time/moves
- duel item used/blocked/reflected/rolled back
- duel finished/forfeited/cancelled
- group player finished/retired/spectated until close
- daily three-course completion
- XP granted/level changed
- profile cosmetic equipped with authoritative equipment snapshot

## 7. 공개 UI

- 일반 업적: 단계·진행도·다음 보상 표시
- 히든 달성 전: 개별 카드와 총개수 모두 `??`
- 히든 달성 순간: `숨겨진 업적을 발견했습니다` 후 이름·조건·보상 공개
- 여러 업적 동시 달성: 결과 화면에서 묶어서 표시
- 자동 지급 상태를 명확히 표시
- 보유 보상만 장착할 수 있고 아이콘·칭호·배지·프레임·배경의 서버 저장 결과를 표시
- 시스템 제공 프로필 아이콘이 없거나 에셋 로딩에 실패하면 기본 이미지를 표시
- 모션 감소에서는 정적 reveal

## 8. 테스트

- 같은 이벤트 재처리 중복 해금·보상 차단
- 단계형 여러 단계 동시 통과
- canonical 중복 문서 집계
- redirect raw/canonical 판정
- item reflection/rollback 이벤트 연결
- group top3 경로 비교와 finished_at 경계
- hidden 비공개 API·UI 노출 방지
- active/retired/start/end 정책
- 소급 가능한 누적 업적과 소급 불가 상황 업적 분리
- guest 업적 미저장
- 보유하지 않은 꾸미기 보상 장착 거부
- 프로필 장착 상태의 새로고침·재로그인 유지
- 대표 배지 최대 3개와 단일 slot 제약
- 기존 `profile_image_url`/legacy avatar fallback
- guest의 영구 보상·장착 상태 생성 차단
- 경기 아이템 inventory 지급·소비·복구 회귀 없음

## 9. 검토 채팅 시작 프롬프트

```text
Wiki Race 2.0의 일반·히든 업적과 보상 시스템을 현재 코드/DB 기준으로 설계해줘.

`01-CONFIRMED-SPEC.md`, `16-ACHIEVEMENTS-REWARDS.md`, 저장소 감사 결과를 읽고 아직 수정하지 마. 현재 profile stats, history, item event, group result, XP 저장 구조가 18개 일반 계열과 13개 히든 조건을 판정할 근거를 갖는지 확인해.

업적 정의/진행/해금/보상 카탈로그/보유 inventory/장착 상태를 분리하고 ID 불변, active/retired, 기간 필드, idempotent 자동 지급, hidden 비공개, 소급 정책을 지원하는 최소 구조를 제안해. 4부위 아바타와 사용자 이미지 업로드는 구현하지 말고 시스템 아이콘·칭호·배지 최대 3개·프레임·배경·경로/완주 효과·관전 이모티콘만 다뤄. 기존 기록만으로 판정 가능한 업적과 신규 이벤트 로그가 필요한 업적을 표로 나눠줘.

`onboarding_full_avatar`의 코드·DB·사용자 기록을 먼저 확인해. 사용 중이면 기존 조건을 보존하고 legacy/retired 처리 후 `onboarding_profile_complete`를 추가하며, 미배포·기록 없음이 확인된 경우에만 안전한 rename을 제안해. 경기 아이템 inventory는 수정하지 마.

산출물은 구현 가능성 표, 데이터/이벤트 계약, 단계별 마이그레이션, UI API, 테스트, 승인 후 Codex 프롬프트 순서로 작성해줘.
```

## 10. 승인 후 Codex 구현 프롬프트

```text
승인된 업적·보상 계획을 구현해줘. `16-ACHIEVEMENTS-REWARDS.md`의 초기 일반 18계열과 히든 13개를 카탈로그 기반으로 정의하고, 서버 확정 이벤트에서 idempotent하게 진행·해금·자동 보상해.

달성 전 히든 정보가 API와 UI에서 노출되지 않게 하고, 업적 XP는 주간 gameplay XP 랭킹에서 제외해. profile cosmetic asset이 아직 없는 보상은 안정적인 reward ID/placeholder 상태로 연결하되 임의의 최종 아트나 4부위 에셋을 만들지 마. future active/retired/기간 업적을 코드 재작성 없이 추가 가능하게 해.

보상 catalog·bundle·보유 inventory·서버 확정 장착 상태를 분리하고, 보유하지 않은 보상 장착·guest의 영구 보상/장착 생성·배지 3개 초과를 차단해. `onboarding_full_avatar`의 실제 사용 여부에 따른 보존 정책을 지키고 경기 아이템 inventory는 그대로 유지해.

DB/RPC/RLS/단위 테스트, 중복 이벤트, 소급, group/item 히든, guest, hidden 노출, build를 검증하고 결과를 보고해. commit과 push는 하지 마.
```
