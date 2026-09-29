# isolate fixture format — what a valid proposal looks like

The format `sprig isolate` discovers (see `sprig:build` →
`references/isolate.md`). A proposed `isolate/` folder must be discoverable
unchanged — `sprig isolate` fails fast on malformed fixtures, so an invalid
proposal is worse than none.

## Component = folder, not a file

A sprig component is a **folder**: `template.html` + an optional `logic.ts` (its
presence makes the folder an **island** that hydrates) + an optional
`styles.css`. **There is no `.tsx` file.** The folder's **basename is its
selector** — the custom tag other templates use (`command-palette/` →
`<command-palette>`). Propose kebab-case folder names that read as the tag you
spec'd.

## Folder shape

The build session places each component at one of three `src/` roots — your
**Classification** decides which:

| Classification            | Lands in             | Routes under    |
| ------------------------- | -------------------- | --------------- |
| `static` (no `logic.ts`)  | `components/<name>/` | `/components/…` |
| `island` (has `logic.ts`) | `islands/<name>/`    | `/components/…` |
| `page-composition`        | `pages/<name>/`      | `/pages/…`      |

```
islands/counter/
  template.html                ← the view (Angular-flavored bindings)
  logic.ts                     ← defineComponent({ setup }) — makes it an island
  styles.css                   ← (optional) view-encapsulated styles
  isolate/
    fixture.json               ← metadata + control declarations
    cases/
      three/
        three.json             ← cases/<name>/<name>.json — names MUST match
        tests/*.spec.ts        ← (build session writes these from your Events section)
```

## `fixture.json`

```jsonc
{
  "category": "overlays", // gallery group + URL segment (default: folder name)
  "folder": "modal", // optional sub-group + URL segment
  "background": "#f4f5f7", // optional stage background

  // Controls for the top-level component — one per Props-table row.
  "controls": {
    "open": { "type": "boolean", "value": true, "signal": true },
    "title": { "type": "text", "value": "Delete workspace?" },
    "tone": {
      "type": "select",
      "options": ["default", "danger"],
      "value": "danger"
    }
  },

  // Optional: controls for sub-components the component renders, keyed by the
  // sub-component's SELECTOR (its folder basename / custom tag).
  "components": {
    "ui-button": { "controls": { "disabled": { "type": "boolean" } } }
  }
}
```

The preview route is `/<components|pages>/<category>/<folder>/<case>` (e.g.
`/components/overlays/modal/danger-open`).

Control `type` values — each Props-table row maps to exactly one:

| `type`    | Widget       | Extra fields         |
| --------- | ------------ | -------------------- |
| `boolean` | checkbox     | —                    |
| `number`  | number input | —                    |
| `text`    | text input   | —                    |
| `range`   | slider       | `min`, `max`, `step` |
| `select`  | dropdown     | `options: [...]`     |
| `color`   | color picker | —                    |

- Any control may carry a default `value`.
- **`"signal": true`** routes the value in as a **sprig signal** — use it for
  island state a reviewer will toggle live (it survives a control-edit remount;
  a plain value does not). Mirror the `signal?` column of your Props table.
- A bare value (`"size": "md"`) is shorthand for `{ "value": "md" }` with the
  widget inferred.

## Case JSON — `cases/<state>/<state>.json`

One case per row of the component's **States → cases** table. Bare keys are
props; `_`-prefixed keys are specials. **The list below is the whole list** —
any other `_` key is a config error naming the key and the case file
(`isolate test` refuses to run, `isolate list` and the workbench banner show
it), never ignored.

| Key          | Effect                                                                |
| ------------ | --------------------------------------------------------------------- |
| _(bare key)_ | passed as a prop / `@input`                                           |
| `_name`      | human label for the case (default: folder name)                       |
| `_innerHtml` | the component's projected children (sprig `<content>`)                |
| `_signals`   | `{ name: value }` seeded as island signals (the island's state)       |
| `_mocks`     | stub or force props on sub-components, keyed by **selector**          |
| `_viewport`  | px width, or `{ "width", "height" }` — the case renders + tests at it |
| `_theme`     | `data-theme="<value>"` on `<html>` for every test of the case         |
| `_reference` | the captured still the render is pixel-compared against               |
| `_network`   | fakes for the case's requests (`fail` / `delay:<ms>` / a response)    |
| `_tier`      | `static` \| `pure-client` \| `optimistic-write` \| `realtime`         |
| `_motion`    | `{ "spec": "<captured motion JSON>" }` — animations compared to it    |

Paths (`_reference`, `_motion.spec`) resolve **relative to the case folder
first, then relative to the git root**; the file must exist at discovery — a
missing one is an error naming both paths tried, not a skipped check, and the
report row says which resolution was used. **Write git-root-relative paths** to
the breakdown's own captures — the `isolate/` folder is copied into the built
component under `ui/src`, where a case-relative path can't reach them:
`spec/ui/breakdown/<unit>/screenshots/<name>@<width>[-<theme>].png` for stills,
`spec/ui/breakdown/<unit>/screenshots/motion.json` for motion.

```jsonc
// cases/default/default.json
{ "_name": "Default", "title": "Save changes?", "tone": "default" }

// cases/danger-open/danger-open.json — island state via signals
{ "_name": "Danger, open", "tone": "danger", "_signals": { "open": true } }

// cases/stubbed/stubbed.json — isolate from a heavy child by selector
{ "_name": "Chart stubbed", "_mocks": { "sparkline": "stub" } }

// force props on every instance of a child (keyed by selector)
{ "_mocks": { "ui-button": { "props": { "disabled": true } } } }
```

`_mocks[selector]` accepts `"stub"` (labelled placeholder) or
`{ "props": {...} }` (force those props on every instance of that
sub-component).

### `_viewport` — the breakpoint the still was captured at

```jsonc
{ "_viewport": 375 }                               // width; height 720
{ "_viewport": { "width": 1024, "height": 600 } }
```

`isolate test` sets the Playwright viewport for **every** test of the case (its
own specs and the generated `reference:`/`motion:` rows). The interactive
workbench stage keeps its manual width presets — the runner is authoritative.

### `_theme` — the theme the still was captured in

```jsonc
{ "_theme": "dark" }
```

Every test of the case sees `<html data-theme="dark">` from the first paint (set
before any page script runs, and re-asserted if the app's markup overwrites it).
The workbench stage shows the app's default theme; the runner is authoritative.

### `_reference` — faithful to the mock, measured

```jsonc
{ "_reference": "spec/ui/breakdown/card/screenshots/card@375-dark.png" } // tolerance 0.01
{
  "_reference": {
    "image": "../shared/card-dark.png",
    "tolerance": 0.03,
    "reason": "the mock's avatar is a photo; the build's is a monogram"
  }
}
```

`isolate test` renders the case at its `_viewport`/`_theme`, screenshots the
**rendered target element** (the unit itself, animations settled, caret hidden —
the same crop as a per-unit `locator.screenshot()` still), and compares it to
the image: the **fraction of pixels that differ** (a pixel differs when any RGBA
channel moves by more than 24/255; a size mismatch counts the non-overlap as
differing). The result is a test row named `reference: <unit>/<case>` — passing
rows say `measured 0.004 ≤ tolerance 0.010`, failing ones
`measured 0.034 > tolerance 0.010` plus the path of a diff PNG (differing pixels
red) written **outside the project**. `tolerance` defaults to `0.01`; any value
above it **requires a `reason`** (a config error otherwise). Supply the crop at
exactly the case's viewport and theme — a still from another breakpoint is a
guaranteed failure, not a loose match.

### `_network` — prove optimistic writes without a server

```jsonc
{
  "_tier": "optimistic-write",
  "_network": {
    "POST /api/todos": "fail", // connection fails → rollback
    "PATCH /api/todos/{id}": "delay:3000", // held 3s → the UI must not wait
    "DELETE /api/todos/*": { "status": 409, "body": { "error": "conflict" } },
    "createTodo": "fail" // a contract command name
  }
}
```

Installed with Playwright `page.route` before each of the case's tests, so a
story can prove a rollback on a failed command and a no-wait on a delayed one.
Keys are `"METHOD /path"` (`{id}`, `:id` match one segment, `*` anything;
matched against the request's pathname) or a **command name** — an `operationId`
from `spec/contract/openapi.json` at the git root (its first server URL's path
is the prefix). With no contract, a command-name key is an error naming it.
Values: `"fail"` (the request errors), `"delay:<ms>"` (held, then sent on), or
`{ "status": n, "body": any }` (answered; an object body is JSON). Each test row
records `network <key> → <action>: fired N×`, so a fake that never matched
shows.

### `_tier` — which interaction tier the case exercises

```jsonc
{ "_tier": "optimistic-write" }
```

Recorded on the discovered case and on every report row of the case; no runtime
behaviour of its own (`sprig spec-check` consumes it). Use the tier from your
interaction-tier map: `static`, `pure-client`, `optimistic-write`, `realtime`.

### `_motion` — the captured animations, compared

```jsonc
{ "_motion": { "spec": "spec/ui/breakdown/toast/screenshots/motion.json" } }
```

`motion.json` is the unit's extracted `document.getAnimations()` output — an
array (or `{ "animations": [...] }`) of records:

| Field           | Type                             | Compared                                  |
| --------------- | -------------------------------- | ----------------------------------------- |
| `selector`      | string, optional                 | pairs records (`tag#id.class…`)           |
| `name`          | string, optional                 | pairs records (animation / property name) |
| `duration`      | number (ms)                      | yes, ±1ms                                 |
| `easing`        | string                           | yes (whitespace/number spelling ignored)  |
| `keyframeCount` | number                           | yes                                       |
| `delay`         | number (ms), optional            | when present, ±1ms                        |
| `iterations`    | number or `"Infinity"`, optional | when present                              |

Extra fields are ignored, and the capture recipe's raw record
(`{ target, name, keyframes: [...], timing: { duration, delay, iterations, easing } }`)
is read as-is: `target` → `selector`, `keyframes.length` → `keyframeCount`, and
a CSS animation's curve is taken from its keyframes when `timing.easing` is
`linear`. `isolate test` opens the case with every animation paused at its start
(so entrance animations are still listed), reads the same records after
hydration, pairs them (selector + name, then name, then selector, then order)
and adds a row `motion: <unit>/<case>` — failing with one line per difference
(`pulse on span.dot: duration 1200ms ≠ spec 800ms`, a missing animation, an
unexpected one). Animations that need an interaction to start are out of scope
for `_motion`; assert those in a spec.

**Case values are the real captured data.** The build session diffs the rendered
case against your screenshot — so the case must reproduce exactly what the
screenshot shows (actual titles, names, dates, ids, series). For large data
sets, carry the exact visible slice, not the full set and not invented
lookalikes. Put that screenshot in the case folder and name it in `_reference`,
with the `_viewport`/`_theme` it was captured at, so the diff is measured rather
than eyeballed.

## Events → test predicates

isolate's test bridge (`isolate-events`) exposes every DOM event a component
fires as `IsolateEvent = { time, source, type, detail }` — `source` is `tag` or
`tag#id` (`"button#submit"`, `"input#email"`), `detail` carries the input value
/ pressed key / element label. In the **interactive workbench** (`sprig isolate`
in a browser) a spec can read them via:

```ts
import { capture, waitHydrated } from "isolate-events";

const ev = await capture(page); // install BEFORE page.goto
await page.goto("/components/overlays/modal/danger-open");
await waitHydrated(page); // a click before hydration is a silent no-op
await page.locator("#confirm").click();
await ev.expect((e) => e.source === "button#confirm" && e.type === "click", {
  timeout: 3000,
});
```

**Headless caveat — what actually runs under `isolate test`.** The headless
runner executes specs with **Node** Playwright: `@std/expect` and every other
Deno-only specifier fail to load (the run reports `ran: false, total: 0` and
names the import). The `isolate-events` helpers (`capture`/`waitHydrated`) DO
fire there — the stage-bridge produces both signals under direct navigation. A
runnable case test is plain Playwright:

```ts
import { expect, test } from "@playwright/test";
import { waitHydrated } from "isolate-events";

// The runner exposes the preview server as ISOLATE_BASE_URL; no config sets a baseURL.
const BASE = process.env.ISOLATE_BASE_URL ?? "http://127.0.0.1:8000";

test("confirm closes the modal", async ({ page }) => {
  await page.goto(`${BASE}/components/overlays/modal/danger-open`);
  // islands hydrate async — waitHydrated resolves once the target island's scope is
  // attached AND the case's _signals are applied (statics: immediately)
  await waitHydrated(page);
  await page.locator("#confirm").click();
  await expect(page.locator(".modal")).toBeHidden(); // the observable effect
});
```

Write each row of a component's **Events** section as a predicate sketch against
the real `source`/`type`/`detail` values you observed — the build session lifts
the predicate into `tests/*.spec.ts`, either via `capture(page)` (call it BEFORE
`page.goto`) asserting the bridge event itself, or as the event's observable DOM
effect.

## Gotchas to encode in proposals

- **Route ≠ directory.** The preview URL is
  `/<components|pages>/<category>/<folder>/<case>` from `fixture.json`, not the
  source path. Don't write specs that assume path-derived URLs.
- **Editing a control remounts the stage** — `setup()` re-runs and its plain
  local state resets; **signal-backed** state (`signal: true` controls /
  `_signals` cases) survives. Prefer signal-backed for anything a reviewer will
  toggle while inspecting state.
- **Hydration is async** — interacting before it completes is a silent no-op;
  gate island interactions on `waitHydrated(page)` (interactive workbench) or
  the `sprig-island[data-sel="…"][data-sprig-hydrated]` selector wait above
  (headless `isolate test`).
- Props crossing into an island must be **serializable** — no functions, no
  class instances. If the source passes a callback, redesign the prop as an
  event the island emits (`ctx.output`) and note it in the Events section.
