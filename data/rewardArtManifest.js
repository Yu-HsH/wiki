/**
 * Approved local visual overrides. Keys are existing asset references and carry no unlock rules.
 * Shared frame tier references retain their existing tier semantics.
 */
const art = (number) => Object.freeze({
  src: "/assets/wiki-race/rewards/" + number + "/v1.svg",
  width: 64,
  height: 64,
});

export const REWARD_ART_MANIFEST = Object.freeze({
  profile_icon: Object.freeze({
    "/profile-icons/first-arrival.svg": art("a101"),
    "/profile-icons/x/48fa697d.svg": art("a102"),
    "/profile-icons/daily-explorer.svg": art("a103"),
    "/profile-icons/x/3036149e.svg": art("a104"),
    "/profile-icons/group-together.svg": art("a105"),
    "/profile-icons/x/2a70eb1b.svg": art("a106"),
  }),
  frame: Object.freeze({
    "frame:tier-1": art("a201"),
    "frame:tier-2": art("a202"),
    "frame:tier-3": art("a203"),
    "frame:special": art("a204"),
  }),
  background: Object.freeze({}),
  finish_effect: Object.freeze({}),
});
