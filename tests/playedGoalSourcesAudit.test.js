import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const research = JSON.parse(readFileSync(new URL("../data/research/play-goal-backlinks-20261107.json", import.meta.url), "utf8"));
const lookup = new Map(research.target_articles.map(article => [article.title, article]));

test("official public Wikipedia evidence contains 15 verified goal articles only", () => {
  assert.equal(research.target_articles.length, 15);
  assert.equal(new Set(research.target_articles.map(x => x.title)).size, 15);
  assert.ok(research.target_articles.every(x => x.ok && x.pageId !== null));
  assert.equal(research.privacy.includes("No player IDs"), true);
});

test("two actual random abandoned targets are publicly confirmed disambiguation pages", () => {
  assert.equal(lookup.get("덕곡면").disambiguation, true);
  assert.equal(lookup.get("포니아토프스키").disambiguation, true);
  assert.equal(lookup.get("덕곡면 (합천군)").disambiguation, false);
});

test("racing-model target's only public incoming pages are birth date and year", () => {
  const target = lookup.get("황리아");
  assert.equal(target.ns0Backlinks, 2);
  assert.deepEqual(target.incomingPublicPages.sort(), ["1987년", "2월 11일"].sort());
  assert.equal(target.incomingPublicPages.includes("레이싱 모델"), false);
});

test("21 institutional incoming links don't equal 21 independent topical gateways", () => {
  const target = lookup.get("주런던 홍콩 경제무역대표부");
  assert.equal(target.ns0Backlinks, 21);
  assert.equal(target.incomingPublicPages.length, 21);
  assert.equal(target.incomingPublicPages.includes("런던"), false);
  assert.equal(target.incomingPublicPages.includes("홍콩"), false);
  assert.ok(target.incomingPublicPages.some(x => x.includes("홍콩 경제무역대표부")));
});

test("a low direct backlink count can still have a useful city gateway for a completed run", () => {
  const target = lookup.get("랑시퐁루즈역");
  assert.equal(target.ns0Backlinks, 4);
  assert.ok(target.incomingPublicPages.includes("제네바"));
});

test("truncated API backlinks are reported as lower bounds, not exact totals", () => {
  for (const title of ["SQL", "훈민정음", "GPT (언어 모델)"]) {
    const row = lookup.get(title);
    assert.equal(row.ns0Backlinks, 50);
    assert.equal(row.backlinksCapped, true);
  }
});

test("research output contains no personal or raw session path fields", () => {
  const invalid = new Set(["user_id","userId","guestToken","guest_id","nickname","player_name","room_id","run_id","path_titles","path_title_snapshots","started_at"]);
  for (const row of research.target_articles) {
    for (const key of Object.keys(row)) assert.equal(invalid.has(key), false, key);
  }
});
