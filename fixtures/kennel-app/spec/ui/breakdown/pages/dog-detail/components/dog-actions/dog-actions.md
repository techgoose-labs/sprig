# dog-actions — the Actions card on dog detail

Mock region: `#app section.card:has([data-lucide="list-checks"])` (dog detail, `#/dog/<id>`).
Evidence: `source.html` (the booked, checked-in, walking, checked-out and pending states), `js/dog-actions.source.js`, `css/`, `screenshots/` (stills, `motion.json`, `jank.md`, filmstrips).

## 1. Classification & behavior

- **Bucket:** island (folder has `logic.ts`). **Tier:** `optimistic-write`. **Scope:** page-local to `dog-detail`.
- **Why an island:** four server writes (`dog.checkIn`, `dog.startWalk`, `dog.endWalk`, `dog.checkOut`), all `feedback: instant`. The status has to flip before the reply arrives.
- **Data source:** SSR input from `dogDetail` (`id`, `name`, `status`) and `today` (`closed`), plus typed-client commands. Nothing is fetched on the client.
- **Liveness:** request-response. Nothing in the mock is pushed.
- **Client state owned (signals):** `status` (the dog's status as the island shows it) and `inFlight` (the command awaiting its reply, or `null`). `closed` is a plain SSR prop. Nothing in the unit changes it.
- **Button rules** (from `act()` in `js/dog-actions.source.js`). A button is enabled only when its rule holds **and** `!closed`:

  | button | command | icon (lucide) | enabled when | style |
  |---|---|---|---|---|
  | Check in | `dog.checkIn` | `log-in` | `status === "booked"` | `btn-primary` when booked, otherwise `btn-soft btn-secondary` |
  | Start walk | `dog.startWalk` | `footprints` | `status === "checked-in"` | `btn-soft btn-secondary` |
  | End walk | `dog.endWalk` | `house` | `status === "walking"` | `btn-soft btn-secondary` |
  | Check out | `dog.checkOut` | `log-out` | `status === "checked-in"` | `btn-primary` when checked-in, otherwise `btn-soft btn-secondary` |

  The primary style follows the status, not `closed`. When the day is closed and the dog is booked, Check in keeps `btn-primary` but is disabled, and it renders grey like the rest (see `locked`).
- **Target status per command** (`TARGET`): checkIn → `checked-in`, startWalk → `walking`, **endWalk → `checked-in`**, checkOut → `checked-out`.
- **Optimistic flow** (replaces the mock's `runStatus`):
  1. Snapshot `before = status`.
  2. Set `status = TARGET[cmd]` and `inFlight = cmd`. Publish on the `dog` channel so `dog-heading`'s badge flips at the same moment ("Checked in" before the reply).
  3. Fire the typed-client command in the background with `{ id, status: TARGET[cmd] }`. The held body on the wire was `{"id":"d01","status":"checked-in"}`.
  4. **Accepted:** reconcile from the reply's dog (`status`, and for checkOut `overdue`). Publish the reconciled dog on `dog`. No toast.
  5. **Rejected** (HTTP error or aborted connection): restore `status = before`, republish `dog`, and push an error toast through the `toasts` channel: `` `${name}: ${STATUS[TARGET[cmd]].label.toLowerCase()} didn't go through — reverted.` ``. Captured: "Biscuit: checked in didn't go through — reverted." Because endWalk targets `checked-in`, an endWalk failure also reads "checked in didn't go through".
  6. Clear `inFlight`.
  
  Never re-render the page with `location.reload()`, and never write `$app.innerHTML` (jank lint 4).
- **Concurrency hazard (observed):** while a command is pending, the next-status buttons are already enabled, so a second command can fire before the first reply returns. The mock allows this. **The build decides:** either disable all four while `inFlight !== null` or queue the commands. If both run concurrently, a rollback of the first must not clobber the second's intent. Recommended: disable while `inFlight`. This changes nothing in any still, because stills never show two writes at once.
- **Channels (wiring, not stores):** `dog` is set by dog-actions and read by dog-heading. `toasts` is edited by dog-actions and owned by toast-stack. Both are page-scoped to dog-detail.
- **Data-shape hazard:** `checkOut` also clears `overdue` and moves the stay total into today's revenue. Reconcile `overdue` from the reply. Never compute it. Day rollups are the server's, and on this page they are only as fresh as the last `today` read.
- **Honest-empty:** n/a. The card always renders its four buttons.

## 2. Anatomy

```
<section class="card bg-base-100 border border-base-300">       ← daisyUI card (keep)
  <div class="card-body">                                        ← daisyUI card-body (keep)
    <h2 class="card-title text-2xl">                             ← daisyUI card-title; display font (Caveat)
      <svg lucide list-checks class="size-5" aria-hidden/> Actions
    <p class="text-sm text-base-content/70 dog-actions-locked-note">   ← only when closed
      The day is closed — stays are locked.
    <div class="dog-actions-list flex flex-col sm:flex-row lg:flex-col flex-wrap gap-2">
      <button data-cmd="dog.checkIn"   class="btn btn-primary|btn-soft btn-secondary w-full sm:w-auto" [disabled]>
        <svg lucide log-in class="size-[1.2em]"/> Check in
      <button data-cmd="dog.startWalk" …> <svg footprints/> Start walk
      <button data-cmd="dog.endWalk"   …> <svg house/>      End walk
      <button data-cmd="dog.checkOut"  …> <svg log-out/>    Check out
```

- Keep the daisyUI components as they are in the source: `card`, `card-body`, `card-title`, `btn`, `btn-primary`, `btn-soft`, `btn-secondary`.
- The unit's own hooks are prefixed: `dog-actions-list` and `dog-actions-locked-note`. Never use a bare daisyUI name for a scoped class.
- Icons are inline lucide SVGs (`stroke-width 2`, `currentColor`). Render them at SSR. The mock's `lucide.createIcons()` document sweep is not needed.
- No slots and no projected children.

## 3. Props

| name | type | default | control widget | signal? |
|---|---|---|---|---|
| `dogId` | string | `"d01"` | text | no |
| `dogName` | string | `"Biscuit"` | text | no |
| `status` | `"booked" \| "checked-in" \| "walking" \| "checked-out"` | `"booked"` | select | **yes** |
| `closed` | boolean | `false` | boolean | no |

`inFlight` is internal island state and not a control. The `pending` cases drive it through `_network` delays.

## 4. States → cases

Every case has `_tier: "optimistic-write"`, an explicit `_theme` (the mock's default is `brand`, from design-tokens.md "Default theme: brand"), and `_viewport` = the page width the still was shot at. `_reference` paths are git-root-relative: `fixtures/kennel-app/spec/ui/breakdown/pages/dog-detail/components/dog-actions/screenshots/<file>`. Every tolerance is the default 0.01.

| case | state | status / closed | viewport · theme | `_reference` / `_network` |
|---|---|---|---|---|
| `default` | Booked d01 Biscuit. Check in is primary and the other three are disabled. Also carries `_motion`: nothing animates at rest. | booked / false | 1280 · brand | `dog-actions@1280.png` (400×269) |
| `default-375` | Booked, column layout, full-width buttons | booked / false | 375 · brand | `dog-actions@375.png` (351×269) |
| `default-640` | Booked, row layout (sm), auto-width buttons | booked / false | 640 · brand | `dog-actions@640.png` (616×125) |
| `default-768` | Booked, row layout | booked / false | 768 · brand | `dog-actions@768.png` (720×125) |
| `default-1024` | Booked, back to a column (lg), buttons stretch | booked / false | 1024 · brand | `dog-actions@1024.png` (315×269; slot 314.66) |
| `default-dark` | Booked, dark theme | booked / false | 1280 · brand-dark | `dog-actions@1280-brand-dark.png` |
| `default-375-dark` | Booked, dark theme, column | booked / false | 375 · brand-dark | `dog-actions@375-brand-dark.png` |
| `checked-in` | d02. Start walk is enabled. Check out is enabled and primary. | checked-in / false | 1280 · brand | `dog-actions-checked-in@1280.png` |
| `checked-in-640` | d02, row | checked-in / false | 640 · brand | `dog-actions-checked-in@640.png` |
| `walking` | d03. Only End walk is enabled (soft). | walking / false | 1280 · brand | `dog-actions-walking@1280.png` |
| `walking-640` | d03, row | walking / false | 640 · brand | `dog-actions-walking@640.png` |
| `checked-out` | d04. All four are disabled and soft. | checked-out / false | 1280 · brand | `dog-actions-checked-out@1280.png` |
| `checked-out-640` | d04, row | checked-out / false | 640 · brand | `dog-actions-checked-out@640.png` |
| `locked` | Day closed: the locked note shows and all four are disabled | booked / true | 1280 · brand | `dog-actions-locked@1280.png` (400×297) |
| `locked-640` | Day closed, row | booked / true | 640 · brand | `dog-actions-locked@640.png` (616×153) |
| `hover` | Pointer over Check in: the 200 ms colour transition | booked / false | 1280 · brand | none. Asserted in a spec against `dog-actions-hover@1280.png` (see Gaps) |
| `pending` | Check in clicked, reply held. The intent (the checked-in layout) shows at once. | booked → checked-in | 1280 · brand | `_network`: `POST /api/dogs/{id}/check-in` → `delay:3000` |
| `pending-640` | Pending, row | booked → checked-in | 640 · brand | same delay |
| `pending-dark` | Pending, dark | booked → checked-in | 1280 · brand-dark | same delay |
| `rolled-back` | Check in answered 500. The card reverts to booked and emits the error toast. | booked → checked-in → booked | 1280 · brand | `_network`: `POST /api/dogs/{id}/check-in` → `{ "status": 500 }` |
| `rolled-back-640` | Rolled back, row | as above | 640 · brand | same |
| `reconciled` | d05 Pepper. The accepted reply reconciles to checked-in. No toast. | booked → checked-in | 1280 · brand | `_network`: `POST /api/dogs/{id}/check-in` → `{ "status": 200, "body": { "id": "d05", "status": "checked-in" } }` |

**Stills pinned by a spec, not a `_reference`.** The pixel-diff row renders a case before any interaction, but these stills show a state that only a click or a hover produces:

- **Pinned by a status case instead.** `dog-actions-pending@1280.png` and `dog-actions-reconciled@1280.png` are byte-identical to `dog-actions-checked-in@1280.png` (md5 `c2ec2986…`), so `checked-in` pins them. Likewise `dog-actions-pending@640.png` is identical to `dog-actions-checked-in@640.png`, which `checked-in-640` pins.
- **Hover-state stills.** `dog-actions-failed@1280.png` is byte-identical to `dog-actions-hover@1280.png` (md5 `d2b617ef…`): after the click, the pointer was still over Check in. `dog-actions-failed@640.png` differs from `dog-actions@640.png` for the same reason.
- **Unique still, spec only.** `dog-actions-pending@1280-brand-dark.png` has no pixel twin among the status cases. `pending-dark`'s spec compares the unit against it after the click.
- **Context.** `dog-actions-failed-toast@1280.png` is toast-stack's element. It is evidence for the emitted message and is not rendered by this unit. `screenshots/context/*` are full-page context shots and are not cases.

No offline (`"fail"`) case: the mock has no offline UI. An aborted connection behaves exactly like the 500 (same revert, same toast).

## 5. Events

Specs run under Node Playwright (`@playwright/test` + `isolate-events`). Wait for `waitHydrated(page)` before any click. `BASE = process.env.ISOLATE_BASE_URL`. Route: `/components/dog-detail/dog-actions/<case>`.

| # | when | predicate / observable effect | case |
|---|---|---|---|
| E1 | click Check in (booked) | `ev.expect(e => e.source === "button" && e.type === "click" && /Check in/.test(e.detail ?? ""))`. The button carries `data-cmd="dog.checkIn"` (no id in the source; add `id="check-in"` if the build wants `button#check-in`). | pending, rolled-back, reconciled |
| E2 | intent shows before the reply | Within 100 ms of the click, while `POST /api/dogs/{id}/check-in` is still held: `[data-cmd="dog.checkIn"]` is disabled, `[data-cmd="dog.startWalk"]` is enabled, `[data-cmd="dog.checkOut"]` is enabled and has `.btn-primary`. `network … → delay:3000: fired 1×`. | pending, pending-640, pending-dark |
| E3 | request body | `page.waitForRequest(r => r.method() === "POST" && /\/api\/dog\/check-in$/.test(new URL(r.url()).pathname))`. Its `postDataJSON()` includes `{ id: "d01", status: "checked-in" }`. | pending |
| E4 | intent published to `dog` | The island emits its `dog` channel output with `{ id: "d01", status: "checked-in" }` at the click, e.g. `ev.expect(e => e.type === "dog" && e.detail?.status === "checked-in")`. (Channel transport: described, not extracted.) | pending |
| E5 | rollback on 500 | After the reply: `[data-cmd="dog.checkIn"]` is enabled with `.btn-primary`, and the other three are disabled (the booked layout again). `dog` is re-emitted with `status: "booked"`. | rolled-back, rolled-back-640 |
| E6 | error surfaced | A `toasts` push with `{ kind: "error", message: "Biscuit: checked in didn't go through — reverted." }`, e.g. `ev.expect(e => e.type === "toast" && e.detail?.message === "Biscuit: checked in didn't go through — reverted.")`. | rolled-back |
| E7 | reconcile, no toast | After the 200 reply the checked-in layout remains, and no `toast` event fires within 500 ms. | reconciled |
| E8 | locked | All four `[data-cmd]` are `toBeDisabled()`. The text "The day is closed — stays are locked." is visible. A click on Check in fires no request (`fired 0×` would need a `_network` fake; alternatively assert `page.on("request")` sees no `/api/dogs/` POST). | locked |
| E9 | hover transition | `page.hover('[data-cmd="dog.checkIn"]')`. Then `getAnimations()` on the button includes CSSTransitions for `background-color` and the 4 border colours, each 200 ms, `cubic-bezier(0, 0, 0.2, 1)`, 2 keyframes. The end colour is `oklab(0.5147 0.1267 0.1005)` (from `rgb(194, 65, 12)`). The rebuild drops `box-shadow` from the list (jank lint 1), so do not assert it. | hover |
| E10 | status → enablement | For each status case, the enabled set matches the table in §1. | checked-in, walking, checked-out, default |

## 6. Motion

`screenshots/motion.json` has `animations: []` at rest. Every record sits under `interactionTriggered`, because it needs an interaction to start. `default` carries `_motion: { spec: "…/screenshots/motion.json" }`, which asserts **nothing animates at rest** (it would catch a stray spinner or entrance). The records below are asserted in specs (E9), not by `_motion`.

| trigger | target | properties | duration | easing | keyframes |
|---|---|---|---|---|---|
| hover Check in | `button.btn.btn-primary` | CSSTransition: background-color, border-top/right/bottom/left-color, box-shadow | 200 ms, delay 0 | `cubic-bezier(0,0,0.2,1)` | 2 |
| rejected write | `div.alert.alert-error.shadow-sm.max-w-xs` in `#toasts` (toast-stack's) | CSSAnimation `toast`: opacity 0→1, scale 0.9→1 | 250 ms, 1 iteration | `ease-out` (keyframe) | 2 |

- The `:active` press sets `translate: 0 .5px`, which is not transitioned (it snaps).
- The toast animation only runs under `prefers-reduced-motion: no-preference`.
- Filmstrips: `screenshots/filmstrip-hover.png` and `screenshots/filmstrip-toast.png`.

**Jank** (`screenshots/jank.md`): the failing write, accepted write and hover runs all measured 0 % dropped frames, a 16.8 ms max frame, no long animation frames and CLS 0. Lint findings and the rebuild fix for each:

1. `.btn` transitions `box-shadow`. Drop it from the transition list, or fade a pre-rendered `::after` shadow.
2. `transform` is transitioned but the press uses `translate`. Keep the instant press, or add `translate` deliberately.
3. The toast has no exit animation and is removed after `setTimeout(…, 3500)`. Toast-stack's rebuild keeps the 3.5 s dwell and exits with an opacity/scale transition. This is not this unit's code.
4. Every intent re-renders the whole view (`$app.innerHTML` + `lucide.createIcons()`). The rebuild updates island-local signals and patches only this card.

## 7. Responsive

Source media queries are Tailwind v4 defaults: `sm` is `width >= 40rem` (640px) and `lg` is `width >= 64rem` (1024px).

| viewport | list direction | button width | card slot |
|---|---|---|---|
| < 640 (375) | column | `w-full` | 351 |
| 640–1023 (640, 768) | row (`sm:flex-row`), `flex-wrap` | auto (`sm:w-auto`) | 616 / 720 |
| ≥ 1024 (1024, 1280) | column again (`lg:flex-col`) | auto, stretched by the column | 314.66 / 400 (right-hand column of the 3-col grid) |

The locked note adds 28px of height (269 → 297 at 1280, 125 → 153 at 640).

## 8. A11y

- The `<section>` is labelled by its heading: `aria-labelledby` → the `h2` "Actions". The heading icon is `aria-hidden="true"`.
- Four native `<button>`s in DOM order: Check in, Start walk, End walk, Check out. Tab order skips disabled ones. Every icon is `aria-hidden` and the text label is the accessible name.
- Use native `disabled`, not `aria-disabled`, to match the source.
- After an optimistic flip, keep focus on the clicked button, or move it to the newly primary button. The mock's full re-render loses focus, and the island must not.
- The rollback message is announced by toast-stack. Its region should be `role="status"` / `aria-live` — that is toast-stack's concern.
- Locked note: plain text. It is also the reason the buttons are disabled; consider `aria-describedby` from the list to the note.
- Reduced motion: the only motion is the 200 ms hover colour transition (fine), and the toast entrance is already gated on `no-preference`.

## 9. Used on

- `dog-detail` only (page-local): `pages/dog-detail/components/dog-actions`.

## 10. Isolate build plan

- **Lands at:** `fixtures/kennel-app/src/pages/dog-detail/components/dog-actions/` (`template.html`, `logic.ts`, `styles.css`, `isolate/`). **Selector:** `<dog-actions>`.
- **Preview routes:** `/components/dog-detail/dog-actions/<case>` (`category: "dog-detail"`, `folder: "dog-actions"`), e.g. `/components/dog-detail/dog-actions/default`.
- **Cases:** the 22 listed in §4. Each `_reference` still is named there.
- **Events → tests:**

  | spec file | Events |
  |---|---|
  | `cases/pending/tests/intent.spec.ts` | E1, E2, E3, E4 |
  | `cases/pending-640/tests/intent.spec.ts` | E2, plus an element screenshot vs `dog-actions-checked-in@640.png` |
  | `cases/pending-dark/tests/intent.spec.ts` | E2, plus a comparison vs `dog-actions-pending@1280-brand-dark.png` |
  | `cases/rolled-back/tests/rollback.spec.ts` | E1, E5, E6 |
  | `cases/rolled-back-640/tests/rollback.spec.ts` | E5 |
  | `cases/reconciled/tests/reconcile.spec.ts` | E1, E7 |
  | `cases/locked/tests/locked.spec.ts` | E8 |
  | `cases/hover/tests/hover.spec.ts` | E9 |
  | `cases/default`, `checked-in`, `walking`, `checked-out` → `tests/enablement.spec.ts` | E10 |

- **Loop:**
  1. Scaffold the folder and drop in `isolate/`.
  2. `sprig isolate test --root fixtures/kennel-app --json`. The `reference:` rows are the pixel diff, and `motion: dog-actions/default` must report no animations.
  3. Lift the Events into the specs above.
  4. Run, then iterate to green.
  5. Only then compose into `dog-detail` and wire the `dog` channel (→ dog-heading) and the `toasts` channel (→ toast-stack).
