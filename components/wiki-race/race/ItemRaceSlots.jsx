import React, { useId } from "react";
import { FinalItemIcon } from "../../group-items-jungle/FinalAssetVfx.jsx";
import { itemName, tierLabel } from "../../group-items-jungle/s5UiContract.js";
import "./itemRaceSlots.css";

const descriptions = {
  ink: ["상대 화면에 먹물을 튀겨 시야를 가립니다.", "경기 중인 상대에게 사용합니다."],
  censor: ["상대 문서의 일부 링크를 잠급니다.", "이동 중인 상대에게 사용합니다."],
  trap: ["상대가 링크를 누르면 깜짝상자가 발동합니다.", "상대의 현재 문서에서 링크를 선택하세요."],
  lost_link: ["상대를 다른 문서로 강제 이동시킵니다.", "상대 문서에 이동 가능한 링크가 필요합니다."],
  bookmark: ["현재 문서를 저장해 나중에 돌아옵니다.", "저장한 문서와 다른 문서에서 복귀할 수 있습니다."],
  undo: ["이전 문서로 돌아갑니다.", "되돌릴 이동이 필요합니다."],
  search: ["현재 문서에서 검색어를 찾아 강조합니다.", "문서 내 검색을 열고 검색어를 입력하세요."],
  link_index: ["현재 문서의 이동 링크를 목록으로 표시합니다.", "현재 문서에 이미 목록이 열려 있으면 사용할 수 없습니다."],
  parry: ["공격을 차단하고 등급에 따라 반사합니다.", "공격 경고에서 시간이 끝나기 전에 패링을 누르세요."],
  shield: ["받는 공격을 막는 보호막을 켭니다.", "편집보호가 활성 상태일 때는 다시 사용할 수 없습니다."],
  correction: ["나에게 걸린 효과를 해제합니다.", "해제할 효과가 있어야 합니다."],
  thunder: ["상대에게 감전과 아이템 봉인을 일으킵니다.", "공격이 실패하면 자신에게 페널티가 생길 수 있습니다."],
  thief: ["상대가 가진 아이템을 가져옵니다.", "상대에게 가져올 수 있는 아이템이 필요합니다."],
  roulette: ["확률에 따라 보상을 받거나 다음 보급이 약해집니다.", "결과는 서버 판정으로 확정됩니다."],
  cannon: ["상대 문서로 이동을 시도합니다.", "상대가 다른 문서에 있어야 합니다."],
  enhancement: ["보유 아이템이나 다음 보급에 강화 효과를 적용합니다.", "현재 가방과 아이템 등급에 따라 적용 대상이 정해집니다."],
  weakening: ["상대의 아이템을 약화합니다.", "경기 중인 상대에게 사용합니다."],
};

export function ItemRaceDescription({ itemId, tier }) {
  const [effect, condition] = descriptions[itemId] ?? [];
  const grade = tierLabel(tier) || "일반";
  return <><strong>{itemName(itemId)} · {grade}</strong><span>{effect}</span><small>{condition}</small></>;
}

export default function ItemRaceSlots({ items, selected, supplySeconds, select, expanded, panelId, duel = false }) {
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
        </button>
        {item && <span className="item-race-tooltip" id={`${id}-${index}`} role="tooltip">
          <ItemRaceDescription itemId={item.itemId} tier={item.tier} />
          {!item.available && <small>지금 사용할 수 없습니다.</small>}
        </span>}
      </div>)}
    </div>
    <span className="item-race-supply" role="timer">
      <span>다음 보급</span><strong>{supplySeconds == null ? "—" : `${supplySeconds}초`}</strong>
    </span>
  </div>;
}
