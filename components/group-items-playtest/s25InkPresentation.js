import { INK_AUDIO_MAX_LATENESS_MS } from "./pulseAudioGate.js";
import { createItemRaceClock } from "../../services/itemRaceClock.js";

// These are S2's art offsets. The server supplies the effect interval and its elapsed pulse count.
const PULSE_OFFSETS_MS = Object.freeze([0, 180, 360]);

function sameScope(left, right) {
  return left.sessionId === right.sessionId && left.participantId === right.participantId
    && left.ownerEpoch === right.ownerEpoch && left.bindingDigest === right.bindingDigest;
}

export function createS25InkPresentation({ presentationNow = () => performance.now(), viewerLabel = "나", onPulseDecision, useReactionClock = false } = {}) {
  let current = null, anchor = null, suspended = false;
  const warningClock = createItemRaceClock();
  const warningIds = new Set(), effectStates = new Map();
  let warningCues = [];

  function estimate(at) {
    return anchor === null ? null : anchor.server + Math.max(0, at - anchor.local);
  }

  function accept(snapshot, { recovering = false } = {}) {
    if (current && !sameScope(snapshot.scope, current.scope)) throw new Error("S25_SCOPE_MISMATCH");
    if (current?.projection.kind === "finished" || current?.projection.kind === "retired") {
      if (snapshot.interaction === "attack_fixture") return false;
    }
    if (current?.interaction === "attack_fixture" && snapshot.interaction === "attack_fixture"
      && (snapshot.stateRevision < current.stateRevision || snapshot.recipientEventSeq < current.recipientEventSeq
        || snapshot.serverObservedAt < current.serverObservedAt)) return false;

    const at = presentationNow();
    const recovery = recovering || suspended || current === null;
    if (snapshot.serverObservedAt !== null) {
      // Use a conservative RTT bound so delay cannot move a displayed deadline later.
      anchor = { local: at, server: Math.max(estimate(at) ?? 0, snapshot.serverObservedAt + snapshot.transportElapsedMs) };
      if (useReactionClock) warningClock.observe(snapshot.serverObservedAt, snapshot.transportElapsedMs, at);
    }
    current = snapshot;
    suspended = false;
    if (recovery) warningCues = [];
    for (const warning of snapshot.projection.warnings) {
      if (warningIds.has(warning.childId)) continue;
      warningIds.add(warning.childId);
      if (!recovery) warningCues.push({ type: "attack_warning", eventId: "warning:" + warning.childId,
        childId: warning.childId, recipientId: snapshot.scope.participantId, at: snapshot.serverObservedAt });
    }
    for (const effect of snapshot.projection.effects) {
      const state = effectStates.get(effect.effectId);
      if (state) {
        if (recovery) state.suppression = "RECOVERY";
        continue;
      }
      const firstAuthorityNow = estimate(at);
      // Rebase a newly observed live sequence only while its opening animation is still in progress.
      const suppression = recovery ? "RECOVERY"
        : firstAuthorityNow - effect.startsAt >= PULSE_OFFSETS_MS.at(-1) ? "LATE_FIRST_SNAPSHOT" : null;
      const localStart = at + Math.max(0, effect.startsAt - firstAuthorityNow);
      effectStates.set(effect.effectId, { next: 0, suppression,
        presentationPulseTimes: PULSE_OFFSETS_MS.map(offset => localStart + offset) });
    }
    return true;
  }

  function frame() {
    if (!current) return { now: null, view: null, pulse: null, events: [], pulseEvents: [] };
    const processedMonoMs = presentationNow();
    const now = estimate(processedMonoMs);
    const warningNow = useReactionClock ? warningClock.now(processedMonoMs) : null;
    const { scope, projection, self } = current;
    const events = warningCues.filter(event => !suspended && projection.warnings.some(
      warning => warning.childId === event.childId && warning.dueAt > (warningNow ?? now)));
    warningCues = [];
    const pulseEvents = [];
    const effects = projection.effects.map(effect => {
      const state = effectStates.get(effect.effectId);
      const pulseTimes = PULSE_OFFSETS_MS.map(offset => effect.startsAt + offset);
      const active = now !== null && now >= effect.startsAt && now < effect.expiresAt;
      const count = !active ? 0 : state.suppression
        ? Math.max(effect.visiblePulseCount, pulseTimes.filter(at => at <= now).length)
        : state.presentationPulseTimes.filter(at => at <= processedMonoMs).length;
      while (state.next < count) {
        const pulseIndex = state.next++;
        const at = pulseTimes[pulseIndex];
        const presentationAt = state.presentationPulseTimes[pulseIndex];
        const presentationLatenessMs = processedMonoMs - presentationAt;
        const reason = state.suppression ?? (presentationLatenessMs > INK_AUDIO_MAX_LATENESS_MS ? "FRAME_LATE" : null);
        onPulseDecision?.({ effectId: effect.effectId, pulseIndex, authorityAt: at, processedMonoMs, presentationAt,
          authorityNow: now, authorityLatenessMs: now - at, presentationLatenessMs, reason });
        if (reason === null) {
          pulseEvents.push({ type: "ink_pulse", eventId: "pulse:" + effect.effectId + ":" + pulseIndex,
            effectId: effect.effectId, pulseIndex, recipientId: scope.participantId, at, presentationAt });
        }
      }
      return { ...effect, pulseTimes, presentationPulseTimes: state.presentationPulseTimes,
        visiblePulseCount: count, serverVisiblePulseCount: effect.visiblePulseCount };
    });
    const visible = effects.find(effect => effect.visiblePulseCount > 0);
    const pulse = visible ? { effectId: visible.effectId, tier: visible.tier, index: visible.visiblePulseCount,
      animate: pulseEvents.some(event => event.effectId === visible.effectId), static: effectStates.get(visible.effectId).suppression !== null } : null;

    const readOnly = current.interaction === "read_only" || suspended;
    const inventory = [null, null];
    for (const item of projection.inventory) {
      inventory[item.slotIndex] = { ...item, canSelect: !readOnly && item.canSelect,
        requiresTarget: item.requiresTarget ?? (item.action === "attack"),
        requiresWarning: item.action === "parry", targetLimit: item.targetLimit ?? projection.targetOptions.length };
    }
    const view = { sessionId: scope.sessionId, now, ...(useReactionClock && warningNow !== null ? { warningNow } : {}),
      presentationNow: processedMonoMs, status: projection.kind, serverTransport: "s2.5",
      viewer: { mode: "participant", id: scope.participantId, status: self?.status ?? projection.kind, displayName: viewerLabel, readOnly },
      document: self ? { id: self.currentPageId } : null,
      moveCount: self?.moveCount ?? 0,
      warnings: projection.warnings,
      effects, inventory, inventoryVersion: current.inventoryVersion,
      targets: projection.targetOptions.map(target => ({ ...target, canSelect: !readOnly && target.eligible })),
      protection: projection.protection && now !== null && now < projection.protection.expiresAt ? [projection.protection] : [],
      results: projection.results,
      controls: { canAttack: !readOnly && projection.inventory.some(item => item.action === "attack") },
    };
    return { now, view, pulse, events: [...events, ...pulseEvents], pulseEvents };
  }

  function suspend() {
    suspended = true;
    warningCues = [];
    for (const state of effectStates.values()) state.suppression = "RECOVERY";
  }

  return Object.freeze({ accept, frame, suspend });
}
