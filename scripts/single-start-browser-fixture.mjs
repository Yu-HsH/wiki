import { SINGLE_START_CONTRACT, SINGLE_START_DURATION_MS } from "../utils/singleStart.js";

// Local browser fixture for the prepared, reserved and active server states.
export function createSingleStartFixture({ runs, allocationStart, allocationTarget, pageId, htmlOf, linksOf, now = Date.now }) {
  const allocations = new Map();
  function runAtCurrentTime(run) {
    if (run.status === "scheduled" && Date.parse(run.scheduled_start_at) <= now()) {
      run.status = "active";
      run.started_at = run.scheduled_start_at;
    }
    return run;
  }
  return function handleSingleStart(body) {
    const serverNow = new Date(now()).toISOString();
    if (body.action === "allocate") {
      const id = allocations.get(body.requestId) ?? body.requestId;
      if (!runs.has(id)) {
        const target = body.mode === "random" ? allocationTarget : (body.customTarget || allocationTarget);
        runs.set(id, {
          id, timing_contract: SINGLE_START_CONTRACT, run_mode: body.mode,
          status: "prepared", state_version: 0, move_count: 0,
          start_page_id: pageId(allocationStart), current_page_id: pageId(allocationStart),
          target_page_id: pageId(target), start_title_snapshot: allocationStart,
          current_title_snapshot: allocationStart, target_title_snapshot: target,
          path_title_snapshots: [allocationStart],
        });
        allocations.set(body.requestId, id);
      }
      return { ok: true, run: runAtCurrentTime(runs.get(id)), server_now: serverNow };
    }
    if (!["document", "reserve_start", "start", "snapshot_v1", "leave_v1"].includes(body.action)) return null;
    const run = runs.get(body.runId);
    if (!run || run.timing_contract !== SINGLE_START_CONTRACT) return { ok: false, code: "RUN_NOT_FOUND" };
    runAtCurrentTime(run);
    if (body.action === "reserve_start" && run.status === "prepared") {
      run.status = "scheduled";
      run.scene_starts_at = serverNow;
      run.scheduled_start_at = new Date(Date.parse(serverNow) + SINGLE_START_DURATION_MS).toISOString();
    }
    if (body.action === "leave_v1") run.status = "abandoned";
    if (body.action !== "document") return { ok: true, run, server_now: serverNow };
    const title = run.current_title_snapshot;
    const page = {
      pageId: pageId(title), revisionId: "5000", canonicalTitle: title, documentHtml: htmlOf(title),
      links: linksOf(title).map(link => ({ title: link })),
    };
    return { ok: true, run, page, server_now: serverNow };
  };
}
