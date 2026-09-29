# main-nav

The two primary route links in the top bar: **Board** and **Day summary**. The
link for the current route gets daisyUI `btn-active`. Evidence: `source.html`
(mock lines 199-205), `js/main-nav.js` (render() line 600, hashchange line 629),
`css/main-nav.matched.css`, `screenshots/`.

## 1. Classification & behavior

- **Bucket:** island (folder with `logic.ts`). **Tier:** `pure-client`.
- **Why an island:** it lives in the shell, and the shell survives client
  soft-nav. The server can't re-render the active link after a navigation, so
  the client has to move `btn-active` itself.
- **Client state owned:** one signal, `view`: `"board" | "summary" | "dog"`,
  the first segment of the current route. It is derived exactly as the mock's
  `render()` does it: `location.hash` with `^#\/?` stripped (empty → `"board"`),
  then `^([^/]*)\/?(.*)$` → `view`. The active link is
  `view === "dog" ? "board" : view`, so dog detail highlights Board. When the
  route changes (the mock listens for `hashchange`; the app listens for its
  router's soft-nav/route-change), the island recomputes `view` and toggles the
  class in place. The island doesn't re-render the page and makes no request.
- **Data source:** the client route only. `dataNeeds: []`, and the
  data-model reverse index has no row for this unit. No server read, no server write.
- **Liveness:** request-response (nothing is pushed).
- **Data-shape hazard:** none. An unknown route segment (for example `#/foo`)
  gives `view = "foo"`, which matches neither link, so neither is active. That
  is the mock's behavior; keep it.
- **Channels:** none. This unit reads and writes none of `dog`, `day` or `toasts`.

## 2. Anatomy

```
<main-nav>                               host; lays out as `flex items-center gap-1` (4px gap)
  <a href="#/board"   data-nav="board"   class="btn btn-ghost btn-sm [btn-active]" [aria-current="page"]>
    <svg lucide layout-grid           class="size-[1.2em]">   14.4px icon (1.2em of 12px)
    <span class="hidden sm:inline">Board</span>
  </a>
  <a href="#/summary" data-nav="summary" class="btn btn-ghost btn-sm [btn-active]" [aria-current="page"]>
    <svg lucide chart-no-axes-column  class="size-[1.2em]">
    <span class="hidden sm:inline">Day summary</span>
  </a>
</main-nav>
```

- The links **are** daisyUI `btn` + `btn-ghost` + `btn-sm` (+ `btn-active`).
  Keep them as daisyUI components and don't restyle them. Class names the unit
  adds for its own elements are prefixed (`main-nav-link`, `main-nav-icon`,
  `main-nav-label`) and never a daisyUI name.
- In the mock the links sit directly in the top-bar `<nav class="flex
  items-center gap-1">`, which also holds theme-toggle and the harness dropdown.
  This unit owns only the two links, so it reproduces the `gap-1` flex row
  itself. The parent top-bar keeps its own `gap-1` between `<main-nav>` and
  theme-toggle.
- Icons: the mock uses lucide `<i data-lucide>` plus `lucide.createIcons()`.
  The build inlines the two SVGs (`layout-grid`, `chart-no-axes-column`), so no
  CDN runtime is needed.
- Measured link widths: 80.39px (Board) and 126.39px (Day summary) with labels;
  40.39px each icon-only. Height is 32px (`btn-sm` = `--size-field` × 8).

## 3. Props

| name | type | default | control widget | signal? |
| --- | --- | --- | --- | --- |
| `view` | `"board" \| "summary" \| "dog"` | `"board"` | `select` (board / summary / dog) | **true** |

In the app, `view` is seeded from the current route and updated on each route
change. In isolate, `_signals.view` stands in for the route, because a preview
route (`/components/shell/main-nav/<case>`) has no `#/…` hash.

## 4. States → cases

Every case has `_tier: "pure-client"`. `_theme` comes from the still's suffix,
or else the mock default `brand` (the `Default theme:` line in
design-tokens.md). `_reference` paths are git-root-relative:
`fixtures/kennel-app/spec/ui/breakdown/shared-components/main-nav/screenshots/…`.

| state | case | `_signals.view` | `_viewport` | `_theme` | `_reference` still | shows |
| --- | --- | --- | --- | --- | --- | --- |
| default: Board active, labels shown | `default` | board | 1280 | brand | `main-nav-board@1280.png` (211×32) | Board `btn-active` (base-200-ish fill), Day summary ghost |
| sm breakpoint | `board-640` | board | 640 | brand | `main-nav-board@640.png` (211×32) | same as default; labels appear at `sm` (640) |
| below sm: icon-only | `board-375` | board | 375 | brand | `main-nav-board@375.png` (85×32), tolerance 0.005 (icons only) | labels `display:none`; two 40.39px icon buttons |
| Day summary active | `summary` | summary | 1280 | brand | `main-nav-summary@1280.png` | Day summary `btn-active`, Board ghost |
| dog detail highlights Board | `dog` | dog | 1280 | brand | `main-nav-dog@1280.png` | route `#/dog/d01`, so Board is `btn-active` |
| dark theme | `dark` | board | 1280 | brand-dark | `main-nav-board@1280-brand-dark.png` | Board active on the dark palette |
| hover on inactive link | `hover-summary` | board | 1280 | brand | none (see GAP): still `main-nav-board-hover-summary@1280.png`, checked by a spec | pointer over Day summary. It gets the ghost-hover fill, border and shadow; Board stays active |

There are no loading, empty, error, pending or rolled-back states. The unit has
no data and no writes, so it isn't optimistic-write.

## 5. Events

The links are real `<a href>`, so navigation is the anchor's default action. The
island emits no custom event. Predicates:

- Clicking **Day summary** fires a click on the link:
  `ev.expect(e => e.source === "a" && e.type === "click" && /Day summary/.test(e.detail ?? ""))`.
  Observable effect in the app (route `#/summary`):
  `await expect(page.locator('a[data-nav="summary"]')).toHaveClass(/btn-active/)`
  and `await expect(page.locator('a[data-nav="board"]')).not.toHaveClass(/btn-active/)`.
- **Active follows the signal** (isolate, case `summary`):
  `await expect(page.locator('a[data-nav="summary"]')).toHaveClass(/btn-active/)`,
  `await expect(page.locator('a[data-nav="summary"]')).toHaveAttribute("aria-current", "page")`.
- **dog maps to board** (case `dog`):
  `await expect(page.locator('a[data-nav="board"]')).toHaveClass(/btn-active/)`,
  `await expect(page.locator('a[data-nav="summary"]')).not.toHaveClass(/btn-active/)`.
- **Hover transition** (case `hover-summary`): after `waitHydrated(page)`, run
  `await page.locator('a[data-nav="summary"]').hover()`, then within 400 ms
  (the still was taken at 400 ms) assert that
  `getComputedStyle(a).backgroundColor` is no longer `rgba(0, 0, 0, 0)`. Then
  `await expect(page.locator('a[data-nav="summary"]')).toHaveScreenshot()`
  against `main-nav-board-hover-summary@1280.png` (cropped to the unit
  211×32), or compare `page.locator('main-nav')` against the still.
- **Labels hidden below sm** (case `board-375`):
  `await expect(page.locator('a[data-nav="board"] span')).toBeHidden()`.
  At `default`: `toBeVisible()` with text `Board`.

## 6. Motion

Extracted from `screenshots/motion.json`. The trigger is hovering the inactive
link `a[data-nav=summary]` on `#/board` at 1280×800. The motion is six
CSSTransitions on `a.btn.btn-ghost.btn-sm`, all with **duration 200 ms, delay
0, easing `cubic-bezier(0, 0, 0.2, 1)`, 1 iteration, 2 keyframes**:

| property | from | to |
| --- | --- | --- |
| `background-color` | `rgba(0,0,0,0)` | `oklab(0.874263 0.00338137 0.0203905)` |
| `border-{top,right,bottom,left}-color` | `rgba(0,0,0,0)` | `oklab(0.83055 0.0032123 0.019371)` |
| `box-shadow` | `oklab(0 0 0/0) 0 0 0 0 inset, oklab(0 0 0/0) 0 0 0 0` | `oklab(1 0 0/.06) 0 .5px 0 .5px inset, oklab(0.874263 0.00338137 0.0203905/.3) 0 3px 2px -2px, … 0 4px 3px -2px` |

- **Source rule:** daisyUI `.btn { transition-property: color,
  background-color, border-color, box-shadow, transform; transition-duration:
  .2s; transition-timing-function: cubic-bezier(0,0,.2,1) }`. Keeping daisyUI
  `btn` reproduces it with no custom CSS.
- The route-change `btn-active` toggle wasn't captured separately. The same
  `.btn` transition applies (described, not extracted; verify during the build).
- There is no `filmstrip.png` for this unit. The capture produced
  `motion.json` only.
- **Jank** (`screenshots/jank.md`): a live click → `#/summary` measured 79
  frames, 1.3% dropped, max 33.3 ms, no LoAF > 50 ms, CLS 0. The static lint
  flags that `.btn` transitions `box-shadow`. This is low impact at `btn-sm`.
  **Rebuild fix:** leave it on stock daisyUI. If the unit ever adds custom hover
  CSS, drop `box-shadow` from the transition list, or pre-render the shadow on
  `::after` and animate its `opacity`.
- No `_motion` case. The animation needs a hover to start, and `_motion` only
  compares animations present after hydration at rest. The hover spec in
  Events covers it (see GAPS).

## 7. Responsive

The source's real media queries are Tailwind `sm` = `@media (width >= 40rem)`
(640px), via `.sm\:inline`.

- **< 640:** labels are `hidden` (`display:none`). The links are icon-only,
  40.39px wide, and the unit is 85×32.
- **≥ 640:** labels are `display:inline`. Board is 80.39px, Day summary is
  126.39px, and the unit is 211×32.
- The `md` (768) changes in the header (`px-6`, `text-3xl` wordmark) belong to
  the top-bar, not this unit. Height is 32px at every width.

## 8. A11y

- Use native `<a href>` links. Tab order is Board, then Day summary.
  Enter activates a link. There's no focus trapping. The focus ring is daisyUI
  `.btn` `outline-offset: 2px` with `outline-color: var(--btn-color, base-content)`.
- Put `aria-current="page"` on the active link, next to `btn-active`. daisyUI
  already styles `.btn[aria-current]` the same as `.btn-active`
  (matched.css), so this adds no visual change. The mock only sets the class,
  so this is an a11y upgrade and doesn't change the visuals.
- **Below `sm` the links are icon-only**, and in the mock they have no
  accessible name there, because the `<span>` is `display:none` and the lucide
  `<i>` has no label. The build adds `aria-label="Board"` /
  `aria-label="Day summary"` to the links, or keeps the text sr-only below `sm`,
  and marks the SVGs `aria-hidden="true"`.
- Wrap the links in `<nav aria-label="Main">`, or leave the landmark to the
  top-bar's `<nav>`. Decide once, at composition.
- Reduced motion: the only motion is the 200 ms colour/shadow hover transition.
  It's acceptable, but the build may zero `transition-duration` under
  `prefers-reduced-motion: reduce`.

## 9. Used on

board, dog-detail, day-summary. It's shared: it lives in the shell (top-bar)
that every route renders.

## 10. Isolate build plan

- **Lands at:** `fixtures/kennel-app/src/shared-components/main-nav/`
  (`template.html` + `logic.ts` + `styles.css`). The selector is
  `<main-nav>`. Drop this folder's `isolate/` in unchanged.
- **Preview routes:** `/components/shell/main-nav/<case>` (from `fixture.json`
  `category: "shell"`, `folder: "main-nav"`):
  - `/components/shell/main-nav/default`: Board active, 1280. Ref `main-nav-board@1280.png`
  - `/components/shell/main-nav/board-640`: Board active, 640. Ref `main-nav-board@640.png`
  - `/components/shell/main-nav/board-375`: icon-only, 375. Ref `main-nav-board@375.png` (tol 0.005)
  - `/components/shell/main-nav/summary`: Day summary active. Ref `main-nav-summary@1280.png`
  - `/components/shell/main-nav/dog`: dog route, Board active. Ref `main-nav-dog@1280.png`
  - `/components/shell/main-nav/dark`: brand-dark. Ref `main-nav-board@1280-brand-dark.png`
  - `/components/shell/main-nav/hover-summary`: hover on Day summary. There is no `_reference` row; its spec compares against `main-nav-board-hover-summary@1280.png`
- **Events → tests:**
  - `cases/summary/tests/active.spec.ts`: active follows signal + aria-current
  - `cases/dog/tests/dog-maps-to-board.spec.ts`
  - `cases/default/tests/click-summary.spec.ts`: click fires; in isolate, assert the anchor's `href="#/summary"` and the click event (the route effect is asserted at composition)
  - `cases/board-375/tests/labels-hidden.spec.ts`
  - `cases/hover-summary/tests/hover.spec.ts`: hover transition + still compare
- **Loop:** scaffold the folder, then drop in `isolate/`, then run
  `sprig isolate test --root fixtures/kennel-app --json` (the `reference:` rows
  are the pixel diff). Next, lift the Events above into the `tests/*.spec.ts`
  (plain `@playwright/test` + `waitHydrated`), run, and iterate until green.
  Only then compose it into the top-bar/shell.
- **Fonts:** the labels use the app font (Quicksand 600 at 12px, from
  `btn-sm`). The `reference:` rows fail unless the app's document head loads
  Quicksand.
