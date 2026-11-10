// Read-only public fallback when Supabase is not configured or unavailable.
// The source of truth after the news-admin migration is public.site_news_posts.
export const UPDATE_NOTICES = Object.freeze([
  {
    id: "2026-11-10-wiki-race-2-0-2",
    date: "2026-11-10",
    type: "업데이트",
    status: "released",
    title: "Wiki Race 2.0.2 — 탐험 환경 개선",
    summary: "오늘의 도전 단어 22개 추가와 온라인 재경기, 공개방·문서 탐험 편의성을 개선했습니다.",
    details: [
      "오늘의 도전 단어 후보가 기존 17개에서 39개로 늘어났습니다. 생활·과학·역사·문화·IT 등 다양한 분야의 22개를 추가하고 최근 목표 반복도 줄였습니다.",
      "활동이 끝난 공개 대기방이 목록에 오래 남는 현상을 개선했습니다.",
      "1:1·그룹 경기 종료 후 방장이 같은 멤버로 새 비공개 재경기 준비방을 만들 수 있습니다. 참가자는 선택하여 입장합니다.",
      "모바일과 작은 화면의 문서 목차 위치를 개선하고, 목차와 '맨 위로' 버튼이 겹치는 문제를 해결했습니다.",
      "문서 이동과 게임 화면 전환 과정에서 발생하던 일부 불편한 동작을 개선했습니다.",
      "기존 오늘의 도전 기록·XP·랭킹 데이터는 유지됩니다. 불편한 점이나 아이디어가 있으면 언제든 알려주세요.",
    ],
  },
  {
    id: "2026-11-05-jungle-veil-home",
    date: "2026-11-05",
    type: "업데이트",
    status: "released",
    title: "새로운 정글 시작 화면과 탐험대 소식",
    summary: "숲길이 열리는 HOME, 움직이는 랜딩과 업데이트 안내를 새롭게 선보입니다.",
    details: [
      "HOME 배너에 마우스를 올리면 숲길이 열리고, 배너를 누르면 모드 선택으로 이동합니다. 모바일에서도 한 번의 터치로 시작할 수 있습니다.",
      "랜딩의 탐험 랜턴과 정글 환경 효과를 보강하고, 글씨와 인증 버튼을 선명하게 정리했습니다.",
      "상단 '소식' 메뉴에서 업데이트 및 개선 사항을 확인할 수 있습니다.",
      "이번 업데이트는 화면 및 안내 기능 개선이며 게임 규칙, XP 및 경기 기록은 변경되지 않습니다.",
    ],
  },
  {
    id: "2026-10-09-todays-exploration",
    date: "2026-10-09",
    type: "업데이트",
    status: "released",
    title: "오늘의 탐험이 추가됐어요",
    summary: "모두가 같은 시작과 목표 문서로 도전하는 일일 탐험을 만나보세요.",
    details: [
      "오늘의 탐험 코스는 하루 단위로 바뀝니다.",
      "같은 코스를 완주한 탐험가들의 기록을 비교할 수 있습니다.",
    ],
  },
  {
    id: "2026-10-06-wiki-race-v2",
    date: "2026-10-06",
    type: "업데이트",
    status: "released",
    title: "Wiki Race 2.0 업데이트",
    summary: "혼자 탐험하고, 친구와 경쟁하고, 경험치를 쌓는 Wiki Race 2.0이 출시됐습니다.",
    details: [
      "싱글·1:1·그룹 탐험과 랭킹 및 업적 시스템을 만나보세요.",
      "피드백을 바탕으로 화면과 게임 플레이를 계속 개선하겠습니다.",
    ],
  },
]);

export const UPDATE_READ_KEY = "wiki-race-updates-last-seen-v1";
export function getLatestNoticeId(notices = UPDATE_NOTICES) { return notices[0]?.id || ""; }
export function hasUnreadUpdates(storage = (typeof window !== "undefined" ? window.localStorage : null), latestId = getLatestNoticeId()) {
  try { return Boolean(latestId) && storage?.getItem(UPDATE_READ_KEY) !== latestId; }
  catch { return false; }
}
export function markUpdatesRead(storage = (typeof window !== "undefined" ? window.localStorage : null), latestId = getLatestNoticeId()) {
  try { storage?.setItem(UPDATE_READ_KEY, latestId); return true; }
  catch { return false; }
}
