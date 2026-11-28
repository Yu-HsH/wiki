import React, { useId } from "react";
import { FinalItemIcon } from "../../group-items-jungle/FinalAssetVfx.jsx";
import { itemName, tierLabel } from "../../group-items-jungle/s5UiContract.js";
import { itemRaceRule } from "./itemRaceRules.js";
import "./itemRaceSlots.css";

export function ItemRaceDescription({ itemId, tier, mode = "group" }) {
  const [effect, condition] = itemRaceRule(itemId,tier,mode);
  const grade = tierLabel(tier) || "일반";
  return <><strong>{itemName(itemId)} · {grade}</strong><span>{effect}</span><small>{condition}</small></>;
}

export default function ItemRaceSlots({ items, selected, supplySeconds, select, expanded, panelId, duel = false, suppliedGrant, rewardGrants = [] }) {
  const id = useId();
  return <div className="item-race-slots" role="group" aria-label="보급과 아이템 슬롯">
    <div className="item-race-slot-list">
      {items.map((item, index) => <div className="item-race-slot-wrap" key={index}>
        <button type="button" className="item-race-slot" disabled={!item} data-available={item?.available}
          aria-expanded={item ? expanded && selected === item.key : undefined}
          aria-controls={item && expanded && selected === item.key ? panelId : undefined}
          aria-label={item ? `${index + 1}번 슬롯 ${itemName(item.itemId)} ${tierLabel(item.tier) || "일반"}` : `${index + 1}번 빈 슬롯`}
          aria-describedby={item ? `${id}-${index}` : undefined}
          data-item-id={item?.itemId} data-duel-v4-item={duel ? item?.itemId : undefined}
          onClick={event => item && select(item, event)}>
          <span className="item-race-slot-number" aria-hidden="true">{index + 1}</span>
          {item ? <FinalItemIcon item={{ itemId: item.itemId, effectiveTier: item.tier }} /> : <span aria-hidden="true">—</span>}
          {item && (item.key===suppliedGrant || rewardGrants.includes(item.key)) && <i className="item-race-slot-arrival" key={item.key}
            data-reward={rewardGrants.includes(item.key) || undefined} aria-hidden="true"/>}
        </button>
        {item && <span className="item-race-tooltip" id={`${id}-${index}`} role="tooltip">
          <ItemRaceDescription itemId={item.itemId} tier={item.tier} mode={duel?"duel":"group"} />
          {!item.available && <small>지금 사용할 수 없습니다.</small>}
        </span>}
      </div>)}
    </div>
    <span className="item-race-supply" role="timer">
      <span>다음 보급</span><strong>{supplySeconds == null ? "—" : `${supplySeconds}초`}</strong>
    </span>
  </div>;
}
