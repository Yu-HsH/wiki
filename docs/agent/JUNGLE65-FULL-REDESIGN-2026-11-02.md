# Jungle65 전체 프론트엔드 리디자인 · 통합 로컬 검수

기준: **`bd87c4dd88857b74da19c585660c8c65f605b91e` + 시작 시 기존 미커밋 변경 + 이번 미커밋 변경, 2026-11-02 KST**. 아래 모든 수치·판정은 이 기준과 날짜다. 브랜치 `feat/jungle65-design-20261030`, Windows / Node 24.18.0 / npm 11.16.0 / 기존 package-lock / 설치 Chromium. [코드] 제품 소스, [산출물] 실제 실행 로그·화면, [미검증] 이번에 입증하지 않은 범위.

**[전체 비교 HTML](../../.temp/jungle65-full-review/comparison.html)** · **[스크린샷 ZIP](../../.temp/jungle65-full-review/Jungle65_Full_Review_2026-11-02.zip)** · [파일별 캡처 해시](../../.temp/jungle65-full-review/review-manifest.json)

## 1. 완료 범위와 미완료 구분

요청한 A~E **5개 구현 단위의 로컬 UI 작업 완료**. 그룹 대기방, 세 모드 HUD, 결과, 랭킹·프로필·업적, 공통 가이드·모달·폰트에 적용했다. **44개 화면·상태, 해상도별 116쌍**, 주요 영역 확대를 포함해 **169쌍 / PNG 338개**를 보관한다. 같은 fixture와 같은 해상도로 보존 원본과 현재 제품을 실행했다 [산출물: 비교 HTML·manifest].

실제 서버·실휴대전화·Safari 회귀는 미완료이며, 로컬 UI 완료율에 섞지 않는다. 추가 일러스트·새 기능·새 보상·의존성·폰트 바이너리는 만들지 않았다. **commit / push / main 병합 / 운영 DB·RPC·Edge·Vercel 변경 없음.**

작업 전 `CURRENT.md`는 `078a690` / 2026-10-29로 HEAD보다 **57커밋, 문서 날짜 기준 4일** 뒤처져 있음을 보고했다. 브랜치와 후속 구현 서술이 실제 작업 트리와 다르다. 디자인 트랙 예외에 따라 수정하지 않았다. 원격 ref·운영 배포 상태는 이번에 조회하지 않았다 [문서: `CURRENT.md`; 산출물: 시작 확인].

## 2. 수정 파일과 원본 보존

| 파일 | 변경 이유 |
|---|---|
| `appStyles.js` | 새 표시용 CSS 레이어 연결 |
| `css/jungle65Expedition.css` (신규) | 그룹 캠프·HUD·보고서·기록 화면·공통 모달의 단일 테마 레이어 |
| `css/jungle65Fonts.css` (기존 미추적 파일) | 기존 A+ 역할과 URL을 나머지 화면에 확장 |
| `components/wiki-race/WikiRaceShell.jsx` | 랭킹·프로필·업적에만 테마 클래스 부여 |
| `components/wiki-race/race/RaceParts.jsx` | 기존 경기 루트에 테마 클래스만 추가 |
| `components/wiki-race/race/GroupRaceParts.jsx` | 그룹 개인 완주 루트에 테마 클래스만 추가 |
| `components/wiki-race/result/ResultParts.jsx` | 공통 결과 루트에 테마 클래스만 추가 |
| `pages/GroupRoomPage.jsx` | 집결 캠프 표시·READY 구분·공용 프로필의 프레임/칭호·접근 가능한 프로필 모달 |
| `pages/RankingPage.jsx` | 기존 공개 프로필 모달을 공용 ExpeditionDialog로 감싸 키보드 접근성 보완 |
| `pages/PublicContentPage.jsx` | 기존 공개 문서에 테마 클래스만 추가 |
| `scripts/jungle65-full-{fixtures,smoke,supplement,review}.mjs` (신규 4개) | 격리된 fixture, 전체 UI/터치 검증, 오프라인 비교 자료 생성 |
| 본 문서 | 전체 결과·제약·통합 인계 |

시작 파일 **541개**의 SHA-256과 binary diff, 관련 소스 원본을 보관했다. **소실 0 / 기존 532개 SHA 동일 / 의도적으로 수정한 기존 파일 9개**다. 랜딩·로그인·HOME·PLAY·공개방·1:1 대기방 JSX와 기존 스모크 스크립트 원문은 시작 시와 동일하다. `public/`의 로고·HOME 배너·음원·에셋도 동일하다 [산출물: `.temp/jungle65-full-review/{starting-status.txt,starting.patch,preservation-before.json,preservation-after.json,preserved/}`].

새 CSS는 `.wr65-field`, 그룹 캠프, 공개 가이드로 범위를 한정했다. 승인된 페이지는 원본 마크업·이미지를 보존하고 기존 폰트 역할만 확장했다. reset / clean / restore / stash / 사용자 파일 삭제는 수행하지 않았다.

## 3. 화면별 디자인 변경

| 화면 | 표시 변경과 유지한 동작 |
|---|---|
| 그룹 대기방 | 목재 헤더·방 코드·양피지 후보 보드·캠프 슬롯. 로컬 선택과 서버 제출/READY를 별도 문구로 표시. 실제 공용 ProfileCard의 사진·프레임·칭호, 방장/나/READY 표식. 비활성 사유와 승계 안내 유지 |
| 싱글 HUD | 목재 모드 표식, 금색 목표, 탐험 경로 수첩. 랜덤·직접 지정·오늘 코스의 기존 진입과 서버 시각 기반 출발 유지 |
| 1:1 HUD | 기존 상대 진행 정보·5개 아이템 슬롯에 양피지 장비 표현. 공격 Coral / 방어·발견 Teal 구분. 링크만 보기·검열·기권 확인·연결 상태 유지 |
| 그룹 HUD | 기존 참가자·남은 시간·순위/진행/종료 상태의 수첩 표현. 개인 완주→관전→최종 결과를 각각 확인 |
| 결과 | 양피지 보고서·목재 표지·금색 완주/서버 XP. 싱글/1:1 승패·기권/그룹 개인·최종 결과를 포함. 소리 설정 바가 결과 상단을 가리던 중첩을 72px 상단 여유로 보완 |
| 랭킹 | 금·은·동 TOP 3 게시판과 내 기록 분리. 오늘 동일 코스/주간 XP/레벨/이전 시간 기준·경로 열기 유지 |
| 프로필 | 탐험가 수첩·대표 카드·보유 보상·통계. 프레임·칭호/편집 기능을 유지하고 320px 닉네임 편집 버튼 잘림 보완 |
| 업적 | 탐험 도감 표지·분류·기록 카드·Purple 달성 표현. 원래 공개 진행도·보유 보상만 표시, 미발견 히든 이름·조건·총수 미노출 |
| 공통 | 기존 공개 가이드·아이템 설명·소리 설정·확인 모달·오류·로딩·빈 상태를 검수. 그룹/랭킹 공개 프로필은 기존 ExpeditionDialog를 재사용 |

## 4. 공통 폰트·색상·컴포넌트

- 큰 제목·모드·주요 CTA: 기존 Cafe24 Ssurround. 양피지/수첩 제목: Maru Buri Bold.
- 닉네임: Pretendard 600. 본문·설정·알림: Pretendard. 수치·타이머: Pretendard 700 / tabular numbers.
- 기존 세 웹폰트 **URL 동일**, 새 폰트/변환/설치/라이브러리 없음. 기존 `public/licenses/jungle65-fonts.html` 유지.
- Forest 배경 / 목재 헤더 / 양피지 정보면. Gold 목표·완주·보상, Blue 행동, Teal 발견·방어, Coral 공격·위험, Purple 칭호·업적.
- 기존 RaceFrame / ResultScreen / GroupResultA / ProfileCard / ExpeditionDialog를 재사용했다. 데이터 처리를 새 공통 함수로 합치지 않았다.

HUD의 display/paper/body/numeric 글리프를 Chromium CDP로 확인했다. 실제 Cafe24Ssurround / MaruBuri / Pretendard가 사용됐다. 기존 공개방·대기방 스모크에는 웹폰트 실패 시 시스템 fallback 검사도 포함된다 [산출물: `after/report.json` fontRoles, entry/duel 회귀 report].

## 5. 기존 게임 기능 보존 근거

`services/`, `hooks/`, `utils/`, `data/`, `supabase/`, `tests/`, `public/` 원문은 시작 시와 동일하다. `GamePage`, `MultiplayerGamePage`, `GroupGamePage`, WikiViewer, 아이템 컴포넌트, 인증 서비스도 수정하지 않았다. RaceParts·GroupRaceParts·ResultParts는 테마 클래스 제거 시 원문과 바이트 동일하다. GroupRoomPage의 상태/effect/검색·제출·READY·시작·이탈 핸들러는 import 추가를 제외한 렌더 전 구간이 동일하다 [산출물: `preservation-after.json`].

실제 HTML 링크 이동·이동 횟수·내 경로·싱글 F5·결과 F5, 그룹 READY 재조회·취소·재제출·방장 시작·서버 방장 승계 신호를 UI에서 재현했다. 그룹의 정원/기본 6명·3명 이상·전원 READY·서로 다른 page_id 조건·20분·무아이템은 기존 판정/서비스/단위 테스트를 유지했다.

XP는 기존 ResultXp와 응답의 원장만 표시한다. 캡처의 XP 숫자는 **서버 형식으로 만든 fixture 값**이며 실제 지급 증거가 아니다. 새 XP/보상/업적 계산·지급·중복 방지 규칙은 추가하지 않았다. 기존 UI 재현이 실서버 권위·동시성 보장이라는 뜻은 아니다.

## 6. 모바일·접근성

320 / 390 / 768 / 1024 / 1440px에서 주요 화면을 비교했다. 모바일 캠프는 내 후보를 먼저 보여주고 빈 슬롯을 인원 요약으로 대체한다. 긴 닉네임·칭호는 필요한 범위에서 줄바꿈한다. 8인 캠프도 별도 캡처했다.

기존 모바일 문서/HUD의 자연스러운 스크롤, 우측 문서 내비게이션, 문서 이동·최상단 복귀 코드는 유지했다. 1440px의 세 게임 문서 영역은 각각 800px를 넘는 읽기 폭을 확인했다. 로컬 캡처에서 페이지 가로 넘침은 없었다 [산출물: `after/report.json`].

실제 브라우저 터치 이벤트로 코드 복사와 프로필 열기, Tab 포커스 가두기·Escape·포커스 복귀, 링크 검열의 비활성 상태·F5 보존을 확인했다. 복사는 fixture clipboard의 성공 응답이다. 실제 스마트폰/가상 키보드/OS 글꼴 배율/Safari 검증은 아니다.

## 7. 전체 검증

| 검사 | 결과 |
|---|---|
| 시작 / 최종 전체 npm test | 각 746/746, 실패/skip/cancel 0 |
| A 그룹 관련 테스트 | 28/28 |
| B HUD·링크·아이템·그룹 시각 모델 | 93/93 |
| C 결과·원장 표시 | 37/37 |
| D 프로필·보상·업적 | 54/54 |
| npm run build | exit 0. 기존 500kB 초과 JS 청크 경고 유지 |
| git diff --check | exit 0 |
| 전체 UI fixture 수정 전 / 후 | 134 / 154 검사, 각 108개 기본 캡처 |
| 대기방·8인·터치·검열 보충 전 / 후 | 12 / 19 검사, 각 8개 캡처 |
| 기존 1:1 스모크 기능 회귀 | 92 검사 / 38개 캡처, 기능·접근성 오류 0 |
| 기존 공개방 스모크 기능 회귀 | 231 검사 / 40개 캡처, 기능·접근성 오류 0 |
| 최신 polish 스모크 | 156 검사, 원화·이미지 fallback·CTA·공개 문서·축소 동작 설정·키보드·가로 넘침 확인, 정상 페이지 오류 0 |
| 구형 design 스모크 | 미통과. 시작 상태부터 존재하던 `탐험가 로그인` 대화상자를 옛 이름 `로그인`으로 찾는 검사에서 중단. 제품 오류로 판정하지 않으며 최신 polish에서 해당 동작 재검증 |
| 비교 HTML | 10개 검사: 6개 분류 이미지 디코딩, 확대/축소/Escape, 320px, 스크립트 오류 0, 외부 요청 0 |

로그: `.temp/jungle65-full-review/{baseline-test.log,npm-test.log,stage-A-test.log,stage-B-test.log,stage-C-test.log,stage-D-test.log,build.log,diff-check.log,before.log,after.log,supplement-before.log,supplement-after.log,viewer-check.json}`. `package.json`에 lint 스크립트는 없어 별도 린트 실행은 하지 않았다.

**기존 스모크의 마지막 픽셀 동일 검사**는 이번에 변경하도록 요청한 그룹/공통 폰트를 보호 대상으로 취급해 실패했다. 해당 원본 스크립트와 실패 로그는 보존했다. 출력 경로·허용된 시각 차이 기록만 분리한 `.temp/.../{duel-regression-final,entry-regression-reviewed}.mjs` 사본에서 **기능 검사를 삭제/skip하지 않고** 재실행했다. 시각 동일 여부는 report의 visualComparison 배열에 남기고, 승인된 페이지 JSX·원화의 보존은 별도 SHA로 확인했다. 원본 스모크가 그대로 전부 통과했다고 보고하지 않는다.

design/polish 원본도 보존했고, 별도 출력 경로와 설치 Chromium·공식 폰트 응답을 연결한 사본으로 실행했다. `design-regression.log`에는 옛 dialog 이름 검사 실패를 그대로 남겼다. `polish-regression.log`는 현재 UI 문구를 사용하는 더 최신 검사이며 156개 모두 통과했다. 원본 design 스크립트의 문구 갱신은 이번 보존 범위 밖으로 남긴다.

## 8. 로컬 fixture와 실제 서버의 경계

실제 제품 React/CSS와 설치 Chromium을 실행했다. Auth/REST/RPC/Wikipedia/snapshot/Realtime/clipboard/XP 응답은 검사 프로세스 안의 합성 fixture다. 외부 실제 요청은 기존 공식 웹폰트 읽기뿐이다. 운영 Supabase로 fixture 요청을 전달하지 않았다.

실제 계정 로그인, 실서버 Realtime, 실제 Wikipedia와 snapshot의 결합, 실제 지급/중복 방지, 실제 다인 동시성은 이번 작업에서 미검증이다. UI가 표시한 성공은 이 서버 기능의 검증 결과가 아니다.

## 9. 남은 위험·시각적 제약

- 운영/실기기 통합 회귀 및 사용자 주관적 디자인 최종 판단은 남아 있다.
- 768px 프로필·긴 설명·업적 도감은 콘텐츠에 따라 세로 스크롤이 길다. 중요 정보/조작이 잘리는 대신 자연스럽게 이어지도록 했다.
- 공식 웹폰트 네트워크 실패 시 시스템 글꼴로 표시되어 세부 줄바꿈이 달라질 수 있다.
- 기존 큰 번들 경고는 별도 성능 과제다.
- 구형 `jungle65-design-smoke.mjs`의 dialog 이름 기대값은 현재 UI와 맞지 않는다. 해당 스크립트 자체의 갱신은 미완료이고, 최신 polish와 이번 UI 검사 결과로 대신 구분해 기록했다.
- `CURRENT.md`의 검색 소비 보안 후속 기록은 이번에 재검증·해결하지 않았다. 디자인 완료를 보안 해결/출시 승인으로 바꾸지 않는다. CURRENT 자체도 상단에 적은 대로 뒤처져 있다.

추가 필수 이미지 목록은 없다. 기존 일러스트와 CSS 장식으로 구현했다.

## 10. 운영 통합 전 다음 작업

먼저 비교 HTML에서 분류·해상도·확대 캡처를 검토한다. 실제 서버 통합 단계에서는 로그인/게스트, 1:1 두 계정·그룹 세 계정 이상, READY/시작/이탈/승계, 실제 링크 이동·아이템·마감, 결과·XP·F5 복구를 응답 대체 없이 확인해야 한다. 실휴대전화/Safari·큰 글꼴·실제 가상 키보드도 별도 확인한다.

통합 세션은 본 문서와 preservation-after를 근거로 CURRENT를 갱신한다. 이번 작업은 커밋/운영 반영을 승인하지 않는다. 다음 운영 변경과 main push는 AGENTS의 건별 승인 조건을 그대로 따른다.

재실행 명령:

```powershell
cd C:\Project\wiki-jungle65
npm test
npm run build
git diff --check
node scripts/jungle65-full-smoke.mjs
$env:JUNGLE65_FULL_PORT = '5232'
node scripts/jungle65-full-supplement.mjs
Remove-Item Env:JUNGLE65_FULL_PORT
node scripts/jungle65-full-review.mjs
```

`--before`는 이번 `.temp/jungle65-full-review/preserved/` 원본 보관 폴더가 필요하다. 다른 PC는 기존 설치 Chromium 경로를 `JUNGLE65_BROWSER_PATH`로 지정한다. 새 브라우저·의존성을 자동 설치하지 않는다.
