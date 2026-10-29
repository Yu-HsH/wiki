// This only projects a server ledger into the existing HUD; it never grants a use.
export function previewPanelFromState(state, previous = null) {
  if (!state?.itemEventId || !state.active || !state.sourceValid || !Number.isFinite(state.expiresAt)) return null;
  const same = previous?.itemEventId === state.itemEventId;
  const entries = {};
  for (const entry of state.entries || []) {
    if (entry.status === 'ready' && entry.summary?.extract) entries[entry.pageId] = { status: 'ready', ...entry.summary };
    else if (entry.status === 'reserved') entries[entry.pageId] = { status: 'loading', leaseUntil: entry.leaseUntil };
    else entries[entry.pageId] = { status: 'unavailable' };
  }
  return { active: true, itemEventId: state.itemEventId, expiresAt: state.expiresAt,
    sourcePageId: state.sourcePageId, sourceRevisionId: state.sourceRevisionId,
    candidates: state.candidates, entries, selectedPageId: same ? previous.selectedPageId : null,
    usedPreviews: state.used, reservedPreviews: state.reserved, maxPreviews: state.max,
    serverNow: state.serverNow };
}

export function mergePreviewPanel(previous, state) {
  if (!previous || previous.itemEventId !== state?.itemEventId) return previous;
  if (Number.isFinite(previous.serverNow) && state.serverNow < previous.serverNow) return previous;
  return previewPanelFromState(state, previous);
}
