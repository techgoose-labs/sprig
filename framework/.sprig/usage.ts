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
  sprig clean [appDir]           remove what build created: <ui>/static/ + any --rune-generated
                                  serve.ts (a hand-written serve.ts is left alone). Alias: build --clean
  sprig check [appDir]           typecheck the app under the CLI runtime (the pin-free
                                  replacement for deno check — the CLI owns the one runtime)
                                  + the template wiring lint (sets:/reads:/edits: channels)
  sprig map   [appDir]           print the app's dataflow from its templates: one line per
                                  wiring channel — who sets, edits, and reads it (incl. pages
                                  joined through a forwarding <router-outlet>)
  sprig isolate [appDir]         component/page workbench — develop in isolation (default: .)
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

/** One command's slice of USAGE: its `  sprig <cmd> …` line plus the indented
 *  continuation lines under it, up to the next command. Unknown command → the
 *  whole manual, which is the honest answer when we have nothing specific. */
export function commandHelp(cmd: string): string {
  const lines = USAGE.split("\n");
  const startsCommand = (l: string) => /^ {2}sprig\s+\S/.test(l);
  const i = lines.findIndex((l) =>
    startsCommand(l) && new RegExp(`^ {2}sprig\\s+${cmd}(\\s|$)`).test(l)
  );
  if (i === -1) return USAGE;
  let j = i + 1;
  while (j < lines.length && !startsCommand(lines[j])) j++;
  return [`sprig — the framework CLI`, "", ...lines.slice(i, j)]
    .join("\n")
    .replace(/\s+$/, "");
}
