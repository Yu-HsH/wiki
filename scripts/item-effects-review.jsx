import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { FinalAssetOverlay, FinalItemIcon } from '../components/group-items-jungle/FinalAssetVfx.jsx';
import { attackMotion, finalReceiptSignal } from '../components/group-items-jungle/finalAssetEvents.js';
import { createFinalAssetAudio } from '../components/group-items-jungle/finalAssetAudio.js';
import { itemName } from '../components/group-items-jungle/s5UiContract.js';
import { itemRaceRule } from '../components/wiki-race/race/itemRaceRules.js';
import './item-effects-review.css';

const receipt = (operation, code, data) => finalReceiptSignal({ receiptId: 'preview', operation, code, ...data });
const scene = (kind, asset) => ({ kind, asset });
const catalog = {
  ink: { '시전자 · 발사와 적중': ['launch', 'hit'], '대상 · 경고와 먹물': ['warning', 'ink'], '시전자 · 공격 차단': ['launch', 'defend'] },
  censor: { '시전자 · 발사와 적중': ['launch', 'hit'], '대상 · 경고, 봉인, 종료': ['warning', { ...scene('censor'), censor: true }, { ...scene('censor-release', 'link_censor/release'), censor: false }], '시전자 · 잠글 링크 부족': ['launch', 'fail'] },
  trap: { '설치자 · 상자 설치': [receipt('trap_install', 'TRAP_INSTALLED', { trapId: 'demo' })], '대상 · 상자 발동': [receipt('normal_link', 'TRAP_STOPPED')], '대상 · 보호막으로 상자 차단': [receipt('normal_link', 'MOVED', { trapOutcome: 'blocked' })] },
  lost_link: { '대상 · 경고와 강제 이동': ['warning', { lost: true }, { ...scene('lost-arrive', 'lost_way/arrive'), lost: false }], '시전자 · 발사와 적중': ['launch', 'hit'], '시전자 · 경로가 바뀌어 불발': ['launch', 'fail'] },
  bookmark: { '문서 저장과 복귀': [receipt('bookmark_install', 'BOOKMARK_INSTALLED'), receipt('bookmark_return', 'MOVED', { moveId: 'demo' })] },
  undo: { '되돌리기 성공': [receipt('undo', 'MOVED', { moveId: 'demo' })], '약화 · 확률 실패': ['fail'] },
  search: { '첫 문서 검색': [receipt('search', 'SEARCH_ACTIVE')] },
  link_index: { '이동 링크 목록 열림': [receipt('link_index', 'LINK_INDEX_ACTIVE')] },
  parry: { '대상 · 공격 반사': ['warning', receipt('parry', 'PARRY_ACCEPTED', { outcome: 'reflected' })], '대상 · 공격 차단': ['warning', receipt('parry', 'PARRY_ACCEPTED', { outcome: 'blocked' })], '시전자 · 반사당함': ['launch', 'defend'] },
  shield: { '보호막 활성과 차단': [{ ...receipt('protect', 'PROTECTION_ACTIVE'), shieldActive: true }, { ...scene('shield-block', 'edit_protection/block'), shieldActive: false }], '보호막 활성 후 만료': [{ ...receipt('protect', 'PROTECTION_ACTIVE'), shieldActive: true }, { shieldActive: false }] },
  correction: { '효과 정정 성공': [receipt('correction', 'CORRECTION_APPLIED', { closedEffectId: 'demo' })], '약화 · 확률 실패': [receipt('correction', 'CORRECTION_CHANCE_FAILED')] },
  thunder: { '시전자 · 발사와 적중': ['launch', 'hit'], '대상 · 벼락과 감전': ['warning', { ...scene('thunder-hit', 'thunder_judgment/hit'), thunder: true }], '대상 · 보호막으로 차단': ['warning', scene('thunder-guard', 'thunder_judgment/guard')], '시전자 · 자기 감전': [{ ...receipt('thunder', 'THUNDER_SELF_PENALTY'), thunder: true }] },
  thief: { '시전자 · 아이템 탈취': [receipt('thief', 'THIEF_RESOLVED', { success: true, transferredItemId: 'ink' })], '대상 · 아이템 상실 (v4)': [{ ...scene('thief-loss', 'thief_hand/empty'), itemId: 'ink' }], '시전자 · 탈취 실패': [receipt('thief', 'THIEF_RESOLVED', { success: false })], '시전자 · 대상 아이템 없음': [receipt('thief', 'THIEF_NO_TRANSFERABLE_GRANT')] },
  roulette: { '성공 · 보상': [receipt('roulette', 'ROULETTE_RESOLVED', { success: true, delivery: 'offered' })], '강화 성공 · 자동 효과': [receipt('roulette', 'ROULETTE_RESOLVED', { success: true, automaticChild: true, delivery: 'offered' })], '실패 · 약화': [receipt('roulette', 'ROULETTE_RESOLVED', { success: false })] },
  cannon: { '시전자 · 발사, 이동, 착지': [scene('cannon-fire', 'dimension_cannon/fire'), scene('cannon-arrive', 'dimension_cannon/arrive')], '시전자 · 실패 후 시작 문서 착지': [scene('cannon-fire', 'dimension_cannon/fire'), scene('cannon-return', 'shared/miss')], '대상 · 강화 착지 충격': [attackMotion('cannon', 'hit', 'incoming', '착지 충격')] },
  enhancement: { '아이템 강화': [receipt('enhancement', 'ENHANCEMENT_ACTIVE')], '약화 · 확률 실패': ['fail'] },
  weakening: { '시전자 · 발사와 적중': ['launch', 'hit'], '대상 · 경고와 약화': ['warning', receipt('weakening', 'WEAKENING_APPLIED')], '시전자 · 확률 실패': ['fail'] },
};

const tiers = { normal: '일반', enhanced: '강화', weakened: '약화' };
const activeLength = { normal: 6000, enhanced: 9000, weakened: 3000 };
const headings = ['숲', '나무의 구조', '빛과 광합성', '숲의 생태계', '보전과 복원'];

function Review() {
  const [item, setItem] = useState('ink');
  const [tier, setTier] = useState('normal');
  const [branch, setBranch] = useState(0);
  const [sound, setSound] = useState(true);
  const [elapsed, setElapsed] = useState(null);
  const [display, setDisplay] = useState({ scenes: [] });
  const [run, setRun] = useState(0);
  const timers = useRef([]);
  const audio = useRef(null);
  const start = useRef(0);
  const cases = Object.entries(catalog[item]);
  const [effect, condition] = itemRaceRule(item, tier, 'group');

  function clear() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    audio.current?.stop();
    setDisplay({ scenes: [] });
    setElapsed(null);
  }

  function later(fn, time) {
    timers.current.push(setTimeout(fn, time));
  }

  function play() {
    clear();
    if (!window.captureAudioContext) {
      window.previewAudioContext ??= new AudioContext();
      void window.previewAudioContext.resume();
    }
    audio.current ??= createFinalAssetAudio(window);
    audio.current.enable(sound);
    start.current = Date.now();
    setRun(value => value + 1);
    setElapsed(0);
    const steps = cases[branch][1];
    const delay = item === 'cannon' ? 800 : ['shield', 'bookmark', 'censor'].includes(item) ? 1400 : 720;
    steps.forEach((value, index) => later(() => {
      const at = index * delay;
      if (value === 'ink') {
        audio.current.play('ink_blind/three_splashes');
        [0, 180, 360].forEach((ms, pulse) => later(() => setElapsed(at + ms), ms));
        later(() => setElapsed(null), activeLength[tier]);
        return;
      }
      const cue = typeof value === 'string' ? attackMotion(item, value, value === 'warning' ? 'incoming' : 'outbound',
        { launch: '발사', warning: '공격 접근', hit: '적중', fail: '효과 불발', defend: '공격 차단' }[value]) : value;
      if (cue.asset) audio.current.play(cue.asset);
      const { kind, thunder, lost, censor, shieldActive } = cue;
      const key = `${start.current}:${index}`;
      setDisplay(state => ({ ...state, ...(thunder !== undefined && { thunder }), ...(lost !== undefined && { lost }),
        ...(censor !== undefined && { censor }), ...(shieldActive !== undefined && { shieldActive }),
        scenes: kind ? [...state.scenes, { ...cue, key, itemTier: tier }] : state.scenes }));
      later(() => setDisplay(state => ({ ...state, scenes: state.scenes.filter(row => row.key !== key) })),
        kind?.startsWith('roulette') || kind === 'trap-hit' ? 2900 : kind?.startsWith('attack-') ? 850 : 1650);
      if (thunder) later(() => setDisplay(state => ({ ...state, thunder: false })), 2900);
    }, index * delay));
  }

  useEffect(() => () => { timers.current.forEach(clearTimeout); audio.current?.dispose(); }, []);

  const inkStep = cases[branch][1].indexOf('ink');
  const inkClock = inkStep * 720;
  const effectId = `review-${run}`;
  const inkActive = inkStep >= 0 && elapsed !== null && elapsed >= inkClock;
  const remaining = elapsed ?? 0;
  const frame = { now: start.current + remaining, view: { effects: [{ effectId, startsAt: start.current + inkClock,
    expiresAt: start.current + inkClock + activeLength[tier], tier }] } };
  const pulse = inkActive ? { effectId, index: Math.min(3, Math.floor((remaining - inkClock) / 180) + 1), tier, static: false } : null;

  return <div className="wr-race-shell">
    <header className="wr-race-hud review-header">
      <div><h1>아이템 연출 검토</h1><p>제품 렌더러 · 서버 응답 예시</p></div>
      <div className="review-controls">
        <label>아이템<select aria-label="아이템" value={item} onChange={event => { clear(); setItem(event.target.value); setBranch(0); }}>
          {Object.keys(catalog).map(id => <option key={id} value={id}>{itemName(id)}</option>)}
        </select></label>
        <label>등급<select aria-label="등급" value={tier} onChange={event => { clear(); setTier(event.target.value); }}>
          {Object.entries(tiers).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select></label>
        <label>장면<select aria-label="장면" value={branch} onChange={event => { clear(); setBranch(Number(event.target.value)); }}>
          {cases.map(([name], index) => <option key={name} value={index}>{name}</option>)}
        </select></label>
        <button className="review-play" onClick={play}>재생</button>
        <label className="review-sound"><input type="checkbox" checked={sound} onChange={event => {
          setSound(event.target.checked); audio.current?.enable(event.target.checked);
        }}/>효과음</label>
      </div>
      <p className="review-rule"><FinalItemIcon item={{ itemId: item, baseTier: tier }}/><span>{effect} {condition}</span></p>
    </header>
    <main className="duel-v4-document" data-s5-priority-vfx>
      <div className="wr-race-main"><article className="article-content">
        {headings.map((heading, section) => <section key={heading}><h2>{heading}</h2>
          {Array.from({ length: 7 }, (_, index) => <p key={index} className={index % 2 ? '' : 'wr-link-row'}>
            숲은 많은 생물이 함께 살아가는 공간이다. 문서 속 <a href="#review" onClick={event => event.preventDefault()}
              data-wiki-title={heading} className={display.censor && index % 2 === 0 ? 'duel-item-censored' : undefined}>
              {headings[(section + index + 1) % headings.length]}</a> 링크는 다음 문서로 이어진다.
            나무와 식물은 빛을 이용하고 토양의 수분과 양분을 흡수한다.
          </p>)}
        </section>)}
      </article></div>
      <FinalAssetOverlay value={display} pulse={pulse} frame={frame}/>
    </main>
  </div>;
}

createRoot(document.getElementById('root')).render(<Review/>);
