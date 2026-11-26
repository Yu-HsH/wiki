/** The existing server contracts use three disjoint code formats. */
export function readRoomCode(value) {
  const code = String(value ?? "").trim().toUpperCase();
  if (/^[A-Z0-9]{6}$/.test(code)) return { code, family: "legacy" };
  if (/^[A-F0-9]{16}$/.test(code)) return { code, family: "duel" };
  if (/^[A-F0-9]{12}$/.test(code)) return { code, family: "group" };
  throw new Error(code ? "ROOM_CODE_INVALID" : "ROOM_CODE_REQUIRED");
}
