# load-error

Evidence: `source.html`, `js/load-error.js` (the mock behaviour behind this region), `css/`, `screenshots/`.

The full-width "couldn't load" alert that replaces a route's content when its
data load fails. Shared: the mock's `renderError()` swaps it into `#app` on
**any** route (board, dog detail, day summary) whenever the load fails.
Source region: `#app > [role="alert"].alert-error` at `?state=error`
(`source.html`, mock lines 314-319).

## 1. Classification & behavior

- **Bucket:** `static` — a component folder with `template.html` + `styles.css`,
  **no `logic.ts`**.
- **Interaction tier:** `static` for the whole unit.
  - *Retry* — `static`: a plain link to the current URL (`<a href="">` —
    re-requesting the page re-runs the server-side load). No client JS. The mock
    wires it to `setDemo('live')` (loading skeleton ~450 ms, then re-load), a
    demo-only harness; the rebuild does NOT copy that. The "Loading today's
    dogs…" skeleton the mock shows after Retry is the page's own loading
    state, not part of this unit.
- **Data source:** none. The three strings are props with the captured copy as
  defaults; no endpoint, no DTO (data-model reverse-index: no row;
  `dataNeeds: []`).
- **Liveness:** request-response. Nothing is pushed.
- **Data-shape hazard:** the captured title says "today's **board**" but the
  unit is used on dog-detail and day-summary too — the mock hard-codes the
  board wording everywhere. The `title` prop lets a page pass its own wording;
  every case pins the captured text.
- **Channels:** none (reads/sets no `dog`/`day`/`toasts` channel).

## 2. Anatomy

```
<load-error>                               selector = folder basename
  div[role=alert].alert.alert-error.alert-soft.load-error-box   ← daisyUI `alert` (kept)
    i/svg  lucide "wifi-off"  .load-error-icon   (size-6 = 24px, shrink-0)
    div.load-error-text
      h3.load-error-title      {{title}}        (font-display = Caveat 700; size inherits .875rem)
      div.load-error-message   {{message}}      (text-sm 14px / 20px, Quicksand)
    a.btn.btn-sm.load-error-retry href=""  {{retryLabel}}   ← daisyUI `btn btn-sm` (kept)
```

- The alert keeps daisyUI `alert alert-error alert-soft`, and the button keeps
  daisyUI `btn btn-sm`. Our own parts are prefixed `load-error-*`. The unit
  adds no bare daisyUI names.
- Layout comes from daisyUI `alert`: a grid with `grid-auto-flow: column`, 3
  children, and `grid-template-columns: auto minmax(auto,1fr)` (from
  `:has(> :nth-child(2))`). It uses gap 1rem, padding .75rem/1rem, border
  `var(--border)`, and radius `var(--radius-box)` (1.25rem).
- Colors come from `alert-soft` + `alert-error`: the background is
  `color-mix(in oklab, var(--color-error) 8%, var(--color-base-100))`, the text
  is `var(--color-error)`, and there is no shadow. The Retry button stays
  neutral (`--btn-bg: base-200`, `--btn-fg: base-content`).
- Box: `max-w-2xl` (672px), `mx-auto`, and `mt-10` (40px top margin, outside
  the still's crop).
- Title: `h3` has `font-bold`, and the theme rule `h1,h2,h3,h4 { font-weight:700 }`
  plus `--font-display` makes it render in **Caveat 700**. Preflight resets the
  h3 size, so it inherits the alert's `.875rem`.
- The icon is lucide `wifi-off` (the mock uses `<i data-lucide>` +
  `lucide.createIcons()`). The build inlines the SVG, or uses the app's icon
  mechanism, at 24×24 with stroke `currentColor`.

## 3. Props table

| name | type | default | control widget | signal? |
| --- | --- | --- | --- | --- |
| `title` | string | `Couldn't load today's board` | `text` | no |
| `message` | string | `The kennel server didn't answer. Your last check-ins are safe — nothing was lost.` | `text` | no |
| `retryLabel` | string | `Retry` | `text` | no |

(All three are plain `@input`s. The unit is static, so it has no signals.)

## 4. States → cases

The unit has only one data state: the load failed. Every case is that state
with the captured copy, one per still. `_tier: static` and default tolerance
0.01 apply throughout. The Retry `:hover`/`:focus-visible` states have no still
(described, not extracted). They use the daisyUI `btn` defaults.

| case | state | `_viewport` | `_theme` | `_reference` (git-root-relative) |
| --- | --- | --- | --- | --- |
| `default` | load failed, desktop: 672×62, single-line message | 1280 | `brand` | `fixtures/kennel-app/spec/ui/breakdown/shared-components/load-error/screenshots/load-error@1280.png` |
| `tablet-768` | load failed at 768: still capped at 672 (max-w-2xl), byte-identical to @1280 | 768 | `brand` | `…/screenshots/load-error@768.png` |
| `mobile-375` | load failed at 375: 351×102, the message wraps to 3 lines (grid 24px · 203px · 58px) | 375 | `brand` | `…/screenshots/load-error@375.png` |
| `dark` | load failed, desktop, dark theme | 1280 | `brand-dark` | `…/screenshots/load-error@1280-brand-dark.png` |

`_theme` for unsuffixed stills is `brand`, from `design-tokens.md`
"Default theme: brand". Note that the app scaffold defaults to `brand-dark`, so
every case sets `_theme` explicitly.

`load-error-page@1280.png` is a **full-page** still (1280×800: the top bar plus
the alert at x=304, y=128 on the base-200 page). Its size does not match any
unit render, so it cannot be a `_reference` for this unit. It is page-level
context (the alert composed into a route's `main`), and it belongs to a page's
error case. It is not a unit case.

## 5. Events

The unit emits no custom events. It has one native interaction:

- **Retry click** navigates to the current URL, which is a full reload of the
  route:
  ```ts
  const ev = await capture(page);                         // before goto
  await page.goto(`${BASE}/components/shared-components/load-error/default`);
  await waitHydrated(page);                               // static: resolves immediately
  await page.getByRole("link", { name: "Retry" }).click();
  await ev.expect(e => e.source === "a" && e.type === "click");
  ```
  Observable effect (the spec to lift): the link's `href` resolves to the
  current URL: `expect(await page.locator("a.load-error-retry").evaluate(a => a.href)).toBe(page.url())`.
- **Accessibility contract** (DOM assertion):
  `await expect(page.getByRole("alert")).toContainText("Couldn't load today's board")`.

## 6. Motion

None. `getAnimations()` on load returned `[]`, and there is no
`screenshots/motion.json` or filmstrip, so no case has `_motion`. The only
transition is daisyUI `.btn`'s own (`color, background-color, border-color,
box-shadow, transform`, 0.2s, `cubic-bezier(0,0,.2,1)`) on Retry hover/press.
The capture flagged that `.btn` transition under its box-shadow jank lint (group
note "as above", not in this unit's evidence). This is described, not
extracted, so verify it during the build. It is daisyUI's stock rule, and the
unit should not add to it. Reduced motion: nothing to disable beyond the stock
button transition.

## 7. Responsive

- The unit has no `@media` of its own. Its width is `min(672px, container)`
  through `max-w-2xl mx-auto`.
- At **375**, the page `main` padding is `p-3` (12px), so the unit is 351px
  wide. The text column is 203px and the message wraps to 3 lines. Height is
  ~101.39px (still 102).
- At **≥768** (`md`), the page padding becomes `p-6`, and the unit hits its
  672px cap: one line, height ~61.39px (still 62). The @768 and @1280 stills
  are byte-identical.
- The Retry button never wraps (`btn` sets `flex-wrap: nowrap`). It stays in
  the grid's last `auto` column at every width.

## 8. A11y

- `role="alert"` on the container, so it is announced when swapped in (the
  server renders it into the page).
- The title is an `h3`. Pages should keep the heading level consistent with
  their outline. This is described, not extracted: the mock uses `h3` directly
  under `main`.
- The icon is decorative and needs `aria-hidden="true"`. The mock's `<i>` has
  no label, so the text carries the meaning.
- Retry is a real link (`<a href="">`). It is keyboard-focusable in DOM order
  after the message, and Enter activates it. Use the daisyUI `btn` focus
  outline (`outline-color: base-content`, `outline-offset: 2px`).
- Contrast: error text on the 8% error tint. The build diff pins both themes.

## 9. Used on

- `board`, `dog-detail`, `day-summary`. The mock's `render()` dispatches to
  `renderError()` before any route view whenever `loadState === "error"`. This
  makes it **shared**.

## 10. Isolate build plan

- **Lands at:** `fixtures/kennel-app/src/shared-components/load-error/`,
  selector `<load-error>`, with `template.html` + `styles.css` and no
  `logic.ts`.
- **Isolate:** copy `isolate/` (this folder's) into it unchanged.
  `fixture.json` has `category: "shared-components"` and `folder: "load-error"`.
- **Preview routes:**
  - `/components/shared-components/load-error/default`: desktop brand, vs `load-error@1280.png`
  - `/components/shared-components/load-error/tablet-768`: 768 brand, vs `load-error@768.png`
  - `/components/shared-components/load-error/mobile-375`: 375 wrap, vs `load-error@375.png`
  - `/components/shared-components/load-error/dark`: desktop brand-dark, vs `load-error@1280-brand-dark.png`
- **Events → tests:**
  - The Retry-click + href assertion becomes `cases/default/tests/retry.spec.ts`.
  - The `role=alert` text assertion becomes `cases/default/tests/a11y.spec.ts`.
  - The other cases rely on their `_reference` rows.
- **Loop:**
  1. Scaffold the folder and drop in `isolate/`.
  2. Run `sprig isolate test --root fixtures/kennel-app --json`. The four
     `reference:` rows are the diff.
  3. Lift the Events rows into the specs above, then run and iterate to green.
  4. Only then have pages render `<load-error>` in their load-failed branch.
- **Build watch-outs:**
  - The app must load Caveat + Quicksand in its document head, or the title and
    message render in a fallback font and the diff fails. That failure is the
    finding.
  - The rounded corners show the stage background. The stage must paint the
    theme's `base-200` (the mock page `body.bg-base-200`) for the corners to
    match.
