# day-summary — checkpoint (spawn #2: FIXER) — supersedes the "Reds"/"Next step" of spawn #1 below

Final run: `SPRIG_WB_ROOT=/tmp/wb-8796 sprig isolate test day-summary --json --root <app>` → day-summary rows 22: 15 green, 7 red.
Evidence: /tmp/wb-8796/evidence/2026-09-29T19-24-28-566Z-vd66. `sprig check <app>` green, 0 findings in src/pages/day-summary.

## Fixed (page-owned, all in src/pages/day-summary/)
1. template.html: removed `<top-bar view="summary">` (ORCH REVISED: top-bar lives in the shell). main#app is now the first child.
2. styles.css `.day-summary-main { width:100%; min-width:0; box-sizing:border-box }`. `.iso-stage-page` is a grid, so `mx-auto` alone
   shrank main to its content (1092 px at 1280, 538 at 640). Its min-content (the overdue card) also blew the implicit track to 883 px at 768.
3. styles.css `.day-summary-title`: weight 700, `--tracking-display`, `--leading-tight`, the mock's `.font-display` rule
   (_test-prototype.html:150-164). The h1 was 40 px vs 39.59 px, which pushed everything below it by 0.41 px (the glyph/border
   "shift" diffs). After the fix, mock and render rects match to within 0.3 px at 375 and 1280 (main 1003.31 / 503.92 in both).

## Green _reference rows now: default 0.000, empty 0.000, error 0.007, loading 0.000, open-1024 0.000, open-1280-dark 0.000,
open-375 0.001, open-375-dark 0.001, open-640 0.001, open-768 0.001 (tol 0.010). All 5 Events tests are still green.

## Red (7): every closed-* row has one root cause, and it is in CHILD islands, not the page and not the runner
closed-1024/1280/1280-dark/375/375-dark/640/768 render at the OPEN height (no day-closed-alert, and the "Close the day" button instead of the badge).
PROOF: the page SSR serializes the right props into each nested island, e.g. closed-1280 day-closed-alert
`{"closed":true,…,"__snapshot":{"closed":false,…}}`, and close-day-control `{"closed":true,"day":{…closed:true…},"__snapshot":{"closed":false,"day":{"id":"today","closed":false}}}`.
So the props arrive, but the instance ignores them. Framework: framework/.sprig/compiler/mod.ts:206/225
`new Cls(makeServerCtx(inputs))`. A class island only sees props through the ctx its constructor receives
(`ctx.input/model`, compiler/island.ts:37-47). The children declare plain field defaults and have no constructor:
close-day-control/logic.ts:39-43 (dayId/closed/day), day-closed-alert/logic.ts:22 (closed), day-stats/logic.ts:23-29.
This is NOT a runner defect. The same bug would show in the real app. The children's own cases pass only because they seed via `_signals`.
FIX (child owners): e.g. `constructor(ctx) { this.closed = ctx.model("closed", false); this.day = ctx.model("day", {id:"today",closed:false}); … }`.
I did not touch it (the brief says not to rewrite children).

## RULED OUT
- Runner/page preview dropping nested props: disproved by the props bridge above.
- bg defect (#f3eee2): 0 of the top differing color pairs involve it. main paints base-200 over the full slot width, so no stage bg shows through.

---

# day-summary — checkpoint (spawn #1: compose + cases + ONE suite run)

Unit: `src/pages/day-summary` · selector `day-summary` · page-composition · tier static (no logic.ts).
Suite run once: `SPRIG_WB_ROOT=/tmp/wb-8792 sprig isolate test day-summary --json --root <app>` → exit 1,
the day-summary rows are 22 total, 5 green, 17 red. Evidence: `/tmp/wb-8792/evidence/2026-09-29T19-07-21-768Z-n2v4/cases/day-summary-<case>/{actual,diff}.png`.
`sprig check <app>` → green; no finding in `src/pages/day-summary`.

## Greens (5 of 5 lifted Events tests)
- closing · `E1+E2: Close the day goes pending while the reply is held` (network `POST /api/days/{id}/close → delay 3000ms: fired 1×`)
- closing-375 · `E2 at 375: …` (delay fired 1×)
- close-failed · `E4: a 400 reply keeps the day open and shows the error toast` (respond 400 fired 1×)
- default · `E3: a 200 reply closes the day in place, without a reload` (page.route fake 200 inside the spec). This proves the `day`/`toasts` channels end to end: the badge, the alert, "Final" and the toast all appear.
- default · `E5: Rocco links to /ui/dog/d14, Olive to /ui/dog/d18`

## Reds (17 of 17 `_reference` rows, one root cause)
Every row reads `size mismatch: reference W×H vs render W×64 (more than 4px apart — not the same crop, so no fraction is judged …)`:
default 1280×504, open-375 375×1004, open-375-dark 375×1004, open-640 640×912, open-768 768×702 **vs render 837×64**,
open-1024 1024×515, open-1280-dark 1280×504, closed-375 375×1090, closed-375-dark 375×1090, closed-640 640×978,
closed-768 768×768 **vs 837×64**, closed-1024 1024×581, closed-1280 1280×570, closed-1280-dark 1280×570,
empty 1280×504, loading 1280×476, error 1280×150.

## Root-cause notes
1. **The crop is the top-bar, not `main`.** `_reference` screenshots the first child of `.iso-stage-page`. template.html
   composes `<top-bar view="summary">` FIRST, as index.md:17 and the cheatsheet ORCH DECISION require ("top-bar is composed per PAGE").
   The stills are crops of `main#app` only, so they exclude the top-bar. The render height of 64 matches every `top-bar@*.png`
   still (all 64 px tall), which proves it. The spec (day-summary.md §2 anatomy) and the orchestrator decision contradict each other.
   The next agent must pick ONE of these:
   (a) make `<main class="day-summary-main">` the element the reference crops, e.g. by moving top-bar into the shell. That is
   the scaffolder's call and changes all 3 pages.
   (b) give the reference a selector/crop target, if the runner supports one. Unverified; I did not research it.
   (c) keep top-bar and accept that page-level `_reference` cannot match the main#app stills. That needs an orchestrator decision.
   Do NOT reorder the DOM (top-bar after main plus CSS `order`), because it breaks focus order.
2. **At 768 the top-bar renders 837 px wide inside a 768 viewport**: it overflows horizontally at `md`. That is a top-bar/main-nav
   defect or a page-host width issue, and it is separate from #1. Check top-bar's own 768 case before blaming the page.
3. No pixel classification (bg vs glyph/geometry) was possible: the runner judges no fraction on a size mismatch. The
   known #f3eee2 stage-bg defect can only be measured after #1 is resolved.

## Files written (all under src/pages/day-summary/)
- `template.html`: top-bar; `main.day-summary-main` with 3 states: `state==='loading'` (4 skeleton tiles, spinner
  "Loading today's dogs…", 8 skeleton cards), error or `!today` (`<load-error>` in `.mt-10`), and live (header row h1 +
  `{{ dayLabel }}` + `<close-day-control sets:day edits:toasts [dayId] [closed] [day]="today">`, `<day-closed-alert reads:day [closed]>`,
  `<day-stats reads:day …>` in a `mb-5` wrapper, a `lg:grid-cols-2` wrapper with `<status-breakdown>` (bracket access
  `today.byStatus['checked-in']`) and `<overdue-pickups [pickups]>`); `<toast-stack sets:toasts>` after main.
- `styles.css`: `.day-summary-main` paints base-200 and sets its own font and color (Build note §2; stage-bg gotcha); prefixed hooks only.
- `resolve.ts`: `inject(Backend)` sync; GET `/api/days/today` + `/api/dogs?overdue=true`; `dayLabel` formatted en-US in UTC;
  any failure → `{state:"error", today:null, overduePickups:[], dayLabel:""}`. With the zero-module keep, the live route therefore
  renders the error state (GAP: no backend).
- `isolate/`: copied from the breakdown (fixture.json + 20 cases). Each case adds a `dayLabel` bare key ("Tuesday, September 29",
  or "" when `today:null`), because a template-only page cannot call a formatter.
  Tests: `cases/closing/tests/pending.spec.ts`, `cases/closing-375/tests/pending.spec.ts`,
  `cases/close-failed/tests/rollback.spec.ts`, `cases/default/tests/close.spec.ts`, `cases/default/tests/overdue-link.spec.ts`.

## RULED-OUT (with how)
- The template syntax is not at fault. `@if`/nested `@else`, bracket property access, and `sets:`/`reads:`/`edits:` on the tags all compile.
  `sprig check` passes typecheck, wiring ("4 wiring channel(s) lint clean") and composition, and E3 proves the channels at runtime.
- `_network` `{id}` path patterns work as authored ("fired 1×" on closing, closing-375 and close-failed).
- Missing children / hydration: not the cause, because all 5 flow tests click hydrated islands successfully.
- The page styles are not the cause of the reds: the rendered crop never includes `main` (see root cause #1).

## Also red in the same run (children, NOT this unit — reported, not touched)
- close-day-control default/accepted/closing/rolled-back: 0.020 > 0.010 (117/5960 px at 149×40); pending: 0.998 > 0.060 (172×40).
- overdue-pickups default: 0.008 > 0.005 (940 px at 608×182); empty: 0.012 > 0.010 (940 px at 608×130). The same 940 px appear
  in both at the same card width, which suggests the known stage-bg defect at the rounded corners (unverified).

## Next step
Get the orchestrator's decision on root cause #1 (top-bar in the page vs the main#app stills), apply it, then re-run the
suite once. The first real pixel fractions for the page will appear only then.
