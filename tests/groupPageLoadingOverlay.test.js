import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("all multiplayer modes use the same full-page loading overlay", () => {
  const group = source("pages/GroupGamePage.jsx");
  const duel = source("pages/MultiplayerGamePage.jsx");
  const overlay = source("components/PageLoadingOverlay.jsx");

  assert.match(group, /import PageLoadingOverlay from "\.\.\/components\/PageLoadingOverlay";/);
  assert.match(group, /\{isGroupPlaying && isLoading && <PageLoadingOverlay \/>\}/);
  assert.match(group, /setIsLoading\(true\)/);
  assert.match(group, /setIsLoading\(false\)/);
  assert.match(duel, /\{isPageLoading && <PageLoadingOverlay \/>\}/);
  assert.match(overlay, /위키 문서를 불러오는 중/);
});

test("group article loading is bound only to active navigation, not spectator or result screens", () => {
  const group = source("pages/GroupGamePage.jsx");
  const css = source("css/app.css");
  const afterMove = group.slice(group.indexOf("const handleMove = async (nextTitle)"));
  assert.match(afterMove, /moveInFlightRef\.current = true;/);
  assert.match(afterMove, /setIsLoading\(true\)/);
  assert.match(afterMove, /finally \{[\s\S]*?setIsLoading\(false\)/);
  assert.match(group, /const isGroupPlaying = phase === GROUP_GAME_PHASE\.PLAYING;/);
  assert.match(css, /\.page-loading-overlay\s*\{/);
  assert.match(css, /z-index: 9999/);
});
