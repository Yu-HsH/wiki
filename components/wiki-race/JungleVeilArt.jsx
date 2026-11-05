import React from "react";

const ART_ROOT = "/assets/wiki-race/jungle-veil/";
const layers = ["world", "canopy", "left", "right"];

// Each replaceable illustration layer uses the same coordinates. React owns
// the banner interaction and CSS moves the layers as separate images.
export default function JungleVeilArt() {
  return (
    <svg className="wr-veil-art" viewBox="0 0 1120 420" preserveAspectRatio="xMidYMid slice"
      aria-hidden="true" focusable="false">
      {layers.map(layer => (
        <image key={layer} className={`wr-veil-layer wr-veil-${layer}`}
          href={`${ART_ROOT}${layer}.svg`} width="1120" height="420" />
      ))}
    </svg>
  );
}
