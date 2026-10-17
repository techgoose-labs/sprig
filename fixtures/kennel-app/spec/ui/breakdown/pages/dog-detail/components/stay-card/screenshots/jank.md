# Jank — live, unscrubbed sample

One labeled sample (Chromium headless, playwright-core from the isolate runner, 1280×viewport, dsf 1, prototype host on :8744, fresh server state). rAF deltas, long-animation-frame and layout-shift entries are counted only from the instrumentation start (t0), so page-load work is excluded. Numbers vary run to run — not a benchmark.

| run | trigger | frames | dropped (>25ms) | max frame | LoAF >50ms (after t0) | CLS (after t0) |
|---|---|---|---|---|---|---|
| stay-card: scroll | wheel 600px over dog detail (no animation in unit) | 73 | 0% | 16.8 ms | none | 0 |

## Static lints

- CSS: no keyframes, no transitions on the card (only daisyUI's `transition: outline .2s ease-in-out` focus rule, matched via `.card`/`.badge` component CSS; not animated in this unit). No findings.
- JS: none — markup is a template string inside `renderDetail()`; no scroll/rAF/layout reads.
