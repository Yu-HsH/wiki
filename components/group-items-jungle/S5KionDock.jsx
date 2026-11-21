import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../supabaseClient.js";
import { RaceRoomEmotesView } from "../RaceRoomEmotes.jsx";
import { getVisibleRaceEmotes } from "../../utils/raceEmotePresentation.js";
import { mergeS5KionEvents } from "./s5KionEvents.js";
import "./s5KionDock.css";

const errorCopy = {
  EMOTE_INVALID: "이 감정표현은 사용할 수 없어요.",
  EMOTE_RATE_LIMIT: "3초에 한 번만 보낼 수 있어요.",
  SENDER_NOT_ACTIVE: "지금은 감정표현을 보낼 수 없어요.",
};

export default function S5KionDock({ roomId, actorId, players = [], spectator = false }) {
  const [events, setEvents] = useState([]);
  const [connected, setConnected] = useState(false);
  const [sending, setSending] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [hidden, setHidden] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [clock, setClock] = useState(() => Date.now());
  const inFlight = useRef(false);
  const namesByUserId = useMemo(() => new Map(players.map(player => [
    player.participantId, player.name || "탐험가",
  ])), [players]);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 850);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!roomId || !actorId || !supabase) return undefined;
    let disposed = false;
    let catchupTimer = null;
    setEvents([]);
    setConnected(false);
    inFlight.current = false;
    const backfill = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session || session.user?.id !== actorId) return;
        const { data, error } = await supabase.rpc("get_group_items_kion_v1", {p_room: roomId});
        if (error) throw error;
        if (!disposed) setEvents(previous => mergeS5KionEvents(previous, data, roomId, actorId));
      } catch {
        // The six-second emotes expire naturally. Never block the game UI.
      }
    };
    const onVisibility = () => {
      if (!document.hidden) void backfill();
    };
    const channel = supabase.channel("s5-kion:"+roomId+":"+actorId)
      .on("postgres_changes", {
        event:"*", schema:"ink_product_events", table:"emotes_v1", filter:"recipient_id=eq."+actorId,
      }, change => {
        if (disposed || !change.new) return;
        setEvents(previous => mergeS5KionEvents(previous, change.new, roomId, actorId));
      })
      .subscribe(status => {
        if (disposed) return;
        setConnected(status === "SUBSCRIBED");
        if (catchupTimer !== null) window.clearTimeout(catchupTimer);
        if (status === "SUBSCRIBED") {
          void backfill();
          // Protect the first event while the WAL listener is warming up.
          catchupTimer = window.setTimeout(() => void backfill(), 4000);
        }
      });
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      disposed = true;
      if (catchupTimer !== null) window.clearTimeout(catchupTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      void supabase.removeChannel(channel);
    };
  }, [roomId, actorId]);

  async function onSend(emoteId) {
    if (!connected || sending || inFlight.current || Date.now() < cooldownUntil) return;
    inFlight.current = true;
    setSending(true);
    setFeedback("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.id !== actorId) throw new Error("AUTH_REQUIRED");
      const { data, error } = await supabase.rpc("send_group_items_kion_v1", {
        p_room:roomId, p_emote_id:emoteId,
      });
      if (error) throw error;
      if (!data?.accepted) {
        setFeedback(errorCopy[data?.code] ?? "전송할 수 없어요.");
        if (data?.code === "EMOTE_RATE_LIMIT") setCooldownUntil(Date.now() + 3000);
      } else {
        if (data.event) setEvents(previous => mergeS5KionEvents(previous, data.event, roomId, actorId));
        setCooldownUntil(Date.now() + 3000);
        setClock(Date.now());
      }
    } catch {
      setFeedback("감정표현 전송에 실패했어요. 연결을 확인해주세요.");
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  }

  return <div className={"s5-kion-dock" + (spectator ? " s5-kion-dock--spectator" : "")}>
    <RaceRoomEmotesView visible={getVisibleRaceEmotes(events, clock, hidden, roomId)}
      namesByUserId={namesByUserId} connected={connected} sending={sending}
      cooldownRemaining={clock < cooldownUntil} feedback={feedback} hidden={hidden}
      onToggleHidden={() => setHidden(current => !current)} onSend={onSend}/>
  </div>;
}
