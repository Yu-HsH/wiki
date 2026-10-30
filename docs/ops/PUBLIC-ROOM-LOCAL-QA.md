# Wiki Race 공개방 실제 테스트 — 기존 로컬 Docker DB 재사용

**대상:** 기존 Windows `C:\Project\wiki`, Supabase 프로젝트 `wiki-packet13-r2-clean158`.
**비용:** 새로운 Supabase 유료 Branch/Project 생성 없음.
**운영:** 이 문서의 절차는 `localhost` 전용. 원격 Supabase DB/운영 Vercel에는 마이그레이션을 적용하지 않는다.

## 최초 1회

1. Docker Desktop을 켠다. PowerShell에서 해당 프로젝트의 현재 PR #2 브랜치로 이동한다.
   ```powershell
   cd C:\Project\wiki
   git status --short
   git fetch origin
   git switch feat/public-room-discovery-20261030
   git pull --ff-only origin feat/public-room-discovery-20261030
   npm ci
   ```
   **주의:** 작업 트리가 더럽거나 브랜치 변경이 다른 작업을 덮어쓸 경우 위 명령을 중단하고 기존 로컬 작업을 먼저 보존한다. `git reset --hard` 사용 금지.

2. 이전 로컬 스택이 이미 실행 중인지 확인한다.
   ```powershell
   docker ps --filter "name=supabase_db_wiki-packet13-r2-clean158"
   npm run public-room:local-check
   ```
   도커 컨테이너가 없거나 중지됐다면 이전에 사용한 핀 고정 실행기 `npm run supabase:start`를 사용한다. Docker 설정이나 이미지 ID 오류가 나면 강제 삭제·reset을 하지 말고 로그를 검토한다.

3. 실제 공개방 DB 마이그레이션 + 롤백되는 SQL 테스트를 실행한다.
   ```powershell
   npm run public-room:local-prepare
   ```
   - 컨테이너, PostgreSQL 이미지, Supabase CLI 2.114.0 정합성 먼저 검사.
   - `supabase db push --local --include-all --skip-vault --yes`로 **로컬 DB에만** 미적용 마이그레이션 적용. 기존 로컬 기록은 영향을 받을 수 있으므로 필요한 데이터는 별도 백업.
   - `public_room_discovery_v1.sql`을 로컬 PostgreSQL에서 pgTAP 실행. 테스트 fixture 전체는 `ROLLBACK`.
   - `.env.publicroom.local` (gitignored)에 로컬 API 주소 및 공개 anon 키만 저장. `.env.local` 미변경.
   - **절대 금지:** `supabase db reset --linked`, `supabase db push --linked`, `supabase migration repair` 및 원격 DB URL 사용.

## 브라우저 테스트 (PowerShell 창 두 개)

첫 번째 터미널 (로컬 회원가입/로그인 Edge Functions):
```powershell
cd C:\Project\wiki
npx --no-install supabase functions serve
```

두 번째 터미널 (실제 사용자 화면):
```powershell
cd C:\Project\wiki
npm run dev -- --mode publicroom --host 127.0.0.1
```
브라우저에서 **http://127.0.0.1:5173**에 접속한다. 포트 충돌 시 Vite가 안내하는 실제 포트를 이용한다.

세 개의 독립 브라우저 프로필/시크릿 창에서 **로컬 테스트 계정** 3개를 신규 가입한다. 운영 계정의 암호를 그대로 쓰지 않는다. Supabase Auth + `profiles` 모두 로컬 DB에 생성되어야 한다.

## 확인 시나리오

1. **1:1 공개방:** 계정 A가 공개·아이템전 방 생성 → 계정 B가 1:1 공개방 목록에서 확인 → 참가 → 방장과 참가자 모두 입실.
2. **1:1 비공개방:** A가 비공개 생성 → B 목록에는 나타나지 않음 → 공유한 6자리 코드로 참가 성공.
3. **그룹 공개방:** A가 그룹 공개방 (정원 3 이상) 생성 → B와 C가 목록에서 참가 → 최소 3명 READY 및 정상 시작.
4. **그룹 비공개방:** 목록에서 숨김 → 코드 참가 가능.
5. **경합:** 정원이 1자리 남았을 때 마지막 자리에 여러 계정이 동시에 참가하면 1명만 성공하고, 다른 계정은 인원 초과 안내.
6. **복원:** 참가 후 새로고침 시 참가 상태가 유지됨. 나가기·방 종료 시 목록에서 자동/수동 새로고침으로 제외.
7. **권한:** 익명 계정에서는 공개 목록/참가 불가. 비공개방은 코드를 모르는 계정이 상세 조회 불가.

실패 화면은 계정 비밀번호, JWT, 서비스 키, 응답 Authorization 헤더를 제외하고 공유한다. SQL 오류는 `npm run public-room:local-prepare`의 마지막 pgTAP 실패 부분만 전달해도 된다.

## 검증 환경의 한계

- Vercel Preview는 서버가 호스팅한 프론트이며, 로컬 Supabase(127.0.0.1)는 **테스터의 브라우저 PC**에서만 접근 가능. 이 QA는 Vite 로컬 주소로 한다.
- DB SQL 통과는 UI 실기 통과가 아니다. `npm run public-room:local-prepare` 성공 이후 위 브라우저 테스트를 진행한다.
- 운영 DB 및 `main` 배포는 별도 승인/검증 단계다.
