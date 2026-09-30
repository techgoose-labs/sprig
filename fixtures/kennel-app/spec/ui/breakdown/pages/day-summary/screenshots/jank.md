# day-summary — live jank sample (one labeled run, not a benchmark)

Captured 2026-09-29, headless Chromium (isolate-runner playwright-core), deviceScaleFactor 1, served by `deno task start` on :8745, seed data.

| Run | Viewport | Trigger | Frames | Dropped (>25 ms) | Max frame | LoAF > 50 ms | CLS |
|---|---|---|---|---|---|---|---|
| hover + click "Close the day" → real `day.close` reply (89 ms) → re-render | 1280×900 | hover 400 ms, click, wait 1.5 s | 124 | 0 % | 16.8 ms | 0 | 0 |
| click "Close the day" → reply (76 ms) → re-render | 375×812 | click, wait 1.5 s | 94 | 0 % | 16.8 ms | 0 | 0 |
| scroll | 375×812 | wheel +600 / −600 | 122 | 0 % | 16.8 ms | 0 | 0 |
| route change #/board → #/summary | 375×812 | `location.hash` | 145 | 0 % | 16.8 ms | 0 | 0 |

## Caveat on CLS = 0

`render()` rebuilds `#app` with `innerHTML` on every state change, so every node is new and the
Layout Instability API records no shift. The eye still sees one: when the close reply lands the
`day-closed-alert` is inserted above the stats and everything below jumps down —
measured from the stills: stats top 172→238 px at ≥640 (alert 46 px + `mb-5` 20 px = **66 px**),
160→246 px at 375 (alert wraps to 66 px + 20 = **86 px**).
The header action also swaps (`#close-day` button → `badge badge-neutral badge-lg` "Day closed").

## Motion present (extracted — see motion.json, filmstrip.png)

- `#close-day` (`.btn.btn-primary`, daisyUI) hover: CSSTransition on `background-color`, `border-*-color`,
  `box-shadow`; 200 ms, `cubic-bezier(0, 0, 0.2, 1)`, delay 0. Declared `transition-property: color, background-color, border-color, box-shadow, transform`.
  bg rgb(194,65,12) → oklab(0.5147 0.1267 0.1005) (primary darkened).
- Pending spinner (`.loading.loading-spinner.loading-sm`, 20 px): **SMIL inside a CSS `mask-image` data-URI**
  (rotate 0→360 over 2 s; stroke-dasharray 0,150→42,150→42,150 and dashoffset 0→−16→−59, keyTimes 0;0.475;1, 1.5 s; infinite).
  Invisible to `getAnimations()` and not scrubbable — `filmstrip-spinner-realtime.png` is real-time sampled every ~125 ms (non-deterministic).
- `.card` (both section cards): `transition: outline .2s ease-in-out` — focus ring only; the cards are not focusable here, never fires.
- No entrance animation on the page; `animate-rise`/`brand-rise` is defined in the theme CSS but unused on #/summary.
- `prefers-reduced-motion: reduce` clamps every animation/transition to 0.01 ms.

## Static lint findings (+ rebuild fix)

| Finding | Where | Rebuild with |
|---|---|---|
| Animated `box-shadow` on hover (daisyUI `.btn` transitions box-shadow; hover changes its colored drop-shadow) | `#close-day` — css/matched-rules.css `.btn` | Accept as the library default for one button, or pre-render the shadow on `::after` and transition its `opacity` |
| Whole-region `innerHTML` re-render on every state change (pending → closed) | js/summary.js `render()` / `renderSummary()` | Patch only the header action + insert the alert; reserve the alert's space or animate its entrance (`grid-template-rows: 0fr→1fr` / `transform`+`opacity`) so the 66–86 px push-down isn't a hard jump |
| `setTimeout`-driven toast removal (3.5 s) and fake 450 ms latency | js/summary.js `toast()`, `setDemo()` | Not animation (hard remove, no exit motion) — no jank; if an exit transition is added use CSS/`animationend`, not a timer |
| `lucide.createIcons()` rescans the whole document after every render | js/summary.js `render()` | Rebuild renders icons as inline SVG at template time |

No layout-property keyframes, no `transition: all`, no scroll handlers, no layout reads in rAF/scroll loops, no `will-change` needed.
