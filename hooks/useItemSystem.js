import { useCallback, useEffect, useRef, useState } from "react";
import { ITEM_DEFS } from "../data/items";
import { SINGLE_ITEM_IDS, MULTI_ITEM_IDS } from "../data/itemPools";
import { canUseItem as canUseItemBase } from "../utils/itemSystem";

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

    const itemStorageKey =
        mode === "single" ? "wiki-single-items" : null;
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
    const [status, setStatus] = useState({
        blind: false,
        immuneUntil: 0,
        translateCurrent: false,
    });
    useEffect(() => {
        return () => {
            if (messageTimerRef.current) {
                clearTimeout(messageTimerRef.current);
            }
        };
    }, []);

    // 지속 효과 만료 정리
    useEffect(() => {
        if (!itemStorageKey) return;

        try {
            const saved = JSON.parse(localStorage.getItem(itemStorageKey) || "null");

            if (saved?.inventory?.length > 0) {
                setInventory(saved.inventory);
            }
        } catch (e) {
            console.error("아이템 복구 실패:", e);
        }
    }, [itemStorageKey]);

    /**
     * 시작 인벤토리 생성
     * - 모드별 허용 아이템만 사용
     * - total / rareCount를 맞추되 허용 풀 안에서만 뽑음
     */
    const initializeItems = useCallback(
        ({ total = 4, rareCount = 1 } = {}) => {
            if (itemStorageKey) {
                const saved = JSON.parse(localStorage.getItem(itemStorageKey) || "null");

                if (saved?.inventory?.length > 0) {
                    setInventory(saved.inventory);
                    return;
                }
            }
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

            if (itemStorageKey) {
                localStorage.setItem(
                    itemStorageKey,
                    JSON.stringify({
                        inventory: selected,
                        savedAt: Date.now(),
                    })
                );
            }

            setActiveEffects({ self: [], opponent: [] });
            setImmunityUntil({ self: 0, opponent: 0 });
            setTranslateCurrentPage(false);
            setHistoryStack([]);
            setSearchAvailable(false);
            setHighlightedLinks([]);
            setFloatingMessage("");
            setStatus({
                blind: false,
                immuneUntil: 0,
                translateCurrent: false,
            });
        },
        [allowedIds, itemStorageKey]
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
    const [highlightRequestId, setHighlightRequestId] = useState(0);
    const useItem = useCallback(
        async (instanceId) => {
            const item = inventory.find((i) => i.instanceId === instanceId);
            if (!item) return;

            const usable = canUseItem(item);
            if (!usable || item.used) return;

            setInventory((prev) => {
                const next = prev.map((item) =>
                    item.instanceId === instanceId ? { ...item, used: true } : item
                );

                if (itemStorageKey) {
                    localStorage.setItem(
                        itemStorageKey,
                        JSON.stringify({
                            inventory: next,
                            savedAt: Date.now(),
                        })
                    );
                }

                return next;
            });

            switch (item.id) {
                case "highlight_links": {
                    setHighlightRequestId((prev) => prev + 1);
                    showMessage("유망한 링크 표시!");
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
                    setStatus({
                        blind: false,
                        immuneUntil: Date.now() + 10000,
                    });

                    showMessage("상태 해제 + 10초 면역");
                    break;
                }

                // 멀티 전용 공격 아이템은 이 훅에서 직접 네트워크 이벤트를 보내지 않는다.
                case "blind": {
                    showMessage("이 아이템은 멀티플레이에서만 사용할 수 있습니다.");
                    break;
                }

                case "translate_current": {
                    if (Date.now() < status.immuneUntil) return;

                    setStatus((prev) => ({
                        ...prev,
                        translateCurrent: true,
                    }));

                    showMessage("현재 문서가 영어로 바뀌었습니다!");
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
            status.immuneUntil,
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
        highlightRequestId,
        status,


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
