const authCodes = new Set([
  "AUTH_REQUIRED", "session_not_found", "session_expired", "refresh_token_not_found",
  "refresh_token_already_used", "bad_jwt", "PGRST301", "PGRST303",
]);
const memberCodes = new Set([
  "DUEL_V4_MEMBER_REQUIRED", "PRODUCT_ROOM_UNAVAILABLE", "PRODUCT_DOCUMENT_UNAVAILABLE",
  "HINTS_MEMBER_REQUIRED", "TRANSPORT_SCOPE_MISMATCH", "RECEIPT_SCOPE_MISMATCH",
  "PRODUCT_ROOM_SCOPE_MISMATCH", "PRODUCT_ROOM_BINDING_CHANGED", "PRODUCT_PHASE_REGRESSION",
]);
const closedCodes = new Set(["WAITING_ROOM_CLOSED", "ROOM_EXPIRED", "PRODUCT_ROOM_CLOSED"]);

export function itemRaceFailure(error) {
  const code = /^[A-Z][A-Z_0-9]+$/.test(error?.message) ? error.message : error?.code;
  const status = error?.status ?? error?.context?.status;
  if (authCodes.has(code) || error?.name === "AuthSessionMissingError" || status === 401) return { kind: "auth", code };
  if (code === "STALE_DOCUMENT") return { kind: "stale-document", code };
  if (closedCodes.has(code)) return { kind: "closed", code };
  if (memberCodes.has(code) || code === "42501" || status === 403) return { kind: "denied", code };
  return { kind: "connection", code };
}

export function itemRaceFailureMessage(failure) {
  switch (failure?.kind) {
    case "auth": return "로그인 세션을 다시 확인하고 있어요. 세션이 만료되면 로그인 후 원래 방으로 돌아올 수 있어요.";
    case "denied": return "이 방에 접근할 권한을 확인할 수 없어요. 참가한 계정인지 확인해 주세요.";
    case "closed": return "이미 닫힌 방이에요.";
    case "stale-document": return "경기에서 이동한 최신 문서를 확인하고 있어요.";
    default: return "경기 연결을 다시 확인하고 있어요.";
  }
}

export function itemRaceReturnPath(path) {
  return typeof path === "string" && /^\/multiplayer\/(duel-v4|group-items)\/[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(path)
    ? path : null;
}

// Timers share the current read. A change signal or a just-settled mutation
// also needs one read that starts after the current request finishes.
export function createItemRaceReader(read, scopeSignal) {
  let current = null;
  let queued = null;
  function refresh({ trailing = false } = {}) {
    if (scopeSignal.aborted) return Promise.resolve(undefined);
    if (current) {
      if (!trailing) return current;
      const advance = () => {
        queued = null;
        return refresh();
      };
      queued ??= current.then(advance, advance);
      return queued;
    }
    const signal = AbortSignal.any([scopeSignal, AbortSignal.timeout(8000)]);
    current = Promise.resolve().then(() => read(signal)).finally(() => { current = null; });
    return current;
  }
  return refresh;
}
