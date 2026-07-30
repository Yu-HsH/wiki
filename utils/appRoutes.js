export const LOBBY_PATH = "/lobby";
export const LOGIN_PATH = "/login";
export const ONLINE_LOBBY_PATH = "/multiplayer";

export function getLobbyAccess({ loading, user }) {
  if (loading) return "loading";
  return user ? "allowed" : "login";
}

export function getSingleGameLobbyNavigation() {
  return Object.freeze({
    path: LOBBY_PATH,
    options: Object.freeze({ replace: true }),
  });
}
