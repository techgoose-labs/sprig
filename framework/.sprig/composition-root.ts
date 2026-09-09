// Where the composed layout hangs off — the COMPOSITION root.
//
// `sprig build` folds `ui/` + `server/` into one deployable: it writes the
// generated `serve.ts` and the workspace `deno.json` at the root, and `sprig dev`
// composes the same two halves in-process. That root used to be "the nearest
// `.git` ancestor", which is right for every single-app repo — and wrong the
// moment a composed app is folded into a larger repo as `<repo>/tools/<app>/
// {ui,server,deno.json}`: the git root has no server/, so the build died on
// "no keep backend at <repo>/server/bootstrap/mod.ts" with no way through, and
// dev silently ran UI-only. (`sprig init <dir>` already scaffolds relative to
// <dir>, so it could produce a layout build could not consume.)
//
// The layout carries its own marker, so anchor on that first and fall back to
// the git walk only when there is none. Lives in its own module so it is
// testable without running the CLI. NOT the spec-root walk: `spec/` resolution
// is bedrock's shared D-9 contract and stays anchored on `.git`.

import { dirname, join, resolve } from "@std/path";

/** Explicit override — an escape hatch for a layout the marker walk can't see. */
export const ROOT_ENV = "SPRIG_ROOT";

function existsSync(p: string): boolean {
  try {
    Deno.lstatSync(p);
    return true;
  } catch {
    return false;
  }
}

function readJsonSync(p: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(Deno.readTextFileSync(p));
    return parsed && typeof parsed === "object"
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

/** `./server`, `server`, `./server/` — every spelling Deno accepts for the member. */
function isServerMember(m: unknown): boolean {
  return typeof m === "string" &&
    m.replace(/^\.\//, "").replace(/\/+$/, "") === "server";
}

/**
 * Is `dir` a composition root? It is when it carries either half of the composed
 * layout's own marker: the keep backend at `server/bootstrap/mod.ts` (the file the
 * build composes and dev imports), or a `deno.json` whose `workspace` lists
 * `./server` (what `init`/`ensureRuneWorkspace` write — present before the backend
 * is, and after a scaffold that never got one).
 */
export function isCompositionRoot(dir: string): boolean {
  if (existsSync(join(dir, "server", "bootstrap", "mod.ts"))) return true;
  const ws = readJsonSync(join(dir, "deno.json"))?.workspace;
  return Array.isArray(ws) && ws.some(isServerMember);
}

/**
 * The composition root for `startAbs` (a sprig UI package, or any dir inside the
 * project), or null when nothing above it is one.
 *
 *   0. `SPRIG_ROOT` set → that dir, as-is (the caller validates what's in it).
 *   1. else the NEAREST composition root at or above `startAbs`, never climbing
 *      past `gitRoot` when one is given — the root can't lie outside the repo.
 *
 * Nearest wins, so `<repo>/tools/<app>/ui` resolves to `<repo>/tools/<app>` even
 * when `<repo>` is itself a composed app; and a single-app repo resolves to the
 * git root exactly as before, because that is where its server/ is.
 */
export function compositionRootOf(
  startAbs: string,
  gitRoot: string | null,
): string | null {
  const override = Deno.env.get(ROOT_ENV);
  if (override) return resolve(override);
  let d = resolve(startAbs);
  while (true) {
    if (isCompositionRoot(d)) return d;
    if (d === gitRoot) return null;
    const parent = dirname(d);
    if (parent === d) return null;
    d = parent;
  }
}
