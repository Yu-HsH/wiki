import React, { useEffect, useRef, useState } from "react";
import XpProgress from "./XpProgress.jsx";
import ResultAchievements from "./ResultAchievements.jsx";
import { fetchDuelResultXp, fetchResultXp, fetchXpSummary } from "../services/xpService.js";
import { fetchLevelAtTotalXp, fetchResultAchievements } from "../services/achievementService.js";
import { buildResultXpView, formatLevelUp } from "../utils/xpResultDisplay.js";
import { buildResultReveal } from "../utils/achievementDisplay.js";

/** 1:1에서 첫 조회가 비었을 때 한 번 더 기다리는 시간 — realtime 신호가 커밋보다 먼저 올 때. */
const DUEL_RETRY_DELAY_MS = 800;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 업적은 결과 행과 같은 트랜잭션에서 열린다 (16b `trg_record_*`는 결과 INSERT의 AFTER 트리거).
 * 결과 XP가 보이면 해금도 보이므로 따로 재시도하지 않는다. 실패해도 XP 영역은 그린다.
 */
async function loadAchievements(scope, resultId) {
  if (!resultId) return null;
  try {
    return await fetchResultAchievements({ scope, resultId });
  } catch (error) {
    console.error("결과 업적을 불러오지 못했습니다.", error);
    return null;
  }
}

async function loadSingle({ sourceId, userId }) {
  const [entries, summary, achievements] = await Promise.all([
    fetchResultXp({ sourceId }),
    fetchXpSummary(userId),
    loadAchievements("single", sourceId),
  ]);
  return { entries, summary, achievements };
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
  const [summary, achievements] = await Promise.all([
    fetchXpSummary(userId),
    loadAchievements("duel", result.matchId),
  ]);
  return { entries: result.entries, summary, achievements };
}

/**
 * 획득 전 레벨 — 레벨이 올랐을 수 있을 때만 서버에 묻는다 (판정 9, 다중 레벨업).
 * 공식은 DB의 `level_from_total_xp`에만 있다. 실패하면 `null` — "올랐다"만 표시한다.
 */
async function loadLevelBefore({ scope, entries, summary, achievements }) {
  const view = buildResultXpView({
    scope,
    entries,
    summary,
    achievementXp: achievements?.xpTotal ?? 0,
  });
  if (!view?.levelUp || !summary) return null;
  try {
    return await fetchLevelAtTotalXp(summary.totalXp - view.totalAmount);
  } catch (error) {
    console.error("획득 전 레벨을 불러오지 못했습니다.", error);
    return null;
  }
}

/**
 * 결과 화면 XP 영역 (패킷 15 §6, Freeze 순서 결과 ▸ 기록 ▸ **XP** ▸ **업적** ▸ 경로 ▸ 행동).
 *
 * 스스로 조회한다. 실패하면 아무것도 그리지 않는다 — 결과 화면을 막지 않는다.
 * 16c부터 이 결과가 연 업적을 함께 읽는다: XP 줄에 업적 XP를 더하고, 레벨업을 합산
 * 금액으로 판정하고(판정 9), XP 아래에 업적 reveal을 그린다.
 *
 * @param {object} props
 * @param {"single"|"duel"} props.scope
 * @param {boolean} [props.isGuest]
 * @param {string|null} [props.userId]
 * @param {string|null} [props.sourceId] 싱글: `game_records.id`
 * @param {string|null} [props.roomId] 1:1: 방 ID
 * @param {"light"|"dark"} [props.tone]
 * @param {(count:number) => void} [props.onAchievementsLoaded] 이 결과가 연 업적 수 — 1:1 결과 유지 시간이 쓴다
 */
export default function ResultXp({
  scope,
  isGuest = false,
  userId = null,
  sourceId = null,
  roomId = null,
  tone = "light",
  onAchievementsLoaded = null,
}) {
  const [data, setData] = useState(null);
  const onAchievementsLoadedRef = useRef(onAchievementsLoaded);
  onAchievementsLoadedRef.current = onAchievementsLoaded;

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
      .then(async (loaded) => {
        if (cancelled || !loaded) return null;
        return { ...loaded, levelBefore: await loadLevelBefore({ scope, ...loaded }) };
      })
      .then((loaded) => {
        if (cancelled || !loaded) return;
        setData(loaded);
        onAchievementsLoadedRef.current?.(loaded.achievements?.achievements?.length ?? 0);
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
    achievementXp: data?.achievements?.xpTotal ?? 0,
    levelBefore: data?.levelBefore ?? null,
  });
  const reveal = buildResultReveal(data?.achievements ?? null);
  const revealBlock = reveal && reveal.items.length > 0
    ? <ResultAchievements reveal={reveal} tone={tone} />
    : null;
  if (!view) return revealBlock;

  const className = `rxp rxp--${tone}`;

  if (view.kind !== "granted") {
    return (
      <div className={className} data-testid="result-xp">
        <p className="rxp-note">{view.note}</p>
        {revealBlock}
      </div>
    );
  }

  const levelUpText = formatLevelUp(view.levelUp);

  return (
    <div className={className} data-testid="result-xp">
      {view.note && <p className="rxp-note">{view.note}</p>}
      {view.lines.map((line) => (
        <div key={line.sourceType} className="rxp-line">
          <span className="rxp-gain">{line.gain}</span>
          <span className="rxp-reason">{line.reason}</span>
          {line.decayNote && <span className="rxp-decay">{line.decayNote}</span>}
        </div>
      ))}
      {levelUpText && (
        <p className="rxp-levelup" role="status">
          {levelUpText}
        </p>
      )}
      <XpProgress summary={view.summary} className="rxp-progress" />
      {revealBlock}
    </div>
  );
}
