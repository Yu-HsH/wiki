export function getKstCourseDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
}

export function getKstWeekRange(date = new Date()) {
  const monday = new Date(`${getKstCourseDate(date)}T00:00:00Z`);
  monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
  const sunday = new Date(monday);
  sunday.setUTCDate(sunday.getUTCDate() + 6);
  return `${monday.toISOString().slice(0, 10)} ~ ${sunday.toISOString().slice(0, 10)} (KST)`;
}

// A fallback is an offline practice course, never a confirmed server course.
export function requireDailyCourse(challenge, { online = true, date = new Date() } = {}) {
  if (!challenge?.startTitle || !challenge?.keyword ||
      challenge.challengeDate !== getKstCourseDate(date) ||
      (online && challenge.source !== "supabase")) {
    throw new Error("오늘의 공식 코스를 확인하지 못했습니다. 홈에서 다시 시도해주세요.");
  }
  return { startTitle: challenge.startTitle, targetTitle: challenge.keyword };
}
