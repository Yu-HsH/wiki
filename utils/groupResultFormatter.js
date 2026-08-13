const GROUP_RETIRE_REASON_LABELS = Object.freeze({
  time_limit: "제한 시간 초과",
  grace_timeout: "유예 시간 초과",
  forfeited: "기권",
  left: "게임 이탈",
  disconnected_timeout: "연결 끊김",
});

export function formatGroupRetireReason(reason) {
  const normalizedReason = String(reason || "").trim().toLowerCase();
  return GROUP_RETIRE_REASON_LABELS[normalizedReason] || "경기 미완주";
}
