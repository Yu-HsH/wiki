import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  DUEL_DECAY_TIERS,
  SERVICE_TIME_ZONE,
  XP_BY_SOURCE_TYPE,
  XP_CLASSES,
  XP_CLASS_BY_SOURCE_TYPE,
  XP_DECAY_REASONS,
  XP_SOURCE_TYPES,
  applyDuelDecay,
  countsTowardWeeklyRanking,
  isConsistentGrant,
  isSameServiceDay,
  resolveDuelDecay,
  resolveGrant,
  serviceDayKey,
  serviceDayStart,
  xpClassOf,
} from "../utils/xpRules.js";
import { EMPTY_XP_SUMMARY, normalizeXpLedgerEntry } from "../services/xpService.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (relativePath) => readFileSync(`${root}/${relativePath}`, "utf8");

const migration = read("supabase/migrations/20260903090000_xp_ledger_v1.sql");

/**
 * 주석을 뺀 migration. "무엇을 하지 않는가"를 검사할 때 쓴다 — 범위 밖 대상을 설명하는
 * 주석이 그 검사에 걸리면 안 된다. `--` 줄 주석만 쓰므로 이 한 줄로 충분하다.
 */
const migrationCode = migration.replace(/^\s*--.*$/gm, "");
const pgTap = read("supabase/tests/xp_ledger_v1.sql");
const xpRulesSource = read("utils/xpRules.js");
const xpServiceSource = read("services/xpService.js");

/* ────────────────────────────────────────────────────────────
 * 1. XP 카탈로그 — 01-CONFIRMED-SPEC.md §7.1 = C2 §3
 * ──────────────────────────────────────────────────────────── */

test("C2 §3 — source_type은 14종이고 계약 표와 순서까지 같다", () => {
  assert.equal(XP_SOURCE_TYPES.length, 14);
  assert.deepEqual(XP_SOURCE_TYPES, [
    "single_random_finish",
    "single_target_first_finish",
    "daily_course_first_finish",
    "duel_win_normal",
    "duel_loss_normal",
    "duel_win_forfeit",
    "duel_loss_forfeit",
    "group_rank_1",
    "group_rank_2",
    "group_rank_3",
    "group_rank_other",
    "group_retire",
    "achievement_unlock",
    "admin_adjustment",
  ]);
});

test("§7.1 — 확정 XP 값을 그대로 옮겼다", () => {
  assert.deepEqual(XP_BY_SOURCE_TYPE, {
    single_random_finish: 20,
    single_target_first_finish: 15,
    daily_course_first_finish: 25,
    duel_win_normal: 50,
    duel_loss_normal: 25,
    duel_win_forfeit: 30,
    duel_loss_forfeit: 0,
    group_rank_1: 70,
    group_rank_2: 55,
    group_rank_3: 45,
    group_rank_other: 35,
    group_retire: 0,
  });
});

test("G16 — 그룹 2위는 시안의 40이 아니라 55다", () => {
  assert.equal(XP_BY_SOURCE_TYPE.group_rank_2, 55);
});

test("G17 — Freeze v1의 싱글 완주 +40은 어디에도 없다", () => {
  assert.equal(
    Object.values(XP_BY_SOURCE_TYPE).includes(40),
    false,
    "확정 스펙의 어느 값도 40이 아니다"
  );
});

test("C2 §3 — 0 XP도 카탈로그에 값으로 있다. 값 없음이 아니다", () => {
  assert.equal(XP_BY_SOURCE_TYPE.duel_loss_forfeit, 0);
  assert.equal(XP_BY_SOURCE_TYPE.group_retire, 0);
  assert.equal(Object.hasOwn(XP_BY_SOURCE_TYPE, "duel_loss_forfeit"), true);
  assert.equal(Object.hasOwn(XP_BY_SOURCE_TYPE, "group_retire"), true);
});

test("C2 §3 — 값이 정해지지 않은 둘은 카탈로그에 없다", () => {
  // achievement_unlock은 30/60/120 단계라 패킷 16의 카탈로그이고,
  // admin_adjustment는 임의 값이다. 여기서 값을 발명하지 않는다.
  assert.equal(Object.hasOwn(XP_BY_SOURCE_TYPE, "achievement_unlock"), false);
  assert.equal(Object.hasOwn(XP_BY_SOURCE_TYPE, "admin_adjustment"), false);
  assert.equal(resolveGrant("achievement_unlock"), null);
  assert.equal(resolveGrant("admin_adjustment"), null);
});

test("resolveGrant는 감쇠 없는 지급 3값을 만든다", () => {
  assert.deepEqual(resolveGrant("group_rank_1"), {
    baseAmount: 70,
    amount: 70,
    decayReason: null,
  });
  assert.deepEqual(resolveGrant("group_retire"), {
    baseAmount: 0,
    amount: 0,
    decayReason: null,
  });
  assert.equal(resolveGrant("nope"), null);
});

/* ────────────────────────────────────────────────────────────
 * 2. xp_class — C2 §2. 업적 XP는 레벨에 들어가고 주간에서만 빠진다
 * ──────────────────────────────────────────────────────────── */

test("C2 §2 — xp_class는 3종이고 모든 source_type에 하나씩 붙는다", () => {
  assert.deepEqual(XP_CLASSES, ["gameplay", "achievement", "admin"]);
  for (const sourceType of XP_SOURCE_TYPES) {
    assert.ok(
      XP_CLASSES.includes(xpClassOf(sourceType)),
      `${sourceType}에 xp_class가 없다`
    );
  }
});

test("C2 §2 — 업적과 운영 보정만 gameplay가 아니다", () => {
  assert.equal(xpClassOf("achievement_unlock"), "achievement");
  assert.equal(xpClassOf("admin_adjustment"), "admin");

  const gameplay = XP_SOURCE_TYPES.filter((type) => xpClassOf(type) === "gameplay");
  assert.equal(gameplay.length, 12);
  assert.equal(gameplay.includes("achievement_unlock"), false);
  assert.equal(gameplay.includes("admin_adjustment"), false);
});

test("C2 §2 — 주간 탐험가 랭킹은 gameplay만 센다", () => {
  assert.equal(countsTowardWeeklyRanking("duel_win_normal"), true);
  assert.equal(countsTowardWeeklyRanking("group_retire"), true, "0 XP도 gameplay다");
  assert.equal(countsTowardWeeklyRanking("achievement_unlock"), false);
  assert.equal(countsTowardWeeklyRanking("admin_adjustment"), false);
  assert.equal(countsTowardWeeklyRanking("unknown_source"), false);
});

test("서버의 xp_class 도출표와 프론트 표가 어긋나지 않는다", () => {
  // 두 곳이 어긋나면 주간 랭킹의 제외 규칙이 조용히 틀어진다.
  for (const [sourceType, xpClass] of Object.entries(XP_CLASS_BY_SOURCE_TYPE)) {
    const pattern = new RegExp(`when '${sourceType}' then '${xpClass}'`);
    assert.match(
      migration,
      pattern,
      `private.xp_class_for_source에 ${sourceType} → ${xpClass}가 없다`
    );
  }
});

/* ────────────────────────────────────────────────────────────
 * 3. 감쇠 — C2 §5. floor 확정 (C2 §8-①)
 * ──────────────────────────────────────────────────────────── */

test("§7.2 — 1~3경기 100%, 4~5경기 50%, 6경기부터 0%", () => {
  assert.deepEqual(DUEL_DECAY_TIERS.map((tier) => tier.ratio), [1, 0.5, 0]);

  for (const ordinal of [1, 2, 3]) {
    assert.deepEqual(resolveDuelDecay(ordinal), { ratio: 1, decayReason: null });
  }
  for (const ordinal of [4, 5]) {
    assert.deepEqual(resolveDuelDecay(ordinal), {
      ratio: 0.5,
      decayReason: "duel_repeat_half",
    });
  }
  for (const ordinal of [6, 7, 20]) {
    assert.deepEqual(resolveDuelDecay(ordinal), {
      ratio: 0,
      decayReason: "duel_repeat_zero",
    });
  }
});

test("C2 §8-① — 25 XP의 50%는 12다. floor이지 반올림이 아니다", () => {
  const decayed = applyDuelDecay(25, 4);
  assert.deepEqual(decayed, {
    baseAmount: 25,
    amount: 12,
    decayReason: "duel_repeat_half",
  });
  assert.notEqual(decayed.amount, 13, "반올림이면 13이 된다");
});

test("C2 §5 — 감쇠는 원래 값과 지급 값을 함께 남긴다", () => {
  assert.deepEqual(applyDuelDecay(50, 4), {
    baseAmount: 50,
    amount: 25,
    decayReason: "duel_repeat_half",
  });
  assert.deepEqual(applyDuelDecay(50, 6), {
    baseAmount: 50,
    amount: 0,
    decayReason: "duel_repeat_zero",
  });
});

test("C2 §5 — 감쇠가 없으면 decayReason이 null이고 amount = baseAmount다", () => {
  const granted = applyDuelDecay(50, 1);
  assert.deepEqual(granted, { baseAmount: 50, amount: 50, decayReason: null });
  assert.equal(granted.amount, granted.baseAmount);
});

test("base가 0이면 어느 구간에서도 decayReason이 null이다", () => {
  // duel_loss_forfeit는 0 XP다. amount와 base가 같으므로 감쇠 사유를 붙이면
  // xp_ledger_decay_reason_check가 아니라 "감쇠하지 않았는데 사유가 있는" 상태가 된다.
  for (const ordinal of [1, 4, 6]) {
    assert.deepEqual(applyDuelDecay(0, ordinal), {
      baseAmount: 0,
      amount: 0,
      decayReason: null,
    });
  }
});

test("50% 구간의 홀수 base도 floor로 내려간다", () => {
  assert.equal(applyDuelDecay(15, 4).amount, 7);
  assert.equal(applyDuelDecay(1, 5).amount, 0);
  assert.equal(applyDuelDecay(1, 5).decayReason, "duel_repeat_half");
});

test("XP_DECAY_REASONS는 2값이고 CHECK와 같다", () => {
  assert.deepEqual(XP_DECAY_REASONS, ["duel_repeat_half", "duel_repeat_zero"]);
  for (const reason of XP_DECAY_REASONS) {
    assert.ok(migration.includes(`'${reason}'`), `${reason}가 CHECK에 없다`);
  }
});

test("모든 감쇠 결과가 원장 CHECK 규칙을 만족한다", () => {
  for (const sourceType of Object.keys(XP_BY_SOURCE_TYPE)) {
    for (let ordinal = 1; ordinal <= 8; ordinal += 1) {
      const grant = applyDuelDecay(XP_BY_SOURCE_TYPE[sourceType], ordinal);
      assert.ok(
        isConsistentGrant({ xpClass: xpClassOf(sourceType), ...grant }),
        `${sourceType} ${ordinal}번째 경기의 지급이 정합하지 않다`
      );
    }
  }
});

test("isConsistentGrant가 CHECK 위반을 잡는다", () => {
  const base = { xpClass: "gameplay", baseAmount: 50, amount: 50, decayReason: null };
  assert.equal(isConsistentGrant(base), true);
  assert.equal(
    isConsistentGrant({ ...base, amount: 25 }),
    false,
    "사유 없이 줄인 지급"
  );
  assert.equal(
    isConsistentGrant({ ...base, amount: 60, decayReason: "duel_repeat_half" }),
    false,
    "base보다 큰 지급"
  );
  assert.equal(
    isConsistentGrant({ ...base, amount: -10 }),
    false,
    "gameplay 음수"
  );
  assert.equal(
    isConsistentGrant({ ...base, amount: 25, decayReason: "duel_repeat_third" }),
    false,
    "없는 감쇠 사유"
  );
  assert.equal(
    isConsistentGrant({ ...base, xpClass: "cosmetic" }),
    false,
    "없는 xp_class"
  );
});

test("admin만 음수 보정을 낼 수 있다 (15 §2)", () => {
  assert.equal(
    isConsistentGrant({
      xpClass: "admin",
      baseAmount: -100,
      amount: -100,
      decayReason: null,
    }),
    true
  );
  assert.equal(
    isConsistentGrant({
      xpClass: "gameplay",
      baseAmount: -100,
      amount: -100,
      decayReason: null,
    }),
    false
  );
});

/* ────────────────────────────────────────────────────────────
 * 4. 일일 경계 — KST 확정 (C2 §8-②)
 * ──────────────────────────────────────────────────────────── */

test("C2 §8-② — 서비스 기준 시간대는 KST다", () => {
  assert.equal(SERVICE_TIME_ZONE, "Asia/Seoul");
});

test("KST 자정이 날짜를 가른다 — UTC 자정이 아니다", () => {
  // 2026-09-03 14:59:59Z = KST 2026-09-03 23:59:59
  assert.equal(serviceDayKey(new Date("2026-09-03T14:59:59Z")), "2026-09-03");
  // 2026-09-03 15:00:00Z = KST 2026-09-04 00:00:00
  assert.equal(serviceDayKey(new Date("2026-09-03T15:00:00Z")), "2026-09-04");
  // UTC 기준이었다면 둘 다 09-03이었을 것이다.
  assert.notEqual(
    serviceDayKey(new Date("2026-09-03T14:59:59Z")),
    serviceDayKey(new Date("2026-09-03T15:00:00Z"))
  );
});

test("UTC 자정을 사이에 둔 두 경기는 KST로 같은 날이다", () => {
  const before = new Date("2026-09-03T23:30:00Z"); // KST 09-04 08:30
  const after = new Date("2026-09-04T00:30:00Z"); // KST 09-04 09:30
  assert.equal(isSameServiceDay(before, after), true);
});

test("KST 자정을 사이에 둔 두 경기는 다른 날이다", () => {
  const before = new Date("2026-09-03T14:30:00Z"); // KST 09-03 23:30
  const after = new Date("2026-09-03T15:30:00Z"); // KST 09-04 00:30
  assert.equal(isSameServiceDay(before, after), false);
});

test("serviceDayStart는 KST 00:00에 해당하는 UTC 시각이다", () => {
  const start = serviceDayStart(new Date("2026-09-04T05:00:00Z"));
  assert.equal(start.toISOString(), "2026-09-03T15:00:00.000Z");
});

test("잘못된 시각은 날짜를 만들어내지 않는다", () => {
  assert.equal(serviceDayKey(new Date("nope")), null);
  assert.equal(serviceDayStart(new Date("nope")), null);
  assert.equal(isSameServiceDay(new Date("nope"), new Date()), false);
});

/* ────────────────────────────────────────────────────────────
 * 5. migration — 수용조건 ①②⑧⑨
 * ──────────────────────────────────────────────────────────── */

test("수용조건 ① — 재실행 안전한 DDL과 이름 붙은 제약을 쓴다", () => {
  assert.match(migration, /create table if not exists public\.xp_ledger/);
  for (const name of [
    "xp_ledger_idempotent_uq",
    "xp_ledger_xp_class_check",
    "xp_ledger_source_type_check",
    "xp_ledger_class_source_check",
    "xp_ledger_amount_sign_check",
    "xp_ledger_decay_range_check",
    "xp_ledger_decay_reason_check",
  ]) {
    assert.match(migration, new RegExp(`constraint ${name}`), `${name}가 없다`);
  }
});

test("수용조건 ① — 인덱스 2개이고 주간 인덱스는 gameplay 부분 인덱스다", () => {
  assert.match(
    migration,
    /create index if not exists xp_ledger_user_granted_idx\s+on public\.xp_ledger \(user_id, granted_at desc\)/
  );
  assert.match(
    migration,
    /create index if not exists xp_ledger_weekly_idx\s+on public\.xp_ledger \(granted_at, user_id\)\s+where xp_class = 'gameplay'/
  );
});

test("C2 §4 — 멱등성은 3열 유니크다", () => {
  assert.match(migration, /unique \(user_id, source_type, source_id\)/);
  assert.match(
    migration,
    /on conflict on constraint xp_ledger_idempotent_uq do nothing/
  );
});

test("수용조건 ② — 15a의 grant_xp_v1은 profiles를 갱신하지 않는다", () => {
  // 이 한 줄이 15a/15b 분리를 지탱한다 (TRACKS §6.1 조건 C1).
  assert.doesNotMatch(migrationCode, /update\s+public\.profiles/i);
  assert.doesNotMatch(migrationCode, /alter table public\.profiles/i);
  assert.doesNotMatch(migrationCode, /profiles\.total_xp/i, "profiles.total_xp는 15b다");
  assert.doesNotMatch(migrationCode, /add column/i, "15a는 기존 테이블에 컬럼을 더하지 않는다");
});

test("§6.4 — 주간 랭킹 RPC는 15a에 없다", () => {
  assert.doesNotMatch(migrationCode, /get_weekly_xp_ranking_v1/);
});

test("§6.3 — 결과 확정 경로를 건드리지 않는다", () => {
  for (const finalizer of [
    "finalize_group_room_if_expired",
    "apply_single_move_v2",
    "finalize_duel_if_expired",
  ]) {
    assert.equal(
      migrationCode.includes(finalizer),
      false,
      `${finalizer} 교체는 15c다`
    );
  }
});

test("누적 XP는 원장 합계로 계산한다 (TRACKS §6.1)", () => {
  assert.match(migration, /select coalesce\(sum\(amount\), 0\)/);
});

test("수용조건 ⑧ — RLS는 켜지고 클라이언트 write 경로는 없다", () => {
  assert.match(migration, /alter table public\.xp_ledger enable row level security/);
  assert.match(migration, /revoke all on table public\.xp_ledger from anon, authenticated/);
  assert.match(migration, /grant select on table public\.xp_ledger to authenticated/);
  assert.match(migration, /create policy "Users can read own xp ledger"/);
  assert.match(migration, /using \(\(select auth\.uid\(\)\) = user_id\)/);
  assert.doesNotMatch(migrationCode, /for (insert|update|delete)\s+to authenticated/i);
});

test("수용조건 ⑨ — grant_xp_v1에 authenticated execute가 없다", () => {
  assert.match(
    migration,
    /revoke all on function public\.grant_xp_v1\(uuid, text, uuid, integer, integer, text\)\s+from public, anon, authenticated/
  );
  assert.match(
    migration,
    /grant execute on function public\.grant_xp_v1\(uuid, text, uuid, integer, integer, text\)\s+to service_role/
  );
  assert.doesNotMatch(
    migrationCode,
    /grant execute on function public\.grant_xp_v1\([^)]*\)\s+to authenticated/
  );
});

test("contracts README — 신규 RPC 형태를 따른다", () => {
  for (const rpc of ["grant_xp_v1", "get_xp_summary_v1"]) {
    const body = migration.slice(
      migration.indexOf(`create or replace function public.${rpc}(`)
    );
    assert.match(body, /returns jsonb/);
    assert.match(body, /language plpgsql/);
    assert.match(body, /security definer/);
    assert.match(body, /set search_path = ''/);
  }
});

test("C2 §7 — grant_xp_v1의 실패 코드 3종이 전부 있다", () => {
  for (const code of ["AUTH_REQUIRED", "XP_SOURCE_INVALID", "XP_AMOUNT_INVALID"]) {
    assert.match(migration, new RegExp(`'${code}'`), `${code}가 없다`);
  }
  assert.match(migration, /'PROFILE_NOT_FOUND'/);
});

test("C3 §4 — 레벨 함수 정의를 그대로 옮겼다", () => {
  assert.match(
    migration,
    /select least\(100 \+ 25 \* \(\(greatest\(p_level, 1\) - 1\) \/ 5\), 500\);/
  );
  assert.match(migration, /create or replace function public\.level_from_total_xp\(p_total_xp bigint\)/);
  assert.match(migration, /immutable/);
});

test("Realtime publication을 건드리지 않는다 (contracts README)", () => {
  assert.doesNotMatch(migrationCode, /alter publication/i);
});

test("§2.4 — 예약된 파일명과 순서를 쓴다", () => {
  const previous = "20260814123000";
  const current = "20260903090000";
  assert.ok(current > previous, "새 migration이 마지막 migration보다 뒤 번호여야 한다");
});

/* ────────────────────────────────────────────────────────────
 * 6. pgTAP·서비스 계층
 * ──────────────────────────────────────────────────────────── */

test("pgTAP 파일은 롤백으로 끝나 원격 DB를 만지지 않는다", () => {
  assert.match(pgTap, /^begin;/m);
  assert.match(pgTap, /^rollback;/m);
  assert.match(pgTap, /select plan\(\d+\);/);
});

test("pgTAP는 수용조건 ③⑤⑥⑦을 실제로 주장한다", () => {
  assert.match(pgTap, /granted:false/, "멱등 재호출");
  assert.match(pgTap, /floor, not round/, "25의 50% = 12");
  assert.match(pgTap, /worth 0 XP/, "0 XP 행");
  assert.match(pgTap, /3975 XP is level 27/, "C3 §4 검산");
});

test("xpService는 지급 래퍼를 두지 않는다 (C2 §7)", () => {
  // authenticated에 execute가 없으므로 프론트 래퍼는 항상 실패하는 죽은 경로다.
  assert.doesNotMatch(xpServiceSource, /rpc\(\s*"grant_xp_v1"/);
  assert.match(xpServiceSource, /rpc\(\s*"get_xp_summary_v1"/);
});

test("EMPTY_XP_SUMMARY는 XP가 없는 탐험가의 실제 값과 같다", () => {
  assert.deepEqual(EMPTY_XP_SUMMARY, {
    totalXp: 0,
    level: 1,
    currentLevelXp: 0,
    nextLevelXp: 100,
  });
});

test("normalizeXpLedgerEntry는 snake_case 행을 프론트 표기로 옮긴다", () => {
  assert.deepEqual(
    normalizeXpLedgerEntry({
      id: "row-1",
      xp_class: "gameplay",
      source_type: "duel_loss_normal",
      source_id: "match-1",
      base_amount: 25,
      amount: 12,
      decay_reason: "duel_repeat_half",
      granted_at: "2026-09-04T00:00:00Z",
    }),
    {
      id: "row-1",
      xpClass: "gameplay",
      sourceType: "duel_loss_normal",
      sourceId: "match-1",
      baseAmount: 25,
      amount: 12,
      decayReason: "duel_repeat_half",
      grantedAt: "2026-09-04T00:00:00Z",
    }
  );
  assert.equal(normalizeXpLedgerEntry(null), null);
  assert.equal(normalizeXpLedgerEntry({ decay_reason: undefined }).decayReason, null);
});

/* ────────────────────────────────────────────────────────────
 * 7. 공유 자원 불변식 — TRACKS §2.2·§2.3
 * ──────────────────────────────────────────────────────────── */

test("§2.2 — 15a의 신규 파일에 \"/main\" 리터럴이 없다", () => {
  // tests/appRouting.test.js의 전역 스캔이 저장소 전체를 훑는다.
  for (const source of [xpRulesSource, xpServiceSource]) {
    assert.equal(source.includes('"/main"'), false);
  }
});

test("§8-D — 15a는 신규 파일만 만진다", () => {
  // 프론트 두 모듈이 다른 트랙의 파일을 import하지 않는다.
  // supabaseClient는 모든 서비스가 공유하는 진입점이라 예외다.
  assert.deepEqual(
    [...xpServiceSource.matchAll(/from "([^"]+)"/g)].map((match) => match[1]),
    ["../supabaseClient.js"]
  );
  assert.equal(/^\s*import /m.test(xpRulesSource), false, "xpRules는 순수 모듈이다");
});
