import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

// SF-M1: the migration re-creates apply_duel_move_v2 and use_duel_item_v3 with their whole bodies.
// A body copied by hand can drift silently; this pins that the only difference is the opponent mask.

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (relativePath) => readFileSync(`${root}/${relativePath}`, "utf8");
const normalize = (text) => text.replace(/\r\n/g, "\n").replace(/[ \t]+$/gm, "");

const m1 = normalize(read("supabase/migrations/20261004090000_sec_finish_db_v1.sql"));
const sources = {
  apply_duel_move_v2: normalize(read("supabase/migrations/20260814092000_duel_authority_v2.sql")),
  use_duel_item_v3: normalize(read("supabase/migrations/20260904090000_duel_item_authority_v3.sql")),
};

function functionText(source, name) {
  const start = source.indexOf(`create or replace function public.${name}(`);
  assert.ok(start >= 0, `${name} present`);
  const end = source.indexOf("$$;", source.indexOf("as $$", start) + 5) + 3;
  return source.slice(start, end);
}

const OLD = "'opponent', to_jsonb(v_opponent)";
const NEW = "'opponent', to_jsonb(v_opponent) - array['path_titles', 'path_page_ids', 'path_revision_ids']";

for (const name of Object.keys(sources)) {
  test(`SF-M1: ${name} is its source body with only the opponent path mask added`, () => {
    const copied = functionText(m1, name);
    assert.equal(copied.split(NEW).length - 1, 1);
    assert.equal(copied.replace(NEW, OLD), functionText(sources[name], name));
  });
}

test("SF-M1: two functions replaced, no table DDL, no ACL change on them", () => {
  const sql = m1.replace(/^\s*--.*$/gm, "");
  assert.equal((sql.match(/create or replace function/g) || []).length, 2);
  assert.doesNotMatch(sql, /\b(alter table|create table|drop table|drop function|create trigger)\b/i);
  assert.doesNotMatch(sql, /\b(grant|revoke)\b[^;]*\bon function\b/i);
  assert.match(sql, /^begin;/m);
  assert.match(sql, /^commit;/m);
});

test("SF-M1: the five sections are present", () => {
  assert.match(m1, /create policy "Players can read their own move events"\s+on public\.game_move_events\s+for select\s+to authenticated\s+using \(\s+actor_user_id = \(select auth\.uid\(\)\)/);
  assert.match(m1, /drop policy if exists "Duel players can insert their own room events" on public\.room_events;/);
  assert.match(m1, /revoke insert, update, delete on table public\.room_events from anon, authenticated;/);
  assert.match(m1, /revoke truncate, references, trigger on all tables in schema public from anon, authenticated;/);
  assert.match(m1, /alter default privileges for role postgres in schema public\s+revoke all on tables from anon, authenticated;/);
  assert.match(m1, /alter default privileges for role postgres in schema public\s+revoke all on sequences from anon, authenticated;/);
});
