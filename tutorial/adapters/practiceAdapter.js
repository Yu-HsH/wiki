import { practiceDocuments } from '../fixtures/practiceDocuments.js';

// Capability boundary: accepts no client, transport, callbacks, room IDs or production commands.
export function createPracticeAdapter() {
  let scene = 'apple';
  let preview = 'default';
  const snapshot = () => Object.freeze({ ...practiceDocuments[scene], path: [...practiceDocuments[scene].path], scene, preview, elapsedSeconds: 12, clickCount: practiceDocuments[scene].path.length - 1, practice: true });
  return Object.freeze({
    snapshot,
    restoreScene(next) { scene = Object.hasOwn(practiceDocuments, next) ? next : 'plant'; return snapshot(); },
    move(title) {
      const allowed = { apple: { '과일': 'fruit' }, fruit: { '식물': 'plant', '요리': 'detour' } };
      const next = allowed[scene]?.[title];
      if (!next) return { accepted: false, snapshot: snapshot() };
      scene = next;
      return { accepted: true, snapshot: snapshot() };
    },
    retryChoice() { if (scene === 'detour') scene = 'fruit'; return snapshot(); },
    previewStyle(style) { if (!['default', 'sage'].includes(style)) throw new Error('Unknown local preview'); preview = style; return snapshot(); },
    executeProductionCommand() { throw new Error('Production commands are unavailable in tutorial practice'); },
  });
}
