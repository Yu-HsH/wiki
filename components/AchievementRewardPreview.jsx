import React from "react";
import ProfileCard from "./ProfileCard.jsx";
import { PROFILE_CARD_SLOTS, MATCH_EXPRESSION_SLOTS } from "../utils/profileCard.js";
import { REWARD_KIND_LABELS } from "../utils/achievementDisplay.js";
import { finishTier, pathColor } from "../utils/rewardTokens.js";

// Only public RewardRefs from the achievement RPC. A specimen never changes equipment.
export default function AchievementRewardPreview({ reward, ownedIds }) {
  const slot = PROFILE_CARD_SLOTS.find(item => item.slot === reward.kind);
  const match = MATCH_EXPRESSION_SLOTS.find(item => item.slot === reward.kind);
  const color = reward.kind === "path_color" ? pathColor(reward) : null;
  const finish = reward.kind === "finish_effect" ? finishTier(reward) : null;
  return <div className="album-reward">
    <div className="album-reward-label"><small>{REWARD_KIND_LABELS[reward.kind] || "보상"}</small><strong>{reward.displayName}</strong></div>
    {slot && reward.assetRef && <div className="album-reward-specimen" aria-label={`${reward.displayName} 견본 · 장착 상태가 아닙니다`}>
      <ProfileCard card={{ nickname: "보상 견본", [slot.cardKey]: reward }} size="md" density="full" />
    </div>}
    {color && <span className="preward-swatch" style={{ borderColor: color }} aria-label="경로 색상 견본" />}
    {finish && <span className={`preward-preview preward-preview--${finish}`} aria-label="완주 효과 단계 견본">✦</span>}
    {!reward.assetRef && <small>{reward.kind === 'title' ? '프로필에 표시할 수 있는 칭호입니다.' : reward.kind === 'spectator_emoji' ? '관전 중 보낼 수 있는 반응입니다.' : '달성하면 수집할 수 있는 보상입니다.'}</small>}
    <small>{slot ? `프로필 · ${slot.label}` : match ? `경기 표현 · ${match.label}` : '업적 달성 보상'}</small>
    <small className="album-ownership">{ownedIds === null ? "보유 여부 확인 불가" : ownedIds.has(reward.rewardId) ? "보유 · 프로필에서 확인 가능" : "미보유 · 달성 후 수집"}</small>
  </div>;
}
