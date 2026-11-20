const MODES = new Set(['observe', 'focus-click', 'guided-choice', 'free-practice']);
const ACTORS = new Set(['idle', 'point', 'think', 'surprise', 'cheer', 'serious', 'wave']);

// Modules are supplied explicitly. Unreleased catalogues and hidden rewards never enter this graph.
export function createTutorialRegistry(modules) {
  const entries = new Map();
  for (const input of modules) {
    if (!/^[a-z][a-z0-9:-]*$/.test(input.id) || entries.has(input.id) || !Number.isInteger(input.version) || input.version < 1 || !input.steps?.length) {
      throw new Error('Invalid tutorial module');
    }
    const steps = input.steps.map(step => Object.freeze({ ...step, next: step.next ? Object.freeze({ ...step.next }) : undefined }));
    const ids = new Set(steps.map(step => step.id));
    if (ids.size !== steps.length) throw new Error('Duplicate tutorial step');
    for (const step of steps) {
      if (!MODES.has(step.mode) || !ACTORS.has(step.actor) || !step.dialogue || !step.route?.startsWith('/') || !/^[A-Za-z0-9._-]+$/.test(step.id)) throw new Error('Invalid tutorial step');
      if (step.mode !== 'observe' && (!step.anchor || !Object.keys(step.next || {}).length)) throw new Error('Action step needs an anchor and explicit events');
      for (const destination of Object.values(step.next || {})) if (destination !== null && !ids.has(destination)) throw new Error('Unknown tutorial destination');
    }
    entries.set(input.id, Object.freeze({ ...input, steps: Object.freeze(steps), migrations: Object.freeze({ ...input.migrations }) }));
  }
  for (const module of entries.values()) for (const id of module.dependsOn || []) if (!entries.has(id)) throw new Error('Unknown tutorial dependency');
  return Object.freeze({ get: id => entries.get(id) || null, list: () => [...entries.values()] });
}

export function getTutorialStep(module, progress) {
  return module.steps.find(step => step.id === progress.stepId) || module.steps[0];
}


export const TUTORIAL_DIM_OPACITY = 0.28;

// Presentation only: route/step contracts and persisted progress are unchanged.
export function getTutorialContext(module, step) {
  if (!['intro-core', 'growth-basics'].includes(module.id)) {
    const label = module.label || '연습';
    return { trail: [label], phase: 0, location: label, stepNumber: Math.max(0, module.steps.indexOf(step)) + 1, totalSteps: module.steps.length, overview: false };
  }
  const growth = module.id === 'growth-basics';
  const trail = growth ? ['도감', '꾸미기', '결과'] : ['HOME', 'PLAY', 'SOLO', '결과'];
  const phase = growth
    ? step.panel === 'result' ? 2 : ['editor', 'card'].includes(step.panel) ? 1 : 0
    : step.chapter === 'play' ? 1 : step.chapter === 'solo' ? 2 : ['result', 'final'].includes(step.chapter) ? 3 : 0;
  return { trail, phase, location: growth ? `성장 · ${trail[phase]}` : trail[phase],
    stepNumber: Math.max(0, module.steps.indexOf(step)) + 1, totalSteps: module.steps.length,
    overview: module.id === 'intro-core' && step.id === 'W00' };
}
