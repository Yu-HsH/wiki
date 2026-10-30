import { useEffect, useState } from "react";
import { supabase, isSupabaseConfigured } from "../supabaseClient.js";
import useProfileCards from "./useProfileCards.js";
import { buildProfileCard, mergeRewardSlots } from "../utils/profileCard.js";

/**
 * Shared profile-card source for header and HOME explorer panel.
 * Equipped icon -> old image -> initial -> neutral default.
 */
export default function useOwnProfileCard(user, level = null) {
  const userId = !user?.isGuest && user?.id ? user.id : null;
  const equipped = useProfileCards(userId ? [userId] : []);
  const [legacy, setLegacy] = useState({ userId: null, url: null });

  useEffect(() => {
    if (!userId || !isSupabaseConfigured || !supabase) return undefined;
    let cancelled = false;
    supabase.from("profiles").select("profile_image_url").eq("id", userId).maybeSingle()
      .then(({ data, error }) => {
        if (!cancelled && !error) setLegacy({ userId, url: data?.profile_image_url ?? null });
      });
    return () => { cancelled = true; };
  }, [userId]);

  return mergeRewardSlots(buildProfileCard({
    userId: user?.id,
    nickname: user?.displayName,
    level,
    legacyImageUrl: legacy.userId === userId ? legacy.url : null,
    source: "live",
  }), userId ? equipped[userId] : null);
}
