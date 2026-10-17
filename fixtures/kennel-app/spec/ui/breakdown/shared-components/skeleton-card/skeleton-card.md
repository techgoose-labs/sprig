# skeleton-card

Evidence: `source.html`, `screenshots/` (three stills + `motion.json`).

One placeholder dog card in a route's loading grid. Shared: the mock's
`renderLoading()` fills the last grid of `#app` with `skeletonCards(8)` on
**any** route while the load is pending, so the board and the day summary show
the same eight cards. Source region: `#app > div.grid:last-child > .card` at
`?state=loading` (`source.html`, mock lines 299-303).

## 1. Classification & behavior

- **Bucket:** `static` — a component folder with `template.html` + `styles.css`,
  **no `logic.ts`**.
- **Interaction tier:** `static`. Nothing in it is interactive.
- **Data source:** none. No props, no endpoint, no DTO (`dataNeeds: []`). The
  page decides when the loading branch renders and how many cards it composes
  (the mock always renders 8).
- **Liveness:** none. It is replaced wholesale when the page's load settles.
- **Channels:** none.

## 2. Anatomy

```
<skeleton-card>                                   selector = folder basename
  div.card.bg-base-100.border.border-base-300.skeleton-card  aria-hidden="true"  ← daisyUI `card` (kept)
    div.card-body.gap-3                                               ← daisyUI `card-body` (kept)
      div.skeleton.h-6.w-2/3        (title bar, 24px)                 ← daisyUI `skeleton` (kept)
      div.skeleton.h-4.w-1/2        (breed/owner line, 16px)
      div.flex.gap-2
        div.skeleton.h-5.w-20       (badge, 20×80)
        div.skeleton.h-5.w-14       (badge, 20×56)
```

- The four blocks carry our own `skeleton-card-block` class next to daisyUI
  `skeleton` (the reduced-motion hook). The card adds the prefixed
  `skeleton-card` class; no bare daisyUI name is added.
- Box: 134px tall at every width (card-body padding 1.5rem, gap .75rem). Width
  is the grid column: 296px in the 4-column `xl` grid at 1280, 351px in the
  1-column grid at 375.
- Colors: `bg-base-100` card, `border-base-300` 1px border, radius
  `var(--radius-box)`; the blocks are daisyUI's `skeleton` (base-300 with the
  shimmer gradient).

## 3. Props table

| name | type | default | control widget | signal? |
| --- | --- | --- | --- | --- |
| — | — | — | — | — |

The unit takes no props: every card is identical. `fixture.json` has an empty
`controls` object.

## 4. States → cases

One state: loading. One case per still. `_tier: static`, default tolerance.

| case | state | `_viewport` | `_theme` | `_reference` (git-root-relative) |
| --- | --- | --- | --- | --- |
| `default` | loading, desktop: 296×134 (4-column grid) | 1280 | `brand` | `fixtures/kennel-app/spec/ui/breakdown/shared-components/skeleton-card/screenshots/skeleton-card@1280.png` |
| `mobile-375` | loading at 375: 351×134 (1-column grid) | 375 | `brand` | `…/screenshots/skeleton-card@375.png` |
| `dark` | loading, desktop, dark theme | 1280 | `brand-dark` | `…/screenshots/skeleton-card@1280-brand-dark.png` |

The stills were shot from the served prototype (`?state=loading#/board`,
`theme=` for the dark one) at `deviceScaleFactor: 1`, after `document.fonts.ready`,
the first card of the grid (whole-pixel box: x 24 / 12, y 232 / 312), with
`animations: "disabled"` so the shimmer sits at its start frame — the same
frame the runner shoots.

## 5. Events

None. The unit emits nothing and has no native interaction. Its contract is a
DOM assertion the pages keep:
`await expect(page.locator(".skeleton-card .skeleton")).toHaveCount(4)` per card,
and the card is `aria-hidden="true"` (the page's `role="status"` line carries
the loading message).

## 6. Motion

`screenshots/motion.json` (derived from the board's loading capture): four
`CSSAnimation "skeleton"` records, one per block — `background-position-x`
150% → -50%, 1800ms, `ease-in-out` keyframes, linear timing, infinite. The
`default` case carries it as `_motion`. Reduced motion: the unit's own
`@media (prefers-reduced-motion: reduce)` rule stops the shimmer on its blocks.
No jank finding: it animates `background-position` only.

## 7. Responsive

No `@media` of its own besides reduced motion. The card fills the column the
page's grid gives it (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`);
its height is fixed by content at 134px.

## 8. A11y

- `aria-hidden="true"` on the card: it is decoration. The page's loading line
  (`role="status"`, "Loading today's dogs…") and its `aria-busy` wrapper carry
  the meaning.
- Nothing focusable.

## 9. Used on

- `board`, `day-summary`: both render the mock's `renderLoading()` grid of 8
  while their load is pending. This makes it **shared**. (dog-detail's loading
  view is the same mock function, but the rebuild's dog-detail has no loading
  branch.)

## 10. Isolate build plan

- **Lands at:** `fixtures/kennel-app/src/shared-components/skeleton-card/`,
  selector `<skeleton-card>`, with `template.html` + `styles.css` and no
  `logic.ts`.
- **Isolate:** copy `isolate/` (this folder's) into it unchanged.
  `fixture.json` has `category: "shared-components"` and `folder: "skeleton-card"`.
- **Preview routes:**
  - `/components/shared-components/skeleton-card/default`: desktop brand, vs `skeleton-card@1280.png`
  - `/components/shared-components/skeleton-card/mobile-375`: 375 brand, vs `skeleton-card@375.png`
  - `/components/shared-components/skeleton-card/dark`: desktop brand-dark, vs `skeleton-card@1280-brand-dark.png`
- **Loop:** scaffold, drop in `isolate/`, run
  `sprig isolate test --root fixtures/kennel-app --json` until the three
  `reference:` rows are green, then have the board and day-summary loading
  branches compose `<skeleton-card>` eight times instead of re-creating the card.
- **Build watch-outs:** the rounded corners show the stage background; the
  stage must paint `base-200` for the corners to match.
