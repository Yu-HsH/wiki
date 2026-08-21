import React from "react";
import { createRoot } from "react-dom/client";
import MaintenanceScreen from "./components/MaintenanceScreen.jsx";
import { resolveMaintenanceGate } from "./utils/maintenanceGate.js";

// 유지보수 게이트는 앱 모듈보다 먼저 판정되어야 한다.
// App.jsx를 정적으로 import 하면 ES 모듈 평가 순서상 이 파일 본문보다 App의 의존 그래프
// (라우터·authContext·supabaseClient의 createClient)가 먼저 실행된다. 그래서 동적 import를 쓴다.
// env는 두 플래그만 골라 넘긴다. `import.meta.env`를 통째로 넘기면 Vite가 진입 청크에
// VITE_* 전체(Supabase URL·anon key 포함)를 인라인해, 점검 전용 빌드에까지 끌려 들어온다.
const gate = resolveMaintenanceGate({
  env: {
    VITE_MAINTENANCE: import.meta.env.VITE_MAINTENANCE,
    VITE_MAINTENANCE_BYPASS: import.meta.env.VITE_MAINTENANCE_BYPASS,
  },
  search: globalThis.location?.search ?? "",
  storage: globalThis.localStorage ?? null,
});

const root = createRoot(document.getElementById("root"));

if (gate.view === "maintenance") {
  root.render(<MaintenanceScreen />);
} else {
  // 상위 await는 Vite 기본 빌드 타깃에서 지원되지 않으므로 then 체인을 쓴다.
  Promise.all([import("./App.jsx"), import("./appStyles.js")]).then(
    ([{ default: App }]) => {
      root.render(
        <React.StrictMode>
          <App />
        </React.StrictMode>
      );
    }
  );
}
