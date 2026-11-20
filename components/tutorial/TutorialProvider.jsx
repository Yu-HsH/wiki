import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createTutorialSession, transitionTutorial, tutorialActionToken } from '../../tutorial/core/engine.js';
import { getTutorialStep } from '../../tutorial/core/registry.js';
import { shouldOfferTutorial, tutorialScope } from '../../tutorial/core/progress.js';

const TutorialContext = createContext(null);

// Keying this inner boundary prevents a render/effect window that could save A's state into B.
export function TutorialProvider(props) {
  const scope = tutorialScope(props.identity);
  return <ScopedTutorialProvider key={`${scope}:${props.module.id}:${props.module.version}`} {...props} scope={scope} />;
}
function ScopedTutorialProvider({ module, identity, repository, scope, route, onRequestRoute, stableScreen = false, realMatchActive = false, guestContinuityCompleted = false, children }) {
  const [session, setSession] = useState(() => createTutorialSession(module, repository.load(scope, module)));
  const [persisted, setPersisted] = useState(true);
  const [confirmExit, setConfirmExit] = useState(false);
  const current = useRef(session);
  const environment = useRef({ route, realMatchActive });
  environment.current = { route, realMatchActive };
  const step = getTutorialStep(module, session.progress);
  const update = useCallback(event => {
    const before = current.current;
    const next = transitionTutorial(module, before, event);
    if (next === before) return false;
    current.current = next; // synchronous guard against repeated/stale click events
    setSession(next);
    return true;
  }, [module]);
  useEffect(() => { setPersisted(repository.save(scope, module, session.progress).persisted); }, [repository, scope, module, session]);
  useEffect(() => {
    if (shouldOfferTutorial({ module, identity, progress: current.current.progress, stableScreen, realMatchActive, guestContinuityCompleted })) update({ type: 'offer' });
  }, [module, identity, stableScreen, realMatchActive, guestContinuityCompleted, update]);
  useEffect(() => { if (realMatchActive) { update({ type: 'pause' }); setConfirmExit(false); } }, [realMatchActive, update]);
  const requestStepRoute = useCallback(() => {
    if (environment.current.realMatchActive) return;
    const destination = getTutorialStep(module, current.current.progress).route;
    if (environment.current.route !== destination) onRequestRoute?.(destination);
  }, [module, onRequestRoute]);
  const control = useCallback(type => {
    if (environment.current.realMatchActive && ['start', 'resume', 'restart', 'next', 'skip-chapter', 'previous'].includes(type)) return false;
    if (current.current.revision !== session.revision) return false;
    const accepted = update({ type });
    setConfirmExit(false);
    if (accepted && ['start', 'resume', 'restart', 'next', 'skip-chapter', 'previous'].includes(type) && current.current.progress.status === 'active') requestStepRoute();
    return accepted;
  }, [update, requestStepRoute, session.revision]);
  const token = useCallback(action => tutorialActionToken(module, current.current, action), [module]);
  const act = useCallback(captured => {
    if (environment.current.realMatchActive || environment.current.route !== getTutorialStep(module, current.current.progress).route) return false;
    const accepted = update({ ...captured, type: 'action' });
    if (accepted && current.current.progress.status === 'active') requestStepRoute();
    return accepted;
  }, [module, update, requestStepRoute]);
  const value = useMemo(() => ({ module, identity, scope, session, step, route, routeReady: route === step.route, persisted, realMatchActive, confirmExit,
    control, act, token, requestStepRoute, requestExit: () => setConfirmExit(true), continueTutorial: () => setConfirmExit(false) }),
  [module, identity, scope, session, step, route, persisted, realMatchActive, confirmExit, control, act, token, requestStepRoute]);
  return <TutorialContext.Provider value={value}>{children}</TutorialContext.Provider>;
}
export function useTutorial() {
  const context = useContext(TutorialContext);
  if (!context) throw new Error('TutorialProvider required');
  return context;
}
