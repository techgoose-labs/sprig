# status-breakdown

Page-local component of **day-summary**: a card titled "Dogs by status". It shows one row
per dog status. Each row has a status badge, a progress bar and the count, and each bar is
scaled against the total number of kennels. It is read-only: the server aggregates the counts.

Evidence: `source.html`, `js/status-breakdown.js` (mock lines 244-250, 262, 266-269,
516-524, 566-569), `css/matched-rules.css` (43 rules), `screenshots/` (8 stills).

## 1. Classification & behavior

| aspect | value |
| --- | --- |
| folder bucket | `static` — no `logic.ts`, not an island |
| interaction tier | `static`. It has no interactions: no controls, no links, no writes |
| data source | the `today` query (`GET /api/days/today`), fields `byStatus` and `kennelsTotal`. The page resolves it and passes the values down as props |
| liveness | request-response. Nothing is pushed. After a status command elsewhere, the counts are stale until the next `today` read (data-model hazard 4) |
| data-shape hazard | `byStatus` is a **server rollup** (data-model hazard 2). The unit renders the numbers it gets and never counts dogs from `dogList`. Keys are `booked`, `checked-in`, `walking`, `checked-out` |
| honest-empty | there is no "no data" branch in the mock: `byStatus` always carries all four keys, and a zero renders as an empty bar with `0`. The page decides what to show when the `today` read fails; this unit does not |
| channels | none. The `day` channel (set by close-day-control, read by day-closed-alert and day-stats) does **not** reach this unit. Closing the day does not change its rendering (see the `overdue-empty` case) |

## 2. Anatomy

```
section.card.bg-base-100.border.border-base-300        ← daisyUI `card` (keep)
  div.card-body                                         ← daisyUI `card-body` (keep)
    h2.card-title.text-2xl                              ← daisyUI `card-title`; font-display (Caveat 700)
      <i data-lucide="dog" class="size-5">              ← decorative icon
      "Dogs by status"
    ul                                                  ← list-style none
      li.flex.items-center.gap-3.py-2   × 4, in ORDER booked, checked-in, walking, checked-out
        span.w-32.shrink-0                              ← fixed 8rem badge column
          span.badge.<variant>.badge-sm.whitespace-nowrap   ← daisyUI `badge` (keep)
            <i data-lucide="<icon>" class="size-[1em]">
            "<label>"
        progress.progress.<progress-variant>.flex-1  value=<count> max=<kennelsTotal>   ← daisyUI `progress` (keep)
        span.w-8.text-right.tabular-nums.font-semibold  "<count>"
```

The status table, taken verbatim from the mock's `STATUS`/`ORDER` constants:

| status key | label | badge classes | icon | progress class |
| --- | --- | --- | --- | --- |
| `booked` | Booked | `badge-info badge-soft` | `calendar-clock` | `progress-info` |
| `checked-in` | Checked in | `badge-success badge-soft` | `house` | `progress-success` |
| `walking` | Walking | `badge-accent` | `footprints` | `progress-accent` |
| `checked-out` | Checked out | `badge-outline` | `log-out` | none (plain `progress`, base-content colour) |

The daisyUI names in the tree are the real daisyUI components and are kept: `card`,
`card-body`, `card-title`, `badge`, `progress`. Any class of the unit's own must be prefixed
`status-breakdown-…` (for example `status-breakdown-row`, `status-breakdown-count`). It must
never be a daisyUI name, because `sprig build` bundles daisyUI 5 globally. The mock uses no
classes of its own; Tailwind utilities are enough.

## 3. Props

The page maps `today.byStatus[...]` and `today.kennelsTotal` onto these props. The props are
flat numbers because an isolate control cannot be an object.

| name | type | default | control widget | signal? |
| --- | --- | --- | --- | --- |
| `booked` | integer | 7 | `number` | no |
| `checkedIn` | integer (from `byStatus["checked-in"]`) | 14 | `number` | no |
| `walking` | integer | 5 | `number` | no |
| `checkedOut` | integer (from `byStatus["checked-out"]`) | 6 | `number` | no |
| `kennelsTotal` | integer (the `max` of every bar) | 40 | `number` | no |

The defaults are the captured seed values.

## 4. States → cases

Every case carries `_tier: "static"` and the real captured values booked 7, checked in 14,
walking 5, checked out 6, kennelsTotal 40. `_reference` paths are git-root-relative, under
`fixtures/kennel-app/spec/ui/breakdown/pages/day-summary/components/status-breakdown/screenshots/`.
Unsuffixed stills use `_theme: "brand"`, the `Default theme:` from design-tokens.md.

| state | case | `_viewport` | `_theme` | `_reference` | still size |
| --- | --- | --- | --- | --- | --- |
| default: open day, seed counts | `default` | 1280 | brand | `status-breakdown@1280.png` | 608×234 |
| mobile | `at-375` | 375 | brand | `status-breakdown@375.png` | 351×234 |
| small | `at-640` | 640 | brand | `status-breakdown@640.png` | 616×234 |
| tablet (single column, stats horizontal) | `at-768` | 768 | brand | `status-breakdown@768.png` | 720×234 |
| lg half column: bars shorter | `at-1024` | 1024 | brand | `status-breakdown@1024.png` | 480×245 (see gap 1) |
| dark, mobile | `dark-375` | 375 | brand-dark | `status-breakdown@375-brand-dark.png` | — |
| dark, desktop | `dark-1280` | 1280 | brand-dark | `status-breakdown@1280-brand-dark.png` | — |
| page with no overdue pickups; this unit is unchanged | `overdue-empty` | 1280 | brand | `status-breakdown-empty@1280.png` | 608×234 |

Tolerance stays at the default 0.01 everywhere. No case pins a small detail by itself, and
the bars and badges fill enough of the area.

No case covers these states, because no still captured them:

- **All-zero counts** (empty bars, `0` counts): a legitimate data state the mock would
  render, but it was not captured. Described, not extracted.
- **Count greater than `kennelsTotal`**: a native `<progress>` clamps it to full. Described,
  not extracted.

## 5. Events

The unit emits no events. It has no interactive element: no button, link, input or
`tabindex`. Its tests assert what the page shows instead of bridge events:

```ts
// rows render in ORDER with the real labels and counts
const rows = page.locator("section.card li");
await expect(rows).toHaveCount(4);
await expect(rows.nth(0)).toContainText("Booked");      await expect(rows.nth(0).locator("span.w-8")).toHaveText("7");
await expect(rows.nth(1)).toContainText("Checked in");  await expect(rows.nth(1).locator("span.w-8")).toHaveText("14");
await expect(rows.nth(2)).toContainText("Walking");     await expect(rows.nth(2).locator("span.w-8")).toHaveText("5");
await expect(rows.nth(3)).toContainText("Checked out"); await expect(rows.nth(3).locator("span.w-8")).toHaveText("6");

// each bar is scaled against kennelsTotal and never tallied on the client
await expect(rows.nth(1).locator("progress")).toHaveAttribute("value", "14");
await expect(rows.nth(1).locator("progress")).toHaveAttribute("max", "40");
await expect(rows.nth(1).locator("progress")).toHaveClass(/progress-success/);
await expect(rows.nth(3).locator("progress")).not.toHaveClass(/progress-(info|success|accent)/);

// static unit: nothing fires on load
const ev = await capture(page);            // before goto
/* goto + waitHydrated */
// ev.expect(e => e.type === "click") must time out; there is nothing clickable
await expect(page.locator("section.card :is(button,a,input,[tabindex])")).toHaveCount(0);
```

## 6. Motion

There is no motion to build.

- The only extracted transition is daisyUI `.card`'s `transition: outline .2s ease-in-out`.
  It fires only when the card gets focus, and the card is not focusable, so it never runs.
- The progress bars are not animated: the fill is set once on render.
- Jank: none.
- There is no `motion.json` and no filmstrip for this unit, so there is no `_motion` case.

## 7. Responsive

The source has no `@media` query of its own. The layout comes from the page's grid (Tailwind
defaults: `md` 768, `lg` 1024):

- **< 1024**: the card is full width in the single-column summary (351 wide at 375, 616 at
  640, 720 at 768). The page padding changes at `md` (p-3 → p-6).
- **≥ 1024**: the summary goes to two columns and the card takes one (480 wide at 1024, 608
  at 1280).
- **Inside a row**: the badge column is fixed at `w-32` (8rem) and the count at `w-8`
  (2rem). The `progress` is `flex-1`, so only the bars shrink or grow. Badges never wrap
  (`whitespace-nowrap`).
- The row layout is the same at every width.

## 8. A11y

- The `h2` "Dogs by status" labels the region. The rebuild adds `aria-labelledby` on the
  `section`, pointing at the `h2`, so it is a named region. This is an addition; the mock
  has no such attribute.
- The list is a real `ul`/`li`. `list-style: none` removes list semantics in Safari; add
  `role="list"` if that matters.
- Each `<progress>` in the mock has **no accessible name**. The rebuild should add
  `aria-label="<label>: <count> of <kennelsTotal> kennels"`, or `aria-labelledby` pointing
  at its badge. This is a gap in the mock, and the fix is proposed, not extracted.
- The Lucide icons are decorative and get `aria-hidden="true"`.
- There is no focus order, trapping or keyboard behaviour, because nothing is interactive.
- Reduced motion does not apply, since nothing animates.
- Colour is never the only signal: every row also has a text label and a numeric count.

## 9. Used on

- **day-summary** only, which makes the unit page-local. The board page reads
  the same `byStatus` through a separate unit (`status-strip`, per the data-model reverse
  index). That is a different unit, and this spec does not assume shared markup.

## 10. Isolate build plan

- **Lands at** `fixtures/kennel-app/src/pages/day-summary/components/status-breakdown/`,
  selector `<status-breakdown>`. Files: `template.html` plus an optional `styles.css`, with
  **no `logic.ts`** (it is static). The `isolate/` folder from this breakdown is copied in
  unchanged.
- **Template sketch**: render the 4 rows from a constant ORDER table (label, badge classes,
  icon, progress class, prop name), using the table in §2. Bind `value`/`max` and the
  count text to the props.
- **Preview routes**: `/components/day-summary/status-breakdown/<case>`, from
  `fixture.json` (`category: day-summary`, `folder: status-breakdown`):

| route case | shows | `_reference` |
| --- | --- | --- |
| `default` | seed counts, 1280, brand | `status-breakdown@1280.png` |
| `at-375` | 375, brand | `status-breakdown@375.png` |
| `at-640` | 640, brand | `status-breakdown@640.png` |
| `at-768` | 768, brand | `status-breakdown@768.png` |
| `at-1024` | lg half column, brand | `status-breakdown@1024.png` |
| `dark-375` | 375, brand-dark | `status-breakdown@375-brand-dark.png` |
| `dark-1280` | 1280, brand-dark | `status-breakdown@1280-brand-dark.png` |
| `overdue-empty` | unchanged when the page has no overdue pickups | `status-breakdown-empty@1280.png` |

- **Event → test mapping**: the §5 row-order, labels and counts block becomes
  `cases/default/tests/rows.spec.ts`. The §5 progress `value`/`max`/variant block becomes
  `cases/default/tests/progress.spec.ts`. The "nothing interactive" assertion becomes
  `cases/default/tests/static.spec.ts`. Write them as plain Node Playwright, reading
  `ISOLATE_BASE_URL`.
- **Loop**:
  1. Scaffold the folder and drop in `isolate/`.
  2. Run `sprig isolate test --root fixtures/kennel-app --json`; the `reference:` rows are
     the diff.
  3. Lift the §5 assertions into the tests above and run again.
  4. Iterate until green.
  5. Only then compose it into `day-summary` (the page's lg two-column grid).
- **Fonts**: the title is Caveat 700 and the text is Quicksand. The app's
  `bootstrap/template.html` head must load both, or every `reference:` row fails on the
  fallback font.
- **Theme drift** (from design-tokens.md): the scaffold's `css-variables.json` defaults to
  `brand-dark`. The cases set `_theme` explicitly, so the runner is not affected.

## Gaps

1. **`at-1024` height 245 vs 234 at every other width.** At 1024 the still is 11px taller
   (480×245). The likely cause is that the lg grid row stretches the card to match its
   sibling (overdue-pickups), since the row contents are identical. That is **described,
   not extracted — verify during build**. The isolate slot will lay the card out at its
   content height (about 234). A difference of more than 4px is a `size mismatch` failure,
   not a diff fraction. If the build confirms it is stretch, recapture the still with the
   card's height unconstrained. A tolerance cannot absorb a size mismatch.
2. **All-zero and over-capacity states**: not captured, so they have no case (§4).
3. **Progress accessible name**: missing in the mock; the fix above is proposed, not
   extracted.
