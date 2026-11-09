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
