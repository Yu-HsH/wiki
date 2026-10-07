import React from "react";
import { HudBrand, RaceFrame, RaceHold, RaceHud } from "./wiki-race/race/RaceParts";

/**
 * 온라인 경기 준비·복구·종료 안내 — Phase 3 race 셸로 표시만 바뀌었다.
 * 상태(mode)·문구·재시도/나가기 핸들러는 호출하는 페이지의 기존 복구 로직 그대로다.
 */
export default function OnlineGameRecoveryPanel({
  mode = "recovering",
  message,
  onRetry,
  onLeave,
  leaving = false,
  gameMode = "online",
  modeLabel = "온라인",
}) {
  const isInitializing = mode === "initializing";
  const isRecovering = mode === "recovering";
  const isFatal = mode === "fatal";

  return (
    <RaceFrame mode={gameMode} label="경기 연결 상태">
      <RaceHud>
        <HudBrand mode={modeLabel} />
      </RaceHud>
      <div className="online-recovery-page" role={isFatal ? "alert" : "status"} aria-live="polite">
        <RaceHold
          kicker={isFatal ? "GAME ENDED" : isInitializing ? "GET READY" : "RECONNECT"}
          title={isInitializing
            ? "게임을 준비하고 있습니다"
            : isRecovering
              ? "게임 상태를 복구하고 있습니다"
              : isFatal
                ? "게임을 계속할 수 없습니다"
                : "연결을 복구하지 못했습니다"}
          actions={<>
            {!isInitializing && !isRecovering && !isFatal && (
              <button type="button" className="wr-race-btn wr-race-btn--primary" onClick={onRetry}>
                다시 연결
              </button>
            )}
            <button type="button" className="wr-race-btn" onClick={onLeave} disabled={leaving}>
              {leaving ? "게임 정리 중..." : "온라인 플레이로 나가기"}
            </button>
          </>}
        >
          <p>
            {message || (isInitializing
              ? "서버에서 참가자와 시작 문서를 확인하고 있습니다."
              : isRecovering
                ? "서버에서 현재 문서와 진행 상태를 확인하고 있습니다."
                : "잠시 후 다시 연결하거나 온라인 플레이로 나가주세요.")}
          </p>
        </RaceHold>
      </div>
    </RaceFrame>
  );
}
