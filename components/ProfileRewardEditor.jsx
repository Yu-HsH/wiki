import React, { useState } from "react";
import { PROFILE_CARD_SLOTS, equipErrorMessage, equippedAt } from "../utils/profileCard.js";
import { equipProfileReward, unequipProfileReward } from "../services/profileRewardService.js";

/**
 * 프로필 꾸미기 — 장착 편집 (트랙 17b, C5 §4 "프로필 = 장착 편집 진입점").
 *
 * 시안이 없어 기능 우선 최소 UI다. 슬롯 행 7개(아이콘 · 칭호 · 배지 1~3 · 프레임 · 배경)마다
 * 현재 장착과 "변경" 버튼이 있고, 열면 그 kind의 보유 목록이 펼쳐진다.
 *
 * - **보유 목록만 고를 수 있다.** 목록은 `fetchOwnRewardInventory`가 준다 (C1 §2 본인 RLS).
 * - **서버가 확정한 상태만 반영한다** (spec §10). 낙관적 갱신 없음 — 응답의 전체 장착 상태를
 *   `onEquipment`로 넘기고 호출자가 카드를 다시 만든다.
 * - **은퇴 보상** (C1-②)은 장착된 채 "은퇴" 표식으로 보이고, 해제만 할 수 있다.
 * - 모바일은 `<details>`로 접힌다 (spec §11 "모바일 보상 inventory는 접을 수 있는 섹션").
 *
 * @param {object} props
 * @param {object} props.card 현재 카드 (C5 §2)
 * @param {Array<{rewardId:string, kind:string, displayName:string, assetRef:string|null}>} props.owned
 * @param {(equipment: Array) => void} props.onEquipment
 * @param {boolean} [props.loading]
 */
export default function ProfileRewardEditor({ card, owned = [], onEquipment, loading = false }) {
  const [openKey, setOpenKey] = useState(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const rows = PROFILE_CARD_SLOTS.flatMap((definition) =>
    definition.indexes.map((slotIndex) => ({
      ...definition,
      slotIndex,
      key: `${definition.slot}:${slotIndex}`,
      rowLabel: definition.indexes.length > 1 ? `${definition.label} ${slotIndex}` : definition.label,
    }))
  );

  const run = async (request) => {
    setPending(true);
    setError("");
    try {
      const equipment = await request();
      onEquipment?.(equipment);
      setOpenKey(null);
    } catch (requestError) {
      setError(equipErrorMessage(requestError?.code));
    } finally {
      setPending(false);
    }
  };

  return (
    <details className="preward">
      <summary className="preward-summary">프로필 꾸미기</summary>

      {loading ? (
        <p className="preward-muted">보유 보상을 불러오는 중...</p>
      ) : (
        <ul className="preward-rows">
          {rows.map((row) => {
            const current = equippedAt(card, row.slot, row.slotIndex);
            const choices = owned.filter((reward) => reward.kind === row.slot);
            const isOpen = openKey === row.key;
            const panelId = `preward-panel-${row.slot}-${row.slotIndex}`;

            return (
              <li key={row.key} className="preward-row">
                <div className="preward-row-head">
                  <span className="preward-label">{row.rowLabel}</span>
                  <span className="preward-current">
                    {current ? current.displayName : "비어 있음"}
                    {current?.retired && <span className="preward-tag">은퇴</span>}
                  </span>
                  <button
                    type="button"
                    className="app-btn app-btn-ghost preward-toggle"
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    aria-label={`${row.rowLabel} 변경`}
                    onClick={() => setOpenKey(isOpen ? null : row.key)}
                    disabled={pending}
                  >
                    {isOpen ? "닫기" : "변경"}
                  </button>
                </div>

                {isOpen && (
                  <div id={panelId} className="preward-panel" role="group" aria-label={`${row.rowLabel} 선택`}>
                    {choices.length === 0 && (
                      <p className="preward-muted">보유한 보상이 없습니다.</p>
                    )}
                    {choices.map((reward) => {
                      const selected = current?.rewardId === reward.rewardId;
                      return (
                        <button
                          key={reward.rewardId}
                          type="button"
                          className={`preward-choice${selected ? " preward-choice--selected" : ""}`}
                          aria-pressed={selected}
                          disabled={pending || selected}
                          onClick={() =>
                            run(() =>
                              equipProfileReward({ slot: row.slot, slotIndex: row.slotIndex, rewardId: reward.rewardId })
                            )
                          }
                        >
                          {/* 빈 alt 금지 (C5 §3.4) — 이미지가 이름을 갖고 글자는 중복 낭독하지 않는다 */}
                          {reward.assetRef && row.slot === "profile_icon" ? (
                            <>
                              <img className="preward-choice-img" src={reward.assetRef} alt={reward.displayName} />
                              <span aria-hidden="true">{reward.displayName}</span>
                            </>
                          ) : (
                            <span>{reward.displayName}</span>
                          )}
                          {selected && <span className="preward-tag">장착 중</span>}
                        </button>
                      );
                    })}
                    {current && (
                      <button
                        type="button"
                        className="app-btn app-btn-ghost preward-clear"
                        disabled={pending}
                        onClick={() => run(() => unequipProfileReward({ slot: row.slot, slotIndex: row.slotIndex }))}
                      >
                        해제
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {error && (
        <p className="auth-error preward-error" role="alert">
          {error}
        </p>
      )}
    </details>
  );
}
