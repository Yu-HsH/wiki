import { isSupabaseConfigured, supabase } from "../supabaseClient.js";

function createRequestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `request-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
export function normalizeSnapshotIdentity(page) {
  return {
    pageId: page?.pageId == null ? null : String(page.pageId),
    revisionId: page?.revisionId == null ? null : String(page.revisionId),
    canonicalTitle: page?.canonicalTitle || page?.title || "",
  };
}

/**
 * Wikipedia 캐시는 브라우저가 직접 쓰지 않고 Edge Function이 service role로 채운다.
 * 같은 requestId를 재사용하면 네트워크 재시도에서도 snapshot/link row가 중복되지 않는다.
 */
export async function ensureWikiSnapshot(page, { requestId = createRequestId() } = {}) {
  if (!isSupabaseConfigured || !supabase) {
    const error = new Error("서버 문서 snapshot 기능이 설정되지 않았습니다.");
    error.code = "WIKI_SNAPSHOT_UNAVAILABLE";
    throw error;
  }

  const identity = normalizeSnapshotIdentity(page);
  if (!identity.canonicalTitle) {
    const error = new Error("문서 snapshot의 canonical title이 없습니다.");
    error.code = "WIKI_SNAPSHOT_INVALID";
    throw error;
  }

  const { data, error } = await supabase.functions.invoke("wiki-snapshot", {
    body: {
      requestId,
      title: identity.canonicalTitle,
      pageId: identity.pageId,
      revisionId: identity.revisionId,
    },
  });

  if (error) throw error;
  if (!data?.snapshotId || !data?.pageId || !data?.revisionId) {
    const invalid = new Error("서버가 유효한 문서 snapshot을 반환하지 않았습니다.");
    invalid.code = "WIKI_SNAPSHOT_INVALID";
    throw invalid;
  }

  return {
    ...data,
    pageId: String(data.pageId),
    revisionId: String(data.revisionId),
    documentHtml: typeof data.documentHtml === "string" ? data.documentHtml : "",
  };
}

export function createSnapshotRequestId() {
  return createRequestId();
}
