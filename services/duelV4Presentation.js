import { finalMovementSignal, finalReceiptSignal, finalResultSignal } from '../components/group-items-jungle/finalAssetEvents.js';
import { createFinalAssetPresentation } from '../components/group-items-jungle/finalAssetPresentation.js';
import { itemName } from '../components/group-items-jungle/s5UiContract.js';

export const V4_PARRY_WINDOW_MS = 2000;
const resultWindowMs = 2500;
const noticeMs = 4800;
export const effectTime = value => value === 'infinity' ? Infinity : Date.parse(value);
export const activeV4Effects = (effects, now) => (effects ?? []).filter(effect =>
  effectTime(effect.startsAt) <= now && now < effectTime(effect.expiresAt));

export function appendDuelV4Notice(previous, notice, now) {
  const settled = notice.settlesItem && previous.find(entry => entry.pendingItem === notice.settlesItem && entry.until > now);
  return [...previous.filter(entry => entry !== settled && entry.until > now).slice(-2), notice];
}

export const effectLabels = {
  ink: '먹물', shield: '편집보호', censor: '링크 검열', stun: '감전', thunder_seal: '아이템 봉인',
  trap_stun: '함정으로 이동 제한', trap_seal: '함정으로 링크 봉인', cannon_stun: '차원 대포로 이동 제한',
  link_index: '링크만 보기',
};

// Normalize the v4 receipt vocabulary to the existing final S5 cues.
const receiptCues = {
  SHIELD_ACTIVE: ['protect', 'PROTECTION_ACTIVE'],
  BOOKMARK_SAVED: ['bookmark_install', 'BOOKMARK_INSTALLED'],
  BOOKMARK_RETURNED: ['bookmark_return', 'MOVED', { moveId: true }],
  UNDONE: ['undo', 'MOVED', { moveId: true }],
  EFFECT_CLEARED: ['correction', 'CORRECTION_APPLIED', { closedEffectId: true }],
  LINK_INDEX_OPEN: ['link_index', 'LINK_INDEX_ACTIVE'],
  ITEM_ENHANCED: ['enhancement', 'ENHANCEMENT_ACTIVE'],
  ITEM_WEAKENED: ['weakening', 'WEAKENING_APPLIED'],
  THUNDER_SELF_STUN: ['thunder', 'THUNDER_SELF_STUN'],
  THUNDER_SELF_PENALTY: ['thunder', 'THUNDER_SELF_PENALTY'],
  THIEF_NO_TRANSFERABLE_GRANT: ['thief', 'THIEF_NO_TRANSFERABLE_GRANT'],
  THIEF_EMPTY: ['thief', 'THIEF_NO_TRANSFERABLE_GRANT'],
  THIEF_STOLEN: ['thief', 'THIEF_RESOLVED', { success: true }],
  ROULETTE_FAILED: ['roulette', 'ROULETTE_RESOLVED', { success: false }],
  ROULETTE_WON: ['roulette', 'ROULETTE_RESOLVED', { success: true }],
  ROULETTE_BOOSTED: ['roulette', 'ROULETTE_RESOLVED', { success: true, automaticChild: true }],
  TRAP_INSTALLED: ['trap_install', 'TRAP_INSTALLED', { trapId: true }],
  TRAP_STOPPED: ['normal_link', 'TRAP_STOPPED'],
  TRAP_ARRIVAL: ['normal_link', 'MOVED', { trapOutcome: 'arrival', stunEventSeq: true }],
  CANNON_LANDED: ['cannon', 'CANNON_RESOLVED', { success: true }],
  CANNON_RETURNED: ['cannon', 'CANNON_RESOLVED', { success: false }],
  SEARCH_SUBMITTED: ['search', 'SEARCH_ACTIVE'],
};

const receiptMessages = {
  SHIELD_ACTIVE: '편집보호 사용', BOOKMARK_SAVED: '경로 책갈피 저장', BOOKMARK_RETURNED: '책갈피 문서로 복귀',
  UNDONE: '되돌리기 성공', EFFECT_CLEARED: '긴급 정정 성공 · 효과 해제', LINK_INDEX_OPEN: '링크 목록 열림',
  ITEM_ENHANCED: '강화 주문서 적용', ITEM_WEAKENED: '상대 아이템 약화 적용', THIEF_STOLEN: '도둑의 손 성공 · 아이템 획득',
  THIEF_EMPTY: '도둑의 손 실패 · 아이템 소모', TRAP_INSTALLED: '깜짝상자 설치 완료', TRAP_STOPPED: '깜짝상자 적중 · 이동 차단',
  TRAP_ARRIVAL: '깜짝상자 적중 · 도착 뒤 이동 제한', CANNON_LANDED: '차원 대포 성공 · 상대 문서 도착',
  CANNON_RETURNED: '차원 대포 실패 · 시작 문서로 복귀', ROULETTE_FAILED: '혼돈 룰렛 실패 · 다음 보급 약화',
  ROULETTE_WON: '혼돈 룰렛 성공 · 보상 확인', ROULETTE_BOOSTED: '혼돈 룰렛 강화 성공 · 보상 확인',
  THUNDER_SELF_STUN: '천둥 심판 실패 · 자신이 감전', THUNDER_SELF_PENALTY: '천둥 심판 실패 · 자신에게 페널티',
  SEARCH_OPENED: '문서 검색 열림 · 첫 검색 때 소모', SEARCH_SUBMITTED: '문서 검색 완료',
};

const failedReceipts = new Set(['ITEM_CHANCE_FAILED', 'THIEF_EMPTY', 'ROULETTE_FAILED', 'THUNDER_SELF_PENALTY', 'THUNDER_SELF_STUN', 'CANNON_RETURNED']);

export function duelV4AttackFeedback(row, userId) {
  const attacker = row.actor_id === userId;
  if (!attacker && row.target_id !== userId) return null;
  const name = itemName(row.item_id);
  const result = {
    itemId: row.item_id, sourceParticipantId: row.actor_id, targetParticipantId: row.target_id,
    outcome: row.outcome === 'reflected_blocked' ? 'reflection_blocked' : row.outcome,
    defenseKind: ['blocked', 'reflected_blocked'].includes(row.outcome) ? 'protection' : null,
  };
  const parry = outcome => finalReceiptSignal({ receiptId: row.id, operation: 'parry', code: 'PARRY_ACCEPTED', outcome }, row.item_id);
  const protection = finalResultSignal(result, row.outcome === 'reflected_blocked' ? row.actor_id : row.target_id);
  switch (row.outcome) {
    case 'hit': return { tone: attacker ? 'hit' : 'danger', text: `${name} ${attacker ? '적중' : '피격'}`,
      cue: attacker ? null : finalResultSignal(result, userId) };
    case 'blocked': return { tone: 'guard', text: `${name} ${attacker ? '차단됨 · 상대 편집보호' : '차단 성공 · 편집보호 소모'}`, cue: protection };
    case 'parried_blocked': return { tone: 'guard', text: `${name} ${attacker ? '차단됨 · 상대 패링' : '차단 성공 · 패링'}`, cue: parry('blocked') };
    case 'reflected': return { tone: 'reflect', text: `${name} ${attacker ? '반사당함 · 상대 패링' : '반사 성공 · 패링'}`, cue: parry('reflected') };
    case 'reflected_blocked': return { tone: 'guard', text: `${name} ${attacker ? '반사됨 · 편집보호로 차단' : '반사됨 · 상대 편집보호로 차단'}`,
      cue: attacker ? protection : parry('reflection_blocked') };
    case 'no_censor_candidates':
    case 'void_ineligible': return { tone: 'fail', text: `${name} 효과 불발 · ${attacker ? '적중 조건 미충족' : '공격이 적용되지 않음'}` };
    default: return null;
  }
}

export function createDuelV4Presentation(getAudio, onNotice, clock = Date.now) {
  const final = createFinalAssetPresentation({}, getAudio, clock);
  const seen = new Set();
  const claim = key => {
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  };
  let initialServerTime = null;
  let previousState;
  let pendingMovement;
  const liveInk = new Set();

  function show(key, event) {
    if (!event) return;
    final.playCue(key, event.cue);
    if (event.text) onNotice({ key, text: event.text, tone: event.tone, pendingItem: event.pendingItem,
      settlesItem: event.settlesItem, until: clock() + noticeMs });
  }

  return {
    scene: final.currentScene,
    isLiveInk: id => liveInk.has(id),
    stop: final.stop,
    receipt(request, result, next) {
      if (!claim(`receipt:${request.id}`)) return;
      const { code } = result;
      if (code === 'ATTACK_WARNING') {
        const pending = clock() - request.sentAt < V4_PARRY_WINDOW_MS;
        show(request.id, { tone: 'use', pendingItem: pending ? request.itemId : null,
          text: `${itemName(request.itemId)} 사용${pending ? ' · 적중 판정 대기' : ''}` });
        return;
      }
      // Final parry cues come from attackResults for both clients, not from the defender's receipt.
      if (code === 'PARRY_TARGET_CHANGED') {
        show(request.id, { tone: 'fail', text: '패링 효과 불발 · 반사 대상이 바뀌었거나 적용할 수 없습니다.' });
        return;
      }
      const mapped = code === 'ITEM_CHANCE_FAILED' && request.itemId === 'correction'
        ? ['correction', 'CORRECTION_CHANCE_FAILED'] : receiptCues[code];
      let cue;
      if (mapped && (code !== 'SEARCH_SUBMITTED' || claim(`search:${request.input.windowId}`))) {
        const [operation, sharedCode, fields] = mapped;
        const received = code === 'THIEF_STOLEN' ? next?.inventory.find(item => item.slot === request.slot) : null;
        cue = finalReceiptSignal({ receiptId: request.id, operation, code: sharedCode, ...fields,
          transferredItemId: received?.itemId, receivedTier: received?.tier });
        if (code === 'THIEF_EMPTY') cue = { ...cue, label: '훔치기 실패' };
      }
      const arrived = next?.players.find(player => player.id === next.selfId);
      if (code === 'CANNON_LANDED' && arrived) pendingMovement = { after: clock() + 800, key: request.id,
        progress: arrived.progressVersion, operation: 'cannon' };
      show(request.id, { cue, text: receiptMessages[code], tone: failedReceipts.has(code) ? 'fail' : 'use' });
    },
    observe(state, now, userId) {
      const serverAt = effectTime(state.serverTime);
      const recovered = initialServerTime === null;
      if (recovered) {
        initialServerTime = serverAt;
        if (state.search?.lastResult) claim(`search:${state.search.id}`);
      }
      if (state.finishedAt) {
        pendingMovement = null;
        final.stop();
        return;
      }
      const self = state.players.find(player => player.id === userId);
      const playMovement = (key, operation) => {
        const player = { currentPageId: self?.page?.pageId, currentRevisionId: self?.page?.revisionId,
          progressVersion: self?.progressVersion };
        if (player.currentPageId) final.playCue(key, finalMovementSignal({ moveId: key, operation,
          pageId: player.currentPageId, revisionId: player.currentRevisionId, progressVersion: player.progressVersion }, player));
      };
      const previousSelf = previousState?.players.find(player => player.id === userId);
      if (pendingMovement && clock() >= pendingMovement.after) {
        if (pendingMovement.progress === self?.progressVersion) playMovement(`${pendingMovement.key}:arrival`, pendingMovement.operation);
        pendingMovement = null;
      }

      const effects = activeV4Effects(state.effects, now);
      for (const warning of state.warnings ?? []) {
        if (claim(`warning:${warning.id}`) && !recovered && warning.itemId === 'lost_link' && effectTime(warning.dueAt) > now) {
          final.playCue(warning.id, { asset: 'lost_way/activate' });
        }
      }
      for (const effect of effects) {
        if (effect.kind === 'ink' && claim(`ink:${effect.id}`) && !recovered &&
            effectTime(effect.startsAt) > initialServerTime && now - effectTime(effect.startsAt) < 900) {
          liveInk.add(effect.id);
          final.playPulse({ type: 'ink_pulse', pulseIndex: 0 });
        }
      }
      for (const row of state.attackResults ?? []) {
        if (!claim(`attack:${row.id}`) || recovered) continue;
        const resolved = effectTime(row.resolved_at);
        if (resolved <= initialServerTime) continue;
        const event = duelV4AttackFeedback(row, userId);
        const live = now - resolved < resultWindowMs;
        if (event) show(row.id, { ...event, cue: live ? event.cue : null, settlesItem: row.actor_id === userId ? row.item_id : null });
        if (!live) continue;
        if (row.item_id === 'lost_link' && row.outcome === 'hit' && row.target_id === userId) playMovement(row.id, 'lost_link');
        if (row.item_id === 'lost_link' && row.outcome === 'reflected' && row.actor_id === userId && self) {
          pendingMovement = { after: clock() + 1800, key: row.id, progress: self.progressVersion, operation: 'lost_link' };
        }
      }
      if (previousSelf?.progressVersion === self?.progressVersion &&
          !state.effects?.some(effect => effect.kind === 'censor' && effectTime(effect.expiresAt) > now)) {
        const ended = previousState?.effects?.find(effect => effect.kind === 'censor' && effectTime(effect.expiresAt) <= now &&
          now - effectTime(effect.expiresAt) < resultWindowMs && claim(`expiry:${effect.id}`));
        if (ended) show(`censor-release:${ended.id}`, { cue: { kind: 'censor-release', asset: 'link_censor/release' } });
      }
      if (previousState !== state) {
        const weakened = state.inventory.some(item => item.weakened && previousState?.inventory.some(old => old.id === item.id && !old.weakened));
        if (weakened && !state.rouletteSupplyWeakened) show(`weakening:${state.version}`, { tone: 'danger', text: '내 아이템 약화',
          cue: finalReceiptSignal({ receiptId: state.version, operation: 'weakening', code: 'WEAKENING_APPLIED' }) });
        previousState = state;
      }
    },
  };
}
