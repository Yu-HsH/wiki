import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDuelResultPresentation as result, getDuelResultElapsedSeconds } from '../utils/duelResultPresentation.js';
import { buildResultXpView } from '../utils/xpResultDisplay.js';
import { buildResultReveal } from '../utils/achievementDisplay.js';
import { validateDuelGameSession } from '../utils/onlineGameSession.js';
const players = [{user_id:'me'}, {user_id:'other'}];
test('duel duration uses finalized server timestamps when player duration is absent, including after F5', () => {
  const room={status:'finished',game_starts_at:'2026-10-06T00:00:00.100Z',finished_at:'2026-10-06T00:00:12.900Z'};
  assert.equal(getDuelResultElapsedSeconds(room,{elapsed_seconds:null}),12);
  assert.equal(getDuelResultElapsedSeconds(JSON.parse(JSON.stringify(room)),{}),12);
  assert.equal(getDuelResultElapsedSeconds(room,{elapsed_seconds:7}),7);
  assert.equal(getDuelResultElapsedSeconds(room,{elapsed_seconds:0}),0);
});
test('duel duration remains unknown for incomplete, invalid or reversed server timestamps', () => {
  for(const room of [{status:'playing'},{status:'finished'},{status:'finished',game_starts_at:'bad',finished_at:'2026-10-06T00:00:00Z'},{status:'finished',game_starts_at:'2026-10-06T00:00:01Z',finished_at:'2026-10-06T00:00:00Z'}]) assert.equal(getDuelResultElapsedSeconds(room,{}),null);
});
for (const winner of ['me', 'other']) {
  test(`normal finish ${winner}`, () => assert.equal(result({status:'finished',finished_reason:'normal_finish',winner_user_id:winner},players,'me').term, winner === 'me' ? '승리' : '패배'));
  for (const reason of ['forfeited','disconnected_timeout']) {
    test(`forfeit ${winner} ${reason}`, () => {
      const rows = players.map(p => ({...p, retire_reason:p.user_id !== winner ? reason : null}));
      const view = result({status:'finished',finished_reason:'forfeit',winner_user_id:winner},rows,'me');
      assert.equal(view.term, winner === 'me' ? '승리' : '패배');
      assert.match(view.description, reason === 'forfeited' ? /포기/ : /복귀/);
    });
  }
}
test('cancelled has no winner presentation; unknown/active/nonparticipant cannot reveal result', () => {
  assert.equal(result({status:'finished',finished_reason:'cancelled'},players,'me').term,'무효');
  assert.equal(result({status:'playing',finished_reason:'normal_finish',winner_user_id:'me'},players,'me'),null);
  assert.equal(result({status:'finished',finished_reason:'other'},players,'me'),null);
  assert.equal(result({status:'finished',finished_reason:'cancelled'},players,'stranger'),null);
});
for (const [sourceType,amount] of [['group_rank_1',70],['group_rank_other',35],['group_retire',0],['duel_win_normal',25]]) {
  test(`ledger amount is displayed unchanged: ${sourceType}`, () => {
    const input={scope:sourceType.startsWith('group')?'group':'duel',entries:[{sourceType,amount,baseAmount:50}]};
    assert.equal(buildResultXpView(input).lines[0].gain,`+${amount} XP`);
    assert.deepEqual(buildResultXpView(input),buildResultXpView(input));
    assert.equal(buildResultXpView({...input,entries:null}),null);
  });
}
test('finished retired participant can restore server result after refresh', () => {
 const session=validateDuelGameSession({room:{status:'finished'},players:[{user_id:'me',player_status:'retired'},players[1]],userId:'me'});
 assert.equal(session.outcome,'finished');
});
test('only unseen server unlocks reveal; seen XP total is preserved without replay', () => {
 const response={xpTotal:60,achievements:[{achievementId:'server-id',name:'서버 이름',tiers:[{tier:1,unlockId:'seen',seen:true,xp:{amount:30}},{tier:2,unlockId:'new',seen:false,xp:{amount:30}}]}]};
 const view=buildResultReveal(response);
 assert.deepEqual(view.unlockIds,['new']);
 assert.equal(view.xpTotal,60);
 assert.equal(view.items[0].xp,30);
 response.achievements[0].tiers[1].seen=true;
 assert.deepEqual(buildResultReveal(response).items,[]);
 assert.deepEqual(buildResultReveal({achievements:[]}).items,[]);
});
