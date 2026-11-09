import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createRematchRoom, fetchRematchRoom, joinRematchRoom } from "../services/rematchService.js";

/**
 * Result-screen offer; never rematches automatically and never rewrites the
 * finished room. The host explicitly creates a new private waiting room.
 * Former guests can choose to join; neither is made READY implicitly.
 */
export default function RematchResultAction({ sourceRoomId, mode, isHost, enabled }) {
  const navigate = useNavigate();
  const [nextRoomId, setNextRoomId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (!enabled || !sourceRoomId) return undefined;
    let cancelled = false;
    let busy = false;
    const refresh = async () => {
      if (cancelled || busy || document.hidden) return;
      busy = true;
      try {
        const id = await fetchRematchRoom(sourceRoomId);
        if (!cancelled) setNextRoomId(id);
      } catch (error) {
        if (!cancelled && !String(error?.message || "").includes("Could not find the function")) {
          setErrorMessage("재경기 준비방 정보를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.");
        }
      } finally {
        busy = false;
      }
    };
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 6000);
    const onFocus = () => { if (!document.hidden) void refresh(); };
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
    };
  }, [enabled, sourceRoomId]);

  const enterRoom = useCallback((id) => {
    navigate(mode === "group"
      ? `/multiplayer/group/room/${id}`
      : `/multiplayer/room/${id}`);
  }, [mode, navigate]);

  const handleRematch = async () => {
    if (!enabled || loading || inFlightRef.current) return;
    inFlightRef.current = true;
    setLoading(true);
    setErrorMessage("");
    try {
      // Host creation is idempotent; non-hosts explicitly accept the invite.
      const id = isHost
        ? await createRematchRoom(sourceRoomId)
        : await joinRematchRoom(sourceRoomId);
      if (!id) throw new Error("REMATCH_NOT_READY");
      enterRoom(id);
    } catch (error) {
      const message = error?.message || "";
      setErrorMessage(message.includes("REMATCH_NOT_READY")
        ? "방장이 재경기 준비방을 만들면 참가할 수 있습니다."
        : message.includes("REMATCH_ALREADY_STARTED") || message.includes("REMATCH_NOT_WAITING")
          ? "이미 재경기가 시작되었거나 준비방이 종료되었습니다."
          : "재경기 준비방에 들어가지 못했습니다. 다시 시도해 주세요.");
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  };

  if (!enabled) return null;

  return (
    <div className="wr-rematch-actions">
      <button type="button" className="wr-race-btn wr-race-btn--primary wr-race-btn--lg"
        onClick={() => void handleRematch()} disabled={loading || (!isHost && !nextRoomId)}>
        {loading ? "재경기 준비 중..." : isHost
          ? "같은 멤버로 다시 준비하기"
          : nextRoomId ? "재경기 준비방 참가" : "방장의 재경기 제안 대기 중"}
      </button>
      {!isHost && !nextRoomId && !errorMessage && (
        <span className="wr-rematch-hint" role="status">방장이 재경기 준비방을 만들면 이 버튼이 활성화됩니다.</span>
      )}
      {errorMessage && <span className="wr-rematch-error" role="alert">{errorMessage}</span>}
    </div>
  );
}
