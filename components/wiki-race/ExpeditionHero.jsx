import React from "react";
import { ExpeditionTrail } from "./WikiRaceShell";
import useSceneSequence from "../../hooks/useSceneSequence.js";

export default function ExpeditionHero({ onPlay, notebook = false }) {
  const sequence = useSceneSequence(notebook ? "scene:home:intro-v1" : null);
  return <section className={`wr-hero${sequence ? " is-home-sequence" : ""}`} aria-label="Base Camp 탐험 시작">
    {!notebook && <h1 className="wr-visually-hidden">Wiki Race · Base Camp</h1>}
    <img className="wr-landscape" src="/assets/wiki-race/hero-landscape.png" alt="" />
    <ExpeditionTrail />
    {!notebook && <img className="wr-explorer" src="/assets/wiki-race/explorer-home.png" alt="" />}
    {notebook && <div className="wr-home-sign"><span>지식을 탐험하는 여행</span><h1>Wiki<br />Race</h1></div>}
    <div className="wr-hero-entry">
      {notebook && <p className="wr-hero-intro">위키백과 링크를 따라<br />목표 문서까지 탐험하세요.</p>}
      <button type="button" className="wr-play-launcher" onClick={onPlay}>{notebook ? <>탐험 시작 <span aria-hidden="true">→</span></> : <>PLAY <span>탐험 시작 →</span></>}</button>
    </div>
  </section>;
}
