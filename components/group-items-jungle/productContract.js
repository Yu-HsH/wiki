export const PRODUCT_PROTOCOL = "s4-product-v1";
export const PRODUCT_NAMESPACE = "ink-s4-product";
const bindingKeys = ["namespace", "schemaVersion", "rulesVersion", "catalogVersion", "modePolicyVersion", "policyDigest"];
const versions = bindingKeys.slice(1, -1);
const phases = ["waiting", "playing", "finished"];
export const productId = value => typeof value === "string" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value);
export const wikiId = value => typeof value === "string" && /^[1-9][0-9]{0,18}$/.test(value);
const counter = value => value === "0" || wikiId(value);
const assert = (valid, code) => { if (!valid) throw new Error(code); };

export function readProductBinding(value) {
  const binding = typeof value === "string" ? JSON.parse(value) : value;
  assert(binding?.namespace === PRODUCT_NAMESPACE && Object.keys(binding).length === bindingKeys.length &&
    versions.every(key => typeof binding[key] === "string" && /^[a-z0-9.-]{1,80}$/.test(binding[key])) &&
    typeof binding.policyDigest === "string" && /^[0-9a-f]{64}$/.test(binding.policyDigest), "PRODUCT_BINDING_REQUIRED");
  return Object.freeze(Object.fromEntries(bindingKeys.map(key => [key, binding[key]])));
}

export const productBindingMatches = (a, b) => bindingKeys.every(key => typeof a?.[key] === "string" && a[key] === b?.[key]);

export function isProductS4Scope(scope) {
  return scope?.protocol === PRODUCT_PROTOCOL && scope.binding?.namespace === PRODUCT_NAMESPACE && productId(scope.sessionId) &&
    !["a3500000-0000-4000-9000-000000009801", "a3500000-0000-4000-9000-000000009802"].includes(scope.sessionId);
}

export function readProductRoom(body, { roomId, actorId, binding }, previous = null) {
  assert(body?.mode === "group_items" && body.protocol === PRODUCT_PROTOCOL && body.testOnly === false &&
    body.roomId === roomId && productId(roomId) && body.actorId === actorId && productId(actorId) &&
    productBindingMatches(body.binding, binding), "PRODUCT_ROOM_SCOPE_MISMATCH");
  assert(counter(body.version) && phases.includes(body.phase) && ["player", "spectator"].includes(body.role) &&
    Array.isArray(body.players) && body.players.every(player => productId(player?.participantId) &&
      typeof player.name === "string" && typeof player.ready === "boolean") &&
    new Set(body.players.map(player => player.participantId)).size === body.players.length, "INVALID_PRODUCT_ROOM");
  const options = body.actions;
  const allowed = body.phase === "waiting" && body.role === "player" ? ["ready", "start", "leave"]
    : body.phase === "playing" && body.role === "player" ? ["leave"] : body.phase === "finished" ? ["rematch"] : [];
  assert(Array.isArray(options) && options.every(action => allowed.includes(action)), "INVALID_PRODUCT_ROOM_ACTIONS");
  if (body.followupActions != null) assert(Array.isArray(body.followupActions) &&
    body.followupActions.every(action => body.phase==="waiting" && body.role==="player" &&
      ["candidate","unready","start_scheduled"].includes(action)), "INVALID_PRODUCT_ROOM_ACTIONS");
  if (body.courseCandidates != null) assert(Array.isArray(body.courseCandidates) &&
    body.courseCandidates.every(row => productId(row?.snapshotId) && typeof row.title==="string"), "INVALID_PRODUCT_CANDIDATES");
  if (body.freeWiki != null) assert(typeof body.freeWiki === "boolean" &&
    (body.myCandidateTitle == null || typeof body.myCandidateTitle === "string"), "INVALID_PRODUCT_CANDIDATES");
  if (body.scheduledStartAt != null) assert(Number.isFinite(Date.parse(body.scheduledStartAt)) &&
    Number.isFinite(Date.parse(body.serverObservedAt)), "INVALID_PRODUCT_START");
  if (body.phase === "waiting") assert(body.sessionId === null && body.role === "player", "INVALID_PRODUCT_WAITING_ROOM");
  else assert(isProductS4Scope(body), "INVALID_PRODUCT_SESSION");
  if (body.phase === "playing" && body.role === "player") {
    assert(productId(body.participantId) && wikiId(body.ownerEpoch) &&
      body.players.some(player => player.participantId === body.participantId) &&
      wikiId(body.target?.pageId) && wikiId(body.target?.revisionId) && typeof body.target?.title === "string" && body.target.title.trim() &&
      Number.isSafeInteger(body.warningWindowMs) && body.warningWindowMs > 0, "INVALID_PRODUCT_PLAYING_ROOM");
  }
  if (body.phase === "finished") {
    assert((body.role === "player" ? productId(body.participantId) : body.participantId == null) &&
      Array.isArray(body.results) && body.results.every(row => productId(row?.participantId) &&
      typeof row.name === "string" && Number.isSafeInteger(row.rank) && row.rank > 0 &&
      (row.xp === null || (row.participantId === body.participantId && Number.isSafeInteger(row.xp) && row.xp >= 0))), "INVALID_PRODUCT_RESULT");
  }
  if (previous) {
    assert(productBindingMatches(body.binding, previous.binding) &&
      (!previous.sessionId || !body.sessionId || body.sessionId === previous.sessionId), "PRODUCT_ROOM_BINDING_CHANGED");
    if (BigInt(body.version) < BigInt(previous.version) ||
      (body.version === previous.version && !(Date.parse(body.serverObservedAt) > Date.parse(previous.serverObservedAt)))) return previous;
    assert(phases.indexOf(body.phase) >= phases.indexOf(previous.phase), "PRODUCT_PHASE_REGRESSION");
    if (previous.phase === "playing" && previous.role === "player" && body.phase === "playing" && body.role === "player") {
      assert(body.participantId === previous.participantId && body.ownerEpoch === previous.ownerEpoch &&
        body.target.pageId === previous.target.pageId && body.target.revisionId === previous.target.revisionId &&
        body.warningWindowMs === previous.warningWindowMs, "PRODUCT_ROOM_BINDING_CHANGED");
    }
  }
  return Object.freeze({ ...body, binding });
}

export function readProductRoomAction(body, { actorId, requestId, operation, binding, roomId }) {
  assert(body?.actorId === actorId && body.requestId === requestId && body.operation === operation &&
    body.protocol === PRODUCT_PROTOCOL && body.testOnly === false && productBindingMatches(body.binding, binding), "PRODUCT_ROOM_ACTION_MISMATCH");
  if (body.ok !== true) {
    const failure = new Error(typeof body.code === "string" ? body.code : "PRODUCT_ROOM_ACTION_REJECTED");
    failure.settled = true;
    throw failure;
  }
  if (["create", "join", "rematch"].includes(operation)) {
    assert(productId(body.roomId) && (operation !== "rematch" || (body.previousRoomId === roomId && body.roomId !== roomId)), "INVALID_PRODUCT_ROOM_ACTION");
  } else assert(body.roomId === roomId, "PRODUCT_ROOM_ACTION_MISMATCH");
  return body;
}
