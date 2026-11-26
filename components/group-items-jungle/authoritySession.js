import { isProductS4Scope, PRODUCT_NAMESPACE, PRODUCT_PROTOCOL, productId, wikiId } from "./productContract.js";

import { isS5Scope, itemName, readS5State, s5Payload, S5_LABELS, S5_TARGET_ITEMS, tierLabel } from './s5UiContract.js';

const BINDING_KEYS = ["namespace","schemaVersion","rulesVersion","catalogVersion","modePolicyVersion","policyDigest"];
const label = { ink:"먹물", parry:"역링크패링", shield:"편집보호", bookmark:"책갈피" };
const action = { ink:"attack", parry:"parry", shield:"protect", bookmark:"bookmark_install" };
const s4Label = { censor:"검열", correction:"긴급정정", undo:"되돌리기", trap:"깜짝상자" };
const s4Action = { censor:"censor", correction:"correction", undo:"undo", trap:"trap_options" };
const s4Sessions = new Set(["a3500000-0000-4000-9000-000000009801","a3500000-0000-4000-9000-000000009802"]);
const value = x => typeof x === "string" && x.length > 0;
const version = x => typeof x === "string" && /^(0|[1-9][0-9]{0,18})$/.test(x);
const time = x => typeof x === "string" ? Date.parse(x) : NaN;
const bindingMatches = (a,b) => BINDING_KEYS.every(key => value(a?.[key]) && a[key] === b?.[key]);
const requireValue = (condition,code) => { if (!condition) throw new Error(code); };

export function s4CensoredPageIds(effects, authorityAt) {
  return [...new Set(effects.flatMap(effect => {
    if (!Number.isFinite(authorityAt) || authorityAt < effect.startsAt || authorityAt >= effect.expiresAt) return [];
    if (effect.kind === "trap_seal" && wikiId(effect.destinationPageId)) return [effect.destinationPageId];
    if (effect.kind !== "censor") return [];
    return effect.phase2At !== null && authorityAt >= effect.phase2At ? effect.phase2 : effect.phase1;
  }))];
}

export function isS4JungleScope(scope) {
  return scope?.protocol === "s4-test-v2" && s4Sessions.has(scope.sessionId) &&
    scope.binding?.namespace === "ink-s4-isolated" && scope.binding.catalogVersion === "ink-s4-first-effects-test-v1" &&
    scope.binding.policyDigest === "60c453a6e27af7bb316c722e27173cfc25b40e5e419338e49ad31d8ac491a689";
}

export const hasS4Effects = scope => isS4JungleScope(scope) || isProductS4Scope(scope);

export function selectGroupItemRoute(room, supported) {
  if (room?.mode === "group") return "ordinary";
  if ((room?.protocol === "s4-test-v2" || room?.binding?.namespace === "ink-s4-isolated") && !isS4JungleScope(room)) {
    return "unsupported";
  }
  if ((room?.protocol === PRODUCT_PROTOCOL || room?.binding?.namespace === PRODUCT_NAMESPACE) && !isProductS4Scope(room)) {
    return "unsupported";
  }
  return room?.mode === "group_items" && value(supported?.protocol) && room.protocol === supported.protocol &&
    bindingMatches(room.binding,supported.binding) ? "item-group" : "unsupported";
}

export function sameGroupItemsScope(a,b) {
  return ["actorId","sessionId","participantId","ownerEpoch","protocol"].every(key => value(a?.[key]) && a[key] === b?.[key]) &&
    version(a.ownerEpoch) && bindingMatches(a.binding,b.binding);
}

function decodeState(body,scope,elapsed) {
  requireValue(body?.ok && body.sessionId === scope.sessionId && bindingMatches(body.binding,scope.binding),"STATE_SCOPE_MISMATCH");
  const product = isProductS4Scope(scope);
  requireValue(!product || body.testOnly === false,"INVALID_GROUP_ITEM_STATE");
  const presentationScope = { ...scope, bindingDigest: scope.binding.policyDigest };
  if (body.code === "SESSION_TERMINAL" && body.readOnly === true && body.canAct === false) {
    return { terminal: true, presentation: { scope:presentationScope, interaction:"read_only", serverObservedAt:null,
      projection: { kind:"finished", inventory:[], targetOptions:[], warnings:[], effects:[], results:[] } } };
  }
  const self = body.self;
  const s4 = hasS4Effects(scope);
  const s5 = isS5Scope(scope);
  requireValue(!isS4JungleScope(scope) || body.testOnly === true,"INVALID_GROUP_ITEM_STATE");
  requireValue(body.code === "STATE" && body.canAct === true && body.readOnly === false && body.delivery === "state_only" &&
    body.lifecycleState === "playing" && self?.status === "playing" && self.participantId === scope.participantId &&
    self.ownerEpoch === scope.ownerEpoch && [body.stateRevision,self.recipientEventSeq,self.inventoryVersion,self.progressVersion].every(version) &&
    value(self.currentPageId) && value(self.currentRevisionId) && Number.isFinite(time(body.serverObservedAt)) &&
    [body.inventory,body.targets,body.warnings,body.effects,body.results].every(Array.isArray),"INVALID_GROUP_ITEM_STATE");
  requireValue(!product || (wikiId(self.currentPageId) && wikiId(self.currentRevisionId) && productId(self.currentSnapshotId)),"INVALID_WIKI_FRAME");
  const s5State = s5 ? readS5State(body,self) : null;
  const inventory = body.inventory.map(row => {
    requireValue(value(row.grantId) && [0,1].includes(row.slotIndex),"INVALID_GRANT");
    if (s5State?.finalModifierPolicy) requireValue(['normal','enhanced','weakened'].includes(row.effectiveTier) &&
      Array.isArray(row.modifierKinds) && new Set(row.modifierKinds).size===row.modifierKinds.length &&
      row.modifierKinds.every(kind=>['enhancement','weakening'].includes(kind)),"INVALID_MODIFIER_GRANT");
    const grade = s5 ? tierLabel(s5State.finalModifierPolicy ? row.effectiveTier : row.baseTier) : '';
    const displayLabel = name => grade ? grade + ' ' + name : name;
    if (Object.hasOwn(action,row.itemId)) return { ...row, action:action[row.itemId], label:displayLabel(label[row.itemId]), canSelect:true };
    if (s5 && Object.hasOwn(S5_LABELS,row.itemId)) {
      const requiresTarget = S5_TARGET_ITEMS.has(row.itemId);
      return { ...row, action:row.itemId, label:displayLabel(S5_LABELS[row.itemId]), canSelect:true,
        requiresTarget, targetLimit:requiresTarget ? 1 : 0 };
    }
    requireValue(s4 && Object.hasOwn(s4Action,row.itemId),"INVALID_GRANT");
    const requiresTarget = row.itemId === "censor" || row.itemId === "trap";
    return { ...row, action:s4Action[row.itemId], label:displayLabel(s4Label[row.itemId]), canSelect:true,
      requiresTarget, targetLimit:requiresTarget ? 1 : 0 };
  });
  requireValue(new Set(inventory.map(row=>row.slotIndex)).size === inventory.length &&
    new Set(inventory.map(row=>row.grantId)).size === inventory.length,"INVALID_INVENTORY");
  const warnings = body.warnings.map(row => {
    requireValue(value(row.childId) && Number.isFinite(time(row.dueAt)) && typeof row.canParry === "boolean" &&
      row.status === "pending" && (!row.canParry || inventory.some(item=>item.itemId === "parry" && item.grantId === row.parryGrantId)),"INVALID_WARNING");
    return { ...row, dueAt:time(row.dueAt), ...(s5 ? { itemName:itemName(row.itemId) } : {}) };
  });
  const effects = body.effects.map(row => {
    requireValue(value(row.effectId) && row.kind === "ink" && ["normal","enhanced","weakened"].includes(row.tier) &&
      Number.isFinite(time(row.startsAt)) && time(row.expiresAt)>time(row.startsAt) &&
      [1,2,3].includes(row.visiblePulseCount),"INVALID_EFFECT");
    return { ...row, startsAt:time(row.startsAt), expiresAt:time(row.expiresAt) };
  });
  requireValue(!s4 || (Array.isArray(body.itemEffects) && typeof body.trapArmed === "boolean"),"INVALID_S4_EFFECT_STATE");
  const itemEffects = s4 ? body.itemEffects.map(row => {
    const startsAt = time(row?.startsAt), expiresAt = time(row?.expiresAt);
    requireValue(value(row?.effectId) && (["censor","stun","trap_seal","correction_protection"].includes(row.kind) || (s5 && row.kind === "thunder_seal")) &&
      Number.isFinite(startsAt) && expiresAt > startsAt,"INVALID_S4_EFFECT");
    if (s5 && row.kind === "trap_seal") {
      const destinationPageId = row.payload?.destinationPageId;
      requireValue(row.payload?.source === 'trap' && wikiId(destinationPageId),'INVALID_S5_EFFECT');
      return { effectId:row.effectId,kind:row.kind,source:'trap',startsAt,expiresAt,destinationPageId };
    }
    if (row.kind === "thunder_seal") {
      const sealAt = time(row.payload?.sealStartsAt);
      requireValue(row.payload?.source === 'thunder' && sealAt >= startsAt && sealAt < expiresAt,'INVALID_S5_EFFECT');
      return { effectId:row.effectId,kind:row.kind,source:'thunder',startsAt:sealAt,expiresAt };
    }
    if (row.kind !== "censor") return { effectId:row.effectId, kind:row.kind, startsAt, expiresAt,
      ...(s5 && ['thunder','cannon'].includes(row.payload?.source) ? { source:row.payload.source } : {}) };
    const {phase1,phase2,phase2At} = row.payload ?? {};
    const switchAt = phase2At == null ? null : time(phase2At);
    requireValue(Array.isArray(phase1) && phase1.every(value) &&
      (switchAt === null || (switchAt > startsAt && switchAt < expiresAt && Array.isArray(phase2) && phase2.every(value))),
      "INVALID_CENSOR_PHASE");
    return { effectId:row.effectId, kind:row.kind, startsAt, expiresAt, phase1:[...phase1], phase2At:switchAt, phase2:switchAt === null ? [] : [...phase2] };
  }) : [];
  const targets = body.targets.map((row,index) => {
    requireValue(value(row.participantId) && row.participantId !== scope.participantId && typeof row.eligible === "boolean","INVALID_TARGET");
    return { ...row, displayName:value(row.displayName) ? row.displayName : "상대 "+(index+1) };
  });
  const bookmark = body.bookmark;
  requireValue(bookmark === null || (value(bookmark?.rightId) && value(bookmark.pageId) && value(bookmark.revisionId) &&
    Number.isSafeInteger(bookmark.remainingNormalMoves) && bookmark.remainingNormalMoves >= 0),"INVALID_BOOKMARK");
  const protection = body.protection;
  const protectionEnds = s5 && protection?.expiresAt==='infinity' ? Infinity : time(protection?.expiresAt);
  requireValue(protection === null || (value(protection?.rightId) && Number.isFinite(time(protection.startsAt)) &&
    protectionEnds>time(protection.startsAt)),"INVALID_PROTECTION");
  const supply = body.supply;
  requireValue(supply === null || (version(supply?.lastClosedRound) && version(supply.round) &&
    ["granted","discarded_full"].includes(supply.outcome) && Number.isFinite(time(supply.logicalDueAt)) &&
    (supply.grantId==null || productId(supply.grantId))),"INVALID_SUPPLY");
  const itemFeedback = body.itemFeedback ?? [];
  requireValue(Array.isArray(itemFeedback) && itemFeedback.every(event=>value(event?.id) &&
    ['item_stolen','trap_triggered'].includes(event.kind) && typeof itemName(event.itemId)==='string' &&
    ['normal','enhanced','weakened'].includes(event.tier) && Number.isFinite(time(event.at)) &&
    (event.kind==='item_stolen' ? event.outcome==='transferred' : ['triggered','blocked'].includes(event.outcome))),
    "INVALID_RECIPIENT_FEEDBACK");
  const move = body.lastForcedMove;
  const lastForcedMove = s5 && ['lost_link','cannon'].includes(move?.operation) && value(move.moveId) &&
    move.pageId === self.currentPageId && move.revisionId === self.currentRevisionId && move.progressVersion === self.progressVersion ? move : null;
  return { terminal:false, self, inventory, warnings, targets, bookmark, supply, itemEffects, itemFeedback, s5:s5State, lastForcedMove, trapArmed:s4 && body.trapArmed,
    presentation:{ scope:presentationScope, interaction:"group_items", self, stateRevision:BigInt(body.stateRevision),
      recipientEventSeq:BigInt(self.recipientEventSeq), serverObservedAt:time(body.serverObservedAt), transportElapsedMs:elapsed,
      inventoryVersion:self.inventoryVersion,
      projection:{ kind:"playing", inventory, targetOptions:targets, warnings, effects, results:body.results,
        protection:protection ? { ...protection, startsAt:time(protection.startsAt), expiresAt:protectionEnds, remainingCharges:1 } : null } } };
}

export function createGroupItemsSession({ scope, transport, journal, makeRequestId = () => crypto.randomUUID(), now = () => performance.now() }) {
  scope = Object.freeze({ ...scope, binding:Object.freeze({ ...scope.binding }) });
  requireValue(sameGroupItemsScope(scope,scope),"INVALID_SCOPE");
  let current, closed = false;
  const pending = new Set();
  const uncertain = new Map();
  const unresolvedAfterReload = new Set();
  let trapOptions;
  const journalKey = JSON.stringify([scope.actorId,scope.sessionId,scope.participantId,scope.ownerEpoch,scope.protocol,...BINDING_KEYS.map(key=>scope.binding[key])]);
  const snapshot = () => current;
  function check(reply) {
    requireValue(!closed && sameGroupItemsScope(reply?.scope,scope),"TRANSPORT_SCOPE_MISMATCH");
    return reply.body;
  }
  async function refresh() {
    requireValue(!closed,"SESSION_CLOSED");
    const started = now();
    const reply = await transport.state(scope);
    const next = decodeState(check(reply),scope,Math.max(0,now()-started));
    if (current?.terminal || (current && !next.terminal && (
      next.presentation.stateRevision < current.presentation.stateRevision ||
      next.presentation.recipientEventSeq < current.presentation.recipientEventSeq ||
      next.presentation.serverObservedAt < current.presentation.serverObservedAt))) return current;
    current = next;
    return current;
  }
  function receipt(body,requestId) {
    if (body?.code === "REQUEST_NOT_OBSERVED") return null;
    requireValue(body?.requestId === requestId && value(body.receiptId) && value(body.code),"RECEIPT_SCOPE_MISMATCH");
    journal.remove(journalKey,requestId);
    unresolvedAfterReload.delete(requestId);
    return body;
  }
  async function lookup(requestId) {
    requireValue(!closed && value(requestId),"SESSION_CLOSED");
    return receipt(check(await transport.receipt(scope,requestId)),requestId);
  }
  async function recover() {
    await refresh();
    const ids = journal.list(journalKey);
    const restored = await Promise.all(ids.map(lookup));
    for (const [index, result] of restored.entries()) if (!result) unresolvedAfterReload.add(ids[index]);
    return restored;
  }
  const retransmittedReceipts = new WeakSet();
  async function dispatch(operation,input={}) {
    requireValue(!closed && current && !current.terminal,"SESSION_READ_ONLY");
    const { self, inventory, warnings, targets, bookmark } = current;
    const inv = self.inventoryVersion, prog = self.progressVersion;
    const grantAction = operation === "trap_install" ? "trap_options" : operation;
    const grant = inventory.find(row=>row.grantId === input.grantId && row.action === grantAction);
    const eligibleTarget = id => targets.some(row=>row.participantId===id && row.eligible);
    let payload;
    switch(operation) {
      case "normal_link":
        requireValue(value(input.targetPageId) && input.pageId === self.currentPageId && input.revisionId === self.currentRevisionId,"STALE_DOCUMENT");
        payload = { expectedProgressVersion:prog, expectedPageId:self.currentPageId, expectedRevisionId:self.currentRevisionId, targetPageId:input.targetPageId };
        if (isProductS4Scope(scope)) {
          requireValue(input.snapshotId === self.currentSnapshotId && wikiId(input.targetPageId),"STALE_DOCUMENT");
          payload.expectedSnapshotId = self.currentSnapshotId;
        }
        break;
      case "parry": {
        const warning = warnings.find(row=>row.childId===input.childId && row.canParry);
        requireValue(warning,"PARRY_NOT_AVAILABLE");
        payload = { grantId:warning.parryGrantId, childId:warning.childId };
        break;
      }
      case "bookmark_return":
        requireValue(bookmark && bookmark.rightId === input.rightId && bookmark.pageId !== self.currentPageId,"BOOKMARK_NOT_AVAILABLE");
        payload = { rightId:bookmark.rightId, expectedProgressVersion:prog };
        break;
      case "attack":
      case "censor":
      case "correction":
      case "protect":
      case "undo":
      case "bookmark_install":
        requireValue(grant,"ITEM_NOT_AVAILABLE");
        payload = { grantId:grant.grantId, expectedInventoryVersion:inv };
        if (operation === "bookmark_install" || operation === "undo") payload.expectedProgressVersion = prog;
        if (operation === "attack" || operation === "censor") {
          const selected = input.targetIds;
          requireValue(Array.isArray(selected) && selected.length>0 && selected.length<=(operation === "attack" ? 2 : 1) &&
            new Set(selected).size===selected.length && selected.every(eligibleTarget),"INVALID_TARGET");
          payload.targetParticipantIds = [...selected];
        }
        break;
      case "trap_options":
      case "trap_install": {
        requireValue(grant,"ITEM_NOT_AVAILABLE");
        const selected = input.targetIds;
        requireValue(Array.isArray(selected) && selected.length === 1 && eligibleTarget(selected[0]),"INVALID_TARGET");
        payload = { grantId:grant.grantId, expectedInventoryVersion:inv, targetParticipantId:selected[0] };
        if (operation === "trap_install") {
          requireValue(trapOptions?.grantId === grant.grantId && trapOptions.targetId === selected[0] &&
            trapOptions.tokens.has(input.selectionToken),"INVALID_TRAP_SELECTION");
          payload.selectionToken = input.selectionToken;
        }
        break;
      }
      default:
        if (!isS5Scope(scope)) throw new Error("UNSUPPORTED_OPERATION");
        payload = s5Payload(operation,input,{ state:current,grant,eligibleTarget });
    }
    const lane = ["normal_link","bookmark_return","undo"].includes(operation) ? "movement" : operation === "parry" ? "reaction" : "item";
    requireValue(!pending.has(lane),"REQUEST_IN_FLIGHT");
    requireValue(!unresolvedAfterReload.size,"UNRESOLVED_ORIGINAL_REQUEST");
    const saved = uncertain.get(lane);
    requireValue(!saved || (saved.operation === operation && JSON.stringify(saved.payload) === JSON.stringify(payload)),
      "UNRESOLVED_ORIGINAL_REQUEST");
    const command = saved ?? { requestId:makeRequestId(), operation, payload };
    journal.add(journalKey,command.requestId);
    pending.add(lane);
    uncertain.set(lane,command);
    try {
      const result = receipt(check(await transport.act(scope,command)),command.requestId);
      if (result) {
        if (saved) retransmittedReceipts.add(result);
        uncertain.delete(lane);
        if (operation === "trap_install") trapOptions = undefined;
        if (operation === "trap_options") {
          trapOptions = undefined;
          if (result.code === "TRAP_OPTIONS") {
            requireValue(Array.isArray(result.options) && result.options.every(option=>
              value(option?.pageId) && /^[a-f0-9]{64}$/.test(option.selectionToken)),"INVALID_TRAP_OPTIONS");
            trapOptions = { grantId:grant.grantId, targetId:payload.targetParticipantId,
              tokens:new Set(result.options.map(option=>option.selectionToken)) };
          }
        }
      }
      return result;
    } finally {
      pending.delete(lane);
    }
  }
  return { refresh, snapshot, recover, dispatch, isRetransmission:receipt=>retransmittedReceipts.has(receipt), close:()=>{ closed=true; current=undefined; } };
}
