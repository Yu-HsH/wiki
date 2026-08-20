import { fetchPageSummary, sanitizeWikiDocument } from "./wikiService.js";
import { ensureWikiSnapshot } from "./wikiSnapshotService.js";

export const GROUP_SPECTATOR_PRESETS = Object.freeze([
  { id: "cheer", label: "응원", emoji: "👏" },
  { id: "wow", label: "와우", emoji: "😮" },
  { id: "hurry", label: "서둘러요", emoji: "🏃" },
  { id: "clap", label: "좋아요", emoji: "👍" },
  { id: "gg", label: "GG", emoji: "✨" },
]);

const PRESET_BY_ID = new Map(
  GROUP_SPECTATOR_PRESETS.map((preset) => [preset.id, preset])
);

export function normalizeGroupSpectatorEmojiRpcResponse(data) {
  const response = Array.isArray(data) ? data[0] || null : data || null;
  if (!response) return null;
  if (response.accepted === false) return response;
  return response.event || response;
}

export function getGroupSpectatorPreset(presetId) {
  return PRESET_BY_ID.get(presetId) || null;
}

export function normalizeGroupSpectatorEmojiEvent(event) {
  const presetId = event?.payload?.presetId;
  const preset = getGroupSpectatorPreset(presetId);
  const userId = event?.user_id || event?.userId;
  if (!preset || !userId) return null;

  const timestamp = Date.parse(event.created_at || event.createdAt || "");
  return {
    id: event.id || `${userId}:${timestamp || Date.now()}`,
    userId,
    presetId,
    preset,
    createdAt: Number.isFinite(timestamp) ? timestamp : Date.now(),
  };
}

export function upsertLatestGroupSpectatorEmoji(events, incoming) {
  const normalized = normalizeGroupSpectatorEmojiEvent(incoming);
  if (!normalized) return events || [];

  const current = (events || []).find((event) => event.userId === normalized.userId);
  if (current && current.createdAt >= normalized.createdAt) return events;

  return [
    ...(events || []).filter((event) => event.userId !== normalized.userId),
    normalized,
  ].sort((left, right) => left.createdAt - right.createdAt);
}

export function filterVisibleGroupSpectatorEmojis(
  events,
  { mutedUserIds = [], muteAll = false } = {}
) {
  if (muteAll) return [];
  const muted = new Set(mutedUserIds);
  return (events || []).filter((event) => !muted.has(event.userId));
}

export async function fetchGroupSpectatorPage(
  player,
  { snapshotLoader = ensureWikiSnapshot, summaryLoader = fetchPageSummary } = {}
) {
  const identity = {
    pageId: player?.current_page_id == null ? null : String(player.current_page_id),
    revisionId:
      player?.current_revision_id == null ? null : String(player.current_revision_id),
    canonicalTitle: player?.current_title || "",
  };

  if (!identity.pageId || !identity.revisionId || !identity.canonicalTitle) {
    const error = new Error("관전 대상의 서버 문서 식별자가 없습니다.");
    error.code = "SPECTATOR_SNAPSHOT_IDENTITY_REQUIRED";
    throw error;
  }

  const snapshot = await snapshotLoader(identity);
  if (
    String(snapshot?.pageId) !== identity.pageId ||
    String(snapshot?.revisionId) !== identity.revisionId
  ) {
    const error = new Error("관전 대상 문서가 최신 서버 상태와 일치하지 않습니다.");
    error.code = "SPECTATOR_SNAPSHOT_STALE";
    throw error;
  }

  if (!snapshot.documentHtml) {
    const error = new Error("관전 문서 본문을 불러오지 못했습니다.");
    error.code = "SPECTATOR_DOCUMENT_UNAVAILABLE";
    throw error;
  }

  const summary = await summaryLoader(snapshot.canonicalTitle).catch(() => null);
  const sanitized = sanitizeWikiDocument(snapshot.documentHtml, {
    currentTitle: snapshot.canonicalTitle,
    apiLinks: snapshot.links || [],
  });

  return {
    requestedTitle: identity.canonicalTitle,
    title: snapshot.canonicalTitle,
    canonicalTitle: snapshot.canonicalTitle,
    pageId: identity.pageId,
    revisionId: identity.revisionId,
    summary: summary?.extract || "",
    documentHtml: sanitized.html,
    links: sanitized.linkTitles,
    quickLinks: sanitized.linkTitles.slice(0, 20),
  };
}
