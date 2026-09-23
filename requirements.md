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
> Ask: (a) isolate stops its dev server on exit, including on error and when its
> parent dies (kill the process group / a SIGTERM handler + a pid file per
> workbench)" — report 20260917T203646Z-w354-31439 (#sprig)

Root causes, each proven before the fix:

1. `deno serve` catches SIGTERM itself (every leaked server in the box had
   SIGTERM in its caught-signal mask): it closes the listener, then exits only
   once the event loop drains. It never drains — the HMR event stream
   (`/_sprig/hmr`, held open by any browser or Playwright page) never ends
   (measured: gone in 128 ms with no stream open, still alive after 8 s with
   one), and `serve-dev.ts`'s own file watchers run forever. Seven of the ten
   servers inspected live were exactly this: no port, 7 threads, polling inotify
   over virtio-fs for two hours — including the two under still-running
   `sprig isolate` chains, which is why those runs "hung": they awaited a child
   that would never exit. A `kill <pid>` aimed straight at the server (the
   stray-hunt the agent brief prescribed) produced them; `isolate dev` itself
   sent SIGTERM and exited at once.
2. `isolate test` called `Deno.exit` inside a `try`; the `finally` that kills
   its server never ran, so every run orphaned a server on a random 3000–6999
   port (the report's 5685 / 4562 / 6742).
3. `sprig isolate` had no signal handler: `kill <pid>` (the documented way to
   stop it) ended the top process only, and the chain below it lived on. Nothing
   anywhere noticed a dead parent.

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
  `sprig isolate` with an HMR client attached, SIGTERM'd and SIGKILL'd; the port
  closes and no `serve-dev.ts` survives.

---

## REQ-005 — a workbench with a live server is reused, not duplicated

> "(b) a run that already has a live server for that workbench reuses it instead
> of starting another … Nothing is reused: the same workbench (wb-4102, wb-4106,
> wb-4107) got a NEW server per run instead of the existing one." — report
> 20260917T203646Z-w354-31439 (#sprig)

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
- integration — n/a: the resolution is one function over a file and a probe; the
  unit test runs it against a real listener and the e2e runs it through the real
  CLI.

---

## REQ-006 — an unattended workbench finishes on its own

> "(c) the isolate run must finish — find why 8 are still alive after their test
> run. … 8 'cli.ts isolate' processes still alive at 16:34, the oldest since
> 15:03 (90 min), each holding a live server." — report
> 20260917T203646Z-w354-31439 (#sprig)

Finding: `sprig isolate` is the live workbench — like `sprig dev` it serves
until stopped, and nothing in it ever ended a run. The eight were background
workbenches started by build agents (the `isolate dev &` convention) whose
agents never sent the documented `kill`. So:

- When stdin is not a terminal (an agent, CI, a `… &` job) the dev server exits
  by itself after 30 minutes with no request and no HMR client attached, and
  says so on stdout. `SPRIG_IDLE_EXIT=<minutes>` overrides; `0` disables. At a
  terminal the default is off — a person's workbench never vanishes.
- The exit propagates: the whole `sprig isolate` chain finishes with it.

Tests:

- unit — `framework/.sprig/supervise.test.ts` (REQ-006): the idle policy
  (terminal vs not, env override, `0`) and the idle clock (requests and attached
  clients reset it).
- e2e — `framework/.sprig/isolate-teardown.e2e.test.ts` (REQ-006): a sub-minute
  `SPRIG_IDLE_EXIT` makes the whole chain exit on its own with the idle message.
- integration — n/a: the idle timer lives inside the server process; the e2e
  exercises it end to end.

---

## REQ-008 — a root-mounted UI serves `/` itself; it never redirects `/` to `/`

> Found by the merge gate (`deno test -A` refuses any failure, pre-existing or
> not): `app/spine.test.ts` "SSR / → 200" had been red on develop since the
> Frontend seam (382c21a; CI runs only `framework/` + `packages/`). The
> workbench's own `serve.ts` mounts at base `""`, and `GET /` answered
> `302 Location: <the same URL>`. `Frontend()`'s handler redirects `/` to
> `new URL(base, url)`; with an empty base that is the request itself — a
> self-loop. The exported `derivedRedirect()` beside it carries the right guard
> ("a ROOT mount means the app is already at `/`") but nothing calls it. Live:
> every workbench answered 302 on `/` (the reporter's orphans, and the trunk
> reproduction under REQ-004). Not part of the report; fixed here because the
> merge gate needs the suite green.

- With `base` `""` or `"/"`, `GET /` falls through to the SSR app (200, the
  shell), with no `Location` header.
- With any other base, `/` still 302-redirects to the base (unchanged;
  `packages/keep/frontend.test.ts` "root redirects to base").

Tests:

- unit — `packages/keep/frontend.test.ts` (REQ-008): a base-`""` Frontend serves
  `/` itself.
- integration — `app/spine.test.ts` (REQ-008): the composed workbench `serve.ts`
  answers `/` with the rendered shell and discovery data.
- e2e — n/a: the same composition runs under `sprig isolate`; the spine test
  drives the real composed handler.

---

## REQ-007 — the Playwright runner lives in the cache dir, never a new dot-dir under `$HOME`

> "sprig isolate keeps its Playwright runner in a NEW top-level dot-dir,
> $HOME/.isolate-runner (main/cli/lib/runner.ts:28,
> server/src/core/business/runner/mod.ts:11). In a box every Bash-tool command
> runs under guardsh's Landlock backstop, whose write roots are an explicit
> allow-list — $HOME itself cannot be one without opening sibling worktrees — so
> 'mkdir $HOME/.isolate-runner' failed with EACCES for a ppwk-crm box today …
> the durable fix is on your side: keep the runner under a dir sprig already
> owns — $HOME/.sprig/isolate-runner — or honour XDG_CACHE_HOME (boxes bake
> /opt/cache/xdg, already a write root), with the old path as a fallback for
> existing installs. Any new dot-dir a tool invents straight under $HOME will
> hit the same wall." — report 20260917T194625Z-w6-76929 (#sprig)

The runner dir (`@playwright/test` + `rxjs` + `isolate-events`) is resolved by
ONE rule, shared by the CLI's `ensureRunner` and the server's `runnerStatus` /
`runTests` (`server/src/core/business/runner/dir.ts`):

1. `ISOLATE_RUNNER_HOME` — the env var `testing.rune` already declared as the
   runner's `[SRV]` — is used as given, always.
2. `$XDG_CACHE_HOME/sprig/isolate-runner`, else `~/.cache/sprig/isolate-runner`
   (the XDG default) — the preferred location. NOT `~/.sprig/…`: `sprig update`
   swaps the whole `SPRIG_HOME` dir aside and deletes it (`swapIntoRuntime`),
   which would wipe the runner on every update.
3. The legacy `~/.isolate-runner` is used only when it is already provisioned
   (has `node_modules/.bin/playwright`) and the preferred dir is not — existing
   installs keep working with no re-download. It is never created.

A runner dir that can't be created (EACCES) is a warning naming the dir and the
two knobs, and `ensureRunner` reports not-ok — never an uncaught exception.
Every message that names the runner names the RESOLVED dir, not a hardcoded
`~/.isolate-runner`; `GET /runner-status`'s `path` is the runner dir itself.

Tests:

- unit — `server/src/core/business/runner/dir.test.ts` (REQ-007): the
  resolution rule; `server/src/core/business/runner/test.ts` (REQ-007):
  `runnerStatus` reports and `runTests` spawns from the resolved dir.
- integration — `cli/lib/runner.test.ts` (REQ-007): `ensureRunner` on a real
  filesystem with a stub `npm` on PATH: provisions under `XDG_CACHE_HOME` with
  a read-only HOME, reuses a provisioned legacy dir, honours
  `ISOLATE_RUNNER_HOME`, and reports an unwritable dir without throwing.
- e2e — `cli/lib/runner.e2e.test.ts` (REQ-007): the real `isolate test` CLI
  with a read-only HOME and `XDG_CACHE_HOME` set: no EACCES, the runner dir is
  carved under XDG, nothing under `$HOME/.isolate-runner`, and the failure
  message names that dir.

---

## REQ-004 — AMENDMENT: the e2e waits for the supervisor's "ready" line before it kills the server

> Surfaced by the first `publish.yml` run after promoting REQ-004..008
> (runs 35288438842, both attempts): "REQ-004 (e2e): SIGTERM aimed straight at
> the dev server …" failed with exit code 1 instead of 0 — the chain printed
> "✗ isolate: the dev server exited before it was ready (exit 0)". Green in
> the box's merge gate, red on every CI run.

The e2e's `waitHealthy` only probed the port. The supervisor (`isolate dev`)
learns readiness from its own health poll every 250 ms, then writes the live
record and prints `◆ isolate ready →`. A SIGTERM that lands between the
listener coming up and that poll is, to the supervisor, a server that died
before it was ready — exit 1, which is the correct product behaviour and not
the scenario under test. The same window would let a second run miss the live
record. The e2e now waits for the supervisor's ready line as well as the port
before it acts. No product change.

Tests:

- e2e — `framework/.sprig/isolate-teardown.e2e.test.ts` (REQ-004): all four
  cases sequence on the ready line; proof is the CI run going green.
- unit / integration — n/a: the change is inside the e2e's own readiness
  helper; the supervisor's readiness and the live record already have their
  tests under REQ-004/005.

---

## REQ-010 — the generated-serve.ts marker counts only as the file's first-line banner

> Filed as coms ticket `20260921T181052Z-w5-55966` on #sprig by the infra box:
> "sprig build 2.1.3 OVERWRITES a hand-owned serve.ts that has no
> BEDROCK_SERVE_MARKER. infra's serve.ts documents the opposite guarantee ('the
> toolchain refuses to overwrite a serve.ts without the marker, so this file
> survives sprig build') and 2.1.3 rewrites it anyway: InfraFrontend() ->
> Frontend(), the globalThis.__firebaseConfig publication dropped, and the marker
> stamped in. … SECURITY CONSEQUENCE: the generated root stops publishing the
> keystone project id, so with no FIREBASE_PROJECT_ID in env the auth unit's
> projectId resolves empty, takes its hermetic branch and ACCEPTS A TOKEN-LESS
> LOGIN … the marker check looks like the real fix."

`isGeneratedServe` tested `src.includes(BEDROCK_SERVE_MARKER)` — the marker
anywhere in the file. So any MENTION of the marker's NAME counted as the marker,
including a file whose whole point was explaining that it has none. infra's
hand-owned composition root opens with

```
// It carries no BEDROCK_SERVE_MARKER, and that is the point: the toolchain
// refuses to overwrite a serve.ts without the marker, so this file survives
// `sprig build`.
```

and that sentence is exactly what made the build treat it as generated and
clobber it (proof: `git show HEAD:serve.ts` on the reporter's box, line 3).

Both generators write the marker as the file's FIRST LINE and as the first thing
on it — `// BEDROCK_SERVE_MARKER — the composition root at the git root.`, and
before it the 1.x `// GENERATED by \`sprig build --rune\` — …`. So that is what
the test is now: after an optional BOM, the first line must be a `//` comment
whose text STARTS WITH a marker. Prose is inert; every generated root, 2.x and
1.x, is still recognized — for regeneration and for `sprig clean`.

The refusal is total and stays first: `emitRuneComposition` runs before anything
else in `build()`, and the guard is reached before the only writes in it
(`writeRuneServe` → `serve.ts` + the `/serve.ts` .gitignore entry,
`ensureRuneWorkspace` → the root `deno.json` `start` task and the hoist out of
`server/deno.json`). A hand-owned root therefore leaves the tree byte-identical.
The refusal message now names `sprig build --ui-only <ui>` — the way an app that
hand-owns its composition root keeps building its client bundle (the toolchain's
own workbench builds that way) — so the report's "this would happen on every
Deno Deploy build" has an answer that is not a snapshot-and-restore wrapper.

Tests:

- unit — `framework/serve-marker.test.ts` (REQ-010): the predicate. A prose
  mention (including infra's real header) is not a marker; a 2.x banner, a 1.x
  banner, a BOM'd and a CRLF file are; a marker on line 2+ is not.
- integration — `framework/serve-marker.int.test.ts` (REQ-010): the real CLI on
  a composed temp repo. A hand-owned root → exit 1 and every file byte-identical
  (serve.ts, deno.json, server/deno.json, no .gitignore); a generated root → past
  the guard and regenerated; `sprig clean` removes the generated root and spares
  the hand-owned one.
- e2e — `framework/serve-marker.e2e.test.ts` (REQ-010): the ticket's own repro —
  infra's actual `serve.ts` (`InfraFrontend()`, the `__firebaseConfig`
  publication, the "no BEDROCK_SERVE_MARKER" header) under the deploy preset's
  own command `sprig build --rune`: exit 1, the file byte-identical, the ui slot
  and the project-id publication intact, no `/serve.ts` in `.gitignore`.

---

## REQ-011 — SUPERSEDED by REQ-010

Reserved for "the marker is a LINE of the generated root, never a word in its
prose" — the first of the two defects in coms `20260921T184230Z-w5-73419`, the
root-cause follow-up to `20260921T181052Z-w5-55966`. REQ-010 landed the same fix
from the original ticket while this branch was in flight, and it landed the
stricter reading: the marker is the file's first-line BANNER. That is the one in
the tree; this branch dropped its own predicate and its tests rather than keep
two.

What this branch kept from it is in REQ-012's refusal message: composing your own
unit is no longer a reason to hand-own the file, so the refusal says so and names
the banner.

No tests — the behaviour is REQ-010's, held by `framework/serve-marker.*.test.ts`.

---

## REQ-012 — a build must never remove the app's own `ui:` unit, either

> "The bigger one: writeRuneServe hardcodes ui: Frontend() at cli.ts:1415, so a
> custom ui unit is deleted every build — the exact failure existingAuthSlot
> exists to prevent, and your own comment at cli.ts:1410 argues it for me ('A
> build must never remove auth'). infra composes InfraFrontend(), which serves
> /firebase-config.* and /authz/* and publishes globalThis.__firebaseConfig;
> losing that makes the auth unit resolve an empty projectId and ACCEPT A
> TOKEN-LESS LOGIN, and the deploy preset runs sprig build --rune so it lands in
> prod." — report 20260921T184230Z-w5-73419 (#sprig), defect 2

REQ-010 stops the build from touching a root it did not write. This is the other
half: what a build does to a root it DID write. Regeneration carries the app's own
slots across — `auth:` (already) and now `ui:`. The build's `Frontend()` is only
the DEFAULT, for a root that composes no ui unit of its own. The build owns
exactly one slot, the backend it just composed, because that is the only one it
can see.

So an app that only wants its own `ui:` unit does not have to hand-own the file to
keep it: it keeps the banner, the build keeps maintaining the root, and the unit
survives. The refusal in REQ-010 says that, and reserves `--ui-only` for what
regeneration genuinely cannot preserve — a root that runs code before it composes
(infra's `globalThis.__firebaseConfig = …`, which is why THAT app stays
hand-owned).

The slot reader is shared by both slots and reads a **balanced** argument list, so
a configured unit (`Frontend({ app: build({ x: 1 }) })`) is carried whole instead
of truncated at the first `)` into a root that does not parse; an unbalanced or
un-imported slot is left alone rather than half-copied. `auth-slot.ts` became
`framework/.sprig/serve-slots.ts` — both slots, one reader — next to REQ-010's
`serve-marker.ts`: which file may be rewritten is one question, what the rewrite
carries is the other.

Tests:

- unit — `framework/serve-slots.test.ts` (REQ-012): a custom unit and its import,
  the default reading back as itself, an object argument, a nested call, an
  unbalanced list, a symbol with no import, no ui slot, no file — plus the auth
  cases the module already held.
- integration — `framework/serve-slots.int.test.ts` (REQ-012): the real CLI on
  REQ-010's minimal composed tree — the regenerated root keeps `ui: MyFrontend({
  base: "/" })` and `auth: AlfredAuth()` with their imports, a root with no ui
  unit still gets the default `Frontend()`, and a second build is byte-stable.
- e2e — `framework/serve-slots.e2e.test.ts` (REQ-012): a real `sprig init` app
  whose root takes over the ui slot, then a real `sprig build --rune` — the unit
  survives and the regenerated root typechecks.
- docs — `docs/sprig/migrating-1x-to-2x.md` §3a: owning the `ui:` slot is not
  owning the file (no test: it restates the behaviour the three above hold).

---

## REQ-014 — a hand-owned composition root gets ONE instruction: `sprig build --ui-only <ui>`

> "'the wrapper is the only configuration that works on the released CLI' is not
> accurate — box 198 … pointed us at 'sprig build --ui-only ui', which never
> enters the composition, and I VERIFIED it on shipped 2.1.3: serve.ts,
> server/deno.json and the ignore file byte-identical after a build. Your two
> tickets currently give infra opposite instructions about the wrapper;
> --ui-only is the one I can demonstrate. ALSO … infra's root RUNS TOP-LEVEL
> CODE (serve.ts:32 publishes the keystone Firebase config on globalThis before
> composing …). So regeneration can never work for us no matter how well the
> ui/auth slots are carried across — we are a concrete instance of your section
> 3a second case, and the thing that puts us there is one easily-overlooked
> line." — coms ticket `20260921T191537Z-w5-86466` (#sprig), the infra box,
> replying to REQ-010 (box 198) and REQ-011/012 (box 199)

Two fixes for the same clobbered root were written in parallel and told the same
app two different things: REQ-010's refusal named `sprig build --ui-only <ui>`;
REQ-011's named the marker-line opt-in, and its ticket called the reporter's
snapshot-and-restore wrapper "the only configuration that works on the released
CLI". The reporter is right: `--ui-only` calls the plain build with the
composition flag off, so `emitRuneComposition` — the only place serve.ts, the
`/serve.ts` ignore entry, the `start` task and the `server/deno.json` hoist are
written — is never reached; its one config write is the pin stamp. That held on
shipped 2.1.3 and holds here.

And the opt-in is not enough for a root that does anything besides compose:
regeneration carries the `ui:` and `auth:` slots and NOTHING else, so a root
with one line of top-level code before `Bedrock()` (infra publishes its Firebase
config on `globalThis` there) is hand-owned for good. So:

- the refusal — `handOwnedRefusal` in `framework/.sprig/serve-marker.ts`, so it
  is testable without running the CLI — gives ONE instruction first,
  `sprig build --ui-only <ui>` with the app's own ui dir, names top-level code as
  what puts a root there, and only then mentions the marker banner, for a root
  that is nothing but the one `Bedrock()` call. It never suggests a wrapper.
- `docs/sprig/migrating-1x-to-2x.md` §3a keeps its four cases but in the
  refusal's order: refuse → hand-own on purpose (top-level code → `--ui-only`) →
  only your own `ui:` unit (the banner) → post-process (wrap). `sprig --help`
  says the same for `--ui-only`.
- the 1.x migration note is decided by the banner line (`isLegacyServe`), pinned.

Layout, decided rather than merged: develop landed both fixes as
`framework/.sprig/serve-marker.ts` (REQ-010, kept whole) plus
`framework/.sprig/serve-slots.ts` (REQ-012) while this branch was cut; an
earlier revision of this branch had merged an older `serve-root-slots` tip and
would have deleted `serve-marker.ts` with no conflict — while `cli.ts`,
`serve-marker.test.ts` and `deno.json`'s publish include still named it (box
199, relayed by the reporter). develop's layout is the one kept; REQ-014 sits on
top of it, and `framework/publish-include.test.ts` makes that class of silent
drop a red test: every publish.include entry exists, every relative module
`cli.ts` imports is included. (The CRLF claim in that earlier revision is
withdrawn: develop's `banner()` already strips a BOM and splits on `\r?\n`,
under REQ-010's own test.)

Tests:

- unit — `framework/serve-marker.test.ts` (REQ-014): infra's real root
  (top-level code) is hand-owned and its refusal names `--ui-only` for its own
  ui dir and names top-level code; the refusal puts `sprig build --ui-only <ui>`
  before `BEDROCK_SERVE_MARKER` and never says wrap; a 2.x root quoting the 1.x
  banner in prose is generated and not legacy; §3a routes every paragraph naming
  top-level code to `--ui-only`, lists the `--ui-only` case before the
  marker-line case, and names top-level code in it.
- unit — `framework/publish-include.test.ts` (REQ-014): every
  `publish.include` entry exists on disk; every relative module `cli.ts` imports
  is in `publish.include`.
- integration — `framework/serve-marker.int.test.ts` (REQ-014): the real CLI,
  `sprig build --ui-only ui` on a composed tree whose hand-owned root runs
  top-level code: the guard is never reached, serve.ts / server/deno.json / the
  `start` task untouched, no `.gitignore` written.
- e2e — `framework/serve-marker.e2e.test.ts` (REQ-014): the reporter's own
  verification on this CLI — a real `sprig init` scaffold with infra's actual
  root dropped in, `sprig build --ui-only ui` → exit 0, the bundle
  (`client.js`, `app.css`, `templates.json`) built, serve.ts / server/deno.json /
  `.gitignore` byte-identical, the root deno.json's tasks/workspace/unstable
  unchanged; then plain `sprig build` on the same tree → exit 1, naming
  `sprig build --ui-only ui`, still byte-identical.

---

## REQ-015 — a declined pin stamp says so: one line on stderr

> "deno.json is JSONC and Deno accepts comments (`deno task` exits 0), but with
> a comment in the file the stamp SILENTLY SKIPS - comments survive (good, that
> is the safe call), pin left stale at 2.1.2, exit 0, and NOTHING is printed: no
> `stamped` line, no warning, no mention of deno.json. The identical file
> without the comment stamps normally. So a repo that annotates its deno.json
> never gets re-pinned and is never told. One line on stderr when the stamp
> declines would close it." — coms ticket `20260921T205912Z-w5-115272`
> (#sprig), the infra box (the same ticket retracts its earlier "`sprig dev`
> rewrites deno.json" report: that was one stale pin being stamped once, by
> design, and the stamp is idempotent — confirmed here)

`stamp()` reads each `deno.json(c)` on the way up with `JSON.parse` and, when
that fails, declines to rewrite it — right, since it cannot round-trip what it
did not parse. It now also says so, once per file, only when declining changed
something: `declinedStampNotice` reads the `@techgoose-labs/sprig` mappings out
of the TEXT (`sprigImportsInText`) and runs the ordinary `stampImports`
decision over them, so a current pin, a missing mapping, a local override and a
pin ahead of the CLI stay silent exactly as they would for a parseable file.
The line names the file, the pin it keeps and the CLI version it is behind.

Tests:

- unit — `framework/.sprig/pin-stamp.test.ts` (REQ-015): the text reader on a
  JSONC text `JSON.parse` rejects; the notice for a stale pin (path, old pin,
  CLI version, one line); silence for a current pin, no sprig key, a local
  override, and a pin ahead of the CLI.
- integration — `framework/pin-stamp.int.test.ts` (REQ-015): the real CLI on a
  tree whose root `deno.json` carries a comment and a stale pin — the file comes
  out byte-identical, nothing claims "stamped", stderr carries the notice with
  the path, the pin and the CLI version; the same file without the comment is
  stamped, announced, and not warned about.
- e2e — `framework/pin-stamp.e2e.test.ts` (REQ-015): the reporter's experiment
  on a real `sprig init` scaffold — a comment above `"tasks"`, the pin set one
  release back, `sprig build --ui-only ui` exits 0, the comment survives, the
  pin stays, stderr says it was left unstamped; the comment removed, the same
  build stamps and announces.

---

## REQ-013 — the refusal is read in a Deno Deploy build log; `--ui-only` is per app, never a shared preset

> Filed as coms ticket `20260921T190104Z-w5-80834` on #sprig by the infra box
> (continuing 55966 / 73419): "when the fixed sprig releases, our DEPLOY build
> would start failing (exit 1 on a hand-owned root) even though the local task
> is already correct. That is the right behaviour — failing loudly beats
> shipping the bypass — but it means the exit-1 message will be read in a Deno
> Deploy build log with no TTY, so it is worth making sure it reads well there
> and names `--ui-only` unambiguously." And on the preset: "making the SHARED
> deploy preset `--ui-only` would break every app whose root is generated rather
> than committed - those need `--rune` to emit an entrypoint at all … If you did
> intend the preset to become `--ui-only` for everyone, that implies
> generated-root apps must start committing `serve.ts` — worth stating
> explicitly in `migrating-1x-to-2x.md` §3a".

The message. The refusal `writeRuneServe` prints (REQ-010, kept whole by
REQ-012's merge) already says both ways forward — the marker banner for a root
that only composes its own unit, and `sprig build --ui-only <ui>` on a line of
its own for one that hand-owns the file — with the app's real ui dir. This
requirement pins the properties a TTY-less log needs, so a later rewrite of the
text cannot lose them the way one merge candidate did (the `serve-root-slots`
message, before REQ-012 landed, named no `--ui-only` at all): the refusal is on
**stderr** and none of it on stdout; `sprig build --ui-only <ui>` is one whole
line, exactly once; the marker is named; the refusal carries no escape byte. The
tests spawn the CLI the way a deploy build runs it — stdout/stderr piped, stdin
null, `NO_COLOR` absent — and `clearEnv` is what makes "absent" true: without
it `Deno.Command` merges `env` over the parent's, and a key deleted from the
copy still reaches the child from the test runner. Deno's own coloured
`experimentalDecorators` deprecation warning, printed above the refusal, is
Deno's line and stays outside this requirement.

The docs. §3a told the reader to "point your deploy preset's build command" at
`--ui-only` — wrong for a preset shared with generated-root apps, whose deploy
has no entrypoint without the composed build (it is what emits their
`serve.ts`). `--ui-only` is per app: §3a now scopes it to the app's own build
task + deploy build command, states the two deploy shapes explicitly (generated
root: gitignored, composed build; hand-owned root: committed, `--ui-only`), and
that a shared preset stays on the composed build. Generated-root apps do not
start committing `serve.ts`.

Retracted by the reporter, on their own repro: `sprig dev` "rewriting"
`deno.json` was one stale pin being stamped once, by build and dev alike; the
one defect in that area (a JSONC config silently skips the stamp) is its own
ticket, `20260921T205912Z-w5-115272`. Related, not this: REQ-014 (ticket
`20260921T191537Z-w5-86466`, branch `serve-root-unify`) reorders the refusal to
lead with `--ui-only`; REQ-013's tests hold for either order.

Tests:

- unit — n/a: the message is composed inline in `writeRuneServe` (cli.ts), and
  extracting it would rewrite the lines REQ-014 is rewriting in parallel; the
  integration test drives the real CLI on the same tree instead.
- integration — `framework/serve-marker.int.test.ts` (REQ-013): the real CLI as
  a build log runs it — stdio piped, stdin null, `NO_COLOR` absent via
  `clearEnv` — exit 1, the refusal on stderr (none on stdout), exactly one
  `sprig build --ui-only ui` line, the marker named, no escape byte in the
  refusal.
- e2e — `framework/serve-marker.e2e.test.ts` (REQ-013): the deploy preset's own
  `sprig build --rune` on infra's actual root, piped like a Deno Deploy build:
  exit 1, the file byte-identical, exactly one `sprig build --ui-only ui` line
  on stderr, the marker named, no escape byte.
- docs — `framework/.sprig/serve-root.docs.test.ts` (REQ-013): §3a scopes
  `--ui-only` per app (no "deploy preset's build command"), says a shared preset
  "has to stay on the composed build", and states both deploy shapes (the
  `generated` / `hand-owned` rows; "committing `serve.ts` is what makes a root
  hand-owned").

## REQ-016 — the documented deploy build command survives a hosted build: the `/cli` form

> Filed on the same ticket, coms `20260921T190104Z-w5-80834`, by the infra box
> after shipping to Deno Deploy: "The documented command does not survive a
> hosted build. Every revision of our app since 2026-08-25 failed at the
> building step with: `Task build sprig build --ui-only ui` / `sprig: command
> not found` / `Error executing build command (exit code 127)`. Cause: the sprig
> shim written by sprig install execs ~/.sprig/framework/cli.ts, so a bare sprig
> head only resolves on a machine where someone ran sprig install. Deploy's
> build container is a clean checkout. The live site silently stayed on the last
> revision that HAD built - a month stale - because deno deploy exits 0 even
> when the revision fails, so a scripted deploy looks green. What fixed it, and
> it may be worth documenting as the hosted-build form: route through the
> import map rather than PATH. deno.json imports: `"@techgoose-labs/sprig/cli":
> "jsr:@techgoose-labs/sprig@<pin>/cli"` — task build: `deno run -A
> @techgoose-labs/sprig/cli build --ui-only ui` … No action wanted; filing it
> because anyone following the --ui-only docs onto a hosted build will hit exit
> 127 and get no signal that the deploy failed."

Verified here before changing anything: the launcher `sprig install` writes is
`exec deno run -A --config ~/.sprig/deno.json ~/.sprig/framework/cli.ts "$@"`
(`framework/.sprig/install.ts`), so a bare `sprig` head resolves only where
that ran; `cliVersion()`'s own comment already calls `deno run jsr:…/cli build`
"every Deno Deploy build"; and `deno task build` with no launcher on PATH
prints exactly the reporter's `sprig: command not found`, exit 127. REQ-013's
§3a and REQ-014's refusal both told a reader to point the deploy build command
at `sprig build --ui-only ui` — a command that cannot run in the log it is read
in. "No action wanted" is the reporter's; the fix is the assignee's call, because
the guidance shipped for this ticket fails where it is followed.

The docs. §3a now gives the hosted form: a deploy's build step is a clean
checkout with no `sprig` on PATH (that launcher is what `sprig install` writes),
a bare `sprig …` task ends with `sprig: command not found` and exit 127 while a
scripted `deno deploy` still reports success; run the same CLI from jsr through
an import-map entry — `"@techgoose-labs/sprig/cli": "jsr:@techgoose-labs/sprig@<v>/cli"`,
task `deno run -A @techgoose-labs/sprig/cli build --ui-only ui` — and the same
head serves a generated root's composed build. The mapped form, not an inline
`jsr:…@X.Y.Z` in the task, because the build stamps that entry (REQ-017).

The refusal. `handOwnedRefusal` takes the CLI's version as a third argument and
names the hosted form under the local one: the same whole-line shape with the
app's real ui dir, the mapping it resolves through at the CLI's own version (a
placeholder on a jsr run, which has no version on disk), and why the bare head
fails there. REQ-013's and REQ-014's properties hold: `sprig build --ui-only <ui>`
is still the first instruction and still exactly one whole line, the marker line
still the footnote, no wrapper.

Out of scope, flagged: the scaffold's own root `deno.json` writes
`"build": "sprig build"` — the same bare head, for a generated root — so a
scaffolded app deployed with `deno task build` fails the same way; that is its
own ticket. `deno deploy` exiting 0 on a failed revision is Deno's.

Tests:

- unit — `framework/serve-marker.test.ts` (REQ-016): the refusal carries
  exactly one `deno run -A @techgoose-labs/sprig/cli build --ui-only <ui>` line
  below the local one and above the marker, names the mapping at the CLI's
  version, says `sprig install` and "hosted build", never "wrap"; with no
  version, a placeholder and never "null"/"undefined".
- integration — `framework/serve-marker.int.test.ts` (REQ-016): the real CLI as
  a build log (stdio piped, stdin null): the hosted line exactly once on stderr,
  below the local line, the mapping pinned to this checkout's version, nothing
  of it on stdout.
- e2e — `framework/serve-marker.e2e.test.ts` (REQ-016): on a scaffolded app with
  infra's root, `deno task build` under a PATH with no `sprig` launcher: the
  documented task exits 127 with `sprig: command not found`; the hosted head on
  the composed build refuses and names both lines; the hosted `--ui-only` form
  builds the bundle, leaves `serve.ts`, `.gitignore` and the task byte-identical
  and does not restamp a local `/cli` override.
- docs — `framework/.sprig/serve-root.docs.test.ts` (REQ-016): §3a gives the
  hosted line, the `/cli` mapping, the composed-build head, `sprig install`,
  127, "command not found", and that the build stamps the entry.

## REQ-017 — the stamp keeps `@techgoose-labs/sprig/cli` in lockstep with the runtime pins

> Same message: "Using the mapped specifier rather than an inline jsr:...@X.Y.Z
> matters: it puts the CLI pin on a line the stamp already rewrites, so it
> cannot drift from the bare and /bedrock entries."

It did not. `stampImports` (`framework/.sprig/pin-stamp.ts`) re-pinned exactly
two keys, `@techgoose-labs/sprig` and `@techgoose-labs/sprig/bedrock`, and
`sprigImportsInText` read only those — so a `/cli` mapping was the one sprig
entry every build left alone: the deploy built with whatever CLI the entry was
first written at, while the runtime pins moved on, and a JSONC config that
declined the stamp never mentioned it (REQ-015's notice named the first pinned
value it found, which may be the current runtime entry). Now `/cli` is a third
wanted key under the same rules — only an existing key is touched, a local
override is left alone, a pin ahead of the CLI is never downgraded — the JSONC
reader sees it, and the declined notice names the entry that is behind and the
pin it keeps. The hosted build never stamps anything: a jsr run has no version
on disk, and `stamp()` returns before reading a file.

Tests:

- unit — `framework/.sprig/pin-stamp.test.ts` (REQ-017 ×2): `/cli` re-pinned
  with the runtime entries and alone; never added; a local override and an
  ahead pin left alone; `sprigImportsInText` reads a `/cli` mapping and the
  declined notice names it with its stale pin, one line.
- integration — `framework/pin-stamp.int.test.ts` (REQ-017): the real CLI's
  `build --ui-only ui` on a root `deno.json` with a stale `/cli` pin stamps it
  with the runtime pins in one write, announced once, task untouched,
  idempotent on the second build.
- e2e — `framework/serve-marker.e2e.test.ts` (REQ-017): on a scaffolded app
  wired the reporter's way with a pin that fell behind, the local build re-pins
  `/cli` to the CLI that ran, leaves the runtime overrides and the task alone,
  and has nothing to stamp the second time.

## REQ-016 AMENDMENT — the hosted build never restamps: the pin you commit is the pin that ships

> The reporter, closing the same ticket (coms `20260921T190104Z-w5-80834`) after
> confirming the mechanism against installed 2.1.3: "a remote jsr: run has no
> install root to read a version from, so the hosted build can never restamp, by
> construction. That means production's build is precisely the one the stamp can
> never help, which is what makes a downstream lockstep test permanent rather
> than a stopgap. Might be worth a line in §3a next to the hosted form: the stamp
> does not run here, so the pin you commit is the pin that ships."

True, and REQ-016's own text was misleading on exactly that point. §3a said the
`/cli` pin "sits on a line the build stamps together with the runtime pins"
beside the hosted build command, and the refusal said "the build stamps that pin
with the runtime's (REQ-017)" right under the hosted command — both read as if
the hosted build keeps the pin current. It cannot: `stamp()` (framework/cli.ts)
reads its version through `cliVersion()`, which returns null when
`import.meta.dirname` is undefined — every jsr:/https: run — and returns before
it touches the file. Only a local `sprig build`, `dev` or `init` moves the entry.

Now: §3a credits the lead-in line to "a local `sprig build`", and the paragraph
after the snippet says the hosted build itself never restamps, why (no install
root to read a version from; `sprig: stamped …` never prints there), and what
follows — the pin you commit is the pin that ships, so build locally or re-pin
by hand before you deploy. The refusal's line under the hosted command says the
same in one sentence. Every REQ-013/014/016 property of both texts still holds.

Tests:

- unit — `framework/serve-marker.test.ts` (REQ-016 AMENDMENT): with and without
  a version, the refusal says "the pin you commit is the pin that ships" and
  "hosted run never restamps", credits the stamp to a local `sprig build`, no
  longer says "the build stamps that pin", places the sentence under the hosted
  command and above the marker footnote, and still has exactly one whole line of
  each command shape.
- integration — `framework/serve-marker.int.test.ts` (REQ-016 AMENDMENT): the
  real CLI's refusal as a build log carries the sentence on stderr, under the
  hosted line, nothing of it on stdout.
- e2e — `framework/serve-marker.e2e.test.ts` (REQ-016 AMENDMENT): this
  checkout's `framework/` served over 127.0.0.1 and the CLI run from that URL
  with the framework's config (the launcher's shape; `import.meta.dirname` is
  undefined exactly as on jsr; the compiler's hydrate/hmr URLs, which the bundle
  imports off the CLI's own location, mapped back to this checkout through the
  app's import map, as the scaffold already maps the runtime): the composed
  build on a hand-owned root refuses
  with the sentence and the `<version>` placeholder; `build --ui-only ui`
  builds the bundle, leaves a stale `/cli` pin and the whole `deno.json`
  byte-identical, and prints no `sprig: stamped`; the same command as a local
  build then re-pins it and announces it.
- docs — `framework/.sprig/serve-root.docs.test.ts` (REQ-016 AMENDMENT): §3a
  carries the sentence after the hosted task line and before it moves on,
  credits a local `sprig build`, no longer says "a line the build stamps", and
  says "no install root".
