# load-error checkpoint, r2 (successor fixer, port 8772)

- Green: default/retry.spec.ts, default/a11y.spec.ts (the pinned predecessor greens).
- Red: all 4 `_reference` rows, each only slightly over tolerance. default 0.024, tablet-768 0.024, mobile-375 0.019, dark 0.027 (tolerance 0.01). Size mismatch: none left (672x62 and 351x102 both match).
- Every remaining differing pixel is STAGE BACKGROUND, not the unit. Proved with a canvas pixel diff of actual.png against the still for default, mobile-375 and dark: the differing pixels are the 4 rounded-corner wedges plus the last row, which is the fractional 0.39px under the 61.39px box.
  - The stage paints rgb(243,238,226) in both themes.
  - The mock painted base-200: #F3EADB rgb(243,234,219) in light, rgb(41,32,26) in brand-dark.
  - Glyphs, border, button and icon: 0 differing pixels.
- Fixed this round, all in styles.css:
  1. `.load-error-box { width: 100% }`. With mx-auto in the stage's grid, the box shrank to its content (663px instead of 672).
  2. `.load-error-title { letter-spacing: var(--tracking-display) }`. The workbench lacks the app shell's h1-h3 rule, and the framework's global h1-h6 -0.01em applied instead. The measured value now matches the mock's -0.21px.
  3. `.load-error-retry { color: var(--btn-fg) }`. The workbench's unlayered `a{color:inherit}` painted Retry error-red.
- Fonts: the 82px height (the message wrapping to 2 lines) came from bootstrap/styles.css pinning the gstatic variable-range files (…NYuDyPw.woff2). Those are about 12px wider on this line than the css2 discrete-weight files (…K1QN.woff2) the mock loads: 527 vs 515px against a 524px column. The file was replaced with the css2 URLs at 18:50 (not by me), and the height now matches.
- Ruled out: font files, border, padding, grid tracks (24/524/58 = mock), the title's line-height and tracking, and the Retry colour.
- Next step (outside this unit): make the isolate stage paint the theme's base-200. `fixture.json` `background` is parsed (server/src/core/business/discover/mod.ts:942) but nothing renders it; I tried `"background": "var(--color-base-200)"` and the measurement did not change, so I reverted it. It could also be a framework stage default. After that, the rows should go green with no tolerance change.
