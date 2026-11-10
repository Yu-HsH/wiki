# Kion PR-3 — 1:1 / Group waiting-room reactions (Draft)

## Dependency chain
- Base branch: `feat/kion-emotes-ui-20261110` (PR #55).
- Runtime RPC contract: PR #56 `send_room_emote_v1`. The small shared service and pure event helper are staged in this branch *only* so PR-3 compiles while both prerequisite PRs remain Draft.
- **After #55/#56 merge:** rebase PR-3 onto main and remove any duplicate shared service/test additions in the diff.

## Implemented
- Shared `useRoomLobbyEmotes` transport hook mounted once per real 1:1/group waiting-room page. No global incoming reaction feed.
- **Actual player-card speech bubbles**: duel host/right opponent/empty slot distinction; each occupied group roster row owns one reaction, empty seats never display one.
- Picker moved to the end of each player region: below the duel VS cards or below the group participant roster.
- Uses the existing `ProfileCard`, READY and name badges without moving game logic; image + short label in rounded parchment card, pointer inert.
- Reuses the ten image presets and accessible picker from PR #55.
- Subscribes only to `room_events` INSERT events filtered by room ID, accepts only `room_emote`, then normalizes server-owned IDs.
- Fetches recent room reaction history after subscription; displays only reactions from the last 6 seconds and one latest reaction per participant.
- Sender name is derived from current room participant snapshots; no arbitrary nickname or message is submitted.
- Send uses PR #56's `sendRoomEmote`, with client-side 3-second UX cooldown layered on top of server-authoritative rate limit.
- Realtime channel cleanup on room change/unmount; narrow viewport 320/390/768/1280 and prefers-reduced-motion support.
- Latest server-accepted reaction is keyed to the emitting user, shown for six seconds, then removed. Stale history and nonmember events cannot become a bubble.
- Bubble layout reserves a fixed display slot for each occupied player while the flag is on so reactions do not cause row reflow. No bubble on empty slots, no overlay over document-picker/READY controls.
- Does not change room readiness, game start, XP, game results, legacy spectator reactions, chat or database schema.

## Release gate (fail closed)
- `VITE_ENABLE_KION_ROOM_EMOTES` defaults OFF. No lobby UI (and no RPC) is rendered without literal `true`.
- Do not enable in Production while PR #56's migration is not applied and its server/runtime validation incomplete.
- Only a joined player in a waiting room sees the dock. Spectators, missing users and finished/playing room pages do not show it.
- PR-3 is UI-only. No Production merge, provider config or database deployment.

## QA
- Required: npm test, Vite build, 320px / 390px / 768px / 1280px visual QA, keyboard/ESC, overlapping buttons, reduced motion.
- Required after PR #56's isolated DB is ready: two accounts in separate clients in both 1:1/group; reconnect and F5, 3s flood prevention; unknown/expired room rejection; cross-room RLS; stale event dismissal. 
- GitHub Actions: unit regression/build and browser viewport/card-geometry tests verify the **real existing duel/group card classes**, profile/READY hit targets, picker, 10 images, and screenshot artifacts. See PR checks.
- **Real 2-account Realtime roundtrip is still BLOCKED**: latest PR #56 disposable CI sees authorized DB event reads but no `postgres_changes` delivery. Do not enable Production flag or merge/deploy this as complete until that separate issue is resolved.

## Final isolated card-layout QA (2026-11-10)
- **PASS**: https://github.com/Yu-HsH/wiki/actions/runs/42836723021
- Node unit + full JS regression + Vite build passed on the final head prior to this documentation-only addition.
- Chromium tested 320/390/768/1280px using the existing real duel/group player classes and ProfileCard renderer. 
- All speech cards stay inside their occupied player cards; none overlaps profile avatar, name, host/my tags or ready-status badge. Empty seats have none.
- Real ProfileCard and READY/search controls remain clickable and editable. Picker offers 10 choices; selecting one updates only the corresponding participant; ESC closes it. Reduced motion is respected.
- A detected 768px duel avatar overlap was fixed by reserving a top speech zone on mid-size screens and re-tested successfully.
- Visual artifacts: `kion-lobby-pr3-screenshots` (320, 390, 768, 1280) on the action run. These are isolated representations with real page classes, **not screenshots of the deployed production app**.
- Vercel build-rate limit persists; no Production DB, migrations, flags, or deployments changed.
