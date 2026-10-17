# dog-grid

Page-local to **board**. It is the list region under the status filter tabs
(mock region `#app > [role="tablist"] + div`). It renders the `dogList` rows as
a responsive grid of `<dog-card>`s, or one of two honest-empty cards.

## 1. Classification & behavior

- **Folder bucket:** `static` (no `logic.ts`). **Interaction tier:** `static`.
  The analyst classified it static, and nothing in the grid holds client state.
- **Data source:** the page resolves `dogList` (`GET /api/dogs?status=<s>`,
  pre-contract path from `data-model.md`) and passes the rows in as `dogs`,
  along with the active `status` param. The grid never filters, sorts or counts
  rows itself. The mock's `dog.filter(d => d.status === ui.filter)` becomes the
  query param (data-shape hazard 3). It never joins owners either: each row
  carries `ownerName` (hazard 1).
- **Liveness:** request-response. Nothing is pushed. A filter change is a
  navigation to `?status=<s>`, the page re-resolves, and the grid re-renders on
  the server. The mock re-renders the whole `#app` with `innerHTML` on every tab
  click; do not copy that.
- **Three render branches** (the order comes from `renderBoard`, js/dog-grid.js
  lines 356-384):
  1. `dogs.length > 0` → the grid of cards.
  2. `dogs.length === 0 && status === "all"` → **no dogs today**: a dashed
     card, `bone` icon, heading "No dogs booked today", and the line "When a
     booking lands for today it shows up here, ready to check in."
  3. `dogs.length === 0 && status !== "all"` → **empty for this filter**: a
     dashed card, `search-x` icon, "No dogs are **<status label, lowercased>**
     right now.", and a "Show all dogs" control. In the mock it is a
     `button[data-filter=all]`. In the build it is a link to `?status=all`,
     styled `btn btn-sm btn-ghost`.
  - The mock tells these two cases apart with the unfiltered array plus a
    client filter. With the query as the source, "no dogs today" is
    `status === "all"` and empty. **Data-shape note:** a filtered-empty
    response cannot tell you whether the day itself is empty. The mock shows
    "No dogs booked today" whenever the whole day is empty, whatever the
    filter. To match that exactly, the page can decide using
    `today.byStatus` (the sum is 0 means an empty day). Leave that decision to
    the page and pass the grid an explicit prop if needed. See GAPS.
- **Status labels** (from `STATUS`): `booked`→"Booked", `checked-in`→"Checked
  in", `walking`→"Walking", `checked-out`→"Checked out". The empty-filter text
  lowercases the label ("checked in").

## 2. Anatomy

```
<dog-grid>                                   host
  div.dog-grid-list                           grid: 1 col; sm 2; lg 3; xl 4; gap 16px (gap-4)
    <dog-card …row…>  × dogs.length           child unit (pages/board/components/dog-card)
  -- or --
  div.card.bg-base-100.border.border-dashed.border-base-300   (daisyUI `card`, kept)
    div.card-body.items-center.text-center.py-16 (no-dogs) | .py-12 (filter-empty)
      svg lucide bone size-10 text-base-content/40     | search-x size-8
      h2.font-display.text-3xl "No dogs booked today"  | p.text-base-content/70 "No dogs are <b>walking</b> right now."
      p.text-base-content/70.max-w-sm "When a booking…" | a.btn.btn-sm.btn-ghost href="?status=all" "Show all dogs"
```

- Its own class names are prefixed: `dog-grid-list`, `dog-grid-empty`. Tailwind
  utilities can stay (`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3
  xl:grid-cols-4 gap-4`).
- The empty cards **are** daisyUI `card` / `card-body` / `btn` and should be kept
  as daisyUI. Do not restyle them under those names in scoped CSS.
- Measured column tracks (evidence): 375 → `351px`; 640 → `300px 300px`; 768
  → `352px 352px`; 1024 → `314.656px 314.672px 314.656px`; 1280 → `296px ×4`.
- Cards stretch to row height (grid default `align-items: stretch`). In the
  1280 still, a row containing a wrapped long name (Sir Reginald…) makes its
  cards taller, and the name wraps to 3 lines.

## 3. Props

| name | type | default | control widget | signal? |
| --- | --- | --- | --- | --- |
| `status` | `"all" \| "booked" \| "checked-in" \| "walking" \| "checked-out"` | `"all"` | `select` | no |
| `dogs` | `DogListRow[]` (`id, name, breed, kennel, status, arrival, overdue, overdueBy?, ownerName`) | `[]` | none (array; set per case) | no |

`dogs` has no fixture control because no control type holds an array. Cases set
it as a bare key (see GAPS). Each row goes to `<dog-card>` unchanged. Its prop
name is whatever the dog-card spec declares (see GAPS).

## 4. States → cases

Every case carries `_tier: "static"`. `_reference` paths are git-root-relative:
`fixtures/kennel-app/spec/ui/breakdown/pages/board/components/dog-grid/screenshots/…`.

| case | state | `_viewport` | `_theme` | `_reference` | data |
| --- | --- | --- | --- | --- | --- |
| `default` | all dogs, 4 cols (xl) | 1280 | brand | `dog-grid@1280.png` | the 32 rows below |
| `base-375` | all dogs, 1 col | 375 | brand | `dog-grid@375.png` | 32 rows |
| `sm-640` | all dogs, 2 cols | 640 | brand | `dog-grid@640.png` | 32 rows |
| `md-768` | all dogs, 2 cols (md page padding) | 768 | brand | `dog-grid@768.png` | 32 rows |
| `lg-1024` | all dogs, 3 cols | 1024 | brand | `dog-grid@1024.png` | 32 rows |
| `dark` | all dogs, brand-dark | 1280 | brand-dark | `dog-grid@1280-brand-dark.png` | 32 rows |
| `filter-walking` | `status=walking`, 5 cards | 1280 | brand | `dog-grid-filter-walking@1280.png` | Sir Reginald, Luna, Nala, Pickles, Tofu |
| `empty-day` | honest-empty: no dogs booked today | 1280 | brand | none (no still) | `dogs: []`, `status: all` |
| `empty-filter` | honest-empty: none walking right now | 1280 | brand | none (no still) | `dogs: []`, `status: walking` |

The unsuffixed stills get `_theme: "brand"` from `design-tokens.md`
("Default theme: brand"). Tolerance stays at the default 0.01.

**Captured rows** (read off `dog-grid@1280.png`, in display order;
`overdue` is true only for Rocco `2h 15m` and Olive `45m`):

| kennel | name | breed | owner | status | arrival |
| --- | --- | --- | --- | --- | --- |
| K01 | Biscuit | Golden Retriever | Priya Raman | booked | 07:00 |
| K02 | Juniper | Border Collie | Tomás Ortega | checked-in | 08:15 |
| K03 | Sir Reginald Barksworth-Fluffington III | Cavalier King Charles Spaniel | Hannah Lindqvist | walking | 09:30 |
| K04 | Mochi | Shiba Inu | Kwame Mensah | checked-out | 10:45 |
| K05 | Pepper | Dachshund | Aiko Watanabe | booked | 11:00 |
| K06 | Otis | Labrador | Declan Byrne | checked-in | 07:15 |
| K07 | Luna | Greyhound | Sofia Moretti | walking | 08:30 |
| K08 | Waffles | Corgi | Jonah Feldman | checked-out | 09:45 |
| K09 | Clementine | Poodle (Standard) | Amara Nwosu | booked | 10:00 |
| K10 | Bruno | Boxer | Lucas Petit | checked-in | 11:15 |
| K11 | Nala | Beagle | Ingrid Holm | walking | 07:30 |
| K12 | Ziggy | Jack Russell Terrier | Mateo Silva | checked-out | 08:45 |
| K13 | Hazel | Bernese Mountain Dog | Grace Kim | booked | 09:00 |
| K14 | Rocco | French Bulldog | Oliver Brandt | checked-in (overdue 2h 15m) | 10:15 |
| K15 | Pickles | Whippet | Leila Haddad | walking | 11:30 |
| K16 | Maple | Australian Shepherd | Noah Carter | checked-out | 07:45 |
| K17 | Gus | Golden Retriever | Yuki Sato | booked | 08:00 |
| K18 | Olive | Border Collie | Elena Popescu | checked-in (overdue 45m) | 09:15 |
| K19 | Tofu | Cavalier King Charles Spaniel | Sam Okafor | walking | 10:30 |
| K20 | Bear | Shiba Inu | Maya Thompson | checked-out | 11:45 |
| K21 | Poppy | Dachshund | Priya Raman | booked | 07:00 |
| K26 | Ranger | Labrador | Tomás Ortega | checked-in | 08:15 |
| K27 | Willow | Greyhound | Hannah Lindqvist | checked-out | 09:30 |
| K28 | Kobe | Corgi | Kwame Mensah | booked | 10:45 |
| K29 | Daisy | Poodle (Standard) | Aiko Watanabe | checked-in | 11:00 |
| K30 | Moose | Boxer | Declan Byrne | checked-in | 07:15 |
| K31 | Scout | Beagle | Sofia Moretti | checked-in | 08:30 |
| K32 | Pretzel | Jack Russell Terrier | Jonah Feldman | checked-in | 09:45 |
| K33 | Ruby | Bernese Mountain Dog | Amara Nwosu | checked-in | 10:00 |
| K34 | Finn | French Bulldog | Lucas Petit | checked-in | 11:15 |
| K35 | Nori | Whippet | Ingrid Holm | checked-in | 07:30 |
| K36 | Chewie | Australian Shepherd | Mateo Silva | checked-in | 08:45 |

The kennel codes jump from K21 to K26 in the still, and the cases keep that
jump. Row ids are `d01`…`d32` in display order. Only d01, d02 (source.html) and
d14 = Rocco (capture notes) were confirmed. The rest are inferred from
"sequential ids" in data-model.md, and they only affect `href`s, not pixels.

## 5. Events

The grid emits no events of its own. Everything interactive in it is a
navigation link.

- Card click → dog detail (the link belongs to dog-card, and it appears here
  once per row):
  `ev.expect(e => e.source === "a" && e.type === "click")`, then check the DOM
  effect `await expect(page.locator("dog-grid a[href*='d01']")).toHaveCount(1)`
  (the href goes to the build's dog-detail route for `d01`).
- Card count follows the rows: `default` →
  `expect(page.locator("dog-grid dog-card")).toHaveCount(32)`; `filter-walking`
  → 5.
- `empty-day`: `expect(page.getByRole("heading", { name: "No dogs booked today" })).toBeVisible()`
  and `expect(page.locator("dog-grid dog-card")).toHaveCount(0)`.
- `empty-filter`: `expect(page.getByText("No dogs are walking right now.")).toBeVisible()`,
  plus "Show all dogs" is a link to `?status=all`:
  `expect(page.getByRole("link", { name: "Show all dogs" })).toHaveAttribute("href", /status=all/)`.
  Clicking it: `ev.expect(e => e.source === "a" && e.type === "click" && /Show all dogs/.test(e.detail ?? ""))`.

## 6. Motion

None of its own: `document.getAnimations()` is `[]` at settle, and there is no
motion.json or filmstrip, so there is no `_motion` case. The only motion is the
child cards' hover `transition-shadow` (specced under dog-card).

**Jank** (screenshots/jank.md, one sample at 1280): 0 % dropped frames, max
frame 16.8 ms, 1 long-animation-frame of 100.8 ms (the initial render of 32
cards plus `lucide.createIcons`), CLS 0.0001.
- Lint inherited from the children: `transition-property: box-shadow`. Fix
  (in dog-card): put the shadow on `::after` and animate its `opacity`.
- The mock re-renders all of `#app` via `innerHTML`, then scans the whole page
  with `createIcons()`, on every tab click. Fix: render on the server with
  inline SVG icons (no runtime icon pass). A filter change is a navigation, so
  there is no client re-render.

## 7. Responsive

Only Tailwind defaults (no custom `@media`):
- < 640: `grid-cols-1` (a 351px track at 375)
- ≥ 640 `sm`: 2 cols (300px at 640; 352px at 768, where the md page padding of
  24px applies)
- ≥ 1024 `lg`: 3 cols (~314.66px)
- ≥ 1280 `xl`: 4 cols (296px)
- The gap is 16px at every width. The empty cards are full-width at all sizes
  (`max-w-sm` on the no-dogs sentence).

## 8. A11y

- The grid is a plain `div` of links (no list role in the mock). Keep it that
  way, or use `ul/li`, which improves on the mock.
- Each card is one `<a>` whose name comes from its text content. Tab order
  follows DOM order, which is row-major in display order.
- Empty states: "No dogs booked today" is an `h2`. Icons are
  `aria-hidden="true"`. "Show all dogs" is a real link, so it works with the
  keyboard (Enter).
- The grid has no focus trap or motion. The card hover shadow respects
  `prefers-reduced-motion` in dog-card (the source's only `@media`).

## 9. Used on

- **board**, only there. Page-local.

## 10. Isolate build plan

- **Lands at:** `fixtures/kennel-app/src/pages/board/components/dog-grid/`
  (`template.html` + `styles.css`, no `logic.ts`). **Selector:** `<dog-grid>`.
  It composes `<dog-card>` (sibling `pages/board/components/dog-card`), so build
  dog-card first.
- **Preview routes:** `/components/board/dog-grid/<case>` (fixture
  `category: "board"`, `folder: "dog-grid"`). For example,
  `/components/board/dog-grid/default`.
- **Cases:** `default` (1280, `dog-grid@1280.png`), `base-375`
  (`dog-grid@375.png`), `sm-640` (`dog-grid@640.png`), `md-768`
  (`dog-grid@768.png`), `lg-1024` (`dog-grid@1024.png`), `dark` (brand-dark,
  `dog-grid@1280-brand-dark.png`), `filter-walking`
  (`dog-grid-filter-walking@1280.png`), `empty-day` (no still, spec only),
  `empty-filter` (no still, spec only).
- **Tests from Events:** `default/tests/grid.spec.ts` (32 cards, the d01 href);
  `filter-walking/tests/grid.spec.ts` (5 cards);
  `empty-day/tests/empty.spec.ts` (heading, 0 cards);
  `empty-filter/tests/empty.spec.ts` (text plus the `?status=all` link). Both
  empty cases **need** their spec. Without one they report "skipped — no tests,
  no _reference".
- **Loop:** scaffold the folder → drop `isolate/` in →
  `sprig isolate test board/dog-grid --root fixtures/kennel-app --json` (the
  `_reference` rows are the diff) → lift Events into the tests above → run →
  iterate until green → then compose into the board page.

## GAPS (described, not extracted — verify during build)

- **Empty states have no still.** The capture did not shoot `?state=empty` as a
  grid still (the selector matched the dashed card). A filtered-empty state
  cannot happen with the seed data. The markup and text are from
  js/dog-grid.js; the layout is described, not extracted.
- **Ids d03–d32 (except d14) are inferred.** They affect hrefs only.
- **`dogs` has no control** (no array widget). The array is a bare case prop.
  The name of the per-row prop on `<dog-card>` has to match the dog-card spec.
- **Stage background:** the stills include the page's `bg-base-200` in the gaps
  between cards. `fixture.json` sets `background: "#F3EADB"` (brand base-200),
  which is wrong for the `dark` case (`#29201A`), and there is no per-case
  background key. If the runner does not use the theme's base-200, the `dark`
  reference will fail in the gaps. Alternatively, the build can paint
  `bg-base-200` on the host, but only if the page does not already.
- **"No dogs today" vs filter-empty** needs a day-level signal once the grid
  reads a filtered query (see §1).
