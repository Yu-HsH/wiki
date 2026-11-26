import { LOBBY_PATH, LOGIN_PATH } from './appRoutes.js';
import { GUIDED_PRACTICE_ROUTE, findGuidedPracticeModule } from '../tutorial/modules/guidedPractice.js';

const INTRO_MODULE_ID = 'intro-core';
export function tutorialLoginPath(moduleId) {
  const course = findGuidedPracticeModule(moduleId);
  return LOGIN_PATH + '?tutorial=' + (course?.id || INTRO_MODULE_ID);
}

export const TUTORIAL_LOGIN_PATH = tutorialLoginPath(INTRO_MODULE_ID);

export function postLoginTutorialPath(search) {
  const requested = new URLSearchParams(search).get('tutorial');
  if (requested === INTRO_MODULE_ID) return practiceHref(LOBBY_PATH, INTRO_MODULE_ID);
  const course = findGuidedPracticeModule(requested);
  return course ? practiceHref(GUIDED_PRACTICE_ROUTE, course.id) : LOBBY_PATH;
}

export function confirmedTutorialSignupId(createdId, sessionId) {
  return typeof createdId === 'string' && createdId.length > 0 && createdId === sessionId ? createdId : null;
}

export const PRACTICE_ROUTES = Object.freeze(['/lobby', '/play', '/tutorial/practice/solo', '/tutorial/practice/growth', GUIDED_PRACTICE_ROUTE]);

export function requestedTutorial(search, registry) {
  const name = new URLSearchParams(search).get('practice');
  return name ? registry.get(name) || registry.get('intro-core') : null;
}

export function practiceHref(path, moduleId) {
  const safePath = PRACTICE_ROUTES.includes(path) ? path : '/lobby';
  return safePath + '?practice=' + encodeURIComponent(moduleId);
}

export function isRealMatchPath(path) {
  return /^\/game\/?$/i.test(path)
    || /^\/multiplayer\/(?:group\/)?game\//i.test(path)
    || /^\/multiplayer\/(?:duel-v4|group-items)(?:\/|$)/i.test(path);
}

export function isPracticeNavigation(path) {
  return PRACTICE_ROUTES.includes(path);
}
