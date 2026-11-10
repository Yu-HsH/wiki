import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { RoomLobbyEmotesView } from "../../components/RoomLobbyEmotes.jsx";

const names = new Map([["a", "나"], ["b", "위키탐험가"], ["c", "첫발걸음"]]);
const seed = (id, userId, emoteId) => ({ id, roomId: "demo", userId, emoteId, createdAt: Date.now() });

function Preview() {
  const [duel, setDuel] = useState(() => [seed("one", "b", "hello")]);
  const [group, setGroup] = useState(() => [seed("two", "c", "good"), seed("three", "b", "wow")]);
  const [feedback, setFeedback] = useState("");
  const namesByUserId = useMemo(() => names, []);
  return (
    <main className="preview">
      <h1>키온 · 준비방 감정표현</h1>
      <section className="camp" id="duel">
        <span className="camp-marker">DUEL · READY CAMP</span>
        <h2>1:1 대전 준비</h2>
        <p>두 탐험가가 같은 목표를 확인하는 준비방</p>
        <RoomLobbyEmotesView
          visible={duel} namesByUserId={namesByUserId} connected
          clock={Date.now()} cooldownUntil={0}
          feedback={feedback}
          onSend={(emoteId) => {
            setDuel((previous) => [...previous.filter((e) => e.userId !== "a"), seed("mine-" + emoteId, "a", emoteId)]);
            setFeedback("");
          }}
        />
      </section>
      <section className="camp" id="group">
        <span className="camp-marker">GROUP · EXPEDITION CAMP</span>
        <h2>탐험가 집결 캠프</h2>
        <p>3–8명의 탐험가가 READY와 함께 대기하는 모습</p>
        <RoomLobbyEmotesView
          visible={group} namesByUserId={namesByUserId} connected
          clock={Date.now()} cooldownUntil={0}
          onSend={(emoteId) => setGroup((previous) => [...previous.filter((e) => e.userId !== "a"), seed("my-group-" + emoteId, "a", emoteId)])}
        />
      </section>
    </main>
  );
}
createRoot(document.getElementById("root")).render(<Preview />);
