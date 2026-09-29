# theme-toggle checkpoint (budget stop on the `_reference` rows)

## Green
- case tests (4/4): default/toggle-to-dark, default/keyboard, default/swap-motion, dark/toggle-to-light.
- `sprig check <app>`: no finding in `src/shared-components/theme-toggle` (typecheck, wiring, logic-placement, tokens, optimistic-writes green).

## Red — `_reference` rows (default 0.977, mobile 0.977, dark 0.994 vs tolerance 0.005)
- Root cause (measured by decoding the PNGs): the component itself matches — icon pixels are identical
  (light: base-content 59,42,30 on both sides). The difference is the BACKDROP: the unit is `btn-ghost`
  (transparent), the stills were cropped from the mock navbar (base-100: 251,247,240 light / 30,23,18 dark),
  while the isolate stage paints 243,238,226 in EVERY case (not a token, and unchanged under `_theme: brand-dark`).
- Ruled out: `fixture.json` `"background": "var(--color-base-100)"` and `"background": "#FBF7F0"` —
  both runs measured byte-identical (0.977/0.994); the runner ignores the fixture's `background`.
- Not done on purpose: painting a background on the component (it would ship a non-ghost button into the navbar),
  widening tolerance to ~1.0 (meaningless).

## Also found
- The runner re-asserts `_theme` on `<html>` right after the app writes `data-theme`
  (MutationObserver: "brand"→"brand-dark"→"brand" in one tick). Tests observe the write via a MutationObserver
  record + checkbox state + icon opacity instead of the settled attribute.

## Files
src/shared-components/theme-toggle/{template.html, logic.ts, styles.css, isolate/fixture.json, isolate/cases/{default,dark,mobile}/*.json, isolate/cases/default/tests/{toggle-to-dark,keyboard,swap-motion}.spec.ts, isolate/cases/dark/tests/toggle-to-light.spec.ts}

## Next step
Runner fix: honour `fixture.json` `background` (resolving theme vars under `_theme`) or paint the stage with the
theme's base-100; then re-run `sprig isolate test theme-toggle --json` — expect ≤ 0.005.

## r2 (successor) — same 3 `_reference` reds, root cause now pinned to runner source
- Re-run after the scaffolder's daisyUI params + @font-face: byte-identical verdicts (default 0.9765625, mobile 0.9765625, dark 0.994140625 vs 0.005). Fonts now load ("4 inline block(s) from the app"); no effect — the unit has no text.
- Pixel histogram (fast-png decode): render backdrop 243,238,226 (938/1024 px) in BOTH themes; still backdrop 251,247,240 light / 30,23,18 dark. Icon pixels match (59,42,30 light; 241,231,217 dark).
- 243,238,226 = #f3eee2 = the workbench app's own `--paper`: `app/src/shell/styles.css:15` (`--paper: #f3eee2`) painted on the preview `body` at `app/src/shell/styles.css:44` (`background: var(--paper)`). `fixture.json` `background` is read only by the interactive parent frame (`app/src/pages/workbench/components/workbench/logic.ts:453`, `if (d.background) bg.set(d.background)`), never by the headless preview page the runner screenshots — so it cannot fix the row.
- A transient run went 2/7 (keyboard + toggle-to-light "Expected 1 Received 0", mobile "Execution context was destroyed … navigation", default waitForFunction timeout); the immediate re-run was 4/7 again — load/flake, not a regression.
- Next step unchanged: framework fix — the preview page must paint the case theme's base-100 (or honour fixture `background` under `_theme`) for the runner's element screenshot.
