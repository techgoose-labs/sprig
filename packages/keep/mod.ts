/**
 * `@mrg-keystone/sprig/bedrock` — the app's UI half, as a bedrock `Unit`.
 *
 *   export default Bedrock({ ui: Frontend(), backend: api, auth: Infra() });
 *
 * This module used to BE a composition root: `serveSprig` dispatched paths,
 * mounted a backend, ran an `/auth` gateway, and minted a per-request client.
 * Every one of those is bedrock's now, once, for the whole app — so what is
 * left here is the part that was always sprig's: serving the SSR pages, their
 * assets, and binding the provisioned client into the `Backend` DI token so
 * `resolve.ts` reads data with no token and no TCP.
 */
import {
  backendClient,
  bootstrap,
  type Guard,
  isLayoutLoad,
  type Route,
  type RouteMeta,
  type SprigApp,
} from "@mrg-keystone/sprig";
import { logger, of } from "@mrg-keystone/bedrock";
import type { Bag, Identity, Unit } from "@mrg-keystone/bedrock";
import { dirname, fromFileUrl, join, toFileUrl } from "@std/path";
import { createRenderer as makeRenderer } from "../../framework/.sprig/compiler/mod.ts";
// Third-party browser libs VENDORED INTO the server source (imported as TEXT → part of the
// module graph, not a disk read, so they ship whether sprig runs from ~/.sprig or straight
// from JSR). Frontend hands them to the client at <base>/_assets/vendor/<name>; every app
// AND the isolate workbench gets them without compiling them into its own frontend bundle.
// The app declares these in deno.json ONLY for type-checking — this vendored copy is the one
// and only version that actually runs (same "CLI owns the runtime" rule as @mrg-keystone/sprig).
// Load each vendored lib as TEXT from this module's OWN location — works both from a local file://
// install (~/.sprig) and the published https:// JSR module. (A static `import … with { type: "text" }`
// can't be published: JSR's module-graph builder rejects the text import attribute. Same eagerness as
// the old text import, which embedded all 561K in the graph regardless.)
const readVendor = async (name: string): Promise<string> => {
  const u = new URL(`./vendor/${name}`, import.meta.url);
  return u.protocol === "file:"
    ? await Deno.readTextFile(u)
    : await (await fetch(u)).text();
};
const VENDOR: Record<string, { body: string; type: string }> = {
  "apexcharts.js": {
    body: await readVendor("apexcharts.js"),
    type: "text/javascript; charset=utf-8",
  },
};
/** The SHARED vendor-asset route — one serving path answers it now, so the
 *  three-way lockstep this had to maintain (and twice broke) is gone.
 *  answers `<assetPrefix>/vendor/<name>` from the VENDOR map above, NOT the app's build output —
 *  the renderer injects these tags on every page and the app never emits the files, so a serving
 *  path without this route 404s the tag on every page load. Returns null for a non-vendor path
 *  (fall through to the built-assets route); an unknown vendored name is a handled 404. */
function serveVendorAsset(path: string, assetPrefix: string): Response | null {
  const prefix = assetPrefix + "/vendor/";
  if (!path.startsWith(prefix)) return null;
  const asset = VENDOR[path.slice(prefix.length)];
  return asset
    ? new Response(asset.body, {
      headers: {
        "content-type": asset.type,
        "cache-control": "public, max-age=86400",
      },
    })
    : new Response("Not Found", { status: 404 });
}

// The SSR renderer is server-only (Deno APIs) so it can't live in client-safe
// @mrg-keystone/sprig; it belongs with the rest of the server glue. The actual COMPILER
// (buildClient + the tree-sitter parser) is CLI-only and is NOT re-exported here.
export {
  createRenderer,
  type SsrRenderer,
} from "../../framework/.sprig/compiler/mod.ts";
import { assetsVersioner } from "../../framework/.sprig/compiler/hash.ts";

// ───────────────────────────── JSON folder routing ─────────────────────────────
// Routes as data: `src/root.json` is the entry table; a route whose `load` is a `routers/<name>`
// pulls its children from `src/routers/<name>/routes.json`, and `guards: ["<name>"]` resolves to
// `src/guards/<name>/guard.ts`'s exported guard. Declarative route tables (no imports) that compose
// folder-first. `defineRoutes([...])` in TS still works — this just produces the same Route[].
interface RawRoute {
  path: string;
  load?: string;
  guards?: string[];
  requiredGrant?: string;
  meta?: RouteMeta;
  children?: RawRoute[];
}

async function routeFileExists(p: string): Promise<boolean> {
  try {
    await Deno.stat(p);
    return true;
  } catch {
    return false;
  }
}

async function resolveGuards(
  names: string[],
  srcDir: string,
): Promise<Guard[]> {
  const guards: Guard[] = [];
  for (const name of names) {
    // a guard is a folder: guards/<name>/mod.ts (+ its test.ts). guard.ts is the legacy filename.
    const dir = join(srcDir, "guards", name);
    const path = (await routeFileExists(join(dir, "mod.ts")))
      ? join(dir, "mod.ts")
      : join(dir, "guard.ts");
    const mod = await import(toFileUrl(path).href) as Record<string, unknown>;
    const fn = (mod.default ?? mod.guard ?? Object.values(mod).find((v) =>
      typeof v === "function"
    )) as Guard | undefined;
    if (typeof fn !== "function") {
      throw new Error(
        `sprig loadRoutes: guard "${name}" — ${path} must export a guard function (default or named).`,
      );
    }
    guards.push(fn);
  }
  return guards;
}

async function mapRouteTable(
  entries: RawRoute[],
  srcDir: string,
): Promise<Route[]> {
  const out: Route[] = [];
  for (const e of entries) {
    const route: Route = { path: e.path };
    if (e.load) route.load = e.load;
    if (e.requiredGrant) route.requiredGrant = e.requiredGrant;
    if (e.meta) route.meta = e.meta;
    if (e.guards?.length) route.guards = await resolveGuards(e.guards, srcDir);
    // children = inline children (recursively) + a router's OWN routes.json (routers/<name>/…)
    const children: Route[] = e.children
      ? await mapRouteTable(e.children, srcDir)
      : [];
    if (isLayoutLoad(e.load)) {
      const table = join(srcDir, e.load!, "routes.json");
      if (await routeFileExists(table)) {
        const sub = JSON.parse(await Deno.readTextFile(table)) as RawRoute[];
        children.push(...await mapRouteTable(sub, srcDir));
      }
    }
    if (children.length) route.children = children;
    out.push(route);
  }
  return out;
}

/** Load the app's route tree from JSON folder tables: `<srcDir>/root.json` (the entry table), each
 *  `routers/<name>/routes.json` (a layout's children), and `guards/<name>/guard.ts` (guards resolved
 *  by name). Produces the same `Route[]` `bootstrap()` consumes — `defineRoutes([...])` still works. */
export async function loadRoutes(srcDir: string): Promise<Route[]> {
  // The entry is the routers/root/ router — its routes.json is the top-level table, its template.html
  // the root layout, its logic.ts the shared root hooks (a regular router that IS the entrypoint).
  // Legacy: a flat src/root.json table with no root layout. Prefer the folder.
  if (await routeFileExists(join(srcDir, "routers", "root", "routes.json"))) {
    return await mapRouteTable([{ path: "", load: "routers/root" }], srcDir);
  }
  const raw = JSON.parse(
    await Deno.readTextFile(join(srcDir, "root.json")),
  ) as RawRoute[];
  return await mapRouteTable(raw, srcDir);
}

/** Who the caller is, as SSR sees it — bedrock's `Identity`, verbatim. It used
 *  to be a shape sprig declared for itself (and duplicated in core.ts) and
 *  populated from a cookie it parsed; it is the auth unit's verdict now, read
 *  off the envelope, and there is exactly one definition of it in the system. */
export type SessionProfile = Identity;

const ASSET_TYPES: Record<string, string> = {
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
};

/** Methods the WHATWG Fetch spec forbids the Request constructor from carrying.
 *  the unit re-wraps incoming requests, so these must be rejected BEFORE the
 *  re-wrap (else `new Request(...)` throws an uncaught TypeError → bare 500). */
const FORBIDDEN_METHODS = new Set(["TRACE", "TRACK", "CONNECT"]);

// The request-body size / JSON-depth gateway moved to KEEP with its subject
// (`checkBody`, `MAX_BODY_BYTES`, `MAX_JSON_DEPTH`). It used to live here, which
// meant it guarded a keep backend only when a sprig UI happened to be composed
// in front of it — a backend served alone, or behind any other UI, had none.

// `FRAMEWORK_LOGGING` and its `[fw:<scope>]` lines are gone. They existed to
// narrate the branches this module used to take — which auth mode it chose,
// whether a session engine reached the gateway, what the guard decided — and
// every one of those branches is gone with the code that took them. What is
// left is one thing (serve the pages), and it logs through bedrock's logger
// like everything else, joined to the dispatch's request id.

/** Derive the lookup extension from the BASENAME (the segment after the last
 *  "/"), lower-cased; "" when there is no dot in the basename. Never reads across
 *  a "/" separator (bug 93) and never mis-keys an extensionless name to its
 *  trailing character (bug 91). Exported for direct regression testing. */
export function assetExt(file: string): string {
  const base = file.slice(file.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  return dot < 0 ? "" : base.slice(dot).toLowerCase();
}

/** Derive a content-type from the file's extension (case-insensitive). */
function contentTypeFor(file: string): string {
  return ASSET_TYPES[assetExt(file)] ?? "application/octet-stream";
}

/** Read `<assetsDir>/build-info.json` once and render the provenance `<meta>` tags for the head.
 *  Memoized (constant per deployment); "" when the file is absent (local dev / not stamped). */
function buildMetaReader(assetsDir: string): () => Promise<string> {
  let cached: string | null = null;
  return async () => {
    if (cached !== null) return cached;
    try {
      const info = JSON.parse(
        await Deno.readTextFile(`${assetsDir}/build-info.json`),
      ) as Record<string, unknown>;
      const esc = (s: string) =>
        s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
      const tag = (name: string, key: string) => {
        const v = info[key];
        return typeof v === "string" && v
          ? `  <meta name="${name}" content="${esc(v)}" />\n`
          : "";
      };
      cached = tag("git-repo", "repo") + tag("git-commit", "commit") +
        tag("git-branch", "branch") + tag("build-time", "buildTime");
    } catch {
      cached = ""; // no build-info → emit nothing
    }
    return cached;
  };
}

/** Splice `meta` into an HTML response right after the opening `<head>` — streaming-safe (the head
 *  flushes as the first chunk, so the tags land immediately and the body passes through untouched).
 *  A non-HTML response, or an empty `meta`, is returned unchanged. */
function injectHeadMeta(res: Response, meta: string): Response {
  if (!meta) return res;
  const type = res.headers.get("content-type") ?? "";
  if (!type.includes("text/html") || res.body === null) return res;
  const dec = new TextDecoder();
  const enc = new TextEncoder();
  const NEEDLE = "<head>";
  let carry = "";
  let done = false;
  const rewrite = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      if (done) {
        controller.enqueue(chunk);
        return;
      }
      carry += dec.decode(chunk, { stream: true });
      const at = carry.indexOf(NEEDLE);
      if (at !== -1) {
        const cut = at + NEEDLE.length;
        controller.enqueue(
          enc.encode(carry.slice(0, cut) + "\n" + meta + carry.slice(cut)),
        );
        carry = "";
        done = true;
      } else if (carry.length > 8192) {
        controller.enqueue(enc.encode(carry)); // no <head> in the first 8KB → pass through
        carry = "";
        done = true;
      }
    },
    flush(controller) {
      if (carry) controller.enqueue(enc.encode(carry));
    },
  });
  const headers = new Headers(res.headers);
  headers.delete("content-length"); // body length changed
  return new Response(res.body.pipeThrough(rewrite), {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}

// ─────────────────────────── zero-composition derivation ───────────────────────────
// A generated `serve.ts` is `export default Bedrock({ ui: Frontend(), backend: api })`.
// Everything else is DERIVED from one runtime anchor (`Deno.mainModule`, the git-root serve.ts that
// `--rune` hoists) plus the ui/-or-app/ convention (probed on disk): srcDir = <root>/<ui|app>/src, assetsDir = <root>/<ui|app>/static
// (falling back to <root>/src|static for a UI-at-root layout). The app is then composed from srcDir the
// SAME way `sprig dev` does — so an app authors no composition file and can't forget `assetsDir` (the
// cwd-relative default that shipped ?v=dev to prod). Every derived value is an override-able default:
// pass `app`/`assetsDir` explicitly and derivation never runs (back-compat, and how `sprig dev` calls it).

/** The dir of the running entrypoint (the git-root `serve.ts`), or null when `Deno.mainModule` isn't a
 *  file URL (e.g. a jsr:/https: entry, or a test harness) — then paths must be passed explicitly. */

/** The dir of the running entrypoint (the git-root `serve.ts`), or null when `Deno.mainModule` isn't a
 *  file URL (e.g. a jsr:/https: entry, or a test harness) — then paths must be passed explicitly. */
function entryRoot(): string | null {
  try {
    const m = Deno.mainModule;
    return m.startsWith("file:") ? dirname(fromFileUrl(m)) : null;
  } catch {
    return null;
  }
}

/** The sanctioned UI package names under the project root, in preference order: `ui/` is the
 *  canonical composed layout; `app/` is the alternate name rune's structure spec sanctions. */
const UI_PACKAGE_NAMES = ["ui", "app"] as const;

/** esbuild's content-hashed chunk names (chunk-XXXXXXXX.js, 8 base32 chars). These are
 *  content-addressed by FILENAME — new bytes always mean a new name — so `immutable`
 *  is sound for them even without a ?v= (they're fetched via bare relative imports,
 *  which don't inherit the importer's query). The pattern is deliberately tight so a
 *  hand-authored "chunk-utils.js" can never be wrongly pinned for a year. */
const HASHED_CHUNK = /^chunk-[A-Z0-9]{8}\.js$/;

async function serveAsset(
  dir: string,
  file: string,
  req: Request,
  version?: () => Promise<string | null>,
): Promise<Response> {
  // static files answer only to GET/HEAD
  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { "allow": "GET, HEAD" },
    });
  }
  // percent-decode the file segment before disk lookup, so a non-ASCII asset
  // name (e.g. isl.café-card.js, requested as isl.caf%C3%A9-card.js) resolves to
  // its file on disk instead of 404-ing. A malformed escape (e.g. a lone "%")
  // throws URIError → clean 400 rather than a crash. Mirrors dev.ts's AST endpoint.
  let decoded: string;
  try {
    decoded = decodeURIComponent(file);
  } catch {
    return new Response("Bad Request", { status: 400 });
  }
  // contain to dir (no path traversal): reject only a real ".." path SEGMENT,
  // not a legitimate single-segment name that merely contains a ".." substring.
  // The guard runs AFTER decoding so an encoded "..%2f" traversal is still caught.
  // Split on BOTH separators: Windows treats "\" as a path separator too, so an
  // encoded backslash ("..%5c") must be caught as well — not just "/" (".."%2f).
  if (decoded.split(/[/\\]/).includes("..")) {
    return new Response("Forbidden", { status: 403 });
  }
  try {
    const path = `${dir}/${decoded}`;
    const stat = await Deno.stat(path);
    // `immutable` may only ever be sent for a CONTENT-ADDRESSED request — one whose
    // URL is guaranteed to change when the bytes change: either ?v= equals the served
    // dir's CURRENT content hash, or the file is a content-hash-named chunk. Anything
    // else (?v=dev from a degraded version, a missing ?v=, a stale hash from a browser
    // that cached an older deploy) gets `no-cache` = revalidate before reuse — the
    // ETag/304 path below makes that one cheap conditional request, not a re-download.
    // Unconditional `immutable` here is what turned a frozen ?v= into browsers wedged
    // on a year-long cache of a dead deploy (every island failing to hydrate).
    const q = new URL(req.url).searchParams.get("v");
    const cur = version ? await version() : null;
    const addressed = (cur !== null && q === cur) ||
      HASHED_CHUNK.test(decoded.slice(decoded.lastIndexOf("/") + 1));
    // cache validators so conditional GETs can 304 instead of re-transferring
    const lastModified = stat.mtime ?? new Date(0);
    const etag = `W/"${stat.size.toString(16)}-${
      lastModified.getTime().toString(16)
    }"`;
    const inm = req.headers.get("if-none-match");
    const ims = req.headers.get("if-modified-since");
    const notModified = (inm !== null && inm === etag) ||
      (inm === null && ims !== null &&
        new Date(ims).getTime() >=
          Math.floor(lastModified.getTime() / 1000) * 1000);
    const headers: Record<string, string> = {
      "content-type": contentTypeFor(file),
      "cache-control": addressed
        ? "public, max-age=31536000, immutable"
        : "no-cache",
      "etag": etag,
      "last-modified": lastModified.toUTCString(),
    };
    if (notModified) return new Response(null, { status: 304, headers });
    const bytes = await Deno.readFile(path);
    return new Response(req.method === "HEAD" ? null : bytes, { headers });
  } catch {
    return new Response("Not Found", { status: 404 });
  }
}

export interface ServeDefaultExport {
  fetch(req: Request, info: Deno.ServeHandlerInfo): Promise<Response>;
}

// The `/auth/*` gateway that used to live here is GONE — the endpoints, the
// `sprig_session` cookie machinery, the Firebase loader, the opaque-token
// exchange, and the baked-in infra URL with it. Auth is a UNIT now, in the
// composition root's third slot:
//
//   Bedrock({ ui: Frontend(), backend: api, auth: Infra() })
//
// which is a strictly better place for it: the gateway sat inside the UI half,
// so it guarded nothing (it only PROXIED), and an app that composed no sprig UI
// had no `/auth` at all. The unit owns `/auth/*`, and its `verify` runs above
// every unit on every channel. An island that needs to sign in calls
// `/auth/login` over the wire like any other route.

export function deriveUiPackageDir(root: string): string {
  for (const name of UI_PACKAGE_NAMES) {
    try {
      if (Deno.statSync(join(root, name)).isDirectory) return join(root, name);
    } catch { /* not this name — probe the next */ }
  }
  return join(root, "ui");
}

/** Derive a UI subtree dir (`src` or `static`) from the entry anchor + the ui/-or-app/ convention:
 *  `<root>/<ui-package>/<sub>` (see deriveUiPackageDir). The composed monorepo is the only shape
 *  now — the sprig UI is a `./ui` (or `./app`) package under the git root, beside `./server` (the
 *  keep backend), and serve.ts sits at the root, so `Deno.mainModule`'s dir IS the root. The flat
 *  UI-at-root layout was removed. Returns the cwd-relative `sub` as a last resort only when there
 *  is NO file anchor. */
function deriveUiDir(sub: string): string {
  const root = entryRoot();
  if (!root) return sub;
  return join(deriveUiPackageDir(root), sub);
}

/** Resolve an app's route table from `srcDir` — folder tables (`routers/root/routes.json` / legacy
 *  `root.json`, via loadRoutes) or a `src/mod.ts` `routes` export (the code-composed style). The
 *  SAME resolution `sprig dev`'s appRoutes runs, so dev and the generated serve.ts compose identically. */
async function resolveAppRoutes(srcDir: string): Promise<Route[]> {
  if (
    await routeFileExists(join(srcDir, "routers", "root", "routes.json")) ||
    await routeFileExists(join(srcDir, "root.json"))
  ) {
    return await loadRoutes(srcDir);
  }
  const modPath = join(srcDir, "mod.ts");
  const mod = await import(toFileUrl(modPath).href) as {
    routes?: Route[];
    sprigApp?: SprigApp;
  };
  if (Array.isArray(mod.routes)) return mod.routes;
  throw new Error(
    `sprig: ${modPath} exports no \`routes\` array — export \`routes = defineRoutes([...])\`, ` +
      `add src/routers/root/routes.json, or pass \`app\` explicitly.`,
  );
}

/** Compose the SSR app from `srcDir` (createRenderer scans it for pages/islands; bootstrap wires the
 *  routes) — the composition `ui/src/mod.ts` used to hand-author. Async; called lazily on first request
 *  so the unit's handler keeps its synchronous construction. */
async function composeApp(srcDir: string, base: string): Promise<SprigApp> {
  const renderer = await makeRenderer(srcDir, base, {
    dev: !!Deno.env.get("SPRIG_DEV"),
  });
  return bootstrap({ routes: await resolveAppRoutes(srcDir), base, renderer });
}

/** Prod safety net: a missing/empty assets dir is the intended DEGRADED-DEV state (?v=dev, no
 *  provenance), indistinguishable from a misconfigured prod deploy EXCEPT by context — so when
 *  `SPRIG_DEV` is unset (a real launch) and the dir has no built assets, say so LOUDLY, once, at
 *  startup, instead of silently shipping ?v=dev + no <meta> tags (the alfred outage). */
function assetsGuard(assetsDir: string): void {
  if (Deno.env.get("SPRIG_DEV")) return;
  let empty = true;
  try {
    for (const _ of Deno.readDirSync(assetsDir)) {
      empty = false;
      break;
    }
  } catch {
    empty = true; // absent dir → empty
  }
  if (empty) {
    console.warn(
      `sprig: assetsDir "${assetsDir}" has no built assets — ?v= cache-busting + <meta> ` +
        `provenance are degraded. Did the build run? (set SPRIG_DEV=1 to silence in dev.)`,
    );
  }
}

/** bare-root/favicon redirects DERIVED from `base` (not options): when the UI mounts at a non-root
 *  base, `/` can only mean "go to the app" and `/favicon.ico` is served from the built assets.
 *  Returns a redirect Response or null. A ROOT mount — `base: "/"` OR `base: ""` (the isolate
 *  workbench mounts at "") — means the app is already at `/`, so NO redirect: redirecting `/` to an
 *  empty `location` self-loops into a blank page. Applied by the unit BEFORE the SSR app so the
 *  app authors neither. */
export function derivedRedirect(path: string, base: string): Response | null {
  if (base === "/" || base === "") return null; // root mount — the app IS at "/", nothing to redirect to
  if (path === "/") {
    return new Response(null, { status: 307, headers: { location: base } });
  }
  if (path === "/favicon.ico") {
    return new Response(null, {
      status: 307,
      headers: { location: `${base}/_assets/favicon.svg` },
    });
  }
  return null;
}

/** Configuration for {@link Frontend}. Everything is derivable from the
 *  ui/-convention app the CLI scaffolds; pass overrides only off the path. */
export interface FrontendConfig {
  /** The SSR base the pages live under (default "/ui"). */
  base?: string;
  /** Static assets dir (default `<gitRoot>/ui/static`). */
  assetsDir?: string;
  /** An explicit composed app; default composes from `<gitRoot>/ui/src`. */
  app?: SprigApp;
}

/**
 * The app's UI half, as a bedrock `Unit`.
 *
 *   export default Bedrock({ ui: Frontend(), backend: api, auth: Infra() });
 *
 * The handler takes the BAG as its third argument — `{ fetch, app, policy }`,
 * provisioned per dispatch by the composition root. Its `fetch` is the one
 * in-process client, request-bound in scope: sprig binds it into the
 * request-scoped `Backend` DI token, so `inject(Backend)` in SSR reads
 * in-process carrying this request's own cookies, and `Set-Cookie` from those
 * reads lands on the outer browser response. With no bag (a bare
 * `Deno.serve(Frontend().handler)`), the token stays unbound and
 * `inject(Backend)` fails loud.
 *
 * The unit also declares its POLICY: the routes a caller with no credential
 * must still reach, or a signed-out browser cannot load the page that would
 * let it sign in. Those are the assets, the favicon, and the root redirect.
 * Everything else follows the `ui` slot's default — open — unless the app
 * declares otherwise.
 *
 * Session comes from the ENVELOPE: whoever the auth unit's `verify` returned
 * for this dispatch is stamped on the request by the root and read back here,
 * on both channels, with nothing for the app to plumb. sprig used to have no
 * way to know who the caller was at all.
 */
export function Frontend(config: FrontendConfig = {}): Unit {
  const base = config.base ?? "/ui";
  const assetsDir = config.assetsDir ?? deriveUiDir("static");
  const assetPrefix = `${base}/_assets`;
  assetsGuard(assetsDir);
  const version = assetsVersioner(assetsDir);
  const buildMeta = buildMetaReader(assetsDir);
  const srcDir = deriveUiDir("src");
  let appOnce: Promise<SprigApp> | undefined;
  const getApp = (): Promise<SprigApp> =>
    config.app
      ? Promise.resolve(config.app)
      : (appOnce ??= composeApp(srcDir, base));

  logger.debug("sprig: Frontend composed", { base, assetsDir });

  const handler = async (
    req: Request,
    _info?: Deno.ServeHandlerInfo,
    bag?: Bag,
  ): Promise<Response> => {
    const url = new URL(req.url);
    const path = url.pathname;
    if (path === "/" || path === "") {
      return Response.redirect(new URL(base, url), 302);
    }
    if (path === "/favicon.ico") {
      return Response.redirect(new URL(`${assetPrefix}/favicon.ico`, url), 302);
    }
    if (path !== base && !path.startsWith(base + "/")) {
      return new Response("Not Found", { status: 404 });
    }
    if (FORBIDDEN_METHODS.has(req.method)) {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: { "allow": "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS" },
      });
    }
    // framework-vendored libs → the shared vendor route (the build output never has them)
    const vendorRes = serveVendorAsset(path, assetPrefix);
    if (vendorRes) return vendorRes;
    if (path.startsWith(assetPrefix + "/")) {
      return await serveAsset(
        assetsDir,
        path.slice(assetPrefix.length + 1),
        req,
        version,
      ) ??
        new Response("Not Found", { status: 404 });
    }
    const app = await getApp();
    // The REQUEST-SCOPED binding of the cardinal invariant: the third-argument
    // client is minted per request by the composing layer; wrap it fresh here,
    // per call — never captured into module scope or a singleton provider.
    const backend = bag ? backendClient(bag.fetch) : undefined;
    const res = await app.fetch(req, _info, {
      backend,
      assetsVersion: (await version()) ?? undefined,
      // The envelope, not a cookie the app has to parse: whoever this dispatch
      // was allowed as. `null` means the route was reached openly.
      session: of(req).identity ?? null,
    });
    return injectHeadMeta(res, await buildMeta());
  };

  return {
    handler,
    policy: [
      // A signed-out browser must be able to load the page that lets it sign in
      // — which means its assets, too. Declared here rather than assumed,
      // because the `ui` slot's default only holds until an app narrows it.
      { path: `${assetPrefix}/*`, access: "open" },
      { path: "/favicon.ico", access: "open" },
      { path: "/", access: "open" },
    ],
  };
}
