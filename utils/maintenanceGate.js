/**
 * 유지보수 게이트 — 앱 진입점에서 점검 화면과 정상 앱을 가르는 판정 모듈
 *
 * 이 모듈은 의도적으로 순수하고 의존이 없다. React·라우터·Supabase를 import 하지 않는다.
 * `main.jsx`가 App 모듈을 동적으로 불러오기 **전에** 이 판정을 끝내야 하므로,
 * 여기에 새 import를 추가하면 게이트가 앞선다는 보장이 깨진다.
 *
 * 주의: 클라이언트 측 차단이다. `VITE_*`는 빌드 시점에 인라인되고 바이패스 값도 번들에
 * 그대로 들어가므로 보안 경계가 아니다 (`docs/ops/CUTOVER-PLAN.md` §3.1).
 */

export const MAINTENANCE_BYPASS_STORAGE_KEY = "wiki-maintenance-bypass";
export const MAINTENANCE_BYPASS_QUERY_PARAM = "bypass";
export const MAINTENANCE_BYPASS_OFF_VALUE = "off";

function readEnvValue(env, key) {
  const value = env?.[key];
  return typeof value === "string" ? value.trim() : "";
}

/**
 * 점검 플래그가 켜졌는지 확인한다.
 * 기본값은 반드시 비활성이므로 정확히 문자열 `"true"`만 활성으로 본다.
 */
export function isMaintenanceFlagEnabled(env) {
  return readEnvValue(env, "VITE_MAINTENANCE") === "true";
}

/**
 * 바이패스 값은 환경변수로만 주입한다. 소스에 하드코딩하지 않는다.
 * 값이 비어 있으면 바이패스 수단 자체가 없는 것으로 처리한다.
 */
export function getConfiguredBypassToken(env) {
  return readEnvValue(env, "VITE_MAINTENANCE_BYPASS");
}

function readBypassParam(search) {
  if (typeof search !== "string" || search.length === 0) return null;
  try {
    const query = new URLSearchParams(
      search.startsWith("?") ? search.slice(1) : search
    );
    const raw = query.get(MAINTENANCE_BYPASS_QUERY_PARAM);
    return raw === null ? null : raw.trim();
  } catch {
    return null;
  }
}

/**
 * 순수 판정 함수 — 저장소를 건드리지 않는다.
 *
 * @returns {{
 *   view: "app" | "maintenance",
 *   maintenanceEnabled: boolean,
 *   bypassActive: boolean,
 *   bypassConfigured: boolean,
 *   storageAction: "persist" | "clear" | "none",
 *   bypassToken: string,
 * }}
 */
export function decideMaintenanceGate({
  env = {},
  search = "",
  storedToken = null,
} = {}) {
  const maintenanceEnabled = isMaintenanceFlagEnabled(env);
  const configuredToken = getConfiguredBypassToken(env);
  const bypassConfigured = configuredToken.length > 0;
  const param = readBypassParam(search);
  const stored = typeof storedToken === "string" ? storedToken.trim() : "";

  let storageAction = "none";
  let bypassActive = bypassConfigured && stored === configuredToken;

  if (param !== null) {
    if (param.toLowerCase() === MAINTENANCE_BYPASS_OFF_VALUE) {
      // 해제는 바이패스 설정 여부와 무관하게 항상 동작한다.
      storageAction = "clear";
      bypassActive = false;
    } else if (bypassConfigured && param === configuredToken) {
      storageAction = "persist";
      bypassActive = true;
    }
    // 값이 틀린 경우: 통과시키지 않되 기존 바이패스도 지우지 않는다.
  }

  return Object.freeze({
    view: maintenanceEnabled && !bypassActive ? "maintenance" : "app",
    maintenanceEnabled,
    bypassActive,
    bypassConfigured,
    storageAction,
    bypassToken: configuredToken,
  });
}

function readStoredToken(storage) {
  try {
    return storage?.getItem(MAINTENANCE_BYPASS_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

function applyStorageAction(storage, action, token) {
  try {
    if (action === "persist") storage?.setItem(MAINTENANCE_BYPASS_STORAGE_KEY, token);
    else if (action === "clear") storage?.removeItem(MAINTENANCE_BYPASS_STORAGE_KEY);
  } catch {
    // 저장소를 쓸 수 없는 브라우저에서도 판정 자체는 유지한다.
  }
}

/**
 * 판정 + 저장소 반영. `?bypass=<값>`을 localStorage에 심어 새로고침 후에도 유지한다.
 * 저장소 접근 실패는 삼켜서 게이트가 앱 부팅을 깨뜨리지 않게 한다.
 */
export function resolveMaintenanceGate({ env = {}, search = "", storage = null } = {}) {
  const decision = decideMaintenanceGate({
    env,
    search,
    storedToken: readStoredToken(storage),
  });
  applyStorageAction(storage, decision.storageAction, decision.bypassToken);
  return decision;
}
