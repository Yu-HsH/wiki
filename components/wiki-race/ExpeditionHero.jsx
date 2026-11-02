import React, { useState } from "react";
import { ExpeditionTrail } from "./WikiRaceShell";
import useSceneSequence from "../../hooks/useSceneSequence.js";

export default function ExpeditionHero({ onPlay, notebook = false }) {
  const sequence = useSceneSequence(notebook ? "scene:home:intro-v1" : null);
  const [hasJungleArt, setHasJungleArt] = useState(true);
  return <section className={`wr-hero${sequence ? " is-home-sequence" : ""}${notebook ? hasJungleArt ? " wr65-jungle-hero" : " wr65-hero-fallback" : ""}`} aria-label="Base Camp 탐험 시작">
    <h1 className="wr-visually-hidden">Wiki Race · Base Camp</h1>
    <img className="wr-landscape" src={notebook && hasJungleArt ? "/assets/wiki-race/jungle65/hero-jungle-expedition.webp" : "/assets/wiki-race/hero-landscape.png"} alt="" onError={() => setHasJungleArt(false)} />
    <ExpeditionTrail />
    {!notebook && <img className="wr-explorer" src="/assets/wiki-race/explorer-home.png" alt="" />}
    <div className="wr-hero-entry">
      {notebook && !hasJungleArt && <p className="wr-hero-intro">위키 링크를 따라 목표 문서까지</p>}
      <button type="button" className="wr-play-launcher" onClick={onPlay} aria-label="탐험 시작 · 모드 선택으로 이동">{notebook ? <>탐험 시작 <span aria-hidden="true">→</span></> : <>PLAY <span>탐험 시작 →</span></>}</button>
    </div>
  </section>;
}
