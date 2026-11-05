import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  UPDATE_NOTICES, UPDATE_READ_KEY, getLatestNoticeId, hasUnreadUpdates, markUpdatesRead,
} from "../data/updateNotices.js";

test("public notices are newest-first, uniquely keyed and include release copy", () => {
  const keys = UPDATE_NOTICES.map(n => n.id);
  assert.equal(keys.length, new Set(keys).size);
  assert.deepEqual([...UPDATE_NOTICES].sort((a,b)=>b.date.localeCompare(a.date)), UPDATE_NOTICES);
  assert.equal(UPDATE_NOTICES[0].id, getLatestNoticeId());
  for (const notice of UPDATE_NOTICES) {
    assert.match(notice.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(["released", "planned"].includes(notice.status));
    assert.ok(notice.title && notice.summary && notice.details.length);
  }
});

test("unread indicator clears only after journal is seen", () => {
  const data = new Map();
  const storage = { getItem: k => data.get(k) ?? null, setItem: (k,v) => data.set(k,v) };
  assert.equal(hasUnreadUpdates(storage), true);
  assert.equal(markUpdatesRead(storage), true);
  assert.equal(data.get(UPDATE_READ_KEY), getLatestNoticeId());
  assert.equal(hasUnreadUpdates(storage), false);
  assert.equal(hasUnreadUpdates({getItem(){throw Error("blocked")}}), false);
  assert.equal(markUpdatesRead({setItem(){throw Error("blocked")}}), false);
});

test("Jungle Veil has a static fallback and keyboard-activated semantic button", () => {
  const art=readFileSync(new URL("../components/wiki-race/JungleVeilArt.jsx", import.meta.url),"utf8");
  const hero=readFileSync(new URL("../components/wiki-race/ExpeditionHero.jsx", import.meta.url),"utf8");
  assert.match(art, /missingAsset/);
  assert.match(art, /onError/);
  assert.match(hero, /<button type="button" className="wr-veil-trigger"/);
  assert.match(hero, /prefers-reduced-motion: reduce/);
});

test("Jungle65 font stylesheet is loaded and covers landing, HOME, PLAY and updates", () => {
  const styles = readFileSync(new URL("../appStyles.js", import.meta.url), "utf8");
  const fonts = readFileSync(new URL("../css/jungle65Fonts.css", import.meta.url), "utf8");
  assert.match(styles, /import "\\.\\/css\\/jungle65Fonts\\.css"/);
  assert.match(fonts, /\\.wr-page\\.wr-home, \\.wr-page\\.wr-updates, \\.wr-page\\.wr-play/);
  assert.match(fonts, /--wr65-font-display: "Cafe24 Ssurround"/);
  assert.match(fonts, /--wr65-font-paper: "Maru Buri"/);
  assert.match(fonts, /--wr65-font-body: "Pretendard Variable"/);
});
