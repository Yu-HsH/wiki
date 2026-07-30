import React from "react";

export default function OnlineGameRecoveryPanel({
  mode = "recovering",
  message,
  onRetry,
  onLeave,
  leaving = false,
}) {
  const isInitializing = mode === "initializing";
  const isRecovering = mode === "recovering";
  const isFatal = mode === "fatal";

  return (
    <div className="online-recovery-page" role={isFatal ? "alert" : "status"} aria-live="polite">
      <div className="online-recovery-card">
        <span className="mp-badge">
          {isFatal ? "GAME ENDED" : isInitializing ? "GET READY" : "RECONNECT"}
        </span>
        <h1 className="mp-title">
          {isInitializing
            ? "게임을 준비하고 있습니다"
            : isRecovering
            ? "게임 상태를 복구하고 있습니다"
            : isFatal
              ? "게임을 계속할 수 없습니다"
              : "연결을 복구하지 못했습니다"}
        </h1>
        <p className="mp-subtitle">
          {message || (isInitializing
            ? "서버에서 참가자와 시작 문서를 확인하고 있습니다."
            : isRecovering
            ? "서버에서 현재 문서와 진행 상태를 확인하고 있습니다."
            : "잠시 후 다시 연결하거나 온라인 플레이로 나가주세요.")}
        </p>

        <div className="online-recovery-actions">
          {!isInitializing && !isRecovering && !isFatal && (
            <button type="button" className="mp-action-btn mp-action-btn--primary" onClick={onRetry}>
              다시 연결
            </button>
          )}
          <button type="button" className="mp-action-btn" onClick={onLeave} disabled={leaving}>
            {leaving ? "게임 정리 중..." : "온라인 플레이로 나가기"}
          </button>
        </div>
      </div>
    </div>
  );
}
