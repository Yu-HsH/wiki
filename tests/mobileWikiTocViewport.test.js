import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const source=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");

test("mobile TOC has explicit safe fixed anchor rather than center overlay",()=>{
 const css=source("css/app.css");
 assert.match(css,/@media \(max-width: 760px\)/);
 assert.match(css,/\.wr-race \.wiki-nav-rail \{\s*top: auto;/);
 assert.match(css,/bottom: calc\(var\(--race-dock-h, 62px\)/);
 assert.match(css,/env\(safe-area-inset-bottom, 0px\)/);
 assert.match(css,/\.wr-race \.wiki-nav-rail:not\(\.is-expanded\) \.wiki-nav-section-list \{\s*display: none;/);
 assert.match(css,/\.wr-race \.wiki-nav-rail\.is-expanded \.wiki-nav-section-list \{/);
 assert.match(css,/min-height: 44px/);
});

test("heading toggle, aria-expanded and scroll handlers remain in WikiViewer",()=>{
 const viewer=source("components/WikiViewer.jsx");
 assert.match(viewer,/aria-expanded=\{railExpanded\}/);
 assert.match(viewer,/setRailExpanded\(\(expanded\) => !expanded\)/);
 assert.match(viewer,/scrollToHeading\(h\.id\)/);
 assert.match(viewer,/aria-label=\"현재 문서 목차\"/);
});

test("race scroll shortcut stays separate from TOC on short and split screens",()=>{
 const css=source("css/app.css");
 const btn=source("components/ScrollToTopButton.jsx");
 assert.match(css,/\.scroll-top-btn--race \{/);
 assert.match(css,/@media \(max-width: 900px\), \(max-height: 700px\)/);
 assert.match(css,/left: max\(10px, env\(safe-area-inset-left, 0px\)\)/);
 assert.match(css,/right: auto/);
 assert.match(css,/body:has\(\.wr-race \.wiki-nav-rail:is\(:hover, :focus-within, \.is-expanded\)\)/);
 assert.match(btn,/race = false/);
 for (const page of ["pages/GamePage.jsx","pages/MultiplayerGamePage.jsx","pages/GroupGamePage.jsx"])
   assert.match(source(page),/<ScrollToTopButton race \/>/);
 const fixture=source("tests/browser-fixtures/wiki-toc-responsive.html");
 assert.match(fixture,/React\.createElement\(ScrollToTopButton,\{race:true\}\)/);
});
