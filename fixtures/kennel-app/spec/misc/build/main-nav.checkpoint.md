# main-nav checkpoint (budget stop: _reference rows red after 3 cycles)

## Green
- Behavior tests (6/6): summary/active, dog/dog-maps-to-board, default/click-summary + labels-show, board-375/labels-hidden, hover-summary/hover.
- `sprig check` green (all 8 checks).

## Red: every `_reference` row (default/board-640/dog 0.637, summary 0.488, dark 0.645, board-375 0.574 at tol 0.005)
Root causes, none of them in src/shared-components/main-nav:
1. **Stage background (most of the diff).** The unit is transparent. Its stills were cropped from the mock header (`bg-base-100` #FBF7F0).
   The headless preview paints the workbench paper #F3EEE2 (243,238,226) under it. `fixture.json` `"background"` is documented
   (sprig:breakdown/references/isolate-format.md:47) but only the interactive workbench applies it
   (app/src/pages/workbench/components/workbench/logic.ts:329,453). The headless runner ignores it: changing it to a hex left the measured value
   unchanged at 0.6990. Proof: a probe that temporarily painted `background-color: var(--color-base-100)` on `.main-nav-row` took board-375 to
   **0.000** and default to 0.158 (reverted afterwards; the unit must not paint its parent's surface).
2. **Font asset (remaining ~0.16 on labelled cases).** bootstrap/styles.css loads Quicksand from `…/v37/6xKtdSZaM9iE8KbpRA_hK1QNYuDyPw.woff2`.
   The mock (headless) loads `…/v37/6xKtdSZaM9iE8KbpRA_hK1QN.woff2`. Measured Board link: mock 80.39px, build with bootstrap font 83.39px,
   build with the mock's file 80.39px. The geometry is then identical (icon 13/14.39, span 33.39/34, gap 4). Owner: scaffolder (bootstrap/styles.css).
3. **Sub-pixel origin.** The mock link sat at x=973.22 (fractional), so text anti-aliasing differs from an integer-origin render. Even with bg and font
   fixed, a probe measured 0.163. This is the same noise isolate-format.md documents for a fractional y (0.100).

## Ruled out
- Wrong icons: board-375 is 0.000 with bg matched (the icons are exact).
- Font-family / text color: fixed (`font-family: var(--font-body)`, `color: var(--color-base-content)` on the root, like the siblings).
- Padding, gap, border, btn-active colors: computed styles are identical to the mock (probe6).

## Next step
Make the runner apply `fixture.json` `background` (framework), OR add a supported per-case stage background. Then align the bootstrap Quicksand
URL with the mock's. Re-run; the expected residual is sub-pixel AA only. If it stays above 0.01, widen with reason "mock still at fractional x".

## Files
src/shared-components/main-nav/{template.html,logic.ts,styles.css,isolate/**}
