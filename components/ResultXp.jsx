import React, { useEffect, useState } from "react";
import XpProgress from "./XpProgress.jsx";
import { fetchDuelResultXp, fetchResultXp, fetchXpSummary } from "../services/xpService.js";
import { buildResultXpView } from "../utils/xpResultDisplay.js";

/** 1:1에서 첫 조회가 비었을 때 한 번 더 기다리는 시간 — realtime 신호가 커밋보다 먼저 올 때. */
const DUEL_RETRY_DELAY_MS = 800;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function loadSingle({ sourceId, userId }) {
  const [entries, summary] = await Promise.all([
    fetchResultXp({ sourceId }),
    fetchXpSummary(userId),
  ]);
  return { entries, summary };
}

async function loadDuel({ roomId, userId }, isCancelled) {
  let result = await fetchDuelResultXp({ roomId });
  if (result.entries.length === 0) {
    await wait(DUEL_RETRY_DELAY_MS);
    if (isCancelled()) return null;
    result = await fetchDuelResultXp({ roomId });
  }
  if (result.entries.length === 0) {
    // 정상 승패 1:1은 반드시 지급 행이 있다. 없으면 15c-1 트리거가 격리 경로(WARNING)로
    // 빠졌을 가능성이 크다 — grant_result_xp_v1로 재지급할 단서를 남긴다.
    console.warn("[ResultXp] duel result has no XP ledger row", { roomId, matchId: result.matchId });
  }
  const summary = await fetchXpSummary(userId);
  return { entries: result.entries, summary };
}

/**
 * 결과 화면 XP 영역 (패킷 15 §6, Freeze 순서 결과 ▸ 기록 ▸ **XP** ▸ 업적 ▸ 경로 ▸ 행동).
 *
 * 스스로 조회한다. 실패하면 아무것도 그리지 않는다 — 결과 화면을 막지 않는다.
 *
 * @param {object} props
 * @param {"single"|"duel"} props.scope
 * @param {boolean} [props.isGuest]
 * @param {string|null} [props.userId]
 * @param {string|null} [props.sourceId] 싱글: `game_records.id`
 * @param {string|null} [props.roomId] 1:1: 방 ID
 * @param {"light"|"dark"} [props.tone]
 */
export default function ResultXp({
  scope,
  isGuest = false,
  userId = null,
  sourceId = null,
  roomId = null,
  tone = "light",
}) {
  const [data, setData] = useState(null);

  useEffect(() => {
    if (isGuest || !userId) return undefined;
    const key = scope === "duel" ? roomId : sourceId;
    if (!key) return undefined;

    let cancelled = false;
    const isCancelled = () => cancelled;
    const load = scope === "duel"
      ? () => loadDuel({ roomId, userId }, isCancelled)
      : () => loadSingle({ sourceId, userId });

    load()
      .then((loaded) => {
        if (!cancelled && loaded) setData(loaded);
      })
      .catch((error) => {
        console.error("결과 XP를 불러오지 못했습니다.", error);
      });

    return () => {
      cancelled = true;
    };
  }, [scope, isGuest, userId, sourceId, roomId]);

  const view = buildResultXpView({
    scope,
    isGuest,
    entries: data?.entries ?? null,
    summary: data?.summary ?? null,
  });
  if (!view) return null;

  const className = `rxp rxp--${tone}`;

  if (view.kind !== "granted") {
    return (
      <div className={className} data-testid="result-xp">
        <p className="rxp-note">{view.note}</p>
      </div>
    );
  }

  return (
    <div className={className} data-testid="result-xp">
      {view.lines.map((line) => (
        <div key={line.sourceType} className="rxp-line">
          <span className="rxp-gain">{line.gain}</span>
          <span className="rxp-reason">{line.reason}</span>
          {line.decayNote && <span className="rxp-decay">{line.decayNote}</span>}
        </div>
      ))}
      {view.levelUp && (
        <p className="rxp-levelup" role="status">
          레벨 업! Lv.{view.levelUp.from} → Lv.{view.levelUp.to}
        </p>
      )}
      <XpProgress summary={view.summary} className="rxp-progress" />
    </div>
  );
}
