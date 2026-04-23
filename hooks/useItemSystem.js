import { useCallback, useEffect, useRef, useState } from "react";
import { ITEM_DEFS } from "../data/items";
import { SINGLE_ITEM_IDS, MULTI_ITEM_IDS } from "../data/itemPools";
import {
    addEffect,
    buildTimedEffect,
    canUseItem as canUseItemBase,
    clearExpiredEffects,
    markItemUsed,
    removeEffect,
} from "../utils/itemSystem";

/**
 * 공통 아이템 시스템 훅
 *
 * mode:
 * - "single"
 * - "multi"
 *
 * 외부 콜백:
 * - onMove(title, options?)
 * - onRandomTeleport()
 */
export default function useItemSystem({
    mode = "single",
    links = [],
    onMove,
    onRandomTeleport,
}) {
    const [inventory, setInventory] = useState([]);
    const [activeEffects, setActiveEffects] = useState({ self: [], opponent: [] });
    const [immunityUntil, setImmunityUntil] = useState({ self: 0, opponent: 0 });
    const [translateCurrentPage, setTranslateCurrentPage] = useState(false);
    const [historyStack, setHistoryStack] = useState([]);
    const [searchAvailable, setSearchAvailable] = useState(false);
    const [highlightedLinks, setHighlightedLinks] = useState([]);
    const [floatingMessage, setFloatingMessage] = useState("");

    const messageTimerRef = useRef(null);

    const allowedIds = mode === "single" ? SINGLE_ITEM_IDS : MULTI_ITEM_IDS;

    const showMessage = useCallback((message, duration = 1800) => {
        setFloatingMessage(message);

        if (messageTimerRef.current) {
            clearTimeout(messageTimerRef.current);
        }

        messageTimerRef.current = setTimeout(() => {
            setFloatingMessage("");
        }, duration);
    }, []);

    useEffect(() => {
        return () => {
            if (messageTimerRef.current) {
                clearTimeout(messageTimerRef.current);
            }
        };
    }, []);

    // 지속 효과 만료 정리
    useEffect(() => {
        const interval = setInterval(() => {
            setActiveEffects((prev) => ({
                self: clearExpiredEffects(prev.self),
                opponent: clearExpiredEffects(prev.opponent),
            }));
        }, 500);

        return () => clearInterval(interval);
    }, []);

    /**
     * 시작 인벤토리 생성
     * - 모드별 허용 아이템만 사용
     * - total / rareCount를 맞추되 허용 풀 안에서만 뽑음
     */
    const initializeItems = useCallback(
        ({ total = 4, rareCount = 1 } = {}) => {
            const allowedPool = ITEM_DEFS.filter((item) => allowedIds.includes(item.id));
            const rarePool = allowedPool.filter((item) => item.rarity === "rare");
            const normalPool = allowedPool.filter((item) => item.rarity !== "rare");

            const pickUnique = (pool, count) => {
                const copy = [...pool];
                const result = [];

                while (copy.length && result.length < count) {
                    const idx = Math.floor(Math.random() * copy.length);
                    result.push(copy.splice(idx, 1)[0]);
                }

                return result;
            };

            const pickedRare = pickUnique(rarePool, Math.min(rareCount, rarePool.length));
            const pickedNormal = pickUnique(
                normalPool,
                Math.max(0, total - pickedRare.length)
            );

            const selected = [...pickedRare, ...pickedNormal].map((item, index) => ({
                ...item,
                instanceId: `${item.id}-${Date.now()}-${index}-${Math.random()
                    .toString(36)
                    .slice(2, 8)}`,
                used: false,
            }));

            setInventory(selected);
            setActiveEffects({ self: [], opponent: [] });
            setImmunityUntil({ self: 0, opponent: 0 });
            setTranslateCurrentPage(false);
            setHistoryStack([]);
            setSearchAvailable(false);
            setHighlightedLinks([]);
            setFloatingMessage("");
        },
        [allowedIds]
    );

    const pushHistory = useCallback((title) => {
        if (!title) return;
        setHistoryStack((prev) => [...prev, title]);
    }, []);

    const clearPageScopedEffects = useCallback(() => {
        setTranslateCurrentPage(false);
        setHighlightedLinks([]);
    }, []);

    const consumeSearchAvailable = useCallback(() => {
        setSearchAvailable(false);
    }, []);

    const canUseItem = useCallback(
        (item) => {
            return canUseItemBase(item, {
                historyStack,
                links,
            });
        },
        [historyStack, links]
    );

    const useItem = useCallback(
        async (instanceId) => {
            const item = inventory.find((i) => i.instanceId === instanceId);
            if (!item) return;

            const usable = canUseItem(item);
            if (!usable || item.used) return;

            setInventory((prev) => markItemUsed(prev, item.instanceId));

            switch (item.id) {
                case "highlight_links": {
                    const candidates = (links || []).slice(0, 3);
                    setHighlightedLinks(candidates);
                    showMessage("링크 하이라이트!");
                    break;
                }

                case "search_once": {
                    setSearchAvailable(true);
                    showMessage("페이지 내 검색 1회 가능");
                    break;
                }

                case "go_back": {
                    if (!historyStack.length) {
                        showMessage("뒤로갈 문서가 없습니다.");
                        break;
                    }

                    const previousTitle = historyStack[historyStack.length - 1];
                    setHistoryStack((prev) => prev.slice(0, -1));

                    if (onMove) {
                        await onMove(previousTitle, { fromItem: true });
                    }

                    showMessage("뒤로가기 사용");
                    break;
                }

                case "random_teleport": {
                    if (onRandomTeleport) {
                        await onRandomTeleport();
                        showMessage("랜덤 텔레포트!");
                    } else {
                        showMessage("랜덤 텔레포트 콜백이 없습니다.");
                    }
                    break;
                }

                case "cleanse_shield": {
                    setActiveEffects((prev) => ({
                        ...prev,
                        self: removeEffect(
                            removeEffect(prev.self, "blind"),
                            "translate_current"
                        ),
                    }));
                    setImmunityUntil((prev) => ({
                        ...prev,
                        self: Date.now() + 10000,
                    }));
                    showMessage("방해 해제 + 10초 면역");
                    break;
                }

                // 아래는 멀티용. 싱글에서는 인벤토리 풀에서 제외하는 것이 기본.
                case "blind": {
                    if (mode !== "multi") {
                        showMessage("싱글에서는 사용할 수 없는 아이템입니다.");
                        break;
                    }

                    setActiveEffects((prev) => ({
                        ...prev,
                        self: addEffect(prev.self, buildTimedEffect("blind", item.duration)),
                    }));
                    showMessage("시야 가리기!");
                    break;
                }

                case "translate_current": {
                    if (mode !== "multi") {
                        showMessage("싱글에서는 사용할 수 없는 아이템입니다.");
                        break;
                    }

                    setTranslateCurrentPage(true);
                    showMessage("언어변경 효과 발동");
                    break;
                }

                default: {
                    showMessage(`${item.name} 사용`);
                    break;
                }
            }
        },
        [
            inventory,
            canUseItem,
            historyStack,
            links,
            mode,
            onMove,
            onRandomTeleport,
            showMessage,
        ]
    );

    return {
        inventory,
        activeEffects,
        immunityUntil,
        translateCurrentPage,
        historyStack,
        searchAvailable,
        highlightedLinks,
        floatingMessage,

        initializeItems,
        pushHistory,
        clearPageScopedEffects,
        consumeSearchAvailable,

        setSearchAvailable,
        setHighlightedLinks,
        setTranslateCurrentPage,
        setActiveEffects,
        setImmunityUntil,

        useItem,
        canUseItem,
    };
}