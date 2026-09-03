import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  DUEL_FINISHED_REASONS,
  GROUP_RESULT_STATUSES,
  GROUP_RESULT_TERMS,
  GROUP_RETIRE_REASONS,
  GROUP_RETIRE_SUBTITLES,
  SINGLE_RESULT_STATUSES,
  getDuelResultLabel,
  getGroupResultLabel,
  getSingleResultLabel,
} from "../utils/resultReasonLabels.js";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));

/* ────────────────────────────────────────────────────────────
 * C4 §3.1 — 그룹 4용어
 * ──────────────────────────────────────────────────────────── */

test("C4 §3.1 그룹 — result_status='finished'는 완주다", () => {
  const label = getGroupResultLabel({ resultStatus: "finished" });

  assert.equal(label.term, "완주");
  assert.equal(label.subtitle, null);
  assert.equal(label.term, GROUP_RESULT_TERMS.finished);
});

test("C4 §3.1 그룹 — retired + forfeited/left는 기권이다", () => {
  for (const retireReason of ["forfeited", "left"]) {
    const label = getGroupResultLabel({ resultStatus: "retired", retireReason });

    assert.equal(label.term, "기권", `${retireReason}가 기권으로 매핑되지 않음`);
    assert.equal(label.subtitle, null, `${retireReason}에는 부제가 없다`);
  }
});

test("C4 §3.1 그룹 — retired + time_limit/grace_timeout은 리타이어다", () => {
  for (const retireReason of ["time_limit", "grace_timeout"]) {
    const label = getGroupResultLabel({ resultStatus: "retired", retireReason });

    assert.equal(label.term, "리타이어", `${retireReason}가 리타이어로 매핑되지 않음`);
  }
});

test("C4 §3.1 그룹 — retired + disconnected_timeout은 몰수다", () => {
  const label = getGroupResultLabel({
    resultStatus: "retired",
    retireReason: "disconnected_timeout",
  });

  assert.equal(label.term, "몰수");
  assert.notEqual(label.term, "RETIRE");
});

/* ────────────────────────────────────────────────────────────
 * C4 §3.1 — 부제 3개 확정 문자열
 * ──────────────────────────────────────────────────────────── */

test("C4 §3.1 부제 — disconnected_timeout은 '재접속 유예 종료'다 (시안)", () => {
  const label = getGroupResultLabel({
    resultStatus: "retired",
    retireReason: "disconnected_timeout",
  });

  assert.equal(label.subtitle, "재접속 유예 종료");
  assert.equal(GROUP_RETIRE_SUBTITLES.disconnected_timeout, "재접속 유예 종료");
});

test("C4 §3.1 부제 — grace_timeout은 '유예 시간 초과'다 (코드 채택)", () => {
  const label = getGroupResultLabel({
    resultStatus: "retired",
    retireReason: "grace_timeout",
  });

  assert.equal(label.subtitle, "유예 시간 초과");
  assert.notEqual(label.subtitle, "유예 시간 종료");
});

test("C4 §3.1 부제 — time_limit은 '제한 시간 초과'다 (코드 채택)", () => {
  const label = getGroupResultLabel({
    resultStatus: "retired",
    retireReason: "time_limit",
  });

  assert.equal(label.subtitle, "제한 시간 초과");
  assert.notEqual(label.subtitle, "제한 시간 종료");
});

test("C4 §3.1.1 — 몰수 부제는 '연결 끊김'이 아니다", () => {
  const label = getGroupResultLabel({
    resultStatus: "retired",
    retireReason: "disconnected_timeout",
  });

  assert.notEqual(label.subtitle, "연결 끊김");
  assert.notEqual(label.term, "연결 끊김");
});

test("C4 §3.1.1 — 이 모듈 소스에 '연결 끊김' 문자열이 없다", async () => {
  const source = await readFile(
    path.join(projectRoot, "utils/resultReasonLabels.js"),
    "utf8"
  );

  assert.doesNotMatch(source, /연결 끊김/);
});

/* ────────────────────────────────────────────────────────────
 * C4 §3.2 — 1:1 5경우
 * ──────────────────────────────────────────────────────────── */

test("C4 §3.2 1:1 — normal_finish + winner는 승리이고 duel_win_normal이다", () => {
  const label = getDuelResultLabel({
    finishedReason: "normal_finish",
    isWinner: true,
  });

  assert.equal(label.term, "승리");
  assert.equal(label.xpSourceType, "duel_win_normal");
});

test("C4 §3.2 1:1 — normal_finish + 패자는 패배이고 duel_loss_normal이다", () => {
  const label = getDuelResultLabel({
    finishedReason: "normal_finish",
    isWinner: false,
  });

  assert.equal(label.term, "패배");
  assert.equal(label.xpSourceType, "duel_loss_normal");
});

test("C4 §3.2 1:1 — forfeit + winner는 몰수승이고 duel_win_forfeit이다", () => {
  const label = getDuelResultLabel({ finishedReason: "forfeit", isWinner: true });

  assert.equal(label.term, "승리 · 상대 기권/이탈");
  assert.equal(label.xpSourceType, "duel_win_forfeit");
});

test("C4 §3.2 1:1 — forfeit + 패자는 기권패이고 duel_loss_forfeit이다", () => {
  const label = getDuelResultLabel({ finishedReason: "forfeit", isWinner: false });

  assert.equal(label.term, "패배 · 기권");
  assert.equal(label.xpSourceType, "duel_loss_forfeit");
});

test("C4 §3.2 1:1 — cancelled는 승패와 무관하게 무효이고 XP 지급이 없다", () => {
  for (const isWinner of [true, false]) {
    const label = getDuelResultLabel({ finishedReason: "cancelled", isWinner });

    assert.equal(label.term, "무효");
    assert.equal(label.xpSourceType, null);
  }
});

/* ────────────────────────────────────────────────────────────
 * C4 §3.3 — 싱글 3경우
 * ──────────────────────────────────────────────────────────── */

test("C4 §3.3 싱글 — completed는 완주다", () => {
  assert.equal(getSingleResultLabel("completed").term, "완주");
});

test("C4 §3.3 싱글 — abandoned는 포기다", () => {
  assert.equal(getSingleResultLabel("abandoned").term, "포기");
});

test("C4 §3.3 싱글 — expired는 만료다", () => {
  assert.equal(getSingleResultLabel("expired").term, "만료");
});

/* ────────────────────────────────────────────────────────────
 * 저장 어휘 키 불변 (TRACKS.md §2.3-⑥) · 계약 밖 조합
 * ──────────────────────────────────────────────────────────── */

test("TRACKS §2.3-⑥ — 저장 어휘 키를 5값·2값·3값 그대로 유지한다", () => {
  assert.deepEqual(GROUP_RESULT_STATUSES, ["finished", "retired"]);
  assert.deepEqual(GROUP_RETIRE_REASONS, [
    "left",
    "forfeited",
    "time_limit",
    "grace_timeout",
    "disconnected_timeout",
  ]);
  assert.deepEqual(DUEL_FINISHED_REASONS, [
    "normal_finish",
    "forfeit",
    "cancelled",
  ]);
  assert.deepEqual(SINGLE_RESULT_STATUSES, ["completed", "abandoned", "expired"]);
});

test("계약이 규정하지 않은 조합에는 표시 문자열을 발명하지 않는다", () => {
  assert.equal(getGroupResultLabel(), null);
  assert.equal(getGroupResultLabel({ resultStatus: "retired" }), null);
  assert.equal(
    getGroupResultLabel({ resultStatus: "retired", retireReason: "cancelled" }),
    null
  );
  assert.equal(getDuelResultLabel(), null);
  assert.equal(getDuelResultLabel({ finishedReason: "all_resolved" }), null);
  assert.equal(getSingleResultLabel("active"), null);
  assert.equal(getSingleResultLabel(undefined), null);
});

test("반환 표는 동결이라 소비자가 변형할 수 없다", () => {
  assert.equal(Object.isFrozen(GROUP_RETIRE_SUBTITLES), true);
  assert.equal(Object.isFrozen(GROUP_RESULT_TERMS), true);
  assert.equal(
    Object.isFrozen(getDuelResultLabel({ finishedReason: "cancelled" })),
    true
  );
});
