// Source-of-truth for public notices. Status "released" is presented only after
// this release branch is merged into Production; previews are not public release evidence.
export const UPDATE_NOTICES = Object.freeze([
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
export function getLatestNoticeId() { return UPDATE_NOTICES[0]?.id || ""; }
export function hasUnreadUpdates(storage = (typeof window !== "undefined" ? window.localStorage : null)) {
  try { return Boolean(getLatestNoticeId()) && storage?.getItem(UPDATE_READ_KEY) !== getLatestNoticeId(); }
  catch { return false; }
}
export function markUpdatesRead(storage = (typeof window !== "undefined" ? window.localStorage : null)) {
  try { storage?.setItem(UPDATE_READ_KEY, getLatestNoticeId()); return true; }
  catch { return false; }
}
