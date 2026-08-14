import { isSupabaseConfigured, supabase } from "../supabaseClient";
import { createCorrelationId, createRequestId, normalizeAuthorityError } from "../utils/serverAuthority";

function assertServer() {
  if (!isSupabaseConfigured || !supabase) {
    const error = new Error("Supabase 서버 게임이 설정되지 않았습니다.");
    error.code = "SERVER_GAME_UNAVAILABLE";
    throw error;
  }
}

function normalizeRpcResponse(data) {
  const response = Array.isArray(data) ? data[0] : data;
  if (!response?.ok) {
    const error = new Error(response?.code || "서버 게임 요청이 거부되었습니다.");
    error.code = response?.code || "SERVER_MUTATION_REJECTED";
    error.recoverable = response?.code === "STATE_VERSION_CONFLICT";
    error.snapshot = response?.run || null;
    throw error;
  }
  return response;
}

export async function createAuthenticatedSingleRun({ runId = createRequestId(), start, target }) {
  assertServer();
  const { data, error } = await supabase.rpc("create_single_game_run", {
    p_run_id: runId,
    p_start_page_id: String(start.pageId),
    p_start_revision_id: String(start.revisionId),
    p_start_title_snapshot: start.canonicalTitle || start.title,
    p_target_page_id: String(target.pageId),
    p_target_revision_id: target.revisionId == null ? null : String(target.revisionId),
    p_target_title_snapshot: target.canonicalTitle || target.title,
  });
  if (error) throw normalizeAuthorityError(error, "싱글 게임을 서버에 시작하지 못했습니다.");
  return { runId, run: Array.isArray(data) ? data[0] : data };
}

export async function fetchAuthenticatedSingleRun(runId) {
  assertServer();
  const { data, error } = await supabase.rpc("get_single_game_run", { p_run_id: runId });
  if (error) throw normalizeAuthorityError(error, "싱글 게임 복구 상태를 불러오지 못했습니다.");
  return Array.isArray(data) ? data[0] : data;
}

export async function applyAuthenticatedSingleMove({
  runId,
  expectedVersion,
  nextPage,
  clickedRawTitle,
  eventType = "NORMAL_LINK",
  requestId = createRequestId(),
  correlationId = createCorrelationId(),
}) {
  assertServer();
  const { data, error } = await supabase.rpc("apply_single_move_v2", {
    p_run_id: runId,
    p_request_id: requestId,
    p_correlation_id: correlationId,
    p_expected_version: expectedVersion,
    p_to_page_id: nextPage?.pageId == null ? null : String(nextPage.pageId),
    p_to_revision_id: nextPage?.revisionId == null ? null : String(nextPage.revisionId),
    p_to_title_snapshot: nextPage?.canonicalTitle || nextPage?.title || null,
    p_clicked_raw_title: clickedRawTitle || nextPage?.requestedTitle || nextPage?.title || null,
    p_event_type: eventType,
  });
  if (error) throw normalizeAuthorityError(error, "이동을 서버에 반영하지 못했습니다.");
  return normalizeRpcResponse(data);
}

export async function leaveAuthenticatedSingleRun({ runId, requestId = createRequestId() }) {
  assertServer();
  const { data, error } = await supabase.rpc("leave_single_game_run", {
    p_run_id: runId,
    p_request_id: requestId,
  });
  if (error) throw normalizeAuthorityError(error, "싱글 게임 이탈을 서버에 반영하지 못했습니다.");
  return normalizeRpcResponse(data);
}

export async function invokeGuestSingleRun(action, payload) {
  assertServer();
  const { data, error } = await supabase.functions.invoke("single-run", {
    body: { action, ...payload },
  });
  if (error) throw normalizeAuthorityError(error, "게스트 게임 서버 요청에 실패했습니다.");
  return normalizeRpcResponse(data);
}

export async function applyGuestSingleMove({
  guestToken,
  runId,
  expectedVersion,
  nextPage,
  clickedRawTitle,
  eventType = "NORMAL_LINK",
  requestId = createRequestId(),
  correlationId = createCorrelationId(),
}) {
  return invokeGuestSingleRun("move", {
    guestToken,
    runId,
    requestId,
    correlationId,
    expectedVersion,
    nextPage,
    clickedRawTitle,
    eventType,
  });
}
