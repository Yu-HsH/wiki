import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../authContext";
import { supabase } from "../supabaseClient";
import { fetchAllProfileStats } from "../services/profileStatsService";

/**
 * 프로필 관리 페이지 컴포넌트
 * - 유저의 아이디(조회용), 닉네임, 프로필 이미지를 보여줍니다.
 * - 싱글 플레이, 1vs1, 그룹 모드 전적 요약을 추가로 보여줍니다.
 */
export default function ProfilePage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [nicknameInput, setNicknameInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState("");

  // 전적 관련 상태
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);

  /* ── 데이터 로딩 (프로필 + 전적) ── */
  useEffect(() => {
    if (!user || user.isGuest) {
      setLoading(false);
      setStatsLoading(false);
      return;
    }

    const loadData = async () => {
      try {
        // 1. 프로필 정보 조회
        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("username, nickname, profile_image_url")
          .eq("id", user.id)
          .single();

        if (!profileError && profileData) setProfile(profileData);

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
  const displayNickname = profile?.nickname || user?.nickname || user?.displayName || "-";
  const avatarUrl = profile?.profile_image_url;

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

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setSaveError("이미지 크기는 2MB를 초과할 수 없습니다.");
      return;
    }

    try {
      setUploading(true);
      setSaveError("");
      setSaveSuccess("");

      const fileExt = file.name.split(".").pop() || 'png';
      const fileName = `profile.${fileExt}`;
      const filePath = `${user.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, file, {
          upsert: true,
          contentType: file.type
        });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("avatars")
        .getPublicUrl(filePath);

      const avatarUrl = `${urlData.publicUrl}?t=${Date.now()}`;

      const { error: updateError } = await supabase
        .from("profiles")
        .update({ profile_image_url: avatarUrl, updated_at: new Date().toISOString() })
        .eq("id", user.id);

      if (updateError) throw updateError;

      setProfile((prev) => ({ ...prev, profile_image_url: avatarUrl }));
      setSaveSuccess("프로필 사진이 성공적으로 변경되었습니다.");
    } catch (error) {
      console.error("Upload error:", error);
      setSaveError(error.message || "업로드 중 오류가 발생했습니다.");
    } finally {
      setUploading(false);
      e.target.value = null;
    }
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
          <button type="button" className="app-btn app-btn-ghost" onClick={() => navigate("/main")}>
            ← 메인
          </button>
          <button type="button" className="app-btn app-btn-ghost" onClick={handleLogout}>
            로그아웃
          </button>
        </div>

        <p className="auth-badge">내 프로필</p>

        {/* Avatar Section */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", margin: "1rem 0" }}>
          <div style={{ position: "relative", marginBottom: "0.5rem" }}>
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt="프로필 이미지"
                className="profile-avatar-img"
              />
            ) : (
              <div className="profile-avatar-placeholder">
                {displayNickname.charAt(0).toUpperCase()}
              </div>
            )}
            {uploading && (
              <div className="profile-avatar-overlay">업로드...</div>
            )}
          </div>

          <label style={{ cursor: uploading || user?.isGuest ? "not-allowed" : "pointer" }}>
            <span style={{ fontSize: "0.85rem", color: "var(--app-brand-deep)", fontWeight: 600 }}>
              {user?.isGuest ? "게스트는 변경 불가" : "사진 변경"}
            </span>
            <input
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={handleFileChange}
              disabled={uploading || user?.isGuest}
            />
          </label>
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
                {displayNickname}
              </p>
              <button
                type="button"
                className="app-btn app-btn-ghost"
                onClick={() => { setNicknameInput(displayNickname === "-" ? "" : displayNickname); setEditMode(true); }}
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
