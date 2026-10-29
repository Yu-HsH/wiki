# 현재 상태 — Wiki Race 2.0

갱신 날짜: **2026-10-29** (조건부 운영 배포 및 관련 검증35파일 선별 커밋 승인 수신. 실제 JWT 거부/회원 성공·최신 백업 격리복원·180파일 커밋 확인. DB migration/Edge/main push/Vercel 적용은 아직 없음. 검색 소비 미해결 후속 유지).
기준 커밋: **`078a6906d28b86e8d1864afaef68ebbf53fa833d`** (승인 제품145 + 검증35 = 180파일 release commit). 고정 후보 source SHA-256 **`c7ef6142bfa9b357d7034dfdce126cff2a81fcf1ba4786b014bd1315f1eba555`** 유지. 이 기록 커밋의 부모가 기준이다.
브랜치: **`main`**. **원격 `main` = `feat/group-final-gaps` = `4830b38fee774aa8953a8740cd50563c43d0eb76`** (`git ls-remote origin`, 2026-10-29 재확인 [산출물]). 기존 "d496ba2·6커밋 미push" 서술은 현재와 다르다. **실제 Vercel Production도4830b38/Ready**, 배포ID `Fg9XeDWqCDJ5LNSz71Xn3kzJKbYf`·생성Oct8·alias `wiki-dusky-one.vercel.app`을 2026-10-29 dashboard에서 확인했다. #15 이후 push 실행자·건별 승인·정확한 횟수는 미확인으로 번호를 추측해 추가하지 않았다. 아래 이전 날짜의 미push/미배포 문장은 당시 기록이다.

## 2026-10-29 조건부 운영 배포 승인·인증 선행 검증

사용자가 동일 후보의 기존 migration10건→single-run/duel-link-preview→프론트130파일 선별 main 배포를 승인했고, 별도 승인으로 검증35파일을 추가했다. [진행 기록/인증 설정 정정/실제 적용 상태](../ops/RELEASE-2026-10-29.md), [검증35개 목록](2.0x/RELEASE-VERIFICATION-FILES-2026-10-29.json). 제품·DB·Edge 소스와 source SHA는 변경하지 않았다. 검색 성공 소비 우회는 **미해결/알려진 제약 승인**이며 [후속 과제](2.0x/SEARCH-CONSUMPTION-FOLLOWUP.md)로 남긴다.

기준 release commit **078a6906d28b86e8d1864afaef68ebbf53fa833d**, 후보 source **c7ef6142bfa9b357d7034dfdce126cff2a81fcf1ba4786b014bd1315f1eba555**, 2026-10-29 KST. 정확히180파일만 커밋했고 검증한 별도 트리·Git staged object와 대조했다. 해당 트리 npm682/682·운영공개설정build성공(306모듈). 기존 승인 소스의 EOF빈줄경고1건은 SHA보존을 위해 유지했고 그 외 whitespace/충돌 검사 통과. 현재 원격main/feat는4830b38, 실제Production은이전Ready배포이며 push하지 않았다.

preview 최종 설정은 실제 리허설과 같은 **verify_jwt=false + handler auth.getUser 필수회원검증**이다. 이전 LOCAL-RECOVERY의true는당시계획을정정했다. 무토큰/anonapikey/anonJWT/위조JWT/정상서명만료JWT는401,정상서명유효JWT는인증통과·실제회원미리보기/Wikipedia/서버used1확인. 운영test계정3개는추가승인으로정상가입/로그인했고자격정보는저장소밖DPAPI암호화보관. 그뒤최신운영백업2,001,325bytes를별도빈격리DB실복원하여73테이블/함수101/정책42/RLS·ACL72/기본권한24동일확인. 운영raw열린듀얼36행은최근heartbeat10월3일/최근5분신호0,active싱글3행은모두만료상태이며삭제·보정하지않았다. 아래승인대기표기는승인전당시기록이다.

## 2026-10-29 운영 배포 격리 리허설 — 조건부 승인 대기

기준 **4830b38 + 고정 후보 c7ef6142…eba555, 2026-10-29 KST**. [전체 결과·정확한 적용 순서·복귀 제한·미해결/승인 조건](2.0x/RELEASE-REHEARSAL-2026-10-29.md), [후보 파일별 SHA/함수 시그니처/제외 목록](2.0x/RELEASE-CANDIDATE-2026-10-29.json). 원격 main/feat 모두4830b38을 재확인했다. 운영은 백업/read-only SELECT만, migration·Edge/Vercel 변경·commit/push0이다.

운영 전체 custom archive를 새 무료 로컬 Docker **wiki-next-goal-release-20261029/API55421/DB55422**의 빈 DB에 실제 복원했다. 기존 사용자 **wiki-packet13-r2-clean158/54321/54322**는 쓰기 대상에서 제외했다. **73테이블 데이터 지문·함수101·정책42·테이블 RLS/ACL72·기본 권한24 동일**. 역할의 로컬 플랫폼 차이는 별도 기록했고 앱 인증/권한은 실제 API/pgTAP으로 검증했다. 백업·계정·자격 원문은 Git 제외 보호 위치에만 보관했다. 복원본을 보존하고 복사 DB에 **기존10파일만 공식 CLI 순차 적용32→42/pending0**. 별도 migration 전용 복사본의 업무72테이블 중71개 동일, pool만예정된12→17행이다. 공식CLI DB이력10행추가는별도예정변경이다. 로컬 플랫폼 _realtime 누락은 격리 초기 DB에서 관리 스키마만 보완해 해결했다. 운영 적용 대상은 아니다 [산출물: .temp/release-rehearsal-20261029/].

같은 기준/날짜 **npm682/682·pgTAP28파일1500/1500·고정 후보 자체build/diff성공**. 새 랜덤62검사·커스텀/데일리 각7·실제 신구계약 혼재 랭킹9·새듀얼19·3계정그룹7·미리보기 권한/경합17·싱글동시성5·듀얼3시나리오×5/교착0·그룹하니스전체통과. 문서 fixture 검증과 별도로 **새390px UI→무수정Deno→실제Wikipedia 서울특별시 요약→서버used1**을 확인했다. 이전 프론트+이전 Edge+새DB/이전 프론트+새Edge+새DB/새프론트의 옛 런 복구 각각8검사 통과. 옛 프론트 완료F5는 원래 로비 이동 계약이며 새 결과 유지로 오판하지 않았다. 테스트의 기존 데이터/후보/상위50개 가정만4파일 수정, 제품·migration·음원 추가수정0이다.

**검색 성공 소비는 여전히 클라이언트 권위**다. 정상1회 후 React 상태를 되돌리면 같은 이벤트로두번째검색성공/서버원장불변을재현했다(검색9검사 중취약점재현 포함). 기존2026-10-14보류를유지하며서버해결/출시승인으로전환하지않는다. 새scheduled런이있을때옛Edge의snapshot_v1은UNSUPPORTED_ACTION, 새Edge복구후동일런/예약시각보존·소유자leave_v1/결과0확인. **복귀기본은확장DB·새Edge유지+프론트이전artifact**, 전체DB덮어쓰기/무차별런삭제아님. 이전Edge완전복귀는새API캐시클라이언트까지해소해야한다.

**기술리허설통과/조건부운영승인대기**: 검색서버소비미해결위험을명시적으로수용하는건별승인필요. 전체서버권위해결이출시조건이면배포불가. 고정범위는프론트130변경파일·기존migration10건·Edge5파일/2함수이며, 검증참고251파일/음원시안/개인설정/백업을일괄커밋하지않는다. 초기1646파일소실0·기존public/audio53파일SHA동일·config/lockfile보존. 격리컨테이너9개만중지/볼륨보존·기존사용자DB계속가동확인. 실Vercel승격/복귀·Storage본체복원·실기기/Safari/OS suspend는미검증. 기존Production4830b38확인은아래같은날짜앞선실측기록을따른다. 아래복원미실행/배포보류문장은이리허설전기록이다.

## 2026-10-29 승인 로컬3건 복구·싱글 실플레이·운영 호환성 확인

기준 **4830b38 + 기존 미커밋 작업 트리 + 검수 수정 + WikiViewer 수정, 2026-10-29 KST 확인**. [적용/백업·실제 검증·F01~F09 최종 상태·운영 변경/복구 제안](2.0x/LOCAL-RECOVERY-2026-10-29.md). 활성 경기0·로컬API54321/DB54322·39/pending3을 재확인했고 Git 제외 전체DB/schema 백업·archive 전체해독을 확인했다. 복원리허설은 미실행이다. 사용자가 지정한 `20261015061829`→`20261015062624`→`20261015233503`만 원문대로 적용해 **42/pending0**. auth/public/private/storage **73테이블 기존컬럼·행수·digest 동일**·새 컬럼/RPC/RLS/권한 확인. reset/repair/임의 SQL/계정 재생성/삭제 없음 [산출물: `.temp/local-recovery-20261029/`].

실제 데일리 대한민국→훈민정음 1회/11초/+25, 랜덤 장자겸→강유→시간→1998년 FIFA 월드컵→2011년 세계 유도 선수권 대회→덱스 엘몬트 5회/281초/+20, 커스텀 길려원→대한민국 1회/25초/+15 완주. 세 런 모두 서버 예약8,600ms·실제시작=예약·새시간계약·결과/지급 각1행. 준비/진행/결과F5·실제 할당/예약 재요청 동일런/시각·중복결과/원장0. 프로필3완주/435XP/Lv5/새최고0:11과 실제 계약랭킹 확인. 기존NULL 계약 싱글결과0건이므로 양코호트 모두실데이터인 혼재상태는 미검증. DB 복구 후 추가로 발견한 준비DOM의 href 미복구를 `components/WikiViewer.jsx`에서 최소 수정했고 커스텀은 F5없이 시작/이동했다.

두 계정 듀얼 정상21초/1회·25/12XP(같은상대4~5번째50%감쇠), 아이템전 기권32초·본인0/상대0(6번째이상0%감쇠)·안내/양쪽결과F5·저장1행 재확인. 새 그룹 **9A9C51**은 사용자 직접 test2 UI 참가 후 **3/3 READY→훈민정음→한글**, 각1회 이동·1위1초/2위39초/3위134초로 전원 완주했다. 개인 결과 선저장·관전본문20,985자/내부앵커518개 읽기전용·클릭 비이동·대상자동전환·개인F5를 확인했다. `finished/all_resolved`·최종3행·XP **70/55/45** 각1행, test/test1 양쪽 결과F5 전후 저장JSON 동일·중복0. test2 자신의 화면에서 **3위·45 XP 및 F5 후 동일 표시**를 사용자도 확인했다 `[사용자 확인, 2026-10-29]`. 서버 결과/지급은 별도 SELECT 확인. 누적XP **530/287/150**, 실제 test 프로필Lv6/그룹1위3회·싱글3회/0:11 유지, 주간게임XP **440/227/90** 반영 확인.

앞선 턴의 Windows URL 확인 중단·viewport 미반영은 당시 기록으로 남긴다. 사용자 READY 응답 후 새 턴에서 브라우저 제어가 정상 복귀했고, **DOM 실제390×844**에서 경로비교·최종결과·소리/관전정보 비중첩을 재확인했다. 비교 scrollWidth375≤390·이동수nowrap·이름/순위 배치 정상. 소리 panel 하단353.5 < 관전정보 상단730. 기본정원6 대기방 A4A28D에서도 후보→소리설정열기→READY실제클릭→서버1/1·준비취소·정상나가기 확인. 기본6/선택3~8·실제정원8의3계정 준비/완주로 F03/F06/F08 검증을 보완했다. 제품코드/SQL추가변경 없이 수행한 일반플레이이며 직접 데이터 삭제/보정 없음. 아래 최초 검수 기록과 새 증거를 구분한다.

동일 기준/날짜 **npm682/682·build/diff exit0**, 기존청크경고. 초기변경경로1348개 소실0·승인음원53파일SHA동일. Single8.6/Duel2.7·win/go자연종료소스 보존, 새음성/정확2.7영상측정은 미검증. 추가DB적용/운영변경/commit/push/배포0.

운영은 `BEGIN READ ONLY` 카탈로그/이력/객체·Edge다운로드로만 대조했다. 이력32·후속10 미기록에 더해 실제예약컬럼/할당·계약/XP랭킹RPC·daily검증후보컬럼·프리뷰객체가 없고 이동/item일부정의도다름. **현재작업트리와 운영은 비호환이므로 프론트단독배포 금지**. 운영single-run v2는HEAD4830b38과같고새예약API없음, duel-link-preview미배포. wiki-snapshot v3/duel-random-teleport v1는현재소스와LF정규화후동일해 불필요재배포대상에서제외. 실제Production4830b38/Ready·프론트GET200/기존EdgeOPTIONS200 확인, 운영실플레이미검증. 원래옛프론트/Edge의운영장애를단정하지않는다. 위상세보고서§6에대상별순서·데이터영향·백업/복원·기존배포복귀안과새승인조건을준비했으나실행하지않았다.

## 2026-10-29 최초 검수 F01~F09 수정 — 아래는 로컬 적용 승인 전 당시 기록

기준 **4830b38 + 기존 미커밋 작업 트리 + 이번 검수 수정, 2026-10-29 KST 확인**. [F별 상태·전체 수정 파일·실제 검증·DB 적용 후보/데이터 영향/복구·미확인 범위](2.0x/AUDIT-REPAIR-2026-10-29.md). 세 싱글 시작의 실제 Edge 502 본문·서버 로그는 공통 `claim_single_course_v1` 부재였다. `commit/control`도 없으며 `timing_contract`·계약 랭킹 RPC도 없다. 로컬 적용 39개/저장소 42개, 후속 `20261015061829`·`20261015062624`·`20261015233503` **미적용 유지**. 컬럼 하나를 제거하거나 옛 계약으로 우회하지 않았다. 오류 코드를 보존하고 실제 Edge 503 `SERVER_CONTRACT_UNAVAILABLE`·한국어 안내/재시도로 정리했다. 싱글 완주·저장·XP/시간 랭킹은 미검증이다 [코드/산출물: `.temp/audit-repair-20261029/`].

프로필 실패→정상 0회 처리를 제거하고 본인/공개 프로필·HOME/랭킹 재시도/진단 로그를 추가했다. 그룹 비교의 참가자용 `grid-area: rank` 충돌을 전용 셀로 수정하고 이름/이동 수·순위 배치를 실제 390px/데스크톱에서 확인했다. 소리 버튼을 문서 흐름의 상단 영역으로 옮겨 READY·관전 하단 비중첩과 클릭을 확인했다. 그룹 기본 6명을 유지하며 3~8명 선택→실제 정원 8 방 생성/코드 참가, 확정 완주/유예 규칙 안내, 듀얼 즉시 기권패/본인 0 XP 안내, 업적 보상 사용자 문구를 수정했다.

실제 앱/로컬 API/Wikipedia·응답 대체 없음. 기존 2계정 UI 듀얼 정상 `서로의 미래→SNH48→중국→대한민국` 3회/47초, +50/+25·양쪽 F5·결과/원장 중복 없음. 일반전 기권 취소/확정·본인0/상대15(기본30의 동일 상대 4~5번째 감쇠50%)·F5 확인. 정원8의 실제3계정 그룹 한글→훈민정음, 두 계정 UI/세 번째 정상 공개 가입·로그인/게임 API. 개인 완주→관전→비교→전원 종료, 1/2/3위·7/37/63초·각1회·기본70/55/45 XP 저장, 두 브라우저 F5 전후 결과/원장 동일. 프로필 누적345/220/105·주간게임285/160/45 확인. 세 번째 계정은 삭제하지 않았고 자격 정보는 파일에 저장하지 않았다. 세 번째 UI 조작·4위/유예 만료·7/8번째 입장·실휴대전화/Safari는 미검증이다.

같은 기준/날짜 **npm682/682·build/diff exit0**, 기존 큰 청크 경고. 기존 public/audio **53파일 SHA 동일**, 초기 git status 경로 소실0. Single8.6초/Duel2.7초·win/go 자연종료 소스 유지, 새 파형 녹화 검증은 아니다. SQL 수정/적용·초기화·수동 데이터 삭제·운영 변경·commit/push/배포0. 운영은 **읽기 조회만** 수행: migration 이력32개/마지막20261006003000, single-run ACTIVE v2·wiki-snapshot v3·duel-random-teleport v1. 운영 실제 스키마/싱글 API/현재 Production SHA는 미검증이며 로컬과 같은 장애라고 판단하지 않는다. 로컬3건 적용 승인은 운영 후속10건 적용을 뜻하지 않는다. 배포 전 싱글 세 흐름 검증과 운영 의존성 별도 검토가 필요하다.


## 2026-10-25 오프닝 V02 — 웅장함·여행 시작의 설렘

기준 **4830b38 + 기존 미커밋 + 오프닝 V02, 2026-10-25 KST 확인**. 사용자 요청에 따라 **「새로운 지평으로」**를 새로 합성하고 `opening` URL만 `opening-v02/journey-departure.wav`로 바꿨다. 넓은 현악 합주·8분음표 현악/하프·상행 호른 주제·저음·팀파니·목관·밝은 반짝임을 더하고 후반부 악기층을 키웠다. 기존 helper/NumPy만 사용했으며 새 의존성/API/샘플0. **20초·96 BPM·8마디, BGM28% × 곡 gain0.5**는 유지했다. native PCM RMS는 V01 **0.062063** → V02 **0.062052**(약0.02% 차이), clipping0으로 평균 음량을 맞췄다. 이 수치는 정서적 완성도의 판정이 아니라 음량·파일 검사다 [코드/산출물: `docs/sound-prototypes/opening-v02/compose.py`, `public/audio/opening-v02/manifest.json`, `services/audioAssets.js`, `.temp/audio-opening-v02-20261025/pcm-comparison.json`].

첫 시작·로그인(`/`, `/login`)의 기존 첫 조작/음소거/숨김/화면 전환 정책을 그대로 사용한다. **AudioManager·기존 효과음/시작/결과 연출·게임 규칙 변경0**이며 V01과 이전 Fixed/Opening ZIP을 보존했다. 역할31개·실사용 원본25개는 그대로이고 활성 오프닝의 경로만 교체했다. 검수 스크립트2개는 이전 기록을 덮어쓰지 않도록 출력 경로 환경변수와 KST 기록 날짜를 보완했다 [코드: `scripts/verify-opening-audio.mjs`, `scripts/analyze-opening-audio.mjs`].

동일 기준/날짜 검증: **npm test677/677**, build/diff exit0(기존 큰 청크 경고), 실제 로그인6사례 통과. 새 실제 React/Web Audio 녹화2개에서20초 루프 경계2회 동안 opening source1개·로그인/회원가입 재렌더 재시작0·게스트 HOME 전환·음량/음소거·숨김/복귀/F5/가이드 이탈을 재검증했다. 녹화의 실제 음성 트랙·PCM·반복 상관 **0.99999999** 확인. 실제 서버·실계정·실기기·Safari·OS 탭 동작·주관적 청음은 미검증이며 웅장함/설렘의 최종 판단은 사용자 청음이다 [산출물: `.temp/audio-opening-v02-20261025/{npm-test.log,build.log,browser-validation.json,media-validation.json}`].

**[V01/V02 비교 청음](../../deliverables/audio-opening-v02-20261025/package/index.html)** · **[WikiRace_Opening_V02_Review.zip](../../deliverables/audio-opening-v02-20261025/WikiRace_Opening_V02_Review.zip)** — **6,872,239bytes·30파일**, SHA-256 **`2c8b23c936d3415cc9a3a8c02390ab37aafe9d3f388efe45decc21c8aff75b8d`**. WAV4개(새 기본/이전 기본/새 원본/새 두 바퀴)·새 녹화2개·이벤트·소스/테스트·검증기 포함. 새 추출본 해시/경로 누락0·6플레이어 시작/탐색/종료·음성 디코딩·외부 요청0·추출본 오디오49/49 [산출물: 같은 전달 폴더 `validation.json`]. 아래 V01 절은 이전 기록이다. commit/push/운영 변경0.

## 2026-10-25 첫 시작·로그인 전용 오프닝 BGM

기준 **4830b38 + 기존 미커밋 + 로그인 오프닝 추가, 2026-10-24~25 KST 확인**. 사용자 지정은 **로그인하는 페이지·아예 처음 시작 화면**이다. `/`(IntroPage의 로그인 모달 포함)·`/login`에만 새 `opening`을 연결했다. 첫 클릭/키 입력 뒤 재생하며 로그인·회원가입 UI 재렌더와 두 경로 사이에서는 같은 곡이 이어진다. 로그인 후 HOME(`/lobby`)에서 기존 칼림바로 전환하고, 공개 문서·게임 경로에서는 기존 종료 정책을 따른다. **싱글·듀얼·그룹 경기 시작 연출에는 새 BGM을 연결하지 않았다** [코드: `services/audioManager.js:musicName`, `services/audioAssets.js`; 실제 화면: `pages/IntroPage.jsx`, `pages/LoginPage.jsx`, 기존 `components/AudioControls.jsx`는 미수정].

새 원곡 **「탐험의 서문」20초·96 BPM·8마디**, 하프 아르페지오·목관·낮은 현악·작은 나무 타격. 기존 합성 helper/NumPy로 직접 합성했으며 새 의존성/API/샘플은 없다. 런타임24kHz mono PCM16, 기존 BGM28% × 새 곡 gain0.5이며 기존 HOME/플레이/결과·SFX 음량은 그대로다. 역할은 **BGM4 + SFX27 = 31**, 실사용 원본25개다. 기존 public WAV34개와 이전 Fixed ZIP의 SHA는 보존했다 [코드/산출물: `docs/sound-prototypes/opening-v01/compose.py`, `public/audio/opening-v01/manifest.json`, `services/audioAssets.js`].

검증(같은 기준, 2026-10-24~25 KST): **npm test677/677**, 오디오 단위/피드백 **49/49**, build exit0(기존 큰 청크 경고), diff-check exit0. 기본 `node --test`가 `deliverables/`의 과거 검수 소스 사본까지 실행해 누락 의존성으로 실패했으므로 `package.json`의 test 대상을 **`tests/*.test.js`**로 명시했다. 원래 제품 테스트 파일은 삭제/변경하지 않았다(오디오 회귀3건 추가만 별도). 격리 브라우저의 로컬 파일 제공기가 `/` 루트를 잘못 차단하던 조건도 `scripts/audio-static-app.mjs`에서 보완했다. 로그인6사례: 첫 조작 전 context0·20초 루프 경계2회 중 source1개/재시작0·로그인/회원가입 전환·실제 게스트 버튼 HOME 전환·개별 음량/전체 음소거·숨김/복귀/F5/가이드 이탈. 녹화2개는 실제 소리 트랙1개·PCM 확인, 첫 녹화 두 주기 상관1.0이다 [산출물: `.temp/audio-opening-20261024/{npm-test-final.log,audio-tests-final.log,build.log,browser-validation.json,media-validation.json}`].

기존 효과음은 현재 게임 화면에서 다시 녹화해 **win3.800초·go1.309333초**, stop 요청 없음·승리음 종료 뒤 결과 BGM1회·Single8.6초/Duel2.7초 유지·F5 중복0을 확인했다. 개발 StrictMode/취소/identity15사례도 통과했다. 실제 서버·실계정 로그인·실제2계정·실제 모바일·Safari·OS 탭 정책·주관적 청음은 여전히 **미검증**이다. 새 영상도 실제 제품 React/Web Audio + 로컬 응답 재현이며 실제 인증/XP 지급 성공의 증거가 아니다 [산출물: `.temp/audio-opening-20261024/lifetime/after/lifetime-checks.json`, `.temp/audio-opening-20261024/strictmode/browser-validation.json`].

별도 **[WikiRace_Opening_Audio_Review.zip](../../deliverables/audio-opening-20261025/WikiRace_Opening_Audio_Review.zip)**: **6,416,234bytes·40파일**, SHA-256 **`900402d69686eb25ea4d0234f4d0f591aca77299d5ac2727fe8cb06a6e6cb234`**. 원본/기본음량/두 바퀴 WAV3개·실제 녹화4개·이벤트/검증 로그·오디오 테스트 의존 소스·해시/검증기를 포함한다. 새 추출본의 경로·해시 누락0, 플레이어7개 시작/탐색/종료·음성 디코딩·외부 요청0, 추출본 테스트49/49 [산출물: 같은 폴더 `validation.json` 및 `validation/`]. 아래 Fixed ZIP은 오프닝 추가 전 AUDIO-01/02 검수 기록으로 보존하며 덮어쓰지 않았다. commit/push/운영 변경0.

## 2026-10-24 효과음 잘림 AUDIO-01·02 수정 검수

기준 **4830b38 + 기존 미커밋 작업 + 오디오 수명 수정, 2026-10-24 KST**. 수정 전 현재 React 게임을 다시 녹화해 듀얼 `win` **1.850667초/원본3.8초**, 싱글 `go` **0.520000초/원본1.3초** 중단을 확인했다. 승리음이 끊긴 **뒤에** 결과 BGM이 시작했으며, 기존 약1.9초 겹침 추정은 근거로 사용하지 않는다 [산출물: 최종 ZIP `reproduced-before/events/`, `reports/lifetimes.json`].

정상 완료는 연출 scope의 추가 요청·진행 중 decode를 닫고 **이미 시작한 win/go만 자연 종료**시킨다. hook cleanup은 정상 인계와 중단을 구분하며 identity 변경 시 이전 owner를 취소한다. 스킵·숨김·pagehide·이탈·음소거·SFX0·새 경기/연출에서는 여운도 중단한다. 결과 BGM은 기존 실제 result voice `onended`를 기다리며 고정 지연 타이머를 추가하지 않았다 [코드: `services/audioManager.js`, `hooks/useAudioCues.js`, `components/cinematic/DuelEndSequence.jsx`, `components/cinematic/SingleStartCinematic.jsx`].

수정 후 실제 게임 녹화에서 `win` **3.800000초**, `go` **1.309333초**(Web Audio 종료 콜백 관측값), 모두 stop 요청 없이 끝났다. Single 예약 계약 **8.600초**, 실제 화면 전환 **8.613400초**(다음 렌더 프레임), Duel 표지 **약2.7초** 유지. 결과 BGM은 승리음 ended 뒤1회다. 승인된 실사용 원본24개·public WAV34개·`audioAssets.js` 및 기존 게임 기본 설정 청음30개의 SHA는 수정 전과 같다 [산출물: ZIP `events/duel-win-after.events.json`, `events/single-go-after.events.json`, `reports/preservation-security.json`, `reports/preview-render.json`].

같은 기준/날짜 검증: **npm test675/675**, 오디오 단위·피드백 **46/46**, build exit0(기존 큰 청크 경고), diff-check exit0. 브라우저는 개발 StrictMode effect 실제2회 setup 및 취소/identity15사례·결과21·게임/BGM19·아이템25사례를 통과했다. 싱글 완주·F5, 듀얼 패배/기권/결과 재조회, 그룹 개인 도착/최종 결과를 포함한다. 실제 서버·실제2계정·실제 모바일·Safari·OS 탭 정책·주관적 청음은 **미검증 유지**다. 새 녹화도 실제 제품 React/Web Audio + 로컬 API/Realtime 응답 재현이며 실제 DB/Auth/XP 지급을 검증한 것이 아니다 [산출물: ZIP `reports/commands/`, `reports/{strictmode-cancellation,results,gameplay,items}.json`].

최종 **[WikiRace_Audio_Review_Fixed.zip](../../deliverables/audio-fixed-20261024/WikiRace_Audio_Review_Fixed.zip)**: **40,010,218bytes / 513파일 / 영상34개 / 현재 관련 소스66개**, SHA-256 **`71a054aae3536b5081f13c14d0df26337bfe185cdbb4786aebca654b7d469f4d`**. 기존 Complete.zip 전체는 `before/`에 그대로 보존하고 현재 트리 수정 전 재현2개와 수정 후 새 녹화12개를 구분했다. `source/utils/groupLobbyState.js`를 추가해 추출본에서도 오디오 테스트46/46이 재실행된다. 최종 ZIP을 새 폴더에 풀어 **Python65,246·PowerShell3,069검사**, 청음 플레이어60개/영상34개 시작·탐색·종료, 외부 요청/재생 오류0, 수정 후 핵심2영상 처음부터 끝까지 자연 재생·표지 종료 후 PCM을 확인했다. 무결성 통과와 실제 기기/서버 미검증은 구분한다 [산출물: `deliverables/audio-fixed-20261024/WikiRace_Audio_Review_Fixed.validation.json` 및 같은 폴더 `validation/`]. 이전 R2 문단은 수정 전 당시 기록이며 아래 실패 판정은 이 단락으로 대체한다. commit/push/운영 변경0.

## 2026-10-24 현재 적용본 재전달 R2

기준 **4830b38 + 현재 미커밋 트리, 2026-10-24 KST**. 사용자는 이전에 받은 파일을10/16 최초 시안으로 보고했다 [사용자 보고; 수신 파일의 실제 해시는 미확인]. 현재 적용 정의를 직접 import해30역할의 경로/gain/rate를 대조했고 실사용 원본24개·소스65개의 해시를 확인했다 [산출물: .temp/audio-current-r2-20261024/runtime-binding.json]. **새 전달본은 [WikiRace_Audio_Review_Complete.zip](../../deliverables/audio-current-20261024-r2/WikiRace_Audio_Review_Complete.zip)** 이며, 첫 화면에 `CURRENT-APPLIED-20261024-R2`와 생성시각·정글v02/결과곡/아이템v04·v05/환호·휘슬v02/금관A 선택을 표시한다. 기존 전달 ZIP은 덮어쓰지 않았다.

30역할·원본24 WAV·현재 재생기로 렌더한 청음30 WAV·실제 소리 포함 영상20개·소스65개/로그/검증기를 포함한다. 제품 해시가 기존 녹화 기준과 같음을 확인하고 같은 현재 React 녹화20개를 보존했다. 새로운 작곡·제품 음원/타이밍/디자인 변경은 없다. 최종 ZIP은22,398,473bytes/260파일, SHA `ea47e998fac2d4975ad03dace24738cf3f44410999e2bd51090e375e457a538b`다. 새 폴더에서60개 청음 플레이어·영상20개 시작/탐색/종료·음성 디코딩/외부 요청0, Python32,869·PowerShell1,941검사 통과 [산출물: 같은 폴더 validation.json·CURRENT_APPLIED_FIRST_SCREEN.png, 같은 기준/날짜].

연결 역할 상태는29 로컬 재현 통과/승리음1 실패(기존 꼬리 약1.95초 중단)이며 실제 서버·실제2계정·실제 모바일/Safari·주관적 청음은 미검증이다. 게임 코드가 같아 이전 npm664/664·build 검증 기록을 유지했고 이번 재전달에서는 파일/재생/해시 검증을 새로 실행했다. 운영 접근·배포·commit/push0. 자세한 출처/제약은 아래 전체 검수 기록과 인계 문서에 있다.

## 2026-10-24 독립 실행 사운드 전체 검수 패키지

기준 **4830b38 + 현재 미커밋 작업 트리, 2026-10-24 KST**. [WikiRace_Audio_Review_Complete.zip](../sound-prototypes/WikiRace_Audio_Review_Complete.zip)은 기존 applied-v01.zip의 WAV0개·ZIP 밖 청음 참조 문제를 보완한다. **BGM3 + SFX27 = 30역할, 실사용 원본24 WAV·현재 재생기로 기본 설정을 반영한 청음30 WAV·실제 음성 포함 영상20개·이벤트 로그·소스65개 사본**을 담는다. 후보 음원·로그인 설정·비밀값은 제외했다. 게임 코드/음원/디자인/타이밍은 이번 작업에서 변경하지 않았다 [산출물: ZIP 내부 manifest.json, SOURCE_VERSION.json, SHA256SUMS.json, reports/preview-render.json].

**검수 상태는 29역할 로컬 재현 통과 + 승리음1역할 실패**다. `DuelEndSequence.finish`의 기존2700ms `stopEffects()` 때문에 원본3.8초 승리음이 약1.851초 재생 후 중단되며 약1.949초가 잘린다. 결과 BGM과 약1.9초 겹침은 재현되지 않았고, 측정 겹침0초/종료 뒤 간격 약0.061초다. 의도된 음 길이라는 근거가 없어 AUDIO-01로 기록했다. 과거의 연결 완료·검사 통과 기록을 전체 음질/끝재생 보장으로 해석하지 않는다 [코드: components/cinematic/DuelEndSequence.jsx; 산출물: ZIP video/duel-win-timing.webm, events/duel-win-timing.events.json, reports/FINDINGS.json].

누락7역할 flip/tick/go/impact/retire/achievement/xp를 실제 제품 동작에서 새로 녹화했다. BGM3곡 각각 두 바퀴/start1회를 녹화하고 경계 시각·PCM 상관·무음/파형 단계를 기록했다. 현재 제품으로 React/서비스65검사 + START/보상/기권7검사 + 설정/첫 조작21검사 + 전체 전환6검사, npm664/664·build exit0(기존 chunk 경고)를 확인했다. 최종 ZIP(22,394,040bytes/258파일)을 새 폴더에 다시 풀어60개 플레이어·영상20개의 재생/끝부분 탐색/종료·음성 디코딩·외부 요청0을 확인했다. 독립 검증기는 압축 해제 폴더에서 Python32,829검사·Windows PowerShell1,899검사 통과, git diff --check exit0이다. ZIP 내부 reports/extracted-*-validation.json과 [최종 패키지 검증 결과](../sound-prototypes/WikiRace_Audio_Review_Complete.validation.json)에 기록했다. 검수 스크립트의 PASS와 위 제품 문제를 구분한다 [산출물, 같은 기준/날짜].

영상은 실제 React/Web Audio + 격리된 API/Realtime/Wikipedia 응답 재현이다. 실제 서버·실제2계정·실제 모바일/Safari·사람의 주관적 청음은 미검증이다. 390px는 데스크톱 Chromium 터치 뷰포트이며 실제 모바일 기기가 아니다. 숨김은 visibility 주입, autoplay 거절은 resume 거절 통제, 연결 복구는 offline/online와 지연 응답 재현임을 표기했다. 로컬 Docker 엔진 불가·운영 접근 금지로 실제 DB 검증을 수행하지 않았다. SQL/Edge 변경이 없어 pgTAP는 재실행하지 않았다. 자세한 진행/재검증은 [AUDIO-GOAL-HANDOFF](2.0x/AUDIO-GOAL-HANDOFF.md) [산출물: ZIP reports/settings-checks.json·live-checks.json·result-checks.json].

## 2026-10-24 선택한 음악·효과음 전체 적용 확인

기준 **4830b38 + 기존 선택 음원/결과곡과 이번 전체 적용 미커밋, 2026-10-24 KST**. 선택한 음악/효과음을 전수 대조해 **BGM3곡·SFX27개 역할 = 재생 alias30개/원본 WAV24개**를 실제 게임 연결 목록으로 확정했다. HOME 칼림바 A·플레이 정글v02·결과 result-v01, 승인 v04/v05 아이템·클릭0.5·고음 환호/휘파람이 포함된 celebration-v02·패배 A·일반 알림7종을 사용한다. 중간 비교/탈락 시안은 보존하고 새 음원을 만들지 않았다 [코드/산출물: services/audioAssets.js, applied-v01/manifest.json·validation.json]. [전체 적용본·개별 청음·실제 음성 영상](../sound-prototypes/applied-v01/index.html). 아래 과거의 미연결/시안 표기는 당시 기록이다.

대부분 이미 연결된 상태였으며, 누락된 Single 검색/링크 힌트의 로컬 효과 수락 후 itemReveal 재생2곳을 보완했다. 사용 가능/소비 상태는 기존 useItemSystem이 판정하며 버튼 자체에는 성공음을 달지 않았다. 이동 아이템은 기존 승인 이동의 navigate만 내고 성공 전/실패/중복/F5는 울리지 않는다. 390px 검사에서 기존 Single 아이템 목록이 dock의 overflow-x:auto에 잘려 터치되지 않는 문제를 발견해, 모바일 Single dock만 overflow:visible로 고쳤다. 기존 구조·문구·수량/규칙·서버 요청은 그대로다 [코드: hooks/useItemSystem.js, pages/GamePage.jsx, css/wikiRaceRace.css].

**npm664/664·build/diff exit0**, 선택 PCM/출처/길이·이전 원본 보존146검사, 실제 React/서비스 **65검사(신규25+기존 실제연결19+결과21)**, HOME/종합청음·영상 **15검사** 통과(위 기준/날짜). 1440/768/390, 실제 모바일 tap, Single random/custom/daily·로컬 지원 효과/승인 이동, Duel applied/blocked/reflected·지연 RPC/중복 Realtime/실제 문서 반영, 대기실/연결 복구/장착 저장, 결과 BGM/스킵/reduced-motion·음소거/음량/숨김/F5를 확인했다. 청음30개를 Chromium으로 디코딩하고 대표 지원음2초·소리 포함 영상3개를 정상1배속 끝재생했다. 서버·Wikipedia·Realtime 응답은 격리 fixture이며 실제 DB 승패/XP 지급 검증은 아니다. 실기기/Safari는 미확인. 기존 build chunk>500kB 경고만 남았다. SQL/Edge 변경이 없어 전체 pgTAP는 재실행하지 않았다. 운영 접근/배포·commit/push0.

## 2026-10-24 모든 게임 결과 BGM — 제작·연결 및 로컬 검증 완료

기준 **4830b38 + 기존 game-v02/승인 오디오 및 이번 결과 BGM 미커밋, 2026-10-24 KST**. 사용자 "모든 게임 끝나고 결과창 보여줄 때 BGM"을 반영했다. 공통 결과곡 `result-v01/expedition-records`는 기타 아르페지오·부드러운 현악·드문 목관으로 만든 **72BPM/8마디/26.6667초** 루프다. 기본 BGM28%×곡55%, 플레이곡보다 낮은 평균 음량이며 외부 샘플/Suno·새 의존성은 없다. 원본·이전 승인곡/효과음은 보존했다 [코드/산출물: result-v01/compose.py, manifest.json, validation.json]. [청음·세 모드 실제 음성 포함 영상](../sound-prototypes/result-v01/index.html). 확인된 결과 기록이 보이고 기존 종료 효과음이 끝나면 페이드 인한다. Group 개인 완주는 제외한다. 별도 연출 타이머 없이 기존 결과 표시 상태와 실제 AudioBufferSourceNode 종료를 따른다.

**npm 664/664·build/diff exit0**, PCM/루프/원본 보존 23검사, 실제 React/서비스 21검사, 청음/실제 음성 영상 10검사 통과(위 기준/날짜). Single random/custom/daily·Duel 승리/패배/기권/무효·Group 전체 종료, 1440/768/390px, 첫 조작·F5/중복·음소거/음량/SFX0·숨김/이탈·스킵/reduced-motion·연속 새 게임의 캐시된 BGM/늦은 결과 확인을 검증했다. 서버·Wikipedia·Realtime 응답은 격리 fixture이며 실제 DB 승패/XP 지급 검증이 아니다. 실기기/Safari·주관적 곡 분위기는 미확인이다. 기존 build chunk>500kB 경고는 남았다. 운영 접근/배포·SQL/Edge 변경·commit/push0.

## 2026-10-24 정글 BGM v02 — 비트 소폭 보강

기준 **4830b38 + 기존 live-v01 및 이번 비트 보강 미커밋, 2026-10-24 KST**. 사용자 요청 "비트를 조금만 더"를 반영했다. 원본 v01 PCM에 마디마다 약한 북 2회·짧은 나무 타격 2회를 추가한 game-v02를 만들었다. 선율·화음·80BPM·24초/8마디·기본 BGM28%×곡60%는 유지했다. 전체 RMS는 v01과 같고, 추가 레이어 RMS는 원본의 약10.5%다. 기존 v01과 승인 효과음/HOME 원본을 보존했다. 외부 샘플/Suno·새 의존성은 없다 [코드/산출물: game-v02/compose.py, manifest.json, validation.json]. [이전/새 곡 비교·실제 음성 포함 영상](../sound-prototypes/game-v02/index.html). 게임 변경은 `services/audioAssets.js`의 jungle 경로뿐이다. 테스트의 옛 파일명 하드코딩도 현재 자산 URL을 따르게 보정했다. 기존 7종 효과음 연결/게임 타이밍/설정은 그대로다.

**npm 659/659·build/diff exit0**, PCM/루프/원본 보존 29검사, 실제 React/서비스 11검사, 비교 청음/영상 10검사 통과(위 기준/날짜). 1440/768/390px에서 새 파일 요청·단일24초 루프·효과음 duck·이동/결과 정지·첫 조작/음소거/음량/F5/숨김 복귀를 확인했다. 새24초·이전24초·새48초 청음과 약29.1초 실제 음성 포함 영상은 정상1배속 끝재생했다. 서버·Wikipedia·Realtime 응답은 격리 fixture이며 새 실제 DB 성공 검증은 아니다. 실기기/Safari·주관적인 비트 양은 미확인이다. 기존 build chunk>500kB 경고만 남았다. 운영 접근/배포·서버/규칙 변경·commit/push0.

## 2026-10-24 효과음7종 연결·정글 인게임 BGM — 프론트 로컬 검증 완료

기준 **4830b38 + 기존 승인 오디오/종합본 미커밋 + 7종/정글 BGM, 2026-10-24 KST**. 사용자 "미연결7개 실제 게임 연결", BGM "약한 긴장감·정글 내부 탐험"을 반영했다. [최신 청음·실제 음성 포함 React 영상5개](../sound-prototypes/live-v01/index.html). 개인 도착/거절/참가/준비/연결끊김·복구/장착저장7종은 기존 runtime을 그대로 복사해 실제 Group 이동 응답·Duel/Group 대기실 승인 읽기·아이템/대기실 요청·진행 중 연결상태·프로필 저장 응답에 연결했다. 최초 snapshot/F5/quiet 재조회·재접속·숨김 복귀는 알림 기준만 갱신한다. 성공 확정 뒤 후속 재조회 실패에는 거절음을 내지 않는다 [코드: audioAssets/audioManager, audioFeedback, useLobbyAudio/useGameAudio, 관련 페이지/편집기]. 아래 미연결7종 표기는 이전 단계 기록이다.

정글 BGM은 직접 합성한 **24초/80BPM/8마디** 루프로 낮은 북·나무 타격·현악·드문 목관을 사용했다. Single random/custom/daily·Duel·Group의 실제 PLAYING 단계에서만 재생한다. 기본 BGM28%×곡60%, SFX 때 잠시40%로 duck, START/결과/복구/나가기 정지·첫조작/음소거/숨김/이동경합 복구를 기존 재생기에 통합했다. 신규 game WAV1,152,044bytes. 기존 HOME·아이템·클릭·축하/패배 원본/서버·게임 시간/규칙은 그대로다. 외부 샘플/Suno·새 의존성0 [코드/산출물: game-v01/compose.py, manifest.json, audioManager].

**집중30/30·npm659/659·build/diff exit0**, BGM PCM/루프/출처·승인원본28검사, 실제 제품 React/서비스의 격리 API·Wikipedia·Realtime 검증 **19검사**, 청음9개 정상1배속 끝재생/세너비·실제 audio/video5개 검증 **9검사 통과**(위 기준/날짜; `.temp/audio-live-20261024/`, game-v01/validation.json). **로컬 Docker 엔진 연결 불가**로 새 실제 DB/Auth/RPC 검증은 못 했다. 화면/서비스는 실제 코드지만 서버 응답은 fixture이며 실제 승패/지급 성공으로 표시하지 않는다. 주관적 정글 분위기/반복피로·실기기/Safari는 미확인. 원본 보존은 preservation.json, [인계](2.0x/AUDIO-GOAL-HANDOFF.md). 운영 접근/배포·전체 pgTAP·commit/push0.

## 2026-10-24 패배음 A 확정·지금까지의 사운드 종합 — 당시 종합본 기록

기준 **4830b38 + 기존 승인 오디오/v03 청음 미커밋 + A 선택/종합본, 2026-10-24 KST**. 사용자 "A버전 선택, 지금까지 나온 것 종합 청음"을 반영했다. `loss`만 승인된 `duel-loss-v03/brass`로 교체했고 원본 runtime을 그대로 복사했다.1.8초/gain0.45/category result·0.72초 cue/2.7초 연출/사건 key는 보존했다 [코드/승인: services/audioAssets.js, public/audio/duel-loss-v03/manifest.json, collection-v01/APPROVED-LOSS.json]. 이전 A/B 시안/영상은 보존한 당시 기록이다.

[최신 종합 청음 페이지](../sound-prototypes/collection-v01/index.html) · [약70초 전체 WAV](../sound-prototypes/collection-v01/all-current.wav). **개별31개 = 게임 연결음20개(21alias, finish/win 공용) + 미연결 알림7개 + START/박수/환호/휘파람 따로듣기4개**다. 합본은 앞27개를 모은70.354625초/27구간으로 원본을 새 작곡 없이 현재 속도·기본 음량으로 렌더했다. 원하는 구간부터 듣기/전체 정지/청음 전용 음량·세너비 대응·실제 오디오 포함 선택 A React 영상2개를 제공한다. 개인 도착음 승인 등 미연결 상태를 연결 완료로 바꾸지 않았다 [코드: collection-v01/build.py, template.html, manifest.json].

**PCM/출처/구간·원본 보존248검사·npm648/648·build/diff exit0**, Chromium 선택 A 실제 제품 연결 **16검사**, 종합 페이지·31개 디코딩/음량/중복방지/정지/구간탐색·70초 정상1배속 끝재생·4개 별도음 끝재생·숨김정지·실제 audio/video2개 **15검사 통과**(위 기준/날짜; `.temp/audio-collection-20261024/`, collection-v01/validation.json). API/결과 사건은 격리 fixture이며 새 실제 서버 승패 검증이 아니다. 주관적 전체 밸런스·실기기/Safari는 미확인. 기존891파일 보존 대조는 preservation.json, [인계](2.0x/AUDIO-GOAL-HANDOFF.md). 운영 접근/배포·commit/push0.

## 2026-10-24 듀얼 패배음 악기 교체 시안 v03 — A 사용자 선택 확정·당시 청음 기록

기준 **4830b38 + 기존 승인 오디오/패배 v02 미커밋 + 다른 악기 청음, 2026-10-24 KST**. 사용자 "피아노인가, 다른 악기도 활용, 아직 애매" 피드백으로 기존 단음 레이어를 재사용하지 않고 **A 트롬본 느낌의 처지는 금관+작은 팀파니 / B 첼로 느낌의 활로 켜는 낮은 현악**2개를 직접 합성했다. 둘 다1.8초/기존과 동일 RMS·개별45%×기본SFX75% 청음이다. 실제 악기 녹음/외부 샘플·새 의존성은 없다. [A/B/이전 v02 비교·실제 음성 포함 연출 영상](../sound-prototypes/duel-loss-v03/index.html). **새2개는 docs 아래 청음 시안이며 게임 기본음은 v02 유지**다 [코드: duel-loss-v03/synthesize.py, manifest.json; services/audioAssets.js 미변경].

**PCM/다른 파형·스펙트럼/레벨/보존41검사·npm648/648·build/diff exit0**, Chromium1440/768/390 두 악기×3너비 실제 연출 cue1회/1.8초 자연종료·A/B/이전본 끝재생·비교페이지·실제 오디오 영상2개 **13검사 통과**(위 기준/날짜; `.temp/audio-loss-instruments-20261024/`, duel-loss-v03/validation.json). 영상은 검수 중에만 WAV응답을 바꾼 청음이며 제품 기본음 교체 증거가 아니다. API/결과 사건도 격리 fixture로 새 실제 서버 승패 검증이 아니다. 악기 유사성/취향·실기기/Safari는 미확인. 기존 제품/음원/미커밋 보존은 preservation.json, [인계](2.0x/AUDIO-GOAL-HANDOFF.md). 운영 접근/배포·commit/push0.

## 2026-10-24 듀얼 패배음 v02 — 현재 게임 기본음·다른 악기 후보 비교 중

기준 **4830b38 + 기존 승인 오디오/패배 v01 미커밋 + 풍성한 패배음, 2026-10-24 KST**. 사용자 "느낌은 좋은데 더 풍성하게, 뭔가 부족하다" 피드백으로 v01의 F4–E4–D4 하강 선율을 바탕으로 낮은 옥타브 관악기·작은 미세 합주·마지막 단조 화음·19~93ms 짧은 반사를 보탰다. 전체 RMS는 기존과 맞췄고 길이1.8초·gain0.45·기존0.72초 cue/2.7초 연출/사건 key는 유지했다. `loss` 경로만 새 v02로 바꿨다 [코드: services/audioAssets.js, duel-loss-v02/synthesize.py]. [동일 설정 A/B·실제 음성 포함 React 영상](../sound-prototypes/duel-loss-v02/index.html). 직접 합성한86,444bytes 게임 파일이며 외부 샘플/새 의존성은 없다.

**PCM/동일 RMS/중저음·원본 보존28검사·npm648/648·build/diff exit0**, Chromium1440/768/390 기존 cue·1.8초 자연종료·중복/F5/음소거/SFX0·스킵/숨김/화면 이동·첫 조작·reduced-motion·승리/기권 분리·A/B·실제 음성 영상2개 **22검사 통과**(위 기준/날짜; `.temp/audio-loss-rich-20261024/`, duel-loss-v02/validation.json). API/결과 사건은 격리 fixture이며 새 실제 서버 승패 검증이 아니다. 주관적인 풍성함과 실기기/Safari는 미확인. 이전 패배 v01·환호·승인 아이템/클릭·미커밋 원본 보존은 preservation.json, [인계](2.0x/AUDIO-GOAL-HANDOFF.md). 운영 접근/배포·commit/push0. 아래 v01은 이전 비교 기록이다.

## 2026-10-24 듀얼 패배음 연장 — v01 이전 음색 기록

기준 **4830b38 + 기존 승인 오디오/celebration-v02 미커밋 + 긴 패배음, 2026-10-24 KST**. 사용자의 "좋아"로 고음 환호/휘파람을 승인 기록하고 듀얼 정상 패배의 `loss`만 기존 약0.49초 도장→1.8초의 부드러운 F4–E4–D4 하강음/낮은 여운으로 교체했다. 기존0.72초 cue에서 재생해2.7초 결과 연출 전에 자연 종료한다. gain0.45/category result·같은 사건 key·모든 게임/연출/서버 시간·기권/승리음·승인 아이템은 유지했다 [코드: services/audioAssets.js, duel-loss-v01/synthesize.py]. [A/B·실제 음성 포함 React 영상](../sound-prototypes/duel-loss-v01/index.html). 게임용24kHz mono16bit86,444bytes, 직접 합성/외부 샘플·Suno·새 의존성0.

**PCM/음정/보존27검사·집중19/19·npm648/648·build/diff exit0**, Chromium1440/768/390의 기존 시점1회/전체1.8초 자연종료·중복/F5·reduced-motion·음소거/SFX0·스킵/숨김/페이지 이동·첫 조작 전 사건·승리/기권 분리·A/B/대표 실제 오디오 영상2개 **22검사 통과**(위 기준/날짜; `.temp/audio-loss-20261024/`, duel-loss-v01/validation.json). API/결과 사건은 격리 fixture이며 새 실제 서버 성공 검증이 아니다. 음색/여운의 주관적 청음과 실기기/Safari는 미확인. 기존 원본/미커밋 보존은 preservation.json, [인계](2.0x/AUDIO-GOAL-HANDOFF.md). 운영 접근/배포·commit/push0.

## 2026-10-23 고음 환호·휘파람 보완 — 10-24 사용자 청음 승인

기준 **4830b38 + 기존 승인 오디오/celebration-v01 미커밋 + 고음 환호/휘파람, 2026-10-23 KST**. 사용자 "환호가 낮고 환호 같지 않다, 더 높은 소리/휘파람" 피드백을 반영했다. 낮은 폐쇄 모음을 높은 열린 환호(기음390/480/570Hz)로 교체하고 약2~3kHz로 올라가는 휘파람2회를 추가했다. 기존 박수+징글은 그대로 사용했고 새 레이어1.65초/전체3.8초, finish/win gain0.8·기존 결과 key/시점은 유지했다 [코드: services/audioAssets.js, celebration-v02/synthesize.py]. [최신 A/B·환호/휘파람 단독·실제 오디오 포함 React 영상](../sound-prototypes/celebration-v02/index.html). 직접 합성한 소리이며 사람 녹음/외부 샘플/Suno·새 의존성은 없다.

**PCM/고음 성분/휘파람/원본 보존67검사·집중19/19·npm648/648·build/diff exit0**, Chromium1440/768/390 결과3종·기존시점1회·1.65초 구간 재생·중복/F5/RM/음소거/숨김 복귀·패배/기권 제외·개별5음원 끝재생·실제 음성 포함 영상3개 **32검사 통과**(위 기준/날짜; `.temp/audio-cheer-20261023/`, celebration-v02/validation.json). API/결과 사건은 격리 fixture이며 새 실제 서버 성공 검증이 아니다. 음색의 주관적 자연스러움·실기기/Safari는 미확인. 기존 v01/아이템/클릭·개인 도착음은 보존했고 운영 접근/배포·commit/push0. [인계](2.0x/AUDIO-GOAL-HANDOFF.md). 아래 v01은 이전 음색/영상 기록이다.

## 2026-10-23 도착·승리 박수/환호 — v01 이전 음색 기록

기준 **4830b38 + 기존 승인 오디오 미커밋 + 결과 박수/환호, 2026-10-23 KST**. 사용자 "좋네"로 ui-v03 개인 도착음 승인([기록](../sound-prototypes/ui-v03/APPROVED.json)), 이어 요청한 축하음은 [celebration-v01 청음·실제 오디오 포함 React 영상](../sound-prototypes/celebration-v01/index.html)에 정리했다. 기존3.8초 완주 징글에 직접 합성한 짧은 박수/작은 비언어적 환호1.65초를 섞어 `finish`/`win` alias만 교체했다. **솔로 서버확인 도착·듀얼 승리·그룹 최종1위 발표**의 기존 시점/중복 키로 재생한다. 그룹 개인 완주/2·3위·패배/기권에는 추가하지 않았다. 게임용 추가182,444bytes, 원본 징글·아이템/클릭 볼륨·재생기/컴포넌트/게임/서버 시간 계약은 그대로다 [코드: services/audioAssets.js, celebration-v01/synthesize.py].

**PCM/레이어/보존67검사·집중19/19·npm648/648·build/diff exit0**, Chromium1440/768/390 결과3종 기존시점1회·박수구간 끝재생·중복/F5 무음, reduced-motion·패배/기권·음소거/숨김 복귀, 비교페이지·오디오/영상3개 **32검사 통과**(위 기준/날짜; `.temp/audio-celebration-20261023/`, celebration-v01/validation.json). API/결과 사건은 격리 fixture이며 실제 서버 성공 재검증은 아니다. 첫 Single 검사는 완주 fixture가 비어 정상적으로 재생 차단됐고 올바른 확정 기록을 넣어 통과했다. 주관적 박수/합성환호 음색·실기기/Safari는 미확인. 승인된 개인 도착음과 나머지 일반 알림 후보의 이벤트 연결은 아직 후속이다. 운영 접근/배포·commit/push·외부 샘플/Suno·새 의존성0. [인계](2.0x/AUDIO-GOAL-HANDOFF.md).

## 2026-10-23 개인 도착음 보완·Duel/Group 참가/준비 공용 — 도착음 사용자 승인

기준 **4830b38 + 기존 ui-v02/승인 아이템 미커밋 + 도착음 보완, 2026-10-23 KST**. 사용자 피드백으로 Group 개인 도착음을 단순 타격0.78초→상승4음/마지막 안정된 화음1.55초로 바꿨다. 기존 원본 완주 징글의 D장조 모티프를 짧게 합성한 효과음이며 원본 파일은 보존했다. [최신 도착음 A/B·공용 참가/준비 청음](../sound-prototypes/ui-v03/index.html). 참가음과 준비음은 기존 ui-v02 파일을 그대로 사용해 Duel/Group 공용 후보로 정리했다. Duel은 두 명 입장+방장 목표 확정으로 시작 가능해지는 전환, Group은 전원 READY 전환에 대응한다 [코드 확인: pages/RoomPage.jsx canStart/hasGuest/hasHostTarget]. 별도 게임 규칙/버튼을 추가하지 않았다.

새1개 원본48kHz mono24bit·24kHz mono16bit 파생74,444bytes·기본75% 청음본/출처/SHA를 docs/ui-v03에만 뒀다. **아직 게임 이벤트 미연결**이며, 참가/준비가 동시에 충족되면 준비음 우선1개·최초 snapshot/F5/중복 무음 원칙을 연결안에 적었다. 승인 아이템·현재 클릭 gain0.5·기존 후보는 그대로다. **PCM/실제4음/보존23검사·집중19/19·npm648/648·build/diff exit0**, Chromium1440/768/390·도착음A/B/보존6개 끝재생 등 **5검사 통과**(위 기준/날짜; `.temp/audio-arrival-20261023/`, `ui-v03/validation.json`). 이후 같은날 사용자 "좋네"로 도착음 음색을 승인했다. 실기기/Safari·실제 사건 연동은 미확인. 운영 접근/배포·commit/push·새 의존성/외부 샘플/Suno0. [인계](2.0x/AUDIO-GOAL-HANDOFF.md) · [연결안](2.0x/AUDIO-NEXT-SFX.md).

## 2026-10-23 클릭음 소폭 증가·새 효과음7종 — 이전 초안

기준 **4830b38 + 기존 승인 아이템/UI 미커밋 + 클릭 크기/후보 제작, 2026-10-23 KST**. 클릭음만0.4→0.5(+1.94dB)로 높여 게임에 반영했다. 원음·80ms 길이·전체 SFX볼륨·기존 UI/게임 gate는 유지했다 [코드: services/audioAssets.js]. [최신 클릭 비교·새7종·실제 클릭음 포함 React 영상](../sound-prototypes/ui-v02/index.html). 새 원본은 개인완주·요청거절·참가·Group 전원준비·연결끊김·복구·저장확인7개다. **7종은 청음 초안이며 게임 이벤트 미연결**, 앱에서 요청/사전 로드하지 않는다. 원본48kHz mono24bit·검토용24kHz mono16bit(전체127,988bytes)·기본75% 청음본·출처/SHA를 docs 아래에만 두었다. 기존 승인 아이템 파일·볼륨은 그대로다 [코드/산출물: ui-v02/synthesize.py, manifest.json].

**PCM/연결94검사·집중19/19·npm648/648·build/diff exit0**, Chromium 실제 React 클릭 gain0.5(1440/390)·후보 요청0·9개 청음 정상1배속 끝재생·1440/768/390 비교페이지·실제 음성 포함 녹화2개 **8검사 통과**(위 기준/날짜; `.temp/audio-next-20261023/`, `ui-v02/validation.json`). 새 후보의 서버 사건 연동 검증을 한 것은 아니다. 사용자 주관적 청음·실기기/Safari는 미확인. 운영 접근/배포·commit/push·새 의존성/외부 샘플/Suno0. [인계](2.0x/AUDIO-GOAL-HANDOFF.md) · [후보/연결 조건](2.0x/AUDIO-NEXT-SFX.md). 아래 클릭0.4/후보 미제작 서술은 이전 단계 기록이다.

## 2026-10-23 아이템 승인·버튼 클릭음 — 이전 단계 기록

기준 **4830b38 + 기존 승인 아이템/오디오 미커밋 + 버튼음, 2026-10-23 KST**. 사용자 "좋아.아이템은 이걸로 고정"에 따라 현재 v04+이동v05의6개 alias/5개 WAV·볼륨·SHA를 [확정 목록](../sound-prototypes/ITEM-SFX-APPROVED.json)에 기록했다. 음원 파일은 바꾸지 않았다. [버튼음·실제 오디오 포함 React 영상](../sound-prototypes/ui-v01/index.html) · [추가 효과음 조사/우선순위](2.0x/AUDIO-NEXT-SFX.md) · [인계](2.0x/AUDIO-GOAL-HANDOFF.md).

직접 합성한80ms 클릭1개(게임용3,884bytes)를 활성 버튼/공통 헤더의 trusted click에 연결했다. 마우스·터치·Enter/Space1회,80ms 간격 제한. 비활성/본문/스크립트 입력은 무음이다. UI voice1개를 게임음과 분리해 아이템음 자리를 빼앗거나 사건 claim2048개를 소모하지 않는다. 음소거/SFX볼륨·첫 조작·숨김/실패 gate를 공유하며, 내부 화면 이동에서는 짧은 클릭만 끝까지 재생한다 [코드: services/audioAssets.js, audioManager.js].

**집중19/19·npm648/648·build/diff exit0**, Chromium1440/768/390 실제 HOME 버튼·마우스/터치/Enter/Space·첫 조작·연속/무효 입력·볼륨/음소거·화면 이동·아이템2초 보존·음성 포함 녹화2개 **42검사 통과**(위 기준/날짜, `.temp/audio-ui-20261023/`). API/게임 사건은 격리 fixture이며 새 실제 서버 성공 검증은 아니다. 추가 후보는 Group 개인완주·실패/거절(우선), 대기실 참가/Group 전원READY·연결 상태, 장착 저장 완료다. 버튼 외 후보는 아직 연결/제작하지 않았다. 아이템 청음은 사용자 승인, 버튼 청음·실기기/Safari는 미확인. 운영 접근/배포·commit/push·새 의존성/외부 샘플/Suno0.

## 2026-10-23 책 한 장 음색 정리 v05 — 아이템 사용자 승인

기준 **4830b38 + 기존 v04 미커밋 + 책넘김 정리, 2026-10-23 KST**. 사용자 "여러 장 넘기는 듯하다" 피드백에 따라 v04의32/91Hz 진폭 떨림·긴 마찰·뒤쪽 독립 접촉을 제거했다. 약0.6초 한 번 넘김과 약한 연속 여운으로 바꾸고2초 버퍼는 유지했다. 소리를2초 내내 끌지 않는다. 이동·도움 아이템·일반 링크 이동의 동일파일 alias만 `sfx-v05/page-turn-clean.wav`로 교체했다. 다른 아이템/VS/HOME·재생기·게임/서버 계약은 보존했다 [코드: services/audioAssets.js, sfx-v05/synthesize.py]. [최신 A/B·실제 오디오 포함 React 영상](../sound-prototypes/sfx-v05/index.html) · [인계](2.0x/AUDIO-GOAL-HANDOFF.md).

**WAV/연결28검사·오디오 단위16/16·npm645/645·build/diff exit0**, Chromium1440/390 실제 React 이동1회·중복/거절/음소거 무음·2초 버퍼 수명, A/B 끝재생·1440/768/390 비교페이지·실제 음성 포함 영상2개 **12검사 통과**(위 기준/날짜). 산출물 `.temp/audio-page-clean-20261023/`, `sfx-v05/validation.json`. 사건/API는 격리 fixture이며 실제 서버 성공 증거가 아니다. v04와 기존 미커밋 보존, 새 의존성/외부 샘플/Suno·운영 접근/배포·commit/push0. 이후 같은날 사용자 청음으로 아이템음을 승인/고정했다. 실기기/Safari는 미확인. 아래 v04/v03는 당시 기록이다.

## 2026-10-23 아이템음2초·VS 충돌 보완 — v04 당시 기록

기준 **4830b38 + 기존 오디오/음색 미커밋 + 요청한2초 보완, 2026-10-23 KST**. [당시 v04 청음·실제 오디오 포함 React 영상](../sound-prototypes/sfx-v04/index.html) · [연결/검증 인계](2.0x/AUDIO-GOAL-HANDOFF.md). 아이템음은 동작과 여운을 포함해 각각2초로 연결했다. 먹물은0/0.62/1.24초 찰박3회, 이동은 책 한 장 넘김, 방어는 승인된 v03 금속 타격에 여운 연장, 반사는 같은 계열의 검 패링, VS는 검열과 분리한 더 큰 쿵 충돌이다. 검열·도움 아이템도2초. 일반 링크 이동은 같은 책넘김을 작고 빠르게1.25초 사용한다. 기존 게임/애니메이션 시간·서버 계약·음소거/중복 gate는 유지했다 [코드: services/audioAssets.js, audioManager.js, sfx-v04/synthesize.py].

원본48kHz mono24bit와 게임용24kHz mono16bit6개(**576,264bytes**)를 새 폴더로 분리하고 v01/v02/v03를 보존했다. **WAV/연결109검사·오디오 단위16/16·npm645/645·build/diff exit0**, Chromium 실제 React fixture1440/390에서 재생원 수명2초·중복/거절/음소거·A/B12개 끝재생·세 너비1440/768/390 비교페이지·영상/음성 동시녹화2개 **32검사 통과**(위 기준/날짜, 산출물 `.temp/audio-duration-20261023/`, `sfx-v04/validation.json`). API/사건은 격리 fixture이며 실제 서버 성공 검증을 새로 한 것은 아니다. 사용자 주관적 청음·실기기/Safari는 미확인. 운영 접근/배포·commit/push·새 의존성·외부 샘플/Suno0. 아래 v03는 이전 음색의 보존 기록이다.

## 2026-10-23 효과음 음색 분리 — v03 당시 기록

기준 **4830b38 + 기존/오디오 미커밋 + 음색 보완, 2026-10-23 KST**. 사용자 "칼림바·책넘김 위주" 피드백을 반영했다. 실제로 이전 아이템음은 종이/카운트/시작음의 재생률 변형이었다. [이전/변경 청음·새 오디오 포함 React 영상](../sound-prototypes/sfx-v03/index.html) · [연결/검증 인계](2.0x/AUDIO-GOAL-HANDOFF.md). 기존 음원은 그대로 두고 물방울·나무 도장·금속판 충돌·두 번 튕김·이동 바람5종을 직접 합성해 `services/audioAssets.js`에 연결했다. 게임용 추가113,500bytes. HOME·책 START·카운트다운·완주 음악·재생기/게임/서버 계약 무변경 [코드: sfx-v03/synthesize.py, public/audio/sfx-v03/manifest.json].

**npm645/645·build/diff exit0**, 오디오 단위16/16·WAV검증100/100·Chromium 실제 React 사건fixture/비교청음/오디오녹화18검사 통과(위 기준/날짜). 실제 서버·운영 사건 검증을 새로 한 것이 아니며, API/이벤트는 격리fixture다. 기존 원본/미커밋 보존, 새 의존성·외부 샘플/Suno·DB/Edge·운영 접근/배포·commit/push0. 사용자 주관적 청음·실기기/Safari는 미완료. 아래10-17 영상은 이전 음색의 보존 기록이다.

## 2026-10-17 공통 오디오·게임 이벤트 통합 — 로컬 완료

기준 **4830b38 + 기존/오디오 미커밋 작업 트리, 2026-10-17 KST**. [연결표·파일·검증·실패/재개·한계](2.0x/AUDIO-GOAL-HANDOFF.md). 기존 v01/v02와 미커밋을 보존하고 v02 A 칼림바 HOME30초 및 기존5개 SFX 파생본(24kHz mono PCM16, 전체1,813,224bytes)을 사용했다. 외부 샘플/Suno·새 의존성 없음. 공통 Web Audio BGM/SFX·전체음소거·별도볼륨/localStorage·첫 조작/거절복구·fade·숨김정지·모드별lazy decode·한정동시재생·sessionStorage 중복 방지를 추가했다 [코드: services/audioManager.js, audioAssets.js, components/AudioControls.jsx, public/audio/manifest.json].

Single 기존8.6초 서버시계/RAF, Duel/Group 기존 연출 프레임·카운트 상태, 승인 이동·아이템 피드백 gate·서버 확정 결과/XP에 연결했다. 게임시간/XP/랭킹/아이템 규칙·SQL/Edge 변경0. reduced-motion에서는 START 연출음을 생략하지만 새 확정 결과음은1회, F5 복구 결과는 무음이다. 실제 빌드에서 공통 Notebook relative 규칙이 START fixed를 덮던 기존 CSS 충돌을 시작 오버레이 제외1행으로 복구했다 [코드].

검증: **npm test645/645·build/diff-check exit0**, 집중 오디오16/16, React fixture46/46·reduced 결과10/10·설정UI6/6, 실제 격리 Single random/custom/daily×1440/768/390 **75검사**, 실제 Duel 승패/Group START·개인/전체종료17검사, 실제 아이템 applied/blocked/reflected/이동18검사, 기권 세너비4검사. 연출 중 F5/스킵/숨김 복귀와 reduced-motion 실제 추가 검증은 인계의 최종 산출물을 따른다. 위 기준/날짜이며 미커밋 결과다. 운영·공개Wikipedia·실기기/Safari 검증은 아니다. 백엔드는 격리 local Auth/RPC/Realtime/DB이고 Wikipedia/snapshot 콘텐츠만 fixture, 아이템 배치는 로컬 고정이다 [산출물: .temp/audio-goal-20261017/].

대표 실제 오디오+영상12개·개별 SFX·이벤트 로그는 같은폴더 review/index.html. 12개 모두 영상/음성 각1트랙·비무음PCM·디코딩 확인, 대표 Single390 영상 정상1배속 끝재생. 후시 음원 삽입 없음. 주관적 음량/반복피로 청음·실기기/Safari는 후속이다. 기존 큰번들/CRLF 경고 유지. 운영 접근/적용·배포·commit/push/reset/clean/stash0. 아래는 기존 음원/디자인 작업의 당시 이력이다.

## 2026-10-16~17 HOME BGM v0.2 A/B — 합주 편곡 청음 대기

기준 **4830b38 + 기존/이번 미커밋 작업 트리**, **제작/오디오·브라우저 검증2026-10-16 KST, 최종 보존 대조10-17 KST**. 사용자 v0.1 청음: 효과음 만족, HOME은 칼림바/다른 악기가 따로 연주하는 인상 [사용자 보고]. [A/B 미리듣기](../sound-prototypes/v02/index.html) · [원인 분석·역할 관계·재생성](../sound-prototypes/v02/README.md). 오디오 제출물은 `docs/sound-prototypes/v02/`의 A/B30초 WAV 두 곡뿐이며 새 합본/효과음/ZIP은 만들지 않았다.

v0.1은 공통96BPM/D장조였으나 유음3파트 음역/패턴이 겹치고 패드가 마디180ms 전부터3.6초 지속돼 이웃화음1.1초 중첩이었다 [코드/분석: `v01-analysis.json`]. 이를 악기/볼륨 교체만으로 처리하지 않고 D장조·4마디 화음 지도 D6→G6→Bm7→Aadd9·4마디×3구절 선율/쉼/반주를 새로 작성했다. A는 칼림바 선율+패드, B는 플루트 선율+한 옥타브 이상 낮은 칼림바2음 반주. 두 안 모두 근음 베이스1/3박·셰이커2/4박, 악기4개/주선율1파트, 원음은 현재 코드마디 안에서 끝나며 짧은 잔향만 이월한다 [코드: `compose.py`; 악보: `score.json`].

**악보/오디오44/44·Chromium 오프라인16/16 통과**(위 기준/날짜). 최종PCM의 A37/B36 선율 발음 음정식별, 현재 코드/조성·박/쉼·음역 분리·원음 gate, 경계1/2차 변화·클리핑0·추정4배peak·동일약-22LUFS 확인. A/B 각30초 실제1× 끝 재생·같은시점 전환·반복·390/768/1440px 확인 [산출물: `validation.json`, `preview-validation.json`; 화면: `.temp/sound-v02-20261016/`]. v0.1/효과음과 앞선 미커밋 보존은 같은폴더 `preservation.json` 참조. 루프/코드 검사 통과가 주관적인 합주감·불협감/반복 피로도 승인을 뜻하지 않는다. 실기기/Safari·인증미터·게임동기화는 미검증. 앱 소스 변경0으로 전체 npm/build·DB 검증은 반복하지 않았고 게임 연결/운영 접근/배포·commit/push·기존 미커밋 삭제0.

## 2026-10-16 사운드 시안 — 게임 연결 전 청음 대기

기준 **4830b38 + 기존/이번 미커밋 작업 트리**, **2026-10-16 KST**. [미리듣기](../sound-prototypes/index.html) · [제작/재생성 설명](../sound-prototypes/README.md) · [실제 연출 연결 제안](../sound-prototypes/TIMELINE.md). `docs/sound-prototypes/` 안에 직접 합성한 HOME30초 루프(96BPM/12마디), 일지/책장/카운트/시작/완주5종, 카운트 합본과 전체83초 청음 WAV를 정리했다. 모두48kHz/24-bit/stereo. 외부 샘플·음원·사운드폰트·음악 생성 서비스·새 의존성 없음 [코드/산출물].

현재 `SingleStartCinematic`/시간함수/실제 GamePage 분기를 읽어 표지.10초·책장2.90초·3/2/1의6.00/6.70/7.40초·시작문구8.10초·본문8.60초와 구계약2.6초를 구분했다. WAV/HTML은 독립 검수물이며 게임 소스의 사운드 연결·게임 타이밍/정책 변경은0이다 [코드].

**오디오51/51·Chromium 오프라인16/16 통과**(위 기준/날짜). PCM 재읽기/해시/클리핑/DC/4배peak 추정·루프 경계·카운트700ms 대조, 전체83초 실제1× 끝 재생·개별WAV/탐색/반복·390/768px 가로넘침 없음. 데스크톱/모바일 PNG는 `docs/sound-prototypes/review/`. 최초 기본 브라우저 경로 누락은 설치된 Chromium 명시 경로로 해결했고, 초기 고정대기/즉시이벤트 단언은 디코딩/이벤트 완료 대기로 보완했다. 마지막 초기 실패 자료는 같은 review 폴더에 보존하고 ZIP에는 최종 산출물만 포함한다 [산출물: `validation.json`, `preview-validation.json`].

**음악적 분위기·음량/반복 피로도의 사용자 청음 승인은 미완료**. 실기기/Safari·인증LUFS/true-peak 미터·게임 내 동기화는 미검증이다. 앱 소스 변경이 없어 이번에는 앱 전체 npm/build·DB 검증을 반복하지 않았다. 대표ZIP은 `docs/sound-prototypes/wiki-race-sound-prototypes-v01-20261016.zip`; 파일별manifest/ZIP해시 검증은 같은 폴더 `package-validation.json` 참조. 운영 접근·배포·commit/push·기존 미커밋 삭제 없음.

## 2026-10-16 HOME 좌우 장식 아트 적용

기준 **4830b38 + 기존/이번 미커밋 작업 트리**, **2026-10-16(한국)**. 제공 ZIP의 좌우 WebP는 각각 **480×1200 RGBA/실제 투명 픽셀 존재**. `docs`에 추출 원본·ZIP을 보존하고 `public/assets/wiki-race/home/`에 동일 바이트로 복사했다. `WikiRaceShell.jsx`에 HOME 전용 `aria-hidden` 장식 레이어, `wikiRaceHome.css`에 1280px 이상에서만 이미지 배경·원본 비율·안쪽/하단 페이드·pointer-events:none을 추가했다. 기존 바깥 우측 gear 의사요소만 대체했으며 중앙 HOME·HERO·오늘 도전·랭킹/XP·게임/DB/Edge는 이번 작업에서 변경하지 않았다 [코드].

실제 React 빌드의 **1920/1440/1024/390** 전후 좌표·중앙 캡처 비교, 시작 CTA, 가로 넘침, 이미지 디코딩, 모바일→데스크톱 resize, 이미지 실패 확인. **1024/390의 최초 장식 요청 0건**. 최종 브라우저 **8/8**, **npm test 629/629 · build/diff-check exit 0** — 기준/날짜는 위와 같다. localhost 접근 제한으로 빌드 파일을 Playwright HTTP 응답으로 제공했으며 계정·코스·랭킹·하단 위키 데이터는 격리 fixture다. 운영·실기기/Safari 검증은 아니다. 기존 큰 번들 경고 유지 [산출물: `.temp/home-side-art-20261016/{before,after}/`, `pixel-comparison.json`, `preservation.json`, `test.log`, `build.log`, `diff-check.log`]. 새 ZIP·장문 보고서·배포·commit/push 없음.

## 2026-10-16 HOME React 중앙 흐름 통합 (좌우 아트 적용 전 기록)

기준 **4830b38 + 기존/이번 미커밋 작업 트리**, **2026-10-16(한국)**. [변경·데이터 구분·제한·재검증](2.0x/HOME-GOAL-HANDOFF.md). 현재 이미 중앙 순서인 DOM을 유지하면서 HOME 전용 CSS 우선순위·HERO 지도/HTML 제목/게임 설명/주 CTA·오늘 도전·탐험가/TOP3·단일 최근 탐험·기록판·하단 위키 노트를 정리했다. 랭킹/기록 오류를 독립 표시하고, 공식 코스 확인 실패 시 fallback 제목을 숨기며 기존 시작 차단을 유지한다. 서버/게임/보상/시간 계약 변경 없음 [코드: `pages/MainPage.jsx`, `components/wiki-race/ExpeditionHero.jsx`, `components/WikiHighlights.jsx`, `css/wikiRaceHome.css`].

npm test **629/629**, 집중 계약 **47/47**, 최종 build / diff-check exit 0. 브라우저 수정 전 **7/7**, 개선 fixture **28/28**, Wikipedia·Commons 실제 읽기 **9/9**, 최종 빌드 미리보기 **7/7**. 다섯 너비1920/1440/1024/768/390·긴 이름/문서·공동 순위·빈 상태·부분/전체 실패·이미지 실패·Guest·키보드·reduced motion·주요 진입 확인. 계정/장착/코스/랭킹은 격리 fixture이며 운영 검증이 아니다. 기준/날짜는 위와 같다 [산출물: `.temp/home-goal/{before,after,live,build-preview}/checks.json`, `test.log`, `focused.log`, `build.log`, `diff-check.log`].

전용 좌우 정글/유적 이미지는 미확보. `wiki-home-b-visual-study.zip`의 draft crop은 README가 실제 적용을 금지하여 사용하지 않았다. 기존 승인 gear-cluster만1600px 이상 우측 바깥에 정적으로 재사용한다. 최종 비교·React 영상·단일 증빙ZIP: `.temp/home-goal/review/`, `.temp/home-goal/HOME-REACT-2026-10-16.zip`. 기존 미커밋 파일 지문 대조는 `preservation.json`에 기록한다. 운영 Supabase/Edge/Vercel 접근·적용·배포·commit/push 없음.

## 2026-10-16 Single START / RESULT — 시각 피드백 2차

기준 **4830b38 + 기존 random/custom/daily 통합 미커밋 + 이번 UI 미커밋**, **2026-10-16(한국)**. [변경파일·검증·한계·재개](2.0x/SINGLE-VISUAL-FEEDBACK-2-HANDOFF.md). 출발 위 “탐험의 첫 문서” / 목표 위 “도착할 문서” 복구, 긴 제목 측정에서 라벨 공간 제외. 아래 설명 없이 큰 파랑/금색 제목 유지. Single 결과 visible skip 제거·내부 Escape/포커스 유지. 기존 업적을 메달·완료 스탬프·보상 칩으로 표시하고 XP를 크게 강조 [코드].

- 최종 실제 로컬 Deno/wiki-snapshot/Auth/RPC/DB/React **세모드 × 1440/768/390 회원9조합 + Guest random390/RM1 = 10조합·21검사**, 결과 skip 노출0·가로 넘침 없음·page/console/API 예상 밖 오류0. 기존 예약8600ms/시각·정상완주·XP custom15/daily25/random20·첫 도착30·Guest 영구기록/XP0 확인. Wikipedia HTTP만fixture이며 공개Wikipedia 완주 증거는 아님 [산출물].
- **npm629/629·build/diff exit0**, 최종 라벨 대비까지 반영한 제목/전체보기/resize/CTA **27측정** 재통과. 기존572파일 중 허용 UI/문서 외 변경·삭제0, 서버/migration/랜덤/XP·업적 지급/순위 소스 동일. Duel/Group 연출·업적 마크업, 공용 XP 조회·계산·reveal/seen 원문 동일 [산출물/보존 검사].
- 새 START/결과 PNG와 실제 React 영상10개를 대표 검수 ZIP 하나로 제출: .temp/single-visual-feedback-20261016/single-visual-feedback-2-review-20261016.zip. 영상 정상1×/끝 프레임·ZIP manifest는 동봉 검증JSON 및 루트 zip-verification.json 참조. 기존 영상/ZIP은 이력으로 보존 [산출물].
- 중간 하니스의 Guest 문구 단언 오류·로컬 JWT 시각 오류를 하니스에서 보완한 뒤 전체10개 재실행. 제품 인증/정책 변경 없음. 검증 스택은 backup 유지 stop, 원래 사용자 로컬DB 유지. 실기기/Safari·실제 외부가용성은 미검증, 기존 큰번들 경고 유지. 운영 접근/적용/배포·commit/push/reset/clean/stash0 [산출물].

## 2026-10-16 Single Random — 신규 서버 연동 로컬 완료

기준 **4830b38 + 기존 미커밋 보존 + random 목표 미커밋, 2026-10-16(한국)**. [파일·승인·검증·실패·재개](2.0x/SINGLE-RANDOM-GOAL-HANDOFF.md). 사용자 승인으로 신규random은 한국어Wikipedia 일반 문서에서 출발·목표를 각각 독립 무작위 선정한다. 난도50/40/10·target-level·후보 풀·경로 탐색은 신규경로에서 사용하지 않는다. custom/daily의 기존 single_reserved_prefetch_v1·8.6초 연출을 재사용한다.

- 서버가 namespace0/page ID/revision을 검증하고 pinned snapshot과 실제본문/run identity를 대조한다. 외부JSON읽기까지 전체29초 상한(정리여유100ms)·요청최대12초·합계후보12회. 마지막실험28,904ms에ALLOCATION_EXPIRED·코스반환0. 장애는 재추첨하지 않는다. pending·DB할당lease30초·준비TTL60초·최근5분미완주3건·예약시각·스킵/RM/F5는 기존계약이다 [코드/산출물].
- 선검증 random8경로62검사 뒤 제품신규생성분기를 전환했다. 100ms보정 포함 최종제품원문에서 세모드8경로56검사 재통과. 추가 random8경로62·오류6경로52·구계약2경로8·순위/프로필9·Duel/Group13·회원/Guest각12동시요청5시나리오 통과. 구계약run/F5/결과·기존시간/NULL cohort·random20XP·Guest영구기록/XP없음·XP/업적판정 보존. 모두 위기준/날짜, 예상밖page/console/API오류0 [산출물].
- **npm629/629·build/diff exit0**, 새빈최종격리프로젝트 wiki-next-goal-random-final-20261016에서 migration42개 순차적용·원본SHA동일·pending0·PG17.6.1.158·**전체pgTAP28파일1500/1500**. 브라우저데이터가남은DB의중간SQL재실행에서는 기존daily테스트의 날짜변경이 불변가드에 막혔고, 제품/Daily/그테스트 변경 없이 빈DB에서 재검증했다. 기존advisorsWARN5/ERROR0·큰번들경고 유지 [산출물].
- 실제 공개Wikipedia + 실제Deno/wiki-snapshot/Auth/RPC/DB/React4검사: 무작위코스·8.6초·고정본문·실제링크1이동 후기권/Guest영구기록0. **이 실제판은 완주증거가 아니다.** 나머지 통제검사는 Wikipedia HTTP만fixture다. 연결경로·난도·완주가능성/전체외부가용성·실기기/Safari/OS suspend는 보장하지 않는다. Guest제한은 기존token단위·prefetch devtools조기열람 절충 유지 [코드/산출물].
- 기존561파일 중 승인6파일 외 변경/삭제0·기존migration/다른Edge동일·원래사용자 로컬DB 데이터/함수/권한 지문동일. 초기/최종검증stack 모두backup유지stop·사용자stack유지. 운영접근/적용/배포·commit/push/reset/clean/stash0 [산출물].

대표ZIP **하나**: .temp/single-random-20261016/single-random-local-review-20261016.zip (**15,038,955bytes**, 내부66entry/manifest65해시일치·영상9개1×실제재생/끝탐색·비밀정보검사). 실제Wikipedia 영상과 fixture완주영상은 README/검수HTML에서 구분한다. SHA256 6da4cea77c9f5b46d92d228095d813d7d7d669fb4d1759709e1bd0c2963b1389. 다음은 사용자영상검수·실기기확인이다. 아래 random보류·2.6초문장은 이전시점 이력이며, 기존구계약run복구에만 남는다.

## 2026-10-15 Single START 시각 피드백 — 로컬 검수

**후속최소보정(같은4830b38+미커밋/2026-10-15):** SingleStartCinematic/전용CSS만 제품수정. keep-all·균형줄바꿈과 실제공간측정으로 제목크기자동조정, 한글잉크높이1.35줄높이, 예외말줄임은 제목누르기/키보드전체보기·기존hover유지. CTA를 문서중심·아래여백44px에3·2·1과 같은좌표로배치. 실제React컴포넌트 고정프레임의1440/768/390 가독성집중27측정·관련단위8/8·build/diff통과. 전체게임/DB검증은 사용자요청대로반복하지 않았다. 시간함수/GamePage/서버/XP/랭킹 변경0. 대표캡처 `.temp/single-start-readability-20261015/captures/representative-{1440,768,390}.png`; 상세근거는 [인계후속절](2.0x/SINGLE-START-UI-HANDOFF.md)·같은디렉터리검증JSON/로그. 아래는 직전전체검수 이력이다.

기준 **4830b38 + 기존 미커밋 보존 + 이번 UI 미커밋, 2026-10-15(한국)**. [파일/근거/실패·재개](2.0x/SINGLE-START-UI-HANDOFF.md). 아래 이전 통합의 DB·Edge·시간/XP·업적·순위 정책은 바꾸지 않았다.

- 문서페이지의 상하단 문장·나침반/선 제거. 파란 출발명→금색 목표명→박스 없는 큰 가로텍스트3·2·1·시작!로 통일. skip은 기본숨김, Tab/focus-visible 또는Escape로 접근. shared CountdownOverlay/Duel/Group/END 변경0 [코드/산출물].
- random도 같은 SingleStartCinematic을 사용한다. **기존random API생성 위치/started_at/2600ms는 유지**, 시각frame만 축약. custom/daily 예약8600ms도 유지. **신규random 서버선정은 미구현·보류** [코드/산출물].
- 이전random 영상끝에 에러안내가 실제 있었다. 하니스의 정상완주후F5 캡처와 legacy복구의 SELECTING/isLoading=true·hasPresetMode=false 오류표시가 원인. 수정전 실제F5에서재현 후 초기/복구로딩은 준비안내로 보완하고 실제실패는 유지. 새대표영상은 확정결과에서종료, F5는 별도검증 [코드/산출물].
- **npm603/603·build/diff exit0**, 실제로컬 **1440/768/390 × custom/daily/random9경로36검사**, 키보드skip/RM/F5/Guestrandom **추가15검사** 통과. 모두 위기준·날짜. 전구간MutationObserver+16ms관측 fallback0, 실제기록/XP와 기존시각보존 확인. Auth/Deno/RPC/DB/React실제, Wikipedia전송만고정fixture. DB/Edge 변경0이므로 새migration/전체pgTAP 재실행 없음 [산출물].

새대표 검수 `.temp/single-start-ui-20261015/review/index.html`에 이번실제플레이9영상·대표PNG54개·개별영상끝frame9개/모아보기 재생성. 실제1×재생·유한duration/크기·끝탐색 통과, 끝frame모두 정상결과 확인. **이전555파일 중 승인7개 외 변경/삭제0, DB/Edge/보상/순위소스동일**. 이번대표ZIP하나 `.temp/single-start-ui-20261015/single-start-ui-review-20261015.zip`, 내부manifest검증은 같은디렉터리 `zip-verification.json`. 로컬검수 http://127.0.0.1:5276 (HTML200/영상Range206,2시간자동종료). 과거영상/ZIP은 이력으로 보존. 검증Supabase만backup유지stop, 기존사용자stack유지. 운영/commit/push0.

## 2026-10-15 Single START custom/daily — 로컬 통합, 신규 random 보류

기준 **4830b38 + 기존 미커밋 보존 + 이 목표 미커밋, 2026-10-15(한국)**. [승인 범위·구현·실패·검증·재개](2.0x/SINGLE-START-GOAL-HANDOFF.md). **전체 Single START 완료가 아니다.** `target-level` 원본을 확인하지 못해 사용자가 신규 random 할당을 보류했다. 기존 random의 선정/2.6초 시작/create API·과거 기록 복구를 유지한다.

- 로그인/Guest custom·daily만 서버 코스 확정 → 고정 revision 본문 사전 로딩/DOM 준비 → 서버 예약 → 승인된 Round7 탐험 일지8.6초 → 서버 시각 탐색으로 연결했다. 할당 lease30초·준비TTL60초는 예약 전만 적용하고 pending을 재사용한다. 최근5분 미완주 할당 최대3건. 준비/예약 상태에서 이동·완주는 DB에서 거부한다. 예약은 서버now+500ms부터 연출, +9100ms에 시작하며 F5/중복/스킵/RM/숨김/늦은활성화로 바꾸지 않는다 [코드/산출물].
- 본문은 준비 중 숨김/inert 처리하지만 **개발자 도구 조기 열람은 가능**하다(사용자가 승인한 prefetch 절충). 최초 로딩 실패/지연은 예약 전 처리한다. 예약 후 F5/숨김은 경과 시간을 유지한다. 서버now를 응답 수신 시 performance.now에 고정해 벽시계 변경을 무시하고, 마지막 시작 ACK를 기다리지 않고 예약권한으로 화면을 연다. 느린 document fetch 뒤 최신DB시각 재조회와 늦은ACK 버전퇴행 방지를 포함한다. 네트워크 전달·프레임 잔여 지연의 완전한0ms 동기화/OS suspend는 보장하지 않는다 [코드/산출물].
- forward-only migration2개 `20261015061829_single_reserved_start_v1`·`20261015062624_single_timing_rankings_v1`. 기존 record 시간값/XP/업적 판정은 변환·삭제하지 않았다. NULL은 이전 기록, `single_reserved_prefetch_v1`은 새 기준으로 시간목록/결과count·순위/daily 개인최고·내순위/프로필 최고를 나눈다. 구daily RPC도 이전기준만 반환하고 XP·업적 중복은 두계약을 통틀어 유지한다. HOME의 역사 통계/이력과 다른 모드/END 연출은 이 목표에서 수정하지 않았다 [코드/산출물].
- 최종 빈 로컬 프로젝트에서 **migration41개 순차적용/원본SHA일치/pending0/고정PG17.6.1.158**, **전체pgTAP27파일1464/1464(신규45)**·**npm602/602**·build/diff exit0. 실제 React 기본8경로49검사·오류5경로38검사·순위/프로필9검사·추가F5/지연ACK16검사, 실제동시성5시나리오(각12요청) 통과. 최종트리/freshDB 기본8경로49검사도 재통과/예상밖오류0(`browser-1792048447992`). 모두 위 기준·날짜 [산출물].
- 실제 Deno/Auth/PostgREST/DB/React에 Wikipedia/snapshot 본문만 통제fixture다. 1440/768/390·skip/RM/F5·초기2초지연·예약응답유실·Date.now+1시간·synthetic숨김·F5본문11초지연·중복완주/XP를 검증했다. 실제 외부Wikipedia 전체 가용성·실기기/Safari 검증은 아니다. 추가 경합 첫 실행의 백그라운드 기록조회401 한건은 원인 미확정으로 실패자료를 보존했고 같은조건 재실행은 예상밖page/console/API오류0이었다 [산출물].

기존539파일 중 승인13파일 외 변경/삭제0·기존migration/다른Edge동일, 원래 사용자 로컬DB의 데이터·함수·권한 read-only 지문 동일. 운영조회/적용/배포·commit/push0. 대표검수 `.temp/single-start-20261015/review/index.html`, 정상1×실제영상9개 메타데이터/재생 통과. 대표ZIP **하나** `.temp/single-start-20261015/single-start-local-review-20261015.zip`(12,824,764bytes, 내부66entry/manifest65해시 일치). 검증 전용stack은 backup 유지 stop, 기존사용자stack 유지. 신규 random의 근거 없는 대체선정은 추가하지 않았다.

## 2026-10-15 Duel END 실제 React 통합 — 로컬 완료

기준 **4830b38 + 기존 미커밋을 보존한 최종 트리, 2026-10-15(한국)**. [변경 파일·시제품 대응·실패/검증·재개](2.0x/DUEL-END-GOAL-HANDOFF.md). 목표 파일의 승인 범위에서 Duel END만 통합했다. 아래의 이전 END 미통합 문장은 당시 이력이다.

**같은 날짜 12:51~13:31 이후 목표 모드 재확인:** 시작 시 위 통합·증빙이 이미 존재해 앱 코드는 그대로 보존했다. 현재 트리에서 npm593/593·build/diff exit0·실제 END29·경계9·Single/Duel/Group16검사 재통과(모두 위 기준·날짜, 최종 page/console/API 오류0). 최초 초기 navigation15초 timeout은 실패로 따로 보존했고 임시 검증본의 초기 대기만90초로 늘려 재실행했다. 새 실제 게임 PNG/1×영상6개는 `.temp/duel-end-20261015/recheck-20261015-1251/review/index.html`(현재 로컬5267, 기존5266 응답 없음에 대한 후속 복구·HTML200/영상206 확인); 영상 재생 검증도 통과했다. 격리 스택은 backup=true로 stop, 기존 사용자 스택 유지. 이번 변경은 인계·CURRENT 기록뿐이며 운영 접근/적용·commit/push0. 상세 실패·검증·보존은 위 인계 마지막 절을 따른다 [코드/산출물].

- 실제 시제품 `docs/design/duel-end-2026-10-13/scene.js`/`scene.css`의 종이 참가자 카드·승자 전진/패자 후퇴·승리 도장 낙하/반동/16조각·패배 조용한 도장·기권 중립 구도를 React/CSS로 이식했다. 정상 승패 약2.7초, 기권 약2초 뒤 기존 결과지. 새 이미지/라이브러리/결과지 없음 [코드].
- 종료는 서버 finished 사유·실제 참가자 승자만 읽는다. 참가자 has_finished만 먼저 오면 방 판정을 읽고, cancelled/불명 이유는 연출 없이 기존 표시. 본인/상대 기권·disconnected_timeout 구분. preview/index/search/효과 정리·START 중첩 방지·중복/늦은 응답/방 변경 보호 [코드/산출물].
- 기존 bounded 표시 claim을 방+사용자별로 재사용하며 F5·종료방 재입장·다른 페이지 복귀는 정적 결과. RM/숨김/저장 실패도 정적 결과; online/선호 변경/Escape/터치 skip은 기존 결과로 전환. 결과/XP는 커버 아래 즉시 mount하고, 업적 NEW/순차 표시와 XP 표시 효과만 결과지 공개까지 기다린다. 기본 visibility는 true여서 Single/Group 기본 동작 보존 [코드/산출물].
- **npm593/593 · build/diff exit0 · 실제 로컬 END29검사 · 경계9검사 · 기존 Single/Duel/Group 실제16검사 통과**. 모두 위 기준/날짜. END 실제 DOM 지속은 정상2705.6~2708.7ms·기권2005.1~2020.2ms. 1440/768/390·RM·F5·중복·패널 정리·지연 응답·기권 UI·서버 finalizer·원장 불변, 최종 실제 검사 page/console/API 오류0 [산출물]. SQL/Edge 정의 변경0이므로 전체 migration/pgTAP 재적용/재실행 없음.
- 실제 인증/RPC/Realtime에 Wikipedia 본문만 통제 fixture를 사용했다. 연결 만료 경계는 격리 DB의 heartbeat 시각만 fixture로 앞당긴 뒤 실제 finalizer 판정을 받았다. 숨김은 synthetic visibility 검사이며 OS suspend/실기기/Safari 보장이 아니다. 대표 실제 React PNG/게임 전체1× 영상6개: `.temp/duel-end-20261015/review/index.html`; 영상 metadata/탐색/1×재생 확인. 상세 summary/실패/보존 근거는 같은 증거 디렉터리와 인계에 유지한다 [산출물].

**운영 조회/적용·배포·commit/push0, 기존 미커밋 보존.** 기존532파일 중 허용6개 외 변경/삭제0·기존 migration/Edge SHA 동일, 원래 로컬 DB의 행/함수·권한 지문도 앞 세션 완료 상태와 동일. 검증용 격리 스택만 backup=true로 stop했다. 이번은 로컬 통합 완료이며 검색 소비 서버 권위·기존 출시 보류·운영 반영 판단은 바뀌지 않는다. 다음은 실제 영상 디자인 검수와 실기기 확인이다.

## 2026-10-15 마지막 로컬 안정화 — 검색 서버 소비 보류

기준 **4830b38 + 기존 미커밋을 보존한 최종 트리, 2026-10-15(한국)**. [목표·수정 파일·실패/검증·재개 인계](2.0x/WIKIRACE-NEXT-GOAL-HANDOFF.md). 사용자 승인 실행 계획에 따라 검색 본문 공급 변경/서버 소비 구현은 보류하고 나머지 로컬 목표를 완료했다.

- 독립 project `wiki-next-goal-r20261015-632152ac`/API55421·DB55422에서 기존 **migration39개** 공식 CLI 순차 적용·이력/원본 SHA 일치·pending0·고정PG17.6.1.158 확인. 새migration0·기존 스택 read-only. Advisor 기존WARN5 유지 [산출물].
- 태블릿 HUD 고정 컨트롤 축소 방지·문서/상태 칸 배분과 RACE PRE 내부 스크롤 최소 CSS 보정. 실제 React API fixture148/148: 1440/768/390·760/761, Single/Duel/Group·초장문·긴 PRE/표·피격·HUD/Dock/색인/링크. 768px 문서폭 **803→768px**. HOME·시네마틱·게임 로직/규칙 변경0 [코드/산출물].
- 최종 **npm588/588·pgTAP26파일1419/1419·build/diff exit0**. 실제 격리 P0 11/11·검열14/14·미리보기17/17·실제Wikipedia+Deno2/2·START8/8·검색UI8/8·방어12/12·모드16/16·출시Duel/Group22/22·로그인Single17/17·Guest8/8. Duel동시성3시나리오×5회/deadlock0·Group하니스 전체 통과. 실제 최종 검사의 예상 밖 page/console/API 오류0 [산출물, 위 기준/날짜].
- 첫 npm586/587은 과거 `.temp` 증거 사본을 현재 앱으로 감사한 오탐. 증거만 제외하고 실제 금지 경로 검출 회귀를 추가해588/588. PRE/라벨·fixture 이식 실패 및 초기 P0 UI/검열 버전 충돌 기록은 보존한다. 최초 일시적 실패 단일 원인은 미확정 [산출물].

**검색 성공 소비는 여전히 클라이언트 권위이며 조작 우회 미해결**이다. 15초·성공1회·빈 입력/미발견 미소비·이동/F5 자동 재개 금지를 보존했으며 정상 UI 검증은 서버 강제 증거가 아니다. 본문/정제/개별 텍스트 노드/revision 일치를 위해 서버 본문 고정이 필요하다는 조사 후 사용자가 영향 범위를 이유로 보류했다. 기존 파일527개·기존 로컬 DB 지문 보존은 인계의 최종 산출물을 따른다. 운영 해결·출시 승인·실기기/Safari/OS suspend 보장 없음. 아래는 이전 단계 이력이다.

## 2026-10-14 Duel 안정화 통합 패키지 — 로컬 완료

기준 **4830b38 + 기존 미커밋을 보존한 최종 트리, 2026-10-14**. 사용자 통합 계획 승인으로 준비→P0→미리보기 서버 권위→전체 안정화를 연속 실행했다. [최종 결과/파일/실패·한계](2.0x/DUEL-STABILITY-RESULT-2026-10-14.md), [작업 인계/승인 정책/재개](2.0x/DUEL-WORK-HANDOFF.md).

- 새 forward-only migration **20261014103131_duel_preview_authority_v1**만 **로컬** 적용(이력38→39). private 세션/목적지/요청 원장과 예약/신뢰 확정 RPC·로컬 Edge를 연결했다. 기존 감사 대상25함수 중 use/state2개만 정의 변경, P0 public 이동·private 아이템 이동 동일. 기존38 migration 파일 보존 [코드/산출물].
- 활성화별 서로 다른 canonical page ID 성공최대3·동일 목적지 무료·실패 미소비. 예약최대6초/외부최대5초, 원래15초 만료 이내. 토큰교체/중복/응답유실/F5 서버 기록 보존. source identity+활성화 이후 실제 affected_user_id 이동 원장으로 종료해 heartbeat 버전 증가와 구분하며 같은 문서 복귀도 재개0 [코드/산출물].
- 프론트 직접 Wikipedia fallback0. 이동/종료/닫기/F5/재연결 뒤 패널 자동 재개0·늦은 응답 폐기. 검열 만료 권한 재조회. 기존650ms/2500ms/최근사건/5슬롯/쿨다운/밸런스·Single/Group·검색 정책 보존 [코드].
- **전체 pgTAP26파일1419/1419·npm586/586·최종 build/diff exit0**. 실제 미리보기 Auth/RPC/React15/15(외부응답fixture), 실제 Deno+Wikipedia2/2, 종료/검열만료3/3, P0인증/React11/11, START/검색8/8, 보호·반사12/12, Single/Duel/Group16/16·각 최종 예상 밖 page/console/API오류0(종료 후 heartbeat400은 코드/finished를 확인한 예상 거부로 별도). START/P0 React fixture13/13는 별도. 아이템 동시성3시나리오×5회/deadlock0·Advisor기존WARN5/신규0 [산출물, 위 기준/날짜].
- 증거는 .temp/duel-stability-20261014/ 로그·JSON·대표ZIP. 기존파일517개 허용6개 외 변경/삭제0·HEAD동일. 최초P0 순간UI대기 실패의 단일원인은 미확정이며 실패/재검증을 구분해 보존한다. 나머지 fixture/인증/소스기대 오류는 보정·재검증했다 [산출물].

**검색 소비 서버 권위는 미해결 후속**, 기존 성공1회/빈 검색·미발견 미소비 UI 유지. 과거 미리보기 활성화의 출발/성공 기록 backfill은 추측하지 않으며 세션 없는 활성화로 새 권한을 만들지 않는다. Duel END/HOME/Single START/사운드 통합0. **운영 접근/적용·commit/push/배포/reset/clean/stash0**. 이번은 로컬 완료이며 운영 해결/출시 차단 해제는 별도 승인·검수다. 아래 섹션들은 이전 단계 당시 기록이다.

## 2026-10-14 Duel P0 공개 아이템 이동 권한 — 로컬 보정 완료·증거 검수 대기

기준 **4830b38 + 기존 미커밋을 보존한 이번 트리, 2026-10-14**. [함수/권한 감사/우회 전후/정상 아이템/검증/한계](2.0x/DUEL-PUBLIC-MOVE-P0-2026-10-14.md). 사용자 건별 승인으로 `20261014073626_duel_public_move_authority_v1.sql` 작성·**로컬** 적용, 이력37→38. 변경 함수는 public.apply_duel_move_v2 하나다. auth→room lock→현재 참가자 lock→동일 room/actor/request cache→새 NORMAL_LINK만 승인 순서다. 특수/NULL/unknown 타입은 ITEM_RPC_REQUIRED와 snapshot만 반환하며 원장/게임/보상 쓰기0. 삭제된 원 참가자의 cache 우회도 차단했다. 기존 NORMAL_LINK 목적지 ID/clock 검열과 private 아이템/use/SWAP/권한 정의는 동일 [코드/실측].

**신규 SQL51/51·전체25파일1379/1379·npm575/575·build/diff exit0**. 실제 Auth/RPC/React 공개 권한·정상 아이템11/11, 실제 NORMAL_LINK 검열14/14, 실제 Single/Duel/Group16/16·각 최종 page/console/API 오류0. fixture는 START/거부13/13·Duel78/78·RACE120/120으로 별도 기록한다. 공개8타입×6원장ID=48개와 거부 동시재시도5개 모두 거부·전체상태 before=after. 정상 random_link_move/go_back/history_rewind의 실제 문서/이동/원장 및390 Dock/F5/visibility·online 복구 확인 [산출물, 위 기준·날짜].

권한 감사: public SWAP은 기존 SWAP_DISABLED/no-op, private 이동·random destination 등록은 authenticated/anon 실행 불가, Group/Single은 별도 mode/run에 묶임. 추가 Duel 공개 이동 우회 확인0, 범위 밖 수정0. Advisor 기존WARN5 동일·추가0. 역사 되감기의 상대 REWIND 행은 기존 item FK null·shared correlation/metadata 계약으로 보존했다. 최초 로컬 get_xp_summary502와 F5 전 순간 Realtime DOM 대기 timeout·검사 코드 오류 로그도 보존한다. 반복 회귀는 통과했지만 순간 전달/502의 단일 원인을 추측하지 않는다.

**검사한 공개 타입 우회는 로컬에서 차단 확인, P0 전체 출시 차단 해제는 사용자 증거 검수·별도 운영 반영 판단을 기다린다.** 운영 조회/적용·commit/push/배포/reset/clean/stash0. 프론트/디자인650ms·2500ms·최근 사건/검색 만료/START 및 검색 소비·미리보기 서버 계약 변경0. 검수 ZIP·JSON·SQL diff·대표390 PNG는 `.temp/duel-public-move-p0-20261014/`에 별도 생성했다. 아래 승인 대기/미해결 문장은 보정 전 당시 이력이다.

## 2026-10-14 Duel P0 NORMAL_LINK 보정 — 로컬 검증 (공개 타입 보정 전 이력)

기준 **4830b38 + 기존 미커밋을 보존한 이번 트리, 2026-10-14**. [보정/계약/실제 증명/파일/한계](2.0x/DUEL-CENSORSHIP-P0-2026-10-14.md), [공개 타입 후속 승인 계획](2.0x/DUEL-CENSORSHIP-PUBLIC-TYPES-PLAN-2026-10-14.md). 사용자 승인으로 새 migration `20261014052928`만 **로컬**에 적용했다. 기존 snapshot 선택 집합에 censoredPageIds를 추가하고, NORMAL_LINK는 서버 snapshot 목적지 ID·실제 원장 대상/result·lock 후 서버 현재 시각으로 거부한다. LINK_CENSORED는 쓰기/거부 캐시 없이 room/player snapshot을 반환하며 UI는 RACE/본문/저장 상태를 유지한다. 제목 alias·동일 ID·옛 제목 원장, 차단/반사/6초 만료·락 대기·멱등성/F5를 검증했다 [코드/산출물].

**로컬 신규 pgTAP32/32·전체24파일1328/1328·실제 인증 RPC/Realtime/React14/14·npm575/575·build/diff exit0**. API/Realtime React fixture는 START baseline5/5(숨김 읽기2→2/예산0→6 재현), after13/13(첫 진입/F5 숨김 예산0→0), 기존 Duel78/78·RACE120/120으로 별도 기록한다. 실제 직접 NORMAL_LINK6개 LINK_CENSORED 응답의 전체 상태 JSON before=after. 세부 로그/JSON/대표390 PNG는 `.temp/duel-censorship-p0-20261014/` [산출물, 위 기준·날짜]. START는 숨김에서 예산 차감 전 멈추는 guard만 추가했다. 디자인650ms/2500ms/최근 사건·검색 만료·기존 START/Single/Group 보존. 기존 migration 및 private 이동/get state 원문 동일; 변경 함수2개·권한 보존.

**P0 전체 출시 차단은 유지한다.** 추가 감사의 실제 인증 RPC는 public FORCED_LINK·item_event_id=null로 봉인 문서에 만료 전 APPLIED/이동0→1을 재현했다. 이번 NORMAL_LINK 패치로는 막히지 않는다. public 아이템 이동 타입 권한은 위 후속 계획에 별도 제안했고 추가 SQL 작성/적용0. UNDO 코드 감사와 실제 재현을 구분한다. 검색 소비 서버/미리보기3회 권위 미해결, 이번 변경0. 운영 조회/적용·commit/push/reset/clean/stash/배포0. 이전 섹션의 승인 전/미해결 서술은 아래 당시 이력이다.

기존 파일506개의 SHA256 대조에서 허용한 page/service/CURRENT 외 변경·삭제0, 기존 migration36개는 동일하다. 검수 묶음은 `.temp/duel-censorship-p0-20261014/duel-censorship-p0-local-review.zip`에 원문 SQL/세션 baseline diff/계약 diff/실제·fixture 증거를 구분했다. 기존 영상/로그/ZIP은 보존했다 [산출물, 위 기준·날짜].

## 2026-10-14 Duel 마지막 동작 보완 + 프론트 안정화 (이번 P0 보정 전 이력)

기준 **4830b38 + 보존한 미커밋 최종 트리, 2026-10-14**. [최종 보완·수정 파일·검증·한계](2.0x/DUEL-FINAL-MOTION-STABILITY-2026-10-14.md), [P0 우선 계약/승인 경계](2.0x/DUEL-STABILIZATION-PLAN-2026-10-14.md). 사용자가 승인한 먹물/링크 검열·2500ms/최근 사건은 유지한다. 보호 접촉/튕김·역링크 방향 반전·역방향 종이 넘김만 최소 보완했다. 이전 중요 사건이 최신 확정 사용을 가리던 선택 규칙을 보정하고, 최근 3건/650ms/gate/입력/RM/F5/실제 이동 시각은 보존한다. **디자인 수정은 종료하고 안정화를 우선한다.**

검색은 기존 서버 만료와 문서 이탈/소비를 UI에 연결하고 실행 경계도 검사한다. Single/Group의 deadline 기본값/규칙은 유지한다. START는 전이 알림 누락 또는 참가자 초기화 읽기 경합에 대해 recovery generation당 최대6회 room/기존 마스킹 참가자 읽기만 수행한다. 오래된 version/늦은 응답/종료/unmount를 보호하고 기존 VS/카운트다운/지급 경로를 사용한다 [코드].

**npm573/573·build/diff exit0·390 전후 before11/after21·안정화 React fixture16/16·기존 Duel fixture78/78·RACE fixture120/120**. 실제 로컬 **8/8**: 실제15초 만료 후 검색 패널/하이라이트 없음, START6조건 모두 F5 없이 진행·각 참가자 VS1/카운트다운1/5슬롯; page/console/API 오류0. fixture/실제 결과 합산 없음. `.temp/duel-items-final-20261014/review/index.html`: 390px 전후4쌍/RM/F5/안정화 예시 영상16개 metadata·대표4개 1× 재생·목록 넘침0. 시작 전 기존504개 중 허용7개 외 변경/삭제0, Supabase/Edge 원본 해시 동일 [산출물, 위 기준·날짜].

**검열 직접 RPC 우회 P0 출시 차단·미리보기 서버3회 권위는 미해결**. 검색 UI 만료 보완은 서버 소비 권위가 아니며 운영/실기기/OS suspend/장애의 전체 보장이 아니다. 10-14 첫 검열 재검사의 6초 링크 visible 대기 타임아웃은 통과로 세지 않고, 10-13 확정 재현/동일 서버 분기 근거를 보존했다. 이번 되감기 전용 실제 서버 이동 재검증은 미실행. 다음 A는 forward-only 보정 작성·로컬 적용/검증의 **새 승인 대상**이다. 사용자 승인 전 migration/RPC/RLS/Edge 구현·정의 변경0. commit/push/reset/clean/stash/운영접근·배포0.

## 2026-10-13 Duel 아이템 차별화·알림 가독성 통합 — 사용자 디자인 검수 대기

기준 **4830b38 + 보존한 미커밋 트리, 2026-10-13**. [아이템별 전후·React/실제 서버 구분·수정 파일·실패/미해결 보고서](2.0x/DUEL-ITEM-READABILITY-2026-10-13.md). 기존 650ms gate/cues는 보존하고 사건 정보만 2500ms로 분리했다. 먹물 번짐·실제 검열 링크 봉인·보호 준비/차단·반사 방향·강제 이동·역방향 종이를 구분하고, 서버가 실제 이동시킨 사람의 기사만 전환한다. 기사 중복 상징을 없애고 기존 고정 알림 칸에 이름/결과/내·상대 정보를 모았다. 탐색 패널과 ID 없는 기존 응답 안내도 알림을 가리지 않게 배치한다 [코드].

최근 3건은 gate를 통과한 실제 이벤트 ID만 임시 React 상태에 기록한다. 새 저장키/DB 없음. 실패/ID 없는 안내는 가짜 최근 사건을 만들지 않으며, 중복/과거/hidden/F5/online/종료·나가기를 처리한다. 타이머/observer/rAF/listener 정리·RM·터치/키보드/focus 확인. 기존 HUD/Dock 슬롯·서버 만료/쿨다운/게임 입력·이동 동기화·START/END·Single/Group·XP/업적/보상/seen 규칙 변경 0.

**npm573/573·build/diff exit0·React 가독성 fixture374/374·기존 Duel fixture78/78·RACE fixture120/120(기본84/84도 통과)**, 실제 로컬 아이템/Single/Duel/Group **36/36**(page/console/API 오류0). RACE journal 확장120/120은 보고서/`race/report.json`을 따른다. fixture/실제 합산 없음. `.temp/duel-items-readable-20261013/index.html` / localhost5208: 실제 React 1440/768/390 전후 **36쌍**, 복구/미이동/RM/실패 **6개**, 실제 로컬 원장/Realtime **10개** = **영상88개**, metadata88개와 대표PC/모바일/실제1×재생4개 확인. ~2초 PNG/최근 패널도 구분. 실제 강제 이동/되감기의 서버 문서=기사 제목/본문=연출 시점 확인. 자기 이동2종 전용 실제 재검증 미실행.

**검열 직접 RPC 우회 P0 출시 차단 유지**. 검색 만료 UI·미리보기3회 서버 권위·초기 START 지연/알림 누락 정체도 미해결이며 기존 승인 전 계약 제안 보존. 로컬 아이템 검사는 초기화 RPC를 선행하므로 START 해결 증거가 아니다. shared Vite cache504·녹화 옵션 누락·캡처 뒤 검사 시점 밀림·JWT future401·구형 안내 겹침/과거geometry 실패를 보고서에 보존했다. 시작 전 **499개 파일** 해시 대조, 허용 파일 외 변경/삭제0; 기존 미커밋 Supabase/Edge 파일 원본 보존. 이번 의존성/DB/RPC/RLS/Edge 정의 변경·commit/push/reset/clean/stash/운영접근·배포0. **사용자 디자인 검수를 기다린다.**

## 2026-10-13 Duel 아이템 사용자 검수 후속 — 기능 방향 승인, 보완 검수 대기

기준 **4830b38 + 보존한 미커밋 트리, 2026-10-13**. [후속 화면·규칙 우회/START 재현·승인 전 계약 제안·검증](2.0x/DUEL-ITEM-FOLLOWUP-2026-10-13.md). 모바일 큰 기사 상징/도장 중복을 제거하고 본문 앞 고정 높이 알림 칸으로 도장을 이동했다. 서버의 실제 새 본문 반영 뒤 방향 효과를 표시하며, 650ms·기존 색상/gate/F5/복구는 보존한다. 실제 잘못된 링크/역사 되감기 서버 문서=기사 제목/본문=연출 시점 확인. 자기 이동 2종 전용 실제 재검증은 미실행 [코드·산출물].

**npm571/571·build/diff exit0·React 후속 fixture16/16·기존 Duel fixture78/78·RACE fixture120/120**, 실제 로컬 아이템/Single/Duel/Group **31/31**(오류0). `.temp/duel-items-followup-20261013/index.html` / localhost5203: 승인 구현↔후속 실제 React 1440/390 사용·피격·방어 자연 속도 영상, 실제 로컬 원장/Realtime 영상 및 지연 fixture 구분. 영상30개 존재/PC·모바일1× 재생 확인. 시작 시 기존494개 파일 해시 대조로 허용7개 외 기존 변경/삭제0 (`preservation.json`) [산출물, 위 기준·날짜].

**미해결 규칙:** 실제 로컬에서 검열 만료 전 인증 NORMAL_LINK 직접 RPC가 봉인 문서로 이동; 검색 서버15초 만료 후 정상 UI 찾기 성공; 미리보기 정상 UI3회/F5제한은 유지되지만 시험 React 상태 변조로4회 표시·서버소비계약 없음. 서버 수정 A/B/C는 원인/안/테스트 계획만 제출, 사용자 승인 전 미구현. **미해결 START:** 선초기화 없는 정상 입장4 + 대기실 시작4 + guest 변경 알림 누락2는 정상. 첫 문서1.8초 지연+먼저 입장한 브라우저 변경 알림 누락은 guest/host 각각 정체 재현(서버playing·행초기화 완료, F5회복). 옛 실패 당시 원인과 같다는 증거는 없으며 START코드 변경0, 제한 재조회 후속안만 제안했다. 실제 운영/실기기·전체SQL·보상 회귀 미검증. 게임 규칙/장착/서버 정의·XP/업적/보상 코드·Single/Group·기존 승인 장면 보존, commit/push/reset/clean/stash/배포0. 사용자 검수 대기.

## 2026-10-13 Duel 아이템 사용·피격·방어 — 최초 실제 RACE 연결 기록

기준 **4830b38 + 보존한 미커밋 트리, 2026-10-13**. [실제 12종 계약표·변경/미완·검증·영상·실패 기록](2.0x/DUEL-ITEM-FEEDBACK-2026-10-13.md). 실제 성공 RPC/상대 `duel_item_event`의 applied/blocked/reflected/void를 읽어 650ms Dock·기사 상징을 연결했다. Coral 먹물/봉인/이동, Teal 보호/반사, Blue 탐색/기본 사용. 보호 준비≠차단 성공, 반사 target=공격자 구분, 정화 정보 없음→정화 성공 연출0. 최대3개·ID중복/오래된/숨김/복구 사건 재생0·RM 정적·종료/언마운트 정리. 먹물 지속 표시는 서버 activeEffects로 F5/중첩/해제를 맞추며 가림은 기사 안으로 제한했다. 장착·소비/쿨다운/지속 수치·기존 검열 링크 입력 경로·START/RESULT·Single/Group·Duel END 독립 시제품 보존 [코드].

**npm571/571·build/diff exit0·Duel React fixture78/78·기존 RACE120/120·기본 RESULT85/85**, 실제 로컬 **29/29**(실제 RPC/Realtime/원장·먹물/F5/검열·보호/반사/강제 이동 + 기존 Single/Duel/Group, 오류0) [산출물, 위 기준·날짜]. fixture/실제 수치 합산0. `.temp/duel-items-20261013/index.html`: 보존 React 전후 3너비 자연 속도 영상·4상태 PNG·RM/복구/실패·실제 공격자PC/피격방어자모바일 영상 구분. 첫 실제 시작 전이 host 복구 정체는 미확정으로 남겼고, 후속은 실제 초기화 RPC를 선행한 아이템 검증이다. 시험 장착 UNIQUE 충돌은 runner의 ID 교체 순서만 보완하고 제약/데이터 삭제0, 최종 자기 테스트 계정/방/문서 정리 완료.

검색 UI 만료/문서 이탈·미리보기3회 서버 권위/F5·검열의 서버 이동 제한·정화 계약은 기존 잔여 문제로 별도 기록했다. 운영·실기기/Safari·OS suspend·전체SQL·일부 이동/탐색 아이템 전용 실제 서버 재검증 미실행. 시작 전483개 파일의 해시 대조로 허용한 기존파일4개 외 변경/삭제0 확인(`.temp/duel-items-20261013/preservation.json`). 검수 목록 영상39개 존재·PC/모바일 재생 확인. 의존성/DB/RPC/RLS/Edge 정의 변경·commit/push/reset/clean/stash/배포0. 사용자 디자인 검수를 기다린다.

## 2026-10-13 Single END / Single START 정책 / Duel END 독립 시제품 — 사용자 검수 대기

기준 **4830b38 + 보존한 미커밋 트리, 2026-10-13**. [전체 수정·실제/독립 구분·검증·실패 보고서](2.0x/SINGLE-DUEL-FOLLOWUP-2026-10-13.md). **실제 앱은 Single END만 수정**했다. 별도 코스/시간/이동 기록지를 제거하고 기존 ResultCard 제목 영역의 완주!·도장·반동만 1.8초 표시한다. 기존 통계/코스/상세 경로/XP/업적은 한 결과지와 같은 DOM/순서/공간에 유지된다. 조회 지연/오류/무효는 축하 없음, 기존 claim/seen/원장/서버 완료 계약 보존. 아래 이전 2.3초 Single END 기록은 이 변경 전 이력이다.

**npm565/565·최종 build/diff exit0·장면57/57·기존 RESULT104/104**, 실제 로그인 Single PC/모바일 각17/17(15/20/25·재완주0·F5 재지급0), 실제 Guest 별도8/8(PC/모바일 일반/RM·Edge completed·영구 game_records0·XP 동일 DOM/위치), 실제 Group10/10(개인F5→전체발표), Duel START4/4 [로컬 산출물, 위 기준·날짜]. Guest 완료 F5는 기존 GamePage가 저장 상태를 삭제해 **로비로 복귀**한다. 결과지 복구를 새로 구현하지 않았다. 삭제한 기록 카드를 찾던 assertion과 Guest F5 오인 실패는 보존하고 검증을 실제 정책에 맞췄다.

[Single START A/B/C 결정](2.0x/SINGLE-START-INTEGRATION-DECISION-2026-10-13.md): **C, 기존2.6초 유지 추천**. 로그인 elapsed는 run 생성 시각 기준이라 생성 뒤8.6초 적용 금지. 전체 Round7의 장기 후보는 B(prepared/active 분리)이고 사전 공개/랭킹·자정·중복/응답 유실 정책 승인이 필요하다. Round7 원본 재사용 범위/원본 독립20/20, 실제 START/started_at/elapsed/DB·RPC·Edge 변경0.

[Duel END 시제품·실제 연결 인계](2.0x/DUEL-END-PROTOTYPE-HANDOFF-2026-10-13.md): 독립 HTML `docs/design/duel-end-2026-10-13/index.html`, 정상 승패2.7초·중립기권2초. 상대 기권/재접속 유예 종료/무효는 실제 서버 사유만. **독립65/65·PC/모바일 일반/RM 영상12개·프레임48개**, 실제 앱 연결0/보상·코스·기록 생성0. 사용자 디자인 승인 전 연결 보류.

검수 `.temp/cinematic-next-20261013/index.html`: Single 실제 React 전후 영상8개(API fixture), Duel 독립12개, 편집하지 않은 실제 localhost 원본6개를 구분. 선택적 Single 짧은 클립은 인코딩 색 마커와 DOM 종료의 불일치로 제외했으며 임의 offset 보정 없음. 기존768px 초장문 RACE 넘침·claim 동시성 한계·실기기/Safari/OS suspend/운영/전체SQL 미검증 유지. 초기473개 해시 대조, 허용8개 외 기존 변경/삭제0. Duel/Group START·Group END·HOME·Single START·기존 미커밋 DB/Edge 원본 보존. commit/push/reset/clean/stash/운영접근·배포0.

## 2026-10-13 Cinematic 디자인 회귀 복원 — 사용자 시각 검수 대기

기준 **4830b38 + 기존 변경 보존 미커밋 트리**, **2026-10-13**. [복원·비교·검증·실패·영상 보고서](2.0x/CINEMATIC-DESIGN-REGRESSION-2026-10-13.md). 작은 중앙 팝업으로 축소된 Duel/Group START를 Round4 전체 화면 카드·VS 충돌·지도 릴 크기/수치 곡선으로 복원했다. Group END는 최신 사용자 검수본의 3→2→1 시상대·마지막 1위 강조·기록지 접힘을 복원하고 말줄임표/큰 금색 사각 프레임을 넣지 않았다. Single END는 2.3초 동안 중복된 기존 기록 행을 가린 뒤 같은 최종 기록지를 보여 준다. ResultXp/업적은 같은 DOM을 유지한다. 기존 seen/원장/claim/useSceneSequence/게임 페이지·서버 계약·START 5000/5400+2600ms 변경0 [코드].

**npm565/565·build/diff exit0**, 격리 장면57/57, **RACE120/120·RESULT104/104**, 실제 localhost **Group PC/모바일 각10/10·Single 각17/17·Duel START 새방 각4/4**, F5/skip/서버 XP·업적·보상 원장 불변·테스트 데이터 정리/RLS 보존 [산출물, 위 기준·날짜]. `.temp/cinematic-design-20261013/index.html`: 승인본/수정 전/수정 후 1배속 영상48개와 동일 너비·시점 정지 프레임96개, 실제 localhost 장면 클립8개. 정상 연출 주요 영역 너비(PC/모바일)는 Duel1320/370, Group START1080/362, Group END1110/362, Single END1000/362px로 승인본과 일치한다. 프레임 시점 오차는 16ms 이내다. **이는 기하·동작 검증이며 사용자 디자인 승인 PASS가 아니다.**

기존 `actual-clips/group-end-1440.webm`은 4.5초에서 Group START가 보여 종료 검수 근거로 제외했다 [영상 프레임]. 새 클립은 DOM 전환 및 영상 픽셀 마커로 정렬하며 PC6.962초/모바일6.965초 디코딩 길이 안에 전체6.2초 발표와 기록지 전환이 포함된다 [산출물]. END의 reduced-motion/F5는 기존 최종 기록지로 직행하며, Group 5.25초 이후는 기존 실제 결과지로 연결한다. 독립 시제품의 모의 기록 표와 달라지는 이유는 실제 RESULT/XP·seen 계약 보존이다. 실기기/Safari·OS suspend·운영 검증은 미실행. HOME 신규 아트·Single START Round7 제외, 의존성/DB/RPC/RLS/Edge 정의 변경·commit/push/배포0. 기존 10-12 자료/실패 로그 보존.

## 2026-10-12 Cinematic 실제 게임 통합 1차 — 기능 검증 이력, 시각적 동등성 철회

**2026-10-13 사용자 검수에서 승인 시제품과 큰 차이가 확인됐다. 아래 PASS는 당시 기능 검증 이력으로만 읽는다. 작은 팝업과 잘못 추출된 Group END 영상은 위 복원 기록으로 대체한다.**

기준 **4830b38 + 기존 변경 보존 미커밋 트리**, **2026-10-12**. [통합·파일·이벤트·복구·실패·영상 보고서](2.0x/CINEMATIC-INTEGRATION-2026-10-12.md), [Single START 후속 시계 설계](2.0x/SINGLE-START-SAFE-OPTIONS-2026-10-12.md). START는 Round4, END는 최신 round4-user-review-20261012를 실제 React에 연결했다. Duel 실제 참가자/사용 가능한 장착·공통 코스 VS, Group 실제 roster·기호 슬롯, Group 서버 전체 확정 3→2→1/동순위·기록지, Single completed 서버 scalar·두 끝점·완료 표식. 개인 Group/리타이어 본인/미확정·무효·오류에 성공 발표 없음. 기존 START 5초/5.4초/countdown2.6초·Single 시작 시계·Group 3초poll/요청세대/version·ResultXp/업적/seen/지급/보상 유지 [코드]. 발표 중 기존 결과/XP 접근·native skip·숨김/RM/F5 정적·기존 claim 하나 재사용.

최종 **npm565/565·build/diff exit0**, 장면 fixture 전체56/56(React 영상15개)·후속55/55(video/RM 루프 제외+늦은Group/게스트/무관storage 추가), **RACE120/120·RESULT104/104·대기실 B안92/92 및 확장 준비119/119** 각 통과 [산출물, 위 기준·날짜; fixture와 실서버 합산0]. 실제 localhost **Single PC/모바일 각17/17·Duel START 정상/누락 새방 각1성공(각4/4)·3인Group PC/모바일 개인F5→전체발표 각10/10·Group 늦은오류/응답역전8/8·이벤트누락8/8·Duel/Group 회귀23/23**. 실제 teleport Edge/기권/결과F5·XP/업적/인벤토리 불변·자기 테스트 데이터 정리·RLS보존 확인. `.temp/cinematic-integration-20261012/index.html`/ZIP: 실제12개 장면별WebM/PNG(PC1440/모바일390·개인→전체·F5)와 fixture15개를 구분, 원본영상·실패 로그 보존. 기존 변경107개 초기해시 기록·허용 범위 밖 변경/삭제0, HOME/SingleSTART/기존 DB·Edge 변경 보존 [산출물].

**768px 초장문 RACE35px 넘침은 별도 배포 전 수정 대상**: 현재 문서803px, 새 Cinematic CSS 비활성803px(동일DOM 비교). 기존30px 이력과 fixture 조건이 다름. cross-tab 동시claim 원자성·기존256capacity·실기기/Safari/OS suspend/운영/장기만료/전체SQL 미검증. HOME 신규아트·SingleSTART Round7·Duel 특수효과/승패cinematic·음원·신규보상·의존성 추가0. 이번 DB/RPC/RLS/Edge 정의·규칙/시계/보상 정책 추가 변경0. **commit/push/운영접근/배포0, 사용자 검수 대기**.

## 2026-10-11 HOME·모드별 시작/종료 시퀀스 — 사용자 검수 대기

기준 **4830b38 + 기존 변경 보존 미커밋 트리**, **2026-10-11**. [전수 감사](2.0x/SCENE-SEQUENCE-AUDIT-2026-10-11.md), [구현·서버/F5·검증·실패·영상](2.0x/SCENE-SEQUENCE-IMPLEMENTATION-2026-10-11.md), [후속 아트/사운드](2.0x/SCENE-SEQUENCE-ART-2026-10-11.md). HOME 기존420ms hero 등장 대체·표지/지도/경로/PLAY, 즉시 클릭·재방문 정적. Single 실제 서버 코스 기록지, Duel 공통코스 유지/순서 강조, Group 후보회전 제거/실제 활성 참가자·장착 배치읽기·코스. 시작 대기2.6초/VS5초/Group5.4초와 서버시각·입력·복구 유지. 개인Group 완료와 전체 순위 기록 분리, 실제 순위/내행 강조 후 XP 고정형제. 기존 XP220ms/업적600ms/seen·원장·이동/아이템/장착·Group 세대/version/3초reconcile 그대로 [코드]. 기존 표시 claim 저장키 하나 재사용, 최초 복구/숨김/RM 정적·StrictMode 중복/수명 연장 방지.

최종 **npm563/563·build/diff exit0·장면fixture63/63·HOME 실제라우트/live위키8/8·RACE123/123·RESULT104/104·B안대기실136/136**, 실제 **Single17/17·Duel START 정상 새방1성공/누락 새방1성공(각4/4)·Duel/Group23/23·3인Group 시작/개인F5→새전체효과9/9·이벤트누락8/8·늦은400/역전8/8** [산출물, 위 기준·날짜]. fixture/실제 합산0. 갤러리 .temp/scene-sequences/index.html: 자연속도PC1440/모바일390 장면별18개 + 최초RM5개, 실제원본/장면별클립,5너비 및8인긴코스. 테스트 자기데이터 정리/RLS보존.

단위의 XP분기순서 가정 실패·시작기사 가시성/PLAYING readiness 구분 실패·debug opt-in 누락·HOME fixture 전용CSS 누락은 원본 보존 후 보완/독립 실행. 최초Group클릭 정확시각은 없어 유일원인 단정0. 기존 초장문768px RACE30px 넘침·cross-tab claim원자성·실기기/Safari/OS suspend/운영/20분실시간만료/전체SQL 미검증, 기존256capacity는 장식만 fail-closed. 독립 책 오프닝/전용 도장/음원은 P2/명세보류. 이번 DB/RPC/RLS/Edge 정의/서버규칙/보상/XP/라이브러리/캐릭터/음원 추가변경0. **기존 미커밋 보존·commit/push/운영접근/배포0; 사용자 검수 대기**.

## 2026-10-11 Duel 시작 표현·모바일 목차 후속 — 사용자 검수 대기

기준 **4830b38 + 기존 변경 보존 미커밋 트리**, **2026-10-11**. [원인·파일·검색·검증·실패·영상](2.0x/START-OVERLAY-REVIEW-2026-10-11.md). 두 플레이어 VS와 서버 공통 출발→목표를 중앙 한 번 표시, /about 구형 안내 수정. 공용 카운트다운 종이 시각만 변경; 700/700/700/500ms·VS5초·START/입력/복구 유지. 앱 목차 DOM은760px 이하 RACE 본문 앞 가로 목차·44px native button으로 보완 [코드].

최종 **npm561/561·build/diff exit0·시작 fixture14/14·RACE123/123·RESULT104/104**, 실제 **Duel START 정상 새방1성공·이벤트누락 새방1성공(각 runner4/4)·Single17/17·Duel/Group22/22·Group 늦은400/역전7/7** [산출물, 위 기준·날짜]. `.temp/start-review/index.html`에 전후 이미지·짧은 일반/RM 영상·실제 로컬 서버 원본. RM은 별도 context 최초 렌더부터 설정. 두 계정 공통 코스·4너비 VS·자기 테스트 데이터 정리·RLS보존 확인.

**초장문768px VS는 정상이나 뒤 RACE 문서는798px(30px 넘침)으로 별도 미해결**. 최초 전체폭 assertion·fixture 링크 속성 누락 실패 보존. 실기기/Safari/운영/전체SQL 이번 미검증. 기존 이동/아이템/RESULT/XP/업적/장착·서버규칙·DB/RPC/RLS/Edge/보상 추가변경0, 기존 미커밋 변경 보존. **commit/push/운영접근·배포0; 사용자 검수 대기**.

## 2026-10-10 애니메이션 전수 감사·핵심 게임 연출 — 사용자 검수 대기

기준 **4830b38 + 기존 변경 보존 미커밋 트리**, **2026-10-10**. [전수 감사](2.0x/ANIMATION-AUDIT-2026-10-10.md), [구현·실패 이력·검증·영상·재실행](2.0x/ANIMATION-IMPLEMENTATION-2026-10-10.md), [아트 제작/연동 명세](2.0x/ANIMATION-ART-SPEC-2026-10-10.md). 세 모드의 실제 승인 move 응답에서만 현재문서/추가 마지막 경로300ms 강조. Duel 실제 itemEventId 공유 gate·server timestamp/참가자 확인 후 작은 공격/방어HUD300ms, press150ms는 선택만. 복구/snapshot/F5에서 move pulse0, 숨긴 탭/RM은 표시생략·timer 정리. 기존 RESULT320ms/XP220ms/업적600ms/seen/공개보상/Group 최신요청·버전·3초poll·마스킹/원장 보존. PROFILE 실제 저장성공WAAPI만 box-shadow420ms→opacity/2px300ms로 대체 [코드].

최종 **npm561/561·build/diff exit0·RACE fixture123/123·RESULT fixture104/104·PROFILE/RANKING fixture30/30**. 실제 로컬 **Single17/17·확장Duel/Group24/24·Group 이벤트누락7/7·늦은400오류/응답역전7/7**, 각 runner 자기데이터 정리/RLS보존 확인 [산출물, 위 기준·날짜]. fixture/실제 합산0. `.temp/motion-audit/index.html`에 **최종PNG112장·짧은fixture WebM10개(1.76~12초)·실제로컬 원본WebM5개**, 기본5해상도/RM/실패/F5/모바일focus·tap·CTA 검사. 첫 실제 teleport응답wait30초 timeout은 미확정 원인으로 보존; 새게임22/22·확장24/24 성공으로 최초실패를 삭제하지 않음. 테스트슬롯중복 고유제약 실패는 runner만 한슬롯 준비로 보정 [산출물].

운영·실기기/Safari·OS suspend·20분 만료·전체SQL·profiler·실제 동일websocket프레임 이중주입 미검증. cross-tab race 강조는 탭별이며 새 영구claim/지급체계 추가0. 전용책장/잉크/도장/카드자산·음원 미제작은 상세명세로 보류. 기존미커밋DB/Edge변경 보존, 이번 서버규칙/DB/RPC/RLS/Edge/보상/음원/의존성 추가변경0. **commit/push/운영접근·배포0, 사용자 검수 대기.**

## 2026-10-10 2차-B RACE / RESULT 최종 개편 — 사용자 검수 대기

기준 **4830b38 + 기존 변경 보존 미커밋 트리**, **2026-10-10**. [구현 전 조사·모드별 계약·파일·검증·실패 이력·스크린샷](2.0x/RACE-RESULT-FINAL-2026-10-10.md), [사운드 연결·중복 방지·자산·미결정 정책](2.0x/RACE-RESULT-AUDIO-2026-10-10.md). 실제 위키 본문/파란 링크·검색·검열·아이템·서버 코스·XP/업적/보상 정책 유지. 현재/목표 라벨과 종이 HUD, 모바일 실제 내 경로 접기·긴 목표 두 줄/펼침 전체, 잘리는 아이템 오류 안내 보정. RESULT 중앙 인물/지형 대신 기록지·서버 날짜·정적 완주/결과 표식·실제 경로·확정 XP·공개 보상 견본/프로필 연결. 220/320ms 표시 모션·reduced-motion·브라우저 저장소의 결과별 재연출 방지; 기존 업적600ms/seen/히든 정책 유지. Duel START·Group 요청 세대/version/3초 reconcile/종료 중단 추가 수정0 [코드].

최종 **npm556/556·build/diff exit0·RACE fixture120/120·RESULT fixture104/104·실제 로컬 Single17/17·Duel/Group22/22** [산출물, 위 기준·날짜]. 실제 Group 장애는 이벤트 누락/오래된 성공 응답/늦은400 오류 각 새게임1성공·7/7이며 기존 runner의 서버 순위·원장 불변/F5·종료 뒤 조회 중단 검사를 유지했다. 실제 runner는 자기 계정/방/문서를 정리하고 RLS 정책 보존을 확인. fixture와 실제 서버 수치는 합산하지 않는다. 마지막 모바일 오류 안내 CSS 보완은 RACE120/120·build로 검증했고 정상 실제게임 반복은 그 직전 최종트리였다. `.temp/race-result-final/index.html`에 **PNG90장(기본7화면×5너비35장 포함)·10.32초 fixture 영상1개**, 대표 화면 육안 확인 [산출물].

중간 RESULT 기권fixture 단발 실패1회는 `result-review.log`에 보존. 당시 어느 boolean이 false인지 로그가 없어 정확한 원인 미확정; 결과 shell 진입 뒤 기권 사유 표시를 기다리도록 runner만 보완(timeout 증가/앱 기권 변경0)하고 최종104/104를 확인했다. 재실행의 진입 로그는 이미 사유가 표시된 상태라 경합 재현으로 주장하지 않는다. 초기 HUD90px assertion 실패·sandbox build EPERM·모바일 오류 안내 잘림과 보완도 보고서에 기록했다. 운영·실기기/Safari·실제 OS suspend·20분 실시간 만료·전체 SQL gate는 이번 미검증. 실제 음원/재생 코드·새 아트·의존성·DB/RPC/Edge/RLS 추가 변경0, 승인된 보호 화면 추가 개편0. **commit/push/운영 접근·배포0. 구현·로컬 검증을 마치고 사용자 디자인 검수를 기다린다.**

## 2026-10-10 2차-B 선행 Group 결과 전환 안정화 — 사용자 검수 대기

기준 **4830b38 + 기존 변경 보존 미커밋 트리**, **2026-10-10**. [원인 A~F·시간순 로그·파일·실패 이력·검증·재실행 명령](2.0x/GROUP-RESULT-STABILITY-2026-10-10.md). 실제 로컬 서버의 finished/version12/결과3행에서 **오래된 playing/개인 결과1행 응답이 ENDED→FINISHED로 덮어쓰는 C**, **변경 이벤트 차단 시 개인 결과 재조회 없이 정체하는 B·D**를 결정론적으로 재현 [코드/산출물]. 요청 세대·서버/참가자 버전·종료 역행 보호, recovery 중 조회 차단, 개인 결과/관전 전용 3초 reconcile·실패 backoff·focus/visible/online 복귀·종료/나가기/해제 중단, 실제 조회 상태 안내·DEV opt-in 진단으로 보완했다. Group 보상/서버 계약·Duel 앱 코드·RACE/RESULT 디자인·사운드 추가 변경0.

수정 전 일반 **10성공/0실패**, 역전 **0/1**·이벤트 차단 **0/1**; 수정 초기 복구/Realtime 경합 **0/1**도 보존하고 보완 뒤 별도 검증. **최종 일반 독립 새 게임 10성공/0실패**, 추가 장애 **12성공/0실패**(차단3·역전3·조회지연1·개인F5 1·숨김복귀1·offline복구1·동시완주1·늦은400 1). 실제 3브라우저/Auth/DB/RPC/RLS/Realtime이며 문서 그래프만 seeded fixture. 순위1·2·3·서버 원장(XP/업적 seen_at 제외/보유 보상)과 결과/F5 불변·390px CTA·종료 뒤 재확인 중단 확인 [산출물, 위 기준·날짜]. 중간 일반10성공/0실패와 역전 보완1성공도 별도 기록했다. 선행 늦은503 검증은 SDK 기본 GET 재시도를 확인해 오류 폐기 판정에서 제외하고, 재시도 없는400에서 discard-error 로그를 검증했다. 두 산출물을 모두 보존했다.

최종 npm **552/552**, build/diff exit0; 대기실 fixture **136/136**·RACE **89/89**·RESULT **90/90**; 실제 기존 Duel/Group 회귀 **22/22**(Duel 결과/F5/기권/teleport 포함) [산출물, 위 기준·날짜]. fixture/실제 수치는 합산하지 않는다. `.temp/group-transition/`에 회차별 JSON·실패 PNG·상태 로그·최종390px 캡처, 실행 로그는 `.temp/group-transition-*.log`. 모든 실제 runner는 자기 테스트 방/계정/문서를 정리하고 RLS 정책 보존을 검사했다.

**최초 2차-A timeout의 정확한 원인은 당시 서버/이벤트/조회 순서 로그 부족 및 데이터 정리로 미확정이다. 위 결함 수정으로 과거 실패를 해결 판정하지 않는다.** 운영/실기기/Safari/실제 OS suspend/새 20분 실시간 만료 실행은 미검증. 확인된 두 클라이언트 결함의 로컬 안정화 검증은 완료했고, **사용자 검수 후 2차-B 디자인 진행 가능; 이 세션에서는 시작하지 않는다.** commit/push/운영 DB·Edge·Vercel 변경·배포0, 기존 미커밋 변경 보존.

## 2026-10-10 2차-A 게임 진입·대기실 최종 개편 — 사용자 검수 대기

기준 **4830b38 + 기존 미커밋 변경 보존 최종 트리**, **2026-10-10**. [페이지별 변경·계약·실행 이력·2차-B 인계](2.0x/PREPARATION-FINAL-2026-10-10.md). PLAY 모드별 링크 탐험 브리핑/출발·목표/준비·실제 아이템/게스트 제한, MULTIPLAYER 모드·규칙/생성·참가 위계/Enter·pending·중복요청 차단/실제 오류·접근 가능한 도움말, Duel/Group 서버 상태·다음 행동·연결 안내. 대기실 카드 재등장 제거/긴 문자열·44px 조작영역/모바일 목록 덮는 sticky 제거. Duel 3초 재조회·Realtime·최신응답/취소/목표저장 보호·기존 canStart/START RPC, Group 3~8인·READY·서로 다른 후보2개·호스트/승계 계약 유지 [코드]. 보호 화면·RACE/RESULT 앱 소스/XP·보상·DB·Edge·RLS 추가변경0, 신규아트/음원/의존성0.

npm **549/549**·build/diff exit0·대기실 fixture **136/136**·보호 화면 fixture **49/49**·실제 로컬 Single **17/17**·실제 대기실 UI **30/30**·실제 Duel START 새방 **3/3**(실제 프레임누락2회, 세회차 재조회복구 확인) [산출물, 위 기준·날짜]. fixture 예상밖 console/pageerror0. 실제 대기실 console2는 runner가 차단한 Wikipedia 대문/그림 요청으로 경로 확인, pageerror/API실패0. **실제 전체게임은 Group 개인→전체 결과 전환 timeout1회로 미완료**: Duel 경기/결과/F5/teleport·기권 및 Group 준비/시작/개인완주 통과. 독립 Group 후속 **7/7** 통과했으나 첫 실패를 해결 처리하지 않음. 상세 로그·정리·포트충돌/옛 fixture selector 보정 이력은 인계문서에 보존. `.temp/preparation-final/index.html`에 5해상도·긴문자·준비/로딩/START불가/오류·복구·게스트 touch 캡처. 운영·실기기·전체SQL 이번 미검증, Group 최종전환 원인/전용자산·사운드는 후속. commit/push/운영변경·배포0. **2차-A 로컬 구현/검증 후 사용자 디자인 검수 대기; 전체 Group 최종 결과 무결점 판정은 보류.**

## 2026-10-10 도감 장식·모바일 최종 보완 — 사용자 검수 대기

기준 **4830b38 + 기존 변경 보존 최종 미커밋 트리**, **2026-10-10**. [적용·모바일 높이·보상 보존·검증·실패/정리 이력](2.0x/ACHIEVEMENTS-FINAL-DECORATION-2026-10-10.md). 사용자 제공 SVG6종을 실제 크기 검수 후 원본 그대로 적용: 공개5분류32px/실제 최종완료 정적 도장48px. 지급 보상assetRef/카탈로그와 별도이며 새 아트 생성0. PC3/태블릿2열·자연 카드높이 보존, 모바일600px 이하 이름→설명→진행→다음보상 요약/상세 펼침·aria/키보드/초점. 같은 일반13개 스냅샷·390×1000에서 기본 문서높이 **8,002→5,821px, 2,181px/27.3% 감소** [산출물, 위 기준·날짜]. 상세 보상 견본·획득 이력 유지/접기 펼치기 API·데이터 변경0 [코드/산출물].

npm **549/549**·build/diff exit0·수정전 SVG/해상도 **6/6**·최종 도감fixture **38/38**·기존 도감fixture **22/22**·실제 로컬 공개/보상 **10/10**·실제 Single/Duel 업적·결과·F5 **17/17** [산출물, 위 기준·날짜]. .temp/achievement-final/index.html에 최종33장/수정전5장/원본크기1장/신규해금·F5녹화. 녹화파일 watch EBUSY 초기중단→테스트 산출물감시제외 후 exit0; 남은 자기 테스트 계정·문서 확인/정리. 도장SVG는 정적이며 기존 신규 reveal/seen/F5 재연출 방지 유지. HOME/RANKING/PROFILE/기존 보상·서버규칙/XP/RLS 추가변경0. 운영·실기기·Group/전체SQL 이번 미검증. **제공 UI장식은 적용 완료; 기존 보상 신규아트·음원 미제작은 별도 유지.** commit/push/운영DB·Edge·Vercel 변경0.

## 2026-10-10 ACHIEVEMENTS 발견 도감 — 사용자 검수 대기

기준 **4830b38 + 기존 변경 보존 미커밋 트리**, **2026-10-10**. [구현·계약·검증·산출물](2.0x/ACHIEVEMENTS-ALBUM-2026-10-10.md), [공개 자산 감사·제작 명세](2.0x/ACHIEVEMENTS-ART-AUDIT-2026-10-10.md). 도감 표지/일반완성·진행·히든발견 분리/4상태/획득내역/실제 공개 보상 견본·inventory 확인/3·2·1열/결과 완료 표식. HOME/RANKING/PROFILE 승인 배치·공통 카드·업적조건/XP/보상정책/RLS/서버 추가 변경0 [코드]. 실제 새 로컬 계정 공개RPC 일반13개·미발견 히든 목록없음; 공개 카탈로그만 감사하며 히든 총수·이름 추정0.

npm **547/547**·build/diff exit0·전용 도감 fixture **22/22**·실제 로컬 공개/보상 **10/10**·실제 Single/Duel 업적 **17/17**·기존 PROFILE/RANKING fixture **30/30** [산출물, 위 기준·날짜]. F5에서 확정XP 복구/seen reveal0/unlock 증가0 확인. .temp/achievements-album/index.html에 기본5해상도·상태·비교·실제 해금/F5녹화. fixture와 실제 서버 구분, 초기 스모크 실패 및 잔여 테스트 계정 정리 기록. 운영/Group/전체SQL 이번 미검증. **UI 구현·로컬검증 완료/신규 전용아트·음원 미제작**. commit/push/운영DB·Edge·Vercel 변경0, 사용자 디자인 검수 대기.

## 2026-10-10 RANKING + PROFILE 최종 개편 — 사용자 디자인 검수 대기

기준 **4830b38 + 기존 변경을 보존한 최종 미커밋 트리**, **2026-10-10**. [파일·계약·검증·아트 제한·검수 자료](2.0x/RANKING-PROFILE-POLISH-2026-10-10.md). RANKING 메달/실제 장착 TOP3·내 순위/수치·참고기록 위계·모바일 목록·공동순위/긴 이름. PROFILE 대표 카드/실제 XP·기록·수집 4+2슬롯·다음 공개 업적 목표·서버 확정 저장/실패·카드 DOM 유지·닉네임 접기·게스트 로그인 안내. HOME 앱 소스·공통 ProfileCard·랭킹 RPC/RLS/Realtime/XP/카탈로그/DB/Edge 변경0, 이전 미커밋 작업 보존 [코드].

npm **544/544**·build/diff exit0·전용 UI fixture **30/30**·기존 UI fixture **49/49**·HOME 최종 회귀 **19/19**·실제 로컬 보상/Auth/RLS **9/9**·실제 로컬 Group **7/7** [산출물, 위 기준·날짜]. Fixture와 실제 서버 수치 합산하지 않음. 정상 주 검증 페이지 console/pageerror0, 의도 실패 별도. `.temp/ranking-profile-final/index.html`에 스크린샷20개(기본10+장착전후/미보유/동률·긴이름)와 짧은 fixture webm. 운영 계정/카탈로그 미확인, 새 아트·음원 미제작, 기존 번들 경고 유지. 이번 Single/Duel 게임 재실행0. **commit/push/운영 DB·Edge·Vercel 변경0. 두 페이지 구현·로컬 검증 후 사용자 디자인 검수를 기다린다.**

## 2026-10-10 HOME 마무리 — 사용자 검수 대기

기준 **4830b38 + 기존 변경을 보존한 미커밋 트리**, 2026-10-10. [수정·데이터 구분·스크린샷·제한](2.0x/HOME-POLISH-2026-10-10.md). HOME 내 인물 제거/본인 장착 full 카드, 최근 기록 장식 제거/원본 시작·경로 보존, 오늘 코스 밀도, TOP3 순위 위계·동률 표시. 발견 노트·공통 헤더·게임/DB/랭킹 집계/XP 정책 수정0. npm544/544·build/diff 통과·브라우저19/19, 정상 console/pageerror0(의도503 별도) [산출물]. Wikipedia 실제 읽기와 계정/보상/랭킹 fixture 구분. 신규 아트0, 기존 변경 보존, commit/push/운영 변경0.

## 2026-10-10 HOME 최종 시안 후속 — 로컬 구현

기준 **4830b38 + 기존 변경을 보존한 미커밋 트리**, 2026-10-10. [HOME 변경·자산 조사·검증·미완성 사항](2.0x/HOME-FINAL-2026-10-10.md). HOME 한정 CSS·사람 없는 히어로·실제 장착 TOP3·발견 노트 4/2/1열, 실제 Wikipedia/Commons 콘텐츠와 출처 유지. 전용 정글/유적/수첩 아트는 미확보이며 CSS 표현과 구분. npm544/544·build 통과 [산출물]. 기존 미커밋 변경 보존, commit/push/운영 변경0.

## 2026-10-10 B안 전면 UI 감사·후속 구현 — 로컬 디자인 검토 가능 / 운영 배포 판단 보류

기준 **4830b38 + 기존 변경을 보존한 미커밋 트리**, **2026-10-10**. [전체 감사](2.0x/B-UX-AUDIT-2026-10-09.md), [구현·검증·파일·스크린샷·배포 전 체크](2.0x/B-EXECUTION-2026-10-10.md), [보상·모션·사운드 명세](2.0x/B-REWARDS-MOTION-AUDIO-2026-10-09.md). 공통 종이/점선/외곽 장식 레이어·헤더 터치영역·짧은 모션/reduced motion, HOME 하단 노트·랭킹 기록지, 프로필 미보유→도감 연결/서버 확인 장착 피드백/배경 실제 카드 미리보기, 일반13개 도감 분류별3/2/1열·일반 먼저/히든 전폭 요약 마지막·보상 이름 태그, PLAY 준비3단계·대기실/결과 공통면 구현 [코드]. **START/서버 계약/XP 지급·결과 저장/기존 DB·Edge 파일 추가 변경0**. 이전 미커밋 변경은 보존.

최종 **npm544/544 · build/diff exit0 · 페이지 UI49/49 · 대기실fixture101/101 · RACEfixture89/89 · RESULTfixture90/90 · 실제 로컬Single17/17 · 실제 로컬Duel/Group22/22** [산출물]. 모든 수치는 위 기준·날짜이며 fixture와 실제 서버를 합산하지 않음. 페이지 UI 정상 console/pageerror0, RACE/RESULT 의도적 실패는 별도 기록. AFTER56개(주요11화면×5너비+보상preview1)·BEFORE4개, `.temp/b-ux-after/index.html`에서 비교. 신규 이미지·보상 ID/슬롯·지급 정책·음원·의존성 추가0. 기존4migration/Edge 선행·운영SHA/검증·승인·전용일러스트·음원은 후속; 이번 운영 조회/변경·commit/push/배포0.

## 2026-10-09 Duel START 안정화 — 재현·수정·최종 로컬 검증

기준 **4830b38 + 기존 변경을 보존한 미커밋 트리**,2026-10-09. [원인·회차별 결과·변경파일·배포전 확인](2.0x/DUEL-START-2026-10-09.md),[배경 이미지 제작 명세](2.0x/ILLUSTRATION-SPEC-2026-10-09.md). 수정 전 실제 두계정6회는5성공/1실패:양쪽SUBSCRIBED지만host최종조회1명 뒤guest join 이벤트미수신,DB2명/host UI1명 정체. **waiting3초 서버재확인+focus/visible 복귀,latest read/취소응답보호,목표저장전조회무효화**로복구. 원래누락의Realtime내부사유는미확정. 최종일반12/12·실제서버host프레임누락6/6(모든회차reconcile복구확인),전체실제게임22/22·fixture91/91·npm544/544·build/diff exit0 [산출물]. 중간/추가진단은실행기록에별도보존하며실패를재시도로지우지않음. 주요3랭킹/참고버튼분리·TOP1/프로필미리보기작은마무리,실제일반업적13개로5해상도밀도검토(별도응답재생UI44/44). 신규이미지제작/삽입·서버계약변경·commit/push/운영변경0. 이전의미해결기록은이실행의재현/수정범위에서대체되며운영스모크/기존배포선행조건은별도보류.

## 2026-10-09 UI 완성도 후속 — 로컬 구현 / 실제 Duel 간헐 실패 확인 필요

기준 **4830b38 + 기존 변경을 보존한 미커밋 트리**, 2026-10-09. [수정 파일·검증·스크린샷·한계](2.0x/UI-POLISH-2026-10-09.md). 공통 CSS 지도/기록판/수첩 배경, HOME 시작→목표 구분 및768px 기록판 압축, TOP3 위계·모바일 탭, 프로필 장착/보유/미보유 안내·숫자 대비, 업적 히든/보상 영역, 위키 그림 실패 안내. 신규 자산·의존성·서버 계약 변경0. npm544/544·build/diff exit0·fixture UI44/44(5해상도/20스크린샷)·초기 경합 fixture83/83·실제 Single17/17·실제 Duel/Group 재실행22/22 [산출물]. **실제 첫 Duel은 DB2명/화면1명으로 START timeout; 원인 미확정이며 재실행 성공을 해결 근거로 쓰지 않는다.** SQL clean/외부 링크는 이번 재실행하지 않음. commit/push/운영 변경0.

## 2026-10-09 후속 실행 — 로컬 구현·검증 완료 / 운영 확인 보류

기준 **4830b38 + 기존 변경을 보존한 미커밋 작업 트리**, 2026-10-09 [산출물]. [실행 결과·검증 한계·변경 파일·재실행 명령](2.0x/EXECUTION-2026-10-09.md).

- 별도 빈 폐기 컨테이너에서 전체 migration **36/36**, SQL **1,296/1,296(23파일)** 통과. 플랫폼 Auth/Storage schema-only 기반 psql 순차 적용이며 CLI 이력 검증과 구분. 기존 개발 DB reset·앱 데이터 복사 없음. 실제 Wikipedia 후보5 **5/5** 재확인 [산출물].
- 초기 SELECT 지연이 최신 참가자/목표를 덮어쓰는 START 경합을 fixture에서 재현하고 latest-read 보호로 교정. 대기실 **83/83** 통과. 이전 실제 첫 실패의 동일 원인 여부는 미확정 [코드/산출물].
- HOME 3열 제거·중앙 최대1200px 복원·하단 Wiki 노트. 승인 장비 이미지는1600px 이상 좌우 장식. RANKING TOP3 장착 카드/프로필·내 기록 비교·나머지 목록 분리. PROFILE auth-card 제거·Jungle Shell 및 저장/장착 유지. ACHIEVEMENTS 서버 분류 필터·히든 보호·꾸미기 진입 [코드].
- **npm544/544 · build/diff exit0 · 실제 Single17/17 · 실제 Duel/Group22/22 · 격리 페이지UI29/29(1440/1024/390)**. 정상 console/page error0, 기존 번들 경고 유지. `.temp/wiki-2.0x-ui/`에 네 페이지 각3크기 스크린샷 [산출물].
- 운영 읽기 권한 미확인으로 접근 시도 없음. [적용 전 읽기 전용 SQL](2.0x/PREDEPLOY-READONLY.sql) 제공. 운영 migration4/Edge 선행·Production SHA/승인은 별도. 신규 자산·보상 정책·Group 자동 disconnected·일일 업적 날짜 보류 유지. commit/push/운영 DB·Edge/Vercel 변경0.

## 2026-10-09 1차 개발 검수 — 이전 이력 (위 후속 실행이 우선)

기준 **4830b38 + 미커밋 검수 작업 트리**, 2026-10-09 [산출물]. [검수·페이지 상태·후속 작업 명세](2.0x/REVIEW-2026-10-09.md).

- **교정3건:** HOME TOP3에 제한 밖의 내 행이 포함되는 문제, RANKING 공식 코스 조회 실패/fallback 표시, 주간 XP가 created_at을 사용하는 C2 계약 불일치. 주간은 **granted_at**으로 교정했다.
- **새 후속 migration `20261009051855`**는 주간 집계 함수 하나만 교체한다. 이전3개 migration 보존. **로컬36개**, 이 개편 운영 적용 대기 migration은 **4개**, Edge single-run도 선행 필요. 원장·과거 기록·보상·정책 소급 변경0.
- **HOME 방향 정정:** 사용자는 3열 정보 대시보드를 원하지 않는다. 기존 중앙 hero/게임 진입/탐험가·랭킹 유지 → 하단 Wiki 콘텐츠 확장 → PC 양옆은 배경 장식. 현3열 CSS는 요구 불일치이며 완료 판정을 철회했다. 이번은 후속 설계, 전체 홈 대규모 재작성0.
- **페이지 현황:** PLAY 및 freeze Lobby/Race/Result는 기존 범위 재사용. MULTIPLAYER/RANKING/ACHIEVEMENTS 부분 완료, PROFILE 이전 auth-card 유지. 일일 업적 날짜·Group 자동 disconnected 판정·신규 꾸미기/음원은 후속.
- **재검증:** npm544/544 · SQL전체1,296/1,296(23파일) · build/diff exit0 · 실제 Single17/17 · 격리 UI23/23(1440/1024/390 진입/홈/랭킹/프로필, 업적/팝업/장애·정상 console 오류0). 실제 링크5쌍 재감사 성공. 모든 수치는 2026-10-09, 4830b38 + 검수 미커밋 트리 기준. 기존 번들 경고 유지.
- **실제 Duel/Group 회귀:** 첫 실행은 대기실 START 비활성 timeout, fixture 정리 완료. 진단(UI roster/status+DB 목표) 추가 후 **재실행22/22 통과**. 첫 실패 원인은 미확인, 응답 경합 재현은 후속이다. 성공한 재실행을 첫 실패의 해결 근거로 쓰지 않는다.
- [읽기 전용 적용 후 SQL](2.0x/REVIEW-DB-CHECKS.sql)은 로컬에서 실행 확인; 운영 미실행. 초기 깨끗한 별도 DB에 migration4개를 재적용하는 clean gate는 이번 미실행.

**이 세션 commit/push/운영 DB·Edge·Vercel 변경0.** 세부 검수 자료를 먼저 검토하고 후속 HOME 구현/운영 적용은 사용자 별도 승인 범위로 진행한다.

## 2026-10-09 Wiki Race 2.0.x — 1차 로컬 구현 기록 (아래는 검수 전 이력)

**기준 4830b38 + 미커밋 작업 트리, 2026-10-09 [산출물].** 상세 변경·근거·분류·남은 정책은 [2.0.x 진행 기록](2.0x/PROGRESS-2026-10-09.md).

- **T1/T2 로컬 해결:** 서버 고정 시작·목표로 daily 생성, 위조 시작 ID/제목/revision 차단, 원래 코스 날짜·F5 결과/XP 보존, 동일 코스 개인 최고 랭킹. 실제 위키 링크 검증 후보 5쌍을 추가하며 하루 1코스 유지. 기존 NULL 시작은 미사용·동일 목표 검증 후보일 때만 보정; 이미 사용된 코스는 보존. 운영 당일 라면/시작 NULL을 임의 변경하지 않았다.
- **2.0.2 로컬 구현:** HOME 3열/모바일 핵심 우선 배치, 실제 Wikipedia 콘텐츠·출처·캐시·실패 표시, 일일 기록/주간 gameplay XP/누적 XP 랭킹 및 전원 대상 내 순위. 기존 PLAY/온라인 공용 Shell은 재사용.
- **2.0.3 부분 완료:** 업적 획득일/단계 보상/히든 보호와 기존 장착 단계 미리보기. 신규 꾸미기 자산·보상 정책은 보류. 기존 daily 업적의 완료 날짜+목표 기준 누적은 후속 정책 정리 필요, 기존 unlock/XP 소급 변경 없음.
- **2.0.4 준비 완료/재생 보류:** 게임용 음원 부재 확인, [이벤트·자산·재생 계획](2.0x/AUDIO-PLAN.md) 작성. 저작권 불명 음원 추가 없음.
- **T3:** 기존 Group 개인/최종 결과·관전·경로와 Duel 이동/기권/결과/F5는 로컬 회귀 통과. 그룹 연결 끊김 자동 마킹·모든 장기 시간 경계는 미확인/후속으로 분리했다.

| 최종 검증 | 결과 (2026-10-09, 4830b38 + 미커밋 트리) |
|---|---|
| npm test | **544/544** |
| npm run build / git diff --check | **exit 0 / exit 0**, 기존 큰 번들 경고만 |
| 신규/보정 SQL 관련 pgTAP | **163/163** (single43 + pool13 + XP100 + explorer7) |
| 기존 포함 로컬 SQL 전체 회귀 | **1,295/1,295**, 23파일 오류/실패 0 |
| 실제 로컬 Single 스모크 | **17/17** — fixed pair·2회원·반복 XP·active/completed F5 |
| 실제 로컬 Duel+Group 스모크 | **22/22** — RLS/Realtime/actual Edge·기권·3인·결과 F5·원장 불변 |
| 기존 Phase3 실제 로컬 스모크 | **16/16** — 관전·grace·리액션·모바일 |
| 2.0.x 격리 UI | **11/11** — HOME 1440/768/390·랭킹·업적·진입·오류 |

**로컬 DB migration 35개, 운영 적용은 하지 않음.** 새 migration 3개(`20261009030624`, `20261009032309`, `20261009033227`)와 single-run Edge 변경은 운영 미적용이며 프론트 배포 전 선행 필요. 새 의존성·재화·슬롯·보상 ID·과거 migration 수정 0. 본 세션 운영 DB/Edge 변경·배포·commit·push 0. 운영 스키마·배포의 현재값은 별도 승인/조회 후 확인한다.

## 최신 운영 상태 — RELEASED WITH FOLLOW-UP

사용자 건별 승인으로 백업 → migration 5개 → Edge 2개 → main fast-forward push #15 → Vercel Production Ready/alias 확인 완료. 운영/저장소 migration **32/32**, pending **0**, single-run **ACTIVE v2**, duel-random-teleport **ACTIVE v1**. wiki-snapshot v3·target-level v10 무변경. 제품 기준 **d496ba2**, 2026-10-06 재실행 npm **511/511**·build/diff exit 0 [산출물].

실제 운영 random **+20**, daily **+25**, 정상 duel 생성/입장/시작/일반 이동, 정상 지급 random_teleport **이동·path +1/소비 1건**, 기권 승리 **+30**·패배 **0**, 종료 결과/F5/상대 경로 복구 확인. SF-A3/M2 운영 DDL·ACL 검증 통과. 조회 범위 Edge 로그 5xx/예상 밖 오류 0, smoke 브라우저 error/warn 0. Group은 기존 종료 결과/F5만 확인, 신규 3인 흐름은 세 번째 세션이 없어 미확인. 390px Duel/Group 결과는 확인, 긴 path/새 업적은 후속. 확인된 차단 문제 없음, rollback 없음. maintenance는 이번 세션에서 사용하지 않아 해제 변경 없음. 기존 열린 탭 새로고침 필요. **기능 개발 종료, 2.1 backlog 분리.** 상세 근거/한계: [Production 배포 기록](../ops/RELEASE-2026-10-06.md).

## 2026-10-07 Jungle Expedition UI — Phase 1·2 로컬 통합 완료 (커밋됨, 미push·미배포)

**Phase 1 — HOME·PLAY, 커밋 `62105a3`** (`feat: integrate jungle expedition home and play UI`). 공용 Shell/Header·색상/모션 및 HOME·`/play` 모드 선택 통합. 검증 **6629445 + 미커밋 작업 트리, 2026-10-07 [산출물]**: npm **511/511** · build/diff exit 0 · 격리 fixture 브라우저 **42/42**. 상세: [Phase 1 통합 기록](../ui-freeze/PHASE1-INTEGRATION-2026-10-07.md).

**Phase 2 — 1:1·그룹 대기실, 커밋 `b1dec43`** (`feat: integrate jungle expedition multiplayer lobbies`, 16파일). Freeze `03_DUEL_LOBBY_FINAL`·`04_GROUP_LOBBY_FINAL` 기준으로 `RoomPage`·`GroupRoomPage` 표시 재구성, `/multiplayer` 입장 화면은 Shell 래핑·가벼운 재색상만. 기존 서비스·RPC·Realtime·핸들러 유지 `[코드]`. 계약 정합 수정 포함:
- 1:1: READY 없음 · 방장 단일 공통 목표 · 게스트 즉시 표시 · START는 방장만(상대+목표). `/multiplayer` 1:1 안내 문구를 이 계약으로 교체.
- 그룹: START 표시는 서버 `start_group_room_game_v2` 거부 조건을 같은 순서로 비춘다(3명 이상 → 전원 READY+제출 page_id → 서로 다른 후보 2개 이상) — `utils/groupLobbyState.js`. 판정은 서버. 남의 후보 제목은 로스터에서 숨김. `createGroupRoom` 기본 `maxPlayers = 6` 무변경.
- 이동 정리: 대기실 헤더 이동·로그아웃·로딩/오류 화면 `← 온라인 플레이로`는 같은 경로(`handleNavigateAway`) — 진행 중 초기 join 완료 → 방 상태 재조회 → `waiting`일 때만 기존 leave RPC → 이동. 시작 이후에는 leave하지 않는다.
- 접근: 온라인 5경로(`/multiplayer`, 1:1·그룹 대기실, 1:1·그룹 경기)를 `OnlineRoute`로 — 미로그인 → `/login`, 로컬 게스트 → `/play`.

Phase 2 검증 **62105a3 + 미커밋 Phase 2 작업 트리, 2026-10-07 [산출물]** — 커밋 `b1dec43`은 그 트리와 내용이 같다(커밋 후 추적 파일 diff 0 확인). **커밋 후 재실행은 하지 않았다.**

| 검증 | 결과 |
|---|---|
| `npm test` | **521/521** |
| `npm run build` · `git diff --check` | exit 0 · exit 0 (기존 큰 번들 경고만) |
| Phase 1 회귀 `scripts/ui-phase1-browser.mjs` | **42/42** |
| Phase 2 fixture `scripts/ui-phase2-browser.mjs` (격리 API/Realtime fixture) | **82/82** |
| **실제 로컬 백엔드** `scripts/ui-phase2-local-smoke.mjs` (로컬 Auth·RPC·RLS·trigger·Realtime, migration 32/32 적용 스택) | **30/30 × 3회** — 1:1 생성/코드 참가/목표/Realtime 반영/START/양쪽 같은 경기 · 그룹 3인 참가/차단 사유 3종/READY 잠금/후보 변경/START/세 명 같은 경기 · 방장 승계(trigger → Realtime → 새 방장 START, READY 유지) · 헤더 HOME/PLAY와 로딩 중 `← 온라인 플레이로`의 실제 leave(멤버십 제거·늦은 재가입 없음). 2회차에만 `/play` XP 조회 `get_xp_summary_v1` 502 1건 — 로컬 Kong 로그상 PostgREST 연결 조기 종료, 체크는 전부 통과, 3회차 0건 |
| Freeze 8개 HTML + manifest | SHA-256 불변 |
| `supabase/`·migration·`services/` | 변경 0 |

픽스처 조건: 로컬 스모크는 위키 문서를 로컬 snapshot 테이블에 시드하고 Wikipedia·`wiki-snapshot` Edge 호출만 브라우저에서 응답한다(오프라인) — release smoke와 같은 방식. 생성한 사용자·방·문서는 매 실행 후 삭제(잔여 0).

**남은 사항 (Phase 2 범위 밖·후속):**
- `scripts/release-validation-local-smoke.mjs`는 옛 대기실 가정(`role="status"` 0개)이라 갱신 전에는 통과하지 않는다. `scripts/packet13-browser-b1.mjs`는 START 셀렉터만 갱신, 미실행.
- 브라우저 뒤로가기·탭 닫기는 leave를 부르지 않는다 (기존 동작, 별도 복구 과제).
- 입장 화면(`/multiplayer`) 전용 디자인 · 공개방 탐색(제품에 없음)은 후속.
- RACE/RESULT/관전/프로필/랭킹/업적 화면은 아직 옛 디자인 (Phase 3 이후).
- `main` push(=Production 재배포)는 `AGENTS.md` §1.1 건별 승인 대상이다. 운영 DB 변경 없음.

기존 운영 출시 상태는 위 2026-10-06 기록을 따른다.

## 2026-10-08 Phase 1–4 커밋 후 최종 릴리스 회귀 — PASS (미push · 미배포)

**기준 `4818c34` + 미커밋 `scripts/release-validation-local-smoke.mjs` 셀렉터 복구, 2026-10-08 [산출물].** 순차 실행(동시 실행 없음). 로컬 스택 `wiki-packet13-r2-clean158`(migration 32/32), 호스트·DB 시계 차 ≤1초 확인 후 실행. 제품 코드 변경 0.

**`release-validation-local-smoke` 셀렉터 복구 (테스트 전용, 단언 약화 없음):**
- 1:1 목표 저장 완료 대기: `getByRole('status')` 0개 → `.room-target-section`의 `목표 문서 저장 중...` 0개. 옛 대기실에서 `role="status"`는 저장 중 문구뿐이었고, 현재는 상시 `#wr-duel-status`가 있어 영구 실패했다. 의미(저장 완료 대기)는 같다.
- 그룹 개인 완주 순위: `getByText('1위', {exact})` → Result A 표제 `#wr-result-a-title` = `1위 완주`(Phase 4 문구). DB `status = playing` 단언 유지.
- `--single-only` 진입: HOME `혼자서 플레이` 버튼(Phase 1에서 제거) → `/play`의 `싱글 탐험` 카드(`achievement-display-smoke`와 같은 셀렉터). 모달·XP 단언 무변경.

| 검증 | 결과 |
|---|---|
| `npm test` | **537/537** |
| `npm run build` · `git diff --check` | exit 0(기존 큰 번들 경고만) · exit 0 |
| Phase 1 / 2 / 3 / 4 browser (격리 fixture) | **42/42 · 82/82 · 84/84 · 85/85** — 출력된 console 오류는 스크립트가 의도한 주입 실패(500·`fixture failure`·강퇴 복구)뿐 |
| `scripts/packet13-browser-b1.mjs` (실 로컬 백엔드) | **12/12** · exit 0 · contexts 53/53 · join_acks 52/52 · deliveries 90/90 · fatal 0 · fixture_remaining 0 |
| `scripts/ui-phase3-local-smoke.mjs` | **16/16** · console/API/page 오류 0 |
| `scripts/achievement-display-smoke.mjs` | **16/16** · page 오류 0 · cleanup PASS |
| `scripts/release-validation-local-smoke.mjs` (기본: 1:1 A3·F5·XP·아이템 teleport·기권·그룹 3인) | **PASS 22/22** · page 오류 0 · cleanup PASS. 첫 실행은 그룹 `1위` 셀렉터(stale)에서 중단 → 복구 후 통과, 최종 파일로 재실행 통과 |
| `scripts/release-validation-local-smoke.mjs --single-only` (custom +15/0 · random +20 · daily +25/0) | **PASS 9/9** · page 오류 0 · daily 원복 · cleanup PASS |
| 실행 후 잔여 | sa2 문서 0 · 테스트 계정 0 · daily/후보 fixture 0 · waiting/playing 방 0 |
| Freeze 8 HTML + manifest | SHA-256 8/8 일치 |
| `supabase/` · `services/` · migration | `d496ba2..HEAD`·작업 트리 모두 변경 0, migration 파일 32 |

`main` push(=Production 재배포)는 `AGENTS.md` §1.1 건별 승인 대상이다. 운영 DB 변경 없음.

## 2026-10-07 Jungle Expedition UI — Phase 4 RESULT (커밋 `4818c34` · 미push · 미배포)

> **2026-10-08 갱신:** Phase 4는 `4818c34`로 커밋됐다. 아래 본문은 커밋 전 작업 트리에서의 기록이며, 커밋 후 회귀와 `release-validation-local-smoke` 복구는 위 2026-10-08 절이 대신한다.

**상태: 구현 + 로컬 검증 완료 · 커밋 전 작업 트리(`b6b6a2c` 위) · Visual 승인 대기.** Freeze `07_DUEL_RESULT_FINAL`·`08_GROUP_RESULT_FINAL` 기준. 사전 감사 후 사용자 결정 7건 `[사용자 결정, 2026-10-07]`:
1. **1:1 결과 자동 이동(4000ms/업적 시 6000ms → `/multiplayer`) 제거.** 대체 타이머 없음. 나가기는 명시적 "게임 로비로 이동"만. `settleIntoResult`·복구·F5 결과 복원·서버 판정 무변경.
2. **그룹 미완주 표제는 언제나 "리타이어"**, 실제 사유는 C4 어휘로 보조 문구(기권 / 제한 시간 초과 / 유예 시간 초과 / 몰수 · 재접속 유예 종료). `resultReasonLabels.js` 무변경 — 표시 매핑만(`utils/resultPresentation.js`).
3. **리타이어 Result C**: 경기 중 리타이어 → 기존 "경기 종료 · 결과 집계 중" → 서버 확정 → C(리타이어 · 순위 – · 완주 시간 – · 원장 +0 XP · 관전/축하 없음) → "최종 결과 보기 →" → B(최종 순위). **표시 단계일 뿐 서버 상태/RPC 없음.**
4. **재대결 미구현** — 운영에 1:1·그룹 재대결 RPC/서비스 없음. Freeze의 "재대결 →"·"방장의 재대결 대기"는 제외.
5. **Group Result A는 Phase 3 그대로** — XP·업적 없음, 명시적 "관전하기 →", 자동 관전 없음. XP·업적은 B(리타이어는 C)에서만. **결과 화면당 ResultXp 1회 마운트**(그룹 C→B는 같은 인스턴스 유지 — 재조회·재reveal 없음).
6. **싱글 게스트/결과 행 없음 표시 버그 수정** — `ResultXp`가 사용자 없음이면 기존 게스트 안내, 결과 키가 없으면 "이 결과에 기록된 XP 지급 내역이 없습니다."(조회 실패 시 "XP 지급 정보를 불러오지 못했습니다.") — 무한 "확인하는 중" 제거. 원장·지급 경로 무변경.
7. **싱글 행동은 실제 동작만** — "새 게임 선택"(기존 `/play`) · "로비로 이동"(기존 로비 복귀). 가짜 "다시 도전"(`location.reload`) 제거.

**변경 (표시 전용).** 새 `components/wiki-race/result/ResultParts.jsx`(ResultScreen·Scene·Card·Outcome·Stats·XpRow·Route·Actions·GroupStandings), `css/wikiRaceResult.css`(스티치 이중 프레임·승인 마스코트·Gold 완주, 패배/리타이어/무효는 Ink-3 중립·축하 없음, 1위 전체/2–3위 점/4위↓ 없음, 360–390/320 대응·모바일 하단 고정 행동 바), `utils/resultPresentation.js`(순수 표시 모델). `SuccessOverlay`·1:1 결과·그룹 B/C를 이 부품으로 교체. 1:1·싱글 결과는 `role="dialog" aria-modal`, 아래 race는 `inert`(RaceFrame `inert` prop 추가), 결과 표제로 포커스 이동. 1:1 무효의 화면낭독 상태 "패배" → "무효", 1:1 모드 라벨은 방 행 `use_items` 우선(복구 시 기본값 오표시 방지). **backend · services · RPC · migration · Edge · auth · Realtime 계약 변경 0** `[코드]`. HOME/PLAY/로비/RACE/관전 화면 변경 없음(Result A 컴포넌트 무변경).

**검증 — 기준 `b6b6a2c` + 미커밋 Phase 4 작업 트리, 2026-10-07 [산출물].**

| 검증 | 결과 |
|---|---|
| `npm test` | **537/537** (신규 `tests/resultPresentation.test.js` 8 · 자동 이동 단언 → "자동 이동 없음/명시적 행동만" 단언으로 교체, 셀렉터·마크업 단언 갱신) |
| `npm run build` · `git diff --check` | 통과(기존 큰 번들 경고만) · exit 0 |
| Phase 4 browser (`scripts/ui-phase4-browser.mjs`, 격리 API/Realtime fixture) | **85/85** — 싱글(인증 +20·업적 1회 reveal/seen·서버 순위·행동·게스트·행 없음/조회 실패), 1:1(승리/패배/상대 연결 이탈 몰수 승리/무효/본인 기권 +0, 7.6초 후에도 결과 유지, F5 같은 결과·원장 재조회만), 그룹(A→관전→B 업적 1회·F5 재reveal 없음, 8인 B 1–5위+리타이어 3, 4위/1위 축하, 리타이어 hold→C→B 단일 ResultXp), 390/320 가로 넘침 0·주 행동 도달 |
| Phase 1/2/3 browser 회귀 | **42/42 · 82/82 · 84/84** (Phase 3 결과 대기 셀렉터만 갱신) |
| Phase 3 실제 로컬 백엔드 (`scripts/ui-phase3-local-smoke.mjs`) | **16/16** · console/API 오류 0 — 새 결과 화면 경유(싱글 완주, 1:1 양측 결과, 그룹 A→관전). 첫 실행은 로컬 Docker 시계 편차(`PGRST303 JWT issued at future`, 401)로 1:1 진입 전 중단 — 시계 일치 확인 후 재실행 통과 |
| `scripts/achievement-display-smoke.mjs` (실제 로컬 백엔드) | **16/16 PASS** · exit 0 · 페이지 오류 0 · 정리 완료(방·계정·해금 삭제) — 1:1 승자/패자 결과 대화상자, 승자 업적 reveal(`첫 도착`), 패자 거짓 reveal 없음, **7.6초 후에도 결과 유지(자동 이동 없음)**, 명시적 "게임 로비로 이동" → `/multiplayer`, reveal한 해금의 DB seen 표시, 결과 XP = `xp_ledger`(정상 승리 +50 · 정상 패배 +25). 싱글 결과도 통과 — 15 + 90 XP, `Lv.1 → Lv.3 (+2)`, reveal 3장(히든 먼저) 전부 seen. 이 패스의 변경은 스모크 셀렉터뿐: Phase 1 HOME `업적 보기 →` 링크·PLAY `싱글 탐험` 카드 진입, 대기실 `게임 시작` 활성 대기 20초(스냅샷 목표 저장 + Realtime 입장), XP 줄을 원장 행과 대조하는 단언 추가(강화). 프로덕션 코드 변경 없음 |
| `scripts/release-validation-local-smoke.mjs` | **미통과 — Phase 2부터 stale(기존 기록)**: 대기실 `getByRole('status')` 0개 가정에서 결과 이전에 중단. 결과 셀렉터(1:1 표제·서버 `duration_seconds` mm:ss·그룹 B·그룹 로비로)는 갱신해 둠 |
| `badge-retirement-ui-smoke` · `duel-host-target-smoke` · `duel-players-view-smoke` | 실행 안 함. Phase 3부터 stale이던 이모지 결과 문구(`🎉 승리!`/`😢 패배`)를 결과 대화상자 셀렉터로 교체 |
| Freeze 8 HTML + manifest | SHA-256 불변 |
| `supabase/` · `services/` | 변경 0 |

**알려진 한계 / 후속.**
- 그룹 B의 "경로 비교", 1:1 "강제 이동 수"·"마지막 도달 문서", 싱글 F5 결과 복원·진짜 재도전은 운영 데이터/계약이 없어 제외(감사 보고 Freeze vs production 불일치).
- 1:1 패자 시간은 서버 경계(`finished_at - game_starts_at`)라 "경기 시간"으로 표기 — 1:1 RPC는 `room_players.elapsed_seconds`를 쓰지 않는다(백엔드 후속).
- Result A의 마감 표시는 Realtime 사이에 멈춰 있고, A/관전 화면은 스스로 `finalize_group_room_if_expired`를 부르지 않는다(Phase 3 이전부터, 이번 범위 밖).
- 리타이어 C → B는 화면 상태라 B에서 F5하면 다시 C부터 보인다(Freeze 화면 선택 규칙과 같음).
- `release-validation-local-smoke`의 Phase 2 대기실 셀렉터(`getByRole('status')` 0개 가정) 복구는 Phase 4 범위 밖 — 알려진 무관 실패로 유지.
- Phase 1·2·3은 로컬 커밋, Phase 4는 미커밋 — 모두 미push·운영 미배포. `main` push는 `AGENTS.md` §1.1 건별 승인 대상.

산출물: `test-results/packet13-b1/ui-phase4/`(fixture 스크린샷·`report.json`) · `ui-phase3-local/summary.json`(실 백엔드).

## 2026-10-07 Jungle Expedition UI — Phase 3 RACE · Group Spectator 로컬 완료 (커밋 `b6b6a2c` · 미push · 미배포)

**상태: 구현 완료 · Visual Freeze 승인 `[사용자 결정, 2026-10-07]` · 커밋 `b6b6a2c`** (이 절의 검증은 커밋 전 `321ea27` 위 작업 트리에서 실행했고, 커밋 후 재실행은 Phase 4 절의 회귀가 대신한다). Freeze `05_DUEL_RACE_FINAL`·`06_GROUP_RACE_FINAL` 기준.

**범위 (표시 통합만).**
- Single / Duel / Group RACE를 본문 우선 race 셸로 통합 — 56px HUD(현재 → Gold 목표 · 이동 · 시간 · 연결 · 명시적 "나가기"), 경기 중 전역 이동(HOME/PLAY/로비/랭킹) 없음. 나가기는 기존 exit guard → 기존 이탈/기권 핸들러.
- Duel: 상대 요약 스트립(상대 전체 경로 비공개 유지), 아이템전만 dock(일반전은 dock 없음). `링크만 보기` = 현재 문서 전체 링크 가나다순 overlay(필터 · 남은 시간 · 내부 스크롤 · 이동 시 닫힘). `링크 검열` = 서버 검열 집합을 본문·색인이 같은 배열로 표시 — 회색 `#78877F` · 밑줄 없음 · 클릭/키보드 불가 · **취소선 없음**(Freeze manifest; 기존 테스트 1건의 취소선 단언을 반대로 갱신).
- Group: 참가자 목록(완주 순위 → 진행 → 리타이어), 아이템 없음, 마감 HUD = `min(20분, 3위 완주 + 2분)` 실제 남은 시간을 "마감까지"로 표시(새 2:00 재시작 없음). 자기 리타이어 = 관전·반응 없는 중립 "경기 종료 · 결과 집계 중".
- Group Spectator: 완주자는 **Group interim Result A**(관전 진입에 필요한 범위만) → "관전하기 →"를 눌러야 관전. 기본 화면 = 관전 대상의 실제 Wikipedia 화면(읽기 전용, 링크 이동 없음), 경로 비교는 보조 탭, 프리셋 반응(서버 rate limit · 3초 대기 표시), 모바일 하단 시트(참가자/경로 비교/내 경로).
- Single `highlight_links`는 **싱글 전용 기존 아이템 예외로 유지** `[사용자 결정, 2026-10-07]` — 아이템 효과 중에만 중립 힌트 표시(Gold 아님, 목표 보장 암시 없음).
- **최종 RESULT 화면(Duel 결과 overlay · Group 최종 결과 B · Single SuccessOverlay · 리타이어 최종)은 Phase 4** — 진입 흐름은 기존 그대로.
- **backend · services · RPC · migration · Edge · auth · Realtime 계약 변경 0** `[코드]`. 표시 전용 상태만 추가(Duel heartbeat 성공 여부 · 관전 문서 재조회 키 · 반응 대기 · 시트/탭 · 그룹 복구 오류 코드 보존).

**검증 — 기준 `321ea27` + 미커밋 Phase 3 작업 트리, 2026-10-07 [산출물].** 커밋 후 재실행은 아직 없다.

| 검증 | 결과 |
|---|---|
| `npm test` | **529/529** |
| `npm run build` · `git diff --check` | 통과(기존 큰 번들 경고만) · clean |
| Phase 1 browser (`scripts/ui-phase1-browser.mjs`) | **42/42** — 같은 날 다른 무거운 실행 중/직후 2회 일시 실패, 이후 연속 통과(원인 미포착) |
| Phase 2 browser (`scripts/ui-phase2-browser.mjs`) | **82/82** |
| Phase 3 browser (`scripts/ui-phase3-browser.mjs`, 격리 API/Realtime fixture) | **84/84** |
| Phase 3 실제 로컬 백엔드 (`scripts/ui-phase3-local-smoke.mjs`) | **16/16 × 3회** · console/API/page 오류 0 · 잔여 0 — Single 서버 런 이동·완주, Duel 2계정 이동·Realtime·실제 아이템 지급·링크만 보기·결과 전환, Group 4계정 Result A→관전, 3위 완주 후 `grace_period` "마감까지", 반응 |
| Phase 2 실제 로컬 백엔드 (`scripts/ui-phase2-local-smoke.mjs`) | **30/30** (새 race 화면 경유) |
| `scripts/packet13-browser-b1.mjs` (실제 로컬 백엔드) | **12/12**, exit 0 — Phase 2/3 문구·관전 진입·반응 선택자만 갱신(계약 단언 유지; 반응 rate limit은 UI 대기 + 서버 `SPECTATOR_EMOJI_RATE_LIMIT` 직접 확인). 이전 실행에서 최초 로그인 1회 일시 timeout(재현 안 됨) |
| Freeze 8 HTML + manifest | SHA-256 불변 |
| `supabase/` · `services/` | 변경 0 |

**알려진 한계.**
- Group 연결 끊김 표시는 UI 준비만 됨 — 현재 backend는 그룹 참가자에 `disconnected` 상태를 쓰지 않으므로 실경기에서 "재연결 중"은 나타나지 않는다(fixture로만 검증).
- 자기 리타이어 대기 화면은 기존 `recoverGame`을 5초마다 재호출해 서버의 경기 종료를 확인한다.
- 최종 Duel/Group/Single RESULT 디자인은 Phase 4.
- Phase 1·2·3은 로컬 커밋(Phase 3 = `b6b6a2c`) — 모두 미push·운영 미배포. `main` push는 `AGENTS.md` §1.1 건별 승인 대상.

산출물: `test-results/packet13-b1/ui-phase3/`(fixture 스크린샷) · `ui-phase3-local/`(실 백엔드).

## 과거 상태 — 선택적 커밋 정리 (배포 이전)

로컬 출시 판정 **A. 로컬 출시 검증 통과**. 제품 패킷 커밋 완료, 이번 문서 커밋으로 선택적 커밋 정리를 완료한다. push·운영 DB 접근/적용·Edge/Vercel 배포는 수행하지 않았다. **다음 단계: 운영 배포 준비 — feature branch 백업 push와 remote/production 상태 점검은 별도 승인 후 수행한다.**

로컬 검증: clean migration **32/32**, pgTAP **21파일 1262/1262**, npm **511/511**, browser **22/22**, single **8/8**, group concurrency **8/8**, duel concurrency **15/15 · deadlock 0**, production build/diff check **PASS**. 모두 **e4fb483 + 커밋 전 통합 작업 트리, 2026-10-06**의 기존 산출물이며 개별 중간 커밋에서 측정한 수치가 아니다. 제품·테스트·스크립트 내용은 커밋 전후 해시 대조로 동일성을 확인했다. 커밋 후 npm/build/diff 최종 회귀는 실행 후 세션 최종 보고로 남긴다. [출시 검증 기록](RELEASE-VALIDATION-2026-10-06.md).

main push 이력은 변하지 않았다. SF-A3 운영 적용 여부와 실제 운영 권한·환경 변수는 미확인이다. 기존 migration 수정·추가 기능 개발 없음.

이 상태 갱신 이전에 생성된 커밋 [산출물, 2026-10-06]:

```text
1e4cc46 | fix: 듀얼 랜덤 이동과 경기 결과 복구 정합성 보완
7730ab5 | feat: 싱글 탐험 모드와 서버 XP 지급 연결
1b8aa95 | fix: 불필요한 클라이언트 DB 쓰기 권한 회수
```

## 배포 준비 순서와 호환성

별도 승인 세션에서 백업·remote/production SHA·migration 이력·Edge 환경을 확인한다. SF-A3 20261004110000 미적용이면 선행 적용 승인 필요. 신규 DB 순서: 00302 → 00303 → 02015 → 즉시 03000. 이후 변경된 single-run Edge → 신규 duel-random-teleport Edge → frontend production 배포. main push는 건별 승인이다.

02015부터 구 프론트의 teleport 직접 RPC가 RANDOM_DESTINATION_REQUIRED로 거부된다. 03000 이전에는 FORCED_LINK 필터 회귀도 있으므로 점검 창에서 연속 적용한다. 새 프론트 배포 후에도 이미 열린 구 탭은 재접속이 필요하다. 로컬 no-verify-jwt 검증은 운영 gateway 검증을 대신하지 않는다.

롤백은 frontend/Edge/DB를 나누어 판단한다. 02015 이후 구 프론트 롤백은 teleport 완전 복구가 아니다. single-run 구 버전은 guest mode를 legacy로 기록할 수 있다. 신규 teleport에는 이전 버전이 없으므로 수정 배포를 우선한다. DB는 down/delete/reset 대신 승인된 append-only forward fix를 사용하고 결과·이동·소비·XP 원장을 보존한다.

## 2026-10-06 과거 작업 기록 (최신 상태 아님)

아래는 커밋 정리 전 시점의 원문이다. B 판정·미검증·commit 0·다음 작업 서술은 당시 기록이며 위 최신 A 판정으로 대체됐다.

> **2026-10-06 출시 전 통합 검증 재개 완료 — e4fb483 + 미커밋 작업 트리. 판정 A: 로컬 출시 검증 통과.** Docker 정상 · 로컬 clean migration **32/32** · 공식 pgTAP **21파일 1262/1262** · 그룹 동시성 **8/8** · 듀얼 아이템 동시성 **15/15, 교착 0** · 실제 로컬 2세션 SELECT/Realtime/Edge/결과/F5/긴 제목·390px/그룹 스모크 **22/22** · single **8/8** · 최종 npm test **511/511** · production build/diff check exit 0 [산출물, 2026-10-06]. random/custom/daily gameplay XP **20/15/25**, custom/daily 반복 0 · duel **50/25** · group **70/55/45** 실측. FORCED_LINK 해석 가능한 링크 필터를 append-only **20261006003000**으로 복원, 결과 기록 시간 표시 보완, 권한/teleport/코스 fixture 및 TAP preflight 보정. 기존 migration 보존, local reset만 2회. 운영 접근·적용/배포/commit/push 0. target-level 로컬 소스 없음: 기존 fallback 검증, 운영 실물 미조회. **다음: 변경·검증 근거 리뷰 및 commit/배포 준비 패킷 정리**. [전체 출시 검증 기록](RELEASE-VALIDATION-2026-10-06.md). 아래 판정 B는 Docker 복구 전 최초 기록이다.

> **2026-10-06 출시 전 통합 검증 — `e4fb483` + 기존 미커밋 작업 트리. 판정 B: 조건부 통과, 출시 검증 미완료.** `npm test` **509/509** · production build exit 0 · `git diff --check` exit 0 `[산출물, 2026-10-06]`. 프로젝트 CLI `2.114.0` 확인. Docker Desktop 실행 후 Inference manager의 `dockerInference` 파일 접근 오류로 엔진 초기화 실패, 공식 정지/복구 및 소켓 단일 백업 시도도 해결되지 않음. **DB reset·migration 적용·pgTAP·실제 Realtime·2세션/F5/XP 실측·모바일 모두 미실행**. 기존 migration/기능 코드 변경 0 · commit/push/운영 접근·적용 0. Docker 프로세스 정지, 볼륨/설정/소켓 삭제 없음. **다음: Docker 복구 후 로컬 통합 검증 재개**. 파일별 SQL 미실행 및 판정 근거: [출시 전 통합 검증 기록](RELEASE-VALIDATION-2026-10-06.md).

> **2026-10-06 경기 종료 경험 보완 — `e4fb483` + 미커밋 작업 트리.** 그룹 개인 결과에 기존 `ResultXp`/업적 reveal 연결. XP는 `group_match_results.id` 원장, 업적은 방 ID RPC이며 70/55/45/35·미완주 0의 서버 규칙 무변경. 듀얼 정상·기권·연결 유예 만료·무효를 공통 결과 카드로 표시, F5/URL 재진입 및 retired 참가자의 서버 결과 복구 허용. 종료 후 마스킹 RPC로 상대 경로 재조회. reveal은 `seen=true` 해금을 제외하며 지급 XP 합은 서버 결과를 유지한다. 관련 **95/95**, 전체 **509/509**, production build exit 0 `[산출물, 2026-10-06, 기준 e4fb483 + 미커밋 작업 트리]`. **DB/pgTAP·실제 2세션 브라우저/F5·모바일 스모크는 미검증**, Docker 엔진 연결 실패. 이번 패킷 migration/의존성 추가 0 · commit/push/운영 적용 0. X3 결과 UI는 구현·node 검증했으나 브라우저 검증 전 완료 판정 보류. 아래 496/496은 이전 작업 기록이다.

> **2026-10-06 random_teleport 후속 — e4fb483 + 미커밋 작업 트리.** 인증된 Edge의 namespace-0 canonical 임의 문서 선정·현재/목표 제외·기존 RPC 원자적 이동/소비 구현. 관련 111/111 · 전체 496/496 · build exit 0 · diff check exit 0 [산출물, 2026-10-06]. 새 migration 20261006002015/pgTAP 작성, **DB 미적용·pgTAP/브라우저 미검증**. 저장소 migration 31파일(미커밋 총 3개), 운영 개수 미조회. 이전 변경 보존·commit/push 없음. [상세 계약/한계](DUEL-RANDOM-TELEPORT-2026-10-06.md). 아래 수치는 각각 이전 작업 시점 기록이다.

> **2026-10-06 후속: M2 회수 SQL + 랜덤 탐험 run_mode/XP 구현 작성 — `e4fb483` + 미커밋 작업 트리.** 새 append-only migration `20261006000302`(미사용 DML/시퀀스 회수)·`20261006000303`(random/custom/daily 저장·결과 전달·20/15/25 XP)와 pgTAP 2파일 작성. **DB 미적용·SQL 실행 검증 미완료**, Docker 미가동. 관련 node 228/228 · 전체 482/482 · build exit 0 `[산출물, 2026-10-06]`. guest Edge 모의 handler 검증 통과. 기존 mode 없는 기록/7인자 RPC 유지·소급 지급 없음. 운영 A3/M2 확인·배포는 미수행, commit/push 없음. 상세 계약·검증 한계·순서: [SEC-M2-RANDOM-XP-2026-10-06.md](SEC-M2-RANDOM-XP-2026-10-06.md). 아래 472/472와 migration 미작성 서술은 이 후속 이전 기록이다. 저장소 migration 파일 30개(새 2개 미추적·미적용); 운영/로컬 적용 개수는 이번 세션 미조회.

> **2026-10-06 SF-A3/SF-M2 재검토 — `e4fb483` + 미커밋 작업 트리.** 운영 변경·배포·commit·push 없음. 경기 Realtime을 본인 행으로 축소하고 호출 없는 후보 직접 UPDATE helper를 제거했다. 관련 테스트 107/107 · 전체 472/472 · build exit 0 `[산출물, 2026-10-06]`. DB/브라우저는 Docker 미가동으로 미실행. **A3 운영 적용 여부·M2 실제 권한은 미확인, 보안 운영 완료 선언 보류.** 권한 표·RPC 전체 대조·후속 확인: [SEC-A3-M2-REVIEW-2026-10-06.md](SEC-A3-M2-REVIEW-2026-10-06.md). 기존 미추적 `scripts/sec-m2-check-prod.sql` 보존, 보완 읽기 SQL `scripts/sec-m2-verify-readonly.sql` 추가. 아래 커밋 기준 기록은 그대로 유지한다.

## 2026-10-03 이전 상태와 운영 이력 (과거 기록)

아래 기준 커밋·운영 수치·미완료 항목은 해당 기록 시점의 정보다. 현재 로컬 상태는 위 최신 기록을 따른다. 운영은 이번 세션에서 조회하지 않았다.

갱신 날짜: **2026-10-03** (SF-A3 로컬 완료 · 운영 적용은 2026-10-04 이후 — 상자 (25)) · 이전: SF-A1 운영 적용 · **main push #14 (SF-A2)** (상자 (24)) · 이전: SF-A2 로컬 완료 (상자 (23)) · 이전: SF-M1 운영 확인 (상자 (22)) · SF-A1 로컬 완료 (상자 (21)) · SF-M1 로컬 완료 (상자 (20)) · 보안 마무리 착수 (상자 (19)) · 16d-2 운영 적용 · 패킷 14~17 전부 완료 (상자 (18))
기준 커밋: **`554b448`** (`feat(sec-A3): …`) — 이번 SF-A3 기록 커밋의 부모. **`origin/main` = `fadc81d`** (#14, `git ls-remote` `[산출물]`) — feat는 그 뒤 문서·A3 커밋만 앞선다. 마지막 migration 커밋 `554b448`(`20261004110000`) — **운영 미적용**, 저장소 28. **마지막 앱 코드 커밋 `bfbed24`(SF-A2) — 운영 배포 #14.** 운영 migration **27 = 저장소 27** (`20261004090000`·`20261004100000` Remote `[사용자]`). **마지막 migration 커밋은 `cb0cf0b`(`20261004100000_duel_players_view_v1.sql`) · 그 앞 `4fe80c5`(`20261004090000_sec_finish_db_v1.sql`, **운영 적용·확인 완료** `[사용자 실행·확인, 2026-10-03]` — `TRACKS.md` §8-SEC-⑥ 끝). SF-A1 **운영 적용** — `migration list` Remote `[사용자]`. 저장소 27.** 아래 "마지막 migration 커밋" 서술은 그 이전 기록이다. **`origin/main` = `912d241`** (#13).
마지막 **앱 코드** 커밋: **`bbf056e`** (16d-1, **운영 배포 — main push #13**) · 그 앞 `ecbf727` (16c, **운영 배포 — #12**) · 마지막 **migration** 커밋: **`e364084`** (16d-2, `20261003100000_badge_retirement_v1.sql`) — **운영 적용 완료** `[사용자 실행·확인, 2026-10-03]` · 그 앞 **`8eadaac`** (16b-f, `20261003090000_achievement_authority_filter_v1.sql`) — **운영 적용 완료** `[사용자 실행·확인, 2026-10-03]` · 그 앞 **`e122bfd`** (16b-2, `20261002100000_achievement_triggers_v1.sql`) — **운영 적용 완료** `[사용자 실행·확인, 2026-10-03]` · 그 앞 `a8eda5a`(16a-1, `20261002090000`)도 같은 적용에서 **운영 적용 완료**. **저장소/로컬 migration 25 = 운영 25, 차이 0** (운영 23은 사용자 보고, 이번 세션은 운영 DB 미접근). 마지막 운영 배포(`main` push)는 **#13 `275a693..912d241`**(16d-1, 2026-10-03) · 그 앞 #12 `34af554..275a693`(16c) — 16a·16b·16b-f는 DB 전용. 마지막 운영 migration은 `20261003100000`(16d-2)이다. 이번 갱신은 **16a·16b 운영 적용 기록**이다 — 앱 코드 변경 없음.
이전 기준: `33062ec` · `fadc81d` · `bfbed24` · `2449ab3` · `f54d886` · `cb0cf0b` · `5290fd8` · `4fe80c5` · `c9ceedc` · `c0f71b3` · `c0595be` · `3f43355` · `e189395` · `3729fb5` · `563195b` · `648d1df` · `2a676da` · `8eadaac` · `abe459e` · `545cc14` · `8160f2b` · `275a693` · `301c1db` · `932b46a` · `d2c139a` · `b1950d5` · `34af554` · `b99b066` · `bc2b46f` · `afd0e7b` · `7f748e6` · `ee99197` · `dc388d9` · `29eb3e6` · `dee9497` · `ffabdc0` · `50485ef` · `db33aa8` · `4719100` · `3693dd7` · `2b0ea54` · `ec7b6fa` · `47577ae` · `d12ce5e` · `518654c` · `fd6f916` · `4c35aa7` · `7e90b7a` · `09b684a`
브랜치: `feat/group-final-gaps` — **`origin/main` = `origin/feat/group-final-gaps` = `912d241`** (2026-10-03, `git ls-remote` `[산출물]`). main push #12·#13은 사용자 실행. 이후 커밋은 feat에만 push한다.

> # ⚑ 2026-10-03 (25) — **SF-A3 로컬 완료 (`554b448`) · 운영 미적용 — 2026-10-04 이후** `[산출물]`
>
> | 항목 | 결과 |
> |---|---|
> | migration | `20261004110000_duel_players_rls_v1.sql` — `room_players` 읽기 정책: 1:1 `starting`·`playing` 중 상대 행 숨김, 그룹 불변 (definer 헬퍼) |
> | 검증 | pgTAP 신규 17/17 · 전체 **1159** `not ok` 0 · 음성 대조 · SF-A2 스모크 16/16 × 4 · 14c 스모크 30/30 · 동시성 교착 0 · `npm test` 471/471 — 기준 `554b448` |
> | 정정 | `server_authority_v2.sql` 3건 서버 역할 집계 |
> | 관찰 | 정책 DDL 직후 로컬 Realtime이 첫 이벤트를 놓쳤다(2/4, 3초 대기로 4/4) — 운영 적용은 한산한 시간에 (`TRACKS.md` §8-SEC-⑨) |
>
> **다음:** #14 운영 확인 수신 → 2026-10-04 이후 SF-A3 운영 적용(건별 승인) → **부채 ④ 닫힘** → SF-M2 유지/회수 표.

> # ⚑ 2026-10-03 (24) — **SF-A1 운영 적용 · main push #14 `912d241..fadc81d` (SF-A2)** `[사용자 실행]`
>
> | 항목 | 결과 |
> |---|---|
> | SF-A1 | `migration list`에서 `20261004090000`·`20261004100000` 둘 다 Remote `[사용자]` |
> | SF-A2 RoomPage 경합 수정 | **승인** `[사용자]` |
> | #14 | 원격 main = `fadc81d` 실측 `[산출물]`. **운영 확인 미수신** |
> | SF-A3 | 로컬 작성·검증은 지금, **운영 적용은 #14 다음 날 (2026-10-04 이후)** `[사용자 결정]` |

> # ⚑ 2026-10-03 (23) — **SF-A2 로컬 완료 (`bfbed24`) · `main` 미배포** `[산출물]`
>
> | 항목 | 결과 |
> |---|---|
> | 변경 | `fetchRoomPlayers` → 마스킹 RPC · 상대 `duel_progress`·하트비트 주기 재조회(버전 보호) · 아이템 병합 · **`RoomPage` 최신 읽기만 반영(범위 조정 — 14c 스모크 2/3 실패를 닫음)** |
> | 검증 | `npm test` **471/471** · build 통과 · SF-A2 2세션 스모크 **16/16**(현행 + A3 정책 임시 사본, 신호 실수신 ~0.6초) · 14c 스모크 **30/30 × 3** — 기준 `bfbed24` |
>
> **다음:** SF-A1 운영 적용 결과 기록 → A2 `main` push(건별 승인) → `ls-remote` 확인 → **하루 뒤** SF-A3.

> # ⚑ 2026-10-03 (22) — **SF-M1 운영 적용·확인** `[사용자 실행·확인]` — 1:1 이동·아이템 정상 · O2 잔재 0행 · 법 조문 문서의 강제 이동 미소비는 부채 ③ 기존 동작(회귀 아님). 적용 후 migration 수·Q1/Q3/Q5/Q9·관전 이모지는 미보고. **SF-A1 운영 적용은 사용자 진행 중.**

> # ⚑ 2026-10-03 (21) — **SF-A1 로컬 완료 (`cb0cf0b`) · 운영 미적용** `[산출물]`
>
> | 항목 | 결과 |
> |---|---|
> | 착수 확인 | 1:1 진행 중 = `starting`·`playing` · 복구는 `fetchRoomPlayers`를 탄다(A3 단독이면 `OPPONENT_LEFT`) · **상대 liveness 표시는 없다** — boolean 불필요, 대신 A2에 하트비트 주기 재조회 (`TRACKS.md` §8-SEC-⑦) |
> | migration | `20261004100000_duel_players_view_v1.sql` — 마스킹 RPC + `duel_progress` 신호 트리거, 추가만 |
> | 검증 | pgTAP 신규 27/27 · 전체 **1142** `not ok` 0 · 음성 대조 · 1:1 동시성 하니스 교착 0 · `npm test` 465/465 — 기준 `cb0cf0b` |
> | 발견 | `room_events.user_id` → `profiles` FK — 신호가 이동을 막지 않도록 프로필 있을 때만 채운다 |
> | 운영 Q10 | SF-M1 적용 전 anon 실행 함수 4개 = 로컬과 같음 `[사용자 실행]` |
>
> **다음:** SF-M1 운영 적용 결과 기록 → SF-A1 운영 적용(건별 승인) → SF-A2.

> # ⚑ 2026-10-03 (20) — **SF-M1 로컬 완료 (`4fe80c5`) · 운영 미적용** `[산출물]`
>
> | 항목 | 결과 |
> |---|---|
> | migration | `20261004090000_sec_finish_db_v1.sql` — 본인 이동 행만 · 상대 경로 마스크(RPC 2개) · `room_events` 클라이언트 쓰기 회수 · TRUNCATE/REFERENCES/TRIGGER 잔재 회수 · 기본 권한 |
> | 검증 | pgTAP 신규 29/29 · 전체 **1115/1115**(preflight 제외) · 음성 대조 6건 `not ok` · `npm test` **465/465** — 기준 `4fe80c5`, 2026-10-03 |
> | 기존 테스트 | 정정 2건 (`group_security_phase2c.sql:356` 메시지 · `server_authority_v2.sql:727` 서버 역할 집계) |
> | 부채 D3 | heartbeat OCC는 **이미 D3로 등재**돼 있었다 — TRACKS §8-SEC의 "확인 필요" 해소 (`c9ceedc`) |
>
> **다음:** SF-M1 운영 적용(건별 승인, 절차 `TRACKS.md` §8-SEC-⑥) · SF-A1 착수.

> # ⚑ 2026-10-03 (19) — **보안 마무리 착수 — 등재·로컬 실측만, 구현 0 · 운영 미접근** `[사용자 결정, 2026-10-03]`
>
> | 항목 | 결과 |
> |---|---|
> | 부채 ④ 등재 | 1:1 상대 전체 경로가 경기 중 (A) `room_players` · (B) RPC `opponent` 반환 · (C) `game_move_events`로 브라우저에 도달 — `TRACKS.md` §8-SEC-① |
> | 티켓 | **SF-M1**(DB 전용 migration 1개: (C)·(B)·G2-②·O2·기본 권한) → **SF-A1**(마스킹 RPC + 신호 트리거, 추가만) → **SF-A2**(프론트, C 소유 파일만, `main` push) → **하루** → **SF-A3**(`room_players` 정책). **SF-M2**(DML 잔재·죽은 정책)는 유지/회수 표 확정 후 |
> | 실측 | 로컬 25 migration, 기준 `c0595be`. G2-② 클라이언트 INSERT 0 · INSERT 함수 8개 전부 definer · O2 잔재 8테이블 · `game_move_events`를 읽는 함수 9개 전부 definer(RLS 강화 영향 없음) |
> | 운영 확인 | `scripts/sec-finish-check-prod.sql` (SELECT만 Q1~Q10) — **미실행** |
> | 규칙 | `AGENTS.md` §4 — 새 테이블·시퀀스는 필요한 권한을 migration 안에서 명시 grant |
>
> **다음:** SF-M1 구현(로컬) → 운영 적용은 건별 승인 (`AGENTS.md` §1).

> # ⚑ 2026-10-03 (18) — **16d-2 운영 적용 · 패킷 16 완료 · 패킷 14~17 구현 트랙 전부 완료** `[사용자 실행·확인, 2026-10-03]`
>
> | 항목 | 결과 |
> |---|---|
> | 16d-2 | 백업 → `db push` `20261003100000_badge_retirement_v1.sql` — **운영 25 = 저장소 25** · 배지 보유자 쿼리 재실행 **0행** · 프로필 아이콘 목록에 전환된 「첫 도착」 표시 (`16-HANDOFF.md` §10.7) |
> | 패킷 16 | **완료** — 16a(서버 기반) · 16b(사건 연결) · 16b-r(소급) · 16b-f(1:1·그룹 권위 필터) · 16c(표시, main push #12) · 16d(배지 폐지, main push #13 + 16d-2) |
> | 패킷 14~17 | **구현 트랙 전부 완료** (`TRACKS.md` §1.1-c) |
>
> **다음: 보안 마무리 — G2-②(`room_events` INSERT 회수) · 부채 ④ · O2(`anon`·`authenticated` `TRUNCATE` 잔여 권한)** `[사용자 결정]`. 범위·티켓은 착수 시 정한다. 운영 DB 변경·`main` push는 계속 건별 승인 (`AGENTS.md` §1·§1.1).

> # ⚑ 2026-10-03 (17) — **16b-f 운영 적용 완료 · 16d-0 착수** `[사용자 실행·확인]`
>
> | 항목 | 결과 |
> |---|---|
> | 백업 → `db push` | `20261003090000_achievement_authority_filter_v1.sql` — **운영 24 = 저장소 24** |
> | `16b-f-check-applied.sql` | 전 행 `matches = true` |
> | `16b-f-check-opened.sql` | **0행** — legacy로 열린 해금 없음, 회수 대상 없음 (`16-HANDOFF.md` §11.3·§11.5) |
>
> **16b-f 완료.** **다음:** 16d-0(문서) → 16d-1(프론트, 옛·새 DB 양쪽 동작) → `main` push(사용자) → 배지 보유자 쿼리 → 16d-2(migration, 건별 승인). 판정 `16-HANDOFF.md` §10.
>
> **16d-0 완료 (문서만)** — spec §0·§9.2·§10 · C1 §0.-1 · C5 §0·§3.6 · contracts README · `docs/design/DESIGN-SYSTEM.md`(신규 최소판) · GAPS §4.5.1 · TRACKS §1.1-e 16d 행·§2.4 `20261003100000` 예약 · `16-HANDOFF.md` 12 → 11 정정·§10.4 토큰 할당·§10.5 · `scripts/16d-check-badge-holders.sql`. **코드·DB는 아직 옛 규칙.** 다음: 16d-1.
>
> **16d-1 프론트 (로컬 완료)** — 배지 렌더 제거 · 카드 4요소 · 편집기 카드 4행 + "경기 표현" 2행 · `asset_ref` 토큰(프레임 단계 · 완주 효과 · 경로 색상) · 싱글 결과 경로 색 + 완주 효과 · 1:1 승자 카드 완주 효과만 · 임시 SVG 9(히든 5 불투명). **옛·새 DB 양쪽 동작.** `npm test` **456/456** · build 통과 · 로컬 UI `badge-retirement-ui-smoke` **9/9**(옛 DB · 16d-2 모양 시뮬레이션 · 1:1) · 16c 스모크 15/15 (`16-HANDOFF.md` §10.6). **다음:** 사용자 `main` push → `scripts/16d-check-badge-holders.sql` → 16d-2 migration.
>
> **main push #12 `34af554..275a693`(16c) · #13 `275a693..912d241`(16d-1)** `[사용자 실행]` — #12 운영 확인: 업적 알림 · 버튼 · 업적 화면. **#13 운영 확인:** 편집기 카드 4행 + 경기 표현 2행 · 배지 행 없음 · 칭호 장착 · 업적 요약 정상 `[사용자 확인]`. 16d-2(migration) 로컬 착수.
>
> **16d-2 (로컬 완료)** — migration `20261003100000_badge_retirement_v1.sql`: 배지 11행 kind·표시명·SVG · 토큰 16행 · 배지 장착 행 삭제 · CHECK 3개 · equip RPC · 카드 빌더(`badges` `[]` 상수) · 「준비된 탐험가」 icon + title(condition_version 2). 데이터 경로 점검 8/8(16d-2 직전 DB에서 보유 불변 · 배지 슬롯만 해제 · 보유자 쿼리 후 0행) · migration 25 · pgTAP **1086/1086** · `npm test` **461/461** · UI 8/8 · 16c 15/15 (`16-HANDOFF.md` §10.7). **운영 배지 보유 현황 (16d-2 직전, `16d-check-badge-holders.sql`)** `[사용자 실행]`: 11행 — `badge_first_arrival` 보유 7 · 장착 1 · `badge_one_step_enough` 보유 1 · 장착 0 · 나머지 9개 보유 0. **`badge_slot_rows_total` = 1 — 16d-2가 해제할 장착 행 1개.** `condition_version` 1 → 2 **승인** `[사용자 결정]`. **다음:** 백업 → `db push`(사용자 진행 중) → 같은 쿼리 0행 확인.

> # ⚑ 2026-10-03 (16) — **16b-r 운영 apply 완료 · 16b-f(1:1·그룹 누적 판정기 권위 필터) 착수** `[사용자 실행·확인]`
>
> | 항목 | 결과 |
> |---|---|
> | 16b-r dry-run (운영) | 근거 사용자 7 · 해금 5(전부 첫 도착) · 150 XP · 레벨 변화 0 · 251 ms · 이동 이벤트 없는 1:1 76 (판정기가 세는 것 75) |
> | 16b-r apply (운영) | **dry-run과 동일** — 5명 · 150 XP · 레벨 변화 0 · 133 ms. **16b-r 완료** (`16-HANDOFF.md` §9.5) |
> | 16b-f 판정 `[사용자 결정, 2026-10-03]` | 16b 1:1·그룹 누적 판정기(맞수 · 승부사 · 순수한 승부 · **완벽한 대응** · 함께하는 탐험)에 "이동 이벤트 있는 결과만" — 소급과 같은 기준. 이미 열린 해금은 **목록만, 회수 없음** |
> | 확인 쿼리 (읽기 전용, SQL Editor) | `scripts/16b-f-check-opened.sql`(②) · `scripts/16b-f-check-exposure.sql`(③). 로컬 fixture에서 legacy 9 + 실제 1판 → 4단계가 열리는 사례를 둘 다 잡는 것 확인 |
>
> | 16b-f-1 (로컬, `8eadaac`) | migration `20261003090000` — `achievement_value_v1`에 이동 이벤트 조건 4곳 · `db reset` 24개 · pgTAP **1061/1061** · `npm test` **449/449** · 동시성 3종 PASS · 신규 스위트 migration 전 10/17 실패 → 후 17/17 (`16-HANDOFF.md` §11.4) |
>
> **다음:** 사용자 백업 → `db push`(1개, 운영 24) → `scripts/16b-f-check-applied.sql` **모든 행 `matches = true`** → `16b-f-check-opened.sql` 결과를 §11.3에 기록 → 16d-0.

> # ⚑ 2026-10-03 (15) — **16c 완료 (feat, 미배포) · 16b-r 소급 스크립트 (SQL Editor용, 운영 미실행)** `[산출물]`
>
> 커밋 **`ecbf727`**(16c 코드·테스트) · **`301c1db`**(16b-r 스크립트) · 이 문서 커밋 — feat push `[사용자 승인]`, `main` push·운영 실행 없음. 전문은 **`docs/agent/16-HANDOFF.md` §8·§9**.
> **판정** `[사용자 결정, 2026-10-03]`: 1:1 결과 유지 = 해금 있으면 6000ms / 없으면 4000ms · 로비 알림 닫기 = 세션 숨김(seen은 업적 화면 진입 시에만) · 분류 표시명 6개는 GAPS §4.5.1 발명 목록 · 16b-r은 16c 배포 후 실행 · once 카드 `0 / 1` 막대 숨김 승인 · 16b-r 근거에서 이동 이벤트 없는 1:1·그룹 결과 제외.
>
> | 항목 | 결과 |
> |---|---|
> | 16c 범위 | 업적 화면 `/achievements` · 싱글·1:1 결과 reveal(히든 먼저, 모션 감소 시 정적) · 결과 XP + 업적 XP 합산·다중 레벨업(판정 9, 획득 전 레벨은 서버 `level_from_total_xp`) · 로비 `업적` 버튼 + 새 업적 알림 · 본인 프로필 요약. migration 없음. 소유권 `TRACKS.md` §1.1-e 16c 행 확장(`MainPage.jsx`·15c-2 파일) |
> | `npm test` · build | **445/445** (422 + 16c 16 + 16b-r 7) · build 통과(기존 500 kB 경고) |
> | 로컬 UI | `scripts/achievement-display-smoke.mjs` **15/15** — `Lv.1 → Lv.3 (+2)` · 1:1 유지 승자(해금 1) 5953ms / 패자(해금 0) 3986ms · 페이지 오류 0 |
> | 16b-r | SQL Editor용 `scripts/16b-r-retro-dryrun.sql` · `-apply.sql` (본문 동일 — `tests/retroScripts.test.js`). 1:1·그룹은 이동 이벤트 있는 결과만 근거(판정 8 확장, 제외 수는 보고에 따로 — 최종 확정은 운영 수치 후). 로컬 fixture **해금 26 · XP 780 · 제외 1:1 7·그룹 1 · apply = dry-run · 재실행 0 (멱등)** · 143명 규모 4.6초. 제외 규칙의 한계 `16-HANDOFF.md` §9.4. 운영 미실행 |
>
> **다음:** `main` push(사용자) → 운영 확인 → 16b-r 운영 dry-run(SQL Editor) → 제외 규칙 최종 확정 → apply(건별 승인).
>
> **16d 판정 5건 기록 (2026-10-03)** `[사용자 결정]` — 배지 kind 폐지 ((a) kind 갱신, 11개 → 아이콘 7 · 칭호 4) · 순서 16b-r apply → 16d · 프레임 I/II/III/special과 경로 색상은 확정 팔레트 5색 기준 · 1:1은 승자 카드에 완주 효과만 · 히든 아이콘 불투명 파일명. 전문 **`16-HANDOFF.md` §10.** 나머지 16d-0(TRACKS·계약 정정·`DESIGN-SYSTEM.md`)은 16b-r apply 후.

> # ⚑ 2026-10-03 (14) — **16a·16b 운영 적용 완료 — 업적 지급 시작. main push 없음 (DB 전용)** `[사용자 실행·확인]`
>
> | 단계 | 결과 |
> |---|---|
> | 백업 → `db push` | migration 2개 `20261002090000`(16a) · `20261002100000`(16b) 적용. **운영 23 = 저장소 23** |
> | 검증 쿼리 | 전부 기대값 `[사용자 확인]` |
> | 운영 스모크 | 싱글 1회 이동 완주 → 결과 **+15** · 누적 **75 = 15 + 첫 도착 30 + 한 칸이면 충분해(히든) 30**. 프로필 편집기 배지에 「첫 도착」「한 칸이면 충분해」 |
> | 결과 화면 업적 표시 | **없음 — 16c 대상** (`get_result_achievements_v1`은 있으나 화면이 아직 부르지 않는다) |
>
> 배포 전 관문(로컬): `db reset --local` 23개 재생 · pgTAP **1044/1044** — `16-HANDOFF.md` §7.3. **16a·16b 완료.**
> **기존 사용자의 과거 기록은 아직 반영되지 않았다** — 누적형 소급은 16b-r(운영 데이터 쓰기, 건별 승인). **다음:** 16b-r → 16c.

> # ⚑ 2026-10-03 (13) — **16b 완료 (로컬) — 사건 연결: 판정기 21종 + 트리거 4개.** → 운영 적용은 (14)
>
> 범위·구조·구현 판정 전문은 **`docs/agent/16-HANDOFF.md` §7**. 시드 23개 전부가 판정된다(일반 13 · 히든 10). 결과 3테이블 + 장착 AFTER 트리거(`trg_record_*`, 15c `trg_grant_*` 뒤) · 2중 격리 · 재실행 RPC `public.evaluate_result_achievements_v1`(service_role) · 그룹 잠금 user_id 순.
> **§1.1에 없던 기본값 11개 — 승인 (2026-10-03)** (`16-HANDOFF.md` §7.2: 되돌리기 성공 = 상대 강제 이동을 되돌린 것 · 끝까지 함께는 닫히기 전 완주 · 히든 "승리" = 정상 완주 승리 등).
>
> | 커밋 | 내용 |
> |---|---|
> | `f684a46` 16b-1 | migration **`20261002100000_achievement_triggers_v1.sql`** 판정기 — `private.achievement_value_v1`(21 evaluator) · 사용자/결과 러너 · `user_achievement_marks` · 재실행 RPC |
> | `e122bfd` 16b-2 | 같은 파일에 트리거 4개 + 바깥 격리 · 기존 pgTAP 2파일 단언 조정(16a inert · 15c 결과 XP 합계) |
> | `d2c139a` 16b-3 | pgTAP `supabase/tests/achievement_triggers_v1.sql` **127건** |
>
> | 검증 (로컬 스택 `wiki-packet13-r2-clean158`, 2026-10-03) | 결과 |
> |---|---|
> | migration | **`db reset --local` 23개 전체 재생 통과** |
> | pgTAP | 신규 **128/128** · 전체 **1044/1044** (916 + 128), reset 후 재실행, `not ok` 0. reset 직후 시간 의존 fixture 1건을 고쳤다 (`16-HANDOFF.md` §7.3) |
> | 음성 대조 | 트리거 4개를 끈 사본 → **76/127 실패**(양성 단언 전부). 사본은 커밋하지 않았다 |
> | 격리 3경우 | 정의 1개 파손 · 판정 전체 예외 · XP 예외 — 셋 다 경기 커밋, 영향은 그 범위만. XP는 재실행 RPC가 보충 |
> | 로컬 스모크 | 싱글 첫 완주 → 첫 도착 해금 + 30 XP + `badge_first_arrival` (pgTAP §2.1, 실제 `apply_single_move_v2`) |
> | 동시성 (pwsh 7.6) | `duel_item_concurrency_v3` 3×5 PASS · deadlock 0 · `server_authority_concurrency_v2` PASS · `group_final_gaps_v13_hardening_concurrency` **8/8** |
> | `npm test` | **422/422** (JS 변경 없음) |
>
> **기본값 11개 승인** `[사용자 결정, 2026-10-03]`. 16a·16b는 DB 전용 — **main push 불필요, 사용자가 `db push`만 한다.** **다음:** 16a+16b 운영 적용(사용자 실행) → 16b-r 소급(건별 승인, `16-HANDOFF.md` §7.4에 필요한 소급 분기 기록) → 16c 표시.

> # ⚑ 2026-10-02 (12) — **16a 완료 (로컬) — 업적·보상 서버 기반. 트리거 없음(inert). 운영 미적용**
>
> **판정** `[사용자 결정, 2026-10-01 — 16 계획 판정]` 전문은 **`docs/agent/16-HANDOFF.md` §1**. 범위: 31개 중 **시드 23(일반 13 · 히든 10) · 보류 6 · 제외 2** (§2).
> C1 개정(`reward_catalog.listed`) 승인 · X1 3개·튜토리얼·`hidden_redirect`·`hidden_swap_win` 보류 · 히든 표시 `발견 n / ??` · 단일 단계 XP 30 · 소급은 누적형만(16b-r 건별 승인) · `active=false` 장착은 막지 않음.
>
> | 커밋 | 내용 |
> |---|---|
> | `bae36ac` | `TRACKS.md` §1.1-e(16 소유권 예외) · §2.4(파일명 예약) · §8-16(티켓) 등재 (R10) + `16-HANDOFF.md` 판정 |
> | `a8eda5a` 16a-1 | migration **`20261002090000_achievements_rewards_v1.sql`** — `reward_catalog.listed` + 정책 교체 · 신규 8테이블(RPC 전용, 권한 0) · 시드 23 업적 / 39 단계 / 39 번들 / 44 보상(히든 15 비공개) · 지급 파이프라인 `private.apply_achievement_value_v1`·`private.unlock_achievement_v1` · 읽기 RPC `get_my_achievements_v1`·`get_result_achievements_v1`·`mark_achievements_seen_v1` |
> | `c6172fd` 16a-2 | pgTAP `supabase/tests/achievements_rewards_v1.sql` **145건** — §6이 G5 음성 스위트 |
> | `b1950d5` 16a-3 | `C1-REWARD-TABLES.md` §1.1 개정 · §4.1/§5 `active=false` 확정 · `16-HANDOFF.md` §3 **보상 할당표 초안** · §4 G5 구조 · §5 16b/16c 인터페이스 |
>
> | 검증 (로컬 스택 `wiki-packet13-r2-clean158`, 2026-10-02) | 결과 |
> |---|---|
> | migration | `migration up --local` 적용 — 로컬 이력 **22** (기준 `a8eda5a`) |
> | pgTAP | 신규 **145/145** · 전체 **916/916** (기존 771 불변 + 145), `not ok` 0 (기준 `c6172fd`) |
> | G5 음성 대조 | 누출 2건 주입한 사본에서 **3건 실패** — 테스트가 누출을 잡는다 |
> | `npm test` | **422/422** (기준 `c6172fd`, JS 변경 없음) · build는 JS 변경이 없어 재실행하지 않았다 |
>
> **2026-10-03 판정** `[사용자 결정]`: ① 보상 할당표 **승인** — 임시 표시명은 `PACKET-CONTRACT-GAPS.md` §4.5.1 발명 목록 ② 「이어지는 발걸음」은 **원문대로 누적**(스트릭 제안 철회) — 하루 1코스에서 「오늘도 탐험」과 같은 수를 세고 3코스 재개 시 분리된다 (`16-HANDOFF.md` §1.1) ③ **migration 무수정** ④ **16b 착수.**
> **운영 적용은 16b와 묶는다** `[사용자 결정, 2026-10-03]`. 적용 자체는 건별 승인 (`AGENTS.md` §1).

> # ⚑ 2026-10-01 (11) — **14c 완료 · 운영 배포 · main push #11 (`bc2b46f..34af554`)**
>
> **구현:** `3d027ba`(서버) → `f3ab081`(클라이언트) → `21c2afb`(구독 연결 보정·스모크).
> 방장 `room_players.target_*`를 공통 목표로 공개하고 READY를 제거했다. START는 방장 목표 + 2명,
> 랜덤 → 본문 → `ensureWikiSnapshot` **반환 identity**를 전달한다. 새 4인자 START는 정확한 스냅샷의 canonical 시작 제목을 사용하고 목표를 양쪽에 복사한다.
> 근거: `docs/agent/14C-HANDOFF.md` · `TRACKS.md` §8-14c · `supabase/migrations/20261001100000_duel_host_target_v2.sql` `[코드·산출물]`.
>
> | 검증 | 결과·측정 기준 (모두 2026-10-01) |
> |---|---|
> | pgTAP | **771/771**, `server_authority_v2` **129/129** — `42a3df3` + 14c-1 미커밋 작업 트리(→ `3d027ba`). TAP 없는 기존 hardening preflight 파일은 분리해 10개 스위트를 실행 |
> | Node·빌드 | **422/422** · `npm run build` exit 0 — 구현 시 `f3ab081` + 14c-3 작업 트리(→ `21c2afb`); **통합 기록 세션에서 `21c2afb` + 문서 전용 작업 트리로 재실행하여 동일 결과 확인**. 기존 500 kB 번들 경고 유지 |
> | 로컬 2계정 UI | **30/30** — `f3ab081` + 14c-3 미커밋 작업 트리(→ `21c2afb`). 비아이템/아이템 · 목표 변경/Realtime · 저장 실패/퇴장 START 차단 · 정확한 공통 시작/목표 · F5/새 로그인 · 실제 링크 이동/완주/양쪽 결과 |
> | 로컬 DB·불변식 | migration **21**, 최대 `20261001100000`, 구 START 없음·새 START 1개 — `f3ab081` + 14c-3 작업 트리. 그룹 함수/공유 helper/기존 그룹 테스트·기존 migration·그룹/싱글/아이템/XP 소스 불변 |
>
> **배포 중단 창 — 운영 DB 적용 완료부터 새 프론트 배포 완료까지:**
> migration은 **`start_duel_room_v2(uuid)`를 삭제**하고 `start_duel_room_v2(uuid,text,text,text)`로 교체한다.
> **이 구간에는 옛 프론트의 1인자 START 호출이 실패한다.** 옛 guest READY도 host-only setter에서 `DUEL_HOST_ONLY`로 거부된다.
> 호환 overload·md5 fallback은 없다. **main push 직후가 아니라 Vercel의 새 번들 배포 완료까지가 중단 창**이며,
> 배포 완료 후에도 이미 열린 탭의 옛 번들은 남을 수 있으므로 **기존 대기실은 새로고침하여 새 프론트로 다시 진입**해야 한다.
> 이미 starting/playing인 방의 공통 시작·초기화 RPC 계약은 유지한다 `[코드: 위 migration, 기존 initialize_duel_player_v2]`.
>
> **배포 실행·운영 확인 (2026-10-01, 기준 `34af554`):** 사용자 `db push`로 14c migration `20261001100000` 적용 → 사용자 `main` push **#11 `bc2b46f → 34af554`** → **방장 목표 선택 · READY 없음 · 1:1 정상 진행** `[사용자 실행·확인]`. **14c 완료, 남은 구현 트랙: 16.**
>
> **실제 중단 창:** DB 적용 후 main push가 늦어져 옛 번들이 새 DB에 붙었다. 사용자가 **게스트 READY의 `DUEL_HOST_ONLY` 거부**를 직접 관찰했다. 원인은 **feat push만 하고 main push 누락**, Vercel **Preview를 프로덕션으로 오인**한 것이다 `[사용자 보고]`.
> **교훈:** DB 적용 후 main push 확인은 **`git ls-remote origin refs/heads/main`**으로 한다. **Vercel 목록의 Preview는 feat 브랜치다.** 원격 main 반영 확인 뒤 프로덕션 새 번들 배포 완료와 운영 흐름까지 확인한다.
> **미검증:** 기존 로컬 스모크의 Wikipedia/snapshot 응답은 고정 픽스처이며 실제 Wikipedia 랜덤·Edge 외부 호출 검증은 별도로 기록되지 않았다.

> # ⚑ 2026-10-01 (10) — **17b 완료 · 운영 배포 — 백업 → migration `20261001090000` → `main` push #10 (`dee9497..bc2b46f`). 운영 20 = 저장소 20** `[사용자 실행·확인]`
>
> | 단계 | 결과 |
> |---|---|
> | 백업 | `20261001-1555` `[사용자 실행]` |
> | 운영 migration | `db push` — `20261001090000_c1_reward_tables_v1.sql` 1개 적용 `[사용자 실행·검증]` — **migrations 20 · `reward_catalog` 6 · `user_reward_inventory` 858 = 프로필 143 × 기본 아이콘 6** |
> | 배포 전 검증 (기준 `bc2b46f`, 2026-10-01 push 직전 재실행) | `npm test` **413/413** · `npm run build` exit 0 `[산출물]`. 로컬 pgTAP 739/739 · 2계정 UI 스모크 20/20은 아래 (9) 상자 |
> | push | `origin/feat/group-final-gaps` `595cf87..bc2b46f` → `origin/main` `dee9497..bc2b46f` (fast-forward). push 후 `git ls-remote`로 `main = feat = bc2b46f` 확인 `[산출물]`. 14c 준비 문서 `595cf87`이 함께 올라갔다(문서, 앱 영향 없음) |
> | 운영 확인 | **프로필 꾸미기 아이콘 6종 표시 · 장착 · 랭킹 행 반영** `[사용자 확인, 2026-10-01]` |
>
> **17b 완료.** 남은 순서 **14c → 16** (`TRACKS.md` §1.1-c). **계약 반영 완료** — 아래 (9) 상자의 "통합 시 계약 반영 항목"을 이번 문서 커밋에서 `docs/contracts/C1-REWARD-TABLES.md`(§0.1·§1·§3.1·§4·§5)·`C5-PROFILE-CARD.md`(§2·§2.1·§4·§6)에 반영했다 `[사용자 지시 — 통합 세션]`.

> # ⚑ 2026-10-01 (9) — **17b 구현 완료 (로컬) — C1 보상 3테이블 + 장착 UI** (→ (10)에서 운영 배포)
>
> **판정** `[사용자 결정, 2026-10-01]`: C1-① 번들 = 16 소유 · ② retired 장착 유지(신규 장착만 `REWARD_RETIRED`) · ③ kind↔slot = RPC 검증 ·
> ④ 기본 아이콘 **6종** `icon_default_{compass,book,globe,lantern,map,quill}`, `system_default`로 전원 지급(backfill + `profiles` AFTER INSERT 트리거), 임시 SVG `public/profile-icons/*.svg` ·
> **배치 RPC `get_profile_cards_v1(uuid[])` 추가** (C1 §4 밖 — 통합 시 계약 반영, `docs/contracts` 무수정) · 그룹 대기실 칭호는 실시간 배치 조회(스냅샷 DDL 없음) · legacy 업로드 UI 제거(값은 fallback 유지).
>
> | 항목 | 결과 (기준 `dc388d9`, 2026-10-01, 로컬 스택 `wiki-packet13-r2-clean158`) |
> |---|---|
> | migration | `20261001090000_c1_reward_tables_v1.sql` — `npx supabase migration up --local` 적용, 로컬 이력 **20행** · 카탈로그 6행 · backfill 24행(프로필 4 × 6) `[산출물]` |
> | pgTAP | 신규 `c1_reward_tables_v1` **96/96** · 전체 **739/739** (기존 643 불변 + 96), `not ok` 0 `[산출물]` |
> | 17b-2a | `services/profileRewardService.js`(카드 단건·배치 · 보유 목록 · equip/unequip) + `utils/profileCard.js` 매핑(`cardFromServer`·`mergeRewardSlots`·`applyEquipment`). `tests/profileRewards.test.js` **15건** · `npm test` **409/409** (394 + 15, 기준 `ee99197` + 미커밋 작업 트리) `[산출물]` |
> | 17b-2b | `components/ProfileRewardEditor.jsx`(슬롯 행 7 · `<details>` 접힘 · 44px 대상 · 서버 응답만 반영) · ProfilePage **업로드 UI 제거**(`profile_image_url` 읽기는 유지) · `public/profile-icons/*.svg` 6장 · 프레임·배경 표시 + SR 이름. `npm test` **412/412** · build exit 0 (기준 `7f748e6` + 미커밋 작업 트리) `[산출물]` |
> | 17b-2c | `hooks/useProfileCards.js`(사용자 집합이 바뀔 때만 배치 1회) — 랭킹 두 표 · 그룹 대기실 두 지점 · 모달(단건)에 `mergeRewardSlots`. `GroupGamePage`(동결) 미변경. `npm test` **413/413** · build exit 0 (기준 `afd0e7b` + 미커밋 작업 트리) `[산출물]` |
> | 로컬 2계정 UI 스모크 | **20/20** (Playwright, 로컬 Vite + 로컬 스택, 기준 `afd0e7b` + 17b-2c 미커밋 작업 트리) — 신규 가입 트리거 아이콘 6 · 미보유 장착 `REWARD_NOT_OWNED` · 직접 insert 42501 · 업로드 UI 없음 · 아이콘·칭호·배지 장착 표시 · **새로고침·재로그인 복원** · 랭킹에 상대 아이콘·칭호(배지 숨김) · **랭킹 RPC = `get_profile_cards_v1` 1회, 단건 0회** · 모달 FULL · 그룹 대기실 방장 행 칭호 · 게스트 편집기 없음 · 콘솔 오류 0. 픽스처는 실행 후 삭제(잔여 0) `[산출물]` |
> | **pgTAP 재실행 필요 없음** | 17b-2는 DB 변경 0 — 전체 **739/739**는 17b-1 기준 그대로 |
>
> **통합 시 계약 반영 항목** (`docs/contracts`는 이 트랙에서 무수정 → **(10)에서 반영 완료**):
> C1 §4에 **`get_profile_cards_v1(uuid[])`** 추가(상한 100, `TOO_MANY_USERS`) · C1 §5 확인 필요 ①~④ → 위 판정으로 해소 · RewardRef에 `kind`·`slotIndex`·`retired` 덧붙음(C5 §2) ·
> C5-② 해소(대기실 실시간 배치, 스냅샷 DDL 없음) · C5-④ 부분 해소(임시 SVG 6장 — 최종 아트는 디자인 단계).
> **알려진 한계:** 칭호·배지·프레임·배경은 운영 시드가 없어 지급(16) 전까지 편집기 목록이 비어 있다. `active=false` 보유 보상의 장착은 막지 않는다(C1에 코드 없음). 1:1 화면(`RoomPage` 등, C 소유)은 미적용.
>
> **다음:** ① 운영 migration `20261001090000` 적용 — **건별 승인 필요** (`AGENTS.md` §1) ② 그 뒤 `main` push — **건별 승인 필요** (§1.1). **프론트를 먼저 올리면 운영에 RPC가 없어 카드 보상 조회가 실패한다**(화면은 legacy 표시로 떨어지지만 편집기는 동작하지 않는다) — 순서는 migration → push. 이후 순서 **14c → 16**.
>
> **운영 DB 미접근.** 17b 구현·운영 반영은 아직 완료로 표시하지 않는다.

> # ⚑ 2026-10-01 (8) — **당시 14c 준비 기록 — 위 (11)에서 로컬 구현 완료, 운영은 미적용**
>
> **결정** `[사용자 결정, 2026-10-01]`: (a) 방장이 목표 검색·선택 → 상대에게 즉시 공개 → 방장 START.
> 참가자 2명 + 방장 목표 존재만 요구하며 READY·각자 목표 일치 검사는 폐기한다. 시작은 **START 직전 가져와 스냅샷한 랜덤 identity**를 시작 RPC에 전달한다. 숨김·동시 공개는 (b) 후보 풀 서버 선택 재검토 때의 보류 항목이다.
>
> **티켓 판정:** 목표 저장은 **방장 `room_players.target_*` 재사용**(새 방 목표 컬럼 없음). START에서 방장 목표를 양쪽에 정규화·복사한다.
> 현 `start_duel_room_v2`는 1인자이며 시작 인자가 없고, 무시되는 `p_start_*`는 초기화 RPC 쪽이다. 14c는 시작 RPC에 필수 시작 identity 인자를 추가하고 구 시그니처를 교체한다 (`TRACKS.md` §8-14c).
>
> | 이번 준비 문서 | 내용 |
> |---|---|
> | `01-CONFIRMED-SPEC.md` | §0 정정 이력 · §4 공통 목표/READY 없음/랜덤 시작 · §12 숨김 보류 |
> | `MOBILE-VALIDATION-CORRECTIONS.md` | §8 — 모바일 §04는 레이스(대기실 아님), Freeze v1 `03-09`는 READY 없음·방장 START 일치, 목표 선택·표시는 보강 대상 |
> | `TRACKS.md` | 9차 갱신 · **17b → 14c → 16** · §8-14c 티켓/저장 판정/RPC 계약/기존 pgTAP 교체 목록 · 1:1 세션 함수만 동결 예외 |
>
> **검증 범위 (기준 `29eb3e6` 위 문서 작업 트리, 2026-10-01):** 소스·시안 template JSON·기존 테스트 정적 대조, 문서 diff/참조/변경 범위 검사.
> `server_authority_v2.sql` assertion **97개는 정적 개수**이며 DB 테스트 실행 결과가 아니다. #30·#34·#35는 호출/의미 교체, #29·#36은 기존 불변식 유지 대상으로 티켓에 명시했다.
> **코드·migration·시안 HTML 변경 없음, 운영 DB 미접근. npm/빌드/pgTAP/UI 실행 검증은 14c 구현 때 한다.** 14c 구현·운영 반영은 완료로 표시하지 않는다.
>
> **남은 순서: 17b → 14c → 16.** `main` push 이력은 #9 그대로이며 이번 문서 백업은 feat 전용이다.

> # ⚑ 2026-10-01 (7) — **14b 운영 배포 완료. 운영 19 = 저장소 19, 차이 0** `[사용자 실행·확인]`
>
> | 단계 | 결과 |
> |---|---|
> | 백업 | `20261001-1135` |
> | `db push` | `20260930100000_duel_item_link_index_v3.sql` 1개. 검증: **migrations 19** · `duel_item_grants_item_id_check` **11종 (`link_index` 포함)** |
> | **`main` push #9** | **`4719100..dee9497`** — 10커밋 (코드 6: `4dba85e`·`ef6c806`·`7040c4c`·`2579ada`·`50485ef`·`ffabdc0` + 문서 4). **migration 적용·검증 뒤** 실행. push 후 `git ls-remote`로 `main = feat = dee9497` 확인 `[산출물]` |
> | 배포 전 검증 (기준 `50485ef`·`ffabdc0`) | `npm test` 394/394 · build exit 0 · pgTAP 643/643 · 로컬 2세션 UI 스모크 21/21 (아래 (6) 상자) |
> | 운영 확인 | 빠른 링크 블록 제거 · 1:1 **링크만 보기** 동작 · **링크 검열** 동작 |
>
> **14b 완료.** 당시 남은 트랙 순서는 **17b → 16** → **14c 추가 후 17b → 14c → 16** (위 (8) 상자 · `TRACKS.md` §1.1-c). 열린 부채: 링크 검열 서버 미강제(Q1) · 링크 0개 사용 불가의
> 클라이언트 전용 검사(Q3) · 발명 문구 3건(`PACKET-CONTRACT-GAPS.md` §4.6).

> # ⚑ 2026-09-30 (6) — **14b 구현 완료 — ~~`feat` 전용, 운영 미적용~~ → 운영 배포 (7)** (`4dba85e`·`ef6c806`·`7040c4c`·`2579ada`·`50485ef`)
>
> **Q1~Q5 전부 기본값** `[사용자 결정, 2026-09-30]`. 검증 (기준 `50485ef`, 2026-09-30): `npm test` **394/394** (370 → +24) · build exit 0 ·
> **pgTAP 전체 643/643** (634 → +9, 로컬 스택에 `20260930100000` 적용 후) · **2세션 UI 스모크 21/21** — 검열 회색 집합이
> **본문 = 색인 = 서버 `censoredTitles` ∩ 화면 링크**로 양쪽에서 같았다 · 검열 링크 클릭 무반응 · 20초 닫힘 · 이동 시 닫힘 · 먹물 덮개.
> 불변식: `GamePage.jsx`·`GroupGamePage.jsx` diff 0 · 기존 migration diff 0. 상세·커밋별 수치는 **`TRACKS.md` §8-14b 완료**.
>
> **새로 확인된 것:** ① 서버 검열 집합(스냅샷 링크)과 화면 링크 집합은 **다르다** — 화면에서 실제로 회색이 되는 비율은 43~48%.
> 고치지 않고 기록만 한다 ② **부채 등재 (Q1)** — 링크 검열은 클라이언트만 막는다. 서버 이동 RPC가 검열 이벤트를 안 본다. 우회 가능하나
> 6초짜리 방해 아이템이라 영향이 작다 ③ ~~`PublicContentPage.jsx:44` 가이드가 여전히 "빠른 이동 링크"를 안내한다~~ → **닫힘 (`ffabdc0`, 2026-10-01)** — "첫 문단의 본문 링크"로 바꿨다 `[사용자 지시]`. `npm test` 394/394 · build exit 0
> ④ 새 발명 문구 3건(`필터` 등) — `PACKET-CONTRACT-GAPS.md` §4.6.
>
> **다음:** 운영 반영은 **migration `20260930100000` 적용 → 검증 → `main` push #9** 순서이며 각각 건별 승인이다. 그 뒤 17b.

> # ⚑ 2026-09-30 (5) — **14b 준비: 빠른 링크 아이템화 — 스펙 정정 + 티켓. 코드 변경 0 · DB 변경 0**
>
> **결정** `[사용자 결정, 2026-09-30]`: 게임 화면의 **빠른 링크 블록을 세 모드 전부에서 뺀다** — 본문이 온전히 렌더되는 지금은
> 기본 기능으로 둘 근거가 없다. 그 역할은 **1:1 탐색 아이템 `link_index`(링크만 보기)** 가 맡는다 — 현재 문서 링크 전부를
> 가나다순 상자로, 필터 포함, 클릭 = 일반 이동, 이동 시 닫힘, 최대 20초. **링크 검열은 (가)** — 본문 50%(최소 2개 남김)
> 6초 회색·클릭 불가, 열린 색인에도 회색. 활성 카탈로그 **10 → 11**, 탐색 **2 → 3**. `search_once`와 공존한다.
>
> | 이번 커밋이 바꾼 문서 | 내용 |
> |---|---|
> | `01-CONFIRMED-SPEC.md` | §0 정정 이력 2026-09-30 행 · §2 빠른 링크 두 줄 취소선 · §5.2 검열 (가) · §5.3 `링크만 보기` 행 |
> | `code/14-DUEL-ITEMS.md` | 머리 정정 상자 · §2 카탈로그 행 · **§4 매트릭스 행 + `link_index` 상호작용 표** · §6 검열 표시 |
> | `docs/design/MOBILE-VALIDATION-CORRECTIONS.md` | **§7 신설** — 모바일 §04·§05·§08과 Freeze v1 게임 공통 화면(`04-01`~`04-04`) 외 11화면의 빠른 링크 요소를 제거 대상으로 등재. 시안 HTML은 무수정 |
> | `docs/agent/TRACKS.md` | 8차 갱신 · §1.1-c 순서 **14b → 17b → 16** · §2.1 `WikiViewer.jsx` 14b 한정 동결 해제 · **§8-14b 티켓** |
> | `AGENTS.md` | §1.1 push 이력 **#8** 반영 (여섯 번 · `#3~#8`) · **§7에 규칙 추가** — `CURRENT.md` §3 push 이력이 바뀌면 §1.1 건수·번호를 같은 커밋에서 맞춘다, 통합·배포 기록 세션은 이 항목에 한해 `AGENTS.md`를 고칠 수 있다 `[사용자 결정]` |
>
> **티켓을 쓰다 확인한 사실 — 결정문의 전제와 코드가 다른 곳** (`TRACKS.md` §8-14b 실측 표, 기준 `db33aa8`) `[코드]`:
> ① **본문에는 지금 검열이 전혀 적용되지 않는다** — `MultiplayerGamePage.jsx:1623`이 `pageData.links`를 거르지 않고 넘기고,
> `censoredTitles`는 미리보기 패널만 읽는다. "배열에서 제거하는 방식"은 코드에 없다.
> ② **검열 링크를 눌러도 `LINK_NOT_ALLOWED`가 나지 않는다** — 1:1 이동 RPC가 검열 이벤트를 보지 않는다. (가)는 클라이언트만 막는다.
> ③ 서버 검열 분기는 **스냅샷 링크 전체**에서 고른다 — 전제대로다. 클라이언트 `pageData.links`와 같은 집합인지는 `확인 필요`.
> ④ **서버 변경은 카탈로그만으로 끝나지 않는다** — `duel_item_grants_item_id_check`가 10개 ID를 열거한다. CHECK도 교체해야 한다.
> ⑤ 먹물 오버레이가 **빠른 링크 블록 안에서** 렌더된다 — 블록을 통째로 지우면 싱글·1:1 먹물이 함께 사라진다.
>
> **상태:** ~~14b **착수 전.**~~ → **구현 완료 — 위 (6) 상자.** 착수 전 질문 Q1~Q5는 전부 기본값으로 확정됐다. **운영 DB 미접근.**

> # ⚑ 2026-09-30 (4) — **오늘 코스 버튼 fallback 경합 hotfix — `3693dd7`, `main` push #8로 운영 배포 완료**
>
> **결정** `[사용자 확정]`: (가) 초기값에서 fallback을 빼고 로딩 상태를 둔다 · 문구 `오늘의 탐험을 불러오는 중…`(발명 4번, GAPS §4.5) · G14는 무변경 · `MainPage.jsx` 오늘 코스 블록 1회 예외(`TRACKS.md` §1.1-d).
>
> | 검증 (2026-09-30, `3693dd7` 커밋 직전 작업 트리, 로컬 스택) | 결과 |
> |---|---|
> | `npm test` · `npm run build` | **370/370** (+5 `tests/dailyChallengeReady.test.js`) · **exit 0** |
> | 로컬 Playwright | **8/8 PASS** — ① RPC 3초 지연: 로딩 문구·버튼 비활성·`aria-busy`, 로딩 중 클릭 무반응, 조회 후 DB 코스 `GPT (언어 모델)`·활성, **시작된 런의 목표 = 오늘 코스** ② RPC·select 모두 실패: fallback `축구` 표시·플레이 가능(기존 동작 보존) ③ 게스트: ①과 같은 게이트. 정리 후 스모크 사용자·런 0 |
>
> **변경 범위:** `pages/MainPage.jsx` 1파일 + 테스트 1파일. **DB 변경 0.** 이 hotfix가 닫는 것: (3) 상자의 "hotfix 대상" · (2) 상자의 관찰 2번.
>
> | 운영 확인 (2026-09-30) `[사용자 확인]` | 결과 |
> |---|---|
> | `main` push #8 | **`ec7b6fa..4719100`** (코드 1 + 문서 3) — 이 세션이 실행, `[사용자 승인]`. push 후 `main = feat = 4719100` 확인 |
> | 로비 | `오늘의 탐험을 불러오는 중…` 표시 후 코스명으로 전환 |
> | 오늘 코스 완주 | **`+25 XP 오늘의 탐험 코스 최초 완주` — 운영 첫 25 지급** |
> | (3) 상자의 첫 `+15` | **직접 입력(목표 지정)으로 시작한 판이었다 — 분류가 정확했다.** fallback 경합의 운영 발생 사례는 아니다 |

> # ⚑ 2026-09-30 (3) — **15b·15c 운영 배포 완료. 운영 18 = 저장소 18, 차이 0. 첫 운영 XP 지급 확인** `[사용자 실행·보고]`
>
> | 단계 | 결과 |
> |---|---|
> | 백업 | `backup/*-20260930-1108` (파일명 기준, 크기 미보고) |
> | `db push --linked` | **`20260929090000` → `20260930090000` 2개 적용.** `20260929090000` §0 가드(C3 §6 불변식) **통과** |
> | 검증 | migrations **18** · 트리거 **3** · `profile_level`·`grant_result_xp_v1` **존재** |
> | **`main` push #7** | **`7e90b7a → ec7b6fa`** — 15b(`777ecdf`·`fd6f916`) + 15c(`d12ce5e`·`47577ae`) + 문서. Vercel 프로덕션 배포 트리거. 배포 전 검증: pgTAP 634/634 · 그룹 동시성 8/8 · `npm test` 365/365 · build exit 0 · 로컬 UI 스모크 9/9 |
> | 운영 스모크 | 싱글 완주 → **`+15 XP 목표 지정 탐험 최초 완주` · `15 / 100 XP`** — **운영 첫 XP 지급** |
>
> **보고되지 않은 항목 (미확인):** 검증 쿼리 ④ 권한 · ⑤ C3 §6 불변식 · ⑥ 감쇠 값 · `public` 함수 수 · 운영 스모크 중
> **1:1 완주 XP · 프로필 Lv · 랭킹 XP 탭**. 이 네 줄은 다음 기회에 확인한다. **이 세션은 운영 DB에 접속하지 않았다.**
>
> **새 관찰 (등재만, 정리 여부는 별도 판단)** `[사용자 관찰]`:
> - **O1 — 랭킹에 0~1초 완주 기록이 있다.** `서울8반화이팅` 00:00·00:01, `WwW` 00:01. **cutover 전 legacy 직접 쓰기 시절 데이터로 추정한다** —
>   지금 `game_records`는 `apply_single_move_v2`의 완주 분기만 쓰고(`20260814091000:322`) 클라이언트 쓰기 권한이 회수됐다(`20260814093000:6` `revoke insert, update, delete … from anon, authenticated`) `[코드]` — INSERT 정책 2개는 남아 있지만 grant가 없어 쓰이지 않는다 (로컬 `role_table_grants` 실측).
>   **서버 권위 이후 신규 생성은 불가능하다고 판단**하지만 행의 `run_id`·`created_at`으로 **legacy 여부를 실측하지는 않았다** `확인 필요`. 삭제는 `AGENTS.md` §4 대상 — 판단 전까지 손대지 않는다.
> - **O2 — `game_records`에 `anon`·`authenticated`의 `TRUNCATE` 권한이 남아 있다** (로컬 실측, 2026-09-30). baseline의 `GRANT ALL`이 남긴 것이고
>   `20260814093000:6`은 insert/update/delete만 회수했다. **PostgREST는 TRUNCATE를 낼 수 없어 클라이언트 경로는 없다** `[추정]`. 운영 값은 미확인 `확인 필요`. 등재만.
>
> **hotfix 대상으로 격상:** 15c-2 스모크의 **오늘 코스 버튼 fallback 경합** — 조회 완료 전 클릭하면 fallback 키워드로 시작해 **25가 아니라 15를 받는다**
> (아래 (2) 상자). 운영에 배포됐으므로 **실사용자의 XP 손해가 이제 가능하다** `[사용자 결정]`. 대상 파일 `pages/MainPage.jsx`(B, 오늘 코스 블록 — §2.2 범위 밖 규칙의 예외가 필요) · 착수 전 계획 보고.

> # ⚑ 2026-09-30 (2) — **15c 완료·feat 커밋.** ~~배포 대기 — migration 2개(`20260929090000` → `20260930090000`) + 프론트(15b·15c-2)~~ → **배포 완료 (위 (3) 상자)**
>
> **결정** `[사용자 확정, 2026-09-30]`: migration 없음(기존 RLS로 읽는다) · 레벨업 = "지급 후 현재 레벨 안 XP < 획득량"(공식은 프론트에 두지 않는다) ·
> 표시 위치 = 싱글 `SuccessOverlay`(B) + 1:1 정상 승패 2블록(C) · 1:1 결과 유지 **2200 → 4000ms** · 발명 문구 3건 확정·GAPS 등재 ·
> `appStyles.js`(A) 한 줄 예외 — `TRACKS.md` §1.1-d · 1:1 재조회 후에도 행이 없으면 `console.warn`(roomId).
>
> | 커밋 | 내용 |
> |---|---|
> | **`47577ae`** 15c-2 | 신규 `utils/xpResultDisplay.js`(순수 표시 모델) · `components/ResultXp.jsx` · `css/resultXp.css`(`rxp-`만) · `tests/xpResultDisplay.test.js` **14건**. `xpService.js`에 읽기 2개(`fetchResultXp`·`fetchDuelResultXp`) 추가. `SuccessOverlay`(기록 ▸ **XP** ▸ 경로) · `MultiplayerGamePage` 승/패 카드 · 타이머 4000ms · `duelResultHotfix.test.js` 기준 문자열 갱신 · `appStyles.js` import 1줄 |
>
> | 검증 (2026-09-30, `47577ae` 커밋 직전 작업 트리, 로컬 스택 18 migration) | 결과 |
> |---|---|
> | `npm test` · `npm run build` | **365/365** · **exit 0** |
> | **UI 스모크** (headless Playwright, 로컬 dev, 실제 로그인 세션·실제 RPC·실제 트리거) | **9/9 PASS** — 싱글 오늘 코스 첫 완주 `+25 XP 오늘의 탐험 코스 최초 완주` + `레벨 업! Lv.1 → Lv.2` + `15 / 100 XP` · 오늘 코스 재완주 `같은 코스는 처음 완주할 때만 XP를 받아요`(원장 0행) · 목표 지정 첫 완주 `+15 XP` · 게스트 `로그인하면 XP와 레벨이 저장됩니다` · 1:1 승자 `+50 XP 1:1 정상 승리` + 레벨 업 · 패자 `+25 XP 1:1 정상 패배` `25 / 100 XP` · 결과 카드 약 4초 유지 후 `/multiplayer`. 픽스처 조작은 **런 목표를 현재 문서의 링크로 옮기는 것**과 1:1 방 생성뿐이다. 정리 후 스모크 사용자·방·런 0 |
> | 그룹 동시성 하니스 | **8/8 PASS** — 아래 15c-1 상자 |
>
> **부채 (신규 1건):** **X3 — 1:1 기권·연결 이탈 결과 화면 부재.** 몰수승 30은 지급되지만 그 종료는 결과 화면 없이 복구 경로로 간다(`MultiplayerGamePage.jsx:778-785`). 해소 조건: **디자인 트랙이 결과 화면을 다시 그릴 때** `[사용자 결정]`. (X1·X2는 아래 15c-1 상자)
>
> **스모크가 드러낸 것 2건 (15c-2 결함 아님):**
> - **콘솔 409의 정체 — 재현됐다.** 그날 첫 로비 로드에서 `ensure_today_daily_challenge`가 **409**를 냈다. 동시 호출 둘이 `daily_challenges_challenge_date_key`에 부딪힌 것이다(행이 스모크 중 `01:44:34`에 생성됨). 클라이언트는 fallback select로 **올바른 행을 얻는다** — 기능 영향 없음. 두 번째 실행(행 존재)에서는 나오지 않았다. **15b의 "URL 미포착 409"와 같은 것으로 추정**한다 (URL이 없어 대조는 불가). 같은 첫 실행에서 `game_records` GET **401** 2건도 나왔고 재실행에서 없었다 — 원인 미확인 `확인 필요`.
> - **오늘 코스 버튼의 fallback 경합.** `MainPage`가 `useState(getFallbackDailyChallenge)`로 시작해 조회 완료 전 클릭하면 **fallback 키워드로 게임이 시작된다.** 이제 이것이 XP에 닿는다 — 그 완주는 오늘 코스가 아니라 **목표 지정 15**로 분류된다 (스모크 첫 실행에서 실측). 15c-1 상자의 "알려진 한계"에 있던 경우의 실제 발생 경로다. 소유 B 영역(`MainPage` 오늘 코스 블록은 범위 밖 규칙) — ~~**등재만** `확인 필요`~~ → **hotfix 대상 (위 (3) 상자, 2026-09-30)**.
>
> **배포 전 확인:** migration 2개 운영 적용(건별 승인) → 프론트 `main` push(건별 승인). 트리거는 배포된 번들과 무관하므로 DB가 먼저여도 안전하다.

> # ⚑ 2026-09-30 — **15c-1 완료·feat 커밋. 저장소 18 ↔ 운영 16, 차이 2 (`20260929090000` → `20260930090000` 순서). 15c-2(표시)는 미착수**
>
> **결정** `[사용자 확정, 2026-09-30]`: ① 트리거 방식 — 그룹 **런타임** 예외 승인(파일 동결은 유지, pgTAP 전 스위트로 확인)
> ② 싱글 모드 = **서버 추론** ③ 오늘 코스는 25만(15 중복 없음) ④ 오늘 코스의 날짜 = **완주 시각(KST)**
> ⑤ 1:1 감쇠 카운트 = 기권 포함·cancelled만 제외 ⑥ 소급 없음 ⑦ 실패는 `raise warning`만 ⑧ 15c-1(서버)/15c-2(표시) 분할.
>
> | 커밋 | 내용 |
> |---|---|
> | **`d12ce5e`** 15c-1 | `20260930090000_xp_result_grants_v1.sql` — **AFTER 트리거 3개**(`game_records` INSERT → 싱글 · `match_history` INSERT → 1:1 4경로 · `game_rooms` UPDATE OF status → 그룹 2경로). **finalizer 본문 재정의 0 · drop 0 · 기존 함수 시그니처 변경 0.** 신규: `private.duel_decay_v1` · `private.try_grant_xp_v1`(안쪽 격리) · `private.grant_{single,duel,group}_result_xp_v1` · `private.grant_result_xp_on_write_v1`(바깥 격리) · **`public.grant_result_xp_v1(scope, result_id)`** — 멱등 재지급, `service_role` 전용. pgTAP `xp_result_grants_v1` **100건** · `tests/xpResultGrants.test.js` **8건** |
>
> | 검증 (로컬 스택, 2026-09-30, `d12ce5e` 커밋 직전 작업 트리) | 결과 |
> |---|---|
> | `migration up --local` | `20260930090000` 적용 — 로컬 **18개** |
> | pgTAP 전량 | **xp_result_grants_v1 100/100** · xp_ledger_v1 **153/153** · c4_check_c3 **30/30** · duel_item_authority_v3 **148/148** · server_authority_v2 **97/97** · group_security_phase2c **49/49** · group_final_gaps_v13 **33/33** · group_spectator_emoji_atomicity **22/22** · group_match_lifecycle_phase2a **2/2** — `not ok` **0**. 기존 8개는 적용 전 기준선(`abdc70d`)과 **같은 534/534** |
> | 음성 대조 | 테스트 트랜잭션 안에서 트리거 3개를 끄면 **38건 실패** (롤백) — 테스트가 지급을 실제로 잡는다 |
> | 격리 | 프로필 없는 사용자(`AUTH_REQUIRED`) · 임시 CHECK로 `grant_xp_v1`을 raise시킴(안쪽) · 분류 함수를 raise하게 교체(바깥) — **세 경우 모두 경기 커밋, 원장 0행, `total_xp` 무변동, WARNING 1건씩.** 원인 제거 후 `grant_result_xp_v1`이 **정확히 1회** 지급 |
> | 동시성 하니스 | `duel_item_concurrency_v3` **3시나리오 × 5, deadlock 0** · `server_authority_concurrency_v2` **PASS** · **`group_final_gaps_v13_hardening_concurrency -Scenario all` — 8/8 PASS, exit 0** (pwsh 7.6.6, 2026-09-30, 로컬 18 migration, 기준 `4a0e3d8`): host leave · 결정적 락 순서 4종(hard/grace × finalizer/emoji 선행) · 마감 동일 시각 2종 · 동시 3번째 완주. **FAIL·WARNING·deadlock·cleanup 실패 0.** 6개 방이 `time_limit`/`grace_timeout`으로 종료되며 INVARIANT 유지. 정리 후 그룹 방 0 · C3 §6 불변식 불일치 0. 하니스는 XP를 assert하지 않는다 — 결과 행이 `profiles` FK를 갖고 WARNING이 0이므로 지급이 성공했다고 **추정**한다. **배포 전 필수 조건 충족** `[사용자 지정]`. (처음 1회는 PowerShell 5.1에서 `ProcessStartInfo.ArgumentList`로 픽스처 전 단계에서 멈췄다) |
> | `npm test` · `npm run build` | **351/351** · **exit 0** |
>
> **부채 (신규 2건):**
> - **X1 — 랜덤 탐험 20 XP 미지급.** `single_game_runs`에 서버가 정한 모드가 없어 랜덤/목표 지정을 구분할 수 없다. 오늘 코스가 아닌 완주는 전부 목표 지정 규칙(쌍 최초 15)을 적용하므로 **랜덤 완주가 5 XP 덜 받는다.** 해소 조건: **`run_mode`를 서버가 결정하는 구조로 갈 때** `[사용자 결정]`.
> - **X2 — 그룹 결과 화면 XP 표시 제외.** 지급은 되지만 `GroupGamePage.jsx`가 동결(`TRACKS.md` §2.1)이라 15c-2에서 표시하지 않는다. 해소 조건: 그룹 결과 화면을 소유하는 트랙.
>
> **알려진 한계 (코드 주석에 기록):** 오늘 코스 판정은 `game_records.target_title`과 `daily_challenges.target_title`의 정규화 비교다 — 리다이렉트로 제목이 바뀐 문서나 프론트 fallback 코스는 목표 지정(15)으로 분류된다. "최초"는 **원장 기준**(첫 지급)이며 15c 이전 완주는 세지 않는다(결정 ⑥).
>
> **배포 순서:** `20260929090000` → `20260930090000`. 트리거는 배포된 번들과 무관하게 동작하므로 **DB가 프론트보다 먼저여도 안전하다** — 적용 즉시 지급이 시작되고 표시는 15c-2가 붙인다. **운영 적용·`main` push는 둘 다 건별 승인 대상이다** (`AGENTS.md` §1·§1.1).

> # ⚑ 2026-09-29 — **15b 완료·feat 통합. 저장소 17 ↔ 운영 16, 차이 1 (`20260929090000`). 배포는 15c와 묶는다**
>
> **결정** `[사용자 확정, 2026-09-29]`: ① 누적 출처 = `profiles.total_xp`, `total_xp + amount < 0`이면 원장 행 없이
> `XP_AMOUNT_INVALID` — **단 원장에 이미 있는 키는 `granted:false`가 먼저다** (C2 §7 멱등성, 사용자 승인)
> ② 타인 레벨 = `public.profile_level(profiles)` computed field, 공식은 DB에만 ③ `RankingPage` XP 탭 + `fetchXpRankings`,
> `fetchRankings` 시그니처 불변, 로비 TOP 3 무변경 ④ `total_xp > 0` 필터 + 빈 상태, 탭은 숨기지 않는다
> ⑤ 동점 `created_at asc, id asc` ⑥ A·B 소유 파일 직접 수정 — `TRACKS.md` §1.1-d.
>
> | 커밋 | 내용 |
> |---|---|
> | **`777ecdf`** 15b-1 | `20260929090000_xp_total_v1.sql` — **§0 가드**(C3 §6 불변식 0행이 아니면 `XP_TOTAL_OUT_OF_SYNC`로 전체 중단) · `grant_xp_v1` 교체(프로필 행 잠금, 원장 삽입 시에만 `total_xp += amount`·`updated_at`, 음수 가드) · `get_xp_summary_v1` 컬럼 읽기 · `profile_level` 신설. 시그니처·ACL 불변, 데이터 손실 DDL 0. pgTAP `xp_ledger_v1` 128 → **153** |
> | **`fd6f916`** 15b-2 | XP 탭 · 랭킹 COMPACT Lv · 프로필/공개 프로필 FULL Lv + 진행 막대(`XpProgress`) · 로비 헤더 Lv. `tests/xpTotal.test.js` +13 |
>
> | 검증 (로컬 스택, 2026-09-29) | 결과 |
> |---|---|
> | `db reset` | **migration 17개** 적용 |
> | pgTAP 전량 | xp_ledger_v1 **153/153** · c4_check_c3 **30/30**(무수정) · duel_item_authority_v3 **148/148** · server_authority_v2 **97/97** · group_security_phase2c **49/49** · group_final_gaps_v13 **33/33** · group_spectator_emoji_atomicity **22/22** · group_match_lifecycle_phase2a **2/2** — `not ok` **0** (`777ecdf` 작업 트리에서 측정) |
> | `npm test` · `npm run build` · `supabase:preflight` | **343/343** · **exit 0** · **전 CASE PASS** (`fd6f916` 커밋 직전 작업 트리) |
> | 데이터 스모크 | **15/15** — service_role `grant_xp_v1` → `total_xp` 반영 · 중복 무변경 · 음수 거부 · XP 정렬(동점 `created_at`) · `profile_level` · authenticated의 grant·`total_xp` write **42501** · C3 §6 불변식 **0행** |
> | UI 스모크 (headless Playwright, 로컬 dev) | **7/7** — XP 탭 정렬·Lv · 공개 프로필 Lv + `20 / 125 XP` · 프로필 Lv + `20 / 100 XP` · 로비 헤더 Lv · 시간 랭킹 탭 정상. 첫 실행에 콘솔 409 1건이 있었고 **이후 3회 재현되지 않았다** — 요청 URL 미확인 |
> | §2.3 불변식 | ①③④⑤⑦ 대상 파일 **무편집** · ⑥ 리터럴 증감 **0** (현재 원시 수 33/13/6/12 — 09-06 기록 32/12/6/12와의 차이는 이 변경 밖) |
>
> **남은 관찰:** 콘솔 409 — 15b UI 스모크 첫 실행에서 1회, URL 미포착, 이후 3회 재현 안 됨. 15c 스모크에서 재관찰.
> → **2026-09-30 15c-2 스모크에서 재현 — `ensure_today_daily_challenge`의 그날 첫 호출 경합으로 추정** (위 (2) 상자).
> **미검증:** XP 탭 **빈 상태 화면**(단위 테스트만) · 게스트 헤더(코드 경로만). **`main`은 `7e90b7a` 그대로** —
> 15b는 feat 통합만 했고 **`20260929090000` 운영 적용과 프론트 배포는 15c와 묶는다** `[사용자 결정]`.
> **적용 순서 주의:** 15b 프론트는 `profile_level`·`total_xp`를 select하므로 **migration이 프론트보다 먼저**다.

> # ⚑ 2026-09-28 (4) — **`20260928090000` 운영 적용 완료. 저장소 16 = 운영 16, 차이 0** `[사용자 실행·보고]`
>
> | 단계 | 결과 |
> |---|---|
> | 시각 | **2026-09-28 17:46** (사용자 실행) |
> | 백업 | `backup/schema-20260928-1746` · `backup/data-20260928-1746` (크기는 보고되지 않았다) |
> | `db push` | **`20260928090000` 1개 적용.** ②의 가드 **통과** — `game_records.result_status`에 범위 밖 값 없음 |
> | ③ 권한 | `authenticated` UPDATE 컬럼 = **`{nickname, profile_image_url, updated_at}`** · `anon` **없음** |
> | ④ `total_xp` | **컬럼 존재** |
> | `xp_ledger` | **0행** → **15b의 원장 backfill은 불필요로 확정** `[사용자 확정]` — 전원 `total_xp = 0`이 원장 합계와 같다 (C3 §6 불변식 성립) |
> | 프론트 | **프로덕션 닉네임 저장 성공** (`test1` → `t1`) |
>
> **보고되지 않은 항목 (미확인):** 프로필 **사진 변경** 1회 · 테이블 단위 UPDATE `false` 두 값 · 제약 2개·인덱스 1개의 존재 쿼리 ·
> migration 수 쿼리 출력. "운영 16 = 저장소 16"은 사용자 판정이다. 사진 변경은 닉네임과 같은 grant 경로(`updated_at` 동반)라
> 성공이 기대되지만 **운영 실측은 없다** — 다음 기회에 1회 확인한다.
> **`main`은 `7e90b7a` 그대로다** — 이번 변경은 DB와 문서뿐이라 프론트 배포가 필요 없다.

> # ⚑ 2026-09-28 (3) — **오늘 3코스 범위 제외. 남은 DB 변경 3건을 일반 migration으로 준비했다**
>
> **결정** `[사용자, 2026-09-28]`: 확정 스펙 §3.3 "매일 세 개의 코스" → **하루 1코스 유지.** 근거는 진행 우선 —
> 3코스는 `daily_challenges` UNIQUE 교체 · `ensure_today_daily_challenge` drop+create · anon ACL 재부여 ·
> 게스트 경로가 얽혀 cutover 창이 필요했고 그 비용 대비 기능 가치가 낮다. **후속 웨이브에서 재검토 가능.**
> 기록: `01-CONFIRMED-SPEC.md` §0(정정 이력) · `MOBILE-VALIDATION-CORRECTIONS.md` §1.1 · `PACKET-CONTRACT-GAPS.md` 5차 · `TRACKS.md` 7차.
> **사라진 것:** 17a-1 · 15 §5.1 코스별 랭킹(지금의 "오늘 TOP 3"가 이미 단일 코스 랭킹) · G3·G12(**해소가 아니라 범위 제외**) ·
> 시안 §02 `완료 1/3` · **"3코스 창" 개념.**
>
> **산출물 (이 커밋, 운영 미적용):** `supabase/migrations/20260928090000_c4_check_c3_grant_total_xp.sql` — **③ → ④ → ②**,
> 데이터 손실 DDL **0**, 항목별 롤백 DDL 주석 · pgTAP `supabase/tests/c4_check_c3_grant_total_xp.sql` **30건**.
> ~~**저장소 16 ↔ 운영 15, 차이 1** (`20260928090000`). 적용은 **건별 승인 후 사용자 `db push`** (`AGENTS.md` §1).~~ → **적용 완료 (위 (4) 상자).**
>
> | 검증 (`7e90b7a` + 미커밋 작업 트리, 2026-09-28, 로컬) | 결과 |
> |---|---|
> | `npx supabase db reset --local` | **migration 16개 + seed 적용, exit 0** |
> | pgTAP 전량 | **c4_check_c3 30/30** · duel_item_authority_v3 **148/148** · xp_ledger_v1 **128/128** · server_authority_v2 **97/97** · group_security_phase2c **49/49** · group_final_gaps_v13 **33/33** · group_spectator_emoji_atomicity **22/22** · group_match_lifecycle_phase2a **2/2** — `not ok` **0** |
> | 음성 대조 | 테스트 트랜잭션 안에서 테이블 단위 UPDATE를 되살리면 **11건 실패** — 테스트가 권한을 실제로 잡는다 · ②의 가드는 범위 밖 행 1개로 **`GAME_RECORDS_RESULT_STATUS_OUT_OF_SET`을 내고 멈춘다** (둘 다 롤백, 상태 원복 확인) |
> | `npm run supabase:preflight` | **11/11 PASS** · restart 0/0 |
> | `npm test` · `npm run build` | **330/330** · **exit 0** |
> | 프론트 스모크 (Playwright, 로컬) | `ProfilePage` 닉네임 저장 **204** · 사진 변경 **204**(Storage 업로드만 대체, `profiles` update는 실제) · DB 반영 확인 · 콘솔 오류 0. **같은 사용자로 REST `update({total_xp})` → 403 / `42501`** |
>
> **⚠ 운영 적용 전에 알아야 할 것 2건.**
> ① **로컬 `game_records`는 0행이다** — ②의 CHECK가 로컬에서 통과한 것은 운영에 대해 아무것도 증명하지 않는다.
> 그래서 migration **맨 앞의 읽기 전용 가드**가 범위 밖 행을 발견하면 **아무것도 적용하지 않고** 값·개수를 내며 멈춘다.
> 멈추면 그 행을 보고하고 판단한다 — 운영 데이터를 추측으로 고치지 않는다 (`AGENTS.md` §5).
> ② **`TRACKS.md` §7.1 ④의 "(+ 원장 backfill)"은 넣지 않았다.** `total_xp`는 전원 0으로 시작한다.
> 운영 `xp_ledger`가 비어 있으면 C3 §6 불변식이 그대로 성립하지만, **운영 행 수는 확인하지 않았다** `확인 필요`.
> **backfill은 15b 소유로 확정됐다** `[사용자 확정, 2026-09-28]` → **운영 `xp_ledger` 0행으로 불필요 확정** (위 (4) 상자). **C1 보상 3테이블은 어느 migration에도 없고 17b가 만든다** `[사용자 확정]` (`TRACKS.md` §1.1-c).

> # ⚑ 2026-09-28 — `main` push #6: D1 워크플로 기본 브랜치 반영 `[사용자 승인]`
>
> `origin`의 기본 브랜치는 `main`이고, push 전 `main = feat/group-final-gaps = fc46c95`를 `git ls-remote`로 확인했다 `[산출물]`. `09b684a`와 **이 문서 갱신 커밋**을 두 ref에 동일하게 push한다. `fc46c95` 이후 앱 코드 변경은 **0**이다. `.github/workflows/keepalive.yml`을 기본 브랜치에 두기 위한 **`AGENTS.md` §1.1 건별 승인 예외**이며, `main` push는 Vercel 프로덕션 **재배포를 트리거한다**. 사용자 화면의 코드 변경은 없지만 재배포 성공과 워크플로 첫 실행은 별도 확인 대상이다.
>
> **D1 상태:** 워크플로 기본 브랜치 반영, **GitHub secrets 등록·첫 실행 검증 대기**. `SUPABASE_URL`·`SUPABASE_ANON_KEY`는 사용자가 GitHub에 등록한다. 아래 #4·#5 배포 기록은 그대로 유지한다.

> # ⚑ 2026-09-28 — 운영 배포 #4·#5 완료, D1 실제 발생 `[사용자 보고]`
>
> 운영 DB가 **약 3주 비활동으로 자동 정지**되어 사용자가 대시보드에서 Restore했다. 사용자 노출 기간은 **미확인**이다. `backup/schema-20260928-1518.sql` **173,248B**, `backup/data-20260928-1518.sql` **2,684,929B**를 백업했다. 파일명·크기는 로컬에서 확인했으며 내용과 운영 원본의 일치는 미검증이다 `[산출물]`.
>
> 사용자가 `db push`로 **`20260903090000`·`20260904090000`·`20260904100000`**을 적용했다. 사용자 검증값: tables **24** · `public` funcs **43** · migrations **15** · publication **4**. 따라서 **저장소 15 = 운영 15, 차이 0**이다. 이 세션은 운영 DB에 접속하지 않았다.
>
> **#4** `main` push `a784d2e → f6e2b2f`로 C 프론트를 배포했다. 운영 스모크에서 아이템 **10종 applied**를 확인하고 **1:1 결과 화면 회귀**를 발견했다. `fc46c95`가 로컬 재현·수정·스모크를 기록했고, 사용자 **#5** `main` push `f6e2b2f → fc46c95` 후 운영에서 **완주 판정 정상**을 재확인했다. #4·#5는 각각 `AGENTS.md` §1.1의 **건별 승인**으로 실행됐으며, 다음 push 승인은 별개다. 상세 근거: §3 push 이력, `docs/agent/TRACK-C-HANDOFF.md` §3.6 체크리스트 13번.
>
> **남은 관찰:** 결과 화면 경합 경로는 2026-07-26부터 잠재했고 **8월 정상 이유는 미확정**이다. 2026-09-28에 처음 실측했다. 체크리스트 **14번(아이템으로 목표 도착)은 미검증**이다. 부채 ③의 강제 이동은 **운영의 목적지 커버리지가 로컬 fixture보다 나아 성공률이 높았다** `[사용자 관찰]`; 정량 성공률은 미측정이다.
>
> **D1:** 자동 정지가 실제 발생했다. `.github/workflows/keepalive.yml`을 기본 브랜치에 반영하고 **GitHub secrets 등록·첫 실행 검증 대기**. **D6:** `supabase/seed.sql`에 후보 8행을 옮겼다; 로컬 `db reset` 후 함수 실측은 아래 검증 기록을 따른다. 아래 2026-09-06 상자와 이후 날짜가 붙은 기록은 **당시 상태**이며, 현재 배포·migration 값은 이 상자와 §3이 우선한다.

> # ⚑ 2026-09-06 — **트랙 C가 통합됐다. 웨이브 2가 끝났다. 배포는 하지 않는다 — migration이 2개 있다.**
>
> **`feat/group-final-gaps` = `ab5af95`** (`git merge --no-ff feat/track-c`). **충돌 0.**
> **트랙 C가 분기점(`1234c37`)에서 갈라졌고 그 사이 이 브랜치가 움직이지 않았다** — 교집합을 따질
> divergence 자체가 없었다. 병합 결과 트리는 `feat/track-c`의 트리와 **바이트 동일**하다.
>
> | 항목 | 실측 |
> |---|---|
> | **`npm test`** | **322/322 pass, fail 0, skipped 0, todo 0** — **260 + 62 = 322, 단순 합과 정확히 일치한다.** 신규 `tests/duelItemAuthority.test.js`가 **62개 전부**를 냈다. `tests/duelSwapDisabled.test.js`는 **48줄 고쳐졌는데 테스트 수는 4로 무변동** — 기존 계약 안에서 assert를 강화했다는 뜻이다 |
> | **pgTAP `duel_item_authority_v3`** | **148/148, `not ok` 0건** (통합 환경 재실행) |
> | **pgTAP `xp_ledger_v1`** | **128/128, `not ok` 0건** — **15a 회귀 확인.** C의 migration 2개가 15a 계약을 건드리지 않았다 |
> | **`npm run build`** | **exit 0.** 217 모듈 · `App-*.js` **567.24 kB**(gzip 168.48) — `1af9f93`의 551.09 kB에서 **+16.15 kB**. **15a와 달리 C는 화면에 연결됐다**(`DuelItemBar`) |
> | **migration** | **로컬 15개 전량 적용.** `20260904090000`·`20260904100000` 포함. `migration up --local` 재실행 시 `applied:[]` — **멱등** |
> | **`supabase:preflight`** | **11/11 PASS 유지.** `migration-history count=3` 유지 · restart **0/0** |
> | **§2.3 불변식** | **7건 전수 통과** — 다만 ①이 **개수 검사로는 위반**으로 잡힌다. **그것이 개수 검사를 폐기한 근거다** (`TRACKS.md` §2.3 ⚠ 상자) |
> | **운영 DB** | **미접근. 운영 migration은 여전히 12개다** |
>
> **⚠ 이 코드는 `main`에 올리지 않는다.** 15a와 같은 이유다 — **migration을 만든다.**
> 다만 **C의 migration 2개는 3코스 창을 기다리지 않아도 된다** (아래 §5.0 D절).
>
> **웨이브 2 = A · B · N2 · D(15a) · C.** 다섯 트랙이 전부 이 브랜치에 들어왔고
> **merge 충돌은 전건 0이었다.** `TRACKS.md` §2의 화이트리스트 설계가 다섯 번 다 성립했다.

> # ⚑ 2026-09-04 — **트랙 D(15a)가 통합됐다. 배포는 하지 않는다 — migration이 있다.**
>
> **`feat/group-final-gaps` = `1af9f93`** (`git merge --no-ff feat/track-15a`). **충돌 0.**
> 15a는 **신규 5파일뿐이고 기존 파일 수정이 0**이라 교집합이 원리적으로 0이었다.
>
> | 항목 | 실측 |
> |---|---|
> | **`npm test`** | **252/252 pass, fail 0, skipped 0** — 204(베이스라인) + **48**(`tests/xpLedger.test.js`) |
> | **pgTAP** | **128/128, `not ok` 0건** (`supabase/tests/xp_ledger_v1.sql`, 통합 환경 재실행) |
> | **`npm run build`** | **exit 0.** `App-*.js` **551.09 kB — 통합 전과 동일** (어느 화면에도 연결되지 않았다) |
> | **migration** | **로컬 적용 확인.** 저장소 **13개**(`20260903090000_xp_ledger_v1.sql` 추가) |
> | **`supabase:preflight`** | **11/11 PASS 유지** (적용 후 재실행). restart 0/0 |
> | **운영 DB** | **미접근. 운영 migration은 여전히 12개다** |
>
> **⚠ 이 코드는 `main`에 올리지 않는다. A·B·N2와 성격이 다르다.**
> A·B·N2는 프론트 전용이라 `main` push가 곧 배포로 끝났다. **15a는 migration을 만든다** —
> **DB 변경은 3코스 창에서만 적용된다** (`TRACKS.md` §7, `AGENTS.md` §1). 따라서
> **15a의 종착지는 이 브랜치이고, 운영 반영은 창의 일부다.**
>
> **15a가 C2 계약의 `확인 필요` 2건을 닫았다** — ①`floor`·②KST가 **제안 → 확정**.
> 근거는 문서가 아니라 **구현과 양쪽 테스트**다 (`C2-XP-LEDGER.md` **§0 정정 이력**).

> # ⚑ 2026-09-03 — **트랙 A·B·N2가 배포됐다. 게이트 없이 실사용자에게 닿은 첫 배포다.**
>
> **`main` = `a784d2e`** (`git push origin feat/group-final-gaps:main`, `9eba7e9..a784d2e` 17커밋)
> `[사용자 실행, 2026-09-03]`. **프론트 전용 — DB·Edge Function 변경 0.** 상세는 §3의 ⚑ 상자.
>
> **화이트리스트가 실제로 배타적이었다** — A가 건드린 10파일과 B가 건드린 9파일의 **교집합이 0**이고
> merge 둘 다 **충돌 0**이었다. `TRACKS.md` §2가 설계한 대로 동작했다.
>
> | 항목 | 실측 |
> |---|---|
> | **`npm test`** | **204/204 pass, fail 0** — 144(베이스라인) + 17(A) + 42(B) + **1(N2 해소)** |
> | **`npm run build`** | **exit 0** |
> | **grep 불변식** | **A 7건 + B 8건 전건 통과** (측정 단서 5건은 `TRACKS.md` §8-A·§8-B 완료 행) |
> | **DB** | **미접근. migration 산출물 0개** — 두 트랙 모두, N2도 프론트만 만졌다 |
> | **게스트 경계** | **완결.** N1·N2가 둘 다 닫혔다 (패킷 17 §6) — 아래 결함 블록 |
>
> **⚠ 운영에는 아직 없다.** 이 코드는 `feat/group-final-gaps`에 있고 `main`에 없다.
> **`main` push 금지는 그대로다** (§3, `AGENTS.md` §1.1) — 게이트가 해제된 상태이므로
> 이 코드를 올리는 것은 **실사용자에게 바로 닿는 배포**다.

> # ⚑ 2026-09-02 — **유지보수 게이트가 해제됐다. 서비스가 열려 있다.**
>
> Vercel에서 `VITE_MAINTENANCE`를 **삭제**하고 최신 Production 배포(`9eba7e9`)를 **Redeploy**했다.
> 프로덕션 URL에서 **점검 화면 없이 앱이 렌더된다** `[사용자 확인, 2026-09-02]`.
> **이 문서의 모든 서술에서 "사용자 노출 0"이라는 전제가 사라졌다** — 특히 `main` push의
> 위험도가 바뀌었다 (§3, `AGENTS.md` §1.1). 기록: `CUTOVER-LOG-2026-08-27.md` §W10.

> **창 종료 이후 코드 커밋은 둘이고 둘 다 운영에 반영됐다.** `579a338`(RETIRE 3줄, W9 발견 4)과
> `0ad3cde`(`wiki-snapshot` 요청 감축, W9 발견 3). **W1-b(`main` push)로 프론트를,
> W8-b(`functions deploy wiki-snapshot`)로 Edge Function을 올렸다** — 배포 경로 둘이 모두 닫혔다.
> `29a21d0`·`357a330`·`e272b44`·`298cf54`·`aa58bac`·`9eba7e9`·`48e3f2d`는 문서 전용이다.

> **2026-08-27~28 cutover 창이 실행됐고, 2026-09-02에 최종 종료됐다.** W6(`db push --linked`)로
> **운영 migration 11개 전량이 적용됐고**, W7 검증이 전항목 통과했으며, W8로 Edge Function 2개가
> 배포됐다. **W9에서 결함 6건이 나와 W10을 창 밖으로 넘겼고**(G3 경로), 창 밖 후속에서
> 4건을 닫은 뒤 **W10(게이트 해제)까지 완료했다.** 실행 기록 전문:
> `docs/ops/CUTOVER-LOG-2026-08-27.md` — 창 밖 후속은 §W1-b·§W8-b·§W9-b·§W10·§W11-b.

이 파일이 **"지금 상태"의 단일 기준**이다. `docs/CLAUDE_HANDOFF.md`는 배경 문서(전체 인계 정보)이고,
상시 금지·의무 사항은 `AGENTS.md`에 있다. 수치는 저장소 기록과 실측에서 그대로 옮겼고,
확인되지 않은 것은 `미확인`으로 둔다.

**갱신 규칙:** 커밋을 만든 세션이 이 파일의 기준 커밋·갱신 날짜를 같은 커밋 또는 직후 커밋에서
갱신한다 (`AGENTS.md` §7). 갱신 커밋은 자신의 해시를 담을 수 없으므로 **기준 커밋이 그 갱신
커밋의 부모인 상태가 정상이다** — 그 한 커밋 차이는 뒤처진 것이 아니다. 이 갱신 커밋은 문서만
변경하므로 아래 수치의 기준을 바꾸지 않는다.
**다만 부모인 `579a338`은 코드를 바꿨다** — §2의 2026-08-29 행이 그 커밋 기준 실측이다.

---

## 1. 판정

### CODE GO — 기준 커밋 `0ad3cde`

**유효 조건 (아래를 모두 만족하는 local/CI 환경에서만 유효)**

- 승인 이미지 `public.ecr.aws/supabase/postgres:17.6.1.158`, digest `sha256:99b1729aeb0bac314445024fc149fbd39306170b61dd50800ccf180327ab3459`
- Supabase CLI `2.114.0` (exact pin: `package.json` devDependencies)
- `npm run supabase:preflight` 통과 (image tag/ID/digest, migration history, RPC catalog/ACL, log 안정성)
- project/volume 격리 유지: `wiki-packet13-r2-clean158`

**즉시 무효화 조건**

- `.104` 이미지 또는 미승인 digest가 기본 경로로 선택되면 그 시점에 `CODE NO-GO`
- 운영 런타임은 이 고정 범위 **밖**이다. 이 판정은 운영 적용 근거가 아니다

> # ⚑ 2026-09-04 — **CODE GO의 크래시 탐지 범위가 넓어졌다. 이전 GO 판정은 좁은 탐지기 위에 있었다**
>
> **근거 커밋 `5d40e32`** (`fix(preflight): widen crash detection to all signals and PANIC`).
>
> **`supabase:preflight` 통과는 CODE GO 유효 조건의 하나다** (위 목록 3번째). 그 통과를
> 만들어내는 `postgres-log` 케이스의 크래시 탐지기에 **결함 2건이 있었다.** 즉
> **`5d40e32` 이전에 기록된 모든 `11/11 PASS`** — §2의 2026-08-23 `032caba` 행부터
> 2026-09-04 `8a3c77f` 행까지 — **는 아래 범위를 못 보는 탐지기 위에서 나온 값이다.**
>
> | | ~~이전 (2026-09-04 `5d40e32` 전)~~ | **지금** |
> |---|---|---|
> | 시그널 크래시 | ~~**`signal 11` 하나뿐.** 그것도 `server-terminated` 정규식이 아니라 **`signal 11` 리터럴이 우연히 잡은 것**이다~~ | **전 시그널.** `terminated by signal \d+` — signal 6(Abort)·9(Kill)·15 포함 |
> | `server process (PID N) was terminated` | ~~**둘 다 놓쳤다.** 정규식이 `server process`와 `terminated`가 붙어 있기를 요구했는데 실제 형식은 사이에 **`(PID N) was`가 들어간다**~~ | **잡는다.** 두 목록 모두 |
> | `PANIC:` | ~~**preflight가 통과시켰다.** log-window 목록에만 있었다~~ | **잡는다** |
> | `terminated` · `reinitializ*` | ~~preflight에 없었다~~ | **잡는다** |
>
> **⚠ 이 사실이 남아야 하는 이유.** 이전 판정들이 틀렸다는 뜻은 아니다 — **`postmaster-stability`
> (재시작 0/0)와 `container-health`가 독립적으로 돌고 있었고, 실제로 재시작은 0이었다.**
> 그러나 **"로그에 크래시 흔적이 없다"는 근거는 그만큼 약했다.** 특히 **SIGABRT·SIGKILL로
> 죽는 백엔드는 어느 경로에서도 보이지 않았다.**
>
> **탐지력을 넓히면서 오탐 0을 실측으로 확인했다** — 전체 로그 **31,040줄**에 새 패턴을
> 돌려 매치 **8줄**, 전부 standby EOF 면제분, **오탐 0건**.
>
> **`starting up`은 일부러 넣지 않았다** (요청 4개 중 1개 제외). 같은 로그에서 **134회**
> 나오는데 **전부 정상 부팅**이다 — 4번의 컨테이너 기동에 몰려 있고 **severity가 `FATAL:`이라
> severity 게이트로도 걸러지지 않는다.** 같은 이유로 `automatic recovery`(6회, 기동마다 1회)도
> 제외했다. **둘 다 `PACKET13_CURRENT_FATAL_MARKERS`에는 남는다** — 그쪽은 START/END로 잘라낸
> **창 안**만 보므로 "실행 중에 재기동됐다"가 되어 판정이 성립한다. 창이 없는 경로에서는
> 정상 부팅과 구분할 방법이 없다. **§2의 P1·P2 블록에 상세가 있다.**

> **⚑ 2026-09-04 재확인 — 13번째 migration이 붙은 뒤에도 유효 조건 4개가 전부 유지된다** `[산출물]`.
> **`npm run supabase:preflight` 11/11 PASS** — 승인 이미지 digest `sha256:99b1729a…` 동일 ·
> CLI `2.114.0` 동일 · project `wiki-packet13-r2-clean158` 동일 ·
> `postmaster-stability before == after`, **restart 0/0**. `migration-history`는 고정 3버전만
> 조회하므로 **`count=3` 그대로다** (`TRACKS.md` §2.4). **즉 15a의 migration 적용이 런타임 축을
> 흔들지 않았다.** 다만 `postgres-log` 케이스의 판정 창에 대해서는 **§2 끝의 관찰**을 함께 읽는다.

**이전 판정 기준(`339fb77`) 이후의 코드 변경분.** 비문서 변경은 **두 묶음**이다.

1. **유지보수 게이트** (`b24744e`) — `utils/maintenanceGate.js`,
   `components/MaintenanceScreen.jsx`, `main.jsx`, `appStyles.js`,
   `tests/maintenanceGate.test.js`, `.env.example`, `.gitignore`, `README.md`, `AGENTS.md`
   (`git diff --name-only 339fb77..HEAD`, 2026-08-27 `[산출물]`).
2. **2026-08-28 운영 장애 최소 수정 3건** — `components/ExitGuard.jsx`(React import),
   `supabase/functions/wiki-snapshot/index.ts`(User-Agent 헤더, info 배치 dedup).
   설계 변경 없음. 보류한 항목은 §5.4에 있다.

나머지 커밋은 `docs/`와 `wiki-race-2.0-handoff/` 문서다. 두 묶음 모두 `npm test` 142/142와
`npm run build` 성공으로 덮였고(2026-08-28 재실행), `032caba` 기준
`npm run supabase:preflight` 11/11로 런타임 축이 재확인됐다 (§2).

> **`wiki-snapshot`의 UA 문자열은 확정됐고 운영에 반영됐다** —
> `WikiRace/2.0 (https://wiki-dusky-one.vercel.app) supabase-edge-functions`.
> 도메인은 2026-08-28 운영 스택트레이스에서 확인된 실제 값이다 `[사용자 확인]`. 자리표시자는 없다.
> 이메일은 넣지 않는다 — Wikimedia 정책은 연락 가능한 **URL 또는 이메일 중 하나**면 충족한다.
> **W8(2026-08-28)이 이 값을 운영에 올렸고 싱글 경로의 429는 풀렸다.**
> ~~**그룹 경로는 풀리지 않았다**~~ — 62요청이 참가자 수만큼 곱해져 4인 그룹에서 502가 재발했다
> (§5.5 발견 3). **UA와 dedup만으로는 부족하다는 것이 창에서 실측됐다** — 그것이
> `0ad3cde`의 요청 감축으로 이어졌고, **W8-b 배포 후 재스모크에서 502가 0건이 됐다** (2026-09-02).

근거: `wiki-race-2.0-handoff/code/13-GROUP-FINAL-GAPS.md` §9·§21, `code/10-CODE-MASTER-TODO.md` §9.8

### ~~RELEASE HOLD~~ → **RELEASE 해제 — 기준 커밋 `48e3f2d`, 2026-09-02**

**서비스가 열렸다.** 2026-08-27~28 창이 DB·배포 축을 닫았고, 창 밖 후속이 W9 발견 4건을
전부 종결한 뒤 **W10(유지보수 게이트 해제)이 수행됐다.**

| 축 | 상태 | 근거 |
|---|---|---|
| 운영 DB migration | **적용 완료** — 11개 전량, W7 전항목 통과 | CUTOVER-LOG §W6·§W7 |
| Edge Function | **배포 완료** — `wiki-snapshot`(W8 → W8-b 재배포)·`single-run`(W8) | §W8·§W8-b |
| 프론트 | **배포 완료** — `main` = `9eba7e9` | §W1·§W1-a·§W1-b |
| W9 결함 6건 | **전건 종결** — 4건 수정·2건 결함 아님 | §5.5, CUTOVER-LOG §5-a |
| **유지보수 게이트** | **해제됨.** `VITE_MAINTENANCE` 삭제 + Redeploy | §W10 |

> **HOLD를 유지할 근거가 남아 있지 않다.** 이 판정은 "품질이 완결됐다"가 아니라
> **"게이트를 계속 켜 둘 사유가 없다"** 는 뜻이다. 잔여 검증은 §5에 있고,
> 그중 무엇도 게이트를 다시 켤 등급이 아니다. **다시 켜야 할 상황이 오면 W0의 역순이 아니라
> 새 창을 연다** — 게이트를 켜는 것 자체가 재배포이기 때문이다 (F11).

**바뀐 전제 — 이 문서 전체에 적용된다.**

| | 2026-09-02 이전 | 지금 |
|---|---|---|
| 사용자 노출 | **0.** 게이트가 막고 있었다 (최종 플레이 2026-08-04 `[실측]`) | **있다.** 프로덕션이 앱을 그대로 보여준다 |
| `main` push의 의미 | 게이트 뒤로 배포 | **즉시 사용자 노출** |
| 결함 발견 비용 | 게이트 뒤에서 조사 | 사용자가 먼저 만날 수 있다 |

**아래 두 절(창이 닫은 항목 / 남은 HOLD 사유)은 판정 경로의 기록으로 보존한다.**

#### 창이 닫은 항목 (2026-08-27~28)

| 항목 | 상태 | 근거 |
|---|---|---|
| 운영/linked DB migration 적용 | **완료.** W6에서 **11개 전량 적용 성공**, 오류 없음 | CUTOVER-LOG §W6 |
| 운영 dry-run | **완료.** pending 정확히 11개, 순서 표와 완전 일치 | CUTOVER-LOG §W5 |
| baseline 처리 (`schema_migrations` 부재) | **완료.** `repair` exit 0, 이력 1행 / `baseline_remote_schema` / `statement_count` 250 — 기대값 정확히 일치 | CUTOVER-LOG §W3·§W4 |
| 적용 결과 검증 | **완료. 전항목 통과** — 함수 36 / legacy RPC 2개 부재 / v13 제약 2개 `convalidated = true` / `rls_off_tables` 0 / publication 4테이블 / 이력 12행 | CUTOVER-LOG §W7 |
| Edge Function 배포 (`wiki-snapshot`, `single-run`) | **완료.** 이름 명시·`--prune` 미사용 | CUTOVER-LOG §W8 |
| Release A~D 승인 | **완료.** U2대로 11개를 한 창에서 전량 적용했다 | 대체 매핑 CUTOVER-PLAN §10 |
| `finish_group_player` 삭제에 따른 배포 순서 | **완료.** W0(게이트 on) → W1(main push) → W6 순서대로 실행됐고 구버전 세션 drain 문제는 발생하지 않았다 | CUTOVER-LOG §W1·§W6 |
| V2 이전 3개 migration(8/4·8/7·8/13) | **완료.** 11개 집합에 포함되어 적용됐다 | CUTOVER-LOG §W5·§W6 |
| **W2.5 삭제의 성격** | **운영에서는 "선택"이었다.** `w6_blocking_rows` **실측 0** — 리허설이 확정한 #10 실패 경로가 **운영에는 존재하지 않았다.** 그래도 삭제를 택했고(근거 3가지) 그 덕에 W7의 `convalidated = true`가 나왔다 | CUTOVER-LOG §W2.5. **CUTOVER-PLAN §5.3-0의 두 갈래 중 "선택" 쪽** |
| **롤백** | **발생하지 않았다.** §6.0.3의 트리거가 한 건도 발화하지 않았다 | CUTOVER-LOG §4 |

#### ~~남은 HOLD 사유~~ → **전건 종결 (2026-09-02)**

**W9 발견 4건이 전부 닫혔다.** 2026-08-29 조사에서 2건(4·5)이, 2026-09-02 배포·재스모크에서
나머지 2건(3·6)이 종결됐다. 조사 근거는 §5.5, 배포·검증 기록은 CUTOVER-LOG §W8-b·§W9-b.

| # | 항목 | 최종 상태 | 게이트 해제 차단? |
|---|---|---|---|
| **3** | **`wiki-snapshot` 502 대량 재발 (4인 그룹).** 준비 버튼 11회 연속 실패. **62요청 × 참가자 수**로 곱해지는 구조 | **해소 (2026-09-02).** 감축(`0ad3cde`)을 프론트(W1-b) → Edge Function(W8-b) 순으로 배포한 뒤 **4인 재스모크에서 502 0건.** 대기실 **124요청이 rate limit을 통과했다** `[사용자 보고]`. 게임 진입은 244 → **31건** | ~~예~~ → **아니오** |
| **4** | ~~**"유효하지 않은 RETIRE 사유"** — 결과 화면에서 로비 나가기 실패~~ | **해소 (2026-09-02 W1-b 배포 + 재스모크 확인).** 원인은 RPC 계약 불일치가 **아니라** `onClick` 바인딩 버그였다 `[코드]`. §5.5-4 | **아니오** |
| ~~5~~ | ~~**`username-lookup` 404**~~ | **종결 (2026-08-29) — 결함이 아니다.** 아이디 미존재 시의 **의도된 404 응답**이며 프론트가 이미 처리한다 `[코드]`. §5.5-5 | **아니오** |
| ~~6~~ | ~~**관전 이모티콘이 다른 참가자에게 전달되지 않음**~~ | **종결 (2026-09-02) — 스펙 범위 밖** `[사용자 판정]`. 스펙은 **"완주 관전자만 전송 가능"만 규정하고 수신자를 규정하지 않는다** `[문서]`. 렌더 경로가 `SPECTATING` 분기 하나뿐인 것은 확정 사실이나 그것이 위반의 근거는 아니다. §5.5-6 | **아니오** |

> **감축만으로 통과했다 — 이것이 §5.4-3의 답이다.** 대기실 요청 수는 244 → 124건으로 **절반만**
> 줄었고 그것으로 502가 사라졌다. 백오프는 필요하지 않았다 (§5.4-3).

**보존 — 2026-08-28의 W10 미수행 판정 근거.** 발견 3·4가 그룹 모드의 정상 이용을 막았고,
게이트를 해제하면 사용자가 준비 버튼 실패와 결과 화면 이탈 실패를 직접 만나는 상태였다.
**G3 경로(재개 포기, 게이트 켠 채 창 종료)를 채택했다** — CUTOVER-PLAN §6.0.2가 정의한
예정 경로이며 실패가 아니다. **그 판정이 옳았다는 것은 창 밖 후속이 증명했다** — 발견 3은
Edge Function을 배포하기 전까지 실제로 재현됐다.

#### 창이 닫지 않은 나머지

**2026-09-02 재스모크(W9-b)는 이 표를 바꾸지 않았다** — 4인 그룹 경로만 다시 밟았고
아래 항목은 어느 것도 그 범위에 없다. **게이트가 열렸으므로 이 표의 미실행 항목들은
이제 "실사용자가 먼저 밟을 수 있는 것"이 됐다** (§5).

| 항목 | 상태 | 처리 위치 |
|---|---|---|
| publication 운영 대조 | **해소 (2026-08-21 실측 → 2026-08-28 W7 재확인).** 4테이블, `group_spectator_emoji_rate_limits` 미포함 | CUTOVER-PLAN §1.2, CUTOVER-LOG §W7 |
| `GRANT` 70행 운영 대조 | **해소 (2026-08-27 → 2026-08-28 W2 재확인). 차이 0건** — 운영 스키마 덤프와 baseline이 **바이트 단위 완전 동일**(md5 양쪽 `e2bfa805…`, 1563행). W2 덤프도 리허설 덤프와 바이트 동일 | CUTOVER-PLAN **§1.4**, CUTOVER-LOG §W2 |
| 운영 17.6 권한 거부 경로 SIGSEGV 검증 | **미실행.** W9에서 의도적 1회도 수행하지 않았다 | §8.2-1로 이월 |
| 실제 브라우저 1:1 2세션 수동 검증 | **미실행.** 4인 그룹은 실제로 돌렸다(발견 3·6의 관측 경로) | §8.2-2 |
| 모바일 viewport / 키보드 / reduced-motion 검증 | **미실행** | §8.2-4 |
| **새 운영 스냅샷** | ~~**필수가 됐다.**~~ → **완료 (2026-09-02).** `PROD-SNAPSHOT-2026-08-20.md`를 무효화한 변화(함수 7→36, RLS 12/14→14/14, 이력 0→12행)를 **`PROD-SNAPSHOT-2026-09-02.md`가 실측으로 담았다** | §8.2-6 종결. §5.0 B1 |
| `target-level` Edge Function 존재 확인 | **미확인.** `--prune` 미사용은 확인됐으므로 삭제됐을 이유가 없다 | §8.1-7로 이월 |
| **§6.3 전체 복원 절차** | **쓰이지 않았다** (롤백 미발생). 운영 실행 권한은 **여전히 미검증**이다. 창 §0.0의 실행 전제 3항목(Docker·승인 이미지·IPv4 연결)도 **당일 확인 기록이 없다** | CUTOVER-PLAN **§6.3**·**§6.5**, CUTOVER-LOG §0.0 |
| **`public` 전용 데이터 덤프** | **W2에서 빠졌다.** §6.3.3이 "§4.3에 추가"라고만 하고 §4.3 명령 목록에 실제로 추가되지 않은 것이 원인이다. 복원 시 `slice-public.awk`(§6.3.3 (b))로 대체 가능 | CUTOVER-PLAN §4.3 수정 대상 |

근거: `docs/ops/CUTOVER-LOG-2026-08-27.md` (창 실행 기록 전문),
`docs/ops/CUTOVER-PLAN.md` §1·§7·§8·§9·§10·§11,
`wiki-race-2.0-handoff/qa/30-INTEGRATION-CHECKLIST.md` §21, `docs/CLAUDE_HANDOFF.md` §4.4

---

## 2. 검증 수치

**최신 14c 검증은 상단 ⚑ (11)·`docs/agent/14C-HANDOFF.md`를 따른다.** Node/빌드는 통합 시 `21c2afb` + 문서 전용 작업 트리에서 재확인했고, UI는 `f3ab081` + 14c-3 작업 트리(→ `21c2afb`), pgTAP은 `42a3df3` + 14c-1 작업 트리(→ `3d027ba`), 모두 2026-10-01 실측이다. 저장소/로컬 migration 21 = 운영 21(기준 `34af554`, 2026-10-01; 운영 적용은 사용자 보고, DB 미재조회). 아래 표는 이전 실행 이력으로 보존한다.

**실행 시점이 기재된 기준 커밋과 다른 항목은 그 사실을 명시한다** — 일부 수치는 동일 변경이
미커밋 작업 트리에 있던 시점에 측정됐다.

| 항목 | 수치 | 실행 날짜 | 기준 |
|---|---|---|---|
| B1 브라우저 게이트 시나리오 | 12/12 (failed 0, skipped 0) | 2026-08-19 | `339fb77` **이전** — 미커밋 작업 트리, HEAD `450f63a` |
| B1 browser contexts | 53/53 (created/closed) | 2026-08-19 | 동일 실행 |
| B1 realtime join ack | 52/52 | 2026-08-19 | 동일 실행 |
| B1 event delivery | 90/90 | 2026-08-19 | 동일 실행 |
| B1 duplicate_events | 0 | 2026-08-19 | 동일 실행 |
| B1 unexpected_wikipedia_requests | 0 | 2026-08-19 | 동일 실행. **Wikipedia는 fixture 인터셉트** — 실제 API 아님 |
| B1 wiki_snapshot 429 | 0 | 2026-08-19 | 동일 실행 |
| B1 log window current fatal | 0 (historical 39) | 2026-08-19 | 동일 실행 |
| `npm test` | 126/126 | 2026-08-18 | `339fb77` **이전** — 문서 기록 |
| `npm test` | 129/129 | 2026-08-20 | `339fb77` 실측. 08-19에 추가된 B1 시나리오 계약 테스트 3개가 늘어난 차이다 |
| `npm test` | **142/142** | 2026-08-21 | `b24744e` 실측. 베이스라인 129 + 유지보수 게이트 13 (`tests/maintenanceGate.test.js`) |
| `npm test` | **142/142** | 2026-08-23 | `032caba` 실측. Docker Desktop 재시작 후 재확인 |
| `npm test` | **142/142** | 2026-08-28 | `be520c3` 실측. 운영 장애 최소 수정 3건 후 재실행. **테스트 수는 늘지 않았다** — 수정이 기존 계약 안에 들어간다 (`serverAuthorityMigration.test.js:62-65`, `groupFinalGaps.test.js:66-68` 무영향) |
| `npm test` | **142/142** | 2026-08-29 | `579a338` 실측. RETIRE 3줄 수정 후 재실행. **테스트 수는 늘지 않았다** — `onClick` 바인딩은 기존 계약(`groupGameFlow.test.js:198`의 `shouldRetireGroupPlayer`)을 건드리지 않는다 |
| `npm test` | **144/144** | 2026-09-02 | `0ad3cde` 실측 (측정은 커밋 직전 작업 트리). **+2** — `serverAuthorityMigration.test.js`의 목적지 revision 계약이 **제거의 유지**로 뒤집히면서 재사용·본문 플래그 계약 2건이 늘었다 |
| `npm test` | **144/144** (fail 0, skipped 0) | 2026-09-02 | `48e3f2d` 실측 `[산출물]`. **W10 완료 세션의 재확인.** 이 세션은 문서만 바꿨으므로 수치가 같은 것이 정상이다 |
| `npm test` | **144/144** (fail 0, skipped 0) | 2026-09-02 | `f40e071` 실측 `[산출물]`. **병렬 트랙 세팅 세션(`TRACKS.md` 신설)의 재확인.** 문서만 바꿨으므로 수치가 같은 것이 정상이다 |
| `npm test` | **144/144** (fail 0, skipped 0) | 2026-09-02 | `e1b5546` 실측 `[산출물]`. **결정 3건 확정·창 범위 확정 세션.** 문서만 바꿨다 |
| `npm test` | **144/144** (fail 0, skipped 0) | 2026-09-02 | `b281e01` 실측 `[산출물]`. **C4-① 확정·ACL 절차·A·B 착수 티켓 세션.** 문서만 바꿨다 |
| `npm test` | **144/144** (fail 0, skipped 0) | 2026-09-02 | `ad569f2` — **트랙 A·B의 분기점.** 두 트랙이 각자 이 값을 베이스라인으로 기록했다 |
| `npm test` | **161/161** (fail 0) | 2026-09-03 | `e70c541` **트랙 A 단독** `[산출물]`. **+17** — `tests/profileCard.test.js` |
| `npm test` | **186/186** (fail 0) | 2026-09-03 | `7a7197e` **트랙 B 단독** `[산출물]`. **+42** — `tests/resultReasonLabels.test.js` + `tests/explorationRecords.test.js` |
| `npm test` | **203/203** (fail 0, skipped 0, todo 0) | 2026-09-03 | `527f896` **A·B 통합 후** `[산출물]`. **144 + 17 + 42 = 203 — 단순 합과 정확히 일치한다.** 두 트랙이 같은 테스트 파일을 건드리지 않았고 서로의 assert를 무효화하지도 않았다는 뜻이다 (화이트리스트 배타성의 사후 확인) |
| `npm test` | **204/204** (fail 0, skipped 0, todo 0) | 2026-09-03 | `eeb7a16` 실측 `[산출물]`. **+1** — N2 해소 테스트 (`explorationRecords.test.js`의 `(3) 랭킹 전체 보기 진입점은 게스트에게 노출되지 않는다`). 측정은 커밋 직전 작업 트리 |
| `npm test` | **252/252** (fail 0, skipped 0, todo 0) | **2026-09-04** | **`1af9f93` — 트랙 D(15a) 통합 후** 실측 `[산출물]`. **+48** — `tests/xpLedger.test.js`. **204 + 48 = 252, 단순 합과 정확히 일치한다** — 15a는 기존 테스트 파일을 하나도 건드리지 않았다 |
| **pgTAP `xp_ledger_v1`** | **128/128** (`not ok` **0건**) | **2026-09-04** | **`1af9f93`** 실측 `[산출물]`. `supabase/tests/xp_ledger_v1.sql`을 **통합 환경에서 재실행**했다. **파일이 `rollback`으로 끝나 DB 상태를 남기지 않는다** (계약 테스트가 이 성질을 assert) |
| production build (`npm run build`) | **PASS** (exit 0) | **2026-09-04** | **`1af9f93`** 실측 `[산출물]`. 214 모듈 · `App-*.js` **551.09 kB**(gzip 163.08) — **`eeb7a16`과 같은 값이다**(vite 보고 단위 기준. 모듈 수도 214로 같다). 15a가 어느 화면에도 연결되지 않았으므로(범위 밖 ④⑤) **번들이 늘지 않는 것이 정상이다** |
| `npm run supabase:preflight` | **11/11 PASS** | **2026-09-04** | **`1af9f93`** 실측 `[산출물]`. **13번째 migration 적용 후** 재실행. `migration-history count=3` 유지 · `postmaster-stability before == after`, restart **0/0**. **CODE GO 유효 조건이 유지된다** |
| **저장소 migration 수** | **13개** (마지막 `20260903090000_xp_ledger_v1.sql`) | **2026-09-04** | `1af9f93` `[산출물]`. **로컬 스택에는 13개가 적용됐다.** ~~12개~~ |
| **운영 migration 수** | **12개** — **변화 없다** | 2026-08-28 | 창 W7 `[사용자 보고]`. **13번째는 운영에 없다** (R6, `AGENTS.md` §1). **저장소 13 ↔ 운영 12의 차이는 이 시점부터 정상 상태이며, 3코스 창이 그 차이를 닫는다** |
| `npm test` | **258/258** (fail 0, skipped 0, todo 0) | **2026-09-04** | **`8a3c77f`** 실측 `[산출물]`. **+6** — `tests/supabaseRuntimeValidation.test.js`의 standby EOF 면제 계약 5건 + **선행 결함 등재 1건**. 측정은 커밋 직전 작업 트리 |
| `npm run supabase:preflight` | **11/11 PASS** | **2026-09-04** | **`8a3c77f`** 실측 `[산출물]`. `postgres-log`가 **`dangerous_marker=false benign_suppressed=0`** — detail에 면제 건수 필드가 생겼다 |
| **`postgres-log` 전체 로그 판정** | **구 로직 `dangerous=true`(FAIL) → 신 로직 `false`(PASS)**, 면제 **8줄** | **2026-09-04** | **`8a3c77f`** 실측 `[산출물]`. `docker logs --timestamps` **전량 31,040줄**에 대해 두 로직을 직접 대조했다. **면제 8줄을 빼면 위험 마커가 0건** — 오탐 외에 가려진 것이 없다는 뜻이다 |
| log window self-test | **14/14 PASS** | **2026-09-04** | **`8a3c77f`** 실측 `[산출물]`. `negative-current-signal-11`·`negative-current-panic` 포함 전건 통과. **2026-08-23의 12/12에서 케이스가 2건 늘었다** — 그 사이 추가된 것이며 이번 변경이 만든 차이가 아니다 |
| build (`npm run build`) | **PASS** (exit 0) | **2026-09-04** | **`8a3c77f`** 실측 `[산출물]`. 스크립트·테스트만 바뀌어 번들에 영향이 없다 |
| `npm test` | **260/260** (fail 0, skipped 0, todo 0) | **2026-09-04** | **`5d40e32`** 실측 `[산출물]`. **+2** — 선행 결함 등재 1건을 **해소 방향 3건**(P2 전 시그널 · P1 PANIC 등 · 부팅 로그 비위험)으로 뒤집은 차이다. 측정은 커밋 직전 작업 트리 |
| `npm run supabase:preflight` | **11/11 PASS** | **2026-09-04** | **`5d40e32`** 실측 `[산출물]`. **탐지 범위를 넓힌 뒤에도 유지된다** — `postgres-log dangerous_marker=false benign_suppressed=0` |
| **크래시 탐지 오탐 검사 (넓힌 패턴)** | **매치 8줄 = 면제 8줄, 오탐 0건** | **2026-09-04** | **`5d40e32`** 실측 `[산출물]`. `docker logs` **전량 31,040줄**. **`starting up` 134회·`automatic recovery` 6회는 정상 부팅이라 패턴에 넣지 않았다** — 넣었으면 전부 오탐이 됐다 |
| log window self-test | **14/14 PASS** | **2026-09-04** | **`5d40e32`** 실측 `[산출물]`. `server-terminated` 정규식과 신규 `terminated-by-signal` 추가 후 전건 통과 |
| build (`npm run build`) | **PASS** (exit 0) | **2026-09-04** | **`5d40e32`** 실측 `[산출물]`. 검증 스크립트·테스트만 바뀌었다 |
| `npm test` | **322/322** (fail 0, skipped 0, todo 0) | **2026-09-06** | **`ab5af95` — 트랙 C 통합 후** 실측 `[산출물]`. **+62** — `tests/duelItemAuthority.test.js` 단독. **260 + 62 = 322, 단순 합과 정확히 일치한다.** `duelSwapDisabled.test.js`는 48줄 고쳐졌으나 **테스트 수 4로 무변동** |
| **pgTAP `duel_item_authority_v3`** | **148/148** (`not ok` **0건**) | **2026-09-06** | **`ab5af95`** 실측 `[산출물]`. `supabase/tests/duel_item_authority_v3.sql`을 **통합 환경에서 재실행**했다. `rollback`으로 끝나 DB 상태를 남기지 않는다 |
| **pgTAP `xp_ledger_v1`** | **128/128** (`not ok` **0건**) | **2026-09-06** | **`ab5af95`** 실측 `[산출물]`. **15a 회귀 확인이 목적이다** — C의 migration 2개(`20260904090000`·`20260904100000`)를 적용한 상태에서 재실행했고 **2026-09-04의 128과 같다.** C가 15a 계약을 건드리지 않았다는 뜻이다 |
| production build (`npm run build`) | **PASS** (exit 0) | **2026-09-06** | **`ab5af95`** 실측 `[산출물]`. 217 모듈 · `App-*.js` **567.24 kB**(gzip 168.48). **`1af9f93`의 551.09 kB에서 +16.15 kB** — **15a와 달리 C는 화면에 연결된다**(`components/DuelItemBar.jsx`). 늘어난 것이 정상이다 |
| `npm run supabase:preflight` | **11/11 PASS** | **2026-09-06** | **`ab5af95`** 실측 `[산출물]`. **14·15번째 migration 적용 후** 재실행. `migration-history count=3` 유지 · `postmaster-stability before == after`, restart **0/0** · `postgres-log dangerous_marker=false benign_suppressed=2`. **CODE GO 유효 조건이 유지된다** |
| **§2.3 공유 자원 불변식** | **7/7 의도 기준 통과** | **2026-09-06** | **`ab5af95`** 실측 `[산출물]`. ① `SINGLE_ITEM_IDS` 4원소 **바이트 동일** · ② `onlineGameSession.js` **무편집** · ③ 13키 전원 존재(`useItemSystem.js` **무편집**) · ④ **4파일 6줄 동일 리터럴** · ⑤ `^\.mp-` **131개, 삭제·개명 0** · ⑥ 어휘 4값 **32/12/6/12 무변동** · ⑦ `authContext.jsx` **무편집**, importer **13개**. **①은 개수 검사(`grep -c` = 2)로는 실측 4라 위반으로 잡힌다 — 늘어난 3은 주석이고, 그것이 개수 검사를 폐기한 근거다** (`TRACKS.md` §2.3 ⚠ 상자) |
| **저장소 migration 수** | **15개** (마지막 `20260904100000_duel_item_link_resolvable_v3.sql`) | **2026-09-06** | `ab5af95` `[산출물]`. **로컬 스택에 15개 전량 적용됐다.** ~~13개~~ — C가 **2개**를 더했다 (`20260904090000` 신규 테이블·함수, `20260904100000` 함수 1개 `create or replace`) |
| **운영 migration 수** | ~~**12개** — **변화 없다**~~ → ~~**15개**~~ → **16개 = 저장소 16, 차이 0** (2026-09-28 17:46 사용자 `db push`, `20260928090000`) | 2026-09-28 | 상단 ⚑ 상자 `[사용자 보고]`. 이하 2026-08-28 기록: 창 W7 `[사용자 보고]`. **저장소 15 ↔ 운영 12, 차이는 3개다** — `20260903090000_xp_ledger_v1`(15a) · `20260904090000_duel_item_authority_v3`(C) · `20260904100000_duel_item_link_resolvable_v3`(C). **셋 다 운영에 없다** (R6, `AGENTS.md` §1). **이 중 3코스 창을 기다려야 하는 것은 없다** — 근거는 §5.0 D절 |
| **로컬 `daily_challenge_pool` 행 수** | **0행** (`is_active` 0 / 전체 0) | **2026-09-06** | `ab5af95` 실측 `[산출물]`. **`db reset --local` 이후 비어 있다.** 베이스라인 migration이 **테이블만 만들고 INSERT가 없으며**(`20260730170602:511` DDL, INSERT 0건) **`supabase/seed.sql`이 없다.** 그 결과 `select * from ensure_today_daily_challenge()`가 **`ERROR: No active daily challenge candidates`로 raise한다**(`20260730170602:77-79`). **운영에는 행이 있다** — 로컬만의 공백이다. §5.0 D절 |
| **운영 DB 배포 #4 선행** | **tables 24 · public funcs 43 · migrations 15 · publication 4** | **2026-09-28** | 기준 코드 `f6e2b2f`, 사용자 검증값 `[사용자 보고]`. 이 세션에서 운영 DB 미접근. 저장소 15 ↔ 운영 15, 차이 0 |
| **운영 아이템 스모크** | **10종 applied**, 결과 화면 회귀 발견 | **2026-09-28** | 기준 코드 `f6e2b2f`, 사용자 실측 `[사용자 보고]`; 회귀 분석은 `fc46c95`의 `docs/agent/TRACK-C-HANDOFF.md` §3.6 |
| **운영 hotfix 재확인** | **완주 판정 정상** | **2026-09-28** | 기준 코드 `fc46c95`, 사용자 실측 `[사용자 보고]`; 로컬 재현·수정·스모크는 `fc46c95`의 `docs/agent/TRACK-C-HANDOFF.md` §3.6 |
| **로컬 시드·오늘 도전 함수** | **pool 8행/활성 8행 · migration 15행 · 함수 정상 반환** | **2026-09-28** | 기준 HEAD `fc46c95` + 미커밋 작업 트리에서 `npx supabase db reset --local --yes`와 `npx supabase db query --local` 실측 `[산출물]`. 운영 DB 미접근 |
| `npm test` | **330/330** (fail 0, skipped 0) | **2026-09-28** | 기준 HEAD `fc46c95` + 이 문서·시드·워크플로의 미커밋 작업 트리에서 실행 `[산출물]` |
| `npm run build` | **PASS** (exit 0, 217 modules) | **2026-09-28** | 기준 HEAD `fc46c95` + 같은 미커밋 작업 트리에서 실행 `[산출물]`. 기존 500 kB chunk 경고 유지 |
| **#6 배포 전 `npm test`** | **330/330** (fail 0, skipped 0) | **2026-09-28** | 기준 HEAD `09b684a` + `AGENTS.md`·이 문서 미커밋 작업 트리 `[산출물]`. 앱 코드 변경 0 |
| `npm test` | **343/343** (fail 0) | **2026-09-29** | 기준 HEAD `777ecdf` + 15b-2 미커밋 작업 트리 → `fd6f916`로 커밋 `[산출물]`. **+13** — `tests/xpTotal.test.js` 단독. 330 + 13 = 343 |
| **pgTAP `xp_ledger_v1`** | **153/153** (`not ok` 0) | **2026-09-29** | `f8e8fc5` + 15b-1 작업 트리(→ `777ecdf`) `[산출물]`. **+25**(§9) · 15a 단언 1건 반전 · §7 픽스처 2건이 `total_xp`를 함께 옮기도록 수정 |
| **저장소 migration 수** | **17개** (마지막 `20260929090000_xp_total_v1.sql`) | **2026-09-29** | `777ecdf` `[산출물]`. 로컬 17개 전량 적용. **운영 16 — 차이 1, 운영 미적용** |
| **#6 배포 전 `npm run build`** | **PASS** (exit 0, 217 modules) | **2026-09-28** | 기준 HEAD `09b684a` + 같은 미커밋 문서 작업 트리 `[산출물]`. `App-Ci6c53FV.js` 567.78 kB로 이전 측정과 동일; 기존 500 kB 경고 유지 |
| pgTAP Packet 13 | 33/33 | 2026-08-18 | `339fb77` 이전 |
| pgTAP spectator emoji atomicity | 22/22 | 2026-08-18 | `339fb77` 이전 |
| pgTAP Server Authority V2 | 97/97 | 2026-08-18 | `339fb77` 이전 |
| pgTAP Phase 2C | 49/49 | 2026-08-18 | `339fb77` 이전 |
| deterministic concurrency | 6 시나리오 × 3회 PASS | 2026-08-18 | `339fb77` 이전 |
| crash regression | 4종 PASS | 2026-08-18 | `339fb77` 이전 |
| production build (`npm run build`) | PASS (약 689KB chunk 경고) | 2026-08-18 | `339fb77` 이전 |
| production build (`npm run build`) | **PASS** | 2026-08-21 | `b24744e` 실측. **커밋 기준 재실행 완료** — CUTOVER-PLAN §7 P13 |
| production build (`npm run build`) | **PASS** | 2026-08-28 | `be520c3` 실측. 산출물의 바 `React.createElement`가 **7건 → 0건** — ExitGuard 수정이 번들 수준에서 확인됐다 |
| production build (`npm run build`) | **PASS** (exit 0) | 2026-08-29 | `579a338` 실측. 청크 경고는 기존과 동일 |
| production build (`npm run build`) | **PASS** (exit 0) | 2026-09-03 | `527f896` **A·B 통합 후** 실측 `[산출물]`. 214 모듈 · `App-*.js` 550.99 kB(gzip 163.06) · `appStyles-*.css` 72.07 kB. **500 kB 청크 경고는 기존과 동일하며 새로 생긴 것이 아니다** |
| production build (`npm run build`) | **PASS** (exit 0) | 2026-09-03 | `eeb7a16` **N2 해소 후** 실측 `[산출물]`. `App-*.js` 551.09 kB(gzip 163.08) — 통합 시점 550.99 kB 대비 **+0.10 kB**(게이팅 1줄·안내 문구 1줄). 청크 경고는 기존과 동일 |
| production build (`npm run build`) | **PASS** (exit 0) | 2026-09-02 | `0ad3cde` 실측 (측정은 커밋 직전 작업 트리) |
| production build (`npm run build`) | **PASS** (exit 0) | 2026-09-02 | `48e3f2d` 실측 `[산출물]`. `App-*.js` 546.39 kB — 500 kB 청크 경고는 기존과 동일 |
| **4인 그룹 재스모크 (운영, W9-b)** | **전 경로 통과.** 대기실 준비 버튼 **502 0건**(124요청 통과), 게임 진입 **31요청**, 문서 전환 정상, 결과 화면 로비 나가기 정상, 관전 화면 본문 정상 렌더 | 2026-09-02 | 운영 실측 `[사용자 보고]`. **Edge Function 재배포(W8-b) 후** 측정이라 유효하다 — 그 전 값은 61건 그대로였다. CUTOVER-LOG §W9-b |
| **유지보수 게이트 (운영, W10)** | **해제됨** — `VITE_MAINTENANCE` 삭제 + `9eba7e9` Redeploy. 프로덕션 URL에서 점검 화면 없이 앱 렌더 | 2026-09-02 | `[사용자 확인]`. CUTOVER-LOG §W10 |
| **`wiki-snapshot` Wikipedia 요청 수** | cold **61 → 31**, warm **61 → 0**, 관전 **61 → 1** / 4인 대기실 **244 → 124**, 4인 진입 **244 → 31** | 2026-09-02 | `scripts/wikiSnapshotRequestCount.mjs` 실측 `[산출물]`. before = `aa58bac`, after = `0ad3cde`. **baseline "제목만" 62건이 2026-08-28 기록과 일치**해 하네스가 검증됐다 |
| `npm run supabase:preflight` | **11/11 PASS** | 2026-08-23 | `032caba` 실측. `postmaster-stability before == after`, restart 0/0 |
| log window self-test | **12/12 PASS** | 2026-08-23 | `032caba` 실측. `negative-postmaster-changed` 포함 |
| `npm run supabase:clean-gate` / `supabase:postgrest-smoke` 재실행 | 미확인 | — | `339fb77` 이후 재실행 기록 없음. `supabase:preflight`와 별개 스크립트다 |
| 운영 dry-run (`db push --dry-run --linked`) | **pending 11개, 순서 표와 완전 일치** | 2026-08-28 | 창 W5 `[사용자 보고]`. `--include-all` 미사용 |
| **운영 migration 적용 (`db push --linked`)** | **11/11 적용 성공, 오류 없음** | 2026-08-28 | 창 W6 `[사용자 보고]`. **소요 시간은 미기록** — 시작 21:47만 남았다 |
| **운영 적용 검증 (W7)** | **전항목 통과** — 함수 **36** / legacy RPC 2개 `null` / v13 제약 2개 `convalidated=true` / `rls_off_tables` **0** / publication **4테이블** / 이력 **12행** | 2026-08-28 | 창 W7 `[사용자 보고]` |
| 운영 스키마 덤프 ↔ baseline | **바이트 단위 동일** (41,399 B / 1,563행, md5 `e2bfa805…`) | 2026-08-28 | 창 W2 덤프를 로컬에서 재측정 `[산출물]`. W-1 리허설 덤프와도 동일 |

> ### ~~⚠ 관찰~~ → **✅ 해소 — `postgres-log` 패턴을 좁혔다 (2026-09-04, `8a3c77f`)**
>
> **근거 커밋 `8a3c77f`** (`fix(preflight): stop flagging benign standby EOF as a runtime crash`).
> 아래는 관찰 당시의 기록이며 **진단은 그대로 유효하다.** 수정 내용과 판정 근거는 이 블록 끝에 있다.
>
> `postgres-log` 케이스는 컨테이너 로그를 `DANGEROUS_RUNTIME_MARKERS`로 검사하고, 그 정규식에
> **`unexpected eof`가 들어 있다** (`scripts/supabase-runtime-validation.mjs:1`) `[코드]`.
> 그런데 로컬 스택의 전체 로그에는 **`LOG: unexpected EOF on standby connection`이 8건** 있다
> `[산출물]`. **이것은 크래시가 아니다** — Realtime의 논리 복제 슬롯
> (`START_REPLICATION SLOT supabase_realtime_messages_replication_slot_`)이 연결을 끊을 때
> 워커가 남기는 **`LOG` 등급** 줄이다.
>
> | 축 | 실측 |
> |---|---|
> | 등급 | **`LOG`** — `FATAL`도 `PANIC`도 아니다 |
> | 크래시 흔적 | **0건** — `PANIC` · `terminated by signal` · `reinitializ*` 전부 **0** |
> | postmaster | **2026-08-23 14:01:28 이후 바뀌지 않았다.** 가장 최근 EOF(2026-09-03 11:15:08)보다 **앞선 시각이 그대로 유지된다** — 즉 그 EOF가 재시작을 만들지 않았다 |
> | docker `RestartCount` | **0** |
> | 직후 로그 | **checkpoint가 정상 주기로 이어진다** (11:19:11 → complete) |
>
> **왜 지금 preflight가 통과하는가.** `postgres-log`는 **`docker logs --tail 500`만** 읽는다
> (`scripts/supabase-runtime-preflight.mjs:249`) `[코드]`. 최근 500줄에 EOF가 없어서
> `dangerous_marker=false`가 나온다. **즉 통과는 "안전함의 확인"이 아니라 창 크기의 결과다** —
> 창 안에 이 줄이 들어오면 **정상 상태에서 `CASE FAIL`이 난다.**
>
> **여유가 크지 않다** `[산출물]`: 전체 로그 **31,033줄** 중 마지막 EOF는 **30,442번째 줄**이다 —
> 끝에서 **591줄**. **판정 창(500줄) 밖으로 91줄 차이다.** 로그가 조금만 덜 쌓였거나
> `--tail` 값이 커지면 **아무것도 고장나지 않은 상태에서 preflight가 실패한다.**
>
> ~~**패턴을 조정할지는 별도 판단이다.**~~ → **조정했다 (2026-09-04, `8a3c77f`).**
> **트랙 C 착수 전 선행 작업으로 수행했다** — C는 `supabase:preflight`를 통과시킨 뒤 시작하는데,
> 로그가 조금만 더 쌓이면 그 관문이 멀쩡한 상태에서 막힌다.
>
> **면제 방식 — 두 안을 합쳐 가장 좁게 잡았다.**
>
> | 안 | 왜 그것만으로는 부족한가 |
> |---|---|
> | **문자열 허용 목록**(`standby connection` 포함 줄) | **severity를 보지 않아 `FATAL:  unexpected EOF on standby connection`까지 뚫린다** |
> | **severity로 한정**(`FATAL`/`PANIC`과 함께일 때만 위험) | **같은 패턴이 도는 다른 두 경로에는 severity가 아예 없다** — `classifyChildProcessResult`는 자식 프로세스 stdout/stderr에, `parseTapTranscript`는 TAP 출력에 돈다. 거기서는 기준이 성립하지 않는다 |
> | **채택 — 둘을 합친다** | **`LOG:` severity가 붙은 한 줄 형태만** 면제한다. `LOG:` 리터럴을 앵커로 쓰므로 **severity 게이트가 공짜로 따라온다** |
>
> **탐지력이 넓게 뚫리지 않는 근거 3가지.**
> ① **면제는 줄 단위다** — 같은 텍스트의 다른 줄에 있는 위험 마커는 그대로 걸린다.
> ② **크래시는 이 줄에 의존하지 않는다** — signal 11 · segfault · `terminated` ·
> `reinitializ*` · `recovery` · PANIC · 57P02가 각각 독립적으로 잡는다. standby EOF가
> **크래시의 유일한 증거인 경우는 없다.**
> ③ **면제가 조용하지 않다** — `benign_suppressed=N`이 `CASE` 줄에 찍힌다.
>
> **실측 판정** `[산출물]`: **전체 로그 31,040줄**에 대해 **구 로직 `dangerous=true`(CASE FAIL)
> → 신 로직 `false`(CASE PASS)**, 면제 **8줄**. **그 8줄을 빼면 31,040줄 안에 위험 마커가 하나도
> 없다** — 즉 면제가 다른 무엇을 가리고 있지 않다. `postgres-log`는 `benign_suppressed=0`으로
> PASS한다(창 안에 해당 줄이 없다). 같은 오탐이 있던 **log-window 경로에도 같은 조건으로 적용**했다.
>
> **⚠ 그 과정에서 선행 결함 2건이 드러났다.** ~~고치지 않고 등재만 했다~~
> → **바로 다음 커밋 `5d40e32`에서 함께 닫았다** — §2 끝의 P1·P2 블록.

> ### ~~⚠ 선행 결함 2건~~ → **✅ P1·P2 해소 (2026-09-04, `5d40e32`)** `[실측]`
>
> standby EOF 오탐(`8a3c77f`)을 고치면서 **마커 목록 자체의 커버리지 구멍**이 드러났고,
> **트랙 C 착수 전에 함께 닫았다.** 판정 영향은 §1의 ⚑ 상자에 있다.
>
> | # | 결함 (해소 전) | 수정 |
> |:-:|---|---|
> | **P1** | **두 마커 목록의 커버리지가 달랐다** — `DANGEROUS_RUNTIME_MARKERS`(preflight `postgres-log` · 자식 프로세스 · TAP)에 `panic`·`terminated`·`reinitializ*`·`starting up`이 없었다. **`PANIC: could not write to file` 한 줄만 있는 로그를 preflight가 통과시켰다** | **넷 중 셋을 넣었다.** `PANIC:`(severity 콜론 요구) · `terminated` 2종 · `reinitializ*`. **`starting up`은 제외** — 아래 |
> | **P2** | **둘 다 놓치는 형식이 있었다** — `LOG:  server process (PID 9) was terminated by signal 6: Aborted`. `server-terminated` 정규식이 `server process`와 `terminated`가 **붙어 있기를** 요구했는데 실제 형식은 사이에 **`(PID N) was`가 들어간다.** signal 11만 리터럴로 **우연히** 걸렸다 | **`(PID N) was`를 허용**하고, **`terminated by signal \d+`를 신설**해 시그널 번호 의존을 없앴다. **두 목록 모두** |
>
> **P2가 더 무거웠다.** P1은 "다른 경로가 잡는다"로 완충됐지만, P2는 **실제 크래시 형식이
> 두 목록의 어느 정규식과도 맞지 않는 것**이었다. **SIGABRT·SIGKILL로 죽는 백엔드가
> 어디에서도 보이지 않았다.**
>
> **`starting up`을 넣지 않은 근거 — 요청 4개 중 1개를 제외했다** `[실측]`.
>
> | 후보 | 전량 31,040줄에서의 출현 | 판정 |
> |---|---:|---|
> | `the database system is starting up` | **134회** — 전부 정상 부팅. postgres가 뜨는 중에 접속한 클라이언트(`authenticator`·`supabase_admin`·`supabase_auth_admin`)가 받는 응답이고 **4번의 기동에 몰려 있다** | **제외.** **severity가 `FATAL:`이라 severity 게이트로도 걸러지지 않는다** |
> | `automatic recovery in progress` | **6회** — 기동마다 1회. **이 스택은 매 기동이 crash recovery로 시작한다** | **제외.** 같은 이유 |
> | `PANIC:` · `terminated by signal` · `reinitializ*` | **0회** | **추가.** 정상 로그에 존재하지 않는다 |
>
> **둘은 `PACKET13_CURRENT_FATAL_MARKERS`에는 그대로 남는다.** 그쪽은 START/END로 잘라낸
> **창 안**만 보므로 "실행 중에 재기동됐다"는 뜻이 되어 판정이 성립한다.
> **`DANGEROUS_RUNTIME_MARKERS`는 창이 없어 같은 문자열이 정상 부팅과 구분되지 않는다** —
> 이 비대칭이 두 목록을 끝내 같게 만들 수 없는 이유다. `tests/…`의
> `부팅 로그는 위험이 아니다` 테스트가 양쪽 동작을 함께 고정한다.
>
> **오탐 0 실측.** 넓힌 패턴을 **전량 31,040줄**에 돌려 매치 **8줄** — **전부 standby EOF
> 면제분이고 오탐 0건**이다 `[산출물]`.

수치 출처: `wiki-race-2.0-handoff/code/10-CODE-MASTER-TODO.md` §9.8,
`test-results/packet13-b1/b1.3-2026-08-19T01-19-11-669Z-7c95d293/summary.json` (gitignore 대상 로컬 산출물),
`docs/ops/CUTOVER-PLAN.md` §7 P13, `docs/CLAUDE_HANDOFF.md` §3.2 "런타임 baseline 축의 성질".

---

## 3. 원격 상태

**최신 재측정 (2026-10-01, 기준 `34af554`, 배포 기록 커밋 전):** `git ls-remote origin refs/heads/main refs/heads/feat/group-final-gaps` → **main = feature = `34af554`** `[산출물]`. 운영 migration `20261001100000` 적용 및 main push #11은 `[사용자 실행·확인]`. 이번 문서 커밋은 feature로만 push한다. 아래 원격 측정은 당시 이력이다.

**2026-09-29 재측정:** `git ls-remote origin` → `main = 7e90b7a` · `feat/group-final-gaps = f8e8fc5` `[산출물]`. 로컬 `feat`는 그 위에 **4커밋**(`777ecdf` 15b-1 · `fd6f916` 15b-2 · `518654c` 문서 · 이 문서 갱신)이 더 있었고, **2026-09-30 사용자 승인으로 `origin/feat/group-final-gaps`에 백업 push했다.** `main`은 건드리지 않았다. 저장소 migration **17** ↔ 운영 **16**, 차이 **1** (`20260929090000`). `main` push·운영 적용은 15c와 묶어 건별 승인한다 (`AGENTS.md` §1·§1.1).

**현재 기준 (2026-09-28):** #6 push 직전 `git ls-remote origin`으로 `main = feat/group-final-gaps = fc46c95`를 직접 확인했다 `[산출물]`. 사용자가 승인한 #6에서 `09b684a`와 이 문서 갱신 커밋을 두 브랜치에 올린다. 저장소 migration **15개** = 사용자 검증 운영 migration **15개**, 차이 **0**. 이후 `main` push는 다시 건별 승인 대상이다 (`AGENTS.md` §1.1·§2).

**아래 2026-09-04 원격 측정과 2026-09-03 배포 상자는 당시 이력이다.** 현재 ref·운영 DB 값으로 재사용하지 않는다.

측정 시점: **2026-09-04 — 두 값이 다시 갈렸다.**
**`origin/main` = `a784d2e`** (2026-09-03 배포 이후 **변화 없음**) ·
**`origin/feat/group-final-gaps` = `5d40e32` + 이 문서 커밋** (`git ls-remote origin` 실측 `[산출물]`).
**차이는 트랙 D(15a)와 preflight 수정 2건이다.** D가 `main`에 없는 것은 의도된 상태다 — migration을
담고 있어 **3코스 창 전에는 올리지 않는다** (`AGENTS.md` §1·§1.1, `TRACKS.md` §7).
**`8a3c77f`·`5d40e32`는 검증 스크립트라 운영 번들과 무관하며, 같은 이유로 단독 배포할 것도 아니다.**
이전 측정: 2026-09-04 `1d8eb77`·`039ab3d`(feat) / 2026-09-03 `a784d2e`(둘 다) / 2026-09-02 `48e3f2d`(feat) / `9eba7e9`(main, W1-b 직후) /
2026-08-29 `e272b44` / 2026-08-28 23:21 `4a78a0d`.

> ### ⚑ **2026-09-03 — `main` 배포가 실행됐다. 게이트 없이 실사용자에게 닿은 첫 배포다**
>
> ```
> git push origin feat/group-final-gaps:main     # 9eba7e9..a784d2e
> ```
>
> **`[사용자 실행, 2026-09-03]`.** Vercel 프로덕션 빌드가 트리거됐다.
> **`AGENTS.md` §1.1이 정의한 승인 조건("이 변경을 실사용자에게 지금 노출해도 되는가" +
> 배포 전 검증)이 충족된 건별 승인**이며, **그 승인은 이 push에서 끝났다** — 다음 push는 새 승인이다.
>
> | 항목 | 값 |
> |---|---|
> | 범위 | **`9eba7e9..a784d2e` 17커밋** — 코드 3(`e70c541` A · `7a7197e` B · `a784d2e` N2) + `--no-ff` merge 3(`b3da192`·`527f896`·`eeb7a16`) + **문서 11** `[산출물]` |
> | 사용자에게 닿는 변화 | **트랙 A** 프로필 카드 공통 컴포넌트(6지점 이주) · **트랙 B** 서버 권위 순위 + 게스트 경계 + `resultReasonLabels` · **N2** 게스트 랭킹 진입점 숨김 |
> | **DB** | **변경 없음.** migration 산출물 0개, 운영 DB 미접근. **프론트 전용 배포다** |
> | Edge Function | **변경 없음.** `supabase/functions/`는 Vercel 배포에 포함되지 않는다 (W1-b에서 확인된 사실) |
> | 배포 전 검증 | `npm test` **204/204** · `npm run build` **exit 0** (§2) · **로컬 스모크 전항목 통과** (아래) |
> | 롤백 경로 | **이전 Vercel 배포(`9eba7e9`)로 되돌리는 것.** DB를 건드리지 않았으므로 **프론트만 되돌리면 정합이 맞는다** — 8월 창 이후 배포 중 되돌리기가 가장 단순한 건이다 `[추정]` |
>
> **로컬 스모크 (배포 전, `npm run dev`) — 전항목 통과** `[사용자 확인, 2026-09-03]`:
> 프로필·랭킹·공개 프로필 모달·그룹 로비 참가자 카드 렌더 · **로그인 완주 순위가 서버 값**
> ("2건 중 1위") · 게스트 경계 3항목.
>
> | **미확인 — 운영에서 확인할 것** | 왜 로컬에서 못 봤나 |
> |---|---|
> | **그룹 참가자 행** | 3명 이상이 실제로 모여야 하는 경로다 |
> | **실제 이미지 fallback 경로** | `legacyImageUrl` → 이니셜 → 시스템 기본의 2·3단 전이는 **실제 `avatars` 객체와 로딩 실패**가 있어야 밟힌다 (C5 §3.1~§3.2) |
>
> **이 둘은 배포 차단 사유가 아니었다** — 렌더 실패 시의 대체 경로이고, 실패해도
> 이니셜 placeholder로 떨어지도록 설계된 부분이다 (C5 §3.2). **운영에서 확인 후 여기에 적는다.**

> ### ⚑ 게이트 상태 — **해제됨 (2026-09-02, W10)**
>
> | 항목 | 값 |
> |---|---|
> | `VITE_MAINTENANCE` | **삭제됨.** `"true"`가 아니면 비활성이므로 `false` 설정과 판정이 같다 (`utils/maintenanceGate.js:26`) `[코드]` |
> | `VITE_MAINTENANCE_BYPASS` | **유지.** 다음 창에서 다시 쓴다. 게이트가 꺼진 동안에는 판정에 영향이 없다 `[코드]` |
> | 프로덕션 화면 | **앱 정상 렌더** (점검 화면 없음) `[사용자 확인, 2026-09-02]` |
> | 반영 방법 | 최신 Production 배포(`9eba7e9`) **Redeploy** — `VITE_*`는 빌드 시점 인라인이라 값 변경만으로는 반영되지 않는다 (F11) |
>
> **`main` push는 이제 곧 사용자 노출이다.** 아래 "`main` push 금지" 절과 `AGENTS.md` §1.1을
> 이 사실 위에서 다시 썼다.

> ### ~~⚠ 두 ref가 다시 갈라졌다 (2026-09-02, W1-b 이후)~~ → **다시 같아졌다 (2026-09-03)**
>
> **`main` = `feat/group-final-gaps` = `a784d2e`.** 2026-09-03 배포가 두 ref를 맞췄다.
>
> **보존 — 2026-09-02의 판단.** `48e3f2d`(문서 전용)를 `feat`에만 push했고 `main`은 `9eba7e9`에
> 멈춰 있었다. 그것은 의도된 상태였다: 문서 커밋은 배포에 영향이 없고 `main` push는 곧
> 프로덕션 재배포이기 때문이다. **그 규칙은 지금도 유효하다** — **다시 갈라지는 것이 정상이며,
> 이번처럼 같아진 것은 배포가 있었기 때문이다.** 다음 문서 커밋부터 다시 갈라진다.
> **뒤처져 있다는 이유로 `main`을 맞추지 않는다.**

아래 값은 **`feat` push 후 실측**이며 재측정 명령을 함께 적는다.

> ### `main` push 실행 (2026-09-02) — **W1-b**
>
> **이 절은 W1-b 시점의 기록이다.** 2026-08-29에 보류했던 `main` push를
> **W9 발견 3의 코드 수정이 갖춰진 뒤 실행했다** `[사용자 승인, 2026-09-02]`.
> 전제였던 **유지보수 게이트 ON은 프로덕션 URL에서 점검 화면 렌더로 확인했다**
> `[사용자 확인, 2026-08-29]`. 기록: `CUTOVER-LOG-2026-08-27.md` §W1-b.
> **이 push로 두 ref가 잠시 같은 커밋이 됐다** — 그 뒤 문서 커밋이 쌓이며 다시 갈라졌고
> **그것이 의도된 상태다** (위 상자).
>
> **이 push는 프론트만 배포했다. Edge Function은 W8-b에서 별도로 올렸다** — 아래 상자 참조.
>
> **아래 커밋 수는 측정 시점 값이고, 이 절을 기록·갱신하는 커밋 자신은 포함되지 않는다**
> (서두의 갱신 규칙과 같은 이유 — 커밋은 자기 해시를 담을 수 없다).
> **정확한 현재 값은 오른쪽 재측정 명령으로 읽는다.**

| 항목 | 값 | 재측정 명령 |
|---|---|---|
| `origin/main` HEAD | ~~`9eba7e9`~~ → **`a784d2e`** (2026-09-03 배포가 올린 값). `9eba7e9`에서 **17커밋 앞** | `git ls-remote origin refs/heads/main` |
| `origin/feat/group-final-gaps` HEAD | **`a784d2e`** — `main`과 **같다.** **이 절을 갱신한 커밋을 push하면 다시 1커밋 앞이 된다**(문서 전용, `main`에 올리지 않는다) — 위 자기참조 주의 | `git ls-remote origin refs/heads/feat/group-final-gaps` |
| 현재 브랜치 upstream | `origin/feat/group-final-gaps` (설정됨) | `git rev-parse --abbrev-ref "@{u}"` |
| upstream 대비 | **0 behind / 0 ahead** — push 완료 | `git rev-list --left-right --count "@{u}...HEAD"` |
| `origin/main...HEAD` | ~~0 behind / 1 ahead~~ → **0 behind / 0 ahead** (배포 직후 측정값) | `git rev-list --left-right --count origin/main...HEAD` |
| `e6d8eee..HEAD` 커밋 수 | **46** (`48e3f2d` 기준, 2026-09-02 실측) | `git rev-list --count e6d8eee..HEAD` |
| `37adc69`·`450f63a`·`339fb77`·`f1e61fa`·`b24744e`·`032caba`·`be520c3` | `origin/main`·`origin/feat/group-final-gaps` **양쪽에 포함** | `git branch -r --contains <sha>` |

**W1-b가 올린 것 — `4a78a0d..9eba7e9` 9커밋** (2026-09-02 실측 `[산출물]`):

| 커밋 | 성격 | 배포 효과 |
|---|---|---|
| `9eba7e9`·`aa58bac`·`298cf54`·`e272b44`·`357a330`·`29a21d0`·`1599be9` | 문서 7건 | 없음 |
| **`0ad3cde`** | **코드 — Edge Function + 프론트 + 테스트 + 계측 스크립트** | **프론트분만 반영된다.** `supabase/functions/`는 Vercel 배포에 포함되지 않는다 |
| **`579a338`** | **코드 — `pages/GroupGamePage.jsx` 3줄** | **반영됨** — W9 발견 4(RETIRE) 해소 |

> ### ~~⚠ 미완료 — Edge Function 배포~~ → **완료 (2026-09-02, W8-b)**
>
> `0ad3cde`는 배포 경로가 둘로 갈리는 첫 커밋이다. **양쪽 다 닫혔다.**
>
> | | 배포 경로 | 상태 |
> |---|---|---|
> | 프론트 (`pages/`·`services/`) | `main` push → Vercel | **완료 (W1-b, 2026-09-02)** |
> | **Edge Function** | **`npx supabase functions deploy wiki-snapshot`** | **완료 (W8-b, 2026-09-02)** |
>
> **순서를 지켰다 — 프론트 먼저.** 새 프론트가 `includeDocument`를 보내도 옛 함수는
> 무시하고 늘 HTML을 주므로 안전하다(감축 효과만 늦게 나온다). 역순이면 옛 프론트가
> 플래그를 보내지 않아 warm 경로가 빈 HTML을 주고 관전 화면이
> `SPECTATOR_DOCUMENT_UNAVAILABLE`로 깨진다 (§5.4-1·2).
> **W9-b에서 관전 화면 본문이 정상 렌더된 것이 순서가 지켜졌다는 확인이다.**
>
> **W8-b 이후에 돌린 재스모크만 유효하다.** 그 전 스모크는 운영 요청 수가 61건이라
> 발견 3이 그대로 재현되는 상태였다. 유효한 측정은 **2026-09-02 W9-b 하나뿐**이며,
> 거기서 **502가 0건**이었다 (CUTOVER-LOG §W9-b).

`git ls-remote`는 원격을 직접 조회하므로 `fetch` 없이도 실제 값을 준다. 이 클론에는
`.git/FETCH_HEAD`가 없어 remote-tracking ref는 push 결과만 반영한다 — **`git status`의
ahead/behind만 믿지 말고 `ls-remote`로 대조한다.**

**`main`은 더 이상 5월 상태가 아니다.** 그룹 보안 하드닝, 서버 권위 V2, Packet 13, 유지보수 게이트,
2026-08-28 최소 수정 3건, **그리고 2026-09-02 W1-b로 W9 발견 3·4 수정**이 전부 들어 있고
Vercel 프로덕션에 배포된 상태다.
~~**사용자에게는 점검 화면만 보인다**~~ → **사용자에게 앱이 그대로 보인다.**
**W10(2026-09-02)이 `VITE_MAINTENANCE`를 삭제하고 재배포했다** — 위 게이트 상태 상자.
게이트 ON은 W1-b 실행 **전에** 프로덕션 URL에서 점검 화면 렌더로 확인했고
`[사용자 확인, 2026-08-29]`, 해제 후에는 **앱 렌더로 확인했다** `[사용자 확인, 2026-09-02]`.

### `main` push 이력 — **#15까지 (2026-10-06 현재)**

| | 시점 | 대상 | 사유 | 게이트 | 기록 |
|---|---|---|---|---|---|
| **W1-a** | 2026-08-28 (창 **안**) | `be520c3` + 문서 4 → `4a78a0d` | W9 발견 2(`React is not defined`) 반영 | **ON** | 아래 절 + CUTOVER-LOG §W1-a |
| **W1-b** | 2026-09-02 (창 **밖**) | `579a338`·`0ad3cde` + 문서 7 → `9eba7e9` | W9 발견 3·4 수정 반영 | **ON** | CUTOVER-LOG §W1-b |
| **#3** | **2026-09-03** | **`9eba7e9..a784d2e` 17커밋 (코드 3 + merge 3 + 문서 11)** | **트랙 A·B·N2 배포** | **없음** | **위 ⚑ 상자** |
| **#4** | **2026-09-28** | **`a784d2e..f6e2b2f`** | **운영 DB migration 3개 적용 후 C 프론트 배포. 아이템 10종 applied, 결과 화면 회귀 발견** | **없음** | `[사용자 실행·보고]`, `docs/agent/TRACK-C-HANDOFF.md` §3.6 |
| **#5** | **2026-09-28** | **`f6e2b2f..fc46c95`** | **1:1 결과 화면 hotfix 배포. 운영 완주 판정 정상 재확인** | **없음** | `[사용자 실행·보고]`, `fc46c95` |
| **#6** | **2026-09-28** | **`fc46c95..09b684a` + 이 문서 갱신 커밋** | **D1 워크플로를 GitHub 기본 브랜치에 반영. 앱 코드 변경 0, Vercel 재배포 트리거** | **없음** | `[사용자 승인]`, `AGENTS.md` §1.1 예외; push 후 원격 ref 확인 |
| **#7** | **2026-09-30** | **`7e90b7a..ec7b6fa`** (코드 4 + 문서 5 + 이미 운영에 있던 `4c35aa7`) | **15b·15c 배포.** 선행: 운영 migration 2개(`20260929090000`·`20260930090000`) 적용·검증. 운영 스모크 싱글 `+15 XP` — **첫 운영 XP 지급** | **없음** | `[사용자 실행·보고]`, 위 ⚑ (3) 상자; push 후 `git ls-remote` 로 `main = ec7b6fa` 확인 |
| **#8** | **2026-09-30** | **`ec7b6fa..4719100`** (코드 1 `3693dd7` + 문서 3) | **오늘 코스 버튼 fallback 경합 hotfix.** DB 변경 0. 운영 확인: 로딩 문구 → 코스명 전환, 오늘 코스 완주 `+25 XP` — **운영 첫 25 지급** | **없음** | `[사용자 승인]` 이 세션이 실행, `[사용자 확인]` 운영 결과; 위 ⚑ (4) 상자 |
| **#9** | **2026-10-01** | **`4719100..dee9497`** (코드 6 + 문서 4) | **14b 배포 — 빠른 링크 아이템화.** 선행: 백업 `20261001-1135` → 운영 migration `20260930100000` 적용·검증(19개 · CHECK 11종). 운영 확인: 빠른 링크 제거 · 링크만 보기 · 링크 검열 | **없음** | `[사용자 실행·확인]`, 위 ⚑ (7) 상자; push 후 `git ls-remote`로 `main = dee9497` 확인 |
| **#10** | **2026-10-01** | **`dee9497..bc2b46f`** (코드 4 `dc388d9`·`7f748e6`·`afd0e7b`·`bc2b46f` + 문서 3 — 14c 준비 `595cf87` 포함) | **17b 배포 — 프로필 카드 장착 UI + C1 보상 3테이블.** 선행: 운영 migration `20261001090000` 적용(사용자 검증: migrations 20 · catalog 6 · inventory 858 = 143×6). 배포 전 검증(기준 `bc2b46f`, 2026-10-01 재실행): `npm test` 413/413 · build exit 0. 로컬: pgTAP 739/739 · 2계정 UI 스모크 20/20 | **없음** | `[사용자 승인]` 이 세션이 실행; 백업 `20261001-1555`·운영 migration은 `[사용자 실행·검증]`; push 후 `git ls-remote`로 `main = feat = bc2b46f` 확인. 운영 확인: 프로필 꾸미기 아이콘 6종 · 장착 · 랭킹 행 반영 `[사용자 확인]` |
| **#11** | **2026-10-01** | **`bc2b46f..34af554`** | **14c 배포 — 방장 목표 선택 · READY 제거.** 운영 migration `20261001100000` 적용 후 main push 지연으로 옛 guest READY가 `DUEL_HOST_ONLY`로 거부됨. feat Preview를 프로덕션으로 오인하여 main push 누락 | **없음** | `[사용자 실행·확인]` 방장 목표 선택 · READY 없음 · 1:1 정상 진행. 원격 main = feat = `34af554`는 이번 세션 실측. 배포 전 로컬 검증 기준·날짜는 상단 ⚑ (11) |
| **#12** | **2026-10-03** | **`34af554..275a693`** (16커밋 — 16a~16c 코드·migration·문서) | **16c 배포 — 업적 화면 · 결과 reveal · XP 합산 다중 레벨업 · 로비 알림 · 프로필 요약.** DB 변경 0 (16a·16b·16b-f migration은 그 전에 운영 적용) | **없음** | `[사용자 실행·확인]` 업적 알림 · 로비 업적 버튼 · 업적 화면. 배포 전 검증 `16-HANDOFF.md` §8.3 |
| **#13** | **2026-10-03** | **`275a693..912d241`** (9커밋) | **16d-1 배포 — 배지 폐지 프론트 · 프레임 단계 · 완주 효과/경로 색상 · 임시 아이콘 SVG 9.** DB 변경 0 — 옛·새 DB 양쪽 동작, 16d-2 migration 전 | **없음** | 원격 main = `912d241` 실측 `[산출물]`. `[사용자 실행·확인]` 프로필 꾸미기 카드 4행 + 경기 표현 2행 · 배지 행 없음 · 칭호 장착 · 업적 요약 "2개 달성" 정상. 배포 전 검증 `16-HANDOFF.md` §10.6 |
| **#14** | **2026-10-03** | **`912d241..fadc81d`** (14커밋 — 문서 포함) | **SF-A2 배포 — 1:1 참가자 읽기 마스킹 RPC · `duel_progress`·하트비트 재조회 · RoomPage 최신 읽기.** DB 선행: SF-M1 `20261004090000` · SF-A1 `20261004100000` 운영 적용 `[사용자 — migration list Remote 확인]` | **없음** | 원격 main = `fadc81d` 실측 `[산출물]`. `[사용자 실행]`. 배포 전 검증 기준 `bfbed24` — `TRACKS.md` §8-SEC-⑧. **운영 확인 미수신** |
| **#15** | **2026-10-06** | **`fadc81d..d496ba2` fast-forward** | **Wiki Race 2.0 Production frontend. 백업·운영 migration 5개/32개 일치·single-run v2/teleport v1 선행. npm 511/511·build/diff exit 0 (d496ba2, 2026-10-06).** | **없음** | **[사용자 승인 후 실행]** 원격 main/feature 및 Production d496ba2 Ready/alias 확인. 실제 random +20/daily +25/teleport 1회/기권 결과 복구. Group 신규 3인 후속. [배포 기록](../ops/RELEASE-2026-10-06.md) |

**W1-a·W1-b의 전제는 같았다** — 유지보수 게이트 ON, 사용자 노출 0, 게이트 미변경, DB 영향 없음.
W1-b는 push 전 프로덕션 URL에서 점검 화면 렌더를 확인했다 `[사용자 확인, 2026-08-29]`.
**W1-b는 창 밖이라 예외의 성격이 달랐다** — 창의 승인이 아니라 건별 승인이었다.

> **#3~#11은 게이트 해제 후의 건별 승인 사례다.** #3은 앞의 둘과 종류가 다르다.
> W1-a·W1-b는 **"게이트가 받아 주니까 올린다"** 였고, **#3은 "실사용자에게 노출해도 된다고
> 판단해서 올린다"** 다. `AGENTS.md` §1.1이 승인 조건을 ②에서 ③으로 바꾼 뒤의 **첫 적용 사례**이며,
> **그 조건은 배포 전 검증(`npm test`·`npm run build`·해당 경로 수동 확인)이었고 충족됐다.**
>
> **그래도 선례가 되지 않는다.** 열한 건 모두 **건별 승인**이고 **그 승인은 각자의 push에서 끝났다.**
> **"저번에 게이트 없이 올렸으니까"는 승인이 아니다** — `AGENTS.md` §1의 문장 그대로다.
> **다음 push는 그 시점의 변경 내용으로 다시 판단한다.**

#### 2026-08-28 — 창 안 추가 `main` push (W1 이후 예외)

**W1 이후에 `main` push가 한 번 더 발생했다.** 아래 "`main` push 금지" 규칙의 예외이며,
사유·판단 주체·전제를 남긴다 `[사용자 결정, 2026-08-28]`.

| 항목 | 값 |
|---|---|
| 대상 커밋 | `be520c3`(수정 3건) + `861051c`·`3fe6fc1`·`6725c96`·`4a78a0d`(문서). **push 후 `origin/main` = `4a78a0d`** (`ls-remote` 실측) |
| 사유 | **W1으로 배포된 프론트가 `ExitGuard`의 `ReferenceError: React is not defined`로 깨져 있다.** 게임 중 이탈 다이얼로그와 앱 내부 이동 전체가 죽는다. 수정을 올리지 않으면 창이 끝나도 그 상태가 남는다 |
| 전제 | **유지보수 게이트가 켜져 있다.** 배포돼도 사용자에게는 점검 화면이 뜬다. 게이트는 이 작업에서 건드리지 않았다 |
| 규칙 해석 | "`main` push는 W1에서만"은 **창 밖 push를 막는 규칙**이다. 지금은 창 안이고 게이트가 켜져 있어 규칙이 막으려던 위험(게이트 없는 상태에서 미배포 RPC를 호출하는 프론트가 뜨는 것)이 성립하지 않는다 |
| 이 push가 고치지 **못한** 것 | **`wiki-snapshot`의 429.** Edge Function은 Vercel 배포에 포함되지 않는다. **W8이 그것을 해결했고 싱글 경로는 통과했다** — 그러나 **그룹 경로는 여전히 502**다 (§5.5 발견 3) |
| DB 영향 | 없음. migration·RPC 무변경, 운영 DB 접근 없음 |
| 결과 | **성공.** 점검 화면 유지 확인, ExitGuard 정상 동작 확인 |

기록 위치: 이 절과 `docs/ops/CUTOVER-LOG-2026-08-27.md` §W1-a.

### `main` push 금지 — **근거가 두 번 바뀌었다. 지금이 가장 강하다 (2026-09-02)**

> **금지 근거의 이력.** ① 원래는 "운영 DB에 V2 RPC가 없어 프론트가 없는 RPC를 호출한다"였다 →
> W6·W7이 그 전제를 지웠다. ② 2026-08-28에 **"유지보수 게이트가 유일한 방패다"** 로 바꿨다 →
> **W10이 그 게이트를 껐다.** ③ **지금의 근거: 방패가 없다. `main` push는 곧 사용자 노출이다.**
> **약해진 것이 아니라 강해졌다** — ②에서는 잘못 올려도 점검 화면이 받아냈지만 지금은 받아낼
> 것이 없다. `AGENTS.md` §1.1도 같은 내용으로 갱신했다. 두 문서가 어긋나면
> **상시 규칙인 `AGENTS.md`가 우선한다.**

**여전히 사실인 것**

- **`origin/main`은 Vercel 프로덕션 배포와 연동되어 있다. main push는 즉시 배포를 트리거한다.**
- 백업 push는 `origin/feat/group-final-gaps`로만 한다. Vercel Production Branch = `main`,
  Ignored Build Step = Automatic이므로(사용자 확인, 2026-08-20) 이 브랜치 push는 프로덕션 배포를
  만들지 않는다. preview 배포 생성 여부는 미확인.

**바뀐 것**

- **"미배포 RPC 호출" 위험은 2026-08-28 W7에서 해소됐다.** 당시 운영 `public` 함수는 7개에서 **36개**가 됐고 legacy RPC
  2개는 삭제됐다. **2026-09-28에는 migration 3개가 더 적용돼 사용자 검증 함수 수가 43개가 됐다** (상단 상자). 프론트/DB 버전은 사용자 보고 기준 `fc46c95`와 migration 15개로 맞춰졌다.
- **`PROD-SNAPSHOT-2026-08-20.md` §2의 "함수 7개 / V2 RPC 30개 부재"는 무효다.**
- ~~**유지보수 게이트가 유일한 방패다.**~~ → **게이트가 없다 (2026-09-02, W10).**

**새 금지 근거 — 지금 main push가 위험한 이유**

1. **막아 주는 것이 아무것도 없다.** `origin/main` push → Vercel 프로덕션 배포 → **그 순간부터
   실사용자가 그 코드를 쓴다.** 이전 두 근거(미배포 RPC / 게이트 뒤)는 **둘 다 완충재가 있는
   상태를 전제했는데, 지금은 완충재가 없다.** 잘못 올린 것을 되돌리는 방법은 이전 배포로
   롤백하는 것뿐이고 그 사이의 사용자 세션은 되돌아오지 않는다.
2. **되돌리기가 대칭이 아니다.** 게이트를 다시 켜는 것도 **재배포**다 (`VITE_*`는 빌드 시점
   인라인 — F11). 즉 "일단 올리고 문제 있으면 게이트를 켜자"는 경로는 **한 번 더 배포를 태우는
   것**이지 즉시 차단이 아니다.
3. **DB는 이제 되돌릴 수 없는 쪽이다.** legacy RPC 2개가 삭제된 상태이므로 **구버전 프론트로의
   롤백은 깨진다** (`code/18-...md` §롤백 주의사항). 되돌릴 수 있는 범위는 **창 이후 커밋 사이**로
   한정된다.

→ **결론: main push는 계속 건별 승인 대상이며, 확인할 것이 바뀌었다.**
"RPC가 있는가"(~~①~~) → "`VITE_MAINTENANCE`가 여전히 `true`인가"(~~②~~) →
**"이 변경을 실사용자에게 지금 노출해도 되는가"**. 즉 **배포 전 검증이 승인 조건이 됐다** —
`npm test`·`npm run build`·해당 경로 수동 확인. 상시 규칙: `AGENTS.md` §1.1.

---

## 4. 진행 중인 작업

- **15b — 완료·feat 통합 (2026-09-29, `777ecdf`·`fd6f916`). 운영 미적용·미배포.** 다음은 **15c**(finalizer XP 지급).
  **15c 배포 때 `20260929090000`을 함께 적용한다** — 순서는 migration → 프론트. 상세는 상단 ⚑ 2026-09-29 상자.

**2026-09-28 현황:** 트랙 C와 15a의 migration 3개 및 C 프론트는 운영에 반영됐다 (§3 #4). 결과 화면 hotfix도 배포·운영 재확인했다 (§3 #5). 아래의 "통합만 됨/운영 12개/배포하지 않는다"는 2026-09-04~06의 진행 이력이다. 현재 남은 항목은 **D1 GitHub secrets 등록·첫 실행 확인**, **체크리스트 14번**, 부채 ③의 정량 검증이다. **D6 로컬 시드 실측은 완료**했다. 3코스 창 자체는 아직 열지 않았다.

- ~~**트랙 A·B — 코드 완료, 배포 전**~~ → **배포됨 (2026-09-03).** A·B·N2가 `a784d2e`로
  `main`에 올라가 **실사용자에게 닿았다** (§3의 ⚑ 상자). **`npm test` 204/204 ·
  `npm run build` exit 0 · migration 0 · 운영 DB 미접근 — 프론트 전용 배포다.**
  **이 항목의 진행 축이 닫혔다** — 남은 것은 운영 확인 2건(그룹 참가자 행 · 이미지 fallback
  실경로)이며 §3 상자에 등재했다. 상세는 §5.0의 2026-09-03 블록과 `TRACKS.md` §8-A·§8-B 완료 행.
- ~~**다음 트랙 — C(14)는 G7 대기, 15a는 착수 가능 (2026-09-03 재확인).**~~
  → **15a는 완료·통합됐다 (2026-09-04, `1af9f93`). C는 여전히 G7 대기다.**
  `npm test` **252/252** · pgTAP **128/128** · `npm run build` **exit 0** ·
  `supabase:preflight` **11/11 유지** (§2). 산출물은 예고대로 **migration 파일까지이며
  운영 적용은 하지 않았다** — 저장소 13개 ↔ **운영 12개** (`AGENTS.md` §1, R6).
  **`main`에도 올리지 않는다: migration을 담은 브랜치이므로 3코스 창의 일부다.**
  **이 항목의 진행 축이 닫혔다** — 상세는 §5.0의 2026-09-04 블록과 `TRACKS.md` §8-D 완료 행.
- ~~**C는 여전히 G7 대기다** (2026-09-04)~~ → **트랙 C 완료·통합됐다 (2026-09-06, `ab5af95`).
  웨이브 2가 끝났다.** `npm test` **322/322** · pgTAP **148/148**(신규) + **128/128**(15a 회귀) ·
  `npm run build` **exit 0** · `supabase:preflight` **11/11 유지** · §2.3 불변식 **7/7** (§2).
  산출물은 **migration 2개를 포함하며 운영 적용은 하지 않았다** — 저장소 **15개** ↔ **운영 12개**
  (`AGENTS.md` §1, R6). **`main`에도 올리지 않는다.**
  **다만 C의 migration 2개는 3코스 창을 기다리지 않는다** — 순수 가산이라 창 없이 적용 가능하고,
  **프론트 배포보다 먼저 적용해야 한다** (§5.0-D7). **이 항목의 진행 축이 닫혔다** —
  상세는 §5.0의 D절과 `TRACK-C-HANDOFF.md`.
- **⚠ 지금 코드로 열려 있는 트랙이 없다 (2026-09-06).** **웨이브 2의 다섯 트랙이 전부 통합됐다**
  (A · B · N2 · D(15a) · C, merge 충돌 전건 0). 15b는 **3코스 창**, 15c는 **창**을 기다린다
  (**트랙 C 의존은 해소됐다**). 다음 세션의 선택지는 **§5.0-B 이월 항목**, **§5.0-D의 등재 4건
  (D2·D3·D4·D6)**, 또는 **3코스 창을 여는 결정 자체**다.
- **저장소 구조 정비 — 완료 (열거된 3건 기준).** (a) 상시 가드레일 `AGENTS.md` 분리, (b) 운영 실측
  `docs/ops/` 편입(`PROD-SNAPSHOT-2026-08-20.md`·`CUTOVER-PLAN.md`), (c) 이 파일 신설 — 3건 모두
  저장소에 존재한다 (2026-08-27 확인 `[산출물]`). **"구조 정비"의 추가 범위는 문서에 정의된 적이
  없으므로 이 항목은 원래 열거된 3건에 대해서만 완료로 판정한다.** 그 밖에 정비 대상이 있다면
  새 항목으로 세워야 한다.
- **유지보수 게이트 — 완료 (`b24744e`, 2026-08-21). 운영에서는 켰다가 껐다 (W0 → W10).**
  `utils/maintenanceGate.js`, `components/MaintenanceScreen.jsx`, `main.jsx` 분기. 계약은
  `tests/maintenanceGate.test.js` 13개로 고정, 사용법은 `README.md` §유지보수 게이트. 로컬
  확인(점검 화면 렌더·`?bypass=` 진입·새로고침 유지·`?bypass=off` 해제)까지 끝났다
  (CUTOVER-PLAN §7 P1~P3). **W0에서 켜(2026-08-27) 창 전체와 창 밖 후속을 그 뒤에서 진행했고,
  W10에서 껐다(2026-09-02).** 끄는 방법은 `false` 설정이 아니라 **환경변수 삭제**였다 —
  `isMaintenanceFlagEnabled`가 정확히 `"true"`만 활성으로 보므로 판정이 같다
  (`utils/maintenanceGate.js:26`) `[코드]`. Vercel Type은 `Secret`이 아니라 **`Config`** 다
  (`VITE_*`는 번들 인라인이라 Secret 저장이 거부된다).
  **`VITE_MAINTENANCE_BYPASS`는 지우지 않았다** — 다음 창에서 다시 쓴다.
  **게이트 코드는 그대로 두고 다음 창에서 재사용한다. 제거 대상이 아니다.**
- Packet 13은 커밋됨(`339fb77`). 코드 작업은 종료.
- **cutover 창 — 최종 종료 (2026-08-27~28 창 + 창 밖 후속 ~2026-09-02).**
  W0~W9를 2세션으로 실행했다. **W6에서 migration 11개 전량 적용 성공, W7 전항목 통과,
  W8 Edge Function 2개 배포 성공.** W9에서 결함 6건이 나와 2건은 창 안에서 고쳤고
  **4건이 미해결이라 W10을 하지 않고 G3 경로로 창을 닫았다.** 롤백은 발생하지 않았다.
  **창 밖 후속에서 그 4건을 전부 종결하고 W10까지 마쳤다** — 순서는
  **① 프론트 배포(W1-b) → ② `functions deploy wiki-snapshot`(W8-b) → ③ 4인 재스모크(W9-b,
  502 0건) → ④ 발견 6 종결(스펙 범위 밖) → ⑤ W10(게이트 해제)**. ①②를 뒤집었다면 관전 화면이
  깨졌을 것이다 (§5.4-1·2). 실행 기록: **`docs/ops/CUTOVER-LOG-2026-08-27.md`**.
  **다음 창의 범위는 이 창의 이월 항목이 아니라 새 작업이다** (§5).
- **W9 발견 4 "유효하지 않은 RETIRE 사유" — 해소 (2026-09-02 W1-b 배포).**
  `pages/GroupGamePage.jsx:1267`·`:1434`·`:1491` 3줄을
  `onClick={() => handleReturnToLobby("left")}`로 교체했다. 원인은 RPC 계약 불일치가 아니라
  **`onClick` 직접 바인딩으로 React SyntheticEvent가 첫 인자에 들어간 것**이었다.
  분기별 근거·불변식·`"left"` 선택 이유는 **§5.5-4**.
  `npm test` **142/142**, `npm run build` **exit 0** —
  기준 커밋 `357a330`에 이 3줄만 얹은 상태에서 측정했다 (측정 시점은 커밋 전), 2026-08-29 `[산출물]`.
  **게이트 해제 전에 배포돼야 한다** — 운영 번들은 아직 결함을 갖고 있다.
- **W9 발견 3 `wiki-snapshot` 요청 감축 — 해소 (2026-09-02).**
  §5.4-1(스냅샷 재사용 조기 반환)과 §5.4-2(`fetchRevisionIds` 제거)를 **한 번에** 적용했다.
  같은 파일이라 배포 단위가 하나다. **cold 61 → 31, warm 61 → 0, 4인 대기실 244 → 124건**
  (`scripts/wikiSnapshotRequestCount.mjs` 실측, §2).
  **프론트(W1-b) → Edge Function(W8-b) 순서를 지켜 배포했고**, 그 뒤 4인 재스모크(W9-b)에서
  **대기실 준비 버튼 502가 0건**이었다 `[사용자 보고]`. **대기실이 절반만 줄었는데도 통과했다** —
  §5.4-3(백오프)은 그래서 **넣지 않는다.**
- 디자인 개편: 저장소 밖에서 별도 진행 중. 확정 시안 산출물 없음 (`code/10-CODE-MASTER-TODO.md` §2 순서 7 = `[~]`).
- **`GROUP_SPECTATOR_MIGRATION.sql`(저장소 루트) — 폐기 판정 (2026-08-29). 파일은 보존한다.**
  ~~미적용 제안 파일이며 의도적으로 미추적 상태다.~~ **미적용인 것은 맞지만 "아직 적용 안 함"이
  아니라 "적용하면 안 됨"이다** `[코드]`. 이 파일은 `participant_status`/`left_at`/`leave_reason`과
  `group_match_results.result_status in ('finished','dnf')`를 세우는 **구형 제안**인데, 운영에 적용된
  v13 계열은 `player_status`/`retired_at`/`retire_reason`과 `result_status`에 `'retired'`를 쓴다
  (`20260807003609_group_match_lifecycle_phase2a.sql:88-89`,
  `20260814103000_group_final_gaps_v13.sql`).
  **적용하면 v13 계약이 깨진다. 그리고 제약 이름이 겹치지 않기 때문에 더 나쁘다** `[코드]` —
  이 파일은 `group_match_results_status_check`를 drop/create 하는데 운영에 있는 것은
  `group_match_results_result_status_check`다. **`drop constraint if exists`가 v13 제약을 지우지
  못하므로 두 CHECK가 동시에 남고**, 교집합은 `'finished'` 하나뿐이 되어
  `leave_group_player`가 기록하는 `'retired'` 행이 **거부된다.** `room_players`도 마찬가지로
  v13의 `player_status`(`:52-53`)와 무관한 `participant_status` 컬럼을 하나 더 세운다.
  **AGENTS.md §4에 따라 삭제하지 않고 미추적으로 보존하며, 파일 서두에도 같은 판정을
  주석으로 남겼다.**

---

## 5. 다음 작업

**2026-09-28 현재:** D1 워크플로는 #6으로 기본 브랜치에 반영한다. **secrets 등록·첫 실행**을 기다린다. D6 로컬 시드 리허설은 완료했다 (§5.0 D절). 운영에서 결과 화면 hotfix를 재확인했으나 **아이템으로 목표 도착(체크리스트 14번)**은 아직 재현하지 않았다 (`docs/agent/TRACK-C-HANDOFF.md` §3.6). 아래 2026-09-02~06의 착수 순서와 "운영 migration 12개" 문구는 **당시 계획/이력**이며 현재 값은 상단 2026-09-28 상자와 §3을 따른다.

### 5.0 지금 할 일 — **2026-09-02 재작성**

**cutover가 끝났으므로 이 절의 성격이 바뀌었다.** 창을 열기 위한 선행 조건 목록이 아니라
**서비스가 열린 상태에서의 작업 목록**이다. 아래 5.1~5.6은 그 판단에 이른 경로의 기록이며
**작업 지시로 읽지 않는다** — 지시는 이 절이다.

> **▶ 가장 최근 상태는 이 절 끝의 D절이다 (2026-09-06).** 웨이브 2가 닫혔고
> **3코스 창 범위와 배포 순서가 D7에서 확정됐다.** A·B·C 블록은 그 앞의 경로 기록이다.

**A. 재스모크가 남긴 잔여 관찰 3건 (W9-b, 2026-09-02)**

| # | 항목 | 확정된 것 | 미확정 | 등급 |
|---|---|---|---|---|
| **A1** | **관전 이모티콘 쿨타임이 콘솔 에러로만 드러난다** — `spectator_emoji_v13` **400 × 3** | **의도된 동작이다.** `last_sent_at > now - interval '3 seconds'`면 `SPECTATOR_EMOJI_RATE_LIMIT`을 raise한다 (`20260814123000_group_spectator_emoji_atomicity_fix.sql:132-133`) `[코드]` | 화면에 쿨타임을 알리는 경로가 있는지 | **UX 개선.** 결함 아님. 400이 정상 동작이라는 것을 화면이 말하지 않는 것이 문제다 |
| **A2** | **`group game realtime disconnected: CLOSED`** (게임 종료 시점) | 로그 지점은 `pages/GroupGamePage.jsx:768` `[코드]`. **정리 경로에서 나온 `CLOSED`라면 `:766`의 `realtimeChannelRef.current !== channel` 가드가 먼저 반환한다** — 즉 **콘솔에 찍혔다는 것은 그 가드를 통과했다는 뜻**이고, 같은 분기가 `:769`에서 `setPhase(RECOVERING)`까지 실행한다 | **원인.** "게임 종료 시점 채널 정리"는 **추정이며 위 코드와 정합하지 않는다** — 정리 경로였다면 `:779`가 ref를 먼저 `null`로 만든 뒤 `:781`이 `removeChannel`을 부르므로 가드에 걸려야 한다 | **조사.** 진행 중 끊김은 관측되지 않았으나 **무해하다고 단정할 수 없다** — 화면 영향이 왜 없었는지도 미확정이다 |
| **A3** | **관전자 ↔ 관전자 이모티콘 전달** | 송신·구독·RLS·publication 경로는 코드상 정상으로 읽힌다 (§5.5-6) | **전달 여부.** 4인 중 완주자가 1명이면 관전자도 1명이라 조건을 만들지 못했다 | **검증.** 결함 판정이 아니다 — 발견 6은 스펙 범위 밖으로 종결됐다. 확인 방법은 §5.5-6 |
| **A4** | **cold 문서 로딩 지연** (2026-09-03 배포 전 로컬 스모크에서 관측) `[사용자 확인]` | **구조가 §5.4에 이미 측정돼 있다.** cold 스냅샷은 감축 후에도 **31요청**이고 warm은 **0**이다 (§5.4-1·2 표). **즉 지연은 캐시 미스의 정상 비용이며 이 배포가 만든 것이 아니다** — 배포 범위에 `wiki-snapshot` 변경이 없다 (§3 상자) | **체감 지연의 크기와 어느 경로에서 나오는지.** 대기실 준비 경로는 문서가 전원 distinct라 **구조적으로 전부 cold**다 (§5.4-1·2의 4인 환산 124건) | **관찰. 배포 차단이 아니었다.** §5.4-3이 백오프를 넣지 않기로 판정했고 그 판정은 유지된다. **다음 레버는 §5.4의 1번(스냅샷 재사용)이며 대기실 경로에는 듣지 않는다** — 그 한계도 §5.5-3에 이미 기록돼 있다 |

> **A4를 새 결함으로 세우지 않는 이유.** 같은 현상이 **이미 측정·판정된 구간에 들어간다** —
> §5.4가 요청 수를, §5.5-3이 대기실 경로의 한계를, §5.4-3이 백오프 기각을 각각 담고 있다.
> **새로 등재한 것은 "사용자가 체감했다"는 사실 하나다.** 그것이 판정을 바꾸려면
> **어느 경로에서 몇 초인지**가 필요하고, 지금은 없다 (`미확인`).

> **A1·A3은 급하지 않다.** A1은 사용자가 "안 눌리네"로 겪을 뿐 기능이 깨지지 않고,
> A3은 스펙이 요구하지 않는 동작이다. **A2가 유일하게 성격이 불분명한 항목이다.**

**B. 창이 남긴 이월 — 게이트가 열려 우선순위가 올라간 것들**

| # | 항목 | 왜 지금 올라가나 | 위치 |
|---|---|---|---|
| ~~**B1**~~ | ~~**새 운영 스냅샷 `PROD-SNAPSHOT-YYYY-MM-DD.md`**~~ | **완료 (2026-09-02) — `docs/ops/PROD-SNAPSHOT-2026-09-02.md`.** 테이블 21 / 함수 36 / RLS off 0 / 이력 12행 / publication 4 / users 145 · `game_records` 59를 실측했고, 08-20 대비 변화를 migration별로 매핑했다. **`2026-08-20` 파일은 역사 기록으로 보존한다** | **남은 공백은 그 문서 §9** |
| **B2** | **모바일 viewport / 키보드 / reduced-motion** | **실사용자가 먼저 밟는다.** 게이트 뒤에서는 미룰 수 있었다 | §8.2-4 |
| **B3** | **불변식 모니터링** | 같은 이유. `game_move_events`·`game_mutation_requests`·`match_history.result_status`·`game_records.run_id` | §8.2-5 |
| **B4** | `target-level` Edge Function 존재 확인 | §8.1-7의 마지막 미완 항목. 운영 조회 1회면 끝난다 | §5.6-4 |
| **B5** | `qa/30-INTEGRATION-CHECKLIST.md` §22 새 게이트 기록 | 창 결과를 체크리스트에 등재 | §5.6-8, CUTOVER-PLAN §10.2 |
| **B6** | 1:1 2세션 Realtime 수동 검증 / 권한 거부 SIGSEGV 관측(U6) / B2 하네스 | 창에서도 창 밖에서도 수행되지 않았다 | §5.3, §8.2-1·2·3 |

**C. 기능 작업 — 미구현 패킷 14~17**

> ### ▶ 이 항목의 상세는 **`docs/agent/PACKET-CONTRACT-GAPS.md`** 다
>
> **계약 고정이 여러 세션에 걸치므로 조사 결과를 그 문서에 모았다** (2026-09-02).
> 패킷 간 의존, 계약 공백 **G1~G20**, 시안 78화면 × 10섹션 대조, 오늘 3코스 전환 판정,
> **W0~W3 착수 순서**가 거기 있다. **패킷 작업을 시작하는 세션은 그 문서부터 읽는다.**
>
> **판단 8건이 확정됐다 (2026-09-02)** `[사용자 결정]`:
> **G1** reward 3테이블 = **공통 계약**(어느 패킷에도 소유권 없음) ·
> **G2** 아이템 이벤트 = **`room_events`**(publication에 이미 있어 **창 불필요**) ·
> **G3** 3코스 창 = **15 착수 후 코스별 랭킹 도달 시점** ·
> **G11** reason = **통일 대신 5값 유지 + 표시 매핑** ·
> **시안 4건** G16=55 / G17=20·15·25 / G18=범위 밖 / G19=`변칙`.

> ### ▶ **W0 공통 계약이 동결됐다 (2026-09-02) — `docs/contracts/`**
>
> **패킷 단위로 고정하면 닫히지 않던 항목들을 먼저 동결했다.** 소유자는 전부 **공통**이며
> **어느 패킷도 재정의하지 않는다.**
>
> | 계약 | 닫은 공백 | 핵심 |
> |---|---|---|
> | **C1** 보상 3테이블 | G1 | **복합 FK가 "미보유 장착"을 DB에서 막는다.** 배지 3개 제한도 구조로 강제 |
> | **C2** XP 원장 | G4 | **`xp_class` 3종**(`gameplay`/`achievement`/`admin`)이 "업적 XP는 주간 제외"를 한 줄로 만든다 |
> | **C3** 레벨 저장 위치 | G6 | **`profiles.total_xp`.** `user_profile_stats`는 **본인만 RLS**라 쓸 수 없다. **레벨은 저장하지 않고 함수로 계산** |
> | **C4** 결과 사유 어휘 | G11 | 저장 7축 전수 + **완주/기권/리타이어/몰수 매핑** |
> | **C5** 프로필 카드 | G10 | **DDL 0.** 4곳이 아니라 **5곳**이고 지금 바로 착수 가능 |
>
> **계약이 새 공백 4건을 드러냈다** — 그중 **`C3-①`은 보안 문제다.**
> `total_xp`를 `profiles`에 두면 `ProfilePage.jsx:86·149`의 **클라이언트 직접 update로
> XP 위조가 가능하다.** **15 착수 전에 답해야 한다.**
>
> **남은 질문:** **G7**(아이템 ID) · **C3-①** · **C2-③**(XP 겹침) · **C5-②**(스냅샷 확장) ·
> **G2-②**(`room_events` INSERT 회수) · **C1-④**(기본 아이콘 ID).

> ### ▶ **결정 3건 확정 + 창 범위 4항목 확정 (2026-09-02, 2차)** `[사용자 확정]`
>
> | # | 결정 | 결과 |
> |---|---|---|
> | **1** | **C3-① grant 컬럼 = 3개** — `nickname` · `profile_image_url` · **`updated_at`** | **C3 계약을 정정했다** (동결 문서 최초 정정). `C3-LEVEL-STORAGE.md` **§0 정정 이력** · **§5.1 확정 DDL** · `contracts/README.md`에 정정 이력 표 신설. **`total_xp`는 목록 밖이라 그대로 보호된다** |
> | **2** | **G2-②(`room_events` INSERT 회수)를 3코스 창에서 제외** | **순서를 뒤집었다:** 14가 서버 INSERT(SECURITY DEFINER)로 전환 → 프론트 배포 → **클라이언트 경로 부재 확인** → **별도 창(W2″)**. 선례는 `send_group_spectator_emoji_v13`. **회수를 포기한 것이 아니라 경로가 사라진 뒤로 미룬 것이다** |
> | **3** | **`highlight_links` 이중 등록** | 트랙 C는 **`MULTI_ITEM_IDS`만** 수정하고 **`SINGLE_ITEM_IDS`는 동결.** 파일 단위로 표현할 수 없는 제약이라 **티켓 문구와 grep 불변식으로 강제한다** |
>
> **3코스 창 = 4항목.** **(2026-09-06 재확인 — 4항목 그대로다. 최종 정리와 migration 3개의
> 창 판정·배포 순서는 D7에 있고, 창 전 `daily_challenge_pool` 시드가 D6에 등재됐다.)**
> ① `daily_challenges` 제약 교체 + `course_slot` ② `game_records.result_status`
> CHECK **1건**(`match_end_reason` 제외) ③ `profiles` 컬럼 단위 grant 축소 **3컬럼**
> ④ `profiles.total_xp` 추가. **순서 ③ → ④** (컬럼 단위 grant가 나중 컬럼을 덮지 않으므로
> 이 순서면 `total_xp`가 구조적으로 보호된다).
>
> **게이트 최종 판정: 없이 가능하다** `[추정]`. **성립 조건 3개** — ③이 3컬럼 · **①의 함수
> 재생성이 ACL을 복구** · T5 스모크를 실사용자 경로로 수행. **창 절차 초안 T-1~T6은
> `TRACKS.md` §7.6**이며 8월 W0~W11에서 **W0·W1·W2.5·W3·W4·W8·W10을 뺐다** (근거 각각 기재).
> **롤백 성격이 8월과 다르다 — 4항목 전부 역DDL이 있고 데이터 손실 DDL이 0이다.**
>
> **⚠ 새 발견 2건.**
> ① **`ensure_today_daily_challenge`는 `create or replace`로 교체할 수 없다** — 반환
> `table(...)`에 `course_slot`을 넣으면 반환 타입이 바뀌어 **`drop function`이 필요하다** `[코드]`.
> 같은 트랜잭션 안 재생성이라 게이트 사유는 아니지만 **`drop`이 ACL을 지우므로 `anon` EXECUTE를
> 복구해야 한다** — 빠뜨리면 **게스트의 오늘 코스가 사라진다.** `PACKET-CONTRACT-GAPS.md`
> §5.5.2의 "함수 삭제 없다" 전제를 정정했다.
> ② **공유 자원 겹침 7건** — 파일은 갈렸는데 **배열·복제된 문자열 리터럴·CSS 클래스 이름·훅 반환
> 형태**를 공유한다 (`TRACKS.md` §2.3). **화이트리스트가 잡지 못하는 종류다.** 가장 나쁜 것은
> **`"wiki-single-items"` localStorage 키** — import 없이 **문자열이 4곳에 복제**돼 있어
> 한쪽이 바꾸면 다른 쪽이 조용히 아무것도 지우지 않는다.

> ### ▶ **C4-① 확정 · 창 ACL 절차 보강 · A·B 착수 (2026-09-02, 3차)** `[사용자 확정]`
>
> **C4-①(부제 문구)이 닫혔다. 규칙은 `시안 > 코드 > 발명`이다.**
>
> | `retire_reason` | 확정 부제 | 출처 |
> |---|---|---|
> | `time_limit` | **제한 시간 초과** | **코드** — `groupResultFormatter.js:2`가 운영에서 쓰는 문자열 |
> | `grace_timeout` | **유예 시간 초과** | **코드** — `:3` |
> | `disconnected_timeout` | **재접속 유예 종료** (용어는 **몰수**) | **시안** §07 RESULT |
>
> **`"연결 끊김"`과 `몰수`는 같은 상태다** `[코드 확인]` — 따라서 **정정이고, 둘 다 필요한 것이
> 아니다.** 근거 셋: ① `formatGroupRetireReason`은 **`retire_reason`만** 받는다
> (`GroupGamePage.jsx:1336`·`:1483`) ② `"연결 끊김"` 문자열은 저장소에 **한 곳**뿐이다
> ③ **살아 있는 끊김 상태(`player_status = 'disconnected'`)에는 라벨이 아예 없다** —
> `INACTIVE_STATUSES`에 그 값이 없어서 유예 중 참가자는 `진행 중`으로 렌더된다
> (`groupGameFlow.js:14-22`). **즉 그 문자열이 다른 상태를 표시하고 있던 것이 아니다.**
>
> **두 문자열은 서로 다른 슬롯에 있다.** 헤드라인은 지금 **`"RETIRE"` 고정**이고
> (`GroupGamePage.jsx:1479`) 구분은 부제에서만 난다 — **4용어 매핑은 아직 코드에 없다.**
> 그래서 정정 대상은 둘이다: 부제 문자열 1개 + 헤드라인 4용어.
> **실행 트랙은 그룹 결과 화면 소유자다 — 트랙 B가 아니다.** `groupResultFormatter.js`의 유일한
> 소비자가 **동결된 `GroupGamePage.jsx`**이고 테스트가 옛 문자열을 assert한다.
> **정답은 B의 신규 `utils/resultReasonLabels.js`에 먼저 담긴다** (C4-③ = 신규 모듈로 확정).
>
> **창 절차에 ACL 3지점을 보강했다** (`TRACKS.md` **§7.9** 신설):
> **T-1 스냅샷**(`pg_proc.proacl` + `aclexplode` 쿼리 2개 — `drop` 전에만 뜰 수 있다) ·
> **T3에서 같은 트랜잭션 안 `grant execute ... to anon/authenticated/service_role`** ·
> **T4 검증 3번이 T-1 스냅샷과 대조** · **T5에 게스트 오늘 코스 스모크**.
>
> **⚠ 그 과정에서 2차 갱신의 서술 하나를 자체 정정했다.**
> "ACL 재부여를 빠뜨리면 게스트의 오늘 코스가 사라진다"는 **기제가 틀렸다** — 함수는 grant를
> 하지 않으면 **`PUBLIC`에 EXECUTE가 붙는 것이 기본값**이라 `anon`도 실행된다.
> **진짜 함정은 반대쪽이다:** `contracts/README.md`의 신규 RPC 패턴
> (`revoke all ... from public, anon`)을 이 함수에 적용하면 **게스트 경로가 끊긴다.**
> **이 함수는 그 패턴의 예외라고 §7.9에 명시했다.**
>
> **착수 트랙은 A·B다.** 둘 다 선행 0이고 **DB를 건드리지 않는다.**
> **C는 G7이 차단**이고, **D는 코드 충돌이 0인데도 순차다** — 충돌 축이 파일이 아니라
> **로컬 Supabase 스택**이기 때문이다. 티켓은 착수 가능 상태로 다듬었다
> (`TRACKS.md` §8-A·§8-B — 읽을 파일 3분류 · §2.3 공유 자원 중 각 트랙이 걸리는 항목 ·
> `npm test` 신규 항목 · **grep 불변식 7~8개** · 첫 수).

> ### ▶ **A·B 완료 — 통합됐다 (2026-09-03)** `[산출물]`
>
> **넷 중 둘이 닫혔다.** 자세한 실측은 `TRACKS.md` **§8-A·§8-B 완료 행**이다.
>
> | 트랙 | 상태 | 산출 | 남긴 것 |
> |---|---|---|---|
> | **A** C5 프로필 카드 | **✅ 완료** `e70c541` → `b3da192` | 신규 5파일(`utils/profileCard.js` · `ProfileCard.jsx` · `ProfileAvatar.jsx` · `css/profileCard.css` · 테스트 17건) · **닫은 지점 6곳** · **이름 fallback 8종 → 2종** | **4곳(전부 C 소유)** + **부채-1** |
> | **B** 17a-2 기록·게스트 | **✅ 완료** `7a7197e` → `527f896` | 신규 3파일(`utils/resultReasonLabels.js` + 테스트 42건) · **싱글 순위를 서버가 센다** · **게스트 경계 3지점** | **부채-2** |
> | **C** 14 아이템 서버 권위 | **대기 — G7이 여전히 차단** | — | **선행 하나가 풀렸다:** B가 `utils/resultReasonLabels.js`를 먼저 만들어 뒀으므로 **C의 1:1 결과 표시는 막히지 않는다** (`TRACKS.md` §8-B 의존) |
> | **D** 15a XP 원장 | ~~착수 가능~~ → **✅ 완료 · 통합됨 (2026-09-04)** `020daaa` → `1af9f93` | 신규 5파일 · `npm test` **+48** · **pgTAP 128** · **migration 1개** | **배포하지 않는다 — 3코스 창 대기** |
>
> ~~**다음 트랙은 D(15a)다.**~~ → **D는 끝났다 (2026-09-04).** C는 G7(아이템 ID 확정)이
> 사람 결정이라 코드로 풀 수 없다. **남은 열린 트랙이 없다** — 아래 2026-09-04 블록 참조.
>
> **⚠ A·B가 문서 수치 4건을 정정했다** (`TRACKS.md` 4차 갱신):
> §2.3-③ **12지점 → 13줄**(보호 키에 `floatingMessage` 추가) · §2.3-④ **합계 4 → 4파일 6줄** ·
> §2.3-⑥ **A의 `"left"`는 retire 어휘가 아니라 `textAlign` 값** · §5.2 **적용 지점 5 → 6, 이름
> fallback 6종 → 8종**. **전부 "문서 대 문서"가 아니라 코드를 실제로 만지면서 나온 것이다.**
>
> **`C5-①`(`"탐험가"`)은 확인 필요로 남는다.** §8-A 티켓이 확정값으로 적었고 A가 구현했지만
> **근거 문자열은 여전히 스펙에 없다.** `PACKET-CONTRACT-GAPS.md` §3.2.1에 그 사실만 등재했다 —
> **해소가 아니다.**

> ### ▶ **D(15a) 완료 — 통합됐다. 그리고 열린 트랙이 없어졌다 (2026-09-04)** `[산출물]`
>
> **넷 중 셋이 닫혔다.** 실측은 `TRACKS.md` **§8-D 완료 행**이고 수치는 §2에 있다.
>
> | 트랙 | 상태 | 다음 |
> |---|---|---|
> | **A** C5 프로필 카드 | **✅ 완료 → 배포됨** (2026-09-03) | — |
> | **B** 17a-2 기록·게스트 | **✅ 완료 → 배포됨** (2026-09-03) | — |
> | **D** 15a XP 원장 | **✅ 완료 → 통합됨** (2026-09-04) `1af9f93` | **3코스 창에서 운영 적용** |
> | **C** 14 아이템 서버 권위 | **대기 — G7이 여전히 차단** | **사람 결정이 필요하다. 코드로 풀 수 없다** |
>
> **⚠ 지금 코드로 진행할 수 있는 트랙이 없다.** 남은 셋이 전부 사람 결정이나 창을 기다린다:
> **C는 G7**(아이템 ID 확정) · **15b는 3코스 창** · **15c는 창 + C**. 이 상태에서 다음
> 세션이 집을 것은 트랙이 아니라 **§5.0-B의 이월 항목**(B2 모바일 · B3 불변식 모니터링 ·
> B4·B5·B6)이거나 **3코스 창을 여는 결정 자체**다.
>
> **C의 선행 작업 2건을 미리 치웠다 (2026-09-04).** C는 착수 시 `supabase:preflight`를
> 먼저 통과시켜야 하는데(§1.1-b의 CODE GO 유효 조건), 그 관문에 결함이 둘 있었다.
>
> | 커밋 | 무엇 | C에 왜 걸림돌이었나 |
> |---|---|---|
> | **`8a3c77f`** | standby EOF **오탐 제거** | **관문이 막힐 상태였다.** 창 밖 **91줄** 차이 — 로그가 조금만 더 쌓이면 **G7이 풀려도 C가 시작하지 못했다** |
> | **`5d40e32`** | P1·P2 — 크래시 탐지 **범위 확장** | **반대 방향의 문제다. 관문이 헐거웠다.** C는 **아이템 서버 권위 RPC + migration**을 만드는 트랙이라 pgTAP·동시성 검증을 많이 돌린다. **그 과정의 백엔드 크래시가 SIGABRT·SIGKILL이면 이전 탐지기는 보지 못했다** |
>
> **둘을 합쳐야 관문이 제 역할을 한다** — 하나는 정상을 실패로 만들었고, 하나는 실패를
> 정상으로 통과시켰다. 진단·수정·판정 근거는 §2, **CODE GO 판정에 미치는 영향은 §1**이다.
> **G7은 여전히 유일한 차단이다** — 이 작업이 그것을 대신 풀어주지는 않는다.
>
> **15b·15c는 3코스 창 이후다.** 지금 착수할 수 없는 것이지 미정인 것이 아니다.
>
> | 조각 | 무엇 | 왜 창 이후인가 |
> |---|---|---|
> | **15b** | `profiles.total_xp` · `grant_xp_v1` 교체본(`update profiles` 포함) · **주간/레벨 랭킹 RPC** | **창 항목 ③④ 그 자체다** — grant 축소 3컬럼 → `total_xp` 추가 순서(`TRACKS.md` §7.1). **컬럼이 없으면 교체본이 성립하지 않는다** |
> | **15c** | **결과 확정 경로 연결** — `finalize_group_room_if_expired` · duel 결과 · `apply_single_move_v2` | **둘이 겹쳐 막는다.** ① 운영에 `grant_xp_v1`이 없으므로(운영 migration 12개) 연결할 대상이 없다 ② **살아 있는 결과 경로를 바꾸는 일**이고 duel 쪽은 **트랙 C 소유**다 (`TRACKS.md` §6.3) |
>
> **15a가 "지급할 수 있는 원장"까지이고 "실제로 지급되는 상태"는 15c다** (`TRACKS.md` §6.3).
> **지금 원장에 행을 만드는 코드 경로는 저장소에 없다** — 그것이 15a를 창 무관으로 만든 성질이며,
> **통합만 하고 배포하지 않는 판단과 일관된다.**
>
> **계약 쪽 산출:** C2의 `확인 필요`가 ~~5건~~ → **3건(③④⑤)**으로 줄었다.
> ①`floor`·②KST를 **15a의 구현과 테스트를 근거로** 확정했다 (`C2-XP-LEDGER.md` §0).
> **③(XP 겹침)은 열린 채다** — 3열 유니크가 겹침을 허용하는 쪽이고, 좁히는 결정이 나면
> forward-only 보정이다.

> ### ▶ ~~**신규 결함 2건**~~ → **2건 전부 종결 (2026-09-03). 게스트 경계 완결** `[코드]`
>
> | # | 결함 | 상태 |
> |---|---|---|
> | **N1** | **`App.jsx` `GameRoute`가 완주한 게스트에게 거짓 메시지를 띄웠다** — `handleSaveRecord`가 `result?.serverFinalized`를 **게스트 판정보다 먼저** 보았다. 게스트 싱글 런은 서버에서도 `single_game_runs`에만 남고 **`game_records`에 행을 만들지 않는데** 화면은 **"서버에서 결과와 랭킹 기록을 확정했습니다"**라고 알렸다 (패킷 17 §6 위반) | **✅ B가 수정했다** (`7a7197e`, `App.jsx:93-102`). 게스트 판정을 앞으로 옮기고 **"게스트 기록은 저장되지 않습니다"**로 바꿨다. 부수적으로 **`alert()` 호출 1건이 `setSaveStatus`로 대체됐다** |
> | **N2** | **`MainPage.jsx:413` 랭킹 카드의 "전체 보기 →"가 게스트에게 열려 있다** — `/ranking`은 `ProtectedRoute`인데(`App.jsx:202-207`) 게이팅이 없어 **누르면 `/login`으로 튕긴다** | **✅ 해소 (2026-09-03)** `[사용자 확정]`. **조건부 렌더로 숨겼다** (`:416-420`) — 같은 파일이 같은 목적지(`/ranking`)를 이미 그렇게 처리하고 있었다(`:455-459`). 숨긴 자리에 **안내 문구**를 남겼다 (`:444-448`). **`disabled`+`aria-disabled`를 쓰지 않은 근거는 `TRACKS.md` §5.2-부채-2-a** — 요청된 테스트가 "진입점이 노출되지 않음"을 요구하고, `disabled`는 **노출된 채 동작만 죽는다.** **랭킹 탭 블록 범위 밖 규칙의 1회 예외**로 처리했다 |
>
> **둘 다 "게스트가 로그인 전용 경로를 만났을 때"의 같은 결함군이었다.** N1은 **거짓말을 했고**,
> N2는 **막다른 길로 보냈다.** **둘 다 닫혔으므로 패킷 17 §6 게스트 경계가 완결됐다** (2026-09-03).
>
> **검증** `[산출물]`: `npm test` **204/204**(+1, 계약 테스트 1건) · `npm run build` **exit 0** ·
> **게스트 로비를 실제 브라우저에서 확인** — `/ranking` 컨트롤 **0개**, 안내 문구 렌더,
> **TOP 3는 그대로 보인다**(공개 콘텐츠에는 손대지 않았다. 데이터 로딩에 게스트 분기가 없다 `:104-118`).
>
> **관측되나 이 변경과 무관한 것:** 게스트 로비에서 **400 두 건**이 콘솔에 남는다 —
> `guest-xxxx` id로 `fetchUserStats`·`fetchAllProfileStats`를 호출하는 경로다 `[산출물]`.
> **렌더 경로가 아니라 데이터 로딩 경로이며 이 커밋 이전에도 같았다.** 등급은 **조사**이고
> N1·N2와 같은 결함군(게스트 × 로그인 전용 자원)이라 **후속으로 등재한다.**

> ### ▶ **병렬 트랙 4개가 열렸다 (2026-09-02) — `docs/agent/TRACKS.md`**
>
> **트랙이 넷 동시에 열린 것은 처음이다.** 계약이 *무엇을 만드는지*를 고정했고,
> `TRACKS.md`가 **누가 어느 파일을 쓰는지**를 고정한다. **병렬 작업의 SSOT다** —
> 트랙을 시작하는 세션은 `PACKET-CONTRACT-GAPS.md` 다음에 그 문서를 읽는다.
>
> | 트랙 | 내용 | 선행 | 파일 성격 |
> |---|---|---|---|
> | **A** | C5 프로필 카드 공통 컴포넌트 | 없음 | 프로필·랭킹·공개 프로필·그룹 로비 |
> | **B** | 17a-2 기록·게스트 | 없음 | 싱글 게임·**싱글 결과**·게스트 경계·기록 데이터 |
> | **C** | 14 아이템 서버 권위 | **G7 — 차단** | 1:1 전 경로·아이템 카탈로그 |
> | **D** | 15a XP 원장·지급·감쇠 | 없음 | **전부 신규 파일.** 기존 파일 0 |
>
> **범위를 잘라서 넷이 됐다.** 결과 화면은 §7의 6영역으로 갈리지 않는다 —
> `ResultShell`이 코드에 없어서 **한 모드의 결과가 한 파일의 인라인 JSX**다.
> 그래서 **모드 단위로 나눴다**: 싱글→B · 1:1→C · **그룹→동결**.
> `pages/GroupGamePage.jsx`(1603줄)는 **이 웨이브에 소유자가 없다.**
>
> **15가 두 조각으로 갈렸다.** **15a**(원장·지급 RPC·감쇠·멱등성)는 창 무관이고,
> **15b**(`profiles.total_xp`·랭킹 정렬)만 C3-①에 종속된다. 성립 조건은
> **`grant_xp_v1`이 15a에서 `profiles`를 쓰지 않는 것** — 누적은 원장 합계로 계산한다
> (`TRACKS.md` §6.1). **결과 경로 연결은 15c로 또 한 번 떼어냈다.**
>
> ~~**3코스 창에 5항목을 묶었다**~~ → **4항목으로 확정됐다. G2-②가 빠졌다** — 위 블록 참조.
> **순서 의존 2건은 그대로다:** **C3-① → `total_xp`** · **15a → `total_xp`**.
>
> ~~**⚠ 게이트 재판정: G2-② 하나가 판정을 뒤집는다. 빼는 것을 권한다**~~
> → **제외로 확정됐다 (2026-09-02).** 판정 근거는 유지된다: 배포된 프론트가
> **10곳에서 직접 INSERT하고**(`MultiplayerGamePage.jsx:191-204`) `[코드]`, 회수하면
> **구버전 번들 drain 문제**가 남는다. **게이트 최종 판정은 "없이 가능"이다** (`TRACKS.md` §7.5).
>
> **⚠ 계약 문서 불일치 — 처음 3건에서 4건이 됐고, 그중 1건은 고쳤다** (`TRACKS.md` §9):
> ① **C5의 적용 지점은 8곳**이고 이름 fallback은 **6종**이다 (`나`·`상대`가 빠졌다)
> — **계약 문구는 그대로 두고 A의 완료 정의로 흡수했다**
> ② **C4의 "CHECK 2건"은 추가 1건**이다 — **창 범위가 1건으로 확정됐다**
> ③ **C3-①의 grant 목록** — **✅ 정정 완료. 3컬럼으로 확정** (위 블록)
> ④ **새로 찾은 것:** C4 §3.1이 "부제 문구가 시안에 없어 발명하지 않는다"고 적었는데
> **`utils/groupResultFormatter.js:2-3`에 운영 문자열이 이미 있다** `[코드]` —
> `time_limit`→"제한 시간 초과", `grace_timeout`→"유예 시간 초과". 반대로
> `disconnected_timeout`은 **코드 "연결 끊김" vs 계약 "몰수"로 어긋난다.**
> ~~**C4-①은 여전히 미결이지만**~~ → **확정됐다 (3차 갱신).** "발명 대신 기존 문자열 채택"이
> 채택됐고, `disconnected_timeout`은 **시안이 상위**라 코드가 정정 대상이 됐다. 위 3차 블록 참조.

**릴리스가 열렸으므로 이제 여기가 본류다.** 순서·선행 조건은
`wiki-race-2.0-handoff/code/10-CODE-MASTER-TODO.md` §2가 단일 기준이다.

| 순서 | 묶음 | 문서 | 선행 조건 | 상태 |
|---:|---|---|---|---|
| 3 | **1:1·아이템전** | `14-DUEL-ITEMS.md` | 서버 이벤트 계약 | `[ ]` |
| 4 | **XP·레벨·랭킹** | `15-XP-LEVEL-RANKING.md` | 결과 서버 권위 | `[ ]` |
| 5 | 업적·보상 카탈로그·프로필 꾸미기 | `16-ACHIEVEMENTS-REWARDS.md` | 3·4 이벤트 계약 | `[ ]` |
| 6 | 탐험·프로필 카드·게스트 | `17-EXPLORATION-PROFILE-GUEST.md` | 4·5 | `[ ]` |
| 7 | 확정 디자인 통합 | 별도 산출물 | 디자인 승인 | `[~]` 저장소 밖 진행 중 |

> **패킷 14~17은 전부 DB 변경을 동반할 가능성이 크다.** 그리고 **운영은 이제 열려 있다** —
> 다음 migration 적용은 **사용자가 쓰고 있는 DB에 대한 것**이고, 이 창이 쓴 절차(게이트 → 배포 →
> 게이트 뒤 검증 → 해제)를 **다시 밟아야 한다.** 창 절차는 `CUTOVER-PLAN.md`에 그대로 있고,
> 다음 창을 위한 개선점은 그 문서 §0.-1과 CUTOVER-LOG §6.2·§6.5에 정리돼 있다.
>
> **창이 필요한 것은 `17a-1 오늘 3코스` 하나로 좁혀졌다.** `daily_challenges`의
> **`UNIQUE(challenge_date)` 제약 교체**가 운영 DDL이기 때문이다.
> **G2가 `room_events`로 결정되면서 14가 창에서 빠졌고, G1이 공통 계약으로 빠지면서
> 16·17b의 상호 대기가 없어졌다** — `PACKET-CONTRACT-GAPS.md` §5.5·§6.2.
>
> **그 창은 8월 창과 성격이 다르다** `[추정]` — 함수 삭제가 없고, `daily_challenges`는
> 레이스 중에 읽히지 않으며, FK도 publication 등재도 없다. **구버전 프론트는 3행 중
> 첫 행을 집어 1코스만 보이는 상태로 정상 동작한다.** 그래서 **유지보수 게이트 없이
> 실행 가능한 것으로 읽힌다.** 배포 순서도 8월과 **반대로 DB가 먼저다** (§5.5.3).
> **최종 판단은 창을 여는 세션이 한다.**
> **`AGENTS.md` §1의 건별 승인은 그대로다 — 이 창의 승인은 이 창에서 끝났다.**

**D. 운영 상시 항목 — 게이트 해제로 성격이 바뀐 것**

| # | 항목 | 왜 지금 등재하나 |
|---|---|---|
| **D1** | **자동 일시정지 실제 발생 — 일일 공개 읽기 워크플로 기본 브랜치 반영, secrets 등록·첫 실행 대기** | **아래** |

**D1 상세.** 무료 요금제는 일정 기간 무활동 시 프로젝트를 **자동 일시정지**한다 `[외부]`.
CUTOVER-PLAN §3.3이 **7일**로 적고 있고, 창 절차가 P4(프로젝트 Active)를 **전날과 당일에 각각**
확인하게 만든 근거가 이것이다.

**바뀐 것은 사실이 아니라 결과다.** 창 기간에는 일시정지가 **개발자만 겪는 문제**였다 —
게이트가 켜져 있어 사용자는 어차피 점검 화면만 봤다. **W10 이후에는 사용자가 깨진 사이트를
만난다.** 프론트는 Vercel에 정적으로 떠 있으므로 **앱은 뜨고 DB 호출만 실패하는 형태**가
된다 — 점검 화면보다 나쁜 경험이다. 로그인부터 실패한다.

**2026-09-03 당시 운영 메모 (현재 값 아님):**

| 항목 | 값 |
|---|---|
| 확인된 마지막 DB 활동 | **2026-09-02** (W9-b 재스모크 · W10) |
| 그 이전 활동 | 2026-08-28 (창 세션 2). **그 사이 5일 공백이 있었던 것으로 읽힌다** |
| 실사용자 트래픽 | **없는 것으로 읽힌다** — `game_records` 마지막 행이 창의 싱글 스모크다 (스냅샷 §8.1) |
| 조치 | **주 1회 접속.** 프로덕션 URL 방문으로 DB 호출이 발생하면 충분하다 |
| 해제 조건 | 실사용자 트래픽 정착. 판단 기준은 `game_records`·`last_play` 재측정 |

> **2026-09-28 갱신:** 사용자가 **약 3주 비활동 뒤 운영 DB 자동 정지**를 발견해 대시보드에서 Restore했다 `[사용자 보고]`. 정지 시작 시각과 사용자 노출 기간은 **미확인**이다. 위의 "마지막 DB 활동" 등 2026-09-03 표는 당시 관찰이며 현재 상태가 아니다. `CUTOVER-PLAN.md`의 7일은 과거 문서값이다. 이번 관찰만으로 정확한 정지 임계·유예·알림 규칙을 확정하지 않는다.
>
> **D1 상태: 워크플로 기본 브랜치 반영, GitHub secrets 등록·첫 실행 대기.** `.github/workflows/keepalive.yml`이 매일 **12:17 KST**에 anon 키로 `public.profiles`의 exact count를 HEAD 요청한다. `profiles`는 공개 SELECT 정책을 갖는다 (`supabase/migrations/20260730170602_baseline_remote_schema.sql`의 `Anyone can read public profiles`). 응답 실패·count 헤더 부재·secret 누락은 job 실패로 끝난다. **운영 요청은 이 세션에서 하지 않았다.**
>
> **활성화 조건:** 사용자가 저장소 Secrets에 `SUPABASE_URL`·`SUPABASE_ANON_KEY`를 등록해야 한다. 기본 브랜치가 `main`인 것은 `git ls-remote --symref origin HEAD`로 확인했고, 워크플로 반영은 #6의 **건별 승인**으로 수행한다 (`AGENTS.md` §1.1). 첫 실행과 실제 자동 정지 예방 효과는 **미검증**이다. 실패 이메일은 GitHub 개인 알림 설정에서 Actions → Email → **Only notify for failed workflows**를 켜야 한다 ([GitHub 안내](https://docs.github.com/en/subscriptions-and-notifications/how-tos/managing-github-actions-notifications)). [GitHub 예약 실행 안내](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)에 따르면 실행이 지연·누락될 수 있고, **공개 저장소**는 60일간 저장소 활동이 없으면 예약 워크플로가 비활성화된다.

**착수 순서 제안 (2026-09-03 갱신):** ~~B1~~ **완료 → A2 → B4·B5 → C.**
**C(기능 작업) 안에서는 A·B가 끝났으므로 다음이 `TRACKS.md` 트랙 D(15a XP 원장)다** —
선행 0 · 파일 충돌 0이고, **A·B가 끝나 로컬 Supabase 스택 경합도 없다.**
**트랙 C(14)는 G7이 사람 결정이라 코드로 풀리지 않는다.**
~~B1이 먼저인 이유는 다른 모든 판단이 "지금 운영이 어떤 상태인가"를 근거로 삼기 때문이고~~
→ **B1이 끝났으므로 그 근거는 `PROD-SNAPSHOT-2026-09-02.md`에서 읽는다.**
**A2가 다음인 이유는 원인이 확정되지 않은 유일한 항목**이라서다.
A1·A3·B2·B3·B6는 C와 병행 가능하다. **D1은 순서가 아니라 상시 항목이다.**

---

**D. 트랙 C 통합이 남긴 것 — 웨이브 2 종료 시점 정리 (2026-09-06)**

**웨이브 2가 닫혔다.** A · B · N2 · D(15a) · C가 전부 `feat/group-final-gaps`에 있고
**merge 충돌은 다섯 번 다 0이었다.** 아래는 **C가 해결할 수 없거나 C의 산출이 아닌 것**이며,
출처는 `TRACK-C-HANDOFF.md` §5다. **D1은 이 세션에서 처리했고, D2~D5는 등재이며 D6·D7은 창 항목이다.**
**2026-09-28: 3코스 범위 제외로 "창 항목"이 없어졌다 — D7은 일반 migration으로 바뀌었다 (아래 D7).**

| # | 항목 | 성격 | 상태 |
|:-:|---|---|---|
| **D1** | §2.3 개수 불변식 → 배열·의도 검사 | 계약 문서 수정 | **✅ 완료 (이 세션)** |
| **D2** | 부채 ③ — 강제 이동 목적지 커버리지 | 별도 웨이브 | **등재. 착수 안 함** |
| **D3** | `progress_version`이 OCC 토큰과 liveness를 겸한다 | v2 권위 계약 변경 | **등재. 비용 확정됨** |
| **D4** | 그룹 경로 `coalesce` 잠재 벽돌 | 관찰 — 조사 먼저 | **등재. 수정 금지** |
| **D5** | `migration 무수정` 연속이 끊겼다 | 사실 기록 | **✅ 기록됨** |
| **D6** | 로컬 `daily_challenge_pool` 0행 해소 | 창 준비 | **✅ 시드·로컬 reset·함수 조회 완료 (2026-09-28, 기준 `fc46c95` + 미커밋 작업 트리)** |
| **D7** | ~~3코스 창 범위 최종~~ → **DB 변경 3항목(②③④)** + C migration의 배포 순서 | ~~창 범위 확정~~ → **일반 `db push`** | **✅ 운영 적용 완료 (2026-09-28 17:46)** — 가드 통과 · 권한·컬럼 검증 · 프로덕션 닉네임 저장 성공 |

---

**D1. §2.3 개수 불변식을 교체했다 — 근거는 실물 위반 6건이다** `[이 세션 실행]`

**불변식 5개가 이번 웨이브에서 6번 깨졌고, 6번 전부 거짓 양성이었다** — ④가 서로 다른
트랙에서 두 번 깨져서 5 ≠ 6이다. **지켜야 할 것은 매번 지켜졌고 세는 방식이 틀렸다.**
①③④를 **배열 일치 · 키 포함 · 파일 집합의 리터럴 동일**로 옮겼고 **⑤는 그대로 뒀다.**

**⑤가 모범인 이유는 `^\.mp-`라는 줄머리 앵커다** — 선언만 세고 인용을 세지 않아
**이 웨이브에서 한 번도 깨지지 않은 유일한 불변식**이다.

> **함께 기록한 것: 불변식의 범위가 리터럴보다 좁다.** ④의 `grep`은
> `hooks utils pages tests` 네 디렉터리만 훑어 `docs/`가 **범위 밖**이고, ⑤는
> `css/multiplayer.css` 한 파일만 센다. 그래서 계약 문서는 그 키를 따옴표째 인용하고도
> 불변식을 깨지 않는다. **범위 안에서 검열되는 것은 정확히 "그 리터럴 옆에서 왜 그런지
> 적으려는 코드 주석"이고**, 회피가 두 번 실제로 일어났다 —
> `tests/explorationRecords.test.js`가 **일부러 인용을 피했고**, 트랙 C가 인용했다가
> **7이 되어 되돌렸다.** ①이 그 증거를 남겼다: `data/itemPools.js`의 주석 한 줄이
> **"§2.3-①은 `grep -c`가 2로 유지되기를"** 이라고 적으면서 **그 자체로 카운트를 깬다.**
> **규칙을 설명하는 행위가 규칙 위반이 되는 형태다.** 전문은 `TRACKS.md` §2.3 ⚠ 상자.

**D2. 부채 ③ — 강제 이동 목적지 커버리지. 등재만 한다**

`20260904100000`이 후보 풀을 **해석 가능한 목적지로 좁혀** 실패를 미소비
(`NO_ELIGIBLE_LINK`)로 바꿨다. **아이템이 정직해졌을 뿐 좋아지지 않았다** —
실측(HANDOFF §3.8) 스냅샷 **10개** 대 링크 목표 **2,809개**, 문서 10개 중 **3개는 후보 0**이고
나머지도 1~3개다. **강제 이동이 피해자를 가 봤던 곳으로 보내는 경향이 있다.**

**2026-09-28 운영 관찰:** 운영 문서/링크 커버리지가 위 **로컬 스모크 fixture보다 좋아 강제 이동 성공률이 높았다** `[사용자 보고]`. 이는 운영의 실제 후보 수·성공률을 계측한 결과는 아니다. 위 10개 스냅샷 수치는 **로컬 fixture 측정**으로만 해석한다. 정량 비교는 **확인 필요**.

**답은 이동 전에 후보 목적지를 미리 스냅샷하는 경로다.** 그래야 풀이 실물이 된다.

> ### ⚠ 착수하는 세션이 하지 말아야 할 것 2건
>
> **① 가드를 푸는 방향으로 가지 말 것.** `20260904100000` 머리말이 왜 안 되는지 적어 뒀다 —
> `coalesce`가 `page_id`와 `revision_id`를 어긋나게 만들고 **이후 모든 링크 클릭이
> `LINK_NOT_ALLOWED`가 된다. 한 번의 실패가 영구 벽돌이 된다.**
>
> **② fixture의 해석 불가 링크를 정리하지 말 것.** pgTAP는 **커버리지가 올라가도 깨지지
> 않도록** 설계됐고, Page U · Page M의 해석 불가 행은 **일부러 남긴 것이다.**
> **그 행을 지우면 §3.8의 결함이 다시 새어나간다 — 그것이 애초에 결함이 새어나간 이유다.**

**D3. `progress_version`이 두 일을 겸한다 — v2 권위 계약. 비용을 알고 시작할 것**

이동의 **낙관적 동시성(OCC) 토큰**이면서 10초마다 도는 **생존 신호 카운터**다
(`20260814091000:928`). 후자는 상태를 바꾸지 않는데 같은 숫자를 올린다.
실측: `move_count` **1·3**인 방의 버전이 **88·86** — **클라이언트는 아무것도 하지 않아도
분당 6번 뒤처진다.**

C는 클라이언트에서 닫을 수 있는 만큼만 닫았다 — 버전을 **호출 시점에** 읽어 **약 15% → 약 1%**.
**스모크 5회 무충돌이지만 1%를 반증하지는 않는다.**

**liveness를 토큰에서 분리하는 것이 답이고, 비용이 세 갈래다:**

| 비용 | 내용 |
|---|---|
| **별도 컬럼 + 별도 realtime 경로** | `heartbeat_seq` 같은 컬럼을 새로 두는 것으로 끝나지 않는다. **현재 그 bump가 `room_players` realtime 이벤트를 만들고 상대 생존 표시를 굴린다** — 분리하면 그 표시를 **다른 경로로 다시 이어야 한다** |
| **동결 파일의 소비자가 함께 바뀐다** | `classifyRealtimeVersion`이 `progress_version`으로 순서를 가린다. **`utils/serverAuthority.js`는 동결 파일이다** — C는 읽기만 했다 |
| **배포된 번들이 계약을 부른다** | `apply_*_move_v2`의 `p_expected_version` 비교가 계약이다. **DB만 바꿔서 닫을 수 없다** |

**C 범위 밖이라고 판정한 근거가 그 셋이다** `[사용자 판정, 2026-09-06]`.

**D4. 그룹 경로 `coalesce` — 관찰. 조사 먼저, 수정은 그다음**

`apply_group_move_v2`(`20260814103000:745-798`)가 `resolve_wiki_revision`을 부르는데
**`LINK_SNAPSHOT_MISSING` 가드가 없다.** null이 그대로
`coalesce(v_to_revision, current_revision_id)`로 들어가므로 **1:1에서 거부한 어긋난
`(page_id, revision_id)` 짝이 그룹에서는 표현 가능하다.** 같은 NORMAL_LINK 조회가
**그 뒤 모든 클릭을 `LINK_NOT_ALLOWED`로 만든다 — 잠재 벽돌이다.**

**노출은 좁다:** 그룹은 아이템이 강제로 꺼져 있어(`20260814103000:339` `GROUP_ITEMS_DISABLED`)
**서버가 목적지를 고르는 경로가 없다** — 1:1을 무너뜨린 그 넓은 노출이 없다. NORMAL_LINK는
클라이언트가 목적지를 먼저 스냅샷하므로 null이 되려면 **그 쓰기가 실패했거나 사이에 지워졌어야 한다.**

**설계상 도달하는 길은 아니다.** 그래서 C는 **확인만 하고 고치지 않았다**
`[사용자 지시, 2026-09-06]` — 동결 영역이고 C 범위 밖이다.
**반영할 것: 실제로 도달 가능한지 먼저 판정한다.** 도달 가능하면 **1:1과 같은 형태의 가드**가
답이고, **B안식 완화는 여기서도 답이 아니다** (D2-① 과 같은 이유).

**D5. `migration 무수정` 연속이 `20260904100000`에서 끊겼다 — 사실 기록**

P4~P8이 그 연속을 유지했지만 **서버를 건드리지 않았기 때문이고, 유지가 목표였던 적은 없다.**
§3.8의 결함은 **서버에** 있었다 — 후보 쿼리가 `private.apply_duel_move_internal_v3` 안에 있어
**클라이언트 수정으로는 표현할 수 없다.** 그래서 끊었다.

| 끊긴 자리의 범위 (감사용) | |
|---|---|
| 신규 | `supabase/migrations/20260904100000_duel_item_link_resolvable_v3.sql` |
| 변경 | 함수 **1개** `create or replace` — 본문은 `20260904090000`의 것과 **추가 필터 12줄을 빼면 바이트 동일** |
| 무변경 | 표 · 인덱스 · 정책 · publication · 권한 · 반환 형태 |
| 무접촉 | `public.apply_duel_move_v2` — **배포된 번들이 부른다** |
| 기존 migration | **14개 diff 0줄** |
| 재검증 | `db reset --local` 처음부터 15개 적용 exit 0 · pgTAP **148/148** · preflight **11/11** — **P2·P3을 이어받지 않고 다시 돌렸다** |

> **⚠ 연속이 끊긴 것을 복구하려 하지 말 것.** 이 저장소가 그 연속을 **품질 지표로 적은 적이
> 없다.** P4~P8에서 참이었던 이유는 서버에 결함이 없어서였고, **결함이 서버에 있는 것을 확인한
> 뒤에는 클라이언트에서 우회하는 쪽이 더 나쁜 선택이다** — §3.8의 B안이 정확히 그 우회였고
> **영구 벽돌로 이어졌다.**

**D6. 로컬 `daily_challenge_pool` 0행 — 2026-09-28 시드로 해소** `[산출물]`

**2026-09-06 당시:** `db reset --local` 이후 이 표가 비어 있었다. 베이스라인 migration이 **테이블만 만들고
INSERT가 없고**(`20260730170602:511`), 당시에는 **`supabase/seed.sql`도 없었다.**

```
active|total: 0|0
select * from public.ensure_today_daily_challenge();
  ERROR:  No active daily challenge candidates
  CONTEXT:  PL/pgSQL function ensure_today_daily_challenge() line 13 at RAISE
```

**함수가 `v_active_count = 0`이면 곧바로 raise한다**(`20260730170602:77-79`).
**당시 운영에는 행이 있었으므로 이것은 로컬만의 공백이었다** — 3코스 창의 T5 스모크가
`ensure_today_daily_challenge`를 로컬에서 예행하면 멈추는 상태였다.

**2026-09-28 반영:** 기존 `DAILY_POOL_INSERT.sql`의 8행을 `supabase/seed.sql`로 옮겼다. `supabase/config.toml`의 `[db.seed] sql_paths = ["./seed.sql"]`가 reset 시 읽는다. **기준 HEAD `fc46c95` + 미커밋 작업 트리, 2026-09-28 실측:** `npx supabase db reset --local --yes` exit 0, migration **15행**, pool **8행/활성 8행**, `ensure_today_daily_challenge()` 예외 없이 목표 반환. 이 검증은 **로컬 전용**이며 운영 DB에는 접속하지 않았다.

**과거 판정:** 창 준비 단계에서 `daily_challenge_pool` 시드가 필요했다.
창 항목 ①이 **이 함수를 `drop` 후 재생성**하므로(`course_slot` 추가로 반환 타입이 바뀐다)
**리허설이 곧 검증인 항목이고, 빈 풀에서는 리허설이 성립하지 않는다.**

**D7. ~~3코스 창 범위 최종~~ → DB 변경 3항목 — 창이 필요 없다 (2026-09-28 재판정)**

> **2026-09-28 재판정** `[사용자 결정]`. **3코스(①)가 범위 제외되면서 창 4항목이 DB 변경 3항목(②③④)이 됐다.**
> **성격을 다시 판정했다 — 셋 다 DB 전용이고 프론트와 무관하다.** 배포된 프론트는 이미 ③의 3컬럼만 보내고
> (`ProfilePage.jsx:97-98`·`:160-161` — C3가 인용한 `:86`·`:149`에서 줄만 옮겨졌다), ④는 아무도 읽지 않으며,
> ②는 쓰는 값이 `'completed'` 하나다(`apply_single_move_v2:322`). **그러므로 리허설·게이트·창 문서가 필요 없다 —
> 2026-09-28의 C·15a 적용과 같은 일반 `db push`다.** 순서 ③ → ④는 여전히 강제된다(C3 §5.1).
>
> 산출물은 `supabase/migrations/20260928090000_c4_check_c3_grant_total_xp.sql` 하나이고 검증은 상단 ⚑ 상자에 있다.
> **계약과 다르게 한 곳은 없다** — ③은 C3 §5.1대로 `anon`에서도 회수하고, ④는 C3 §1의 DDL(컬럼 + CHECK + 인덱스)
> 그대로이며, ②의 값 집합은 C4 **§4.1**(`completed`·`abandoned`·`expired`)이다. `match_end_reason`은 §4.2대로 제외.
>
> 아래는 2026-09-06의 원문이다. **①과 "창"이라는 틀만 무효가 됐고, C migration의 배포 순서 판정은 그대로 유효했다.**

~~**창 = 4항목 그대로다.**~~ ① `daily_challenges` 제약 교체 + `course_slot`
② `game_records.result_status` CHECK 1건 ③ `profiles` 컬럼 단위 grant 축소 3컬럼
④ `profiles.total_xp` 추가. **순서 ③ → ④** 유지.

**저장소 15 ↔ 운영 12의 차이 3개를 창 기준으로 가른다:**

| migration | 창이 필요한가 | 근거 |
|---|:-:|---|
| `20260903090000_xp_ledger_v1` (15a) | **아니다** | 신규 표·함수뿐. 게이트 없이 적용된다 |
| `20260904090000_duel_item_authority_v3` (C) | **아니다** | **순수 가산이다** — 신규 표 **2개**(`duel_item_grants`·`duel_item_events`) + 신규 함수 **6개**(전부 `_v3`). `alter table`은 **자기 신규 표의 RLS 활성화 2줄뿐**이고 **`alter publication` 0건**이다 `[이 세션 실측]` |
| `20260904100000_duel_item_link_resolvable_v3` (C) | **아니다** | `private.apply_duel_move_internal_v3` **1개만** `create or replace`한다. 그 함수는 **`20260904090000`이 만든 것이라 운영에 존재하지 않는다** — 운영 기준으로는 **교체가 아니라 최초 생성**이다 |

**셋 다 기존 객체를 건드리지 않으므로 창 없이, 서비스 중에 적용 가능하다.**

> ### ▶ **다만 프론트 배포와의 순서는 판단이 필요하다 — DB가 먼저다**
>
> **`services/duelItemService.js`가 부르는 RPC 3개는 C의 migration에만 존재한다**
> `[이 세션 실측]` — `ensure_duel_item_grant_v3` · `get_duel_item_state_v3` ·
> `use_duel_item_v3`, 셋 다 `20260904090000`이 만든다.
>
> | 순서 | 결과 |
> |---|---|
> | **DB → 프론트** ✅ | **안전하다.** migration 적용 시점에는 **그 함수를 부르는 코드가 아직 배포돼 있지 않다.** 새 객체가 놀고 있을 뿐 기존 경로에 영향이 없다 |
> | **프론트 → DB** ❌ | **1:1 아이템이 전부 깨진다.** 배포된 번들이 **존재하지 않는 RPC 3개**를 부른다. `DuelItemBar`가 첫 렌더에서 상태 복구에 실패한다 |
>
> **따라서 C의 두 migration은 프론트 배포보다 먼저, 그리고 창과 무관하게 적용한다.**
> **역순은 사용자에게 바로 닿는 고장이다** — 게이트가 해제돼 있으므로(2026-09-02) 완충이 없다.
>
> **15a는 반대로 순서 제약이 없다** — 어느 화면에도 연결되지 않아 부르는 코드가 없다.
> **그 차이가 D7 표의 "창이 필요한가"와 "배포 순서"를 별개로 적은 이유다.**


### 5.1 완료된 선행 조사

1. ~~**`baseline_remote_schema`와 운영 스키마 대응 관계 확인**~~ — **완료 (2026-08-20).**
   4개 축을 대조해 **차이 0건**이다: 테이블 14/14(양방향 잉여 0), 함수 7/7(이름·인자 일치),
   제약 52/52(CHECK 술어·FK 참조 대상·`ON DELETE` 동작까지 일치), RLS 14/14(정책 합계 29 일치).

   → **baseline은 이 운영 상태의 덤프다. `repair` 대상 버전은 `20260730170602`로 확정,
   판단은 `(a) 성립`으로 확정한다.** `repair`는 스키마를 검사하지 않고 이력 행 하나를 기록하는
   연산이므로 잔여 드리프트가 성공·실패를 바꾸지 않는다. `repair`의 실제 동작(테이블·스키마 생성,
   행 정확히 1개, `--status reverted`의 DELETE)은 U12에서 로컬 재현으로 실측 확정됐다.

   부수 확인 2건: `picked`는 baseline:612에 있고 운영 제약도 0건이라 사본 판정이 양쪽에서 일치한다
   (보존 결정: U10). `group_match_history`·`user_profile_stats`의 RLS off는 운영·baseline·문서
   (`docs/WIKI_RACE_GROUP_DB_SECURITY_SPEC.md` §4.4·§5.4) **3자 일치**이며,
   Phase 2C(`20260813072952:765-766`)가 잠금을 도입한다.

   근거·판단 전문: `docs/ops/PROD-SNAPSHOT-2026-08-20.md` §9·§10.
2. ~~**cutover 계획 재작성**~~ — **완료 (2026-08-21, `a064256`).**
   `docs/ops/CUTOVER-PLAN.md`가 W0~W11 창 절차, 백업(§4), 과거 방 이력 삭제(§5), 롤백(§6),
   창 전 선행 조건(§7), 창 후 검증(§8), 미결정 항목(§9), Release A~D 대체 매핑(§10)을 담는다.
   이후 `9145833`·`032caba`가 U12(`repair` 동작)·U13(link 대상)을 해소했다.

   확정된 전제: 다운타임 허용·창 1~2시간(U1), Release 재분할 불필요·11개 전량 1창 적용(U2),
   구버전 세션 drain은 유지보수 게이트(U3), `game_rooms` 위반 167건은 과거 방 이력 삭제로 처리(U7),
   `picked` 보존(U10). **되돌릴 수 없는 지점은 W6(`db push --linked`)** 이고 down migration이
   없으므로 유일한 되돌림 수단은 덤프 복원이다(§2.1·§6).

   운영 데이터 변경 2건(F14)과 과거 방 이력 삭제(§5)는 **별도 승인 사안**이다 (`AGENTS.md` §4).
   `game_rooms` 위반 행 점검 쿼리와 판정(위반 167건, non-group `host_user_id is null` 0건)은
   CUTOVER-PLAN §1.2·§5.3에 있다.
3. ~~**`avatars` 버킷 객체 소유자 확인**~~ — **해소 (2026-08-21).** 소유자는 **`roeehd2` — 사용자
   본인 계정**이다 (`[사용자 확인]`, CUTOVER-PLAN §1.1 U11). 실사용자 데이터가 아니므로 프로필
   업로드 기능 제거가 안전하다. 객체 자체의 삭제는 cutover 범위 밖이며 `AGENTS.md` §4가 그대로
   적용된다.
4. ~~**롤백 판단 기준(P11)과 §6.3 복원 절차**~~ — **완료 (2026-08-27).**
   사용자가 원칙 4가지를 확정했고(U14), 그 위에서 **로컬 복원 리허설**을 수행해(U15)
   CUTOVER-PLAN에 **§6.0**(판단 기준)·**§6.3**(확정 절차)·**§6.5**(리허설 기록)를 넣었다.

   **리허설이 뒤집은 사실 3건 — 다음 세션이 반드시 알아야 한다:**

   - ~~**W2.5는 선택이 아니다.**~~ — **운영에서는 선택이었다 (2026-08-28 창 실측).**
     리허설이 재현한 실패 경로 자체는 실재한다: `w6_blocking_rows > 0`이면 **W6가 10번째
     `20260814113000`에서 SQLSTATE 23514로 실패한다** — 그 migration이 자기가 붙인 `NOT VALID`
     제약이 걸린 행을 스스로 UPDATE하기 때문이다.
     **그러나 운영의 `w6_blocking_rows`는 `0`이었다** — 그 경로를 발화시킬 행(`host` 참조가 끊긴
     위반 행)이 운영에 없었다. 즉 **CUTOVER-PLAN §5.3-0의 두 갈래 중 운영이 놓인 쪽은 "선택"**
     이었다. 삭제는 그래도 수행했고 근거는 W7의 조건부 `validate`였다 (CUTOVER-LOG §W2.5).
     **교훈은 "리허설이 틀렸다"가 아니라 "삭제 전에 먼저 재라"는 §5.3-0의 설계가 옳았다**는 것이다.
   - **§6.3의 데이터 덤프 복원은 그대로 하면 실패한다.** 전체 데이터 덤프에는 `auth`·`storage`
     데이터가 들어 있고 §6.3-2는 `public`만 비우므로 **`auth` PK 충돌로 중단된다**
     (`duplicate key ... audit_log_entries_pkey`, public 복원 0행). **`--schema public` 덤프를
     따로 떠서 복원한다** (CUTOVER-PLAN §6.3.3).
   - **비우기 SQL은 `private` 스키마도 지워야 한다.** `drop schema public cascade`는
     `private` 함수 10개 중 3개만 끌고 가고 **7개가 살아남는다** (CUTOVER-PLAN §6.3.2).

   **복원 결과:** 구조 지문·행 수·이력 **차이 0건.** DB 작업 **4.4초**(로컬).
   복원되지 않는 것 중 실질 항목은 **`supabase_admin` default privileges 3행 하나**이며
   `postgres` 롤로는 재생성할 수 없다 (CUTOVER-PLAN §6.3.4).

   **여전히 미검증:** 운영에서의 실행. 특히 `drop schema public cascade`와
   `set session_replication_role = replica`의 **운영 `postgres` 롤 권한** (CUTOVER-PLAN §6.5.7).

### 5.2 CUTOVER-PLAN §7 선행 조건 — **창이 열렸고 닫혔다 (2026-08-27~28)**

**P1~P14는 이 절의 역할을 다했다.** P4(프로젝트 Active)는 명시적 대시보드 확인 기록이 없지만
**W2 덤프와 W6 `db push`가 모두 성공했으므로 창 시점에 `Active`였다는 사실은 사후 확정된다** —
`Paused`였다면 두 명령 모두 접속 단계에서 실패한다 (CUTOVER-LOG §0.1).

> **다만 절차 이탈 1건이 있었다.** CUTOVER-LOG §0.0의 실행 전제 3항목(Docker 데몬, 승인 이미지,
> 운영 연결 문자열 IPv4)에 **당일 확인 기록이 없다.** §0.0은 "셋 중 하나라도 아니면 W6를
> 시작하지 않는다"고 정하므로, **되돌릴 수단의 전제를 확인하지 않은 채 되돌릴 수 없는 지점을
> 넘었다.** 결과적으로 복원은 필요 없었지만 그것은 사후 결과이지 절차 충족이 아니다.
> 다음 창의 개선안은 CUTOVER-LOG §6.2-5·§6.3에 있다.

**완료 13건.** 2026-08-21: **P1·P2·P3**(게이트 구현·포함·로컬 확인), **P6**(`backup/` gitignore),
**P8**(link 대상 확인), **P13**(커밋 기준 `npm test`·`npm run build`).
2026-08-27: **P5·P7·P9·P10·P11·P12·P14.**

- **P14** — `psql`이 이 머신에 없다는 실측에서 시작해 **Docker 이미지의 `psql`로 경로를 확정**했다:
  `docker run --rm -i --entrypoint psql <승인이미지> "<CONN>" -v ON_ERROR_STOP=1 -f - < <파일>`
  (CUTOVER-PLAN §6.3.0 A안). **로컬 Supabase 스택 up은 요구하지 않는다** — `docker run`이
  스택과 무관하게 동작함을 검증했다 `[산출물]`. **대안 경로는 없다** — Studio SQL Editor는
  `COPY … FROM stdin`을 공급할 수 없어 데이터 복원이 원리적으로 불가능하다 (§6.3.0-4).
  **컨테이너에 IPv6가 없으므로**(`EnableIPv6=false`, `curl -6` 실패 `[산출물]`) 연결 문자열이
  IPv4로 해석돼야 한다 (§6.3.0-1).

- **P5·P7** (2026-08-27) — 사용자가 W-1 리허설 스키마 덤프를 실행했다. **덤프가 완주한 것 자체가
  P5(로그인 세션·DB 비밀번호 유효)의 증명이고**, 그 결과물을 baseline과 대조해 **바이트 단위
  완전 동일**(차이 0건)이 나와 P7·U5가 해소됐다. 전문은 CUTOVER-PLAN §1.4.
- **P6의 판정 축이 2건으로 늘었다** — gitignore 반영에 **`backup/` 디렉터리 실재**가 더해졌다.
  W-1에서 `failed to open dump file: NotFound`가 실제로 발생했고, 인증이 성공한 뒤 파일 쓰기에서
  실패하므로 **로그인 문제로 오진하기 쉽다** (CUTOVER-PLAN §4.3-0).

- **P9** — `npx supabase --version` → `2.114.0` `[산출물]`. `package.json` 핀(캐럿 없는 정확한 값)·
  `package-lock.json`·`node_modules` 설치본·런타임 네 축이 모두 일치한다.
  **CODE GO의 유효 조건**이라 불일치는 창 차단 요소였다. 설치·업그레이드는 하지 않았다.
- **P10** — 리허설로 삭제가 선택에서 필수가 되면서 합의할 "삭제 여부"가 사라졌다고 봤으나,
  **창 실측이 다시 "선택"으로 되돌렸다** (`w6_blocking_rows = 0`). **P10이 실제로 값을 낸 부분은
  "범위 값은 창 안 W2.5에서 측정한다"였다** — 그 측정이 필수/선택 판정을 뒤집었다
  (CUTOVER-PLAN §5.3-0, CUTOVER-LOG §W2.5).
- **P11** — 롤백 판단 기준. CUTOVER-PLAN §6.0.
- **P12** — `docs/ops/CUTOVER-LOG-TEMPLATE.md`. 창 당일 `CUTOVER-LOG-YYYY-MM-DD.md`로 복사해 쓴다.

### 5.3 창과 무관하게 남은 검증

- **1:1 결과 화면 경합 후속:** `fc46c95` hotfix가 2026-09-28 운영 완주 판정을 정상화했다 `[사용자 보고]`. fatal로 빠지는 경로는 **2026-07-26부터 잠재**했고 9월 28일 첫 실측이지만, **8월 스모크가 정상으로 보인 이유는 미확정**이다. `docs/agent/TRACK-C-HANDOFF.md` §3.6·`pages/MultiplayerGamePage.jsx`.
- **체크리스트 14번(아이템으로 목표 도착): 미검증.** 정상 완주와 같은 `handleRoomFinished`를 지나지만, 아이템으로 목표에 떨어뜨리는 재현은 하지 않았다 (`docs/agent/TRACK-C-HANDOFF.md` §3.6). 해당 경로 수동 스모크가 남았다.
- **실제 Wikipedia snapshot smoke (B2)** — B1은 fixture 인터셉트 기반이므로 실제 API 경로의
  429·revision 변경·`WIKI_SNAPSHOT_IDENTITY_MISMATCH` 처리는 아직 미검증이다.
  **B1이 이 경로를 덮지 못하는 것은 설계상 그렇다** — `scripts/packet13-browser-b1.mjs:788-789`가
  Wikipedia를 fixture로 라우팅하고 `:1726`이 `unexpectedWikipediaRequests !== 0`을 실패로 처리한다.
  따라서 §2의 "B1 wiki_snapshot 429 = 0"은 **검증이 아니라 미측정**이다.
  `qa/30-INTEGRATION-CHECKLIST.md` §21에는 B2 항목 자체가 없다 (CUTOVER-PLAN §10이 명시).

  > **2026-08-28 창이 이 미측정 구간을 운영에서 밟았다.** W9 발견 1·3이 정확히 그 결과다 —
  > B1이 fixture로 가려 둔 실제 429 경로가 운영에서 터졌다. **형식적 B2 하네스는 여전히
  > 미작성이지만, "실제 API 경로가 어떻게 실패하는가"는 더 이상 미지가 아니다** (§5.5).
  >
  > **2026-09-02 — B2의 1단계만 생겼다.** `scripts/wikiSnapshotRequestCount.mjs`가
  > `index.ts`를 그대로 불러와 **요청 수를 센다** (§5.4-1·2). **이것은 요청량 계측이지
  > 실패 경로 검증이 아니다** — 429·revision 변경·`WIKI_SNAPSHOT_IDENTITY_MISMATCH`는
  > 여전히 스텁 응답이라 미검증이다. **B2 본체(2단계, `functions serve`)는 미작성이다.**
- `npm run supabase:clean-gate`·`npm run supabase:postgrest-smoke`의 현재 커밋 기준 재실행 (§2).

### 5.4 2026-08-28 운영 장애에서 갈라져 나온 후속 작업

2026-08-28에 **최소 수정 3건만** 적용했다 (§1의 변경분 2번). 아래는 **의도적으로 보류**한 것이며,
전부 `supabase/functions/wiki-snapshot/index.ts` 축이다. 판단 예정: **2026-08-29.**

> **창이 이 보류 목록을 검증했다.** 최소 수정 3건은 W8로 운영에 반영됐고 **싱글 경로의 429는
> 풀렸다.** 그러나 **4인 그룹에서 502가 대량 재발했다** (§5.5 발견 3) — 62요청이 참가자 수만큼
> 곱해지기 때문이다. ~~**즉 아래 1번(스냅샷 재사용)이 "최대 레버리지"라는 판단이 운영에서
> 확인됐고**~~ ~~1번은 §5.5 발견 3의 해결 후보이며 **두 항목은 같은 뿌리다** — 2026-08-29
> 판단에서 1번을 최우선으로 올린다.~~
>
> **2026-08-29 판단 완료 — 위 결론을 정정한다** `[코드]`. **1번은 대기실 준비 버튼 502를
> 고치지 못한다.** 그 경로의 문서는 참가자마다 서로 다르고(`GROUP_TARGETS_NOT_DISTINCT` 제약)
> **전부 cold miss**이기 때문이다. **순서는 2 → 1 → 3으로 바뀐다.** 근거·측정·결합 제약은
> **§5.5-3**에 있다. 아래 표의 "왜 보류했나"는 2026-08-28 시점 기록으로 **그대로 보존한다.**

배경 실측 — 문서 1건당 Wikipedia 요청 수는 `대한민국` 기준 **78건**
(parse 2 + info 46 + revisions 30, 2026-08-28 `[산출물]`). dedup 적용 후 **62건**이다.
운영 429는 이 요청량과 UA 부재가 겹쳐 발생했다 (`execution_time_ms 4988`, `fetchPageIdentities`).

| # | 항목 | 왜 보류했나 | 비고 |
|---|---|---|---|
| ~~1~~ | ~~**스냅샷 재사용 (조기 반환)**~~ **완료 (2026-09-02). Edge Function 미배포.** | 보류 사유였던 "로직 변경"은 유효했다 — 실제로 조기 반환 2개와 캐시 조회 1개가 들어갔다 | **warm 61 → 0건**(본문 불필요) / **→ 1건**(관전). 4인 게임 진입 244 → 31건 |
| ~~2~~ | ~~**`fetchRevisionIds` 제거**~~ **완료 (2026-09-02). Edge Function 미배포.** | 계약 테스트를 **제거의 유지**로 뒤집었다 (`tests/serverAuthorityMigration.test.js`). 식별자가 사유 주석에 남으므로 호출·정의 형태로 검사한다 | **cold 61 → 31건.** 대기실 4인 244 → 124건 |
| 3 | **429 재시도·백오프** | ~~요청 62건이 남은 상태에서는 실행 예산을 태운다~~ → **여전히 보류. 사유가 "아직 이르다"에서 "측정 대기"로 바뀌었다** (아래 5.4-3) | 넣는다면 `wikiJson` 한 곳. `Retry-After` 존중. 선례는 `scripts/verifyWikiLinks.mjs:23-43` |
| 4 | **상태코드 분리 / 프론트 에러 메시지** | 별도 작업 | 지금은 상위 rate limit과 `WIKI_PAGE_INVALID`가 **둘 다 502**다. 프론트는 `FunctionsHttpError`의 고정 영문 문구를 그대로 노출하고 `error.context`의 `code`를 읽지 않는다 (`services/wikiSnapshotService.js:42`) |
| 5 | **`config.toml`의 `[functions.wiki-snapshot]`** | 별도 판단 | 선언이 없어 `verify_jwt`가 **기본 true**로 배포된다. `single-run`만 F20으로 고정돼 있다 (`supabase/config.toml:423-424`) |

**B2 로컬 검증 경로** (§5.3의 B2와 같은 항목이다. 2026-08-28 실측):
로컬 `supabase_edge_runtime_*` 컨테이너는 `Exited (255)` 상태이고 `deno`는 PATH에 없다.
1단계는 Docker 없이 가능하다 — 실제 Wikipedia에 대고 `extractBodyLinks`·배치 수를 재는 독립
하네스이며, 78건·dedup 등가성이 이 방식으로 측정됐다. 2단계는
`npx supabase functions serve wiki-snapshot`으로 fixture 없이 전 경로를 태우는 것이다.
**어느 쪽도 `npm test`에 넣지 않는다** — 3자 API를 실제로 호출하므로
`verifyWikiLinks.mjs`처럼 명시 실행 스크립트여야 한다.

#### 5.4-1·2 적용 결과 (2026-09-02) — **실측**

1번과 2번을 **한 번에** 적용했다. 같은 파일이라 배포 단위가 하나이기 때문이다.
계측 하네스는 **`scripts/wikiSnapshotRequestCount.mjs`** (명시 실행, `npm test` 밖 — 위 규칙).
`index.ts`를 **복사하지 않고 그대로 불러와** `fetch`를 세므로 소스가 바뀌면 수치도 따라 바뀐다.
실제 Wikipedia 호출은 문서 HTML 1건뿐이고 그마저 캐시된다.

```bash
node scripts/wikiSnapshotRequestCount.mjs
```

| 시나리오 | before | after | 차이 |
|---|---|---|---|
| cold — 최초 스냅샷 (신원 있음) | 61 | **31** | −30 |
| **warm — 재사용 (본문 불필요)** | 61 | **0** | **−61** |
| warm — 관전 (본문 필요) | 61 | **1** | −60 |
| cold — 제목만 (신원 없음) | **62** | **32** | −30 |

**하네스 검증:** "제목만" before가 **62건**으로, §5.4 서두에 기록된 2026-08-28 실측값과
정확히 일치한다. 독립적으로 만든 계측이 기존 수치를 재현했다.

| 4인 그룹 환산 | before | after |
|---|---|---|
| 게임 진입 (전원 같은 시작 문서) | 61 + 3×61 = **244** | 31 + 3×0 = **31** (−87%) |
| 대기실 준비 (전원 다른 문서) | 4×61 = **244** | 4×31 = **124** (−49%) |

**대기실이 여전히 124건인 것이 남은 위험이다.** 문서가 전원 distinct라 재사용이 듣지 않는
구간이고, 이것이 발견 3의 관측(준비 버튼 11회 연속 실패)이 나온 바로 그 경로다.
**절반으로 줄었을 뿐 구조는 그대로다** — 운영 재검증이 필요하다.

기준 커밋·검증 수치는 §2.

> ### ⚠ 배포 순서 — **프론트가 먼저다. 반대로 하면 관전 화면이 깨진다**
>
> 이 수정은 요청 body에 **`includeDocument` 플래그**를 새로 넣는다. 본문 HTML은
> `wiki_page_snapshots`에 없어서 warm 경로에서 pinned parse를 태울지 말지를 이 값으로 정한다.
> 두 배포는 서로 독립이다 — 프론트는 Vercel(`main` push), Edge Function은 `supabase
> functions deploy`. **따라서 순서가 관측 가능한 차이를 만든다.**
>
> | 순서 | 결과 |
> |---|---|
> | **프론트 → Edge Function** | **안전.** 새 프론트가 플래그를 보내도 옛 함수는 무시하고 늘 HTML을 준다. 감축 효과만 늦게 나온다 |
> | Edge Function → 프론트 | **관전 화면이 깨진다.** 옛 프론트는 플래그를 안 보내므로 `includeDocument=false`로 취급돼 warm 경로가 `documentHtml: ""`를 준다. `services/groupSpectatorService.js:92-96`이 `SPECTATOR_DOCUMENT_UNAVAILABLE`로 실패한다 |
>
> **게이트가 켜져 있으면 사용자 노출은 어느 쪽이든 0이지만, 순서를 지켜야 스모크가 유효하다.**
> 같은 창에서 둘 다 올리고 프론트를 먼저 올린다.
>
> **실행 결과 (2026-09-02): 순서를 지켰다.** W1-b(프론트) → W8-b(Edge Function) →
> W9-b(재스모크)이고, 재스모크에서 **관전 화면 본문이 정상 렌더**됐다 —
> 역순이었다면 여기서 `SPECTATOR_DOCUMENT_UNAVAILABLE`이 떴을 것이다.
> **이 상자는 다음에 같은 형태의 배포를 할 때 다시 읽는다** (플래그를 새로 추가하는 변경은
> 전부 같은 구조를 만든다).

#### 5.4-3 429 백오프 — ~~다음 판단~~ → **판정 완료: 넣지 않는다 (2026-09-02)**

**측정이 끝났다.** ① 수정을 배포했고(W1-b·W8-b) → ② 4인 그룹 스모크를 다시 돌렸고
(W9-b) → ③ **429/502가 나오지 않았다. 대기실 124요청이 그대로 통과했다** `[사용자 보고]`.
**따라서 백오프는 넣지 않는다.**

**"감축만으로 통과하는지 먼저 잰다"는 순서가 값을 냈다.** 넣었다면 **불필요한 지연**이
됐을 것이다 — 백오프는 실패를 느리게 만들 뿐 요청 수를 줄이지 않으므로, 통과하는 요청량에
대해서는 순수 비용이다. **반대 순서로 갔다면 그 비용을 영구히 지불하면서 그 사실을 몰랐을
것이다.**

> **다만 폐기가 아니라 보류다 — 재검토 조건을 남긴다.**
> 지금 통과한 것은 **4인 · 단발 스모크 · 그 시점의 Wikipedia rate limit** 조건에서다.
> **동시 사용자가 늘면 다시 재야 한다** — 대기실 요청 수는 참가자 수에 그대로 비례하고
> (4인 124건 = 인당 31건), **여러 방이 동시에 돌면 같은 상위 rate limit을 나눠 쓴다.**
> 재검토 트리거: **동시 그룹 방이 늘어난 뒤 502가 다시 보이면.**
> 그때는 "얼마나 모자라는가"라는 측정값을 들고 들어갈 수 있다.
>
> **넣게 될 경우의 자리는 그대로다:** `wikiJson` 한 곳, `Retry-After` 존중,
> 선례 `scripts/verifyWikiLinks.mjs:23-43`. 병렬화는 **하지 않는다** — 실패 모드가
> rate limit이므로 순간 동시성을 올리면 악화된다 (§5.5-3).

### 5.5 ~~W9 미해결 4건~~ → **전건 종결 (2026-09-02)**

2026-08-27~28 창의 W9에서 결함 6건이 나왔다. 2건은 창 안에서 고쳤고(`be520c3`) 4건이 남았다.
**2026-08-29에 그 4건을 전부 코드에서 조사했고**(5번 결함 아님, 4번 수정), **2026-09-02에
배포·재스모크로 3번을 닫고 6번을 스펙 범위 밖으로 종결했다.**
전문·발견 순서·통과 항목은 `docs/ops/CUTOVER-LOG-2026-08-27.md` §W9·§W9-b.

| # | 항목 | 관측 | 최종 판정 | 해제 차단 |
|---|---|---|---|---|
| **3** | **`wiki-snapshot` 502 대량 재발 (4인 그룹)** | 준비 버튼 **11회 연속 실패** | **해소 (2026-09-02).** 감축을 프론트(W1-b) → Edge Function(W8-b) 순으로 배포한 뒤 재스모크에서 **502 0건**. 대기실 4인 244 → **124건**(통과), 게임 진입 244 → **31건** | ~~예~~ → **아니오** |
| **4** | ~~**"유효하지 않은 RETIRE 사유"**~~ | 결과 화면에서 로비 나가기 실패 | **해소.** 수정 2026-08-29(`579a338`), 배포 2026-09-02(W1-b), **재스모크에서 정상 확인**. 아래 5.5-4 | **아니오** |
| ~~5~~ | ~~**`username-lookup` 404**~~ | — | **결함 아님 → 종결 (2026-08-29).** 아래 5.5-5 | **아니오** |
| ~~6~~ | ~~**관전 이모티콘이 다른 참가자에게 전달되지 않음**~~ | — | **스펙 범위 밖 → 종결 (2026-09-02)** `[사용자 판정]`. 구조(렌더 경로가 `SPECTATING` 분기 하나뿐)는 확정이나 **스펙이 수신자를 규정하지 않는다.** 아래 5.5-6 | **아니오** |

> **결함 판정과 검증은 다르다.** 6번은 **결함이 아닌 것으로 종결**됐지만, 관전자 2명 조건에서
> 실제로 전달되는지는 **여전히 미검증**이다 (§5.0 A3). 종결은 "고칠 것이 없다"이지
> "확인했다"가 아니다.

#### 5.5-3 `wiki-snapshot` 502 — **§5.4-1이 이 증상을 못 고친다** → **해소 (2026-09-02)**

> **결론부터: 닫혔다.** 아래 분석은 **어떤 수정이 왜 필요했는지**의 기록이며 그대로 유효하다 —
> 실제로 1순위로 올린 §5.4-2(`fetchRevisionIds` 제거)가 대기실 경로를 절반으로 줄였고
> **그 절반으로 통과했다** (W9-b). **분석의 핵심 주장("곱셈은 두 갈래이고 서로 다른 수정을
> 요구한다")이 운영에서 확인됐다.** 3순위였던 백오프는 필요하지 않았다 (§5.4-3).

~~**발견 3과 §5.4-1은 같은 뿌리다.** §5.4-1(스냅샷 재사용)이 유일하게 곱셈 구조를 깨는 수정이다.~~
**2026-08-29 조사로 이 서술을 정정한다** `[코드]`. 곱셈은 **두 갈래이고 서로 다른 수정을 요구한다.**

| 경로 | 호출 지점 | 문서 동일성 | §5.4-1(재사용)의 효과 |
|---|---|---|---|
| **대기실 준비 버튼** | `pages/GroupRoomPage.jsx:203` | **전원 서로 다른 문서** — `start_group_room_game_v2`가 `submitted_target_page_id`의 **distinct**를 요구하고 아니면 `GROUP_TARGETS_NOT_DISTINCT`로 거부한다 (`20260814103000_group_final_gaps_v13.sql:943`) | **0%.** 전부 cold miss다 |
| 게임 진입·복구 | `pages/GroupGamePage.jsx:452` | **전원 동일** (시작 문서) | 62 → 62 + (N−1)×1 |
| 이동 1회 | `pages/GroupGamePage.jsx:1008` | 부분 중복 | 부분 |

**두 번째 증폭 — 실패가 아무것도 남기지 않는다.** DB 쓰기는 62요청이 전부 성공한 뒤 마지막
한 번뿐이다 (`supabase/functions/wiki-snapshot/index.ts:219`). 중간 429는 `wikiJson`이 throw(`:40`)
→ catch → 502(`:244`). **재시도는 매번 full cost이므로 11회 연속 실패 ≈ 한 참가자가 혼자
최대 ~680요청을 태운 것**이고, 그 재시도가 rate limit을 계속 살려두는 자기지속 루프다.

**§5.4 보류 항목 재평가 (이 데이터 기준):**

| §5.4 | 준비 버튼 502에 대한 실효성 | 재평가 |
|---|---|---|
| **2. `fetchRevisionIds` 제거** | **62 → 32 (−48%). cold·warm 무관하게 항상 적용** | **1순위로 올린다** — 보고된 증상에 직접 듣는 유일한 항목 |
| **1. 스냅샷 재사용** | **대기실 0%.** 진입·재방문에서만 62 → 1 | 2순위. "유일하게 곱셈을 깬다"는 서술은 **경로를 특정해야 성립한다** |
| **3. 429 백오프** | 하드 실패를 느린 성공으로 전환 — 11연속 실패 증상을 직접 없앤다 | **3순위로 올린다.** "62건이 남은 상태에서는 예산을 태운다"는 보류 사유는 2번 적용 후 32건이면 약해진다 |
| 4. 상태코드 분리 | 게이트 무관 | 가치 상승. 지금 프론트가 `FunctionsHttpError` 영문을 그대로 노출해 테스터가 원인을 못 읽었다 |
| 5. `config.toml` | 무관 | **확인함** — `[functions.single-run]`만 선언돼 있다 (`supabase/config.toml:423`) `[코드]`. 4건 중 어느 것의 원인도 아니다 |

> **"병렬화"는 §5.4에 없다** (`병렬` 문자열 0건, 2026-08-29 확인). 그리고 여기서는 **틀린 방향**이다 —
> 실패 모드가 rate limit이므로 순간 동시성을 올리면 429가 악화된다. 지연(실행 5초, 문서 전환
> 7~20초)은 줄지만 증상은 심해진다.

**착수 시 걸리는 것 (전부 미기록이었다):**
- Edge Function은 **Vercel 배포에 포함되지 않아 별도 배포가 필요하다** (CUTOVER-LOG §W8, `:194`).
- §5.4-2는 `tests/serverAuthorityMigration.test.js:61-66`의 계약을 깬다 → 테스트 동반 수정.
- **§5.4-2의 숨은 결합:** `target_revision_id`가 null이면 `apply_group_move_v2`가
  `private.resolve_wiki_revision(page_id, null)`로 폴백하고, 그것도 null이면
  `current_revision_id = coalesce(null, current_revision_id)`로 **이전 문서의 revision이 남는다.**
  지금 안전한 유일한 이유는 클라이언트가 이동 RPC 직전에 목적지를 스냅샷하기 때문이다
  (`GroupGamePage.jsx:1008` → `:1014`). **이 순서가 곧 계약이며 문서에 없었다.**
- **§5.4-1의 제약:** `wiki_page_snapshots`에 **HTML 컬럼이 없는데**
  (`20260814090000_server_authority_v2.sql:16-24`) `services/groupSpectatorService.js:92-96`은
  `documentHtml`이 없으면 `SPECTATOR_DOCUMENT_UNAVAILABLE`로 실패한다. 조기 반환은 pinned parse
  1건을 남겨야 하며, 이것이 문서의 "78 → 1~2건"과 일치한다.
- **추가 여지 (§5.4에 없음):** 관전 외 **모든 호출부가 반환값을 버린다** — 9개 호출 지점 전부
  `await ensureWikiSnapshot(page);`. 요청 body에 플래그를 두면 관전 아닌 호출은 warm 시 **0 요청**이다.

#### 5.5-4 "유효하지 않은 RETIRE 사유" — **해소 (2026-09-02 배포 완료)**

**RPC 계약 불일치가 아니었다.** 허용 값은 프론트(`services/groupMultiplayerService.js:212`)와
RPC(`20260814103000_group_final_gaps_v13.sql:920`) 모두 **`left` / `forfeited` 2개로 일치**한다.
관측된 한국어 문구는 **클라이언트 가드**(`groupMultiplayerService.js:213`)이며 RPC의 문구는
`RETIRE_REASON_INVALID`다.

**실제 원인은 `onClick` 바인딩이었다** `[코드]`. `handleReturnToLobby`의 첫 인자가 `retireReason`인데
세 곳이 핸들러를 그대로 `onClick`에 넘겨 **React가 SyntheticEvent를 첫 인자로 주입**했다.
기본값 `"forfeited"`는 `undefined`일 때만 적용되므로 이벤트 객체가 그대로 가드에 걸렸다.
**ExitGuard 경로만 정상이던 이유가 이것이다** — `GroupGamePage.jsx:1160`은
`() => handleReturnToLobby("forfeited")`로 감싼다. 게임 중 나가기는 되고 결과 화면만 실패한
관측과 정확히 일치한다.

**완주 후 나가기가 RETIRE 경로를 타는 것 자체는 맞다.** `leave_group_player`는 이름과 달리
완주자에 대해 전용 분기(`:937`)를 타서 `room_players` 행을 삭제하고 방을 종료할 뿐
**retire 처리를 하지 않으며 `p_retire_reason`을 읽지도 않는다.** 완주 기록은
`group_match_results`에 이미 있고 `where result_status <> 'finished'` 가드로 보호된다.
**방을 닫으려면 이 호출이 필요하다.**

**수정 (2026-08-29):** `pages/GroupGamePage.jsx:1267`·`:1434`·`:1491` 3줄을
`onClick={() => handleReturnToLobby("left")}`로 교체.

**세 분기 모두 `"left"`인 근거 (분기별 확인):**

| 줄 | phase | 도달 조건 | RPC 호출 여부 | reason 사용 여부 |
|---|---|---|---|---|
| `:1267` | FINISHED | `outcome === "finished"` ⟹ **완주자만** (`utils/onlineGameSession.js:152-157`) | 예 — `isFinishedExplicitLeave` | **미사용** (완주자 분기) |
| `:1434` | SPECTATING | FINISHED의 관전 버튼 또는 `viewMode === "spectating"` 복구 ⟹ **완주자만.** `send_group_spectator_emoji_v13`의 `SPECTATOR_FINISH_REQUIRED`도 같은 불변식을 강제한다 | 예 | **미사용** |
| `:1491` | ENDED | `room.status === 'finished'` ⟹ **완주 없이 종료된 경우를 포함한다** | **완주자만 호출.** 미완주자는 `shouldRetireGroupPlayer`가 false(방이 `finished`)이고 `isFinishedExplicitLeave`도 false라 **호출 자체가 없다** | **양쪽 다 미사용** |

즉 **세 곳 모두 reason이 도달 가능한 경로에서 실제로 쓰이지 않는다.** 그래도 `"left"`(게임 이탈)로
적는 이유는, `"forfeited"`(기권)가 완주자에게 **틀린 표현**이고 향후 이 값이 살아나는 리팩터에서
잘못된 라벨이 기록되지 않게 하기 위해서다. 라벨 대응은 `utils/groupResultFormatter.js:4-5`.
**`:1160`(ExitGuard, 경기 중 이탈)의 `"forfeited"`는 옳으므로 그대로 둔다.**

**남긴 것:** `handleReturnToLobby`의 기본값 `= "forfeited"`(`:1083`). 호출부 4곳이 전부 명시적이라
**도달 불가**가 됐지만, 직접 바인딩이 재발하면 여전히 SyntheticEvent가 들어와 가드에서
**소리 나게 실패한다** — 기본값을 바꿔도 그 보호는 달라지지 않으므로 범위 밖으로 뒀다.

**검증:** `npm test` **142/142 통과**, `npm run build` **exit 0** —
기준 커밋 `357a330`에 위 3줄만 얹은 상태에서 측정했다 (측정 시점은 커밋 전), 2026-08-29 `[산출물]`.

#### 5.5-5 `username-lookup` 404 — **종결. 결함이 아니다**

**404는 아이디 미존재 시의 의도된 응답이다** — `supabase/functions/username-lookup/index.ts:77-88`이
`{ok:false, error:"존재하지 않는 아이디입니다."}`와 함께 **명시적으로 HTTP 404**를 반환한다 `[코드]`.
프론트는 이미 이것을 처리한다 — `authContext.jsx:44-46`이 `operation === "username-lookup" &&
status === 404`를 `username-not-found`로 분류하고 "아이디 또는 비밀번호가 올바르지 않습니다."를
띄운다. 브라우저 콘솔의 `Failed to load resource: 404`는 **모든** 404에 찍히는 로그이며
함수 부재의 증거가 아니다.

**배포 증명은 로그인 성공 그 자체다.** `pages/LoginPage.jsx:157`은 `loginWithUsername`만 쓰고,
그 경로는 이 함수가 돌려주는 `syntheticEmail` 없이 `authContext.jsx:223-227`에서 반드시 실패한다.
이메일 로그인 대체 경로가 화면에 없다. **W9에서 로그인이 통과했으므로**(CUTOVER-LOG §W9 통과 표)
**이 함수는 배포돼 있고 동작한다.**

**U9(운영 배포 함수 목록 미확인)와는 별개 축이다.** U9는 §5.6-4(`target-level` 실물 확인)로 남지만
이 건이 그 근거는 아니었다. 운영 확인이 더 필요하면(사용자 수행): ① 존재하는 아이디 로그인 →
200이면 확인 — **이미 관측됨**, ② 응답 body 구분 — 배포됨은 위 한국어 문구, 미배포는 게이트웨이의
`{"code":"NOT_FOUND",...}`, ③ `supabase functions list --project-ref <ref>`.

#### 5.5-6 관전 이모티콘 — ~~스펙 위반 여부 미확정~~ → **스펙 범위 밖으로 종결 (2026-09-02)**

> **종결 판정** `[사용자 판정, 2026-09-02]`. 아래 조사가 근거다 — **스펙은 "완주 관전자만
> 전송 가능"만 규정하고 수신자를 규정하지 않는다.** 렌더 경로가 `SPECTATING` 분기 하나뿐이라는
> 사실은 확정이지만 **그것이 위반이라는 근거가 없다.** 테스터의 기대가 스펙보다 넓었던 건이다.
> **수신 범위를 넓힐지는 제품 판단이며 결함 수정이 아니다.**
> **관전자 2명 조건의 실제 전달 여부는 여전히 미검증이다** (§5.0 A3) — 아래 "확인 방법"이
> 그대로 쓰인다.

**확정된 것:** `visibleSpectatorEmojis`가 렌더되는 곳은 `pages/GroupGamePage.jsx:1379`
**단 한 곳**이고 `phase === SPECTATING` 분기 안이다. PLAYING 분기에는 이모티콘 렌더 코드가
**아예 없고** FINISHED 분기도 마찬가지다. 복원 effect도 `phase !== SPECTATING`이면 즉시 반환한다
(`:893`) `[코드]`. **즉 아직 달리고 있는 참가자는 수신 여부와 무관하게 볼 수 없다.**
4인 중 1명만 완주해 관전 중이었다면 렌더할 사람이 아무도 없다 — 관측과 일치한다.

**스펙 위반이 아닐 가능성이 크다.** `01-CONFIRMED-SPEC.md` §6.4와 `code/13-GROUP-FINAL-GAPS.md`
§2.3은 **"완주 관전자만 전송 가능"만 규정하고 수신자를 규정하지 않는다** `[문서]`. 항목 전체가
"관전과 소통" 아래에 있다. **테스터의 기대가 스펙보다 넓었던 건으로 보인다** — 제품 판단이 필요하다.

**미확정 — 관전자 ↔ 관전자 전달.** 경로는 코드상 정상으로 읽힌다: 송신은 `room_events` insert
(`20260814123000_group_spectator_emoji_atomicity_fix.sql:141`), 수신 구독은 phase와 무관하게 항상
등록되며(`GroupGamePage.jsx:747-760`), RLS SELECT는 같은 방 참가자면 통과한다
(`20260730170602_baseline_remote_schema.sql:1077`), publication 등재도 `:1194` + W7 확인.
**관전자가 1명뿐인 스모크로는 검증되지 않았다.**

**확인 방법 (운영 DB 접근 불필요):** 관전자 2명을 만든 뒤 A 전송 → B 실시간 확인 → B 새로고침 후
재진입. 복원 effect가 `room_events`를 REST로 조회하므로(`services/groupMultiplayerService.js:237-243`)
**새로고침 후엔 보이고 실시간엔 안 보이면 Realtime, 둘 다 안 보이면 insert/RLS, 둘 다 보이면
렌더 범위 문제만 남는다.**

#### 착수 순서 — ~~3 → 4 → 5 → 6~~ → ~~3 → 6~~ → **전부 소화됨 (2026-09-02)**

**실제로 이렇게 흘렀다:** 5(결함 아님) → 4(수정) → 3(§5.4-2 + §5.4-1 동시 적용,
한 번의 Edge Function 배포에 함께 실음) → **측정(W9-b)** → §5.4-3 **불필요 판정** →
6(스펙 범위 밖 종결). **§5.5-3의 재평가가 정한 3 내부 순서를 그대로 밟았고 결과가 맞았다.**

**다음 작업 목록은 이 절이 아니라 §5.0이다.**

**부수 관찰 (수정 대상 아님, CUTOVER-LOG §W9):** 문서 전환 애니메이션 없음(디자인 범위),
문서 전환 7~20초(발견 3과 같은 뿌리일 가능성),
대기실 "최대 6명" 표시 — **이것은 결함이 아니다.** `services/groupMultiplayerService.js:19`의
`createGroupRoom` 기본값이 `maxPlayers = 6`이고 Packet 13 제약은 `max_players between
min_players and 8`이므로 **6은 유효 범위 안**이다 `[코드, 2026-08-28 확인]`. 기본값을 8로 올릴지는
제품 판단이다.

### 5.6 창이 만든 문서 정합 작업

**2026-08-28에 저장소 전체를 훑어 "W6 이전 상태를 현재 사실로 단정하는 서술"을 조사했고,
2026-08-29에 정리를 끝냈다** `[산출물]`.

> **2026-09-02에 같은 종류의 정리가 한 번 더 필요했다.** 이번에 낡은 것은 "W6 이전"이 아니라
> **"게이트가 켜져 있다 / W10 미수행"** 을 현재 사실로 단정하는 서술이다. 대상은
> `AGENTS.md` §1.1(항목 2), `10-CODE-MASTER-TODO.md` §2(항목 9), 그리고 이 파일 자신이다.
> **교훈은 같다 — 상태가 바뀌면 그 상태를 인용한 문서가 전부 낡는다.**
> **남은 것은 여전히 운영 재조회가 필요한 2건(1·4)과 미작성 1건(8)이다.**

**적용한 원칙 — 문서 성격에 따라 방식을 나눴다:**

| 성격 | 방식 | 대상 |
|---|---|---|
| 현재 상태를 서술하는 문서 | **갱신** — 낡은 서술을 취소선으로 남기고 "언제까지 참이었고 무엇이 바꿨는지" 병기 | `AGENTS.md`, `CLAUDE_HANDOFF.md`, `10-CODE-MASTER-TODO.md` §2 |
| 특정 시점 판정을 담은 문서 | **봉인** — 서두에 시점·무효 사유 헤더, **본문 보존** | `WIKI_RACE_GROUP_DB_SECURITY_SPEC.md`, `qa/30` §21, `18-SERVER-AUTHORITY-V2-...md` |

**실행 기록은 지우지 않았다.** 낡았다는 사실이 드러나게만 했다.

| # | 항목 | 상태 |
|---|---|---|
| 2 | ~~`AGENTS.md` §1.1 근거 서술~~ | **완료 (2026-08-28) → 다시 갱신 (2026-09-02).** 2026-08-28에 근거를 "운영에 V2 RPC가 없다"에서 **"유지보수 게이트가 유일한 방패다"** 로 교체했는데, **W10이 그 게이트를 껐다.** 2026-09-02에 근거를 **"방패가 없다 — `main` push는 곧 사용자 노출이다"** 로 다시 썼다. **금지는 세 번 다 유지됐고 근거만 바뀌었다** (§3의 이력 상자) |
| **9** | **`10-CODE-MASTER-TODO.md` §2 판정 블록** | **완료 (2026-09-02).** 표 아래 블록이 "`RELEASE HOLD`는 유지되며 사유는 W9 미해결 4건 / 게이트가 켜진 채 / W10 미수행"으로 남아 있었다 — **세 문장 전부 더 이상 사실이 아니다.** 현재 사실로 교체하고 판정의 단일 기준이 이 파일 §1임을 유지했다. **표의 최종 갱신 날짜·기준 커밋도 함께 옮겼다** (`AGENTS.md` §6) |
| 5 | ~~`docs/CLAUDE_HANDOFF.md` 갱신~~ | **완료 (2026-08-29).** 보고한 9개 위치를 전부 교체하고 **§0.2에 "바뀐 지점" 표**를 신설했다. §3.1 제목·본문(함수 7→36, legacy RPC 0, 이력 12행), §1.4(Release A~D → U2), §3.2 판정(HOLD 사유 표로 전후 대비), §4.1·§4.2·§4.4(해소 항목 정리), **§4.5 신설**(창이 만든 미해결 4건 + 절차 공백 2건), §5(진입점 재작성). 근거는 전부 `CUTOVER-LOG-2026-08-27.md`의 단계로 명시. **2026-09-02 재갱신** — 서두 기준 커밋·`origin/main` 값, §0.2 §3.2 행, §4.1 `main` push 행, §4.5(4건 종결 블록 추가), §5 진입점 1·2번을 **게이트 해제 후 사실**로 옮겼다 |
| 7a | ~~`10-CODE-MASTER-TODO.md` §2~~ | **완료 (2026-08-29).** 순서 1 `[~]`→`[x]`, 순서 2 `[ ]`→`[x]`, 순서 8 `[ ]`→`[~]`. **표 머리에 "최종 갱신 날짜·기준 커밋·브랜치"를 넣었다** — 날짜 없는 상태표가 다시 생기지 않게 하는 것이 목적이다. "순서가 `[x]`라고 릴리스가 열린 것은 아니다"도 함께 |
| 6 | ~~`WIKI_RACE_GROUP_DB_SECURITY_SPEC.md`~~ | **완료 (2026-08-29) — 봉인.** 기존 stale 표기가 시간 규칙만 덮고 있었다. **운영 상태 축을 별도로 명시**했다: 적용 상태(`:6`·§4.1), §5.4 "현재 RLS 잠금 필요"(W7 `rls_off_tables = 0`), **§13의 `db push`·`migration repair` 금지 — 둘 다 2026-08-28에 건별 승인 아래 실행됐다** |
| 3 | ~~`qa/30-INTEGRATION-CHECKLIST.md` §21~~ | **완료 (2026-08-29) — 봉인.** `RELEASE HOLD` 판정은 유지하고 **사유가 바뀌었음**을 전후 표로 명시. 미체크 4항목이 창에서 어떻게 닫혔는지도 행별로 적었다. **2026-09-02 재갱신** — 봉인 헤더의 "`RELEASE HOLD` 판정 자체는 유지된다"가 낡아 **해제 행을 표에 추가**했다. **§22(새 게이트 기록) 작성은 여전히 미수행** |
| 7b | ~~`18-SERVER-AUTHORITY-V2-IMPLEMENTATION.md`~~ | **완료 (2026-08-29) — 봉인.** Release A~D가 U2로 대체되고 실제 절차가 `CUTOVER-PLAN` W0~W11이었음을 **파일 안에** 명시했다 — 그전에는 이 파일만 읽으면 알 수 없었다. `--prune` 금지·이름 명시 제약도 함께 |
| ~~**1**~~ | ~~**새 운영 스냅샷 `PROD-SNAPSHOT-YYYY-MM-DD.md` 작성**~~ | **완료 (2026-09-02) — `docs/ops/PROD-SNAPSHOT-2026-09-02.md`.** 08-20 대비 변화 5축(테이블 14→21, 함수 7→36, RLS off 2→0, **정책 29→33**, 이력 0→12)을 **migration별로 매핑**했고, 새 테이블 7개·정책 0개 테이블 7개·publication 미변화의 근거를 `[코드]`로 붙였다. 기존 파일은 **보존**했다. **남은 공백은 그 문서 §9** — 정책 **이름·술어**, 함수 이름 목록, 제약/ACL 대조가 이번 조회에 없었다 |
| **4** | **`target-level` Edge Function 존재 확인** | **미수행 — 운영 조회 필요.** §8.1-7. `--prune` 미사용은 확인됐으나 실물 확인은 안 했다 |
| 8 | `qa/30` §22 새 게이트 기록 작성 | 미수행. 창 결과를 체크리스트 형식으로 등재 (CUTOVER-PLAN §10.2) |

**그대로 둔 것 (날짜 있는 실행 기록):** `10-CODE-MASTER-TODO.md` §9.8,
`11-REPOSITORY-AUDIT.md` §21, `13-GROUP-FINAL-GAPS.md` §21의 `RELEASE HOLD` 판정줄.
**다만 `CLAUDE_HANDOFF.md` §3.2가 그중 둘을 "현재 판정"의 근거로 인용하던 것은 고쳤다** —
이제 판정의 현재 값은 이 파일 §1에서 읽고 그 문서들은 시점 기록으로만 읽도록 명시돼 있다.

**낡지 않은 것 (확인함):** `README.md` — 유지보수 게이트 절은 **특정 시점 상태를 단정하지 않는다.**
게이트를 켜고 끄는 방법만 적혀 있고, `:120`이 "점검 종료 시 `VITE_MAINTENANCE`를 **삭제하거나**
`false`로 바꾸고 다시 Redeploy"라고 **W10이 실제로 한 조작을 그대로 담고 있다** `[코드, 2026-09-02
재확인]`. **게이트 해제로도 낡지 않았다** — 상태가 아니라 절차를 적었기 때문이다.
`PROD-SNAPSHOT-2026-08-20.md` 본문 — 서두에 "특정 시점 관찰이며 변경 시 무효"가
이미 있어 **역사 기록으로 성립한다** (§6 문서 표에 무효 표기를 더했다).
`GROUP_SPECTATOR_MIGRATION.sql`·`onboarding_full_avatar`의 "미적용/미배포"는 **다른 사안**이다.

---

## 6. 참조 문서

| 문서 | 역할 |
|---|---|
| `AGENTS.md` | **상시 가드레일.** 세션마다 자동 로드. 운영 DB 변경·commit/push·임의 삭제 금지, 추측 금지, 수치 기재 규칙, 이 파일의 갱신 의무(§7) |
| `docs/agent/CURRENT.md` | **이 파일.** 지금 상태의 단일 기준. 판정·수치·다음 작업 |
| **`docs/agent/PACKET-CONTRACT-GAPS.md`** | **패킷 14~17 계약 고정의 작업 기준 (2026-09-02 신설).** 패킷 간 의존·공유 테이블·공유 화면, 계약 공백 **G1~G20**, **시안 78화면 × 10섹션 대조**, 오늘 3코스 전환 판정, **W0~W3 착수 순서**. **§5.0 C의 상세이며 패킷 작업을 시작하는 세션이 먼저 읽는다** |
| **`docs/agent/TRACKS.md`** | **병렬 트랙 파일 소유권의 단일 기준 (2026-09-02 신설).** 트랙 A~D의 **배타적 파일 화이트리스트**, 동결 파일 목록, 공유 위험 파일과 계약 유지 조건, migration 파일명 예약, **결과 화면·프로필 화면·공통 컴포넌트 겹침 판정**, **15a/15b 분리 판정**, **3코스 창 5항목 통합과 게이트 재판정**, 트랙별 티켓(목표·범위 밖·읽을 파일·건드릴 파일·수용조건·의존). **트랙을 시작하는 세션은 `PACKET-CONTRACT-GAPS.md` 다음에 읽는다** |
| **`docs/contracts/`** | **공통 계약 (2026-09-02 신설). C1~C5 + `README.md`.** 패킷 14~17이 공유하는 테이블 DDL·RPC 시그니처·RLS 방향·렌더 규칙. **소유자는 전부 `공통`이며 어느 패킷도 재정의하지 않는다.** `README.md`에 DDL·RPC·RLS 공통 규칙과 **계약별 창 필요 여부**가 있다 |
| **`docs/design/MOBILE-VALIDATION-CORRECTIONS.md`** | **모바일 시안 정정 기록 (2026-09-02 신설).** 시안이 "확정값의 변환, 새 기능 없음"을 선언했으나 어긋난 지점을 남긴다 — **시안 오류 6건**(순차 해제·XP 수치·칭호·그룹 2위 XP·슬롯 명칭, 그리고 **Freeze v1 내부 불일치 1건**)과 **범위 밖 1건**(`오늘의 발견`). **네 건 모두 Freeze v1 쪽이 확정값과 일치했다.** **시안 HTML은 수정하지 않았다** |
| `docs/design/*.html` | **시안 원본 2개** — Freeze v1 FINAL(78화면 요구사항)·Mobile Visual Validation v0.1. bundled 형식이라 원문 검색이 되지 않는다. **수정하지 않는다.** 확정값과의 차이는 위 정정 문서에서 읽는다 |
| `docs/ops/CUTOVER-PLAN.md` | **운영 cutover 실행 계획.** W0~W11 창 절차, 백업·삭제 전문, **롤백 판단 기준(§6.0)**·복원 절차(§6.3)·리허설 기록(§6.5), 창 전 선행 조건(§7), 창 후 검증(§8), 미결정 항목(§9), Release A~D 대체 매핑(§10). **창을 열기 전 §7을 이 문서 기준으로 점검한다.** 창 중 롤백 판단은 **§6.0만 펼치면 끝나도록** 쓰여 있다 |
| `docs/ops/wipe-public.sql` | **§6.3 2단계 실행 파일.** 실행은 `docker run --rm -i --entrypoint psql <승인이미지> "<CONN>" -v ON_ERROR_STOP=1 -f -`로 한다 (§6.3.0 A안 — 이 머신에 `psql`이 없다). `public`·`private` 스키마를 비우고 덤프가 담지 않는 스키마 속성 2건(owner, PUBLIC USAGE)을 복원한다. **파일 안에 자체 `begin;`/`commit;`이 있어 바깥에서 감싸도 롤백되지 않는다 — 시험 실행이라는 것이 없다** (§6.3.1-0) |
| `docs/ops/slice-public.awk` | **§6.3.3 (b) 대체 경로.** 전체 데이터 덤프에서 `public` COPY 블록만 남긴다. W2에서 `--schema public` 덤프를 떴다면 필요 없다 |
| `docs/ops/CUTOVER-LOG-TEMPLATE.md` | **창 기록 틀 (P12).** 창 당일 `docs/ops/CUTOVER-LOG-YYYY-MM-DD.md`로 **복사해서** 쓰고 원본은 남긴다. W0~W11 단계별 시각·판정, G1~G3 게이트, W2.5 측정값, W4~W9 결과, 롤백 시 트리거·등급·승인 시각·복원 소요, 창 후 이월을 빈칸으로 담았다 |
| **`docs/ops/CUTOVER-LOG-2026-08-27.md`** | **실제 창 실행 기록 (2026-08-27~28 창 + 창 밖 후속 ~2026-09-02).** W0~W11 단계별 결과, G1~G3 도달 시각, W2.5 실측값, W7 검증 전항목, **W9 결함 6건**, 2026-08-28의 W10 미수행 판정(보존), **창 밖 후속 §W1-b·§W8-b·§W9-b·§W10·§W11-b**, **§6 총평(계획 검증·수정 대상 7건·템플릿 개선안·§6.5 창의 최종 형태)**. **다음 창을 여는 세션은 §6 총평부터 읽는다 — 특히 §6.5** |
| `docs/CLAUDE_HANDOFF.md` | 배경 인계 문서. 확정 스펙 근거 매핑, 의도적 제외 vs 미구현 구분, 확인 필요 항목, 런타임 baseline 축의 성질. **2026-08-29에 창 결과를 반영했다 — 바뀐 지점은 §0.2, 창이 만든 미해결은 §4.5** |
| `docs/WIKI_RACE_GROUP_DB_SECURITY_SPEC.md` (봉인) · `wiki-race-2.0-handoff/code/18-...md` (봉인) · `qa/30-INTEGRATION-CHECKLIST.md` §21 (봉인) | **특정 시점 문서.** 2026-08-29에 서두 봉인 헤더를 붙였고 **본문은 보존했다.** 현재 사실의 근거로 인용하지 않는다 — 시점과 무효 사유는 각 헤더에 있다 |
| **`docs/ops/PROD-SNAPSHOT-2026-09-02.md`** | **운영 상태의 현재 기준 (2026-09-02 실측).** 테이블 21 / 함수 36 / **RLS 21/21 · 정책 33**(정책 0개 테이블 7) / publication 4 / 이력 12행 / users 145 · `game_records` 59. **08-20 대비 변화를 migration별로 매핑**했고, 정책 0개가 결함이 아니라 3계층 접근 설계라는 근거(`[코드]`)와 **publication 미변화가 향후 실시간 기능에 거는 선행 조건**을 담았다. **§4.2.1이 중요하다** — 저장소 파생이 두 시점에서 실측을 재현했으므로 **다음 조사는 운영 조회 없이 파생을 1차 근거로 쓸 수 있다**(성립 조건 3가지 포함). 남은 축은 §0.2·§9 |
| `docs/ops/PROD-SNAPSHOT-2026-08-20.md` | 운영 Supabase 읽기 전용 실측(2026-08-20). **⚠ 무효 — 2026-08-28 창이 무효화했고 2026-09-02 스냅샷이 대체했다.** **역사 기록으로만 읽는다.** 다만 **`avatars` 객체 실측(§4.1)과 런타임 17.6(§5)은 09-02에 재조회되지 않아 그쪽이 여전히 마지막 실측**이다 |
| `wiki-race-2.0-handoff/01-CONFIRMED-SPEC.md` | 게임 규칙 **단일 기준선**. 다른 문서와 충돌하면 이 문서 우선 |
| `wiki-race-2.0-handoff/code/10-CODE-MASTER-TODO.md` | 작업 순서·의존성·Packet 13 검증 이력(§9~§9.8) |
| `wiki-race-2.0-handoff/code/11-REPOSITORY-AUDIT.md` | 저장소 감사 결과와 보존 원칙 |
| `wiki-race-2.0-handoff/code/13-GROUP-FINAL-GAPS.md` | Packet 13 범위와 R~R3.2 판정 근거 |
| `wiki-race-2.0-handoff/code/18-SERVER-AUTHORITY-V2-IMPLEMENTATION.md` | Release A~D 절차와 cutover 주의사항. **artifact 분할은 U2로 대체됐다** — 대체 매핑은 CUTOVER-PLAN §10 |
| `wiki-race-2.0-handoff/code/14~17` | 미구현 패킷 계획(1:1 아이템, XP·레벨·랭킹, 업적·보상, 탐험·프로필·게스트) |
| `wiki-race-2.0-handoff/qa/30-INTEGRATION-CHECKLIST.md` | 통합 QA 체크리스트와 릴리스 게이트 기록 |
| `docs/WIKI_RACE_GROUP_DB_SECURITY_SPEC.md` | **stale.** 그룹 시간 규칙이 15분/3분으로 남아 있음. 확정값은 20분/2분 |
