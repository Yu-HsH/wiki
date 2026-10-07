import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getOnlineAccess } from "../utils/appRoutes.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("온라인 접근: 로딩·미로그인·로컬 게스트·로그인 사용자", () => {
  assert.equal(getOnlineAccess({ loading: true, user: null }), "loading");
  assert.equal(getOnlineAccess({ loading: false, user: null }), "login");
  assert.equal(getOnlineAccess({ loading: false, user: { id: "g", isGuest: true } }), "guest");
  assert.equal(getOnlineAccess({ loading: false, user: { id: "u" } }), "allowed");
});

test("온라인 입장·대기실·경기 다섯 경로는 OnlineRoute로 감싼다", () => {
  const app = read("App.jsx");
  for (const page of ["MultiplayerPage", "RoomPage", "GroupRoomPage", "MultiplayerGamePage", "GroupGamePage"]) {
    assert.match(app, new RegExp(`<OnlineRoute>\\s*<${page} />\\s*</OnlineRoute>`), page);
  }
  assert.match(app, /if \(access === "guest"\) return <Navigate to="\/play" replace \/>;/);
});

test("1:1 안내 문구는 방장 공통 목표·READY 없음 계약을 따른다", () => {
  const page = read("pages/MultiplayerPage.jsx");
  assert.doesNotMatch(page, /서로 다른 목표 문서를 가지고|상대가 설정한 목표/);
  assert.match(page, /방장이 대기실에서 두 사람이 함께 쓸 목표 문서 하나를 고릅니다/);
  assert.match(page, /READY 단계는 없습니다/);
});

test("대기실 헤더 이동은 기존 leave RPC를 먼저 부른다", () => {
  const duel = read("pages/RoomPage.jsx");
  const group = read("pages/GroupRoomPage.jsx");
  assert.match(duel, /const handleNavigateAway = async \(to\) => \{[\s\S]*?await leaveRoom\(roomId, user\.id\);[\s\S]*?navigate\(to\);/);
  assert.match(group, /const handleNavigateAway = async \(to\) => \{[\s\S]*?await leaveGroupRoom\(roomId\);[\s\S]*?navigate\(to\);/);
  for (const source of [duel, group]) {
    assert.equal((source.match(/onNavigate=\{handleNavigateAway\}/g) || []).length, 2, "loading/error + main lobby");
    // 로딩 중 클릭: 진행 중인 초기 join이 끝난 뒤, 다시 읽은 방 상태가 waiting일 때만 leave한다.
    assert.match(source, /initialLoadRef\.current = loadRoom\(\);/);
    assert.match(source, /const isStillWaiting = async \(\) => \{[\s\S]*?await initialLoadRef\.current;[\s\S]*?return current\?\.status === "waiting";/);
    assert.equal((source.match(/if \(await isStillWaiting\(\)\) await leave/g) || []).length, 2, "navigation + logout");
    // 로딩/오류 화면의 "← 온라인 플레이로"도 같은 이동 정리 경로를 쓴다 (별도 leave 구현 없음).
    const stateScreen = source.slice(source.indexOf("<LobbyStateScreen"), source.indexOf("/>", source.indexOf("<LobbyStateScreen")));
    assert.match(stateScreen, /onLeave=\{\(\) => handleNavigateAway\("\/multiplayer"\)\}/);
  }
});
