# Build cheatsheet — kennel (24 units; spec = breakdown/<dir>/<name>.md)
## Units (selector=folder · S static/I island · props · composes; none emit ctx.output — links/channels only)
- status-badge S · status:DogStatus="booked", size:"md"|"sm"="md"
- overdue-badge S · overdue:bool, overdueBy:str
- load-error S · title, message, retryLabel:str (Retry = link reload)
- theme-toggle I · theme:"brand"|"brand-dark"="brand" sig
- toast-stack I · lifetime:num=3500, toasts:{kind,msg}[] sig
- main-nav I · view:"board"|"summary"|"dog"="board" sig
- top-bar S · active:"board"|"summary" · composes main-nav, theme-toggle
- dog-card S · id,name,kennel,breed,ownerName,status,arrival,overdue,overdueBy · composes status-badge, overdue-badge
- dog-grid S · status:Filter="all", dogs:DogListRow[] · composes dog-card
- status-strip S · booked,checkedIn,walking,checkedOut:num, empty:bool, active:Filter
- status-filter-tabs S · status:Filter="all" (links ?status=)
- dog-heading I · name; status,overdue,overdueBy sig · composes status-badge, overdue-badge
- dog-profile-card S · breed,kennel,arrival,ownerName,ownerPhone:str
- stay-card S · hasStay:bool, checkIn,plannedCheckOut,nightlyRate,totalDue:str, nights:int
- dog-actions I(optimistic) · dogId,dogName, status sig, closed:bool
- dog-notes I(optimistic) · dogId,dogName; author,draft,notes:Note[] sig
- close-day-control I(confirmed, sprig-wait) · dayId="today"; closed,pending sig
- day-closed-alert I · closed sig · day-stats I · kennelsUsed,kennelsTotal,occupancyPct,revenueToday,overdueCount,closed sig
- status-breakdown S · booked,checkedIn,walking,checkedOut,kennelsTotal:int · composes status-badge
- overdue-pickups S · pickups:Row[] · composes overdue-badge
- board S · composes top-bar, status-strip, status-filter-tabs, dog-grid, load-error
- dog-detail S · composes top-bar, dog-heading, dog-profile-card, stay-card, dog-actions, dog-notes, toast-stack, load-error
- day-summary S · composes top-bar, close-day-control, day-closed-alert, day-stats, status-breakdown, overdue-pickups, toast-stack, load-error
## Seams
- Reads (page resolve.ts, `inject(Backend)` sync before await): GET /api/days/today · /api/dogs?status=<s> · /api/dogs/{id} · /api/dogs?overdue=true
- Writes: POST /api/dogs/{id}/{check-in|start-walk|end-walk|check-out|notes} · POST /api/days/{id}/close
- src/services/state/mod.ts: scaffold `State` (StateService, localStorage) — NOT a cross-island channel
## Channels (page scope; page template holds siblings)
- dog: sets by dog-actions → reads by dog-heading · dog-detail
- day: sets by close-day-control → reads by day-closed-alert, day-stats · day-summary
- toasts: sets by toast-stack → edits by dog-actions, dog-notes | close-day-control → reads by toast-stack · per page
## Facts
- app_root: /Users/raphaelcastro/Documents/programming/tooling/sprig/breakdown-build-hardening/fixtures/kennel-app (src/ at the app root; "ui" in any prose = this dir). Check: `sprig check /Users/raphaelcastro/Documents/programming/tooling/sprig/breakdown-build-hardening/fixtures/kennel-app`.
- aliases: $ → src/mod.ts, $.pages/, $.shared-components/, $.services/; framework: @techgoose-labs/sprig, @techgoose-labs/sprig/bedrock. No @contract/.
- tokens_path: /Users/raphaelcastro/Documents/programming/tooling/sprig/breakdown-build-hardening/fixtures/kennel-app/src/css-variables.json — default theme brand (light, all tokens); brand-dark = colors only on html[data-theme="brand-dark"].
- isolate_cmd: SPRIG_WB_ROOT=/tmp/wb-<PORT> sprig isolate test <unit> --json --root /Users/raphaelcastro/Documents/programming/tooling/sprig/breakdown-build-hardening/fixtures/kennel-app   (sprig = deno run -A /Users/raphaelcastro/Documents/programming/tooling/sprig/breakdown-build-hardening/framework/cli.ts)
- build/serve: `deno task build` (= build --ui-only .) → static/; `deno serve -A --unstable-kv --port <P> serve.ts` → /ui, /ui/dog/:id, /ui/summary
- port_base 8760 (scaffolder); builders take their assigned PORT.
- contract: NONE — no typed client, no spec/contract/, zero-module keep backend. Writes use the pre-contract METHOD /path from spec/ui/breakdown/data-model.md; _network keys are "METHOD /path".
- browser_posture: Playwright available, PLAYWRIGHT_BROWSERS_PATH=/opt/cache/ms-playwright.
## Markers
`// sprig-logic: <reason>` · `// sprig-contract: <reason>` · `/* sprig-token: <reason> */` · `<!-- sprig-duplicate: <reason> -->` · `// sprig-wait: <reason>` · `<!-- sprig-shadows: <reason> -->` (line 1 of a page-local shadowing template) · `src/custom-elements.json` (allowed third-party tags)
## Gotchas
- ResolveCtx = { params, url } ONLY — no headers/session; session → logic.ts RouteCtx
- tests: `import { expect, test } from "@playwright/test"`; `waitHydrated(page)` from isolate-events before island asserts
- route: /<components|pages>/<category>/<folder>/<case>; pages/*/components/* preview under /pages/
- channel = one signal field per verb (longhand `reads:status={dog}`); reads: .set() throws; `sprig map` proves it; wiring lint fails build
- object/array props: no control widget — bare case keys or `_signals`
- default theme brand (light), not brand-dark
- ORCH DECISION top-bar↔main-nav: the prop is `view:"board"|"summary"|"dog"` on BOTH (top-bar passes `[view]="view"` to <main-nav>); top-bar is composed per PAGE (index.md), not in the shell.
- ORCH DECISION channel payloads: ONE object signal per channel — `dog` = {status, overdue, overdueBy} (dog-actions `sets:dog`, dog-heading `reads:dog`, field `dog`); `day` = the day object {closed, kennelsUsed, kennelsTotal, occupancyPct, revenueToday, overdueCount} (close-day-control `sets:day`; day-stats/day-closed-alert `reads:day`); `toasts` = {kind,msg}[] (toast-stack `sets:toasts`, writers `edits:toasts`).
- BUILDER GOTCHAS (wave 1): a STATIC unit renders in isolate WITHOUT its host tag — test locators target the unit's own root, not `<name> …`; a case omitting a prop inherits the fixture control default — set "" / null explicitly; the runner re-asserts `_theme` on <html> right after an island writes data-theme (observe writes with a MutationObserver); `_reference` screenshots the first child of `.iso-stage-page` (an island's `<sprig-island>` wrapper) — a position:fixed child leaves it 0×0, so put fixed positioning on `sprig-island[data-sel="<name>"]`.
- ISOLATE STAGE (verified, app/src/shell/styles.css:14,42-46 of the workbench): the headless preview body is the WORKBENCH shell — background #f3eee2, color #17150f, font ui-monospace — NOT the app shell; `_theme` does not repaint it and fixture `background` is ignored headless. So a unit must set its own `font-family: var(--font-body)` / `color: var(--color-base-content)` where it relies on inheritance. Fonts DO load (bootstrap/styles.css @font-face: "fonts: 0 stylesheet(s), 4 inline block(s)"). Page-bg showing through gaps/corners/transparent units is a harness mismatch — report it, never widen tolerance for it.
- SHARED PRIMITIVE ADDED: src/shared-components/icon-badge (static; props tone, soft, size, icon, label) — composed by status-badge and overdue-badge to satisfy duplicate-templates.
- a{color:inherit} UNLAYERED in the workbench shell beats daisyUI colors on <a> in isolate (status-filter-tabs, load-error hit it).
- COMPOSITION NOTES (from builders): dog-heading, day-stats, day-closed-alert dropped their own bottom margin (stills exclude it) — the page supplies the 1.25rem gap (day-closed-alert keeps it on its sprig-island host). Islands take page data only via signal props: bind [dogId]/[dogName]/[closed]/[status]… on <dog-actions>, <dog-notes> etc. Channels: dog-actions `sets:dog`, dog-heading `reads:dog`; close-day-control `sets:day`, day-stats + day-closed-alert `reads:day`; toast-stack `sets:toasts`, writers `edits:toasts`.
- HEADLESS SIGNAL SET in a case spec: window.postMessage({target:"isolate-stage",type:"set",scope:"signal",key,value},"*"); an island's live scope: document.querySelector('sprig-island[data-sel="<name>"]').__sprigScope.
- optimistic(sig,next,call,{reconcile}) → reconcile(result, prev) where prev is the PRE-write value; to replace a placeholder read the signal's current value.
- Template text nodes lose leading whitespace before an interpolation (`<span> of {{x}}</span>` → "of 40"); carry spaces inside the expression.
- ORCH DECISION REVISED (top-bar placement): top-bar lives in the SHELL (src/shell/template.html, above <router-outlet>) — the mock's header is a global mount outside #app and every page still/crop is main#app only (a page's first child is its _reference crop). Pages do NOT compose top-bar. main-nav (island) derives `view` from location.pathname on the client (pure-client UI state; SSR default "board"): /ui → board, /ui/summary → summary, /ui/dog/* → board-highlight per its spec.
- CLASS ISLAND PROPS (proven by dog-detail/day-summary spawn #2, framework/.sprig/compiler/mod.ts:206,225 + compiler/island.ts:37-47): a class island receives its tag bindings ONLY via `constructor(ctx)` → `ctx.input(name, dflt)` / `ctx.model(name, dflt)`; a bare field initializer `x = signal(d)` silently ignores `[x]="…"` in the real app (isolate hides it because cases seed `_signals`).
- PAGE ROOT: `.iso-stage-page` is a grid — a page root with mx-auto/max-w-* shrinks; give it `width:100%; min-width:0`. Pages paint their own base-200 background (board, day-summary do).
