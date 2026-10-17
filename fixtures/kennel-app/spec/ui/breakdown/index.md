# Kennel breakdown: index

Source: `spec/ui/kennel-prototype/` (two-seam prototype: `_test-prototype.html` +
`objects/{dog,owner,stay,day}.json` + `commands.json`). Rebuild target: sprig
(Deno SSR, folder components, selective island hydration, Tailwind v4 + daisyUI
components). There is no ratified contract (no `spec/contract/openapi.json`, no
`spec/runes/`), so the data seam is the pre-contract [`data-model.md`](data-model.md).
Tokens: [`design-tokens.md`](design-tokens.md) (default theme `brand`, plus
`brand-dark`). Machine inventory: [`inventory.json`](inventory.json), 25 units.

## Page inventory

| page | mock route | purpose | composes |
|---|---|---|---|
| [board](pages/board/board.md) | `#/board` (default) | "Today's dogs": every dog booked today, counted by status, filterable by status (query param `?status=`) | top-bar (main-nav, theme-toggle), status-strip, status-filter-tabs, dog-grid → dog-card (status-badge, overdue-badge), load-error, skeleton-card; owns the header row, the "Day closed" badge and the loading skeleton strip |
| [dog-detail](pages/dog-detail/dog-detail.md) | `#/dog/<id>` | one dog's profile, stay and today's actions: move it through booked → checked-in ⇄ walking → checked-out, and add notes | top-bar, dog-heading (status-badge, overdue-badge), dog-profile-card, stay-card, dog-actions, dog-notes, toast-stack, load-error; owns the back link and the 404 not-found card |
| [day-summary](pages/day-summary/day-summary.md) | `#/summary` | the day's occupancy, revenue and overdue pickups; close the day (locks the ledger) | top-bar, close-day-control, day-closed-alert, day-stats, status-breakdown (status-badge), overdue-pickups (overdue-badge), toast-stack, load-error, skeleton-card; owns the header row |

## Shared-component usage matrix

From `inventory.json` `usedOn`.

| component | board | dog-detail | day-summary |
|---|:-:|:-:|:-:|
| [top-bar](shared-components/top-bar/top-bar.md) | x | x | x |
| [main-nav](shared-components/main-nav/main-nav.md) | x | x | x |
| [theme-toggle](shared-components/theme-toggle/theme-toggle.md) | x | x | x |
| [toast-stack](shared-components/toast-stack/toast-stack.md) |  | x | x |
| [status-badge](shared-components/status-badge/status-badge.md) | x | x | x |
| [overdue-badge](shared-components/overdue-badge/overdue-badge.md) | x | x | x |
| [load-error](shared-components/load-error/load-error.md) | x | x | x |
| [skeleton-card](shared-components/skeleton-card/skeleton-card.md) | x |  | x |

Page-local units (used on one page only): board → status-strip,
status-filter-tabs, dog-grid, dog-card; dog-detail → dog-heading,
dog-profile-card, stay-card, dog-actions, dog-notes; day-summary →
close-day-control, day-closed-alert, day-stats, status-breakdown,
overdue-pickups.

## Interaction / tier summary

| tier | units | why |
|---|---|---|
| static (no `logic.ts`) | top-bar, status-badge, overdue-badge, load-error, skeleton-card, status-strip, status-filter-tabs, dog-grid, dog-card, dog-profile-card, stay-card, status-breakdown, overdue-pickups; pages board, dog-detail, day-summary | server-rendered from `resolve.ts`/`Backend`. The filter tabs and strip cards are plain links to `?status=<s>`: the filter is a **query**, not client logic. load-error's Retry is a link reload |
| pure-client | main-nav, theme-toggle, toast-stack, dog-heading, day-closed-alert, day-stats | main-nav: the active state follows soft-nav in the persistent shell. theme-toggle: flips `html[data-theme]`. toast-stack: a 3500 ms auto-dismiss queue. dog-heading / day-closed-alert / day-stats: islands only so they can `reads:` a page channel and re-render after a write |
| optimistic-write | dog-actions (`dog.checkIn`/`startWalk`/`endWalk`/`checkOut`), dog-notes (`dog.addNote`) | `commands.json` `feedback: instant`: render the intent, call, reconcile on the reply, roll back + toast on failure. Both carry `pending` + `rolled-back` cases |
| confirmed-write | close-day-control (`day.close`) | `commands.json` `feedback: confirmed`: the button goes pending, the reply decides (REQ-064) — proven by a `pending` case, nothing to roll back |
| realtime | none | nothing in the mock is pushed |

**close-day-control** sends `day.close` with `feedback: confirmed`. **waits: day.close**: the lock and the final revenue are decided server-side, and the close can be refused. The build marks that await `// sprig-wait:`. It is recorded as `confirmed-write` (REQ-064).

**Liveness:** every data region is request-response. Honest-empty states:
- board "No dogs booked today" (strip "—"×4).
- board filtered-empty: "No dogs are <status> right now".
- dog-notes "No notes yet".
- stay-card "No stay on file".
- overdue-pickups "No overdue pickups — every owner is on time".
- dog-detail not-found (404).

**Data-shape hazards** (full list in data-model.md):
- The owner join belongs in the query DTOs. Never load all owners and join on the client.
- The global aggregates (`byStatus`, occupancy, revenue, `overdueCount`) come from the `today` query and are never tallied from `dogList`.
- The client-side filters become the query params `?status=` and `?overdue=true`.
- `dog.checkOut` rolls the stay total into revenue. The strip counts are stale until the next `today` read.
- "No dogs today" and "none for this filter" can't be told apart from `dogList` alone. That needs a server field such as `today.dogsToday`.

## Channel map

These are wiring channels, not stores. No `state/*.ts` module and no exported signal.

| channel | sets | edits | reads | scope |
|---|---|---|---|---|
| `dog` | dog-actions | — | dog-heading | page (dog-detail) |
| `day` | close-day-control | — | day-closed-alert, day-stats | page (day-summary) |
| `toasts` | toast-stack | dog-actions, dog-notes (dog-detail); close-day-control (day-summary) | toast-stack | page: each page composes its own toast-stack |

## Build order

1. **Tokens:** design-tokens.md → the `:global(...)` `@theme` block with brand + brand-dark. Fix the scaffold drift: the default theme must be `brand`, not `brand-dark`.
2. **Shared primitives:** status-badge, overdue-badge, load-error, skeleton-card, theme-toggle, toast-stack.
3. **Shared composites:** main-nav, then top-bar (composes main-nav and theme-toggle).
4. **Page-local:**
   - board: dog-card → dog-grid, status-strip, status-filter-tabs.
   - dog-detail: dog-heading, dog-profile-card, stay-card, dog-actions, dog-notes.
   - day-summary: close-day-control, day-closed-alert, day-stats, status-breakdown, overdue-pickups.
5. **Page compositions:** board, dog-detail, day-summary (with `resolve.ts` per page, and the channels above wired in each page template).

## Completeness audit

**Top-level DOM regions → owner:**
- `header.navbar` → top-bar. It holds main-nav and theme-toggle. The flask "Demo states" dropdown is prototype harness and is not rebuilt.
- `#toasts` → toast-stack.
- `main#app` depends on the route:
  - `#/board`:
    - header row ("Today's dogs" + day label + "Day closed" badge) → board.
    - status cards → status-strip.
    - `[role=tablist]` → status-filter-tabs.
    - grid and both empty states → dog-grid, with each card → dog-card.
  - `#/dog/<id>`:
    - back link and not-found card → dog-detail.
    - heading → dog-heading.
    - the four cards → dog-profile-card, stay-card, dog-actions, dog-notes.
  - `#/summary`:
    - header row → day-summary, with the close button/badge → close-day-control.
    - success alert → day-closed-alert.
    - `.stats` → day-stats.
    - the two cards → status-breakdown, overdue-pickups.
  - any route: the loading skeleton → board (day-summary also carries a `loading` case); its repeated placeholder card (`skeletonCards(n)`) → skeleton-card; and the error alert → load-error.

**Source JS → owner:**
- `[data-cmd]` click → `runStatus` → dog-actions.
- `#note-form` submit → `addNote` → dog-notes.
- `#close-day` click → `closeDay` → close-day-control.
- `$app` `[data-filter]` click (including clicking the active filter again to reset to all) → status-strip and status-filter-tabs, as links.
- `#theme-toggle` change / `setTheme(?theme)` → theme-toggle.
- `toast()` + its `setTimeout(3500)` → toast-stack.
- `hashchange` → `render()`: the active-nav toggle → main-nav. Per-view render → the page compositions (SSR routes).
- `hashchange` → `window.scrollTo(0,0)`: in the build, pages are real routes, so a full navigation starts at the top natively. This is not owned by a unit. See Risks for soft-nav.
- `setDemo()` fake latency, `#demo-state` / `#demo-fail` change → prototype harness, not rebuilt. Its states are covered by the loading, error, empty and rolled-back cases.
- `lucide.createIcons()` → inline SVG in the build (design-tokens.md, Icons). No runtime.
- No observers, no rAF and no JS-driven animations. The CSS motion (card hover, toast entrance, skeleton pulse, spinner) is owned by each unit's Motion section.

**Checks:**
- Every unit has a tier. Every island's justification is in its `inventory.json` evidence.
- Every live panel is request-response, and each has its honest-empty note.
- All 25 units have `<name>.md` with an Isolate build plan and a real `isolate/fixture.json` + `cases/` (264 case files).

## Unassigned

none

## Risks / unknowns

1. **Stale line in top-bar.md:32:** "(See GAP: every still still shows the flask button.)". The seven `top-bar@*` stills (and the main-nav stills) were recaptured without the harness, and top-bar.md §10 says so. The §1 line is now wrong. The top-bar spec-writer owns the file and should drop that line.
2. **The `_motion` spec shape is not standardised by capture.**
   - Capture wrote motion.json in per-trigger shapes that the runner rejects ("not an array of animations").
   - board points its `loading` case at a derived `screenshots/motion-loading.json`.
   - dog-detail, day-summary, status-strip and theme-toggle dropped `_motion`.
   - dog-card `hover`, toast-stack `entrance`, and `default` on dog-actions, dog-notes and close-day-control, carry `_motion` against files with extra top-level keys. Whether the runner accepts those is unverified. Interaction-triggered motion is out of scope for `_motion` anyway.
3. **Grid-stretched stills:** dog-card @1280 (206 px vs ~153 standalone) and @1024, dog-profile-card and stay-card at lg/xl, and status-breakdown at-1024 were shot inside a stretched grid row. They will likely fail the runner's >4 px size check until they are recaptured standalone.
4. **Interaction-state stills can't be a pre-interaction `_reference`.** This covers hover, focus, failed/rolled-back with a toast, and pending-dark. Those cases stay "skipped — no tests" until the build lifts their Events into `tests/`. The dog-actions `failed@1280` still is byte-identical to `hover@1280`.
5. **States with no still or test:** board `day-closed`, dog-detail `day-closed`, day-closed-alert `hidden`, dog-profile-card unknown-owner, and the day-summary `closing`/`close-failed` cases. They are skipped until the build writes their specs. The board "Day closed" badge markup is described, not extracted.
6. **Page data in isolation:**
   - Page cases feed resolve output as bare-key props (`today`, `dogList`, `dogDetail`, `overduePickups`, `loadState`). The isolate format documents no mechanism for this, so it is unverified until build.
   - Object and array props (`today`, `dogList`, `notes`, `toasts`, `dog`) have no fixture control type, so the Props↔controls 1:1 mapping is broken for them.
7. **Landing dir / preview route:** isolate-format.md "Folder shape" (`components/`, `islands/`) disagrees with the inventory dirs (`shared-components/<n>`, `pages/<p>/components/<n>`). The route prefixes the spec-writers assumed are unverified.
8. **`_reference` paths** are prefixed `fixtures/kennel-app/…` and resolve only through the runner's git-root fallback.
9. **dog-grid `dark` case:** `background` is fixture-level only (set to the brand `#F3EADB`), so the dark case's `#29201A` grid gaps will likely fail its reference.
10. **status-badge tolerance** of 0.005 on ~2–3k px crops is close to anti-alias noise.
11. **Confirmed-write tier:** close-day-control is recorded as `pure-client` with `waits: day.close`. spec-check's tier-cases check can't match its (and day-summary's) extra `pending`/`rolled-back` cases to a bound command until a binding exists.
12. **Scaffold theme drift:** the app scaffold defaults to `brand-dark` with `color-scheme: dark`. The mock's default is `brand` (light) on `bg-base-200`.
13. **The loading skeleton has no SSR analogue.** It is kept as the board/day-summary `loading` case. The build decides whether soft-nav shows it.
14. **Scroll reset on navigation:** the mock calls `scrollTo(0,0)` on `hashchange`. If sprig's soft-nav keeps the scroll position, main-nav (or the shell) must own this. routing.md says nothing about scroll.
15. **Toasts are page-scoped:** a shell-level `toasts` channel can't reach page-nested islands. Each page composes its own toast-stack.
16. **day-summary `empty` mock artifact:** the overdue stat reads 2 while the list is empty. The case reproduces the still faithfully.
17. **Proposals not run through discovery:** most were validated by JSON parse and path existence only, because `sprig isolate list` scans `<root>/src`. Only board, status-badge, theme-toggle and overdue-badge were checked through a throwaway `src/` copy.
