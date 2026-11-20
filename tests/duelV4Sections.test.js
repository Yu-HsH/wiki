import assert from "node:assert/strict";
import test from "node:test";
import { parse, serialize } from "parse5";
import { buildSearchDocument } from "../supabase/functions/duel-search/document.mjs";
import { readLinkSections } from "../supabase/functions/duel-search-v4/sections.mjs";

test("v4 enhanced index uses the first heading from the same pinned search body", () => {
  const rawHtml = '<a href="/wiki/First">First</a><h2>Language <em>history</em></h2>' +
    '<p><a href="/wiki/Second">Second</a></p><h3>References</h3>' +
    '<a href="/wiki/Second">Second again</a><a href="/wiki/Third">Third</a>' +
    '<a href="https://example.invalid">External</a>';
  const links = ["First", "Second", "Third"].map(title => ({ title }));
  const doc = buildSearchDocument(rawHtml, { currentTitle: "Start", links }, { parse, serialize });
  assert.deepEqual({ ...readLinkSections(doc.documentHtml, parse) }, {
    First: "본문", Second: "Language history", Third: "References",
  });
});
