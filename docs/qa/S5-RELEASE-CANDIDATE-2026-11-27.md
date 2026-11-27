# S5 출시 후보 검증

기준은 PR #67의 `5f7ce8f`와 Migration 이력 70입니다. 자유 S5 `ab84915`, 탐험 힌트 `dd21c85`를 각각 보존한 뒤 통합합니다.

| 순서 | Migration | 범위 |
| --- | --- | --- |
| 71 | `20261127013759_s5_free_wiki_navigation.sql` | 새 S5 방의 자유 이동, 공용 스냅샷, 기존 고정 코스 호환 |
| 72 | `20261127014804_exploration_hints.sql` | 네 모드의 힌트 설정, 공개 회차와 재경기 상속 |

기존 70개 Migration은 편집하지 않았습니다. 사전 구축 실험의 `20261127005312`는 보존 브랜치에 있습니다. 출시 후보는 70을 기준으로 검증합니다. 힌트 서버와 최신 `wiki-snapshot`의 준비가 끝난 환경에서 프런트를 연결할 수 있습니다.

검증은 2026-11-27 KST의 격리 환경에서 진행했습니다. 기존 격리 스냅샷의 증분으로 정확한 70 이력을 확보한 뒤 Supabase CLI로 위 두 건만 추가했습니다. 일반 방 389건, v4 방 1건, S5 방 1건, XP 원장 914건의 지문이 동일했습니다. 배포 및 운영 DB 적용은 별도 승인입니다.

## 집중 SQL

`supabase/tests/group_items_s5_free_wiki.sql`은 새 자유 S5와 기존 고정 S5를 같은 DB에서 시작합니다. 17종 보급 카탈로그, 캐시 유무에 따른 길잃기, 링크 검증, 검색 인덱스, 관전, 세 명 완주 및 70·55·45 XP를 확인합니다.

`supabase/tests/exploration_hints.sql`은 일반·아이템 1:1과 그룹에서 각각 켜기·끄기, 5·10분 공개, 중복 차단, 참가자별 동일 읽기, 실제 재경기 RPC의 설정 상속 및 목록 초기화를 확인합니다.

```powershell
node --check scripts/public-room-local-verify.mjs
npm test
npm run build
npx --no-install supabase test db supabase/tests/group_items_s5_free_wiki.sql supabase/tests/exploration_hints.sql --local
```
