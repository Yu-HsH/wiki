import { isProductS4Scope, productId, wikiId } from './productContract.js';

export const S5_LABELS = Object.freeze({
  lost_link:'길잃기', search:'문서 내 검색', link_index:'링크만 보기', enhancement:'강화주문서',
  weakening:'약화저주', thunder:'천둥', thief:'도둑', roulette:'룰렛', cannon:'대포',
});
export const S5_TARGET_ITEMS = new Set(['lost_link','weakening','thunder','thief','cannon']);
export const itemName = item => Object.hasOwn(S5_LABELS,item) ? S5_LABELS[item] : ({
  ink:'먹물', parry:'역링크패링', shield:'편집보호', bookmark:'책갈피',
  censor:'검열', correction:'긴급정정', undo:'되돌리기', trap:'깜짝상자',
})[item];
export const tierLabel = tier => tier === 'enhanced' ? '강화' : tier === 'weakened' ? '약화' : '';

export const isS5Scope = scope => isProductS4Scope(scope) && scope.binding.rulesVersion === 'ink-s5-test-v1' &&
  scope.binding.catalogVersion === 'ink-s5-test-v1' && scope.binding.modePolicyVersion === 'wikipedia-s5-test-v1';

const validTier = tier => ['normal','enhanced','weakened'].includes(tier);
const ensure = valid => { if (!valid) throw new Error('INVALID_S5_STATE'); };
const timestamp = text => typeof text === 'string' ? Date.parse(text) : NaN;

export function readS5State(body, self) {
  ensure(body.s5TestOnly === true && Array.isArray(body.modifiers) && Array.isArray(body.jokerOffers) &&
    typeof body.rouletteSupplyWeakened === 'boolean');
  function window(row) {
    if (row === null) return null;
    const expiresAt = body.phase2Policy && row?.draft === true && row.expiresAt === null ? Infinity : timestamp(row?.expiresAt);
    ensure(productId(row?.windowId) && row.snapshotId === self.currentSnapshotId &&
      row.progressVersion === self.progressVersion && validTier(row.tier) && (Number.isFinite(expiresAt)||(body.phase2Policy && row.draft===true && expiresAt===Infinity)));
    return { ...row, expiresAt };
  }
  const search = window(body.search);
  if (search) {
    ensure(/^[0-9a-f]{64}$/.test(search.documentHash ?? '') && [0,1,2,3].includes(search.remainingSuccesses));
    if (search.lastResult !== null) {
      const result = search.lastResult;
      const availableAt = timestamp(result?.availableAt);
      ensure(typeof result?.query === 'string' && result.query.trim() && Number.isFinite(availableAt) &&
        (result.count === null || (Number.isSafeInteger(result.count) && result.count >= (body.phase2Policy?0:1))));
      search.lastResult = { ...result, availableAt };
    }
  }
  const linkIndex = window(body.linkIndex);
  if (linkIndex) {
    ensure(Array.isArray(linkIndex.entries) && linkIndex.entries.every(link => wikiId(link?.pageId) &&
      typeof link.title === 'string' && link.title.trim() && typeof link.blocked === 'boolean' &&
      (linkIndex.tier!=='enhanced' || (typeof link.section==='string' && link.section.trim()))));
    linkIndex.entries = [...linkIndex.entries].sort((a,b) => a.title.localeCompare(b.title,'ko') || a.pageId.localeCompare(b.pageId,'ko'));
  }
  const finalModifierPolicy=body.s5ModifierPolicy==='grant-v2';
  const modifiers = body.modifiers.map(row => {
    const startsAt = timestamp(row?.startsAt), expiresAt = timestamp(row?.expiresAt);
    ensure(productId(row?.rightId) && ['enhancement','weakening'].includes(row.kind) && [1,2].includes(row.remainingCharges) &&
      Number.isFinite(startsAt) && (finalModifierPolicy
        ? row.expiresAt===null && [0,1,2].includes(row.pendingCharges) && row.pendingCharges<=row.remainingCharges
        : expiresAt>startsAt));
    return { ...row, startsAt, expiresAt:finalModifierPolicy ? null : expiresAt };
  });
  ensure(new Set(modifiers.map(row=>finalModifierPolicy ? row.rightId : row.kind)).size===modifiers.length);
  const jokerOffers = body.jokerOffers.map(offer => {
    ensure(productId(offer?.offerId) && Array.isArray(offer.candidates) && offer.candidates.length > 0 &&
      offer.candidates.length <= 2 && offer.candidates.every(candidate => productId(candidate?.candidateId) &&
        typeof itemName(candidate.itemId) === 'string' && validTier(candidate.tier)) &&
      new Set(offer.candidates.map(row => row.candidateId)).size === offer.candidates.length);
    return offer;
  });
  ensure(new Set(jokerOffers.map(row => row.offerId)).size === jokerOffers.length);
  const lastForcedMove=body.lastForcedMove??null;
  if (lastForcedMove) ensure(productId(lastForcedMove.moveId) && ['lost_link','cannon'].includes(lastForcedMove.operation) &&
    lastForcedMove.pageId===self.currentPageId && lastForcedMove.revisionId===self.currentRevisionId &&
    lastForcedMove.progressVersion===self.progressVersion);
  return { phase2Policy:body.phase2Policy===true,search,linkIndex,modifiers,jokerOffers,lastForcedMove,finalModifierPolicy,rouletteSupplyWeakened:body.rouletteSupplyWeakened };
}

export function s5Payload(operation,input,{ state,grant,eligibleTarget }) {
  const self = state.self;
  const frame = { expectedSnapshotId:self.currentSnapshotId,expectedProgressVersion:self.progressVersion };
  const inventoryVersion = { expectedInventoryVersion:self.inventoryVersion };
  if (Object.hasOwn(S5_LABELS,operation)) {
    if (!grant) throw new Error('ITEM_NOT_AVAILABLE');
    const payload = { grantId:grant.grantId,...inventoryVersion };
    if (S5_TARGET_ITEMS.has(operation)) {
      const selected = input.targetIds;
      if (!Array.isArray(selected) || selected.length !== 1 || !productId(selected[0]) || !eligibleTarget(selected[0])) {
        throw new Error('INVALID_TARGET');
      }
      payload.targetParticipantId = selected[0];
    }
    if (operation==='enhancement' && state.s5.finalModifierPolicy) {
      const eligible=state.inventory.filter(item=>item.grantId!==grant.grantId && !item.modifierKinds.includes('enhancement'));
      const selected=input.targetGrantIds;
      const count=Math.min(grant.effectiveTier==='enhanced'?2:1,eligible.length);
      if (!Array.isArray(selected) || selected.length!==count || new Set(selected).size!==count ||
        !selected.every(id=>eligible.some(item=>item.grantId===id))) throw new Error('INVALID_MODIFIER_SELECTION');
      payload.targetGrantIds=selected;
    }
    return operation === 'search' || operation === 'link_index' ? { ...payload,...frame } : payload;
  }
  if (['reward_claim','reward_discard'].includes(operation) && state.s5.phase2Policy) {
    const head=state.s5.jokerOffers.flatMap(o=>o.candidates).sort((a,b)=>a.sequence-b.sequence)[0];
    if(!head || input.candidateId!==head.candidateId)throw new Error('REWARD_FIFO_REQUIRED');
    const payload={candidateId:head.candidateId};
    if(operation==='reward_claim'){
      payload.expectedInventoryVersion=self.inventoryVersion;
      if(input.replaceGrantId){if(!state.inventory.some(g=>g.grantId===input.replaceGrantId))throw new Error('ITEM_NOT_AVAILABLE');payload.replaceGrantId=input.replaceGrantId;}
    }return payload;
  }
  if (operation === 'search_execute') {
    const search = state.s5.search;
    if (!search || input.windowId !== search.windowId || !search.remainingSuccesses) throw new Error('SEARCH_NOT_AVAILABLE');
    if (typeof input.query !== 'string' || !input.query.trim() || input.query.length > 4096) throw new Error('INVALID_SEARCH_QUERY');
    return { windowId:search.windowId,query:input.query,expectedDocumentHash:search.documentHash,...frame };
  }
  if (operation === 'joker_claim') {
    const offer = state.s5.jokerOffers.find(row => row.offerId === input.offerId);
    const selected = input.candidateIds;
    if (!offer || !Array.isArray(selected) || selected.length < 1 || selected.length > 2 ||
        selected.length > 2-state.inventory.length || new Set(selected).size !== selected.length ||
        !selected.every(id => offer.candidates.some(candidate => candidate.candidateId === id))) throw new Error('OFFER_NOT_AVAILABLE');
    return { offerId:offer.offerId,candidateIds:[...selected],...inventoryVersion };
  }
  throw new Error('UNSUPPORTED_OPERATION');
}
