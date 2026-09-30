# top-bar

The global app header: dog icon + "Kennel board" wordmark on the left, and the
primary nav (`<main-nav>`) plus the theme switch (`<theme-toggle>`) on the
right. It is sticky at the top of every route. Mock region: `body > header.navbar`
(source.html, lines 194-233 of the mock).

## 1. Classification & behavior

- **Bucket:** `static` (it has no `logic.ts`). It lands at
  `shared-components/top-bar/` and its selector is `<top-bar>`.
- **Interaction tier:** `static` for the whole unit. It has no interaction of its
  own:
  - Wordmark link: a plain navigation `<a>` to the board route. Static.
  - Nav links: owned by the composed `main-nav` unit. It only passes `active` through.
  - Theme switch: owned by the composed `theme-toggle` unit, which is the island
    that sets `data-theme`. top-bar only mounts it.
- **Data source:** none. The text is fixed ("Kennel board"). The only prop is
  `active` (which nav item is current), and it comes from the host route/page. It
  has no `dataNeeds` and no data-model reverse-index row.
- **Liveness:** request-response. Nothing is pushed to it.
- **Client state owned:** none.
- **Channels:** none. top-bar does not read or write `dog`, `day` or `toasts`.
- **Data-shape hazard:** none.
- **NOT rebuilt: the flask "Demo states" dropdown.** The mock's
  `header .dropdown` holds a `flask-conical` button, the `#demo-state` select
  (live / empty / loading / error) and the `#demo-fail` "Next write fails"
  toggle. This is **prototype harness**, not product (`js/top-bar.js` holds only
  its wiring). Its states are covered by other units' isolate cases instead: the
  board empty/loading cases, `load-error`, and the rolled-back cases of
  `dog-actions`, `dog-notes` and `close-day-control`. **Do not add it to the
  template.** (See GAP: every still still shows the flask button.)

## 2. Anatomy

```html
<!-- top-bar/template.html (sketch) -->
<header class="navbar bg-base-100 border-b border-base-300 sticky top-0 z-30 px-3 md:px-6 gap-2">
  <div class="top-bar-brand flex-1 flex items-center gap-2 min-w-0">
    <svg class="top-bar-icon size-6 text-primary shrink-0" aria-hidden="true"><!-- lucide "dog" --></svg>
    <a href="<board route>" class="top-bar-wordmark font-display text-2xl md:text-3xl truncate pr-2">Kennel board</a>
  </div>
  <div class="top-bar-actions flex items-center gap-1">
    <main-nav [active]="active"></main-nav>     <!-- Board / Day summary btn-ghost btn-sm links -->
    <theme-toggle></theme-toggle>               <!-- swap-rotate sun/moon btn-ghost btn-sm btn-square -->
  </div>
</header>
```

- **daisyUI `navbar`** is the source primitive. Keep it as it is. The unit's own
  classes use the `top-bar-` prefix (`top-bar-brand`, `top-bar-icon`,
  `top-bar-wordmark`, `top-bar-actions`), never a daisyUI name.
- In the mock the Board link, the Day summary link and the theme `label` are
  siblings inside one `<nav class="flex items-center gap-1">`, so they sit
  **4px apart** (`gap-1`). The composed version must keep that exact spacing. If
  the `<main-nav>` / `<theme-toggle>` host elements are inline boxes, give them
  `display: contents` or `display: flex; gap: 4px` in `styles.css`. That way
  Board, Day summary and the sun button stay 4px apart and are vertically
  centred. (The `<nav>` landmark itself belongs to `main-nav`.)
- Measured geometry (from the capture and the matched CSS):
  - Height: **64px** at every width. That is `min-height: 4rem`, `padding-block: .5rem`,
    and the 1px bottom border in `base-300` is included.
  - Background: `base-100`.
  - Padding: inline **12px** below 768px and **24px** from 768px up.
  - Gaps: 8px between the brand group and the actions, 8px between the icon and the wordmark.
  - Dog icon: 24×24 in `text-primary`.
  - Wordmark: `font-display` (Caveat) at weight 700. It is 24px (`text-2xl`) below
    768px and 30px (`text-3xl`) from 768px up. It truncates with `truncate pr-2`.
  - Nav buttons: `btn btn-ghost btn-sm`, 32px tall, `.75rem` label, `.75rem`
    inline padding, 1.2em icons. The theme button is `btn-square` at 32×32.
  - Stacking: `position: sticky; top: 0; z-index: 30`.

## 3. Props

| name     | type                     | default   | control widget | signal? |
| -------- | ------------------------ | --------- | -------------- | ------- |
| `active` | `"board" \| "summary"`   | `"board"` | select         | no      |

`active` is passed through to `<main-nav>`, which uses it to mark the current
link (daisyUI `btn-active` / `aria-current`; the stills show Board filled in
base-200). The prop name and how it reaches main-nav are *described, not
extracted*: the mock derives active from the hash route in main-nav's own JS,
which is not in this unit folder. Align the name with main-nav's spec at build
time.

## 4. States → cases

Every case has `_tier: "static"`. The `_reference` paths are git-root-relative,
under `fixtures/kennel-app/spec/ui/breakdown/shared-components/top-bar/screenshots/`.
Tolerance is the default 0.01 for every case.

| state / case | what it shows | `_viewport` | `_theme` | `_reference` still |
| --- | --- | --- | --- | --- |
| `default` | 1280, Board active, full labels, 24px padding, 30px wordmark, sun icon | 1280 | brand | `top-bar@1280.png` |
| `bp-1024` | md layout: same as 1280, narrower | 1024 | brand | `top-bar@1024.png` |
| `bp-768` | md breakpoint: 24px padding, 30px wordmark, labels shown | 768 | brand | `top-bar@768.png` |
| `bp-640` | sm breakpoint: labels shown, 12px padding, 24px wordmark | 640 | brand | `top-bar@640.png` |
| `bp-375` | below sm: icon-only nav (labels `display:none`), 12px padding, 24px wordmark | 375 | brand | `top-bar@375.png` |
| `dark-1280` | brand-dark at 1280 (theme toggle shows moon) | 1280 | brand-dark | `top-bar@1280-brand-dark.png` |
| `dark-375` | brand-dark at 375, icon-only nav | 375 | brand-dark | `top-bar@375-brand-dark.png` |

These are not states of top-bar and get no case here:
- The Day summary link active (`active: "summary"`). No still was captured for it.
  It is proven by a spec on `default` with the control switched (see Events), and
  by main-nav's own cases.
- Hover/focus on the nav buttons. Those belong to main-nav.
- The toggle's checked state. That belongs to theme-toggle.

The harness stills `top-bar-page-board@1280.png` (1280×1818 full-page context)
and `top-bar-demo-dropdown-open@1280.png` (the harness dropdown, 400×300 clip)
have **no case**. The first is page context, not a unit crop, so any
`_reference` would be a size mismatch. The second is harness that is not rebuilt.

## 5. Events

top-bar emits no custom events. Its only interaction of its own is the wordmark
link. Predicate sketches (the `a` has no id, so its bridge `source` is `"a"`):

- The wordmark is the home link:
  `await expect(page.locator("top-bar a.top-bar-wordmark")).toHaveText("Kennel board")` and
  `toHaveAttribute("href", <board route>)` (the mock uses `#/board`).
- Clicking the wordmark fires a click:
  `ev.expect(e => e.source === "a" && e.type === "click" && /Kennel board/.test(e.detail?.label ?? ""))`
- It stays sticky:
  `expect(await page.locator("top-bar header").evaluate(el => [getComputedStyle(el).position, getComputedStyle(el).zIndex, el.getBoundingClientRect().height])).toEqual(["sticky", "30", 64])`
- Labels are hidden below sm (on `bp-375`):
  `await expect(page.getByText("Day summary")).toBeHidden()`. On `bp-640`: `toBeVisible()`.
- `active` passes through (on `default`, with the control set to `summary`):
  `await expect(page.locator("top-bar [aria-current]")).toContainText("Day summary")`.
  *Described, not extracted.* It depends on how main-nav marks the current link.

## 6. Motion

None of its own. No `motion.json`, no filmstrip, no jank findings. The
`swap-rotate` sun/moon transition (`transform, rotate, opacity` over .2s,
`cubic-bezier(0,0,.2,1)`, only under `prefers-reduced-motion: no-preference`)
belongs to theme-toggle. The daisyUI `.dropdown-content` .2s transition
belongs to the harness dropdown, which is not rebuilt; `getAnimations()`
returned `[]` for it. No `_motion` case.

## 7. Responsive

The mock's real breakpoints (Tailwind v4):

| width | inline padding | wordmark | nav labels |
| --- | --- | --- | --- |
| < 640 (`sm`, 40rem) | 12px (`px-3`) | 24px (`text-2xl`) | hidden (`hidden sm:inline`), icon-only 32px buttons |
| 640–767 | 12px | 24px | shown |
| ≥ 768 (`md`, 48rem) | 24px (`md:px-6`) | 30px (`md:text-3xl`) | shown |

The height is 64px at every width. The brand group is `flex-1 min-w-0`, so on
narrow widths the wordmark truncates with an ellipsis before the actions shrink.

## 8. A11y

- `<header>` at the top level of `<body>` gives the `banner` landmark. The nav
  landmark comes from main-nav's `<nav>`.
- The wordmark link's accessible name is "Kennel board". Mark the dog icon
  `aria-hidden="true"`. The mock's lucide `<svg>` carries no label, so it is
  decorative.
- Focus order: wordmark → Board → Day summary → theme toggle. There is no focus trap.
- Below 640 the nav links are icon-only (the label `span` is `display:none`), so
  they have no accessible name in the mock. main-nav must add an `aria-label`
  or a visually-hidden label. This is flagged here because top-bar's 375
  cases show that state.
- Reduced motion: top-bar has no motion of its own. The toggle's swap
  transition is already gated on `prefers-reduced-motion: no-preference`.

## 9. Used on

board, dog-detail, day-summary. It is **shared**: it is mounted once in
`<body>` above `#app` and is sticky on every route. That makes it shell-scoped:
compose it in the app shell, not per page.

## 10. Isolate build plan

- **Lands at:** `fixtures/kennel-app/src/shared-components/top-bar/`, as
  `template.html` + `styles.css` with no `logic.ts`. The selector is `<top-bar>`.
- **Preview routes:** `/components/shared-components/top-bar/<case>`. There is
  one per case: `default`, `bp-1024`, `bp-768`, `bp-640`, `bp-375`,
  `dark-1280`, `dark-375`.
- **Per case:** see §4. Each case's `_reference` still is its pixel diff.
- **Events → tests:**
  - `cases/default/tests/top-bar.spec.ts`: wordmark text/href, the click
    predicate, sticky/z-index/64px, and the active pass-through.
  - `cases/bp-375/tests/labels.spec.ts`: labels hidden.
  - `cases/bp-640/tests/labels.spec.ts`: labels visible.
- **Dependencies:** `main-nav` and `theme-toggle` must exist first, or be
  stubbed with `_mocks: { "main-nav": "stub", "theme-toggle": "stub" }` while
  iterating. The `_reference` rows only go green with the real children.
- **Loop:**
  1. Scaffold the folder and drop in `isolate/`.
  2. Run `sprig isolate test top-bar --json`. The `_reference` rows are the diff.
  3. Lift the Events into `tests/`.
  4. Run again and iterate until green.
  5. Only then compose it into the shell above the router outlet.
- **Stills recaptured without the harness (2026-09-29):** the seven `top-bar@*` stills were reshot with `header.navbar .dropdown { display:none }` and the host annotate pill hidden, so Board, Day summary and the sun button sit where the product build puts them.
