import React, { useEffect, useState } from "react";
import { fetchPublicProfile, fetchAllProfileStats } from "../services/profileStatsService"; // 경로는 실제 프로젝트에 맞게 수정하세요

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
                                <strong>{stats?.single?.successCount || 0}회</strong>
                            </div>
                            <div className="stat-box">
                                <span>최고 기록</span>
                                <strong>{stats?.single?.bestTime ? `${stats.single.bestTime}초` : "-"}</strong>
                            </div>
                            <div className="stat-box">
                                <span>1vs1 승률</span>
                                <strong>
                                    {stats?.vs?.matches > 0
                                        ? `${Math.round((stats.vs.wins / stats.vs.matches) * 100)}%`
                                        : "-"}
                                </strong>
                                <small>({stats?.vs?.wins || 0}승 / {stats?.vs?.losses || 0}패)</small>
                            </div>
                            <div className="stat-box">
                                <span>그룹 순위</span>
                                <small>1등: {stats?.group?.firstPlaces || 0}회</small>
                                <small>2등: {stats?.group?.secondPlaces || 0}회</small>
                                <small>3등: {stats?.group?.thirdPlaces || 0}회</small>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
