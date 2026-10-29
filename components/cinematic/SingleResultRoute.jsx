import React from "react";
import FinishEffect from "../FinishEffect.jsx";

/** Full route stays in the detailed result; cinematic uses endpoints and server scalars only. */
export default function SingleResultRoute({ path = [], pathHex, finishEffect, completed }) {
  return <section className="wr-result-row wr-result-route" aria-labelledby="wr-single-route-title">
    <div className="wr-rroute-head"><h2 id="wr-single-route-title" className="wr-hud-label">MY ROUTE · 이동 경로</h2><small>{path.length}문서</small></div>
    <ol className="wr-tl">
      {path.map((title, index) => {
        const isLast = index === path.length - 1;
        const dot = <span className="wr-tl-dot"><span className="wr-tl-dot-inner" style={pathHex ? { background: pathHex } : undefined} /></span>;
        return <li key={`${title}-${index}`} className={`wr-tl-item ${isLast ? "is-last" : ""}`}>
          {isLast && completed ? <FinishEffect effect={finishEffect}>{dot}</FinishEffect> : dot}
          <span className="wr-tl-title" title={title}>{title}</span>
          {!isLast && <span className="wr-tl-line" aria-hidden="true" style={pathHex ? { background: pathHex } : undefined} />}
        </li>;
      })}
    </ol>
  </section>;
}
