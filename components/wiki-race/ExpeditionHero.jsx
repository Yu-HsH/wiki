import React from "react";
import { ExpeditionTrail } from "./WikiRaceShell";

export default function ExpeditionHero({ onPlay }) {
  return <section className="wr-hero" aria-label="Base Camp 탐험 시작">
    <h1 className="wr-visually-hidden">Wiki Race · Base Camp</h1>
    <img className="wr-landscape" src="/assets/wiki-race/hero-landscape.png" alt="" />
    <ExpeditionTrail />
    <img className="wr-explorer" src="/assets/wiki-race/explorer-home.png" alt="" />
    <div className="wr-hero-entry">
      <button type="button" className="wr-play-launcher" onClick={onPlay}>PLAY <span>탐험 시작 →</span></button>
    </div>
  </section>;
}
