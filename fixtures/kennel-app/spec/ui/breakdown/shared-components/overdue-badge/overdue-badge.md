# overdue-badge

Shared, static. A red daisyUI `badge badge-error` pill with an alarm-clock icon and the text
`Overdue · <overdueBy>`. It shows when the server has flagged a dog as overdue for pickup, and it
renders **nothing** when the dog is not overdue.

Evidence: `source.html` (both runtime instances, d14 + d18), `js/overdue-badge.js` (the mock's
`overdueBadge(d)` helper + `esc`), `css/overdue-badge.css`, `screenshots/` (4 stills @1280).

## 1. Classification & behavior

- **Bucket:** `static` component (no `logic.ts`). Shared: the mock's `overdueBadge()` helper is
  called by dog-card (board), dog-heading (dog-detail) and overdue-pickups (day-summary).
- **Interaction tier:** `static`. The badge has no interactions: no hover or focus rules target it,
  and it has no click handler. When it sits inside a card link, any click belongs to the parent.
- **Data source:** props from the parent, which reads them off the server's dog row
  (`dogList` / `dogDetail` / `overduePickups` in `data-model.md`). `dataNeeds: []`; the badge fetches
  nothing itself.
  - `overdue: boolean` is **server-decided**. The UI never does date math.
  - `overdueBy: string?` is a server-formatted human duration (`"2h 15m"`, `"45m"`). It is present
    only when `overdue` is true.
- **Render rule** (verbatim from `js/overdue-badge.js` lines 270-271):
  - If `overdue` is false, render nothing.
  - Otherwise render the badge. It reads `Overdue`, plus ` · ` + `overdueBy` only when `overdueBy`
    is truthy (not empty).
  - The mock HTML-escapes `overdueBy` with `esc()`. In the build, use sprig's text interpolation,
    which escapes by default; never use innerHTML.
- **Liveness:** request-response. Nothing is pushed. The badge updates only when its parent
  re-renders with a new dog row. For example, after `checkOut` the server clears `overdue`
  (data-model.md).
- **Data-shape hazard:** the parent may send `overdue: true` with no `overdueBy`. The badge must
  then render a bare `Overdue` with no trailing ` · `.

## 2. Anatomy

```
<overdue-badge>                                  ← host; empty when !overdue
  <span class="badge badge-error whitespace-nowrap">   ← daisyUI `badge` + `badge-error`, kept as-is
    <svg class="lucide lucide-alarm-clock size-[1em]" aria-hidden="true"> … </svg>   ← lucide alarm-clock, 1em square
    Overdue · 2h 15m                               ← text node; " · <overdueBy>" only when set
  </span>
</overdue-badge>
```

- The `span` **is** a daisyUI `badge` with the `badge-error` modifier. Keep those daisyUI classes.
  Do not re-create them in scoped CSS. `sprig build` bundles daisyUI 5.
- The icon is lucide `alarm-clock`, inlined as the runtime SVG (`source.html`): viewBox 24,
  `stroke="currentColor"`, stroke-width 2, round caps and joins. Its paths are
  `circle(12,13,r8)`, `M12 9v4l2 2`, `M5 3 2 6`, `m22 6-3-3`, `M6.38 18.7 4 21` and
  `M17.64 18.67 20 21`. Size is `1em`: `size-[1em]` = `width:1em;height:1em`.
- Any class the build adds for its own parts must be prefixed (`overdue-badge-icon`), never a daisyUI
  name. No own classes are needed: the mock uses only daisyUI plus Tailwind utilities
  (`whitespace-nowrap`, `size-[1em]`).
- Host: the custom tag must not add layout of its own. Make it `display: contents`, or
  `display: inline-flex` with no box, so parents' `flex gap-*` rows keep spacing the badge the way
  the mock does. When the badge is not overdue, the host must hold no child, so it takes no space
  in a flex gap.

Computed box (from `css/overdue-badge.css`, brand theme):

| property | value |
| --- | --- |
| display | `inline-flex`, `align-items:center`, `justify-content:center`, `gap: 0.5rem` |
| height | `--size` = `calc(var(--size-selector) * 6)` = 0.25rem × 6 = **1.5rem (24px)** |
| padding-inline | `calc(var(--size)/2 - var(--border))` = 12px − 1px = **11px** |
| border | `var(--border)` = 1px solid `--badge-color` = `--color-error` |
| background | `--badge-bg` = `--color-error`, plus the noise image (`--noise: 1` in brand themes → `--fx-noise` at 100%) |
| color | `--badge-fg` = `--color-error-content` |
| radius | `--radius-selector` = **1rem** (brand/brand-dark) → a full pill at 24px tall |
| font-size | `0.875rem` (14px); font family inherited from the page (Quicksand, `--font-body`) |
| white-space | `nowrap` (the badge never wraps) |
| measured size | 158×24 ("Overdue · 2h 15m"), 140×24 ("Overdue · 45m") |

Theme colors (design-tokens / css):

| token | brand | brand-dark |
| --- | --- | --- |
| `--color-error` (bg + border) | `#C0392B` | `#E06A5C` |
| `--color-error-content` (text + icon stroke) | `#FFF6F4` | `#2A0E0A` |

## 3. Props

| name | type | default | control widget | signal? |
| --- | --- | --- | --- | --- |
| `overdue` | boolean | `true` (in the fixture; the app passes the dog row's value) | boolean | no |
| `overdueBy` | string (optional) | `"2h 15m"` (in the fixture; absent in the data when not overdue) | text | no |

## 4. States → cases

Every case has `_tier: "static"`. `_viewport` is 1280: each still was shot at page width 1280, and
the capture notes the badge does not change with viewport. Stills are pinned at `tolerance: 0.005`,
because the case pins a 1em icon and a pill radius. The `_theme` of an unsuffixed case is the mock
default `brand` (design-tokens.md "Default theme: brand").

| state | case | props | `_theme` | `_reference` (git-root-relative) |
| --- | --- | --- | --- | --- |
| overdue with a long duration (d14 Rocco) | `default` | `overdue:true, overdueBy:"2h 15m"` | brand | `fixtures/kennel-app/spec/ui/breakdown/shared-components/overdue-badge/screenshots/overdue-badge@1280.png` |
| overdue with a short duration (d18 Olive) | `overdue-45m` | `overdue:true, overdueBy:"45m"` | brand | `…/screenshots/overdue-badge-45m@1280.png` |
| the same as default, dark theme | `default-brand-dark` | `overdue:true, overdueBy:"2h 15m"` | brand-dark | `…/screenshots/overdue-badge@1280-brand-dark.png` |
| the same as overdue-45m, dark theme | `overdue-45m-brand-dark` | `overdue:true, overdueBy:"45m"` | brand-dark | `…/screenshots/overdue-badge-45m@1280-brand-dark.png` |
| not overdue → renders nothing | `not-overdue` | `overdue:false` | brand | none (nothing to shoot). Checked by the spec test in §10 |
| overdue with no `overdueBy` → bare "Overdue" | `no-suffix` | `overdue:true` | brand | none. **Described, not extracted — verify during build.** There is no seed dog with this shape, so capture has no still. Checked by the spec test in §10 |

There is no hover, focus, disabled, loading or error state. The badge is display-only and gets no
CSS state rules.

## 5. Events

It **emits none**. The badge is static, has no listeners and fires no DOM events. The rows below are
the observable DOM effects that the build lifts into tests. Use plain Playwright, and scope every
locator to the `overdue-badge` host.

- **E1 renders duration:**
  `expect(page.locator("overdue-badge .badge.badge-error")).toHaveText("Overdue · 2h 15m")`
  (case `default`). For `overdue-45m`: `"Overdue · 45m"`.
- **E2 icon present, decorative:**
  `expect(page.locator("overdue-badge .badge svg.lucide-alarm-clock[aria-hidden='true']")).toHaveCount(1)`.
- **E3 no wrap:**
  `expect(page.locator("overdue-badge .badge")).toHaveCSS("white-space", "nowrap")`.
- **E4 not overdue → nothing:**
  `expect(page.locator("overdue-badge .badge")).toHaveCount(0)`
  **and** `expect(page.locator("overdue-badge")).toHaveText("")` (case `not-overdue`).
- **E5 no suffix:**
  `expect(page.locator("overdue-badge .badge")).toHaveText("Overdue")`. The text has no `·`
  (case `no-suffix`).
- **E6 escaping:** if a reviewer sets `overdueBy` to `<b>x</b>`, the badge shows the literal text.
  `expect(page.locator("overdue-badge .badge b")).toHaveCount(0)`. This is a control-driven check,
  not a case.

A `capture(page)` event predicate does not apply: no event exists to match
(`ev.expect(() => false)` would be meaningless).

## 6. Motion

None. Capture found no animation (`getAnimations()` empty, no keyframes referenced by the
computed `animation-name`) and no jank lint findings. There is no `motion.json` and no filmstrip, so
no case has `_motion`.

The global reduced-motion rule in the css (`animation/transition-duration: 0.01ms`) has nothing to
act on here.

## 7. Responsive

The badge is not responsive. It has no `@media` rules of its own; the `@media` blocks in
`css/overdue-badge.css` are daisyUI drawer scroll-lock rules, unrelated to the badge. The capture
notes say "The badges do not change with viewport, so they were shot at 1280 only".

- Width is always `fit-content` + `nowrap`. In narrow parents (dog-card at 375), the parent's own
  flex-wrap decides placement; the badge itself never shrinks (`flex-shrink: 0`) and never wraps.

## 8. A11y

- The text `Overdue · 2h 15m` is the accessible content. The icon is `aria-hidden="true"`.
- The badge has no role and is not focusable. It needs no keyboard handling.
- Contrast: `#FFF6F4` on `#C0392B` (brand) and `#2A0E0A` on `#E06A5C` (brand-dark). Both are the
  theme's own error/error-content pair.
- Reduced motion: not applicable (the badge has no motion).
- Optional, not in the mock: the build could add a visually hidden prefix, but the mock has none.
  Do not add one without a design decision.

## 9. Used on

Three pages, which makes this unit shared. The inventory calls it with
`overdueBadge()`:

- **board**: inside `dog-card` (2 instances in the seed: d14 Rocco "2h 15m", d18 Olive "45m")
- **dog-detail**: inside `dog-heading`
- **day-summary**: inside `overdue-pickups`

## 10. Isolate build plan

- **Lands at:** `fixtures/kennel-app/src/shared-components/overdue-badge/`. Selector
  `<overdue-badge>`. Files: `template.html` + `styles.css` (host display only). **No `logic.ts`**:
  the badge is static.
- **Template sketch:** the host holds a single `span` inside a conditional on `overdue`.
  - The span carries daisyUI `badge badge-error whitespace-nowrap`, the inline lucide alarm-clock
    SVG (`class="lucide lucide-alarm-clock size-[1em]" aria-hidden="true"`), and the text
    `Overdue`.
  - A second conditional on `overdueBy` appends ` · {{ overdueBy }}`.
  - Use interpolation, which escapes the text. The SVG is inlined because the build has no
    `lucide.createIcons()` runtime.
- **Drop in** this unit's `isolate/` folder as it stands (`fixture.json` + `cases/`).
- **Preview routes** (from `fixture.json`: category `shared-components`, folder `overdue-badge`):

| route | state | `_reference` |
| --- | --- | --- |
| `/components/shared-components/overdue-badge/default` | "Overdue · 2h 15m", brand | `overdue-badge@1280.png` |
| `/components/shared-components/overdue-badge/overdue-45m` | "Overdue · 45m", brand | `overdue-badge-45m@1280.png` |
| `/components/shared-components/overdue-badge/default-brand-dark` | "Overdue · 2h 15m", brand-dark | `overdue-badge@1280-brand-dark.png` |
| `/components/shared-components/overdue-badge/overdue-45m-brand-dark` | "Overdue · 45m", brand-dark | `overdue-badge-45m@1280-brand-dark.png` |
| `/components/shared-components/overdue-badge/not-overdue` | renders nothing | — (spec only) |
| `/components/shared-components/overdue-badge/no-suffix` | bare "Overdue" | — (spec only) |

- **Events → tests:**
  - E1 + E2 + E3 → `cases/default/tests/overdue-badge.spec.ts`
  - E1 (45m text) → `cases/overdue-45m/tests/overdue-badge.spec.ts`
  - E4 → `cases/not-overdue/tests/not-overdue.spec.ts`
  - E5 → `cases/no-suffix/tests/no-suffix.spec.ts`
  - E6 → optional, in the default case's spec with a `page.goto` of the same route after editing the
    control; or drop it if the runner cannot set a control headlessly.
  - `not-overdue` and `no-suffix` have no still. **They must get their spec before the run**,
    otherwise `sprig isolate test` reports them `skipped — no tests, no _reference`.
- **Loop:** scaffold the folder → drop `isolate/` → `sprig isolate test --json --root fixtures/kennel-app`.
  The 4 `reference:` rows are the pixel diff at 0.005. Then lift E1–E5 into the tests above → run →
  iterate until green → only then compose into dog-card / dog-heading / overdue-pickups.
- **Fidelity notes for the diff:**
  - The fill carries daisyUI's `--fx-noise` texture (`--noise: 1` in the brand themes). A build that
    drops it will drift.
  - The app must load Quicksand, or the text row fails. That is a real finding, not noise.
  - design-tokens.md flags that the app scaffold defaults to `brand-dark`. Every case sets
    `_theme` explicitly, so the diff is not affected.
