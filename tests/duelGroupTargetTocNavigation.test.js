import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fetchPageData } from "../services/wikiService.js";

const source = async (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("duel asynchronously loads the authoritative host goal summary with retry and abort", async () => {
  const page = await source("pages/MultiplayerGamePage.jsx");
  assert.match(page, /const myTargetTitle = commonTargetTitle/);
  assert.match(page, /fetchPageSummary\(myTargetTitle, \{ signal: controller\.signal \}\)/);
  assert.match(page, /getTargetSummaryText\(summary\)/);
  assert.match(page, /isAbortError\(error\)/);
  assert.match(page, /controller\.abort\(\)/);
  assert.match(page, /onSummaryRetry: \(\) => setDuelTargetRetryKey/);
  assert.match(page, /openTargetBriefByDefault/);
  assert.doesNotMatch(page, /showTargetBrief=\{false\}/);
});

test("group keeps its existing cancellable goal summary and makes it visible", async () => {
  const page = await source("pages/GroupGamePage.jsx");
  assert.match(page, /fetchPageSummary\(title, \{ signal: request\.signal \}\)/);
  assert.match(page, /manager\.isCurrent\(request\.id\)/);
  assert.match(page, /openTargetBriefByDefault/);
  assert.match(page, /target=\{targetForViewer\}/);
});

test("viewer scroll resets only when committed current article title changes", async () => {
  const viewer = await source("components/WikiViewer.jsx");
  assert.match(viewer, /useLayoutEffect\(\(\) =>/);
  assert.match(viewer, /previous && previous !== title/);
  assert.match(viewer, /window\.scrollTo\(\{ top: 0, behavior: "instant" \}\)/);
  assert.match(viewer, /\}, \[currentTitle\]\)/);
  assert.match(viewer, /const previousPageTitleRef = useRef\(null\)/);
});

test("article rail shows headings on proximity, touch toggle and keyboard focus", async () => {
  const viewer = await source("components/WikiViewer.jsx");
  const style = await source("css/app.css");
  assert.match(viewer, /aria-label="현재 문서 목차"/);
  assert.match(viewer, /className="wiki-nav-item-label"/);
  assert.match(viewer, /setRailExpanded\(\(expanded\) => !expanded\)/);
  assert.match(viewer, /aria-current=\{activeId === h\.id/);
  assert.match(style, /\.wiki-nav-rail::before/);
  assert.match(style, /:focus-within/);
  assert.match(style, /\.wiki-nav-level-3/);
  assert.match(style, /prefers-reduced-motion: reduce/);
});

test("recent wiki page reuses a bounded completed result without fetching again", async (t) => {
  const old = globalThis.fetch;
  let fetches = 0;
  const title = "최근위키캐시테스트-30001";
  globalThis.fetch = async (rawUrl) => {
    fetches += 1;
    const url = new URL(rawUrl);
    if (url.pathname.includes("/page/summary/")) {
      return Response.json({ title, extract: "요약" });
    }
    if (url.searchParams.get("action") === "query") {
      return Response.json({ query: { pages: { 1: { title, links: [{ns:0,title:"서울특별시"}] } } } });
    }
    return Response.json({ parse: { title, pageid:123, revid:456, text:{"*":'<p><a href="/wiki/서울특별시">서울특별시</a></p>'} } });
  };
  t.after(() => { globalThis.fetch = old; });
  const first = await fetchPageData(title);
  const second = await fetchPageData(title);
  assert.deepEqual(second, first);
  assert.equal(fetches, 3, "REST summary + query links + parse body must be requested only once");
  assert.equal(first.title, title);
});

test("concurrent non-abortable requests coalesce and aborted requests do not reach cache", async (t) => {
  const old = globalThis.fetch;
  let fetches = 0;
  const title = "위키중복요청검증-30002";
  globalThis.fetch = async (rawUrl) => {
    fetches += 1;
    const url = new URL(rawUrl);
    await new Promise(resolve => setTimeout(resolve, 2));
    if (url.pathname.includes("/page/summary/")) return Response.json({ title, extract: "요약" });
    if (url.searchParams.get("action") === "query") {
      return Response.json({ query: { pages: {1:{title,links:[{ns:0,title:"서울특별시"}]}} } });
    }
    return Response.json({ parse: {title,pageid:123,revid:456,text:{"*":'<p><a href="/wiki/서울특별시">서울특별시</a></p>'}} });
  };
  t.after(() => { globalThis.fetch = old; });
  const [a,b] = await Promise.all([fetchPageData(title),fetchPageData(title)]);
  assert.deepEqual(a,b);
  assert.equal(fetches,3);
  const abort = new AbortController();
  abort.abort();
  await assert.rejects(fetchPageData("위키취소검증-30003",{signal:abort.signal}),{name:"AbortError"});
  assert.equal(fetches,3);
});
