# Approved Freeze assets

Source: `docs/ui-freeze/UI_FREEZE_2026-10-06/01_HOME_FINAL.html` and `02_PLAY_FINAL.html`.
The frozen HTML files are read-only. No new mascot variants or fonts were generated/copied.

HOME PNGs are decoded byte-for-byte from the manifest using its `__bundler/ext_resources` IDs:

| File | Resource ID |
|---|---|
| explorer-portrait.png | portrait |
| explorer-portrait-small.png | portraitSmall |
| explorer-home.png | mascotHome |
| hero-landscape.png | heroLandscape |
| mini-route.png | miniRoute |
| gear-cluster.png | gearCluster |

PLAY `explorer-play.png` is PNG resource UUID `80051267-79c5-4518-9a3a-3fabc5249f8e`.
`route-solo.svg`, `route-duel.svg`, `route-group.svg` are the three approved 150×86 inline
vignettes in the PLAY template. Only the template's `sc-camel-view-box` attribute is
normalized to `viewBox`, and the SVG namespace is added for standalone files.

No prototype JavaScript, framework runtime, mock data, or interaction logic is reused.
