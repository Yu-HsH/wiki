import React from "react";
import { finishTier } from "../utils/rewardTokens.js";

/**
 * 완주 효과 — 결과 화면의 도착 노드 연출 (16d 판정 4, DESIGN-SYSTEM §3).
 *
 * 금(목표·승리) 링이 단계마다 두꺼워지고 tier-3·special은 한 번 퍼지는 링이 더해진다.
 * 모션 감소면 정적이다 (css/matchExpression.css). 토큰이 없으면(옛 DB) `tier-1` 모양.
 * 완주 효과를 장착하지 않았으면 아무것도 그리지 않는다 — 호출자는 `children`(기본 노드)을 그대로 둔다.
 *
 * @param {object} props
 * @param {object|null} props.effect 장착한 완주 효과 RewardRef
 * @param {React.ReactNode} [props.children] 감쌀 노드 (싱글 경로의 마지막 점). 없으면 단독 표식
 */
export default function FinishEffect({ effect, children = null }) {
  if (!effect) return children;
  const tier = finishTier(effect) ?? "tier-1";
  return (
    <span className={`fx-finish fx-finish--${tier}${children ? "" : " fx-finish--standalone"}`} data-testid="finish-effect">
      {children ?? <span className="fx-finish-node" aria-hidden="true" />}
      <span className="fx-sr">완주 효과 {effect.displayName}</span>
    </span>
  );
}
