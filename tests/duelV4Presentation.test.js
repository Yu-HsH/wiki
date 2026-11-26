import assert from 'node:assert/strict';
import test from 'node:test';
import { activeV4Effects, appendDuelV4Notice, createDuelV4Presentation, duelV4AttackFeedback } from '../services/duelV4Presentation.js';

const stamp = offset => new Date(Date.UTC(2026, 10, 25) + offset).toISOString();
const projection = (offset, extra = {}) => ({ version: offset, serverTime: stamp(offset), warnings: [], attackResults: [], effects: [], inventory: [], players: [], ...extra });
const attack = (id, outcome, offset, item = 'ink') => ({ id, outcome, item_id: item, actor_id: 'A', target_id: 'B', resolved_at: stamp(offset) });

function capture() {
  const audio = [];
  const notices = [];
  let time = Date.parse(stamp(0));
  const presenter = createDuelV4Presentation(() => ({ play: asset => audio.push(asset), stop() {} }), notice => notices.push(notice), () => time);
  const observe = (offset, state, userId = 'B') => {
    time = Date.parse(stamp(offset));
    presenter.observe(state, time, userId);
  };
  return { audio, notices, presenter, observe };
}

test('v4 distinguishes the server outcome for both participants', () => {
  const outcomes = [
    ['hit', '적중', '피격'], ['blocked', '상대 편집보호', '편집보호 소모'],
    ['parried_blocked', '상대 패링', '차단 성공'], ['reflected', '반사당함', '반사 성공'],
    ['reflected_blocked', '편집보호로 차단', '상대 편집보호로 차단'],
    ['void_ineligible', '조건 미충족', '적용되지 않음'], ['no_censor_candidates', '조건 미충족', '적용되지 않음'],
  ];
  for (const [outcome, attacker, defender] of outcomes) {
    const row = attack('attack', outcome, 1);
    assert.ok(duelV4AttackFeedback(row, 'A').text.includes(attacker));
    assert.ok(duelV4AttackFeedback(row, 'B').text.includes(defender));
    assert.equal(duelV4AttackFeedback(row, 'outside'), null);
  }
  assert.equal(duelV4AttackFeedback(attack('thunder', 'reflected', 1, 'thunder'), 'B').cue.asset, 'thunder_judgment/parry');
  assert.equal(duelV4AttackFeedback(attack('censor', 'hit', 1, 'censor'), 'B').cue.asset, null);
});

test('a later attack outcome does not interrupt the roulette result reveal', () => {
  const { presenter, observe, audio } = capture();
  observe(0, projection(0), 'A');
  presenter.receipt({ id: 'roll', operation: 'item', itemId: 'roulette' }, { code: 'ROULETTE_WON' });
  observe(200, projection(200, { attackResults: [attack('other', 'hit', 200)] }), 'A');
  assert.deepEqual(presenter.scenes().map(scene => scene.kind), ['roulette-win', 'item-outcome']);
  observe(2050, projection(2050), 'A');
  assert.deepEqual(presenter.scenes().map(scene => scene.kind), ['roulette-win']);
  observe(2600, projection(2600), 'A');
  assert.deepEqual(presenter.scenes(), []);
  assert.deepEqual(audio, ['chaos_roulette/win']);
});

test('v4 restores ongoing effects silently, deduplicates live events and never replays recent history after F5', () => {
  const { presenter, observe, audio, notices } = capture();
  const history = attack('old', 'reflected', 0);
  const oldInk = { id: 'older-ink', kind: 'ink', startsAt: stamp(0), expiresAt: stamp(4000) };
  const live = attack('new', 'reflected', 1100);
  const postReload = projection(1000, { attackResults: [history], effects: [oldInk] });
  observe(1000, postReload);
  assert.equal(presenter.isLiveInk(oldInk.id), false);
  assert.deepEqual(audio, []);
  const beforeRefresh = projection(1190, { attackResults: [history, live], effects: [oldInk] });
  presenter.receipt({ id: 'parry' }, { code: 'PARRY_REFLECTED' });
  observe(1190, beforeRefresh);
  observe(1250, beforeRefresh);
  assert.deepEqual(audio, ['reverse_link_parry/reflect']);
  assert.equal(notices.length, 1);
  assert.equal(presenter.scene().kind, 'parry-reflect');
  const freshPage = capture();
  freshPage.observe(1190, beforeRefresh);
  assert.deepEqual(freshPage.audio, []);
  assert.equal(freshPage.presenter.scene(), null);
});

test('v4 connects its accepted self-use receipts to the selected S5 motions and sounds', () => {
  const { presenter, audio, notices, observe } = capture();
  const cues = [
    ['SHIELD_ACTIVE', 'shield-activate', 'edit_protection/activate'], ['BOOKMARK_SAVED', 'bookmark-save', 'path_bookmark/save'],
    ['BOOKMARK_RETURNED', 'bookmark-return', 'path_bookmark/return'], ['UNDONE', 'undo', 'rollback/use'],
    ['EFFECT_CLEARED', 'correction', 'emergency_correction/success'], ['LINK_INDEX_OPEN', 'links', 'links_only/reveal'],
    ['ITEM_ENHANCED', 'enhancement', 'enhance_scroll/apply'], ['ITEM_WEAKENED', 'weakening', 'weakening_curse/apply'],
    ['THUNDER_SELF_STUN', 'thunder-self', 'thunder_judgment/self'], ['THIEF_STOLEN', 'thief-steal', 'thief_hand/steal'],
    ['THIEF_EMPTY', 'thief-empty', 'thief_hand/empty'], ['TRAP_INSTALLED', 'trap-install', null],
    ['TRAP_ARRIVAL', 'trap-hit', 'surprise_box/hit'], ['CANNON_LANDED', 'cannon-fire', 'dimension_cannon/fire'],
    ['ROULETTE_BOOSTED', 'roulette-boost', 'chaos_roulette/boost'], ['SEARCH_SUBMITTED', 'search', 'document_find/scan'],
  ];
  for (const [code, scene, sound] of cues) {
    const size = audio.length;
    const request = { id: code, input: { windowId: 'search-one' }, slot: 1 };
    presenter.receipt(request, { code });
    presenter.receipt(request, { code });
    assert.equal(presenter.scene().kind, scene, code);
    assert.deepEqual(audio.slice(size), sound ? [sound] : [], code);
  }
  assert.equal(notices.length, cues.length);
  presenter.receipt({ id: 'another-query', input: { windowId: 'search-one' } }, { code: 'SEARCH_SUBMITTED' });
  assert.equal(audio.filter(asset => asset === 'document_find/scan').length, 1);
  presenter.receipt({ id: 'correction-miss', itemId: 'correction' }, { code: 'ITEM_CHANCE_FAILED' });
  assert.equal(presenter.scene().kind, 'correction-fail');
  assert.equal(audio.at(-1), 'emergency_correction/fail');
  observe(800, projection(800));
  assert.equal(presenter.scene().kind, 'correction-fail', 'cannon arrival requires the verified new progress');
});

test('v4 ink is a single mix and persisted effects respect authoritative start and end times', () => {
  const { observe, audio, presenter } = capture();
  observe(1000, projection(1000));
  const ink = { id: 'new-ink', kind: 'ink', startsAt: stamp(1010), expiresAt: stamp(2500) };
  const shield = { id: 'infinite-shield', kind: 'shield', startsAt: stamp(2200), expiresAt: 'infinity' };
  const state = projection(1100, { effects: [ink, shield] });
  observe(1100, state);
  observe(1300, state);
  assert.equal(presenter.isLiveInk(ink.id), true);
  assert.deepEqual(audio, ['ink_blind/three_splashes']);
  assert.deepEqual(activeV4Effects(state.effects, Date.parse(stamp(2200))), [ink, shield]);
  assert.deepEqual(activeV4Effects(state.effects, Date.parse(stamp(2500))), [shield]);
});

test('v4 keeps S5 lost-link and censor cues bound to a newly observed attack or natural expiry', () => {
  const { observe, audio, presenter } = capture();
  const player = { id: 'B', progressVersion: 1, page: { pageId: '1', revisionId: '2' } };
  const censor = { id: 'censor', kind: 'censor', startsAt: stamp(900), expiresAt: stamp(1400) };
  const lostWarning = { id: 'lost', itemId: 'lost_link', dueAt: stamp(1450) };
  observe(1000, projection(1000, { effects: [censor], players: [player] }));
  observe(1100, projection(1100, { warnings: [lostWarning], effects: [censor], players: [player] }));
  observe(1400, projection(1400, { warnings: [lostWarning], players: [player] }));
  const arrived = projection(1450, { attackResults: [attack('lost', 'hit', 1450, 'lost_link')], players: [{ ...player, progressVersion: 2 }] });
  observe(1450, arrived);
  observe(1500, arrived);
  assert.deepEqual(audio, ['lost_way/activate', 'link_censor/release', 'lost_way/arrive']);
  assert.equal(presenter.scene().kind, 'lost-arrive');
});

test('a failed roulette does not announce or play a second weakening cue', () => {
  const { observe, audio } = capture();
  observe(1000, projection(1000, { inventory: [{ id: 'grant', weakened: false }] }));
  observe(1100, projection(1100, { inventory: [{ id: 'grant', weakened: true }], rouletteSupplyWeakened: true }));
  assert.deepEqual(audio, []);
  observe(1200, projection(1200, { inventory: [{ id: 'new', weakened: false }] }));
  observe(1300, projection(1300, { inventory: [{ id: 'new', weakened: true }] }));
  assert.deepEqual(audio, ['weakening_curse/apply']);
});

test('v4 keeps a newly delivered result readable after a delayed poll without replaying the scene or sound', () => {
  const { observe, audio, notices, presenter } = capture();
  observe(1000, projection(1000));
  const delayed = projection(5600, { attackResults: [attack('late', 'reflected', 1200)] });
  observe(5600, delayed);
  observe(5700, delayed);
  assert.match(notices[0].text, /반사 성공/);
  assert.equal(notices.length, 1);
  assert.deepEqual(audio, []);
  assert.equal(presenter.scene(), null);
});

test('an authoritative attack result replaces one matching pending cue', () => {
  const first = { pendingItem: 'ink', until: 100, key: 'oldest' };
  const later = { ...first, key: 'second' };
  const other = { ...first, pendingItem: 'thunder', key: 'other' };
  const result = { settlesItem: 'ink', until: 150, key: 'result' };
  assert.deepEqual(appendDuelV4Notice([first, later, other], result, 50), [later, other, result]);
});
