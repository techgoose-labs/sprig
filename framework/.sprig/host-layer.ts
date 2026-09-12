// The app's OWN host wrapper, honoured by `sprig dev`.
//
// `sprig dev` composes the app itself — `Bedrock({ ui, backend })`, the same one
// call the generated serve.ts makes — which is right until the app's PRODUCTION
// entry is its own thin wrapper AROUND that composition: routes served straight
// off disk for an <img src>, a /sim/* surface, a WebSocket — things a browser tag
// or a worker reaches with no token, so they cannot live behind the guarded /api.
// Dev dropped that layer, so every one of those requests 404'd, and the way
// through was to run a SECOND process (a reverse proxy in front of dev, HMR and
// annotate SSE streaming through it) just to have dev mode at all.
//
// So dev loads the app's host module and puts it exactly where prod has it:
//
//   host.ts                       ← beside the generated serve.ts, or --host <file>
//     export function routes(req, info): Response | null   // tried FIRST
//     export function wrap(next): handler                  // wraps the composed app
//
// Same bytes as prod, one more layer, and dev == prod again. HMR and the annotate
// overlay stay OUTSIDE it (they are dev's, not the app's), so the host sees the
// same request shape prod hands it.

import { isAbsolute, join, resolve, toFileUrl } from "@std/path";

export type DevHandler = (
  req: Request,
  info: Deno.ServeHandlerInfo,
) => Response | Promise<Response>;

/** What a host module may export. Both are optional; one is required. */
export interface HostModule {
  /** Wrap the composed app — the production wrapper, verbatim. */
  wrap?: (next: DevHandler) => DevHandler;
  /** Extra routes, tried before the composed app. `null` = not mine, carry on. */
  routes?: (
    req: Request,
    info: Deno.ServeHandlerInfo,
  ) => Response | null | Promise<Response | null>;
}

export interface HostEntry {
  /** Absolute path to the module. */
  path: string;
  /** Named by `--host` (mistakes are fatal) vs found on disk (mistakes warn). */
  explicit: boolean;
}

/** The file `sprig dev` looks for beside the generated serve.ts. */
export const HOST_FILE = "host.ts";

/** The `--host` value, or null. Accepts both spellings Deno users write. */
export function hostArg(rawArgs: string[]): string | null {
  const eq = rawArgs.find((a) => a.startsWith("--host="));
  if (eq) return eq.slice("--host=".length) || null;
  const i = rawArgs.indexOf("--host");
  return i >= 0 ? rawArgs[i + 1] ?? null : null;
}

/** Every token `--host` consumes — including its VALUE, which is not a flag and
 *  would otherwise be read as the app dir by the positional scan in dev() and
 *  devSupervisor() (the same trap `--annotate <html>` already has to dodge). */
export function hostArgTokens(rawArgs: string[]): string[] {
  const eq = rawArgs.find((a) => a.startsWith("--host="));
  if (eq) return [eq];
  const i = rawArgs.indexOf("--host");
  if (i < 0) return [];
  return rawArgs[i + 1] === undefined ? ["--host"] : ["--host", rawArgs[i + 1]];
}

/** Where the host module is: `--host <file>` (resolved against `rootAbs`, or
 *  used as-is when absolute), else `<rootAbs>/host.ts` when it exists, else null.
 *  An explicit file that isn't there THROWS — asking for a host and silently not
 *  getting one is how an afternoon goes. */
export async function resolveHostEntry(
  rawArgs: string[],
  rootAbs: string,
): Promise<HostEntry | null> {
  const flag = hostArg(rawArgs);
  if (flag) {
    const path = isAbsolute(flag) ? flag : resolve(rootAbs, flag);
    try {
      const st = await Deno.stat(path);
      if (!st.isFile) throw new Error("not a file");
    } catch {
      throw new Error(
        `sprig dev --host: no such file "${flag}" (looked at ${path}).\n` +
          `  --host names the module that wraps the composed app — the one your production entry uses.`,
      );
    }
    return { path, explicit: true };
  }
  const auto = join(rootAbs, HOST_FILE);
  try {
    if ((await Deno.stat(auto)).isFile) return { path: auto, explicit: false };
  } catch { /* no host.ts — the ordinary case */ }
  return null;
}

/** Compose the host over the composed app: `routes` first, `wrap` around the
 *  rest. A host exporting neither is the caller's problem (see hostLayer). */
export function layerHost(mod: HostModule, composed: DevHandler): DevHandler {
  const inner = typeof mod.wrap === "function" ? mod.wrap(composed) : composed;
  const routes = mod.routes;
  if (typeof routes !== "function") return inner;
  return async (req, info) => await routes(req, info) ?? await inner(req, info);
}

/** Load the app's host module (if any) and layer it over `composed`.
 *
 *  Returns the layered handler plus a banner label, or null when there is no
 *  host to layer. The explicit/auto asymmetry is the whole policy: `--host` is a
 *  request, so a broken one is fatal; an auto-detected `host.ts` is a guess, so a
 *  file that turns out not to be a host layer warns and is skipped rather than
 *  taking `sprig dev` down for an app that never asked. */
export async function hostLayer(
  rawArgs: string[],
  rootAbs: string,
  composed: DevHandler,
  report: (msg: string) => void = console.error,
): Promise<{ handler: DevHandler; label: string } | null> {
  const entry = await resolveHostEntry(rawArgs, rootAbs);
  if (!entry) return null;

  const rel = entry.path.startsWith(rootAbs + "/")
    ? entry.path.slice(rootAbs.length + 1)
    : entry.path;

  let mod: HostModule;
  try {
    mod = await import(toFileUrl(entry.path).href) as HostModule;
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e);
    const msg = `sprig dev: ${rel} failed to load — ${why}`;
    if (entry.explicit) throw new Error(msg);
    report(`${msg}\n  (auto-detected; dev continues without it)`);
    return null;
  }

  const hooks = [
    typeof mod.routes === "function" ? "routes" : null,
    typeof mod.wrap === "function" ? "wrap" : null,
  ].filter((h): h is string => h !== null);

  if (hooks.length === 0) {
    const msg =
      `sprig dev: ${rel} exports neither \`wrap(next)\` nor \`routes(req, info)\` — ` +
      `nothing to layer over the composed app.\n` +
      `  export function routes(req, info) { … return null }  // tried before the app\n` +
      `  export function wrap(next) { return (req, info) => … }  // wraps the app`;
    if (entry.explicit) throw new Error(msg);
    report(`${msg}\n  (auto-detected; dev continues without it)`);
    return null;
  }

  return {
    handler: layerHost(mod, composed),
    label: `${rel} (${hooks.join(" + ")})`,
  };
}
