/**
 * 앱 전역 스타일 모음 — `main.jsx`가 동적으로 불러온다.
 *
 * 정적 import로 두면 Vite가 진입 청크에 스타일시트를 붙여 점검 화면에서도 CSS 요청이 생긴다.
 * 이 파일을 App과 함께 동적 import 하면 스타일이 비동기 청크로 분리되어
 * 점검 화면 경로에서는 요청되지 않는다.
 */
import "./css/app.css";
import "./css/multiplayer.css";
import "./css/wiki.css";
import "./css/SuccessOverlay.css";
import "./css/group.css";
import "./css/groupSpectator.css";
import "./css/recovery.css";
import "./css/profileCard.css";
