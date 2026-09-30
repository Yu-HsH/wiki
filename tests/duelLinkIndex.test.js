import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { MULTI_ITEM_IDS, SINGLE_ITEM_IDS } from "../data/itemPools.js";
import {
    ACTIVE_DUEL_ITEM_IDS,
    canUseDuelItem,
    DUEL_ITEM_ROLE,
    filterLinkIndexEntries,
    getDuelItem,
    getDuelItemsByRole,
    nextCensorExpiry,
    selectCensoredTitles,
    sortLinkIndexTitles,
} from "../data/duelItems.js";

/**
 * 14b 계약 테스트 — 빠른 링크 아이템화 (`docs/agent/TRACKS.md` §8-14b).
 *
 * `link_index`(링크만 보기) 카탈로그 · 링크 검열 (가) · 빠른 링크 블록 제거.
 * JSX는 `node --test`가 import하지 못하므로 화면 쪽은 소스를 읽어 계약을 본다
 * (`tests/duelItemAuthority.test.js`와 같은 방식).
 */

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (relativePath) => readFileSync(`${root}/${relativePath}`, "utf8");

/**
 * 서버 카탈로그를 **정의하는 마지막 migration**을 찾는다.
 * `tests/duelItemAuthority.test.js`는 `20260904090000` 한 파일만 읽는다 — 그 파일의
 * 다른 계약(실패 코드·소비 순서)에는 맞지만, 카탈로그는 14b가 새 migration에서 다시
 * 정의했으므로 경로 상수 하나로는 새 행을 보지 못한다 (§8-14b 실측 ⑤).
 */
function latestMigrationDefining(needle) {
    const dir = "supabase/migrations";
    const files = readdirSync(`${root}/${dir}`)
        .filter((name) => name.endsWith(".sql"))
        .sort();
    const matches = files.filter((name) => read(`${dir}/${name}`).includes(needle));
    assert.ok(matches.length > 0, `${needle}를 정의하는 migration이 없다`);
    return `${dir}/${matches[matches.length - 1]}`;
}

const CATALOG_PATH = latestMigrationDefining(
    "create or replace function private.duel_item_catalog_v3()"
);
const catalogSource = read(CATALOG_PATH);

/** `('id', 'role', duration, charges, blockable, reflectable, move)` 행을 읽는다 */
function parseServerCatalog(source) {
    const body = source.slice(
        source.indexOf("create or replace function private.duel_item_catalog_v3()")
    );
    const values = body.slice(0, body.indexOf("$$;"));
    const rows = [
        ...values.matchAll(
            /\('([a-z_]+)',\s*'([a-z]+)',\s*(\d+),\s*(\d+),\s*(true|false),\s*(true|false),\s*(null|'[A-Z_]+')\)/g
        ),
    ];
    return rows.map((m) => ({
        id: m[1],
        role: m[2],
        duration: Number(m[3]),
        charges: Number(m[4]),
        blockable: m[5] === "true",
        reflectable: m[6] === "true",
        moveEventType: m[7] === "null" ? null : m[7].slice(1, -1),
    }));
}

const serverCatalog = parseServerCatalog(catalogSource);

/* ────────────────────────────────────────────────────────────
 * 1. 카탈로그 — 서버와 클라이언트가 같다
 * ──────────────────────────────────────────────────────────── */

test("서버 카탈로그의 최신본은 14b migration이다", () => {
    assert.equal(CATALOG_PATH, "supabase/migrations/20260930100000_duel_item_link_index_v3.sql");
});

test("서버 카탈로그 11행 = 클라이언트 활성 11종 = 지급 목록", () => {
    assert.equal(serverCatalog.length, 11);
    const serverIds = serverCatalog.map((row) => row.id).sort();
    assert.deepEqual(serverIds, [...ACTIVE_DUEL_ITEM_IDS].sort());
    assert.deepEqual(serverIds, [...MULTI_ITEM_IDS].sort());
});

test("서버와 클라이언트 사본이 행마다 같다 — 역할·지속·차단·반사·이동", () => {
    for (const row of serverCatalog) {
        const item = getDuelItem(row.id);
        assert.ok(item, `${row.id}가 클라이언트 카탈로그에 없다`);
        assert.equal(item.role, row.role, `${row.id} 역할`);
        assert.equal(item.duration, row.duration, `${row.id} 지속`);
        assert.equal(item.charges ?? 0, row.charges, `${row.id} charges`);
        assert.equal(item.blockable, row.blockable, `${row.id} blockable`);
        assert.equal(item.reflectable, row.reflectable, `${row.id} reflectable`);
        assert.equal(item.moveEventType, row.moveEventType, `${row.id} 이동 타입`);
    }
});

test("grant CHECK가 서버 카탈로그 11종을 정확히 받는다", () => {
    const check = catalogSource.slice(catalogSource.indexOf("add constraint duel_item_grants_item_id_check"));
    const ids = [...check.slice(0, check.indexOf(";")).matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    assert.deepEqual([...ids].sort(), serverCatalog.map((row) => row.id).sort());
});

/* ────────────────────────────────────────────────────────────
 * 2. link_index 정의 — 매트릭스와 수치
 * ──────────────────────────────────────────────────────────── */

test("link_index — 탐색 · 자기 대상 · 20초 · 막거나 반사할 수 없다 (14 §4)", () => {
    const item = getDuelItem("link_index");
    assert.equal(item.name, "링크만 보기");
    assert.equal(item.role, DUEL_ITEM_ROLE.SEARCH);
    assert.equal(item.target, "self");
    assert.equal(item.duration, 20000);
    assert.equal(item.blockable, false);
    assert.equal(item.reflectable, false);
    assert.equal(item.moveEventType, null, "열기만 해서는 이동하지 않는다");
});

test("탐색 후보는 셋이다 — search_once · link_preview · link_index", () => {
    assert.deepEqual(
        getDuelItemsByRole(DUEL_ITEM_ROLE.SEARCH).map((item) => item.id).sort(),
        ["link_index", "link_preview", "search_once"]
    );
});

test("link_index는 1:1 전용이다 — SINGLE_ITEM_IDS는 동결 그대로 (§2.3-①)", () => {
    assert.equal(SINGLE_ITEM_IDS.includes("link_index"), false);
    assert.deepEqual(SINGLE_ITEM_IDS, ["highlight_links", "search_once", "go_back", "random_teleport"]);
});

test("Q3 — 링크가 없는 문서에서는 link_index를 쓸 수 없다", () => {
    const item = { ...getDuelItem("link_index"), used: false };
    assert.equal(canUseDuelItem(item, { linkCount: 0 }), false);
    assert.equal(canUseDuelItem(item, {}), false, "링크 수를 모르면 쓰지 않는다");
    assert.equal(canUseDuelItem(item, { linkCount: 3 }), true);
});

test("링크 검열 설명이 (가)를 따른다 — 회색으로 막는다", () => {
    assert.match(getDuelItem("link_censorship").description, /회색/);
    assert.doesNotMatch(getDuelItem("link_censorship").description, /봉인/);
});

/* ────────────────────────────────────────────────────────────
 * 3. WikiViewer — 빠른 링크 블록 제거 · 검열 (가) · 세 모드 불변식
 * ──────────────────────────────────────────────────────────── */

const viewerSource = read("components/WikiViewer.jsx");

test("세 모드 공통 — WikiViewer에 빠른 링크 블록이 없다", () => {
    for (const gone of ["quick-links-section", "빠른 이동 링크", "stableQuickLinks", "link-chip", "links-card"]) {
        assert.equal(viewerSource.includes(gone), false, `${gone}가 남아 있다`);
    }
    assert.doesNotMatch(viewerSource, /^\s*quickLinks,/m, "quickLinks prop을 더 받지 않는다");
});

test("블록에 있던 먹물 오버레이와 빈 링크 안내는 블록 밖에 남았다 (실측 ⑥ · Q5)", () => {
    assert.match(viewerSource, /status\?\.blind && \(\s*<div className="blind-overlay">/);
    assert.match(viewerSource, /이 문서에는 이동 가능한 내부 링크가 없습니다\./);
});

test("검열 — 기본값은 빈 배열이고, 표시는 회색·취소선 클래스 + aria-disabled다 (Q2)", () => {
    assert.match(viewerSource, /censoredTitles = NO_CENSORED_TITLES/);
    assert.match(viewerSource, /const NO_CENSORED_TITLES = Object\.freeze\(\[\]\)/);
    assert.match(viewerSource, /classList\.toggle\(CENSORED_LINK_CLASS, censored\)/);
    assert.match(viewerSource, /setAttribute\("aria-disabled", "true"\)/);
    const css = read("css/multiplayer.css");
    const rule = css.slice(css.indexOf(".duel-item-censored,"));
    assert.match(rule.slice(0, rule.indexOf("}")), /line-through/);
});

test("검열 — 누르면 아무 일도 없다: onLinkClick 전에 돌아간다 (오류가 아니다)", () => {
    const handler = viewerSource.slice(viewerSource.indexOf("const handleDocumentClick"));
    const body = handler.slice(0, handler.indexOf("}, ["));
    const guardAt = body.indexOf("if (censoredSet.has(normalizeTitle(nextTitle))) return;");
    assert.ok(guardAt > 0, "검열 가드가 없다");
    assert.ok(guardAt < body.indexOf("onLinkClick?.(nextTitle)"), "가드가 이동 요청보다 먼저다");
});

test("싱글·그룹은 censoredTitles를 넘기지 않는다 — 검열 회색 0", () => {
    for (const page of ["pages/GamePage.jsx", "pages/GroupGamePage.jsx"]) {
        assert.equal(read(page).includes("censoredTitles"), false, page);
    }
});

/* ────────────────────────────────────────────────────────────
 * 4. 링크만 보기 — 정렬 · 필터 · 20초 · 이동 시 닫힘 · 검열 · 먹물
 * ──────────────────────────────────────────────────────────── */

test("정렬 — 가나다순이고 중복·빈 값을 뺀다 (기준: localeCompare(…, \"ko\"))", () => {
    assert.deepEqual(
        sortLinkIndexTitles(["하늘", "가방", "나무", "", null, "가방", "다리", "가"]),
        ["가", "가방", "나무", "다리", "하늘"]
    );
    assert.deepEqual(sortLinkIndexTitles(undefined), []);
});

test("필터 — 포함 여부 · 대소문자·앞뒤 공백 무시 · 빈 입력은 전부", () => {
    const entries = ["금속 활자", "활판 인쇄", "Gutenberg", "르네상스"].map((title) => ({ title }));
    assert.deepEqual(filterLinkIndexEntries(entries, " 활 ").map((e) => e.title), ["금속 활자", "활판 인쇄"]);
    assert.deepEqual(filterLinkIndexEntries(entries, "gUTEN").map((e) => e.title), ["Gutenberg"]);
    assert.equal(filterLinkIndexEntries(entries, "").length, 4);
    assert.equal(filterLinkIndexEntries(entries, "없는말").length, 0);
});

test("검열 목록 — 나에게 걸린 link_censorship의 제목, 만료되면 빠진다", () => {
    const now = 1_000_000;
    const effects = [
        { itemId: "link_censorship", expiresAt: now + 3000, metadata: { censoredTitles: ["A", "B"] } },
        { itemId: "link_censorship", expiresAt: now - 1, metadata: { censoredTitles: ["OLD"] } },
        { itemId: "blind", expiresAt: now + 3000, metadata: {} },
        { itemId: "link_censorship", expiresAt: now + 5000, metadata: {} },
    ];
    assert.deepEqual(selectCensoredTitles(effects, now), ["A", "B"]);
    assert.equal(nextCensorExpiry(effects, now), now + 3000);
    assert.deepEqual(selectCensoredTitles(effects, now + 6000), []);
    assert.equal(nextCensorExpiry(effects, now + 6000), null);
    assert.deepEqual(selectCensoredTitles(null, now), []);
});

const pageSource = read("pages/MultiplayerGamePage.jsx");
const barSource = read("components/DuelItemBar.jsx");

/** `from`부터 `to`까지의 소스 조각. 정규식보다 읽기 쉬운 포함 검사용이다. */
function slice(source, from, to) {
    const start = source.indexOf(from);
    assert.ok(start >= 0, `${from}가 없다`);
    const end = source.indexOf(to, start + from.length);
    return source.slice(start, end < 0 ? undefined : end);
}

test("1:1 — 본문과 색인이 같은 검열 배열을 읽는다 (두 회색 집합이 갈라질 수 없다)", () => {
    assert.ok(pageSource.includes("censoredTitles={censoredTitles}"));
    assert.ok(pageSource.includes("() => selectCensoredTitles(activeEffects, Date.now())"));
    assert.ok(slice(pageSource, "const linkIndexView = useMemo", "}, [").includes("censoredTitles.map"));
});

test("1:1 — 검열 만료 순간 다시 그린다 (nextCensorExpiry 타이머)", () => {
    assert.ok(pageSource.includes("nextCensorExpiry(activeEffects, Date.now())"));
    assert.ok(pageSource.includes("setCensorClock((tick) => tick + 1)"));
});

test("link_index — 서버 성공(applied) 뒤에만 열리고, 20초 기준은 서버 만료 시각이다 (Q4)", () => {
    const branch = slice(pageSource, 'if (item.id === "link_index")', "return;");
    assert.ok(branch.includes("expiresAt: outcome.effectExpiresAt"));
    // applyLocalItemEffect는 APPLIED 갈래에서만 불린다.
    assert.ok(
        slice(pageSource, "if (outcome.result === DUEL_ITEM_RESULT.APPLIED)", "}").includes(
            "applyLocalItemEffect(item, outcome)"
        )
    );
    assert.ok(
        slice(pageSource, "const expiresAt = linkIndex?.expiresAt;", "}, [").includes(
            "setTimeout(closeLinkIndex, remaining)"
        )
    );
});

test("link_index — 문서가 바뀌면 닫힌다: 일반 이동 · 강제 이동 · 되감기 전부 (14 §4)", () => {
    // 강제 이동 3종(random_link_move·random_teleport·history_rewind)은 모두
    // applyMyAuthoritativeRow → setPageData로 문서를 바꾼다. 닫기는 그 결과만 본다.
    const effect = slice(pageSource, "// 이동하면 닫힌다", "}, [pageData?.title, linkIndex, closeLinkIndex]);");
    assert.ok(effect.includes('normalizeTitle(pageData?.title || "") !== normalizeTitle(linkIndex.openedOnTitle || "")'));
    assert.ok(effect.includes("closeLinkIndex();"));
    assert.ok(pageSource.includes('openedOnTitle: pageDataRef.current?.title || ""'));
});

test("link_index — 단어 클릭은 일반 이동(handleMove)이다. 검열·먹물 중에는 무반응", () => {
    const body = slice(pageSource, "const handleLinkIndexMove", "\n  };");
    assert.ok(body.includes("if (blocked || status.blind) return;"));
    assert.ok(body.indexOf("if (blocked || status.blind) return;") < body.indexOf("handleMove(title);"));
});

test("패널 — 필터 · 닫기 · ESC · 검열 aria-disabled · 먹물 덮개", () => {
    const panel = barSource.slice(barSource.indexOf("function DuelLinkIndexPanel"));
    for (const piece of [
        "filterLinkIndexEntries(entries, query)",
        'event.key === "Escape") onCloseLinkIndex?.()',
        "aria-disabled={entry.censored || undefined}",
        "if (entry.censored) return;",
        '<div className="duel-item-index__ink"',
        "disabled={navigating || blindActive}",
    ]) {
        assert.ok(panel.includes(piece), piece);
    }
});

test("패널 — HUD가 끌어오는 모듈은 여전히 react와 1:1 카탈로그뿐이다", () => {
    const imported = [...barSource.matchAll(/from\s*"([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(imported.sort(), ["../data/duelItems.js", "react"]);
});
