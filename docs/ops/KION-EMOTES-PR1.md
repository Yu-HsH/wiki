# Kion emotes PR-1 — visual UI integration

## Goal
- Approved ten-sticker Kion WebP set: hello, ready, go, good, wait, hurry, wow, lol, sad, gg
- Shared UI components: KionEmoteSticker / KionEmoteBubble / KionEmotePicker
- Keep current group spectator RPC ID whitelist and cooldown behavior.
- This PR is **not** new lobby/gameplay send functionality, and introduces **no database changes**.

## Asset upload gate
Ten optimized transparent 256px WebPs (~274KB total) were generated and packaged in the ChatGPT conversation (2026-11-10) as `wiki-race-kion-emotes-pr1.zip`.

**They have not yet been committed to GitHub**, since the connected GitHub text-file tool cannot transfer binary files directly from the artifact container. Copy the ten files into `public/assets/wiki-race/emotes/` on this feature branch before marking ready/merging. Local KionEmoteSticker currently falls back to an emoji if an image is missing; this protects preview UX but **is not** a release approval.

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
