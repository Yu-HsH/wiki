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

async function loadSingle({ sourceId, userId, scope = "single", roomId }) {
  const [entries, summary, achievements] = await Promise.all([
    fetchResultXp({ sourceId }).catch((error) => {
      console.error("결과 XP 원장 조회 실패", error);
      return null;
    }),
    fetchXpSummary(userId).catch(() => null),
    loadAchievements(scope, scope === "group" ? roomId : sourceId),
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
    fetchXpSummary(userId).catch(() => null),
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
 * 스스로 조회한다. 조회 실패는 별도 안내하며 예상 XP를 표시하지 않는다.
 * 16c부터 이 결과가 연 업적을 함께 읽는다: XP 줄에 업적 XP를 더하고, 레벨업을 합산
 * 금액으로 판정하고(판정 9), XP 아래에 업적 reveal을 그린다.
 *
 * @param {object} props
 * @param {"single"|"duel"|"group"} props.scope
 * @param {boolean} [props.isGuest]
 * @param {string|null} [props.userId]
 * @param {string|null} [props.sourceId] 싱글: `game_records.id`, 그룹: `group_match_results.id`
 * @param {string|null} [props.roomId] 1:1/그룹: 방 ID
 * @param {"light"|"dark"} [props.tone]
 * @param {boolean} [props.unavailable] 결과 행 조회 자체가 실패했다 — 키가 없을 때 "불러오지 못했다"로 안내한다
 * @param {(count:number) => void} [props.onAchievementsLoaded] 이 결과가 연 업적 수
 */
export default function ResultXp({
  scope,
  isGuest = false,
  userId = null,
  sourceId = null,
  roomId = null,
  tone = "light",
  unavailable = false,
  onAchievementsLoaded = null,
}) {
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const onAchievementsLoadedRef = useRef(onAchievementsLoaded);
  onAchievementsLoadedRef.current = onAchievementsLoaded;

  useEffect(() => {
    if (isGuest || !userId) return undefined;
    const key = scope === "duel" ? roomId : sourceId;
    if (!key) return undefined;

    setData(null);
    setFailed(false);
    let cancelled = false;
    const isCancelled = () => cancelled;
    const load = scope === "duel"
      ? () => loadDuel({ roomId, userId }, isCancelled)
      : () => loadSingle({ sourceId, userId, scope, roomId });

    load()
      .then(async (loaded) => {
        if (cancelled || !loaded) return null;
        return { ...loaded, levelBefore: await loadLevelBefore({ scope, ...loaded }) };
      })
      .then((loaded) => {
        if (cancelled || !loaded) return;
        setData(loaded);
        setFailed(!Array.isArray(loaded.entries));
        onAchievementsLoadedRef.current?.(buildResultReveal(loaded.achievements)?.items.length ?? 0);
      })
      .catch((error) => {
        console.error("결과 XP를 불러오지 못했습니다.", error);
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [scope, isGuest, userId, sourceId, roomId]);

  // Phase 4 — 조회할 키가 없으면 영원히 "확인하는 중"에 머물지 않는다 (표시만, 원장·지급 경로 무변경).
  // 로그인 사용자가 없으면 게스트 계약(XP_GUEST_NOTE)을 그대로 쓰고, 결과 행이 없으면 지급 내역이 없다고 말한다.
  const showAsGuest = isGuest || !userId;
  const resultKey = scope === "duel" ? roomId : sourceId;
  if (!showAsGuest && !resultKey) {
    return <p className="rxp-note" role="status" data-testid="result-xp">{unavailable ? "XP 지급 정보를 불러오지 못했습니다." : "이 결과에 기록된 XP 지급 내역이 없습니다."}</p>;
  }

  const view = buildResultXpView({
    scope,
    isGuest: showAsGuest,
    entries: data?.entries ?? null,
    summary: data?.summary ?? null,
    achievementXp: data?.achievements?.xpTotal ?? 0,
    levelBefore: data?.levelBefore ?? null,
  });
  const reveal = buildResultReveal(data?.achievements ?? null);
  const revealBlock = reveal && reveal.items.length > 0
    ? <ResultAchievements reveal={reveal} tone={tone} />
    : null;
  if (!view) return <>
    {!showAsGuest && <p className="rxp-note" role="status">{failed ? "XP 지급 정보를 불러오지 못했습니다." : data ? "이 결과에 기록된 XP 지급 내역이 없습니다." : "XP 지급 정보를 확인하는 중입니다."}</p>}
    {revealBlock}
  </>;

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
