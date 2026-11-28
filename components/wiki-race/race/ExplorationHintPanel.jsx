import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { KionEmoteSticker } from "../../KionEmotes.jsx";
import { KION_EMOTE_PRESETS } from "../../../utils/kionEmoteCatalog.js";
import { getExplorationHints } from "../../../services/explorationHintService.js";
import "./explorationHintPanel.css";

function HintPanel({ mode, roomId }) {
  const [titles,setTitles] = useState(null);
  const [fresh,setFresh] = useState([]);
  const disclosure = useRef(null);
  const animated = mode === "duel_items" || mode === "group_items";

  useEffect(() => {
    const controller = new AbortController();
    let timer, announcement, previous, loading = false;
    async function load() {
      if (loading || controller.signal.aborted) return;
      loading = true;
      let delay = 15000;
      try {
        const hints = await getExplorationHints(mode,roomId,controller.signal);
        if (controller.signal.aborted || !hints) return;
        setTitles(hints.titles);
        const additions = previous ? hints.titles.filter(title => !previous.has(title)) : [];
        if (additions.length && (!animated || !document.hidden)) {
          clearTimeout(announcement);
          setFresh(additions);
          if (animated && disclosure.current) disclosure.current.open = true;
          announcement = setTimeout(() => setFresh([]),animated ? 5500 : 4000);
        }
        previous = new Set(hints.titles);
        const next = Date.parse(hints.nextAt) - Date.parse(hints.serverNow);
        if (Number.isFinite(next)) delay = Math.max(1500,Math.min(300000,next+100));
      } catch { /* Hint availability is independent of the race. */ }
      finally { loading = false; }
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
  },[animated,mode,roomId]);

  if (!titles) return null;
  return <aside className="wr-exploration-hints" aria-label="탐험 힌트">
    {animated ? fresh.length > 0 && createPortal(<div role="status" aria-live="polite" className="wr-exploration-hints__notice is-animated">
      <KionEmoteSticker preset={KION_EMOTE_PRESETS[0]} size={36} /> 키온이 새 힌트 {fresh.length}개를 가져왔어요!
    </div>,document.body) : <div role="status" aria-live="polite">{fresh.length > 0 && <span className="wr-exploration-hints__notice">
      <KionEmoteSticker preset={KION_EMOTE_PRESETS[0]} size={22} /> 키온이 새 힌트를 가져왔어요!
    </span>}</div>}
    <details ref={disclosure}>
      <summary>탐험 힌트 {titles.length > 0 && <span>{titles.length}개</span>}</summary>
      {titles.length ? <ul>{titles.map((title,index) => <li key={title + index} data-new-hint={animated && fresh.includes(title) || undefined}>{title}</li>)}</ul>
        : <p>경기 시작 5분 뒤부터 목표 문서로 이어지는 문서명이 공개돼요.</p>}
    </details>
  </aside>;
}

export default function ExplorationHintPanel({ mode, roomId }) {
  return roomId ? <HintPanel key={mode + ":" + roomId} mode={mode} roomId={roomId} /> : null;
}
