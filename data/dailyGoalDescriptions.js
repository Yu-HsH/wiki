/**
 * Display-only clues for the 17 active daily challenge targets verified on 2026-11-06.
 * The server still controls courses, scores, records and XP.
 */
export const DAILY_GOAL_DESCRIPTIONS = Object.freeze({
  "벤치 프레스": "누워서 바벨이나 덤벨을 밀어 올리는 대표적인 근력 운동입니다. 운동·인체 분야와 관련이 있습니다.",
  "고래상어": "아주 큰 몸집을 가졌지만 작은 먹이를 걸러 먹는 어류입니다. 해양 생물·자연 분야와 관련이 있습니다.",
  "GPT (언어 모델)": "사람의 언어를 처리하고 글을 생성하는 인공지능 언어 모델 계열입니다. 컴퓨터·언어 분야와 관련이 있습니다.",
  "교황 프란치스코": "아르헨티나 출신으로 로마 가톨릭교회의 제266대 교황을 지낸 인물입니다. 종교·세계사 분야와 관련이 있습니다.",
  "SQL": "관계형 데이터베이스에서 데이터를 조회하고 수정하는 데 쓰이는 언어입니다. 컴퓨터·정보 기술 분야와 관련이 있습니다.",
  "백준 온라인 저지": "프로그래밍 문제를 풀어 제출하면 자동으로 채점해 주는 온라인 서비스입니다. 알고리즘·컴퓨터 분야와 관련이 있습니다.",
  "생맥주": "주로 술집이나 음식점에서 탭으로 따라 제공하는 맥주입니다. 음료·양조 문화 분야와 관련이 있습니다.",
  "레드벨벳 (아이돌)": "대한민국의 여성 대중음악 그룹입니다. 음악·대중문화 분야와 관련이 있습니다.",
  "메이플스토리": "다른 이용자들과 함께 온라인 세계를 탐험하는 롤플레잉 게임입니다. 게임·인터넷 문화 분야와 관련이 있습니다.",
  "라면": "면과 조미료를 함께 끓이거나 뜨거운 물에 익혀 먹는 식품입니다. 음식·생활 문화 분야와 관련이 있습니다.",
  "카카오톡": "메시지나 통화 등을 주고받는 모바일 메신저 서비스입니다. 통신·인터넷 분야와 관련이 있습니다.",
  "화성": "태양계에서 태양으로부터 네 번째에 있는 행성입니다. 천문학·우주 탐사 분야와 관련이 있습니다.",
  "한강": "한반도 중부를 흐르며 서울을 지나는 큰 강입니다. 지리·도시 분야와 관련이 있습니다.",
  "월드 와이드 웹": "인터넷 위에서 서로 연결된 웹 문서와 정보를 탐색할 수 있게 하는 정보 시스템입니다. 컴퓨터·통신 분야와 관련이 있습니다.",
  "김치": "채소를 양념해 발효시키는 한국의 대표적인 음식입니다. 음식·한국 문화 분야와 관련이 있습니다.",
  "훈민정음": "조선 세종 때 창제된 문자와 그 원리를 설명한 책의 이름입니다. 문자·한국 역사 분야와 관련이 있습니다.",
  "광합성": "식물 등이 빛 에너지를 이용해 유기물을 만드는 과정입니다. 생물·식물 분야와 관련이 있습니다.",
});

const GENERIC_DAILY_HINTS = new Set([
  "오늘의 단어에서 만든 탐험 코스",
  "실제 위키 링크로 연결된 오늘의 공통 코스",
  "오늘의 도전이 준비됐습니다.",
  "Today's Supabase challenge is ready.",
]);

// Keep special server-authored hints, and leave unknown targets undefined rather than inventing a definition.
export function resolveDailyGoalHint(targetTitle, serverHint) {
  const title = typeof targetTitle === "string" ? targetTitle.trim() : "";
  const hint = typeof serverHint === "string" ? serverHint.trim() : "";
  if (hint && !GENERIC_DAILY_HINTS.has(hint)) return hint;
  return DAILY_GOAL_DESCRIPTIONS[title] || hint || "목표 문서와 관련된 분야를 탐험해 보세요.";
}
