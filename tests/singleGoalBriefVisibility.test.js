import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("single race opens its target clue by default without changing navigation", async () => {
  const single = await source("pages/GamePage.jsx");
  assert.match(single, /onLinkClick=\{handleMove\}\s+openTargetBriefByDefault\s+readOnly=/);
  assert.match(single, /onSummaryRetry: \(\) => setTargetBriefRetry/);
  assert.match(single, /fetchPageSummary\(title, \{ signal: controller\.signal \}\)/);
});

test("target clue stays collapsible and summary remains bounded", async () => {
  const viewer = await source("components/WikiViewer.jsx");
  const css = await source("css/app.css");
  assert.match(viewer, /<details className="wr-target-brief"/);
  assert.match(viewer, /open=\{targetBriefOpen\}/);
  assert.match(viewer, /onToggle=\{\(event\) => setTargetBriefOpen/);
  assert.match(viewer, /target-summary--collapsed/);
  assert.match(css, /-webkit-line-clamp:\s*3/);
});
