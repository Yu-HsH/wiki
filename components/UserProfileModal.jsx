import React, { useEffect, useState } from "react";
import { fetchPublicProfile, fetchAllProfileStats } from "../services/profileStatsService";

export default function UserProfileModal({ userId, isOpen, onClose }) {
    const [profile, setProfile] = useState(null);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    useEffect(() => {
        if (!isOpen) return;

        if (!userId || userId.startsWith("guest-")) {
            setLoading(false);
            return;
        }

        let isMounted = true;
        setLoading(true);
        setError(false);

        Promise.all([
            fetchPublicProfile(userId),
            fetchAllProfileStats(userId)
        ]).then(([profileData, statsData]) => {
            if (isMounted) {
                setProfile(profileData);
                setStats(statsData);
                setLoading(false);
            }
        }).catch((err) => {
            console.error(err);
            if (isMounted) {
                setError(true);
                setLoading(false);
            }
        });

        return () => { isMounted = false; };
    }, [userId, isOpen]);

    if (!isOpen) return null;

    const isGuest = !userId || userId.startsWith("guest-");

    // 초(seconds)를 mm:ss 포맷으로 변환하는 헬퍼 함수
    const formatTime = (seconds) => {
        if (typeof seconds !== "number" || isNaN(seconds)) return "-";
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s.toString().padStart(2, "0")}`;
    };

    return (
        <div className="user-profile-modal-backdrop" onClick={onClose}>
            <div className="user-profile-modal-card" onClick={(e) => e.stopPropagation()}>
                <button className="user-profile-modal-close" onClick={onClose}>✕</button>

                {isGuest ? (
                    <div className="user-profile-modal-content">
                        <p style={{ textAlign: "center", marginTop: "2rem" }}>게스트 유저는 전적을 볼 수 없습니다.</p>
                    </div>
                ) : loading ? (
                    <div className="user-profile-modal-content">
                        <p style={{ textAlign: "center", marginTop: "2rem" }}>프로필 불러오는 중...</p>
                    </div>
                ) : error ? (
                    <div className="user-profile-modal-content">
                        <p style={{ textAlign: "center", marginTop: "2rem", color: "red" }}>프로필을 불러오는데 실패했습니다.</p>
                    </div>
                ) : (
                    <div className="user-profile-modal-content">
                        <div className="user-profile-modal-header">
                            {profile?.profile_image_url ? (
                                <img className="user-profile-modal-avatar" src={profile.profile_image_url} alt="profile" />
                            ) : (
                                <div className="user-profile-modal-avatar-placeholder">
                                    {(profile?.nickname || profile?.username || "?").charAt(0).toUpperCase()}
                                </div>
                            )}
                            <div className="user-profile-modal-info">
                                <h3>{profile?.nickname || "이름 없음"}</h3>
                                <p>@{profile?.username || "알수없음"}</p>
                            </div>
                        </div>

                        <div className="user-profile-modal-stats">
                            <div className="stat-box">
                                <span>싱글 성공</span>
                                <strong>{stats?.single?.totalWins || 0}회</strong>
                            </div>
                            <div className="stat-box">
                                <span>최고 기록</span>
                                <strong>{formatTime(stats?.single?.bestTime)}</strong>
                            </div>
                            <div className="stat-box">
                                <span>1vs1 승률</span>
                                <strong>{stats?.pvp?.winRate || 0}%</strong>
                                <small>({stats?.pvp?.wins || 0}승 / {stats?.pvp?.losses || 0}패)</small>
                            </div>
                            <div className="stat-box">
                                <span>그룹 순위</span>
                                <small>1등: {stats?.group?.first || 0}회</small>
                                <small>2등: {stats?.group?.second || 0}회</small>
                                <small>3등: {stats?.group?.third || 0}회</small>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
