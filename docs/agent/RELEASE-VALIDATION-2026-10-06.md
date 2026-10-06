# Wiki Race 2.0 출시 전 통합 검증

확인일: **2026-10-06 (KST)**. 기준: **e4fb483 + 미커밋 작업 트리**, 브랜치 **feat/group-final-gaps**.
최종 판정: **A. 로컬 출시 검증 통과**. 로컬 검증에서 확인한 결함은 보정 후 재검증 통과. 운영 적용·프로덕션 확인은 수행하지 않았다.

## 1. 작업 요약

Docker 때문에 미실행이던 단계부터 재개했다. 초기 보고서의 B 판정은 이 재개 결과로 대체된다. 이전 JS/build PASS를 조사 목적으로 재분석하지 않았으며, 요청 순서대로 마지막 전체 회귀만 실행했다.

- Docker Engine 정상 확인, 기존 로컬 스택 재사용. 최초 로컬 적용 이력은 28개.
- 로컬 reset으로 기존 31 migration 전량 적용, 결함 보정 migration 추가 뒤 **32개 전체를 다시 깨끗한 DB에 적용**.
- 공식 전체 pgTAP **21파일, 1262/1262**. 그룹 동시성 **8/8**, 듀얼 아이템 동시성 **3시나리오 × 5회 = 15/15**, 교착 0.
- 실제 인증 2세션 + 실제 로컬 SELECT/RPC/Realtime/Edge를 검증. 그룹은 브라우저 2세션 + 인증 RPC 참가자 1명.
- Single 세 모드와 반복 XP, 듀얼 정상·기권/F5, 그룹 최종 결과/F5, 390px·desktop과 긴 제목/경로 확인.
- 최종 npm test **511/511**, build exit 0, diff check exit 0.

모든 수치는 **e4fb483 + 미커밋 작업 트리, 2026-10-06** 기준 [산출물]. 원격 ref·운영 DB·production에 접근하지 않았고 commit/push/배포 없음.

## 2. 수정한 파일·발견 문제

| 파일 | 변경 이유 |
|---|---|
| supabase/migrations/20261006003000_restore_forced_link_resolvable_pool_v1.sql | random_teleport helper 교체에서 빠진 FORCED_LINK의 해석 가능한 링크 필터 복원. 기존 migration은 그대로 보존 |
| services/targetService.js | 실제 target_candidates 스키마에 없는 is_active·usage_count 참조 제거. 현재 Single의 직접 호출 경로는 아니지만 인증된 실제 로컬 API 조회로 보정 확인 |
| utils/duelResultPresentation.js · pages/MultiplayerGamePage.jsx | 참가자 elapsed_seconds가 NULL인 듀얼 결과도 서버에 저장된 시작/종료 시각으로 기록 표시. match_history.duration_seconds와 대조 및 F5 동일성 검증 |
| tests/matchResultExperience.test.js | 서버 시간·F5 직렬화·잘못된 시각에 대한 기록 표시 회귀 검증 추가 |
| supabase/tests/achievement_triggers_v1.sql | 새 teleport 계약에 맞는 실제 보유 grant/서버 목적지 등록을 fixture에 준비 |
| supabase/tests/c4_check_c3_grant_total_xp.sql | M2의 profiles INSERT 회수 이후 권한 기대값 갱신 |
| supabase/tests/group_final_gaps_v13_hardening_preflight.sql | 기존 위반 행 조회 보존, 공식 전체 pgTAP에 포함되도록 TAP wrapper 추가 |
| supabase/tests/single_run_mode_xp_v1.sql | custom/daily 구분 테스트의 누락된 목표 링크 추가. XP 로직 변경은 불필요했음 |
| scripts/release-validation-local-smoke.mjs | 기존 Playwright/Auth/RPC 방식을 재사용한 재현 가능한 로컬 통합·보안·F5·모바일 스모크 |
| docs/agent/RELEASE-VALIDATION-2026-10-06.md · CURRENT.md | 최신 판정/실측/한계 기록 |

최초 pgTAP 실패에서 **실제 제품 회귀는 강제 이동 필터 누락**이었다. 미해석 링크만 있는 경우 LINK_SNAPSHOT_MISSING을 반환하고, 해석 가능한 링크가 섞여 있어도 아이템 이동이 실패할 수 있었다. 보정 뒤 기존 157개 아이템 테스트가 통과했다. Single의 custom-daily-target 0 XP는 fixture의 링크 누락으로 완주 자체가 실패한 것이며 XP 지급 결함은 아니었다. 최초 실패 로그와 수정 후 로그는 아래 산출물에 보존했다.

## 3. 로컬 DB

| 항목 | 결과 |
|---|---|
| Docker | PASS: Engine 29.6.2, 기존 컨테이너 healthy |
| CLI / DB runtime | PASS: CLI 2.114.0, postgres:17.6.1.158, PostgreSQL 17.6 |
| migration 전체 적용 | PASS: 깨끗한 로컬 DB 32/32 |
| migration syntax/dependency 적용 실패 | 없음 |
| pgTAP | PASS: 21파일, 1262/1262 |
| DB reset 여부 | 로컬만 2회: 31개 최초 재적용 + 보정 포함 32개 최종 재적용 |
| 최종 로컬 상태 | migrations 32, auth.users 0, game_rooms 0; fixture 정리 및 마지막 reset 후 상태 |

대상은 **http://127.0.0.1:54321**, 로컬 컨테이너 **supabase_db_wiki-packet13-r2-clean158**, DB 포트 **54322**. reset 직전 API_URL과 project_id guard 확인 [산출물/코드]. --linked·원격 DB URL을 사용하지 않았다. GROUP_SPECTATOR_MIGRATION.sql은 적용하지 않았다.

## 4. 보안

### SF-A3

- **직접 SELECT PASS:** 진행 중 방장/상대 각각 자신의 원본 행만 보임. 종료 후 양쪽에서 상대 경로 읽기 가능.
- **Realtime PASS:** 양쪽 실제 JWT subscription에 본인 UPDATE가 전달되는 양성 대조 확인. 상대 room_players payload 전달 0. 양쪽 공개 duel_progress INSERT 수신, 경로 필드 노출 없음.
- **종료 후 공개 PASS:** 원본 SELECT와 마스킹 RPC 모두 전체 경로 확인, 결과 F5 복구.
- **group 영향 PASS:** 실제 3인 group에서 참가자 전체 SELECT 및 정상 경기/결과 확인; SQL RLS 테스트 통과.

진행 중 **상대 현재 문서·이동 횟수는 공개**하는 것이 확정 명세다. 비공개 경계는 상대 원본 행과 전체 경로이며 이번 테스트도 그 경계를 검사했다 [문서: wiki-race-2.0-handoff/01-CONFIRMED-SPEC.md §4; 코드: get_duel_room_players_v1 / SF-A3 policy].

### SF-M2

- **REVOKE PASS:** profiles INSERT/DELETE, analytics UPDATE/DELETE, candidate/daily/picked 불필요 DML, 후보 sequence 권한 회수 [산출물: security_privilege_cleanup_v1.sql 55/55].
- **필요 권한 유지 PASS:** 본인 profile 수정, analytics INSERT, daily SELECT, 마스킹/이동 RPC 등. 실제 인증된 후보 조회도 통과.
- **운영 확인 필요:** 운영 적용 이력·실제 권한 및 설정은 미조회. 로컬 PASS가 운영 적용 승인이나 운영 검증을 의미하지 않음.

## 5. Smoke

| 흐름 | 결과 | 비고 |
|---|---|---|
| Single random | PASS | 로컬 target-level 소스 부재 시 기존 Wikipedia fallback, run_mode=random, 20 XP |
| Single custom | PASS | 목표 선택·완주, 최초 15 / 반복 0 XP |
| Single daily | PASS | 오늘 1코스·검증, 최초 25 / 반복 0 XP |
| Duel 정상 | PASS | 동일 경기·서버 승패/이동·XP·업적·종료 후 경로 |
| Duel F5/재접속 | PASS | 진행 중 guest F5, 종료 후 양쪽 결과 F5 |
| Duel 기권 | PASS | 실제 leave_duel_room_v2, retired 참가자 결과 F5 복구 |
| random_teleport | PASS | 실제 로컬 Edge → 실제 Wikipedia 후보/canonical → wiki-snapshot → 등록/소비 RPC → 새 문서 렌더 |
| Group | PASS | 3인 RPC 생성/입장/READY/시작, 브라우저 개인 완주 후 경기 지속, 최종 종료 |
| Result F5 | PASS | 판정·경로·이동·기록·XP 복구, XP 원장/업적 해금 추가 없음 |
| Mobile | PASS | 390×844 및 desktop, Duel game/result·Group result, 긴 제목/경로·결과 스크롤·주요 버튼 |

최종 기본 브라우저 스모크 **22/22**, single 스모크 **8/8** [산출물]. 브라우저 page error 0. 증거: resume/ui/summary.json, single-summary.json, single-measurements.json, duel-ledger.json, group-ledger.json, teleport-response.json, *.png.

정상 경기의 Wikipedia 문서/스냅샷 전송은 고정 fixture를 사용했다. **Auth/DB/RPC/Realtime/XP/업적/결과는 실제 로컬**이다. random_teleport는 실제 로컬 Edge와 실제 Wikipedia 조회·스냅샷을 사용했고 슬롯만 로컬 fixture에서 지정했다. 긴 제목은 테스트용이다. 390px 결과 카드의 긴 경로는 내부 스크롤로 위 정보와 아래 버튼에 접근한다.

## 6. XP 실측

| 상황 | 기대 | 실제 gameplay 원장 |
|---|---:|---:|
| custom | 15 | 15 |
| custom 반복 | 0 | 0 |
| random | 20 | 20 |
| daily | 25 | 25 |
| daily 반복 | 0 | 0 |
| duel 정상 승리 / 패배 | 50 / 25 | 50 / 25 |
| group 1 / 2 / 3위 | 70 / 55 / 45 | 70 / 55 / 45 |

표는 **gameplay XP**이며 별도 업적 XP와 구분했다. UI 표시도 원장과 대조했다. guest 미저장, 중복 결과/요청, 기권·그룹 기타 상태 보상은 SQL에서 검증 [산출물: single_run_mode_xp_v1.sql, xp_result_grants_v1.sql, ui/*ledger.json].

## 7. SQL 파일별 결과

모두 **e4fb483 + 미커밋 작업 트리, 2026-10-06**. 최종 깨끗한 DB의 공식 CLI 전체 결과와 파일별 실행 결과를 함께 보존.

| 파일 (supabase/tests/) | 결과 | assertion |
|---|---|---:|
| achievements_rewards_v1.sql | PASS | 145/145 |
| achievement_authority_filter_v1.sql | PASS | 17/17 |
| achievement_triggers_v1.sql | PASS | 128/128 |
| badge_retirement_v1.sql | PASS | 24/24 |
| c1_reward_tables_v1.sql | PASS | 97/97 |
| c4_check_c3_grant_total_xp.sql | PASS | 30/30 |
| duel_item_authority_v3.sql | PASS | 157/157 |
| duel_players_rls_v1.sql | PASS | 17/17 |
| duel_players_view_v1.sql | PASS | 27/27 |
| duel_random_teleport_v1.sql | PASS | 17/17 |
| group_final_gaps_v13.sql | PASS | 33/33 |
| group_final_gaps_v13_hardening_preflight.sql | PASS | 1/1 |
| group_match_lifecycle_phase2a.sql | PASS | 2/2 |
| group_security_phase2c.sql | PASS | 49/49 |
| group_spectator_emoji_atomicity.sql | PASS | 22/22 |
| security_privilege_cleanup_v1.sql | PASS | 55/55 |
| sec_finish_db_v1.sql | PASS | 29/29 |
| server_authority_v2.sql | PASS | 129/129 |
| single_run_mode_xp_v1.sql | PASS | 30/30 |
| xp_ledger_v1.sql | PASS | 153/153 |
| xp_result_grants_v1.sql | PASS | 100/100 |

## 8. 자동 검증

| 항목 | 결과 | 산출물 (아래 resume/ 기준) |
|---|---|---|
| JS 관련 | matchResultExperience 15/15 | 관련 node 테스트 출력 |
| npm test | 511/511 PASS | npm-test-final.log |
| pgTAP 공식 CLI | 1262/1262 PASS, 21파일 | pgtap-cli-final.log |
| SQL 파일별 | 21/21 PASS | sql-results.json 및 각 *.sql.log |
| Group concurrency | 8/8 PASS | group-concurrency.log |
| Duel concurrency | 15/15 PASS, 교착 0 | duel-concurrency.log |
| production build | exit 0 | build-final.log |
| git diff --check | exit 0 | diff-check-final.log |
| 최종 local runtime preflight | PASS | preflight-final.log |

기존 500 kB chunk 경고와 Git CRLF 경고는 유지되며 실행 실패는 아니다. SQL의 고의 오류/권한 실패 fixture에서 발생한 XP WARNING은 테스트 기대 경로이며 전체 TAP PASS로 확인했다.

## 9. 현재 working tree

- status 항목 **54개** = tracked 변경 **25개** + untracked status 항목 **29개** (실제 untracked 파일 **30개**).
- 신규 migration 총 **4개**: 기존 미커밋 20261006000302 / 20261006000303 / 20261006002015 + 이번 보정 20261006003000. 저장소 전체 32파일.
- 신규 Edge Function 총 1개인 duel-random-teleport는 이번 세션 이전 작성. **이번 세션 신규 Edge 추가 0, 배포 0**.
- 재개 전 untracked 파일 누락 **0**. 기존 수정과 구형 GROUP_SPECTATOR_MIGRATION.sql 보존. source reset/clean/stash 사용 없음.
- commit/push/운영 적용 **없음**. HEAD는 e4fb483 그대로.
- QA browser/Vite 및 이번에 실행한 functions serve 종료. Docker/Supabase 로컬 스택은 유지.

## 10. 발견한 출시 차단 문제·남은 한계

**남은 로컬 출시 차단 문제: 없음.** 강제 이동 회귀와 듀얼 기록 표시를 수정했고 관련 SQL/브라우저/JS/build 회귀를 통과했다.

- 운영 DB/production·배포별 환경 변수·운영 target-level 실물은 미검증. **target-level 소스는 로컬 저장소에 없으므로 본문 자체는 검증하지 않았고, 기존 fallback을 검증했다.**
- random_teleport 스모크에서 소비 중복·지속적인 version conflict는 관찰하지 못했다. 실제 서버 Edge 사용까지 확인했지만 장시간/부하 환경의 체감 실패 빈도 측정은 아니다.
- 그룹 브라우저는 최소 인원 3명(브라우저 2 + RPC 1)이며 다인 브라우저 전체 조합을 실행한 것은 아니다. 20분/3등 grace/RETIRE/승계 등 경계는 SQL 및 기존 동시성 harness로 확인했다.
- 실제 기기 터치 QA는 미실행; 모바일은 Playwright 390px viewport 및 화면 산출물로 확인.
- 자동 승인 검토가 없는 컬럼을 재참조하는 원복 시도를 거부했다. 안전한 스키마 일치 쿼리 상태를 유지하고 실제 인증 조회를 검증했다. 추가 승인 필요 작업은 남지 않음.

## 11. 출시 판정·다음 한 단계

**A. 로컬 출시 검증 통과.** 이 판정은 로컬 범위이며 운영 적용 승인이 아니다.

**다음 한 단계: 이번 변경·검증 근거를 리뷰 가능한 commit/배포 준비 패킷으로 정리한다.** 이 세션에서는 commit/push/운영 적용을 수행하지 않았다.

## 재현 명령·산출물

```powershell
Set-Location C:\Project\wiki
npm run supabase:preflight
node node_modules/supabase/dist/supabase.js test db --local
pwsh -NoProfile -File supabase/tests/group_final_gaps_v13_hardening_concurrency.ps1 -DbContainer supabase_db_wiki-packet13-r2-clean158 -Scenario all
pwsh -NoProfile -File supabase/tests/duel_item_concurrency_v3.ps1 -DbContainer supabase_db_wiki-packet13-r2-clean158

# 아래 기본 스모크는 먼저 별도 터미널에서 로컬 functions serve가 필요하다.
node node_modules/supabase/dist/supabase.js functions serve --no-verify-jwt
# 별도 터미널:
node scripts/release-validation-local-smoke.mjs --long-titles
node scripts/release-validation-local-smoke.mjs --single-only
npm test
npm run build
git diff --check
```

전체 로그/JSON/스크린샷: **.temp/release-validation-20261006/resume/**. 키·세션·비밀번호는 파일에 저장하지 않음. reset을 반복할 필요 없이 최종 스택에서 test db --local부터 재검증 가능.

### 최초 기록 (Docker 복구 전, 대체됨)

최초 판정 B: Engine 파이프/Inference 소켓 문제로 DB·Realtime·브라우저 미실행, npm test 509/509/build/diff PASS. 기준 e4fb483 + 당시 미커밋 작업 트리, 2026-10-06. 사용자 Docker 실행 뒤 이번 결과로 갱신했다. 최초 본문은 resume/report-initial.md에 보존.
