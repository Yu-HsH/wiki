import React, { useState } from "react";
import ProfileCard from "../ProfileCard.jsx";
import UserProfileModal from "../UserProfileModal.jsx";
import useProfileCards from "../../hooks/useProfileCards.js";
import { buildProfileCard, DENSITY, mergeRewardSlots, NAME_FALLBACK } from "../../utils/profileCard.js";
import ExpeditionDialog from "./ExpeditionDialog.jsx";
import { HostTag, MeTag, StatusMark } from "./LobbyParts.jsx";

export function ItemRoomRoster({ mode, players, user, maxPlayers, emotes }) {
  const [profileId, setProfileId] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const cards = useProfileCards(players.map(player => player.userId));
  const duel = mode === "duel";
  const ready = players.filter(player => player.ready).length;
  const seats = [...players, ...Array(Math.max(0, maxPlayers - players.length)).fill(null)];

  function renderSeat(player, index) {
    if (!player) return duel
      ? <li key={index} className="wr-duel-player wr-duel-player--empty">
        <span className="wr-duel-empty-title">참가자 대기 중</span>
        <StatusMark tone="pending">입장 대기</StatusMark>
      </li>
      : <li key={index} className="wr-roster-row wr-roster-row--empty" aria-hidden="true">
        <span className="wr-empty-dot" />빈 자리
      </li>;
    const isMe = player.userId === user.id;
    const tags = <>{player.host && <HostTag />}{isMe && <MeTag />}</>;
    const card = mergeRewardSlots(buildProfileCard({
      userId: player.userId, nickname: isMe ? user.displayName || player.name : player.name,
      legacyImageUrl: isMe ? user.photoURL : undefined, source: "snapshot",
    }), cards[player.userId]);
    return <li key={player.key} className={[
      duel ? "wr-duel-player" : "wr-roster-row", isMe && "wr-is-me", player.ready && "is-ready",
    ].filter(Boolean).join(" ")}>
      {duel && <span className="wr-duel-player-tags">{tags}</span>}
      <ProfileCard card={card} size={duel ? "lg" : "sm"} density={DENSITY.FULL}
        nameFallback={NAME_FALLBACK.PARTICIPANT} interactive={Boolean(player.userId)}
        onClick={player.userId ? () => setProfileId(player.userId) : undefined}
        className={duel ? "wr-name-btn wr65-duel-profile pcard--stacked" : undefined}
        nameSuffix={duel ? undefined : tags} />
      <StatusMark tone={duel || player.ready ? "teal" : "pending"}>
        {duel ? "입장 완료" : player.ready ? "READY" : "준비 중"}
      </StatusMark>
    </li>;
  }

  return <>
    {duel ? <div className="wr-duel-stage">
      <ul className="wr-duel-players" aria-label={`참가자 ${players.filter(Boolean).length} / 2`}>
        {renderSeat(seats[0], 0)}
        <li className="wr-duel-center" aria-hidden="true">
          <span className="wr65-duel-vs">VS</span><span className="wr-duel-center-label">같은 목표</span>
        </li>
        {renderSeat(seats[1], 1)}
      </ul>
      {emotes}
    </div> : <div className="wr-party">
      <div className="wr-party-head">
        <span className="wr-party-count" aria-hidden="true">{players.length}<small> / {maxPlayers}</small></span>
        <h2 className="wr-section-label" id="item-room-roster-title">탐험대</h2>
        <span className="wr-party-ready" aria-hidden="true">READY {ready} / {players.length}</span>
        <button className="wr-link-btn wr-roster-toggle" type="button" aria-expanded={expanded}
          aria-controls="item-room-roster" onClick={() => setExpanded(value => !value)}>{expanded ? "접기" : "펼치기"}</button>
      </div>
      <ul id="item-room-roster" aria-labelledby="item-room-roster-title"
        className={`wr-roster ${expanded ? "" : "is-collapsed"}`} data-eight-seat={maxPlayers === 8 || undefined}>
        {seats.map(renderSeat)}
      </ul>
      {emotes}
      <p className="wr-roster-summary">참가 {players.length} / {maxPlayers} · READY {ready} / {players.length}</p>
    </div>}
    {profileId && <ExpeditionDialog className="wr65-duel-profile-dialog" titleId="item-room-profile-title" onClose={() => setProfileId(null)}>
      <h2 id="item-room-profile-title" className="wr-visually-hidden">탐험가 프로필</h2>
      <UserProfileModal isOpen userId={profileId} onClose={() => setProfileId(null)} />
    </ExpeditionDialog>}
  </>;
}
