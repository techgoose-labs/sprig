# theme-toggle — jank

Live sample (one labeled run, headless Chromium, 1280x800, dsf 1, `#/board` with 32 dog cards): click `label.swap` (brand → brand-dark), 900 ms window.

| metric | value |
|---|---|
| frames sampled | 76 |
| dropped frames (>25 ms) | 0 % |
| max frame time | 16.8 ms |
| long animation frames > 50 ms | none |
| CLS | 0 |

## Static lints

| finding | where | rebuild fix |
|---|---|---|
| icon swap animates `rotate` + `opacity` (`.swap > *` transition transform, rotate, opacity .2s cubic-bezier(0,0,.2,1), only under `prefers-reduced-motion: no-preference`) | `css/theme-toggle.matched.css` | compositor-friendly — no fix needed |
| button itself transitions `box-shadow` (daisyUI `.btn` rule, captured as CSSTransition on hover/focus after click) | `css/theme-toggle.matched.css` `.btn` | drop `box-shadow` from the transition list or pseudo-element shadow + `opacity` |
| theme flip starts a page-wide color-transition cascade (see `motion.json` `pageCascade`: every `.btn` and board status card transitions color/bg/border 150–200 ms; header/body surfaces without transitions snap instantly → brief mixed-palette frames) | whole page | acceptable (measured 0 % dropped); a rebuild wanting a clean flip can suppress transitions for one frame on theme change (e.g. a `[data-theme-switching] * { transition: none }` class removed next frame) |

JS: `setTheme` is a single attribute write — no finding.
