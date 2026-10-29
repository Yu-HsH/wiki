import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { claimResultMotion } from "../../utils/resultJournal.js";
import { drawDuelEnd } from "../../utils/duelEndPresentation.js";
import useCinematicFrame from "../../hooks/useCinematicFrame.js";
import ProfileAvatar from "../ProfileAvatar.jsx";
import useProfileCards from "../../hooks/useProfileCards.js";
import { buildProfileCard, mergeRewardSlots } from "../../utils/profileCard.js";
import "../../css/wikiRaceDuelEnd.css";
import { DuelEndRecordsVisible } from "./DuelEndVisibility.js";
import useAudioCues from '../../hooks/useAudioCues.js';
import { audioManager } from '../../services/audioManager.js';

/** Keep the original result/XP mounted from server confirmation, while its visual cover plays. */
export default function DuelEndSequence({ identity, scene, ready = true, eligible, myPlayer, opponentPlayer, children }) {
  const [phase, setPhase] = useState("pending");
  const decision = useRef(null), root = useRef(null), records = useRef(null), heading = useRef(null);
  const active = phase === "announcement";
  const duration = scene?.duration || 0;
  const soundFrame = useAudioCues(`duel-result:${identity}`, [{ id: 'verdict', at: scene?.kind === 'win' ? 860 : 720, sound: scene?.kind === 'forfeit' ? 'retire' : scene?.kind === 'win' ? 'win' : 'loss' }]);
  useEffect(() => { if (active) audioManager.prepare(['win', 'loss', 'retire']); }, [active]);
  useEffect(() => {
    if (!ready || !eligible || !scene || !window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    void audioManager.play(scene.kind === 'forfeit' ? 'retire' : scene.kind === 'win' ? 'win' : 'loss', { key: `duel-result:${identity}:verdict` });
  }, [identity, ready, eligible, scene]);
  const finish = useCallback((reason) => {
    if (reason === 'complete') soundFrame.complete(['win']);
    else {
      audioManager.cancelScope(`duel-result:${identity}`);
      audioManager.stopEffects();
    }
    if (decision.current) decision.current.allowed = false;
    else decision.current = { allowed: false, expires: 0 };
    setPhase("records");
  }, [identity, soundFrame]);

  useLayoutEffect(() => {
    if (phase === "records") return undefined;
    if (!ready) {
      const timer = setTimeout(finish, 3000);
      return () => clearTimeout(timer);
    }
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!decision.current) {
      let claimed = false;
      try { claimed = claimResultMotion(window.localStorage, identity); } catch { /* static result */ }
      decision.current = { allowed: claimed && eligible && Boolean(scene) && !document.hidden && !media.matches, expires: Date.now() + duration };
    }
    const remaining = decision.current.expires - Date.now();
    if (!decision.current.allowed || remaining <= 0) {
      if (decision.current.allowed) finish('complete');
      else setPhase("records");
      return undefined;
    }
    setPhase("announcement");
    const hidden = () => { if (document.hidden) finish(); };
    const storage = event => {
      if (event.key !== "wiki-race-result-motion-v1") return;
      try {
        if (!JSON.parse(event.oldValue || "[]").includes(identity) && JSON.parse(event.newValue || "[]").includes(identity)) finish();
      } catch { finish(); }
    };
    const timer = setTimeout(() => finish('complete'), remaining);
    document.addEventListener("visibilitychange", hidden);
    media.addEventListener("change", finish);
    window.addEventListener("online", finish);
    window.addEventListener("pagehide", finish);
    window.addEventListener("storage", storage);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", hidden);
      media.removeEventListener("change", finish);
      window.removeEventListener("online", finish);
      window.removeEventListener("pagehide", finish);
      window.removeEventListener("storage", storage);
    };
  }, [identity, eligible, duration, Boolean(scene), ready, finish, phase]);

  useEffect(() => {
    if (active) heading.current?.focus({ preventScroll: true });
    else if (phase === "records") records.current?.querySelector("#wr-duel-result-title")?.focus({ preventScroll: true });
  }, [active, phase]);
  useCinematicFrame(root, active, drawDuelEnd, duration, soundFrame);
  return <>
    {phase === "pending" && <div className="wr-duel-end"><div className="wr-de-wait"><p role="status">서버 종료 기록을 확인하고 있습니다.</p><button type="button" onClick={finish}>결과 바로 보기 →</button></div></div>}
    {active && <DuelEndAnnouncement root={root} heading={heading} scene={scene} myPlayer={myPlayer} opponentPlayer={opponentPlayer} finish={finish} />}
    <DuelEndRecordsVisible.Provider value={phase === "records"}>
      <div ref={records} hidden={phase !== "records"} inert={phase !== "records" ? "" : undefined} data-duel-end-records>{children}</div>
    </DuelEndRecordsVisible.Provider>
  </>;
}

function DuelEndAnnouncement({ root, heading, scene, myPlayer, opponentPlayer, finish }) {
  const cards = useProfileCards([myPlayer?.user_id, opponentPlayer?.user_id]);
  const participant = (player, own) => {
    const name = player?.nickname_snapshot || (own ? "나" : "상대");
    const card = mergeRewardSlots(buildProfileCard({ userId: player?.user_id, nickname: name, legacyImageUrl: player?.profile_image_snapshot, source: "snapshot" }), cards[player?.user_id]);
    const front = own === scene.won;
    const label = scene.kind === "forfeit" ? front ? "서버 확정 승자" : scene.disconnected ? "재접속 유예 종료" : "기권 · 종료" : front ? "승자" : "경기 종료";
    return <section className="wr-de-player" data-own={own} data-front={front}>
      <span className="wr-de-player-label">{own ? "나" : "상대"}</span>
      <div className="wr-de-avatar"><ProfileAvatar card={card} size="lg" /></div>
      {card?.title?.displayName && <span className="wr-de-equipped">{card.title.displayName}</span>}
      <h3>{name}</h3><span className="wr-de-state">{label}</span>
    </section>;
  };
  return <div ref={root} className="wr-duel-end" data-kind={scene.kind} data-won={scene.won} data-testid="duel-end-cinematic" role="dialog" aria-modal="true" aria-labelledby="wr-duel-end-title" aria-describedby="wr-duel-end-description"
    onKeyDown={event => {
      if (event.key === "Escape") { event.preventDefault(); finish(); }
      if (event.key === "Tab") { event.preventDefault(); root.current?.querySelector("button")?.focus(); }
    }}>
    <svg className="wr-de-terrain" viewBox="0 0 1400 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true">{Array.from({ length: 10 }, (_, i) => <path key={i} d={`M-50 ${80+i*65} Q230 ${-80+i*65} 450 ${150+i*65} T1050 ${100+i*65} T1500 ${200+i*65}`} />)}</svg>
    <div className="wr-de-arena">
      <p className="wr-de-kicker">DUEL END · 서버 확정 결과</p>
      {participant(myPlayer, true)}{participant(opponentPlayer, false)}
      <div className="wr-de-verdict"><h2 id="wr-duel-end-title" ref={heading} tabIndex={-1}>{scene.title}{scene.kind === "win" ? "!" : ""}</h2><p>{scene.kind === "forfeit" ? scene.label : ""}</p></div>
      <div className="wr-de-seal" aria-hidden="true">{scene.kind === "forfeit" ? "경기 종료" : scene.label}</div>
      <div className="wr-de-ring" aria-hidden="true" /><div className="wr-de-ink" aria-hidden="true">{Array.from({ length: 16 }, (_, i) => <i key={i} />)}</div>
      <p className="wr-de-description" id="wr-duel-end-description">{scene.description}</p>
      <button className="wr-de-skip" type="button" onClick={finish}>연출 건너뛰기 →</button>
    </div>
  </div>;
}
