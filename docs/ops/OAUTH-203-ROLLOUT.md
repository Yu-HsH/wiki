# Wiki Race 2.0.3 — Google 우선, Kakao 후속 OAuth 설정·검증

**현재 상태: 별도 Draft PR, 운영 OAuth 노출/로그인/DB 변경 없음.** 기존 아이디·비밀번호 로그인은 계속 사용합니다.

## 구조와 기록 보존

현재 기존 회원은 `auth_<random>@internal.wikigame.local`이라는 합성 이메일로 Supabase Auth에 등록되어 있습니다. 운영 기준 기존 프로필 약 200건과 이메일 방식 Auth identity 약 203건이며, 2.0.3 조사 시 OAuth identity는 0건입니다.

- 신규 소셜 유저: `auth.signInWithOAuth` → `/oauth/complete` → 이름 설정 → **서버가 인증된 Auth UID**로 `public.profiles` 1건 INSERT → 로비.
- `public.complete_oauth_profile(p_username,p_nickname)`: 인증된 `auth.uid()`가 실제 `auth.identities.provider`에 `google` 또는 `kakao`가 있는 경우에만 실행. 기존 프로필 존재 시 거부, 아이디 유니크, 회원 데이터를 업데이트/병합하지 않음.
- 기존 아이디 회원: **기존 로그인 후** `/profile` → 소셜 계정 연결 → `auth.linkIdentity({provider})`. 성공 후 **같은 Auth UID**여야 합니다. 기록/XP/랭킹/업적의 소유자 ID 변경 없음.
- 신규 OAuth 회원은 합성 이메일을 만들지 않습니다(`profiles.synthetic_email=NULL` 허용). 기존 200명 이상의 이메일은 그대로 보존.
- **자동 프로필 병합은 금지.** 새 OAuth 회원이 우연히 기존 닉네임/이메일과 같더라도 기존 기록이 자동 이동하지 않습니다. 기존 계정 소유자만 로그인 후 명시적 identity 연결.
- OAuth 로그인 직후 프로필 생성 전에는 게임·대기실·랭킹 진입을 막음. 기존 로그인 계정 중 프로필이 없는 비정상 사례는 고객지원 안내.
- `user_metadata`는 화면 이름 동기화에만 사용하며, 서버 권한은 `auth.uid()`와 `auth.identities`로 판단.

## 운영 플래그 (기본 OFF)

프론트에서 새 OAuth 버튼은 다음 **환경 변수에 문자열 `true`를 지정한 빌드**에서만 표시됩니다. 새 빌드가 필요하며 기존 운영 기능은 기본 유지합니다.

| 기능 | Vite 환경 변수 |
| --- | --- |
| 구글 로그인/연결 | `VITE_OAUTH_GOOGLE_ENABLED=true` |
| 카카오 로그인/연결 | `VITE_OAUTH_KAKAO_ENABLED=true` |

Client Secret, Service Role key를 `VITE_` 이름으로 넣지 마세요. 클라이언트에는 공개 설정 플래그만 노출합니다.

## 구글 (1차)

1. [Google Cloud Console](https://console.cloud.google.com/apis/credentials)에서 OAuth 동의 화면과 웹 애플리케이션 OAuth Client 생성
2. OAuth 리디렉션 URI는 Supabase Auth 제공자 callback URL `https://ctdpyrmitljgrcgfvndn.supabase.co/auth/v1/callback` 등록
3. Google Client ID / Secret을 **Supabase Dashboard → Authentication → Providers → Google**에서 설정·활성화
4. **Supabase Dashboard → Authentication → URL Configuration**에 `https://wiki-dusky-one.vercel.app/oauth/complete`, `https://wiki-dusky-one.vercel.app/profile` 추가. 사이트 URL도 `https://wiki-dusky-one.vercel.app`로 확인
5. Supabase Auth 설정의 **Enable Manual Linking**을 켜야 기존 회원의 `linkIdentity()`가 동작합니다. 베타 기능이므로 신규 계정 + 기존 계정 모두 격리 QA를 먼저 수행
6. `VITE_OAUTH_GOOGLE_ENABLED=true`는 **인증 제공자가 정상인 것이 확인된 마지막 단계**에서만 배포 환경에 추가하고 재빌드/배포

## 카카오 (2차)

1. [Kakao Developers](https://developers.kakao.com/)에서 앱 등록, 카카오 로그인 활성화
2. 카카오 앱의 **REST API 키**를 Supabase provider의 Client ID로, 카카오 Client Secret을 provider의 secret으로 설정
3. Kakao 허용 리디렉션 URI에 같은 Supabase Auth callback `https://ctdpyrmitljgrcgfvndn.supabase.co/auth/v1/callback` 등록
4. Supabase Dashboard → Authentication → Providers → Kakao 활성화
5. **카카오 이메일 미동의/미제공 사용자도 프로필을 생성 가능**해야 합니다. 게임 프로필에는 실제 이메일이 필요하지 않음. Kakao 계정 이름만으로 username을 자동 부여하지 않음
6. 다른 Kakao 계정으로 기존 기록 덮어쓰기/병합 금지. 구글 QA와 동일한 가입·연결 시나리오 검증 후 `VITE_OAUTH_KAKAO_ENABLED=true` 별도 활성화

## 리다이렉트 및 브라우저

- 인증용 브라우저 경로: `/oauth/complete`. 기존 계정 연결의 복귀 경로는 `/profile`.
- 정식 서비스는 HTTPS origin만 허용. 로컬은 `http://127.0.0.1:5173`/localhost 예외이며 Supabase URL 설정에 **테스트 시에만** 추가.
- Supabase JS 클라이언트는 `flowType: "pkce"`, `detectSessionInUrl: true`.
- Vercel 프리뷰 도메인은 호스트가 계속 바뀌므로 운영 OAuth Redirect Allow List에 무분별한 와일드카드를 추가하지 않습니다. 테스트용 고정 도메인을 쓰는 것이 안전합니다.
- `code`, `access_token`, `refresh_token`, 소셜 Client Secret을 로그/이슈/PR에 업로드하지 마세요.

## 검증 게이트

- [ ] Node 단위 테스트: provider OFF 기본, redirect 안전성, 링크 시작, 신규 계정 입력 검증
- [ ] PostgreSQL: legacy 345 XP 불변, 이메일 전용 유저의 사회적 가입 차단, 구글·카카오 새로운 identity, 중복 아이디/2회 가입 거절, anon 함수 실행 거부
- [ ] 전체 로컬 Supabase migration reset
- [ ] PC/모바일 브라우저: 기존 로그인·회원가입·게스트·메인·소식 회귀
- [ ] Google OAuth 실제 브라우저 첫 가입 → DB profile 생성 → F5 유지 → 경기 완주 XP 저장
- [ ] **기존 계정** 로그인 → Google 연결 → 로그아웃 → Google 로그인 → 기존 Auth UID·XP·업적·랭킹 유지
- [ ] 로그인/연동 취소 및 계정 충돌 시 신규 계정의 데이터가 기존 사용자에게 연결되지 않음
- [ ] Kakao 이메일 없이 신규 가입, 기존 계정 명시 연결 및 연결 불가 케이스
- [ ] 계정 연결/관리자 여부 혼동 없음; 운영자 기존 계정 UUID를 보존해야 운영자 권한 유지

## 배포 정책

서버 쪽 provider의 실제 Client ID / Secret 설정과 수동 identity linking 옵션은 코드로 대체할 수 없습니다. 관리자가 직접 Provider 콘솔 설정을 완료해야 실서비스 검증이 가능합니다.

이 PR은 검증·준비용입니다. 구글 검증 후 활성화하고, 카카오 플래그는 계속 OFF로 둔 채 후속 활성화합니다. 기존 DB record owner를 옮기는 migration이나 자동 병합 API를 만들지 않습니다.
