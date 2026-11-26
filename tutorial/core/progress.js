const SCHEMA = 1;
const PREFIX = 'wiki-race:tutorial:v1:';
let tabGuestId = null;
const STATUSES = new Set(['unseen', 'offered', 'active', 'paused', 'dismissed', 'completed']);
const cleanVersion = value => Number.isSafeInteger(value) && value > 0 ? value : null;

export function tutorialScope(identity) {
  const kind = identity?.kind;
  if (!['guest', 'member'].includes(kind) || typeof identity.id !== 'string' || !identity.id || identity.id.length > 160) throw new Error('Explicit tutorial identity required');
  return `${kind}:${encodeURIComponent(identity.id)}`;
}

// Use a browser key, never the changing loginGuest ID. Blocked storage degrades to this tab.
export function getBrowserGuestIdentity(storage, createId = () => globalThis.crypto.randomUUID()) {
  const key = `${PREFIX}browser-guest`;
  let id;
  try { id = storage?.getItem(key); } catch { /* memory-only */ }
  if (!id || !/^[a-zA-Z0-9-]{1,100}$/.test(id)) {
    id = tabGuestId || createId();
    try { storage?.setItem(key, id); } catch { /* memory-only */ }
  }
  tabGuestId = id;
  return Object.freeze({ kind: 'guest', id });
}

export function hasCompletedGuestTutorial(storage, repository, module) {
  let id;
  try { id = storage?.getItem(PREFIX + 'browser-guest'); } catch { /* memory-only */ }
  if (typeof id !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(id)) id = tabGuestId;
  if (!id) return false;
  const scope = tutorialScope({ kind: 'guest', id });
  return Boolean(repository.load(scope, module).completedVersion);
}

export function freshProgress(module) {
  return { schema: SCHEMA, moduleId: module.id, version: module.version, status: 'unseen', stepId: module.steps[0].id,
    completedVersion: null, dismissedVersion: null, offeredVersion: null, skippedChapters: [], updatedAt: null, ...(module.initialPracticeState ? { practice: module.initialPracticeState() } : {}) };
}

export function restoreProgress(module, input) {
  const fresh = freshProgress(module);
  if (!input || input.schema !== SCHEMA || input.moduleId !== module.id) return fresh;
  // Whitelist persisted fields. No user profile, reward catalogue, HTML or practice commands.
  const chapters = new Set(module.steps.map(step => step.chapter));
  const oldStep = module.migrations?.[input.stepId] || input.stepId;
  const known = module.steps.some(step => step.id === oldStep);
  return { ...fresh, ...(module.sanitizePracticeState ? { practice: module.preparePracticeForStep ? module.preparePracticeForStep(input.practice, known ? oldStep : fresh.stepId) : module.sanitizePracticeState(input.practice) } : {}), status: STATUSES.has(input.status) ? (input.status === 'active' ? 'paused' : input.status) : 'unseen',
    stepId: known ? oldStep : fresh.stepId,
    completedVersion: cleanVersion(input.completedVersion), dismissedVersion: cleanVersion(input.dismissedVersion), offeredVersion: cleanVersion(input.offeredVersion),
    skippedChapters: Array.isArray(input.skippedChapters) ? [...new Set(input.skippedChapters.filter(chapter => chapters.has(chapter)))] : [],
    updatedAt: typeof input.updatedAt === 'string' ? input.updatedAt.slice(0, 40) : null };
}

export function createProgressRepository(storage) {
  const memory = new Map();
  const keyFor = (scope, module) => `${PREFIX}${scope}:${module.id}`;
  return Object.freeze({
    load(scope, module) {
      const key = keyFor(scope, module);
      if (memory.has(key)) return restoreProgress(module, memory.get(key));
      try { return restoreProgress(module, JSON.parse(storage?.getItem(key) || 'null')); } catch { return freshProgress(module); }
    },
    save(scope, module, progress) {
      const key = keyFor(scope, module);
      const safe = { ...restoreProgress(module, progress), status: progress.status === 'active' ? 'active' : restoreProgress(module, progress).status };
      memory.set(key, safe);
      if (typeof storage?.setItem !== 'function') return { persisted: false };
      try { storage.setItem(key, JSON.stringify(safe)); return { persisted: true }; } catch { return { persisted: false }; }
    },
  });
}

// No progress is NOT evidence of a new member. The host must supply a verified auth signal.
export function shouldOfferTutorial({ module, progress, identity, stableScreen = false, realMatchActive = false, guestContinuityCompleted = false }) {
  if (!stableScreen || realMatchActive || guestContinuityCompleted || module.autoOffer === 'manual') return false;
  if (['active', 'paused', 'offered'].includes(progress.status)) return false;
  if (progress.offeredVersion >= module.version || progress.dismissedVersion >= module.version || progress.completedVersion >= module.version) return false;
  if (module.autoOffer === 'first-eligible-visit') {
    if (progress.completedVersion || progress.dismissedVersion) return false;
    return identity.kind === 'guest' || identity.firstLoginEligibility === 'new-confirmed';
  }
  return module.autoOffer === 'notice-only';
}
