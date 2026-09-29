# Contract: ui-breakdown

> **Producer:** breakdown · **Consumer:** build · Pipeline: design → prototype →
> breakdown → build → audit

A **`spec/ui/breakdown/`** directory detailed enough that `build` can rebuild
each page and component **mechanically, without opening the source.** This is
the **translation boundary**: whatever the source used (daisyUI, inline styles,
bespoke CSS), what crosses into `build` here is framework-neutral **tokens +
specs**.

## Artifact — directory shape

```
spec/ui/breakdown/
├── index.md              # page inventory, usage matrix, build order, interaction tiers, Unassigned list
├── inventory.json        # the machine-read inventory `sprig spec-check` parses (see Shape)
├── design-tokens.md      # palette, type, spacing, radii, shadows, easing → Tailwind 4 @theme
├── data-model.md         # pre-contract fallback only (no ratified contract) — the implied backend schema;
│                         #   with a contract, the data seam is spec/contract/binding.md instead (see Shape)
├── assets/               # images/fonts/svgs lifted from source
├── shared-components/<name>/   # used on >1 page
│   ├── <name>.md         # the component spec (see "Each component spec carries")
│   ├── isolate/          # real fixture.json + cases/<state>/<state>.json
│   ├── screenshots/      # <name>@<width>[-<theme>].png — the cases' `_reference` targets (+ filmstrip.png/motion.json/jank.md if animated)
│   └── source.html       # the unit's extracted markup region (+ js//css/) — breakdown-internal
│                         #   reference ground truth; build diffs against screenshots, not this
└── pages/<page>/
    ├── <page>.md, isolate/, screenshots/   # pages isolate too: real fixture.json + cases/
    └── components/<name>/   # page-local components (same shape)
```

## Shape (what `build` can rely on)

- **The data seam is a BINDING, not a re-derived schema** (bridge 2 of the
  cross-repo [`contract.md`](../../../contract.md)): when a ratified contract
  exists at the git root (`spec/contract/openapi.json`, or `spec/runes/*.rune` /
  a running keep's `/docs/<m>/json`), breakdown writes
  **`spec/contract/binding.md`** — every component/page data-need bound to a
  real endpoint + DTO (reads → **query** endpoints, writes → **command** verbs)
  in one table with the exact header `| unit | need | kind | endpoint | dto |`
  (`kind` `query`|`command`; `endpoint` as `GET /api/items`; `dto` from the
  client's `dtos.ts`). Filter/sort/search/paging are query params, never client
  logic. A data-need with **no matching endpoint/DTO is a drift error**, listed
  under the binding's `## Drift` section (`none` when empty) and surfaced in
  `index.md` — checkable at breakdown time, not a runtime surprise.
  `data-model.md` is the **pre-contract fallback**, written only when no
  contract exists (standalone mock breakdowns).
- **`inventory.json`** —
  `{ "units": [ { "name", "dir", "classification", "scope", "page"?, "usedOn", "tier", "evidence", "dataNeeds" } ], "unassigned": [] }`,
  `dir` relative to `spec/ui/breakdown/`, `scope` `shared`|`page-local`|`page`,
  `tier` `static`|`pure-client`|`optimistic-write`|`realtime` (a write's tier
  from the prototype's `commands.json` `feedback`; every unit fits one — a
  read-only data region is `static`, a page takes its own `logic.ts`'s tier —
  defined in the breakdown analyst). Pre-contract, `dataNeeds` use the
  `data-model.md` names and `spec-check` skips binding-drift until
  `spec/contract/openapi.json` exists. `evidence` names the
  design-system primitive a unit binds to when one exists. It is the source
  `index.md`'s usage matrix is written from.
- **Tokens are Tailwind v4 `@theme` custom properties** — NOT a
  `tailwind.config.js`, NOT daisyUI _themes_. Build puts them in a
  `:global(...)` `@theme` block (usually `shell/styles.css`) and styles with
  **Tailwind utilities** + component-scoped `styles.css` (the daisyUI→Tailwind
  translation already happened _here_); `sprig build` runs Tailwind v4 over the
  templates + CSS. Every theme variant included. **daisyUI _components_ ARE in
  the build** (`@plugin "daisyui"`, themes off) and their rules are
  document-global, so a spec must not propose a class name daisyUI owns (`stat`,
  `badge`, `list`, `status`, `card-body`, …) for an element of its own — prefix
  own classes (`cm-dot`) or name the daisyUI component deliberately. The list:
  `~/.claude/skills/sprig:build/references/component-model.md` → "Scoped
  styles".
- **Each component spec carries:** classification (`static` | `island` |
  `page-composition`) + the interaction tier (static / island; server writes are
  **optimistic UI**, realtime where needed; every case carries `_tier`);
  anatomy; a props table (1:1 with `fixture.json` controls, `signal: true` for
  island state); states→cases; **Events** as `capture(page)` predicate sketches;
  **Motion extracted** (real keyframes/easing + jank fixes — reproduce, don't
  reinvent); responsive; a11y; and an **Isolate build plan** — the
  build-in-isolation recipe (folder + selector, the preview route(s), per case
  its `_reference` still, the Events→`tests/` mapping, and the
  `sprig isolate test` → test → iterate loop) so the build session can stand the
  thing up alone from the spec.
- **`isolate/` proposals are real and runnable** (`fixture.json` +
  `cases/<state>/<state>.json`), discoverable by `sprig isolate`, for **every
  component AND every page** (pages isolate too); a component is a **folder**
  (`template.html` + optional `logic.ts`), its **basename the selector** — no
  `.tsx`. Case JSON carries the **real captured values** the screenshot shows;
  each breakpoint/theme still is a case with `_viewport`/`_theme` and a
  `_reference` to it; an optimistic-write unit has `pending` + `rolled-back`
  cases.
- **`index.md` carries the build order** (tokens → shared components →
  page-local → page compositions), the interaction-tier summary, and the
  Unassigned list — which must be empty (`sprig spec-check` fails otherwise).

## Invariants

- **Location:** `spec/ui/breakdown/` (sibling to `spec/ui/design-system/` and
  the `spec/ui/<app>-prototype/` folder — or a pre-contract single file
  `spec/ui/<app>-prototype.html`).
- A reader could rebuild from the spec alone, without the source.
- Schema only in the binding (`spec/contract/binding.md`) or the pre-contract
  `data-model.md` / prose; real data rows live **only** in case JSON.
- The full `fixture.json` / `capture(page)` format is the `breakdown` skill's
  own `references/isolate-format.md`.

## Validation

Breakdown: `sprig spec-check spec/ui/breakdown` exits 0 — Unassigned empty,
every `dataNeeds` entry bound, every bound endpoint/DTO present in
`openapi.json`, no unit assigned twice, every optimistic-write unit carrying
`pending` + `rolled-back` cases. Build: `sprig isolate test --json` is green for
every component **and page**, including each case's `_reference` pixel-diff row
within tolerance; then
`sprig spec-check spec/ui/breakdown --ui-src ui/src --app ui` (every inventory
unit built; the usage matrix matches the composition graph) and `sprig check ui`
(typecheck, wiring, `contract-calls`, `logic-placement`, `tokens`,
`duplicate-templates`, `optimistic-writes`) exit 0. A binding `## Drift` entry
is either empty or a deliberate, user-acknowledged gap.
