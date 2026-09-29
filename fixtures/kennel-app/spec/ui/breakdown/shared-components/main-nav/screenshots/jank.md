# main-nav — jank

Live sample (one labeled run, headless Chromium, 1280x800, dsf 1, served prototype on :8741): click `a[data-nav="summary"]` from `#/board` (hash route change → full `#app` re-render), 1000 ms window.

| metric | value |
|---|---|
| frames sampled | 79 |
| dropped frames (>25 ms) | 1.3 % |
| max frame time | 33.3 ms |
| long animation frames > 50 ms | none |
| CLS | 0 |

## Static lints

| finding | where | rebuild fix |
|---|---|---|
| hover transitions `box-shadow` (daisyUI `.btn`: `transition-property: color, background-color, border-color, box-shadow, transform; .2s cubic-bezier(0,0,.2,1)`) — captured on hover as a CSSTransition on `box-shadow` | `css/main-nav.matched.css` `.btn` | low impact at btn-sm size; if kept custom, drop `box-shadow` from the transition list or pre-render the shadow on `::after` and animate its `opacity` |

JS: no scroll/rAF/layout-read handlers. `hashchange` does `scrollTo(0,0)` + full re-render — no finding.
