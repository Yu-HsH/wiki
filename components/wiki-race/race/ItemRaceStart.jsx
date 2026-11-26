import React, { useEffect, useRef } from "react";
import { audioManager } from "../../../services/audioManager.js";

const cueMs = 1400;

export default function ItemRaceStart({ matchKey, startedAt, now, enteredFromLobby }) {
  const started = Date.parse(startedAt);
  const age = now - started;
  const visible = enteredFromLobby && Number.isFinite(started) && age >= 0 && age < cueMs;
  const played = useRef(null);
  useEffect(() => {
    if (!visible || played.current === matchKey) return;
    played.current = matchKey;
    void audioManager.play("go", { key: `item-race-go:${matchKey}` });
  }, [matchKey, visible]);
  return visible && <span className="item-race-start" role="status" data-server-start-at={startedAt}>시작!</span>;
}
