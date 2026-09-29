// Discovery: scan a SPRIG project for folder-components/pages with an `isolate/`
// folder. A sprig component is a folder with a `template.html`; it's an island if
// it also has a `logic.ts`. (No .tsx export scanning — the selector IS the folder
// basename.)
//
// Scanned roots (under <projectRoot>/src/): components/ + islands/ are single
// components (routed under /components/…); pages/ holds page compositions (routed
// under /pages/…).
//
//   <component-or-page>/isolate/
//     fixture.json                 { category, folder, background?, controls, components }
//     cases/
//       <case>/
//         <case>.json              bare keys -> props; _keys -> special
//         tests/*.spec.ts          Playwright tests for this case
//
// A preview route is a PAGE: the top-level component plus whatever sub-components
// it renders. `controls` declares widgets for the top-level component; `components`
// declares widgets for the sub-components ON the page, keyed by function name:
//   "components": { "Button": { "controls": { "disabled": { "type": "boolean" } } } }
// Declared once per component TYPE, but each rendered INSTANCE gets its own
// controls group — keyed by its `id` prop (e.g. Button #submit, Button #cancel),
// or shared per type when it has no id. A case's `_mocks[name].props` seeds the
// initial values. Edited live via the vnode hook.
//
// fixture.json `controls` DECLARES each control's widget (argTypes):
//   "variant": { "type": "select", "options": ["a","b"] }
//   "size":    { "type": "range", "min": 0, "max": 4, "step": 1 }
//   "count":   { "type": "range", "min": 0, "max": 20, "signal": true }
//   "disabled":{ "type": "boolean" }
// A control may carry a default `value`. Undeclared props fall back to a widget
// inferred from the case value's type.
//
// Case special keys (the whole list — any other `_` key is a "case-key" problem,
// reported naming the key and the case file, never ignored):
//   _name       label                      _innerHtml  projected children
//   _signals    island signals             _mocks      sub-component stubs/props
//   _viewport   px width | {width,height}  _theme      data-theme on <html>
//   _reference  reference PNG (+tolerance) _network    page.route fakes
//   _tier       interaction tier           _motion     captured getAnimations() spec
// The runner (../runner/mod.ts) applies _viewport/_theme/_network to every test of
// the case and turns _reference/_motion into `reference: …` / `motion: …` rows.

export type Kind = "static" | "island";
/** The top-level folder under src/ a component lives in (e.g. "shared-components", "pages"). */
export type Root = string;
/** What's being isolated: a single component (components/ + islands/) or a page (pages/). */
export type Target = "component" | "page";

export interface TestRef {
  name: string;
  file: string;
}

export interface ControlDef {
  type?: "select" | "range" | "color" | "boolean" | "number" | "text";
  options?: unknown[];
  min?: number;
  max?: number;
  step?: number;
  signal?: boolean;
  value?: unknown;
}

/**
 * A case's `_mocks[name]` directive for a sub-component:
 *   "stub" / true        — swap every instance for a labeled placeholder
 *   { props: {...} }      — force these props onto every instance
 * (`stub: true` inside the object form is also honored.)
 */
export type MockSpec =
  | "stub"
  | true
  | { stub?: boolean; props?: Record<string, unknown> };

/** The interaction tier a case exercises (REQ-044) — recorded, consumed by spec-check. */
export const TIERS = [
  "static",
  "pure-client",
  "optimistic-write",
  "realtime",
] as const;
export type Tier = typeof TIERS[number];

/** Default reference tolerance: the fraction of pixels allowed to differ (REQ-042). */
export const DEFAULT_TOLERANCE = 0.01;
/** Height used when `_viewport` is a bare width — Playwright's own default height. */
export const DEFAULT_VIEWPORT_HEIGHT = 720;

export interface Viewport {
  width: number;
  height: number;
}

/** Where a case-relative file was found: beside the case, or from the git root. */
export type ResolvedVia = "case dir" | "git root";

export interface ReferenceSpec {
  /** Absolute path of the reference PNG. */
  image: string;
  tolerance: number;
  reason?: string;
  via?: ResolvedVia;
}

export type NetworkAction =
  | { kind: "fail" }
  | { kind: "delay"; ms: number }
  | { kind: "respond"; status: number; body?: unknown };

/** One `_network` entry, resolved to a method + path the runner routes on. */
export interface NetworkRule {
  /** The key as written in the case (`"POST /api/todos"` or a command name). */
  key: string;
  method: string;
  path: string;
  /** Regex source matched against the request URL's pathname. */
  pattern: string;
  action: NetworkAction;
}

export interface MotionRef {
  /** Absolute path of the captured motion JSON. */
  spec: string;
  via?: ResolvedVia;
}

/** Contract operations by operationId → the method + path the typed client calls. */
export type Operations = Map<string, { method: string; path: string }>;

export interface CaseDef {
  name: string;
  label: string;
  jsonPath: string;
  props: Record<string, unknown>;
  innerHtml?: string;
  signals?: Record<string, unknown>;
  mocks?: Record<string, MockSpec>;
  viewport?: Viewport;
  theme?: string;
  reference?: ReferenceSpec;
  network?: NetworkRule[];
  tier?: Tier;
  motion?: MotionRef;
  route: string;
  tests: TestRef[];
}

export interface ComponentEntry {
  slug: string;
  label: string;
  kind: Kind;
  root: Root;
  target: Target;
  dir: string;
  isolateDir: string;
  componentFile: string;
  exportName: string;
  category: string;
  folder: string;
  background?: string;
  controlDefs: Record<string, ControlDef>;
  /** Per-sub-component control widgets, keyed by the sub-component's function name
   *  (or, for per-instance controls, an instance label). */
  subControlDefs: Record<string, Record<string, ControlDef>>;
  /** Optional CSS selector per `components` entry that targets a SPECIFIC rendered
   *  instance (e.g. "#submit") — the panel shows it as its own named group and applies
   *  edits directly to that element. Absent → the entry targets all instances of the
   *  selector via the mock/re-render path. */
  subTargets: Record<string, string>;
  cases: CaseDef[];
}

/** A config problem found during discovery — surfaced up front, not swallowed. */
export interface Problem {
  kind:
    | "fixture-json"
    | "case-json"
    | "component-file"
    | "component-export"
    | "case-key"
    | "unsupported";
  /** The offending file (fixture/case JSON) or component directory. */
  path: string;
  /** Human-readable explanation: a JSON parse message, or what resolution did. */
  detail: string;
}

export interface DiscoverResult {
  entries: ComponentEntry[];
  problems: Problem[];
}

async function exists(p: string): Promise<boolean> {
  try {
    await Deno.stat(p);
    return true;
  } catch {
    return false;
  }
}

function pascal(s: string): string {
  return s.split(/[-_\s]+/).filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("");
}

async function* walkDirs(root: string): AsyncGenerator<string> {
  // Deno.readDir errors lazily — a missing dir throws on first iteration, not on
  // the call — so the loop itself must be guarded (e.g. a project with no
  // components/ or no islands/).
  let entries: Deno.DirEntry[];
  try {
    entries = [];
    for await (const e of Deno.readDir(root)) entries.push(e);
  } catch {
    return;
  }
  for (const e of entries) {
    if (!e.isDirectory) continue;
    const child = `${root}/${e.name}`;
    yield child;
    yield* walkDirs(child);
  }
}

/** The immediate child directory names of `root` (not recursive) — the top-level folders. */
async function* topDirs(root: string): AsyncGenerator<string> {
  let entries: Deno.DirEntry[];
  try {
    entries = [];
    for await (const e of Deno.readDir(root)) entries.push(e);
  } catch {
    return;
  }
  for (const e of entries) if (e.isDirectory) yield e.name;
}

/** Parse fixture.controls into control definitions (objects), or {value} for bare values. */
export function parseControlDefs(raw: unknown): Record<string, ControlDef> {
  const defs: Record<string, ControlDef> = {};
  if (raw && typeof raw === "object") {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      defs[k] = (v && typeof v === "object" && !Array.isArray(v))
        ? v as ControlDef
        : { value: v };
    }
  }
  return defs;
}

/** A sensible initial value for a declared control that the case doesn't set. */
export function controlDefault(def: ControlDef): unknown {
  if (def.value !== undefined) return def.value;
  switch (def.type) {
    case "boolean":
      return false;
    case "number":
    case "range":
      return def.min ?? 0;
    case "select":
      // Empty/missing options would seed an `undefined` prop into the panel — fall
      // back to "" so the control renders an (empty) value instead.
      return def.options?.[0] ?? "";
    case "color":
      return "#000000";
    default:
      return "";
  }
}

const KNOWN_KEYS = [
  "_name",
  "_innerHtml",
  "_signals",
  "_mocks",
  "_viewport",
  "_theme",
  "_reference",
  "_network",
  "_tier",
  "_motion",
];
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

const isObj = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const isPos = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v > 0;

/** Join a case-relative path onto the case dir (pure; `..` segments collapse). */
function caseRelative(caseDir: string, p: string): string {
  if (p.startsWith("/")) return p;
  const parts = caseDir.split("/");
  for (const seg of p.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") parts.pop();
    else parts.push(seg);
  }
  return parts.join("/");
}

/** Resolve a case file path: relative to the case dir first, then to the git root
 *  (the breakdown's stills live under `<git root>/spec/ui/breakdown/…`, which a
 *  case copied into the build can't reach relatively). Absent both: every path tried. */
export async function resolveCaseFile(
  caseDir: string,
  given: string,
  root: string | null,
  has: (p: string) => Promise<boolean> = exists,
): Promise<{ path: string; via: ResolvedVia } | { tried: string[] }> {
  const tried = [caseRelative(caseDir, given)];
  if (!given.startsWith("/") && root) tried.push(caseRelative(root, given));
  for (const [i, p] of tried.entries()) {
    if (await has(p)) {
      return { path: p, via: i === 0 ? "case dir" : "git root" };
    }
  }
  return { tried };
}

/** A `_network` path → a regex source over the URL pathname: `{id}` and `:id` match
 *  one segment, `*` matches anything, everything else is literal. */
export function pathPattern(path: string): string {
  let out = "";
  for (const tok of path.split(/(\{[^}]+\}|:[A-Za-z_]\w*|\*)/)) {
    if (!tok) continue;
    if (tok === "*") out += ".*";
    else if (/^\{[^}]+\}$/.test(tok) || /^:[A-Za-z_]\w*$/.test(tok)) {
      out += "[^/]+";
    } else out += tok.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return `^${out}$`;
}

/** Read a contract's operationIds → { method, path } (path prefixed by the first
 *  server URL's pathname, the base the typed client calls). */
export function operationsFromOpenApi(doc: unknown): Operations {
  const ops: Operations = new Map();
  if (!isObj(doc)) return ops;
  let base = "";
  const servers = doc.servers;
  if (Array.isArray(servers) && isObj(servers[0])) {
    const url = String(servers[0].url ?? "");
    try {
      base = new URL(url, "http://x").pathname.replace(/\/$/, "");
    } catch { /* not a URL — no base */ }
  }
  for (
    const [path, item] of Object.entries(isObj(doc.paths) ? doc.paths : {})
  ) {
    if (!isObj(item)) continue;
    for (const [method, op] of Object.entries(item)) {
      if (!METHODS.includes(method.toUpperCase()) || !isObj(op)) continue;
      if (typeof op.operationId === "string") {
        ops.set(op.operationId, {
          method: method.toUpperCase(),
          path: base + path,
        });
      }
    }
  }
  return ops;
}

function parseNetworkAction(v: unknown): NetworkAction | string {
  if (v === "fail") return { kind: "fail" };
  if (typeof v === "string") {
    const m = v.match(/^delay:(\d+)$/);
    if (m) return { kind: "delay", ms: Number(m[1]) };
    return `"${v}" is not an action — use "fail", "delay:<ms>" or { "status": n, "body": any }`;
  }
  if (isObj(v)) {
    const status = v.status;
    if (
      typeof status === "number" && Number.isInteger(status) &&
      status >= 100 && status <= 599
    ) {
      return "body" in v
        ? { kind: "respond", status, body: v.body }
        : { kind: "respond", status };
    }
    return `{ "status": ${
      JSON.stringify(status)
    } } needs an integer HTTP status 100-599`;
  }
  return `${
    JSON.stringify(v)
  } is not an action — use "fail", "delay:<ms>" or { "status": n, "body": any }`;
}

/** Where paths resolve from + the contract's operations (null: no openapi.json). */
export interface CaseKeyContext {
  caseDir: string;
  operations?: Operations | null;
}

export interface CaseValues {
  props: Record<string, unknown>;
  innerHtml?: string;
  signals?: Record<string, unknown>;
  mocks?: Record<string, MockSpec>;
  label?: string;
  viewport?: Viewport;
  theme?: string;
  reference?: ReferenceSpec;
  network?: NetworkRule[];
  tier?: Tier;
  motion?: MotionRef;
  /** One message per invalid or unknown `_` key, each naming the key. */
  errors: string[];
}

/** Split a case JSON: bare keys -> props, `_` keys -> the validated specials above. */
export function parseCaseValues(
  obj: Record<string, unknown>,
  ctx: CaseKeyContext = { caseDir: "." },
): CaseValues {
  const out: CaseValues = { props: {}, errors: [] };
  const err = (m: string) => out.errors.push(m);
  for (const [k, v] of Object.entries(obj ?? {})) {
    if (!k.startsWith("_")) out.props[k] = v;
    else if (k === "_name") out.label = String(v);
    else if (k === "_innerHtml") out.innerHtml = String(v);
    else if (k === "_signals") out.signals = v as Record<string, unknown>;
    else if (k === "_mocks") out.mocks = v as Record<string, MockSpec>;
    else if (k === "_viewport") {
      if (isPos(v)) {
        out.viewport = { width: v, height: DEFAULT_VIEWPORT_HEIGHT };
      } else if (isObj(v) && isPos(v.width) && isPos(v.height)) {
        out.viewport = { width: v.width, height: v.height };
      } else {
        err(
          `"_viewport" must be a px width (375) or { "width": n, "height": n } — got ${
            JSON.stringify(v)
          }`,
        );
      }
    } else if (k === "_theme") {
      if (typeof v === "string" && v.trim()) out.theme = v;
      else {err(
          `"_theme" must be a non-empty string (the data-theme value) — got ${
            JSON.stringify(v)
          }`,
        );}
    } else if (k === "_reference") {
      const r = typeof v === "string" ? { image: v } : v;
      const tol = isObj(r) && r.tolerance !== undefined
        ? r.tolerance
        : DEFAULT_TOLERANCE;
      if (!isObj(r) || typeof r.image !== "string" || !r.image) {
        err(
          `"_reference" must be "<png path>" or { "image": "<png path>", "tolerance"?: n, "reason"?: "…" } — got ${
            JSON.stringify(v)
          }`,
        );
      } else if (typeof tol !== "number" || !(tol >= 0 && tol <= 1)) {
        err(
          `"_reference".tolerance must be a fraction of pixels between 0 and 1 — got ${
            JSON.stringify(tol)
          }`,
        );
      } else if (
        tol > DEFAULT_TOLERANCE &&
        !(typeof r.reason === "string" && r.reason.trim())
      ) {
        err(
          `"_reference".tolerance ${tol} is above the default ${DEFAULT_TOLERANCE} — add a "reason" saying why`,
        );
      } else {
        out.reference = {
          image: caseRelative(ctx.caseDir, r.image),
          tolerance: tol,
          ...(typeof r.reason === "string" && r.reason.trim()
            ? { reason: r.reason }
            : {}),
        };
      }
    } else if (k === "_network") {
      if (!isObj(v)) {
        err(
          `"_network" must be an object of { "<METHOD /path>" | "<commandName>": action } — got ${
            JSON.stringify(v)
          }`,
        );
        continue;
      }
      const rules: NetworkRule[] = [];
      let bad = false;
      for (const [key, raw] of Object.entries(v)) {
        let method: string | undefined;
        let path: string | undefined;
        const m = key.match(/^([A-Za-z]+)\s+(\S+)$/);
        if (m) {
          if (!METHODS.includes(m[1].toUpperCase())) {
            err(
              `"_network" key "${key}": ${m[1]} is not an HTTP method (${
                METHODS.join(", ")
              })`,
            );
          } else if (!m[2].startsWith("/")) {
            err(`"_network" key "${key}": the path must start with "/"`);
          } else [method, path] = [m[1].toUpperCase(), m[2]];
        } else if (/^[A-Za-z_$][\w$]*$/.test(key)) {
          if (!ctx.operations) {
            err(
              `"_network" key "${key}" is a command name, but there is no spec/contract/openapi.json at the git root to map it — use "METHOD /path"`,
            );
          } else {
            const op = ctx.operations.get(key);
            if (op) [method, path] = [op.method, op.path];
            else {
              err(
                `"_network" key "${key}" is not an operationId in spec/contract/openapi.json — known: ${
                  [...ctx.operations.keys()].slice(0, 20).join(", ")
                }`,
              );
            }
          }
        } else {
          err(
            `"_network" key "${key}" must be "METHOD /path" or a contract command name`,
          );
        }
        const action = parseNetworkAction(raw);
        if (typeof action === "string") {
          err(`"_network" key "${key}": ${action}`);
          bad = true;
        }
        if (!method || !path) bad = true;
        if (method && path && typeof action !== "string") {
          rules.push({ key, method, path, pattern: pathPattern(path), action });
        }
      }
      if (!bad) out.network = rules;
    } else if (k === "_tier") {
      if ((TIERS as readonly unknown[]).includes(v)) out.tier = v as Tier;
      else {err(
          `"_tier" must be one of ${TIERS.join(" | ")} — got ${
            JSON.stringify(v)
          }`,
        );}
    } else if (k === "_motion") {
      if (isObj(v) && typeof v.spec === "string" && v.spec) {
        out.motion = { spec: caseRelative(ctx.caseDir, v.spec) };
      } else {
        err(
          `"_motion" must be { "spec": "<path to the captured motion JSON>" } — got ${
            JSON.stringify(v)
          }`,
        );
      }
    } else {
      err(`unknown case key "${k}" — known keys: ${KNOWN_KEYS.join(", ")}`);
    }
  }
  return out;
}

/**
 * Statically scan a module's source for what it exports. We can't `import()` host
 * files from the CLI process (their deps resolve against the HOST's import map,
 * not ours), so this is a text-level lint: declaration exports, list exports
 * (incl. `as` renames), and `export default`. Type-only exports are skipped —
 * they don't exist at runtime, so they can't satisfy the component lookup.
 */
export function scanExports(
  src: string,
): { names: string[]; hasDefault: boolean } {
  const names = new Set<string>();
  let hasDefault = /^\s*export\s+default\b/m.test(src);
  for (
    const m of src.matchAll(
      /^\s*export\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm,
    )
  ) {
    names.add(m[1]);
  }
  for (const m of src.matchAll(/^\s*export\s*\{([^}]*)\}/gm)) {
    for (const part of m[1].split(",")) {
      const p = part.trim();
      if (!p || /^type\s/.test(p)) continue;
      const as = p.match(/^([\w$]+)\s+as\s+([\w$]+)$/);
      const name = as ? as[2] : p;
      if (name === "default") hasDefault = true;
      else if (/^[\w$]+$/.test(name)) names.add(name);
    }
  }
  return { names: [...names], hasDefault };
}

async function findComponentFile(
  dir: string,
  exportName: string,
  problems: Problem[],
): Promise<string> {
  const tsx: string[] = [];
  for await (const e of Deno.readDir(dir)) {
    if (e.isFile && /\.tsx?$/.test(e.name)) tsx.push(e.name);
  }
  const exact = tsx.find((n) => n.replace(/\.tsx?$/, "") === exportName);
  const ci = tsx.find((n) =>
    n.replace(/\.tsx?$/, "").toLowerCase() === exportName.toLowerCase()
  );
  const pick = exact ?? ci ?? tsx[0];
  // No exact or case-insensitive match: we either fall back to an arbitrary
  // .tsx (Vite then imports the wrong component) or find none. Surface it now.
  if (!exact && !ci) {
    problems.push({
      kind: "component-file",
      path: dir,
      detail: pick
        ? `no file matching export "${exportName}" — falling back to ${pick}`
        : `no .tsx file for export "${exportName}"`,
    });
  } else {
    // The file matched by name — now verify it actually EXPORTS the component.
    // The preview resolves `default` then the named export; anything else used to
    // render the wrong export silently. Catch it here, before the preview builds.
    try {
      const { names, hasDefault } = scanExports(
        await Deno.readTextFile(`${dir}/${pick}`),
      );
      if (!hasDefault && !names.includes(exportName)) {
        problems.push({
          kind: "component-export",
          path: `${dir}/${pick}`,
          detail: `no default export and no export named "${exportName}" — ` +
            `exports seen: ${names.join(", ") || "none"}`,
        });
      }
    } catch { /* unreadable — the preview's own error card will surface it */ }
  }
  // When nothing resolves, return "" rather than a misleading "${dir}/" — callers
  // can treat the empty string as "no component file" instead of building a bogus
  // path that fails cryptically (e.g. an attempt to import a directory) under --force.
  return pick ? `${dir}/${pick}` : "";
}

async function collectTests(testsDir: string): Promise<TestRef[]> {
  const out: TestRef[] = [];
  if (!(await exists(testsDir))) return out;
  for await (const e of Deno.readDir(testsDir)) {
    if (e.isFile && /\.spec\.tsx?$/.test(e.name)) {
      out.push({
        name: e.name.replace(/\.spec\.tsx?$/, ""),
        file: `${testsDir}/${e.name}`,
      });
    }
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

async function collectCases(
  isolateDir: string,
  defs: Record<string, ControlDef>,
  prefix: string,
  category: string,
  folder: string,
  problems: Problem[],
  operations: Operations | null,
  root: string | null,
): Promise<CaseDef[]> {
  const casesDir = `${isolateDir}/cases`;
  const cases: CaseDef[] = [];
  if (!(await exists(casesDir))) return cases;
  for await (const e of Deno.readDir(casesDir)) {
    if (!e.isDirectory) continue;
    const name = e.name;
    const caseDir = `${casesDir}/${name}`;
    const jsonPath = `${caseDir}/${name}.json`;
    let raw: Record<string, unknown> = {};
    if (await exists(jsonPath)) {
      try {
        raw = JSON.parse(await Deno.readTextFile(jsonPath));
      } catch (e) {
        problems.push({
          kind: "case-json",
          path: jsonPath,
          detail: (e as Error).message,
        });
      }
    }
    const v = parseCaseValues(raw, { caseDir, operations });
    for (const detail of v.errors) {
      problems.push({
        kind: "case-key",
        path: jsonPath,
        detail: `${detail} (in ${jsonPath})`,
      });
    }
    // The files a key points at must exist now — a missing reference or motion spec is
    // a config error at discovery, not a mystery failure inside the run.
    // The files a key points at must exist now — a missing reference or motion spec is
    // a config error at discovery (naming every path tried), not a mystery in the run.
    const given = (x: unknown) =>
      typeof x === "string" ? x : isObj(x) ? String(x.image ?? x.spec) : "";
    if (v.reference) {
      const r = await resolveCaseFile(caseDir, given(raw._reference), root);
      if ("tried" in r) {
        problems.push({
          kind: "case-key",
          path: jsonPath,
          detail: `"_reference" image not found — tried ${
            r.tried.join(" and ")
          } (in ${jsonPath})`,
        });
        v.reference = undefined;
      } else v.reference = { ...v.reference, image: r.path, via: r.via };
    }
    if (v.motion) {
      const r = await resolveCaseFile(caseDir, given(raw._motion), root);
      const bad = "tried" in r
        ? `not found — tried ${r.tried.join(" and ")}`
        : await motionSpecProblem(r.path);
      if (bad || "tried" in r) {
        problems.push({
          kind: "case-key",
          path: jsonPath,
          detail: `"_motion" spec ${bad} (in ${jsonPath})`,
        });
        v.motion = undefined;
      } else v.motion = { spec: r.path, via: r.via };
    }
    const props = { ...v.props };
    const signals = { ...(v.signals ?? {}) };
    let innerHtml = v.innerHtml;

    // Seed every declared control so it shows in the panel (case values win).
    for (const [n, def] of Object.entries(defs)) {
      if (n === "_innerHtml") {
        if (innerHtml === undefined) innerHtml = String(def.value ?? "");
      } else if (def.signal) {
        if (!(n in signals)) signals[n] = controlDefault(def);
      } else if (!(n in props)) {
        props[n] = controlDefault(def);
      }
    }

    cases.push({
      name,
      label: v.label ?? name,
      jsonPath,
      props,
      signals,
      innerHtml,
      mocks: v.mocks,
      ...(v.viewport ? { viewport: v.viewport } : {}),
      ...(v.theme ? { theme: v.theme } : {}),
      ...(v.reference ? { reference: v.reference } : {}),
      ...(v.network ? { network: v.network } : {}),
      ...(v.tier ? { tier: v.tier } : {}),
      ...(v.motion ? { motion: v.motion } : {}),
      route: folder
        ? `/${prefix}/${category}/${folder}/${name}`
        : `/${prefix}/${category}/${name}`,
      tests: await collectTests(`${caseDir}/tests`),
    });
  }
  cases.sort((a, b) => a.name.localeCompare(b.name));
  return cases;
}

/** Why a motion spec can't be read (null = readable): it must be a JSON array of
 *  animation records, or an object carrying one under `animations`. */
async function motionSpecProblem(path: string): Promise<string | null> {
  let doc: unknown;
  try {
    doc = JSON.parse(await Deno.readTextFile(path));
  } catch (e) {
    return (e as Error).message;
  }
  const list = Array.isArray(doc)
    ? doc
    : isObj(doc) && Array.isArray(doc.animations)
    ? doc.animations
    : null;
  return list
    ? null
    : 'not an array of animations (nor { "animations": [...] })';
}

/** The git root above `dir` (a `.git` dir or file), or null. */
async function gitRoot(dir: string): Promise<string | null> {
  let d = dir.replace(/\/+$/, "") || "/";
  while (true) {
    if (await exists(`${d}/.git`)) return d;
    const up = d.slice(0, d.lastIndexOf("/")) || "/";
    if (up === d) return null;
    d = up;
  }
}

/** The contract's operations from `<git root>/spec/contract/openapi.json`, or null
 *  when there is no such file (then `_network` accepts only "METHOD /path" keys). */
async function loadOperations(
  projectRoot: string,
  problems: Problem[] = [],
): Promise<Operations | null> {
  const root = (await gitRoot(projectRoot)) ?? projectRoot;
  return await readOperations(root, problems);
}

async function readOperations(
  root: string,
  problems: Problem[],
): Promise<Operations | null> {
  const file = `${root}/spec/contract/openapi.json`;
  if (!(await exists(file))) return null;
  try {
    return operationsFromOpenApi(JSON.parse(await Deno.readTextFile(file)));
  } catch (e) {
    problems.push({
      kind: "case-key",
      path: file,
      detail: `unreadable contract: ${(e as Error).message}`,
    });
    return null;
  }
}

export async function discover(projectRoot: string): Promise<DiscoverResult> {
  // Scan EVERY top-level folder under src/ (shared-components, pages, or whatever layout the
  // project uses). A folder under pages/ is a page (a routed composition); anything else is a
  // component. Whether it actually previews is gated below on having an isolate/ folder.
  const roots: { dir: string; target: Target }[] = [];
  for await (const top of topDirs(`${projectRoot}/src`)) {
    if (top === "shell") continue; // the root layout, never previewed
    roots.push({ dir: top, target: top === "pages" ? "page" : "component" });
  }
  const entries: ComponentEntry[] = [];
  const problems: Problem[] = [];
  const repoRoot = await gitRoot(projectRoot);
  const operations = await readOperations(repoRoot ?? projectRoot, problems);

  for (const { dir: root, target } of roots) {
    const prefix = target === "page" ? "pages" : "components";
    const rootAbs = `${projectRoot}/src/${root}`;
    for await (const dir of walkDirs(rootAbs)) {
      const rel = dir.slice(rootAbs.length + 1);
      // Skip the isolate/ folder itself and anything inside it — checked relative
      // to the scan root, so an "isolate" ancestor in the abs path doesn't match.
      if (rel.split("/").includes("isolate")) continue;
      // A folder-component (a folder with a template.html) previews ONLY when it also has an
      // isolate/ folder — its fixture + named cases. No isolate/ → not shown (no default case).
      const templatePath = `${dir}/template.html`;
      if (!(await exists(templatePath))) continue;
      const isolateDir = `${dir}/isolate`;
      if (!(await exists(isolateDir))) continue;

      const label = rel.split("/").pop() ?? rel;
      const exportName = label; // sprig selector = folder basename (no PascalCase)

      let fixture: Record<string, unknown> = {};
      const fixturePath = `${isolateDir}/fixture.json`;
      if (await exists(fixturePath)) {
        try {
          fixture = JSON.parse(await Deno.readTextFile(fixturePath));
        } catch (e) {
          problems.push({
            kind: "fixture-json",
            path: fixturePath,
            detail: (e as Error).message,
          });
        }
      }
      const category = String(fixture.category ?? label);
      const folder = String(fixture.folder ?? "");
      const controlDefs = parseControlDefs(fixture.controls);

      // Per-sub-component controls: fixture.components[name].controls (+ optional target).
      const subControlDefs: Record<string, Record<string, ControlDef>> = {};
      const subTargets: Record<string, string> = {};
      if (fixture.components && typeof fixture.components === "object") {
        for (
          const [name, spec] of Object.entries(
            fixture.components as Record<string, unknown>,
          )
        ) {
          // Full form is `"Button": { "controls": {...}, "target"?: "#submit" }`; the
          // shorthand drops the wrapper: `"Button": { "disabled": {...} }`. Treat the
          // object as the wrapper ONLY when it carries a `controls` key — otherwise the
          // whole object IS the controls map. (Consequence: a control literally named
          // "controls" must use the full-form wrapper, or it's read as one.)
          const isWrapper = spec != null && typeof spec === "object" &&
            !Array.isArray(spec) && "controls" in (spec as object);
          const ctrls = isWrapper
            ? (spec as { controls?: unknown }).controls
            : spec;
          subControlDefs[name] = parseControlDefs(ctrls);
          const target = isWrapper
            ? (spec as { target?: unknown }).target
            : undefined;
          if (typeof target === "string") subTargets[name] = target;
        }
      }

      // Background: top-level `background`, or legacy `controls._background`.
      let background = typeof fixture.background === "string"
        ? fixture.background
        : undefined;
      if (!background && controlDefs._background) {
        const b = controlDefs._background as ControlDef & { value?: unknown };
        background = typeof b.value === "string" ? b.value : undefined;
      }
      delete controlDefs._background;

      const cases = await collectCases(
        isolateDir,
        controlDefs,
        prefix,
        category,
        folder,
        problems,
        operations,
        repoRoot,
      );

      entries.push({
        // Root-qualified so a component and a page with the same name don't
        // collide on the generated preview-island filename.
        slug: `${root}__${rel.replaceAll("/", "__")}`,
        label,
        // island ⇔ the folder-component has client logic (a logic.ts), not the
        // dir it lives in — a static component under islands/ would still be static.
        kind: (await exists(`${dir}/logic.ts`)) ? "island" : "static",
        root,
        target,
        dir,
        isolateDir,
        componentFile: templatePath, // the sprig folder-component's template
        exportName,
        category,
        folder,
        background,
        controlDefs,
        subControlDefs,
        subTargets,
        cases,
      });
    }
  }

  entries.sort((a, b) => a.slug.localeCompare(b.slug));
  problems.sort((a, b) => a.path.localeCompare(b.path));
  return { entries, problems };
}
