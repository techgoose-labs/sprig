# status-strip — the board's four status count cards

Page-local component of `board`. Selector `<status-strip>`, folder
`pages/board/components/status-strip/` (`template.html` + `styles.css`, **no
`logic.ts`**).

## 1. Classification & behavior

- **Bucket:** `static` (no island). **Interaction tier:** `static`.
- **Interactions:**
  | interaction | tier | behavior |
  | --- | --- | --- |
  | click a non-active card | static | a plain link to `?status=<s>`; the server re-renders the board with that filter |
  | click the active card | static | a plain link to `?status=all` (the mock resets to "all" when the active card is clicked again) |
  | hover | static (CSS) | `hover:bg-base-200` colour transition only |
- The mock's delegated `#app` click handler + `ui.filter` + `render()` is
  **replaced** by links; the filter is a query param (`data-model.md` hazard 3),
  so there is no client state, no signals, no island.
- **Data source:** `today.byStatus` (`GET /api/days/today`, the `today` query),
  resolved server-side by the board page and passed down as props. Counts are a
  **server rollup** — never tallied from `dogList` (`data-model.md` hazard 2).
- **Active card:** from the board's `status` query param (`all` or one enum
  value), passed as the `active` prop.
- **Honest-empty:** when there are no dogs today every count renders `—`
  (U+2014) instead of a number. The mock keys this on `dog.length === 0`; the
  strip only reads `today`, so the page derives `empty` (all four `byStatus`
  values 0, or `dogList` empty under `status=all`) and passes it as a prop.
- **Liveness:** request-response. After a status write elsewhere the counts are
  stale until the next `today` read (`data-model.md` hazard 4). Nothing is
  pushed.
- **Data-shape hazard:** `byStatus` is keyed `checked-in` / `checked-out`
  (hyphenated). The props flatten it to `checkedIn` / `checkedOut`, and the page
  maps them.

## 2. Anatomy

```
div.status-strip-grid        grid grid-cols-2 md:grid-cols-4 gap-3 mb-5
  a#status-strip-<s> × 4     daisyUI `card` (kept): card bg-base-100 border
                             (border-primary when active, else border-base-300)
                             text-left hover:bg-base-200 transition-colors
                             href="?status=<s>" | "?status=all" when active
                             aria-current="true" when active
    div                      daisyUI `card-body` (kept): card-body p-4 gap-1
      div.status-strip-head  flex items-center justify-between gap-2
        <status-badge status="<s>" size="sm">   shared component (badge badge-sm
                             + lucide icon + label; see its own spec)
      div.status-strip-count text-3xl font-semibold tabular-nums → count or "—"
```

- Order is fixed: `booked`, `checked-in`, `walking`, `checked-out` (the mock's
  `ORDER`).
- Badge per status, from `source.html`: booked `badge-info badge-soft` +
  `calendar-clock` "Booked"; checked-in `badge-success badge-soft` + `house`
  "Checked in"; walking `badge-accent` + `footprints` "Walking"; checked-out
  `badge-outline` + `log-out` "Checked out". All are `badge-sm whitespace-nowrap`,
  icon `size-[1em]`. This is owned by the shared `status-badge`; the strip only
  passes `status` + size `sm`.
- `card` and `card-body` are daisyUI components the source really uses, so keep
  them. The unit's own classes are prefixed `status-strip-*`.
- The element changes from `<button>` to `<a>`. `<a class="card">` must keep
  `text-left` and the full-card hit area. daisyUI `.card` is flex-column, so the
  box is the same as the button's.
- `transition-colors` overrides daisyUI's `.card { transition: outline .2s }`
  (the computed transition-property is the colour list). Keep the class order,
  or at least keep that override.

## 3. Props

| name | type | default | control widget | signal? |
| --- | --- | --- | --- | --- |
| `booked` | number | 7 | number | no |
| `checkedIn` | number | 14 | number | no |
| `walking` | number | 5 | number | no |
| `checkedOut` | number | 6 | number | no |
| `empty` | boolean | false | boolean | no |
| `active` | `"all" \| "booked" \| "checked-in" \| "walking" \| "checked-out"` | `"all"` | select | no |

Defaults are the captured seed values (`day.byStatus` = 7/14/5/6).

## 4. States → cases

Every case is `_tier: "static"`. `_theme` is `brand` (the mock default) unless
the row says otherwise. Stills are under
`fixtures/kennel-app/spec/ui/breakdown/pages/board/components/status-strip/screenshots/`
(git-root-relative). Default tolerance 0.01.

| state | case | props | `_viewport` | `_theme` | `_reference` |
| --- | --- | --- | --- | --- | --- |
| default: all, 4 columns | `default` | 7/14/5/6, active all | 1280 | brand | `status-strip@1280.png` (1232×94) |
| default at lg | `w1024` | same | 1024 | brand | `status-strip@1024.png` (976×94) |
| default at md (switch to 4 columns) | `w768` | same | 768 | brand | `status-strip@768.png` (720×94) |
| default at sm (2×2) | `w640` | same | 640 | brand | `status-strip@640.png` (616×200) |
| default at mobile (2×2) | `w375` | same | 375 | brand | `status-strip@375.png` (351×200) |
| dark theme | `dark` | same | 1280 | brand-dark | `status-strip@1280-brand-dark.png` |
| active filter: walking has `border-primary` and links to all | `active-walking` | active `walking` | 1280 | brand | `status-strip-walking@1280.png` |
| hover: booked card `bg-base-200` | `hover-booked` | defaults | 1280 | brand | none. The runner screenshots without hovering, so the still `status-strip-hover-booked@1280.png` is asserted by the hover spec (§5), not by `_reference` |
| empty: no dogs, all "—" | `empty` | counts 0, `empty: true` | 1280 | brand | `status-strip-empty@1280.png` |
| empty at mobile | `empty-w375` | counts 0, `empty: true` | 375 | brand | `status-strip-empty@375.png` |

No loading state belongs to the strip: the board page owns the skeleton (4 strip
skeletons). There is no error state either: `load-error` handles a failed load.
There are no writes, so there are no `pending`/`rolled-back` cases.

## 5. Events

The strip emits only navigation clicks. `source` is `a#status-strip-<s>`.

- Click a non-active card:
  `ev.expect(e => e.source === "a#status-strip-walking" && e.type === "click")`.
  The observable effect is
  `expect(page.locator("#status-strip-walking")).toHaveAttribute("href", "?status=walking")`.
  In isolation, stop the navigation first:
  `page.route("**/*status=*", r => r.abort())`, or just assert the href.
- Click the active card (case `active-walking`):
  `ev.expect(e => e.source === "a#status-strip-walking" && e.type === "click")`.
  The effect is `href === "?status=all"` and `aria-current === "true"` on that
  card only.
- Border (case `active-walking`): the computed `border-color` of
  `#status-strip-walking` is the primary (`#C2410C` in brand → rgb(194, 65, 12)).
  The other three are base-300 (`#E6D7C3`).
- Hover (case `hover-booked`): `await page.hover("#status-strip-booked")`, wait
  about 200ms, then `getComputedStyle(el).backgroundColor === "rgb(243, 234, 219)"`
  (brand base-200). Before hovering it is `"rgb(251, 247, 240)"` (base-100).
  `transitionDuration` includes `0.15s` and `transitionTimingFunction`
  includes `cubic-bezier(0.4, 0, 0.2, 1)`.
- Empty (cases `empty`, `empty-w375`): all four
  `#status-strip-<s> .status-strip-count` have text `"—"`.
- Default: the counts read `7`, `14`, `5`, `6` in ORDER, the hrefs are
  `?status=<s>`, and no card has `aria-current`.

## 6. Motion

Source: `screenshots/motion.json`, `screenshots/filmstrip.png` (the booked card
from 0 to 100%), and `screenshots/jank.md`.

| trigger | property | from → to (brand) | duration | delay | easing |
| --- | --- | --- | --- | --- | --- |
| pointer enters a card | `background-color` (CSSTransition) | rgb(251,247,240) → rgb(243,234,219) | 150ms | 0 | cubic-bezier(0.4, 0, 0.2, 1) |
| pointer leaves | `background-color` | reverse | 150ms | 0 | cubic-bezier(0.4, 0, 0.2, 1) |
| click (filter) | none: the mock re-renders the node, so `border-primary` is not animated | — | — | — | — |

- **Jank:** 0% dropped frames and a max frame of 16.8ms on both hover-sweep and
  click-toggle. No LoAF, CLS 0. No blocking lint.
- **Rebuild fix:** keep `transition-colors`. It is paint-only and cheap with 4
  elements. In the build, clicking navigates to a server re-render, so the
  border change is not animated either. That matches the mock.
- **No `_motion` case.** Both animations need a hover to start, and
  `isolate-format.md` puts interaction-started animations out of scope for
  `_motion`. The captured `motion.json` is also shaped
  `{ hoverIn, hoverOut, clickFilter }`, which the runner rejects: it wants an
  array or `{ animations: [...] }`. The hover spec in §5 asserts the duration
  and easing instead.

## 7. Responsive

The real breakpoints come from the source classes.

- `< 768px` (`grid-cols-2`): a 2×2 grid, gap 12px (`gap-3`). The strip is 351×200
  at 375 and 616×200 at 640.
- `≥ 768px` (`md:grid-cols-4`): one row of four. It is 720×94 at 768, 976×94 at
  1024, and 1232×94 at 1280.
- The card padding (`p-4`) and the count size (`text-3xl`) do not change with
  width. The strip's width comes from the board's `main` padding (`p-3` →
  `md:p-6`), not from the strip.

## 8. A11y

- Four `<a>` links in document order (booked → checked-out), each reachable by
  Tab and activated with Enter.
- Accessible name: the badge label plus the count, e.g. "Booked 7". The badge's
  lucide svg is `aria-hidden="true"`. Consider
  `aria-label="Booked: 7 dogs — filter"`; the mock gives none (described, not
  extracted).
- Active card: `aria-current="true"`. The mock had no programmatic state, only
  the border colour.
- Focus ring: the daisyUI/Tailwind default focus-visible outline on `<a>`. The
  mock's `<button>` had no custom ring. Do not remove the outline.
- Reduced motion: only a 150ms colour transition; no change needed.
- Empty "—": add `aria-label="no dogs"` or visually-hidden text so a screen
  reader does not read "em dash" (a build decision; the mock has none).

## 9. Used on

- `board` only (page-local, per the analyst's evidence: "Board-only").
  day-summary's `status-breakdown` is a different unit.

## 10. Isolate build plan

- **Lands at:** `fixtures/kennel-app/src/pages/board/components/status-strip/`
  (`template.html`, `styles.css`, no `logic.ts`). Selector `<status-strip>`.
  It composes the shared `<status-badge>` from
  `src/shared-components/status-badge`.
- **Preview routes:** `fixture.json` has `category: "board"`,
  `folder: "status-strip"`. Under `src/pages/`, discovery routes it as
  `/pages/board/status-strip/<case>`. This was verified with `sprig isolate list`,
  with the unit temporarily at that path.
- **Cases:**
  | case | state | `_reference` |
  | --- | --- | --- |
  | `default` | 7/14/5/6, all, 4 columns | `…/screenshots/status-strip@1280.png` |
  | `w1024` | same at 1024 | `…/status-strip@1024.png` |
  | `w768` | same at 768 (4 columns) | `…/status-strip@768.png` |
  | `w640` | 2×2 at 640 | `…/status-strip@640.png` |
  | `w375` | 2×2 at 375 | `…/status-strip@375.png` |
  | `dark` | brand-dark | `…/status-strip@1280-brand-dark.png` |
  | `active-walking` | walking selected, links to all | `…/status-strip-walking@1280.png` |
  | `hover-booked` | booked hovered | none (spec-asserted; still `…/status-strip-hover-booked@1280.png`) |
  | `empty` | no dogs, "—" | `…/status-strip-empty@1280.png` |
  | `empty-w375` | no dogs at 375 | `…/status-strip-empty@375.png` |
- **Events to tests:**
  - `default/tests/links.spec.ts`: counts in order, hrefs, no aria-current.
  - `active-walking/tests/active.spec.ts`: href `?status=all`, aria-current,
    primary border.
  - `hover-booked/tests/hover.spec.ts`: bg-base-200 after hover, 150ms, and the
    easing.
  - `empty/tests/empty.spec.ts`: four "—".
- **Loop:**
  1. Scaffold the folder and drop `isolate/` in.
  2. Run `sprig isolate test --root fixtures/kennel-app --json`. The
     `reference:` rows are the pixel diff.
  3. Lift the Events above into the specs above and re-run.
  4. Iterate until green, then compose into the `board` page.
- **Build notes:**
  - The fonts must load in the app document (Quicksand 400/600 for the counts
    and badges), or every `_reference` row fails.
  - Reconcile the scaffold's `brand-dark` default (see `design-tokens.md`), because
    unsuffixed cases pin `_theme: "brand"`.
