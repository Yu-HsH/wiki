# Wiki Race 일반 공개 운영 절차

2026-11-26 KST · Draft PR #64 · 기존 운영 앱 `434ff836`

## 대상과 작업 범위

- 기존 67개 Migration은 [기존 SHA 매니페스트](WIKI-RACE-FINAL-MIGRATIONS-2026-11-26.json) 그대로 사용합니다. Migration 68 `20261126043359_public_item_mode_launch_contract.sql`의 원본 및 격리 CLI 입력 SHA-256은 `1f3e9802bbafb9790d3451e0d28b5512ec93ac3a98084837545cd622a23d2ff5`입니다.
- v4 일반 입장은 기본값이 꺼져 있습니다. 입장을 열면 프로필이 있는 일반 Supabase Auth 회원이 방 생성·참가·시작에 들어갈 수 있습니다. 기존 만료형 검토 허용 목록과 공용 drain 게이트는 유지됩니다.
- S5 Production은 닫힌 검토 정책을 그대로 두고 새 바인딩을 등록합니다. 시작은 숲 `41730071`, 목표는 광합성 `42725227`입니다. 나무·생태계·식물·이산화 탄소를 포함한 한국어 위키백과 여섯 판본의 문서 SHA와 기존 경기 계약 1~5단계가 맞을 때만 등록합니다. 일반 회원의 새 입장만 열고 익명 계정의 새 참가를 차단합니다. [숲 판본](https://ko.wikipedia.org/w/index.php?oldid=41730071) · [광합성 판본](https://ko.wikipedia.org/w/index.php?oldid=42725227)
- 운영 DB를 읽기 전용으로 조회한 2026-11-26 13:32 KST 기준으로 Supabase의 `pg_cron`은 제공되고 미리 로드되어 있으나 등록된 cron 스키마가 없었습니다. `wiki_s5_maintenance`는 로그인할 수 없는 역할이며, 두 기존 유지보수 작업은 비활성입니다. 이제 실제 주체는 DB의 `postgres`로 고정하며 기존 유지보수 함수만 호출합니다. [Supabase Cron](https://supabase.com/docs/guides/cron)

| 작업 | 실행 주체와 시간 | 성공 증거 |
|---|---|---|
| `minute_cleanup` | `pg_cron` → `postgres`, 매분 | cron `succeeded`, 앱 이력 `success` 및 `errors=0`, 처리 수와 지연 |
| `daily_receipts` | 같은 주체. 활성화 후 첫 5분 경계에서 시작. 이후 매일 00:00 UTC(09:00 KST)에 처리. 5분마다 기한을 확인해 실패·미완료 작업을 재시도 | cron과 앱 이력, 영수증 처리 결과, 동일 완료 시각에 기록된 v4·S5 키온 삭제 수 및 SQLSTATE |

키온 지표에 `0`이 기록되면 성공했지만 정리할 행이 없었던 것입니다. 건수 미기록은 조회 실패 또는 해당 단계 미실행, SQLSTATE는 실제 정리 오류입니다. 모드별 2,000행에 도달하면 미처리분이 있을 수 있으므로 공개 절차를 중단합니다. 활성 방의 재시도 ID는 보존하고 종료한 지 30일이 지난 방의 요청만 정리합니다. 완료 여부는 [읽기 전용 조회](../../scripts/observe-item-mode-launch.psql)의 세 결과를 함께 봅니다.

## 변경 범위 격리 검증

- 2026-11-26 KST `b046899` 위 이 후보에서 기존 67개 파일을 보존하고 CLI로 68번만 적용했습니다. 운영의 공개 위키백과 자료만 읽기 전용으로 복제해 동일한 문서 6개와 링크 행 1,731개를 사용했습니다.
- 격리 `postgres`에 등록한 두 실제 cron이 13:45 KST에 실행됐습니다. 두 작업 이력은 `success`, 키온 행 삭제는 v4와 S5 모두 0건, 오류는 없었습니다. 다음 일일 기한은 2026-11-27 09:00 KST였습니다. 별도 롤백 테스트는 두 모드 각 1건 실제 삭제, 강제 오류 `P9001` 기록, 실패 행 및 활성 방 중복 방지를 확인했습니다.
- 같은 격리 DB에서 인증 역할로 v4 2인·S5 3인의 신규 방 생성·참가·시작, 실제 숲 문서와 나무 링크 응답, 익명 참가 차단을 확인했습니다. 기존 v4 검토 허용 목록과 구형 5슬롯 제약도 확인했습니다. 운영에서는 `duel-search-v4`와 `wiki-snapshot`이 ACTIVE임을 읽기 전용으로 확인했습니다.

## 한 운영 창에서 실행하는 순서

1. **현재 대상에 최신 복구 지점을 확보합니다.** [기존 최종 출시 준비](WIKI-RACE-FINAL-RELEASE-2026-11-26.md)와 [PR #63 CLI 절차](S5-PR63-CLI-MIGRATION-RUNBOOK-2026-11-23.md)의 수동 DB·Storage 백업과 읽기·복원 판정 기준을 그대로 사용합니다. Free 플랜의 Dashboard 복구를 전제하지 않습니다. 운영 연결 `ctdpyrmitljgrcgfvndn`과 기존 Production alias, 현재 이력 64개를 읽기 전용으로 고정합니다. 기존 drain 및 쓰기 차단 절차로 진행 경기와 정산을 마감한 뒤 보호 폴더에 새 일관 스냅샷, Storage 객체와 체크섬, 이전 Production 아티팩트, 담당자 및 복구 시각을 확보합니다. 앞선 보호 스크립트의 백업 날짜·경로·대상 일치 확인을 새 창에 맞춰 설정합니다. [Supabase 백업](https://supabase.com/docs/guides/platform/backups)
2. **승인 후 64→68을 적용합니다.** 동일 고정 Supabase CLI로 dry-run한 pending 버전은 `20261125133226`, `20261125133230`, `20261126002251`, `20261126043359` 순서입니다. 적용 후 이력과 역할, 일반전·정산의 기존 읽기 경로를 확인합니다. 같은 운영 승인으로 [작업 스크립트](../../scripts/item-mode-launch.psql)의 `stage`를 실행해 닫힌 S5 Production 정책과 비활성 cron 두 개를 등록합니다. `-v release_target=ctdpyrmitljgrcgfvndn -v release_action=stage`는 대상을 확인한 인증된 psql 연결에서만 사용합니다.
3. **승인된 운영 cron을 시작하고 실제 완료를 기다립니다.** 같은 스크립트의 `start_jobs` 실행 후 첫 5분 경계를 기다립니다. 읽기 전용 조회에서 두 cron 주체·활성·예약·최근 실행, 앱의 작업 결과, 키온 모드별 삭제 수와 오류를 확인합니다. 공용 drain의 정상화는 기존 절차대로 합니다. `open_modes`는 공용 게이트가 열리고 두 cron·앱 작업의 최근 성공 및 키온 두 단계의 오류 없는 기록이 있을 때만 동작합니다.
4. **승인 후 첫 Production 빌드로 신모드를 공개합니다.** 검증된 PR 후보를 사용하고 `VITE_DUEL_ITEMS_V4_ENTRY=1`, `VITE_GROUP_ITEMS_S5_ENTRY=1`, `VITE_ENABLE_MODE_SERVER_FOLLOWUP=1` 및 구형 생성 제한 OFF로 빌드합니다. 테스트 허용 목록이나 검토 권한을 받지 않은 실제 일반 회원으로 v4 2인·S5 3인 생성과 참가, S5 위키 문서 표시, 결과 저장을 확인합니다. 빌드할 커밋, CI, alias를 대조합니다. 기존 5슬롯 생성 설정은 이 단계까지 유지합니다.
5. **일반 회원 확인 결과에 따라 구형 생성만 숨깁니다.** 결과를 확인한 뒤 별도 승인으로 `VITE_HIDE_LEGACY_DUEL_ITEM_CREATION=1`을 지정해 동일 제품 tree를 한 번 더 Production으로 빌드합니다. 일반 1:1 신규 생성 기본값, 기존 5슬롯 방 입장·기록·XP를 확인합니다. 이 제한 범위는 최신 프런트의 생성 옵션입니다. Vite 플래그는 빌드에서 확정되므로 한 운영 창 안에서 두 Production 빌드로 순서를 지킵니다.
6. **중단 또는 복구합니다.** 입장 또는 경기 확인 실패 시 5슬롯 옵션을 유지합니다. `close_modes`로 새 일반 입장을 닫고, 필요하면 첫 빌드나 기존 Production 아티팩트로 alias를 되돌립니다. 종료 처리가 필요한 방을 위해 정상 정리 스케줄은 유지합니다. 스케줄 자체가 실패하면 운영 담당자가 해당 `cron.alter_job`을 일시 정지하고 작업/앱 오류를 확인합니다. 데이터 복구가 필요하면 최신 수동 DB·Storage 백업을 격리 대상으로 복원하고 적용 후 쓰기를 대조한 뒤 별도 승인으로 실제 연결을 복구합니다. [Vercel 복구](https://vercel.com/docs/instant-rollback)

## 승인 구분

같은 창에서 순서대로 진행할 작업은 **최신 백업·drain과 DB 64→68 적용**, **S5 정책·cron 준비 및 활성화와 서버 입장 개방**, **첫 Production 배포와 v4·S5 공개**입니다. **구형 신규 생성 제한 빌드**는 일반 회원 성공 근거를 확인한 뒤 승인합니다. 이번 후보 준비에서는 운영 작업을 실행하지 않았습니다.
