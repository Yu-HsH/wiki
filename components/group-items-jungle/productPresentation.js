import { defenseCue } from "../group-items-playtest/attackFeedback.js";

import { itemName, S5_TARGET_ITEMS } from './s5UiContract.js';

const messages = {
  correction_applied: "긴급정정으로 효과를 해제했어요.",
  protection_active: "편집보호가 활성화됐어요.",
  censor_active: "현재 문서의 일부 링크가 봉인됐어요.",
  trap_installed: "깜짝상자를 설치했어요.",
  trap_triggered: "깜짝상자가 발동했어요.",
  trap_blocked: "편집보호로 깜짝상자를 막았어요.",
  thunder_recoil: "천둥 실패 · 자신이 감전되고 아이템이 봉인됐어요.",
  thunder_weakened: "천둥 성공 · 약화되어 자신이 2초 감전됐어요.",
};

export function productInkPlacement(effectId) {
  let seed = 2166136261;
  for (const letter of effectId) seed = Math.imul(seed ^ letter.codePointAt(0), 16777619);
  return [[23, 22, -18], [76, 48, 12], [27, 79, 33]].map(([left, top, angle]) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return {
      left: `${left + (seed % 7) - 3}%`,
      top: `${top + ((seed >>> 8) % 7) - 3}%`,
      "--angle": `${angle + ((seed >>> 16) % 15) - 7}deg`,
    };
  });
}

export const productCueDuration = cue => ({
  parry_success: 3250,
  protection_active: 3200,
  protected: 3200,
  correction_applied: 2800,
  trap_triggered: 3400,
})[cue?.kind] ?? 1600;

export function nextProductInkPulseDelay(view) {
  let next = Infinity;
  for (const effect of view.effects) {
    const due = effect.presentationPulseTimes?.[effect.visiblePulseCount];
    if (due > view.presentationNow && due - view.presentationNow < effect.expiresAt - view.now) next = Math.min(next, due);
  }
  return Number.isFinite(next) ? Math.ceil(next - view.presentationNow) : null;
}

/** Approved renderers are supplied as imported components; no runtime HTML is interpreted. */
export function createProductItemPresentation({ renderCue, playInk } = {}) {
  return Object.freeze({
    renderCue,
    playPulse(pulse, view) { playInk?.(pulse, view); },
    result(result, event, view) {
      const reflected = result.outcome === "reflected";
      const reflectionBlocked = result.outcome === "reflection_blocked";
      const s5Attack = S5_TARGET_ITEMS.has(result.itemId);
      const s5Defense = s5Attack && (reflected || reflectionBlocked || result.outcome === 'blocked');
      if (result.itemId !== "ink" && !(result.itemId === "censor" && (reflected || reflectionBlocked)) && !s5Defense) return null;
      if (event.outcome !== result.outcome || (result.childId && event.childId !== result.childId)) return null;
      const cue = defenseCue(event, view);
      if (!cue) return null;
      return { ...cue, itemId: result.itemId, motion: reflected,
        ...(reflectionBlocked ? { kind: "parry_reflection_blocked" } : {}),
        ...(reflected && result.itemId === "censor" ? { detail: "검열을 상대에게 반격했어요" } : {}),
        ...(s5Defense && !reflectionBlocked ? { detail: itemName(result.itemId) +
          (reflected ? ' 공격을 상대에게 반격했어요' : ' 공격을 막았어요') } : {}),
      };
    },
    effects(effects, now, { censored, stunned }) {
      const active = effects.filter(effect => effect.startsAt <= now && now < effect.expiresAt);
      return active.flatMap(effect => {
        const kind = effect.kind === "censor" && censored ? "censor_active" : effect.kind === "stun" && !effect.source && stunned ? "trap_triggered" : null;
        return kind ? [{ kind, key: effect.effectId, message: messages[kind], motion: false }] : [];
      });
    },
    receipt(receipt, { live }) {
      if (!live || !receipt?.receiptId) return null;
      let kind = null;
      if (receipt.operation === "correction" && receipt.code === "CORRECTION_APPLIED" && receipt.closedEffectId) kind = "correction_applied";
      if (receipt.operation === "protect" && receipt.code === "PROTECTION_ACTIVE") kind = "protection_active";
      if (receipt.operation === "trap_install" && receipt.code === "TRAP_INSTALLED" && receipt.trapId) kind = "trap_installed";
      if (receipt.operation === "thunder" && receipt.code === "THUNDER_SELF_PENALTY") kind = "thunder_recoil";
      if (receipt.operation === "thunder" && receipt.code === "THUNDER_SELF_STUN") kind = "thunder_weakened";
      if (receipt.operation === "normal_link") {
        if (receipt.code === "TRAP_STOPPED" || (receipt.code === "MOVED" && receipt.trapOutcome === "arrival" && receipt.stunEventSeq)) kind = "trap_triggered";
        if (receipt.code === "MOVED" && receipt.trapOutcome === "blocked") kind = "trap_blocked";
      }
      return kind ? { kind, key: receipt.receiptId, message: messages[kind],
        motion: ["trap_triggered", "correction_applied", "protection_active"].includes(kind) } : null;
    },
  });
}
