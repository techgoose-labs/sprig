# day-summary — page (Screen 3 — Day summary)

Route in the mock: `#/summary` (nav label "Day summary"), region `main#app`.
Evidence: `source.html` (open day, 1280, brand), `js/summary.js`,
`css/inline-theme.css`, `css/matched-rules.css`, `screenshots/`.

## Purpose, layout, composition

Purpose: the end-of-day view for the front desk. It shows today's occupancy,
revenue and overdue count, the dogs per status, and the dogs whose owners are
late for pickup. It also has the one action that locks the day's ledger.

Layout: `main.max-w-7xl.mx-auto.p-3.md:p-6`, stacked top to bottom:

1. The header row (`flex flex-wrap items-end justify-between gap-3 mb-5`):
   - `h1.font-display.text-4xl` "Day summary", with the day label
     `p.text-base-content/70` "Tuesday, September 29" under it.
   - **`<close-day-control>`** on the right.
2. **`<day-closed-alert>`**, rendered only when `today.closed`.
3. **`<day-stats>`**.
4. `div.grid.grid-cols-1.lg:grid-cols-2.gap-4` holding
   **`<status-breakdown>`** and **`<overdue-pickups>`**.
5. **`<toast-stack>`**. It is page-scoped and fixed-position (`#toasts`, `z-50`),
   so it sits outside the `main#app` crop.

Composition: the page owns no markup beyond the heading and the two layout
wrappers. Every other region is a child unit with its own spec under
`pages/day-summary/components/<name>/`.

The page wires the page-scoped **channels** (wiring only, no stores):

| channel | set by | read by |
| --- | --- | --- |
| `day` | close-day-control | day-closed-alert, day-stats |
| `toasts` | toast-stack | close-day-control edits it |

## 1. Classification & behavior

- **Bucket:** `page-composition` → `pages/day-summary/`. There is **no
  `logic.ts`**; the page itself is not an island.
- **Interaction tier:** `static`. The page's only interaction is the Close-the-day
  command, and that belongs to the child `close-day-control`. The page renders
  what `resolve.ts` returns.
- **Data source:** `resolve.ts` → Backend. Pre-contract reads are listed in
  `data-model.md`:

  | need | pre-contract path | used by |
  | --- | --- | --- |
  | `today` | `GET /api/days/today` | heading day label, close-day-control (`id, closed`), day-closed-alert (`closed`), day-stats, status-breakdown |
  | `overduePickups` | `GET /api/dogs?overdue=true` | overdue-pickups |

- **Data-shape hazards** (from data-model.md):
  - The mock filters `dog.filter(d => d.overdue)` on the client and joins owners
    with `owner(d.owner)`. The build takes both from the `overduePickups`
    query's DTO: the server does the filtering, and each row carries `owner {name, phone}`.
    Never load all dogs or all owners.
  - `byStatus`, `occupancyPct`, `revenueToday`, `overdueCount` and
    `kennelsUsed` are server rollups. They come from `today`, and the UI never
    counts them.
  - The mock calls `dayLabel(date)`: `new Date(iso+"T12:00Z")` formatted en-US in
    UTC as `weekday long, month long, day numeric`. So `2026-09-29` renders
    "Tuesday, September 29". The build must format in UTC too, or the label
    shifts by a day near midnight.
- **Liveness:** request-response. The mock pushes nothing. After `day.close`,
  close-day-control reconciles the day from the reply and publishes it on the
  `day` channel. day-closed-alert and day-stats re-render from that channel, and
  there is no page reload.
- **The close write** is owned by close-day-control and is not optimistic.
  `commands.json` marks `day.close` as feedback **confirmed**. The mock's flow:
  1. Set pending: the button is disabled, shows a spinner and reads "Closing the
     day…".
  2. Send `POST /api/days/{id}/close` `{ id, closed: true }`.
  3. On a 2xx reply, merge the returned day. The header swaps to the "Day closed"
     badge, the alert appears, the revenue desc reads "Final", and a success
     toast "Day closed — ledger locked." is shown.
  4. On an error, show the error toast "The day couldn't be closed — nothing
     changed." and put the button back.

  The page cases below only carry the `_network` fakes so the composed page can
  be driven end to end.
- **Honest-empty:** when `overduePickups` is `[]`, the overdue card shows the
  sentence "No overdue pickups — every owner is on time." (italic,
  `text-base-content/60`). The stats and byStatus still show the server figures,
  including overdue 2. That is how the mock's `?state=empty` renders, captured
  as-is: the mock only empties the client dog/stay lists. **Build note:** with
  a real backend, `overdueCount` and the list come from one server truth and
  cannot disagree. The `empty` case reproduces the captured still faithfully.
- **Load states:** the mock has two.
  - `loading`: 4 `skeleton h-20 rounded-box` tiles in
    `grid-cols-2 md:grid-cols-4`, then a spinner with "Loading today's dogs…",
    then 8 skeleton cards in `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`.
    This is the shared board skeleton.
  - `error`: `div[role=alert].alert.alert-error.alert-soft.max-w-2xl.mx-auto.mt-10`
    with a wifi-off icon, **"Couldn't load today's board"**, "The kennel server
    didn't answer. Your last check-ins are safe — nothing was lost.", and a
    `btn btn-sm` **Retry**.

  In the SSR build, `error` is what renders when resolve fails. `loading` only
  exists if the build streams or defers the read. Both are exposed through the
  `state` prop so the stills stay reachable. That prop mirrors the mock's real
  demo-state switch, `?state=live|loading|error`.

## 2. Anatomy

```
<main class="day-summary-main max-w-7xl mx-auto p-3 md:p-6">   (page root; paints on base-200 — see Build note)
  <div class="day-summary-head flex flex-wrap items-end justify-between gap-3 mb-5">
    <div>
      <h1 class="font-display text-4xl">Day summary</h1>
      <p class="text-base-content/70">{dayLabel(today.date)}</p>
    </div>
    <close-day-control/>                 ← child (today.id, today.closed)
  </div>
  <day-closed-alert/>                    ← child, only when today.closed (mb-5)
  <day-stats/>                           ← child (mb-5)
  <div class="day-summary-cols grid grid-cols-1 lg:grid-cols-2 gap-4">
    <status-breakdown/>                  ← child (today.byStatus, today.kennelsTotal)
    <overdue-pickups/>                   ← child (overduePickups)
  </div>
</main>
<toast-stack/>                           ← child, fixed, outside the crop
```

- The `day-summary-*` class names are this unit's own prefixed hooks. Everything
  else is daisyUI or Tailwind as authored in the mock.
- The children keep their daisyUI components as-is: `btn btn-primary`, `badge`,
  `stats`/`stat`, `card`, `progress`, `alert`, `link`. Those are daisyUI names
  used as daisyUI, not restyled.
- **Build note:** the `main#app` crop is transparent in the mock and shows the
  `body.bg-base-200` behind it. The build's page must render on `base-200`, via
  the shell's body or its own root, or every `_reference` fails on the background.
  Per design-tokens.md, the app scaffold currently paints `body` with `base-100`
  and `color-scheme: dark`, which is a drift to reconcile.

## 3. Props table

| name | type | default | control widget | signal? |
| --- | --- | --- | --- | --- |
| `state` | `"live" \| "loading" \| "error"` | `"live"` | `select` | no |
| `today` | day DTO `{ id, date, closed, kennelsTotal, kennelsUsed, occupancyPct, revenueToday, byStatus{booked,checked-in,walking,checked-out}, overdueCount }` or `null` | the `resolve.ts` result | none (object; carried as case data) | no |
| `overduePickups` | `{ id, name, kennel, overdue, overdueBy, owner{name, phone} }[]` | the `resolve.ts` result | none (array; carried as case data) | no |

`fixture.json` declares a control for `state` only. The isolate control types
(`boolean`, `number`, `text`, `range`, `select`, `color`) have no object or array
widget, so `today` and `overduePickups` are set per case as bare keys.

## 4. States → cases

All cases share these settings:

- `_tier`: `"static"`.
- `_viewport`: `{ width: <still width>, height: 1400 }`. The stills were shot at
  a viewport height of 1400.
- `_theme`: `brand`, the mock default from design-tokens.md, unless the still
  is `-brand-dark`.
- The `_reference` prefix is `fixtures/kennel-app/spec/ui/breakdown/pages/day-summary/screenshots/`.

Seed data (the real captured values):

- `today` = `{ id:"today", date:"2026-09-29", closed:false, kennelsTotal:40,
  kennelsUsed:19, occupancyPct:48, revenueToday:1225, byStatus:{booked:7,
  "checked-in":14, walking:5, "checked-out":6}, overdueCount:2 }`
- `overduePickups` =
  - Rocco: d14, K14, Oliver Brandt, (555) 0113-4481, overdue by 2h 15m
  - Olive: d18, K18, Elena Popescu, (555) 0117-4629, overdue by 45m

| case | state | data | viewport · theme | `_reference` |
| --- | --- | --- | --- | --- |
| `default` | open day: "Close the day" button, "Settles when the day closes" | seed | 1280 · brand | `day-summary@1280.png` |
| `open-375` | open day, stats vertical, `p-3`, overdue rows wrap, 1 column | seed | 375 · brand | `day-summary@375.png` |
| `open-640` | open day, overdue rows unwrapped | seed | 640 · brand | `day-summary@640.png` |
| `open-768` | open day, `p-6`, stats horizontal, 1 column | seed | 768 · brand | `day-summary@768.png` |
| `open-1024` | open day, 2 columns | seed | 1024 · brand | `day-summary@1024.png` |
| `open-375-dark` | open day | seed | 375 · brand-dark | `day-summary@375-brand-dark.png` |
| `open-1280-dark` | open day | seed | 1280 · brand-dark | `day-summary@1280-brand-dark.png` |
| `closed-375` … `closed-1280` (5) | closed: "Day closed" badge, success alert "Today's ledger is locked. Revenue below is final.", revenue desc "Final" | seed, `closed:true` | 375/640/768/1024/1280 · brand | `day-summary-closed@<w>.png` |
| `closed-375-dark`, `closed-1280-dark` | closed | seed, `closed:true` | 375/1280 · brand-dark | `day-summary-closed@<w>-brand-dark.png` |
| `empty` | overdue card honest-empty "No overdue pickups — every owner is on time."; stats and byStatus unchanged (as captured) | seed today, `overduePickups: []` | 1280 · brand | `day-summary-empty@1280.png` |
| `loading` | shared skeleton + "Loading today's dogs…" | `state:"loading"`, `today:null` | 1280 · brand | `day-summary-loading@1280.png` |
| `error` | load-error alert "Couldn't load today's board" + Retry | `state:"error"`, `today:null` | 1280 · brand | `day-summary-error@1280.png` |
| `closing` | pending: button disabled, spinner, "Closing the day…", reply held | seed; `_network` `"day.close": "delay:3000"` | 1280 · brand | none. The state is only reached after a click; its still `day-summary-closing@1280.png` is asserted by the lifted test (see §10) |
| `closing-375` | pending at 375 | as `closing` | 375 · brand | none. Still `day-summary-closing@375.png`, used by the test |
| `close-failed` | the 400 reply: the day stays open, error toast shown | seed; `_network` `"day.close": {status:400, body:{error:"no day \"today-unreachable\""}}` | 1280 · brand | none. Still `day-summary-close-failed@1280.png` (the button is caught hovered), used by the test |

Why `closing` and `close-failed` carry no `_reference`: a `_reference` is compared
against the render at load. At load these two cases render the open day, not the
pending or failed state their stills show. The pixel proof for the pending
button lives in close-day-control's own `pending` case, and these page cases
prove the flow with tests.

The `delay:3000` hold window is not a captured value. The real reply took 76 to
89 ms, and the capture held the request with `page.route`. 3000 ms is chosen so
the pending state stays observable.

## 5. Events

These are predicate sketches against the page route. The page emits nothing of
its own. The interactions below belong to its children and are listed so the
composed page gets an end-to-end test.

| # | trigger | predicate / observable effect |
| --- | --- | --- |
| E1 | click Close the day | `ev.expect(e => e.source === "button#close-day" && e.type === "click")` |
| E2 | pending (case `closing`) | after E1: `await expect(page.locator("#close-day")).toBeDisabled(); await expect(page.locator("#close-day")).toContainText("Closing the day…"); await expect(page.locator("#close-day .loading-spinner")).toBeVisible()` |
| E3 | success (case `default`, real or faked 200 reply = the day with `closed:true`) | `await expect(page.getByText("Day closed", { exact: true })).toBeVisible(); await expect(page.getByRole("alert").filter({ hasText: "Today's ledger is locked. Revenue below is final." })).toBeVisible(); await expect(page.getByText("Final", { exact: true })).toBeVisible(); await expect(page.locator("#close-day")).toHaveCount(0);` plus the toast `getByText("Day closed — ledger locked.")` |
| E4 | failure (case `close-failed`) | after E1: `await expect(page.getByText("The day couldn't be closed — nothing changed.")).toBeVisible(); await expect(page.locator("#close-day")).toBeEnabled(); await expect(page.locator("#close-day")).toHaveText(/Close the day/); await expect(page.getByText("Settles when the day closes")).toBeVisible()` (the pre-intent state is back) |
| E5 | open an overdue dog | `ev.expect(e => e.source === "a" && e.type === "click" && String(e.detail).includes("Rocco"))`. The effect is navigation to the dog-detail route for `d14` (the mock uses `#/dog/d14`; the build's route shape comes from its routing, so verify during build) |

## 6. Motion

The page has **no entrance animation**. `motion.json.onLoad` is `[]`, and
`.animate-rise` (`brand-rise`, 320 ms, `cubic-bezier(0.34,1.56,0.64,1)`) is
defined in the theme but unused on `#/summary`. All the extracted motion
belongs to children and is triggered by interaction:

| target (child) | trigger | properties | keyframes | duration | easing | delay |
| --- | --- | --- | --- | --- | --- | --- |
| `button#close-day.btn.btn-primary` (close-day-control) | hover | background-color, border-*-color, box-shadow (declared `color, background-color, border-color, box-shadow, transform`) | bg `rgb(194,65,12)` → `oklab(0.5147 0.1267 0.1005)`; border `oklab(0.5258 0.1295 0.1026)` → `oklab(0.4890 0.1204 0.0954)`; shadow primary/0.3 → darker primary/0.3 | 200 ms | `cubic-bezier(0, 0, 0.2, 1)` | 0 |
| `.loading.loading-spinner.loading-sm` (20 px) in the pending button | pending `day.close` | SMIL inside a CSS `mask-image`: rotate + stroke-dash | rotate 0→360 (2 s, infinite); dasharray `0,150 → 42,150 → 42,150`, dashoffset `0 → −16 → −59`, keyTimes `0;0.475;1` (1.5 s, infinite) | 2 s / 1.5 s | linear | 0 |
| `section.card` ×2 | focus (never fires; not focusable) | outline | n/a | 200 ms | ease-in-out | 0 |

- `prefers-reduced-motion: reduce` clamps every animation and transition to
  0.01 ms. Keep that guard from `css/inline-theme.css`.
- Filmstrips: `screenshots/filmstrip.png` (hover, scrubbed 0–100%) and
  `screenshots/filmstrip-spinner-realtime.png` (real-time, non-deterministic).
- **Jank findings and rebuild fixes** (from `screenshots/jank.md`; every live
  run measured 0% dropped frames, a 16.8 ms max frame and CLS 0):
  1. **The whole region re-renders on pending→closed.** The mock rebuilds the
     page with `innerHTML`, so the content visibly jumps 66 px at ≥640 and
     86 px at 375 when the closed alert is inserted. CLS reports 0 because every
     node is new. Fix: patch only the header action through the `day` channel,
     and give day-closed-alert a reserved or animated entrance
     (`grid-template-rows: 0fr→1fr`, or opacity+transform).
  2. **The hover animates `box-shadow`** (daisyUI `.btn`). Fix: accept it as the
     library default, or animate the opacity of a pre-rendered `::after` shadow.
  3. **`lucide.createIcons()` rescans the whole document on every render.** Fix:
     inline the SVG icons at template time.
  4. The toast is removed by a `setTimeout` (3.5 s) and the 450 ms fake latency
     is a timer too. Neither is animation, so this is not jank. Any exit motion
     should be done in CSS.
- **No `_motion` case.** See the gaps: the page has no at-load animation to
  compare, and `motion.json`'s shape is not one the runner reads.

## 7. Responsive

The mock has no custom `@media` queries; only Tailwind defaults apply.

| width | behavior (from the stills) |
| --- | --- |
| < 640 (375) | `p-3`. The stats stack vertically (`stats-vertical`). The cards are 1 column. The overdue rows wrap (the owner and phone drop under the name). The closed alert wraps to 66 px. |
| 640 | Same as 375, except the overdue rows no longer wrap and the alert text fits on one line |
| ≥ 768 (`md`) | `p-6`. The stats go horizontal (`md:stats-horizontal`). The cards stay 1 column. |
| ≥ 1024 (`lg`) | The cards go 2 columns (`lg:grid-cols-2`) |
| 1280 | `max-w-7xl` = 1280, so the region fills the viewport |

The header row is `flex-wrap`, so at narrow widths close-day-control can wrap
under the title.

## 8. A11y

- There is one `h1` "Day summary", and each card has an `h2.card-title`
  ("Dogs by status", "Overdue pickups").
- The close control is a native `<button id="close-day">`. While pending it is
  `disabled` and its label changes to "Closing the day…".
  - **Improvement:** add `aria-busy="true"` while pending. The mock keeps
    `cursor: pointer` on the disabled button, which the build should drop.
- The closed alert and the load-error block are `role="alert"`.
  - The toasts have no role in the mock. **Improvement:** give toast-stack
    `role="status"` / `aria-live="polite"`, and use `role="alert"` for errors.
- The overdue dog names are real links (`a.link.link-hover`). The kennel badge,
  owner and phone are plain text.
- The progress bars are native `<progress>` with `value`/`max`. Each
  byStatus bar has its visible count next to it.
  - **Improvement:** give each bar an `aria-label`, for example "Booked 7 of 40".
- Icons are decorative Lucide SVGs. Mark them `aria-hidden="true"` when inlining.
- Focus order follows the DOM: Close the day, then Rocco, then Olive. There is
  no trapping.
- Reduced motion: every animation and transition is clamped to 0.01 ms by
  `inline-theme.css`.

## 9. Used on

The page is the `day-summary` route itself. Its children are page-local (they
are used on day-summary only), except `toast-stack`: each page composes its
own instance.

## 10. Isolate build plan

- **Lands at:** `fixtures/kennel-app/src/pages/day-summary/` (`<app>/src/pages/day-summary`)
  - Files: `template.html` + `styles.css` + `resolve.ts`. No `logic.ts`.
  - Selector: `day-summary`.
  - The children land under `pages/day-summary/components/<name>/` and are built
    and green in isolation **before** this page is composed.
- **Preview routes:** `/pages/kennel/day-summary/<case>`, from `fixture.json`
  `category: "kennel"`, `folder: "day-summary"`. For example:
  - `/pages/kennel/day-summary/default`
  - `/pages/kennel/day-summary/closed-1280`
  - `/pages/kennel/day-summary/close-failed`
- **Per case:** the state and the `_reference` still are in the §4 table. There
  are 17 pixel-diffed cases: default, open-×6, closed-×7, empty, loading and
  error. The 3 flow cases (`closing`, `closing-375`, `close-failed`) are proven
  by tests.
- **Events → tests:**

  | case | tests file | covers |
  | --- | --- | --- |
  | `closing` | `cases/closing/tests/pending.spec.ts` | E1 + E2. Also screenshot `main` while pending and compare it by eye/diff to `day-summary-closing@1280.png` |
  | `closing-375` | `cases/closing-375/tests/pending.spec.ts` | E2 at 375, against `day-summary-closing@375.png` |
  | `close-failed` | `cases/close-failed/tests/rollback.spec.ts` | E1 + E4 (still `day-summary-close-failed@1280.png`) |
  | `default` | `cases/default/tests/close.spec.ts` | E1 + E3 |
  | `default` | `cases/default/tests/overdue-link.spec.ts` | E5 |

  - `close.spec.ts` needs a 200 reply. With no backend, add `page.route`
    inside the spec for `POST /api/days/today/close` → 200 with the seed day +
    `closed:true`, since the case carries no fake so that its `_reference` stays
    pristine.
  - Plain Playwright (`@playwright/test`) + `waitHydrated` from
    `isolate-events`, `BASE = process.env.ISOLATE_BASE_URL`. Wait for the
    close-day-control island to hydrate before clicking.
- **Loop:**
  1. Scaffold the page folder.
  2. Copy this `isolate/` in.
  3. Run `sprig isolate test --root fixtures/kennel-app --json`. The
     `reference:` rows are the diff.
  4. Lift the Events into the tests above.
  5. Run the tests and iterate until everything is green.
  6. Then wire the route into the app.
