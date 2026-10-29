import { getDuelItem } from '../data/duelItems.js';

export const DUEL_FEEDBACK_MS = 650;
export const DUEL_NOTICE_MS = 2500;
export const DUEL_FEEDBACK_MAX_AGE_MS = 1500;
const MOTIFS = Object.freeze({
  blind: 'ink', link_censorship: 'seal', random_link_move: 'move',
  cleanse_shield: 'shield', backlink_reflect: 'reflect', go_back: 'return',
  random_teleport: 'compass', history_rewind: 'rewind',
  search_once: 'search', link_preview: 'preview', link_index: 'index',
});

// A notification proves an outcome, never a new local gameplay mutation.
export function describeDuelFeedback(event, { userId, opponentId, own = false, grantId = null } = {}) {
  const item = getDuelItem(event?.itemId);
  if (!item || item.disabled || !userId || !event.itemEventId
    || !['applied', 'blocked', 'reflected', 'void'].includes(event.result)) return null;
  const actor = event.actorUserId === userId;
  const fromOpponent = !!opponentId && event.actorUserId === opponentId;
  const target = event.targetUserId === userId;
  if (own && !actor) return null;
  let kind, label, tone;
  if (actor) {
    if (item.role === 'attack' && event.result === 'reflected' && target) {
      kind = 'hit'; label = '반사되어 피격'; tone = 'coral';
    } else {
      kind = event.result === 'void' ? 'void' : 'use';
      label = event.result === 'blocked' ? '사용 · 상대가 차단'
        : event.result === 'void' ? '사용 · 효과 없음'
        : item.role === 'defense' && item.duration > 0 ? '방어 준비'
        : item.role === 'defense' ? '되돌리기 적용'
        : item.role === 'attack' ? '공격 적용' : '사용 적용';
      tone = event.result === 'void' ? 'blue' : item.role === 'defense' ? 'teal' : item.role === 'attack' ? 'coral' : 'blue';
    }
  } else if (fromOpponent && item.role === 'attack') {
    if (event.result === 'blocked' && target) {
      kind = 'block'; label = '방어 성공'; tone = 'teal';
    } else if (event.result === 'reflected' && event.targetUserId === opponentId) {
      // The server changes the target to the attacker on reflection.
      kind = 'reflect'; label = '반사 성공'; tone = 'teal';
    } else if (event.result === 'applied' && target) {
      kind = 'hit'; label = '피격'; tone = 'coral';
    }
  } else if (fromOpponent && event.itemId === 'history_rewind'
    && event.result === 'applied' && event.metadata?.rewoundUserIds?.includes(userId)) {
    kind = 'hit'; label = '역사 되감기 적용'; tone = 'coral';
  }
  if (!kind) return null;
  const headline = kind === 'block' ? '편집 보호로 공격 차단'
    : kind === 'reflect' ? '역링크 반사 성공'
    : kind === 'hit' ? event.result === 'reflected' ? `${item.name} 반사 피격`
      : item.id === 'random_link_move' ? '잘못된 링크로 강제 이동'
      : item.id === 'history_rewind' ? '역사 되감기로 이동' : `${item.name}에 피격`
    : event.result === 'blocked' ? `${item.name} 사용 · 상대가 차단`
    : event.result === 'void' ? `${item.name} · 효과 없음`
    : item.role === 'defense' && item.duration > 0 ? `${item.name} 준비`
    : item.id === 'go_back' ? '되돌리기로 이동'
    : item.id === 'random_teleport' ? '임의 문서로 이동'
    : item.id === 'history_rewind' && event.metadata?.rewoundUserIds?.includes(userId) ? '역사 되감기로 이동'
    : `${item.name} 사용`;
  const detail = kind === 'block' || kind === 'reflect' ? `상대 ${item.name}`
    : actor && kind === 'hit' ? '내 공격이 반사됨'
    : actor ? '내 아이템' : '상대 아이템';
  const moved = ['applied', 'reflected'].includes(event.result) && (
    item.id === 'history_rewind' ? event.metadata?.rewoundUserIds?.includes(userId)
      : ['random_link_move', 'go_back', 'random_teleport'].includes(item.id) && target);
  return { id: event.itemEventId, itemId: item.id, name: item.name, kind, label, headline, detail, tone,
    motif: kind === 'block' ? 'shield' : kind === 'reflect' ? 'reflect' : MOTIFS[item.id],
    articleMotion: moved ? MOTIFS[item.id] : null,
    grantId: own ? grantId : null, effectExpiresAt: event.effectExpiresAt,
    serverTimestamp: event.serverTimestamp };
}

// Only accepted, confirmed events enter this in-memory journal. Failures have no event ID.
export function appendDuelRecent(previous, cue) {
  return [...previous.filter(c => c.id !== cue.id), cue]
    .sort((a,b) => a.serverTimestamp - b.serverTimestamp).slice(-3);
}

export function selectDuelNotice(notices) {
  // A confirmed newer use must not wait for an older hit's 2.5s timer.
  // Preserve outcome priority only when the server timestamps are identical.
  const important = cue => ['hit','block','reflect','failure'].includes(cue.kind);
  return notices.reduce((latest,cue) => !latest || cue.serverTimestamp > latest.serverTimestamp
    || (cue.serverTimestamp === latest.serverTimestamp && (!important(latest) || important(cue)))
    ? cue : latest, null);
}

// Never evict/replay an old identity. The cap fails closed for animation only.
export function createDuelFeedbackGate(mountedAt) {
  const seen = new Set();
  let visibleSince = mountedAt;
  return {
    resume(now) { visibleSince = now; },
    accept(cue, { now, visible, skewMs = 0 }) {
      if (!cue?.id || seen.has(cue.id) || seen.size >= 256) return false;
      seen.add(cue.id);
      const at = cue.serverTimestamp - (skewMs ?? 0);
      if (!visible || !Number.isFinite(cue.serverTimestamp) || at < visibleSince
        || now - at > DUEL_FEEDBACK_MAX_AGE_MS || at > now + 250) return false;
      if (cue.kind === 'hit' && cue.effectExpiresAt != null && cue.effectExpiresAt <= now) return false;
      return true;
    },
  };
}

export function selectLiveBlindExpiry(effects, now) {
  const deadlines = (effects || []).filter(e => e.itemId === 'blind' && Number.isFinite(e.expiresAt) && e.expiresAt > now).map(e => e.expiresAt);
  return deadlines.length ? Math.max(...deadlines) : null;
}
