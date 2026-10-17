# status-badge checkpoint

Green: all 12 case tests (4× "renders variant/label/aria-hidden icon, no badge-sm", 4× "no custom event on click", 4× "-sm has badge-sm").
Red: all 16 `_reference` rows — "size mismatch: reference WxH vs render wxH (more than 4px apart)", e.g. booked 94×24 vs 73×24.

Root cause (measured in browser at /components/shared-components/status-badge/booked):
- span.badge computed padding-inline 0px, border 0px. daisyUI `.badge` padding = calc(var(--size)/2 - var(--border)),
  --size = calc(var(--size-selector,.25rem)*6). `--border`, `--size-selector`, `--depth`, `--noise` are EMPTY on :root —
  src/css-variables.json lacks the daisyUI params that design-tokens.md:85-86 lists (--size-selector .25rem, --size-field .25rem,
  --border 1px, --depth 1, --noise 1). Injecting them on <html> → width 96.6px (ref 94).
- Remaining ~2.6px: the preview's font is monospace (the stage inherits ui-monospace); the Quicksand webfont (design-tokens.md:56 Google Fonts @import) is not loaded anywhere.
Both are global tokens/shell work (the scaffolder's), outside src/shared-components/status-badge.

Ruled out: template markup (DOM identical to source.html apart from the data-lucide attr); size-[1em] and whitespace-nowrap ARE in app.css (svg 14×14);
daisyUI .badge rules present. No styles.css was added (spec §2/§10: none); did not shim tokens locally.

sprig check: red, duplicate-templates at src/shared-components/overdue-badge/template.html:1 — overdue-badge vs status-badge at 0.95 (suspected FALSE POSITIVE: the similarity is the inlined lucide <svg> boilerplate + daisyUI badge the specs mandate for both units; left red, no marker).

Files: src/shared-components/status-badge/template.html; isolate/ (copied from breakdown) + cases/{booked,checked-in,walking,checked-out}{,-sm}/tests/status-badge.spec.ts.
Next step: scaffolder adds --size-selector/--size-field/--border/--depth/--noise to css-variables.json (and loads Quicksand + applies --font-body to the preview/body), then re-run
`SPRIG_WB_ROOT=/tmp/wb-8761 sprig isolate test status-badge --json --root <app>`.

## r2 successor (port 8775) — superseding the notes above
- duplicate-templates FIXED by restructure: new shared primitive src/shared-components/icon-badge/ (span.badge + tone/soft/size class bindings + the 5 lucide SVGs by `icon` + `{{ label }}`; styles.css `.icon-badge-root { font-family: var(--font-body) }`); status-badge/overdue-badge now compose <icon-badge>. `sprig check <app>`: green (all 8 lints).
- Size drift FIXED upstream: bootstrap/styles.css now uses the Chrome-UA gstatic files (…_hK1QN.woff2); every render is now the still's exact size.
- Still red: every _reference row, ~100–184 px = the rounded corners/edge ring (dm evidence: 128 edge vs 12 inner px on booked), because the headless runner's stage backdrop is the workbench --paper 243,238,226 in BOTH themes while the stills sit on base-100 (251,247,240 light / 30,23,18 dark). badge-outline is transparent → checked-out rows ~1.000. Fixture `background` is honored only by the interactive workbench (preview-harness meta), not the runner — tried, no effect, reverted.
- Next step: runner/breakdown fix (runner paints the stage with fixture `background`/theme base-100, or recapture stills on the runner backdrop). Not fixable inside the unit without faking a background.
