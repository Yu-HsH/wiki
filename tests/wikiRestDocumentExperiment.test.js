import assert from "node:assert/strict";
import test from "node:test";
import {
  fetchPageData,
  fetchRestDocumentData,
  normalizeRestWikiLinksHtml,
  isRestDocumentExperimentEnabled,
} from "../services/wikiService.js";

function fakeFetch(t, { title, pageId = 321, restTitle = title, restPageId = pageId, restRevision = 765, restHtml = null } = {}) {
  const originalFetch = globalThis.fetch;
  const originalStorage = globalThis.localStorage;
  const calls = [];
  globalThis.localStorage = {
    getItem: (key) => key === "wiki-race-document-api" ? "rest" : null,
  };
  globalThis.fetch = async (url) => {
    const u = new URL(url);
    calls.push(u);
    if (u.pathname.includes("/rest.php/v1/page/")) {
      return Response.json({
        id: restPageId, title: restTitle, latest: { id: restRevision },
        html: restHtml ?? '<section><p><a href="./일본">일본</a> <a href="./파일:그림">차단</a> <a href="./미허용">미허용</a> <a href="https://other.com/wiki/일본">외부</a></p></section>',
      });
    }
    if (u.pathname.includes("/api/rest_v1/page/summary/")) {
      return Response.json({ title, extract: "게임 문서 요약" });
    }
    if (u.searchParams.get("action") === "query") {
      return Response.json({ query: { pages: { 1: {
        pageid: pageId, title, links: [{ ns: 0, title: "일본" }, { ns: 0, title: "미지의 문서" }]
      } } } });
    }
    if (u.searchParams.get("action") === "parse") {
      return Response.json({ parse: { title, pageid: pageId, revid: 987,
        text: { "*": '<div class="mw-parser-output"><p><a href="/wiki/일본">일본</a></p></div>' }
      } });
    }
    throw new Error("Unexpected URL " + u.href);
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalStorage;
  });
  return calls;
}

test("REST Parsoid href normalization never rewrites external links or path traversal", () => {
  const raw = '<a href="./일본#역사">일본</a><a href="./파일:사진">파일</a><a href="./../관리">위험</a><a href="https://evil.example/x">외부</a><a href="/wiki/서울">기존</a>';
  const result = normalizeRestWikiLinksHtml(raw);
  assert.match(result, /href="\/wiki\/일본#역사"/);
  assert.match(result, /href="\/wiki\/파일:사진"/);
  assert.match(result, /href="\.\/\.\.\/관리"/);
  assert.match(result, /href="https:\/\/evil\.example\/x"/);
  assert.match(result, /href="\/wiki\/서울"/);
});

test("REST with_html replaces Action parse and preserves page id, revision, allowlist", async (t) => {
  const title = "위키REST문서테스트1007";
  const urls = fakeFetch(t, { title });
  assert.equal(isRestDocumentExperimentEnabled(), true);
  const page = await fetchPageData(title);
  assert.equal(page.pageId, "321");
  assert.equal(page.revisionId, "765");
  assert.equal(page.canonicalTitle, title);
  assert.deepEqual(page.links, ["일본"]);
  assert.equal(page.quickLinks.every((x) => page.links.includes(x)), true);
  assert.equal(urls.filter((u) => u.pathname.includes("/with_html")).length, 1);
  assert.equal(urls.filter((u) => u.searchParams.get("action") === "parse").length, 0);
});

test("REST response requires page id, revision, title and nonempty HTML", async () => {
  const title = "위키REST형식검사1008";
  await assert.rejects(fetchRestDocumentData(title, {
    fetchImpl: async () => Response.json({ title, html: "<p>문서</p>", id: 5 }),
  }), /필수 ID/);
});

test("REST missing revision falls back to Action parse, never trusting incomplete identity", async (t) => {
  const title = "위키REST폴백테스트1009";
  const urls = fakeFetch(t, { title, restRevision: null });
  const page = await fetchPageData(title);
  assert.equal(page.revisionId, "987");
  assert.equal(page.pageId, "321");
  assert.deepEqual(page.links, ["일본"]);
  assert.equal(urls.filter((u) => u.searchParams.get("action") === "parse").length, 1);
});

test("REST page id mismatch forces Action parse fallback", async (t) => {
  const title = "위키REST아이디검사1010";
  const urls = fakeFetch(t, { title, restPageId: 1001 });
  const page = await fetchPageData(title);
  assert.equal(page.pageId, "321");
  assert.equal(page.revisionId, "987");
  assert.equal(urls.filter((u) => u.searchParams.get("action") === "parse").length, 1);
});

test("REST incompatible markup with zero legal links safely falls back to Action parse", async (t) => {
  const title = "위키REST링크복원1011";
  const urls = fakeFetch(t, { title, restHtml: '<p><a href="../wrong">잘못된 내부 링크 형식</a></p>' });
  const page = await fetchPageData(title);
  assert.equal(page.revisionId, "987");
  assert.deepEqual(page.links, ["일본"]);
  assert.equal(urls.filter((u) => u.searchParams.get("action") === "parse").length, 1);
});

test("REST fetch respects aborted signals", async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(fetchRestDocumentData("테스트", {
    signal: controller.signal,
    fetchImpl: async (_, opts) => {
      if (opts.signal.aborted) throw Object.assign(new Error("aborted"), { name: "AbortError" });
    },
  }), { name: "AbortError" });
});
