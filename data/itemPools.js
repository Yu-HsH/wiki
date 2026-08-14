export const SINGLE_ITEM_IDS = [
    "highlight_links",
    "search_once",
    "go_back",
    "random_teleport",
];

export const MULTI_ITEM_IDS = [
    "blind",
    "translate_current",
    "random_link_move",
    "highlight_links",
    "cleanse_shield",
    "search_once",
    "go_back",
    "random_teleport",
    "double_blind",
    "mini_game",
];

export const DISABLED_DUEL_ITEM_IDS = new Set(["swap_current"]);

export function isDisabledDuelItem(item) {
    return DISABLED_DUEL_ITEM_IDS.has(item?.id);
}
