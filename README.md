# Wiki Race (위키 레이스)

[Wiki Race](wiki-navigation-game)는 나무위키(또는 위키백과 미러 서버)와 같은 하이퍼텍스트 문서를 기반으로, 출발 문서에서 문서 내에 포함된 링크만을 클릭하여 주어진 '목표 문서'에 누구보다 빠르게 도달하는 웹 기반 게임 프로젝트입니다.

## 🚀 프로젝트 특징

- **Single & Multiplayer**: 혼자서 기록을 측정하고 단축하는 싱글 플레이 모드와 다른 플레이어와 1 VS 1로 실시간으로 대결할 수 있는 멀티플레이 기능을 지원합니다.
- **다이나믹 라우팅 및 모드 지원**:
  - `로그인 모드`: Supabase와 연동된 계정 시스템 및 기록 (총 플레이, 최고 랭킹) 저장.
  - `게스트 모드`: 회원가입 없이 플레이할 수 있지만 랭킹에는 등록되지 않습니다.
  - `데모 모드`: 백엔드(Supabase)가 당장 설정되지 않았더라도 게임 로직을 단독 구동해볼 수 있습니다.
- **경로 트래킹 시스템 (Path Tracker)**:
  - 사용자가 클릭해서 이동한 **모든 문서의 경로(Path)** 를 추적하여 기록이 끝난 뒤 결과 창에서 요약해 보여줍니다.
  - 랭킹 페이지에서는 우수한 기록을 낸 플레이어들이 "어떤 경로를 통해 목표 문서에 도달했는지" 살펴볼 수 있는 **이동 경로 펼쳐보기** 기능이 포함되어 있습니다.
- **반응형 UI와 다이나믹 탐색 보조 (Navigation & Helpers)**:
  - 접속 시 아름다운 화면과 모달 기반의 흐름을 통해 UX를 높였습니다.
  - 긴 위키 문서에서도 위치를 잃지 않도록, 문서 내 목차(h2, h3)를 추출하여 우측에 **네비게이션 미니맵(Navigation Bar)**을 플로팅 형태로 제공합니다.
  - 헷갈릴 때 언제든 규칙을 꺼내볼 수 있는 "우측 하단 플로팅 헬프 모달" 기능이 내장되어 있습니다.
- **게임성 강화 및 부정행위 방지**:
  - 레이스의 난이도와 재미를 유지하기 위해, 브라우저의 **'페이지에서 찾기(Ctrl+F/Cmd+F)' 및 '우클릭(컨텍스트 메뉴)'을 제한**하여 플레이어가 직접 문서 내에서 하이퍼링크를 찾도록 유도합니다.

## 🛠️ 기술 스택

### Frontend
- **Framework**: `React` (v18.3)
- **Build Tool**: `Vite` (v5.4)
- **Router**: `react-router-dom` (SPA 라우팅 관리)
- **Form & Validation**: `react-hook-form`, `Zod` (로그인 및 회원가입 시 유효성 검사)
- **Styling**: `Vanilla CSS` (app.css, multiplayer.css 등 모듈식 관리)

### Backend / BaaS
- **Database / Auth**: `Supabase` (postgreSQL 기반, `@supabase/supabase-js`)
- **Realtime**: Supabase Realtime을 통한 1 VS 1 멀티플레이어 동기화.
- **Functions**: Edge Functions (사용자명 기반 가입/조회 로직 및 타겟 난이도 조절. `target-level`, `username-signup`, `username-lookup` 등)

## 🗂️ 핵심 디렉토리 및 파일 구조

```text
/
├── App.jsx                 # 애플리케이션 최상단 라우터 설정구간 및 GameRoute/LoginRoute 래퍼
├── authContext.jsx         # 전역 단위의 Authentication 상태 관리 (Guest/Demo/Supabase)
├── rankingService.js       # Supabase의 `game_records` 테이블과 통신하며 통계 및 랭킹 조회
├── supabaseClient.js       # Supabase 초기화 및 환경 변수 설정
├── main.jsx                # React Entry Point
│
├── /pages                  # 각 라우트별 메인 화면 컴포넌트들
│   ├── IntroPage.jsx       # [/] 접속 시 렌더링되는 최고 초기 화면
│   ├── LoginPage.jsx       # 접속/가입/게스트 폼을 책임지는 페이지 (+ 모달에 대응 가능)
│   ├── MainPage.jsx        # 로그인 후 진입하는 대시보드
│   ├── GamePage.jsx        # 싱글플레이 게임 환경 및 타이머 로직 통제
│   ├── MultiplayerPage.jsx # 대전 방 생성/참여 허브
│   ├── RoomPage.jsx        # 대기방
│   ├── MultiplayerGamePage.jsx # 실시간 대전 게임 화면 컴포넌트
│   └── RankingPage.jsx     # 유저들의 전체 & 주간 랭킹과 경로(Path) 제공
│
├── /components             # 재사용 가능한 UI 블록 및 오버레이 모달
│   ├── GameSetup.jsx       # 커스텀 목표 설정
│   ├── SuccessOverlay.jsx  # 도달 완료 후 랭킹 요약 및 '이동 경로 리스트' 출력
│   ├── FloatingHud.jsx     # 스크롤을 내려도 타겟과 타이머를 보여줌
│   └── WikiViewer.jsx      # 내부 iframe/HTML 뷰어 관리
│
└── css files               # app.css, wiki.css, multiplayer.css 등
```

## 🎮 주요 화면 및 상호작용 흐름 (Flow)

1. **시작(Intro)**: `/` 진입 시 `IntroPage`가 배경 사진과 함께 표시되며 어느 화면이든 터치 시 모달 형태로 `LoginPage`가 올라옵니다.
2. **대시보드(Main)**: 계정 통계(총 플레이 횟수, 최고 기록, 최근 경로 내역) 및 **오늘의 도전** 키워드가 주어집니다. 
3. **게임 진행(Game)**:
    - 타이머 작동 및 상단 HUD가 게임의 경과를 알립니다.
    - 게임은 사용자가 **목표 문서**와 **방금 클릭해 도달한 문서(Current)** 의 제목(Title)이 일치할 경우 클리어를 선언합니다. (`handleWin` 호출)
4. **리더보드(Ranking)**:
   - 클리어 시간(`elapsedSeconds`)과 클릭 횟수(`clickCount`)에 따라 순위가 매겨집니다.
   - [경로 보기] 버튼을 클릭해 유저가 선택했던 문서들의 흐름을 분석할 수 있습니다.

## ⚙️ 로컬 환경 구동 방법

이 프로젝트는 터미널을 열고 다음 명령어를 통해 로컬 구동환경을 시작할 수 있습니다.

```bash
# 1. 패키지 설치
npm install

# 2. 환경 변수 설정
# 루트 디렉토리에 .env 파일을 생성하고 아래의 변수를 할당합니다. (없으면 Demo 모드 구동)
VITE_SUPABASE_URL=당신의_SUPABASE_PROJECT_URL
VITE_SUPABASE_ANON_KEY=당신의_SUPABASE_ANON_KEY

# 3. 개발 서버 실행
npm run dev
```

서버가 실행된 후 `http://localhost:5173` 등 주어진 로컬호스트 주소를 통해 접속하실 수 있습니다.
