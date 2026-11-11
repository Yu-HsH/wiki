# Kion emotes PR-1 — visual UI integration

## Goal
- Approved ten-sticker Kion WebP set: hello, ready, go, good, wait, hurry, wow, lol, sad, gg
- Shared UI components: KionEmoteSticker / KionEmoteBubble / KionEmotePicker
- Keep current group spectator RPC ID whitelist and cooldown behavior.
- This PR is **not** new lobby/gameplay send functionality, and introduces **no database changes**.

## Asset status: committed to PR branch
All ten optimized, transparent 256×256 WebPs (~274KB total) were approved on 2026-11-10 and committed to `public/assets/wiki-race/emotes/` using Git blobs. No manual upload is required.

Retain the fallback glyph for unavailable images. Before considering a production release, validate 10/10 asset HTTP 200 responses in Vercel Preview, mobile/desktop visibility, and no regression to group spectator behavior.

## Compatibility
The production spectator function `send_group_spectator_emoji_v13` still accepts only five original IDs; their payloads and database rows are unchanged. Old event IDs render via alias mapping:
- cheer -> kion-go
- wow -> kion-wow
- hurry -> kion-hurry
- clap -> kion-good
- gg -> kion-gg

New emotes are in the client-only catalogue but **not sent to the old RPC**.

## QA and merge gate
- Build, JS tests and existing 2+ account spectator QA (2-3 accounts)
- Verify all ten WebP paths load (HTTP 200) in Preview after binary files committed
- Mobile 320px/390px, split-window, keyboard Escape/outside click, reduced motion
- Ensure no regression to result, ranking, mute controls, room recovery or movement
- No Production until gate passes and owner approves.
