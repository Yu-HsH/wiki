import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const src = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("all five jungle artworks are valid WebP files in Vite public root", () => {
  for (const name of ["landing-final", "hero-jungle-expedition", "solo-expedition", "duel-expedition", "group-expedition"]) {
    const path = `public/assets/wiki-race/jungle65/${name}.webp`;
    const installed = readFileSync(new URL("../" + path, import.meta.url));
    assert.equal(installed.toString("ascii", 0, 4), "RIFF", path);
    assert.equal(installed.toString("ascii", 8, 12), "WEBP", path);
    assert.equal(installed.readUInt32LE(4), installed.length - 8, path);
  }
});

test("nav-free landing preserves actual authentication and public routes", () => {
  const page = src("pages/IntroPage.jsx");
  assert.match(page, /JUNGLE_LANDING/);
  assert.match(page, /jungle65\/landing-final\.webp/);
  assert.match(page, /<LoginPage key=\{loginMode\} isEmbedded initialMode=\{loginMode\}/);
  assert.match(page, /openAuth\("signin"\)/);
  assert.match(page, /openAuth\("signup"\)/);
  assert.match(page, /to="\/privacy"/);
  assert.match(page, /<Navigate to=\{LOBBY_PATH\} replace/);
  assert.doesNotMatch(page, /WikiRaceHeader/);
});

test("login and signup hit areas use real form modes", () => {
  const auth = src("pages/LoginPage.jsx");
  assert.match(auth, /initialMode = "signin"/);
  assert.match(auth, /initialMode === "signup" \? "signup" : "signin"/);
  assert.match(auth, /signUpWithUsername/);
});

test("mode artwork retains fallback navigation", () => {
  const play = src("pages/PlayPage.jsx");
  assert.match(play, /jungle65\/\$\{mode\.id/);
  assert.match(play, /onSingle\(\)/);
  assert.match(play, /onMultiplayer\(mode\.id\)/);
});

test("mobile has visible login controls, keyboard-focus navigation, and reduced-motion support", () => {
  const css = src("css/jungle65.css");
  assert.match(css, /wr65-landing-actions/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /max-width: 720px/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});
