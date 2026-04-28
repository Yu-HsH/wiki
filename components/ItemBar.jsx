import React from "react";
const joker = pool.filter((item) => item.type === "joker");
const rareOnly = pool.filter(
    (item) => item.rarity === "rare" && item.type !== "joker"
);
const normalOnly = pool.filter(
    (item) => item.rarity !== "rare" && item.type !== "joker"
);

const selected = [
    ...pick(joker, 1),
    ...pick(rareOnly, 1),
    ...pick(normalOnly, 3),
].map((item, index) => ({
    ...item,
    instanceId: `${item.id}-${Date.now()}-${index}`,
    used: false,
}));

console.log("선택된 아이템:", selected.map((item) => item.id));

setInventory(selected);
export default function ItemBar({
    inventory = [],
    onUseItem,
    canUseItem,
}) {
    return (
        <div className="item-bar">
            {inventory.map((item) => {
                const usable = canUseItem(item);

                return (
                    <button
                        key={item.instanceId}
                        className={`item-slot ${item.used ? "item-slot--used" : ""}`}
                        disabled={!usable}
                        onClick={() => onUseItem(item.instanceId)}
                        title={`${item.name} - ${item.description}`}
                    >
                        <div className="item-slot__name">{item.name}</div>
                        <div className="item-slot__meta">
                            {item.type === "joker"
                                ? "조커"
                                : item.rarity === "rare"
                                    ? "희귀"
                                    : "일반"}
                        </div>
                    </button>
                );
            })}
        </div>
    );
}