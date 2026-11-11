import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getKionEmote, getLegacySpectatorKionAsset, KION_EMOTE_PRESETS, LEGACY_SPECTATOR_KION_MAP } from "../utils/kionEmoteCatalog.js";

test("approved Kion pack has 10 unique accessible labels and stable WebP URLs", () => {
  assert.equal(KION_EMOTE_PRESETS.length, 10);
  assert.equal(new Set(KION_EMOTE_PRESETS.map((preset) => preset.id)).size, 10);
  assert.ok(KION_EMOTE_PRESETS.every((preset) => preset.label && preset.image.startsWith("/assets/wiki-race/emotes/kion-") && preset.image.endsWith(".webp")));
  for (const id of ["hello", "ready", "go", "good", "wait", "hurry", "wow", "lol", "sad", "gg"]) {
    assert.equal(getKionEmote(id)?.id, id);
  }
  assert.equal(getKionEmote("unknown"), null);
});

test("existing spectator RPC's five IDs keep compatible sticker mapping", () => {
  assert.deepEqual(Object.keys(LEGACY_SPECTATOR_KION_MAP), ["cheer", "wow", "hurry", "clap", "gg"]);
  assert.match(getLegacySpectatorKionAsset("cheer"), /kion-go\.webp$/);
  assert.match(getLegacySpectatorKionAsset("clap"), /kion-good\.webp$/);
  assert.equal(getLegacySpectatorKionAsset("ready"), null);
  const spectatorService = readFileSync(new URL("../services/groupSpectatorService.js", import.meta.url), "utf8");
  assert.match(spectatorService, /getLegacySpectatorKionAsset/);
});

test("spectator dock remains server-authorized and uses Kion images with fallback", () => {
  const parts = readFileSync(new URL("../components/wiki-race/race/GroupRaceParts.jsx", import.meta.url), "utf8");
  const sticker = readFileSync(new URL("../components/KionEmotes.jsx", import.meta.url), "utf8");
  assert.match(parts, /KionEmoteSticker/);
  assert.match(parts, /KionEmoteBubble/);
  assert.match(parts, /KionEmotePicker/);
  assert.match(sticker, /onError=/);
  assert.match(sticker, /aria-label/);
  assert.match(sticker, /Escape/);
  const sql = readFileSync(new URL("../supabase/migrations/20260814123000_group_spectator_emoji_atomicity_fix.sql", import.meta.url), "utf8");
  assert.match(sql, /'cheer', 'wow', 'hurry', 'clap', 'gg'/);
});
