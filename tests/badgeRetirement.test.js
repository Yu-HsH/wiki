import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

// 16d-2: the migration re-creates two 17b functions with the whole body. A hand-copied body can
// drift; pin that each differs from 17b only where the badge retirement needs it.

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (relativePath) => readFileSync(`${root}/${relativePath}`, "utf8");
const c1 = read("supabase/migrations/20261001090000_c1_reward_tables_v1.sql");
const d2 = read("supabase/migrations/20261003100000_badge_retirement_v1.sql");
const normalize = (text) => text.replace(/\r\n/g, "\n").replace(/[ \t]+$/gm, "");

function body(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `${start} present`);
  return normalize(source.slice(from, to));
}

test("16d-2: equip_profile_reward_v1 = 17b body with only the slot_index rule and two comments changed", () => {
  const start = "create or replace function public.equip_profile_reward_v1(";
  const end = "\n$$;";
  const old = body(c1, start, end);
  const next = body(d2, start, end);
  const oldRule = `  if not ((p_slot = 'badge' and v_index between 1 and 3)
          or (p_slot is distinct from 'badge' and v_index = 1)) then`;
  const newRule = `  -- 16d: every slot has one place (badges were the only multi-place slot).
  if v_index <> 1 then`;
  assert.ok(old.includes(oldRule) && next.includes(newRule));
  const swapped = old
    .replace(oldRule, newRule)
    .replace("  -- An unknown slot matches no kind and lands here too.",
             "  -- An unknown slot (including the retired 'badge') matches no kind and lands here too.")
    .replace(`  -- A reward sits in at most one place (unique (user_id, reward_id)). Equipping
  -- it elsewhere moves it — this is how badges are reordered.`,
             `  -- A reward sits in at most one place (unique (user_id, reward_id)). With one
  -- place per slot and kind = slot, the move below only clears a stale row.`);
  assert.equal(next, swapped);
});

test("16d-2: profile_cards_v1 = 17b body with badge left out of the slots and badges a constant []", () => {
  const start = "create or replace function private.profile_cards_v1(p_user_ids uuid[])";
  const end = "\n$$;";
  const old = body(c1, start, end);
  const next = body(d2, start, end);
  const swapped = old
    .replace("and e.slot in ('profile_icon', 'title', 'badge', 'frame', 'background')",
             "and e.slot in ('profile_icon', 'title', 'frame', 'background')")
    .replace(`               'badges', coalesce(
                 (select jsonb_agg(eq.ref order by eq.slot_index)
                    from eq where eq.user_id = p.id and eq.slot = 'badge'),
                 '[]'::jsonb),`,
             `               -- 16d: kept for fronts deployed before 16d-1 (C1 §0.-1); always empty.
               'badges', '[]'::jsonb,`);
  assert.equal(next, swapped);
});

test("16d-2: every SVG path the migration sets exists under public/, hidden ones opaque", () => {
  const paths = [...d2.matchAll(/'(\/profile-icons\/[^']+\.svg)'/g)].map(([, path]) => path);
  assert.equal(paths.length, 9, "7 converted + 2 earned icons");
  for (const path of paths) assert.ok(existsSync(`${root}/public${path}`), path);
  assert.equal(paths.filter((path) => path.startsWith("/profile-icons/x/")).length, 5);
});

test("16d-2: tokens are exactly the 16-HANDOFF §10.4 grammar and palette names", () => {
  const tokens = [...d2.matchAll(/'((?:frame|finish|path):[a-z0-9-]+)'/g)].map(([, token]) => token);
  assert.ok(tokens.length >= 14);
  for (const token of tokens) {
    assert.match(token, /^(frame:(tier-[123]|special)|finish:(tier-[123]|special)|path:(blue|purple|gold|teal|coral))$/, token);
  }
});

test("16d-2: fails closed — leftover badge rows or a definition still using badge stop the migration", () => {
  assert.match(d2, /raise exception 'BADGE_RETIREMENT_UNMAPPED_ROWS: %'/);
  assert.match(d2, /raise exception 'BADGE_RETIREMENT_DEFINITION_STILL_USES_BADGE'/);
  const order = ["update public.reward_catalog as c", "delete from public.user_profile_equipment where slot = 'badge'",
    "drop constraint reward_catalog_kind_check", "drop constraint user_profile_equipment_slot_check"];
  const positions = order.map((needle) => d2.indexOf(needle));
  assert.deepEqual([...positions].sort((a, b) => a - b), positions, "rows are fixed before the CHECKs tighten");
});
