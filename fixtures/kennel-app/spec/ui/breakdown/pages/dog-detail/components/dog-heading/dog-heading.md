# dog-heading

Region `#app > a[href="#/board"] + div` on `#/dog/<id>` (dog-detail). This is the dog's name as the page `h1`, with its status badge and, when the dog is overdue, an overdue badge.

## 1. Classification & behavior

- **Bucket:** `island` (it has `logic.ts`). It is page-local to dog-detail.
- **Interaction tier:** `pure-client`. The unit has no server write of its own and no controls.
- **Why an island:** it has to follow the `dog` channel. `dog-actions` sets the channel optimistically when a status command fires. It sets it again when the reply reconciles, or rolls it back when the command fails. The heading has to re-render in place with no reload. In the mock, `runStatus` sets `d.status = TARGET[cmd]`, calls `render()`, then applies `Object.assign(d, reply)` on success or `Object.assign(d, before)` on failure (js/dog-heading.js 476-492).
- **Client state owned:** none that is authoritative. The island mirrors three signals from the `dog` channel:
  - `status` (`booked | checked-in | walking | checked-out`)
  - `overdue` (boolean, decided by the server). The checkOut reply reconciles it (data-model.md, "Every status command's reply is the updated dog").
  - `overdueBy` (string, for example `"2h 15m"`, present only when `overdue`)
  
  Before the channel is seeded, the island renders its SSR input (`dogDetail`).
- **Reconcile:** when the channel publishes, the island replaces the three signals, which swaps the status badge and adds or removes the overdue badge. `name` does not change on this page. It is an SSR prop and is not on the channel.
- **Data source:** `dogDetail` (`GET /api/dogs/{id}`) supplies `name, status, overdue, overdueBy`. Then the channel `dog` (set by dog-actions, read by dog-heading, page-scoped) takes over. There is no empty state: a missing dog is the page's not-found branch, which this unit does not own.
- **Liveness:** request-response. Nothing is pushed. The channel only carries this page's own optimistic writes.
- **Data-shape hazard:** `overdueBy` may be absent even when `overdue` is true. The mock renders plain `Overdue` in that case (`d.overdueBy ? " · " + … : ""`). `name` can run to about 40 characters, so it must wrap (`break-words min-w-0`).

## 2. Anatomy

```
div.dog-heading-row          flex flex-wrap items-center gap-3 mb-5
├─ h1.dog-heading-name        font-display (Caveat 700) text-4xl / md:text-5xl, break-words, min-w-0
└─ div.dog-heading-badges     flex flex-wrap gap-2
   ├─ span  daisyUI `badge` + per-status modifier + whitespace-nowrap
   │    └─ lucide icon (size 1em) + label
   └─ span  daisyUI `badge badge-error` whitespace-nowrap   (only when overdue)
        └─ lucide `alarm-clock` (1em) + "Overdue" [+ " · " + overdueBy]
```

The badges are daisyUI `badge` components and should be kept as they are. The unit's own parts use the `dog-heading-` prefix and never a daisyUI name. The status map below is verbatim from STATUS (js lines 244-249):

| status | label | daisyUI classes | lucide icon |
|---|---|---|---|
| booked | Booked | `badge badge-info badge-soft` | calendar-clock |
| checked-in | Checked in | `badge badge-success badge-soft` | house |
| walking | Walking | `badge badge-accent` | footprints |
| checked-out | Checked out | `badge badge-outline` | log-out |
| (overdue) | Overdue · {overdueBy} | `badge badge-error` | alarm-clock |

Tokens (css/dog-heading.theme.css):
- `h1` / `.font-display`: Caveat, weight 700, `letter-spacing: var(--tracking-display)` (-0.015em), `line-height: var(--leading-tight)` (1.1).
- Badge: `--radius-selector: 1rem`, `--size-selector: .25rem`, which gives a 24px-tall badge with `gap: .5rem` and `font-size: .875rem`.
- In the mock the status span has two spaces before `whitespace-nowrap` (an empty `extra`), and there is a literal space between the two badges inside a gap-2 flex. Neither affects layout.

## 3. Props

| name | type | default | control widget | signal? |
|---|---|---|---|---|
| name | string | "Biscuit" | text | no (SSR input) |
| status | `"booked" \| "checked-in" \| "walking" \| "checked-out"` | "booked" | select | **yes** (fed by channel `dog`) |
| overdue | boolean | false | boolean | **yes** (channel `dog`) |
| overdueBy | string | "" | text | **yes** (channel `dog`) |

## 4. States → cases

Every case has `_tier: "pure-client"`. Each `_reference` is under `fixtures/kennel-app/spec/ui/breakdown/pages/dog-detail/components/dog-heading/screenshots/`, and each `_viewport` is the page width the still was shot at. The default theme is `brand` (design-tokens.md). All cases use tolerance 0.01.

| case | state | data (real, captured) | _viewport | _theme | _reference |
|---|---|---|---|---|---|
| default | booked, desktop | Biscuit / Booked | 1280 | brand | dog-heading@1280.png |
| bp-375 | base breakpoint, 36px h1 | Biscuit / Booked | 375 | brand | dog-heading@375.png |
| bp-640 | sm, still 36px | Biscuit / Booked | 640 | brand | dog-heading@640.png |
| bp-768 | md, h1 steps to 48px | Biscuit / Booked | 768 | brand | dog-heading@768.png |
| bp-1024 | lg | Biscuit / Booked | 1024 | brand | dog-heading@1024.png |
| dark | dark theme | Biscuit / Booked | 1280 | brand-dark | dog-heading@1280-brand-dark.png |
| long-name-walking | long-name overflow, walking | Sir Reginald Barksworth-Fluffington III / Walking | 1280 | brand | dog-heading-long-name-walking@1280.png |
| long-name-walking-375 | name wraps to 2 lines, badge on its own line | same | 375 | brand | dog-heading-long-name-walking@375.png |
| overdue | overdue badge shown | Rocco / Checked in + Overdue · 2h 15m | 1280 | brand | dog-heading-overdue@1280.png |
| overdue-375 | badges wrap below the name | same | 375 | brand | dog-heading-overdue@375.png |
| overdue-dark | overdue, dark | same | 1280 | brand-dark | dog-heading-overdue@1280-brand-dark.png |
| checked-in | checked-in badge | Juniper / Checked in | 1280 | brand | dog-heading-checked-in@1280.png |
| checked-out | outline badge | Mochi / Checked out | 1280 | brand | dog-heading-checked-out@1280.png |
| after-check-in | the channel flipped status to checked-in (the optimistic intent, and also the reconciled reply) | Biscuit / Checked in | 1280 | brand | dog-heading-after-check-in@1280.png |

There are no `pending` or `rolled-back` cases here because this unit is not `optimistic-write`. Those belong to dog-actions. Seen from the heading, "pending" is the `after-check-in` render and "rolled-back" is the `default` render.

## 5. Events

The unit emits **no** DOM or output events: it has no controls. The observable effects below are what the build session lifts into tests. In each test, call `waitHydrated(page)` first, then `BASE = process.env.ISOLATE_BASE_URL`.

- **default**: `await expect(page.locator("h1")).toHaveText("Biscuit"); await expect(page.locator(".badge")).toHaveText(["Booked"]);`
- **after-check-in**: `await expect(page.locator(".badge.badge-success.badge-soft")).toHaveText("Checked in"); await expect(page.locator(".badge-info")).toHaveCount(0);` This proves the island renders the channel/signal value and not the SSR `booked`.
- **overdue**: `await expect(page.locator(".badge.badge-error")).toHaveText("Overdue · 2h 15m");`
- **checked-in**: `await expect(page.locator(".badge-error")).toHaveCount(0);` There is no overdue badge when `overdue` is false.
- **long-name-walking-375**: `const h = await page.locator("h1").boundingBox(); expect(h.width).toBeLessThanOrEqual(351);` The name wraps and does not overflow.

## 6. Motion

**None.** The status flip is an instant re-render (`innerHTML`), and `document.getAnimations()` returns `[]` both before and right after the click (screenshots/jank.md). There is no motion.json and no filmstrip, so there is no `_motion` case. The jank sample on click → re-render showed 0% dropped frames, a max frame of 16.8 ms, one 68.2 ms LoAF (the initial render), and CLS 0.0001. The lints found nothing, so the rebuild needs no fix. Do not add a transition the mock doesn't have.

## 7. Responsive

The source has no custom `@media` rules. It uses Tailwind prefixes only:
- **< 768px:** h1 is `text-4xl`, 36px (still height 40px). At 375 a long name wraps (`overflow-wrap: break-word`, `min-w-0`), and the badge group drops to its own line (still height 115px). With a short name and two badges (Rocco, overdue), the badges wrap under the name (76px).
- **≥ 768px (`md:`):** h1 is `text-5xl`, 48px (still height 53px). Everything sits on one row from 768 up to 1280.

## 8. A11y

- The `h1` is the page's only level-1 heading and carries the dog's name.
- The lucide icons are `aria-hidden="true"`. The badge text is the accessible label, and meaning does not rely on colour because every badge has a text label.
- Nothing is focusable and there is no keyboard interaction.
- The status change is visible but not announced. The mock has no live region, and the toast from dog-actions covers failures. This was left as observed.
- Reduced-motion is moot because there is no motion.

## 9. Used on

- dog-detail only (page-local). It is an island only because it reads `dog`.

## 10. Isolate build plan

- **Lands at:** `fixtures/kennel-app/src/pages/dog-detail/components/dog-heading/`, with the selector `<dog-heading>`. Files: `template.html`, `logic.ts` (it reads the `dog` channel into the `status/overdue/overdueBy` signals, seeded from props), `styles.css` (only the `dog-heading-*` parts, if any), and `isolate/` (proposed here).
- **Preview routes:** `/components/dog-detail/dog-heading/<case>`, one per case: default, bp-375, bp-640, bp-768, bp-1024, dark, long-name-walking, long-name-walking-375, overdue, overdue-375, overdue-dark, checked-in, checked-out, after-check-in. The `_reference` still for each case is listed in §4.
- **Tests (from §5):**
  - `cases/default/tests/heading.spec.ts`
  - `cases/after-check-in/tests/channel-status.spec.ts`
  - `cases/overdue/tests/overdue-badge.spec.ts`
  - `cases/checked-in/tests/no-overdue.spec.ts`
  - `cases/long-name-walking-375/tests/wraps.spec.ts`
- **Loop:**
  1. Scaffold the folder and drop in `isolate/`.
  2. Run `sprig isolate test --root fixtures/kennel-app --json`. The 14 `reference:` rows are the pixel diff.
  3. Lift §5 into the tests above.
  4. Re-run and iterate until green.
  5. Compose it into the dog-detail page after the back link, with the `dog` channel wired to dog-actions.
