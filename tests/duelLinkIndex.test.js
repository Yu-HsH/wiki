import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { MULTI_ITEM_IDS, SINGLE_ITEM_IDS } from "../data/itemPools.js";
import {
    ACTIVE_DUEL_ITEM_IDS,
    canUseDuelItem,
    DUEL_ITEM_ROLE,
    getDuelItem,
    getDuelItemsByRole,
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
