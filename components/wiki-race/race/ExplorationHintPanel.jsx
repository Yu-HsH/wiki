import React, { useEffect, useRef, useState } from "react";
import { useAuth } from "../../../authContext.jsx";
import { getExplorationHints } from "../../../services/explorationHintService.js";
import { checkItemRaceSession } from "../../../services/itemModeEntryService.js";
import { itemRaceFailure } from "../../../services/itemRaceRecovery.js";
import "./explorationHintPanel.css";

function readSeenTitles(key) {
  try {
    const saved = JSON.parse(sessionStorage.getItem(key) ?? "[]");
    return new Set(Array.isArray(saved) ? saved : []);
  } catch {
    return new Set();
  }
}

function HintPanel({ mode, roomId, actorId, seenKey }) {
  const [hints, setHints] = useState(undefined);
  const [failure, setFailure] = useState(null);
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(() => !document.hidden);
  const [seen, setSeen] = useState(() => readSeenTitles(seenKey));
  const retry = useRef(null);

  useEffect(() => {
    const lifetime = new AbortController();
    let timer;
    let reading = false;
    async function load() {
      if (reading || lifetime.signal.aborted || document.hidden) return;
      clearTimeout(timer);
      reading = true;
      let delay = 8000;
      const signal = AbortSignal.any([lifetime.signal, AbortSignal.timeout(9000)]);
      try {
        const data = await getExplorationHints(mode, roomId, signal);
        if (lifetime.signal.aborted) return;
        setHints(data);
        setFailure(null);
        const timeUntilNext = Date.parse(data?.nextAt) - Date.parse(data?.serverNow);
        delay = Number.isFinite(timeUntilNext)
          ? Math.max(1200, Math.min(timeUntilNext <= 15000 ? 3000 : 300000, timeUntilNext + 100))
          : 30000;
      } catch (error) {
        if (lifetime.signal.aborted) return;
        const reason = itemRaceFailure(error);
        setFailure(reason.kind);
        if (reason.kind === "auth") void checkItemRaceSession(actorId);
      } finally {
        reading = false;
        if (!lifetime.signal.aborted) timer = setTimeout(load, delay);
      }
    }
    const recover = () => {
      setVisible(!document.hidden);
      if (!document.hidden) void load();
    };
    retry.current = load;
    void load();
    window.addEventListener("online", recover);
    document.addEventListener("visibilitychange", recover);
    return () => {
      lifetime.abort();
      clearTimeout(timer);
      window.removeEventListener("online", recover);
      document.removeEventListener("visibilitychange", recover);
    };
  }, [actorId, mode, roomId]);

  useEffect(() => {
    if (!open || !visible || document.hidden || failure === "denied" || !hints?.titles.some(title => !seen.has(title))) return;
    const next = new Set([...seen, ...hints.titles]);
    setSeen(next);
    try { sessionStorage.setItem(seenKey, JSON.stringify([...next])); } catch { /* The mount still remembers. */ }
  }, [failure, hints, open, seen, seenKey, visible]);

  if (hints === null && !failure) return null;
  const titles = failure === "denied" ? [] : hints?.titles ?? [];
  const unread = titles.filter(title => !seen.has(title)).length;
  const message = failure === "auth" ? "로그인 상태를 확인하고 있어요."
    : failure === "denied" ? "이 경기의 힌트를 볼 권한을 확인할 수 없어요."
    : failure ? "힌트를 불러오지 못했어요." : undefined;

  return <aside className="wr-exploration-hints" aria-label="탐험 힌트">
    <details onToggle={event => setOpen(event.currentTarget.open)}>
      <summary>탐험 힌트{" "}
        <span aria-live="polite" aria-atomic="true">{unread > 0
          ? <strong className="wr-exploration-hints__new">새 힌트 {unread}개</strong>
          : titles.length > 0 && `${titles.length}개`}</span>
      </summary>
      <div className="wr-exploration-hints__body">
        {message && <p role="status">{message} <button type="button" className="wr-race-btn"
          onClick={() => void retry.current?.()}>다시 확인</button></p>}
        {titles.length > 0 ? <ul>{titles.map(title => <li key={title}>{title}</li>)}</ul>
          : !message && <p role="status">{hints
            ? "경기 시작 5분 뒤부터 목표 문서로 이어지는 문서명이 공개돼요."
            : "탐험 힌트를 확인하는 중이에요."}</p>}
      </div>
    </details>
  </aside>;
}

export default function ExplorationHintPanel({ mode, roomId }) {
  const { user } = useAuth();
  const key = ["wiki-race:hint-seen", mode, roomId, user?.id].join(":");
  return roomId ? <HintPanel key={key} mode={mode} roomId={roomId} actorId={user?.id} seenKey={key} /> : null;
}
