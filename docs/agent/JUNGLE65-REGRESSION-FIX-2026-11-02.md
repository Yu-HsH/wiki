# Jungle65 최종 디자인 회귀 보완

기준: **`bd87c4dd88857b74da19c585660c8c65f605b91e` + 작업 시작 시 기존 미커밋 변경 + 이번 미커밋 보완, 2026-11-02 KST**. 아래 모든 수치와 판정은 이 기준/날짜다. Windows · Node 24.18.0 · npm 11.16.0 · 기존 lockfile · 설치 Chromium. [코드] 제품/검증 소스, [산출물] 실행 로그·화면, [미검증] 이번에 확인하지 않은 것.

**[전후 비교 HTML](../../.temp/jungle65-regression-fix-20261102/comparison.html)** · **[PNG ZIP](../../.temp/jungle65-regression-fix-20261102/Jungle65_Regression_Fix_2026-11-02.zip)** · [캡처·해시 목록](../../.temp/jungle65-regression-fix-20261102/review-manifest.json)

## 1. 작업 요약

- **P0 완료:** 모바일 그룹 캠프를 압축했다. 내 후보/READY를 앞에 두고 사진·프레임·칭호·나/방장·준비 상태·이탈/승계·명단 접기·시작 조건/거부 사유를 유지했다.
- **P1 HUD 점검 완료:** 실제 터치와 좌표 검사에서 조작 방해가 재현되지 않아 **HUD 제품 코드/CSS는 수정하지 않았다**.
- **P1 구형 스모크 수정 완료:** 현재 로그인/가입 대화상자 이름과 실제 CTA 버튼을 검사한다. 기존 기능 검사와 보호 화면의 시각 검사를 분리하고 엄격한 픽셀 비교를 추가했다.

전체 테마를 다시 만들지 않았다. 게임·READY·인증·RPC·권한·보상 계산 변경, DB/Edge/Vercel 적용, commit/push/main 병합은 없다.

## 2. 모바일 높이와 PNG

같은 참가자·긴 닉네임·장착 정보·READY 상태·폰트, DPR 1, 모바일 844px 높이의 실제 제품 UI로 전후를 측정했다. 아래 세 기준은 사용자 제공 표의 리디자인 후 높이를 **그대로 재현**했다 [산출물: `before/focused-report.json`, `after/focused-report.json`].

| 표본 | 이번 수정 전 | 이번 수정 후 | 감소 | 리디자인 이전 참고값(사용자 제공) |
|---|---:|---:|---:|---:|
| 3명 · 390px | [1907px](../../.temp/jungle65-regression-fix-20261102/before/camp-3-390.png) | [1299px](../../.temp/jungle65-regression-fix-20261102/after/camp-3-390.png) | 608px · 31.9% | 1369px |
| 3명 · 320px | [2010px](../../.temp/jungle65-regression-fix-20261102/before/camp-3-320.png) | [1396px](../../.temp/jungle65-regression-fix-20261102/after/camp-3-320.png) | 614px · 30.5% | 1500px |
| 8명 · 390px | [2382px](../../.temp/jungle65-regression-fix-20261102/before/camp-8-390.png) | [1582px](../../.temp/jungle65-regression-fix-20261102/after/camp-8-390.png) | 800px · 33.6% | 1613px |

세 표본 모두 리디자인 이전 참고 높이보다도 낮다. 8명 기준 표본은 원래 비교 캡처처럼 방장 READY·번갈아 준비·장착 보상 없음이다. **장착 정보를 숨겨 높이를 맞춘 것이 아니다.** 별도의 8명 전원 프레임/칭호 장착 표본은 390px **2492→1619px**, 320px **2595→1716px**이며, 사진·장착 프레임·칭호·긴 이름이 실제로 렌더되고 잘리지 않는지 검사했다.

3명 768/1440px과 두 8인 표본의 768/1440px, 총 **6쌍은 PNG 바이트까지 동일**하다. 모바일 밖의 그룹 디자인을 유지했다 [산출물: `desktop-pixel-check.json`].

선택/READY/취소/승계/참가자/접기와 HUD, 보호 화면까지 **59쌍 / PNG 118개**를 비교 HTML에 묶었다. 각 패널은 내부 스크롤·원본 PNG 열기·키보드 확대/Escape를 지원한다.

## 3. 수정한 파일과 이유

| 파일 | 변경 이유 |
|---|---|
| `css/jungle65Expedition.css` | 기존 모바일 media block의 **그룹 선택자만** 수정. 헤더/반복 안내/여백 압축, 검색 입력과 검색 버튼 한 줄, 참가자 compact 표시, 중복된 후보 READY/문서 종류와 장식 코스 도식 정리 |
| `pages/GroupRoomPage.jsx` | 기존 문구의 영어 표제와 연결 상태의 중복 설명에 span만 추가하여 모바일에서만 숨김. 상태·effect·핸들러·READY 판정은 원문 동일 |
| `scripts/jungle65-design-smoke.mjs` | 현재 접근성 이름·실제 CTA로 검사 갱신. 로그인/가입 포커스 검사, 기능/시각 결과 분리, 별도 출력·보존 소스·픽셀 기준 지원, 실제 공식 폰트 읽기와 안정된 캡처 상태 |
| `scripts/jungle65-full-fixtures.mjs` | 이번 결과를 이전 리뷰 폴더와 분리하는 경로 옵션. 실행별 Vite 캐시 격리로 검증 프로세스끼리의 최적화 캐시 충돌 방지 |
| `scripts/jungle65-regression-fix-smoke.mjs` (신규) | 모바일 높이·장착/긴 이름·READY·역할·이탈/승계·HUD 터치/가림/뷰포트 검증 |
| 본 문서 (신규) | 근거·한계·통합 인계 |

시작 파일 **547개**의 SHA-256·관련 원본·binary diff를 `.temp/jungle65-regression-fix-20261102/`에 보관했다. 기존 **4파일만 의도적으로 변경**, **543파일 SHA 동일, 소실 0**이다. 서비스·hook·DB·이미지·음원·폰트·의존성·다른 페이지 원문은 그대로다 [산출물: `preservation-{before,after}.json`, `starting.patch`, `preserved/`].

CSS의 비모바일 부분과 그룹 뒤의 다른 모바일 화면 선언도 원문 동일하다. 새 폰트·에셋·패키지·외부 API 추가는 없다. 기존 `.temp/jungle65-full-review/`와 이전 비교 자료는 덮어쓰지 않았다.

## 4. 압축하면서 유지한 것

모바일 상단에서 후보/코스/시작 조건에 이미 있는 안내를 반복하지 않는다. 정상 연결 설명은 짧은 상태 문구만 보여주고, **연결 문제 때의 재접속 안내는 계속 표시**한다. 후보 보드의 중복 READY 표식은 정리했지만, 제출 상태 문구와 내 참가자 READY는 남겼다. 후보 제목/준비 취소/재선택은 그대로다.

참가자의 READY는 이름 오른쪽에 두고, 이름 줄에는 그 공간을 예약했다. 칭호는 그 아래의 전체 본문 폭을 사용한다. Avatar 크기·프레임·FULL density·칭호 데이터를 변경하지 않았다. 긴 이름과 칭호는 줄바꿈하며 생략하거나 line-clamp하지 않는다. 프로필 클릭 영역은 44px 이상 유지한다.

시작 조건·비활성 사유는 숨기지 않았다. 명단을 접어도 후보 보드·조건·버튼이 남는지 확인했다. 3~8명/기본 6명/전원 READY/서로 다른 page_id/방장 권한은 기존 서비스와 판정을 유지한다. **GroupRoomPage의 렌더 전 상태·effect·핸들러 구간은 원문 동일**하다.

## 5. HUD 점검 — 변경 없음

실제 React UI에서 320/390px 터치 컨텍스트로 점검했다 [산출물: `after/focused-report.json`의 hud, `hud-*.png`, `link-index-*.png`].

- 슬롯 실측은 **320px에서 54×46px, 390px에서 64×46px**였다. 다섯 슬롯 모두 44px 이상이고, 두 폭에서는 마지막 슬롯까지 한 줄에 보여 가로 스크롤이 필요하지 않았다. 마지막 슬롯의 화면 내 위치와 포인터 hit도 확인했다.
- 하단 바는 높이 65px이며 844px 및 **640px로 줄인 뷰포트** 안에 있었다.
- 문서 끝까지 스크롤한 뒤 마지막 링크의 중앙 hit를 검사했다. 아이템 바에 가리지 않았으며, 실제 문서 링크 터치로 기존 이동이 일어났다.
- 페이지 상단에서 ‘링크만 보기’를 터치해 열고, 닫기 버튼이 소리 바에 가리지 않는지 확인했다. 기존 feedback 위치 계산을 유지했다.
- 아이템 시트 Escape·소리 패널 열기/Escape·문서 탐색이 정상 동작했다.

이 결과는 가상 터치/뷰포트 검증이다. 실제 손가락·모바일 브라우저 주소창/하단 UI·OS safe area·실제 키보드·Safari의 검증으로 확장하지 않는다. 재현된 문제가 없어 HUD 레이아웃 계약은 그대로 두었다.

## 6. 구형 검증 스크립트의 정합성

로그인 이름은 소스의 **`탐험가 로그인`**, 가입은 **`새 탐험가 등록`**이다. 두 모드 모두 Enter로 열기, 입력 초기 포커스, Tab/Shift+Tab 각 14회 가두기, Escape, 원래 버튼으로 포커스 복귀를 검사한다. 예전 카드 전체 버튼 가정은 실제 `.wr-mode-action`의 포커스·Enter·터치·disabled/게스트 제한 검사로 갱신했다. 실패 검사 삭제나 무조건 성공 처리는 없다.

결과는 `functionalChecks`와 `visualChecks`로 분리한다. 이번 실행은 **기능 52 / 시각 32 = 84검사 통과**, 그중 **랜딩/HOME/PLAY 15쌍의 SHA-256 동일성을 엄격하게 assert**했다 [산출물: `design-after/report.json`, `design-after.log`].

픽셀 비교는 포인터를 화면 모서리의 중립 위치로 이동시키고 전환 애니메이션을 고정한 상태로 수행한다. 실제 hover·active·focus 검사는 별도 기능 검사로 남았다. 고정된 Date는 HOME 조회 시각 표시를 안정화하며 타이머를 가짜 성공으로 넘기지 않는다. 픽셀 차이를 허용 오차로 덮거나 검사 영역을 지우지 않는다.

예상 변경 대상인 그룹 모바일은 **높이/프로필/READY/권한 검증**으로 판단하고, 보호 대상인 랜딩/HOME/PLAY는 **픽셀 동일성**으로 판단한다. 구형 `--before`의 역사적 캡처 모드는 남겨 두었지만, 이번 보호 기준 실행은 `SOURCE_ROOT` 옵션으로 보존 소스를 로드하고 **모든 기능 검사를 활성화**했다.

## 7. 검증 결과

| 검사 | 결과 |
|---|---|
| `npm test` | **746/746**, fail/skip/cancel 0 |
| `npm run build` | exit 0, 기존 500kB 초과 JS 청크 경고 유지 |
| `git diff --check` | exit 0 |
| 집중 UI 전 / 후 | **76 / 78검사 통과**, 320/390/768/1440px·기본/전원 장착·긴 이름 |
| 기존 전체 화면 UI 전 / 후 | **134 / 154검사 통과**, 각 108개 캡처 |
| 1:1 대기방/프로필/검열/F5 보충 전 / 후 | **12 / 19검사 통과** |
| 갱신 디자인 스모크 | **84검사**, 오류 0, 보호 픽셀 15/15 |
| 태블릿/데스크톱 그룹 | 픽셀 6/6 동일 |
| 비교 HTML | 9검사: 이미지 로딩·확대/Escape/포커스 복귀·320px·오프라인, 오류/외부 요청 0 |

검사 중 병렬 Vite가 공유 최적화 캐시를 바꾸어 `504 Outdated Optimize Dep`가 한 번 발생했다. 오류를 필터링하지 않고 실행별 cacheDir로 격리한 뒤 같은 검사를 통과시켰다. 당시 실패도 `optimizer-collision*`에 보관했다. 제품 문제나 실제 Supabase 오류로 분류하지 않는다.

실행 근거는 `.temp/jungle65-regression-fix-20261102/`의 `npm-test.log`, `build.log`, `diff-check.log`, `{before,after}.log`, `full-{before,after}.log`, `supplement-{before,after}.log`, `design-{before,after}.log` 및 대응 JSON이다.

## 8. 남은 미검증 사항과 다음 작업

Auth/REST/RPC/Wikipedia/snapshot/Realtime/clipboard/XP 응답은 **합성 fixture**다. 제품 React/CSS/키보드/터치 이벤트를 실행했지만 실제 서버 권한·동시성·지급·실계정 데이터는 이번 검증 대상이 아니다. 실제 모바일/Safari와 브라우저 UI, OS 키보드도 남아 있다. 디자인 변경으로 기존 보안 과제가 해결됐다고 판단하지 않는다.

`CURRENT.md`는 시작 시 `078a690`/2026-10-29로 HEAD보다 **57커밋·문서 날짜 기준 4일** 뒤처져 있음을 보고했다. 트랙 예외에 따라 수정하지 않았다. 본 문서가 통합 인계 자료이며, 이번 작업은 commit/push/운영 적용을 승인하지 않는다.

다음은 모바일 PNG/비교 HTML 확인과 실제 휴대전화에서의 최종 체감 확인이다. 이번 로컬 수정 이후 별도 운영 적용은 수행하지 않았다.

재확인 명령:

```powershell
cd C:\Project\wiki-jungle65
npm test
npm run build
git diff --check
$env:JUNGLE65_FULL_TASK = '.temp/jungle65-regression-fix-20261102'
$env:JUNGLE65_FULL_PORT = '5241'
node scripts/jungle65-regression-fix-smoke.mjs
```

보호 픽셀 비교는 이번 `design-before/` 기준이 필요하다:

```powershell
$env:JUNGLE65_DESIGN_OUTPUT = '.temp/jungle65-regression-fix-20261102/design-after'
$env:JUNGLE65_DESIGN_VISUAL_BASELINE = '.temp/jungle65-regression-fix-20261102/design-before'
$env:JUNGLE65_DESIGN_PORT = '5243'
node scripts/jungle65-design-smoke.mjs
```

다른 PC는 설치 Chromium 경로를 `JUNGLE65_BROWSER_PATH`로 지정한다. 새 브라우저/의존성을 자동 설치하지 않는다.
