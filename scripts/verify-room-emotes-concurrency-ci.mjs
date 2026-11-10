import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  EXPECTED_CLI_VERSION, TARGET_PROJECT_ID, expectedDbContainer,
  inspectContainer, readProjectId, runCli, runPsql,
} from "./supabase-runtime-common.mjs";

if (process.env.CI !== "true" || process.env.GITHUB_ACTIONS !== "true" ||
    process.env.SUPABASE_DB_CONTAINER || process.env.WIKI_VALIDATION_WORKDIR ||
    readProjectId() !== TARGET_PROJECT_ID) {
  throw Error("REFUSED: disposable GitHub Actions local Supabase only");
}
const pinned = runCli(["--version"]);
assert.equal(pinned.status, 0, "Supabase CLI must be available");
assert.equal(pinned.stdout.trim(), EXPECTED_CLI_VERSION, "Supabase CLI version must be pinned");

const container = expectedDbContainer();
const state = inspectContainer(container);
assert.equal(state.status, 0, "Isolated DB container must exist");
assert.equal(JSON.parse(state.stdout).State?.Health?.Status, "healthy");

const users = [
  "00000000-0000-0000-0056-000000000001",
  "00000000-0000-0000-0056-000000000002",
  "00000000-0000-0000-0056-000000000003",
];
const rooms = [
  "00000000-0000-0000-0056-000000000101",
  "00000000-0000-0000-0056-000000000102",
];

const fixture = `begin;
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('${users[0]}','authenticated','authenticated','emote-race-a@local.test','{}','{}',now(),now()),
 ('${users[1]}','authenticated','authenticated','emote-race-b@local.test','{}','{}',now(),now()),
 ('${users[2]}','authenticated','authenticated','emote-race-c@local.test','{}','{}',now(),now());
insert into public.profiles(id,username,nickname,synthetic_email) values
 ('${users[0]}','emote_ci_race_a','Race A','emote-race-a@local.test'),
 ('${users[1]}','emote_ci_race_b','Race B','emote-race-b@local.test'),
 ('${users[2]}','emote_ci_race_c','Race C','emote-race-c@local.test');
insert into public.game_rooms(id,room_code,host_user_id,status,mode,min_players,max_players,finish_rank_limit,use_items,game_starts_at,game_deadline_at) values
 ('${rooms[0]}','E2C100','${users[0]}','waiting','duel',2,2,3,true,null,null),
 ('${rooms[1]}','E2C200','${users[0]}','playing','group',3,3,3,false,now()-interval '20 seconds',now()+interval '10 minutes');
insert into public.room_players(room_id,user_id,role,nickname_snapshot,player_status,has_finished) values
 ('${rooms[0]}','${users[0]}','host','Race A','waiting',false),
 ('${rooms[0]}','${users[1]}','guest','Race B','waiting',false),
 ('${rooms[1]}','${users[0]}','host','Race A','playing',false),
 ('${rooms[1]}','${users[1]}','guest','Race B','playing',false),
 ('${rooms[1]}','${users[2]}','guest','Race C','playing',false);
commit;`;
const result = runPsql(container, fixture, { timeout: 120000 });
if (result.status !== 0) {
  throw Error("CONCURRENCY_FIXTURE_FAILED: " + result.stderr.slice(-1200));
}

function concurrentSend(userId, roomId, emoteId) {
  const sql = `begin;
set local role authenticated;
set local request.jwt.claim.sub = '${userId}';
select public.send_room_emote_v1('${roomId}', '${emoteId}')->>'code';
commit;`;
  return new Promise((resolve, reject) => {
    const child = spawn("docker", [
      "exec", "-i", container, "psql", "-X", "-q", "-At",
      "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1",
    ], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    child.stdout.on("data", (data) => { stdout += data.toString(); });
    child.stderr.on("data", (data) => { stderr += data.toString(); });
    child.on("error", reject);
    child.on("close", (status) => {
      if (status !== 0) return reject(Error("CONCURRENCY_RPC_ERROR " + stderr.slice(-700)));
      const code = stdout.trim().split(/\r?\n/).filter((line) =>
        line === "ACCEPTED" || line === "EMOTE_RATE_LIMIT"
      );
      if (code.length !== 1) return reject(Error("INVALID_RPC_RESPONSE " + stdout));
      resolve(code[0]);
    });
    child.stdin.end(sql);
  });
}

for (const [roomId, mode] of [[rooms[0], "duel"], [rooms[1], "group"]]) {
  // No artificial delays: two real concurrent postgres connections from
  // different clients with the SAME authenticated sender.
  const sameUser = await Promise.all([
    concurrentSend(users[0], roomId, "hello"),
    concurrentSend(users[0], roomId, "ready"),
  ]);
  assert.deepEqual(sameUser.sort(), ["ACCEPTED", "EMOTE_RATE_LIMIT"].sort(), mode + " double-send");
  const otherUsers = mode === "duel" ? [users[1]] : [users[1], users[2]];
  const others = await Promise.all(otherUsers.map((id) =>
    concurrentSend(id, roomId, "gg")
  ));
  assert.deepEqual(others, Array(otherUsers.length).fill("ACCEPTED"), mode + " independent senders");
  const eventCount = runPsql(container,
    `select count(*) from public.room_events where room_id='${roomId}' and event_type='room_emote';`);
  assert.equal(eventCount.status, 0);
  const eventRows = eventCount.stdout.trim().split(/\s+/).filter(Boolean);
  assert.equal(Number(eventRows.at(-1)), 1 + otherUsers.length,
    mode + " event count must equal accepted sends only");
  console.log("PASS " + mode + " concurrent same-user/other-user atomic cooldown");
}
console.log("ROOM_EMOTES_CONCURRENT_LOCAL_PASS");
