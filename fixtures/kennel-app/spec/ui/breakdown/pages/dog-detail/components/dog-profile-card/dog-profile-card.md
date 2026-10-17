# dog-profile-card

Evidence: `source.html`, `js/dog-profile-card.js` (the mock behaviour behind this region), `css/`, `screenshots/`.

"The dog" card on the dog-detail page: a titled card holding a two-column
definition list (Breed / Kennel / Arrival / Owner / Phone) for one dog. Pure
display. Mock region: `#app section.card:has([data-lucide="paw-print"])`
(exactly one node, at `#/dog/<id>`).

## 1. Classification & behavior

- **Bucket:** `static` component (no `logic.ts`), page-local to `dog-detail`.
- **Interaction tier:** `static` — the card has no controls, links, hover or
  focus behaviour. No interaction at all.
- **Data source:** the `dogDetail` query (pre-contract proposal
  `GET /api/dogs/{id}`, see `data-model.md`). Fields consumed: `breed`,
  `kennel`, `arrival` off the dog, and `name`, `phone` off the `owner` object
  the query carries. The page resolves `dogDetail` once and passes the five
  values down as props; the card never fetches.
- **Liveness:** request-response. Nothing in the mock is pushed; the values
  change only on the next page load. No status command touches these fields.
- **Data-shape hazard:** *owner join on the client* (data-model hazard 1). The
  mock does `owner(d.owner)` by scanning the whole owner collection and falls
  back to `{ name: "Unknown owner" }` (phone then renders empty). The build
  takes `owner.name` / `owner.phone` from the `dogDetail` DTO; the fallback, if
  kept, is the page's or server's concern, not this card's. No still shows it,
  so it is not a case (see Gaps).
- **Honest-empty:** none for this unit. A missing dog is the page's "We can't
  find that dog" state, which replaces the whole page, card included.
- No writes, no optimistic flow, no client state, no channels.

## 2. Anatomy

```
<section class="card bg-base-100 border border-base-300">   daisyUI `card` (keep)
  <div class="card-body">                                    daisyUI `card-body` (keep)
    <h2 class="card-title text-2xl">                         daisyUI `card-title` (keep); h2 → --font-display (Caveat 700)
      <svg lucide paw-print, size-5 (20px), aria-hidden>
      "The dog"
    <dl class="dog-profile-card-facts">                      grid; columns auto 1fr; column-gap 1rem (gap-x-4); row-gap 0.5rem (gap-y-2); text-sm
      <dt class="dog-profile-card-term">Breed</dt>    <dd>{breed}</dd>
      <dt …>Kennel</dt>   <dd><span class="badge badge-outline font-mono">{kennel}</span></dd>   daisyUI `badge badge-outline` (keep)
      <dt …>Arrival</dt>  <dd class="tabular-nums">{arrival}</dd>
      <dt …>Owner</dt>    <dd>{ownerName}</dd>
      <dt …>Phone</dt>    <dd class="tabular-nums">{ownerPhone}</dd>
```

- Proposed own class names are prefixed (`dog-profile-card-facts`,
  `dog-profile-card-term`); the mock uses Tailwind utilities for these
  (`grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm`,
  `text-base-content/60`). Either keep the utilities or use the prefixed
  classes — never an unprefixed daisyUI name.
- The daisyUI components `card`, `card-body`, `card-title`, `badge`,
  `badge-outline` are the real components in the source; keep them.
- Tokens: surface `--color-base-100`, 1px border `--color-base-300`, radius
  `--radius-box` (1.25rem), card padding 1.5rem (`--card-p` default), terms in
  `base-content` at 60% opacity, kennel badge in `--font-mono`, rounded
  `--radius-selector` (1rem), height 24px (`--size-selector` × 6).
- The `dt` cells sit at the top of their grid row. On the Kennel row the badge
  (24px) is taller than the text, so "Kennel" reads visibly higher than
  "K01". This is in every still; reproduce it (no `align-items: center`).
- No slots or children. Icon: Lucide `paw-print`, rendered as inline SVG.

## 3. Props

| name | type | default | control widget | signal? |
| --- | --- | --- | --- | --- |
| `breed` | string | `"Golden Retriever"` | `text` | no |
| `kennel` | string | `"K01"` | `text` | no |
| `arrival` | string (`HH:MM`, display-only) | `"07:00"` | `text` | no |
| `ownerName` | string | `"Priya Raman"` | `text` | no |
| `ownerPhone` | string (pre-formatted) | `"(555) 0100-4000"` | `text` | no |

Defaults are dog `d01` as the stills show it. Every value is escaped text;
nothing is formatted in the unit (the phone string and arrival time come
pre-formatted in the DTO).

## 4. States → cases

Every case: `_tier: "static"`, default tolerance 0.01. `_theme` is `brand`
(the mock's `Default theme:`) unless the still is suffixed `-brand-dark`.
`_reference` paths are git-root-relative:
`fixtures/kennel-app/spec/ui/breakdown/pages/dog-detail/components/dog-profile-card/screenshots/<still>`.

| state | case | `_viewport` | `_theme` | still | data |
| --- | --- | --- | --- | --- | --- |
| default (desktop) | `default` | 1280 | brand | `dog-profile-card@1280.png` (400×269) | d01: Golden Retriever · K01 · 07:00 · Priya Raman · (555) 0100-4000 |
| base breakpoint | `bp-375` | 375 | brand | `dog-profile-card@375.png` (351×221) | d01 |
| sm breakpoint | `bp-640` | 640 | brand | `dog-profile-card@640.png` (616×221) | d01 |
| md breakpoint | `bp-768` | 768 | brand | `dog-profile-card@768.png` (720×221) | d01 |
| lg breakpoint | `bp-1024` | 1024 | brand | `dog-profile-card@1024.png` (315×269) | d01 |
| dark theme | `dark` | 1280 | brand-dark | `dog-profile-card@1280-brand-dark.png` (400×269) | d01 |
| long content | `long-breed` | 1280 | brand | `dog-profile-card-long-breed@1280.png` (400×269) | d03: Cavalier King Charles Spaniel · K03 · 09:30 · Hannah Lindqvist · (555) 0102-4074 |
| long content, narrow | `long-breed-375` | 375 | brand | `dog-profile-card-long-breed@375.png` (351×221) | d03 (the breed fits one line; no wrap) |
| overdue dog | `overdue-dog` | 1280 | brand | `dog-profile-card-overdue-dog@1280.png` (400×269) | d14: French Bulldog · K14 · 10:15 · Oliver Brandt · (555) 0113-4481. The card shows no overdue marker; overdue lives in `dog-heading`. |

No hover/disabled/loading/error/empty states exist for this unit: it is pure
display and the page owns loading/not-found.

**Known reference hazard (lg and up): row stretch.** At ≥1024 the page grid
is `lg:grid-cols-3` and the grid row stretches the card to the tallest
sibling: the stills are 269px tall, while the card's own content height is
221px (the same content at 375–768). Rendered alone in the isolate slot, the
card will be about 221px tall, which is more than 4px from 269, so the runner
reports a size mismatch on `default`, `bp-1024`, `dark`, `long-breed` and
`overdue-dog`. This is **described, not extracted — verify during build.** Fixes,
in preference order: (a) recapture the lg/xl stills with the card at
`align-self: start` so they show the unit's own height; (b) have the unit fill
its host (`:host { display: block; height: 100% }` + the card `h-full`)
and add a `_viewport` height case only if the runner can give the slot a
height, which the format does not describe. Never raise tolerance to absorb it.
In the 269px stills, the empty space sits below the list inside the card, since
`card-body` is `flex: 1 1 auto`.

## 5. Events

None. The unit emits no events. There are no controls, links or focusable
elements. Tests assert rendered content only:

- `expect(page.locator("dog-profile-card h2")).toHaveText("The dog")`
- `expect(page.locator("dog-profile-card dl dt")).toHaveText(["Breed","Kennel","Arrival","Owner","Phone"])`
- `expect(page.locator("dog-profile-card dl dd")).toHaveText(["Golden Retriever","K01","07:00","Priya Raman","(555) 0100-4000"])` (case `default`)
- `expect(page.locator("dog-profile-card .badge.badge-outline")).toHaveText("K01")`
- No bridge events fire: `ev.expect(e => e.source.startsWith("dog-profile-card"), { timeout: 500 })` must time out. This is optional; the DOM assertions are the real check.

## 6. Motion

None extracted. `document.getAnimations()` is `[]` at settle, and there are no
hover or transition classes (`screenshots/jank.md`). No `motion.json`, no
filmstrip, no `_motion` case. daisyUI's `.card` declares
`transition: outline 0.2s` for focus/checked outlines, but the card is never
focused or checked here, so nothing animates. Jank findings: none (static
CSS/JS lints clean).

## 7. Responsive

The source has no custom `@media`; only Tailwind default prefixes apply, and
this card has none of its own. It is fluid and fills its grid cell:

- **< 1024 (base/sm/md):** the page grid is one column, so the card spans the
  content width (351 / 616 / 720 px in the stills) at its natural height of
  221px.
- **≥ 1024 (lg, xl):** the page grid is three columns and the card is the
  first cell (315px at 1024, 400px at 1280), stretched to the row height
  (269px). Layout is the page's job; see the reference hazard above.
- The `dl` is `auto 1fr`: the term column is as wide as "Arrival", and values
  take the rest. The longest captured value ("Cavalier King Charles Spaniel")
  fits on one line even at 375. Longer values wrap inside `dd`.

## 8. A11y

- `section` holding an `h2` "The dog". The page `h1` is the dog's name
  (dog-heading), so the heading order is correct. Optionally add
  `aria-labelledby` pointing at the h2 so the section becomes a named region.
- The paw-print SVG is `aria-hidden="true"` (Lucide sets it). Keep it.
- `dl`/`dt`/`dd` gives screen readers term/value pairs; keep the real
  elements, not divs.
- No focusable elements, no keyboard behaviour, and no motion, so nothing is
  needed for reduced motion.
- Contrast: the terms use `base-content/60` on `base-100`. Check this at build
  (described, not measured).

## 9. Used on

- `dog-detail`, and only there (page-local; analyst evidence: page-local,
  primitive: card).

## 10. Isolate build plan

- **Lands at:** `fixtures/kennel-app/src/pages/dog-detail/components/dog-profile-card/`
  (`template.html` + `styles.css`, no `logic.ts`). Selector:
  `<dog-profile-card>`.
- **Preview routes:** `/components/dog-detail/dog-profile-card/<case>`
  (from `fixture.json`: `category: "dog-detail"`, `folder: "dog-profile-card"`).
  - `default`: d01 at 1280, brand, `dog-profile-card@1280.png`
  - `bp-375`: d01 at 375, `dog-profile-card@375.png`
  - `bp-640`: d01 at 640, `dog-profile-card@640.png`
  - `bp-768`: d01 at 768, `dog-profile-card@768.png`
  - `bp-1024`: d01 at 1024, `dog-profile-card@1024.png`
  - `dark`: d01 at 1280, brand-dark, `dog-profile-card@1280-brand-dark.png`
  - `long-breed`: d03 at 1280, `dog-profile-card-long-breed@1280.png`
  - `long-breed-375`: d03 at 375, `dog-profile-card-long-breed@375.png`
  - `overdue-dog`: d14 at 1280, `dog-profile-card-overdue-dog@1280.png`
- **Events → tests:** the §5 DOM assertions go in
  `cases/default/tests/content.spec.ts` (d01 values). Optionally add
  `cases/long-breed/tests/content.spec.ts` asserting the d03 breed renders on one
  line (the `dd` height equals one line box). Plain `@playwright/test` plus
  `ISOLATE_BASE_URL`; this is a static unit, so `waitHydrated` resolves
  immediately.
- **Loop:** scaffold the folder → copy in `isolate/` → `sprig isolate test --json
  --root fixtures/kennel-app` (the `_reference` rows are the pixel diff) →
  lift §5 into tests → run → iterate until green, then compose it into the
  `dog-detail` page's `lg:grid-cols-3` grid as the first cell. Expect the
  lg/xl size-mismatch rows described in §4 until that hazard is resolved.
  Fonts: the app document must load Caveat 700 (the h2) and Quicksand
  (body), or every row fails on font fallback. That failure is a real finding.

## Gaps

- **lg/xl row-stretched stills** (§4): 5 of 9 references are 269px tall
  because of the grid row stretch, not the unit's own height. Expect a
  size mismatch in isolation. Described, not extracted — verify during build.
- **Unknown-owner fallback:** the mock renders "Unknown owner" with an empty
  phone when the owner is missing. No still captures it, so there is no case.
  Described, not extracted.
- Stills are 1px taller than the capture table's WxH (221 vs 220, 269 vs 268),
  and the 1024 still is 315px wide against a 314.656px measured box. This
  comes from fractional boxes and the whole-pixel nudge. It is within the
  runner's 4px drift window.
