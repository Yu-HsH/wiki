import React from "react";
import { finishTier } from "../utils/rewardTokens.js";
import useRewardArt from "../hooks/useRewardArt.js";
import RewardArtImage from "./RewardArtImage.jsx";

/** Existing result marker: no equipment means unchanged children.
 * Approved static art replaces the cosmetic ring only after load. CSS remains the fallback.
 * Image lifecycle never drives match completion, rewards, navigation or replay.
 */
export default function FinishEffect({ effect, children = null }) {
  const art = useRewardArt("finish_effect", effect);
  if (!effect) return children;
  const tier = finishTier(effect) ?? "tier-1";
  return (
    <span className={`fx-finish fx-finish--${tier}${children ? "" : " fx-finish--standalone"}${art.ready ? " fx-finish--art-ready" : ""}`} data-testid="finish-effect">
      {children ?? <span className="fx-finish-node" aria-hidden="true" />}
      <RewardArtImage presentation={art} className="fx-finish-art" />
      <span className="fx-sr">완주 효과 {effect.displayName}</span>
    </span>
  );
}
