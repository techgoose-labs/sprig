# dog-detail (page)

Screen 2 of the kennel mock, "Dog detail". Route `#/dog/:id` in the mock; in the
build it is the page `dog-detail`, resolved by `params.id`. Evidence region:
`main#app` at `#/dog/d01` (see `source.html`, `js/dog-detail.js`,
`css/dog-detail.*.css`, `screenshots/`).

**Purpose.** One dog's whole record on one screen: who the dog is, the stay and
what it costs, the four stay actions, and the handling notes. It is reached from
a dog card on the board and links back to it.

## 1. Classification & behavior

- **Bucket:** `page-composition` → `src/pages/dog-detail/`. **Tier:** `static`.
  The page has no `logic.ts` and holds no client state. Every interactive part is
  a child unit that owns its own tier:

  | region | unit | its tier |
  | --- | --- | --- |
  | name + status/overdue badges | `dog-heading` (page-local island) | pure-client, reads channel `dog` |
  | "The dog" card | `dog-profile-card` (page-local static) | static |
  | "The stay" card | `stay-card` (page-local static) | static |
  | "Actions" card | `dog-actions` (page-local island) | optimistic-write (`dog.checkIn`/`startWalk`/`endWalk`/`checkOut`) |
  | "Notes" card | `dog-notes` (page-local island) | optimistic-write (`dog.addNote`) |
  | toasts | `toast-stack` (shared island) | pure-client, owns channel `toasts` |

  The optimistic flows (snapshot → flip local state → fire the command in the
  background → roll back and toast on error) belong to `dog-actions` and
  `dog-notes` and are specified there. The page only composes. It never
  toasts, never calls `location.reload()`, and never re-resolves after a write.
- **Data source:** `resolve.ts` → Backend. It makes two reads:
  - `dogDetail` by `params.id` (pre-contract `GET /api/dogs/{id}`): the dog with
    all fields including `notes[]`, the owner's `name`/`phone`, and `stay` (or null).
  - `today` (`GET /api/days/today`): the page needs only `closed`.

  The page passes slices down as props: `dog` → heading/profile/stay/actions/notes,
  and `closed` → actions.
- **Not found:** when `dogDetail` has no dog for `params.id`, resolve calls
  `setResponseStatus(404)` and the page renders the not-found card instead of the
  grid. It shows "We can't find that dog", then "It may have been removed from
  today's board.", then the link "Back to the board". The mock does this at
  `renderDetail` `if (!d)` in `js/dog-detail.js`.
- **Liveness:** request-response. The mock pushes nothing. After a status write,
  the board's rollups go stale until the next read. This is data-model hazard 4
  and is accepted.
- **Channels (wiring, no stores), page-scoped to dog-detail:**
  - `dog`: `dog-actions` sets it and `dog-heading` reads it, so the heading badge
    follows the optimistic status.
  - `toasts`: `toast-stack` sets it; `dog-actions` and `dog-notes` edit it (push a
    toast). The page composes its **own** `toast-stack`. The mock's single global
    `#toasts` in `<body>` is not reused.
- **Data-shape hazards (from data-model.md):**
  - #1: the owner comes joined in the `dogDetail` DTO. The mock's
    `owner(d.owner)` scan over all owners must not survive.
  - #5: the stay is read as part of `dogDetail`, never by scanning stays.
  - #6: honest-empty cases are "No notes yet — add the first one below." (in
    dog-notes) and "No stay on file for this dog." (in stay-card).
  - Date display: the mock formats ISO-local strings as UTC `Mon D, h:mm AM`
    (`when()`). The build must keep that formatting, which is timezone-neutral,
    wherever the children render dates.
- **Mock-only states not carried over:** the loading skeleton comes from the
  mock's fake 450 ms latency, and `renderError` is its load-failure screen. Both
  are app-shell states. In the build, the page is server-resolved before first
  paint.

## 2. Anatomy

```
<main class="dog-detail">                          max-w-7xl mx-auto p-3 md:p-6
  <a class="dog-detail-back" href="/board">        daisyUI btn btn-ghost btn-sm mb-3 -ml-2 — lucide arrow-left (size 1.2em, aria-hidden) + "Board"
  <dog-heading [dog]>                               h1 name + status badge (+ overdue badge)   — mb-5 row
  <div class="dog-detail-grid">                    grid grid-cols-1 lg:grid-cols-3 gap-4
    <dog-profile-card [dog]>                        daisyUI card
    <stay-card [stay]>                              daisyUI card
    <dog-actions [dog] [closed]>                    daisyUI card
    <div class="dog-detail-notes-slot">             lg:col-span-3
      <dog-notes [dog]>                             daisyUI card
  <toast-stack>                                     fixed toast toast-end toast-bottom (empty at rest)
</main>

not-found branch (dog == null):
<main class="dog-detail">
  <section class="dog-detail-missing">            daisyUI card bg-base-100 border border-base-300 max-w-xl mx-auto mt-10
    <div>                                          daisyUI card-body items-center text-center
      lucide dog (size-10, text-base-content/40, aria-hidden)
      <h1> "We can't find that dog"                font-display text-3xl
      <p> "It may have been removed from today's board."   text-base-content/70
      <a href="/board"> "Back to the board"        daisyUI btn btn-sm
```

The page's own class names use the `dog-detail-` prefix. The daisyUI components
kept as-is are the daisyUI `btn` (the back link and the not-found link) and the
daisyUI `card` / `card-body` (the not-found card). Each child's internal markup
is specified in its own `.md`.

## 3. Props

The page's inputs are its resolved data, not hand-authored props.

| name | type | default | control widget | signal? |
| --- | --- | --- | --- | --- |
| `dog` | `DogDetail \| null` (dog fields + `owner {name, phone}` + `stay \| null` + `notes[]`) | — (from resolve) | none. It is an object with no fixture widget, so each case sets it | no |
| `closed` | boolean (`today.closed`) | `false` | `boolean` | no |

## 4. States → cases

Every case has `_tier: "static"` and an explicit `_theme`. The mock's default
theme is `brand`, and `brand-dark` comes from the suffixed still. `_reference`
paths are git-root-relative, under
`fixtures/kennel-app/spec/ui/breakdown/pages/dog-detail/screenshots/`. The
tolerance is left at the default 0.01.

| case | state | data | `_viewport` / `_theme` | `_reference` |
| --- | --- | --- | --- | --- |
| `default` | booked dog; Check in enabled; 3 notes (one long) | d01 Biscuit | 1280 / brand | `dog-detail@1280.png` (1280×808) |
| `bp-375` | 1 column, p-3, h1 36px, actions stacked full-width, note form stacked | d01 | 375 / brand | `dog-detail@375.png` (375×1468) |
| `bp-640` | 1 column, actions in a row (`sm:flex-row`) | d01 | 640 / brand | `dog-detail@640.png` (640×1261) |
| `bp-768` | 1 column, p-6, h1 48px, note form in a row (`md:flex-row`) | d01 | 768 / brand | `dog-detail@768.png` (768×1202) |
| `bp-1024` | 3 columns (lg), actions stacked (`lg:flex-col`), notes span 3 | d01 | 1024 / brand | `dog-detail@1024.png` (1024×808) |
| `dark` | as default, dark theme | d01 | 1280 / brand-dark | `dog-detail@1280-brand-dark.png` |
| `overdue` | checked-in + "Overdue · 2h 15m" badge; Start walk + Check out (primary) enabled; notes empty | d14 Rocco | 1280 / brand | `dog-detail-overdue@1280.png` (1280×635) |
| `long-name` | 40-char name wraps over 2 lines; walking; End walk enabled; 1 note | d03 Sir Reginald Barksworth-Fluffington III | 375 / brand | `dog-detail-long-name@375.png` (375×1306) |
| `not-found` | unknown id → not-found card (404) | `dog: null` | 1280 / brand | `dog-detail-not-found@1280.png` (1280×288) |
| `day-closed` | `today.closed` → every action disabled + "The day is closed — stays are locked." | d01, `closed: true` | 1280 / brand | none (no page still; verified by spec, see §10) |

The real values in the cases come from the stills and the capture return:

- **d01 Biscuit:**
  - Golden Retriever, K01, arrival 07:00; owner Priya Raman, (555) 0100-4000.
  - Stay: Sep 29, 7:00 AM → Sep 30, 11:00 AM; $45.00 × 1 night = $45.00.
  - Notes: "Allergic to chicken — kibble from home only." (Front desk · Sep 27,
    2:05 PM), "Pulls hard on the lead near the gate; use the harness." (Walker:
    Dana · Sep 28, 9:40 AM), and the long "Owner called: …" note (Front desk ·
    Sep 29, 8:12 AM).
- **d14 Rocco:**
  - French Bulldog, K14, 10:15; Oliver Brandt, (555) 0113-4481.
  - Stay: Sep 28, 10:15 AM → Sep 30, 11:00 AM; $55.00, 2 nights, total $110.00
    (read off the still).
  - No notes.
- **d03 Sir Reginald Barksworth-Fluffington III:**
  - Cavalier King Charles Spaniel, K03, 09:30; Hannah Lindqvist, (555) 0102-4074.
  - Stay: Sep 27, 9:30 AM → Sep 30, 11:00 AM; $65.00, 3 nights, total $195.00
    (read off the still).
  - Note: "Needs eye drops at 8am and 8pm." (Vet tech · Sep 28, 8:00 AM).

**Stills that are NOT cases (context only):** the six
`dog-detail-page@{375,640,768,1024,1280,1280-brand-dark}.png` files. They are
viewport and full-page shots that include the app-shell navbar, which is outside
`main#app`, so they cannot be diffed against the page unit. Use them only to
check the composition inside the shell during `sprig dev`.

The optimistic `pending` / `rolled-back` cases belong to `dog-actions` and
`dog-notes` (their own `isolate/`), not to this page.

## 5. Events

The page emits no events of its own. It has one navigation and one composition
wiring, and each is a predicate the build lifts into
`cases/<case>/tests/*.spec.ts`:

- Back link (`default`): `ev.expect(e => e.source === "a" && e.type === "click" && /Board/.test(e.detail ?? ""))`.
  Observable effect: `expect(page.locator("a.dog-detail-back")).toHaveAttribute("href", "/board")`.
- Not-found link (`not-found`): `ev.expect(e => e.source === "a" && e.type === "click" && /Back to the board/.test(e.detail ?? ""))`.
  Also check `h1` has the text "We can't find that dog" and `a[href="/board"]` exists.
- Channel `dog` wiring (`default`): `page.route("**/api/dog/check-in", r => r.fulfill({ status: 200, json: { id: "d01", status: "checked-in" } }))`.
  Then click `button` "Check in", then `ev.expect(e => e.source === "button" && e.type === "click")`.
  Then `expect(page.locator("dog-heading")).toContainText("Checked in")`: the
  heading follows the optimistic status through the page-scoped channel.
- Channel `toasts` wiring (`default`): `page.route("**/api/dog/check-in", r => r.fulfill({ status: 500 }))`.
  Then click "Check in", then
  `expect(page.locator("toast-stack .alert-error")).toContainText("Biscuit: checked in didn't go through — reverted.")`.
  The heading returns to "Booked".
- Day closed (`day-closed`): the four `dog-actions` buttons are all
  `toBeDisabled()`, and the page contains the text "The day is closed — stays
  are locked.".

## 6. Motion

No entrance or infinite animation: `document.getAnimations()` is `[]` at settle.
The only motion comes from hovering daisyUI `.btn` (`screenshots/motion.json`,
`screenshots/filmstrip.png` = Check-in button hover):

- **Back link `a.btn.btn-ghost`, on hover.** CSSTransitions on
  `background-color` (transparent → `oklab(0.874 0.003 0.020)`),
  `border-{top,right,bottom,left}-color` (transparent → `oklab(0.831 0.003 0.019)`)
  and `box-shadow`. 200 ms, `cubic-bezier(0, 0, 0.2, 1)`, delay 0, 2 keyframes each.
- **`button.btn.btn-primary` (Check in), on hover.** The same property set and
  timing. The background goes `rgb(194,65,12)` → `oklab(0.515 0.127 0.100)`, and
  the border goes `oklab(0.526 0.129 0.103)` → `oklab(0.489 0.120 0.095)`.
- `.animate-rise` / `@keyframes brand-rise` are defined in the CSS but never
  applied on this page. Do not carry them over.

**Jank** (from `screenshots/jank.md`):

- Cold load: 0% dropped frames, max frame 16.8 ms, 1 long frame of 77.8 ms (the
  initial render), CLS 0.0001.
- Lint: daisyUI `.btn` animates `box-shadow`. **Rebuild fix:** keep the colour
  transitions, and either drop `box-shadow` from the transition list or move the
  shadow to a pseudo-element that fades by `opacity`.

**No `_motion` case.** Every captured animation needs a hover to start, which
`isolate-format.md` puts out of scope for `_motion`. The page's `motion.json` is
also grouped by trigger (`animations[].animations[]`), and the runner would read
it as 2 records with duration 0 and 0 keyframes against 0 rendered animations,
which is a guaranteed red row. Assert the hover transition in a spec on `default`
instead:
`expect(await page.locator("a.dog-detail-back").evaluate(el => getComputedStyle(el).transitionDuration)).toContain("0.2s")`.

## 7. Responsive

The source has no custom `@media`; it uses Tailwind defaults only: `sm` 640,
`md` 768, `lg` 1024.

| width | behavior |
| --- | --- |
| < 640 | `p-3`; h1 `text-4xl`; grid 1 column; actions `flex-col`, buttons `w-full`; note form stacked |
| ≥ 640 (sm) | actions `flex-row`, buttons `w-auto` |
| ≥ 768 (md) | `p-6`; h1 `text-5xl` (48px); note form `flex-row` (author `w-48`, text `flex-1`) |
| ≥ 1024 (lg) | grid `lg:grid-cols-3` (400px × 3 at 1280); actions back to `flex-col`; notes card `lg:col-span-3` |
| ≥ 1280 | `max-w-7xl` caps the content at 1280 and centres it |

Long names wrap (`break-words min-w-0`, see the `long-name` case). The badges
stay `whitespace-nowrap`.

## 8. A11y

- **Landmarks and headings:** one `main`. `h1` is the dog's name (or "We can't
  find that dog"). Each card has an `h2` ("The dog", "The stay", "Actions",
  "Notes"). All lucide icons are `aria-hidden`.
- **Back link:** a real `<a href>` with the visible text "Board". The icon is
  decorative.
- **Focus order** follows the DOM: back link → action buttons (disabled ones
  are skipped) → note author → note text → Add note. There is no focus trap.
- **Forms:** the note inputs carry `aria-label` "Author" / "Note" and are
  `required` (in dog-notes).
- **Toasts:** the mock's `#toasts` has no live region. `toast-stack` should
  expose `role="status"` / `aria-live="polite"` (errors: `role="alert"`). The
  page only mounts it.
- **Not-found:** the heading and the link are keyboard-reachable. The 404
  status is set server-side.
- **Reduced motion:** the only motion is the 200 ms button hover colour
  transitions. Honour `prefers-reduced-motion` by dropping them (no layout is
  affected).

## 9. Used on

`dog-detail` only (scope: page). It is reached from the board's dog cards.

## 10. Isolate build plan

- **Lands in:** `<app>/src/pages/dog-detail/` (`<app>` = `fixtures/kennel-app`).
  Selector `dog-detail`. Files: `template.html`, `styles.css`, `resolve.ts`
  (`dogDetail` by `params.id` + `today.closed`; `setResponseStatus(404)` when
  there is no dog). There is no `logic.ts`.
- **Children, built and green first:**
  - page-local, each under `pages/dog-detail/components/<name>`: `dog-heading`,
    `dog-profile-card`, `stay-card`, `dog-actions`, `dog-notes`.
  - shared: `shared-components/toast-stack`.
- **Preview routes:** `/pages/dog-detail/page/<case>`, from `fixture.json`
  (`category: dog-detail`, `folder: page`).

| case | route | shows | `_reference` | tests to lift from §5 |
| --- | --- | --- | --- | --- |
| default | `/pages/dog-detail/page/default` | d01 booked at 1280 | `dog-detail@1280.png` | `tests/back-link.spec.ts`, `tests/dog-channel.spec.ts`, `tests/toasts-channel.spec.ts`, `tests/hover-transition.spec.ts` |
| bp-375 | `…/bp-375` | 1 col mobile | `dog-detail@375.png` | reference only |
| bp-640 | `…/bp-640` | actions row | `dog-detail@640.png` | reference only |
| bp-768 | `…/bp-768` | md layout | `dog-detail@768.png` | reference only |
| bp-1024 | `…/bp-1024` | 3 cols | `dog-detail@1024.png` | reference only |
| dark | `…/dark` | brand-dark | `dog-detail@1280-brand-dark.png` | reference only |
| overdue | `…/overdue` | d14 overdue, no notes | `dog-detail-overdue@1280.png` | reference only |
| long-name | `…/long-name` | d03 wrapping name | `dog-detail-long-name@375.png` | reference only |
| not-found | `…/not-found` | 404 card | `dog-detail-not-found@1280.png` | `tests/not-found.spec.ts` |
| day-closed | `…/day-closed` | actions locked | — | `tests/day-closed.spec.ts` (**required**: without it the case is "skipped — no tests, no _reference") |

- **Loop:**
  1. Scaffold the folder and copy `isolate/` in.
  2. Run `sprig isolate test --root fixtures/kennel-app --json`. The
     `reference:` rows are the pixel diff.
  3. Lift the §5 predicates into the tests above (plain `@playwright/test` +
     `waitHydrated`, with `ISOLATE_BASE_URL`).
  4. Run, and iterate until every row is green.
  5. Only then compose the page into routes.
- **Hydration:** gate the channel tests on `waitHydrated(page)`, because
  `dog-actions` and `dog-heading` are islands.

## Gaps (described, not extracted — verify during build)

- **Case data values:** the ISO timestamps (`stay.checkIn`, `plannedCheckOut`,
  `notes[].at`) carry the year 2026. The year is not in any evidence and the
  display is year-free (`Sep 29, 7:00 AM`), so the rendering is unaffected.
  The non-visible ids (note `id`, owner `id`, stay `id`) are omitted from the
  cases rather than invented. Add them if the templates key on them.
- **How a page case feeds resolve data:** the cases pass the resolved slices as
  bare props (`dog`, `closed`). Whether the isolate stage bypasses `resolve.ts`
  with these props, or needs a `_network` fake of `GET /api/dogs/{id}`, is not
  covered by `isolate-format.md`. Confirm during build.
- **The `dog` prop has no fixture control:** no control type fits an object.
- **Toast text:** the `toasts` wiring text comes from the mock's `runStatus`:
  `` `${d.name}: ${label.toLowerCase()} didn't go through — reverted.` ``. The
  exact copy is owned by `dog-actions`.
