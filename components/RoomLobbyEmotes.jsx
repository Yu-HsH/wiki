import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../supabaseClient";
import { sendRoomEmote, fetchRecentRoomEmotes } from "../services/roomEmoteService.js";
import { normalizeRoomEmoteEvent, upsertLatestRoomEmote } from "../utils/roomEmoteEvents.js";
import { visibleRoomLobbyReactions, mergeRoomLobbySnapshots } from "../utils/lobbyEmotePresentation.js";
import { KION_EMOTE_PRESETS, getKionEmote } from "../utils/kionEmoteCatalog.js";
import { KionEmoteSticker, KionEmotePicker } from "./KionEmotes.jsx";
import "./RoomLobbyEmotes.css";

// Default OFF until PR-2's DB authority and two-client realtime are verified.
export const KION_LOBBY_EMOTES_ENABLED =
  import.meta.env.VITE_ENABLE_KION_ROOM_EMOTES === "true";

function errorMessage(code) {
  if (code === "EMOTE_RATE_LIMIT") return "감정표현은 3초에 한 번씩 보낼 수 있습니다.";
  if (code === "ROOM_EXPIRED") return "이 방에서는 감정표현을 보낼 수 없습니다.";
  if (code === "SENDER_NOT_ACTIVE") return "현재 상태에서는 감정표현을 사용할 수 없습니다.";
  if (code === "ROOM_NOT_AVAILABLE") return "방에 다시 입장한 뒤 시도해주세요.";
  return "감정표현을 보내지 못했습니다. 다시 시도해주세요.";
}

/**
 * The lobby pages call one shared hook, then render speech bubbles next to
 * their ACTUAL player cards. No duplicate channels, no generic top-level dock.
 * Local cooldown is UI-only; the database RPC remains authoritative.
 */
export function useRoomLobbyEmotes({ roomId, userId, players = [], roomStatus }) {
  const [events, setEvents] = useState([]);
  const [connected, setConnected] = useState(false);
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [clock, setClock] = useState(() => Date.now());
  const sendGuard = useRef(false);

  const isJoined = players.some((player) => player.user_id === userId);
  const enabled = KION_LOBBY_EMOTES_ENABLED &&
    Boolean(supabase && roomId && userId) &&
    roomStatus === "waiting" && isJoined;

  useEffect(() => {
    if (!enabled) return undefined;
    const timer = window.setInterval(() => setClock(Date.now()), 700);
    return () => window.clearInterval(timer);
  }, [enabled]);

  useEffect(() => {
    setEvents([]);
    setFeedback("");
    setCooldownUntil(0);
    setConnected(false);
    sendGuard.current = false;
    if (!enabled) return undefined;

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
              if (!disposed) setEvents((previous) => mergeRoomLobbySnapshots(previous, rows));
            })
            .catch(() => {
              // The live listener remains mounted even if backfill is unavailable.
            });
        }
      });

    return () => {
      disposed = true;
      supabase.removeChannel(channel);
    };
  }, [enabled, roomId]);

  const reactionsByUserId = useMemo(() => new Map(
    visibleRoomLobbyReactions(events, roomId, clock, players)
      .map((event) => [event.userId, event])
  ), [events, roomId, clock, players]);

  async function onSend(emoteId) {
    if (!enabled || !connected || sendGuard.current || Date.now() < cooldownUntil) return;
    sendGuard.current = true;
    setSending(true);
    setFeedback("");
    try {
      const response = await sendRoomEmote(roomId, emoteId);
      if (response.accepted) {
        // DB-accepted only: do not show an unconfirmed reaction.
        if (response.event) {
          setEvents((previous) => upsertLatestRoomEmote(previous, response.event));
        }
        setCooldownUntil(Date.now() + 3_000);
      } else {
        setFeedback(errorMessage(response.code));
        if (response.code === "EMOTE_RATE_LIMIT") {
          setCooldownUntil(Date.now() + 3_000);
        }
      }
    } catch {
      setFeedback("실시간 감정표현 연결을 확인해주세요.");
    } finally {
      sendGuard.current = false;
      setSending(false);
    }
  }

  return {
    enabled, reactionsByUserId, connected, sending, clock, cooldownUntil,
    feedback, onSend,
  };
}

/** One reaction belongs to one occupied player's card; never render for empty seats. */
export function RoomLobbyEmoteBubble({ event, position = "group" }) {
  const preset = getKionEmote(event?.emoteId);
  if (!preset) return null;
  return (
    <span
      key={event.id}
      className={`wr-kion-card wr-kion-card--${position}`}
      aria-label={`키온 감정표현: ${preset.label}`}
      title={preset.label}
    >
      <KionEmoteSticker preset={preset} size={64} />
      <span className="wr-kion-card__label">{preset.label}</span>
    </span>
  );
}

/** Picker and any failure feedback stay below the roster, not above the HUD. */
export function RoomLobbyEmoteControls({ state, mode = "group" }) {
  if (!state?.enabled) return null;
  return (
    <div className={`wr-kion-room-controls wr-kion-room-controls--${mode}`} role="group" aria-label="대기방 키온 감정표현">
      <span className="wr-kion-room-controls__hint">키온으로 인사하거나 응원해보세요.</span>
      <KionEmotePicker
        presets={KION_EMOTE_PRESETS}
        onSend={state.onSend}
        disabled={!state.connected || state.sending || state.clock < state.cooldownUntil}
        label="키온 보내기"
      />
      {state.feedback && <span className="wr-kion-room-controls__feedback" role="status">{state.feedback}</span>}
    </div>
  );
}
