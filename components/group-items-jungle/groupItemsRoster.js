import { countGroupParticipants, orderGroupParticipants } from "../../utils/groupRacePresentation.js";
import { buildProfileCard, mergeRewardSlots } from "../../utils/profileCard.js";

export function groupItemsRoster(players, profileCards) {
  const people = players.map(player => ({
    user_id:player.participantId,
    nickname_snapshot:player.nickname || player.name,
    status:player.status,
    rank:player.rank,
    current_title:player.currentTitle,
    move_count:player.moveCount,
    elapsed_seconds:Number.isFinite(player.elapsedSeconds) ? Math.floor(player.elapsedSeconds) : null,
    path_titles:player.pathTitles ?? [],
    profileCard:mergeRewardSlots(buildProfileCard({ userId:player.profileId, nickname:player.nickname || player.name,
      source:"snapshot" }), profileCards[player.profileId]),
  }));
  return { entries:orderGroupParticipants(people), counts:countGroupParticipants(people) };
}
