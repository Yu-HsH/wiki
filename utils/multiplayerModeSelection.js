/** Preserve the game mode selected on the PLAY screen.
 * A bare /multiplayer URL remains a backwards-compatible mode picker.
 */
export function getScopedMultiplayerMode(queryMode) {
  return queryMode === "duel" || queryMode === "group" ? queryMode : null;
}

export function resolveMultiplayerMode(queryMode, manuallySelectedMode) {
  return getScopedMultiplayerMode(queryMode)
    ?? getScopedMultiplayerMode(manuallySelectedMode);
}
