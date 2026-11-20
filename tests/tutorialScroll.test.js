import test from 'node:test';
import assert from 'node:assert/strict';
import { placeTutorial, planTutorialScroll, overlaps } from '../tutorial/core/placement.js';
const viewport = { left: 0, top: 0, width: 768, height: 900 };
const target = { left: 29, top: 330.28125, width: 710, height: 231.71875 };
// Target coordinates are from the failed integrated GR05. Bubble height is a conservative fixture value.
const bubble = { width: 380, height: 340 };

test('visible이지만 말풍선이 막힌 GR05 좌표는 한 번의 bounded scroll 계획으로 배치된다', () => {
  assert.equal(placeTutorial({ viewport, target, bubble }).blocked, true);
  const plan = planTutorialScroll({ viewport, target, bubble, scrollY: 380, maxScrollY: 1200 });
  assert.ok(plan);
  assert.ok(plan.scrollY >= 0 && plan.scrollY <= 1200);
  const moved = { ...target, top: target.top - (plan.scrollY - 380) };
  const placement = placeTutorial({ viewport, target: moved, bubble });
  assert.equal(placement.blocked, false);
  assert.equal(overlaps(placement, moved), false);
  assert.ok(moved.top >= 0 && moved.top + moved.height <= 900);
  assert.ok(placement.top >= 0 && placement.top + placement.height <= 900);
});
test('스크롤 가능 범위를 넘거나 oversized target을 준비된 것으로 바꾸지 않는다', () => {
  assert.equal(planTutorialScroll({ viewport, target, bubble, scrollY: 0, maxScrollY: 0 }), null);
  assert.equal(planTutorialScroll({ viewport, target: { ...target, height: 900 }, bubble, scrollY: 380, maxScrollY: 1200 }), null);
  assert.equal(planTutorialScroll({ viewport, target, bubble, scrollY: NaN, maxScrollY: 1200 }), null);
});
test('이미 공간이 있으면 스크롤하지 않고 보호영역이 전부 막으면 계획을 거부한다', () => {
  const compact = { left: 20, top: 20, width: 200, height: 44 };
  assert.equal(planTutorialScroll({ viewport, target: compact, bubble, scrollY: 380, maxScrollY: 1200 }), null);
  assert.equal(planTutorialScroll({ viewport, target, bubble, protectedRects: [{ left: 0, top: 0, width: 768, height: 900 }], scrollY: 380, maxScrollY: 1200 }), null);
});
test('visualViewport offset을 보존하며 새 viewport에서 실제 배치 가능성을 검사한다', () => {
  const shifted = { ...viewport, top: 40, height: 600 };
  const smallTarget = { left: 29, top: 220, width: 710, height: 120 };
  const shortBubble = { width: 380, height: 310 };
  assert.equal(placeTutorial({ viewport: shifted, target: smallTarget, bubble: shortBubble }).blocked, true);
  const plan = planTutorialScroll({ viewport: shifted, target: smallTarget, bubble: shortBubble, scrollY: 380, maxScrollY: 1200 });
  assert.ok(plan);
  const moved = { ...smallTarget, top: smallTarget.top - (plan.scrollY - 380) };
  assert.equal(placeTutorial({ viewport: shifted, target: moved, bubble: shortBubble }).blocked, false);
});
