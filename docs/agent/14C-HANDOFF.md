# 14c — 방장 공통 목표 · READY 제거 · 정확한 시작 identity

날짜: 2026-10-01. 트랙 세션: `feat/group-final-gaps`, 착수 HEAD `42a3df3`.
`CURRENT.md`·`docs/contracts` 무수정. 통합 세션이 실제 merge 상태를 CURRENT에 반영한다.
운영 DB 미접근, push 없음. 기존 미추적 SQL/설계 산출물은 보존.

## 14c-1 서버

- 신규 `supabase/migrations/20261001100000_duel_host_target_v2.sql` 1개.
  CLI 생성 버전은 `20261001072901`이어서 사용자 요구(기존 최대 `20261001090000` 뒤)에 맞춰 조정했다.
- setter는 인증·waiting·host 검사를 먼저 한다. 비방장 NULL 입력도 `DUEL_HOST_ONLY`.
  방장 행에만 목표를 저장하며 `p_is_ready`는 호환 인자이고 readiness를 변경하지 않는다.
- START는 4인자 필수, 방장 목표 + 2명 조건. 정확한 시작 page/revision 스냅샷의 canonical 제목 사용.
  방장 목표 revision 정규화·양쪽 복사, 기존 초기화 RPC·잠금 계약 유지. `[코드: 위 migration]`
- 구 1인자 함수는 drop(CASCADE 없음). 새 ACL PUBLIC/anon 차단, authenticated/service_role 허용.
  **DB → 프론트 배포 사이 구 번들의 START는 실패한다.** 1인자에는 시작 identity가 없어서
  새 계약을 만족하는 호환 실행을 만들 수 없고 티켓도 fallback·구 서명 부재를 요구한다.
  향후 운영 적용은 중단 창·구 대기실 새로고침 안내를 포함해 별도 건별 승인해야 한다.
- `supabase/tests/server_authority_v2.sql`: #30 호출, #34 목표 누락, #35 READY false+방장 목표만으로 시작 교체.
  #29 상태 거부·#36 정규화 유지. 권한 우선순위·거부 무변경·1/3명·구 서명/ACL·정확한 시작·초기화 추가.

검증 `[산출물, 기준 42a3df3 + 14c-1 미커밋 작업 트리, 2026-10-01]`:

- 고정 로컬 preflight PASS: CLI 2.114.0 · PostgreSQL 17.6 · image 17.6.1.158.
- `npx --no-install supabase migration up --local`: 신규 1개 적용 성공.
- pgTAP 전 10개 스위트 **771/771**, server_authority_v2 **129/129**(기존 97 + 32).
  디렉터리 전체 실행은 TAP 없는 `group_final_gaps_v13_hardening_preflight.sql` 때문에 실행기 FAIL;
  기존 파일을 수정하지 않고 TAP 스위트 목록으로 분리하여 PASS.
- `npm test`: **413/413**. 클라이언트·빌드·UI는 다음 단계에서 검증.

```powershell
$tapFiles = Get-ChildItem supabase/tests/*.sql | Where-Object { $_.Name -ne 'group_final_gaps_v13_hardening_preflight.sql' } | ForEach-Object { $_.FullName }
npx --no-install supabase test db --local @tapFiles
```

## 다음 단계

14c-2: RoomPage 후보 선택 즉시 summary/snapshot 반환 identity 저장, 방장만 선택·START,
랜덤 스냅샷 반환 identity 전달. 게임 화면/1:1 복구는 host_user_id의 공통 목표 사용.
14c-3: 로컬 2세션 UI 스모크·통합 인계. 운영 적용/배포는 이번 요청 범위 밖.
