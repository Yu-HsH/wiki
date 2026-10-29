import test from 'node:test';
import assert from 'node:assert/strict';
import { createGroupSnapshotGuard } from '../utils/groupSnapshotGuard.js';

test('late personal response cannot replace final result even at the same room version', () => {
    const guard = createGroupSnapshotGuard();
    const personal = guard.begin();
    const final = guard.begin();
    assert.equal(guard.accept(final, {status:'finished',state_version:12}), true);
    assert.equal(guard.accept(personal, {status:'playing',state_version:12}), false);
    assert.equal(guard.accept(guard.begin(), {status:'playing',state_version:12}), false);
});
test('room and participant regressions are rejected independently', () => {
    const guard = createGroupSnapshotGuard();
    const players = [{user_id:'one',progress_version:2}];
    assert.equal(guard.accept(guard.begin(), {status:'playing',state_version:10}, players), true);
    assert.equal(guard.accept(guard.begin(), {status:'playing',state_version:9}, players), false);
    assert.equal(guard.accept(guard.begin(), {status:'playing',state_version:11}, [{user_id:'one',progress_version:1}]), false);
    assert.equal(guard.accept(guard.begin(), {status:'finished',state_version:12}, players), true);
});
test('leave or unmount invalidates pending reads', () => {
    const guard = createGroupSnapshotGuard();
    const pending = guard.begin(); guard.cancel();
    assert.equal(guard.isCurrent(pending), false);
    assert.equal(guard.accept(pending, {status:'finished',state_version:12}), false);
});
