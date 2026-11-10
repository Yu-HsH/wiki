// Disposable CI-only Realtime E2E, no Production credentials or network hosts.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import {
  EXPECTED_CLI_VERSION, TARGET_PROJECT_ID, expectedDbContainer, inspectContainer,
  readProjectId, repoRoot, runCli, runPsql,
} from "./supabase-runtime-common.mjs";

if (process.env.CI !== "true" || process.env.GITHUB_ACTIONS !== "true" ||
    process.env.WIKI_VALIDATION_WORKDIR || process.env.SUPABASE_DB_CONTAINER ||
    readProjectId() !== TARGET_PROJECT_ID) {
  throw Error("REFUSED: Kion E2E requires isolated GitHub Actions Supabase");
}
const cli = runCli(["--version"]);
assert.equal(cli.status, 0);
assert.equal(cli.stdout.trim(), EXPECTED_CLI_VERSION);
const container = expectedDbContainer();
const checked = inspectContainer(container);
assert.equal(checked.status, 0);
assert.equal(JSON.parse(checked.stdout).State?.Health?.Status, "healthy");

const envResult = runCli(["--workdir", repoRoot, "status", "-o", "env"]);
assert.equal(envResult.status, 0);
const status = Object.fromEntries(envResult.stdout.split(/\r?\n/).flatMap((line) => {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  return match ? [[match[1], match[2].replace(/^['"]|['"]$/g, "")]] : [];
}));
assert.equal(status.API_URL, "http://127.0.0.1:54321", "never connect to production");
const anonKey = status.ANON_KEY || status.PUBLISHABLE_KEY;
const adminKey = status.SERVICE_ROLE_KEY;
assert.ok(anonKey && adminKey, "Local credentials are required");
const admin = createClient(status.API_URL, adminKey, {
  auth: { persistSession:false, autoRefreshToken:false },
});

const q = (value) => "'" + String(value).replaceAll("'", "''") + "'";
const id = randomUUID().replaceAll("-", "").slice(0, 10);
function sql(query) {
  const r = runPsql(container, query, {timeout: 120000});
  if (r.status !== 0) throw Error("LOCAL SQL FAILED: " + r.stderr.slice(-850));
  return r.stdout.trim();
}
function pause(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
async function until(message, condition, milliseconds = 22000) {
  const deadline = Date.now() + milliseconds;
  while (Date.now() < deadline) {
    if (condition()) return;
    await pause(75);
  }
  throw Error("TIMEOUT: " + message);
}

const people = [];
const channels = [];
async function account(index) {
  const alias = "kion_rt_" + id + "_" + index;
  const email = alias + "@local.test";
  const password = "KionLocal-" + id + "-" + index + "!9";
  const created = await admin.auth.admin.createUser({
    email, password, email_confirm:true,
    user_metadata:{username:alias, nickname:"Kion E2E " + index},
  });
  assert.ok(!created.error && created.data?.user?.id, "Local account creation");
  const userId = created.data.user.id;
  sql("insert into public.profiles(id,username,nickname,synthetic_email) values (" +
    [userId,alias,"Kion E2E " + index,email].map(q).join(",") +
    ") on conflict (id) do nothing;");
  const client = createClient(status.API_URL, anonKey, {
    auth:{ persistSession:false, autoRefreshToken:false },
  });
  const login = await client.auth.signInWithPassword({email,password});
  assert.ok(!login.error && login.data?.session, "Isolated email/password login");
  await client.realtime.setAuth(login.data.session.access_token);
  const user = {userId, alias, client};
  people.push(user);
  return user;
}

function addRoom(mode) {
  const roomId = randomUUID();
  const group = mode === "group";
  const roomCode = "E" + (group ? "G" : "D") + id.slice(0, 6).toUpperCase();
  sql("insert into public.game_rooms(" +
      "id,room_code,host_user_id,status,mode,min_players,max_players,finish_rank_limit,use_items,game_starts_at,game_deadline_at" +
      ") values (" +
      [q(roomId),q(roomCode),q(people[0].userId),q(group?"playing":"waiting"),q(mode),
       group?3:2,group?3:2,3,group?"false":"true",
       group?"now()-interval '20 seconds'":"null",
       group?"now()+interval '10 minutes'":"null"].join(",") + ");");
  sql("insert into public.room_players(room_id,user_id,role,nickname_snapshot,player_status,has_finished) values " +
    people.slice(0,group?3:2).map((person,i) => "(" +
      [roomId,person.userId,i===0?"host":"guest","Kion E2E "+(i+1),group?"playing":"waiting"].map(q).join(",") +
      ",false)").join(",") + ";");
  return roomId;
}

async function subscribe(user, roomId, label) {
  const received = [];
  const channel = user.client
    .channel("kion-emotes-e2e-" + label + "-" + id)
    .on("postgres_changes", {
      event:"INSERT", schema:"public", table:"room_events", filter:"room_id=eq." + roomId,
    }, (change) => {
      if(change.new?.room_id === roomId && change.new?.event_type === "room_emote") {
        received.push(change.new);
      }
    });
  channels.push({client:user.client,channel});
  await new Promise((resolve,reject) => {
    const timer = setTimeout(() => reject(Error("Realtime SUBSCRIBED timeout " + label)), 15000);
    channel.subscribe((connection) => {
      if(connection === "SUBSCRIBED") { clearTimeout(timer); resolve(); }
      else if (connection === "CHANNEL_ERROR" || connection === "TIMED_OUT") {
        clearTimeout(timer); reject(Error("Realtime " + connection + " " + label));
      }
    });
  });
  return received;
}

async function send(user,roomId,emoteId) {
  const result = await user.client.rpc("send_room_emote_v1", {
    p_room_id:roomId, p_emote_id:emoteId,
  });
  if (result.error) throw Error("Local RPC " + result.error.message);
  return result.data;
}

async function verifyRoom(mode, roomId) {
  const group = mode === "group";
  const listeners = await Promise.all(
    people.slice(0,group?3:2).map((user,i) => subscribe(user,roomId,mode+"-"+i))
  );
  const first = await send(people[0],roomId,"hello");
  assert.equal(first?.code,"ACCEPTED",mode+" authenticated host can send");
  const bRead = await people[1].client.from("room_events").select("id,user_id,event_type")
    .eq("room_id",roomId).eq("id",first.event_id);
  assert.ok(!bRead.error && bRead.data?.length === 1,
    mode+" participant B must be able to SELECT the event through RLS");
  console.log("PASS "+mode+" member event SELECT with real JWT");
  try {
    await until(mode+" participant B receives A", () =>
      listeners[1].some(event=>event.id===first.event_id)
    );
  } catch(error) {
    throw Error(error.message+"; select=1; received="+listeners[1].length);
  }
  const repeated = await send(people[0],roomId,"go");
  assert.equal(repeated?.code,"EMOTE_RATE_LIMIT",mode+" cooldown blocks repeat");
  const second = await send(people[1],roomId,"ready");
  assert.equal(second?.code,"ACCEPTED",mode+" participant B independently sends");
  await until(mode+" participant A receives B", () =>
    listeners[0].some(event=>event.id===second.event_id)
  );
  let expected = 2;
  if (group) {
    const third = await send(people[2],roomId,"gg");
    assert.equal(third?.code,"ACCEPTED");
    await until(mode+" participants A and B receive C", () =>
      listeners[0].some(e=>e.id===third.event_id) &&
      listeners[1].some(e=>e.id===third.event_id));
    expected = 3;
  } else {
    const outsider = await send(people[2],roomId,"gg");
    assert.equal(outsider?.code,"ROOM_NOT_AVAILABLE");
    const hidden = await people[2].client.from("room_events").select("id")
      .eq("room_id",roomId).eq("event_type","room_emote");
    assert.ok(!hidden.error);
    assert.deepEqual(hidden.data,[],"Outsider cannot read member reactions");
  }
  const count = Number(sql("select count(*) from public.room_events where room_id=" +
    q(roomId) + " and event_type='room_emote';"));
  assert.equal(count,expected,mode+" exactly one row per accepted send");
  console.log("PASS " + mode + " 2/3 real account RPC and Realtime deliveries");
}

try {
  // Stable account slots: A=host, B=first guest, C=second guest/duel outsider.
  for (const index of [1, 2, 3]) await account(index);
  const published = Number(sql("select count(*) from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='room_events';"));
  assert.equal(published,1,"room_events must be in Realtime publication");
  const duel = addRoom("duel");
  const group = addRoom("group");
  await verifyRoom("duel",duel);
  await verifyRoom("group",group);
  console.log("KION_ROOM_EMOTES_REALTIME_LOCAL_PASS");
} finally {
  await Promise.all(channels.map(({client,channel}) => client.removeChannel(channel).catch(()=>{})));
  for (const person of people) {
    await person.client.auth.signOut().catch(()=>{});
  }
}
