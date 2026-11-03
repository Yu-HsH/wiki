# 검색 Edge CPU 최적화 및 출시 게이트 — 2026-11-03 KST

판정: **로컬 성능 게이트 통과 / Production HOLD**. 기준 `96fec9b4c7d1adb5cc4a9d8df54a2896914633c1` + 미커밋 후보. 제품 소스 fingerprint `a449f156fd3e92f56098fa79e174d37d7ad7780d16584f9b8c075697cfafff62`. 최종 커밋 기준은 [CURRENT](../agent/CURRENT.md)와 Draft [PR #8](https://github.com/Yu-HsH/wiki/pull/8)의 head가 우선한다. 운영 DB/Edge/main/Production 변경0, 새 의존성0. [전체 측정 JSON](SEARCH-CPU-2026-11-03.json), [전환·복구·보존 정책](JUNGLE65-SEARCH-CUTOVER-2026-11-03.md).

## 병목과 변경

큰 raw HTML의 parse5 파싱, 반복 class 검사/배열 생성, 각 문단·리스트·anchor의 하위 텍스트 재귀 결합, 반복 href/현재 제목 정규화가 CPU와 GC를 소모했다. 새 정제기는 후위 순회에서 pruned-tree 텍스트 유무를 한 번 계산하고 렌더에 재사용한다. 한 chunks 배열에 출력하고, 동일 href 목적지와 현재 제목 key를 재사용한다. 빈 요소의 body 재파싱과 matchAll 결과 배열도 제거했다.

raw→AST와 HTML5 canonicalize/최종 manifest 파싱은 유지했다. 전부 한 AST로 합치면 foster parenting·pre의 선행 LF 제거·텍스트 노드 경계가 달라질 수 있다. 실제 `<pre>\n\n\nx</pre>`의 기존 결과까지 새 단위 검사로 고정했다. 단순 문자열 비교를 지우거나 허용 오차를 늘리지 않았다.

Node v24.18.0 / process.cpuUsage / performance.now / memoryUsage로 같은 corpus·revision 전후5쌍씩 측정했다. 아래는 약5.7MB 문서의5쌍 중앙값이며 CPU는 GC 등 **Node 프로세스 전체 스레드** 시간이다. Edge의 worker CPU 계측값이라고 부르지 않는다. Windows CPU 값은 약15.6ms 단위로 거칠고 짧은 구간은0이 나올 수 있다. wall과 CPU를 혼용하거나 각 구간 p95를 더하지 않는다.

- 총 wall 중앙값 **1324 → 1153ms**, CPU 중앙값 **2328 → 1780ms** (CPU 약23.5% 감소).
- parser 경계에서 관측한 최대 heap **198.4 → 197.5MiB**. 연속 peak나 Edge 메모리 실측이 아니며 메모리가 크게 줄었다고 주장하지 않는다. RSS·각 단계 heap·모든 원시 표본은 JSON에 있다.
- 실제 Edge는 Runtime1.74.3/Deno2.1.4, 기존 memory256MB/CPU soft1000ms/hard2000ms 설정을 유지했다. 이번 로그에서 CPU hard/WORKER_LIMIT/memory limit 이벤트0. Node CPU 수치만으로 이 판정을 내리지 않았다.

|구간|이전 wall / CPU 중앙값(ms)|이후 wall / CPU 중앙값(ms)|
|---|---:|---:|
|input_guard|23 / 16|20 / 16|
|source_parse_and_root|586 / 1140|602 / 1093|
|prune_and_text_predicate|196 / 640|54 / 63|
|link_index|15 / 16|15 / 16|
|render|249 / 297|188 / 281|
|canonicalize_and_serialize|151 / 204|119 / 188|
|final_parse_and_manifest|121 / 141|104 / 109|

## 이전75회와 같은 조건의 비교

기존5개 실제 ko.wikipedia.org 문서와 **같은 page/revision**, 검색 정제 cache Cold5회→Warm10회다. source 링크 그래프는 두 번 모두 이미 준비된 상태이며 Wikipedia CDN/네트워크는 통제하지 않았다. 첫 요청 외 isolate를 매번 강제 재시작하지 않는다. 링크 ID 전체 cold resolution은 측정 범위 밖이다. 기준 이전 보안fdd7190(2026-11-02), 이후96fec9b+위 fingerprint(2026-11-03). 이후75회는 정제 최적화 소스, 추가30회는 single-flight까지 포함한 Edge로 실행했다.

**이전68/75 성공·7 WORKER_LIMIT → 이후75/75 성공·실패0**. 아래 p50/p95/max는 실패 응답도 포함한 **전체 시도 응답 시간**이다. 실패 응답은 준비 완료가 아니며 실사용 시간0이다. 성공 표본만의 분위수로 출시를 판단하지 않는다. nearest-rank이며5회 표본의 p95는 최대다.

|문서/조건|이전 성공/시도|이전 전체 응답 p50/p95/max(ms)|이후 성공/시도|이후 전체 응답 p50/p95/max(ms)|이후 최소 잔여(ms)|
|---|---:|---:|---:|---:|---:|
|쿼크별 / cold|5/5|1354 / 1388 / 1388|5/5|1129 / 1687 / 1687|13313|
|쿼크별 / warm|10/10|113 / 137 / 137|10/10|73 / 82 / 82|14918|
|한강 / cold|5/5|1710 / 1853 / 1853|5/5|1340 / 1441 / 1441|13559|
|한강 / warm|10/10|131 / 195 / 195|10/10|70 / 78 / 78|14922|
|대한민국 / cold|5/5|2259 / 2556 / 2556|5/5|1921 / 5868 / 5868|9132|
|대한민국 / warm|10/10|123 / 133 / 133|10/10|81 / 89 / 89|14911|
|오위백법 / cold|5/5|3304 / 3746 / 3746|5/5|2700 / 2770 / 2770|12230|
|오위백법 / warm|10/10|166 / 324 / 324|10/10|97 / 102 / 102|14898|
|대한민국 제22대 국회의원 선거 여론 조사 / cold|1/5|5044 / 10531 / 10531|5/5|3282 / 3397 / 3397|11603|
|대한민국 제22대 국회의원 선거 여론 조사 / warm|7/10|197 / 5911 / 5911|10/10|105 / 113 / 113|14887|

기존 대형 Warm10회 중 처음4회는 실제 cache miss였고3회 실패했다. 실제 hit6회는 성공6/6이다. 이후 Warm50회는 모두 실제 hit다. 대한민국 Cold의5,868ms 표본도 남겼다. 그중 html_fetch5,594ms/parse163ms여서 모든 지연이 CPU 최적화로 줄었다고 주장하지 않는다.

## 대형 실제 Cold20회 추가

약5,696,443bytes, page3774165/revision42291346. 각 요청 전에 정제 cache를 실제로 삭제하고 새 경기·정상 use RPC의 원래15초를 사용했다. source HTML은 실제 pinned Wikipedia에서 읽었다.

|조건|성공/시도|실제 hit|전체 응답 p50/p95/max(ms)|최소 실사용 잔여(ms)|
|---|---:|---:|---:|---:|
|추가 Cold|20/20|0|3328 / 3796 / 3918|11082|
|이어진 hit|10/10|10|103 / 127 / 127|14873|

기존 비교군5 Cold와 합쳐 대형 cache miss **25/25**, 실제 hit20/20, CPU hard limit 실패0이다. 실패 요청을 미리 prewarm으로 바꾸어 집계하지 않았다. 호스팅된 Production에서 같은 성능을 보장하는 표본은 아니다.

## canonical/검색/링크 동일성과 실제 UI

프로파일러가25쌍 전체의 HTML·textNodes·policy를 deepEqual, anchor attrs/목적지를 deepEqual, literal/gi 질의 결과를 기존 구현과 비교했다. 별도 malformed/entity/table/namespace 조합1,000개도 deepEqual 통과했다. HTML이 같으므로 같은 policy prefix의 documentHash 계산과 page/revision identity를 유지한다. sanitizer allow/block 규칙과 실제 클릭 허용 제목은 변경하지 않았다.

실제 Auth/DB/Edge/React,5문서×320/390px×Cold/Warm **20/20** 검색·manifest·강조 통과. 준비 Edge는 실제 Wikipedia를 읽고 브라우저 초기 본문은 같은 revision corpus를 공급했다. 대한민국→한강 실제 corpus 링크4회는 DB `APPLIED`와 page6160/revision42027587 전환까지 확인했다. images 요청은 텍스트 성능 측정에서만 차단했으며 이미지/폰트는 별도 디자인 검사로 확인했다.

아래 각 칸은 use RPC 요청 시작→패널 표시 / 15,000ms에서 그 값을 뺀 잔여 시간이다. 각 조건1회이므로 UI p95를 주장하지 않는다. 실제 클릭 전 자동 스크롤 대기는 시작점에서 제외한다. 이 값은 검색 성공·시간 연장을 의미하지 않으며 서버가 실제 expires_at을 다시 검사한다.

|문서|320 Cold 표시/잔여(ms)|320 Warm|390 Cold|390 Warm|
|---|---:|---:|---:|---:|
|쿼크별|1474 / 13526|148 / 14852|1376 / 13624|120 / 14880|
|한강|1516 / 13484|391 / 14609|1158 / 13842|377 / 14623|
|대한민국|4200 / 10800|889 / 14111|2833 / 12167|979 / 14021|
|오위백법|3854 / 11146|203 / 14797|2848 / 12152|218 / 14782|
|대한민국 제22대 국회의원 선거 여론 조사|3805 / 11195|231 / 14769|3609 / 11391|256 / 14744|

대형 Cold UI의 최소 잔여는 **11195ms**다. 탐색 중19회 UI 실행에서 상대 heartbeat=NULL인 fixture 때문에1회 GAME_NOT_ACTIVE가 났던 보고서도 JSON에 보존했다. 해당 실패 실사용 시간은0이다. 그 요청의 html_fetch8,858ms/parse801ms를 삭제하지 않았다. 서버가 정상적으로 연결 종료를 판정한 결과라 두 번째 계정의 실제 heartbeat RPC를 추가했고, deadline/종료 규칙을 변경하지 않은 최종20회 전체를 재실행했다. 이 밖에 전날 날짜 fixture, Action parse page 매개변수 누락, 공유 Edge test transport 동시 실행을 수정하고 검사를 순차 재실행했다. 검사 삭제/skip/강제 클릭/오차 확대0이다.

## 실패·캐시·동시성·복구

활성화 뒤 준비 실패는 슬롯 소비/성공 미소비/원래 deadline 유지다. UI에 그 사실을 안내한다. 재활성화·자동 환급·15초 연장을 추가하지 않았다. prewarm/입장 비동기 준비/크기 preflight는 [별도 정책 비교](JUNGLE65-SEARCH-CUTOVER-2026-11-03.md)에 제안과 구현을 구분했다. 준비 불가 시 로컬 검색 fallback은 없다.

같은 worker의 pending content 계산만 공유하고 put/commit/expiry는 사용자마다 검증한다. 실제 같은 snapshot Cold8준비·독립8성공에서 upstream fetch는 **3회**, 저장문서는1행이었다. 전역1회 계산을 보장하지 않는다. 다른 isolate/캐시 쓰기 전 경합까지 막는 distributed lease는 미구현이다. 세션·요청7일 이상 및 finished 조건, 문서 생성30일+무참조 조건, snapshot 잠금·재검사, 인덱스3개, postgres 수동 batch 청소 후보를 만들었다. 자동 Cron은 없다. 정책 버전은 출력이 같아 v1을 유지하고 미래 변경은 drain+forward migration을 요구한다.

실제 작은 SQL fixture에서 session row 평균148bytes, request row 평균349bytes(최대353)였다. 작은 질의 표본이며 최대4,096자 질의/응답의 길이·TOAST·인덱스·WAL·backup은 이 값보다 커질 수 있다. 예시로10,000활성화/일×7일×(148+2요청×349)는 약59.2MB의 row값이고, 실제5문서 비율 unique revision1,000개 논리 HTML+manifest는591.6MB다. 진행/중단 경기 보존 때문에7일보다 오래 남을 수 있고 미발견 요청 수 제한은 추가하지 않았다. 과금량 예측으로 단정하지 않는다.

## 전체 검증·산출물

모두96fec9b + 위 미커밋 제품 fingerprint, 2026-11-03 KST. 세부 보고서는 JSON과 Git 제외 .temp/search-cpu-20261103 아래다.

|검사|결과|
|---|---|
|npm test / build / diff|765/765·fail/skip0 / build 성공·기존 chunk 경고 / 통과|
|기존 검색 SQL / 아이템 SQL|23/23 +157/157|
|최종 신규 migration 원문·게이트/보존 SQL|34/34, rollback 전용 트랜잭션에서 원문 재적용|
|실제 Auth/DB/Edge/React 보안·복구|22/22; 한 세션8동시1소비, 독립8동시성공, 동일 ID, 상태 변조, F5, 잠금 대기 만료,429/identity/timeout, 구형 탭·검색 중지/복구|
|실제 두 계정1:1·3인 그룹|22/22; 아이템·승패·기권·XP·F5·READY·개인/최종 결과·중복 지급 방지|
|실제 그룹 관전 추가|8/8; 개인 완주→관전 전환→다른 참가자 계속 경기→최종 결과·XP/F5. 기준24acb2a+관전 assertion 미커밋 runner, 2026-11-03 KST. 제품 fingerprint 동일|
|디자인 보호 / 전체 / 1:1 로비 / 모바일 회귀|246 /154검사·108화면 /116검사·38화면 /78검사 통과|
|에셋 보존|27e5056 대비 public 변경0; 폰트 CSS/라이선스 변경0|

신규 로컬 migration3개는 기반 게이트 `20261102080000`, guard 연결 `20261103090000`, 보존 `20261103100000`이다. 기존 pending 검색 `20261102090000`은 수정하지 않았다. Edge 변경은 신규 후보 `duel-search`의 document/index/singleflight이며 기존 Edge8개 변경0이다.

## 최종 출시 판단

로컬 CPU 성능 문제는 이번 반복 범위에서 재현되지 않았고 로컬 게이트는 통과했다. **Production HOLD**: 운영 적용 승인 없음, 최신 운영 이력/ACL/Edge/백업/실제 drain/Production SHA 대조 미실행이다. 운영45개/Edge8 ACTIVE는 사용자 제공 정보로 유지한다. 호스팅 환경의 cold/네트워크·cross-isolate 중복·캐시 증가 관찰과 승인된 다계정 운영 스모크가 남아 있다. 구형 프론트로 돌아가 검색 우회를 복원하는 것을 정상 rollback으로 취급하지 않는다.

검증 runner 초기 링크 fixture는 기존 로컬 대한민국 snapshot의 한강 목적지에도 `target_page_id='6160', target_revision_id='42027587'` UPDATE를 실행했다. 기존 page ID는6160으로 확인됐지만 UPDATE 전 revision 값은 따로 기록하지 않아 의미상 변경/원상복구 여부는 확인 필요다. 이후 runner는 자신이 만든 snapshot만 보정하고 기존 graph는 읽기 전용으로 대조하도록 수정했다. 이 한 종류의 로컬 캐시 메타데이터와 운영 DB를 혼동하지 않는다. 기존 작업 트리의 제품/사용자 문서·에셋 변경은 보존했다.

GitHub CI/Preview의 최종 SHA 결과는 feature push 후 PR #8에서 확인한다. 이 문서는 commit 전 검증 동결 기록이며, 이후 문서 커밋은 제품 fingerprint를 바꾸지 않는다.

기존 격리 스택과 고정 corpus를 준비한 환경에서 재현할 주요 명령은 다음과 같다. Edge test transport를 바꾸는 권한 검사와 실제 Wikipedia UI 검사는 동시에 실행하지 않는다. 운영 연결에는 실행하지 않는다.

```powershell
npm test
npm run build
git diff --check
node --expose-gc scripts/profile-duel-search-document.mjs
node scripts/verify-duel-release-controls-local.mjs
node scripts/verify-duel-search-local.mjs
node scripts/verify-jungle65-gameplay-local.mjs
node scripts/benchmark-duel-search-local.mjs
node scripts/benchmark-duel-search-local.mjs --large-repeat
node scripts/benchmark-duel-search-local.mjs --browser --both-widths
```
