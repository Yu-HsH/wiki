import { REWARD_ART_MANIFEST } from "../data/rewardArtManifest.js";

export const STATIC_REWARD_ART_KINDS = Object.freeze(["profile_icon", "frame", "background", "finish_effect"]);
export const DEFAULT_REWARD_ART_KEY = "@default";
const LOCAL_IMAGE = /^\/assets\/wiki-race\/rewards\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.(svg|png)$/;
const dimension = value => Number.isInteger(value) && value > 0 && value <= 8192;

/**
 * Presentation only: consumes an already-visible RewardRef; never decides entitlement.
 * Missing/unsupported/unregistered art keeps the existing renderer. No ID/name lookup.
 * SVG/PNG are the only implemented media; video/sprite/Lottie are separate future adapters.
 */
export function resolveRewardArt(kind, reward, manifest = REWARD_ART_MANIFEST) {
  if (!STATIC_REWARD_ART_KINDS.includes(kind) || !reward || typeof reward !== "object") return null;
  if (reward.kind && reward.kind !== kind) return null;
  const raw = reward.assetRef;
  if (raw != null && typeof raw !== "string") return null;
  const ref = typeof raw === "string" ? raw.trim() : "";
  const key = ref || (kind === "background" ? DEFAULT_REWARD_ART_KEY : null);
  if (!key || !manifest || !Object.hasOwn(manifest, kind)) return null;
  const entries = manifest[kind];
  if (!entries || typeof entries !== "object" || !Object.hasOwn(entries, key)) return null;
  const art = entries[key];
  if (!art || typeof art !== "object" || typeof art.src !== "string" || !LOCAL_IMAGE.test(art.src) || !dimension(art.width) || !dimension(art.height)) return null;
  return Object.freeze({ src: art.src, width: art.width, height: art.height });
}
