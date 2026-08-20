import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  filterVisibleGroupSpectatorEmojis,
  getGroupSpectatorPreset,
  normalizeGroupSpectatorEmojiRpcResponse,
  normalizeGroupSpectatorEmojiEvent,
  upsertLatestGroupSpectatorEmoji,
} from "../services/groupSpectatorService.js";
import {
  getGroupRemainingSeconds,
  GROUP_GAME_DURATION_SECONDS,
  GROUP_GRACE_DURATION_SECONDS,
} from "../utils/groupGameTimer.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migration = fs.readFileSync(
  path.join(root, "supabase/migrations/20260814103000_group_final_gaps_v13.sql"),
  "utf8"
);
const spectatorFunction = fs.readFileSync(
  path.join(root, "supabase/functions/wiki-snapshot/index.ts"),
  "utf8"
);
const hardeningMigration = fs.readFileSync(
  path.join(root, "supabase/migrations/20260814113000_group_final_gaps_v13_hardening.sql"),
  "utf8"
);
const atomicityMigration = fs.readFileSync(
  path.join(root, "supabase/migrations/20260814123000_group_spectator_emoji_atomicity_fix.sql"),
  "utf8"
);

test("Packet 13 group constants are 20 minutes and 2 minutes", () => {
  assert.equal(GROUP_GAME_DURATION_SECONDS, 1200);
  assert.equal(GROUP_GRACE_DURATION_SECONDS, 120);
});

test("the client timer uses the earlier hard deadline or grace deadline", () => {
  const start = Date.parse("2026-08-14T00:00:00.000Z");
  const room = {
    status: "grace_period",
    game_deadline_at: new Date(start + 1200_000).toISOString(),
    grace_ends_at: new Date(start + 120_000).toISOString(),
  };

  assert.equal(getGroupRemainingSeconds(room, start + 30_000), 90);
  assert.equal(getGroupRemainingSeconds(room, start + 1200_000), 0);
});

test("server migration fixes group limits, no-item mode, and deadlines", () => {
  assert.match(migration, /game_duration_seconds set default 1200/);
  assert.match(migration, /grace_duration_seconds set default 120/);
  assert.match(migration, /p_min_players <> 3/);
  assert.match(migration, /p_max_players > 8/);
  assert.match(migration, /use_items = false/);
  assert.match(migration, /least\(\s*v_room\.game_deadline_at/);
  assert.match(migration, /SPECTATOR_EMOJI_RATE_LIMIT/);
});

test("spectator Wikipedia content is pinned to the server page and revision", () => {
  assert.match(spectatorFunction, /oldid: expectedRevisionId/);
  assert.match(spectatorFunction, /WIKI_SNAPSHOT_IDENTITY_MISMATCH/);
  assert.match(spectatorFunction, /documentHtml: parsedPage\?\.text\?\.\["\*"\]/);
});

test("spectator reactions accept only presets and keep one latest event per sender", () => {
  assert.equal(getGroupSpectatorPreset("cheer")?.emoji, "👏");
  assert.equal(getGroupSpectatorPreset("free-text"), null);

  const older = {
    id: "older",
    user_id: "u1",
    event_type: "group_spectator_emoji",
    payload: { presetId: "cheer" },
    created_at: "2026-08-14T00:00:01.000Z",
  };
  const newer = {
    ...older,
    id: "newer",
    payload: { presetId: "wow" },
    created_at: "2026-08-14T00:00:02.000Z",
  };

  const first = upsertLatestGroupSpectatorEmoji([], older);
  const latest = upsertLatestGroupSpectatorEmoji(first, newer);
  assert.equal(latest.length, 1);
  assert.equal(latest[0].presetId, "wow");
  assert.equal(normalizeGroupSpectatorEmojiEvent({
    user_id: "u2",
    payload: { presetId: "not-allowed" },
  }), null);

  assert.equal(filterVisibleGroupSpectatorEmojis(latest, { muteAll: true }).length, 0);
  assert.equal(filterVisibleGroupSpectatorEmojis(latest, { mutedUserIds: ["u1"] }).length, 0);
});

test("spectator emoji RPC responses do not turn an expired rejection into an event", () => {
  const expired = {
    accepted: false,
    code: "SPECTATOR_ROOM_EXPIRED",
    room: { status: "finished", state_version: 4 },
    event_id: null,
  };
  assert.deepEqual(normalizeGroupSpectatorEmojiRpcResponse(expired), expired);

  const event = {
    id: "event-1",
    user_id: "u1",
    event_type: "group_spectator_emoji",
    payload: { presetId: "cheer" },
  };
  assert.deepEqual(
    normalizeGroupSpectatorEmojiRpcResponse({ accepted: true, code: "ACCEPTED", event_id: event.id, event }),
    event
  );
});

test("Packet 13 hardening clears empty-room hosts and finalizes expired emoji requests", () => {
  assert.match(hardeningMigration, /alter column host_user_id drop not null/);
  assert.match(hardeningMigration, /host_user_id = null/);
  assert.match(hardeningMigration, /raise exception 'NOT_A_GROUP'/);
  assert.match(hardeningMigration, /private\.finalize_group_room_v13\(p_room_id, v_now\)/);
  assert.match(hardeningMigration, /SPECTATOR_ROOM_EXPIRED/);
  assert.match(hardeningMigration, /to_regprocedure|preflight/i);
});

test("expired spectator emoji finalization commits and returns a structured rejection", () => {
  assert.match(atomicityMigration, /drop function if exists public\.send_group_spectator_emoji_v13/i);
  assert.match(atomicityMigration, /returns jsonb/i);
  assert.match(atomicityMigration, /'accepted', false/);
  assert.match(atomicityMigration, /'finalized', v_finalized/);
  assert.match(atomicityMigration, /'event_id', null::uuid/);
  assert.doesNotMatch(
    atomicityMigration,
    /v_room := private\.finalize_group_room_v13\([\s\S]{0,180}?raise exception 'SPECTATOR_ROOM_EXPIRED'/
  );
});
