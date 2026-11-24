# PR #63 DB 외 출시 체크리스트

2026-11-23 KST. 기준 `6b336c10`과 격리 worktree의 검증 후보. 이 표의 PASS는 명시한 검증 환경에만 적용한다. 신규 기능 노출은 각각 승인한다. [PR #63 출시 HOLD 및 검증 범위](https://github.com/Yu-HsH/wiki/pull/63)

| 항목 | 상태 | 완료를 입증할 조건 |
|---|---|---|
| 기본 Auth·REST·Realtime 및 일반전 회귀 | PASS, 격리 | 합성 계정으로 실제 로그인·완주·XP·F5·재경기가 통과했다. 최종 배포 버전과 운영과 같은 구성에서 다시 smoke한다. |
| `duel-search-v4` Edge | BLOCK | 승인된 번들/의존성·실제 런타임과 `wiki-snapshot` 연결을 확인한다. `verify_jwt=false` 설정을 쓰는 만큼 handler의 `auth.getUser`가 인증 경계다. 토큰 없음/유효하지 않음·비참가자·잘못된/만료된 window·스냅샷 불일치 거절, 참가자 정상 검색, 서비스 전용 저장 RPC, 외부 timeout과 재시도 동작을 검증한다. 확인한 버전·정상 오류율·복구할 이전 버전을 기록한다. |
| Worker·스케줄러·알림, r19 Q24 | BLOCK | 실제 실행 주체와 스케줄, 최소 권한 역할·자격증명 보관·TLS·heartbeat/lease·backlog·오류 알림의 운영 소유자를 확정한다. 단일 실행·중복 보상 방지·정지 중 진행 작업 종료·재시작을 승인된 환경에서 검증한다. 로컬 자연 보급과 브라우저 상태 조회는 운영 외부 Worker의 주기 실행 증거와 구분한다. |
| iPhone Safari·Android 실기기 | BLOCK | 사람 입력으로 1,500ms 패링과 실제 피드백을 확인한다. 터치·음향·효과·백그라운드 복귀·재연결·접근성·느린 네트워크에서 경기 진행, F5/복귀, 결과·XP를 기기별로 기록한다. 데스크톱 Chromium PASS와 기존 합성 지연 시험은 참고한다. |
| 자연 발생 `AUTHORITY_TIME_REGRESSION` | 미확인 | 엄격한 거절과 진단 로그는 기존 격리 결과를 수용한다. 출시 조건에 재현 판단이나 관찰 창이 필요한지 결정한다. 발생 시 집계 로그로 시간·경로·빈도와 복구를 확인한다. |
| S5 C 운영 검증과 신규 입장 | BLOCK | `C_DEFERRED_BY_USER` / `actualC=NOT_RUN`. 별도 승인과 실제 QA 결과가 있어야 바뀐다. S5 서버 입장 정책과 `VITE_GROUP_ITEMS_S5_ENTRY`, v4 계정 admission과 `VITE_DUEL_ITEMS_V4_ENTRY`는 각각 확인한다. DB 설치나 일반전 재개만으로 활성화하지 않는다. |
| 제품 판단과 배포 순서 | BLOCK | 기존 밸런스·음원 권리 보류를 확인한다. 최종 후보의 Git/CLI 입력 SHA와 합성 CI/Preview 증거를 확보하고 DB, Edge, Worker, main/Production, 입장 활성화 순서의 승인 경계를 기록한다. 기존 일반전은 새 모드 노출과 분리해 재개할 수 있는지 확인한다. |

Edge 소스는 `supabase/functions/duel-search-v4/index.ts`와 `supabase/config.toml`에 있다. 입장 플래그는 `App.jsx`와 `pages/PlayPage.jsx`에서 확인했다. 운영 재개·중단 조건은 [운영 실행 검토 절차](S5-PR63-CLI-MIGRATION-RUNBOOK-2026-11-23.md)를 따른다.
