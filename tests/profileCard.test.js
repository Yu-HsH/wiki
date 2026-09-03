import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  AVATAR_STAGE,
  AVATAR_SIZES,
  DENSITY,
  MAX_BADGES,
  NAME_FALLBACK,
  avatarAltText,
  avatarSizePx,
  buildProfileCard,
  densityShows,
  initialOf,
  orderedBadges,
  resolveAvatarStage,
  resolveDisplayName,
} from "../utils/profileCard.js";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));

function readProjectFile(relativePath) {
  return readFile(path.join(projectRoot, relativePath), "utf8");
}

/** C5 §4가 적용을 요구하고 트랙 A가 이 웨이브에서 닫는 지점의 파일들. */
const APPLIED_POINT_FILES = [
  "pages/ProfilePage.jsx",
  "pages/RankingPage.jsx",
  "components/UserProfileModal.jsx",
  "pages/GroupRoomPage.jsx",
];

/* ────────────────────────────────────────────────────────────────
 * ① 이미지 우선순위 4단계 — C5 §3.1
 * ──────────────────────────────────────────────────────────────── */

test("① 이미지 우선순위 4단계가 순서대로 적용된다", () => {
  const full = buildProfileCard({
    nickname: "탐험자",
    icon: { rewardId: "icon_1", displayName: "기본 아이콘", assetRef: "https://cdn/icon.png" },
    legacyImageUrl: "https://cdn/legacy.png",
  });

  // 1단계 — icon.assetRef가 있으면 나머지를 이긴다
  assert.deepEqual(resolveAvatarStage(full), {
    stage: AVATAR_STAGE.ICON,
    src: "https://cdn/icon.png",
    initial: null,
  });

  // 2단계 — 아이콘이 없으면 legacyImageUrl
  const legacyOnly = buildProfileCard({
    nickname: "탐험자",
    legacyImageUrl: "https://cdn/legacy.png",
  });
  assert.deepEqual(resolveAvatarStage(legacyOnly), {
    stage: AVATAR_STAGE.LEGACY,
    src: "https://cdn/legacy.png",
    initial: null,
  });

  // 3단계 — 이미지가 둘 다 없으면 닉네임 첫 글자 대문자
  const nameOnly = buildProfileCard({ nickname: "explorer" });
  assert.deepEqual(resolveAvatarStage(nameOnly), {
    stage: AVATAR_STAGE.INITIAL,
    src: null,
    initial: "E",
  });

  // 4단계 — 닉네임도 없으면 시스템 기본 이미지
  const empty = buildProfileCard({});
  assert.deepEqual(resolveAvatarStage(empty), {
    stage: AVATAR_STAGE.DEFAULT,
    src: null,
    initial: null,
  });
});

test("① legacy 값은 지우지 않고 계속 읽는다 — 아이콘이 생겨도 카드에 남는다", () => {
  const card = buildProfileCard({
    nickname: "탐험자",
    icon: { rewardId: "icon_1", displayName: "기본", assetRef: "https://cdn/icon.png" },
    legacyImageUrl: "https://cdn/legacy.png",
  });

  resolveAvatarStage(card);
  assert.equal(card.legacyImageUrl, "https://cdn/legacy.png");
});

/* ────────────────────────────────────────────────────────────────
 * ② 이름 fallback — C5 §3.3
 * ──────────────────────────────────────────────────────────────── */

test("② 이름 fallback은 참가자 행에서 참가자, 그 외에서 탐험가다", () => {
  const anonymous = buildProfileCard({ nickname: null });

  assert.equal(resolveDisplayName(anonymous, NAME_FALLBACK.PARTICIPANT), "참가자");
  assert.equal(resolveDisplayName(anonymous, NAME_FALLBACK.EXPLORER), "탐험가");
  assert.equal(resolveDisplayName(anonymous), "탐험가", "기본값은 탐험가다");

  // 닉네임이 있으면 그대로 쓴다
  assert.equal(resolveDisplayName(buildProfileCard({ nickname: "길잡이" })), "길잡이");

  // 공백뿐인 닉네임은 없는 것으로 본다
  assert.equal(resolveDisplayName(buildProfileCard({ nickname: "   " })), "탐험가");
});

test("② 폐기된 fallback 값이 모듈에서 나오지 않는다", () => {
  const retired = ["-", "Unknown", "U", "?", "이름 없음", "나"];
  const anonymous = buildProfileCard({ nickname: null });

  for (const fallback of Object.values(NAME_FALLBACK)) {
    assert.ok(
      !retired.includes(resolveDisplayName(anonymous, fallback)),
      `폐기된 fallback이 반환됐다: ${fallback}`
    );
  }
});

/* ────────────────────────────────────────────────────────────────
 * ③ alt 규칙 — C5 §3.4
 * ──────────────────────────────────────────────────────────────── */

test("③ alt는 이름 + 의 프로필 이미지 형식이고 빈 문자열이 되지 않는다", () => {
  assert.equal(avatarAltText("길잡이"), "길잡이의 프로필 이미지");
  assert.equal(
    avatarAltText(resolveDisplayName(buildProfileCard({}), NAME_FALLBACK.PARTICIPANT)),
    "참가자의 프로필 이미지"
  );
  assert.equal(avatarAltText(resolveDisplayName(buildProfileCard({}))), "탐험가의 프로필 이미지");

  // 닉네임이 없어도 alt는 비지 않는다
  assert.notEqual(avatarAltText(resolveDisplayName(buildProfileCard({}))).trim(), "");
});

test("③ ProfileAvatar는 모든 단계에서 accessible name을 준다", async () => {
  const source = await readProjectFile("components/ProfileAvatar.jsx");

  assert.match(source, /alt=\{altText\}/, "이미지 단계에 alt가 없다");
  const ariaLabels = source.match(/aria-label=\{altText\}/g) ?? [];
  assert.equal(ariaLabels.length, 2, "이니셜·시스템 기본 단계 둘 다 aria-label을 가져야 한다");
  assert.doesNotMatch(source, /alt=""/);
});

/* ────────────────────────────────────────────────────────────────
 * ④ 에셋 로딩 실패 — C5 §3.2
 * ──────────────────────────────────────────────────────────────── */

test("④ onError는 이니셜 단계로 내려가고 장착 상태 데이터를 바꾸지 않는다", () => {
  const card = buildProfileCard({
    nickname: "길잡이",
    icon: { rewardId: "icon_1", displayName: "기본 아이콘", assetRef: "https://cdn/icon.png" },
    legacyImageUrl: "https://cdn/legacy.png",
    title: { rewardId: "title_1", displayName: "개척자", assetRef: null },
    badges: [{ rewardId: "badge_1", displayName: "첫 완주", assetRef: null, slotIndex: 1 }],
  });
  const before = structuredClone(card);

  // 1단계 실패 → 2단계
  const afterIconError = resolveAvatarStage(card, [AVATAR_STAGE.ICON]);
  assert.equal(afterIconError.stage, AVATAR_STAGE.LEGACY);

  // 2단계까지 실패 → 3단계(이니셜)
  const afterBothErrors = resolveAvatarStage(card, [AVATAR_STAGE.ICON, AVATAR_STAGE.LEGACY]);
  assert.deepEqual(afterBothErrors, { stage: AVATAR_STAGE.INITIAL, src: null, initial: "길" });

  // 장착 상태 데이터는 그대로다 — 아이콘·칭호·배지가 살아 있다
  assert.deepEqual(card, before);
});

test("④ 닉네임이 없으면 이미지 실패가 시스템 기본 이미지로 떨어진다", () => {
  const card = buildProfileCard({ nickname: null, legacyImageUrl: "https://cdn/legacy.png" });

  assert.equal(resolveAvatarStage(card).stage, AVATAR_STAGE.LEGACY);
  assert.equal(resolveAvatarStage(card, [AVATAR_STAGE.LEGACY]).stage, AVATAR_STAGE.DEFAULT);
});

/* ────────────────────────────────────────────────────────────────
 * ⑤ 배지 0 / 1~3 — C5 §3.5 + C1 §3
 * ──────────────────────────────────────────────────────────────── */

test("⑤ 배지 0개면 영역을 렌더하지 않고 1~3개는 slot_index 순이다", async () => {
  // 0개
  assert.deepEqual(orderedBadges([]), []);
  assert.deepEqual(orderedBadges(undefined), []);
  assert.deepEqual(orderedBadges(buildProfileCard({}).badges), []);

  // 1~3개 — slot_index 오름차순
  const shuffled = [
    { rewardId: "b3", displayName: "셋", assetRef: null, slotIndex: 3 },
    { rewardId: "b1", displayName: "하나", assetRef: null, slotIndex: 1 },
    { rewardId: "b2", displayName: "둘", assetRef: null, slotIndex: 2 },
  ];
  assert.deepEqual(
    orderedBadges(shuffled).map((badge) => badge.rewardId),
    ["b1", "b2", "b3"]
  );

  // 4개 이상은 slot_index CHECK가 막는다 — 방어적으로 잘린다
  assert.equal(MAX_BADGES, 3);
  const overflow = [
    ...shuffled,
    { rewardId: "b4", displayName: "넷", assetRef: null, slotIndex: 4 },
  ];
  assert.equal(orderedBadges(overflow).length, 3);

  // 0개일 때 목록 자체가 렌더되지 않는다는 것이 컴포넌트에도 적혀 있다
  const source = await readProjectFile("components/ProfileCard.jsx");
  assert.match(source, /badges\.length > 0 && \(\s*<ul className="pcard-badges">/);
});

test("⑤ 밀도는 C5 §4의 지점별 표시 요소와 일치한다", () => {
  // 프로필·공개 프로필 — 전부
  for (const element of ["level", "title", "badges", "frame", "background"]) {
    assert.ok(densityShows(DENSITY.FULL, element), `full에 ${element}가 없다`);
  }
  // 랭킹 — 아이콘·닉네임·레벨·칭호
  assert.ok(densityShows(DENSITY.COMPACT, "level"));
  assert.ok(densityShows(DENSITY.COMPACT, "title"));
  assert.ok(!densityShows(DENSITY.COMPACT, "badges"));
  // 그룹 참가자 행 — 아이콘·닉네임·칭호
  assert.ok(densityShows(DENSITY.MINIMAL, "title"));
  assert.ok(!densityShows(DENSITY.MINIMAL, "level"));
  assert.ok(!densityShows(DENSITY.MINIMAL, "badges"));
});

/* ────────────────────────────────────────────────────────────────
 * ⑥ 네 지점이 신규 컴포넌트를 쓴다 — TRACKS.md §8-A 수용조건
 * ──────────────────────────────────────────────────────────────── */

test("⑥ 네 지점의 소스가 신규 컴포넌트를 import한다", async () => {
  for (const relativePath of APPLIED_POINT_FILES) {
    const source = await readProjectFile(relativePath);
    assert.match(
      source,
      /import\s+ProfileAvatar\s+from|import\s+ProfileCard\s+from/,
      `${relativePath}가 신규 컴포넌트를 import하지 않는다`
    );
    assert.match(source, /<Profile(Card|Avatar)\b/, `${relativePath}가 신규 컴포넌트를 렌더하지 않는다`);
  }
});

test("⑥ ProfileCard는 ProfileAvatar를 거쳐 아바타를 그린다", async () => {
  const source = await readProjectFile("components/ProfileCard.jsx");
  assert.match(source, /import ProfileAvatar from "\.\/ProfileAvatar\.jsx"/);
  assert.match(source, /<ProfileAvatar\b/);
});

/* ────────────────────────────────────────────────────────────────
 * ⑦ 금지 문자열 0건 — TRACKS.md §8-A grep 불변식 ②③④
 * ──────────────────────────────────────────────────────────────── */

test("⑦ 네 지점에 폐기된 이름 fallback 리터럴이 남아 있지 않다", async () => {
  const retiredNameFallbacks = [
    /\|\|\s*"Unknown"/,
    /\|\|\s*"U"/,
    /\|\|\s*"\?"/,
    /\|\|\s*"이름 없음"/,
    /\|\|\s*"나"/,
    /\|\|\s*"참가자"/,
    /nickname[^\n]*\|\|\s*"-"/,
    /displayName[^\n]*\|\|\s*"-"/,
  ];

  for (const relativePath of APPLIED_POINT_FILES) {
    const source = await readProjectFile(relativePath);
    for (const pattern of retiredNameFallbacks) {
      assert.doesNotMatch(source, pattern, `${relativePath}에 폐기된 이름 fallback이 남아 있다`);
    }
  }
});

test("⑦ 아바타에 빈 alt와 인라인 스타일이 남아 있지 않다", async () => {
  for (const relativePath of APPLIED_POINT_FILES) {
    const source = await readProjectFile(relativePath);
    assert.doesNotMatch(source, /alt=""/, `${relativePath}에 빈 alt가 있다`);
    assert.doesNotMatch(source, /alt="(avatar|me|profile)"/, `${relativePath}에 옛 alt가 있다`);
  }

  // 그룹 방의 아바타 두 지점이 인라인 스타일과 함께 쓰던 클래스가 사라졌다
  const groupRoom = await readProjectFile("pages/GroupRoomPage.jsx");
  assert.doesNotMatch(groupRoom, /room-player-avatar/, "GroupRoomPage가 아직 인라인 스타일 아바타를 쓴다");
});

test("⑦ 신규 CSS는 mp-* 이름공간을 침범하지 않는다", async () => {
  const source = await readProjectFile("css/profileCard.css");
  assert.doesNotMatch(source, /^\s*\.mp-/m, "css/profileCard.css가 mp-* 클래스를 정의한다");
});

test("⑦ 컴포넌트가 css를 static import하지 않는다", async () => {
  const [avatar, card, appStyles] = await Promise.all([
    readProjectFile("components/ProfileAvatar.jsx"),
    readProjectFile("components/ProfileCard.jsx"),
    readProjectFile("appStyles.js"),
  ]);

  assert.doesNotMatch(avatar, /import\s+["'][^"']*\.css["']/);
  assert.doesNotMatch(card, /import\s+["'][^"']*\.css["']/);
  assert.match(appStyles, /import "\.\/css\/profileCard\.css";/);
});

/* ── 크기 토큰: 시각 회귀 0을 위해 현재 픽셀 값을 고정한다 ── */

test("크기 토큰이 지점별 현재 픽셀 값을 그대로 유지한다", () => {
  assert.deepEqual({ ...AVATAR_SIZES }, { xs: 32, sm: 34, md: 44, lg: 60, xl: 80 });
  assert.equal(avatarSizePx("xl"), 80);
  assert.equal(avatarSizePx("알 수 없는 토큰"), 44, "모르는 토큰은 md로 떨어진다");
  assert.equal(initialOf("길잡이"), "길");
  assert.equal(initialOf(null), null);
});
