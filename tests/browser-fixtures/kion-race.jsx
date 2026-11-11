import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { RaceRoomEmotesView } from "../../components/RaceRoomEmotes.jsx";
import { getVisibleRaceEmotes } from "../../utils/raceEmotePresentation.js";

const names = new Map([["self","나"],["opponent","상대"],["third","탐험가123"],["fourth","문서왕"],["fifth","링크마스터"],["sixth","키온팬"]]);
const event = (id, userId, emoteId) => ({
  id, roomId: "fixture", userId, emoteId, createdAt: Date.now(),
});

function Demo({ group = false }) {
  const [rows, setRows] = useState(() => group
    ? [
      event("g1","opponent","hello"),event("g2","third","good"),
      event("g3","fourth","wow"),event("g4","fifth","ready"),
      event("g5","sixth","gg"),event("g6","self","hurry"),
    ]
    : [event("first","opponent","hello")]
  );
  const [hidden, setHidden] = useState(false);
  const [wikiClicks, setWikiClicks] = useState(0);
  const [itemClicks, setItemClicks] = useState(0);
  return (
    <div className="frame" id={group ? "group" : "duel"}>
      <div className="hud">{group ? "그룹 레이스 · 현재 문서 / 목표 문서" : "1:1 대전 · 현재 문서 / 목표 문서"}</div>
      <RaceRoomEmotesView
        visible={getVisibleRaceEmotes(rows, Date.now(), false, "fixture")}
        namesByUserId={names}
        connected
        hidden={hidden}
        onToggleHidden={() => setHidden((value) => !value)}
        onSend={(emoteId) =>
          setRows((prev) => [...prev.filter((e) => e.userId !== "self"), event("mine-"+emoteId, "self", emoteId)])
        }
      />
      <div className="article">
        <h2>위키백과 문서 영역</h2>
        <p>이모티콘은 문서를 덮지 않고 위쪽의 독립된 표시줄에 나타납니다.</p>
        <button type="button" className="wiki-click" onClick={() => setWikiClicks(n => n + 1)}>문서 링크 {wikiClicks}</button>
        {!group && <button type="button" className="item-click" onClick={() => setItemClicks(n => n + 1)}>아이템 사용 {itemClicks}</button>}
      </div>
    </div>
  );
}
function App() {
  return <main className="demo"><h1>키온 · 경기 중 감정표현</h1><Demo /><Demo group /></main>;
}
createRoot(document.getElementById("root")).render(<App />);
