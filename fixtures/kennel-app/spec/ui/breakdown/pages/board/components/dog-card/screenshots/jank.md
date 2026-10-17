# dog-card — jank (one labeled live sample, not a benchmark)

Run: headless Chromium, 1280x900, theme brand, `#/board`. Pointer hovered cards d01→d08 in turn (180 ms each), then left. Unscrubbed.

| metric | value |
|---|---|
| frames sampled | 138 |
| dropped frames (>25 ms) | 0.0 % |
| max frame time | 16.8 ms |
| long-animation-frame entries > 50 ms | 1 (71.9 ms — buffered, includes page load/render, not hover) |
| CLS | 0.0001 |

## Motion (extracted, see motion.json + filmstrip.png)
- Trigger: pointer `:hover` on `a.card` (`hover:shadow-sm` + `transition-shadow`).
- CSSTransition `box-shadow`: `none` → `0 1px 3px 0 rgba(0,0,0,.1), 0 1px 2px -1px rgba(0,0,0,.1)` (plus 4 transparent Tailwind ring/inset layers), 150 ms, `cubic-bezier(0.4, 0, 0.2, 1)`, delay 0, fill backwards, 1 iteration. Reverses on pointer leave.

## Static lint findings
- **Animated `box-shadow` on hover** (`transition-property: box-shadow` from Tailwind `transition-shadow`, css/dog-card.rules.css). Repaints the shadow region every frame. Rebuild: put the `shadow-sm` shadow on a `::after` pseudo-element and transition its `opacity` 0→1 (150 ms, same easing).
- JS: none. The card is a string template (`dogCard()`), with no scroll, rAF, or timer logic.
