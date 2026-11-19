import { useState } from "react";
import { resolveRewardArt } from "../utils/rewardArt.js";

/** Image state is cosmetic only. Every source transition gets a distinct request identity. */
export default function useRewardArt(kind, reward) {
  const art = resolveRewardArt(kind, reward);
  const key = art ? kind + ":" + art.src : null;
  const [request, setRequest] = useState(() => ({ key, generation: {}, status: "loading" }));
  // Reset during render, before children commit; A→B→A cannot reuse the first A's ready state.
  if (request.key !== key) setRequest({ key, generation: {}, status: "loading" });
  const ready = Boolean(key && request.key === key && request.status === "ready");
  const failed = Boolean(key && request.key === key && request.status === "failed");
  const generation = request.generation;
  const settle = status => setRequest(previous =>
    previous.generation === generation && previous.key === key ? { ...previous, status } : previous);
  return {
    kind, art, ready, failed,
    imageProps: art && !failed ? {
      src: art.src, width: art.width, height: art.height,
      onLoad: event => settle(event.currentTarget.naturalWidth > 0 ? "ready" : "failed"),
      onError: () => settle("failed"),
    } : null,
  };
}
