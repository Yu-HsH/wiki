import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LOBBY_PATH } from "../utils/appRoutes";
import { fetchMyAchievements, markAchievementsSeen } from "../services/achievementService.js";
import { buildAchievementScreen } from "../utils/achievementDisplay.js";
import { useAuth } from "../authContext";
import WikiRaceShell from "../components/wiki-race/WikiRaceShell";
import { AchievementCard } from "../components/AchievementRewardPreview.jsx";
import { fetchOwnRewardInventory } from "../services/profileRewardService.js";
import { categoryDecoration, earnedRewardRefs } from "../utils/achievementDecoration.js";

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
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [screen, setScreen] = useState(null);
  const [status, setStatus] = useState("loading");
  const [category, setCategory] = useState("all");
  const [ownedIds, setOwnedIds] = useState(null);
  const [ownedStatus, setOwnedStatus] = useState("loading");
  const [ownedAttempt, setOwnedAttempt] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [earned, setEarned] = useState(new Map());

  useEffect(() => {
    let cancelled = false;
    setOwnedIds(null);
    setOwnedStatus("loading");
    if (user?.id && !user.isGuest) fetchOwnRewardInventory()
      .then(owned => { if (!cancelled) { setOwnedIds(new Set(owned.map(item => item.rewardId))); setOwnedStatus("ready"); } })
      .catch(() => { if (!cancelled) { setOwnedIds(null); setOwnedStatus("error"); } });
    return () => { cancelled = true; };
  }, [user?.id, user?.isGuest, ownedAttempt]);

  const general = screen?.sections.flatMap(section => section.cards) ?? [];
  const finished = general.filter(card => card.complete).length;
  const ongoing = general.filter(card => !card.complete && (card.unlockedTier > 0 || card.progress?.current > 0));

  useEffect(() => {
    let cancelled = false;
    setScreen(null);
    setStatus("loading");
    setEarned(new Map());
    if (!user?.id || user.isGuest) return undefined;
    fetchMyAchievements()
      .then((response) => {
        if (cancelled) return;
        const built = buildAchievementScreen(response);
        setScreen(built);
        setEarned(earnedRewardRefs(response));
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
  }, [user?.id, user?.isGuest, attempt]);

  return (
    <WikiRaceShell user={user} level={null} onLogout={logout} view="achievements">
      <header className="dashboard-header">
        <div>
          <p className="dashboard-badge">ACHIEVEMENTS</p>
          <h1>업적 · 발견 도감</h1>
          <p className="dashboard-muted">발견한 기록을 모으고, 다음 탐험에서 얻을 보상을 살펴보세요.</p>
        </div>
        <div className="header-actions">
          <button type="button" className="app-btn app-btn-ghost" onClick={() => navigate(LOBBY_PATH)}>
            홈으로
          </button>
        </div>
      </header>

      {status === "loading" && <p className="dashboard-muted ach-status" aria-busy="true">업적을 불러오는 중…</p>}
      {status === "error" && <div className="dashboard-muted ach-status" role="alert">업적을 불러오지 못했습니다. <button type="button" className="app-btn app-btn-ghost" onClick={() => setAttempt(value => value + 1)}>업적 다시 불러오기</button></div>}
      {status === "ready" && ownedStatus === "error" && <div className="ach-status" role="alert">보유 목록을 확인하지 못했습니다. 견본의 보유 여부는 확인 불가로 표시합니다. <button type="button" className="app-btn app-btn-ghost" onClick={() => setOwnedAttempt(value => value + 1)}>보유 목록 다시 확인</button></div>}

      {status === "ready" && screen && (
        <><section className="album-cover" aria-label="공개 일반 업적 수집 현황">
          <div><p className="album-kicker">EXPLORER’S DISCOVERY ALBUM</p><h2>탐험은 지나가도,<br />발견은 기록으로 남아요.</h2><p>작은 첫걸음부터 완성된 기록까지.<br />공개된 다음 보상을 살펴보고 나만의 수집을 이어가세요.</p></div>
          <dl className="album-totals"><div><dt>일반 기록 완성</dt><dd>{finished}<small> / {general.length}</small></dd></div><div><dt>진행 중인 일반 기록</dt><dd>{ongoing.length}</dd></div><div><dt>발견한 히든</dt><dd>{screen.hidden.discovered}<small>개</small></dd></div></dl>
          {ongoing.length > 0 && <p className="album-current">이어서 기록하기 · {ongoing.slice(0, 3).map(card => card.name).join(" · ")}</p>}
          <p className="album-public-note">일반 기록의 완성 수만 집계합니다. 미발견 히든의 이름·조건·총수는 공개되지 않습니다.</p>
        </section><nav className="wr-ach-filters" aria-label="업적 분류">
          {[{category:"all",label:"전체"}, ...screen.sections, {category:"hidden",label:"히든"}].map(section => <button type="button" key={section.category} aria-pressed={category === section.category} onClick={() => setCategory(section.category)}>{section.label}</button>)}
          <button type="button" onClick={() => navigate("/profile")}>획득한 꾸미기 장착 →</button>
        </nav><div className="ach-page">
          {general.length === 0 && category !== "hidden" && <p className="ach-status">현재 공개된 일반 기록이 없습니다.</p>}
          {screen.sections.filter(section => category === "all" || category === section.category).map((section) => (
            <section
              key={section.category}
              className="dashboard-card ach-section"
              aria-labelledby={`ach-${section.category}-title`}
            >
              <h2 id={`ach-${section.category}-title`} className="ach-section-title">{categoryDecoration(section.category) && <img className="album-category-art" src={categoryDecoration(section.category)} alt="" aria-hidden="true" width="32" height="32" />}{section.label}<small>공개 기록 {section.cards.length}개</small></h2>
              {section.cards.map((card) => (
                <AchievementCard key={card.achievementId} card={card} ownedIds={ownedIds} earnedRefs={earned.get(card.achievementId)} />
              ))}
            </section>
          ))}
          {(category === "all" || category === "hidden") &&
          <section className="dashboard-card ach-section ach-section--hidden" aria-labelledby="ach-hidden-title">
            <h2 id="ach-hidden-title" className="ach-section-title">히든 업적</h2><p className="ach-hidden-note">아직 펼치지 않은 탐험 기록입니다. 발견한 업적만 이곳에 기록됩니다.</p>
            <div className="ach-card ach-card--hidden-summary">
              <div className="ach-card-head">
                <span className="ach-hidden-count">{screen.hidden.label}</span>
                {screen.hidden.isNew && <span className="ach-new">NEW</span>}
              </div>
            </div>
            {screen.hidden.cards.map((card) => (
              <AchievementCard key={card.achievementId} card={card} ownedIds={ownedIds} earnedRefs={earned.get(card.achievementId)} />
            ))}
          </section>}
        </div></>
      )}
    </WikiRaceShell>
  );
}
