import React, { useState } from "react";

export default function ItemBar({
    inventory = [],
    onUseItem,
    canUseItem,
}) {
    const [open, setOpen] = useState(false);
    const usableCount = inventory.filter((item) => !item.used && canUseItem(item)).length;

    return (
        <aside className={`item-panel ${open ? "item-panel--open" : ""}`}>
            <button
                type="button"
                className="item-panel-toggle"
                onClick={() => setOpen((prev) => !prev)}
            >
                🎒 아이템 {usableCount}
            </button>

            {open && (
                <div className="item-panel__body">
                    {inventory.map((item) => {
                        const usable = canUseItem(item);

                        return (
                            <button
                                key={item.instanceId}
                                className={`item-card ${item.used ? "item-card--used" : ""}`}
                                disabled={!usable}
                                onClick={() => onUseItem(item.instanceId)}
                                title={`${item.name} - ${item.description}`}
                            >
                                <div className="item-card__top">
                                    <span className="item-card__name">{item.name}</span>
                                    <span className={`item-card__badge item-card__badge--${item.type || item.rarity}`}>
                                        {item.type === "joker"
                                            ? "조커"
                                            : item.rarity === "rare"
                                                ? "희귀"
                                                : "일반"}
                                    </span>
                                </div>
                                <p className="item-card__desc">{item.description}</p>
                            </button>
                        );
                    })}
                </div>
            )}
        </aside>
    );
}