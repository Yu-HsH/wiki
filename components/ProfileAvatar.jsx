import React, { useCallback, useState } from "react";
import { AVATAR_STAGE, NAME_FALLBACK, avatarAltText, resolveAvatarStage, resolveDisplayName } from "../utils/profileCard.js";
import useRewardArt from "../hooks/useRewardArt.js";
import RewardArtImage from "./RewardArtImage.jsx";

/** C5 image chain: approved override → existing icon → legacy → initial → default.
 * Failures only change presentation. A new source identity gets its own failure state.
 */
export default function ProfileAvatar(props) {
  const key = JSON.stringify([props.card?.icon?.assetRef ?? null, props.card?.legacyImageUrl ?? null]);
  return <AvatarImageChain key={key} {...props} />;
}
function AvatarImageChain({ card, size = "md", nameFallback = NAME_FALLBACK.EXPLORER, className = "", imageLabel = null }) {
  const [failedStages, setFailedStages] = useState([]);
  const art = useRewardArt("profile_icon", card?.icon);
  const { stage, src, initial } = resolveAvatarStage(card, failedStages);
  const altText = imageLabel || avatarAltText(resolveDisplayName(card, nameFallback));
  const handleError = useCallback(() => {
    setFailedStages(previous => previous.includes(stage) ? previous : [...previous, stage]);
  }, [stage]);
  const boxClassName = ["pcard-avatar", `pcard-avatar--${size}`, className].filter(Boolean).join(" ");
  let fallback;
  if (stage === AVATAR_STAGE.ICON || stage === AVATAR_STAGE.LEGACY) {
    fallback = <img key={stage + ":" + src} className="pcard-avatar-img" src={src} alt={altText} onError={handleError} />;
  } else if (stage === AVATAR_STAGE.INITIAL) {
    fallback = <span className="pcard-avatar-initial" role="img" aria-label={altText}><span aria-hidden="true">{initial}</span></span>;
  } else {
    fallback = <span className="pcard-avatar-default" role="img" aria-label={altText} />;
  }
  return <span className={boxClassName}>
    {!art.ready && fallback}
    <RewardArtImage presentation={art} className="pcard-avatar-img" alt={altText} />
  </span>;
}
