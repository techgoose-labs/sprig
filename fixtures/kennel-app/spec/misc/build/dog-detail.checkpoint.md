# dog-detail — checkpoint (page composition, spawn #1)

Suite run ONCE: `SPRIG_WB_ROOT=/tmp/wb-8791 sprig isolate test dog-detail --json --root fixtures/kennel-app`
→ ok:false, total 70, passed 53, failed 17 (the `dog-detail` filter also runs the page-local
children's cases — category `dog-detail` — 6 of the 17 reds are theirs, listed at the end).
Evidence: /tmp/wb-8791/evidence/2026-09-29T19-07-31-955Z-jwcb/cases/dog-detail-<case>/{actual,diff}.png.
`sprig check fixtures/kennel-app`: green (exit 0), no finding in src/pages/dog-detail.

## Greens (page unit)
- default · tests/back-link.spec.ts — "back link goes to the board" (href /ui, click event captured)
- default · tests/hover-transition.spec.ts — transitionDuration contains 0.2s
- default · tests/toasts-channel.spec.ts — 500 on check-in → toast-stack `.alert-error` "Biscuit: checked in didn't go through — reverted.", heading back to "Booked".
  CAVEAT: passes only because dog-actions' OWN defaults are d01/Biscuit/booked (see root cause A) — it does not prove page→island prop delivery.
- not-found · tests/not-found.spec.ts — h1 "We can't find that dog", text, `a[href="/ui"]` "Back to the board", click event

## Reds (page unit) — exact failing assertions
1. day-closed · tests/day-closed.spec.ts — `expect(getByRole('button',{name:'Check in'})).toBeDisabled()` → Received: enabled (button has `btn-primary`, i.e. status booked, closed=false).
2. default · tests/dog-channel.spec.ts — `TimeoutError: Timeout has occurred` (the runner does not say which await; candidates: `hydrated(page,"dog-heading")` waitForSelector 8000ms, or `ev.expect(button click)`).
3. reference rows — all size mismatches (no fraction judged):
   - default 1280×808 vs render 1280×670 (0.580 over union)
   - dark 1280×808 vs 1280×670 (0.580)
   - bp-1024 1024×808 vs 1024×670 (0.591)
   - bp-768 768×1202 vs 768×1043 (0.470)
   - bp-640 640×1261 vs 640×1115 (0.451)
   - bp-375 375×1468 vs 375×1259 (0.496)
   - long-name 375×1306 vs 375×1259 (0.490)
   - overdue 1280×635 vs 1280×670 (0.552)
   - not-found 1280×288 vs 1280×355 (0.852)
   day-closed has no `_reference` by design.

## Root-cause notes
A. **Bound props from the static page do NOT reach the nested islands in the page preview.**
   Evidence (dog-detail-default/actual.png, read once): static children render the case data
   correctly (dog-profile-card: Golden Retriever/K01/Priya Raman; stay-card: Sep 29, 7:00 AM/$45.00),
   but every island renders its own defaults: dog-heading has NO h1 (`name` signal default ""),
   dog-notes shows "Notes 0 / No notes yet" (3 notes bound), dog-actions ignores `[closed]="closed"`
   (red 1), and main-nav highlights "Board" although top-bar passes `view="dog"`. Same height
   for default (3 notes) and overdue (0 notes) = 670 confirms notes never arrive. Islands bound:
   `[name]`, `[status]`, `[overdue]`, `[overdueBy]` on dog-heading; `[dogId]`,`[dogName]`,`[status]`,
   `[overdue]`,`[overdueBy]`,`[closed]` on dog-actions; `[dogId]`,`[dogName]`,`[notes]` on dog-notes.
   NOT verified whether real SSR (`/ui/dog/:id`) delivers them (no backend data exists to try) —
   so this is either a page-preview harness gap or a framework rule for static→island bindings.
   The cheatsheet only documents "preview targets get NO static prop bindings" for an island that
   IS the preview target, not for islands nested in a static page.
B. **top-bar in the page template adds ~64px** the stills don't have: the stills are `main#app`
   only (dog-detail.md §4 "Stills that are NOT cases": the navbar is outside main#app), but the
   cheatsheet ORCH DECISION says top-bar is composed per PAGE. I followed the ORCH DECISION
   (template root `div.dog-detail-page` = top-bar + main + toast-stack). not-found: 355 − 288 = 67px
   ≈ the top-bar row. This conflict alone makes every `_reference` a size mismatch; it needs an
   orchestrator decision (drop top-bar from the page, or re-shoot stills with the navbar, or make
   `main` the screenshotted element).
C. With A fixed, the remaining height gap for default should be ≈ h1 row (48px + gap) + 3 notes;
   not measurable until A and B are resolved.
D. dog-channel timeout: most likely the same cause as A (dog-heading renders no h1 / possibly no
   hydration marker), unverified.

## Files written
- src/pages/dog-detail/template.html — top-bar(view="dog") + main (back link, dog-heading reads:dog,
  grid: dog-profile-card, stay-card, dog-actions sets:dog edits:toasts, notes slot → dog-notes edits:toasts;
  @else not-found card) + toast-stack sets:toasts
- src/pages/dog-detail/styles.css — own font/colour (workbench stage), icon sizes, not-found title/text,
  back/not-found link transitions without box-shadow (jank fix), reduced-motion
- src/pages/dog-detail/resolve.ts — GET /api/dogs/{id} + GET /api/days/today via inject(Backend);
  404 via setResponseStatus when no dog; formats stay to display strings (UTC "Mon D, h:mm AM", USD)
- src/pages/dog-detail/isolate/ — copied from the breakdown; cases' `dog.stay` reshaped to the
  display strings resolve produces (stay-card takes strings); `overdueBy: ""` added where absent;
  tests: default/tests/{back-link,dog-channel,toasts-channel,hover-transition}.spec.ts,
  not-found/tests/not-found.spec.ts, day-closed/tests/day-closed.spec.ts

## RULED-OUT
- Static children prop binding: works (profile + stay render case data) — not the cause of A.
- Case data shape for stay: stay-card receives and renders the display strings correctly.
- Font/theme: fonts load (Caveat/Quicksand visible in the render); not a font issue.
- Workbench bg defect: irrelevant here — every reference red is a SIZE mismatch, no pixel fraction judged.
- sprig check: green; the wiring lint accepts sets:dog / reads:dog / sets:toasts / edits:toasts x2.

## Next step
Decide B first (orchestrator). Then prove A in one probe: open
`/pages/dog-detail/page/default` in the interactive workbench and read
`document.querySelector('sprig-island[data-sel="dog-heading"]').__sprigScope.name()` —
empty ⇒ the page preview drops static→island bindings (harness/framework ticket; possible
workaround: none sanctioned in a static page — do not add a page logic.ts); non-empty ⇒ a
binding-expression issue (`dog.name` on an object prop).

## Children reds seen in the same run (NOT this unit — owners: dog-heading, stay-card builders)
- dog-heading: default 0.948, checked-in 0.940, after-check-in 0.940, overdue 0.887, long-name-walking-375 0.842 (tolerance 0.010)
- stay-card: no-stay 0.017 > 0.010
