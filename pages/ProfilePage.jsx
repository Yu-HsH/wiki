import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../authContext";
import { supabase } from "../supabaseClient";

/**
 * 프로필 관리 페이지 컴포넌트
 * - 유저의 아이디(조회용), 닉네임, 프로필 이미지를 보여줍니다.
 * - 닉네임을 수정하여 public.profiles 테이블에 반영할 수 있습니다.
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

  /* ── 프로필 데이터 동기화 (public.profiles 테이블) ── */
  useEffect(() => {
    if (!user || user.isGuest) { setLoading(false); return; }

    const load = async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("username, nickname, profile_image_url")
        .eq("id", user.id)
        .single();

      if (!error && data) setProfile(data);
      setLoading(false);
    };
    load();
  }, [user]);

  const displayUsername = profile?.username || user?.username || "-";
  const displayNickname = profile?.nickname || user?.nickname || user?.displayName || "-";
  const avatarUrl = profile?.profile_image_url;

  /**
   * 닉네임 변경 저장 핸들러
   * public.profiles 테이블의 nickname 컬럼을 업데이트합니다.
   */
  const handleSaveNickname = async () => {
    if (!nicknameInput.trim() || nicknameInput.trim().length < 2) {
      setSaveError("닉네임은 2자 이상이어야 합니다.");
      return;
    }
    setSaving(true);
    setSaveError("");
    setSaveSuccess("");

    const { error } = await supabase
      .from("profiles")
      .update({ nickname: nicknameInput.trim(), updated_at: new Date().toISOString() })
      .eq("id", user.id);

    setSaving(false);
    if (error) {
      setSaveError(error.message || "저장에 실패했습니다.");
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

    try {
      setUploading(true);
      setSaveError("");
      setSaveSuccess("");

      const fileExt = file.name.split(".").pop();
      const fileName = `profile_${Date.now()}.${fileExt}`;
      const filePath = `${user.id}/${fileName}`;

      // 1. Storage 업로드
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      // 2. Public URL 가져오기
      const { data: urlData } = supabase.storage
        .from("avatars")
        .getPublicUrl(filePath);

      const avatarUrl = urlData.publicUrl;

      // 3. profiles 테이블 업데이트
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ profile_image_url: avatarUrl, updated_at: new Date().toISOString() })
        .eq("id", user.id);

      if (updateError) throw updateError;

      // 4. 상태 반영
      setProfile((prev) => ({ ...prev, profile_image_url: avatarUrl }));
      setSaveSuccess("프로필 사진이 변경되었습니다.");
    } catch (error) {
      setSaveError(error.message || "프로필 사진 변경에 실패했습니다.");
    } finally {
      setUploading(false);
      e.target.value = null; // 초기화
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
      <div className="auth-card" style={{ maxWidth: 420 }}>
        {/* back + logout */}
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem" }}>
          <button type="button" className="app-btn app-btn-ghost" onClick={() => navigate("/main")}>
            ← 메인
          </button>
          <button type="button" className="app-btn app-btn-ghost" onClick={handleLogout}>
            로그아웃
          </button>
        </div>

        <p className="auth-badge">내 프로필</p>

        {/* Avatar */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", margin: "1.25rem 0" }}>
          <div style={{ position: "relative", marginBottom: "0.5rem" }}>
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt="프로필 이미지"
                style={{ width: 80, height: 80, borderRadius: "50%", objectFit: "cover", border: "2px solid var(--color-border, #334155)" }}
              />
            ) : (
              <div
                style={{
                  width: 80, height: 80, borderRadius: "50%",
                  background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "2rem", color: "#fff",
                }}
              >
                {displayNickname.charAt(0).toUpperCase()}
              </div>
            )}
            {/* 업로드 상태 오버레이 */}
            {uploading && (
              <div style={{
                position: "absolute", top: 0, left: 0, width: "100%", height: "100%",
                background: "rgba(0,0,0,0.5)", borderRadius: "50%",
                display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: "0.8rem"
              }}>
                업로드...
              </div>
            )}
          </div>
          
          {/* 사진 변경 버튼 */}
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

        {/* Username (read-only) */}
        <div style={{ marginBottom: "1rem" }}>
          <p className="auth-label" style={{ marginBottom: 2, fontWeight: 600 }}>아이디</p>
          <p style={{ padding: "0.5rem 0.75rem", borderRadius: 8, background: "var(--color-surface-2, #1e293b)", color: "var(--color-text, #e2e8f0)" }}>
            {displayUsername}
          </p>
        </div>

        {/* Nickname (editable) */}
        <div style={{ marginBottom: "1rem" }}>
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
              <p style={{ flex: 1, padding: "0.5rem 0.75rem", borderRadius: 8, background: "var(--color-surface-2, #1e293b)", color: "var(--color-text, #e2e8f0)", margin: 0 }}>
                {displayNickname}
              </p>
              <button
                type="button"
                className="app-btn app-btn-ghost"
                style={{ whiteSpace: "nowrap" }}
                onClick={() => { setNicknameInput(displayNickname === "-" ? "" : displayNickname); setEditMode(true); }}
              >
                수정
              </button>
            </div>
          )}
          {saveError && <p className="auth-error" style={{ marginTop: "0.25rem" }}>{saveError}</p>}
          {saveSuccess && <p style={{ color: "#4ade80", marginTop: "0.25rem", fontSize: "0.85rem" }}>{saveSuccess}</p>}
        </div>
      </div>
    </div>
  );
}
