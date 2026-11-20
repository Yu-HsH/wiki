/**
 * Approved local visual overrides only. Keys are existing assetRefs, never reward IDs/names.
 * Empty until reviewed artwork is delivered. No catalog, ownership or unlock data lives here.
 * Example (not enabled):
 * frame: { "frame:tier-1": { src: "/assets/wiki-race/rewards/a001/v1.svg", width: 512, height: 512 } }
 * background "@default" can replace the shared null-ref fallback only, not distinguish rewards.
 */
export const REWARD_ART_MANIFEST = Object.freeze({
  profile_icon: Object.freeze({}),
  frame: Object.freeze({}),
  background: Object.freeze({}),
  finish_effect: Object.freeze({}),
});
