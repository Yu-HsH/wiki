import { supabase, isSupabaseConfigured } from "../supabaseClient";

const FALLBACK_DAILY_POOL = [
  {
    keyword: "서울특별시",
    hint: "대한민국에서 수도 문서까지 이동해보세요.",
    startTitle: "대한민국",
    source: "fallback",
  },
  {
    keyword: "인터넷",
    hint: "컴퓨터에서 인터넷 문서까지 이동해보세요.",
    startTitle: "컴퓨터",
    source: "fallback",
  },
  {
    keyword: "고양이",
    hint: "동물에서 익숙한 반려동물 문서까지 이동해보세요.",
    startTitle: "동물",
    source: "fallback",
  },
  {
    keyword: "김치",
    hint: "음식에서 한국의 대표 음식 문서까지 이동해보세요.",
    startTitle: "음식",
    source: "fallback",
  },
  {
    keyword: "축구",
    hint: "스포츠에서 인기 구기 종목 문서까지 이동해보세요.",
    startTitle: "스포츠",
    source: "fallback",
  },
  {
    keyword: "지구",
    hint: "과학에서 우리가 사는 행성 문서까지 이동해보세요.",
    startTitle: "과학",
    source: "fallback",
  },
  {
    keyword: "한글",
    hint: "대한민국에서 우리 문자 문서까지 이동해보세요.",
    startTitle: "대한민국",
    source: "fallback",
  },
];

function getKstDateString(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(date);
}

export function getFallbackDailyChallenge(date = new Date()) {
  const kstDate = getKstDateString(date);
  const seed = Number(kstDate.replaceAll("-", ""));
  const picked = FALLBACK_DAILY_POOL[seed % FALLBACK_DAILY_POOL.length];

  return {
    ...picked,
    challengeDate: kstDate,
  };
}

export async function fetchTodayDailyChallenge() {
  const fallback = getFallbackDailyChallenge();

  if (!isSupabaseConfigured || !supabase) {
    return fallback;
  }

  const { data: ensuredData, error: ensureError } = await supabase
    .rpc("ensure_today_daily_challenge");

  if (!ensureError && ensuredData?.[0]?.target_title) {
    const challenge = ensuredData[0];

    return {
      keyword: challenge.target_title,
      hint: challenge.hint || "오늘의 도전이 준비됐습니다.",
      startTitle: challenge.start_title || null,
      challengeDate: challenge.challenge_date,
      source: "supabase",
    };
  }

  const { data, error } = await supabase
    .from("daily_challenges")
    .select("challenge_date, start_title, target_title, hint")
    .eq("challenge_date", fallback.challengeDate)
    .maybeSingle();

  if (error || !data?.target_title) {
    return fallback;
  }

  return {
    keyword: data.target_title,
    hint: data.hint || "Today's Supabase challenge is ready.",
    startTitle: data.start_title || null,
    challengeDate: data.challenge_date,
    source: "supabase",
  };
}
