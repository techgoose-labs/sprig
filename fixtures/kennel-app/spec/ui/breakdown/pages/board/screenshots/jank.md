# board — jank (one labeled live sample, headless Chromium, 1280x800, DPR 1, http://localhost:8742/#/board; not a benchmark)

| Run | Frames | Dropped (>25ms) | Max frame | LoAF >50ms | CLS |
|---|---|---|---|---|---|
| Initial load `#/board` (loading skeleton → live, 450ms fake latency), 3s window | 209 | 1.0% | 33.3ms | 1 × 556ms (first frame, t≈11ms) | 0.0005 |
| `?state=loading` (skeleton shimmer running), 3s window | 213 | 0.5% | 33.3ms | 1 × 531ms (first frame) | 0.0001 |
| Dog-card hover across d01–d05 (box-shadow transition) | 89 | 1.1% | 33.3ms | none | 0 |

- The single long frame on load: LoAF attribution shows only 21ms of script (Tailwind browser 16ms, page inline 5ms), blockingDuration 0 — it is the first frame waiting on render-blocking CDN resources (daisyUI CSS, Tailwind browser JIT, Google Fonts). Prototype-only; a built sprig page ships compiled CSS. Not a component finding.
- CLS 0.0004 on load: sources `NAV.flex items-center gap-1` (header nav — lucide `<i>`→`<svg>` swap / font load), three `.tab` buttons and a card's arrival `span.ml-auto`. Rebuild: render icons server-side as inline SVG with fixed `size-*`, preload/`font-display` the Quicksand/Caveat fonts.
- Loading → live swap: `#app.innerHTML` is replaced wholesale; getAnimations() right after the swap = 0 (no entrance motion). CLS stays ~0 because the skeleton grid mirrors the live grid.

## Static lints (extracted CSS `css/board.css`, `css/board-states.css`; JS `js/board.js`)

| Finding | Where | Rebuild fix |
|---|---|---|
| Animated `box-shadow` on hover | dog card `a.card.hover:shadow-sm.transition-shadow` (150ms, cubic-bezier(0.4,0,0.2,1), none → `0 1px 3px rgba(0,0,0,.1), 0 1px 2px -1px rgba(0,0,0,.1)`) | pre-render the shadow on a `::after` pseudo-element and transition its `opacity` |
| Skeleton shimmer animates `background-position` (non-composited; repaints every frame for 36 elements, infinite) | daisyUI `.skeleton` — `@keyframes skeleton` 1.8s ease-in-out infinite, `will-change: background-position` | move the gradient to a `::after` and animate `transform: translateX()`; or render a static skeleton (loading lasts ~450ms) |
| Full `#app.innerHTML` re-render + `lucide.createIcons()` whole-document scan on every filter click / hashchange | `render()`, delegated `$app` click handler | measured 0.8–2.7ms per click, no LoAF — no jank at 32 cards; rebuild renders server-side (filter as a query param / Partial) so this disappears |
| `setTimeout(…, 450)` in `setDemo()` | fake latency, not animation | n/a — delete in the rebuild (demo-only) |
| No scroll handlers, no layout reads in loops, no `transition: all` declared (`.tab`/`.badge` compute the initial `all 0s`) | — | — |
