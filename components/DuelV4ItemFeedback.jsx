import React, { useEffect, useState } from "react";
import { trapInstallerNotice } from "./group-items-jungle/finalAssetEvents.js";

const COPY = Object.freeze({
  item_stolen: "도둑의 손에 아이템을 빼앗겼어요.",
  trap_triggered: trapInstallerNotice,
});
const DISPLAY_DURATION_MS = 5_000;

function readSeen(key) {
  try {
    const stored = JSON.parse(sessionStorage.getItem(key) ?? "[]");
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
}

export default function DuelV4ItemFeedback({ scope, events, now }) {
  const key = "wiki-race:duel-v4-item-feedback:" + scope;
  const [seen, setSeen] = useState(() => readSeen(key));
  const [shown, setShown] = useState([]);

  useEffect(() => {
    if (!Array.isArray(events) || events.length === 0) return;
    const fresh = events.filter(({ id, kind, expiresAt }) =>
      Object.hasOwn(COPY, kind) && Date.parse(expiresAt) > now
      && !seen.some((entry) => entry.id === id));
    if (fresh.length === 0) return;
    const nextSeen = [
      ...seen.filter((entry) => Date.parse(entry.expiresAt) > now),
      ...fresh.map(({ id, expiresAt }) => ({ id, expiresAt })),
    ].slice(-48);
    setSeen(nextSeen);
    setShown((current) => [
      ...current.filter((entry) => entry.until > now),
      ...fresh.map(({ id, kind, outcome, expiresAt }) => ({
        id, kind, outcome, until: Math.min(now + DISPLAY_DURATION_MS, Date.parse(expiresAt)),
      })),
    ]);
    try {
      sessionStorage.setItem(key, JSON.stringify(nextSeen));
    } catch {
      // The current mount still deduplicates when session storage is unavailable.
    }
  }, [events, key, now, seen]);

  return shown.filter((entry) => entry.until > now).map(({ id, kind, outcome }) =>
    <p key={id} className="duel-v4-item-feedback item-race-status" role="status">
      {kind === "trap_triggered" ? trapInstallerNotice(outcome) : COPY[kind]}
    </p>);
}
