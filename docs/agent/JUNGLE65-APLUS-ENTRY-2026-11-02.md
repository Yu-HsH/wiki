# Jungle65 A+ 폰트·공개방 찾기 1차 구현

기준: **bd87c4dd88857b74da19c585660c8c65f605b91e + 기존 미커밋 디자인 작업 + 이번 미커밋 변경, 2026-11-02 KST**. 모든 실행 수치·화면 측정·판정은 이 기준/날짜다. Windows / Node 24.18.0 / npm 11.16.0 / 기존 package-lock.json / Chromium 151.0.7922.34. **commit·push·merge·운영 배포·DB/API/RPC/Edge/게임 로직 변경 없음.**

표기: [코드] 저장소 구현 / [문서] 참고 자료 / [산출물] 실제 실행 / [미확인] 이번 검증으로 입증하지 않은 것.

## 1. 시작 상태·기존 변경 보존

브랜치 `feat/jungle65-design-20261030`, HEAD `bd87c4d`는 이전 기준과 동일했다. 작업 전 테스트를 다시 실행해 **746/746** 통과했다. 시작 상태는 추적 수정 9파일과 기존 미추적 디자인 자료였다. 시작 diff, 전체 파일 해시, 수정 대상 원본을 보관했다 [산출물: `../../.temp/jungle65-aplus-20261102/starting-status.txt`, `starting.patch`, `preservation-before.json`, `preserved/`, `baseline-test.log`].

기존 535파일 중 533파일은 SHA-256 동일하고 소실 0이다. 의도적으로 수정한 기존 파일은 `pages/MultiplayerPage.jsx`와 `components/wiki-race/LobbyParts.jsx` 두 개뿐이다. 기존 미커밋 수정 9파일 및 기존 미추적 파일은 모두 보존했다. 대기방 두 JSX도 SHA-256 동일하다 [산출물: `scope.json`].

CURRENT는 078a690·2026-10-29 기준으로 현재보다 57커밋·문서 날짜 기준 4일 뒤처져 있고 브랜치·원격·후속 구현 기록이 맞지 않는다. 시작 전에 보고했다. 트랙 예외에 따라 CURRENT는 수정하지 않았고 운영 상태를 추정하지 않는다 [문서: `CURRENT.md`, `JUNGLE65-LOBBY-RESEARCH-2026-11-02.md`].

## 2. 수정 파일·실제 적용한 A+ 역할

| 파일 | 변경 이유 |
|---|---|
| [MultiplayerPage.jsx](../../pages/MultiplayerPage.jsx) | 공개방을 우선 배치하고 코드 참가·생성을 보조 영역으로 이동. 상태 표현과 게시판 헤더·카드 마크업. 기존 핸들러 유지 |
| [LobbyParts.jsx](../../components/wiki-race/LobbyParts.jsx) | 대기방 공통 진입점에서 새 폰트 CSS만 import. 컴포넌트 구조와 함수 본문 유지 |
| [jungle65Fonts.css](../../css/jungle65Fonts.css) | A+ 역할 변수와 온라인 로비에 한정한 서체·굵기 |
| [jungle65Lobby.css](../../css/jungle65Lobby.css) | 모집 게시판 색상·레이아웃·반응형·조작 크기 |
| [사용 글꼴 안내](../../public/licenses/jungle65-fonts.html) | 사용자 접근 가능한 공식 출처·이용 조건 고지 |
| [entry smoke](../../scripts/jungle65-entry-smoke.mjs) | 실제 React + 합성 백엔드로 기능·폰트·회귀 검증 |

새 CSS는 `.wr-page.wr-entry`·`.wr-page.wr-lobby`로 적용 범위를 제한한다. 기존 `--wr-font-body`, `--wr-font-heading`에 연결한다. 랜딩/HOME/PLAY의 제품 소스·레이아웃 CSS는 수정하지 않았다 [코드: 신규 CSS; 산출물: scope].

| 변수 / 영역 | 실제 서체·굵기 |
|---|---|
| `--wr65-font-display` / 큰 제목·모드·로비 제목·주요 CTA | Cafe24 Ssurround v2.0, 공식 CSS 선언 400(폰트 내부 이름은 Bold) |
| `--wr65-font-paper` / 양피지 제목·도움말 소제목 | Maru Buri 실제 Bold, 700 |
| `--wr65-font-player` / 플레이어·헤더 닉네임 | Pretendard Variable, 600 |
| `--wr65-font-body` / 설명·입력·오류·알림·작은 안내 | Pretendard Variable |
| `--wr65-font-numeric` / 인원·레벨·코드·로비 수치 | Pretendard Variable, 700 + tabular-nums |

실제 경기 HUD와 그 타이머에는 적용하지 않는다. 현재 로비에 존재하는 숫자 표시만 새 규칙으로 처리한다. `font-synthesis:none`으로 가짜 굵기를 피하고, swap·Apple SD Gothic Neo·Malgun Gothic·system-ui·바탕 계열 fallback을 둔다. 긴 닉네임은 필요한 곳에서 줄바꿈하며, 320px 버튼은 전체 폭으로 배치한다 [코드: 신규 CSS].

## 3. 폰트 로딩·라이선스·용량

기존 비교 HTML·REPORT·SOURCES를 확인했고 공식 출처도 재확인했다. 다른 폰트로 대체하지 않았다. [공식 글꼴 고지](../../public/licenses/jungle65-fonts.html)에 다음 근거를 기록했다.

- [카페24 공식](https://fonts.cafe24.com/) 및 [공식 CSS](https://img.cafe24.com/csdstatic/freefonts/data/1.0/fonts_ko.css): 써라운드 v2.0, 상업 이용·웹폰트·프로그램 임베딩 허용. 글꼴 자체 유료 판매 금지, 수정·재배포 OFL 유지, 프로모션 활용 안내 [문서/직접 조회].
- [네이버 공식](https://hangeul.naver.com/font) 및 [라이선스 안내](https://help.naver.com/service/30016/contents/18088?osType=PC&lang=ko): 마루 부리 상업 이용·웹폰트 허용. 저작권·라이선스 보존, 폰트 단독 유료 판매 금지. 출처 고지 [문서/조회].
- [Pretendard 1.3.9 LICENSE](https://github.com/orioncactus/pretendard/blob/v1.3.9/LICENSE): SIL OFL 1.1. 상업 게임 웹서비스 사용·임베딩 가능. 저작권·라이선스·예약명 조건 유지, 폰트 단독 판매 금지 [문서/조회].

로컬 정적 호스팅도 조건을 지키면 가능하지만, 전체 Pretendard Variable만 **2,057,688 bytes**이며 써라운드 **391,868**, 마루 부리 Bold **451,596**다. 이번에는 저장소 용량을 늘리지 않고 공식 CDN 원본을 사용했다. Pretendard는 제작자 공식 1.3.9 동적 서브셋 CSS를 참조한다. 직접 변환·서브셋 제작·폰트 바이너리 저장·재배포·npm 의존성 추가는 없다 [산출물: `font-source-check.json`; 코드: 폰트 CSS].

최종 스모크의 서로 다른 폰트 관련 응답 **17개 / 1,260,152 bytes**, 그중 Pretendard CSS·사용 서브셋 합 **416,688 bytes**였다. 이는 이 표본 문구·도움말·긴 닉네임에서 사용한 합이며 모든 사용자 문구에서 고정되는 수치가 아니다. 전부 HTTP 200, 실제 글리프의 PostScript 이름으로 제목·CTA·양피지·본문·닉네임·숫자 사용을 확인했다. 별도 강제 실패 컨텍스트에서는 시스템 폰트 렌더링과 가로 넘침 없음을 확인했다 [산출물: after/report.json의 fontNetwork·fontRoles, font-fallback-320.png].

공식 CDN만 직접 로딩하는 독립 브라우저 점검도 별도로 통과했다. 이 점검에는 request interception이나 CORS 헤더 가공이 없으며, 써라운드·마루 부리 Bold·Pretendard 600/700 로딩과 HTTP 200·요청 실패 0을 확인했다 [산출물: `../../.temp/jungle65-aplus-20261102/raw-font-audit.json`].

## 4. 공개방 찾기 전후

수정 전에는 생성·코드 참가 카드 뒤에 공개방이 있어 390px에서 첫 방 카드가 Y 1400px 이후에 보였다. 수정 후에는 목재 제목 → 기존 규칙·상태 안내 → 공개 목록이 먼저다. 데스크톱은 목록을 넓은 왼쪽, 코드 참가·생성을 오른쪽에 배치하고 1023px 이하에서는 목록 아래로 보조 영역을 내린다. 모바일 DOM/화면 순서는 공개방 → 코드 참가 → 생성이다 [코드: MultiplayerPage, jungle65Lobby.css].

그림 위 불투명 패널을 추가하지 않았다. 기존 색·목재 질감·양피지 정보면·작은 SVG 깃발과 점선 장식을 사용한다. 새 이미지는 없다. 방장 이름·인원·아이템 유무/그룹 표시만 서버 응답에서 읽고 방 코드를 만들어 표시하지 않는다. 로딩·빈 목록·조회 오류를 서로 다른 문구/톤과 role=status/alert로 표시한다. refresh/참가 pending 제한은 기존 조건을 유지한다 [코드: 위 파일].

## 5. 스크린샷·전후 비교

**[전후 비교 뷰어](../../.temp/jungle65-aplus-20261102/comparison.html)** — 1:1/그룹, 5개 해상도, 대기방 폰트, 랜딩/HOME/PLAY를 선택한다. 각 이미지 패널은 스크롤하고 클릭하면 원본을 연다. 폰트는 화면을 캡처하기 전에 실제 로딩했다.

| 화면 | 데스크톱 1440px | 모바일 390px | 소형 320px |
|---|---|---|---|
| 1:1 공개방 | [PNG](../../.temp/jungle65-aplus-20261102/after/duel-1440.png) | [PNG](../../.temp/jungle65-aplus-20261102/after/duel-390.png) | [PNG](../../.temp/jungle65-aplus-20261102/after/duel-320.png) |
| 그룹 공개방 | [PNG](../../.temp/jungle65-aplus-20261102/after/group-1440.png) | [PNG](../../.temp/jungle65-aplus-20261102/after/group-390.png) | [PNG](../../.temp/jungle65-aplus-20261102/after/group-320.png) |

그 외: `after/{duel,group}-{1024,768}.png`, `state-{loading,empty,error}-390.png`, `help-{duel,group}-390.png`, `font-fallback-320.png`, `long-cta-320.png`, `reduced-height-keyboard-390.png`, `focus-hover-390.png`. 수정 전 31장, 수정 후 40장 [산출물].

## 6. 첫 공개방 노출 위치·전체 높이

문서 상단 기준 CSS px. 가로 폭·DPR1·동일한 3개 표본 방·긴 닉네임으로 측정했다. 첫 공개방은 게시판 제목이 아니라 첫 방 카드의 top이다. 전체 높이가 짧아진 정도와 첫 노출 개선을 구분한다 [산출물: metrics.json].

| 화면-폭 | 게시판 Y 전 → 후 | 첫 방 카드 Y 전 → 후 | 전체 높이 전 → 후 |
|---|---:|---:|---:|
| duel-1440 | 857.2 → 474.66 | 985.34 → 625.09 | 1443 → 1228 |
| group-1440 | 813.2 → 474.66 | 941.34 → 625.09 | 1399 → 1215 |
| duel-1024 | 857.2 → 470.06 | 985.34 → 620.5 | 1443 → 1224 |
| group-1024 | 813.2 → 470.06 | 941.34 → 620.5 | 1399 → 1210 |
| duel-768 | 857.2 → 483.5 | 978.38 → 633.94 | 1436 → 1516 |
| group-768 | 838.39 → 462.06 | 959.56 → 612.5 | 1417 → 1481 |
| duel-390 | 1242.78 → 540.41 | 1416.02 → 759.28 | 1860 → 1808 |
| group-390 | 1229.97 → 520.61 | 1403.2 → 739.48 | 1847 → 1775 |
| duel-320 | 1291.16 → 532.41 | 1502.03 → 748.28 | 2126 → 2024 |
| group-320 | 1272.34 → 532.41 | 1506.02 → 748.28 | 2130 → 2011 |

390px·320px 모두 첫 방 카드가 844px 높이 안에서 보이기 시작한다. 320px에서는 조작성을 위해 참가 버튼이 카드 다음 줄의 전체 폭으로 가므로 첫 버튼 전체가 첫 뷰포트에 들어온다는 의미는 아니다. 50개 방 목록이나 더 긴 실제 데이터의 전체 높이는 이 수치와 다를 수 있다 [산출물/미확인].

768px에서는 첫 방 노출이 앞당겨지는 대신 전체 높이는 1:1이 80px, 그룹이 64px 늘었다. 공개 목록을 보조 영역 앞에 두고 버튼·입력 크기를 확보한 배치의 결과이며, 모든 해상도에서 전체 페이지가 짧아졌다고 해석하지 않는다 [산출물: 위 표].

## 7. 기능·접근성 보존 검증

스코프 대조에서 상태/명명 핸들러 구간과 JSX 이벤트 식 **18개가 원문 동일**함을 확인했다. 서비스·RPC·migration·게임 소스, App의 OnlineRoute, ExpeditionDialog는 원문 보존했다 [산출물: scope.json].

실제 React UI와 합성 Auth/REST/RPC/Realtime로 다음을 확인했다. 운영 Supabase 검증은 아니다 [산출물: after/report.json의 requests·checks].

- ?mode=duel/group 고정과 선택기 숨김, mode 없는 기존 로컬 선택기 유지.
- 두 모드의 공개방 조회·새로고침·참가·모드별 경로. 참가 거부 후 목록 재조회.
- 6자리 소문자/공백 코드의 trim·대문자화, 그룹 lookup→join 두 RPC 순서.
- 기본 비공개 생성, duel 기본 아이템 true, group 기본 정원6/min3/finish3. 공개 opt-in·아이템 해제·정원8 설정 전달.
- 공개 참가/생성의 빠른 중복 클릭 요청1회, pending 비활성.
- 게스트는 PLAY, 미로그인은 login으로 이동.
- 도움말 Enter·Tab·Shift+Tab·Escape·포커스 복귀, 44px 이상 주요 조작부, hover/focus-visible.
- 한글/영문/숫자·긴 닉네임·긴 버튼 문구, 폰트 실패 fallback, 5개 해상도 가로 넘침 없음.
- 390×420 높이 축소와 입력 포커스·스크롤 가시성. 실제 OS 가상 키보드를 띄운 검증과 구분한다.
- 기존 대기방은 폰트만 적용. 1:1 READY 없음·그룹 미준비 시작 차단·표본 저장 목표 F5 재표시. 기존 프로필 컴포넌트를 보존했다.
- 랜딩/HOME/PLAY × 5개 해상도 **15개 PNG 바이트 동일**. 처음에는 HOME의 실시간 조회 시각 때문에 차이가 생겨 검증 브라우저에서 Date만 고정했다. 검사를 삭제하거나 허용 오차로 넘기지 않고 재캡처해 일치 확인했다.

## 8. 테스트·빌드

| 검증 | 결과 |
|---|---|
| 시작 npm test | 746/746 통과 |
| 최종 npm test | 746/746 통과, fail/skip/cancel 0 |
| npm run build | exit 0. 기존 500kB 초과 JS 청크 경고 유지 |
| git diff --check | exit 0 |
| node --check scripts/jungle65-entry-smoke.mjs | 통과 |
| 수정 전 fixture browser | 77개 확인 / 31장 |
| 수정 후 fixture browser | 246개 확인 / 40장 |
| 정상 page/console error | 0 / 0 |

모든 수치의 기준·날짜는 문서 상단과 같다. 조회/참가 오류·font fallback용 의도적 실패 응답은 정상 오류 집계와 분리했다. 실제 DB 권한·방장 존재·정원·waiting의 서버 판정은 이번에 새로 검증하지 않았으며 해당 코드/SQL과 호출 계약을 그대로 보존했다. lint 스크립트는 없다 [산출물: npm-test.log, build.log, diff-check.log, check-exits.json, before/after report; 코드: package.json].

재확인 명령:

```powershell
cd C:\Project\wiki-jungle65
npm test
npm run build
git diff --check
node scripts/jungle65-entry-smoke.mjs --before
node scripts/jungle65-entry-smoke.mjs
```

브라우저 스모크는 이 작업의 `.temp/jungle65-aplus-20261102/preserved` 원본과 설치된 Chromium을 사용한다. 다른 PC는 `JUNGLE65_BROWSER_PATH`에 설치 경로를 지정한다. 실제 서비스 자격정보는 읽거나 저장하지 않는다.

## 9. 남은 문제·미확인

- 실제 스마트폰/Safari/Firefox·실제 가상 키보드·OS 글꼴 배율은 미검증이다. 축소 뷰포트 테스트를 실기기 검증으로 주장하지 않는다.
- 공식 CDN을 사용하므로 최초 네트워크·CSP·CDN 장애 시 fallback이 보일 수 있다. 프로덕션 CSP/실제 배포 환경에서는 미검증이다. 폰트 로컬 호스팅은 다음에 필요할 때 조건·용량을 재검토한다.
- 기존 대형 JS 청크 경고는 이번 UI 범위에서 유지했다.
- 기존 create/code 참가 오류 표시는 기존 위치와 handler를 유지했다. 실제 서버 거부 의미를 클라이언트에서 재판정하지 않는다.
- 작업 트리의 CURRENT가 뒤처진 상태는 통합 세션 갱신 대상으로 인계한다.

## 10. 다음 1:1 대기방 구현 주의

1:1 두 플레이어 VS 구도는 다음 작업이며 이번에 재배치하지 않았다. READY를 추가하지 않는다. 방장만 목표 검색·선택·서버 저장과 시작을 수행하고, 상대는 확정 목표 읽기 전용이다. 출발 문서를 대기방에서 미리 확정 표시하지 않는다. 실제 ProfileCard/ProfileAvatar 프레임·닉네임 계약, onNavigate의 waiting 확인/leave, 역할별 권한, F5 복원, Realtime/재조회 세대 가드를 유지한다. 그룹 단계에서는 로컬 후보 선택과 서버 후보 제출/READY를 구분하고 타인의 후보를 새로 노출하지 않는다 [문서: JUNGLE65-LOBBY-RESEARCH; 코드: 두 대기방/LobbyParts/WikiRaceShell].
