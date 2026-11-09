# Wiki Race 2.0.x 안정화 릴리스 후보 — 2026-11-09

상태: **PREP ONLY / 승인 전 운영 변경 금지**.
기준 원격 main: `0c1e3bf5f2ca554ce8a94904f9181304ef63d85b`.
배포 후보는 통합 QA PR #45의 변경 파일을 선택적으로 재현한 **단일 main 기반 커밋**이다.
통합 QA 브랜치를 main에 병합하지 않는다.

## 포함 범위
- #30 HOME 탐험 노트 자동 전환, #31 랭킹 오늘 기록/오늘 도전 탭
- #36 공개 대기방 2시간 만료/heartbeat
- #38 그룹 문서 이동 로딩 오버레이
- #39 1:1·그룹 종료 후 기존 멤버만 재경기하는 새 비공개 대기방
- #40 문서 검색 아이템 가독성/모바일 대비 + 한국어 IME / 15초 만료 브라우저 회귀
- #41 모바일 위키 목차 위치/터치
- #42 1:1 게임 시작 시 첫 문서 스크롤 동기화
- #43/#44는 새 런타임 수정 없는 검증 PR이므로 제외. #29 목표 선정 정책도 제외.

## 이미 확인한 검증 이력
- [격리 통합 PR #45](https://github.com/Yu-HsH/wiki/pull/45) — GitHub Actions 9개 SUCCESS.
- 공개 대기방 pgTAP 19/19, 재경기 pgTAP 32/32.
- Chromium 실제 로컬 인증 1:1 두 계정/그룹 세 계정: 진입→이동 로딩→경기 종료→실제 결과 화면→재경기 초대/참가, 이전 XP·결과 원장 불변.
- #10 보강 [run 42567209847](https://github.com/Yu-HsH/wiki/actions/runs/42567209847): 한국어 IME 조합 Enter 차단, 완료 후 Enter, 15초 만료·사용 횟수 0.
- 이 기록은 *원본 브랜치* 결과다. 최종 릴리스 후보 SHA 자체의 프론트 및 DB 실기 회귀는 별도로 다시 실행해 PASS 확인한다.

## 운영 읽기 전용 사전점검
- 2026-11-09: 원격 DB 적용 migration 53건(최신 20261104100000).
- 신규 공개방 만료 `20261109022138_public_waiting_room_expiry_v1.sql` 및 재경기 `20261109031938_multiplayer_rematch_v1.sql` 모두 운영 미적용.
- 조회 당시 공개 waiting 4개가 생성 후 2시간 경과. playing 상태 그룹 방 3개는 최근 30분 참가자 heartbeat 부재. 절대 임의 종료/삭제하지 않는다.
- 듀얼 진입 `entry_open=true`, 검색 `search_enabled=true`, `required_protocol=search-authority-v1`: 전환 중 신·구버전 호환과 기존 경기 정산 유지 점검 필수.

## 전환 게이트 (각 단계 별도 승인)
1. **Preview / CI**: 후보 단일 SHA에서 npm test, npm build, 기존 핵심 isolated PostgreSQL/Chromium QA 재실행. Vercel Preview 성공 및 동일 SHA 확인. Hobby 빌드 제한(`build-rate-limit`)이면 Preview 미충족으로 HOLD, 재시도 연타 금지.
2. **운영 변경 전**: 운영 DB schema migration 목록/방 활동/결과·XP 상태 읽기 전용 재조회. 운영 백업과 실제 격리 restore 검증. 승인 없이는 production SQL 쓰기 금지.
3. **건별 승인 A — 운영 DB**: 기존 53 migration에 이어 위 SQL 2건을 작성한 순서로 적용. 공개 대기방 RPC/TTL/보안 및 재경기 권한을 읽기 검증. 실패 시 프론트 배포 중단, DB 원복을 가정하지 않고 정방향 보정 절차 마련.
4. **건별 승인 B — 프론트**: 고정 릴리스 SHA만 main에 단일 병합해 Vercel Production 빌드/배포, Ready/alias/SHA 검증. 구형 탭·기존 경기 이동·정산 영향 검사.
5. **실서비스 QA**: 싱글/오늘의 도전, 공개방 진입·만료, 1:1 두 계정, 그룹 세 계정, 로딩·검색·목차·재경기·XP·랭킹·F5. 실패시 즉시 중단하고 DB 상태 보존.

## 제외/잔여 위험
- 실제 iOS Safari/Android 물리기기, 실계정 운영 1:1 검색 아이템 JWT·F5, Vercel Preview rate limit 해소 및 최종 빌드 재검증.
- UI만 이전 배포로 되돌려도 DB schema를 원복하지 않는다. 손실 없는 정방향 보정 경로 확인.
- PR #45는 검증용 브랜치로만 유지. release 후보는 유효성 검증 전 Draft.
