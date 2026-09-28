import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * 2026-09-28 운영 스모크 회귀 2건의 hotfix를 소스 수준에서 고정한다.
 *
 * JSX는 `node --test`가 import하지 못하므로 `tests/duelItemAuthority.test.js`와 같은
 * 방식으로 소스를 읽어 계약을 검사한다.
 *
 * ① 1:1 완주 후 결과 화면 대신 "게임을 계속할 수 없습니다"가 양쪽에 떴다.
 *    `apply_duel_move_v2`가 완주와 방 종료를 한 트랜잭션에서 쓰므로 `game_rooms`
 *    realtime이 완주와 동시에 오고, 핸들러가 그것을 복구로 보냈고, 복구는 끝난 방을
 *    fatal로 그렸다. 그 경로는 2026-07-26(`9829894`)부터 있었다 — 트랙 C 회귀가 아니다.
 * ② 역사 되감기에서 상대 화면이 이전 문서로 가지 않았다. target이 시전자 자신이라
 *    target만 보는 수신 경로가 상대의 이동을 놓쳤다.
 */
const root = fileURLToPath(new URL("..", import.meta.url));
const read = (relativePath) => readFileSync(`${root}/${relativePath}`, "utf8");

const PAGE_PATH = process.env.DUEL_RESULT_HOTFIX_PAGE || "pages/MultiplayerGamePage.jsx";
const pageSource = read(PAGE_PATH);

const sliceBetween = (source, start, end) => {
  const from = source.indexOf(start);
  assert.ok(from >= 0, `시작 표지를 찾지 못했다: ${start}`);
  const to = source.indexOf(end, from + start.length);
  assert.ok(to > from, `끝 표지를 찾지 못했다: ${end}`);
  return source.slice(from, to);
};

test("① 전제 — 서버는 완주와 방 종료를 한 트랜잭션에서 쓴다", () => {
  const duel = read("supabase/migrations/20260814092000_duel_authority_v2.sql");
  const finishBlock = sliceBetween(duel, "if v_finished then", "end if;");
  assert.match(finishBlock, /status = 'finished'/);
  assert.match(finishBlock, /finished_reason = 'normal_finish'/);
  assert.match(finishBlock, /winner_user_id = v_user_id/);
});

test("① 방 종료 신호는 복구가 아니라 결과 판정으로 간다 (realtime·타임아웃 확정 둘 다)", () => {
  const realtime = sliceBetween(pageSource, 'table: "game_rooms"', 'table: "room_players"');
  assert.match(realtime, /handleRoomFinishedRef\.current\?\.\(latestRoom\)/);
  assert.doesNotMatch(
    realtime.slice(realtime.indexOf("const latestRoom"), realtime.indexOf("} catch")),
    /recoverGameRef/,
    "finished를 받은 직후 복구를 부르면 복구가 결과 화면을 fatal로 덮는다"
  );

  const finalizer = sliceBetween(pageSource, "finalizeDuelIfExpired(roomId)", "} catch");
  assert.match(finalizer, /handleRoomFinishedRef\.current\?\.\(latestRoom\)/);
  assert.doesNotMatch(finalizer, /recoverGameRef/);
});

test("① 결과 판정은 서버가 확정한 승자를 읽고, 정상 완주가 아니면 예전 경로로 간다", () => {
  const handler = sliceBetween(pageSource, "const handleRoomFinished = (", "handleRoomFinishedRef.current = handleRoomFinished");
  assert.match(handler, /finished_reason === "normal_finish"/);
  assert.match(handler, /winner_user_id/);
  assert.match(handler, /enterSolvedState\(\)/);
  assert.match(handler, /enterOpponentWinState\(\)/);
  // 복구 안에서 불렸으면 다시 복구를 부르지 않는다 — 무한 왕복을 막는다.
  assert.match(handler, /if \(!fromRecovery\) recoverGameRef\.current\?\.\(\)/);
});

test("① 결과 화면은 한 번만 성립하고, 복구 패널을 확실히 걷어 낸다", () => {
  const settle = sliceBetween(pageSource, "const settleIntoResult = (", "const enterSolvedState");
  assert.match(settle, /if \(resultShownRef\.current\) return false;/);
  assert.match(settle, /recoveryGenerationRef\.current \+= 1/, "진행 중인 복구를 무효화한다");
  assert.match(settle, /setRecovery\(null\)/);
  assert.match(settle, /setPending\(false\)/, "무효화된 복구는 자기 finally에서 pending을 끄지 않는다");

  for (const name of ["const enterSolvedState = () => {", "function enterOpponentWinState() {"]) {
    const body = sliceBetween(pageSource, name, "}, 2200);");
    assert.match(body, /if \(!settleIntoResult\(PHASE\.(SUCCESS|OPPONENT_WIN)\)\) return;/, name);
  }
});

test("① 결과가 뜬 뒤의 복구·연결 신호는 결과 화면을 덮지 못한다 (alt-tab 포함)", () => {
  const recover = sliceBetween(pageSource, "const recoverGame = useCallback(async () => {", "const generation =");
  assert.match(recover, /if \(resultShownRef\.current\) return;/);

  const subscribeGuards = pageSource.match(
    /channel\.subscribe\(\(status, error\) => \{\n\s+if \((?:game|event)ChannelRef\.current !== channel\) return;\n\s+if \(resultShownRef\.current\) return;/g
  ) || [];
  assert.equal(subscribeGuards.length, 2, "두 채널의 상태 콜백 모두");
});

test("① 경기 중에 끝난 방은 복구에서도 결과로 간다 — 끝난 방에 새로 들어온 경우만 fatal", () => {
  const finishedBranch = sliceBetween(pageSource, 'if (session.outcome === "finished") {\n', 'mode: "fatal"');
  assert.match(
    finishedBranch,
    /reachedPlayingRef\.current && handleRoomFinishedRef\.current\?\.\(session\.room, \{ fromRecovery: true \}\)/
  );

  const opponentWin = sliceBetween(pageSource, "if (!opponentPlayer?.has_finished) return;", "enterOpponentWinState();");
  assert.match(opponentWin, /if \(!reachedPlayingRef\.current\) return;/);
});

test("② 전제 — 역사 되감기의 target은 시전자이고, 옮겨진 사람은 rewoundUserIds에 있다", () => {
  const migration = read("supabase/migrations/20260904090000_duel_item_authority_v3.sql");
  const branch = sliceBetween(migration, "elsif v_grant.item_id = 'history_rewind' then", "else");
  assert.match(branch, /v_target_user_id := v_user_id;/);
  assert.match(migration, /jsonb_build_object\('rewoundUserIds', to_jsonb\(v_rewound\)\)/);
});

test("② 수신 경로는 rewoundUserIds에 내가 있으면 서버 이동을 다시 읽는다", () => {
  const handler = sliceBetween(pageSource, "const handleDuelItemEvent = async (payload) => {", "const handleIncomingEvent");
  assert.match(handler, /incoming\.metadata\?\.rewoundUserIds/);
  assert.match(handler, /rewoundUserIds\.includes\(user\.id\)/);
  assert.match(
    handler,
    /if \(\(incoming\.moveEventId && iAmTarget\) \|\| iWasRewound\) \{\n\s+await resyncFromServerMove\(\);/
  );
});
