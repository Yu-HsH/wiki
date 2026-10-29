import { buildDuelResultPresentation } from "./duelResultPresentation.js";

/** Display only: no player flag, local phase or connection signal can invent a verdict. */
export function buildDuelEndScene(room, players = [], userId) {
  const result = buildDuelResultPresentation(room, players, userId);
  if (!result || room.finished_reason === "cancelled") return null;
  const opponent = players.find(player => player.user_id !== userId);
  if (!opponent || !players.some(player => player.user_id === room.winner_user_id)) return null;
  const won = result.isWinner;
  if (room.finished_reason === "normal_finish") {
    return { kind: won ? "win" : "loss", won, title: result.term, label: result.term, description: result.description, duration: 2700 };
  }
  const loser = players.find(player => player.user_id !== room.winner_user_id);
  // Unknown/timeout reasons keep the canonical result card, without pretending voluntary surrender.
  if (!["forfeited", "left", "disconnected_timeout"].includes(loser?.retire_reason)) return null;
  const disconnected = loser.retire_reason === "disconnected_timeout";
  return { kind: "forfeit", won, disconnected,
    title: disconnected ? "경기 종료" : won ? "상대 기권" : "기권",
    label: `${result.term} · ${disconnected ? "재접속 유예 종료" : won ? "상대 기권" : "기권"}`,
    description: result.description, duration: 2000 };
}

const progress = (t, a, b) => Math.max(0, Math.min(1, (t - a) / (b - a)));
const ease = x => 1 - (1 - x) ** 3;
/** Port of docs/design/duel-end-2026-10-13/scene.js, scoped to the actual React scene. */
export function drawDuelEnd(root, t, reduced = false) {
  if (reduced) return;
  const kind = root.dataset.kind, won = root.dataset.won === "true";
  const duration = kind === "forfeit" ? 2 : 2.7;
  const mobile = root.clientWidth <= 700;
  const set = (selector, styles) => { const node = root.querySelector(selector); if (node) Object.assign(node.style, styles); };
  root.querySelectorAll(".wr-de-player").forEach(node => {
    const own = node.dataset.own === "true", front = own === won;
    const p = ease(progress(t, .08, .82)), neutral = kind === "forfeit";
    Object.assign(node.style, {
      opacity: neutral || front ? 1 : 1 - .55 * p,
      transform: neutral ? `translateY(${(1 - p) * 8}px)` : front
        ? `translateY(${-18 * p}px) scale(${1 + .055 * p})`
        : `translate(${(own ? -1 : 1) * (mobile ? 8 : 32) * p}px,${14 * p}px) rotateY(${(own ? 1 : -1) * 12 * p}deg) scale(${1 - .15 * p})`,
      filter: neutral || front ? "none" : `saturate(${1 - .5 * p})`,
    });
  });
  const enter = ease(progress(t, .38, .7)), out = progress(t, duration - .26, duration);
  const hit = progress(t, .86, 1.18);
  const bounce = kind === "win" && t >= .86 && t < 1.18 ? Math.sin(hit * Math.PI * 3) * Math.exp(-hit * 4) : 0;
  set(".wr-de-verdict", { opacity: enter * (1 - out), transform: `translateY(${(1 - enter) * -26 - bounce * 4}px) scale(${.8 + .2 * enter + Math.abs(bounce) * .07})` });
  const stamp = ease(progress(t, .72, 1.02));
  set(".wr-de-seal", { opacity: stamp * (1 - out), transform: `rotate(-11deg) scale(${kind === "win" ? 1.9 - .9 * stamp : .92 + .08 * stamp})` });
  const pulse = progress(t, .95, 1.45), impact = kind === "win" && t >= .95 && t < 1.45;
  set(".wr-de-ring", { opacity: impact ? (1 - pulse) * .4 : 0, transform: `scale(${.5 + pulse * 1.7})` });
  root.querySelectorAll(".wr-de-ink i").forEach((node, i) => {
    const a = i / 16 * Math.PI * 2, d = 35 + ease(pulse) * (mobile ? 85 : 170);
    Object.assign(node.style, { opacity: impact ? (1 - pulse) * .65 : 0, transform: `translate(${Math.cos(a) * d}px,${Math.sin(a) * d}px) rotate(${i * 37 + pulse * 120}deg)` });
  });
  set(".wr-de-arena", { transform: `translateY(${-Math.abs(bounce) * 3}px)` });
}
