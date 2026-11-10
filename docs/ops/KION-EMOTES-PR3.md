# Kion PR-3 — 1:1 / Group waiting-room reactions (Draft)

## Dependency chain
- Base branch: `feat/kion-emotes-ui-20261110` (PR #55).
- Runtime RPC contract: PR #56 `send_room_emote_v1`. The small shared service and pure event helper are staged in this branch *only* so PR-3 compiles while both prerequisite PRs remain Draft.
- **After #55/#56 merge:** rebase PR-3 onto main and remove any duplicate shared service/test additions in the diff.

## Implemented
- `RoomLobbyEmotes` mounted under the 1:1 / group waiting-room headers; same UI in both.
- Reuses the ten image presets and accessible picker from PR #55.
- Subscribes only to `room_events` INSERT events filtered by room ID, accepts only `room_emote`, then normalizes server-owned IDs.
- Fetches recent room reaction history after subscription; displays only reactions from the last 6 seconds and one latest reaction per participant.
- Sender name is derived from current room participant snapshots; no arbitrary nickname or message is submitted.
- Send uses PR #56's `sendRoomEmote`, with client-side 3-second UX cooldown layered on top of server-authoritative rate limit.
- Realtime channel cleanup on room change/unmount; narrow viewport wrapping and prefers-reduced-motion support.
- Does not change room readiness, game start, XP, game results, legacy spectator reactions, chat or database schema.

## Release gate (fail closed)
- `VITE_ENABLE_KION_ROOM_EMOTES` defaults OFF. No lobby UI (and no RPC) is rendered without literal `true`.
- Do not enable in Production while PR #56's migration is not applied and its server/runtime validation incomplete.
- Only a joined player in a waiting room sees the dock. Spectators, missing users and finished/playing room pages do not show it.
- PR-3 is UI-only. No Production merge, provider config or database deployment.

## QA
- Required: npm test, Vite build, 320px / 390px / 768px / 1280px visual QA, keyboard/ESC, overlapping buttons, reduced motion.
- Required after PR #56's isolated DB is ready: two accounts in separate clients in both 1:1/group; reconnect and F5, 3s flood prevention; unknown/expired room rejection; cross-room RLS; stale event dismissal. 
- Current status: static wiring tests and CI browser/build checks are prepared; **real 2-account Realtime roundtrip not yet tested**.
