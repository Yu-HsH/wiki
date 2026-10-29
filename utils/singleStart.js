export const SINGLE_START_CONTRACT = 'single_reserved_prefetch_v1';
export const SINGLE_START_DURATION_MS = 8600;
export const LEGACY_SINGLE_START_DURATION_MS = 2600;
export const isReservedSingle = run => run?.timing_contract === SINGLE_START_CONTRACT;

// server_now is a lower bound at receipt: reply transit never opens the article early.
// performance.now is independent of user changes to the wall clock.
export function createSingleServerClock(serverNow, monotonicNow = () => performance.now()) {
  const anchor = Date.parse(serverNow), received = monotonicNow();
  if (!Number.isFinite(anchor)) throw new Error('SERVER_CLOCK_REQUIRED');
  return () => anchor + Math.max(0, monotonicNow() - received);
}
export function singleServerElapsed(run, serverNow) {
  const start = Date.parse(run?.started_at || run?.scheduled_start_at);
  const end = run?.finished_at ? Date.parse(run.finished_at) : serverNow;
  return Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, Math.floor((end - start) / 1000)) : 0;
}
export function singleStartFrame(milliseconds) {
  const ms = Math.max(0, Math.floor(milliseconds));
  return { ms, phase: ms < 720 ? 'opening' : ms < 2900 ? 'start' : ms < 4000 ? 'rewind' : ms < 6000 ? 'target' : ms < 8600 ? 'countdown' : 'article',
    count: ms < 6000 || ms >= 8600 ? null : ms < 6700 ? '3' : ms < 7400 ? '2' : ms < 8100 ? '1' : '시작!' };
}

// Presentation mapping only: the legacy API and 2600ms countdown deadline stay unchanged.
// Keep both document titles readable before the shorter legacy countdown.
export function singleStartVisualTime(milliseconds, durationMs = SINGLE_START_DURATION_MS) {
  if (durationMs === SINGLE_START_DURATION_MS) return milliseconds;
  const points = [[0,0],[250,720],[650,2900],[1000,4000],[1400,6000],[2600,8600]];
  const ms = Math.max(0,milliseconds);
  for (let i=1;i<points.length;i++) {
    const [end,to]=points[i], [begin,from]=points[i-1];
    if (ms<=end) return from+(to-from)*(ms-begin)/(end-begin);
  }
  return SINGLE_START_DURATION_MS;
}

export const SINGLE_START_ERRORS = {
  RANDOM_DOCUMENT_UNAVAILABLE: '무작위 문서를 준비하지 못했습니다. 잠시 후 준비 상태를 다시 확인해주세요.',
  COURSE_ALLOCATION_LIMIT: '코스를 여러 번 바꿨습니다. 잠시 후 다시 시도해주세요.',
  ALLOCATION_EXPIRED: '코스 할당 요청이 만료됐습니다. 새 코스 준비를 요청해주세요.',
  DAILY_ROLLOVER_REQUIRED: '오늘 코스의 날짜가 바뀌는 중입니다. 새 날짜의 코스로 다시 시작해주세요.',
};
