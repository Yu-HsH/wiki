import React from "react";
import { Link } from "react-router-dom";
import AchievementRewardPreview from "./AchievementRewardPreview.jsx";

// Presentation only. ResultAchievements owns reveal order and seen processing.
export default function SingleAchievementCard({ item }) {
  return <article className={`ach-reveal-card wr-single-achievement${item.hidden ? " ach-reveal-card--hidden" : ""}`}>
    <div className="wr-single-achievement-medal" aria-hidden="true">
      <svg viewBox="0 0 64 76" fill="none"><path d="m19 47-4 25 17-9 17 9-4-25" fill="currentColor" opacity=".18"/><path d="m32 3 9 5 10 2 3 10 6 9-6 10-3 10-10 2-9 5-9-5-10-2-3-10-6-10 6-9 3-10 10-2Z" fill="currentColor" opacity=".14"/><circle cx="32" cy="29" r="19" stroke="currentColor" strokeWidth="1.5"/><path d="m23 29 6 6 12-13" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>
    </div>
    <div className="wr-single-achievement-content">
      <div className="ach-reveal-head"><span className="ach-reveal-tag">{item.hidden ? `히든 업적${item.kindLabel ? ` · ${item.kindLabel}` : ""}` : "업적 달성"}</span>
        {item.xp > 0 && <span className="ach-reveal-xp">+{item.xp.toLocaleString("ko-KR")} XP</span>}
      </div>
      <h3 className="ach-reveal-name">{item.name}{item.tierLabel && <span className="ach-tier"> {item.tierLabel}</span>}</h3>
      {item.condition && <p className="ach-reveal-condition">{item.condition}</p>}
      <span className="album-reveal-stamp">✓ 발견 기록 완료</span>
      {item.rewards.length > 0 && <div className="ach-reveal-rewards">
        <strong>이번 해금 보상</strong>
        <ul className="wr-single-reward-chips">{item.rewards.map((reward, index) => <li key={index}>{reward}</li>)}</ul>
        {item.rewardRefs?.length > 0 && <details className="wr-earned-rewards"><summary>보상 견본과 장착 위치 보기</summary>
          {item.rewardRefs.map(reward => <AchievementRewardPreview key={reward.rewardId} reward={reward} ownedIds={null} />)}
        </details>}
        <Link className="wr-reward-profile-link" to="/profile">프로필에서 보유·장착 확인 →</Link>
      </div>}
    </div>
  </article>;
}
