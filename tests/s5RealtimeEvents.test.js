import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mergeS5KionEvents, normalizeS5KionEvent } from "../components/group-items-jungle/s5KionEvents.js";

const room = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const recipient = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const sender = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const event = (id, date, emote = "hello") => ({
  id, room_id:room, recipient_id:recipient, sender_participant_id:sender,
  emote_id:emote, sent_at:date,
});

test("S5 Kion accepts only addressed, valid server-timed events", () => {
  const accepted = normalizeS5KionEvent(event("1", "2026-11-20T10:00:00Z"), room, recipient);
  assert.equal(accepted.userId, sender);
  assert.equal(accepted.emoteId, "hello");
  assert.equal(normalizeS5KionEvent(event("1", "2026-11-20T10:00:00Z"), room, "outsider"), null);
  assert.equal(normalizeS5KionEvent(event("1", "no-time"), room, recipient), null);
  assert.equal(normalizeS5KionEvent(event("1", "2026-11-20T10:00:00Z", "unknown"), room, recipient), null);
});

test("S5 Kion keeps the latest sender event across duplicate and delayed frames", () => {
  const first = event("1", "2026-11-20T10:00:00Z", "hello");
  const latest = event("2", "2026-11-20T10:00:03Z", "gg");
  const result = mergeS5KionEvents(mergeS5KionEvents([], latest, room, recipient), [first, latest], room, recipient);
  assert.equal(result.length, 1);
  assert.equal(result[0].emoteId, "gg");
});

test("S5 emits recipient-scoped Postgres Changes without realtime.messages writes", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20261120024414_group_items_s5.sql", import.meta.url), "utf8");
  const route = readFileSync(new URL("../components/group-items-jungle/ProductGroupItemsRoute.jsx", import.meta.url), "utf8");
  const dock = readFileSync(new URL("../components/group-items-jungle/S5KionDock.jsx", import.meta.url), "utf8");
  assert.match(sql, /ALTER PUBLICATION supabase_realtime ADD TABLE[\s\S]*?ink_product_events\.signals_v1, ink_product_events\.emotes_v1/);
  assert.match(sql, /CREATE POLICY s5_signal_recipient/);
  assert.match(sql, /CREATE POLICY s5_emote_recipient/);
  assert.match(sql, /GRANT SELECT ON TABLE ink_product_events\.signals_v1, ink_product_events\.emotes_v1 TO authenticated/);
  assert.doesNotMatch(sql, /PERFORM realtime\.send\s*\(/);
  assert.doesNotMatch(sql, /GRANT INSERT\s*\([^)]*\)\s*ON realtime\.messages/i);
  assert.match(route, /postgres_changes[\s\S]*?signals_v1/);
  assert.match(dock, /race:\s*\{schema:"ink_product_events",\s*table:"emotes_v1"/);
  assert.match(dock, /postgres_changes[\s\S]*?schema:transport\.schema,\s*table:transport\.table,\s*filter:"recipient_id=eq\."\+actorId/);
  assert.match(route, /kionDock=\{<S5KionDock/);
  assert.match(route, /<S5KionDock roomId=\{roomId\} actorId=\{actorId\} players=\{room\.players\} spectator\/>/);
});
