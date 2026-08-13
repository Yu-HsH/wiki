import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createTargetSummaryState,
  getTargetSummaryText,
  resolveGroupTargetTitle,
  TARGET_SUMMARY_STATUS,
} from "../utils/groupTargetSummary.js";

test("그룹 요약은 참가자 후보보다 서버 방의 확정 목표를 우선한다", () => {
  const players = [
    {
      user_id: "user-1",
      submitted_target_title: "일본",
      target_title: "일본",
    },
    {
      user_id: "user-2",
      submitted_target_title: "대한민국",
      target_title: "대한민국",
    },
  ];

  assert.equal(
    resolveGroupTargetTitle(
      { group_target_title: "세종대왕" },
      players
    ),
    "세종대왕"
  );
});

test("방 목표가 없을 때 서로 다른 임시 제출 목표는 요약 조회에 사용하지 않는다", () => {
  const players = [
    { target_title: "일본", submitted_target_title: "일본" },
    { target_title: "대한민국", submitted_target_title: "대한민국" },
  ];

  assert.equal(resolveGroupTargetTitle({}, players), "");
});

test("방 목표가 없는 이전 데이터는 참가자의 검증된 공통 target_title만 복원한다", () => {
  const players = [
    { target_title: "대한민국", submitted_target_title: "일본" },
    { target_title: "대한민국", submitted_target_title: "세종대왕" },
  ];

  assert.equal(resolveGroupTargetTitle({}, players), "대한민국");
});

test("요약 본문을 우선하고 없으면 짧은 description을 사용한다", () => {
  assert.equal(
    getTargetSummaryText({ extract: "실제 본문 요약", description: "짧은 설명" }),
    "실제 본문 요약"
  );
  assert.equal(
    getTargetSummaryText({ extract: "", description: "짧은 설명" }),
    "짧은 설명"
  );
  assert.equal(getTargetSummaryText({}), "");
});

test("요약 상태는 idle에서 시작하고 빈 응답을 empty로 표현할 수 있다", () => {
  assert.deepEqual(createTargetSummaryState(), {
    status: TARGET_SUMMARY_STATUS.IDLE,
    requestedTitle: "",
    canonicalTitle: "",
    text: "",
    error: "",
  });
  assert.equal(
    createTargetSummaryState({ status: TARGET_SUMMARY_STATUS.EMPTY }).status,
    "empty"
  );
});

test("긴 설명은 실제 3줄 overflow일 때만 더보기와 접기를 제공한다", async () => {
  const viewerSource = await readFile(
    new URL("../components/WikiViewer.jsx", import.meta.url),
    "utf8"
  );
  const cssSource = await readFile(
    new URL("../css/app.css", import.meta.url),
    "utf8"
  );

  assert.match(viewerSource, /scrollHeight > element\.clientHeight/);
  assert.match(viewerSource, /target-summary--collapsed/);
  assert.match(viewerSource, /"더보기"/);
  assert.match(viewerSource, /"접기"/);
  assert.match(cssSource, /-webkit-line-clamp:\s*3/);
});

test("그룹 화면은 요약 실패를 게임 fatalError와 분리하고 재시도를 제공한다", async () => {
  const pageSource = await readFile(
    new URL("../pages/GroupGamePage.jsx", import.meta.url),
    "utf8"
  );
  const viewerSource = await readFile(
    new URL("../components/WikiViewer.jsx", import.meta.url),
    "utf8"
  );
  const summaryEffectStart = pageSource.indexOf("fetchPageSummary(title");
  const summaryEffectEnd = pageSource.indexOf(
    "targetSummaryRequestRef.current?.cancel()",
    summaryEffectStart
  );
  const summaryEffectSource = pageSource.slice(
    summaryEffectStart,
    summaryEffectEnd
  );

  assert.match(pageSource, /fetchPageSummary\(title, \{ signal: request\.signal \}\)/);
  assert.match(pageSource, /TARGET_SUMMARY_STATUS\.ERROR/);
  assert.match(pageSource, /isAbortError\(error\)/);
  assert.match(pageSource, /manager\.isCurrent\(request\.id\)/);
  assert.doesNotMatch(summaryEffectSource, /setPhase\(/);
  assert.match(viewerSource, /다시 시도/);
});
