import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const src = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

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

test("home and mode artwork retain fallback navigation", () => {
  const hero = src("components/wiki-race/ExpeditionHero.jsx");
  const play = src("pages/PlayPage.jsx");
  assert.match(hero, /setHasJungleArt\(false\)/);
  assert.match(hero, /aria-label="탐험 시작 · 모드 선택으로 이동"/);
  assert.match(hero, /onClick=\{onPlay\}/);
  assert.match(play, /jungle65\/\$\{mode\.id/);
  assert.match(play, /onSingle\(\)/);
  assert.match(play, /onMultiplayer\(mode\.id\)/);
});

test("mobile has visible login controls, keyboard-focus navigation, and reduced-motion support", () => {
  const css = src("css/jungle65.css");
  assert.match(css, /wr65-landing-mobile-controls/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /max-width: 720px/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});
