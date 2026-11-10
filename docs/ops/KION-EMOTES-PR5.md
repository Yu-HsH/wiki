# Kion PR-5 — optional duel/group departure countdown companion

## Scope and design
- Reuses PR #55's approved **kion-ready.webp** and **kion-go.webp**; no new art assets or audio.
- Active only for 1:1 and group countdowns. Decorative, pointer-events:none, aria-hidden; countdown number remains the accessible announcement.
- The 3/2/1 steps sway with the ready sticker and the final "시작!" step shows a brief go hop.
- Timing remains **700ms per numerical step, 500ms on 시작**, with original tick/go audio and completion callback unchanged.
- No changes to VsIntroOverlay / GroupPickOverlay choreography, move authority, timers, matching, XP, results or stats.
- Prefers-reduced-motion disables all decorative animation.

## Safety gate
- Separate literal opt-in: `VITE_ENABLE_KION_COUNTDOWN_ANIMATION=true`.
- Default Production OFF and absent from unsupported modes and `motionEligible=false` (recovery).
- No user interaction and no Supabase dependencies in the companion.
- This is stacked on PR #58/#57/#55, as Draft. No Vercel or Production deployment.

## Test plan
- Node tests for mode/step eligibility, reduced motion, preserved countdown step timings and sound hooks.
- Chromium 320/390/768/1280px gallery: image integrity, ready/go mapping, 8 visible companions, unsupported modes absent, optional animation on regular motion, reduced motion off, underlying button click, viewport overflow.
- Validate in actual gameplay after prerequisite PR approvals and backend testing.
