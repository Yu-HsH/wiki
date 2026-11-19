import { freshProgress } from './progress.js';
import { getTutorialStep } from './registry.js';

export function createTutorialSession(module, progress = freshProgress(module)) {
  return { progress, revision: 0 };
}
export function tutorialActionToken(module, session, action) {
  return { moduleId: module.id, version: module.version, stepId: session.progress.stepId, revision: session.revision, action };
}
export function transitionTutorial(module, session, event, now = new Date().toISOString()) {
  const progress = session.progress;
  const step = getTutorialStep(module, progress);
  const commit = patch => ({ progress: { ...progress, ...patch, updatedAt: now }, revision: session.revision + 1 });
  const goto = id => id ? commit({ stepId: id, ...(module.preparePracticeForStep ? { practice: module.preparePracticeForStep(progress.practice, id) } : {}) }) : commit({ status: 'completed', completedVersion: Math.max(progress.completedVersion || 0, module.version) });
  if (event.type === 'offer' && !['active', 'paused', 'offered'].includes(progress.status)) return commit({ status: 'offered', offeredVersion: module.version });
  if (event.type === 'restart') return commit({ status: 'active', stepId: module.steps[0].id, skippedChapters: [], ...(module.initialPracticeState ? { practice: module.initialPracticeState() } : {}) });
  if (event.type === 'start' && ['unseen', 'offered'].includes(progress.status)) return commit({ status: 'active' });
  if (event.type === 'resume' && progress.status === 'paused') return commit({ status: 'active' });
  if (event.type === 'pause' && ['active', 'offered'].includes(progress.status)) return commit({ status: 'paused' });
  if (event.type === 'dismiss' && ['active', 'paused', 'offered'].includes(progress.status)) return commit({ status: 'dismissed', dismissedVersion: module.version });
  if (progress.status !== 'active') return session;
  const index = module.steps.indexOf(step);
  if (event.type === 'previous') return index > 0 ? goto(module.steps[index - 1].id) : session;
  if (event.type === 'skip-chapter') {
    const next = module.steps.slice(index + 1).find(candidate => candidate.chapter !== step.chapter && !candidate.optional);
    const result = goto(next?.id);
    return { ...result, progress: { ...result.progress, skippedChapters: [...new Set([...progress.skippedChapters, step.chapter])] } };
  }
  if (event.type === 'next' && step.mode === 'observe') return goto(module.steps[index + 1]?.id);
  if (event.type !== 'action' || event.moduleId !== module.id || event.version !== module.version || event.stepId !== step.id || event.revision !== session.revision || !Object.hasOwn(step.next || {}, event.action)) return session;
  const practice = module.reducePractice?.(progress.practice, event);
  if (module.reducePractice && !practice?.accepted) return session;
  const next = goto(step.next[event.action]);
  return practice ? { ...next, progress: { ...next.progress, practice: practice.state } } : next;
}
