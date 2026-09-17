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
