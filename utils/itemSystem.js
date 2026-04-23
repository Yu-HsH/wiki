import { ITEM_TARGET } from "../data/items";

export function getInitialItemState() {
    return {
        inventory: [],
        activeEffects: {
            self: [],
            opponent: [],
        },
        immunityUntil: {
            self: 0,
            opponent: 0,
        },
        translateCurrentPage: {
            self: false,
            opponent: false,
        },
        historyStack: [],
        searchAvailable: false,
        highlightedLinks: [],
        floatingMessage: "",
    };
}

export function isImmune(immunityUntil) {
    return Date.now() < immunityUntil;
}

export function hasActiveEffect(effectList, effectId) {
    return effectList.some((e) => e.id === effectId);
}

export function clearExpiredEffects(effectList) {
    const now = Date.now();
    return effectList.filter((effect) => !effect.expiresAt || effect.expiresAt > now);
}

export function canUseItem(item, context) {
    if (!item || item.used) return false;

    switch (item.useCondition) {
        case "has_history":
            return context.historyStack?.length > 0;
        case "has_links":
            return Array.isArray(context.links) && context.links.length > 0;
        case "always":
        default:
            return true;
    }
}

export function markItemUsed(inventory, instanceId) {
    return inventory.map((item) =>
        item.instanceId === instanceId ? { ...item, used: true } : item
    );
}

export function buildTimedEffect(id, duration, extra = {}) {
    return {
        id,
        startedAt: Date.now(),
        expiresAt: duration > 1 ? Date.now() + duration : null,
        ...extra,
    };
}

export function removeEffect(effectList, effectId) {
    return effectList.filter((effect) => effect.id !== effectId);
}

export function addEffect(effectList, effect) {
    const filtered = removeEffect(effectList, effect.id);
    return [...filtered, effect];
}

export function shouldBlockAttack(item, immunityUntil) {
    if (item.target !== ITEM_TARGET.OPPONENT && item.target !== ITEM_TARGET.BOTH) {
        return false;
    }
    return isImmune(immunityUntil);
}