import React from "react";

/**
 * VS 인트로 오버레이
 * - 게임 시작 직전 잠깐 보여주는 연출 화면
 * - 내 정보 / 상대 정보 / 목표 문서를 보여줌
 */
export default function VsIntroOverlay({
    myName,
    opponentName,
    myTarget,
    opponentTarget,
    myInitial,
    opponentInitial,
}) {
    return (
        <div className="vs-overlay">
            <div className="vs-backdrop" />

            {/* 내 카드 */}
            <div className="vs-card vs-card--left">
                <div className="vs-avatar">{myInitial}</div>
                <div className="vs-name">{myName}</div>
                <div className="vs-label">내가 풀 문제</div>
                <div className="vs-target">{myTarget || "..."}</div>
            </div>

            {/* 가운데 VS */}
            <div className="vs-center">
                <div className="vs-text">VS</div>
            </div>

            {/* 상대 카드 */}
            <div className="vs-card vs-card--right">
                <div className="vs-avatar">{opponentInitial}</div>
                <div className="vs-name">{opponentName}</div>
                <div className="vs-label">상대가 풀 문제</div>
                <div className="vs-target">{opponentTarget || "..."}</div>
            </div>
        </div>
    );
}