# stay-card

Page-local component of `dog-detail`. It shows one dog's current stay and the
amount due. Evidence: this folder's `source.html` (the d01 and d14 states),
`js/stay-card.source.js`, `css/*`, and `screenshots/`.

## 1. Classification & behavior

- **Bucket:** `static`. It is a component folder with `template.html` and `styles.css` and **no `logic.ts`**.
- **Interaction tier:** `static`. The unit has no interactions: no buttons, no inputs, no hover or focus styles (`motion.json` note).
- **Data source:** the page's resolve reads `dogDetail` (`GET /api/dogs/{id}`, data-model.md reverse index: `stay-card` → `dogDetail` (stay)). The stay is `dogDetail.stay`, which is either an object or `null`.
- **Honest-empty:** when `dogDetail.stay` is `null`, the card keeps its title and shows the italic line "No stay on file for this dog." It shows no list, no divider and no total.
- **Liveness:** request-response. The mock pushes nothing. After `dog.checkOut` the total due does **not** change (commands.json `dog.checkOut`), so the card never re-renders in place. A fresh page read is its only refresh.
- **Data-shape hazard:** `totalDue` is the **server's figure**. Never compute it in the UI as `nightlyRate × nights` (data-model.md `stay.totalDue`). The build only formats it.
- **Formatting:** the page's resolve maps the stay to display strings using the mock's exact formatters, so the unit stays a pure template:
  - `when(iso)` = `new Date(iso + "Z").toLocaleString("en-US", { timeZone: "UTC", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })`, for example `2026-09-29T07:00` → "Sep 29, 7:00 AM"
  - `money(n)` = `Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })`, for example `45` → "$45.00"
  - `nights` is passed through as-is

  *Described, not extracted.* Where the formatting lives (the resolve or a template pipe) is a build choice. The unit's props below take the display strings.
- **Channels:** none. The unit neither sets nor reads `dog`, `day` or `toasts`.

## 2. Anatomy

```
section.card.bg-base-100.border.border-base-300          daisyUI `card` (kept)
└─ div.card-body                                         daisyUI `card-body` (kept)
   ├─ h2.card-title.text-2xl                             daisyUI `card-title` (kept); h2 → --font-display (Caveat 700)
   │   ├─ svg.stay-card-icon  (lucide bed-double, size-5, aria-hidden)
   │   └─ "The stay"
   ├─ [hasStay]
   │   ├─ dl.stay-card-facts  grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm
   │   │   ├─ dt.text-base-content/60 "Check-in"          dd {{checkIn}}
   │   │   ├─ dt "Planned check-out"                      dd {{plannedCheckOut}}
   │   │   ├─ dt "Nightly rate"                           dd.tabular-nums {{nightlyRate}}
   │   │   └─ dt "Nights"                                 dd.tabular-nums {{nights}}
   │   ├─ div.divider.my-1                               daisyUI `divider` (kept)
   │   └─ div.stay-card-total  flex items-baseline justify-between gap-2
   │       ├─ span.text-sm.font-semibold.uppercase.tracking-wide.text-base-content/70 "Total due"
   │       └─ span[data-total-due].text-3xl.font-semibold.tabular-nums {{totalDue}}
   └─ [!hasStay]
       └─ p.stay-card-empty.text-base-content/60.italic "No stay on file for this dog."
```

- The daisyUI components the source uses and that the build keeps are `card`, `card-body`, `card-title` and `divider`.
- The unit's own class names carry the `stay-card-` prefix: `stay-card-icon`, `stay-card-facts`, `stay-card-total`, `stay-card-empty`.
- Keep the `data-total-due` attribute. The page's tests and the mock's own tests hook it.
- The icon path data is in `source.html`. Inline that exact `<svg>` (lucide bed-double, 24×24 viewBox, stroke 2, rendered at `size-5` = 20px).
- The card has no slots and no children. There is no `<content>`.

## 3. Props

| name | type | default | control widget | signal? |
| --- | --- | --- | --- | --- |
| `hasStay` | boolean | `true` | `boolean` | no |
| `checkIn` | string (formatted) | `"Sep 29, 7:00 AM"` | `text` | no |
| `plannedCheckOut` | string (formatted) | `"Sep 30, 11:00 AM"` | `text` | no |
| `nightlyRate` | string (formatted USD) | `"$45.00"` | `text` | no |
| `nights` | integer | `1` | `number` | no |
| `totalDue` | string (formatted USD, server figure) | `"$45.00"` | `text` | no |

The page binds `hasStay = dogDetail.stay != null` and fills the other props from `dogDetail.stay` when it exists.

## 4. States → cases

Every case has `_tier: "static"`. The `_reference` paths are git-root-relative, under `fixtures/kennel-app/spec/ui/breakdown/pages/dog-detail/components/stay-card/screenshots/`. Tolerance is the default 0.01 everywhere.

| case | state | `_viewport` | `_theme` | `_reference` still | values |
| --- | --- | --- | --- | --- | --- |
| `default` | d01 stay, desktop (lg 3-col slot, 400px) | 1280 | brand | `stay-card@1280.png` | Sep 29, 7:00 AM · Sep 30, 11:00 AM · $45.00 · 1 · $45.00 |
| `bp-1024` | d01 stay, lg slot 314.67px | 1024 | brand | `stay-card@1024.png` | d01 |
| `bp-768` | d01 stay, single column (720px) | 768 | brand | `stay-card@768.png` | d01 |
| `bp-640` | d01 stay, single column (616px) | 640 | brand | `stay-card@640.png` | d01 |
| `bp-375` | d01 stay, phone (351px) | 375 | brand | `stay-card@375.png` | d01 |
| `dark-1280` | d01 stay, dark theme | 1280 | brand-dark | `stay-card@1280-brand-dark.png` | d01 |
| `dark-375` | d01 stay, dark theme, phone | 375 | brand-dark | `stay-card@375-brand-dark.png` | d01 |
| `multi-night` | d03: 3 nights, larger total | 1280 | brand | `stay-card-d03-multi-night@1280.png` | Sep 27, 9:30 AM · Sep 30, 11:00 AM · $65.00 · 3 · $195.00 |
| `overdue-dog` | d14 is overdue; the card is unchanged (the overdue badge lives in dog-heading) | 1280 | brand | `stay-card-d14-overdue@1280.png` | Sep 28, 10:15 AM · Sep 30, 11:00 AM · $55.00 · 2 · $110.00 |
| `no-stay` | honest-empty: "No stay on file for this dog." | 1280 | brand | `stay-card-no-stay@1280.png` | `hasStay: false` |

- There are no loading or error states for the unit. The app-wide `?state=loading|error|empty` replaces all of `#app` (capture GAPS 10), and the page owns it.
- There are no optimistic-write cases, because the unit has no writes.

## 5. Events

The unit emits **no events**. It is static, and nothing in it is focusable or clickable. The Events rows are observable-DOM assertions instead, which the build lifts into specs:

- `default` (and every d01 case):
  ```ts
  await expect(page.locator("stay-card dl dd")).toHaveText(["Sep 29, 7:00 AM", "Sep 30, 11:00 AM", "$45.00", "1"]);
  await expect(page.locator("stay-card [data-total-due]")).toHaveText("$45.00");
  ```
- `multi-night`:
  ```ts
  await expect(page.locator("stay-card [data-total-due]")).toHaveText("$195.00");
  await expect(page.locator("stay-card dl dd").nth(3)).toHaveText("3");
  ```
- `overdue-dog`:
  ```ts
  await expect(page.locator("stay-card [data-total-due]")).toHaveText("$110.00");
  ```
  The card has no overdue marker: `await expect(page.locator("stay-card .badge")).toHaveCount(0)`.
- `no-stay`:
  ```ts
  await expect(page.locator("stay-card p")).toHaveText("No stay on file for this dog.");
  await expect(page.locator("stay-card [data-total-due]")).toHaveCount(0);
  await expect(page.locator("stay-card dl")).toHaveCount(0);
  ```
- No-event guard: a click anywhere on the card emits nothing interactive.
  ```ts
  const ev = await capture(page);
  /* goto, then click the card */
  ev.expect(e => e.source.startsWith("button") || e.source.startsWith("a"), { timeout: 500 })
  ```
  The build asserts that this rejects.

## 6. Motion

None. `screenshots/motion.json` is `{ animations: [], interactionTriggered: [] }` and there is no filmstrip. The only transition is daisyUI's `.card { transition: outline .2s }` focus rule, and it never fires because the card is not focusable.

Jank (`screenshots/jank.md`): a 600px wheel scroll gave 0% dropped frames, a 16.8 ms max frame, no LoAF and CLS 0. The static lints found nothing, so no rebuild fix is needed. There is no `_motion` case, because nothing is extracted.

## 7. Responsive

The mock uses Tailwind v4 default breakpoints only (design-tokens.md). The card has no `@media` rules of its own. Its width is the page grid slot:

- **<640 / 640 / 768** (`grid-cols-1`): the slot is the full content width (351 / 616 / 720 px). The natural height is 265px.
- **≥1024 (`lg:grid-cols-3`)**: one third of the row (314.67px at 1024, 400px at 1280). The grid row stretches the card to the tallest sibling, making the stills 269px tall.
- The `dl` keeps `auto 1fr` at every width. The total row is `justify-between`, with the label on the left and the amount on the right, at every width.

## 8. A11y

- The landmark is a `section` titled by an `h2` ("The stay"). Consider `aria-labelledby` from the section to the h2 (described, not in the source).
- The icon is `aria-hidden="true"`, as in the source.
- The facts are a `dl` of `dt`/`dd` pairs, so screen readers announce term and value.
- "Total due" is a `span` pair, not a `dt`/`dd`. Keep the source's structure. Pairing them is an optional a11y improvement.
- The card has no focusable elements, no keyboard behavior and no motion, so reduced-motion is not applicable.
- Muted text is `base-content` at 60% or 70% (`color-mix`).

## 9. Used on

- `dog-detail` only (page-local).

## 10. Isolate build plan

- **Lands at:** `<app>/src/pages/dog-detail/components/stay-card/`, with `<app>` = `fixtures/kennel-app`. The selector is `<stay-card>`.
- **Files:** `template.html` and `styles.css`. There is no `logic.ts`. Copy `isolate/` alongside them.
- **Preview routes:** `/components/dog-detail/stay-card/<case>`, from `fixture.json` `category: "dog-detail"`, `folder: "stay-card"`:
  - `/components/dog-detail/stay-card/default`: d01 @1280 brand → `stay-card@1280.png`
  - `/components/dog-detail/stay-card/bp-1024`: d01 @1024 → `stay-card@1024.png`
  - `/components/dog-detail/stay-card/bp-768`: d01 @768 → `stay-card@768.png`
  - `/components/dog-detail/stay-card/bp-640`: d01 @640 → `stay-card@640.png`
  - `/components/dog-detail/stay-card/bp-375`: d01 @375 → `stay-card@375.png`
  - `/components/dog-detail/stay-card/dark-1280`: d01 @1280 brand-dark → `stay-card@1280-brand-dark.png`
  - `/components/dog-detail/stay-card/dark-375`: d01 @375 brand-dark → `stay-card@375-brand-dark.png`
  - `/components/dog-detail/stay-card/multi-night`: d03 → `stay-card-d03-multi-night@1280.png`
  - `/components/dog-detail/stay-card/overdue-dog`: d14 → `stay-card-d14-overdue@1280.png`
  - `/components/dog-detail/stay-card/no-stay`: honest-empty → `stay-card-no-stay@1280.png`
- **Events → specs:**
  - the d01 row → `cases/default/tests/stay-values.spec.ts`
  - the multi-night row → `cases/multi-night/tests/stay-values.spec.ts`
  - the overdue row → `cases/overdue-dog/tests/no-overdue-marker.spec.ts`
  - the no-stay row → `cases/no-stay/tests/honest-empty.spec.ts`
  - the no-event guard → `cases/default/tests/no-interaction.spec.ts`
- **Loop:**
  1. Scaffold the folder and drop in `isolate/`.
  2. Run `sprig isolate test --root fixtures/kennel-app --json`. The ten `reference:` rows are the diff.
  3. Lift the Events rows into the specs above.
  4. Re-run and iterate to green before composing into `dog-detail`.
- **Known diff risk (verify during build):** every ≥1024 still is 269px tall because the lg grid row stretches it. Isolated, the card renders at its content height.
  - For the d01, d03 and d14 cases that height is about 265px. That is a 4px drift, which counts as non-overlap: about 0.015 at 400px wide.
  - For `no-stay` the content height is far below 269, so the runner will report a size mismatch.
  - Fix it with a card that fills its slot height (`h-full` on the host, if the runner's slot gives it a height), or recapture those stills with `align-self: start`. Do not raise the tolerance.
