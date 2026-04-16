import React, { useState } from "react";

export default function GameSetup({ onStart, isLoading }) {
  const [mode, setMode] = useState("random"); // 'random' | 'custom'
  const [keyword, setKeyword] = useState("");

  const handleStart = (e) => {
    e.preventDefault();
    if (mode === "custom" && !keyword.trim()) return;
    onStart({ mode, keyword: mode === "custom" ? keyword : "" });
  };

  return (
    <div className="hero-card">
      <div>
        <div className="badge">WIKI GAME</div>
        <h1>위키 문서 탐험 레이스</h1>
        <p className="hero-subtitle">
          시작 문서를 배정받고, 본문 링크만을 클릭해 지정된 목표 문서로 도달하세요.
        </p>

        <form onSubmit={handleStart} style={{ marginTop: "20px" }}>
          <div className="mode-controls" style={{ marginBottom: "15px" }}>
            <button
              type="button"
              className={mode === "random" ? "mode-btn active" : "mode-btn"}
              onClick={() => setMode("random")}
              disabled={isLoading}
            >
              랜덤 타겟 생성
            </button>
            <button
              type="button"
              className={mode === "custom" ? "mode-btn active" : "mode-btn"}
              onClick={() => setMode("custom")}
              disabled={isLoading}
            >
              직접 키워드 입력
            </button>
          </div>

          {mode === "custom" && (
            <div className="target-form" style={{ marginBottom: "15px" }}>
              <input
                className="target-input"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="예: 배추, 인공지능, 축구"
                disabled={isLoading}
                required
              />
            </div>
          )}

          <div className="hero-actions">
            <button type="submit" className="restart-btn" disabled={isLoading || (mode === "custom" && !keyword.trim())}>
              {isLoading ? "준비 중..." : "위키 게임 시작"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
