export const ITEM_RARITY = {
    NORMAL: "normal",
    RARE: "rare",
};

export const ITEM_CATEGORY = {
    ATTACK: "attack",
    SUPPORT: "support",
    JOKER: "joker",
};

export const ITEM_TARGET = {
    SELF: "self",
    OPPONENT: "opponent",
    BOTH: "both",
};

export const ITEM_DEFS = [
    {
        id: "blind",
        name: "시야가리기",
        rarity: ITEM_RARITY.NORMAL,
        category: ITEM_CATEGORY.ATTACK,
        target: ITEM_TARGET.OPPONENT,
        duration: 4000,
        description: "상대 화면 위에 반투명 먹물 효과를 씌웁니다.",
        useCondition: "always",
    },
    {
        id: "translate_current",
        name: "언어변경",
        rarity: ITEM_RARITY.NORMAL,
        category: ITEM_CATEGORY.ATTACK,
        target: ITEM_TARGET.OPPONENT,
        duration: 1,
        description: "상대의 현재 문서만 영어로 보이게 합니다. 이동 시 해제됩니다.",
        useCondition: "always",
    },
    {
        id: "random_link_move",
        name: "랜덤 링크 이동",
        rarity: ITEM_RARITY.RARE,
        category: ITEM_CATEGORY.ATTACK,
        target: ITEM_TARGET.OPPONENT,
        duration: 1,
        description: "상대를 현재 페이지의 랜덤 링크로 강제 이동시킵니다.",
        useCondition: "has_links",
    },
    {
        id: "highlight_links",
        name: "링크 하이라이트",
        rarity: ITEM_RARITY.NORMAL,
        category: ITEM_CATEGORY.SUPPORT,
        target: ITEM_TARGET.SELF,
        duration: 1,
        description: "현재 페이지 링크 중 유용해 보이는 링크를 강조합니다.",
        useCondition: "has_links",
    },
    {
        id: "cleanse_shield",
        name: "방어하기",
        rarity: ITEM_RARITY.NORMAL,
        category: ITEM_CATEGORY.SUPPORT,
        target: ITEM_TARGET.SELF,
        duration: 10000,
        description: "현재 방해 효과를 제거하고 10초간 공격 면역을 얻습니다.",
        useCondition: "always",
    },
    {
        id: "search_once",
        name: "검색 기능",
        rarity: ITEM_RARITY.NORMAL,
        category: ITEM_CATEGORY.SUPPORT,
        target: ITEM_TARGET.SELF,
        duration: 1,
        description: "현재 문서에서 게임 내 찾기 기능을 1회 사용할 수 있습니다.",
        useCondition: "always",
    },
    {
        id: "go_back",
        name: "뒤로가기",
        rarity: ITEM_RARITY.RARE,
        category: ITEM_CATEGORY.SUPPORT,
        target: ITEM_TARGET.SELF,
        duration: 1,
        description: "직전에 보던 문서로 돌아갑니다.",
        useCondition: "has_history",
    },
    {
        id: "random_teleport",
        name: "랜덤 텔레포트",
        rarity: ITEM_RARITY.RARE,
        category: ITEM_CATEGORY.JOKER,
        target: ITEM_TARGET.SELF,
        duration: 1,
        description: "임의의 다른 문서로 이동합니다.",
        useCondition: "always",
    },
    {
        id: "double_blind",
        name: "서로 화면 가리기",
        rarity: ITEM_RARITY.RARE,
        category: ITEM_CATEGORY.JOKER,
        target: ITEM_TARGET.BOTH,
        duration: 3500,
        description: "양쪽 모두 화면이 잠시 가려집니다.",
        useCondition: "always",
    },
    {
        id: "mini_game",
        name: "미니게임",
        rarity: ITEM_RARITY.RARE,
        category: ITEM_CATEGORY.JOKER,
        target: ITEM_TARGET.BOTH,
        duration: 1,
        description: "짧은 미니게임 후 승자가 추가 효과를 획득합니다.",
        useCondition: "always",
    },
    {
        id: "swap_target",
        name: "목표 문서 교환",
        rarity: ITEM_RARITY.RARE,
        category: ITEM_CATEGORY.JOKER,
        target: ITEM_TARGET.BOTH,
        duration: 1,
        description: "서로의 목표 문서를 바꿉니다.",
        useCondition: "always",
    },
    {
        id: "swap_current",
        name: "현재 문서 교환",
        rarity: ITEM_RARITY.RARE,
        category: ITEM_CATEGORY.JOKER,
        target: ITEM_TARGET.BOTH,
        duration: 1,
        description: "서로의 현재 문서를 바꿉니다.",
        useCondition: "always",
    },
];

/**
 * 시작 시 지급용 더미 랜덤 로직
 * - 총 개수 동일
 * - rare 개수 동일
 */
export function generateInitialInventory({
    total = 4,
    rareCount = 1,
} = {}) {
    const normalPool = ITEM_DEFS.filter((i) => i.rarity === ITEM_RARITY.NORMAL);
    const rarePool = ITEM_DEFS.filter((i) => i.rarity === ITEM_RARITY.RARE);

    const pickUnique = (pool, count) => {
        const copy = [...pool];
        const result = [];
        while (copy.length && result.length < count) {
            const idx = Math.floor(Math.random() * copy.length);
            result.push(copy.splice(idx, 1)[0]);
        }
        return result;
    };

    const rareItems = pickUnique(rarePool, rareCount);
    const normalItems = pickUnique(normalPool, Math.max(0, total - rareCount));

    return [...rareItems, ...normalItems].map((item, index) => ({
        ...item,
        instanceId: `${item.id}-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
        used: false,
    }));
}