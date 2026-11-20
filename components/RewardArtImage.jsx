import React from "react";

/** Static decorative art; hidden while loading so the caller's existing fallback remains. */
export default function RewardArtImage({ presentation, className = "", alt = "" }) {
  if (!presentation.imageProps) return null;
  return <img key={presentation.imageProps.src} {...presentation.imageProps}
    className={["reward-art-image", className].filter(Boolean).join(" ")}
    data-reward-art={presentation.kind} hidden={!presentation.ready}
    alt={alt} aria-hidden={alt ? undefined : true} draggable={false} />;
}
