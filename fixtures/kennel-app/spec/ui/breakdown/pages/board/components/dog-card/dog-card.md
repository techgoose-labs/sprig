# dog-card

Page-local card on **board**: one dog of the `dogList` query rendered as a
link card to that dog's detail page. Source region:
`#app a.card[href^="#/dog/"]` (32 matches on `#/board`). Evidence: this folder's
`source.html` (d01 + d14 rendered), `js/dog-card.js` (`dogCard()`, `STATUS`,
`badge()`, `overdueBadge()`), `css/`, `screenshots/`.

## 1. Classification & behavior

- **Bucket:** `static` component (no `logic.ts`). **Tier:** `static`. It has no
  interaction of its own except navigation (a plain `<a href>`), and hover
  styling (CSS only).
- **Data source:** resolve, one row of `dogList` (`GET /api/dogs?status=<s>`),
  handed down by `dog-grid`. The fields are `id, name, breed, kennel, status,
  arrival, overdue, overdueBy, ownerName`.
- **Data-shape hazard:** the mock joins the owner on the client
  (`owner(d.owner)` over the whole owner collection, fallback
  `"Unknown owner"`). The build takes **`ownerName` from the query DTO**. It
  never loads owners and joins. The "Unknown owner" fallback is the server's
  concern, and no still shows it.
- **Liveness:** request-response. Nothing in the mock is pushed. The card
  re-renders only when the board's query is re-resolved (e.g. filter change).
- **Channels:** none. It neither sets nor reads `dog`/`day`/`toasts`.

## 2. Anatomy

Keep the daisyUI components the source uses: daisyUI `card`, `card-body`,
`card-title`, `badge` (+ `badge-outline`, `badge-soft`, `badge-info`,
`badge-success`, `badge-accent`, `badge-error`). Any wrapper class the unit
itself needs is prefixed `dog-card-` (e.g. `dog-card-head`, `dog-card-meta`,
`dog-card-foot`). It is never `card`, `badge`, `status`, `link` or `label`.

```
<dog-card>                                   host: must fill the grid cell (display:block; height:100%)
  a.card.bg-base-100.border(.border-base-300 | .border-error when overdue)
     .hover:shadow-sm.transition-shadow.min-w-0      href → dog detail for {id} (mock: "#/dog/{id}")
    div.card-body.p-4.gap-2
      div.dog-card-head  (flex items-start justify-between gap-2 min-w-0)
        h2.card-title.text-2xl.leading-tight.min-w-0.break-words   {name}   (Caveat display font)
        span.badge.badge-outline.font-mono.shrink-0                {kennel}
      p.text-sm.text-base-content/70.truncate                      {breed}
      p.dog-card-owner (text-sm flex items-center gap-1 min-w-0)
        svg lucide "user" size-4 shrink-0 aria-hidden
        span.truncate                                              {ownerName}
      div.dog-card-foot (flex flex-wrap items-center gap-2 mt-1)
        span.badge {STATUS[status].badge} whitespace-nowrap  [lucide icon size-[1em]] {label}
        span.badge.badge-error.whitespace-nowrap  [alarm-clock] "Overdue · {overdueBy}"   (only if overdue; " · …" only if overdueBy)
        span.ml-auto.text-sm.text-base-content/70.tabular-nums  [lucide clock size-4] {arrival}
```

Status map (verbatim, `js/dog-card.js` `STATUS`):

| status | label | badge classes | lucide icon |
| --- | --- | --- | --- |
| `booked` | Booked | `badge-info badge-soft` | `calendar-clock` |
| `checked-in` | Checked in | `badge-success badge-soft` | `house` |
| `walking` | Walking | `badge-accent` | `footprints` |
| `checked-out` | Checked out | `badge-outline` | `log-out` |

Measured colors: the border is `rgb(230,215,195)` (base-300) normally and
`rgb(192,57,43)` (error) when overdue. In brand-dark they are
`rgb(58,46,36)` and `rgb(224,106,92)`. `.card-body p { flex-grow: 1 }`
(daisyUI) is what spreads the rows when the grid stretches the card taller.
The 1280 stills show this.

Icons: the mock uses Lucide `<i data-lucide>`, which is replaced by inline
`<svg>` at runtime (`source.html` has the resolved SVG paths). The build inlines
those SVGs in `template.html`. It adds no client script.

## 3. Props

| name | type | default | control widget | signal? |
| --- | --- | --- | --- | --- |
| `id` | string | `"d01"` | text | no |
| `name` | string | `"Biscuit"` | text | no |
| `kennel` | string | `"K01"` | text | no |
| `breed` | string | `"Golden Retriever"` | text | no |
| `ownerName` | string | `"Priya Raman"` | text | no |
| `status` | `"booked" \| "checked-in" \| "walking" \| "checked-out"` | `"booked"` | select | no |
| `arrival` | string (`HH:MM`) | `"07:00"` | text | no |
| `overdue` | boolean | `false` | boolean | no |
| `overdueBy` | string | `""` | text | no |

## 4. States → cases

Every case has `_tier: "static"`. `_theme` is `brand` (the default theme in
`design-tokens.md`) unless the still is suffixed. The `_reference` prefix is
`fixtures/kennel-app/spec/ui/breakdown/pages/board/components/dog-card/screenshots/`.
The tolerance stays at the default 0.01.

| case | state | data | `_viewport` | `_theme` | `_reference` |
| --- | --- | --- | --- | --- | --- |
| `default` | booked, base-300 border | d01 Biscuit · K01 · Golden Retriever · Priya Raman · booked · 07:00 | 1280 | brand | `dog-card@1280.png` |
| `default-375` | booked, 1-col grid | d01 | 375 | brand | `dog-card@375.png` |
| `default-640` | booked, 2-col grid | d01 | 640 | brand | `dog-card@640.png` |
| `default-768` | booked, 2-col grid | d01 | 768 | brand | `dog-card@768.png` |
| `default-1024` | booked, 3-col grid | d01 | 1024 | brand | `dog-card@1024.png` |
| `default-dark` | booked, dark theme | d01 | 1280 | brand-dark | `dog-card@1280-brand-dark.png` |
| `checked-in` | checked-in soft success badge | d02 Juniper · K02 · Border Collie · Tomás Ortega · checked-in · 08:15 | 1280 | brand | `dog-card-checked-in@1280.png` |
| `long-name-walking` | 3-line wrapping title, accent badge | d03 Sir Reginald Barksworth-Fluffington III · K03 · Cavalier King Charles Spaniel · Hannah Lindqvist · walking · 09:30 | 1280 | brand | `dog-card-long-name-walking@1280.png` |
| `long-name-walking-375` | same, mobile | d03 | 375 | brand | `dog-card-long-name-walking@375.png` |
| `checked-out` | outline badge | d04 Mochi · K04 · Shiba Inu · Kwame Mensah · checked-out · 10:45 | 1280 | brand | `dog-card-checked-out@1280.png` |
| `overdue` | `border-error` + "Overdue · 2h 15m" badge; the arrival time wraps to its own line | d14 Rocco · K14 · French Bulldog · Oliver Brandt · checked-in · 10:15 · overdueBy 2h 15m | 1280 | brand | `dog-card-overdue@1280.png` |
| `overdue-375` | overdue, mobile | d14 | 375 | brand | `dog-card-overdue@375.png` |
| `overdue-dark` | overdue, dark theme | d14 | 1280 | brand-dark | `dog-card-overdue@1280-brand-dark.png` |
| `hover` | hovered, shadow-sm settled; carries `_motion` | d01 | 1280 | brand | `dog-card-hover@1280.png` |

Not a case: the "Overdue" badge with no `overdueBy` (it renders plain
"Overdue") and the "Unknown owner" fallback. No still shows either one
(described, not extracted).

## 5. Events

| trigger | predicate sketch |
| --- | --- |
| click anywhere on the card → navigates to that dog's detail | `ev.expect(e => e.source === "a" && e.type === "click")`, and as DOM effect: `await expect(page.locator("dog-card a.card")).toHaveAttribute("href", /\/dog\/d01$/)` |
| overdue card carries the error border + badge | `await expect(page.locator("dog-card a.card")).toHaveClass(/border-error/); await expect(page.locator("dog-card .badge-error")).toHaveText("Overdue · 2h 15m")` (case `overdue`) |
| hover shows the shadow | `await page.locator("dog-card a.card").hover(); await page.waitForTimeout(200); expect(await page.locator("dog-card a.card").evaluate(el => getComputedStyle(el).boxShadow)).toContain("rgba(0, 0, 0, 0.1) 0px 1px 3px 0px")` (case `hover`; if the rebuild uses the `::after` fix, assert `getComputedStyle(el, "::after").opacity === "1"` instead) |
| keyboard: Tab focuses the card, Enter navigates | `await page.keyboard.press("Tab"); await expect(page.locator("dog-card a.card")).toBeFocused(); ev.expect(e => e.source === "a" && e.type === "keydown" && e.detail === "Enter")` |

The card emits no custom events (`ctx.output`). It is a plain link.

## 6. Motion

Extracted (`screenshots/motion.json`, `screenshots/filmstrip.png` at 0/20/40/60/80/100 %):

- **Trigger:** pointer `:hover` on `a.card` (`hover:shadow-sm` inside
  `@media (hover: hover)`, plus `transition-shadow`). It reverses on leave.
- **CSSTransition `box-shadow`:** `none` → `0 1px 3px 0 rgba(0,0,0,.1), 0 1px
  2px -1px rgba(0,0,0,.1)` (plus 4 transparent Tailwind ring/inset layers).
  Duration **150 ms**, delay 0, easing **`cubic-bezier(0.4, 0, 0.2, 1)`**,
  fill backwards, 1 iteration, 2 keyframes.
- There is also daisyUI's `.card { transition: outline 0.2s ease-in-out }`,
  used for the focus-visible outline.
- **Jank (live sample):** a hover sweep over 8 cards gave 0 % dropped frames,
  max frame 16.8 ms, and CLS 0.0001. One LoAF of 71.9 ms came from the initial
  render, not from hover.
- **Lint finding and rebuild fix:** animating `box-shadow` repaints the shadow
  every frame. Pre-render the `shadow-sm` shadow on `a.card::after`
  (`position:absolute; inset:0; border-radius:inherit; pointer-events:none;
  opacity:0`) and transition `opacity` 0→1 (150 ms, same easing) on hover.
- `prefers-reduced-motion: reduce` makes the transition instant (the global
  block in `design-tokens.md`).
- The case `hover` carries `_motion: { "spec": "…/screenshots/motion.json" }`.

## 7. Responsive

The card sizes to its `dog-grid` cell. The mock has no custom `@media`. Only
the grid changes columns: 1 col below 640, 2 cols from `sm` 640, 3 cols from
`lg` 1024, 4 cols from `xl` 1280. The measured slot widths are 351 (375),
300 (640), 352 (768), 314.656 (1024) and 296 (1280).

Inside the card:

- The title wraps (`break-words`). d03 wraps to 3 lines at 1280 and 2 lines
  at 375.
- Breed and owner truncate with an ellipsis.
- The footer `flex-wrap`s. With two badges at 296 px the arrival time drops to
  its own line (d14 @1280).

Cards in a row stretch to the tallest one. That is why d01 is 205 px tall at
1280 (row with d03) but 152 px tall at 375.

## 8. A11y

- The whole card is one `<a>`, so it is keyboard-focusable in DOM order.
  daisyUI `.card:focus-visible` gives the outline (currentColor, offset 2px).
- The accessible name is the link's text content (name, kennel, breed, owner,
  status, time). Optionally add
  `aria-label="{name}, kennel {kennel}, {status label}{, overdue {overdueBy}}"`
  to shorten it (not in the mock).
- `h2.card-title` gives each dog a heading in the board's outline.
- All icons are `aria-hidden="true"`. The status and overdue meaning is carried
  by text, not by color alone. The error border is paired with the
  "Overdue" text.
- Reduced motion: the global `prefers-reduced-motion` block collapses the
  transition.

## 9. Used on

- `board` only (page-local, per the analyst's inventory), rendered by
  `dog-grid`, once per `dogList` row.

## 10. Isolate build plan

- **Lands at:** `fixtures/kennel-app/src/pages/board/components/dog-card/`
  (`template.html` + `styles.css`, no `logic.ts`). The selector is
  `<dog-card>`.
- **Preview routes:** `/components/board/dog-card/<case>`, from
  `fixture.json` `category: "board"`, `folder: "dog-card"`. For example
  `/components/board/dog-card/default` and
  `/components/board/dog-card/overdue`.
- **Cases:** the 14 in §4, each with its `_reference` still. `hover` also
  carries `_motion`.
- **Events → tests:**
  - `cases/default/tests/navigate.spec.ts` gets the click/href row.
  - `cases/default/tests/keyboard.spec.ts` gets the Tab/Enter row.
  - `cases/overdue/tests/overdue.spec.ts` gets the border-error + badge text
    row.
  - `cases/hover/tests/hover.spec.ts` gets the hover-shadow row.
  - Write them as plain `@playwright/test` using
    `process.env.ISOLATE_BASE_URL`.
- **Loop:**
  1. Scaffold the folder.
  2. Copy this `isolate/` in.
  3. Run `sprig isolate test --root fixtures/kennel-app --json`. The
     `reference:` rows are the pixel diff and the `motion:` row is the
     hover spec.
  4. Lift the Events into `tests/`.
  5. Run again and iterate to green before `dog-grid` composes it.
- **Build notes:**
  - Load Caveat and Quicksand in the app head, or every row fails on the
    fallback font.
  - The host element must stretch to its grid cell (see the height caveat
    below).

### Known caveats (verify during build)

- **Row-stretched heights.** The 1280/1024 stills of d01, d02, d03, d04 and
  hover are grid-row heights (205/179 px, set by d03 in the row). A
  standalone card renders at its natural height, which is about 152 px for
  d01. That is more than 4 px off, and the runner then reports
  `size mismatch`, not a diff fraction. Either recapture those stills
  standalone, or accept that the heights are row-driven. Do not raise the
  tolerance. The 375/640/768 d01 stills and the d14/d03@375 stills look
  closer to natural height, but this is unverified.
- **Hover motion is interaction-triggered.** `isolate-format.md` says `_motion`
  covers animations present at load, and says to assert interaction-started
  ones in a spec. The `hover` case's `motion:` row is therefore likely to
  report the box-shadow transition as missing. The `hover.spec.ts` row is the
  real check. If the `::after`/opacity fix is applied, the property name also
  changes from `box-shadow` to `opacity`.
- **`hover` `_reference`.** The runner screenshots the element without
  hovering, and the shadow falls mostly outside the element's crop. So this
  row passes or fails the same way as `default` and does not prove the hover.
