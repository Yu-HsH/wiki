import React, { useEffect, useState } from "react";
import { KionEmoteSticker } from "../../KionEmotes.jsx";
import { KION_EMOTE_PRESETS } from "../../../utils/kionEmoteCatalog.js";
import { getExplorationHints } from "../../../services/explorationHintService.js";
import "./explorationHintPanel.css";

function HintPanel({ mode, roomId }) {
  const [titles,setTitles] = useState(null);
  const [alert,setAlert] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let timer, announcement, previousCount;
    async function load() {
      let delay = 15000;
      try {
        const hints = await getExplorationHints(mode,roomId,controller.signal);
        if (controller.signal.aborted || !hints) return;
        setTitles(hints.titles);
        if (previousCount != null && hints.titles.length > previousCount) {
          clearTimeout(announcement);
          setAlert(true);
          announcement = setTimeout(() => setAlert(false),4000);
        }
        previousCount = hints.titles.length;
        const next = Date.parse(hints.nextAt) - Date.parse(hints.serverNow);
        if (Number.isFinite(next)) delay = Math.max(1500,Math.min(300000,next+100));
      } catch { /* Hint availability is independent of the race. */ }
      if (!controller.signal.aborted) timer = setTimeout(load,delay);
    }
    function recover() {
      if (document.hidden) return;
      clearTimeout(timer);
      timer = setTimeout(load,250);
    }
    void load();
    window.addEventListener("online",recover);
    document.addEventListener("visibilitychange",recover);
    return () => {
      controller.abort();
      clearTimeout(timer);
      clearTimeout(announcement);
      window.removeEventListener("online",recover);
      document.removeEventListener("visibilitychange",recover);
    };
  },[mode,roomId]);

  if (!titles) return null;
  return <aside className="wr-exploration-hints" aria-label="탐험 힌트">
    <div role="status" aria-live="polite">{alert && <span className="wr-exploration-hints__notice">
      <KionEmoteSticker preset={KION_EMOTE_PRESETS[0]} size={22} /> 키온이 새 힌트를 가져왔어요!
    </span>}</div>
    <details>
      <summary>탐험 힌트 {titles.length > 0 && <span>{titles.length}개</span>}</summary>
      {titles.length ? <ul>{titles.map((title,index) => <li key={title + index}>{title}</li>)}</ul>
        : <p>경기 시작 5분 뒤부터 목표 문서로 이어지는 문서명이 공개돼요.</p>}
    </details>
  </aside>;
}

export default function ExplorationHintPanel({ mode, roomId }) {
  return roomId ? <HintPanel key={mode + ":" + roomId} mode={mode} roomId={roomId} /> : null;
}
