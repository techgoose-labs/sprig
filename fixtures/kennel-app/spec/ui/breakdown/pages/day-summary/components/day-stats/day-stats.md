# day-stats — page-local island (day-summary)

Selector `<day-stats>`. Mock region `#app > .stats`. Evidence: `source.html` (the open-day live DOM), `js/day-stats.js` (source lines 262-263 and 545-564), `css/matched-rules.css`, and `screenshots/` (14 stills).

## 1. Classification & behavior

- **Bucket:** island. It is a folder with `template.html`, `logic.ts` and `styles.css`.
- **Tier:** `pure-client`. The unit sends no request of its own and takes no user input.
- **Why it is an island (one line):** `day.close`'s reply changes the Revenue desc from "Settles when the day closes" to "Final" without a page reload. It reads channel `day`, which `close-day-control` sets. `day-closed-alert` reads the same channel.
- **Data source:** SSR input from the `today` query (`GET /api/days/today`, pre-contract), using the fields `kennelsUsed, kennelsTotal, occupancyPct, revenueToday, overdueCount, closed`.
  - **Every figure is a server aggregate.** The island never computes, counts or tallies. It formats only: `revenueToday` goes through `Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })`, and `occupancyPct` is shown as `<n>%` and as the progress value.
  - This follows data-model hazard 2, "Global aggregates": the figures come from `today`, never from `dogList`.
- **Client state owned (signals):** one signal per figure, all seeded from the SSR `today` read: `kennelsUsed`, `kennelsTotal`, `occupancyPct`, `revenueToday`, `overdueCount`, `closed`.
  - **Reconciling in place:** when channel `day` publishes the `day.close` reply (a full `day`), the island writes the reply's fields into these signals. The template re-renders the text nodes and the progress value, and it does not rebuild the region.
  - The mock re-renders the whole region with `innerHTML`. The build does not do that.
- **Liveness:** request-response. Nothing in the mock is pushed. The figures change only through the channel `day` reply or a page load.
  - A status write elsewhere leaves them stale until the next `today` read (data-model hazard 4).
- **Honest-empty:** none applies. `today` always returns exactly one day. A zero is rendered as `0` and `$0.00`, never hidden.
- **Data-shape hazard:** `closed` also exists on the day read by `close-day-control` and `day-closed-alert`. All three must take it from the same channel `day` value, never from separate local copies.
- **Writes:** none. `POST /api/days/{id}/close` belongs to `close-day-control`, so this unit needs no optimistic flow and no `pending` or `rolled-back` case.

## 2. Anatomy

These elements ARE daisyUI components, so keep them as daisyUI `stats`, `stat`, `stat-figure`, `stat-title`, `stat-value`, `stat-desc` and `progress`. The build's own hooks use the prefixed names `day-stats-*`.

```
div.stats.stats-vertical.md:stats-horizontal.w-full.bg-base-100.border.border-base-300.mb-5   (daisyUI stats)
├─ div.stat.day-stats-occupancy
│   ├─ div.stat-figure.text-secondary  > svg lucide "warehouse" .size-8
│   ├─ div.stat-title                  "Occupancy"
│   ├─ div.stat-value.tabular-nums     {kennelsUsed}<span.text-base.font-normal.text-base-content/60> of {kennelsTotal} kennels</span>
│   └─ div.stat-desc                   <progress.progress.progress-secondary.w-40 value={occupancyPct} max=100> {occupancyPct}%
├─ div.stat.day-stats-revenue
│   ├─ div.stat-figure.text-success    > svg lucide "banknote" .size-8
│   ├─ div.stat-title                  "Revenue today"
│   ├─ div.stat-value.tabular-nums     {money(revenueToday)}
│   └─ div.stat-desc.day-stats-revenue-desc   closed ? "Final" : "Settles when the day closes"
└─ div.stat.day-stats-overdue
    ├─ div.stat-figure.text-error      > svg lucide "alarm-clock" .size-8
    ├─ div.stat-title                  "Overdue pickups"
    ├─ div.stat-value.tabular-nums     {overdueCount}
    └─ div.stat-desc                   "Past their planned check-out"
```

- **Slots:** none. The unit takes no projected content.
- **Icons:** Lucide `warehouse`, `banknote` and `alarm-clock` at `size-8` (32px). They take the figure's colour: secondary, success and error.
- **Scoped styles:** never restyle `.stat*` or `.progress` in `styles.css`. daisyUI rules are document-global. Any tweak goes on the `day-stats-*` hooks.
- **Key CSS** (from `css/matched-rules.css`):
  - `.stat`: padding 1rem / 1.5rem and column-gap 1rem.
  - `.stat-value`: 2rem, weight 800.
  - `.stat-title` and `.stat-desc`: .75rem, base-content at 60%.
  - Stat dividers: dashed `var(--border)`, currentColor at 10%. They sit inline-end when horizontal and block-end when vertical.
  - `.progress`: height .5rem and radius `--radius-box`. `w-40` makes it 160px.

## 3. Props

| name | type | default | control widget | signal? |
|---|---|---|---|---|
| kennelsUsed | integer | 19 | number | true |
| kennelsTotal | integer | 40 | number | true |
| occupancyPct | integer 0–100 | 48 | range (0–100, step 1) | true |
| revenueToday | number (USD) | 1225 | number | true |
| overdueCount | integer | 2 | number | true |
| closed | boolean | false | boolean | true |

All six are signal-backed because channel `day` replaces them live. The defaults are the captured seed values.

## 4. States → cases

Every case has `_tier: "pure-client"` and the same captured seed values: kennelsUsed 19, kennelsTotal 40, occupancyPct 48, revenueToday 1225 (shown as "$1,225.00") and overdueCount 2.

All `_reference` paths are relative to the git root and start with `fixtures/kennel-app/spec/ui/breakdown/pages/day-summary/components/day-stats/screenshots/`. Tolerance stays at the default 0.01.

| state | case | closed | `_viewport` | `_theme` | `_reference` still | shows |
|---|---|---|---|---|---|---|
| open | open-375 | false | 375 | brand | day-stats@375.png (351×352) | vertical, desc "Settles when the day closes" |
| open | open-640 | false | 640 | brand | day-stats@640.png (616×352) | vertical |
| open | open-768 | false | 768 | brand | day-stats@768.png (720×118) | horizontal |
| open | open-1024 | false | 1024 | brand | day-stats@1024.png (976×118) | horizontal |
| open | open-1280 | false | 1280 | brand | day-stats@1280.png (1232×118) | horizontal |
| open | open-375-dark | false | 375 | brand-dark | day-stats@375-brand-dark.png | vertical, dark |
| open | open-1280-dark | false | 1280 | brand-dark | day-stats@1280-brand-dark.png | horizontal, dark |
| closed | closed-375 | true | 375 | brand | day-stats-closed@375.png | vertical, desc "Final" |
| closed | closed-640 | true | 640 | brand | day-stats-closed@640.png | vertical, "Final" |
| closed | closed-768 | true | 768 | brand | day-stats-closed@768.png | horizontal, "Final" |
| closed | closed-1024 | true | 1024 | brand | day-stats-closed@1024.png | horizontal, "Final" |
| closed | closed-1280 | true | 1280 | brand | day-stats-closed@1280.png | horizontal, "Final" |
| closed | closed-375-dark | true | 375 | brand-dark | day-stats-closed@375-brand-dark.png | vertical, dark, "Final" |
| closed | closed-1280-dark | true | 1280 | brand-dark | day-stats-closed@1280-brand-dark.png | horizontal, dark, "Final" |

- **Only the Revenue desc differs.** In the captured stills the figures are identical open and closed (the `$1,225.00` total does not change on close).
- **No other states.** The unit has no hover, focus, disabled, loading or error state, and no empty state. It has no request of its own, and `today` always exists.

## 5. Events

- **Emitted:** none. The unit has no controls, so there are no clicks or inputs.
- **Checked:** the observable effects below. The build lifts them as plain Playwright on the DOM after `waitHydrated(page)`.

```ts
// E1 — open day: revenue desc reads "Settles when the day closes"   (open-1280)
await expect(page.locator("day-stats .day-stats-revenue-desc")).toHaveText("Settles when the day closes");

// E2 — closed day: revenue desc reads "Final"                        (closed-1280)
await expect(page.locator("day-stats .day-stats-revenue-desc")).toHaveText("Final");

// E3 — figures are the server's, formatted not computed               (open-1280)
await expect(page.locator("day-stats .day-stats-occupancy .stat-value")).toHaveText("19 of 40 kennels");
await expect(page.locator("day-stats .day-stats-occupancy progress")).toHaveAttribute("value", "48");
await expect(page.locator("day-stats .day-stats-occupancy .stat-desc")).toContainText("48%");
await expect(page.locator("day-stats .day-stats-revenue .stat-value")).toHaveText("$1,225.00");
await expect(page.locator("day-stats .day-stats-overdue .stat-value")).toHaveText("2");

// E4 — channel reconcile in place: flipping `closed` (the channel `day` reply) swaps the desc
//      without replacing the region node                                (open-1280)
const region = await page.locator("day-stats .stats").elementHandle();
/* set signal closed=true via the workbench control / channel `day` publish */
await expect(page.locator("day-stats .day-stats-revenue-desc")).toHaveText("Final");
expect(await region!.evaluate((n) => n.isConnected)).toBe(true);
```

E4 is **described, not extracted — verify during build.** The mechanism for publishing to channel `day` from a test (or for driving the `closed` signal headlessly) is not in this unit's evidence.

## 6. Motion

- **Extracted motion:** none. The unit has no `motion.json` and no filmstrip, so no `_motion` case exists.
- **Jank:**
  - Nothing measured within the unit.
  - On the page, the region moves down when `day-closed-alert` appears above it (see that unit).
  - The mock rebuilds the region with `innerHTML` on close. The build's rebuild fix is to update the signals in place (section 1). The instrumented CLS reads 0 even though the content visibly moves (capture GAP 8).

## 7. Responsive

The stills used Tailwind's default breakpoints only.

| width | behavior |
|---|---|
| < 768 (`md`) | `stats-vertical`: three rows with a dashed block-end divider. The unit is 352px tall. The page padding is p-3, so the unit is the viewport width minus 24px (351 at 375, 616 at 640). |
| ≥ 768 | `md:stats-horizontal`: three columns with a dashed inline-end divider. The unit is 118px tall. The page padding is p-6 (720 at 768, 976 at 1024, 1232 at 1280). |

The 1024 breakpoint does not affect this unit.

## 8. A11y

- **Structure:** the region is a non-interactive group. Nothing in it takes focus, and it has no keyboard handling or trap.
- **Progress bar:** the `<progress>` must carry an accessible name, for example `aria-label="Occupancy"`. The mock has none, and that is a finding. Its visible `48%` duplicates the value.
- **Icons:** the Lucide icons are decorative (`aria-hidden="true"`).
- **Live region:** consider `aria-live="polite"` on `.day-stats-revenue-desc` so that "Final" is announced after the day closes. It is optional because the alert above already announces the close.
- **Reduced motion:** nothing to do. The unit has no animation.
- **Contrast:** the title and desc text is base-content at 60% on base-100. Check it in both themes.

## 9. Used on

- `day-summary` only. It is page-local: the only reader is channel `day` on that page.

## 10. Isolate build plan

- **Lands at:** `<app>/src/pages/day-summary/components/day-stats/`, which holds `template.html`, `logic.ts` and `styles.css`. `<app>` is `fixtures/kennel-app`. The selector is `day-stats`.
- **Preview routes:** `/components/day-summary/day-stats/<case>`. They come from `fixture.json`, with `category` `day-summary` and `folder` `day-stats`, for example `/components/day-summary/day-stats/closed-1280`.
- **Cases:** there are 14, one per still, listed in the section 4 table. Each case's `_reference` is the pixel diff.
- **Events → tests:**
  - `cases/open-1280/tests/day-stats.spec.ts`: E1, E3 and E4.
  - `cases/closed-1280/tests/day-stats.spec.ts`: E2.
- **The loop:**
  1. Scaffold the folder.
  2. Drop `isolate/` in unchanged.
  3. Run `sprig isolate test --root fixtures/kennel-app --json`. The `reference:` rows are the diff.
  4. Lift the Events into the specs above and run again.
  5. Iterate until green before composing into `pages/day-summary`, where `close-day-control` sets channel `day`.
- **Build notes:**
  - Load the Lucide icons as inline SVG at 32px so the icons match the stills.
  - Load the app's fonts: Quicksand for the numbers and text. Without them the `reference:` rows fail on the fallback font. That failure is a real finding, not noise.

## Gaps

- **Channel publish in tests:** E4's channel-publish step is described, not extracted — verify during build.
- **Channel `day` wiring API:** how the island subscribes and what the reply payload looks like is described from the brief and data-model, not extracted — verify during build.
