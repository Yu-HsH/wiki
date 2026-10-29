// Original recordings. Sources/hashes: public/audio/{manifest.json,sfx-v03/manifest.json,sfx-v04/manifest.json,sfx-v05/manifest.json,ui-v01/manifest.json}.
// BGM replacement needs only a new file/URL here; gameplay does not depend on audio.
// Positive result mix provenance: public/audio/celebration-v02/manifest.json.
// Approved defeat A provenance: public/audio/duel-loss-v03/manifest.json.
const clip = (file, extra = {}) => ({ url: `/audio/${file}.wav`, ...extra });
export const AUDIO_ASSETS = Object.freeze({
  home: clip('home-kalimba', { bus: 'bgm' }),
  opening: clip('opening-v02/journey-departure', { bus: 'bgm', volume: .5 }),
  jungle: clip('game-v02/jungle-expedition', { bus: 'bgm', volume: .6 }),
  result: clip('result-v01/expedition-records', { bus: 'bgm', volume: .55 }),
  open: clip('journal-open'),
  flip: clip('page-flip'),
  reveal: clip('countdown', { rate: 1.5, volume: .38, length: .23 }),
  tick: clip('countdown', { volume: .8 }),
  go: clip('game-start', { volume: .8 }),
  navigate: clip('sfx-v05/page-turn-clean', { volume: .32, rate: 1.6 }),
  finish: clip('celebration-v02/goal-arrival', { volume: .8, category: 'result' }),
  win: clip('celebration-v02/goal-arrival', { volume: .8, category: 'result' }),
  loss: clip('duel-loss-v03/brass', { volume: .45, category: 'result' }),
  retire: clip('sfx-v03/teleport-air', { rate: .8, length: .3, volume: .35, category: 'result' }),
  achievement: clip('game-start', { rate: 1.35, volume: .55, category: 'reward' }),
  xp: clip('countdown', { rate: 1.8, length: .24, volume: .32, category: 'reward' }),
  impact: clip('sfx-v04/vs-boom', { volume: .95 }),
  // Item timbres/volumes approved 2026-10-23: docs/sound-prototypes/ITEM-SFX-APPROVED.json.
  ink: clip('sfx-v04/ink-splash-three', { volume: .8 }),
  seal: clip('sfx-v04/seal-impact', { volume: .8 }),
  shield: clip('sfx-v04/shield-block', { volume: .8 }),
  reflect: clip('sfx-v04/blade-parry', { volume: .8 }),
  move: clip('sfx-v05/page-turn-clean', { volume: .8 }),
  itemReveal: clip('sfx-v05/page-turn-clean', { volume: .45 }),
  uiClick: clip('ui-v01/button-click', { volume: .5, category: 'ui' }),
  personalArrival: clip('ui-v03/personal-arrival', { volume: .52, category: 'result' }),
  denied: clip('ui-v02/request-denied', { volume: .48 }),
  join: clip('ui-v02/lobby-join', { volume: .46 }),
  ready: clip('ui-v02/group-ready', { volume: .48 }),
  connectionLost: clip('ui-v02/connection-lost', { volume: .42 }),
  connectionRestored: clip('ui-v02/connection-restored', { volume: .44 }),
  saved: clip('ui-v02/save-confirm', { volume: .46 }),
});

export function duelCueSound(cue) {
  if (!cue || ['void', 'failure'].includes(cue.kind)) return null;
  if (cue.kind === 'block') return 'shield';
  if (cue.kind === 'reflect') return 'reflect';
  if (cue.outcome === 'blocked') return 'shield';
  if (cue.outcome === 'reflected' && cue.kind !== 'hit') return 'reflect';
  return ({ ink: 'ink', seal: 'seal', shield: 'shield', reflect: 'reflect',
    rewind: 'move', move: 'move', return: 'move', compass: 'move' })[cue.motif] || 'itemReveal';
}
