# Jank — live, unscrubbed sample

One labeled sample (Chromium headless, playwright-core from the isolate runner, 1280×viewport, dsf 1, prototype host on :8744, fresh server state). rAF deltas, long-animation-frame and layout-shift entries are counted only from the instrumentation start (t0), so page-load work is excluded. Numbers vary run to run — not a benchmark.

| run | trigger | frames | dropped (>25ms) | max frame | LoAF >50ms (after t0) | CLS (after t0) |
|---|---|---|---|---|---|---|
| close-day-control: failing write | click Close the day, #demo-fail on | 92 | 0% | 16.8 ms | none | 0 |
| close-day-control: accepted write | click Close the day (real reply) | 92 | 1.1% | 33.3 ms | none | 0 |

## Static lints (CSS + JS)

- **Animated `box-shadow` on hover** — daisyUI `.btn` transitions `color, background-color, border-color, box-shadow, transform` 200ms `cubic-bezier(0,0,.2,1)`; the hover run spawned a `box-shadow` CSSTransition (plus background-color and 4× border-*-color). Measured cost is nil at this size (0 dropped frames), but it is the lint. **Rebuild:** keep the colour transitions; drop `box-shadow` from the transition list (or pre-render the shadow on a `::after` and fade its `opacity`).
- `transform` is in the transition list but the `:active` press uses the separate `translate: 0 .5px` property, which is NOT transitioned — the 0.5px press snaps. Rebuild as-is (instant press) or add `translate` to the list deliberately.
- No `transition: all`, no layout-property keyframes.
- Pending spinner: daisyUI `.loading-spinner` is an SMIL-animated SVG in `mask-image` (rotate 2s linear + dash 1.5s). Invisible to `getAnimations()`, un-scrubbable; it repaints the 16px mask every frame (negligible). **Rebuild:** keep daisyUI `loading loading-spinner loading-sm` as-is, or a CSS `@keyframes` `transform: rotate()` spinner if it must be testable via `_motion`.
- The button's label swaps from "Close the day" (148.8px) to "Closing the day…" (172px) while pending — width grows 23px; the control is right-aligned in a `flex-wrap justify-between` row so the left edge shifts (no CLS recorded since it's input-driven). At 375 the wider pending button wraps onto its own line under the heading. **Rebuild:** reserve a min-width or keep the label width stable.
- Toast entrance: daisyUI `.toast>*` `@keyframes toast {0%{opacity:0;scale:.9} to{opacity:1;scale:1}}` .25s ease-out (only under `prefers-reduced-motion: no-preference`) — compositor-only, no finding.
- **JS `setTimeout(() => el.remove(), 3500)`** in `toast()` — not a frame-driven animation, but the toast has NO exit animation: it vanishes and any toast stacked above it jumps down. **Rebuild:** keep the 3.5s dwell, exit with an opacity/scale transition (or `@starting-style`/`transitionend` removal) instead of an abrupt `remove()`.
- **Whole-view re-render per intent** — `runStatus`/`addNote`/`closeDay` call `render()`, which replaces `$app.innerHTML` for the entire page and re-runs `lucide.createIcons()` over the document, twice per write (intent + reply). Measured: 0–1.1% dropped frames, no long animation frames, CLS 0 — not a jank problem at this size, but it destroys focus/inputs (the notes form is rebuilt; the failure path has to re-query `#note-form [name=text]` to restore the text). **Rebuild:** island-local state update (signals), patch only the unit.
- No forced synchronous layout, no scroll/rAF handlers, no setInterval.
