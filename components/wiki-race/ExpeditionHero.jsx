import React, { useEffect, useId, useRef, useState } from "react";
import JungleVeilArt from "./JungleVeilArt.jsx";
import "../../css/jungleVeil.css";

const ENTRY_DURATION_MS = 560;

export default function ExpeditionHero({ onPlay }) {
  const titleId = useId();
  const copyId = useId();
  const cueId = useId();
  const entryTimer = useRef(null);
  const [hovered, setHovered] = useState(false);
  const [launching, setLaunching] = useState(false);

  useEffect(() => () => window.clearTimeout(entryTimer.current), []);

  function startExpedition() {
    if (entryTimer.current !== null) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onPlay();
      return;
    }
    setLaunching(true);
    entryTimer.current = window.setTimeout(onPlay, ENTRY_DURATION_MS);
  }

  return (
    <section className="wr65-jungle-hero wr-veil" aria-labelledby={titleId}
      data-state={launching ? "launch" : "idle"} data-hovered={hovered}
      style={{ "--veil-entry-duration": `${ENTRY_DURATION_MS}ms` }}>
      <JungleVeilArt />
      <div className="wr-veil-shade" aria-hidden="true" />
      <div className="wr-veil-copy">
        <p className="wr-veil-kicker">BEYOND THE KNOWN</p>
        <h1 id={titleId}>Wiki <span>Race</span></h1>
        <p className="wr-veil-sub" id={copyId}>숨겨진 길을 찾아, 지식의 정글을 돌파하라.</p>
        <p className="wr-veil-cue" id={cueId}>
          {launching ? "탐험을 시작합니다…" : <>
            <span className="wr-veil-start-visual" aria-hidden="true">게임 시작 <span className="wr-veil-arrow">→</span></span>
            <span className="wr-visually-hidden">
              <span className="wr-veil-cue-idle">눌러서 탐험 시작</span>
              <span className="wr-veil-cue-open">숲길로 들어가기</span>
            </span>
          </>}
        </p>
      </div>
      <button type="button" className="wr-veil-trigger"
        aria-labelledby={`${titleId} ${cueId}`} aria-describedby={copyId}
        aria-disabled={launching || undefined}
        onPointerEnter={event => setHovered(event.pointerType === "mouse")}
        onPointerLeave={() => setHovered(false)}
        onClick={startExpedition} />
    </section>
  );
}
