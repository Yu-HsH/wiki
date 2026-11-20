import React, { useEffect, useRef, useState } from "react";
import { RewardEditorView } from "./AchievementRewardPreview.jsx";
import {
  equipErrorMessage,
  matchExpressionFromEquipment,
} from "../utils/profileCard.js";
import { equipProfileReward, fetchOwnMatchExpression, unequipProfileReward } from "../services/profileRewardService.js";
import { audioManager } from "../services/audioManager.js";

/** Production wrapper. Only full equipment responses can update the parent card. */
export default function ProfileRewardEditor(props) {
  return <ConnectedRewardEditor key={props.card?.userId ?? "signed-out"} {...props} />;
}

function ConnectedRewardEditor({ card, owned = [], onEquipment, loading = false, goals = [], previewCardWidth = null }) {
  const [pending, setPending] = useState(null);
  const [failed, setFailed] = useState(null);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [matchExpression, setMatchExpression] = useState(() => matchExpressionFromEquipment([]));
  const [matchStatus, setMatchStatus] = useState("loading");
  const [readAttempt, setReadAttempt] = useState(0);
  const active = useRef(false);
  const busy = useRef(false);
  const revision = useRef(0);
  const userId = card?.userId ?? null;

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; revision.current += 1; };
  }, []);

  useEffect(() => {
    if (!userId) { setMatchStatus("error"); return undefined; }
    let cancelled = false;
    const startedAt = revision.current;
    setMatchStatus("loading");
    fetchOwnMatchExpression(userId).then(value => {
      if (!cancelled && active.current && startedAt === revision.current) {
        setMatchExpression(value);
        setMatchStatus("ready");
      }
    }).catch(() => {
      if (!cancelled && active.current && startedAt === revision.current) setMatchStatus("error");
    });
    return () => { cancelled = true; };
  }, [userId, readAttempt]);

  const run = async (action) => {
    if (busy.current || !active.current || !userId || loading) return;
    busy.current = true; // Ref closes the same-frame duplicate-click window.
    revision.current += 1; // An older initial read must not overwrite a confirmed mutation.
    const requestSound = audioManager.action("profile-save");
    setPending(action);
    setFailed(null);
    setError("");
    setFeedback("");
    try {
      const request = () => action.type === "unequip"
        ? unequipProfileReward({ slot: action.slot, slotIndex: 1 })
        : equipProfileReward({ slot: action.slot, slotIndex: 1, rewardId: action.rewardId });
      const equipment = await request();
      if (!active.current) return;
      if (!Array.isArray(equipment)) throw new Error("EQUIPMENT_RESPONSE_INVALID");
      requestSound("saved");
      onEquipment?.(equipment);
      setMatchExpression(matchExpressionFromEquipment(equipment));
      setMatchStatus("ready");
      setFeedback("서버가 장착 상태를 확인했습니다. 저장된 카드와 아래 장착 중 표시를 확인해 주세요.");
    } catch (requestError) {
      if (!active.current) return;
      requestSound("denied");
      setFailed(action);
      setError(equipErrorMessage(requestError?.code));
      if (matchStatus === "loading") setReadAttempt(value => value + 1);
    } finally {
      busy.current = false;
      if (active.current) setPending(null);
    }
  };

  return <RewardEditorView card={card} owned={owned} goals={goals} loading={loading} previewCardWidth={previewCardWidth}
    matchExpression={matchExpression} matchStatus={matchStatus} pending={pending}
    error={error} feedback={feedback} onAction={run}
    onRetry={failed ? () => run(failed) : null} onRetryRead={() => setReadAttempt(value => value + 1)} />;
}
