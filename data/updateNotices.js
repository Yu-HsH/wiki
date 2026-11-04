// Add only actually released changes as 'released'. Planned work stays 'planned'.
// Public date is the announcement date, not an assumed deployment date.
export const UPDATE_NOTICES = Object.freeze([
  {
    id: "2026-11-04-jungle-ambient-preview",
    date: "2026-11-04",
    type: "개발 소식",
    status: "planned",
    title: "탐험 캠프에 새로운 움직임을 준비하고 있어요",
    summary: "배너 선명도 개선과 정글 애니메이션, 업데이트 소식 기능을 준비하고 있습니다.",
    details: [
      "나뭇잎, 반딧불, 햇살처럼 자연스럽고 가벼운 움직임을 검토 중입니다.",
      "HOME 배너 선명도 문제는 고해상도 원본을 확인한 뒤 해결할 예정입니다.",
      "개선 사항은 검수와 배포가 완료되면 별도로 안내하겠습니다.",
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
      "싱글·1:1·그룹 탐험과 새로운 랭킹 및 업적 시스템을 만나보세요.",
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
