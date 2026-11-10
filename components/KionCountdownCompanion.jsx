import React from "react";
import { getKionEmote } from "../utils/kionEmoteCatalog.js";
import { getKionCountdownState } from "../utils/kionCountdownState.js";
import { KionEmoteSticker } from "./KionEmotes.jsx";
import "./KionCountdownCompanion.css";

/** Separate opt-in from room RPC; no countdown timing or audio side effects. */
export const KION_COUNTDOWN_ANIMATION_ENABLED =
  import.meta.env.VITE_ENABLE_KION_COUNTDOWN_ANIMATION === "true";

export default function KionCountdownCompanion({ mode, stepIndex, motionEligible = true }) {
  if (!KION_COUNTDOWN_ANIMATION_ENABLED) return null;
  const state = getKionCountdownState(mode, stepIndex, motionEligible);
  if (!state) return null;
  const preset = getKionEmote(state.emoteId);
  if (!preset) return null;
  return (
    <div className="wr-kion-countdown" data-motion={state.state} aria-hidden="true" key={state.state + ":" + stepIndex}>
      <KionEmoteSticker preset={preset} size={88} />
    </div>
  );
}
