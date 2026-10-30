import assert from "node:assert/strict";
import test from "node:test";
import { createWikiMoveTimer } from "../services/wikiService.js";
import { readFileSync } from "node:fs";

const code = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");

test("opt-in move timing measures each stage and total without exposing page titles or user data", () => {
  let t = 200;
  const events = [];
  const old = console.info;
  console.info = (...args) => events.push(args);
  try {
    const timer = createWikiMoveTimer("duel", {
      storage: { getItem: () => "1" },
      clock: { now: () => t },
    });
    t = 830;
    timer.stage("fetch");
    t = 1080;
    timer.stage("snapshot");
    t = 1280;
    timer.stage("moveRpc");
    t = 1360;
    timer.finish();
    assert.deepEqual(events, [[
      "[wiki-move-perf]",
      { mode: "duel", outcome: "complete", fetchMs: 630, snapshotMs: 250, moveRpcMs: 200, totalMs: 1160 },
    ]]);
  } finally {
    console.info = old;
  }
});

test("timing is silent by default and handles browser storage restrictions", () => {
  const events = [];
  const old = console.info;
  console.info = (...args) => events.push(args);
  try {
    const timer = createWikiMoveTimer("group", { storage: { getItem: () => null }, clock: { now: () => 100 } });
    timer.stage("fetch");
    timer.finish();
    assert.equal(events.length, 0);
    const blocked = createWikiMoveTimer("single", {
      storage: { getItem() { throw new Error("denied"); } },
      clock: { now: () => 100 },
    });
    blocked.stage("snapshot");
    blocked.finish();
    assert.equal(events.length, 0);
  } finally {
    console.info = old;
  }
});

test("all three official move handlers report opt-in stage timing", () => {
  for (const path of ["pages/GamePage.jsx", "pages/MultiplayerGamePage.jsx", "pages/GroupGamePage.jsx"]) {
    const source = code(path);
    assert.match(source, /createWikiMoveTimer\(/);
    assert.match(source, /wikiTimer\.stage\("fetch"\)/);
    assert.match(source, /wikiTimer\.stage\("snapshot"\)/);
    assert.match(source, /wikiTimer\.stage\("moveRpc"\)/);
    assert.match(source, /wikiTimer\.finish\(/);
  }
  assert.match(code("services/wikiService.js"), /console\.info\("\[wiki-page-perf\]"/);
});
