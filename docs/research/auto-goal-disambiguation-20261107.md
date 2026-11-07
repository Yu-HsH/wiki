# A안: 자동 목표의 동음이의어 제외 — 성능 및 테스트 보고서 (2026-11-07)

**상태: 별도 브랜치 + Draft PR #29. Production / DB / Edge 배포 없음.**

## 범위

- **랜덤 싱글 자동 목표**: Wikipedia `generator=random`의 기존 1회 `action=query` 응답에 `prop=info|revisions|pageprops&ppprop=disambiguation`을 추가. 이 반환 값의 `pageprops`에 `disambiguation` 키가 *존재*하면 (빈 문자열도 참) **목표만 건너뛰고 다시 추첨**. 이미 뽑은 출발 문서는 유지. 건너뛴 목표에 대해서는 `wiki-snapshot` 호출도 하지 않음.
- **시작 문서**: 동음이의어 허용. **게임 도중 탐색 링크**: 변경 없음.
- **직접 선택한 목표**: 사용자 지정 싱글·1:1 방장 목표·그룹 참가자 제출 후보는 자동 치환/제외하지 않음. 그룹 서버가 사용자들의 제출 후보 중 선택하지만, 이를 게임이 자유롭게 뽑은 무작위 목표와 동일시하지 않음.
- **오늘의 도전**: 별도 DB `ensure_today_daily_challenge()`가 후보 단어의 쌍을 고르는 방식. 현재 17개 후보를 **별도 읽기 전용 API 검사로 검증**했으며, 이미 확정된 일별 코스를 재선정하지 않음. 추가 후보를 등록할 때의 선별/DB 차단 정책은 후속 승인 과제.
- 선정성·폭력성 판정은 이 작업 범위 아님. 동음이의어 여부는 문서 정체성 판정이며 콘텐츠 안전 등급이 아니다.

## 구현

- 수정: `supabase/functions/single-run/random.mjs`.
- 동음이의어 검사: `Object.prototype.hasOwnProperty.call(page.pageprops || {}, 'disambiguation')`.
- 기존 URL 조회 `prop=info|revisions` → `prop=info|revisions|pageprops&ppprop=disambiguation`.
- **위키백과 추가 왕복 0회** (일반 목표 후보 기준). 동음이의어 목표에서만 기존 12회 전체 재추첨 제한 안에서 새 요청. **29초 공유 시간 예산** 연장 없음.
- 429/500/503, API 에러·네트워크 장애는 **부적격 목표로 취급하지 않고 기존 오류** 처리.
- 스냅샷 pageId/revisionId/canonicalTitle 일치 검증, 서버 권위 commit 계약 유지.

## 테스트

| 항목 | 실제 결과 |
|---|---|
| 전체 Node 테스트 | **798/798 PASS** |
| 랜덤 단독 회귀 | **35/35 PASS** |
| Vite 빌드 | PASS |
| 정확한 MediaWiki `generator=random` 실요청 | **3/3 PASS** |
| 추가 `pageprops` 실측 페어 | **6개 문서 × 기존/새 쿼리 = 12/12 PASS** |
| 현재 오늘의 도전 후보 일괄 조회 | 17개 중 **동음이의어 0**, **실재 정상 16**, **존재하지 않는 제목 1** |
| 랜덤 표본(별도 배치) | **150개 단위의 관측 예: 13/150, 15/150, 17/150, 23/150** (회차마다 변동) |

회귀 테스트는 시작이 동음이의어일 때도 채택되는지, 목표의 pageprops 값이 빈 문자열일 때만 정확히 재추첨되는지, **목표 건너뛰기 전 snapshot이 호출되지 않는지**, 최대 12회·29초 한도 유지, 게스트 Edge 경로, custom/daily 기존 목표 유지까지 검증했다.

## 성능 실측

같은 6개 공개 문서에 대해 `info|revisions` / `info|revisions|pageprops`를 한 번씩 교차 순서로 호출한 총 12회. GitHub Actions [실측 작업 A](https://github.com/Yu-HsH/wiki/actions/runs/42373265033) 및 [실측 작업 B](https://github.com/Yu-HsH/wiki/actions/runs/42373436275):

- **중앙 응답 지연 차이: 0ms(A), -7ms(B)**, 표본상의 p90 지연 차이 **+6ms(A), +5ms(B)**. 이 수치는 인터넷 RTT 표본이 적고 순서·캐시 영향을 받으므로 유의미한 개선 또는 보장 지표가 아니다.
- **중앙 응답 크기 차이: 0바이트**. 동음이의어 두 문서는 각각 **+34바이트**.
- 정확한 게임 랜덤 쿼리(`grnlimit=1`)의 읽기 전용 호출 3건 모두 pageId/revisionId/ns 0 반환 정상.
- 3회 × 50개씩 별도로 조사한 실행들에서 **13/150(8.67%), 15/150(10%), 17/150(11.33%), 23/150(15.33%)** 등 회차마다 차이가 관측됨. 샘플 평균을 실제 재추첨 확률로 간주하지 않음. 대략 10%대가 관측됐지만 `grnlimit=50` batch의 내부 successor 구조 때문에 **게임에서 사용하는 독립 `grnlimit=1` 확률과 일치한다고 단정할 수 없음**.
- 중요한 성능 비용은 응답 pageprops 크기보다 **동음이의어 목표를 뽑았을 때 추가로 수행하는 랜덤 위키백과 요청**이다. 이번에는 실제 Vercel ↔ Edge ↔ Supabase 경로를 사용하는 종단간 성능 검사를 수행하지 않았으므로 경기 시작 시간 보장은 **미확인**이다.

## 기존 오늘의 도전 후보에서 발견한 별도 데이터 품질 문제

운영 DB의 `daily_challenge_pool` 활성 target 17개를 읽기 전용으로 확인해 MediaWiki 공식 `pageprops`로 검사했다:

- 실재하는 **16개 후보는 동음이의어가 아니었다**.
- `레드벨벳 (아이돌)`은 **현재 MediaWiki API가 missing**을 반환. 운영 DB에는 `is_active=true`로 남아 있지만 `verified_at=null`, `wiki_pages` 일치 문서 0개, `wiki_page_snapshots` 일치 개정판 0건이므로 **현행 `ensure_today_daily_challenge()`의 verified 고정 후보 또는 현재 스냅샷 기반 동적 코스 경로에 선정되지 않는 상태**. 과거 `daily_challenges`에 동일 제목의 항목이 있으나 기존 기록·오늘의 코스는 수정하지 않음.
- 이 자료는 **동음이의어 규칙 실패가 아니라 별도 오래된 후보 문제**다. 해당 항목 비활성화/현재 실제 문서명으로 정정은 후속 DB 승인 항목. 일괄 조사 스크립트는 `DAILY_POOL_STALE_TITLE` 경고로 유지하고, `--strict` 모드에서는 실패로 표시한다.
- 향후 하루 코스 후보가 추가될 때는 현재 17개 하드코딩 연구 스크립트만으로 자동 검증된다고 주장할 수 없음. **신규 등록 절차에서 페이지 정체성 검증을 지속적으로 수행**해야 한다.

## 운영 전 추가 게이트

1. PR 코드를 별도 스테이징 Edge Function에 배포해 **실제 API 한도, 29초 예약 예산, snapshot 평균/상한 지연**, 확정/중복/중도 복구를 E2E 측정.
2. 실제 오늘의 도전 후보 추가/변경 시 공식 `pageprops` 검증을 필수 절차로 정하고, 필요시 DB metadata/qualification을 **별도 승인 후 구현**.
3. 다른 동시 작업(PR #25~#28)의 변경과 충돌 검토, 계약 테스트, 운영 SHA와 Edge 버전 사전 기록.
4. **사용자 명시적 운영 승인 전 main 병합·운영 Edge 배포 보류.**

## 재현

```bash
node --test tests/singleRandomStart.test.js
node scripts/smoke-random-pageprops-readonly.mjs
node scripts/benchmark-random-pageprops-readonly.mjs
node scripts/audit-daily-goal-disambiguation-readonly.mjs
node scripts/audit-daily-goal-disambiguation-readonly.mjs --strict  # known stale title => nonzero
node scripts/sample-random-disambiguations-readonly.mjs
```

MediaWiki 공식 API: https://www.mediawiki.org/wiki/API:Pageprops, https://www.mediawiki.org/wiki/API:Properties
