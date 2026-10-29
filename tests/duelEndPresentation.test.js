import test from "node:test";
import assert from "node:assert/strict";
import { buildDuelEndScene } from "../utils/duelEndPresentation.js";
import { buildDuelResultPresentation } from "../utils/duelResultPresentation.js";
const players = [{ user_id: "me" }, { user_id: "opponent" }];
const room = { status: "finished", finished_reason: "normal_finish", winner_user_id: "me" };

test("Duel END requires a finalized known server winner and a participating viewer", () => {
  for (const patch of [{ status: "playing" }, { status: "starting" }, { finished_reason: "unknown" }, { winner_user_id: null }, { winner_user_id: "foreign" }]) assert.equal(buildDuelEndScene({ ...room, ...patch }, players, "me"), null);
  assert.equal(buildDuelEndScene(room, players, "foreign"), null);
  assert.equal(buildDuelEndScene(room, [{ user_id: "me", has_finished: true }], "me"), null);
  assert.equal(buildDuelEndScene({ ...room, status: "playing" }, players.map(p => ({ ...p, has_finished: true })), "me"), null);
  assert.equal(buildDuelResultPresentation({ ...room, winner_user_id: "foreign" }, players, "me"), null);
});
test("normal finish selects distinct win/loss scenes with the same authoritative duration", () => {
  assert.equal(buildDuelEndScene(room, players, "me").kind, "win");
  const loss = buildDuelEndScene(room, players, "opponent");
  assert.equal(loss.kind, "loss"); assert.equal(loss.duration, 2700); assert.equal(loss.won, false);
});
test("voluntary surrender uses actual loser reason and server winner, for either viewer", () => {
  const forfeited = players.map(p => ({ ...p, retire_reason: p.user_id === "opponent" ? "forfeited" : null }));
  const forfeit = { ...room, finished_reason: "forfeit" };
  assert.equal(buildDuelEndScene(forfeit, forfeited, "me").title, "상대 기권");
  const own = buildDuelEndScene(forfeit, forfeited, "opponent");
  assert.equal(own.title, "기권"); assert.equal(own.duration, 2000); assert.equal(own.won, false);
});
test("disconnection timeout keeps neutral motion and actual server loss; no voluntary surrender wording", () => {
  const rows = players.map(p => ({ ...p, retire_reason: p.user_id === "opponent" ? "disconnected_timeout" : null }));
  const result = buildDuelEndScene({ ...room, finished_reason: "forfeit" }, rows, "opponent");
  assert.equal(result.kind, "forfeit"); assert.equal(result.title, "경기 종료"); assert.equal(result.won, false);
  assert.match(result.description, /복귀하지 못/); assert.doesNotMatch(result.description, /포기/);
});
test("cancelled, unspecified or unsupported retire reasons fall back to the canonical static result", () => {
  assert.equal(buildDuelEndScene({ ...room, finished_reason: "cancelled", winner_user_id: null }, players, "me"), null);
  for (const retire_reason of [null, "unknown", "time_limit", "grace_timeout"]) assert.equal(buildDuelEndScene({ ...room, finished_reason: "forfeit" }, players.map(p => ({ ...p, retire_reason })), "me"), null);
});
