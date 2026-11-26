import assert from "node:assert/strict";
import { chromium } from "playwright";
import { createServer } from "vite";

const script = "/__duel-v4-item-feedback.jsx";
const moduleId = "\0duel-v4-item-feedback.jsx";
const fixture = `
import React, { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import ItemFeedback from "/components/DuelV4ItemFeedback.jsx";

function Fixture() {
  const [events, setEvents] = useState([]);
  const [now, setNow] = useState(1000);
  window.refreshItemFeedback = (value, time) => {
    setEvents(value);
    setNow(time);
  };
  const scope = new URLSearchParams(location.search).get("scope");
  return React.createElement("div", { "aria-live": "polite" },
    React.createElement(ItemFeedback, { scope, events, now }));
}

createRoot(document.getElementById("root")).render(
  React.createElement(StrictMode, null, React.createElement(Fixture)));
`;

const server = await createServer({
  configFile: false,
  server: { host: "127.0.0.1", port: 0 },
  plugins: [{
    name: "duel-v4-item-feedback-fixture",
    configureServer(vite) {
      vite.middlewares.use((request, response, next) => {
        if (!request.url?.startsWith("/feedback-fixture?")) return next();
        response.setHeader("Content-Type", "text/html; charset=utf-8");
        response.end(`<!doctype html><div id="root"></div><script type="module" src="${script}"></script>`);
      });
    },
    resolveId(source) {
      if (source === script) return moduleId;
    },
    load(id) {
      if (id === moduleId) return fixture;
    },
  }],
});

const victim = { id: "theft-1", kind: "item_stolen", expiresAt: new Date(30_000).toISOString() };
const installer = { id: "trap-1", kind: "trap_triggered", expiresAt: new Date(30_000).toISOString() };
let browser;
try {
  await server.listen();
  browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const port = server.httpServer.address().port;
  const url = (scope) => `http://127.0.0.1:${port}/feedback-fixture?scope=${scope}`;
  const messages = page.locator(".duel-v4-item-feedback");
  const push = async (events, now = 1000) => {
    await page.waitForFunction(() => typeof window.refreshItemFeedback === "function");
    await page.evaluate(([next, time]) => window.refreshItemFeedback(next, time), [events, now]);
    await page.evaluate(() => new Promise(requestAnimationFrame));
  };

  await page.goto(url("room-a:player-a"));
  await push([victim]);
  await page.getByText("도둑의 손에 아이템을 빼앗겼어요.").waitFor();
  await push([victim], 1100);
  assert.equal(await messages.count(), 1, "poll and Strict Mode keep one message");

  await page.reload();
  await push([victim, installer], 2000);
  await page.getByText("설치한 깜짝상자가 작동했어요.").waitFor();
  assert.equal(await messages.count(), 1, "F5 recovers the unseen message and skips the shown one");
  await push([victim, installer], 7100);
  await messages.first().waitFor({ state: "detached" });

  await page.goto(url("room-b:player-a"));
  await push([victim, installer], 31_000);
  assert.equal(await messages.count(), 0, "expired server feedback remains silent");
  await push([victim], 1000);
  await page.getByText("도둑의 손에 아이템을 빼앗겼어요.").waitFor();
  assert.equal(await messages.count(), 1, "seen IDs are scoped to room and actor");
  assert.deepEqual(errors, []);
  console.log("E4/E5 feedback: poll deduplication, F5 recovery, display expiry, server expiry and room scope passed");
} finally {
  await browser?.close();
  await server.close();
}
