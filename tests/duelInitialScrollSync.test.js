import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const content=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");

test("duel start scroll alignment only occurs after countdown's fresh onComplete",()=>{
  const s=content("pages/MultiplayerGamePage.jsx");
  assert.match(s,/useLayoutEffect\(\(\) => \{\s*if \(phase !== PHASE\.PLAYING \|\| !alignFreshStartRef\.current\) return;/);
  assert.match(s,/alignFreshStartRef\.current = false;\s*window\.scrollTo\(\{ top: 0, behavior: "instant" \}\)/);
  assert.match(s,/onComplete=\{\(\) => \{\s*saveLocalGameState\(\{ enteredPlaying: true \}\);\s*alignFreshStartRef\.current = true/);
  assert.ok(!s.slice(s.indexOf("const recoverGame ="),s.indexOf("const handleReturnToLobby")).includes("alignFreshStartRef.current = true"),"no F5 recovery reset");
});

test("WikiViewer continues to reset subsequent document changes, but not first render",()=>{
 const viewer=content("components/WikiViewer.jsx");
 assert.match(viewer,/if \(previous && previous !== title\) \{\s*window\.scrollTo/);
 assert.match(content("scripts/verify-duel-start-scroll-ci.mjs"),/first playing article must be top-aligned/);
});
