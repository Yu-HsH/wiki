import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LOBBY_PATH } from "../utils/appRoutes";
import { fetchMyAchievements, markAchievementsSeen } from "../services/achievementService.js";
import { buildAchievementScreen } from "../utils/achievementDisplay.js";

/**
 * 업적 화면 (트랙 16c). `get_my_achievements_v1` 한 번으로 그린다.
 *
 * - 일반 업적: 분류별 섹션 · 카드마다 단계 · 진행도 · 다음 단계 보상
 * - 히든: 카드 1장 `발견 n / ??` + 해금한 히든 카드만 (판정 5 — 총개수는 서버가 주지 않는다)
 * - NEW: 처음 읽은 응답의 미확인 해금에 붙인다. 그린 직후 전부 seen으로 표시한다 —
 *   이번 방문에는 NEW가 남고 다음 방문부터 사라진다. **seen은 이 화면 진입 시에만**
 *   남긴다 (로비 알림 닫기는 세션 숨김뿐) `[사용자 결정, 2026-10-03]`.
 */
export default function AchievementsPage() {
  const navigate = useNavigate();
  const [screen, setScreen] = useState(null);
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    let cancelled = false;
    fetchMyAchievements()
      .then((response) => {
        if (cancelled) return;
        const built = buildAchievementScreen(response);
        setScreen(built);
        setStatus("ready");
        if (built?.unseenCount > 0) {
          markAchievementsSeen().catch((error) => {
            console.error("업적 확인 표시를 남기지 못했습니다.", error);
          });
        }
      })
      .catch((error) => {
        console.error("업적을 불러오지 못했습니다.", error);
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="dashboard-page">
      <header className="dashboard-header">
        <div>
          <p className="dashboard-badge">ACHIEVEMENTS</p>
          <h1>업적</h1>
          <p className="dashboard-muted">탐험하면서 모은 업적과 보상입니다.</p>
        </div>
        <div className="header-actions">
          <button type="button" className="app-btn app-btn-ghost" onClick={() => navigate(LOBBY_PATH)}>
            Lobby
          </button>
        </div>
      </header>

      {status === "loading" && <p className="dashboard-muted ach-status" aria-busy="true">업적을 불러오는 중…</p>}
      {status === "error" && <p className="dashboard-muted ach-status">업적을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</p>}

      {status === "ready" && screen && (
        <div className="ach-page">
          <section className="dashboard-card ach-section" aria-labelledby="ach-hidden-title">
            <h2 id="ach-hidden-title" className="ach-section-title">히든 업적</h2>
            <div className="ach-card ach-card--hidden-summary">
              <div className="ach-card-head">
                <span className="ach-hidden-count">{screen.hidden.label}</span>
                {screen.hidden.isNew && <span className="ach-new">NEW</span>}
              </div>
            </div>
            {screen.hidden.cards.map((card) => (
              <AchievementCard key={card.achievementId} card={card} />
            ))}
          </section>

          {screen.sections.map((section) => (
            <section
              key={section.category}
              className="dashboard-card ach-section"
              aria-labelledby={`ach-${section.category}-title`}
            >
              <h2 id={`ach-${section.category}-title`} className="ach-section-title">{section.label}</h2>
              {section.cards.map((card) => (
                <AchievementCard key={card.achievementId} card={card} />
              ))}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function AchievementCard({ card }) {
  return (
    <div className={`ach-card${card.hidden ? " ach-card--hidden" : ""}${card.complete ? " ach-card--complete" : ""}`}>
      <div className="ach-card-head">
        <span className="ach-card-name">
          {card.name}
          {card.tierLabel && <span className="ach-tier"> {card.tierLabel}</span>}
        </span>
        {card.kindLabel && <span className="ach-kind">{card.kindLabel}</span>}
        {card.isNew && <span className="ach-new">NEW</span>}
      </div>
      {card.condition && <div className="ach-card-condition">{card.condition}</div>}

      {card.steps.length > 1 && (
        <ol className="ach-steps" aria-label={`단계 ${card.unlockedTier} / ${card.tierCount}`}>
          {card.steps.map((step) => (
            <li key={step.tier} className={step.unlocked ? "ach-step ach-step--done" : "ach-step"}>
              {step.label}
            </li>
          ))}
        </ol>
      )}

      {card.progress && (
        <div className="ach-progress">
          <div
            className="ach-progress-bar"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={card.progress.next}
            aria-valuenow={card.progress.current}
          >
            <span style={{ width: `${card.progress.percent}%` }} />
          </div>
          <span className="ach-progress-label">{card.progress.label}</span>
        </div>
      )}

      {card.next ? (
        <div className="ach-next">
          다음 보상{card.next.tierLabel ? ` (${card.next.tierLabel})` : ""}: +{card.next.xp.toLocaleString("ko-KR")} XP
          {card.next.rewards.length > 0 && ` · ${card.next.rewards.join(" · ")}`}
        </div>
      ) : (
        <div className="ach-next ach-next--done">완료</div>
      )}
    </div>
  );
}
