// Kion emotes for multiplayer UI. The first five spectator RPC IDs remain server-owned.
const EMOTES = [
  ["hello", "안녕!", "👋"],
  ["ready", "레디!", "🚩"],
  ["go", "가자!", "🧭"],
  ["good", "좋아!", "👍"],
  ["wait", "잠깐!", "✋"],
  ["hurry", "서둘러!", "🏃"],
  ["wow", "헉!", "😮"],
  ["lol", "ㅋㅋ", "😆"],
  ["sad", "아쉽다", "🥺"],
  ["gg", "GG!", "✨"],
];

export const KION_EMOTE_PRESETS = Object.freeze(
  EMOTES.map(([id, label, emoji]) => Object.freeze({
    id,
    label,
    emoji,
    image: "/assets/wiki-race/emotes/kion-" + id + ".webp",
  }))
);
const PRESET_BY_ID = new Map(KION_EMOTE_PRESETS.map((preset) => [preset.id, preset]));

export function getKionEmote(id) {
  return PRESET_BY_ID.get(id) || null;
}

// Compatibility only: existing production send_group_spectator_emoji_v13 accepts
// these five IDs, not the new public catalogue IDs. Do not submit the new IDs
// to that RPC; PR-2 will add a separately authorized room emote endpoint.
export const LEGACY_SPECTATOR_KION_MAP = Object.freeze({
  cheer: "go",
  wow: "wow",
  hurry: "hurry",
  clap: "good",
  gg: "gg",
});
export function getLegacySpectatorKionAsset(id) {
  const mappedId = LEGACY_SPECTATOR_KION_MAP[id];
  return mappedId ? getKionEmote(mappedId)?.image || null : null;
}
