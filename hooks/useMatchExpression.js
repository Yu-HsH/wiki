import { useEffect, useState } from "react";
import { fetchOwnMatchExpression } from "../services/profileRewardService.js";

const EMPTY = Object.freeze({ finish_effect: null, path_color: null });

/**
 * 본인이 장착한 경기 표현을 읽는다 (16d 판정 4 — 결과 화면). `userId`가 없으면(게스트·아직 결과 전)
 * 읽지 않는다. 실패하면 빈 값 — 결과 화면을 막지 않는다.
 *
 * @param {string|null} userId
 * @returns {{finish_effect: object|null, path_color: object|null}}
 */
export default function useMatchExpression(userId) {
  const [expression, setExpression] = useState(EMPTY);

  useEffect(() => {
    if (!userId) {
      setExpression(EMPTY);
      return undefined;
    }
    let cancelled = false;
    fetchOwnMatchExpression(userId)
      .then((value) => {
        if (!cancelled) setExpression(value ?? EMPTY);
      })
      .catch((error) => {
        console.error("경기 표현을 불러오지 못했습니다.", error);
        if (!cancelled) setExpression(EMPTY);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return expression;
}
