import test from "node:test";
import assert from "node:assert/strict";
import {
  PARTICIPANT_STATE,
  classifyGroupParticipant,
  countGroupParticipants,
  getGroupDeadlineView,
  getGroupGraceCopy,
  getWatchView,
  isReactionFresh,
  orderGroupParticipants,
} from "../utils/groupRacePresentation.js";

const START = Date.parse("2026-10-07T00:00:00Z");
const at = (mmss) => { const [m, s] = mmss.split(":").map(Number); return START + (m * 60 + s) * 1000; };
const iso = (ms) => new Date(ms).toISOString();
const HARD = at("20:00");

test("상태 분류 — 일시 끊김은 리타이어가 아니다", () => {
  assert.equal(classifyGroupParticipant({ player_status: "playing" }), PARTICIPANT_STATE.RACING);
  assert.equal(classifyGroupParticipant({ player_status: "disconnected" }), PARTICIPANT_STATE.DISCONNECTED);
  assert.equal(classifyGroupParticipant({ player_status: "retired", retired_at: iso(at("20:00")) }), PARTICIPANT_STATE.RETIRED);
  assert.equal(classifyGroupParticipant({ player_status: "finished", rank: 2 }), PARTICIPANT_STATE.FINISHED);
});

test("순서 — 완주(순위) → 진행/끊김(참가 순서, 추정 순위 없음) → 리타이어", () => {
  const players = [
    { user_id: "a", player_status: "playing" },
    { user_id: "b", player_status: "finished", rank: 2 },
    { user_id: "c", player_status: "retired" },
    { user_id: "d", player_status: "disconnected" },
    { user_id: "e", player_status: "finished", rank: 1 },
  ];
  assert.deepEqual(orderGroupParticipants(players).map((e) => e.player.user_id), ["e", "b", "a", "d", "c"]);
  assert.deepEqual(countGroupParticipants(players), { finished: 2, active: 2, retired: 1, total: 5 });
});

test("마감 — 일반 진행은 20분 제한까지 남은 시간", () => {
  const room = { status: "playing", game_deadline_at: iso(HARD) };
  const view = getGroupDeadlineView(room, at("05:28"));
  assert.equal(view.label, "남은 시간");
  assert.equal(view.seconds, 14 * 60 + 32);
  assert.equal(getGroupGraceCopy(view), null);
});

test("마감 — 3위 13:18 완주 → 15:18 종료, 13:36에 '마감까지 01:42' (새 2:00 아님)", () => {
  const room = { status: "grace_period", game_deadline_at: iso(HARD), grace_ends_at: iso(at("15:18")) };
  const view = getGroupDeadlineView(room, at("13:36"));
  assert.equal(view.label, "마감까지");
  assert.equal(view.seconds, 102);
  assert.equal(view.capped, false);
  assert.match(getGroupGraceCopy(view), /남은 참가자는 이 시간 안에/);
});

test("마감 — 3위 19:30 완주 → 20:00 제한이 이긴다, 19:34에 00:26", () => {
  const room = { status: "grace_period", game_deadline_at: iso(HARD), grace_ends_at: iso(at("21:30")) };
  const view = getGroupDeadlineView(room, at("19:34"));
  assert.equal(view.label, "마감까지");
  assert.equal(view.seconds, 26);
  assert.equal(view.capped, true);
  assert.match(getGroupGraceCopy(view), /20분 제한까지/);
});

test("마감 — 종료된 방은 '경기 종료' 00:00", () => {
  assert.deepEqual(getGroupDeadlineView({ status: "finished" }), { state: "ended", label: "경기 종료", seconds: 0, grace: false, capped: false });
});

test("관전 대상 — 끊김은 '재연결 중'으로 유지(자동 전환 신호가 아니다)", () => {
  assert.deepEqual(getWatchView({ player_status: "disconnected" }), { state: "disconnected", live: false, label: "재연결 중" });
  assert.equal(getWatchView({ player_status: "playing" }).live, true);
});

test("반응 스탬프는 3초 동안만 새로 보인다", () => {
  assert.equal(isReactionFresh({ createdAt: 1000 }, 3999), true);
  assert.equal(isReactionFresh({ createdAt: 1000 }, 4000), false);
});
