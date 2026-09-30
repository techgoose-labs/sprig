# board (page)

Screen 1 of the kennel mock: **"Today's dogs"**. This is the default route (nav label "Board"; the mock hash is `#/board`). Region: `main#app` at `#/board`.

**Purpose.** At a glance the front desk sees every dog booked today, how many are in each status, and which dogs are overdue. From here they narrow the list by status or open a dog.

## 1. Classification & behavior

- **Bucket:** `page-composition` → `src/pages/board/` (a `template.html` + `resolve.ts` + `styles.css`, with **no `logic.ts`**).
- **Interaction tier:** `static` for the whole page. It makes no server writes and owns no client state.

| interaction | tier | how the build does it |
| --- | --- | --- |
| Filter by status (strip card or tab) | static | A **link** to `?status=<s>`. `resolve.ts` reads `url.searchParams.get("status")` and the server renders the filtered list. The mock's in-memory `Array.filter` plus `innerHTML` re-render goes away (data-model hazard 3). Clicking the *active* strip card links back to `?status=all` (mock: `ui.filter === f && f !== "all" ? "all" : f`). |
| Open a dog | static | `dog-card` is a plain link to the dog-detail route (`#/dog/<id>` in the mock). |
| Retry after a failed load | static | `load-error`'s Retry is a link that re-requests the current URL. |

- **Data source:** `resolve.ts` calls the Backend with two queries, `today` and `dogList`.
  - `today` → `GET /api/days/today`. The board uses only `date`, `closed` and `byStatus`.
  - `dogList` → `GET /api/dogs?status=<s>`. The board uses `id, name, breed, kennel, status, arrival, overdue, overdueBy, ownerName`.
  - These paths are the pre-contract proposals from `data-model.md`. There is no contract yet.
- **Liveness:** request-response. Nothing is pushed. After a status write on dog-detail, the strip counts stay stale until the next load (hazard 4).
- **Page states** (the resolve outcome, shown in the isolate cases as the `loadState` prop):
  - `ready` renders the heading, `status-strip`, `status-filter-tabs` and `dog-grid`.
  - `loading` renders the **board-owned skeleton** (below).
  - `error` renders **only** the shared `load-error` inside `main`: no heading and no strip.
- **Data-shape hazards:**
  1. **Owner name comes in the DTO.** Use `dogList[].ownerName`. Never load all owners and join on the client.
  2. **Strip counts come from `today.byStatus`**, never from counting `dogList`.
  3. **"No dogs today" vs "none for this filter".** The mock tells these apart with `dog.length === 0` over the *unfiltered* list. With a server-side filter, `dogList` holds only the filtered rows, so the page cannot make that call from it.
     - The mock's own empty seed keeps `byStatus` at 7/14/5/6 but still renders "—" because the list is empty.
     - The build needs one server signal for "no dogs today", such as a `dogsToday` count on `today`. The page should not sum `byStatus` itself.
     - **Decide at contract time.** Until then the isolate cases pass `status: "all"` with an empty `dogList` for the empty state.
  4. **The day label is formatted, not raw.** `today.date` `2026-09-29` renders as "Tuesday, September 29" (`toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" })` on `date + "T12:00Z"`).

## 2. Anatomy

```
main.board-main                       max-w-7xl mx-auto p-3 md:p-6
├─ [ready]
│  ├─ div.board-head                  flex flex-wrap items-end justify-between gap-2 mb-4
│  │  ├─ div
│  │  │  ├─ h1.font-display.text-4xl  "Today's dogs"
│  │  │  └─ p.text-base-content/70    "Tuesday, September 29"   (formatted today.date)
│  │  └─ <icon-badge icon="lock" tone="neutral"> "Day closed"   (shared; badge badge-neutral + lock; only when today.closed)
│  ├─ <status-strip>                  (page-local; byStatus + current status + empty flag)
│  ├─ <status-filter-tabs>            (page-local; current status)
│  └─ <dog-grid>                      (page-local; dogList + current status; composes <dog-card>)
├─ [loading]  div.board-loading       (aria-busy)
│  ├─ div.board-skel-strip            grid grid-cols-2 md:grid-cols-4 gap-3 mb-6
│  │  └─ 4 × daisyUI `skeleton` h-20 rounded-box
│  ├─ div.board-loading-note          flex items-center gap-2 mb-4 text-base-content/70
│  │  └─ daisyUI `loading loading-spinner loading-sm` + "Loading today's dogs…"
│  └─ div.board-skel-grid             grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4
│     └─ 8 × <skeleton-card>   (shared: card > card-body with 4 skeleton bars — compose, never re-create)
└─ [error]    <load-error>            (shared; "Couldn't load today's board", Retry)
```

- **Page-owned class names** are prefixed `board-`: `board-main`, `board-head`, `board-loading`, `board-skel-strip`, `board-loading-note`, `board-skel-grid`.
- **daisyUI components kept as-is:** `skeleton` (strip tiles) and `loading loading-spinner`. The "Day closed" badge composes the shared `<icon-badge icon="lock" tone="neutral">`; the skeleton cards compose the shared `<skeleton-card>`.
- **Icons are inline SVG** rendered on the server. The mock's `lucide.createIcons()` swap is a CLS source.
- **Source markup:**
  - Live DOM: `source.html`
  - Empty, loading and error DOM: `source-states.html`
  - Extracted CSS: `css/board.css`, `css/board-states.css` (the latter holds `@keyframes skeleton`)

## 3. Props

The page's inputs come from `resolve.ts`. In isolation they are passed as case props.

| name | type | default | control widget | signal? |
| --- | --- | --- | --- | --- |
| `loadState` | `"ready" \| "loading" \| "error"` | `"ready"` | select | no |
| `status` | `"all" \| "booked" \| "checked-in" \| "walking" \| "checked-out"` (the `?status=` param) | `"all"` | select | no |
| `today` | `{ id, date, closed, byStatus: { booked, checked-in, walking, checked-out } }` | — | none: case data only (no object widget exists) | no |
| `dogList` | `Array<{ id, name, breed, kennel, ownerName, status, arrival, overdue, overdueBy? }>` | `[]` | none: case data only | no |

## 4. States → cases

- Every case is `_tier: "static"`.
- `_reference` paths are git-root-relative: `fixtures/kennel-app/spec/ui/breakdown/pages/board/screenshots/<file>`.
- Tolerance is the default `0.01`.
- `_theme` is `brand` (the `Default theme:` line in `design-tokens.md`) unless the still's file name says `brand-dark`.

| case | state | data | `_viewport` | `_theme` | `_reference` |
| --- | --- | --- | --- | --- | --- |
| `default` | live board, filter All | 32 dogs d01–d32; strip 7 / 14 / 5 / 6; "Tuesday, September 29"; not closed | 1280 | brand | `board@1280.png` |
| `at-375` | live board, 1-col grid, 2-col strip, `p-3` | same | 375 | brand | `board@375.png` |
| `at-640` | live board, 2-col grid | same | 640 | brand | `board@640.png` |
| `at-768` | live board, 4-col strip, `md:p-6` | same | 768 | brand | `board@768.png` |
| `at-1024` | live board, 3-col grid | same | 1024 | brand | `board@1024.png` |
| `dark` | live board in dark theme | same | 1280 | brand-dark | `board@1280-brand-dark.png` |
| `walking` | filtered `?status=walking`; Walking strip card `border-primary`, Walking tab active | 5 dogs: d03 Sir Reginald Barksworth-Fluffington III, d07 Luna, d11 Nala, d15 Pickles, d19 Tofu | 1280 | brand | `board-walking@1280.png` |
| `empty` | no dogs today: strip "—" ×4, "No dogs booked today" | `dogList: []`, `today` as captured | 1280 | brand | `board-empty@1280.png` |
| `empty-375` | same, mobile | same | 375 | brand | `board-empty@375.png` |
| `empty-dark` | same, dark | same | 1280 | brand-dark | `board-empty@1280-brand-dark.png` |
| `loading` | skeleton (4 strip + 8 card), "Loading today's dogs…" | `loadState: "loading"`; also `_motion` (see below) | 1280 | brand | `board-loading@1280.png` |
| `loading-375` | skeleton, mobile | `loadState: "loading"` | 375 | brand | `board-loading@375.png` |
| `error` | `load-error` alert only | `loadState: "error"` | 1280 | brand | `board-error@1280.png` |
| `error-375` | same, mobile | `loadState: "error"` | 375 | brand | `board-error@375.png` |
| `day-closed` | "Day closed" `badge-neutral` beside the heading | live data with `today.closed: true` | 1280 | brand | — (no still: described, not extracted) |

- **Real values in the live cases.** Examples:
  - d01 Biscuit · K01 · Golden Retriever · Priya Raman · booked · 07:00.
  - Overdue: d14 Rocco (Oliver Brandt, checked-in, 10:15, "2h 15m") and d18 Olive (Elena Popescu, checked-in, 09:15, "45m"), both drawn with `border-error`.
  - Kennels jump from K21 (d21) to K26 (d22), exactly as captured.
- **The `loading` skeleton is frozen at `currentTime 0`** in its still.
- **`error` in the mock** is the entire `main#app` contents. The page renders nothing but `load-error`.

## 5. Events

The page emits no custom events; every interaction is a link. Each sketch below uses `capture(page)` installed before `goto`, plus the observable effect. The preview route is `/pages/kennel/board/<case>`.

- **Strip card filters.**
  - `ev.expect(e => e.type === "click" && e.source === "a" && /Walking/.test(e.detail ?? ""))`
  - Effect: `expect(page.locator('status-strip a[href*="status=walking"]')).toHaveCount(1)`
- **Active strip card links back to All.** In the `walking` case: `expect(page.locator('status-strip a[href*="status=all"]')).toHaveCount(1)`. That link is the Walking card, drawn with `border-primary`.
- **Tabs filter.** Each tab links to `?status=<s>`, and exactly one tab is active.
  - `default`: `expect(page.locator('status-filter-tabs [aria-selected="true"], status-filter-tabs .tab-active')).toHaveText("All")`
  - `walking`: the same locator has text `"Walking"`.
- **Dog card opens detail.**
  - `ev.expect(e => e.type === "click" && e.source === "a")`
  - Effect: `expect(page.locator('dog-card a').first()).toHaveAttribute("href", /\/dog\/d01$/)`
- **Retry re-requests the page.** In the `error` case: `expect(page.getByRole("link", { name: "Retry" })).toHaveAttribute("href", /.+/)`.
- **Content assertions** (the build lifts these into tests):
  - `default`:
    - `page.getByRole("heading", { level: 1 })` has text "Today's dogs".
    - The date text is "Tuesday, September 29".
    - 32 `dog-card` elements.
    - No "Day closed".
  - `day-closed`: `page.getByText("Day closed")` is visible.
  - `empty`: "No dogs booked today" is visible and the strip shows "—" four times.
  - `loading`: "Loading today's dogs…" is visible, with 4 + 8 skeleton groups.
  - `error`: "Couldn't load today's board" is visible and there is no h1 "Today's dogs".

## 6. Motion

Captured raw in `screenshots/motion.json`. The isolate slice is in `screenshots/motion-loading.json` (see GAPS).

1. **Loading skeleton.**
   - **Trigger:** the `loading` state.
   - **Animations:** 36 × `CSSAnimation "skeleton"` on `div.skeleton`: 4 strip blocks (`h-20 rounded-box`) plus 8 cards × 4 bars.
   - **Keyframes:** 2. `background-position-x 150% → -50%`, y fixed at 50%, keyframe easing `ease-in-out`.
   - **Timing:** duration **1800ms**, delay 0, iterations Infinity, fill none.
   - **Filmstrip:** `screenshots/filmstrip.png` shows the first skeleton card at 0 / 20 / 40 / 60 / 80 / 100%.
   - **Spinner:** the daisyUI `loading-spinner` rotates by SMIL inside a mask SVG. `getAnimations()` cannot see it and it was not scrubbed.
   - **Jank:** animating `background-position` is non-composited and repaints 36 elements every frame, forever. Dropped frames were 0.5% in this state.
   - **Rebuild fix:** move the gradient to `::after` and animate `transform: translateX()`, or render a static skeleton. Keep the name `skeleton`, 1800ms and 2 keyframes so `_motion` still pairs.
   - **Reduced motion:** stop the shimmer.
2. **Loading → live swap.** No animation; the swap is instant. The skeleton grid mirrors the live grid, so CLS stays around 0.
3. **Card hover.** `box-shadow` 150ms `cubic-bezier(0.4,0,0.2,1)`. This belongs to `dog-card`; see that spec and `screenshots/filmstrip-card-hover.png`.
4. **Prototype-only jank, to delete.**
   - The 556ms first frame waits on CDN CSS and JS.
   - `setTimeout(450)` is fake latency.
   - Every filter click re-renders all of `#app.innerHTML` and runs `lucide.createIcons()`. Server rendering replaces this.
   - The nav icon swap and font loading cause minor CLS. Fix it with inline SVG and a font preload.

## 7. Responsive

The mock uses only Tailwind v4 default breakpoints: sm 640, md 768, lg 1024, xl 1280.

| viewport | main padding | strip | dog grid | notes |
| --- | --- | --- | --- | --- |
| 375 | `p-3` | 2 columns | 1 column | the tablist overflows below about 393px (`overflow-x-auto flex-nowrap`, scrolls sideways) |
| 640 | `p-3` | 2 columns | 2 columns | |
| 768 | `p-6` | 4 columns | 2 columns | |
| 1024 | `p-6` | 4 columns | 3 columns | |
| 1280 | `p-6` | 4 columns | 4 columns | content capped at `max-w-7xl` (80rem), centred |

- The heading row wraps (`flex-wrap`), so the "Day closed" badge drops below the title on narrow screens.
- The loading skeleton uses the same grids: strip 2 → md 4, cards 1 → sm 2 → lg 3 → xl 4.

## 8. A11y

- **Headings:** one `h1` "Today's dogs". Dog names are `h2` inside the cards.
- **Filters:**
  - Strip cards and tabs are **links**, not the mock's `<button>`s, because they navigate.
  - Give the tabs group `role="tablist"` and mark the current link `aria-current="page"` or `aria-selected="true"`.
  - Name each strip link after its status and count ("Walking, 5 dogs").
- **Loading:**
  - The loading wrapper gets `aria-busy="true"`.
  - The "Loading today's dogs…" line gets `role="status"`.
  - Skeleton blocks are `aria-hidden="true"`.
- **Error:** `load-error` carries `role="alert"`.
- **Focus order:** strip (4 links) → tabs (5) → dog cards, in DOM order. There is no focus trapping.
- **Reduced motion:** `@media (prefers-reduced-motion: reduce)` stops the skeleton shimmer and the spinner.
- **Icons:** decorative, so `aria-hidden="true"`.

## 9. Used on

- `board`, and only there. This is the page itself.
- **Shared children it composes:** `load-error`, plus `status-badge` and `overdue-badge` indirectly through its children.
- **Page-local children:** `status-strip`, `status-filter-tabs`, `dog-grid` (→ `dog-card`).
- **Channels:** none. The page-scoped channels `dog`, `day` and `toasts` belong to dog-detail and day-summary. Board composes no `toast-stack`.

## 10. Isolate build plan

- **Lands at:** `fixtures/kennel-app/src/pages/board/` (`template.html`, `resolve.ts`, `styles.css`, `isolate/`). The selector is `board`.
- **Preview routes:** `/pages/kennel/board/<case>`, from `fixture.json` `category: "kennel"`, `folder: "board"`.
- **Checked with `sprig isolate list`:** 15 cases, no config problems. I ran it against a temporary copy under `src/pages/board` and deleted the copy afterwards.

| case | one-line state | `_reference` | tests from Events |
| --- | --- | --- | --- |
| default | live, 32 dogs, All | board@1280.png | `tests/content.spec.ts` (h1, date, 32 cards, no "Day closed"); `tests/links.spec.ts` (strip hrefs, tab active "All", card href d01) |
| at-375 / at-640 / at-768 / at-1024 | live at each breakpoint | board@375/640/768/1024.png | reference only |
| dark | live, brand-dark | board@1280-brand-dark.png | reference only |
| walking | `?status=walking`, 5 dogs | board-walking@1280.png | `tests/filter.spec.ts` (Walking tab active, active strip card → `status=all`, 5 cards) |
| empty / empty-375 / empty-dark | no dogs today | board-empty@1280/375/1280-brand-dark.png | `tests/empty.spec.ts` on `empty` ("No dogs booked today", "—" ×4) |
| loading / loading-375 | skeleton | board-loading@1280/375.png (+ `_motion` motion-loading.json on `loading`) | `tests/loading.spec.ts` (status text, aria-busy, 36 skeleton blocks) |
| error / error-375 | load-error | board-error@1280/375.png | `tests/error.spec.ts` (alert text, Retry link, no h1) |
| day-closed | "Day closed" badge | — | `tests/closed.spec.ts` ("Day closed" visible). **Required**: this case has no still. |

**Loop:**

1. Scaffold `src/pages/board`, with its children built and green first.
2. Drop in `isolate/`.
3. Run `sprig isolate test --root fixtures/kennel-app --json`. The `_reference` rows are the pixel diff; the `motion:` row is on `loading`.
4. Lift the Events into `cases/<case>/tests/*.spec.ts`.
5. Re-run and iterate until green.
6. Only then wire the route and `resolve.ts` (today + dogList with `?status=`) into the app.

**Build notes:**

- **The page must render from props when given them**, so the isolate cases work without a backend. `resolve.ts` produces `{ loadState, status, today, dogList }` in production.
- **Theme drift:** the scaffold's `css-variables.json` defaults to `brand-dark`, but the mock defaults to `brand`. Every case pins `_theme` explicitly, so the diff is unaffected.
