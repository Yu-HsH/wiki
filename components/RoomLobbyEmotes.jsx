import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import { sendRoomEmote, fetchRecentRoomEmotes } from "../services/roomEmoteService.js";
import { normalizeRoomEmoteEvent, upsertLatestRoomEmote } from "../utils/roomEmoteEvents.js";
import { KION_EMOTE_PRESETS, getKionEmote } from "../utils/kionEmoteCatalog.js";
import { KionEmoteBubble, KionEmotePicker } from "./KionEmotes.jsx";
import "./RoomLobbyEmotes.css";

// Default OFF until PR-2's database migration and two-account production gate
// have been explicitly approved. Never expose a dead send button.
export const KION_LOBBY_EMOTES_ENABLED =
  import.meta.env.VITE_ENABLE_KION_ROOM_EMOTES === "true";

const VISIBLE_MS = 6_000;

function mergeSnapshots(previous, incoming) {
  const byUser = new Map();
  for (const event of [...previous, ...incoming]) {
    const existing = byUser.get(event.userId);
    if (
      !existing ||
      event.createdAt > existing.createdAt ||
      (event.createdAt === existing.createdAt && event.id > existing.id)
    ) byUser.set(event.userId, event);
  }
  return Array.from(byUser.values())
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
}

function errorMessage(code) {
  if (code === "EMOTE_RATE_LIMIT") return "감정표현은 3초에 한 번씩 보낼 수 있습니다.";
  if (code === "ROOM_EXPIRED") return "이 방에서는 감정표현을 보낼 수 없습니다.";
  if (code === "SENDER_NOT_ACTIVE") return "현재 상태에서는 감정표현을 사용할 수 없습니다.";
  if (code === "ROOM_NOT_AVAILABLE") return "방에 다시 입장한 뒤 시도해주세요.";
  return "감정표현을 보내지 못했습니다. 다시 시도해주세요.";
}

/**
 * Reusable 1:1 / group waiting-room emote dock.
 * Not chat: only ten server-validated preset IDs, no free text or direct inserts.
 */
export default function RoomLobbyEmotes({ roomId, userId, players = [], roomStatus }) {
  const [events, setEvents] = useState([]);
  const [connected, setConnected] = useState(false);
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [clock, setClock] = useState(() => Date.now());

  const isJoined = players.some((player) => player.user_id === userId);
  const enabled = KION_LOBBY_EMOTES_ENABLED && Boolean(supabase && roomId && userId)
    && roomStatus === "waiting" && isJoined;

  const namesByUserId = useMemo(
    () => new Map(players.map((player) => [player.user_id, player.nickname_snapshot || "탐험가"])),
    [players]
  );

  useEffect(() => {
    if (!enabled) return undefined;
    const timer = window.setInterval(() => setClock(Date.now()), 900);
    return () => window.clearInterval(timer);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setConnected(false);
      return undefined;
    }

    let disposed = false;
    const channel = supabase
      .channel(`room-emotes-lobby:${roomId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "room_events",
        filter: `room_id=eq.${roomId}`,
      }, (change) => {
        if (disposed || change.new?.event_type !== "room_emote") return;
        const parsed = normalizeRoomEmoteEvent(change.new);
        if (!parsed || parsed.roomId !== roomId) return;
        setEvents((previous) => upsertLatestRoomEmote(previous, change.new));
      })
      .subscribe((status) => {
        if (disposed) return;
        setConnected(status === "SUBSCRIBED");
        if (status === "SUBSCRIBED") {
          fetchRecentRoomEmotes(roomId, { limit: 30 })
            .then((rows) => {
              if (!disposed) setEvents((previous) => mergeSnapshots(previous, rows));
            })
            .catch(() => {
              // Realtime INSERT will still display live reactions.
            });
        }
      });
    return () => {
      disposed = true;
      setConnected(false);
      supabase.removeChannel(channel);
    };
  }, [enabled, roomId]);

  const visible = events.filter((event) =>
    event.roomId === roomId && event.createdAt <= clock + 500 &&
    clock - event.createdAt < VISIBLE_MS
  );

  async function handleSend(emoteId) {
    if (!enabled || !connected || sending || Date.now() < cooldownUntil) return;
    setSending(true);
    setFeedback("");
    try {
      const response = await sendRoomEmote(roomId, emoteId);
      if (response.accepted) {
        if (response.event) setEvents((previous) => upsertLatestRoomEmote(previous, response.event));
        setCooldownUntil(Date.now() + 3_000);
      } else {
        setFeedback(errorMessage(response.code));
        if (response.code === "EMOTE_RATE_LIMIT") setCooldownUntil(Date.now() + 3_000);
      }
    } catch {
      setFeedback("실시간 감정표현 연결을 확인해주세요.");
    } finally {
      setSending(false);
    }
  }

  if (!enabled) return null;

  return (
    <section className="wr-kion-room-dock" aria-label="대기방 감정표현">
      <div className="wr-kion-room-dock__info">
        <strong>키온 감정표현</strong>
        <span>대기하는 동안 서로 인사하거나 응원해보세요.</span>
      </div>
      <div className="wr-kion-room-dock__live" aria-label="최근 감정표현">
        {visible.length > 0 ? visible.map((event) => {
          const preset = getKionEmote(event.emoteId);
          if (!preset) return null;
          return (
            <span className="wr-kion-room-dock__reaction" key={event.id}>
              <span className="wr-kion-room-dock__name">{namesByUserId.get(event.userId) || "탐험가"}</span>
              <KionEmoteBubble preset={preset} />
            </span>
          );
        }) : <span className="wr-kion-room-dock__empty">아직 감정표현이 없습니다.</span>}
      </div>
      <KionEmotePicker
        presets={KION_EMOTE_PRESETS}
        onSend={handleSend}
        disabled={!connected || sending || clock < cooldownUntil}
        label="키온 보내기"
      />
      {feedback && <p className="wr-kion-room-dock__feedback" role="status">{feedback}</p>}
    </section>
  );
}
