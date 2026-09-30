# theme-toggle

Shared shell control in the top bar: a 32×32 ghost square button that flips the
document theme between `brand` (light, sun icon) and `brand-dark` (moon icon).
Source region: `header.navbar label.swap` (`source.html`, mock lines 206-210;
wiring `js/theme-toggle.js`, mock lines 625-628).

## 1. Classification & behavior

- **Bucket:** `island` (has `logic.ts`). **Interaction tier:** `pure-client`.
- **Justification (one line):** flipping `html[data-theme]` needs client JS that
  writes to `document.documentElement` — no server round-trip, no data.
- **Interactions:**
  | interaction | tier | effect |
  | --- | --- | --- |
  | click / Space on the toggle (checkbox `change`) | pure-client | `theme` signal flips `brand` ⇄ `brand-dark`; `document.documentElement.dataset.theme` is written; the checkbox `checked` mirrors `theme === "brand-dark"` |
- **Client state owned (signals):** `theme: "brand" | "brand-dark"` (default
  `"brand"`). The checkbox's `checked` is derived (`theme === "brand-dark"`),
  never separate state. A single effect writes `document.documentElement.dataset.theme = theme`.
- **Initial value:** the mock reads `?theme=` (a prototype-only param) else
  `"brand"`, and has **no persistence**. In the build, seed the signal from the
  document's current `data-theme` on setup (the shell owns the initial theme);
  do not port `?theme=` as a product feature. Persistence (localStorage /
  cookie) is NOT in the mock — out of scope unless the product asks.
- **Data source:** client only (`dataNeeds: []`; no row in `data-model.md`).
- **Liveness:** request-response — nothing pushed.
- **Data-shape hazard:** none. **Drift to reconcile (from design-tokens.md):**
  the app scaffold's `src/css-variables.json` declares `"default": "brand-dark"`,
  but the mock's default is `brand` — the toggle's seed must follow whatever the
  shell actually renders, so the sun/moon never disagrees with the page.
- **Channels:** none (the toggle neither sets nor reads `dog`/`day`/`toasts`).

## 2. Anatomy

```
<theme-toggle>                                   ← folder basename = selector
  label  (daisyUI swap swap-rotate + btn btn-ghost btn-sm btn-square)  title="Toggle theme"
    input#theme-toggle[type=checkbox]            ← appearance:none (daisyUI .swap input)
    svg  lucide "sun"   .swap-off  size 1.2em    ← visible when unchecked (brand)
    svg  lucide "moon"  .swap-on   size 1.2em    ← visible when checked (brand-dark)
```

- Keep the daisyUI components as-is: daisyUI `swap` / `swap-rotate` /
  `swap-on` / `swap-off` and daisyUI `btn` / `btn-ghost` / `btn-sm` /
  `btn-square`. Any extra class for the unit's own parts is prefixed
  `theme-toggle-…` (none needed).
- Icons: Lucide `sun` / `moon` at `1.2em` (the mock renders them via
  `data-lucide` → inline `svg.lucide.lucide-sun` / `svg.lucide.lucide-moon`;
  the build should inline the SVGs in `template.html` — no runtime icon script).
- No slots / projected children.
- Measured box: 32×32 (`--size: calc(var(--size-field,.25rem) * 8)`,
  `padding-inline: 0`), transparent bg/border (`btn-ghost`), `radius-field`
  corners, color `base-content`.

## 3. Props

| name | type | default | control widget | signal? |
| --- | --- | --- | --- | --- |
| `theme` | `"brand" \| "brand-dark"` | `"brand"` | `select` (`brand`, `brand-dark`) | `signal: true` |

## 4. States → cases

Every case: `_tier: "pure-client"`, `_theme` explicit (default theme per
`design-tokens.md`: `brand`). Stills are 32×32 at DPR 1; tolerance lowered to
`0.005` (the case pins an icon). `_reference` paths are git-root-relative
(the git root is the sprig repo, so they carry the `fixtures/kennel-app/` prefix).

| state | case | `_viewport` | `_theme` | `_signals` | `_reference` | what it shows |
| --- | --- | --- | --- | --- | --- | --- |
| light / unchecked (default) | `default` | 1280 | `brand` | `theme: "brand"` | `…/screenshots/theme-toggle@1280.png` | sun visible (opacity 1, rotate none), moon hidden (opacity 0, rotate 45deg), checkbox unchecked |
| dark / checked | `dark` | 1280 | `brand-dark` | `theme: "brand-dark"` | `…/screenshots/theme-toggle@1280-brand-dark.png` | moon visible (opacity 1, rotate 0deg), sun hidden (opacity 0, rotate -45deg), checkbox checked |
| light at mobile | `mobile` | 375 | `brand` | `theme: "brand"` | `…/screenshots/theme-toggle@375.png` | identical 32×32 sun — no responsive change |

Hover / focus-visible: not captured as stills (daisyUI `btn-ghost` hover bg) —
described, not extracted — verify during build.

## 5. Events

Lift into `cases/<case>/tests/*.spec.ts` (install `capture(page)` before
`page.goto`; gate on `waitHydrated(page)`):

1. **Toggle to dark** (case `default`):
   `await page.locator("label[title='Toggle theme']").click();`
   `ev.expect(e => e.source === "input#theme-toggle" && e.type === "change")`
   then observable effect:
   `expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe("brand-dark")`
   and `expect(page.locator("#theme-toggle")).toBeChecked()`.
2. **Toggle back to light** (case `dark`): click the label →
   `ev.expect(e => e.source === "input#theme-toggle" && e.type === "change")`;
   `document.documentElement.dataset.theme === "brand"`;
   `#theme-toggle` not checked.
3. **Keyboard** (case `default`): `page.locator("#theme-toggle").focus(); page.keyboard.press("Space")` →
   `ev.expect(e => e.source === "input#theme-toggle" && e.type === "change")`;
   theme becomes `brand-dark`.
4. **Icon swap motion** (case `default`, spec — see §6): after the click,
   `page.evaluate(() => document.getAnimations().map(a => [a.transitionProperty, a.effect.getTiming().duration, a.effect.getTiming().easing]))`
   contains `opacity` and `rotate` on `svg.lucide-sun` and `svg.lucide-moon`,
   each `200` ms, `cubic-bezier(0, 0, 0.2, 1)`.

The unit emits no custom output event; the theme write is its whole effect.

## 6. Motion

Extracted (`screenshots/motion.json` → `unitAnimations`; trigger: click
`label.swap` → `input#theme-toggle` change → `setTheme("brand-dark")`):

| target | property | from → to | duration | delay | easing | keyframes |
| --- | --- | --- | --- | --- | --- | --- |
| `svg.lucide-sun.swap-off` | `opacity` | 1 → 0 | 200 ms | 0 | cubic-bezier(0,0,0.2,1) | 2 |
| `svg.lucide-sun.swap-off` | `rotate` | none → -45deg | 200 ms | 0 | cubic-bezier(0,0,0.2,1) | 2 |
| `svg.lucide-moon.swap-on` | `opacity` | 0 → 1 | 200 ms | 0 | cubic-bezier(0,0,0.2,1) | 2 |
| `svg.lucide-moon.swap-on` | `rotate` | 45deg → 0deg | 200 ms | 0 | cubic-bezier(0,0,0.2,1) | 2 |
| `label.swap.btn` | `color`, `background-color`, `border-*-color`, `box-shadow` | theme palette swap | 200 ms | 0 | cubic-bezier(0,0,0.2,1) | 2 |

- Source: daisyUI `.swap > * { transition-property: transform, rotate, opacity; transition-duration: .2s; transition-timing-function: cubic-bezier(0,0,.2,1) }`,
  only under `@media (prefers-reduced-motion: no-preference)`; `.btn`
  transitions color/bg/border/box-shadow .2s.
- **Page cascade** (`motion.json` `pageCascade`): the flip also starts colour
  transitions on every `.btn` (200 ms) and every board status-strip card
  (`transition-colors` 150 ms cubic-bezier(.4,0,.2,1)); header/body surfaces
  snap instantly → brief mixed-palette frames.
- Filmstrip: `screenshots/filmstrip.png` (0/20/40/60/80/100 %).
- **Jank** (`screenshots/jank.md`, live click, 900 ms, 1280×800 on `#/board`):
  76 frames, 0 % dropped, max 16.8 ms, no LoAF > 50 ms, CLS 0.
- **Rebuild fixes:** icon swap (rotate + opacity) is compositor-friendly — no
  fix. `.btn` `box-shadow` transition → drop `box-shadow` from the transition
  list (or pseudo-element shadow + `opacity`). Theme-flip cascade → optional:
  set `[data-theme-switching]` on `<html>` for one frame around the write with
  `[data-theme-switching] * { transition: none }` for a clean flip.
- **No `_motion` case** — the swap needs a click to start, and the capture's
  `motion.json` is `{ trigger, unitAnimations, pageCascade }`, not the runner's
  array / `{ animations }` shape. Asserted as Events row 4 instead.

## 7. Responsive

No change at any breakpoint: 32×32 at 375, 640, 768, 1024, 1280 (the only
responsive rules in the mock header are Tailwind `sm` 640 / `md` 768 on the
nav labels / padding / wordmark — not on this control). The `.btn` rules
carry `@media (width >= 640/768/1024/1280px) :where(.btn) { width: unset }`
(no visible effect with `btn-square`).

## 8. A11y

- The control is a native checkbox inside a `<label>` — keyboard focusable,
  Space toggles. The only accessible name source in the mock is
  `title="Toggle theme"` on the label; the checkbox itself has no name and
  `appearance: none`. **Build fix:** give the input `aria-label="Toggle dark theme"`
  (or `role="switch"` + `aria-checked`) so screen readers announce the state;
  mark both icons `aria-hidden="true"`.
- Focus ring: `.btn` `outline-offset: 2px`, outline color `base-content`
  (focus-visible) — keep it visible.
- Reduced motion: the icon rotate/fade only runs under
  `prefers-reduced-motion: no-preference`; with `reduce` the icons swap
  instantly — preserve that (daisyUI already does).

## 9. Used on

`board`, `dog-detail`, `day-summary` — via the shared `top-bar` (shell).
Shared → `shared-components/theme-toggle`.

## 10. Isolate build plan

- **Lands at:** `fixtures/kennel-app/src/shared-components/theme-toggle/`
  (`template.html` + `logic.ts` + `styles.css` only if needed); selector
  `<theme-toggle>`; composed inside `top-bar`.
- **Preview routes** (from `fixture.json` `category: shared-components`,
  `folder: theme-toggle`):
  - `/components/shared-components/theme-toggle/default` — light, sun, 1280 → `theme-toggle@1280.png`
  - `/components/shared-components/theme-toggle/dark` — dark, moon, 1280 → `theme-toggle@1280-brand-dark.png`
  - `/components/shared-components/theme-toggle/mobile` — light, sun, 375 → `theme-toggle@375.png`
- **Events → tests:** row 1 → `cases/default/tests/toggle-to-dark.spec.ts`;
  row 3 → `cases/default/tests/keyboard.spec.ts`; row 4 →
  `cases/default/tests/swap-motion.spec.ts`; row 2 →
  `cases/dark/tests/toggle-to-light.spec.ts`.
  Caveat: the runner re-asserts the case `_theme` on `<html>` "if the app's
  markup overwrites it" — whether that re-assertion fights the toggle's own
  `dataset.theme` write is unverified; if it does, assert the checkbox state +
  icon opacity instead of `html[data-theme]`.
- **Loop:** scaffold the folder → copy this `isolate/` in →
  `sprig isolate test --json --root fixtures/kennel-app` (the three
  `reference:` rows are the pixel diff at tolerance 0.005) → lift the Events
  rows into the tests above → run → iterate until green, then compose into
  `top-bar`.
