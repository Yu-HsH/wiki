import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import ProfileCard from "./ProfileCard.jsx";
import {
  MATCH_EXPRESSION_SLOTS,
  PROFILE_CARD_SLOTS,
  equipErrorMessage,
  equippedAt,
  matchExpressionFromEquipment,
} from "../utils/profileCard.js";
import {
  equipProfileReward,
  fetchOwnMatchExpression,
  unequipProfileReward,
} from "../services/profileRewardService.js";
import { pathColor, frameTier, finishTier } from "../utils/rewardTokens.js";
import { audioManager } from "../services/audioManager.js";

/**
 * 프로필 꾸미기 — 장착 편집 (트랙 17b, C5 §4 "프로필 = 장착 편집 진입점").
 *
 * 시안이 없어 기능 우선 최소 UI다. 카드 4행(아이콘 · 칭호 · 프레임 · 배경 — 16d에서 배지 폐지)과
 * **경기 표현** 2행(완주 효과 · 경로 색상, 16d 판정 4)마다 현재 장착과 "변경" 버튼이 있고,
 * 열면 그 kind의 보유 목록이 펼쳐진다. 모든 slot의 `slot_index`는 1이다 (C1 §0.-1).
 *
 * - **보유 목록만 고를 수 있다.** 목록은 `fetchOwnRewardInventory`가 준다 (C1 §2 본인 RLS).
 * - **서버가 확정한 상태만 반영한다** (spec §10). 낙관적 갱신 없음 — 응답의 전체 장착 상태를
 *   `onEquipment`로 넘기고 호출자가 카드를 다시 만든다. 경기 표현은 카드에 없으므로 이 컴포넌트가
 *   같은 응답에서 직접 갱신한다.
 * - **은퇴 보상** (C1-②)은 장착된 채 "은퇴" 표식으로 보이고, 해제만 할 수 있다.
 * - 옛 DB의 배지 보상(`kind = 'badge'`)은 어느 행에도 해당하지 않아 보이지 않는다.
 * - 모바일은 `<details>`로 접힌다 (spec §11 "모바일 보상 inventory는 접을 수 있는 섹션").
 *
 * @param {object} props
 * @param {object} props.card 현재 카드 (C5 §2)
 * @param {Array<{rewardId:string, kind:string, displayName:string, assetRef:string|null}>} props.owned
 * @param {(equipment: Array) => void} props.onEquipment
 * @param {boolean} [props.loading]
 */
export default function ProfileRewardEditor({ card, owned = [], onEquipment, loading = false, goals = [] }) {
  const [openKey, setOpenKey] = useState(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [matchExpression, setMatchExpression] = useState(() => matchExpressionFromEquipment([]));

  const userId = card?.userId ?? null;
  useEffect(() => {
    if (!userId) return undefined;
    let cancelled = false;
    fetchOwnMatchExpression(userId)
      .then((value) => {
        if (!cancelled) setMatchExpression(value);
      })
      .catch((loadError) => console.error("경기 표현 장착 상태 로드 실패:", loadError));
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const cardRows = PROFILE_CARD_SLOTS.map((definition) => ({
    ...definition,
    current: equippedAt(card, definition.slot),
  }));
  const matchRows = MATCH_EXPRESSION_SLOTS.map((definition) => ({
    ...definition,
    current: matchExpression[definition.slot] ?? null,
  }));

  const run = async (request) => {
    const requestSound = audioManager.action('profile-save');
    setPending(true);
    setError("");
    setFeedback("");
    try {
      const equipment = await request();
      requestSound('saved');
      onEquipment?.(equipment);
      setMatchExpression(matchExpressionFromEquipment(equipment));
      setOpenKey(null);
      setFeedback("장착 상태를 저장했습니다. 카드 꾸미기는 위 미리보기에서, 경기 표현은 탐험 중에 확인할 수 있습니다.");
    } catch (requestError) {
      requestSound('denied');
      setError(equipErrorMessage(requestError?.code));
    } finally {
      setPending(false);
    }
  };

  const renderRow = (row) => {
    const { current } = row;
    const choices = owned.filter((reward) => reward.kind === row.slot);
    const locked = goals.filter(r => r.kind === row.slot && !owned.some(o => o.rewardId === r.rewardId));
    const isOpen = openKey === row.slot;
    const panelId = `preward-panel-${row.slot}`;

    return (
      <li key={row.slot} className={`preward-row${current ? " preward-row--equipped" : " preward-row--empty"}`}>
        <div className="preward-row-head">
          <span className="preward-label">{row.label}</span>
          <span className="preward-current">
            {current ? current.displayName : "비어 있음"}
            {current?.retired && <span className="preward-tag">은퇴</span>}<small className="preward-ownership">{current ? "장착 중" : choices.length ? `보유 ${choices.length}개 · 선택 가능` : "미보유 · 업적에서 보상 확인"}</small>
          </span>
          <button
            type="button"
            className="app-btn app-btn-ghost preward-toggle"
            aria-expanded={isOpen}
            aria-controls={panelId}
            aria-label={`${row.label} 변경`}
            onClick={() => setOpenKey(isOpen ? null : row.slot)}
            disabled={pending}
          >
            {isOpen ? "닫기" : "변경"}
          </button>
        </div>

        {isOpen && (
          <div id={panelId} className="preward-panel" role="group" aria-label={`${row.label} 선택`}>
            {choices.length === 0 && <p className="preward-muted">보유한 보상이 없습니다.</p>}
            {choices.map((reward) => {
              const selected = current?.rewardId === reward.rewardId;
              const swatch = row.slot === "path_color" ? pathColor(reward) : null;
              return (
                <button
                  key={reward.rewardId}
                  type="button"
                  className={`preward-choice${selected ? " preward-choice--selected" : ""}`}
                  aria-pressed={selected}
                  disabled={pending || selected}
                  onClick={() => run(() => equipProfileReward({ slot: row.slot, slotIndex: 1, rewardId: reward.rewardId }))}
                >
                  {/* 빈 alt 금지 (C5 §3.4) — 이미지가 이름을 갖고 글자는 중복 낭독하지 않는다 */}
                  {reward.assetRef && row.slot === "profile_icon" ? (
                    <>
                      <img className="preward-choice-img" src={reward.assetRef} alt={reward.displayName} />
                      <span aria-hidden="true">{reward.displayName}</span>
                    </>
                  ) : (
                    <>
                      {/* 경로 색상은 노드 테두리로만 보여 준다 (DESIGN-SYSTEM §1.1 — 면 채움 없음) */}
                      {swatch && <span className="preward-swatch" style={{ borderColor: swatch }} aria-hidden="true" />}
                      {row.slot === "frame" && <span className={`preward-preview preward-preview--${frameTier(reward) || "default"}`} aria-label="프레임 미리보기">◎</span>}
                      {row.slot === "finish_effect" && <span className={`preward-preview preward-preview--${finishTier(reward) || "default"}`} aria-label="완주 효과 단계 미리보기">✦</span>}
                      {row.slot === "background" && <span aria-hidden="true"><ProfileCard card={{ ...card, background: reward }} size="sm" density="full" /></span>}
                      <span>{reward.displayName}</span>
                    </>
                  )}
                  <span className="preward-tag">{selected ? "장착 중" : "보유 · 장착 가능"}</span>
                </button>
              );
            })}
            {locked.length > 0 && <div className="preward-goals"><p className="wr-kicker">다음 수집 목표 · 미보유</p>{locked.map((reward,i) => <div key={`${reward.rewardId}-${i}`} className="preward-locked"><strong>{reward.displayName}</strong><small>{reward.achievementName} · {reward.condition}</small>{Number.isFinite(reward.current) && Number.isFinite(reward.threshold) && <small>진행 {reward.current} / 목표 {reward.threshold}</small>}<Link to="/achievements">도감에서 획득 목표 확인 →</Link></div>)}</div>}
            {current && (
              <button
                type="button"
                className="app-btn app-btn-ghost preward-clear"
                disabled={pending}
                onClick={() => run(() => unequipProfileReward({ slot: row.slot, slotIndex: 1 }))}
              >
                해제
              </button>
            )}
          </div>
        )}
      </li>
    );
  };

  return (
    <details className="preward" open>
      <summary className="preward-summary">수집 보상 · 프로필 꾸미기</summary><p className="preward-guide">아이콘·칭호·프레임·배경은 위 카드에 반영됩니다. 보유한 보상을 선택하면 서버가 확인한 장착 상태로 미리보기가 바뀝니다.</p>
      <p className="preward-guide">아직 비어 있는 슬롯이 있나요? <Link to="/achievements">발견 도감에서 다음 보상 살펴보기 →</Link></p>

      {loading ? (
        <p className="preward-muted">보유 보상을 불러오는 중...</p>
      ) : (
        <>
          <ul className="preward-rows">{cardRows.map(renderRow)}</ul>
          <p className="preward-group-label">경기 표현</p>
          <ul className="preward-rows">{matchRows.map(renderRow)}</ul>
          <p className="preward-guide">완주 효과는 목표에 도착했을 때, 경로 색상은 탐험 경로에 반영됩니다.</p>
        </>
      )}

      {pending && <p className="preward-guide" role="status">장착 상태를 저장하는 중…</p>}
      {feedback && <p className="preward-feedback" role="status">{feedback} <a href="#profile-card-preview">저장된 카드 보기 ↑</a></p>}
      {error && (
        <p className="auth-error preward-error" role="alert">
          {error}
        </p>
      )}
    </details>
  );
}
