import React from "react";
import { finalIconUrl } from "./finalAssetEvents.js";
import "./finalAttackMotion.css";

const projectiles = {
  ink: { color:"#704792", path:"M49 7C45 22 25 30 25 46a25 25 0 0 0 50 0C75 32 55 21 49 7Z" },
  censor: { color:"#bd6b34", path:"M27 22h46v34H27zM37 22V13a13 13 0 0 1 26 0v9M50 36v9" },
  lost_link: { color:"#437c9d", path:"m49 6 10 22 25 10-25 10-10 22-10-22-25-10 25-10Z M49 22v32" },
  thunder: { color:"#a97a23", path:"M57 4 27 39h21L37 67l37-38H52Z" },
  weakening: { color:"#744f94", path:"M18 18 40 37l10-14 9 24 23 10M43 54l9 12 23-7" },
  cannon: { color:"#326982", path:"M18 39h53m-19-16 21 16-21 16M15 24l18 4M15 55l18-5" },
};
const rayPaths = ["M50 25 50 3","M61 28 77 9","M70 37 96 37","M61 48 78 67","M50 52 50 74",
  "M38 48 22 67","M30 37 4 37","M38 28 22 9"];

export default function FinalAttackMotion({ scene }) {
  const motif = projectiles[scene.itemId];
  const icon = finalIconUrl(scene.itemId,scene.itemTier);
  return <div className="s5-attack-motion" data-item-vfx={scene.kind} data-direction={scene.direction}
    style={{"--s5-attack-color":motif?.color ?? "#966834"}}>
    <svg viewBox="0 0 200 110" aria-hidden="true" focusable="false">
      <g className="s5-attack-flight">
        <path className="s5-attack-trail" d="M4 56h102M24 46h82M34 65h72" />
        <g transform="translate(57 18) scale(.76)">
          {motif ? <path className="s5-attack-projectile" d={motif.path} /> :
            icon && <image href={icon} x="18" y="5" width="64" height="64"/>}
        </g>
      </g>
      <g className="s5-attack-impact" transform="translate(50 19)">
        <circle className="s5-attack-ring" cx="50" cy="37" r="28"/>
        {rayPaths.map(path=><path className="s5-attack-ray" key={path} d={path}/>)}
      </g>
      <g className="s5-attack-deflect">
        <path d="M70 77q42-11 66-47l-22 3m22-3-4 24" />
        <path d="M65 54 74 65 85 49"/>
      </g>
    </svg>
    <span>{scene.label}</span>
  </div>;
}
