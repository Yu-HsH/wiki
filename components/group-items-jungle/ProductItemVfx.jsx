import React from "react";
import { inkVisualOpacity } from "../group-items-playtest/effectPresentation.js";
import { productInkPlacement } from "./productPresentation.js";
import "./productItemVfx.css";

const assetRoot = "/group-items-vfx/";
const inkAssets = [1, 2, 3].map(index => assetRoot + `ink_jungle_${index}.png`);

export function preloadProductInkArt() {
  for (const src of inkAssets) {
    const image = new Image();
    image.src = src;
  }
}

export function ProductInkVfx({ pulse, frame }) {
  if (!pulse) return null;
  const effect = frame.view.effects.find(effect => effect.effectId === pulse.effectId);
  const opacity = inkVisualOpacity(effect, frame.now, { staticMode: pulse.static });
  const placements = productInkPlacement(pulse.effectId);
  return <div className="gip-ink s4-ink-v4" role="img" aria-label={`먹물 ${pulse.index}개`}
    data-effect-id={pulse.effectId} data-tier={pulse.tier} data-pulse={pulse.index}
    data-recovered={pulse.static} style={{ opacity }}>
    {inkAssets.slice(0, pulse.index).map((src, index) => <img className="s4-ink-v4-slot gip-ink-splash"
      key={`${pulse.effectId}:${index}`} data-index={index + 1} style={placements[index]} src={src} alt="" />)}
    <span className="gip-ink-label">먹물 · {pulse.index}/3</span>
  </div>;
}

export function ProductItemMotion({ cue }) {
  if (!cue) return null;
  const scene = cue.kind === "parry_success" && cue.motion ? "parry-v3" :
    cue.kind === "trap_triggered" && cue.motion ? "jack-in-box-v2" : null;
  if (scene) return <div className="s4-item-vfx" data-item-vfx={scene} aria-hidden="true">
    {scene === "parry-v3" && <div className="s4-vfx-parry-vignette" />}
    <img className="s4-item-vfx-scene" src={`${assetRoot}${scene}.svg?cue=${encodeURIComponent(cue.key)}`} alt="" />
    {scene === "parry-v3" && <div className="s4-vfx-parry-flash" />}
  </div>;
  if (cue.kind === "protected" || (cue.kind === "protection_active" && cue.motion)) {
    return <div className="s4-item-vfx" data-item-vfx="shield" aria-hidden="true"><i className="s4-vfx-shield" /></div>;
  }
  if (cue.kind === "correction_applied" && cue.motion) {
    return <div className="s4-item-vfx" data-item-vfx="correction" aria-hidden="true"><i className="s4-vfx-slash" /></div>;
  }
  return null;
}
