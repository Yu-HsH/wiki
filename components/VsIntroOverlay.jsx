import React, { useEffect, useRef, useState } from "react";
import useSceneSequence from "../hooks/useSceneSequence.js";
import useCinematicFrame from "../hooks/useCinematicFrame.js";
import { drawDuel } from "../utils/cinematicMotion.js";
import ProfileAvatar from "./ProfileAvatar.jsx";
import useProfileCards from "../hooks/useProfileCards.js";
import { buildProfileCard, mergeRewardSlots } from "../utils/profileCard.js";
import useAudioCues from '../hooks/useAudioCues.js';
import { audioManager } from '../services/audioManager.js';

const DUEL_START_AUDIO = [{ id: 'vs-impact', at: 880, sound: 'impact' }];
import { CinematicStage, CinematicSkip, CourseDocument, InkParticles } from "./cinematic/CinematicParts.jsx";

export default function VsIntroOverlay({ myName, opponentName, startTitle, targetTitle, myInitial, opponentInitial, sceneKey = null, myPlayer = null, opponentPlayer = null, startedAt = null, motionEligible = true }) {
  const root = useRef(null), [skipped, setSkipped] = useState(false);
  const freshEntry = useRef(!startedAt || (Number.isFinite(Date.parse(startedAt)) && Date.now() - Date.parse(startedAt) < 5000));
  const cards = useProfileCards([myPlayer?.user_id, opponentPlayer?.user_id]);
  const cardFor = (player, nickname) => mergeRewardSlots(buildProfileCard({ userId: player?.user_id, nickname, legacyImageUrl: player?.profile_image_snapshot, source: "snapshot" }), cards[player?.user_id]);
  const sequence = useSceneSequence(sceneKey && `scene:start:duel:${sceneKey}`, { confirmed: Boolean(startTitle && targetTitle), eligible: motionEligible && freshEntry.current, duration: 5000, stopped: skipped });
  const soundFrame = useAudioCues(`duel-start:${sceneKey}`, DUEL_START_AUDIO);
  useEffect(() => { if (sequence) audioManager.prepare(['impact']); }, [sequence]);
  useEffect(() => { if (skipped) audioManager.stopEffects(); }, [skipped]);
  useCinematicFrame(root, sequence, drawDuel, 5000, soundFrame);
  const player = (value, name, initial, right) => {
    const card = cardFor(value, name);
    return <section className={`duel-player ${right ? "right" : "left"}`}>
      <div className="avatar-big">{value ? <ProfileAvatar card={card} size="lg" /> : initial}</div>
      <div className="route-text"><h2>{name}</h2>{card?.title?.displayName && <p className="title-equipped">{card.title.displayName}</p>}</div>
    </section>;
  };
  return <CinematicStage stageRef={root} scene="duel" active={sequence} className={`vs-overlay wr-start-overlay wr-duel-cinematic${sequence ? " is-duel-sequence" : ""}${Math.max(startTitle?.length || 0, targetTitle?.length || 0) > 45 ? " long" : ""}`} label="1:1 공통 코스 출발 안내">
    <div className="duel-composition">
      {player(myPlayer, myName, myInitial, false)}{player(opponentPlayer, opponentName, opponentInitial, true)}
      <div className="duel-slash" aria-hidden="true" /><div className="duel-vs vs-text" aria-hidden="true">VS</div><InkParticles duel />
      <section className="duel-course" aria-label="공통 코스"><div><CourseDocument title={startTitle} className="vs-course-start" /></div><span className="course-arrow" aria-hidden="true">→</span><div><CourseDocument title={targetTitle} target className="vs-course-target" /></div></section>
    </div>
    {sequence && <div className="stage-bottom"><CinematicSkip onClick={() => setSkipped(true)} /></div>}
  </CinematicStage>;
}
