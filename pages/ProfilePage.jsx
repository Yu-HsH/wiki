import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../authContext";
import { LOBBY_PATH } from "../utils/appRoutes";
import { supabase } from "../supabaseClient";
import { fetchAllProfileStats } from "../services/profileStatsService";
import { fetchXpSummary } from "../services/xpService";
import ProfileCard from "../components/ProfileCard";
import XpProgress from "../components/XpProgress";
import ProfileRewardEditor from "../components/ProfileRewardEditor";
import { fetchOwnRewardInventory, fetchProfileCard } from "../services/profileRewardService";
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

  // 장착 상태 (C1 §3). 서버 응답으로만 바뀐다 — 처음엔 카드 RPC, 이후 equip/unequip 응답.
  const [rewardSlots, setRewardSlots] = useState(null);
  const [ownedRewards, setOwnedRewards] = useState([]);
  const [rewardsLoading, setRewardsLoading] = useState(true);

  /* ── 데이터 로딩 (프로필 + 전적) ── */
  useEffect(() => {
    if (!user || user.isGuest) {
      setLoading(false);
      setStatsLoading(false);
      setRewardsLoading(false);
      return;
    }

    const loadData = async () => {
      try {
        // 1. 프로필 정보 조회
        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("username, nickname, profile_image_url, total_xp, profile_level")
          .eq("id", user.id)
          .single();

        if (!profileError && profileData) setProfile(profileData);

        // 진행도 쌍은 서버가 계산한다 (C3 §4). 실패해도 프로필 화면은 그대로 보인다.
        fetchXpSummary(user.id)
          .then(setXpSummary)
          .catch((xpError) => console.error("XP 요약 로드 실패:", xpError));

        // 장착 상태와 보유 목록 — 실패해도 카드는 기본 표시(legacy·이니셜)로 남는다.
        Promise.all([fetchProfileCard(user.id), fetchOwnRewardInventory()])
          .then(([card, owned]) => {
            setRewardSlots(card);
            setOwnedRewards(owned);
          })
          .catch((rewardError) => console.error("프로필 보상 로드 실패:", rewardError))
          .finally(() => setRewardsLoading(false));

        // 2. 전체 전적 조회
        const statsData = await fetchAllProfileStats(user.id);
        setStats(statsData);
      } catch (err) {
        console.error("데이터 로드 실패:", err);
      } finally {
        setLoading(false);
        setStatsLoading(false);
      }
    };

    loadData();
  }, [user]);

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
      <div className="app-center">
        <p className="app-muted">프로필 불러오는 중...</p>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card" style={{ maxWidth: 460 }}>
        {/* Header Actions */}
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem" }}>
          <button type="button" className="app-btn app-btn-ghost" onClick={() => navigate(LOBBY_PATH)}>
            ← 로비
          </button>
          <button type="button" className="app-btn app-btn-ghost" onClick={handleLogout}>
            로그아웃
          </button>
        </div>

        <p className="auth-badge">내 프로필</p>

        {/* Avatar Section */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", margin: "1rem 0" }}>
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

          {/* 게스트는 장착 상태를 만들 수 없다 (17 §6) — 편집 자체를 렌더하지 않는다 */}
          {user && !user.isGuest && (
            <ProfileRewardEditor
              card={profileCard}
              owned={ownedRewards}
              loading={rewardsLoading}
              onEquipment={handleEquipment}
            />
          )}
        </div>

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
          {saveSuccess && <p style={{ color: "#4ade80", marginTop: "0.25rem", fontSize: "0.85rem" }}>{saveSuccess}</p>}
        </div>

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
                      <h4>최고 시간</h4>
                      <span className="profile-stat-value">{formatTime(stats.single.bestTime)}</span>
                    </div>
                    <div className="profile-stat-card">
                      <h4>최소 클릭</h4>
                      <span className="profile-stat-value">{stats.single.bestClicks || "-"}<small className="profile-stat-unit">회</small></span>
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
              <p className="app-muted" style={{ fontSize: "0.9rem" }}>전적 정보가 없습니다.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
