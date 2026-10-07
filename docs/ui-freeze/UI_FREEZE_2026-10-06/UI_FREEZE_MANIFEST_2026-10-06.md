# Wiki Race 2.0 UI Freeze Manifest

Freeze audit date: 2026-10-06

Source package: 새 폴더.zip

## Verified files

### `01_HOME_FINAL.html`

- SHA-256: `87f573745e489d836dbe544c2632e66fd42207215b37de8ec72e6a092c9b7d0d`
- PASS — HOME · Base Camp export; approved HOME component/resource bundle present.

### `02_PLAY_FINAL.html`

- SHA-256: `0bdde1ebe5f762859e50718b710db9d586537df4ccb8c233dc5f4ffbe88597cd`
- PASS — full-card mode targets; 싱글 시작 / 1:1 로비 / 그룹 로비; 오늘의 탐험 strip present.

### `03_DUEL_LOBBY_FINAL.html`

- SHA-256: `975bdff05832ec22c70fdeb2d3ffc6e1e0f429d7d4723a864d51f4769ce3cd20`
- PASS — no READY gameplay step; host target selection + guest immediate target visibility. READY appears only in explanatory note (“READY 단계 없음”).

### `04_GROUP_LOBBY_FINAL.html`

- SHA-256: `b872622a87ce7fef1b5ace008954d249836d7f7f92f55dca3917c969757a07ca`
- PASS — 3–8명 · 20분 · 무아이템 · 동일 코스; candidate selection → READY; distinct-candidate start condition present.

### `05_DUEL_RACE_FINAL.html`

- SHA-256: `de31e183a488fb650faf0f2adbd88f881e0f95c3b8225249cb90f551a1463101`
- PASS — 링크만 보기 + 링크 검열 present; no strikethrough marker. “빠른 링크” occurrences are removal/explanatory text, not an always-on quick-links UI.

### `06_GROUP_RACE_FINAL.html`

- SHA-256: `323107d2a92e5085f59ecd1803152c6b37b1bcfbe34e8b23e0965648f922be93`
- PASS — no quick-links block; actual grace HUD uses “마감까지”; reconnect/retire/result-finalizing states present. NOTE: review-board heading still says “진행 · 추가 시간 · 관전 상태”; treat this as stale board wording only, not product copy.

### `07_DUEL_RESULT_FINAL.html`

- SHA-256: `3f245ec17816581b6b1579d9947fb4b483342ac0bf9960ced3a9b8811a75ee92`
- PASS — 승리/패배 RESULT variants; COMPLETE/INCOMPLETE language and frozen result structure present.

### `08_GROUP_RESULT_FINAL.html`

- SHA-256: `7212eb299d11d1238c92f18724f08639639c285a6273097ae80a1af355dca4c7`
- PASS — latest retired-player → final B flow present; 2a B-retired case, retired · final → C then B, no spectator entry for retired users.

## Authority notes

- These eight files are the UI visual freeze set. Production code/backend contracts remain functional authority.
- Mock names, XP, routes, timers, and local prototype interactions are not production data/contracts.
- Later product decisions override older wireframe text when they conflict.
- For Group RACE, use `마감까지` in the actual HUD; ignore the stale review-board heading phrase `추가 시간`.
- For Duel RACE, censored links are gray + disabled with **no strikethrough**.
- Always-on Quick Links are removed from Single / Duel / Group.