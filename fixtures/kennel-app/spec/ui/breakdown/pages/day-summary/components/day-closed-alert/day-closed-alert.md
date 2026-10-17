# day-closed-alert

Evidence: `source.html`, `js/day-closed-alert.js` (the mock behaviour behind this region), `css/`, `screenshots/`.

Page-local island on **day-summary** (`#/summary`). Mock region:
`#app > [role="alert"].alert-success`. It is shown only when today's day is
closed.

## 1. Classification & behavior

- **Bucket:** island (`template.html` + `logic.ts` + `styles.css`). It is a
  folder whose selector is `day-closed-alert`; there is no `.tsx`.
- **Interaction tier:** `pure-client`. The unit has no interaction of its own and
  performs no server write.
- **Why it is an island:** the alert has to appear after a confirmed close
  **without a reload**. SSR alone renders it only on the next page load.
- **Data source:** SSR input from the `today` query (`GET /api/days/today`), field
  `closed` only (data-model.md reverse index: `day-closed-alert | today (closed)`).
  - It also reads the page-scoped **channel `day`**, which is set by
    `close-day-control` and read by `day-closed-alert` and `day-stats`.
  - There is no store. The unit never calls `day.close` itself.
- **Client state owned:** one signal, `closed: boolean`.
  - It is seeded from SSR `today.closed`.
  - It is updated in place when the `day` channel carries the confirmed
    `day.close` reply (`closed: true`).
  - `close-day-control` publishes only the **confirmed** reply. The write's tier
    is `confirmed` in data-model.md, so this unit never shows an optimistic
    "closed" that could need rolling back.
- **Liveness:** request-response. Nothing in the mock is pushed. The only update
  is the local channel after this user's own close.
- **Honest-empty:** when `closed === false` the unit renders **nothing**. There is
  no placeholder and no reserved space, the same as the mock's `""` branch.
- **Data-shape hazard:** none. It reads a single boolean.
- **Mock behaviour to NOT copy:** the mock re-renders all of `#app` with
  `innerHTML` on every change (`closeDay()` → `render()`). The rebuild inserts
  only this alert and leaves its siblings alone (see Motion / jank).

## 2. Anatomy

```
<day-closed-alert>                                  ← island host
  [closed] div.day-closed-alert-reveal              ← own wrapper (entrance only; see Motion)
    div[role="alert"].alert.alert-soft.alert-success.mb-5   ← daisyUI `alert` (keep)
      i/svg[data-lucide="circle-check"].size-5.shrink-0     ← Lucide icon, decorative
      span  "Today's ledger is locked. Revenue below is final."
```

- The source element **is** the daisyUI `alert` component: `alert alert-soft
  alert-success`. Keep those classes. Do not re-implement them in scoped CSS.
  - daisyUI gives: a grid with `grid-template-columns: auto minmax(auto,1fr)`
    (because the alert has 2 children), `gap: 1rem`, padding `.75rem 1rem`,
    `font-size .875rem / line-height 1.25rem`, `border-radius: var(--radius-box)`,
    and a `border-width: var(--border)`.
  - `alert-soft` sets the background to `color-mix(in oklab, var(--color-success) 8%, var(--color-base-100))`,
    the border to `color-mix(... 10% ...)`, the text colour to
    `var(--color-success)`, and removes the shadow.
- `mb-5` (`calc(var(--spacing) * 5)` = 20px) is the gap to the stats below. It
  belongs to the alert in the mock, so keep it on the alert. The mock's push-down
  therefore measures 46 + 20 = 66 px.
- The only class the unit adds for itself is **`day-closed-alert-reveal`** (the
  entrance wrapper). It is prefixed and is not a daisyUI name.
- There are no slots and no projected children. The copy is fixed text.

## 3. Props

| name | type | default | control widget | signal? |
| --- | --- | --- | --- | --- |
| `closed` | boolean | `true` in the fixture (SSR default is `today.closed`) | `boolean` (checkbox) | **yes** (`signal: true`) |

The fixture default is `true` because every captured still shows the closed
state. The `hidden` case pins `false`.

## 4. States → cases

Every case has `_tier: "pure-client"`. Each `_reference` is git-root-relative:
`fixtures/kennel-app/spec/ui/breakdown/pages/day-summary/components/day-closed-alert/screenshots/<still>`.
The default theme is `brand` (design-tokens.md `Default theme: brand`), and the
dark theme is `brand-dark`. Tolerance stays at the default 0.01.

| case | state | `_signals` | `_viewport` | `_theme` | `_reference` still (slot px) |
| --- | --- | --- | --- | --- | --- |
| `default` | closed day, alert shown, text on one line | `closed: true` | 1280 | brand | `day-closed-alert@1280.png` (1232×46) |
| `closed-375` | closed, **text wraps to 2 lines** | `closed: true` | 375 | brand | `day-closed-alert@375.png` (351×66) |
| `closed-640` | closed, one line | `closed: true` | 640 | brand | `day-closed-alert@640.png` (616×46) |
| `closed-768` | closed, one line (md page padding) | `closed: true` | 768 | brand | `day-closed-alert@768.png` (720×46) |
| `closed-1024` | closed, one line | `closed: true` | 1024 | brand | `day-closed-alert@1024.png` (976×46) |
| `closed-375-brand-dark` | closed, dark, wrapped | `closed: true` | 375 | brand-dark | `day-closed-alert@375-brand-dark.png` (351×66) |
| `closed-1280-brand-dark` | closed, dark | `closed: true` | 1280 | brand-dark | `day-closed-alert@1280-brand-dark.png` (1232×46) |
| `hidden` | open day: renders **nothing** (no `[role=alert]`, zero height) | `closed: false` | 1280 | brand | — (no still exists; it needs its spec, see Events E1) |

**Behavioural state, not a still:** `hidden → shown`. When the `day` channel
delivers the confirmed close, the alert appears in place with no reload. Events
E2 covers it in the `hidden` case.

**Real data carried by every closed case:**
- The text `Today's ledger is locked. Revenue below is final.` (the curly or
  straight apostrophe exactly as the template renders it; the source uses
  ASCII `'`).
- The `circle-check` icon.

## 5. Events

The unit **emits no events**. It has no controls and no `ctx.output`. Its
contract is what the DOM shows in response to `closed`. The predicates below are
for `cases/<case>/tests/*.spec.ts` (headless runner: plain `@playwright/test`
with `ISOLATE_BASE_URL`, and `waitHydrated` before any assertion).

- **E1 (hidden renders nothing):**
  ```ts
  await page.goto(`${BASE}/components/day-summary/day-closed-alert/hidden`);
  await waitHydrated(page);
  await expect(page.locator('day-closed-alert [role="alert"]')).toHaveCount(0);
  ```
- **E2 (appears without reload on a confirmed close):** flip the `closed` signal
  to `true` through the fixture's `closed` checkbox. It is a `signal: true`
  control, so this is a signal update and not a remount, and it stands in for the
  `day` channel delivery. Then:
  ```ts
  const ev = await capture(page);            // before goto
  // …goto hidden, waitHydrated, toggle the closed control…
  await expect(page.locator('day-closed-alert [role="alert"].alert-success'))
    .toHaveText("Today's ledger is locked. Revenue below is final.");
  // the unit itself fires nothing:
  expect(ev.events.filter(e => e.source.startsWith("day-closed-alert"))).toHaveLength(0);
  ```
  (The exact `capture` accessor for "all events so far" is **described, not
  extracted — verify during build**. The DOM assertion is the load-bearing one.)
- **E3 (closed content):** in `default`, the alert has role `alert`, contains an
  `svg[data-lucide="circle-check"]` (or the app's icon equivalent) with
  `aria-hidden="true"`, and has the text above.
- **Page-level (lives in the day-summary page spec, not here):** clicking
  `button#close-day` publishes the `day.close` reply (`POST /api/days/{id}/close`
  → `{closed:true}`) on channel `day`, and `day-closed-alert [role=alert]`
  becomes visible with no navigation (`page.url()` unchanged, no reload).

## 6. Motion

- **Extracted:** none. `getAnimations()` after the close reply returns `[]`, and
  there is no computed transition or animation. The unit has no `motion.json`, so
  no case carries `_motion`.
- **Jank finding** (`screenshots/jank.md`):
  - Inserting the alert hard-pushes the content below it down by **66 px** at
    ≥640 (46 alert + 20 `mb-5`) and by **86 px** at 375 (66 + 20).
  - The CLS API reports 0 only because the mock recreates every node.
  - Reply 76–89 ms, 0% dropped frames, max frame 16.8 ms.
- **Rebuild fix** (the capture's recommendation):
  - Insert only the alert, leaving the stats and cards untouched.
  - Give the alert an entrance on `.day-closed-alert-reveal`, either a
    `grid-template-rows: 0fr → 1fr` wrapper or the theme's `brand-rise`
    (opacity + translateY, 320 ms, `--ease-bounce`).
  - Under `prefers-reduced-motion: reduce`, it appears instantly.
  - The entrance runs **only** on a client-side `false → true` flip, never on an
    SSR first paint of an already-closed day.
  - The exact keyframes are **described, not extracted** because the mock has no
    motion here. Verify during build. The stills were shot with animations
    disabled, and the runner screenshots with animations settled, so the entrance
    must end at the still's geometry.
- **No filmstrip:** this unit has no `screenshots/filmstrip.png`.

## 7. Responsive

- The unit has no `@media` rules of its own. It fills its slot's width.
- **<640 (375 still):** the text wraps to 2 lines and the alert is **66 px** tall.
- **≥640 (640/768/1024/1280):** the text fits on one line and the alert is **46 px**
  tall.
- The width changes at 768 (`p-3 → p-6`) come from the page padding (Tailwind
  `md`), not from this unit.
- The mock only has Tailwind's default breakpoints (`md` 768, `lg` 1024), and
  neither changes the alert's own layout.

## 8. A11y

- `role="alert"` (implicit `aria-live="assertive"`) is kept. Inserting it after
  the close announces "Today's ledger is locked…" to screen-reader users, which is
  the purpose of the unit.
- **SSR of an already-closed day:** the alert is present at load. Some screen
  readers announce a `role=alert` present at load. This is acceptable and matches
  the mock.
- The icon is decorative: `aria-hidden="true"`, with no label. The text carries
  the meaning.
- The unit is not focusable and has no keyboard interaction. Focus stays on
  whatever the user was on (the page's close control becomes the "Day closed"
  badge; that is close-day-control's concern).
- Reduced motion: the entrance is disabled (see Motion).
- Contrast: success text on the 8% success-tinted base-100, per theme. The mock
  inherits it from daisyUI tokens. Verify the contrast in the build and do not
  override it.

## 9. Used on

- `day-summary` only. It is page-local: it reads the page-scoped `day` channel so
  that it appears after the close.

## 10. Isolate build plan

- **Lands at:** `fixtures/kennel-app/src/pages/day-summary/components/day-closed-alert/`
  (`template.html`, `logic.ts`, `styles.css`, plus this `isolate/` folder copied
  in). The selector is `<day-closed-alert>`.
- **Preview routes:** `/components/day-summary/day-closed-alert/<case>` (from
  `fixture.json` `category: day-summary`, `folder: day-closed-alert`), for:
  - `default` — closed, 1280 brand → `day-closed-alert@1280.png`
  - `closed-375` — closed and wrapped, 375 brand → `day-closed-alert@375.png`
  - `closed-640` — closed, 640 brand → `day-closed-alert@640.png`
  - `closed-768` — closed, 768 brand → `day-closed-alert@768.png`
  - `closed-1024` — closed, 1024 brand → `day-closed-alert@1024.png`
  - `closed-375-brand-dark` — closed, 375 dark → `day-closed-alert@375-brand-dark.png`
  - `closed-1280-brand-dark` — closed, 1280 dark → `day-closed-alert@1280-brand-dark.png`
  - `hidden` — open day renders nothing → no still. It is checked only by its
    spec.
- **Events → tests:**
  - E1 and E2 → `cases/hidden/tests/hidden.spec.ts`
  - E3 → `cases/default/tests/default.spec.ts`
- **Loop:**
  1. Scaffold the folder.
  2. Drop in `isolate/`.
  3. Run `sprig isolate test --json --root fixtures/kennel-app`. The 7
     `reference:` rows are the pixel diff at the default 0.01.
  4. Lift E1–E3 into the specs.
  5. Run the tests again and iterate until green.
  6. Only then compose it into `pages/day-summary` beside `close-day-control`
     and `day-stats` on the `day` channel.
- **Fonts:** the runner loads the app document's fonts (Quicksand 400/600/700).
  If the app head does not link them, the reference rows fail, and that is a real
  finding.
