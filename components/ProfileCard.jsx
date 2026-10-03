import React from "react";
import ProfileAvatar from "./ProfileAvatar.jsx";
import {
  DENSITY,
  NAME_FALLBACK,
  densityShows,
  resolveDisplayName,
} from "../utils/profileCard.js";
import { frameTier } from "../utils/rewardTokens.js";

/**
 * 프로필 카드 — C5 §2의 형태를 받아 §3 규칙대로 그린다.
 *
 * 크기·밀도만 prop으로 받는다 (C5 §5). fallback 규칙은 지점별로 달라지지 않는다.
 *
 * 레벨은 15b가, 아이콘·칭호·프레임·배경은 17b가 C1 장착 상태로 채운다
 * (`get_profile_card(s)_v1` → `mergeRewardSlots`). 없으면 `null`이고 렌더되지 않는다.
 * 배지는 폐지됐다 (16d, C5 §0). 프레임 단계는 `asset_ref` 토큰으로 정한다 (C5 §3.6).
 *
 * @param {object} props
 * @param {object} props.card C5 §2의 카드 형태
 * @param {"xs"|"sm"|"md"|"lg"|"xl"} [props.size]
 * @param {"full"|"compact"|"minimal"} [props.density]
 * @param {"participant"|"explorer"} [props.nameFallback]
 * @param {React.ReactNode} [props.nameSuffix] 이름 옆에 붙는 지점별 표식 (HOST 배지 등)
 * @param {React.ReactNode} [props.children] 이름 아래에 붙는 지점별 부가 정보 (제출 문서 등)
 */
export default function ProfileCard({
  card,
  size = "md",
  density = DENSITY.COMPACT,
  nameFallback = NAME_FALLBACK.EXPLORER,
  interactive = false,
  onClick,
  className = "",
  nameSuffix = null,
  children,
}) {
  const displayName = resolveDisplayName(card, nameFallback);
  const title = densityShows(density, "title") ? card?.title ?? null : null;
  const level = densityShows(density, "level") ? card?.level ?? null : null;
  const frame = densityShows(density, "frame") ? card?.frame ?? null : null;
  const background = densityShows(density, "background") ? card?.background ?? null : null;
  // null = 토큰 없음(옛 DB 포함) → 기본 링. tier-1~3 · special은 DESIGN-SYSTEM §2.
  const tier = frame ? frameTier(frame) : null;

  const rootClassName = [
    "pcard",
    `pcard--${density}`,
    `pcard--size-${size}`,
    frame ? "pcard--framed" : "",
    tier ? `pcard--frame-${tier}` : "",
    background ? "pcard--backed" : "",
    interactive ? "pcard--interactive" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const interactiveProps = interactive
    ? {
        role: "button",
        tabIndex: 0,
        onClick,
        onKeyDown: (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onClick?.(event);
          }
        },
      }
    : {};

  return (
    <div className={rootClassName} {...interactiveProps}>
      {/* special 프레임의 회전 링은 아바타(overflow: hidden) 바깥에 그려야 해서 감싼다 */}
      {tier === "special" ? (
        <span className="pcard-avatar-ring">
          <ProfileAvatar card={card} size={size} nameFallback={nameFallback} />
        </span>
      ) : (
        <ProfileAvatar card={card} size={size} nameFallback={nameFallback} />
      )}

      <div className="pcard-body">
        <div className="pcard-name-row">
          <span className="pcard-name">{displayName}</span>
          {level !== null && (
            <span className="pcard-level" aria-label={`레벨 ${level}`}>
              Lv.{level}
            </span>
          )}
          {nameSuffix}
        </div>

        {title && (
          <span className="pcard-title" aria-label={`대표 칭호 ${title.displayName}`}>
            {title.displayName}
          </span>
        )}

        {/* 프레임·배경은 시각 톤뿐이라 이름을 screen reader에 따로 준다 — C5 §3.4 (17b) */}
        {(frame || background) && (
          <span className="pcard-sr">
            {[frame && `프로필 프레임 ${frame.displayName}`, background && `프로필 배경 ${background.displayName}`]
              .filter(Boolean)
              .join(", ")}
          </span>
        )}

        {children && <div className="pcard-extra">{children}</div>}
      </div>
    </div>
  );
}
