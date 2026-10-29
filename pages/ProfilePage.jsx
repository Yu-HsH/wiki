import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../authContext";
import { supabase } from "../supabaseClient";
import { fetchAllProfileStats } from "../services/profileStatsService";
import { fetchXpSummary } from "../services/xpService";
import ProfileCard from "../components/ProfileCard";
import XpProgress from "../components/XpProgress";
import WikiRaceShell from "../components/wiki-race/WikiRaceShell";
import ProfileRewardEditor from "../components/ProfileRewardEditor";
import { fetchOwnRewardInventory, fetchProfileCard } from "../services/profileRewardService";
import { fetchMyAchievements } from "../services/achievementService";
import { serviceErrorMessage } from "../utils/serviceError.js";
import { buildAchievementSummary } from "../utils/achievementDisplay";
import {
  DENSITY,
  NAME_FALLBACK,
  applyEquipment,
  buildProfileCard,
  mergeRewardSlots,
  resolveDisplayName,
} from "../utils/profileCard.js";

/**
 * 프로필 관리 페이지 컴포넌트
 * - 유저의 아이디(조회용), 닉네임, 프로필 카드를 보여줍니다.
 * - 프로필 꾸미기(장착 편집, 17b)와 싱글 플레이, 1vs1, 그룹 모드 전적 요약을 보여줍니다.
 *
 * 사용자 이미지 업로드는 없다 (spec §10·§12, 17 §5.1). 기존 `profile_image_url` 값과
 * `avatars` storage object는 지우지 않고 C5 §3.1의 2단계 fallback으로 계속 읽는다.
 */
export default function ProfilePage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [nicknameInput, setNicknameInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState("");

  // 전적 관련 상태
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [xpSummary, setXpSummary] = useState(null);
  const [dataErrors, setDataErrors] = useState({});
  const [reloadKey, setReloadKey] = useState(0);

  // 장착 상태 (C1 §3). 서버 응답으로만 바뀐다 — 처음엔 카드 RPC, 이후 equip/unequip 응답.
  const previewRef = useRef(null);
  const [rewardGoals, setRewardGoals] = useState([]);
  const [rewardSlots, setRewardSlots] = useState(null);
  const [ownedRewards, setOwnedRewards] = useState([]);
  const [rewardsLoading, setRewardsLoading] = useState(true);
  // 본인 업적 요약 (16c) — 달성 수 + 최근 3개. 남의 프로필에는 없다 (판정 10).
  const [achievementSummary, setAchievementSummary] = useState(null);

  /* ── 데이터 로딩 (프로필 + 전적) ── */
  useEffect(() => {
    if (!user || user.isGuest) {
      setLoading(false);
      setStatsLoading(false);
      setRewardsLoading(false);
      return;
    }

    let cancelled = false;
    setDataErrors({}); setStats(null); setXpSummary(null);
    setProfile(null); setRewardSlots(null); setOwnedRewards([]); setAchievementSummary(null); setRewardGoals([]);
    setLoading(true); setStatsLoading(true); setRewardsLoading(true);
    const load = async (key, subject, request, apply) => {
      try { const value = await request(); if (!cancelled) apply(value); }
      catch (error) {
        console.error(`${subject} 조회 실패:`, error);
        if (!cancelled) setDataErrors(previous => ({ ...previous, [key]: serviceErrorMessage(error, subject) }));
      }
    };
    void load('profile', '프로필', async () => {
      const { data, error } = await supabase.from('profiles').select("username, nickname, profile_image_url, total_xp, profile_level").eq('id', user.id).single();
      if (error) throw error;
      return data;
    }, setProfile).finally(() => { if (!cancelled) setLoading(false); });
    void load('xp', 'XP', () => fetchXpSummary(user.id), setXpSummary);
    void load('rewards', '보유 보상', () => Promise.all([fetchProfileCard(user.id), fetchOwnRewardInventory()]), ([card, owned]) => {
      setRewardSlots(card); setOwnedRewards(owned);
    }).finally(() => { if (!cancelled) setRewardsLoading(false); });
    void load('achievements', '업적', fetchMyAchievements, response => {
      setAchievementSummary(buildAchievementSummary(response));
      setRewardGoals((response.achievements || []).flatMap(a => (a.tiers || []).filter(t => !t.unlocked).slice(0, 1).flatMap(t => (t.rewards || []).map(reward => ({ ...reward, achievementName: a.name, condition: a.condition, current: a.current, threshold: t.threshold })))));
    });
    void load('stats', '게임 전적', () => fetchAllProfileStats(user.id), setStats)
      .finally(() => { if (!cancelled) setStatsLoading(false); });
    return () => { cancelled = true; };
  }, [user, reloadKey]);

  const displayUsername = profile?.username || user?.username || "-";

  // 편집 대상인 원본 닉네임. 표시용 이름은 C5 §3.3이 ProfileCard 안에서 결정한다.
  const storedNickname = profile?.nickname || user?.nickname || user?.displayName || "";

  // C5 §2의 카드 형태. 레벨은 `profile_level` computed field(15b)가,
  // 아이콘·칭호·배지·프레임·배경은 C1 장착 상태(17b)가 채운다.
  const profileCard = mergeRewardSlots(
    buildProfileCard({
      userId: user?.id,
      nickname: storedNickname,
      level: profile?.profile_level ?? null,
      legacyImageUrl: profile?.profile_image_url,
      source: "live",
    }),
    rewardSlots
  );

  const handleEquipment = (equipment) => {
    setRewardSlots(applyEquipment(profileCard, equipment));
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      previewRef.current?.animate([{ opacity: .65, transform: "translateY(2px)" }, { opacity: 1, transform: "none" }], { duration: 300 });
    }
  };
  const displayName = resolveDisplayName(profileCard, NAME_FALLBACK.EXPLORER);

  // 시간 포맷팅 헬퍼 (초 -> M:SS)
  const formatTime = (seconds) => {
    if (seconds === null || seconds === undefined) return "-";
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const handleSaveNickname = async () => {
    if (!nicknameInput.trim() || nicknameInput.trim().length < 2) {
      setSaveError("닉네임은 2자 이상이어야 합니다.");
      return;
    }
    setSaving(true);
    setSaveError("");
    setSaveSuccess("");

    const { error: dbError } = await supabase
      .from("profiles")
      .update({ nickname: nicknameInput.trim(), updated_at: new Date().toISOString() })
      .eq("id", user.id);

    if (dbError) {
      setSaveError(dbError.message || "저장에 실패했습니다.");
      setSaving(false);
      return;
    }

    const { error: authError } = await supabase.auth.updateUser({
      data: { nickname: nicknameInput.trim() }
    });

    setSaving(false);
    if (authError) {
      setSaveError("프로필은 저장되었으나, 화면 동기화에 일부 실패했습니다.");
    } else {
      setProfile((prev) => ({ ...prev, nickname: nicknameInput.trim() }));
      setSaveSuccess("닉네임이 저장되었습니다.");
      setEditMode(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  if (loading) {
    return (
      <WikiRaceShell user={user} level={null} onLogout={handleLogout} view="profile"><div className="wr-profile-content" aria-busy="true">
        <p className="app-muted">프로필 불러오는 중...</p>
      </div></WikiRaceShell>
    );
  }

  return (
    <WikiRaceShell user={user} level={profileCard.level} onLogout={handleLogout} view="profile">
      <div className="wr-profile-content">
        <p className="wr-kicker">MY EXPLORER · 탐험가 수첩</p>
        <header className="profile-notebook-heading"><div><h1>나만의 탐험 기록 카드</h1><p>발견한 보상을 장착하고, 다음 탐험에 내 이름을 남겨 보세요.</p></div><button className="app-btn app-btn-ghost" onClick={() => navigate("/ranking")}>명예 기록판 →</button></header>

        {/* Avatar Section */}
        <div className="profile-showcase">
          <section id="profile-card-preview" className="profile-representative" ref={previewRef} aria-label="대표 탐험 카드"><p className="wr-kicker">EXPLORER CARD · 현재 장착</p>
          <div className="pcard-upload-slot">
            {/* C5 §4 "프로필 — 전부". 장착 편집은 아래 ProfileRewardEditor (17b) */}
            <ProfileCard
              card={profileCard}
              size="xl"
              density={DENSITY.FULL}
              nameFallback={NAME_FALLBACK.EXPLORER}
              className="pcard--stacked"
            />
          </div>

          <XpProgress summary={xpSummary} />
          {stats && <div className="profile-card-record"><span>싱글 완주 <b>{stats.single.totalWins}회</b></span><span>새 기준 최고 <b>{formatTime(stats.single.bestTime)}</b></span><span>이전 최고 <b>{formatTime(stats.single.previousBestTime)}</b></span></div>}
          <p className="profile-card-caption">이 카드의 아이콘·칭호·프레임은 명예 기록판에도 표시됩니다.</p></section>

          {/* 게스트는 장착 상태를 만들 수 없다 (17 §6) — 편집 자체를 렌더하지 않는다 */}
          {user && !user.isGuest && !dataErrors.rewards && (
            <ProfileRewardEditor
              card={profileCard}
              owned={ownedRewards}
              loading={rewardsLoading}
              onEquipment={handleEquipment}
              goals={rewardGoals}
            />
          )}
        </div>

        {user?.isGuest ? <p className="profile-card-caption">게스트는 탐험 기록과 보상을 저장할 수 없습니다. <button type="button" className="app-btn app-btn-ghost" onClick={handleLogout}>로그인하기</button></p> : <details className="profile-settings"><summary>탐험가 정보 · 닉네임 편집</summary>
        {/* Basic Info */}
        <div style={{ marginBottom: "1rem" }}>
          <p className="auth-label" style={{ marginBottom: 2, fontWeight: 600 }}>아이디</p>
          <p className="profile-readonly-field">{displayUsername}</p>
        </div>

        <div style={{ marginBottom: "1.5rem" }}>
          <p className="auth-label" style={{ marginBottom: 2, fontWeight: 600 }}>닉네임</p>
          {editMode ? (
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <input
                aria-label="닉네임"
                className="auth-input"
                style={{ flex: 1 }}
                value={nicknameInput}
                onChange={(e) => { setNicknameInput(e.target.value); setSaveError(""); setSaveSuccess(""); }}
                autoFocus
              />
              <button type="button" className="app-btn app-btn-primary" onClick={handleSaveNickname} disabled={saving}>
                {saving ? "저장 중" : "저장"}
              </button>
              <button type="button" className="app-btn app-btn-ghost" onClick={() => { setEditMode(false); setSaveError(""); setSaveSuccess(""); }}>
                취소
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <p className="profile-readonly-field" style={{ flex: 1, margin: 0 }}>
                {displayName}
              </p>
              <button
                type="button"
                className="app-btn app-btn-ghost"
                onClick={() => { setNicknameInput(storedNickname); setEditMode(true); }}
              >
                수정
              </button>
            </div>
          )}
          {saveError && <p className="auth-error" style={{ marginTop: "0.25rem" }}>{saveError}</p>}
          {saveSuccess && <p className="profile-save-success" role="status">{saveSuccess}</p>}
        </div>

        </details>}
        {/* ── 업적 요약 (16c, 본인만) ── */}
        {achievementSummary && (
          <div className="ach-summary" style={{ marginBottom: "1.5rem" }} data-testid="profile-achievements">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <p className="auth-label" style={{ margin: 0, fontWeight: 600 }}>업적</p>
              <button type="button" className="app-btn app-btn-ghost" onClick={() => navigate("/achievements")}>
                전체 보기
              </button>
            </div>
            <div className="ach-summary-count">{achievementSummary.achieved.toLocaleString("ko-KR")}개 달성</div>
            {achievementSummary.recent.length > 0 ? (
              <ul className="ach-summary-list">
                {achievementSummary.recent.map((unlock) => (
                  <li key={unlock.key}>
                    {unlock.hidden ? "✦ " : "· "}
                    {unlock.name}
                    {unlock.tierLabel && <span className="ach-tier"> {unlock.tierLabel}</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="dashboard-muted" style={{ margin: 0 }}>아직 달성한 업적이 없습니다.</p>
            )}
          </div>
        )}

        {Object.keys(dataErrors).length > 0 && <div role="alert">
          {Object.entries(dataErrors).map(([key, message]) => <p className="app-error" key={key}>{message}</p>)}
          <button type="button" className="app-btn app-btn-ghost" onClick={() => setReloadKey(value => value + 1)}>프로필 다시 불러오기</button>
        </div>}

        {/* ── 전적 섹션 ── */}
        {!user?.isGuest && (
          <div className="profile-stats-section">
            <p className="auth-label" style={{ fontWeight: 600, marginBottom: "12px" }}>내 게임 전적</p>

            {statsLoading ? (
              <p className="app-muted" style={{ fontSize: "0.9rem" }}>전적 데이터를 불러오는 중...</p>
            ) : stats ? (
              <div className="profile-stats-container">
                {/* 싱글 플레이 */}
                <div className="profile-stats-group">
                  <header>싱글 플레이 (기록)</header>
                  <div className="profile-stats-grid">
                    <div className="profile-stat-card">
                      <h4>성공 횟수</h4>
                      <span className="profile-stat-value">{stats.single.totalWins}<small className="profile-stat-unit">회</small></span>
                    </div>
                    <div className="profile-stat-card">
                      <h4>새 기준 최고 시간</h4>
                      <span className="profile-stat-value">{formatTime(stats.single.bestTime)}</span>
                      <small>이전 기록 {formatTime(stats.single.previousBestTime)}</small>
                    </div>
                    <div className="profile-stat-card">
                      <h4>최소 클릭</h4>
                      <span className="profile-stat-value">{stats.single.bestClicks ?? "-"}<small className="profile-stat-unit">회</small></span>
                    </div>
                  </div>
                </div>

                {/* 멀티플레이 (1vs1) */}
                <div className="profile-stats-group">
                  <header>1 VS 1 대전</header>
                  <div className="profile-stats-grid">
                    <div className="profile-stat-card">
                      <h4>승률</h4>
                      <span className="profile-stat-value">{stats.pvp.winRate}<small className="profile-stat-unit">%</small></span>
                    </div>
                    <div className="profile-stat-card">
                      <h4>승/패</h4>
                      <span className="profile-stat-value">{stats.pvp.wins}<small className="profile-stat-unit">승</small></span>
                      <span className="profile-stat-sub">{stats.pvp.losses}패</span>
                    </div>
                  </div>
                </div>

                {/* 그룹 모드 */}
                <div className="profile-stats-group">
                  <header>그룹 레이스 (TOP 3)</header>
                  <div className="profile-stats-grid">
                    <div className="profile-stat-card">
                      <h4>1등</h4>
                      <span className="profile-stat-value" style={{ color: "#fbbf24" }}>{stats.group.first}<small className="profile-stat-unit">회</small></span>
                    </div>
                    <div className="profile-stat-card">
                      <h4>2등</h4>
                      <span className="profile-stat-value" style={{ color: "#e2e8f0" }}>{stats.group.second}<small className="profile-stat-unit">회</small></span>
                    </div>
                    <div className="profile-stat-card">
                      <h4>3등</h4>
                      <span className="profile-stat-value" style={{ color: "#d97706" }}>{stats.group.third}<small className="profile-stat-unit">회</small></span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <p className="app-muted" style={{ fontSize: "0.9rem" }}>{dataErrors.stats ? '전적을 확인할 수 없습니다. 위의 다시 불러오기를 이용해 주세요.' : '전적 정보가 없습니다.'}</p>
            )}
          </div>
        )}
      </div>
    </WikiRaceShell>
  );
}
