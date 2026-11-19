import React from "react";
import { SingleAchievementCardView } from "./AchievementRewardPreview.jsx";

// Preserve the existing component entry point; the shared presenter has no service imports.
export default function SingleAchievementCard(props) {
  return <SingleAchievementCardView {...props} />;
}
