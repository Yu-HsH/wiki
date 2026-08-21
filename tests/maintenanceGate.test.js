import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  MAINTENANCE_BYPASS_QUERY_PARAM,
  MAINTENANCE_BYPASS_STORAGE_KEY,
  decideMaintenanceGate,
  getConfiguredBypassToken,
  isMaintenanceFlagEnabled,
  resolveMaintenanceGate,
} from "../utils/maintenanceGate.js";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const BYPASS_TOKEN = "test-bypass-token";

function readProjectFile(relativePath) {
  return readFile(path.join(projectRoot, relativePath), "utf8");
}

function createMemoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
    snapshot() {
      return Object.fromEntries(values);
    },
  };
}

function createThrowingStorage() {
  return {
    getItem() {
      throw new Error("storage blocked");
    },
    setItem() {
      throw new Error("storage blocked");
    },
    removeItem() {
      throw new Error("storage blocked");
    },
  };
}

function maintenanceEnv(extra = {}) {
  return {
    VITE_MAINTENANCE: "true",
    VITE_MAINTENANCE_BYPASS: BYPASS_TOKEN,
    ...extra,
  };
}

test("게이트 기본값은 비활성이다 — 환경변수가 없으면 앱을 렌더한다", () => {
  assert.equal(decideMaintenanceGate().view, "app");
  assert.equal(decideMaintenanceGate({ env: {} }).view, "app");
  assert.equal(decideMaintenanceGate({ env: { VITE_SUPABASE_URL: "x" } }).view, "app");
  assert.equal(isMaintenanceFlagEnabled(undefined), false);
});

test("VITE_MAINTENANCE는 정확히 문자열 true일 때만 켜진다", () => {
  for (const value of ["false", "1", "yes", "on", "TRUE", "True", "", " "]) {
    assert.equal(
      isMaintenanceFlagEnabled({ VITE_MAINTENANCE: value }),
      false,
      `VITE_MAINTENANCE=${JSON.stringify(value)}가 게이트를 켰다`
    );
  }
  assert.equal(isMaintenanceFlagEnabled({ VITE_MAINTENANCE: true }), false);
  assert.equal(isMaintenanceFlagEnabled({ VITE_MAINTENANCE: "true" }), true);
  assert.equal(isMaintenanceFlagEnabled({ VITE_MAINTENANCE: "  true  " }), true);
});

test("게이트 on 상태에서는 점검 화면만 렌더한다", () => {
  const decision = decideMaintenanceGate({ env: maintenanceEnv() });
  assert.equal(decision.view, "maintenance");
  assert.equal(decision.maintenanceEnabled, true);
  assert.equal(decision.bypassActive, false);
});

test("바이패스 값은 환경변수로만 주입되며 소스에 하드코딩하지 않는다", async () => {
  assert.equal(getConfiguredBypassToken({ VITE_MAINTENANCE_BYPASS: " tok " }), "tok");
  assert.equal(getConfiguredBypassToken({}), "");

  // 환경변수가 비어 있으면 바이패스 수단 자체가 없다.
  for (const candidate of ["anything", BYPASS_TOKEN, "true", "1", "letmein"]) {
    const noToken = decideMaintenanceGate({
      env: { VITE_MAINTENANCE: "true" },
      search: `?${MAINTENANCE_BYPASS_QUERY_PARAM}=${candidate}`,
    });
    assert.equal(noToken.bypassConfigured, false);
    assert.equal(noToken.view, "maintenance", `${candidate}가 게이트를 통과했다`);
    assert.equal(noToken.storageAction, "none");
  }

  // 소스에 기본값(fallback) 토큰을 두지 않는다.
  const gateSource = await readProjectFile("utils/maintenanceGate.js");
  assert.match(gateSource, /VITE_MAINTENANCE_BYPASS/);
  assert.doesNotMatch(
    gateSource,
    /VITE_MAINTENANCE_BYPASS[^\n]*(?:\|\||\?\?|=)\s*["'`][^"'`]+["'`]/
  );
});

test("?bypass=<값>으로 접근하면 게이트를 통과하고 localStorage에 유지된다", () => {
  const storage = createMemoryStorage();
  const first = resolveMaintenanceGate({
    env: maintenanceEnv(),
    search: `?${MAINTENANCE_BYPASS_QUERY_PARAM}=${BYPASS_TOKEN}`,
    storage,
  });

  assert.equal(first.view, "app");
  assert.equal(first.bypassActive, true);
  assert.equal(first.storageAction, "persist");
  assert.equal(storage.getItem(MAINTENANCE_BYPASS_STORAGE_KEY), BYPASS_TOKEN);

  // 새로고침 — 쿼리 문자열 없이 같은 저장소로 다시 판정한다.
  const afterReload = resolveMaintenanceGate({
    env: maintenanceEnv(),
    search: "",
    storage,
  });
  assert.equal(afterReload.view, "app");
  assert.equal(afterReload.bypassActive, true);
  assert.equal(afterReload.storageAction, "none");
  assert.equal(storage.getItem(MAINTENANCE_BYPASS_STORAGE_KEY), BYPASS_TOKEN);
});

test("?bypass=off는 저장된 바이패스를 해제하고 점검 화면으로 되돌린다", () => {
  const storage = createMemoryStorage({
    [MAINTENANCE_BYPASS_STORAGE_KEY]: BYPASS_TOKEN,
  });
  const decision = resolveMaintenanceGate({
    env: maintenanceEnv(),
    search: `?${MAINTENANCE_BYPASS_QUERY_PARAM}=off`,
    storage,
  });

  assert.equal(decision.view, "maintenance");
  assert.equal(decision.bypassActive, false);
  assert.equal(decision.storageAction, "clear");
  assert.equal(storage.getItem(MAINTENANCE_BYPASS_STORAGE_KEY), null);
  assert.deepEqual(storage.snapshot(), {});

  // 해제 후 새로고침해도 점검 화면이 유지된다.
  assert.equal(
    resolveMaintenanceGate({ env: maintenanceEnv(), search: "", storage }).view,
    "maintenance"
  );
});

test("틀린 바이패스 값은 통과시키지 않고 기존 바이패스도 지우지 않는다", () => {
  const storage = createMemoryStorage({
    [MAINTENANCE_BYPASS_STORAGE_KEY]: BYPASS_TOKEN,
  });
  const wrongWithStored = resolveMaintenanceGate({
    env: maintenanceEnv(),
    search: `?${MAINTENANCE_BYPASS_QUERY_PARAM}=wrong`,
    storage,
  });
  assert.equal(wrongWithStored.storageAction, "none");
  assert.equal(storage.getItem(MAINTENANCE_BYPASS_STORAGE_KEY), BYPASS_TOKEN);

  const cleanStorage = createMemoryStorage();
  const wrongWithoutStored = resolveMaintenanceGate({
    env: maintenanceEnv(),
    search: `?${MAINTENANCE_BYPASS_QUERY_PARAM}=wrong`,
    storage: cleanStorage,
  });
  assert.equal(wrongWithoutStored.view, "maintenance");
  assert.equal(cleanStorage.getItem(MAINTENANCE_BYPASS_STORAGE_KEY), null);

  // 저장된 값이 현재 환경변수와 다르면 통과하지 않는다.
  const staleStorage = createMemoryStorage({
    [MAINTENANCE_BYPASS_STORAGE_KEY]: "stale-token",
  });
  assert.equal(
    resolveMaintenanceGate({
      env: maintenanceEnv(),
      search: "",
      storage: staleStorage,
    }).view,
    "maintenance"
  );
});

test("게이트 off 상태에서는 바이패스와 무관하게 앱을 렌더한다", () => {
  const storage = createMemoryStorage();
  const off = resolveMaintenanceGate({
    env: { VITE_MAINTENANCE_BYPASS: BYPASS_TOKEN },
    search: `?${MAINTENANCE_BYPASS_QUERY_PARAM}=${BYPASS_TOKEN}`,
    storage,
  });
  assert.equal(off.view, "app");
  assert.equal(off.maintenanceEnabled, false);
  // 창을 열기 전에 미리 바이패스를 심어둘 수 있어야 한다.
  assert.equal(storage.getItem(MAINTENANCE_BYPASS_STORAGE_KEY), BYPASS_TOKEN);
});

test("다른 쿼리 문자열·인코딩된 값·접두 물음표 유무를 모두 처리한다", () => {
  const encodedToken = "a b+c";
  const env = maintenanceEnv({ VITE_MAINTENANCE_BYPASS: encodedToken });

  assert.equal(
    decideMaintenanceGate({
      env: maintenanceEnv(),
      search: `?foo=1&${MAINTENANCE_BYPASS_QUERY_PARAM}=${BYPASS_TOKEN}&bar=2`,
    }).view,
    "app"
  );
  assert.equal(
    decideMaintenanceGate({
      env: maintenanceEnv(),
      search: `${MAINTENANCE_BYPASS_QUERY_PARAM}=${BYPASS_TOKEN}`,
    }).view,
    "app"
  );
  assert.equal(
    decideMaintenanceGate({
      env,
      search: `?${MAINTENANCE_BYPASS_QUERY_PARAM}=${encodeURIComponent(encodedToken)}`,
    }).view,
    "app"
  );
  assert.equal(
    decideMaintenanceGate({ env: maintenanceEnv(), search: "?other=1" }).view,
    "maintenance"
  );
});

test("localStorage를 쓸 수 없어도 게이트 판정이 깨지지 않는다", () => {
  const blocked = createThrowingStorage();
  assert.equal(
    resolveMaintenanceGate({ env: maintenanceEnv(), storage: blocked }).view,
    "maintenance"
  );
  assert.equal(
    resolveMaintenanceGate({
      env: maintenanceEnv(),
      search: `?${MAINTENANCE_BYPASS_QUERY_PARAM}=${BYPASS_TOKEN}`,
      storage: blocked,
    }).view,
    "app"
  );
  assert.equal(
    resolveMaintenanceGate({ env: maintenanceEnv(), storage: null }).view,
    "maintenance"
  );
});

test("진입점 분기는 App·Supabase·CSS 모듈 평가보다 앞선다", async () => {
  const mainSource = await readProjectFile("main.jsx");

  // 정적 import는 본문보다 먼저 평가되므로 앱 의존 그래프를 정적으로 끌어오면 안 된다.
  const staticImports = [
    ...mainSource.matchAll(/^import\s[^;]*?from\s+["']([^"']+)["'];/gm),
  ].map((match) => match[1]);
  assert.deepEqual(staticImports, [
    "react",
    "react-dom/client",
    "./components/MaintenanceScreen.jsx",
    "./utils/maintenanceGate.js",
  ]);
  assert.doesNotMatch(mainSource, /^import\s[^;]*?from\s+["']\.\/App\.jsx["'];/m);
  assert.doesNotMatch(mainSource, /^import\s+["']/m); // 부수효과 전용 정적 import(css 등) 금지
  for (const specifier of staticImports) {
    assert.doesNotMatch(
      specifier,
      /supabase|App\.jsx|authContext|\.css$/i,
      `main.jsx가 ${specifier}를 정적으로 import 한다`
    );
  }

  // App은 동적으로만 불러오고, 그 호출은 게이트 판정 이후에 있어야 한다.
  const gateIndex = mainSource.indexOf("resolveMaintenanceGate({");
  const appImportIndex = mainSource.indexOf('import("./App.jsx")');
  const stylesImportIndex = mainSource.indexOf('import("./appStyles.js")');
  assert.ok(gateIndex > -1, "main.jsx가 게이트를 호출하지 않는다");
  assert.ok(appImportIndex > gateIndex, "App 동적 import가 게이트 판정보다 앞에 있다");
  assert.ok(stylesImportIndex > gateIndex, "스타일 동적 import가 게이트 판정보다 앞에 있다");

  // env를 통째로 넘기면 Vite가 VITE_* 전체를 진입 청크에 인라인한다. 두 플래그만 넘긴다.
  assert.doesNotMatch(mainSource, /env:\s*import\.meta\.env\s*,/);
  assert.match(mainSource, /VITE_MAINTENANCE:\s*import\.meta\.env\.VITE_MAINTENANCE\b/);
  assert.match(
    mainSource,
    /VITE_MAINTENANCE_BYPASS:\s*import\.meta\.env\.VITE_MAINTENANCE_BYPASS\b/
  );

  // 점검 분기 안에서는 App을 불러오지 않는다.
  const maintenanceBranch = mainSource.slice(
    mainSource.indexOf('gate.view === "maintenance"'),
    mainSource.indexOf("} else {")
  );
  assert.match(maintenanceBranch, /MaintenanceScreen/);
  assert.doesNotMatch(maintenanceBranch, /import\(/);

  // App.jsx는 여전히 Supabase에 도달하는 그래프를 갖는다 — 그래서 정적 import가 금지된다.
  const authContextSource = await readProjectFile("authContext.jsx");
  assert.match(authContextSource, /from\s+["']\.\/supabaseClient["']/);
  assert.match(await readProjectFile("supabaseClient.js"), /createClient\(/);
});

test("점검 화면은 React 외의 의존 없이 렌더된다", async () => {
  const screenSource = await readProjectFile("components/MaintenanceScreen.jsx");
  const imports = [
    ...screenSource.matchAll(/^import\s[^;]*?from\s+["']([^"']+)["'];/gm),
  ].map((match) => match[1]);

  assert.deepEqual(imports, ["react"]);
  assert.doesNotMatch(screenSource, /^import\s+["']/m);
  assert.doesNotMatch(screenSource, /fetch\(|XMLHttpRequest|supabase|https?:\/\//i);
  assert.match(screenSource, /점검/);
  assert.match(screenSource, /1~2시간/);
});

test("두 환경변수가 .env.example과 README에 문서화되어 있다", async () => {
  const envExample = await readProjectFile(".env.example");
  assert.match(envExample, /^VITE_MAINTENANCE=/m);
  assert.match(envExample, /^VITE_MAINTENANCE_BYPASS=/m);

  const readme = await readProjectFile("README.md");
  assert.match(readme, /VITE_MAINTENANCE/);
  assert.match(readme, /VITE_MAINTENANCE_BYPASS/);
  assert.match(readme, /재배포/);
});
