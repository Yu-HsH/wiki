/** Visual only: gameplay timers and sound cues must remain authoritative elsewhere. */
export function getKionCountdownState(mode, stepIndex, motionEligible = true) {
  if (!motionEligible || !["duel", "group"].includes(mode)) return null;
  if (!Number.isInteger(stepIndex) || stepIndex < 0 || stepIndex > 3) return null;
  return stepIndex === 3
    ? { emoteId: "go", state: "go" }
    : { emoteId: "ready", state: "ready" };
}
