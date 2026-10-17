# close-day-control

The day-summary header's right-hand control. While the day is open it is a
primary "Close the day" button. It sends `day.close`, waits for the server's
reply, and then turns into a "Day closed" badge. Page-local to `day-summary`.

Evidence: `source.html` (default, pending and closed states),
`js/close-day-control.source.js`, `screenshots/` (stills, filmstrips,
`motion.json`, `jank.md`), `css/`.

## 1. Classification & behavior

- **Bucket:** island (it has a `logic.ts`). Justification: it owns a request
  lifecycle (idle → pending → closed | back to idle) and publishes the server's
  day to its page siblings, so it cannot be a static template.
- **Tier:** `pure-client`, as the analyst recorded it. The write is **not
  optimistic**. `day.close` has `feedback: confirmed`, and **waits: day.close**:
  the server decides the lock and the final revenue, and it can refuse the
  close (for example while dogs are still walking). So the UI must not show
  the result before the reply arrives. Build marks the await
  `// sprig-wait: day.close — the lock and final revenue are decided server-side and the close can be refused (dogs still walking)`.
- **Flow (confirmed, not optimistic):**
  1. Click `#close-day`. Set `pending = true`. The button becomes disabled,
     with a spinner and the label "Closing the day…".
  2. Await `POST /api/days/{id}/close` (command `closeDay` / `day.close`, body
     `{ "id": "<dayId>", "closed": true }`, captured held body
     `{"id":"today","closed":true}`).
  3. **Reply OK:** merge the reply into the day, set `closed = reply.closed`
     (true), and publish the server's day on the `day` channel, which
     `day-closed-alert` and `day-stats` read. Then push the success toast
     "Day closed — ledger locked." onto `toasts`.
  4. **Reply error:** there is nothing to roll back, because no local state
     changed except `pending`. Push the error toast "The day couldn't be
     closed — nothing changed." onto `toasts`.
  5. Either way, set `pending = false`.
  - Never use client toast + `location.reload()`. Never re-render the whole
    page (the mock replaces `$app.innerHTML` twice per write; see Motion/jank).
- **Client state owned (signals):** `closed: boolean` (seeded from SSR
  `today.closed`, flipped by the reply) and `pending: boolean`. Both are
  reconciled in place. Only this unit re-renders.
- **Data source:** SSR input `today` (`id`, `closed`) plus the typed-client
  command `closeDay`. Nothing is empty here: the day always exists (`id`
  `today`).
- **Liveness:** request-response. The mock pushes nothing.
- **Channels (wiring, no stores):** `day` is set here and read by
  day-closed-alert and day-stats. `toasts` is edited here; the page's
  toast-stack owns it.
- **Data-shape hazard:** revenue finality (`revenueToday`, "Final") is
  server-decided. This unit never computes it. It only republishes the
  reply's day.

## 2. Anatomy

A wrapper holds exactly one of three children:

```
<close-day-control>                       (inline; right end of the header's
                                            flex-wrap items-end justify-between row)
  ├─ idle:    button#close-day.btn.btn-primary
  │             svg lucide-lock (size 1.2em, aria-hidden) + "Close the day"
  ├─ pending: button#close-day.btn.btn-primary[disabled]
  │             span.loading.loading-spinner.loading-sm + "Closing the day…"
  └─ closed:  <icon-badge icon="lock" tone="neutral" size="lg" focusId="day-closed-badge">  (shared) = span.badge.badge-neutral.badge-lg#day-closed-badge[tabindex=-1]
                svg lucide-lock (size 1em, aria-hidden) + "Day closed"
```

- These are daisyUI components the build keeps: daisyUI `btn` / `btn-primary`,
  daisyUI `loading` / `loading-spinner` / `loading-sm`, and daisyUI `badge` /
  `badge-neutral` / `badge-lg`.
- Proposed own classes are all prefixed. Use `close-day-control-icon` for the
  lock svg sizing (replacing the Tailwind `size-[1.2em]` / `size-[1em]`
  utilities), and `close-day-control-button` for the min-width fix below.
- Measured sizes at DPR 1:

  | State | Size |
  |---|---|
  | idle | 148.8×40 (still 149×40) |
  | pending | 172×40 |
  | closed badge | 136×28 |

- The closed badge is bottom-aligned by the row's `items-end` (y=124 vs the
  button's y=112).
- No slots and no projected children.

## 3. Props

| name | type | default | control widget | signal? |
|---|---|---|---|---|
| `dayId` | string | `"today"` | text | no |
| `closed` | boolean | `false` | boolean | yes |
| `pending` | boolean | `false` | boolean | yes |

`dayId` and the initial `closed` come from the SSR `today` input. `pending`
is internal state, exposed as a signal so the workbench can pin the confirmed
wait.

## 4. States → cases

Every case has `_tier: "pure-client"`. Stills live in
`fixtures/kennel-app/spec/ui/breakdown/pages/day-summary/components/close-day-control/screenshots/`
(git-root-relative; called `<S>/` below).

| case | state | `_viewport` / `_theme` | `_reference` | `_network` |
|---|---|---|---|---|
| `default` | idle, enabled "Close the day" (+ `_motion`: nothing animates at rest) | 1280 / brand | `<S>/close-day-control@1280.png` | — |
| `idle-768` | idle | 768 / brand | `<S>/close-day-control@768.png` | — |
| `idle-375` | idle | 375 / brand | `<S>/close-day-control@375.png` | — |
| `idle-dark` | idle | 1280 / brand-dark | `<S>/close-day-control@1280-brand-dark.png` | — |
| `pending` | confirmed wait: disabled, spinner, "Closing the day…" | 1280 / brand | `<S>/close-day-control-pending@1280.png` (tolerance 0.06 + reason: live SMIL spinner) | `POST /api/days/{id}/close`: `delay:3000` |
| `pending-375` | pending; on the page it wraps under the heading | 375 / brand | `<S>/close-day-control-pending@375.png` (0.06, spinner) | — |
| `pending-dark` | pending | 1280 / brand-dark | `<S>/close-day-control-pending@1280-brand-dark.png` (0.06, spinner) | — |
| `closing` | behavioral: click → held reply → stays pending, no badge before the reply | 1280 / brand | `<S>/close-day-control@1280.png` (at load) | `POST /api/days/{id}/close`: `delay:3000` |
| `rolled-back` | refused: back to enabled "Close the day" + error toast | 1280 / brand | `<S>/close-day-control-failed@1280.png` | `POST /api/days/{id}/close`: `{ "status": 500 }` |
| `accepted` | reply OK: badge replaces the button, `day` published, success toast | 1280 / brand | `<S>/close-day-control@1280.png` (at load) | `POST /api/days/{id}/close`: `{ "status": 200, "body": { "id": "today", "closed": true } }` |
| `closed` | "Day closed" badge | 1280 / brand | `<S>/close-day-control-closed@1280.png` | — |
| `closed-375` | badge | 375 / brand | `<S>/close-day-control-closed@375.png` | — |
| `closed-dark` | badge | 1280 / brand-dark | `<S>/close-day-control-closed@1280-brand-dark.png` | — |

- `_theme` "brand" is the mock default (`design-tokens.md`: `Default theme:
  brand`). The app scaffold's `brand-dark` default is a drift the analyst
  flagged.
- The `pending` case seeds `_signals.pending: true` so its still matches at
  load. Its `delay:3000` fake backs its test, which asserts that a click on
  the disabled button fires **no** request (the fake's row must read
  `fired 0×`).
- `closing`, `rolled-back` and `accepted` load idle and exercise the click
  flow in their specs.
- `close-day-control-failed-toast@1280.png` (320×66) and
  `close-day-control-closed-toast@1280.png` (250×46) are **toast-stack's**
  render, not this unit's, so they get no `_reference` case here. Their texts
  are asserted in the `rolled-back` / `accepted` specs (see GAPS).

## 5. Events

Observed sources: `button#close-day` (click). The unit publishes on the `day`
and `toasts` channels, not through DOM events.

| # | when | predicate sketch | lands in |
|---|---|---|---|
| E1 | user clicks Close the day | `ev.expect(e => e.source === "button#close-day" && e.type === "click")` | `cases/closing/tests/closing.spec.ts` |
| E2 | click → confirmed wait (reply held) | `await page.locator("#close-day").click(); await expect(page.locator("button#close-day")).toBeDisabled(); await expect(page.locator("button#close-day")).toHaveText(/Closing the day…/); await expect(page.locator("button#close-day .loading-spinner")).toBeVisible(); await expect(page.locator(".badge")).toHaveCount(0) /* no result before the reply */` | `cases/closing/tests/closing.spec.ts` |
| E3 | the request body | `const req = await page.waitForRequest(r => r.method() === "POST" && new URL(r.url()).pathname === "/api/day/close"); expect(req.postDataJSON()).toEqual({ id: "today", closed: true })` | `cases/closing/tests/closing.spec.ts` |
| E4 | a disabled pending button is inert | `await page.locator("#close-day").click({ force: true }); /* runner row: network POST /api/days/{id}/close → delay:3000: fired 0× */` | `cases/pending/tests/pending.spec.ts` |
| E5 | reply 500 → back to idle + error toast | `await page.locator("#close-day").click(); await expect(page.locator("button#close-day")).toBeEnabled(); await expect(page.locator("button#close-day")).toHaveText(/Close the day/); /* toasts channel receives { kind: "error", text: "The day couldn't be closed — nothing changed." } */` | `cases/rolled-back/tests/rolled-back.spec.ts` |
| E6 | reply 200 → badge + day published + success toast | `await page.locator("#close-day").click(); await expect(page.locator(".badge", { hasText: "Day closed" })).toBeVisible(); await expect(page.locator("#close-day")).toHaveCount(0); /* day channel receives { id: "today", closed: true, … }; toasts receives { kind: "success", text: "Day closed — ledger locked." } */` | `cases/accepted/tests/accepted.spec.ts` |

The channel-publish assertions (E5/E6 comments) are **described, not
extracted**. The mock has no channel; it mutates `ui.data.day` and calls
`toast()`. Build asserts them through whatever test seam the island's channel
wiring exposes (e.g. a `_mocks` toast-stack stub, or the channel's observable
state).

## 6. Motion

From `screenshots/motion.json` (Chromium, DPR 1):

- **At rest:** `animations: []`. The `default` case carries
  `_motion: { "spec": "fixtures/kennel-app/spec/ui/breakdown/pages/day-summary/components/close-day-control/screenshots/motion.json" }`,
  which pins "no unexpected animation at rest".
- **Hover `#close-day`** (interaction-triggered, so assert it in a spec, not
  in `_motion`): CSSTransitions, 200 ms, `cubic-bezier(0, 0, 0.2, 1)`, 2
  keyframes each, on `background-color`, `border-{top,right,bottom,left}-color`
  and `box-shadow`. Background goes `rgb(194, 65, 12)` →
  `oklab(0.514694 0.126733 0.10045)`. Filmstrip: `screenshots/filmstrip-hover.png`.
- **Toast entrance** (toast-stack's element, triggered by the reply): the
  daisyUI `toast` CSSAnimation, 250 ms ease-out, opacity 0→1 and scale 0.9→1.
  It runs only under `prefers-reduced-motion: no-preference`. Filmstrip:
  `screenshots/filmstrip-toast.png`.
- **Pending spinner:** daisyUI `loading-spinner` is SMIL inside `mask-image`,
  so `getAnimations()` sees 0 animations. The parameters were read from code
  (`motion.json.codeExtracted`):
  - rotate 0→360° about (12, 12), 2 s, repeating indefinitely
  - `stroke-dasharray` 0,150 → 42,150 → 42,150 and `stroke-dashoffset`
    0 → −16 → −59, keyTimes 0 / 0.475 / 1, 1.5 s, repeating indefinitely
  - circle r 9.5, stroke 3, round linecap
  - reduced motion: 8 s rotate / 6 s dash

  `screenshots/filmstrip-spinner-live.png` holds 6 live frames 250 ms apart.
  They are not deterministic.
- **Jank** (`jank.md`, live):

  | run | dropped frames | max frame | long animation frames | CLS |
  |---|---|---|---|---|
  | failing write | 0% | 16.8 ms | none | 0 |
  | accepted write | 1.1% | 33.3 ms | none | 0 |

- **Rebuild fixes:**
  1. Drop `box-shadow` from the button's transition list and keep the colour
     transitions (or fade a pre-rendered `::after` shadow's opacity).
  2. Reserve a min-width of 172px on the button (`close-day-control-button`)
     so the "Closing the day…" label (148.8 → 172 px) does not shift the
     right-aligned control or wrap it at 375.
     Caution: applying this widens the idle render to 172px, which is more
     than 4px from the 149-wide idle stills, so they fail as a size mismatch.
     Either keep the mock width or recapture the idle stills. Build decides.
  3. Keep daisyUI's spinner as-is. Use a CSS `@keyframes rotate` spinner only
     if the build wants it testable via `_motion`.
  4. Update island-local signals only. The mock's whole-`$app` re-render is
     rejected.
  5. The toast exit (currently an abrupt `remove()` after 3.5 s) belongs to
     toast-stack.
  6. The `:active` `translate: 0 .5px` press is not transitioned, so it snaps.
     Rebuild it as-is.

## 7. Responsive

The mock has no custom `@media` (Tailwind v4 defaults only). The control is
identical at 375, 768 and 1280 (149×40 idle, 136×28 closed). The page's
header row is `flex flex-wrap items-end justify-between gap-3`:

- At 375 the wider pending button (172px) wraps onto its own line under the
  heading (x=12). That is the page layout, not a unit breakpoint.
- With the min-width fix, the idle and pending widths match, so the wrap
  behaviour no longer changes between states.

## 8. A11y

- The native `<button>` gives focus and Enter/Space for free.
- While pending, the button is `disabled` (removed from the tab order), and
  the label text "Closing the day…" announces the state. Add
  `aria-live="polite"` on the wrapper (or `aria-busy="true"` on the button)
  so the change is announced. This is described, not extracted: the mock has
  neither.
- The lock svgs are `aria-hidden="true"`. The text labels carry the meaning.
- After close, focus sits on a removed button. Move focus to the badge
  wrapper (`tabindex="-1"`), or let the success toast (role status) announce
  the result. Described, not extracted.
- Reduced motion: the spinner slows to 8 s / 6 s (daisyUI), and the toast
  entrance is skipped.

## 9. Used on

- `day-summary` only (page-local).

## 10. Isolate build plan

- **Lands at:** `fixtures/kennel-app/src/pages/day-summary/components/close-day-control/`
  (`template.html` + `logic.ts` + `styles.css`). Selector: `<close-day-control>`.
- **Preview routes:** `/components/day-summary/close-day-control/<case>`, one
  per case: `default`, `idle-768`, `idle-375`, `idle-dark`, `pending`,
  `pending-375`, `pending-dark`, `closing`, `rolled-back`, `accepted`,
  `closed`, `closed-375`, `closed-dark`. Each case's still is in the §4 table.
- **Tests from Events:**
  - E1, E2 and E3 → `cases/closing/tests/closing.spec.ts`
  - E4 → `cases/pending/tests/pending.spec.ts`
  - E5 → `cases/rolled-back/tests/rolled-back.spec.ts`
  - E6 → `cases/accepted/tests/accepted.spec.ts`
  - Hover transition (200 ms `cubic-bezier(0,0,0.2,1)`, no `box-shadow` after
    the fix) → `cases/default/tests/hover.spec.ts`

  Use plain `@playwright/test` with `ISOLATE_BASE_URL`, and gate each click on
  `sprig-island[data-sel="close-day-control"][data-sprig-hydrated]`.
- **Loop:**
  1. Scaffold the folder and drop this `isolate/` in.
  2. Run `sprig isolate test --json`. The `_reference` rows are the diff; the
     `pending*` rows allow 0.06 for the spinner.
  3. Lift Events into the specs, then run and iterate to green.
  4. Only then compose into the day-summary header next to the heading.
