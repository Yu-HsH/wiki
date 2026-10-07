export const LOBBY_PATH = "/lobby";
export const LOGIN_PATH = "/login";
export const ONLINE_LOBBY_PATH = "/multiplayer";

export function getLobbyAccess({ loading, user }) {
  if (loading) return "loading";
  return user ? "allowed" : "login";
}

/**
 * 온라인(1:1·그룹) 화면 접근 — 확정 계약: 게스트는 싱글만, 온라인은 로그인 사용자만.
 * PLAY 버튼 제한과 같은 판정을 직접 URL에도 적용한다. 로컬 게스트는 `user.isGuest`다.
 */
export function getOnlineAccess({ loading, user }) {
  if (loading) return "loading";
  if (!user) return "login";
  return user.isGuest ? "guest" : "allowed";
}

export function getSingleGameLobbyNavigation() {
  return Object.freeze({
    path: LOBBY_PATH,
    options: Object.freeze({ replace: true }),
  });
}
