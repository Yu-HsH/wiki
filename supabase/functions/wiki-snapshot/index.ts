import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const WIKI_API = "https://ko.wikipedia.org/w/api.php";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Wikimedia User-Agent 정책은 앱 이름·버전과 연락 가능한 경로를 요구한다. 헤더를 생략하면
// 런타임 기본값(Deno/x.y.z)이 나가고 정책 위반으로 429를 받는다 (2026-08-28 운영 확인).
// 형태는 scripts/verifyWikiLinks.mjs:28-31의 선례를 따른다.
// 연락 경로는 URL 하나로 충족된다 — 정책은 URL 또는 이메일 중 하나를 요구한다.
const USER_AGENT =
  "WikiRace/2.0 (https://wiki-dusky-one.vercel.app) supabase-edge-functions";

const blockedNamespaces = /^(분류|파일|틀|위키백과|도움말|포털|특수|토론|사용자|모듈|미디어위키|category|file|template|wikipedia|help|portal|special|talk|user|module|mediawiki):/i;

function normalizeTitle(value: unknown) {
  return String(value ?? "").trim().replaceAll("_", " ").replace(/\s+/g, " ");
}

function titleKey(value: unknown) {
  return normalizeTitle(value).toLocaleLowerCase("ko-KR");
}

function apiUrl(params: Record<string, string>) {
  const search = new URLSearchParams({ ...params, origin: "*" });
  return `${WIKI_API}?${search.toString()}`;
}

async function wikiJson(params: Record<string, string>) {
  const response = await fetch(apiUrl(params), {
    headers: { accept: "application/json", "User-Agent": USER_AGENT },
  });
  if (!response.ok) throw new Error(`Wikipedia 요청 실패: ${response.status}`);
  return await response.json();
}

function getPage(data: any) {
  const pages = data?.query?.pages ?? {};
  const page = Object.values(pages)[0] as any;
  if (!page || page.missing !== undefined) throw new Error("Wikipedia 문서를 찾을 수 없습니다.");
  return page;
}

function extractBodyLinks(html: string) {
  const links: { title: string; linkText: string }[] = [];
  const anchorPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(anchorPattern)) {
    const href = match[1] ?? "";
    if (!href.startsWith("/wiki/") || href.includes("?")) continue;
    let raw = href.slice("/wiki/".length).split("#", 1)[0];
    try { raw = decodeURIComponent(raw); } catch { /* keep raw title */ }
    const title = normalizeTitle(raw);
    if (!title || blockedNamespaces.test(title)) continue;
    const linkText = (match[2] ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    links.push({ title, linkText });
  }
  return links;
}

// 본문 링크에는 같은 문서가 여러 번 나온다. identities는 titleKey로 키를 잡으므로 같은 key를
// 두 번 조회해도 Map 내용은 같다 — 배치 전에 접으면 요청 수만 줄고 결과는 그대로다.
// 최초 등장 순서를 보존한다 (링크 순서·ordinal은 아래 bodyLinks 루프가 따로 정한다).
function uniqueTitles(titles: string[]) {
  const seen = new Set<string>();
  return titles.filter((title) => {
    const key = titleKey(title);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// MediaWiki's prop=links resolves revids to the latest page revision. To keep
// the link list tied to the HTML revision, extract titles from pinned HTML and
// resolve only those titles to stable page IDs with prop=info.
async function fetchPageIdentities(titles: string[]) {
  const identities = new Map<string, { pageId: string; title: string }>();
  for (let index = 0; index < titles.length; index += 50) {
    const batch = titles.slice(index, index + 50);
    if (!batch.length) continue;
    const data = await wikiJson({
      action: "query",
      prop: "info",
      titles: batch.join("|"),
      redirects: "1",
      format: "json",
    });
    for (const page of Object.values(data?.query?.pages ?? {}) as any[]) {
      if (page?.ns !== 0 || page?.pageid == null || !page?.title) continue;
      const identity = { pageId: String(page.pageid), title: normalizeTitle(page.title) };
      identities.set(titleKey(page.title), identity);
    }
    for (const redirect of data?.query?.redirects ?? []) {
      const identity = identities.get(titleKey(redirect.to));
      if (identity && redirect.from) identities.set(titleKey(redirect.from), identity);
    }
  }
  return identities;
}

async function fetchRevisionIds(pageIds: string[]) {
  const revisions = new Map<string, string>();
  for (let index = 0; index < pageIds.length; index += 50) {
    const batch = pageIds.slice(index, index + 50);
    const data = await wikiJson({
      action: "query",
      pageids: batch.join("|"),
      prop: "revisions",
      rvprop: "ids",
      rvlimit: "1",
      format: "json",
    });
    for (const page of Object.values(data?.query?.pages ?? {}) as any[]) {
      const pageId = page?.pageid == null ? "" : String(page.pageid);
      const revisionId = page?.revisions?.[0]?.revid;
      if (pageId && revisionId != null) revisions.set(pageId, String(revisionId));
    }
  }
  return revisions;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ code: "METHOD_NOT_ALLOWED" }, 405);

  try {
    const body = await req.json();
    const requestedTitle = normalizeTitle(body?.title);
    const requestId = body?.requestId || null;
    const expectedPageId = body?.pageId == null ? "" : String(body.pageId);
    const expectedRevisionId = body?.revisionId == null ? "" : String(body.revisionId);
    if (!requestedTitle) return json({ code: "INVALID_TITLE" }, 400);

    let parsedPage: any;
    if (expectedPageId && expectedRevisionId) {
      const pinnedParseResponse = await wikiJson({
        action: "parse",
        oldid: expectedRevisionId,
        prop: "text|revid",
        format: "json",
      });
      parsedPage = pinnedParseResponse?.parse;
      if (String(parsedPage?.pageid ?? "") !== expectedPageId
        || String(parsedPage?.revid ?? "") !== expectedRevisionId) {
        return json({ code: "WIKI_SNAPSHOT_IDENTITY_MISMATCH" }, 409);
      }
    } else {
      const initialParse = await wikiJson({
        action: "parse",
        page: requestedTitle,
        prop: "text|revid",
        redirects: "1",
        format: "json",
      });
      const initialPage = initialParse?.parse;
      if (!initialPage?.pageid || !initialPage?.revid || !initialPage?.title) return json({ code: "WIKI_PAGE_INVALID" }, 502);

      const pinnedParseResponse = await wikiJson({
        action: "parse",
        oldid: String(initialPage.revid),
        prop: "text|revid",
        format: "json",
      });
      parsedPage = pinnedParseResponse?.parse;
      if (!parsedPage?.pageid || !parsedPage?.revid || !parsedPage?.title
        || String(parsedPage.revid) !== String(initialPage.revid)) {
        return json({ code: "WIKI_REVISION_CHANGED" }, 409);
      }
    }

    if (!parsedPage?.pageid || !parsedPage?.revid || !parsedPage?.title) {
      return json({ code: "WIKI_REVISION_CHANGED" }, 409);
    }

    const pageId = String(parsedPage.pageid);
    const revisionId = String(parsedPage.revid);
    const canonicalTitle = normalizeTitle(parsedPage.title);
    const bodyLinks = extractBodyLinks(parsedPage?.text?.["*"] ?? "");
    const pageIdentities = await fetchPageIdentities(
      uniqueTitles(bodyLinks.map((link) => link.title))
    );
    const uniqueLinks = new Map<string, any>();
    for (const bodyLink of bodyLinks) {
      const identity = pageIdentities.get(titleKey(bodyLink.title));
      if (!identity) continue;
      const targetPageId = identity.pageId;
      if (targetPageId === pageId || uniqueLinks.has(targetPageId)) continue;
      uniqueLinks.set(targetPageId, {
        targetPageId,
        targetTitle: identity.title,
        linkText: bodyLink.linkText || identity.title,
      });
    }

    const targetRevisionIds = await fetchRevisionIds(
      [...uniqueLinks.values()].map((link) => link.targetPageId)
    );

    const links = [...uniqueLinks.values()].map((link) => ({
      targetPageId: link.targetPageId,
      targetRevisionId: targetRevisionIds.get(link.targetPageId) ?? null,
      targetTitle: link.targetTitle,
      linkText: link.linkText,
    }));
    const { data: snapshotData, error: snapshotError } = await supabase.rpc("replace_wiki_snapshot_v2", {
      p_page_id: pageId,
      p_revision_id: revisionId,
      p_canonical_title: canonicalTitle,
      p_request_id: requestId,
      p_links: links,
    });
    if (snapshotError) throw snapshotError;
    const snapshot = Array.isArray(snapshotData) ? snapshotData[0] : snapshotData;
    if (!snapshot?.id) throw new Error("SNAPSHOT_REPLACEMENT_FAILED");

    return json({
      snapshotId: snapshot.id,
      pageId,
      revisionId,
      canonicalTitle,
      documentHtml: parsedPage?.text?.["*"] ?? "",
      links: links.map((row) => ({
        pageId: row.targetPageId,
        title: row.targetTitle,
        linkText: row.linkText,
      })),
    });
  } catch (error) {
    console.error("wiki-snapshot failed", error);
    return json({ code: "WIKI_SNAPSHOT_FAILED", message: error instanceof Error ? error.message : String(error) }, 502);
  }
});
