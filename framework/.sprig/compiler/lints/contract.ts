/**
 * The ONE reader of an app's ratified contract for the source lints:
 * `<gitRoot>/spec/contract/openapi.json` → every operation by its operationId,
 * with its HTTP method and path. contract-calls (REQ-054: the waist at the call
 * site) and optimistic-writes (REQ-030: is `client.<op>()` a write?) both read
 * it through here.
 *
 * REQ-068: the contract is looked up at the APP root (the dir holding deno.json)
 * first, then the git root — the order the isolate runner uses (REQ-063) — and
 * the caller says which root answered.
 */
import { dirname, join, resolve } from "@std/path";

/** One contract operation: its method (upper-case) and its path template. */
export type ContractOp = { method: string; path: string };

/** Where the contract lives under a git root. */
export const OPENAPI_REL = "spec/contract/openapi.json";

/** operationId → { method, path } from `<gitRoot>/spec/contract/openapi.json`;
 *  null when there is no gitRoot, no file, or it is not JSON. */
export async function readContractOps(
  gitRoot: string | undefined,
): Promise<Map<string, ContractOp> | null> {
  if (!gitRoot) return null;
  let doc: {
    paths?: Record<string, Record<string, { operationId?: string }>>;
  };
  try {
    doc = JSON.parse(
      await Deno.readTextFile(join(gitRoot, ...OPENAPI_REL.split("/"))),
    );
  } catch {
    return null;
  }
  const ops = new Map<string, ContractOp>();
  for (const [path, item] of Object.entries(doc.paths ?? {})) {
    for (const [method, op] of Object.entries(item ?? {})) {
      if (op && typeof op === "object" && op.operationId) {
        ops.set(op.operationId, { method: method.toUpperCase(), path });
      }
    }
  }
  return ops;
}

/** Which root's `spec/contract/` a lint read (REQ-068). */
export type ContractRoot = { dir: string; via: "app root" | "git root" };

async function dirExists(p: string): Promise<boolean> {
  try {
    return (await Deno.stat(p)).isDirectory;
  } catch {
    return false;
  }
}

async function fileExists(p: string): Promise<boolean> {
  try {
    return (await Deno.stat(p)).isFile;
  } catch {
    return false;
  }
}

/** The first root holding a `spec/contract/` dir: the app root, then the git
 *  root (the app AT the git root is one lookup, named the app root). null when
 *  neither has one. `has` is injectable for tests. */
export async function resolveContractRoot(
  roots: { appRoot?: string; gitRoot?: string },
  has: (dir: string) => Promise<boolean> = dirExists,
): Promise<ContractRoot | null> {
  const tried: ContractRoot[] = [];
  if (roots.appRoot) tried.push({ dir: roots.appRoot, via: "app root" });
  if (roots.gitRoot && roots.gitRoot !== roots.appRoot) {
    tried.push({ dir: roots.gitRoot, via: "git root" });
  }
  for (const t of tried) {
    if (await has(join(t.dir, "spec", "contract"))) return t;
  }
  return null;
}

/** The roots a lookup tries, as a message fragment: `<app> (app root) or <git> (git root)`. */
export function describeRoots(
  roots: { appRoot?: string; gitRoot?: string },
): string {
  const out: string[] = [];
  if (roots.appRoot) out.push(`${roots.appRoot} (app root)`);
  if (roots.gitRoot && roots.gitRoot !== roots.appRoot) {
    out.push(roots.appRoot ? `${roots.gitRoot} (git root)` : roots.gitRoot);
  }
  return out.join(" or ") || "(no root given)";
}

/** The app root for an app dir: the nearest dir from `appDir` up to `gitRoot`
 *  (inclusive) holding deno.json / deno.jsonc, else `appDir` itself. */
export async function appRootOf(
  appDir: string,
  gitRoot: string,
  has: (file: string) => Promise<boolean> = fileExists,
): Promise<string> {
  const stop = resolve(gitRoot);
  let dir = resolve(appDir);
  while (true) {
    if (
      await has(join(dir, "deno.json")) || await has(join(dir, "deno.jsonc"))
    ) return dir;
    if (dir === stop || !dir.startsWith(stop)) break;
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return resolve(appDir);
}
