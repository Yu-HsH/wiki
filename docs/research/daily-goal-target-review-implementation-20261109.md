# 오늘의 도전 — 목표 문서 검수 1차 패키지 (2026-11-09)

**상태: Draft / 연구·검증 전용. 운영 등록, main 병합, 선정 RPC 변경, 기존 확정 코스 수정 없음.**

## 검수 범위

- 현행 운영 `daily_challenge_pool` 읽기 전용 조회: 활성 17개. `레드벨벳 (아이돌)`은 PR #29의 2026-11-08 공식 API 조사에서 missing으로 보고된 제목이며 현재도 활성 후보에 남아 있다. 실제 정정·비활성화는 별도 승인.
- 분야별 24개 목표 후보(6개 분야 × 4개): `data/research/daily-goal-target-review-20261109.json`. 기존 목표 `훈민정음`, `카카오톡` 중복 없음.
- 2026-11-09 한국어 위키백과의 각 목표 문서 페이지 공개 조회로 24개 개별 페이지 열림을 확인. **문서 페이지가 열리는 것과 MediaWiki `pageprops.disambiguation` 통과는 다르다.**
- 캐시 직접 진입 수는 게임에 저장된 최신 출처 문서별 링크의 **부분 표본** 수치. 위키백과 전체 역링크 아님. 0개도 도달 불가의 증거가 아님.
- **출발 문서·n회 이동·최단 경로는 선정 기준에서 제외. 목표 문서의 유효성, 친숙도, 진입 출처의 다양성만 평가.**

## 파일

- `utils/dailyGoalTargetReview.js`: 일반 문서, missing, 비본문, 동음이의어 판별 및 역링크 표본 보고.
- `scripts/audit-daily-goal-targets-readonly.mjs`: `--live` 공개 MediaWiki 공식 API 검사, 선택적 `--backlinks` 표본 검사. DB·Supabase CLI·Edge 호출 없음.
- `tests/dailyGoalTargetReview.test.js`: 후보 24개·운영 기존 17개·빈 문자열 disambiguation·누락·오류·backlinks 표본 처리.
- 연구 모드는 모든 후보에 `readyForAutomaticPool: false` 유지.

## 실행

```bash
node --test tests/dailyGoalTargetReview.test.js
node scripts/audit-daily-goal-targets-readonly.mjs
node scripts/audit-daily-goal-targets-readonly.mjs --live
node scripts/audit-daily-goal-targets-readonly.mjs --live --backlinks
```

`--live`는 한국어 위키백과의 공식 `action=query&prop=info|pageprops&ppprop=disambiguation&redirects=1` 응답을 읽는다. `--backlinks`는 namespace 0의 **직접 비리다이렉트 역링크** 최대 100개만 표본으로 조회한다. API pagination 및 리다이렉트까지 포함하는 전체 역링크 전수 확인을 완료했다고 주장하지 않는다. 공개 API 오류·429·타임아웃은 승인 상태로 승격하지 않는다.

## 다음 승인 게이트

1. 연구 스크립트를 네트워크가 되는 환경에서 실행해 실제 공식 `pageprops`·canonical pageId 결과를 검증하고 로그 보존.
2. 직접·리다이렉트 역링크와 분야 다양성을 확인하고 진입 후보를 좁히기.
3. 실제 WikiViewer에서 대표 링크가 클릭 가능한지 수동/브라우저 QA.
4. 기존 17개 정리와 신규 풀 추가를 **별도 DB 마이그레이션 PR**로 검토. 오늘/과거 확정 코스 불변, 롤백 포함.
5. 2회 경로 우선 로직 개편은 목표 검증과 별개, 사용자 승인 전 변경하지 않음.

관련 연구: [PR #26](https://github.com/Yu-HsH/wiki/pull/26), [#27](https://github.com/Yu-HsH/wiki/pull/27), [#28](https://github.com/Yu-HsH/wiki/pull/28), [#29](https://github.com/Yu-HsH/wiki/pull/29).

공식 API 안내: [Pageprops](https://www.mediawiki.org/wiki/API:Pageprops), [Backlinks](https://www.mediawiki.org/wiki/API:Backlinks).

## 2026-11-09 공식 API 및 WikiViewer 실행 증거 (추가)

- [공식 Pageprops + Backlinks Action](https://github.com/Yu-HsH/wiki/actions/runs/42574544308): 24개 목표 모두 `eligible_metadata`, 비본문/미존재/동음이의어 0, API 오류 0. 목표별 공식 직접 역링크 **최소 100개 표본** 확보. 전체 역링크 개수 아님.
- 실제 공식 MediaWiki pageId와 현재 Wiki Race 캐시의 `wiki_snapshot_links.target_page_id`를 직접 대조: **24개 모두 일치, 불일치 출처 0건**. 부분 캐시에서 24개 모두 최소 1개 이상의 직접 진입 출처 발견.
- [실제 WikiViewer Playwright Chromium Action](https://github.com/Yu-HsH/wiki/actions/runs/42584064305): 대표 9개 진입 링크 **9 PASS / 0 FAIL**. `fetchPageData`로 실제 문서를 받아 게임 sanitizer를 거쳐 `WikiViewer`에서 링크 클릭 `onLinkClick` 콜백까지 검사.
- 추가 증거: `data/research/daily-goal-target-public-api-evidence-20261109.json`, `data/research/daily-goal-target-cached-inbound-evidence-20261109.json`, `data/research/daily-goal-wikiviewer-browser-evidence-20261109.json`.
- **미검증:** 인증된 서버 이동 RPC, 하루 코스 자동 확정, 22개 신규 목표 전수 WikiViewer QA 및 회원 완주/랭킹 회귀.
- 검증된 후보의 등록 SQL은 [별도 Draft PR #48](https://github.com/Yu-HsH/wiki/pull/48)에서 격리 테스트함. 이 PR #47에는 운영 변경 없음.
