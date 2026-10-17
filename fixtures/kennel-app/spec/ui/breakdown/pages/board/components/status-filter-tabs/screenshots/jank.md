# status-filter-tabs — jank (one labeled live sample, headless Chromium, 1280x800, DPR 1, #/board; not a benchmark)

No motion (computed `.tab` transition-duration 0s, animation none; getAnimations() after a tab click = 0).

| Run | Frames | Dropped (>25ms) | Max frame | LoAF >50ms | CLS |
|---|---|---|---|---|---|
| Click each tab booked → checked-in → walking → checked-out → all, 250ms apart | 91 | 0% | 16.8ms | none | 0 |

Synchronous click→render cost (performance.now around `.click()`): 2.2, 2.2, 0.8, 2.7 ms (full `#app.innerHTML` + `lucide.createIcons()`).

## Static lints

| Finding | Where | Rebuild fix |
|---|---|---|
| At 375px the tablist overflows (scrollWidth 393 > clientWidth 351, `overflow-x-auto flex-nowrap`); the active tab is not scrolled into view after selection (scrollLeft stays 0 with `checked-out` active) | `div[role=tablist].tabs.tabs-box.overflow-x-auto` | rebuild: `scrollIntoView({inline:"nearest"})` the active tab on render, or keep it server-rendered with the active tab near the start |
| No transitions/animations; no scroll/rAF handlers | — | — |
