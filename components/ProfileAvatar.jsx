import React, { useCallback, useEffect, useState } from "react";
import {
  AVATAR_STAGE,
  NAME_FALLBACK,
  avatarAltText,
  resolveAvatarStage,
  resolveDisplayName,
} from "../utils/profileCard.js";

/**
 * 프로필 아바타 — C5 §3.1~§3.4의 이미지·이니셜·alt만 담당한다.
 *
 * 규칙은 `utils/profileCard.js`에 있고 이 컴포넌트는 그리기만 한다.
 * **인라인 스타일을 쓰지 않는다** (C5 §5) — 크기는 `size` 토큰이 클래스로 바뀐다.
 * CSS는 `css/profileCard.css`이며 `appStyles.js`가 등록한다 (TRACKS.md R7).
 *
 * @param {object} props
 * @param {object} props.card C5 §2의 카드 형태 (`buildProfileCard`로 만든다)
 * @param {"xs"|"sm"|"md"|"lg"|"xl"} [props.size]
 * @param {"participant"|"explorer"} [props.nameFallback]
 */
export default function ProfileAvatar({
  card,
  size = "md",
  nameFallback = NAME_FALLBACK.EXPLORER,
  className = "",
}) {
  const [failedStages, setFailedStages] = useState([]);

  const iconRef = card?.icon?.assetRef ?? null;
  const legacyUrl = card?.legacyImageUrl ?? null;

  // 다른 사람의 카드로 바뀌면 실패 이력을 버린다. 카드 데이터 자체는 건드리지 않는다 (C5 §3.2).
  useEffect(() => {
    setFailedStages([]);
  }, [iconRef, legacyUrl]);

  const { stage, src, initial } = resolveAvatarStage(card, failedStages);
  const displayName = resolveDisplayName(card, nameFallback);
  const altText = avatarAltText(displayName);

  const handleError = useCallback(() => {
    setFailedStages((previous) => (previous.includes(stage) ? previous : [...previous, stage]));
  }, [stage]);

  const boxClassName = ["pcard-avatar", `pcard-avatar--${size}`, className]
    .filter(Boolean)
    .join(" ");

  if (stage === AVATAR_STAGE.ICON || stage === AVATAR_STAGE.LEGACY) {
    return (
      <span className={boxClassName}>
        <img className="pcard-avatar-img" src={src} alt={altText} onError={handleError} />
      </span>
    );
  }

  if (stage === AVATAR_STAGE.INITIAL) {
    return (
      <span className={boxClassName}>
        <span className="pcard-avatar-initial" role="img" aria-label={altText}>
          <span aria-hidden="true">{initial}</span>
        </span>
      </span>
    );
  }

  // 4단계 — 시스템 기본 이미지. 실물 에셋은 C5 §6-④가 `확인 필요`로 남긴 항목이라
  // 임의의 일러스트를 만들지 않고 중립 도형으로 둔다. accessible name은 유지한다 (§3.4).
  return (
    <span className={boxClassName}>
      <span className="pcard-avatar-default" role="img" aria-label={altText} />
    </span>
  );
}
