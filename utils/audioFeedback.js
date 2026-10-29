import { getGroupStartState } from './groupLobbyState.js';

/** Display-only comparisons; quiet snapshots establish a baseline, never a verdict. */
export function createLobbyAudioGate(mode, myUserId) {
  let previous = null;
  return {
    reset() { previous = null; },
    observe({ room, players }, live = false, visible = true) {
      if (!room || !Array.isArray(players)) return null;
      const host = players.find(p => p.user_id === room.host_user_id);
      const ready = mode === 'group'
        ? getGroupStartState({ players, status: room.status, myUserId }).ok
        : room.status === 'waiting' && players.length === 2 && Boolean(host?.target_title && host?.target_page_id);
      const members = players.map(p => String(p.user_id)).sort();
      const fingerprint = players.map(p => `${p.user_id}:${p.target_page_id || p.submitted_target_page_id || ''}:${Boolean(p.is_ready)}`).sort().join('|');
      const next = { members, ready, fingerprint }, old = previous; previous = next;
      if (!old || !live || !visible || room.status !== 'waiting') return null;
      if (ready && !old.ready) return { sound: 'ready', key: `ready:${fingerprint}` };
      if (members.some(id => id !== myUserId && !old.members.includes(id))) return { sound: 'join', key: `join:${members.join('|')}` };
      return null;
    },
  };
}

/** Only a previously established connection can produce loss/recovery sounds. */
export function createConnectionAudioGate() {
  let established = false, outage = false, serial = 0, lastLoss = -Infinity;
  return {
    reset() { established = false; outage = false; },
    observe(status, visible, now) {
      if (!visible) { established = false; outage = false; return null; }
      if (status === 'ok') {
        const restored = established && outage; established = true; outage = false;
        return restored ? { sound: 'connectionRestored', serial } : null;
      }
      if (status !== 'lost' || !established || outage || now - lastLoss < 4000) return null;
      outage = true; lastLoss = now; serial++;
      return { sound: 'connectionLost', serial };
    },
  };
}
