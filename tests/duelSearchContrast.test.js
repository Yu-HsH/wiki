import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = p => readFileSync(new URL("../" + p, import.meta.url),"utf8");

test("search item child controls use readable parchment ink rather than legacy dark panel white", () => {
  const css = read("css/wikiRaceRace.css");
  assert.match(css,/\.wr-race \.game-search-panel__body input \{/);
  assert.match(css,/caret-color: #293d31/);
  assert.match(css,/-webkit-text-fill-color: #293d31/);
  assert.match(css,/\.wr-race \.game-search-panel__body input::placeholder/);
  assert.match(css,/\.wr-race \.game-search-panel__message/);
  assert.match(css,/\.wr-race \.game-search-panel__head button/);
  assert.match(css,/\.wr-race \.game-search-panel__body input:focus-visible/);
});

test("the item search authority contract is unchanged", () => {
  const viewer = read("components/WikiViewer.jsx");
  assert.match(viewer,/onAuthorizedSearch\(query\)/);
  assert.match(viewer,/searchBusyRef\.current/);
  assert.match(viewer,/if \(count === 0\)/);
  assert.match(viewer,/e\.nativeEvent\.isComposing/);
  assert.match(viewer,/onConsumeSearch\?\.\(\)/);
});
