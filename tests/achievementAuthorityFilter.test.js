import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

// 16b-f: the authority filter re-creates private.achievement_value_v1 with the whole 16b body.
// A body copied by hand can drift silently; this pins that the only difference is the filter.

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (relativePath) => readFileSync(`${root}/${relativePath}`, "utf8");
const base = read("supabase/migrations/20261002100000_achievement_triggers_v1.sql");
const filter = read("supabase/migrations/20261003090000_achievement_authority_filter_v1.sql");

const START = "create or replace function private.achievement_value_v1(";
const END = "revoke all on function private.achievement_value_v1(public.achievement_definitions, uuid, text, uuid)";
function valueFunction(source) {
  const start = source.indexOf(START);
  const end = source.indexOf(END, start);
  assert.ok(start >= 0 && end > start, "achievement_value_v1 present");
  return source.slice(start, end);
}

// The added conditions, exactly as written in the migration.
const ADDED = [
  /\n\s+and exists \(select 1 from public\.game_move_events authority\n\s+where authority\.scope = 'duel' and authority\.game_id = counted\.room_id\)/g,
  /\n\s+and exists \(select 1 from public\.game_move_events authority\n\s+where authority\.scope = 'duel' and authority\.game_id = mine\.room_id\)/g,
  /\n\s+and exists \(select 1 from public\.game_move_events authority\n\s+where authority\.scope = 'group' and authority\.game_id = room\.id\)/g,
];
const normalize = (text) => text.replace(/\r\n/g, "\n").replace(/[ \t]+$/gm, "");

test("16b-f: the new body is the 16b body plus the authority conditions, nothing else", () => {
  let stripped = normalize(valueFunction(filter));
  for (const pattern of ADDED) stripped = stripped.replace(pattern, "");
  assert.equal(stripped, normalize(valueFunction(base)));
});

test("16b-f: four conditions — matches/wins, both defense branches, group finishes", () => {
  const body = normalize(valueFunction(filter));
  const counts = ADDED.map((pattern) => (body.match(pattern) || []).length);
  assert.deepEqual(counts, [1, 2, 1]);
  const branch = (name, next) => body.slice(body.indexOf(`when ${name}`), body.indexOf(`when ${next}`));
  assert.match(branch("'duel_normal_matches', 'duel_normal_wins'", "'duel_defense_successes'"), /authority\.game_id = counted\.room_id/);
  assert.equal((branch("'duel_defense_successes'", "'group_normal_finishes'").match(/authority\.game_id = mine\.room_id/g) || []).length, 2);
  assert.match(branch("'group_normal_finishes'", "'group_party_finish'"), /authority\.scope = 'group' and authority\.game_id = room\.id/);
});

test("16b-f: the migration replaces one function only and keeps its ACL", () => {
  const sql = normalize(filter).replace(/^\s*--.*$/gm, "");
  assert.equal((sql.match(/create or replace function/g) || []).length, 1);
  // Outside the function text (its 16b body writes user_achievement_marks — pinned equal above).
  const outside = sql.replace(normalize(valueFunction(filter)).replace(/^\s*--.*$/gm, ""), "");
  assert.doesNotMatch(outside,/\b(drop|alter table|create table|create trigger|insert into|update public|delete from)\b/i);
  assert.match(sql, /revoke all on function private\.achievement_value_v1\(public\.achievement_definitions, uuid, text, uuid\)\s+from public, anon, authenticated;/);
  assert.match(sql, /^begin;/m);
  assert.match(sql, /^commit;/m);
});

test("16b-f: the decay ordinal is untouched — it still counts every non-cancelled match (15c rule)", () => {
  assert.doesNotMatch(filter, /achievement_duel_ordinal_v1\(\s*p_match/);
});
