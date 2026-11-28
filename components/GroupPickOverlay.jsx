import React, { useEffect, useRef, useState } from "react";
import ProfileAvatar from "./ProfileAvatar.jsx";
import { CinematicStage, CinematicSkip, CourseSlots } from "./cinematic/CinematicParts.jsx";
import useProfileCards from "../hooks/useProfileCards.js";
import useSceneSequence from "../hooks/useSceneSequence.js";
import useCinematicFrame from "../hooks/useCinematicFrame.js";
import { drawGroupStart } from "../utils/cinematicMotion.js";
import { buildProfileCard, mergeRewardSlots } from "../utils/profileCard.js";
import useAudioCues from '../hooks/useAudioCues.js';
import { audioManager } from '../services/audioManager.js';

const GROUP_START_AUDIO = [{ id: 'roster', at: 0, sound: 'open' },
  { id: 'start-lock', at: 1800, sound: 'reveal' }, { id: 'target-lock', at: 3500, sound: 'reveal' },
  { id: 'departure', at: 4000, sound: 'go' }];
const SCHEDULED_GROUP_START_AUDIO = GROUP_START_AUDIO.filter(cue => cue.sound !== "go");

export default function GroupPickOverlay({ startTitle, targetTitle, players = [], sceneKey = null, startedAt = null, motionEligible = true, onComplete, presentationDuration = 5400, scheduledElapsedMs = 0 }) {
  const completeRef = useRef(onComplete), root = useRef(null);
  useEffect(() => { completeRef.current = onComplete; }, [onComplete]);
  const cards = useProfileCards(players.map(p => p.user_id));
  const [skipped, setSkipped] = useState(false);
  const freshEntry = useRef(!startedAt || (Number.isFinite(Date.parse(startedAt)) && Date.now() - Date.parse(startedAt) < 5400));
  const sequence = useSceneSequence(sceneKey && `scene:start:group:${sceneKey}`, { eligible: motionEligible && freshEntry.current, confirmed: Boolean(startTitle && targetTitle && players.length >= 3), duration:presentationDuration - scheduledElapsedMs, stopped: skipped });
  const soundFrame = useAudioCues(`group-start:${sceneKey}`, presentationDuration === 5400 ? GROUP_START_AUDIO : SCHEDULED_GROUP_START_AUDIO);
  useEffect(() => { if (sequence) audioManager.prepare(['open', 'reveal', 'go']); }, [sequence]);
  useEffect(() => { if (skipped) audioManager.stopEffects(); }, [skipped]);
  const pace = 5400 / presentationDuration;
  useCinematicFrame(root, sequence, (element,time,reduced) => drawGroupStart(element,time*pace,reduced),
    presentationDuration, (elapsed,active) => soundFrame(elapsed*pace,active), scheduledElapsedMs);
  useEffect(() => { const timer = setTimeout(() => completeRef.current?.(), presentationDuration); return () => clearTimeout(timer); }, [presentationDuration]);
  return <CinematicStage stageRef={root} scene="group-start" active={sequence} className={`group-pick-overlay wr-start-overlay wr-group-departure${players.length > 5 ? " eight" : ""}${sequence ? " is-group-sequence" : ""}${Math.max(startTitle?.length || 0, targetTitle?.length || 0) > 45 ? " long" : ""}`} label="원정대 출발 안내">
    <section className="group-composition">
      <ul className="roster wr-start-roster" style={{ "--count": players.length }} aria-label="실제 참가자">
        {players.map(player => <li className="roster-person" key={player.user_id}><div className="avatar"><ProfileAvatar size="xs" card={mergeRewardSlots(buildProfileCard({ userId: player.user_id, nickname: player.nickname_snapshot, legacyImageUrl: player.profile_image_snapshot, source: "snapshot" }), cards[player.user_id])} /></div><strong>{player.nickname_snapshot || "이름 확인 중"}</strong></li>)}
      </ul>
      <CourseSlots startTitle={startTitle} targetTitle={targetTitle} />
    </section>
    {sequence && <div className="stage-bottom"><CinematicSkip onClick={() => setSkipped(true)} /></div>}
  </CinematicStage>;
}
