import React from "react";

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
                            {item.rarity === "rare" ? "희귀" : "일반"}
                        </div>
                    </button>
                );
            })}
        </div>
    );
}