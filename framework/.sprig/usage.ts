// The CLI's usage text, and the `--help` gate that reads it.
//
// Lives apart from cli.ts because cli.ts RUNS the CLI on import (a top-level
// `switch (Deno.args[0])`), so nothing in it can be unit-tested — and this is
// exactly the part that needed a test: the dispatch keyed off argv[0] alone, so
// `--help` was invisible to it. `sprig dev --help` did not print help, it STARTED
// a dev server in the cwd — registered the shared process, bound the stable port,
// ran a build. `build --help` built; `check --help` typechecked.

/** The whole manual — `sprig help`, and the fallback for an unknown command. */
export const USAGE = `sprig — the framework CLI

  sprig init  [dir]              scaffold a minimal, runnable sprig app (default: .)
  sprig dev   [appDir] [--annotate <html>] [--host <file>] [--open] [--no-cache]  HMR dev server → /ui — ALWAYS serves the
                                  click-to-edit overlay + the isolate workbench (full app). --annotate <html>:
                                  annotate one prototype file instead. Annotate picks a STABLE port hashed from the
                                  app name (PORT overrides); prints the URL and, only with --open, pops it in the
                                  browser. Re-running attaches to the one shared process; --no-cache instead spawns
                                  a SEPARATE standalone process (free ports, own ephemeral workbench) that runs
                                  regardless of who else is dev'ing this repo and leaves nothing behind.
                                  --host <file>: layer YOUR host module over the composed app, the way your
                                  production entry does — it exports routes(req, info) (tried first, return
                                  null to pass) and/or wrap(next) (wraps the app). A host.ts beside the
                                  generated serve.ts is picked up with no flag. Dev == prod, one more layer.
  sprig build [appDir] [--rune]  code-split islands + scope CSS + Tailwind → static/ (default: .; never annotate)
                                  --rune also folds the sibling keep backend + this UI into a serve.ts
                                  (the Bedrock composition root) and makes the root a workspace. The root
                                  is the dir holding ui/ + server/ — the git root, or a subfolder of a
                                  larger repo (nearest wins; SPRIG_ROOT=<dir> overrides)
                                  --ui-only <ui>: JUST the client bundle — no serve.ts, no workspace, no
                                  .gitignore entry. For an app that HAND-OWNS its composition root (a ui
                                  unit of its own, top-level code before compose): it keeps serving its
                                  own root and still gets its assets built. A hand-written serve.ts is
                                  never overwritten — the plain build refuses and names this flag
  sprig clean [appDir]           remove what build created: <ui>/static/ + any --rune-generated
                                  serve.ts (a hand-written serve.ts is left alone). Alias: build --clean
  sprig check [appDir] [--root <git-root>]
                                  the one pre-flight, every check then one verdict: typecheck
                                  under the CLI runtime; the template wiring lint; the
                                  composition check (every tag resolves, no undeclared
                                  shadowing); the source lints — contract-calls (every call
                                  goes through spec/contract/client), logic-placement (no
                                  domain logic in islands/resolve), tokens (no off-token
                                  colors/lengths), duplicate-templates (no near-identical
                                  templates), optimistic-writes (no server write awaited
                                  before the UI changes). Each prints what it checked, what it
                                  skipped and why, every finding with its fix, every
                                  suppression with its reason. --root: where spec/contract
                                  lives (default: the app's git root)
  sprig map   [appDir] [--compose [--json]]
                                  print the app's dataflow from its templates: one line per
                                  wiring channel — who sets, edits, and reads it (incl. pages
                                  joined through a forwarding <router-outlet>). --compose:
                                  the composition graph instead — who composes whom, from the
                                  renderer's own registry (--json for the machine form)
  sprig spec-check [breakdownDir] [--root <git-root>] [--ui-src <dir>] [--app <dir>] [--json]
                                  the breakdown's machine checks: Unassigned empty, binding
                                  endpoints/DTOs in openapi.json, optimistic-write units with
                                  pending + rolled-back cases, every unit built (--ui-src),
                                  usage matrix vs the composition graph (--app), no double
                                  assignment. Default dir: <git-root>/spec/ui/breakdown
  sprig isolate [appDir] [--no-open]
                                  component/page workbench — develop in isolation (default: .).
                                  An arg that is neither a subcommand nor a directory is an
                                  error (a dir named like one: pass it as ./test)
  sprig isolate test [filter] [--root <appDir>] [--json] [--evidence <dir>] [--port <n>]
                                  run every case headlessly — its spec files, _reference and
                                  _motion checks — in a real browser. One row per case: a case
                                  with nothing to check is "skipped — no tests, no _reference";
                                  counts are passed/failed/skipped; when nothing was checked
                                  (every case skipped) it exits 1. filter: <unit>/<case> or a
                                  spec path fragment. --root: the app (default: .)
  sprig isolate list [--root <appDir>]
                                  list the discovered components, their cases and routes
  sprig serve [entry]            run the app's host entry under its deno.json (default: serve.ts)
  sprig stop  [appDir]           stop this repo's shared 'sprig dev' process + free its ports
  sprig migrate wire-paths [appDir] [--dry-run]
                                  the D-7 codemod: prefix /api onto in-process client calls
                                  that still use route-space paths (backend.get("/users") →
                                  backend.get("/api/users")). Rewrites literal paths only and
                                  REPORTS the computed ones for you to read.
  sprig install [--dev]          install the global sprig CLI + Claude Code skills + agents (--dev: from this checkout)
  sprig update                   re-install the global sprig CLI + skills + agents from the latest release
  sprig -v, --version            print the installed version + check JSR for a newer release
  sprig help
`;

/** Is this a request for help rather than a run? Checked against a command's
 *  ARGS (never argv[0], which the dispatch already handles), so a value that
 *  merely looks like the flag — `--annotate help.html` — is not mistaken for it. */
export function wantsHelp(args: string[]): boolean {
  return args.some((a) => a === "--help" || a === "-h");
}

/** One command's slice of USAGE: each `  sprig <cmd> …` line plus the indented
 *  continuation lines under it, up to the next command. Unknown command → the
 *  whole manual, which is the honest answer when we have nothing specific. */
export function commandHelp(cmd: string): string {
  const lines = USAGE.split("\n");
  const startsCommand = (l: string) => /^ {2}sprig\s+\S/.test(l);
  const mine = new RegExp(`^ {2}sprig\\s+${cmd}(\\s|$)`);
  // every block for this command — `isolate` has one per subcommand (REQ-056)
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!startsCommand(lines[i]) || !mine.test(lines[i])) continue;
    let j = i + 1;
    while (j < lines.length && !startsCommand(lines[j])) j++;
    out.push(...lines.slice(i, j));
    i = j - 1;
  }
  if (!out.length) return USAGE;
  return [`sprig — the framework CLI`, "", ...out]
    .join("\n")
    .replace(/\s+$/, "");
}

/** What `sprig isolate …` asked for (REQ-056). */
export type IsolatePlan =
  | { kind: "dev"; app: string; open: boolean }
  | {
    kind: "runner";
    sub: "test" | "list";
    app: string;
    /** --evidence, kept apart so the caller can resolve it against its cwd. */
    evidence?: string;
    /** Everything else, passed through to the runner verbatim. */
    args: string[];
  }
  | { kind: "error"; message: string };

const ISOLATE_SUBS = ["test", "list"] as const;
/** Flags whose NEXT arg is their value — never a positional. */
const ISOLATE_VALUED = ["--root", "-r", "--evidence", "--port", "--base-url"];

/** Plan `sprig isolate <args>`: the first positional is a subcommand (test|list →
 *  the workbench runner, app from --root like `sprig check`, default "."), else an
 *  existing directory (the dev workbench), else an error naming it — never the
 *  silent "nothing to isolate" a typo used to get. */
export function parseIsolateArgs(
  rest: string[],
  isDir: (p: string) => boolean,
): IsolatePlan {
  const positional: string[] = [];
  const flags: string[] = [];
  let root: string | undefined;
  let evidence: string | undefined;
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    const eq = a.indexOf("=");
    const name = a.startsWith("-") && eq > 0 ? a.slice(0, eq) : a;
    if (ISOLATE_VALUED.includes(name)) {
      const v = name === a ? rest[++i] ?? "" : a.slice(eq + 1);
      if (name === "--root" || name === "-r") root = v;
      else if (name === "--evidence") evidence = v;
      else flags.push(name, v);
    } else if (a.startsWith("-")) flags.push(a);
    else positional.push(a);
  }
  const first = positional[0];
  const notDir = (p: string): IsolatePlan => ({
    kind: "error",
    message: `sprig isolate: '${p}' is not a directory`,
  });
  if ((ISOLATE_SUBS as readonly string[]).includes(first)) {
    const app = root ?? ".";
    if (!isDir(app)) return notDir(app);
    const args = [...positional.slice(1), ...flags];
    return {
      kind: "runner",
      sub: first as "test" | "list",
      app,
      ...(evidence !== undefined ? { evidence } : {}),
      args,
    };
  }
  if (first === undefined) {
    const app = root ?? ".";
    if (!isDir(app)) return notDir(app);
    return { kind: "dev", app, open: !flags.includes("--no-open") };
  }
  if (!isDir(first)) {
    return {
      kind: "error",
      message: `sprig isolate: '${first}' is not a subcommand (${
        ISOLATE_SUBS.join("|")
      }) and not a directory`,
    };
  }
  return { kind: "dev", app: first, open: !flags.includes("--no-open") };
}
