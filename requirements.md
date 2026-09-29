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

## REQ-021 — the repo declares the merge gate's four tasks, and each lane reaches only its own kind

> "The gate is four tasks, by convention (REQ-278). Every repo declares
> `test:unit`, `test:int`, `test:e2e` and `serve` … there is no `n/a` lane
> (REQ-316: no exceptions). A test's kind is its filename and the gate checks
> every lane's files BEFORE running."

This repo declared none of them, so `wt-gate` refused at discovery. Now
`deno.json` declares `test:unit`, `test:int`, `test:e2e` — each
`deno run -A scripts/lane.ts <lane>` (object form, described
`parallel: deno test --parallel underneath`) — and `serve`
(`deno serve -A --unstable-kv --port $PORT serve.ts`; the gate always exports
`PORT`, and `start` stays the human's default-port task). `scripts/lane.ts`
classifies every test file git sees by the gate's filename rule (`*.smk.test.*`
smoke, never run; `*.e2e.test.*` or under `e2e/` e2e; `*.int.test.*` /
`*.docker.test.*` int; else unit), answers `--plan` with one path per line,
and otherwise runs `deno test -A --parallel` over exactly those files. A bare
`deno test` line could not do this: positional paths cannot exclude a kind,
and the gate skips `--ignore`. `env/example` and `env/dev` carry the required
`DENO_DEPLOY` key (empty — fakes); `.gitignore` tracks only `env/example`.

Tests:

- unit — `scripts/lane.test.ts` (REQ-021 ×2): `kindOf` mirrors the gate's
  rule for every kind; `laneFiles` keeps only test files of the lane's kind
  and never a smoke test.
- integration — `scripts/lane.int.test.ts` (REQ-021 ×4): the real script's
  `--plan` for each lane lists only files of that kind, all present on disk,
  none empty; an unknown lane exits 2.
- e2e — n/a: the gate itself (`wt-gate --plan`, run by hand: discovery,
  parallel and kinds all OK) is the end-to-end consumer; nothing serves a page.

## REQ-033 — the breakdown writes a machine-read inventory, keeps logic out of the client rubric, and is not done until `sprig spec-check` passes

> "the app stays dry, meaning that components are reused whenever reasonable",
> "the logic of the app stays in the backend meaning NO business logic at all
> goes in the frontned", "is there any way that this can be hardened?" → "lets
> spawn opus 5.5 agents to do all this"

The breakdown analyst's inventory lived only in its return to the orchestrator,
the usage matrix only in Markdown, and the closing audit merely reported an
Unassigned list. Now the opening pass writes `spec/ui/breakdown/inventory.json`
(units with name/dir/classification/scope/page/usedOn/tier/evidence/dataNeeds,
plus `unassigned`) — the same inventory it returns — and the binding is the
table `| unit | need | kind | endpoint | dto |` plus a `## Drift` section. The
island rubric no longer lists client filter/sort or inline validation: filter,
sort, search and paging are bound query endpoints, client validation is
required/type only, every other rule is a command the backend validates. The
tier derives from the prototype's `commands.json` `feedback` field; with a
design system the analyst binds each mock region to a named primitive from
`spec/ui/design-system/components.md` and records it in the unit's evidence.
The closing pass runs `sprig spec-check spec/ui/breakdown` and the breakdown is
not done until it exits 0 (a non-empty Unassigned fails). The `ui-breakdown`
interface's Validation names the real commands.

Tests:

- unit — `framework/.sprig/skills-hardening.test.ts` (REQ-033 ×6): the
  analyst names `inventory.json` and every format-A key; analyst + interface
  carry the binding header and `## Drift`; the rubric drops "client
  filter/sort" / "inline validation" and states queries / required-type /
  commands; the `feedback`-derived tier and the design-system primitive
  binding; analyst, breakdown SKILL and interface run `sprig spec-check` and
  no longer say the Unassigned list "ships even when empty"; no touched prompt
  carries a retired-path word.
- integration — n/a: docs; the commands they name are tested by their owners.
- e2e — n/a: docs; no page serves them.

## REQ-034 — breakdown cases carry tier, viewport, theme, reference, motion and failure keys

> "the app will be faithful to the mock", "the app is optimistic and does not
> have latency waiting on the server to run its logic"

The spec-writer's stills were diff targets a builder looked at. Now every case
carries `_tier`; each breakpoint/theme still becomes a case with
`_viewport`/`_theme` and `_reference` pointing at the captured still; a unit
with extracted motion gets `_motion` pointing at capture's `motion.json`; every
optimistic-write unit gets a `pending` case and a `rolled-back` case whose
`_network` fails its command. Capture names every still
`screenshots/<name>@<width>.png` / `screenshots/<name>@<width>-<theme>.png` so
the spec-writer's `_reference` paths line up. Keys per
`references/isolate-format.md`.

Tests:

- unit — `framework/.sprig/skills-hardening.test.ts` (REQ-034 ×3): the
  spec-writer names every key and the isolate-format reference; the
  `pending`/`rolled-back` pair with `_network` failing the command; capture and
  spec-writer share the still naming and `motion.json`.
- integration — n/a: docs.
- e2e — n/a: docs.

## REQ-035 — build proves fidelity, optimism and logic placement by commands, not by eye

> "the app will be faithful to the mock", "the app is optimistic and does not
> have latency waiting on the server to run its logic", "the logic of the app
> stays in the backend meaning NO business logic at all goes in the frontned",
> "the app stays dry, meaning that components are reused whenever reasonable"

The builder compared two images and could "accept a deviation"; templates.md
told it to derive anything non-trivial in `logic.ts`; the whole-app step had no
coverage check. Now the builder's visual check is the `_reference` row of
`isolate test --json` (a deviation is a widened tolerance with a `reason` the
report prints); every server write uses `optimistic(sig, next, call)`; every
unit's green includes `sprig check ui` with its lints; templates.md says derive
nothing domain-shaped in the client, `logic.ts` holds UI state only; step 3 runs
`sprig spec-check spec/ui/breakdown --built ui/src --compose` and `sprig check
ui`, red on any finding; the cheatsheet carries the suppression comments; the
`sprig-app` interface's Validation names both commands.

Tests:

- unit — `framework/.sprig/skills-hardening.test.ts` (REQ-035 ×5): the
  builder drops "accept a deviation" and the MCP eyeball diff and names the
  `_reference` row and tolerance widening; `optimistic(sig, next, call)` and
  `sprig check ui` in builder + playbook; templates.md's new rule; step 3's two
  commands in the playbook, `sprig-app` interface and scaffolder; the five
  suppression comments in the cheatsheet recipe.
- integration — n/a: docs.
- e2e — n/a: docs.

## REQ-036 — each prototype command declares its feedback timing

> "the app is optimistic and does not have latency waiting on the server to run
> its logic"

`commands.json` entries were `{type, kind, input, does}` — nothing said whether
the UI may reflect an intent before the reply. Now each entry carries
`"feedback": "instant" | "confirmed"` (confirmed = the UI waits, reason in
`does`), and the prototype's call site honours it: instant renders the intent
before awaiting `window.commands.run` and reverts on rejection; confirmed shows
a pending state until the reply. The breakdown derives each unit's tier from it
(REQ-033).

Tests:

- unit — `framework/.sprig/skills-hardening.test.ts` (REQ-036 ×1): the
  prototype interface's entry shape and field, the builder's instant/confirmed
  rule, the prototype skill naming `feedback`.
- integration — n/a: docs.
- e2e — n/a: docs.

## REQ-037 — the audit sees the mock and names client-side logic and blocking writes

> "the app will be faithful to the mock", "the logic of the app stays in the
> backend meaning NO business logic at all goes in the frontned", "the app is
> optimistic and does not have latency waiting on the server to run its logic"

The audit's oracle was `user-stories.md` + the live app; it never saw the mock.
Now the hunter's inputs include the breakdown's page-level stills and
`spec/ui/breakdown/inventory.json`, and a page whose composed render departs
from its still is a bug (catalog F15). The catalog gains F14 "Domain logic in
the client" (a `sprig check` `logic-placement` finding) beside F8, and F7's
blocking write is the `optimistic-writes` finding.

Tests:

- unit — `framework/.sprig/skills-hardening.test.ts` (REQ-037 ×2): hunter and
  audit playbook name the stills and `inventory.json`; the catalog carries
  F14 (between F8 and F9), `logic-placement`, `optimistic-writes` and F15.
- integration — n/a: docs.
- e2e — n/a: docs.

## REQ-038 — the cheatsheet's "composes" lines come from the composition graph

> "the app stays dry, meaning that components are reused whenever reasonable"

The build analyst derived "composes" from the breakdown specs' prose. Now, once
units exist, it runs `sprig map --compose --json ui` and copies each unit's
children from the graph (the specs only for units not built yet); it gains the
Bash tool for that one command.

Tests:

- unit — `framework/.sprig/skills-hardening.test.ts` (REQ-038 ×1): the build
  analyst names `sprig map --compose --json ui` for its composes lines and
  lists Bash in its tools.
- integration — n/a: docs.
- e2e — n/a: docs.

## REQ-027 — the `tokens` lint holds every style to the app's design tokens

> "the app will be faithful to the mock" … "is there any way that this can be
> hardened?" → "lets spawn opus 5.5 agents to do all this"

An app's design tokens live in `ui/src/css-variables.json`, but nothing checked
that the styles actually use them: a component could hard-code `#36f` next to a
`--color-primary: #3366ff` token and drift from the mock without a word.
`lintTokens({ uiSrc })` (`framework/.sprig/compiler/lints/tokens.ts`) reads
every unit's `styles.css` and every `style="…"` attribute and `<style>` block in
every `template.html` (parsed with the compiler's own tree-sitter grammar), and
reports as errors: a raw color literal (hex, the color functions, named colors;
`transparent`/`currentColor`/CSS-wide keywords pass, a color function over
`var(` passes) with the token of exactly that value as the hint, else "add it to
css-variables.json and use var(--…)"; a `px`/`rem` length equal to a token's
value, naming the token; a `font-family` literal — off-system (listing the font
tokens) or equal to a token's value (naming it). A suppression carries a reason
(`/* sprig-token: <why> */` on the line, `<!-- sprig-token: <why> -->` before the
element) and is listed with it; a reasonless one is an error, an idle one a
warning. No `css-variables.json` → `skipped`, with the reason. Directories the
build does not compile (`_isolate`, `isolate`, `static`, `node_modules`, `dist`)
are left out by name in `notes` (`ui-files.ts`, shared with REQ-028). The
design skill's `adherence.oxlintrc.json` is not wired: it is an oxlint
`no-restricted-syntax` config whose selectors match ESTree `Literal` nodes, so
it can only read JS/TS string literals — never `styles.css` or `template.html` —
its font rule still carries `{{DisplayFont}}` placeholders, and oxlint is in
neither `deno.lock` nor the npm cache here, so running it would need a network
fetch.

Tests:

- unit — `framework/.sprig/compiler/lints/tokens.test.ts` (REQ-027 ×13): exact
  and absent token hints for hex/rgba/named colors, rgb spacing, the allowed
  keywords and `var()`, identifiers/strings/`url()` never colors, token-valued
  lengths, media preludes ignored, font-family off-system/equal/var, CSS and
  HTML suppressions with reasons, a reasonless suppression, comments ignored,
  template style lines.
- integration — `framework/.sprig/compiler/lints/tokens.int.test.ts` (REQ-027
  ×3): `fixtures/lints/tokens-clean` (no findings, one listed justification,
  `_isolate/` named as skipped), `tokens-dirty` (every offender file:line with
  its hint, one HTML suppression), `tokens-none` (skipped with the reason).
- e2e — n/a — a source lint with no page; `sprig check` wiring (and its e2e) is
  the orchestrator's.

## REQ-028 — the `duplicate-templates` lint finds components that should be one

> "the app stays dry, meaning that components are reused whenever reasonable"

Two units whose templates share a structure are the same component written
twice. `lintDuplicateTemplates({ uiSrc, threshold = 0.85 })`
(`framework/.sprig/compiler/lints/duplicate-templates.ts`) parses each
`template.html` with the compiler's tree-sitter grammar and keeps only
structure — tag names, attribute NAMES as written (`class`, `[title]`,
`(click)`, `*ngIf`, `sets:org`), control-flow keywords (`@if`, `@for`,
`@empty`, …) — dropping text, interpolations and values. Each labeled node
contributes the last 3 labels of its root-to-node path; two templates score the
Jaccard index of those shingle sets (symmetric, deterministic). A pair at or
above the threshold is an error "near-duplicate templates: A and B (0.92) —
compose one from the other, promote to shared-components/, or justify with
`<!-- sprig-duplicate: <reason> -->` in either template"; a justified pair is
listed as "justified: A ~ B (score) — <reason>", a reasonless justification is
an error and one that excuses no pair a warning. Templates under 4
element/control-flow nodes are skipped by name in `notes`.

Tests:

- unit — `framework/.sprig/compiler/lints/duplicate-templates.test.ts`
  (REQ-028 ×8): values and text never reach the structure, names and control
  flow do, wiring/binding names kept, unrelated templates score low and
  symmetric, one extra footer lowers the score, node counting, justification
  parsing, empty-set Jaccard.
- integration — `framework/.sprig/compiler/lints/duplicate-templates.int.test.ts`
  (REQ-028 ×5): `fixtures/lints/dup-app` — the two cards are one error naming
  both at 1.00, the order/invoice lists are one listed justification, the
  one-node icon is skipped by name, a threshold above every score leaves only
  the idle-justification warning, and two runs are identical.
- e2e — n/a — a source lint with no page; `sprig check` wiring is the
  orchestrator's.

## REQ-029 — `optimistic(sig, next, call)`: the UI moves first, the server catches up

> "the app is optimistic and does not have latency waiting on the server to run
> its logic" — "is there any way that this can be hardened?" — "lets spawn opus
> 5.5 agents to do all this".

The optimistic default was prose only (component-model.md's "snapshot → mutate
→ call → reconcile"), hand-rolled per island and easy to get wrong: no helper
existed anywhere in framework/, packages/ or docs/. Now
`framework/.sprig/optimistic.ts` exports one primitive, re-exported from
`@techgoose-labs/sprig` (core.ts) and listed in `publish.include`:
`optimistic<T, R>(sig, next, call, { reconcile?, onError? }) → { done, pending,
error }`. The local write is applied synchronously, before `call` starts; a
rejection (or a synchronous throw) restores the previous value, sets `error`,
and fires `onError(err, prev)` — without `onError` it is logged, never
swallowed; `pending` is true from call start to settle; on success
`reconcile(result, prev)` replaces the optimistic value with the server's
projection. Concurrent writes to one signal are last-write-wins by start order
(a per-signal ledger of the confirmed value and the writes in flight): an older
failure never clobbers a newer write, the newest failing rolls back to the next
write still in flight or to the confirmed value, and a success supersedes older
writes. Any signal-shaped value works (`(): T` + `.set(v)`).

Tests:

- unit — `framework/.sprig/optimistic.test.ts` (REQ-029 ×15): (a) same-tick
  read sees the new value and the call observes it; (b) rollback + onError,
  error signal + console.error with no onError, sync throw; (c) pending across
  success and failure; (d) reconcile and its absence; (e) four concurrent
  orderings + independence across signals; (f) a hand-rolled accessor; the
  package entry exports it and publish ships it.
- integration — `framework/.sprig/compiler/lints/optimistic-writes.int.test.ts`
  (REQ-030) lints `fixtures/lints/optimistic-clean`, whose island uses the
  primitive from `@techgoose-labs/sprig`, clean.
- e2e — n/a: a runtime primitive with no page of its own; nothing serves one.

## REQ-030 — the optimistic-writes lint: no server call awaited before the UI changes

> "the app is optimistic and does not have latency waiting on the server to run
> its logic" — "is there any way that this can be hardened?"

`framework/.sprig/compiler/lints/optimistic-writes.ts` exports
`lintOptimisticWrites({ uiSrc }): Promise<LintResult>` (and the pure
`lintOptimisticSource(src, file)`). Over every `logic.ts` under `uiSrc`, read
with the shared token scanner (`ts-scan.ts`; no TypeScript dependency, the
wiring lint's syntactic stance), every function body — arrow, `function`,
method; nested functions judged on their own — is a candidate, not only the
template-bound handlers: a helper a handler calls makes the user wait just the
same. An `await` of `fetch(`, `client.<x>(`, `.fetch(`, `.get(`, `.post(`,
`.put(`, `.patch(`, `.delete(` before the first signal write (`.set(` /
`.update(` / `.value =` / `sig(v)` on a declared signal, or `optimistic(`) is
an error at the await's file:line:col: "server write awaited before the UI
changed — use optimistic(sig, next, call) or write the signal first", naming
the function and its first write. Functions that write no signal are exempt.
`// sprig-wait: <reason>` on the await's line or the line above suppresses it
and is listed with the reason (a bare `// sprig-wait:` does not); it replaces
the prose `data-note` escape. No island / no ui dir is reported as `skipped`.

Tests:

- unit — `framework/.sprig/compiler/lints/optimistic-writes.test.ts`
  (REQ-030 ×10): positive (fetch, client.x, .fetch/.get/.post, class
  methods), negative (write first, optimistic()), exempt (no write), non-server
  awaits, nested callbacks, suppression with reason listed, bare marker not a
  suppression, strings/comments ignored.
- integration — `framework/.sprig/compiler/lints/optimistic-writes.int.test.ts`
  (REQ-030 ×3): `fixtures/lints/optimistic-clean` passes with its sprig-wait
  listed; `fixtures/lints/optimistic-dirty` fails at each file:line, printed
  through `formatLintResult` with the fix hint; an empty tree and a missing
  dir are skipped out loud.
- e2e — n/a: a source lint; nothing serves a page.

## REQ-031 — the docs teach `optimistic(...)`, not the awaited fetch

> "the app is optimistic and does not have latency waiting on the server to run
> its logic" — "is there any way that this can be hardened?"

The docs' own island example (`docs/sprig/islands.md`, "Talking to the backend
from an island") awaited the fetch before touching any state — the
anti-pattern. It is replaced by the `optimistic(...)` form with its
guarantees (synchronous write, rollback surfaced, last-write-wins) and the
`// sprig-wait: <reason>` escape. `claude/skills/sprig:build/references/component-model.md`'s
optimistic section now shows the primitive in one example, keeps the "when to
wait" guidance, and routes the escape to `// sprig-wait: <reason>` instead of
an inline `data-note`.

Tests:

- unit — `framework/.sprig/optimistic-docs.test.ts` (REQ-031 ×5): both docs
  import and show `optimistic(`; neither carries the await-first example, and
  every ```ts block in them passes the optimistic-writes lint;
  component-model.md's section names `// sprig-wait: <reason>` and no longer
  `data-note`.
- integration — n/a: documentation; the unit test reads the shipped files.
- e2e — n/a: documentation; nothing serves a page.

## REQ-024 — an unknown tag is a build error, not a silent native element

> "what mechanisms do we have to make sure that the app stays dry, meaning that
> components are reused whenever reasonable" … "is there any way that this can
> be hardened?" → "lets spawn opus 5.5 agents to do all this".

The renderer resolved a non-native tag through the registry and, when nothing
answered, emitted it as a plain element (`render.ts`, the `NATIVE.has(tag) ?
undefined : opts.registry.get(tag)` fall-through) — so a typo'd `<stat-crd>`, or
a component that was renamed, deleted, or never shared, shipped as an empty
unknown element and nobody heard. `buildClient` (so `sprig build`, `sprig dev`
and the workbench build) now runs the composition check first
(`framework/.sprig/compiler/composition.ts` → `unknown-tag.ts`): every tag in
every template (and the `bootstrap/` shell) must be a standard HTML/SVG/MathML
element (the renderer's own NATIVE set, now exported as `isNativeTag`, plus the
standard names it does not list), a renderer-reserved tag (`router-outlet`,
`content`, `ng-content`, `ng-container`), or a selector registered in that
template's scope — resolved through the SAME `ScopedRegistry` the renderer
builds (`composition-registry.ts`, now shared by `mod.ts`, `build.ts` and the
check). Each offender is one `file:line error: unknown tag <x>` line naming the
scope searched and the nearest selector within edit distance 2 ("did you mean
<stat-card>?"); the build throws listing all of them. The one escape for a
genuine third-party web component is `src/custom-elements.json` (sprig reads no
app config key, so this sits beside `css-variables.json`): a JSON array of
custom-element names, validated (a name without a hyphen is refused — sprig
components never go there). Each allowed tag in use prints
`allowing <x-foo> (custom-elements)`; a listed name no template uses prints too.
A clean run prints what it checked (templates, tags, selectors). No existing
fixture used an unregistered tag; none changed.

Tests:

- unit — `framework/.sprig/compiler/unknown-tag.test.ts` (REQ-024 ×6):
  did-you-mean within distance 2; HTML/SVG camelCase/MathML known, a typo not;
  a typo fails at file:line with the suggestion and the allowlist hint while
  real markup and reserved tags pass; a page-local selector resolves on its own
  page only; the allowlist admits a tag and reports used/stale names;
  `custom-elements.json` absent → null, malformed or hyphen-less → throws
  naming the entry. `composition.test.ts` (REQ-024/REQ-025 ×2):
  `assertComposition` prints the allow line and its summary, and throws one
  error listing every offender.
- integration — `framework/.sprig/compiler/composition.int.test.ts` (REQ-024
  ×2): the real CLI's `build --ui-only` on a copy of
  `fixtures/composition-app` with `<stat-card>` typo'd exits 1 naming
  `src/pages/dashboard/template.html:2`, the tag and `<stat-card>`; the clean
  fixture builds and prints `allowing <x-foo> (custom-elements)`.
- e2e — n/a: a build-time check; no page is served — the integration test
  drives the real CLI end to end.

## REQ-025 — shadowing a shared selector needs an explicit opt-in

> "what mechanisms do we have to make sure that the app stays dry, meaning that
> components are reused whenever reasonable" … "is there any way that this can
> be hardened?"

A page-local component (`pages/<p>/components/<name>/`) whose selector equals a
shared one's replaced the shared component on that page with no word — the
page registry resolves page-local first (`mod.ts` `registryForPage`), so the
reuse the shared component exists for was forked silently. The build now
refuses it (`framework/.sprig/compiler/shadow.ts`, run by the same
composition check): one `file:1 error` line naming the page-local folder, the
shared folder and the page, with the three fixes — reuse the shared one,
rename, or opt in. The opt-in is the page-local `template.html` opening with
`<!-- sprig-shadows: <reason> -->` (an empty reason is refused); an opted-in
shadow prints `<page>/<selector> shadows shared <selector>: <reason>` on every
build. A page mounting its own same-named island
(`pages/workbench/components/workbench/`) is not a shadow — the global of that
name is the page itself.

Tests:

- unit — `framework/.sprig/compiler/shadow.test.ts` (REQ-025 ×4): the marker
  is the leading comment only; an undeclared shadow is refused naming both
  folders, an empty reason too; an opted-in one passes with the exact line;
  the page-owns-its-island pattern is not a shadow.
- integration — `framework/.sprig/compiler/composition.int.test.ts` (REQ-025
  ×2): the real CLI build refuses the fixture with the marker removed (exit 1,
  both folders named) and prints `dashboard/card shadows shared card: …` on
  the opted-in fixture.
- e2e — n/a: a build-time check; no page is served.

## REQ-026 — the composition graph: who composes whom, from the renderer's own resolution

> "what mechanisms do we have to make sure that the app stays dry, meaning that
> components are reused whenever reasonable" → "lets spawn opus 5.5 agents to
> do all this".

`sprig map` drew only wiring channels; nothing showed which pages reuse which
components. `framework/.sprig/compiler/composition.ts` exports
`compositionGraph(appDir)` → `{ pages: { <name>: { dir, composes } },
components: { <key>: { dir, scope, page?, composes, composedBy } } }` (a shared
component keyed by selector, a page-local one as `<page>/<selector>`), built by
resolving every template tag through the renderer's `ScopedRegistry` — ground
truth, not a regex. `renderCompositionMap(g)` prints one line per unit (pages,
then shared, then page-local): `page dashboard → composes: …`,
`shared/confirm-dialog ← composed by: dashboard, settings; composes: card`, and
says so when nothing composes a component. `compositionGraphJson(g)` is the
stable sorted-key JSON form. The `sprig map --compose [--json]` wiring in
`cli.ts` is left to the orchestrator.

Tests:

- unit — `framework/.sprig/compiler/composition.test.ts` (REQ-026 ×4): the
  shared registry's page-local-first resolution and duplicate refusal; the
  fixture's graph (pages, shared and page-local components, composedBy); the
  exact text map; the JSON form sorted, stable and round-tripping.
- integration — `framework/.sprig/compiler/composition.int.test.ts` (REQ-026):
  after the real CLI builds the fixture app, its graph and map show what the
  templates compose.
- e2e — n/a: no page is served; the map is CLI text.

## REQ-022 — with a contract, the UI reaches the backend only through the typed client (`contract-calls` lint)

> "the logic of the app stays in the backend meaning NO business logic at all
> goes in the frontned" — "is there any way that this can be hardened?" —
> "lets spawn opus 5.5 agents to do all this"

When `<git-root>/spec/contract/client/` exists, the contract is the only way
the UI talks to the backend. `lintContractCalls({ uiSrc, gitRoot })`
(`framework/.sprig/compiler/lints/contract-calls.ts`) reads every non-test
`.ts` under the ui source and reports, as `error` findings with file:line:col:
a `fetch(` whose URL is a string or template literal (`globalThis.`/`window.`
/`self.fetch` included); any `fetch(` at all in an island `logic.ts` (islands
go through the client too); `inject(Backend)` not passed straight into
`createClient(...)`; and `.get(` / `.get<T>(` / `.fetch(` with a literal path
on a Backend-injected value (the name it was bound to, or chained directly).
Every finding's hint is "call the typed client (spec/contract/client) — reads
are queries, writes are commands". `// sprig-contract: <reason>` on the line or
the line above suppresses it; a suppression without a reason does not count;
suppressed lines come back with their reasons. With no contract client there
is nothing to enforce, and the result says so:
`skipped: "no spec/contract/client at <gitRoot>"`. The lint is a pure function
of the filesystem (no exit); `formatLintResult` (`lints/lint-types.ts`, the
shared `Finding`/`LintResult` shapes) prints what it checked or why it
skipped, each finding with its fix, and each suppression with its reason. The
source is read with a dependency-free token scanner (`lints/ts-scan.ts`:
comments dropped, strings/templates/regex literals whole) — `npm:typescript` is
not in the lock, and the rules need only a token stream.

Tests:

- unit — `framework/.sprig/compiler/lints/contract-calls.test.ts` (REQ-022 ×6):
  literal/template fetch flagged, variable URL, comments, strings and a
  `fetch` method definition not; every island fetch flagged; `inject(Backend)`
  into `createClient` clean, otherwise flagged (field, `#private`, const);
  `.get<T>("…")`, `.fetch(\`…\`)`, chained `inject(Backend).get("…")` flagged,
  a variable path and an unrelated `Map.get("k")` not; hint, column, severity;
  suppression on the line / line above with reasons, empty reason ignored.
- integration — `framework/.sprig/compiler/lints/contract-calls.int.test.ts`
  (REQ-022 ×3): over `fixtures/lints/clean-app` (contract present) nothing, 2
  files checked; over `fixtures/lints/dirty-app` 4 findings named file:line and
  1 suppression with its reason, the printed summary line and 4 fix lines;
  over `fixtures/lints/no-contract-app` skipped with the reason, nothing found.
- e2e — n/a: a source lint with no page; `sprig check` wiring (and its e2e) is
  the orchestrator's.

## REQ-023 — no business logic in island logic.ts or page resolve.ts (`logic-placement` lint)

> "the logic of the app stays in the backend meaning NO business logic at all
> goes in the frontned" — "is there any way that this can be hardened?" —
> "lets spawn opus 5.5 agents to do all this"

`lintLogicPlacement({ uiSrc })`
(`framework/.sprig/compiler/lints/logic-placement.ts`) reads every island
`logic.ts` and page `resolve.ts` under the ui source (services are out of
scope) and reports business logic as `error` findings. The definition of
business logic, verbatim as decided:

(a) arithmetic (`+ - * / %` and compound assignments) where both operands are
identifiers/member expressions (data × data), or where one operand is a member
expression and the other a numeric literal other than 0 or 1 (rates, taxes,
thresholds). Exempt: member expressions rooted in `event`, `e`, `window`,
`document`, `el`, `this.el`, `rect`, `Math`, `Date`, or names ending in
Width|Height|Top|Left|X|Y|Index|Count|Length|Offset|Scroll — UI geometry, not
domain.
(b) domain branching: a comparison inside `if`/ternary/`&&`/`||`/`switch` where
BOTH sides are identifiers/member expressions (data vs data). Comparisons to
literals, `null`, `undefined`, `.length`, booleans are allowed (state
switching).
(c) validation beyond required/type: `.test(`, `.match(`, `RegExp`, or a
`.length` compared to a numeric literal > 1 inside an event handler. `!value`,
`=== ""`, `typeof`, `Number.isNaN` are allowed (required/type).
(d) a call to, or definition of, a function whose name matches
/^(validate|compute|calculate|derive|total|price|discount|tax|eligib|score|rank|allocate|schedule)/i
in client/resolve code.

How the implementation reads it: an operand is an identifier/member chain,
with zero-argument calls counted as reads (`this.price()` is a signal read);
a call with arguments, a string, or a parenthesised expression is not an
operand; operator precedence is respected (`rect.w / 2 + pad` does not pair
`2` with `pad`), and TS generic lists (`signal<T[]>(…)`) are not comparisons.
The geometry exemption applies to (b) as well as (a); `while` conditions and
`switch (x) { case y: }` count as branching; a named constant (`ALL_CAPS` or a
call-free `PascalCase.member`) compares like a literal. "Event handler" in (c)
is a function the sibling `template.html` binds with `(event)="name(…)"`, one
named `on…`/`handle…` (lifecycle hooks `onBrowserInit`, `onServerInit`, … are
not), one taking an `event`/`e`/`ev`/`evt` parameter, or an
`addEventListener` callback. (d) skips the `computed` primitive itself but
flags a `computed` assigned to a matching name (a derived total is a
derivation), and does not flag a zero-argument member read or a bare read of
a signal the file declares. Messages name the rule letter and end "this is a
query the backend should answer" ((a)(b)(d)) or "validate in the backend; the
client checks required/type only" ((c)). `// sprig-logic: <reason>` on the line
or the line above suppresses; suppressed lines are listed and counted with
their reasons. A missing ui source, or one with no logic.ts/resolve.ts, is
reported as skipped with why. Pure function of the filesystem, no exit.

Tests:

- unit — `framework/.sprig/compiler/lints/logic-placement.test.ts` (REQ-023
  ×12): (a) data × data incl. compound assignment; member × literal ≠ 0/1,
  `±1`/`×0`/ident × literal/unary/`++` clean; every geometry root and every
  geometry suffix exempt; strings, calls with args, generics, comments clean;
  (b) if/ternary/&&/||/while/nested parens/switch-case flagged; literals,
  null/undefined, `.length`, booleans, constants, typeof, a non-branch
  assignment, geometry clean; (c) `.test(`/`.match(`/`RegExp` flagged,
  `.replace(/re/)` and required/type checks clean; `.length > 1` only inside a
  template-bound handler, an `on…` method (not a lifecycle hook), an
  `addEventListener` callback; (d) function/method/arrow/computed definitions
  and calls flagged, signal reads, `computed` itself and imports clean;
  message text; suppression with reasons.
- integration — `framework/.sprig/compiler/lints/logic-placement.int.test.ts`
  (REQ-023 ×3): `fixtures/lints/clean-app` clean over 2 files;
  `fixtures/lints/dirty-app` 5 findings named file:line with rule letters (the
  handler found through its `template.html`), 1 suppression with its reason,
  the service out of scope, the printed summary; `fixtures/lints/no-contract-app`
  runs (1 file, clean) and a missing ui source reports skipped.
- e2e — n/a: a source lint with no page; `sprig check` wiring (and its e2e) is
  the orchestrator's.

## REQ-027 AMENDMENT — the tokens lint reads the themed css-variables.json the build compiles

> "is there any way that this can be hardened?" — calibrating the lint on the
> repo's real apps showed it read the wrong shape.

The build (`framework/.sprig/compiler/build.ts`, the css-variables compiler)
accepts only `{ "default", "themes": { <name>: { --token: value } } }`; REQ-027
read a flat `--*` map, so on a real app (`fixtures/eval-app`) it saw zero
tokens and every hint said "add it" for colors that ARE tokens. `readTokenFile`
now reads every theme's `--*` keys (a value matches its token in any theme; a
flat map is still read, with a note). A `var(--x, <fallback>)` whose fallback
restates `--x`'s own value is the token and passes; a drifted fallback is
still a raw value. The tokens fixtures use the themed shape.

Tests:

- unit — `framework/.sprig/compiler/lints/tokens.test.ts` (REQ-027 ×3 more):
  themed file read across themes, flat map read and noted, var() fallback
  equal vs drifted.
- integration — `framework/.sprig/compiler/lints/tokens.int.test.ts` (REQ-027):
  the fixtures' themed files resolve `#36f` → `var(--color-primary)`.
- e2e — n/a — a source lint with no page.

## REQ-023 AMENDMENT — rule (b) is relational only: data-vs-data equality is identity/selection

> The coordinator's decision on rule (b): "equality/inequality between two data
> members (`x.key === c.key`, `route !== active()`) is identity/selection — UI
> state, not a domain rule. Narrow (b) to RELATIONAL comparisons only (`<`,
> `>`, `<=`, `>=`) between two identifiers/member expressions, keeping the
> geometry exemptions; equality stays allowed."

Rule (b) now fires only on `<`, `>`, `<=`, `>=` between two
identifiers/member expressions in an if / while / ternary / `&&` / `||`
condition; the geometry and named-constant exemptions stand. `==`, `===`,
`!=`, `!==` between data — including `switch (x) { case y: }`, which is an
equality — are allowed, so the switch-case check is deleted. Rule (c)'s
`.length` check still reads every comparison operator. `LintResult` gains
`notes?: string[]` (partial skips and why, used by other lints), and
`formatLintResult` prints each as `  note: …` after the summary, also under a
skip. Measured on real code: `lintLogicPlacement` over `app/src`,
`fixtures/{bullshit-app,eval-app,eval/audit-app,sprig-app}/src` and
`fixtures/spec-check/clean/ui/src` reports 0 findings (the six workbench (b)
hits before this amendment were all equality).

Tests:

- unit — `framework/.sprig/compiler/lints/logic-placement.test.ts` (REQ-023
  AMENDMENT ×1, REQ-023 (b) positives now all relational): the former
  equality positives, `route !== active()`, a `.find` identity match, `!=`
  and switch-case are clean; `if ((x.a >= y.b))` and `a.age >= b.minAge &&`
  are flagged. `framework/.sprig/compiler/lints/lint-types.test.ts` (REQ-023
  AMENDMENT ×1): notes print after the summary and after a skip.
- integration — `framework/.sprig/compiler/lints/logic-placement.int.test.ts`
  (REQ-023 ×3) unchanged and green: the dirty fixture's (b) is relational.
- e2e — n/a: a source lint with no page.

## REQ-024 AMENDMENT — a shared component may only compose shared components

> "is there any way that this can be hardened?" (the coordinator, reviewing
> REQ-024: a tag inside a shared component that resolves only through some
> page's page-local scope renders as unknown on every other page).

REQ-024 counted such a tag as resolved when any page's page-local scope
defined it. A shared component (or the shell) renders on every page, so the
match held on that one page only and the tag shipped as an empty unknown
element everywhere else. Now a tag in a shared component resolves in the
shared scope (or the custom-elements allowlist) only; a page-local match is an
error naming the shared component, the tag and the page that defines it:
`shared component <wrapper> uses <kpi>, which only page "home" defines
(src/pages/home/components/kpi) … a shared component may only compose shared
components; promote <kpi> to shared-components/ or make <wrapper> page-local`.
The composition graph follows the same rule (no shared → page-local edges).
The workbench app runs this same check, so `cli/lib/generate-previews.ts` now
copies the project's `src/custom-elements.json` into it (and clears a stale
one), as it already did for `css-variables.json`.

Tests:

- unit — `framework/.sprig/compiler/unknown-tag.test.ts` (REQ-024 AMENDMENT):
  a shared `<wrapper>` using page-local-only `<kpi>` fails at file:line with
  the message above. `cli/lib/generate-previews.test.ts` (REQ-024 AMENDMENT):
  the allowlist is copied into the workbench app, and removed when the project
  drops it.
- integration — `framework/.sprig/compiler/composition.int.test.ts` (REQ-024)
  still drives the real CLI build over the fixture, which follows the rule.
- e2e — n/a: a build-time check; no page is served.

## REQ-027 AMENDMENT 2 — a length is held only to its property's token family

> "the app will be faithful to the mock" — calibration on `fixtures/eval-app`
> showed the value-only length rule told a `padding: 1.25rem` to use
> `var(--radius-box)`.

A length is now an error only when a token of the property's FAMILY holds that
value, and the hint names only that family's tokens. A length equal to another
family's token alone is not a finding; a property in no family (letter-spacing,
border-width, …) is never a length finding. Families are inferred by token-name
prefix:

| family | properties | token prefixes |
|--------|------------|----------------|
| step   | font-size, line-height | `--step`, `--text`, `--font-size` |
| radius | border-radius, border-*-radius | `--radius`, `--rounded` |
| space  | gap/row-gap/column-gap, padding*, margin*, inset*, top, left, right, bottom, width, height, min-/max-width/height | `--space`, `--spacing`, `--size` |
| shadow | box-shadow | `--shadow` |

`lintTokens` adds a `notes` line naming each family and the app's tokens in it
(`token families: step 8 (…), radius 3 (…), space 0, shadow 0`). On
`fixtures/eval-app` the findings drop from 6 to 4: the rgb shadow and three
font-size lengths naming `--step-*`.

Tests:

- unit — `framework/.sprig/compiler/lints/tokens.test.ts` (REQ-027 ×5 more):
  font-size/line-height name only step tokens; another family's value alone is
  no finding; space/radius/shadow pairing; a family-less property never
  matches; the families notes line.
- integration — `framework/.sprig/compiler/lints/tokens.int.test.ts` (REQ-027):
  the dirty fixture's `padding: 8px` still names `--space-2`.
- e2e — n/a — a source lint with no page.

## REQ-032 — `spec-check` machine-checks the breakdown: nothing unassigned, bindings real, write islands prove their rollback, every unit built and composed where the mock puts it

> "the logic of the app stays in the backend meaning NO business logic at all
> goes in the frontned", "the app is optimistic and does not have latency
> waiting on the server", "the app will be faithful to the mock", "components
> are reused whenever reasonable", and "is there any way that this can be
> hardened?" → "lets spawn opus 5.5 agents to do all this".

The breakdown (`spec/ui/breakdown/`) and its contract binding were Markdown
prose written by a model, and nothing read them back: a non-empty Unassigned
list, a binding row naming an endpoint or DTO the contract never had, a write
island with no rollback case, a unit the build never produced, or a shared
component a page silently stopped composing all shipped without a sound. Now
`framework/.sprig/spec-check.ts` exports
`specCheck({ breakdownDir, gitRoot, uiSrc?, graph?, appDir? })` →
`{ checks: { name, ok, read, skipped?, notes?, items, findings: { where, message, hint }[] }[], ok }`
and `renderSpecCheck(r)` (one block per check: `ok (n items)` / `skipped` +
reason / `FAIL (n findings)` with every offender and its `fix:` line, the paths
read, and notes for any part that did not run). Seven checks over the fixed
machine formats (`inventory.json`, the `| unit | need | kind | endpoint | dto |`
table + `## Drift`, isolate cases' `_tier`/`_network`):
`inventory` (shape, enums, dir ↔ scope, static ↔ tier, each unit's `<name>.md`
exists); `unassigned` (each entry a finding; a missing inventory.json FAILS);
`double-assignment` (unique names per selector scope, unique dirs);
`binding-drift` (endpoints exist in openapi.json by method + path template,
DTOs in `components.schemas` or `client/dtos.ts` exports — the note says which,
query ↔ GET, every unit with dataNeeds bound, Drift says "none"; skipped only
when there is no openapi.json); `tier-cases` (an optimistic-write unit has
`pending` and a `rolled-back` whose `_network` fails the command it is bound to;
every `_tier` agrees; `_network` values well-formed); `built` (with `uiSrc`:
each unit's folder with `template.html` per the compiler's scoping — shared in
`shared-components/`, `components/` or `islands/`; an island has `logic.ts`, a
static unit ships none); `composition` (usedOn ↔ the composition graph,
transitively, page-local shadows resolved first; page-local-named-like-shared is
shadowing). `deno run -A framework/.sprig/spec-check.ts [--root] [--ui-src]
[--app] [--graph] [--json]` exits 0/1/2.

Tests:

- unit — `framework/.sprig/spec-check/binding.test.ts` (REQ-032 ×12): table
  parser, Drift parser, endpoint parser, path-template matching, method-aware
  operation lookup, dtos.ts exports, every binding finding.
- unit — `framework/.sprig/spec-check/graph.test.ts` (REQ-032 ×6): transitive
  reachability, page-local-first resolution, cycles, stale matrix, shadowing.
- unit — `framework/.sprig/spec-check/inventory.test.ts` (REQ-032 ×5),
  `tier.test.ts` (REQ-032 ×5), `built.test.ts` (REQ-032),
  `framework/.sprig/spec-check.test.ts` (REQ-032 ×2): shape validation,
  unassigned, double-assignment, `_network` values, rollback cases, src layout
  mapping, the never-silent renderer.
- integration — `framework/.sprig/spec-check.int.test.ts` (REQ-032 ×14): the
  clean tree in `fixtures/spec-check/clean/` passes all seven checks; each
  `fixtures/spec-check/fail-<check>/` overlay fails exactly its one check; a
  missing inventory, a missing openapi.json / binding.md / dtos.ts, no uiSrc or
  graph; the CLI's output and exit codes.
- e2e — n/a: a static checker over files; nothing serves a page.

## REQ-024 AMENDMENT 2 — the workbench copies hyphen-less dependencies too

> "is there any way that this can be hardened?" (the coordinator: "Selectors
> are folder basenames and hyphen-less ones are normal (`sparkline`), so
> `copyDeps` must match every tag that `findComponentDir` resolves (excluding
> native tags via `isNativeTag`), not only hyphenated ones.")

`cli/lib/generate-previews.ts` `copyDeps` matched only dash-tags, so a
target composing `<sparkline>` got no `sparkline/` in the workbench. It used to
render as a silent empty element; under REQ-024 the workbench build refused it
as an unknown tag. `copyDeps` now matches every opening tag, skips the
renderer's native tags (`isNativeTag`) and the reserved ones, and copies any
tag that names a component folder, transitively.

Tests:

- unit — `cli/lib/generate-previews.test.ts` (REQ-024 AMENDMENT 2): a target
  using `<sparkline>` with a sibling `sparkline/` folder gets it copied; the
  native `<div>`/`<p>` are skipped.
- integration — n/a: the unit drives the real copy on disk; the workbench
  build over it is `buildClient`, covered by `composition.int.test.ts`.
- e2e — n/a: the workbench page itself is not served by this change's tests.

## REQ-030 AMENDMENT — the loading flag is no excuse; only server writes must be optimistic

> "the app is optimistic and does not have latency waiting on the server to run
> its logic" — "is there any way that this can be hardened?"

The first cut let `loading.set(true); const r = await fetch(…POST…);
items.set(r)` pass: the flag counted as "writing the signal first", yet it is
exactly the spinner-and-wait. And it treated every awaited `fetch`/`.get(` as
a server write, so a legitimate read (search-as-you-type, load-more) was
flagged. Now:

- **Rule 2 (new):** a signal write AFTER an awaited server write is an error
  at the write — "the UI changed only after the server answered — use
  optimistic(sig, next, call) so the write lands first and reconcile() applies
  the server's projection" — unless the body calls `optimistic(` (its
  reconcile owns the post-await write) or `// sprig-wait: <reason>` sits on the
  await's line (or the line above) or the write's. Rule 1 (write-before-first-
  signal-write) stays. A write takes effect when its call closes, so
  `items.set(await x())` writes after the await.
- **Only writes are judged.** An awaited call is a server WRITE when any call
  in its operand is: `fetch(`/`.fetch(` with a literal `method:` POST, PUT,
  PATCH or DELETE (no method or GET = read); `.post(` `.put(` `.patch(`
  `.delete(` (`.get(` = read); `client.<op>(` (receiver's last segment
  `client`) whose operationId maps to a non-GET method in
  `<gitRoot>/spec/contract/openapi.json`, or is missing from it — with no
  openapi.json every `client.<op>(` is a write; a callee whose last segment is
  save|create|update|remove|delete|send|submit|post|put|patch; any other call
  whose receiver chain has a segment ending in api|client|backend
  (case-insensitive), unless its name starts get|list|load|fetch|find|search|
  query|read|count. `lintOptimisticWrites` takes `{ uiSrc, gitRoot? }`.
- **Notes** (`LintResult.notes`, printed by `formatLintResult`): how
  `client.<op>` was classified (openapi.json and its op count, or "no
  spec/contract/openapi.json under <root> — treating every client.<op>() as a
  write"), any ops openapi.json does not know, and the counts of exempt
  functions (await a server write, write no signal) and awaited reads.

Tests:

- unit — `framework/.sprig/compiler/lints/optimistic-writes.test.ts`
  (REQ-030 ×17): the loading-flag spinner flagged at the late write; reads
  (no method, GET, `.get(`, query-named api call) exempt and counted;
  service objects (`this.api.save`, `svc.create`, `backend.submitOrder`,
  `store.remove`, `this.todoApi.archiveAll`) flagged; a body calling
  optimistic() exempt from rule 2; sprig-wait on the await covers the later
  write; openapi ops classify `client.<op>` (GET read, POST write, unknown =
  write, named) and without them every `client.<op>` is a write; exempt count.
- integration — `framework/.sprig/compiler/lints/optimistic-writes.int.test.ts`
  (REQ-030 ×3): the `todo-list` island awaiting `client.listTodos()` passes in
  `fixtures/lints/optimistic-clean` (its `spec/contract/openapi.json` says GET)
  and fails in `fixtures/lints/optimistic-dirty` (no openapi.json — the note
  says so); notes asserted and printed.
- e2e — n/a: a source lint; nothing serves a page.

## REQ-033 AMENDMENT — the breakdown prose states the exact shapes `sprig spec-check` parses

> "is there any way that this can be hardened?" → "lets spawn opus 5.5 agents
> to do all this"

`sprig spec-check` (REQ-033's gate) parses the breakdown exactly, so the
analyst now states it exactly: `inventory.json` `dir` is the path the scope
implies (shared → `shared-components/<name>`, page → `pages/<page>`,
page-local → `pages/<page>/components/<name>`); a `static` unit has tier
`static` and an island never does; each unit's spec lands at
`<dir>/<name>.md` (the spec-writer says the same); a binding query row's
endpoint is `GET …` and a command row's never is; the `## Drift` body is
exactly `none` when empty. No prompt names a spec-check flag the tool does
not take.

Tests:

- unit — `framework/.sprig/skills-hardening.test.ts` (REQ-033 ×2 more): the
  analyst carries each shape sentence; no touched prompt says `--built ui/src`
  or `spec-check --compose`; (REQ-034) the spec-writer names `<dir>/<name>.md`.
- integration — n/a: docs.
- e2e — n/a: docs.

## REQ-035 AMENDMENT — the build's final spec-check is `--ui-src ui/src --app ui`

> "the app will be faithful to the mock", "the app stays dry, meaning that
> components are reused whenever reasonable"

The whole-app step runs `sprig spec-check spec/ui/breakdown --ui-src ui/src
--app ui` (the flags the tool takes: the built tree and the app whose
composition graph it compares with the usage matrix), not `--built … --compose`.
The build playbook, the `ui-breakdown` and `sprig-app` interfaces, the wiring
reference and catalog F15 name that form. The build prompts also retire the
hand-rolled snapshot → mutate → call → roll back prose for `optimistic(...)`,
and name every `sprig check` marker, `// sprig-contract: <reason>` and
`src/custom-elements.json` included, in the cheatsheet recipe.

Tests:

- unit — `framework/.sprig/skills-hardening.test.ts` (REQ-035): step 3 names
  the `--ui-src ui/src --app ui` form in the playbook; builder + playbook say a
  wait needs `// sprig-wait: <reason>` and is reported by `sprig check`, and no
  longer carry the hand-rolled snapshot prose; the cheatsheet recipe carries
  `// sprig-contract: <reason>` and `src/custom-elements.json`.
- integration — n/a: docs.
- e2e — n/a: docs.

## REQ-048 — `sprig check` runs every hardening check and gives one verdict; `sprig map --compose`; `sprig spec-check`

> "is there any way that this can be hardened?" → "lets spawn opus 5.5 agents
> to do all this, lets do as much in parallel as we can … you get final sign
> off of the work."

The checks the other entries built (REQ-022/023 contract-calls and
logic-placement, REQ-024/025 unknown tags and shadowing, REQ-026 the
composition graph, REQ-027/028 tokens and duplicate templates, REQ-030
optimistic-writes, REQ-032 spec-check) were modules with no command. Now:

- `sprig check [appDir] [--root <git-root>]` runs, in order, the typecheck,
  the wiring lint, the composition check and the five source lints — EVERY
  one runs even when an earlier one is red (a red typecheck used to exit
  before the wiring lint ran), each prints what it checked, skipped and found
  (`formatLintResult`), and the last line is one verdict:
  `sprig check: green — …` or `sprig check: red — <failed> (green: <rest>)`,
  exit 1. `--root` says where `spec/contract` lives (default: the app's git
  root) so a fixture app can carry its own contract.
- `sprig map [appDir] --compose [--json]` prints the composition graph (who
  composes whom) from the renderer's own registry.
- `sprig spec-check [breakdownDir] [--root] [--ui-src] [--app] [--json]`
  runs the breakdown's machine checks; exit 1 on any finding.
- `sprig build` prints a composition error as one message naming every
  offender, never a stack.
- `splitArgs` keeps a flag's value from being read as the app directory.
- The new modules are in `publish.include` (REQ-014's rule).

Tests:

- unit — `framework/.sprig/cli-help.test.ts` (REQ-002, extended): `spec-check`
  has its own usage block; `framework/publish-include.test.ts` (REQ-014):
  every module cli.ts now imports ships.
- integration — `framework/cli-lints.int.test.ts` (REQ-048 ×5): the real CLI
  on `fixtures/lints/dirty-app` runs all five lints and the composition check
  and is red naming `optimistic-writes`/`logic-placement`; on
  `fixtures/lints/clean-app` all run and it is green; `map --compose` prints
  `composes` lines and `--json` parses to `{pages, components}`; `spec-check`
  is green on `fixtures/spec-check/clean` and red on the `fail-unassigned`
  overlay; a build of the composition fixture with an unknown tag exits 1
  with "composition check failed", the tag named, and no stack frame.
- e2e — n/a: no page; the CLI's exit code and text are the whole surface.

## REQ-039 — an unknown `_` key in a case JSON is an error naming the key and the case file

> "the app will be faithful to the mock", "is there any way that this can be
> hardened?" → "lets spawn opus 5.5 agents to do all this"

`parseCaseValues` (`server/src/core/business/discover/mod.ts`) recognised four
`_` keys and silently dropped every other one, so a typo (`_viewprt`) or a key
from a newer contract looked like it worked while doing nothing. The case-key
list is now closed — `_name`, `_innerHtml`, `_signals`, `_mocks`, `_viewport`,
`_theme`, `_reference`, `_network`, `_tier`, `_motion` — and anything else (or a
known key with a malformed value) is a `case-key` Problem whose detail names the
key, lists the known ones and names the case file. `isolate test` treats it like
a malformed fixture: it stops before provisioning or serving anything (exit 1,
the problem in `--json` and in the human report under "invalid case key").

Tests:

- unit — `server/src/core/business/discover/case-keys.test.ts` (REQ-039 ×2):
  an unknown key is an error naming it and listing the known keys; the known
  keys parse clean.
- integration — `server/src/core/business/discover/case-keys.int.test.ts`
  (REQ-039 ×1): `discover()` reports it as `case-key` with the case file;
  `cli/commands/test.int.test.ts` (REQ-039 ×1): the real CLI exits 1 in `--json`
  and human mode, naming the key and file, and never reaches the runner.
- e2e — n/a: the refusal happens before any page is served; the CLI int test
  runs the real binary end to end.

## REQ-040 — `_viewport`: a case renders and tests at its breakpoint

> "the app will be faithful to the mock", "is there any way that this can be
> hardened?" → "lets spawn opus 5.5 agents to do all this"

`_viewport` (a px width, or `{ "width", "height" }`; a bare width gets height
720) is parsed onto the case, and the runner now executes every case through a
generated wrapper spec (written with a harness and a Playwright config into the
run's evidence dir, outside the project) that imports the case's own spec files
and `test.use({ viewport })` for all of them and for the generated check rows.
Rows record `case <unit>/<case>: viewport 375x720` in `detail`. The workbench
stage keeps its manual presets (its manifest passes through the server's
`CaseDto`, which strips unknown fields); the docs say the runner is
authoritative.

Tests:

- unit — `server/src/core/business/discover/case-keys.test.ts` (REQ-040 ×2):
  number and object forms, junk rejected; `server/src/core/business/runner/case-run.test.ts`
  (REQ-040 ×3): explicit files select their cases, the wrapper imports the
  case's specs and carries the viewport, Playwright is spawned on the generated
  config and never on raw spec paths.
- integration — `server/src/core/business/runner/case-run.int.test.ts`
  (REQ-040..045 ×1): the fixture app's specs run inside their case wrappers and
  their rows carry case context.
- e2e — `cli/commands/test.e2e.test.ts` (REQ-040..045): in Chromium against the
  served workbench, `swatch/match`'s own spec sees `innerWidth === 375`.

## REQ-041 — `_theme`: `data-theme` on `<html>` for every test of the case

> "the app will be faithful to the mock", "is there any way that this can be
> hardened?" → "lets spawn opus 5.5 agents to do all this"

`_theme` (a non-empty string) is installed by the case wrapper as an init script
that sets `<html data-theme>` before any page script runs and re-asserts it if
the markup overwrites it — so the case's specs and its `reference:` capture both
render in the captured theme.

Tests:

- unit — `server/src/core/business/discover/case-keys.test.ts` (REQ-041 ×1);
  `server/src/core/business/runner/case-run.test.ts` (REQ-040/041/043 ×1): the
  wrapper carries the theme.
- integration — `server/src/core/business/runner/case-run.int.test.ts`: the dark
  reference row is settled against the dark capture.
- e2e — `cli/commands/test.e2e.test.ts`: `swatch/dark`'s spec sees
  `data-theme="dark"` and the dark background, and `reference: swatch/dark`
  passes at measured 0.

## REQ-042 — `_reference`: the rendered case is pixel-compared against the captured still, with a number

> "the app will be faithful to the mock", "is there any way that this can be
> hardened?" → "lets spawn opus 5.5 agents to do all this"

Fidelity used to be a model looking at two images. `_reference` (`"<png>"` or
`{ image, tolerance, reason }`, relative to the case dir, must exist at
discovery; default tolerance 0.01, above it a `reason` is required) adds a
generated test `reference: <unit>/<case>` that screenshots the rendered target
element at the case's viewport/theme (stage pinned to whole pixels, animations
settled). The runner then decodes both PNGs with its own codec
(`runner/png.ts`), measures the fraction of pixels whose RGBA moved by more than
24/255 (`runner/reference.ts`), writes a diff PNG to the evidence dir, and sets
the row: `measured 0.000 ≤ tolerance 0.010 — 0/9600 px differ at 120×80; …` or
failing `measured 0.250 > tolerance 0.010 …` with `measured`, `tolerance` and
`evidence` fields. The evidence dir is `--evidence <dir>`, else
`$SPRIG_WB_ROOT/evidence/<stamp>`, else a temp dir; a chosen dir inside the
project is refused. A case with only a `_reference` (no specs) still runs.

Tests:

- unit — `server/src/core/business/runner/reference.test.ts` (REQ-042 ×6): PNG
  round-trip, non-PNG refusal, identical = 0, threshold counting + diff marks,
  size mismatch, verdict text; `server/src/core/business/discover/case-keys.test.ts`
  (REQ-042 ×3): string form, tolerance-without-reason error, junk shapes;
  `server/src/core/business/runner/case-run.test.ts` (REQ-042 ×5): planning of
  check-only cases, filters, the generated row, evidence inside the project
  refused.
- integration — `server/src/core/business/discover/case-keys.int.test.ts`
  (REQ-042/045 ×1): a missing image is a problem at discovery;
  `server/src/core/business/runner/case-run.int.test.ts` (REQ-040..045 ×1): on
  the fixture app, equal = measured 0 pass, drift = `measured 0.250 > tolerance
  0.010` with a 120×80 diff PNG outside the tree.
- e2e — `cli/commands/test.e2e.test.ts`: the same pass and fail in Chromium, the
  diff PNG under the workbench's evidence dir, nothing written in the fixture.

## REQ-043 — `_network`: fake a case's requests so a story proves rollback and no-wait

> "the app is optimistic and does not have latency waiting on the server to run
> its logic", "is there any way that this can be hardened?" → "lets spawn opus
> 5.5 agents to do all this"

`_network` maps `"METHOD /path"` (`{id}`/`:id` one segment, `*` anything) or a
contract command name (an `operationId` in `spec/contract/openapi.json` at the
git root, prefixed by its first server's path; without a contract a command key
is an error naming it) to `"fail"`, `"delay:<ms>"` or `{ status, body }`. The
case wrapper installs each as `page.route` before every test of the case (abort /
hold then send on / fulfil), and after each test annotates
`network <key> → <action>: fired N×` onto the row's `detail`, so a fake that
never matched is visible.

Tests:

- unit — `server/src/core/business/discover/case-keys.test.ts` (REQ-043 ×5):
  the three actions, command name without a contract, operationId mapping,
  bad keys/actions each named, path patterns;
  `server/src/core/business/runner/case-run.test.ts` (REQ-043 ×1): harness
  annotations become the row detail.
- integration — `server/src/core/business/discover/case-keys.int.test.ts`
  (REQ-043 ×1): a real openapi.json at a git root maps `createTodo`;
  `server/src/core/business/runner/case-run.int.test.ts` (REQ-043 ×1): the
  fixture's wrapper carries the resolved rule and imports the case's spec.
- e2e — `cli/commands/test.e2e.test.ts`: in Chromium, `saver/fail` rolls the
  optimistic count back with the fake `fired 1×`, `saver/slow` shows the count
  within 500ms while the POST is held 4s, `saver/ok`'s faked 200 keeps it.

## REQ-044 — `_tier`: the case's interaction tier is recorded on the case and every report row

> "the app is optimistic and does not have latency waiting on the server to run
> its logic", "is there any way that this can be hardened?" → "lets spawn opus
> 5.5 agents to do all this"

`_tier` is one of `static | pure-client | optimistic-write | realtime`
(anything else is an error listing them). It lands on the discovered `CaseDef`
and on every `testResults[]` row of the case (`tier`), for `sprig spec-check` to
consume; it changes no behaviour itself.

Tests:

- unit — `server/src/core/business/discover/case-keys.test.ts` (REQ-044 ×1);
  `server/src/core/business/runner/case-run.test.ts` (REQ-040 ×1 asserts the
  row's `tier`).
- integration — `server/src/core/business/runner/case-run.int.test.ts`: rows of
  `saver/fail` carry `optimistic-write`, `swatch/match` carries `static`.
- e2e — `cli/commands/test.e2e.test.ts`: the same tiers on the real report.

## REQ-045 — `_motion`: the rendered animations are compared to the captured `getAnimations()` spec

> "the app will be faithful to the mock", "is there any way that this can be
> hardened?" → "lets spawn opus 5.5 agents to do all this"

`_motion: { "spec": "<json>" }` (relative to the case dir; must exist and be an
array or `{ animations: [...] }` at discovery) adds a generated test
`motion: <unit>/<case>` that opens the case with every animation paused at its
start (DevTools playback rate 0), reads `document.getAnimations()` after
hydration and writes the records to the evidence dir. `runner/motion.ts` reads
both sides tolerantly (the flat `{ selector?, name?, duration, easing,
keyframeCount, delay?, iterations? }` schema or the breakdown recipe's raw
`{ target, keyframes, timing }` record; a CSS animation's curve comes from its
keyframes when `timing.easing` is linear), pairs them, and fails the row naming
each difference (duration ±1ms, easing, keyframe count, delay/iterations when
recorded, missing and unexpected animations).

Tests:

- unit — `server/src/core/business/runner/motion.test.ts` (REQ-045 ×6): flat and
  raw forms, easing normalisation, equal pass, each difference named, unexpected
  animations; `server/src/core/business/discover/case-keys.test.ts` (REQ-045 ×1).
- integration — `server/src/core/business/runner/case-run.int.test.ts`:
  `motion-ok` passes, `motion-drift` names `duration 1200ms ≠ spec 800ms` and the
  easing.
- e2e — `cli/commands/test.e2e.test.ts`: the same verdicts from a real
  Chromium's `getAnimations()`.

## REQ-034 AMENDMENT — case paths are git-root-relative; the rolled-back case is an HTTP 500

> "the app will be faithful to the mock", "the app is optimistic and does not
> have latency waiting on the server to run its logic"

`_reference` and `_motion.spec` resolve case-dir first, then git root, and a
built unit's `isolate/` cannot reach the breakdown's PNGs case-relatively — so
the spec-writer writes `spec/ui/breakdown/<unit dir>/screenshots/…` paths, and
capture says cases cite its files that way. The `rolled-back` case uses
`_network` `{ "status": 500 }` (the HTTP-error rollback path); `"fail"` (an
aborted connection) is the offline case. The build prose (REQ-035) says the
interactive workbench does not yet apply `_viewport`/`_theme`; the runner is
authoritative.

Tests:

- unit — `framework/.sprig/skills-hardening.test.ts` (REQ-034 ×1 more, the
  rolled-back assertion updated; REQ-035 ×1 more): git-root-relative
  `_reference`/`_motion` in the spec-writer and capture; the 500 vs `"fail"`
  split; the workbench caveat in builder + playbook.
- integration — n/a: docs.
- e2e — n/a: docs.

## REQ-042 AMENDMENT — `_reference` and `_motion.spec` resolve from the case dir, then the git root

> "the app will be faithful to the mock", "is there any way that this can be
> hardened?" → "lets spawn opus 5.5 agents to do all this"

The breakdown's stills live under `<git root>/spec/ui/breakdown/<unit>/screenshots/`,
and the `isolate/` folder is copied into the built component under `ui/src`, so a
case-dir-relative path could not reach them after the build. `resolveCaseFile`
(`discover/mod.ts`) now tries the case dir first, then the git root (the nearest
`.git` above the project); the case records which (`via: "case dir" | "git root"`)
and the `reference:` / `motion:` row's `detail` says it ("reference resolved from
the git root"). Neither found → a `case-key` problem naming both paths tried.
`_motion.spec` follows the same rule. The spec-writer writes git-root-relative
paths (`spec/ui/breakdown/…/screenshots/<name>@<width>[-<theme>].png`,
`…/screenshots/motion.json`).

Tests:

- unit — `server/src/core/business/discover/case-keys.test.ts` (REQ-042
  AMENDMENT ×1): case dir wins, git root second, both tried when absent, no git
  root → one path.
- integration — `server/src/core/business/discover/case-keys.int.test.ts`
  (REQ-042 AMENDMENT ×1): git-root-relative `_reference` and `_motion.spec`
  resolve with `via: "git root"`; a missing one names both paths;
  `server/src/core/business/runner/case-run.int.test.ts`: the row detail names
  the resolution.
- e2e — `cli/commands/test.e2e.test.ts` (unchanged fixture, case-dir paths).
