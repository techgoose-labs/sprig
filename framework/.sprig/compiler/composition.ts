// REQ-026 — who composes whom, as ground truth. The graph is built from the SAME scan and
// registry resolution the renderer uses (composition-scan.ts → ScopedRegistry), so an edge
// here is a tag the renderer really resolves to that component — not a regex guess. It is
// what answers "is this component reused, or forked per page?" (`sprig map --compose`).
// This module also runs the build-time composition checks: unknown tags (REQ-024) and
// undeclared shadowing of a shared selector (REQ-025).
import { join } from "@std/path";
import {
  type AppScan,
  resolveTag,
  scanApp,
  type Unit,
} from "./composition-scan.ts";
import {
  findUnknownTags,
  readCustomElements,
  unknownTagMessage,
} from "./unknown-tag.ts";
import { findShadows } from "./shadow.ts";

/** Pages and components, each with what it composes and (components) who composes it. */
export interface CompositionGraph {
  pages: Record<string, { dir: string; composes: string[] }>;
  components: Record<string, {
    dir: string;
    scope: "shared" | "page-local";
    page?: string;
    composes: string[];
    composedBy: string[];
  }>;
}

/** A unit's key in the graph: a page by its name, a shared component by its selector, a
 *  page-local component as `<page>/<selector>`. */
function unitKey(u: Unit): string {
  return u.kind === "page-local" ? `${u.page}/${u.selector}` : u.selector;
}

/** Build the graph from an already-scanned app. */
function graphOf(scan: AppScan): CompositionGraph {
  const pages: CompositionGraph["pages"] = {};
  const components: CompositionGraph["components"] = {};
  for (const u of scan.units) {
    if (u.kind === "page") pages[unitKey(u)] = { dir: u.dir, composes: [] };
    else {
      components[unitKey(u)] = {
        dir: u.dir,
        scope: u.kind === "page-local" ? "page-local" : "shared",
        ...(u.kind === "page-local" ? { page: u.page } : {}),
        composes: [],
        composedBy: [],
      };
    }
  }
  for (const u of scan.units) {
    const from = unitKey(u);
    const composes = new Set<string>();
    for (const { tag } of u.tags) {
      for (const target of resolveTag(scan, u, tag)) {
        if (target !== u) composes.add(unitKey(target));
      }
    }
    const list = [...composes].sort();
    (u.kind === "page" ? pages[from] : components[from]).composes = list;
    for (const to of list) {
      const c = components[to];
      if (c && !c.composedBy.includes(from)) c.composedBy.push(from);
    }
  }
  for (const c of Object.values(components)) c.composedBy.sort();
  return { pages, components };
}

/** The composition graph of the app at `appDir` (the folder holding src/). */
export async function compositionGraph(
  appDir: string,
): Promise<CompositionGraph> {
  return graphOf(await scanApp(join(appDir, "src")));
}

/** Readable form, one line per unit — pages, then shared, then page-local components:
 *    page dashboard → composes: stat-card, dashboard/sparkline
 *    shared/confirm-dialog ← composed by: dashboard, settings
 *    dashboard/sparkline ← composed by: dashboard
 *  A component that composes others adds `; composes: …`; one nobody composes says so. */
export function renderCompositionMap(g: CompositionGraph): string {
  const lines: string[] = [];
  const list = (xs: string[]) => xs.length ? xs.join(", ") : "(nothing)";
  for (const name of Object.keys(g.pages).sort()) {
    lines.push(`page ${name} → composes: ${list(g.pages[name].composes)}`);
  }
  const keys = Object.keys(g.components).sort();
  const ordered = [
    ...keys.filter((k) => g.components[k].scope === "shared"),
    ...keys.filter((k) => g.components[k].scope === "page-local"),
  ];
  for (const key of ordered) {
    const c = g.components[key];
    const label = c.scope === "shared" ? `shared/${key}` : key;
    const by = c.composedBy.length
      ? c.composedBy.join(", ")
      : "(no template — a route, layout, or unused)";
    lines.push(
      `${label} ← composed by: ${by}` +
        (c.composes.length ? `; composes: ${c.composes.join(", ")}` : ""),
    );
  }
  return lines.join("\n");
}

/** Stable JSON form (keys sorted, 2-space indent) — diffs cleanly between builds. */
export function compositionGraphJson(g: CompositionGraph): string {
  const sortKeys = <T>(o: Record<string, T>): Record<string, T> =>
    Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));
  return JSON.stringify(
    { pages: sortKeys(g.pages), components: sortKeys(g.components) },
    null,
    2,
  );
}

/** Everything the composition checks found, ready to print. */
export interface CompositionReport {
  templates: number;
  selectors: number;
  tags: number;
  /** file:line error lines (unknown tags, refused shadows). Non-empty → the build fails. */
  errors: string[];
  /** Lines printed on success too: allowed custom elements, opted-in shadows, stale allowlist. */
  notes: string[];
  graph: CompositionGraph;
}

/** Run the composition checks over `srcDir` (an app's src/). Never throws for a finding —
 *  it reports; assertComposition decides. */
export async function checkComposition(
  srcDir: string,
  opts: { skipDirs?: Record<string, string> } = {},
): Promise<CompositionReport> {
  const scan = await scanApp(srcDir, opts);
  const custom = (await readCustomElements(srcDir)) ?? [];
  const tags = findUnknownTags(scan, custom);
  const shadows = findShadows(scan);
  const notes = [
    ...tags.allowedUsed.map((t) => `allowing <${t}> (custom-elements)`),
    ...tags.allowedUnused.map((t) =>
      `src/custom-elements.json lists <${t}> but no template uses it — drop it`
    ),
    ...shadows.notes,
  ];
  const selectors = scan.registry.global.size +
    [...scan.registry.pageLocal.values()].reduce((n, m) => n + m.size, 0);
  return {
    templates: scan.units.length,
    selectors,
    tags: tags.checked,
    errors: [...tags.unknown.map(unknownTagMessage), ...shadows.errors],
    notes,
    graph: graphOf(scan),
  };
}

/** Run the checks, print what was checked (and every note), and throw one error naming
 *  every offender when any check failed. `label` prefixes the lines ("sprig build"). */
export async function assertComposition(
  srcDir: string,
  label = "sprig build",
  log: (line: string) => void = console.log,
  opts: { skipDirs?: Record<string, string> } = {},
): Promise<CompositionReport> {
  const r = await checkComposition(srcDir, opts);
  for (const n of r.notes) log(`${label}: ${n}`);
  const summary =
    `${r.templates} template(s), ${r.tags} tag(s) against ${r.selectors} component selector(s)`;
  if (r.errors.length) {
    throw new Error(
      `${label}: composition check failed — ${r.errors.length} error(s) in ${summary}:\n` +
        r.errors.join("\n"),
    );
  }
  log(
    `${label}: composition — ${summary}: every tag resolves, no undeclared shadowing.`,
  );
  return r;
}
