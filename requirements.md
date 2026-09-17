# requirements.md

Append-only. One entry per stated requirement, with a stable id and links to the
tests that hold it. Amendments re-use the id with `AMENDMENT` / `SUPERSEDED` /
`REVISION` in the heading.

---

## REQ-001 — a malformed template must never ship

> "The isolate workbench crashes at boot on ITS OWN template. `sprig dev` prints
> 'Generated 83 preview page(s) for 15 component(s).' then
> `error: Uncaught (in
> promise) Error: sprig: template failed to parse cleanly (syntax error at line 7,
> column 7). Fix the template HTML — a malformed template must not ship.`
> … The parser rejects double-quoted strings … inside a `{{ }}`. Every
> `sprig dev` on this box does this — nothing app-specific." — report
> 20260912T142652Z-w11-14936 (#sprig), item 1

Three obligations:

1. **Every template sprig itself ships parses cleanly.** Enforced, not asserted
   by hand — a test walks the repo's `template.html` files and parses each one.
2. **A double-quoted string literal in a `{{ }}` interpolation or an
   `@block (…)` header is valid template source.** The grammar's `string` token
   is single-quoted only (a documented limitation — see
   `tree-sitter-angular-template/README.md`, "Double-quoted string literals in
   expressions"); in the two contexts where the `"` cannot collide with an
   attribute delimiter, parse.ts normalizes it before the grammar sees it, the
   same way it already prose-proofs a loose `@` and quotes the wiring longhand.
3. **Where it is still unsupported** (inside an attribute value, where `"` _is_
   the delimiter), the parse error names the cause and the fix, instead of only
   saying "fix the template HTML".

Tests:

- unit — `framework/.sprig/compiler/expr-double-quotes.test.ts` (REQ-001)
- integration — `framework/.sprig/compiler/shipped-templates.test.ts` (REQ-001)
- e2e — n/a: the shipped-template sweep parses through the same `parseTemplate`
  the `sprig dev` build calls, and covers every template a `sprig dev` compiles.

---

## REQ-002 — `--help` prints help, for every subcommand, with no side effects

> "`sprig dev --help` does not print help — it STARTS a dev server in the cwd
> (registers a shared process, binds the stable port, builds). Every other
> subcommand's --help is fine to run; this one is a side effect." — report
> 20260912T142652Z-w11-14936 (#sprig), item 2

`sprig <cmd> --help` (and `-h`) prints that command's usage and exits 0
**before** the command runs. It holds for every subcommand, not just `dev` — the
dispatch switches on `Deno.args[0]` alone, so `build --help` built and
`check --help` typechecked too.

Tests:

- unit — `framework/.sprig/cli-help.test.ts` (REQ-002)
- e2e — `framework/.sprig/cli-help.e2e.test.ts` (REQ-002): runs the real CLI in
  a temp dir and asserts help on stdout, exit 0, and no dev registration/port
  bind.
- integration — n/a: the gate is one branch between argv and the dispatch; the
  unit test covers the selection and the e2e test covers "no side effect".

---

## REQ-003 — `sprig dev` honours the app's own host wrapper

> "`sprig dev` composes Bedrock({ ui, backend }) itself, so an app whose
> production entry is its own wrapper around the generated serve.ts … loses
> those routes in dev: every picture 404s. … Ask: let dev honour the app's
> wrapper — e.g. `sprig dev
> --host host.ts` (or auto-detect a host.ts beside
> serve.ts) where the file exports `wrap(handler) => handler`, or an exported
> `routes(req) => Response | null` tried before the composed app. Same bytes as
> prod, just one more layer, and dev == prod again." — report
> 20260912T142652Z-w11-14936 (#sprig), item 3

`sprig dev` layers the app's own host module over the composed app:

- `--host <file>` names it explicitly; otherwise a `host.ts` beside the
  generated `serve.ts` (the composition root) is picked up automatically.
- `routes(req, info) => Response | null` is tried **before** the composed app.
- `wrap(next) => handler` wraps the composed app.
- Explicit `--host` that names a missing file, or a module exporting neither
  hook, fails loudly. An AUTO-detected `host.ts` exporting neither is skipped
  with a warning — an unrelated `host.ts` must not break `sprig dev`.
- The dev banner prints the layer, so "dev == prod" is visible, not silent.

Tests:

- unit — `framework/.sprig/host-layer.test.ts` (REQ-003)
- integration — `framework/.sprig/host-layer.test.ts` (REQ-003), the "layered
  over a composed app" cases: a real `host.ts` on disk, resolved, imported and
  layered over a stand-in composed handler.
- e2e — n/a: a full `sprig dev` e2e needs a rune monorepo with a keep backend
  (two servers, stable ports) — the layering seam is exercised above and the
  banner line is asserted at the call site.

---

## REQ-004 — `isolate` stops its dev server on every exit path

> "sprig isolate leaks its dev server (one 'deno serve serve-dev.ts' per run,
> never torn down) — 17 of them piled up in ONE box today and slowed the whole
> Mac. … The server is never stopped. 7 of the 17 servers are ORPHANS
> re-parented to podman-init — their isolate/dev parent died and left them …
> Ask: (a) isolate stops its dev server on exit, including on error and when
> its parent dies (kill the process group / a SIGTERM handler + a pid file per
> workbench)" — report 20260917T203646Z-w354-31439 (#sprig)

Root causes, each proven before the fix:

1. `deno serve` shuts down gracefully on SIGTERM: it waits for open
   connections. The HMR event stream (`/_sprig/hmr`, held open by any browser
   or Playwright page) never ends, so a SIGTERM'd server never exits (measured:
   gone in 128 ms with no stream open, still alive after 8 s with one).
   `isolate dev` sent SIGTERM and exited at once, leaving the server behind.
2. `isolate test` called `Deno.exit` inside a `try`; the `finally` that kills
   its server never ran, so every run orphaned a server on a random 3000–6999
   port (the report's 5685 / 4562 / 6742).
3. `sprig isolate` had no signal handler: `kill <pid>` (the documented way to
   stop it) ended the top process only, and the chain below it lived on.
   Nothing anywhere noticed a dead parent.

Obligations:

- Every spawner in the chain (`sprig isolate` → `isolate dev` →
  `deno serve serve-dev.ts`; `isolate test` → `deno serve`) stops its child
  before it exits — on normal exit, on error, and on SIGINT/SIGTERM/SIGHUP:
  SIGTERM, a bounded grace, then SIGKILL.
- The dev server exits promptly on SIGTERM even with HMR clients attached.
- A process whose parent dies without warning (SIGKILL, OOM) notices and tears
  itself and its own children down (`SPRIG_PARENT_PID` + a ppid watchdog).
- A pid file per workbench (`<SPRIG_WB_ROOT>/isolate.json`) records the live
  server (pids, port, URL, project) and is removed at teardown.

Tests:

- unit — `framework/.sprig/supervise.test.ts` (REQ-004): SIGTERM→grace→SIGKILL
  escalation, the ppid watchdog, the pid file round-trip.
- integration — `framework/.sprig/supervise.test.ts` (REQ-004): a real
  parent→child chain where the parent is SIGKILLed and the child exits; and
  `isolate test` against a fixture app with a stub Playwright runner leaves no
  server behind.
- e2e — `framework/.sprig/isolate-teardown.e2e.test.ts` (REQ-004): the real
  `sprig isolate` with an HMR client attached, SIGTERM'd and SIGKILL'd; the
  port closes and no `serve-dev.ts` survives.

---

## REQ-005 — a workbench with a live server is reused, not duplicated

> "(b) a run that already has a live server for that workbench reuses it
> instead of starting another … Nothing is reused: the same workbench
> (wb-4102, wb-4106, wb-4107) got a NEW server per run instead of the existing
> one." — report 20260917T203646Z-w354-31439 (#sprig)

- `sprig isolate` / `isolate dev` for a `SPRIG_WB_ROOT` whose `isolate.json`
  names a server that still answers `GET /__sprig/isolate` for that same
  workbench root prints that server's URL and pid and exits 0 without starting
  anything.
- A stale `isolate.json` (no answer, or a different server on that port) is
  removed and a fresh server starts.
- A live server for a different project in the same workbench root is not
  reused; the run warns and starts its own.

Tests:

- unit — `framework/.sprig/supervise.test.ts` (REQ-005): live / stale /
  foreign-server resolution of the pid file against a real listener.
- e2e — `framework/.sprig/isolate-teardown.e2e.test.ts` (REQ-005): a second
  `sprig isolate` on the same workbench exits 0, names the first URL, and only
  one server listens.
- integration — n/a: the resolution is one function over a file and a probe;
  the unit test runs it against a real listener and the e2e runs it through
  the real CLI.

---

## REQ-006 — an unattended workbench finishes on its own

> "(c) the isolate run must finish — find why 8 are still alive after their
> test run. … 8 'cli.ts isolate' processes still alive at 16:34, the oldest
> since 15:03 (90 min), each holding a live server." — report
> 20260917T203646Z-w354-31439 (#sprig)

Finding: `sprig isolate` is the live workbench — like `sprig dev` it serves
until stopped, and nothing in it ever ended a run. The eight were background
workbenches started by build agents (the `isolate dev &` convention) whose
agents never sent the documented `kill`. So:

- When stdin is not a terminal (an agent, CI, a `… &` job) the dev server
  exits by itself after 30 minutes with no request and no HMR client attached,
  and says so on stdout. `SPRIG_IDLE_EXIT=<minutes>` overrides; `0` disables.
  At a terminal the default is off — a person's workbench never vanishes.
- The exit propagates: the whole `sprig isolate` chain finishes with it.

Tests:

- unit — `framework/.sprig/supervise.test.ts` (REQ-006): the idle policy
  (terminal vs not, env override, `0`) and the idle clock (requests and
  attached clients reset it).
- e2e — `framework/.sprig/isolate-teardown.e2e.test.ts` (REQ-006): a
  sub-minute `SPRIG_IDLE_EXIT` makes the whole chain exit on its own with the
  idle message.
- integration — n/a: the idle timer lives inside the server process; the e2e
  exercises it end to end.
