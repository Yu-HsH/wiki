import React from "react";

export default function ItemBar({
    inventory = [],
    onUseItem,
    canUseItem,
}) {
    return (
        <aside className="item-panel">
            <div className="item-panel__header">
                <strong>아이템</strong>
                <span>{inventory.filter((item) => !item.used).length}개 사용 가능</span>
            </div>

            <div className="item-panel__list">
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

                            <p className="item-card__desc">
                                {item.description}
                            </p>

                            <div className="item-card__state">
                                {item.used ? "사용 완료" : usable ? "사용 가능" : "대기 중"}
                            </div>
                        </button>
                    );
                })}
            </div>
        </aside>
    );
}