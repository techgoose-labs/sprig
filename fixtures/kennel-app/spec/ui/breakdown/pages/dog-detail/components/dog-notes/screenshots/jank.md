# Jank — live, unscrubbed sample

One labeled sample (Chromium headless, playwright-core from the isolate runner, 1280×viewport, dsf 1, prototype host on :8744, fresh server state). rAF deltas, long-animation-frame and layout-shift entries are counted only from the instrumentation start (t0), so page-load work is excluded. Numbers vary run to run — not a benchmark.

| run | trigger | frames | dropped (>25ms) | max frame | LoAF >50ms (after t0) | CLS (after t0) |
|---|---|---|---|---|---|---|
| dog-notes: failing write | submit note on d01, #demo-fail on | 91 | 1.1% | 33.3 ms | none | 0 |
| dog-notes: accepted write | submit note on d02 (real reply) | 91 | 1.1% | 33.3 ms | none | 0 |

## Static lints (CSS + JS)

- **Animated `box-shadow` on hover** — daisyUI `.btn` transitions `color, background-color, border-color, box-shadow, transform` 200ms `cubic-bezier(0,0,.2,1)`; the hover run spawned a `box-shadow` CSSTransition (plus background-color and 4× border-*-color). Measured cost is nil at this size (0 dropped frames), but it is the lint. **Rebuild:** keep the colour transitions; drop `box-shadow` from the transition list (or pre-render the shadow on a `::after` and fade its `opacity`).
- `transform` is in the transition list but the `:active` press uses the separate `translate: 0 .5px` property, which is NOT transitioned — the 0.5px press snaps. Rebuild as-is (instant press) or add `translate` to the list deliberately.
- No `transition: all`, no layout-property keyframes.
- The pending note is `opacity-50` with no transition (snaps in/out) — no finding; a rebuild may fade it but the mock does not.
- The note list uses `divide-y divide-base-content/10`; Tailwind browser does not generate `divide-base-content/10` (base-content is a daisyUI colour, not a Tailwind theme colour, and daisyUI's CDN ships no `divide-*` utilities), so the dividers render at full `currentColor` rgb(59,42,30) instead of 10%. Rendering defect, not jank — flagged so the spec-writer decides which the build honours.
- Toast entrance: daisyUI `.toast>*` `@keyframes toast {0%{opacity:0;scale:.9} to{opacity:1;scale:1}}` .25s ease-out (only under `prefers-reduced-motion: no-preference`) — compositor-only, no finding.
- **JS `setTimeout(() => el.remove(), 3500)`** in `toast()` — not a frame-driven animation, but the toast has NO exit animation: it vanishes and any toast stacked above it jumps down. **Rebuild:** keep the 3.5s dwell, exit with an opacity/scale transition (or `@starting-style`/`transitionend` removal) instead of an abrupt `remove()`.
- **Whole-view re-render per intent** — `runStatus`/`addNote`/`closeDay` call `render()`, which replaces `$app.innerHTML` for the entire page and re-runs `lucide.createIcons()` over the document, twice per write (intent + reply). Measured: 0–1.1% dropped frames, no long animation frames, CLS 0 — not a jank problem at this size, but it destroys focus/inputs (the notes form is rebuilt; the failure path has to re-query `#note-form [name=text]` to restore the text). **Rebuild:** island-local state update (signals), patch only the unit.
- No forced synchronous layout, no scroll/rAF handlers, no setInterval.
