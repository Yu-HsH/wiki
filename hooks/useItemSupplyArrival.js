import { useEffect, useRef, useState } from "react";
import { audioManager } from "../services/audioManager.js";

// An inventory refresh is independent of a supply decision. Reject coalesced
// inventory changes when the older contract cannot identify the granted slot.
export function newSupplyGrant(previous, current, enteredFromLobby) {
  if (!current.round || !current.live || current.round === previous?.round ||
      !Number.isFinite(current.dueAt) || current.observedAt < current.dueAt ||
      current.observedAt - current.dueAt > 2000) return null;
  if (!previous?.round && !enteredFromLobby) return null;
  if (current.outcome === "discarded_full") return null;

  const known = new Set(previous?.inventory ?? []);
  const fresh = current.inventory.filter(id => !known.has(id));
  if (current.grantId) return fresh.includes(current.grantId) ? current.grantId : null;
  if (fresh.length !== 1 || current.inventory.length !== known.size + 1 ||
      [...known].some(id => !current.inventory.includes(id))) return null;
  if (previous?.round) {
    if (Number(current.round) - Number(previous.round) !== 1 || current.revision - previous.revision !== 1 ||
        current.sideEffects !== previous.sideEffects) return null;
  } else if (!current.initialRound) return null;
  return fresh[0];
}

export default function useItemSupplyArrival(snapshot, scope, enteredFromLobby) {
  const previous = useRef(null);
  const [arrived, setArrived] = useState(null);
  useEffect(() => {
    if (!snapshot) return;
    const prior = previous.current?.scope === scope ? previous.current.snapshot : null;
    previous.current = { scope, snapshot };
    const grant = newSupplyGrant(prior, snapshot, enteredFromLobby);
    if (!grant || document.hidden) return;
    setArrived({scope,grant});
    void audioManager.play("itemReveal", { key: `item-supply:${scope}:${snapshot.round}:${grant}` });
  }, [snapshot, scope, enteredFromLobby]);
  useEffect(() => {
    if (!arrived) return;
    const timeout=setTimeout(() => setArrived(null), 1250);
    return () => clearTimeout(timeout);
  }, [arrived]);
  return arrived?.scope === scope ? arrived.grant : null;
}
