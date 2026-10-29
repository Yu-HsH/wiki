/** Presentation only, bounded browser-local result IDs. No names/tokens or reward writes. */
export function claimResultMotion(storage, identity) {
  if (!storage || !identity) return false;
  const key = "wiki-race-result-motion-v1";
  try {
    const stored = JSON.parse(storage.getItem(key) || "[]");
    if (!Array.isArray(stored) || stored.includes(identity) || stored.length >= 256) return false;
    // Fail closed at capacity instead of evicting old IDs and replaying their celebration.
    storage.setItem(key, JSON.stringify([...stored, identity]));
    return true;
  } catch { return false; }
}

export function formatRecordDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
