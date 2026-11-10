import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import { fetchRecentRoomEmotes, sendRoomEmote } from "../services/roomEmoteService.js";
import { normalizeRoomEmoteEvent, upsertLatestRoomEmote } from "../utils/roomEmoteEvents.js";
import { getVisibleRaceEmotes, mergeRaceEmoteSnapshots } from "../utils/raceEmotePresentation.js";
import { KION_EMOTE_PRESETS, getKionEmote } from "../utils/kionEmoteCatalog.js";
import { KionEmoteBubble, KionEmotePicker } from "./KionEmotes.jsx";
import "./RaceRoomEmotes.css";

// Shares PR-3's opt-in rollout flag. Inert by default in every environment.
export const KION_RACE_EMOTES_ENABLED =
  import.meta.env.VITE_ENABLE_KION_ROOM_EMOTES === "true";

function deniedMessage(code) {
  if (code === "EMOTE_RATE_LIMIT") return "3초에 한 번만 보낼 수 있습니다.";
  if (code === "ROOM_EXPIRED") return "경기가 종료되어 더는 보낼 수 없습니다.";
  if (code === "SENDER_NOT_ACTIVE") return "현재 상태에서는 보낼 수 없습니다.";
  if (code === "ROOM_NOT_AVAILABLE") return "경기방 연결을 확인해주세요.";
  return "감정표현 전송에 실패했습니다.";
}

/** Presentation-only race strip: no movement or item controls are intercepted. */
export function RaceRoomEmotesView({
  visible = [],
  namesByUserId = new Map(),
  connected = false,
  sending = false,
  cooldownRemaining = false,
  feedback = "",
  hidden = false,
  onToggleHidden = () => {},
  onSend = () => {},
}) {
  return (
    <section className="wr-race-emotes" aria-label="경기 중 키온 감정표현">
      <span className="wr-race-emotes__title">키온</span>
      <div className="wr-race-emotes__reactions" aria-label="참가자 감정표현" aria-live="off">
        {!hidden && visible.length > 0
          ? visible.map((event) => {
              const preset = getKionEmote(event.emoteId);
              if (!preset) return null;
              return (
                <span className="wr-race-emotes__reaction" key={event.id}>
                  <span className="wr-race-emotes__sender" title={namesByUserId.get(event.userId) || "탐험가"}>
                    {namesByUserId.get(event.userId) || "탐험가"}
                  </span>
                  <KionEmoteBubble preset={preset} />
                </span>
              );
            })
          : <span className="wr-race-emotes__empty">
              {hidden ? "감정표현 표시를 숨겼습니다." : "키온으로 응원하거나 반응해보세요."}
            </span>}
      </div>
      <div className="wr-race-emotes__actions">
        <button
          type="button"
          className="wr-race-emotes__mute"
          aria-pressed={hidden}
          onClick={onToggleHidden}
        >
          {hidden ? "표시하기" : "숨기기"}
        </button>
        <KionEmotePicker
          presets={KION_EMOTE_PRESETS}
          onSend={onSend}
          disabled={!connected || sending || cooldownRemaining}
          label="키온 보내기"
        />
      </div>
      {feedback && <span className="wr-race-emotes__feedback" role="status">{feedback}</span>}
    </section>
  );
}

/**
 * Event transport for active 1:1 and group races. The server alone decides who
 * may send; local status checks only avoid presenting unusable controls.
 */
export default function RaceRoomEmotes({
  roomId,
  userId,
  players = [],
  active = false,
  roomStatus = "",
}) {
  const [events, setEvents] = useState([]);
  const [connected, setConnected] = useState(false);
  const [sending, setSending] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [hidden, setHidden] = useState(false);
  const [clock, setClock] = useState(() => Date.now());

  const me = players.find((player) => player.user_id === userId);
  const enabled = KION_RACE_EMOTES_ENABLED && Boolean(
    supabase && active && roomId && userId &&
    (roomStatus === "playing" || roomStatus === "grace_period") &&
    me?.player_status === "playing"
  );

  const namesByUserId = useMemo(() => new Map(
    players.map((player) => [player.user_id, player.nickname_snapshot || "탐험가"])
  ), [players]);

  useEffect(() => {
    if (!enabled) return undefined;
    const interval = window.setInterval(() => setClock(Date.now()), 850);
    return () => window.clearInterval(interval);
  }, [enabled]);

  useEffect(() => {
    setEvents([]);
    setFeedback("");
    setCooldownUntil(0);
    if (!enabled) {
      setConnected(false);
      return undefined;
    }
    let disposed = false;
    const channel = supabase
      .channel(`race-room-emotes:${roomId}`)
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
          // F5/reconnect: restore only the recent feed, not game progress.
          fetchRecentRoomEmotes(roomId, { limit: 30 })
            .then((rows) => {
              if (!disposed) setEvents((previous) => mergeRaceEmoteSnapshots(previous, rows));
            })
            .catch(() => {}); // Live INSERT continues even if backfill fails.
        }
      });
    return () => {
      disposed = true;
      setConnected(false);
      supabase.removeChannel(channel);
    };
  }, [enabled, roomId]);

  async function handleSend(emoteId) {
    if (!enabled || !connected || sending || Date.now() < cooldownUntil) return;
    setFeedback("");
    setSending(true);
    try {
      const response = await sendRoomEmote(roomId, emoteId);
      if (response.accepted) {
        if (response.event) {
          setEvents((previous) => upsertLatestRoomEmote(previous, response.event));
        }
        setCooldownUntil(Date.now() + 3000);
      } else {
        setFeedback(deniedMessage(response.code));
        if (response.code === "EMOTE_RATE_LIMIT") {
          setCooldownUntil(Date.now() + 3000);
        }
      }
    } catch {
      setFeedback("실시간 연결을 확인한 뒤 다시 시도해주세요.");
    } finally {
      setSending(false);
    }
  }

  if (!enabled) return null;
  return (
    <RaceRoomEmotesView
      visible={getVisibleRaceEmotes(events, clock, hidden)}
      namesByUserId={namesByUserId}
      connected={connected}
      sending={sending}
      cooldownRemaining={clock < cooldownUntil}
      feedback={feedback}
      hidden={hidden}
      onToggleHidden={() => setHidden((current) => !current)}
      onSend={handleSend}
    />
  );
}
