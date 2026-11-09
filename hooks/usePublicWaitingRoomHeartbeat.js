import { useEffect } from "react";
import { heartbeatPublicWaitingRoom } from "../services/publicRoomService.js";

/**
 * Only the authenticated host of a PUBLIC waiting room may refresh its lease.
 * A hidden tab does not keep a room alive indefinitely; focus/visibility
 * resumes the pulse if it is still inside the server's 2h expiry window.
 */
export default function usePublicWaitingRoomHeartbeat(room, userId, setError) {
  const roomId = room?.id;
  const enabled = Boolean(roomId && userId &&
    room.status === "waiting" && room.is_public === true && room.host_user_id === userId);

  useEffect(() => {
    if (!enabled || !roomId) return undefined;
    let cancelled = false;
    let inFlight = false;

    const pulse = async () => {
      if (cancelled || inFlight || document.hidden) return;
      inFlight = true;
      try {
        const alive = await heartbeatPublicWaitingRoom(roomId);
        if (!cancelled && alive === false) {
          setError("공개 대기방이 만료되었거나 종료되었습니다. 새로운 방을 생성해 주세요.");
        }
      } catch (error) {
        // Network outages must not kick out a connected lobby immediately.
        // The server remains authoritative for expiry and membership.
        if (!cancelled && /PUBLIC_ROOM_EXPIRED|PUBLIC_ROOM_NOT_WAITING/.test(error?.message ?? "")) {
          setError("공개 대기방이 만료되었습니다. 새로운 방을 생성해 주세요.");
        }
      } finally {
        inFlight = false;
      }
    };

    void pulse();
    const timer = window.setInterval(() => { void pulse(); }, 60000);
    const onVisible = () => { if (!document.hidden) void pulse(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [enabled, roomId, setError]);
}
