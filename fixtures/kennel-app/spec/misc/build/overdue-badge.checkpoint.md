# overdue-badge checkpoint
- Green: default (E1,E2,E3), overdue-45m (E1), not-overdue (E4), no-suffix (E5).
- Red: 4 `_reference` rows (default 0.774, default-brand-dark 0.710, overdue-45m / -brand-dark size 132 vs 140 px).
  Root cause is NOT in the unit folder (verified via computed style on the live preview):
  1. preview body font = workbench shell's `ui-monospace` (/tmp/wb-*/app/src/shell/styles.css replaces the app shell) → badge text monospace.
  2. Quicksand is never loaded (no @font-face / font link in app or static/app.css); not installed in the box either.
  3. src/css-variables.json lacks daisyUI params `--border`, `--noise`, `--size-selector`, `--size-field`, `--depth` (design-tokens.md §daisyUI params) → badge padding-inline computes 0 (calc with undefined --border), border-width 0, no noise.
- Red: sprig check duplicate-templates overdue-badge ~ status-badge 0.95 (suspected false positive: shared daisyUI badge+lucide-svg skeleton; real fix would be a shared icon-badge primitive — cross-unit, orchestrator call).
- Ruled out: template/markup (identical to source.html); Tailwind utilities (whitespace-nowrap, size-[1em] generated); daisyUI .badge/.badge-error rules present; colors resolve (#C0392B/#FFF6F4).
- Next step: scaffolder adds the 5 daisyUI params to css-variables.json + loads Quicksand; framework fixes preview shell font leak; re-run isolate test.

## r2 successor (port 8775) — superseding the notes above
- duplicate-templates FIXED by restructure: new shared primitive src/shared-components/icon-badge/ (span.badge + tone/soft/size class bindings + the 5 lucide SVGs by `icon` + `{{ label }}`; styles.css `.icon-badge-root { font-family: var(--font-body) }`); status-badge/overdue-badge now compose <icon-badge>. `sprig check <app>`: green (all 8 lints).
- Size drift FIXED upstream: bootstrap/styles.css now uses the Chrome-UA gstatic files (…_hK1QN.woff2); every render is now the still's exact size.
- Still red: every _reference row, ~100–184 px = the rounded corners/edge ring (dm evidence: 128 edge vs 12 inner px on booked), because the headless runner's stage backdrop is the workbench --paper 243,238,226 in BOTH themes while the stills sit on base-100 (251,247,240 light / 30,23,18 dark). badge-outline is transparent → checked-out rows ~1.000. Fixture `background` is honored only by the interactive workbench (preview-harness meta), not the runner — tried, no effect, reverted.
- Next step: runner/breakdown fix (runner paints the stage with fixture `background`/theme base-100, or recapture stills on the runner backdrop). Not fixable inside the unit without faking a background.
