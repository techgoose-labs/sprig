# dog-grid — jank (one labeled live sample, not a benchmark)

The grid has no animation of its own: `document.getAnimations()` is empty at settle. Its only motion is each child card's hover shadow (see ../../dog-card/screenshots/motion.json), so there is no motion.json or filmstrip here.

Run: headless Chromium, 1280x900, theme brand, `#/board`, 32 cards. 8 x 250 px wheel scrolls, 120 ms apart. Unscrubbed.

| metric | value |
|---|---|
| frames sampled | 101 |
| dropped frames (>25 ms) | 0.0 % |
| max frame time | 16.8 ms |
| long-animation-frame entries > 50 ms | 1 (100.8 ms — buffered, from initial render of 32 cards + Lucide createIcons) |
| CLS | 0.0001 |

## Static lint findings
- Inherited from children: `transition-property: box-shadow` on every `a.card` (see dog-card). Rebuild fix: pseudo-element shadow + `opacity`.
- JS: none of the checklist patterns. Observation, not a checklist lint: a filter-tab click re-renders the whole `#app` with `innerHTML` and then runs `lucide.createIcons()` over the page (see js/dog-grid.js, `renderBoard`).
