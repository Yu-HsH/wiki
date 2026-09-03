import React from "react";
import ProfileAvatar from "./ProfileAvatar.jsx";
import {
  DENSITY,
  NAME_FALLBACK,
  densityShows,
  orderedBadges,
  resolveDisplayName,
} from "../utils/profileCard.js";

/**
 * 프로필 카드 — C5 §2의 형태를 받아 §3 규칙대로 그린다.
 *
 * 크기·밀도만 prop으로 받는다 (C5 §5). fallback 규칙은 지점별로 달라지지 않는다.
 *
 * **레벨·칭호·배지·프레임·배경은 이 웨이브에서 슬롯이다** — 호출자가 전부 `null`/`[]`을
 * 넘기므로 렌더되지 않는다 (TRACKS.md §8-A 범위 밖 ④). C1/C3 DDL 이후 15b·16·17b가 채운다.
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
  const badges = densityShows(density, "badges") ? orderedBadges(card?.badges) : [];
  const title = densityShows(density, "title") ? card?.title ?? null : null;
  const level = densityShows(density, "level") ? card?.level ?? null : null;
  const frame = densityShows(density, "frame") ? card?.frame ?? null : null;
  const background = densityShows(density, "background") ? card?.background ?? null : null;

  const rootClassName = [
    "pcard",
    `pcard--${density}`,
    `pcard--size-${size}`,
    frame ? "pcard--framed" : "",
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
      <ProfileAvatar card={card} size={size} nameFallback={nameFallback} />

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

        {/* 배지 0개면 영역 자체를 렌더하지 않는다 — C5 §3.5 */}
        {badges.length > 0 && (
          <ul className="pcard-badges">
            {badges.map((badge) => (
              <li key={badge.rewardId} className="pcard-badge">
                {/* 장착 보상은 screen reader 이름을 갖는다 — C5 §3.4. 빈 alt는 쓰지 않는다 */}
                {badge.assetRef ? (
                  <img
                    className="pcard-badge-img"
                    src={badge.assetRef}
                    alt={`대표 배지 ${badge.displayName}`}
                  />
                ) : (
                  <span className="pcard-badge-text">{badge.displayName}</span>
                )}
              </li>
            ))}
          </ul>
        )}

        {children && <div className="pcard-extra">{children}</div>}
      </div>
    </div>
  );
}
