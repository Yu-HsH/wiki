import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  fetchAllLinkPages,
  fetchPageData,
  fetchPageSummary,
} from "../services/wikiService.js";
import { createLatestRequestManager, isAbortError } from "../utils/latestRequest.js";

test("plcontinue의 모든 페이지를 병합하고 페이지 사이 중복을 제거한다", async () => {
  const urls = [];
  const responses = [
    {
      query: {
        normalized: [{ from: "남한_", to: "남한" }],
        redirects: [{ from: "남한", to: "대한민국" }],
        pages: { 1: { title: "대한민국", links: [{ ns: 0, title: "서울특별시" }, { ns: 0, title: "일본" }] } },
      },
      continue: { plcontinue: "1|0|일본", continue: "||" },
    },
    {
      query: {
        pages: { 1: { title: "대한민국", links: [{ ns: 0, title: "일본" }, { ns: 0, title: "중국" }] } },
      },
    },
  ];

  const result = await fetchAllLinkPages("남한_", {
    fetchJsonImpl: async (url) => {
      urls.push(new URL(url));
      return responses.shift();
    },
  });

  assert.equal(result.canonicalTitle, "대한민국");
  assert.deepEqual(result.pageCounts, [2, 2]);
  assert.deepEqual(result.links.map((link) => link.title), ["서울특별시", "일본", "중국"]);
  assert.deepEqual(result.redirects, [{ from: "남한", to: "대한민국" }]);
  assert.equal(urls[0].searchParams.get("redirects"), "1");
  assert.equal(urls[0].searchParams.get("plnamespace"), "0");
  assert.equal(urls[0].searchParams.get("pllimit"), "max");
  assert.equal(urls[1].searchParams.get("plcontinue"), "1|0|일본");
});

test("중간 페이지 요청 실패 시 일부 링크를 반환하지 않고 전체 실패한다", async () => {
  let callCount = 0;
  await assert.rejects(
    fetchAllLinkPages("대한민국", {
      fetchJsonImpl: async () => {
        callCount += 1;
        if (callCount === 2) throw new Error("두 번째 페이지 실패");
        return {
          query: { pages: { 1: { title: "대한민국", links: [{ ns: 0, title: "서울특별시" }] } } },
          continue: { plcontinue: "1|0|서울특별시", continue: "||" },
        };
      },
    }),
    /두 번째 페이지 실패/
  );
});

test("반복 continuation과 페이지 안전 한도를 감지한다", async () => {
  const repeatedResponse = {
    query: { pages: { 1: { title: "대한민국", links: [] } } },
    continue: { plcontinue: "same", continue: "||" },
  };
  await assert.rejects(
    fetchAllLinkPages("대한민국", { fetchJsonImpl: async () => repeatedResponse }),
    /토큰이 반복/
  );
  await assert.rejects(
    fetchAllLinkPages("대한민국", {
      maxPages: 1,
      fetchJsonImpl: async () => ({
        query: { pages: { 1: { title: "대한민국", links: [] } } },
        continue: { plcontinue: "next", continue: "||" },
      }),
    }),
    /안전 한도/
  );
});

test("요약 전용 요청은 URL을 인코딩하고 필요한 일반 텍스트 필드만 반환한다", async () => {
  const controller = new AbortController();
  let requestedUrl = "";
  let receivedSignal = null;

  const summary = await fetchPageSummary("사과 (동음이의)", {
    signal: controller.signal,
    fetchImpl: async (url, options) => {
      requestedUrl = url;
      receivedSignal = options.signal;
      return Response.json({
        title: "사과 (동음이의)",
        revision: 123,
        description: "동음이의어 문서",
        extract: "  사과는 여러 뜻으로 쓰인다. \n",
        extract_html: "<script>사용하지 않음</script>",
        thumbnail: {
          source: "https://upload.wikimedia.org/example.png",
        },
      });
    },
  });

  assert.match(requestedUrl, /%20/);
  assert.equal(receivedSignal, controller.signal);
  assert.deepEqual(summary, {
    requestedTitle: "사과 (동음이의)",
    canonicalTitle: "사과 (동음이의)",
    revisionId: 123,
    description: "동음이의어 문서",
    extract: "사과는 여러 뜻으로 쓰인다.",
    thumbnailUrl: "https://upload.wikimedia.org/example.png",
  });
  assert.equal(Object.hasOwn(summary, "extract_html"), false);
});

test("요약 전용 요청은 리다이렉트의 canonical title을 보존한다", async () => {
  const summary = await fetchPageSummary("남한", {
    fetchImpl: async () => Response.json({
      title: "대한민국",
      extract: "대한민국에 대한 실제 요약",
    }),
  });

  assert.equal(summary.requestedTitle, "남한");
  assert.equal(summary.canonicalTitle, "대한민국");
  assert.equal(summary.extract, "대한민국에 대한 실제 요약");
});

test("요약 응답 필드가 빠져도 빈 일반 텍스트 값으로 안전하게 반환한다", async () => {
  const summary = await fetchPageSummary("설명이 없는 문서", {
    fetchImpl: async () => Response.json({ title: "설명이 없는 문서" }),
  });

  assert.equal(summary.description, "");
  assert.equal(summary.extract, "");
  assert.equal(summary.thumbnailUrl, null);
  assert.equal(summary.revisionId, null);
});

test("존재하지 않는 요약 문서는 식별 가능한 오류로 처리한다", async () => {
  await assert.rejects(
    fetchPageSummary("존재하지 않는 문서", {
      fetchImpl: async () => new Response("not found", { status: 404 }),
    }),
    (error) => error.code === "WIKI_PAGE_NOT_FOUND"
  );
});

function installWikiFetchMock(t, canonicalByRequested) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(input);
    const requested = decodeURIComponent(
      url.pathname.includes("/page/summary/")
        ? url.pathname.split("/page/summary/")[1]
        : url.searchParams.get("titles") || url.searchParams.get("page") || ""
    ).replace(/_/g, " ");
    const canonicalTitle = canonicalByRequested[requested] || requested;

    if (url.pathname.includes("/page/summary/")) {
      return Response.json({ title: canonicalTitle, extract: `${canonicalTitle} 요약` });
    }
    if (url.searchParams.get("action") === "query") {
      return Response.json({
        query: {
          redirects: requested === canonicalTitle ? [] : [{ from: requested, to: canonicalTitle }],
          pages: { 1: { title: canonicalTitle, links: [{ ns: 0, title: "서울특별시" }, { ns: 0, title: "일본" }, { ns: 0, title: "화면에 없는 문서" }] } },
        },
      });
    }
    return Response.json({
      parse: {
        title: canonicalTitle,
        revid: canonicalTitle === "대한민국" ? 100 : 200,
        text: { "*": '<div class="mw-parser-output"><table class="infobox"><tr><td><a href="/wiki/서울특별시">서울</a></td></tr></table><div class="navbox"><a href="/wiki/일본#역사">일본</a></div></div>' },
      },
    });
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
}

test("남한/대한민국과 세종대왕/세종은 각각 같은 canonical title과 링크를 반환한다", async (t) => {
  installWikiFetchMock(t, {
    남한: "대한민국",
    대한민국: "대한민국",
    세종대왕: "세종",
    세종: "세종",
  });

  for (const [alias, canonical] of [["남한", "대한민국"], ["세종대왕", "세종"]]) {
    const aliasPage = await fetchPageData(alias);
    const canonicalPage = await fetchPageData(canonical);
    assert.equal(aliasPage.canonicalTitle, canonical);
    assert.equal(canonicalPage.canonicalTitle, canonical);
    assert.equal(aliasPage.revisionId, canonicalPage.revisionId);
    assert.deepEqual(aliasPage.links, ["서울특별시", "일본"]);
    assert.deepEqual(aliasPage.links, canonicalPage.links);
    assert.deepEqual(aliasPage.quickLinks, canonicalPage.quickLinks);
    assert.equal(aliasPage.quickLinks.every((title) => aliasPage.links.includes(title)), true);
    assert.equal(aliasPage.linkDiagnostics.redirects.length, 1);
  }
});

test("이전 요청은 취소되고 최신 요청만 상태에 적용된다", async () => {
  const manager = createLatestRequestManager();
  const oldRequest = manager.begin();
  const currentRequest = manager.begin();
  assert.equal(oldRequest.signal.aborted, true);
  assert.equal(manager.isCurrent(oldRequest.id), false);
  assert.equal(manager.isCurrent(currentRequest.id), true);

  const applied = [];
  if (manager.isCurrent(oldRequest.id)) applied.push("이전 문서");
  if (manager.isCurrent(currentRequest.id)) applied.push("현재 문서");
  assert.deepEqual(applied, ["현재 문서"]);
  assert.equal(isAbortError(Object.assign(new Error(), { name: "AbortError" })), true);
});

test("싱글·1:1·그룹이 공통 fetchPageData를 사용한다", async () => {
  for (const file of ["GamePage.jsx", "MultiplayerGamePage.jsx", "GroupGamePage.jsx"]) {
    const source = await readFile(new URL(`../pages/${file}`, import.meta.url), "utf8");
    assert.match(source, /from "\.\.\/services\/wikiService"/);
    assert.match(source, /fetchPageData\(/);
  }
});
