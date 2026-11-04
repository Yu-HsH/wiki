import React, { useRef, useState } from "react";
import { ExpeditionTrail } from "./WikiRaceShell";
import useSceneSequence from "../../hooks/useSceneSequence.js";
import JungleAtmosphere from "./JungleAtmosphere.jsx";
import JungleHotspot, { useJunglePulse } from "./JungleHotspot.jsx";
import JunglePropLayers, { reactJungleProp } from "./JunglePropLayers.jsx";

function JungleRoute() {
  const trail = useRef(null);
  const pulse = useJunglePulse();
  const reveal = () => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    pulse(trail.current, [
      { strokeDashoffset: 12, opacity: 0 },
      { strokeDashoffset: -8, opacity: 1, offset: .2 },
      { strokeDashoffset: -85, opacity: 1, offset: .82 },
      { strokeDashoffset: -100, opacity: 0 },
    ], 920);
  };

  return <>
    <svg className="wr65-route-light" viewBox="0 0 1535 436" aria-hidden="true" focusable="false">
      <path ref={trail} pathLength="100" d="M480 390 Q520 346 565 353 C640 356 666 400 755 392 S870 408 962 381 C1060 360 1067 328 1142 313 S1218 304 1257 314 S1320 285 1348 257 Q1381 228 1430 237" />
    </svg>
    {[
      ["marker-one", "출발 지점과 깃발에 빛 비추기"],
      ["marker-two", "두 번째 경로 마커와 깃발에 빛 비추기"],
      ["marker-three", "세 번째 경로 마커와 깃발에 빛 비추기"],
    ].map(([id, label]) => <JungleHotspot key={id} kind={id} label={label} onReveal={event => {
      reactJungleProp("home", id, event);
      reveal();
    }} />)}
  </>;
}

export default function ExpeditionHero({ onPlay, notebook = false }) {
  const sequence = useSceneSequence(notebook ? "scene:home:intro-v1" : null);
  const [hasJungleArt, setHasJungleArt] = useState(true);
  const jungle = notebook && hasJungleArt;
  const playButton = (art = false) => <button type="button"
    className={`wr-play-launcher${art ? " wr65-art-cta" : ""}`} onClick={onPlay}
    aria-label={art ? "배너에서 탐험 시작 · 모드 선택으로 이동" : "탐험 시작 · 모드 선택으로 이동"}>
    {notebook ? <>탐험 시작 <span aria-hidden="true">→</span></> : <>PLAY <span>탐험 시작 →</span></>}
  </button>;

  return <section className={`wr-hero${sequence ? " is-home-sequence" : ""}${notebook ? hasJungleArt ? " wr65-jungle-hero" : " wr65-hero-fallback" : ""}`} aria-label="Base Camp 탐험 시작">
    <h1 className="wr-visually-hidden">Wiki Race · Base Camp</h1>
    {jungle ? <>
      <div className="wr65-hero-art">
        <img className="wr-landscape" width="1535" height="436" loading="eager" decoding="async" fetchPriority="high"
          src="/assets/wiki-race/jungle65/hero-jungle-expedition.webp" alt="" onError={() => setHasJungleArt(false)} />
        <JunglePropLayers scene="home" />
        <JungleAtmosphere variant="hero" />
        <div className="wr-hero-entry wr65-hero-art-entry">{playButton(true)}</div>
        <JungleRoute />
      </div>
      <div className="wr-hero-entry wr65-hero-mobile-entry">{playButton()}</div>
    </> : <>
      <img className="wr-landscape" loading="eager" decoding="async" fetchPriority="high" src="/assets/wiki-race/hero-landscape.png" alt="" />
      <ExpeditionTrail />
      {!notebook && <img className="wr-explorer" src="/assets/wiki-race/explorer-home.png" alt="" />}
      <div className="wr-hero-entry">
        {notebook && <p className="wr-hero-intro">위키 링크를 따라 목표 문서까지</p>}
        {playButton()}
      </div>
    </>}
  </section>;
}
