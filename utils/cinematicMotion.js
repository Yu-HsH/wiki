// Numeric curves ported from approved Round4 START / 2026-10-12 END. No game state writes.
const clamp = x => Math.max(0, Math.min(1, x));
const progress = (t, a, b) => clamp((t - a) / (b - a));
const ease = x => 1 - (1 - clamp(x)) ** 3;
const set = (node, props) => { if (node) Object.assign(node.style, props); };
const show = (node, p, transform = "none") => set(node, { opacity: clamp(p), visibility: p > 0 ? "visible" : "hidden", transform });
function impact(root, t, start, span, duel, reduced) {
  const p = progress(t, start, start + span), active = t >= start && p < 1 && !reduced;
  const particles = root.querySelectorAll('.ink-particles i');
  particles.forEach((node, i) => {
    const angle = i / particles.length * Math.PI * 2, distance = (28 + (duel ? 230 : 125) * ease(p)) * (i % 2 ? 1 : .78);
    set(node, { opacity: active ? (1 - p) * (duel ? 1 : .65) : 0, transform: `translate(${Math.cos(angle) * distance}px,${Math.sin(angle) * distance}px) rotate(${i * 37 + p * 170}deg) scale(${1 - p * .6})` });
  });
  set(root.querySelector('.ring'), { opacity: active ? (1 - p) * (duel ? .75 : .2) : 0, transform: `scale(${.35 + p * (duel ? 1.55 : 1.2)})` });
}
export function drawDuel(root, t, reduced) {
  const find = s => root.querySelector(s), mobile = window.innerWidth <= 700;
  const a = ease(progress(t, 0, .68)), b = ease(progress(t, .02, .7));
  const hit = progress(t, .88, 1.3), recoil = !reduced && t >= .88 && t < 1.3 ? Math.sin(hit * Math.PI * 3) * Math.exp(-hit * 3.2) : 0;
  show(find('.left'), a, reduced ? 'none' : `translateX(${(1 - a) * -innerWidth * .75 - recoil * (mobile ? 26 : 42)}px) rotate(${(1 - a) * -10 - recoil * 2.4}deg) scale(${1 + Math.abs(recoil) * .035})`);
  show(find('.right'), b, reduced ? 'none' : `translateX(${(1 - b) * innerWidth * .75 + recoil * (mobile ? 26 : 42)}px) rotate(${(1 - b) * 10 + recoil * 2.4}deg) scale(${1 + Math.abs(recoil) * .035})`);
  const vs = progress(t, .7, .88), settle = progress(t, .98, 1.3), scale = t < .88 ? 3.1 - 1.55 * ease(vs) : t < .98 ? 1.55 : t < 1.3 ? 1 + .55 * Math.cos(settle * Math.PI * 2) * Math.exp(-settle * 4.8) : 1;
  show(find('.duel-vs'), t >= .7 ? 1 : 0, reduced ? 'none' : `scale(${scale}) rotate(${(1 - ease(vs)) * -18 + recoil * 5}deg)`);
  set(find('.duel-composition'), { transform: reduced ? 'none' : `translate(${recoil * 13}px,${-Math.abs(recoil) * 11}px)` });
  show(find('.duel-slash'), progress(t, .76, .96), `rotate(${mobile ? 60 : 18}deg)`); impact(root, t, .88, .55, true, reduced);
  const course = ease(progress(t, 1.3, 2.15)), courseHit = !reduced && t >= 2.15 && t < 2.3 ? Math.sin(progress(t, 2.15, 2.3) * Math.PI) * .25 : 0;
  show(find('.duel-course'), course, reduced ? 'none' : `translateY(${(1 - course) * 105 + courseHit * 9}px) rotateX(${(1 - course) * 70}deg) scale(${.8 + .2 * course + courseHit * .04})`);
  set(find('.duel-course'), { clipPath: `inset(0 ${(1 - course) * 50}% 0)` });
  const finish = t >= 4.3 && t < 4.66 ? Math.sin(progress(t, 4.3, 4.66) * Math.PI) : 0;
  set(find('.duel-course .course-arrow'), { transform: reduced ? 'none' : `translateX(${finish * 6}px)` });
}
function drawReel(box, t, start, stop, reduced) {
  const windowNode = box.querySelector('.reel-window'), strip = box.querySelector('.reel-strip'), p = progress(t, start, stop), height = windowNode.clientHeight;
  const moving = t >= start && t < stop && !reduced, u = progress(p, .62, 1), area = .09 + .44 + .38 / 3;
  const travel = (p < .18 ? p * p / .36 : p < .62 ? .09 + p - .18 : .53 + .38 / 3 * (1 - (1 - u) ** 3)) / area;
  const velocity = p < .18 ? p / .18 : p < .62 ? 1 : (1 - u) ** 2, target = box.dataset.reel === 'target', turns = target ? 17 : 18;
  set(strip, { transform: `translateY(${moving ? -((travel * turns) % 6) * height : 0}px)`, filter: moving ? `blur(${velocity * 1.35}px)` : 'none', visibility: t >= stop ? 'hidden' : 'visible' });
  show(box.querySelector('.reel-final'), t >= stop ? 1 : 0);
  const kick = !reduced && t >= stop && t < stop + .3 ? Math.sin(progress(t, stop, stop + .3) * Math.PI * 3) * Math.exp(-progress(t, stop, stop + .3) * 3) : 0;
  set(windowNode, { transform: reduced ? 'none' : target ? `translateX(${kick * 11}px) rotate(${kick * 1.2}deg) scale(${1 + kick * .12})` : `translateY(${Math.abs(kick) * 9}px) scale(${1 + kick * .06},${1 - kick * .08})`, boxShadow: t >= stop ? `inset 0 0 0 4px ${target ? '#c79a3255' : '#3268a833'},0 7px 0 #24343015` : 'inset 0 12px 25px #24343019' });
  set(box.querySelector('.reel-flash'), { opacity: !reduced && t >= stop && t < stop + .12 ? (1 - progress(t, stop, stop + .12)) * (target ? .62 : .4) : 0 });
  set(box.querySelector('.reel-lock-frame'), { opacity: t >= stop ? 1 : 0, transform: reduced ? 'none' : `scale(${t >= stop ? 1 + (1 - ease(progress(t, stop, stop + .2))) * .18 : 1})` });
  const state = box.querySelector('.lock-state'); state.textContent = t >= stop ? '✓' : ''; state.setAttribute('aria-label', t >= stop ? '코스 공개' : moving ? '코스 공개 중' : '공개 대기');
  Object.assign(box.dataset, { locked: String(t >= stop), moving: String(moving), phase: t >= stop ? 'locked' : !moving ? 'waiting' : p < .18 ? 'acceleration' : p < .62 ? 'fast' : 'deceleration', velocity: (moving ? velocity : 0).toFixed(3) });
}
export function drawGroupStart(root, t, reduced) {
  if (!root.querySelector('[data-reel="start"]')) return;
  const players = root.querySelectorAll('.roster-person');
  players.forEach((node, i) => { const p = ease(progress(t, i * .026, .218 + i * .026)), angle = i / players.length * Math.PI * 2; show(node, p, reduced ? 'none' : `translate(${Math.cos(angle) * (1 - p) * 170}px,${-(1 - p) * 100}px) rotate(${(1 - p) * (i % 2 ? 18 : -18)}deg) scale(${.4 + .6 * p})`); });
  drawReel(root.querySelector('[data-reel="start"]'), t, .4, 1.8, reduced); drawReel(root.querySelector('[data-reel="target"]'), t, 2.1, 3.5, reduced);
  set(root.querySelector('.group-connection path'), { strokeDashoffset: 640 * (1 - progress(t, 3.85, 4.1)) });
  const depart = ease(progress(t, 4, 4.3)); show(root.querySelector('.departure'), depart, `scale(${.88 + .12 * depart})`);
}
export function drawGroupEnd(root, t, reduced) {
  const board = ease(progress(t, 0, .6)); show(root.querySelector('.result-board'), board, reduced ? 'none' : `translateY(${(1 - board) * 220}px) rotateX(${(1 - board) * 30}deg) rotateZ(${(1 - board) * -5}deg)`);
  for (const [rank, at] of [[3, .85], [2, 1.65], [1, 3.05]]) {
    const node = root.querySelector(`.podium-slot[data-rank="${rank}"]`); if (!node) continue;
    const p = ease(progress(t, at, at + (rank === 1 ? .55 : .3)));
    show(node.querySelector('.podium-person'), p, reduced ? 'none' : `translateY(${(1 - p) * 85}px) rotateY(${(1 - p) * -75}deg) scale(${rank === 1 ? .76 + .24 * p + (t >= at && t < at + .55 ? (innerWidth <= 700 ? .08 : .15) * Math.sin(progress(t, at, at + .55) * Math.PI) : 0) : 1})`);
    node.dataset.revealed = String(t >= at); node.querySelector('.podium-person').setAttribute('aria-hidden', String(t < at));
    const avatar = rank === 1 && node.querySelector('.podium-avatar'); if (avatar) set(avatar, { boxShadow: t >= 3.05 ? '0 0 18px #c79a3266' : 'none' });
  }
  impact(root, t, 3.12, .65, false, reduced);
  const mine = ease(progress(t, 3.95, 4.2)); show(root.querySelector('.my-record'), mine, `translateX(${(1 - mine) * -35}px)`);
  const turn = ease(progress(t, 4.85, 5.25)); set(root.querySelector('.ceremony-page'), { transform: `perspective(1200px) rotateX(${turn * -86}deg) scaleY(${1 - turn * .7})`, clipPath: `inset(${turn * 96}% 0 0 0)` });
}
export function drawSingleEnd(root, t, reduced) {
  const title = ease(progress(t, 0, .24)), stamp = progress(t, .28, .62);
  const rebound = !reduced && t >= .46 && t < .78 ? Math.sin(progress(t,.46,.78)*Math.PI*3)*Math.exp(-progress(t,.46,.78)*4) : 0;
  const out = progress(t, 1.5, 1.78);
  show(root.querySelector('h2'), title * (1-out), reduced ? 'none' : `translateY(${(1-title)*12-rebound*3}px) rotate(${rebound*-1.5}deg) scale(${.82+.18*title+Math.abs(rebound)*.035})`);
  const scale = stamp < .65 ? 1.8-.84*stamp/.65 : .96+.04*progress(stamp,.65,1);
  show(root.querySelector('.finish-stamp'), t >= .28 ? 1-out : 0, `rotate(-11deg) scale(${reduced?1:scale})`);
  const hit = progress(t,.46,.88);
  set(root.querySelector('.finish-impact'), { opacity: !reduced && t >= .46 && t < .88 ? (1-hit)*.35 : 0, transform: `scale(${.5+hit*.7})` });
}
