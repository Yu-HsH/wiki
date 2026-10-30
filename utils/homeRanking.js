/** HOME-only presentation. None of these tabs changes the authoritative /ranking contracts. */
export const HOME_RANKING_TABS = Object.freeze([
  Object.freeze({ key: "today", label: "오늘", title: "오늘의 빠른 완주", help: "서로 다른 시작·목표 코스의 오늘 완주 기록입니다. 난이도는 다를 수 있어요." }),
  Object.freeze({ key: "weekly", label: "이번 주", title: "이번 주 탐험가", help: "월요일 00:00(KST)부터 획득한 게임 XP · 업적 XP 제외" }),
  Object.freeze({ key: "all", label: "레벨", title: "탐험가 레벨", help: "지금까지 누적한 전체 XP 기준" }),
  Object.freeze({ key: "challenge", label: "오늘의 도전", title: "오늘의 도전 순위", help: "같은 출발·목표 문서로 경쟁하는 공식 코스 · 시간·이동 횟수 기준" }),
]);

export function nextHomeRankingTab(current) {
  const index = HOME_RANKING_TABS.findIndex(tab => tab.key === current);
  return HOME_RANKING_TABS[(index + 1) % HOME_RANKING_TABS.length].key;
}

export function homeRankUsesTime(key) {
  return key === "today" || key === "challenge";
}
