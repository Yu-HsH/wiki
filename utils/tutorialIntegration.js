export const PRACTICE_ROUTES = Object.freeze(['/lobby', '/play', '/tutorial/practice/solo', '/tutorial/practice/growth']);

export function requestedTutorial(search, registry) {
  const name = new URLSearchParams(search).get('practice');
  return name ? registry.get(name) || registry.get('intro-core') : null;
}

export function practiceHref(path, moduleId) {
  const safePath = PRACTICE_ROUTES.includes(path) ? path : '/lobby';
  return safePath + '?practice=' + encodeURIComponent(moduleId);
}

export function isRealMatchPath(path) {
  return path === '/game' || /^\/multiplayer\/(?:group\/)?game\//.test(path);
}

export function isPracticeNavigation(path) {
  return PRACTICE_ROUTES.includes(path);
}
