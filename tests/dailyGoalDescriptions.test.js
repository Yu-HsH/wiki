import test from "node:test";
import assert from "node:assert/strict";
import { DAILY_GOAL_DESCRIPTIONS, resolveDailyGoalHint } from "../data/dailyGoalDescriptions.js";

const activeTargetsAsOfNov6 = [
  "벤치 프레스", "고래상어", "GPT (언어 모델)", "교황 프란치스코", "SQL",
  "백준 온라인 저지", "생맥주", "레드벨벳 (아이돌)", "메이플스토리", "라면",
  "카카오톡", "화성", "한강", "월드 와이드 웹", "김치", "훈민정음", "광합성",
];

test("all 17 active target titles have a non-generic goal description", () => {
  assert.deepEqual(Object.keys(DAILY_GOAL_DESCRIPTIONS).sort(), activeTargetsAsOfNov6.sort());
  for (const title of activeTargetsAsOfNov6) {
    const description = resolveDailyGoalHint(title, "오늘의 단어에서 만든 탐험 코스");
    assert.ok(description.length >= 28, "missing/short description: " + title);
    assert.ok(description.includes("분야"), "missing broad field clue: " + title);
  }
});

test("already selected course's generic hint is improved without changing its title", () => {
  assert.match(resolveDailyGoalHint("SQL", "오늘의 단어에서 만든 탐험 코스"), /데이터베이스/);
  assert.match(resolveDailyGoalHint("김치", "실제 위키 링크로 연결된 오늘의 공통 코스"), /음식/);
});

test("specific server hint wins over local descriptions", () => {
  const hint = "특별 이벤트를 위한 직접 작성된 설명";
  assert.equal(resolveDailyGoalHint("SQL", hint), hint);
});

test("unknown targets do not receive an invented explanation", () => {
  assert.equal(resolveDailyGoalHint("미등록 문서", "별도 안내"), "별도 안내");
  assert.equal(resolveDailyGoalHint("미등록 문서", ""), "목표 문서와 관련된 분야를 탐험해 보세요.");
});

test("non-string arguments cannot crash the daily home page", () => {
  assert.equal(resolveDailyGoalHint(null, null), "목표 문서와 관련된 분야를 탐험해 보세요.");
});
