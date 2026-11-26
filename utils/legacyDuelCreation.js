export const legacyDuelItemsSelectable = (env) =>
  env.VITE_DUEL_ITEMS_V4_ENTRY !== "1" || env.VITE_HIDE_LEGACY_DUEL_ITEM_CREATION !== "1";
