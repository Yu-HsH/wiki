import { useEffect, useState } from "react";
import { cardLookupIds, fetchProfileCards } from "../services/profileRewardService.js";

/**
 * 남의 카드 장착 상태를 배치 한 번으로 읽는다 (트랙 17b, N+1 회피).
 *
 * 랭킹 50행·그룹 대기실 8명이 각자 단건 RPC를 부르지 않도록, 화면이 가진 사용자 ID 집합으로
 * `get_profile_cards_v1`을 **집합이 바뀔 때만** 한 번 부른다. 같은 집합의 재렌더(준비 상태
 * 변화, 행 펼치기 등)는 다시 부르지 않는다 — 의존성이 정렬된 ID 문자열이기 때문이다.
 *
 * 실패해도 빈 객체로 남는다. 호출자는 `mergeRewardSlots(rowCard, cards[userId])`로 쓰고,
 * 결과가 없으면 행 데이터만으로 그린다 (C5 §3 fallback 그대로).
 *
 * @param {Array<string|null|undefined>} userIds
 * @returns {Record<string, object>} userId → 서버 카드
 */
export default function useProfileCards(userIds) {
  const ids = cardLookupIds(userIds).sort();
  const key = ids.join(",");
  const [cards, setCards] = useState({});

  useEffect(() => {
    if (!key) {
      setCards({});
      return undefined;
    }
    let cancelled = false;
    fetchProfileCards(key.split(","))
      .then((result) => {
        if (!cancelled) setCards(result);
      })
      .catch((error) => {
        console.error("프로필 카드 배치 조회 실패:", error);
        if (!cancelled) setCards({});
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  return cards;
}
