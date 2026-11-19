import React from "react";
import useRewardArt from "../hooks/useRewardArt.js";
import RewardArtImage from "./RewardArtImage.jsx";

/** Small album/editor specimen uses exactly the same art key as the live renderer. */
export default function RewardArtSwatch({ kind, reward, children = null }) {
  const presentation = useRewardArt(kind, reward);
  if (!presentation.imageProps) return children;
  return <span className="reward-art-swatch">
    {!presentation.ready && children}
    <RewardArtImage presentation={presentation} className="reward-art-swatch-image" />
  </span>;
}
