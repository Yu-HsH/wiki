import assert from "node:assert/strict";
import { existsSync, statSync } from "node:fs";
import test from "node:test";
import { finalIconUrl } from "../components/group-items-jungle/finalAssetEvents.js";
import { itemName, s5Payload, S5_LABELS, S5_TARGET_ITEMS } from "../components/group-items-jungle/s5UiContract.js";

const allIds = "ink censor trap lost_link bookmark undo search link_index parry shield correction thunder thief roulette cannon enhancement weakening".split(" ");
const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const target = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

test("the full 17-item group catalog has a player-facing name and an icon in each tier", () => {
  assert.equal(allIds.length, 17);
  const iconUrls = new Set();
  for (const item of allIds) {
    assert.ok(itemName(item), `missing label: ${item}`);
    for (const tier of ["normal", "enhanced", "weakened"]) {
      const iconUrl = finalIconUrl(item, tier);
      assert.match(iconUrl, /\/group-items-final-s5\/icons\//, `${item}/${tier}`);
      const iconPath = new URL(`../public${iconUrl}`, import.meta.url);
      assert.ok(existsSync(iconPath), `icon file is missing: ${iconUrl}`);
      assert.ok(statSync(iconPath).size > 0, `icon file is empty: ${iconUrl}`);
      iconUrls.add(iconUrl);
    }
  }
  assert.equal(iconUrls.size, 51, "all item tiers must map to distinct icon files");
});

test("nine new item commands use owned grant and version; target attacks cannot select self", () => {
  assert.equal(Object.keys(S5_LABELS).length, 9);
  const state = {
    self: { currentSnapshotId: id, progressVersion: "0", inventoryVersion: "1" },
    inventory: [], s5: { finalModifierPolicy: false },
  };
  const grant = { grantId: id, effectiveTier: "normal" };
  for (const operation of Object.keys(S5_LABELS)) {
    const input = S5_TARGET_ITEMS.has(operation) ? { targetIds: [target] } : {};
    const payload = s5Payload(operation, input, { state, grant, eligibleTarget: value => value === target });
    assert.equal(payload.grantId, id, `${operation} must identify server-owned grant`);
    assert.equal(payload.expectedInventoryVersion, "1", `${operation} must guard inventory version`);
    if (S5_TARGET_ITEMS.has(operation)) {
      assert.equal(payload.targetParticipantId, target);
      assert.throws(() => s5Payload(operation, { targetIds: [id] }, {
        state, grant, eligibleTarget: value => value === target,
      }), /INVALID_TARGET/, `${operation} must reject non-targets`);
    } else {
      assert.equal(payload.targetParticipantId, undefined);
    }
  }
});

test("enhancement cannot apply to an arbitrary or duplicate inventory grant", () => {
  const other = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const third = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const state = {
    self: { currentSnapshotId: id, progressVersion: "0", inventoryVersion: "4" },
    inventory: [{ grantId: other, modifierKinds: [] }, { grantId: third, modifierKinds: [] }],
    s5: { finalModifierPolicy: true },
  };
  const enhanced = { grantId: id, effectiveTier: "enhanced" };
  const valid = s5Payload("enhancement", { targetGrantIds: [other, third] }, {
    state, grant: enhanced, eligibleTarget: () => false,
  });
  assert.deepEqual(valid.targetGrantIds, [other, third]);
  assert.throws(() => s5Payload("enhancement", { targetGrantIds: [other, other] }, {
    state, grant: enhanced, eligibleTarget: () => false,
  }), /INVALID_MODIFIER_SELECTION/);
  assert.throws(() => s5Payload("enhancement", { targetGrantIds: [id, other] }, {
    state, grant: enhanced, eligibleTarget: () => false,
  }), /INVALID_MODIFIER_SELECTION/);
});
