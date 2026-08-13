
import React, { useState, useEffect } from "react";
import { formatDuration } from "../services/wikiService";

export default function FloatingHud({
    targetTitle,
    elapsedSeconds,
    clickCount,
    timerLabel = "탐험 시간",
}) {
    const [isVisible, setIsVisible] = useState(false);

    // 스크롤이 일정 이상 내려가면 HUD를 표시합니다.
    useEffect(() => {
        const handleScroll = () => {
            setIsVisible(window.scrollY > 200);
        };
        window.addEventListener("scroll", handleScroll);
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    if (!isVisible) return null;

    return (
        <div className="floating-hud">
            <div className="hud-item highlight">
                <span className="hud-label">목표</span>
                <span className="hud-value" title={targetTitle}>
                    {targetTitle.length > 8 ? targetTitle.slice(0, 8) + "..." : targetTitle}
                </span>
            </div>
            <div className="hud-item">
                <span className="hud-label">{timerLabel}</span>
                <span className="hud-value time-val">{formatDuration(elapsedSeconds)}</span>
            </div>
            <div className="hud-item">
                <span className="hud-label">이동 수</span>
                <span className="hud-value">{clickCount}</span>
            </div>
        </div>
    );
}
