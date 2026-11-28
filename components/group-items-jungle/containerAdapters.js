import { sanitizeWikiDocumentHtml } from "./S5WikiSanitizer.js";
import { sameGroupItemsScope } from "./authoritySession.js";
import { isProductS4Scope } from "./productContract.js";
import { itemRaceFailure } from "../../services/itemRaceRecovery.js";

const nonEmpty = value => typeof value === "string" && value.trim().length > 0;
const assert = (valid, code) => { if (!valid) throw new Error(code); };

/**
 * Container boundary. The host supplies its active authentication session and a fixed gateway.
 * The gateway must authenticate accessToken and return the independently verified reply scope.
 */
export function createGroupItemsContainerAdapters({ scope, readIdentity, invoke }) {
  assert(sameGroupItemsScope(scope, scope), "INVALID_SCOPE");
  assert(typeof readIdentity === "function" && typeof invoke === "function", "INVALID_CONTAINER_ADAPTER");
  const bound = Object.freeze({
    actorId: scope.actorId, sessionId: scope.sessionId, participantId: scope.participantId,
    ownerEpoch: scope.ownerEpoch, protocol: scope.protocol, binding: Object.freeze({ ...scope.binding }),
  });

  async function activeIdentity() {
    const identity = await readIdentity();
    assert(nonEmpty(identity?.actorId) && nonEmpty(identity?.authenticationEpoch) && nonEmpty(identity?.accessToken), "AUTH_REQUIRED");
    assert(identity.actorId === bound.actorId, "TRANSPORT_SCOPE_MISMATCH");
    return { authenticationEpoch: identity.authenticationEpoch, accessToken: identity.accessToken };
  }

  async function call(operation, callerScope, payload, signal) {
    assert(sameGroupItemsScope(callerScope, bound), "TRANSPORT_SCOPE_MISMATCH");
    signal?.throwIfAborted();
    const identity = await activeIdentity();
    signal?.throwIfAborted();
    let reply;
    try {
      reply = await invoke({ operation, scope: bound, payload, accessToken: identity.accessToken, signal });
    } catch (error) {
      signal?.throwIfAborted();
      if (itemRaceFailure(error).kind !== "connection") throw error;
      throw new Error("JUNGLE_GATEWAY_UNAVAILABLE", { cause:error });
    }
    signal?.throwIfAborted();
    const current = await activeIdentity();
    signal?.throwIfAborted();
    assert(current.authenticationEpoch === identity.authenticationEpoch && sameGroupItemsScope(reply?.scope, bound),
      "TRANSPORT_SCOPE_MISMATCH");
    return reply;
  }

  const transport = Object.freeze({
    state: caller => call("state", caller, null, AbortSignal.timeout(8000)),
    act: (caller, command) => call("act", caller, command),
    receipt: (caller, requestId) => call("receipt", caller, { requestId }),
  });

  async function loadDocument({ pageId, revisionId, snapshotId, progressVersion, signal }) {
    assert(nonEmpty(pageId) && nonEmpty(revisionId), "STALE_DOCUMENT");
    const product = isProductS4Scope(bound);
    const { body } = await call("document", bound, product ? { pageId, revisionId, snapshotId, progressVersion } : { pageId, revisionId }, signal);
    assert(body?.pageId === pageId && body.revisionId === revisionId && nonEmpty(body.title) && typeof body.html === "string"
      && Array.isArray(body.links) && body.links.every(link => nonEmpty(link?.pageId) && nonEmpty(link.title)
        && (link.canonicalTitle === undefined || nonEmpty(link.canonicalTitle))), "STALE_DOCUMENT");
    assert(!product || (body.snapshotId === snapshotId && body.progressVersion === progressVersion && Array.isArray(body.approvedAliases)), "STALE_DOCUMENT");
    const html = sanitizeWikiDocumentHtml(body.html, {
      currentTitle: body.title, apiLinks: body.links.map(link => ({ title: link.canonicalTitle ?? link.title })),
      ...(product ? { approvedAliases: body.approvedAliases } : {}),
    });
    return { pageId, revisionId, title: body.title, html,
      ...(product ? { snapshotId, progressVersion } : {}),
      links: body.links.map(({ pageId, title, canonicalTitle }) => ({ pageId, title, canonicalTitle })) };
  }

  return Object.freeze({ transport, loadDocument });
}
