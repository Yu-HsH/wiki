import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const source = file => readFileSync(new URL("../" + file, import.meta.url), "utf8");

test("only the five navigation pages join the shared hub layout", () => {
  const shell = source("components/wiki-race/WikiRaceShell.jsx");
  assert.ok(shell.includes('new Set(["home", "play", "ranking", "achievements", "updates"])'));
  assert.ok(shell.includes('SHARED_HUB_VIEWS.has(view) ? " wr-shared-hub" : ""'));
  assert.ok(!shell.includes('new Set(["home", "play", "ranking", "achievements", "updates", "profile"])'));
});

test("one 1120px notebook, same HOME decor and safe mobile breakpoint", () => {
  const styles = source("appStyles.js");
  const css = source("css/wikiRaceSharedHub.css");
  assert.ok(styles.includes('import "./css/wikiRaceSharedHub.css";'));
  assert.ok(styles.indexOf("jungle65Fonts.css") < styles.indexOf("wikiRaceSharedHub.css"));
  assert.ok(css.includes("width: min(1120px, 100%)"));
  assert.ok(css.includes("background: #e9e0c9"));
  assert.ok(css.includes("@media (min-width: 1280px)"));
  for (const asset of ["wiki-home-left-decoration.webp", "wiki-home-right-decoration.webp"]) {
    assert.ok(css.includes(asset));
    const bytes = readFileSync(new URL("../public/assets/wiki-race/home/" + asset, import.meta.url));
    assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
    assert.equal(bytes.toString("ascii", 8, 12), "WEBP");
  }
});
