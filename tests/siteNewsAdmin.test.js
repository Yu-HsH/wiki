import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeSiteNews, validateSiteNewsForm } from "../services/siteNewsService.js";
import { UPDATE_NOTICES, hasUnreadUpdates, markUpdatesRead } from "../data/updateNotices.js";

test("2.0.2 notice contains expected feature facts without pretending room auto-rematch", () => {
  const latest = UPDATE_NOTICES[0];
  assert.match(latest.title, /2\.0\.2/);
  assert.ok(latest.details.some(t => t.includes("22개") && t.includes("39개")));
  assert.ok(latest.details.some(t => t.includes("새 비공개 재경기 준비방")));
  assert.ok(latest.details.some(t => t.includes("공개 대기방")));
  assert.ok(latest.details.some(t => t.includes("목차")));
});

test("notice payload uses plain text and line-delimited body items", () => {
  const val = validateSiteNewsForm({
    title: " 새로운 소식 ", summary: " 요약 ", details: " 항목 1 \n\n 항목 2 ", type: "공지",
  });
  assert.deepEqual(val, {
    title:"새로운 소식",summary:"요약",details:["항목 1","항목 2"],type:"공지",
  });
  assert.throws(() => validateSiteNewsForm({title:"",summary:"x",details:"text"}),/제목/);
  assert.throws(() => validateSiteNewsForm({title:"x",summary:"x",details:""}),/본문/);
  assert.throws(() => validateSiteNewsForm({title:"x",summary:"x".repeat(361),details:"text"}),/요약/);
});

test("public database row is normalized to the existing journal view", () => {
  const entry = normalizeSiteNews({
    id:"123",published_at:"2026-11-10T02:00:00+00:00",
    title:"배포",summary:"요약",details:["첫째","둘째"],type:"점검",status:"published",
  });
  assert.equal(entry.date,"2026-11-10");
  assert.equal(entry.status,"released");
  assert.deepEqual(entry.details,["첫째","둘째"]);
});

test("unread notice uses latest server post id, not only compiled static data", () => {
  const data = new Map();
  const storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};
  assert.equal(hasUnreadUpdates(storage,"server-post-1"),true);
  assert.equal(markUpdatesRead(storage,"server-post-1"),true);
  assert.equal(hasUnreadUpdates(storage,"server-post-1"),false);
  assert.equal(hasUnreadUpdates(storage,"server-post-2"),true);
});

test("SQL authority remains server side and single operator", () => {
  const migration=readFileSync(new URL("../supabase/migrations/20261110023343_site_news_admin_v1.sql",import.meta.url),"utf8");
  assert.match(migration,/slot smallint primary key default 1 check\(slot=1\)/);
  assert.match(migration,/auth\.uid\(\)/);
  assert.match(migration,/security definer set search_path = ''/);
  assert.match(migration,/enable row level security/g);
  assert.match(migration,/to anon,authenticated using\(status='published'\)/);
  assert.match(migration,/with check\(\(select public\.is_site_news_admin\(\)\)\)/);
  assert.doesNotMatch(migration,/raw_user_meta_data|user_metadata/);
});
