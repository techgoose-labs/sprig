// composition (REQ-032): the inventory's usage matrix against the compiler's composition
// graph (compiler/composition.ts `compositionGraph`), plus page-local shadowing.
import {
  type CheckResult,
  type CompositionGraph,
  type Finding,
  type Inventory,
  result,
} from "./types.ts";

const base = (dir: string, fallback: string) =>
  dir.replace(/\/+$/, "").split("/").pop() || fallback;

/** The graph's page entry for an inventory page name — by key, else by folder basename. */
function pageEntry(graph: CompositionGraph, page: string) {
  if (graph.pages[page]) return graph.pages[page];
  return Object.entries(graph.pages).find(([k, p]) => base(p.dir, k) === page)
    ?.[1];
}

/** Every component a page renders, directly or through the components it composes — a
 *  shared one as its selector, a page-local one as `<page>/<selector>`. A tag resolves
 *  page-local first, then shared (the compiler's ScopedRegistry rule), so a page-local
 *  shadow hides the shared component on that page. */
export function reachableSelectors(
  graph: CompositionGraph,
  page: string,
): Set<string> {
  const entry = pageEntry(graph, page);
  const seen = new Set<string>();
  if (!entry) return seen;
  const local = new Map<string, string[]>();
  const shared = new Map<string, string[]>();
  for (const [k, c] of Object.entries(graph.components)) {
    const sel = base(c.dir, k);
    if (c.scope === "page-local") {
      if (c.page === page) local.set(sel, c.composes);
    } else shared.set(sel, c.composes);
  }
  const out = new Set<string>();
  const stack = [...entry.composes];
  while (stack.length) {
    const ref = stack.pop()!;
    if (seen.has(ref)) continue;
    seen.add(ref);
    // compositionGraph lists resolved unit keys (a shared selector, or `<page>/<selector>`);
    // a hand-written graph may list bare selectors — resolve those page-local first.
    const keyed = ref.includes("/") ? graph.components[ref] : undefined;
    if (keyed) {
      const sel = base(keyed.dir, ref);
      out.add(keyed.scope === "page-local" ? `${keyed.page}/${sel}` : sel);
      stack.push(...keyed.composes);
    } else if (local.has(ref)) {
      out.add(`${page}/${ref}`);
      stack.push(...local.get(ref)!);
    } else {
      const sel = graph.components[ref]
        ? base(graph.components[ref].dir, ref)
        : ref;
      out.add(sel);
      stack.push(...(shared.get(sel) ?? graph.components[ref]?.composes ?? []));
    }
  }
  return out;
}

export function checkComposition(
  inv: Inventory,
  graph: CompositionGraph | undefined,
  read: string[] = [],
  where = "spec/ui/breakdown/inventory.json",
): CheckResult {
  const findings: Finding[] = [];
  const notes: string[] = [];
  const shared = inv.units.filter((u) => u.scope === "shared");
  const sharedNames = new Set(shared.map((u) => u.name));
  for (const u of inv.units) {
    if (u.scope === "page-local" && sharedNames.has(u.name)) {
      findings.push({
        where: `${where} ${u.dir}`,
        message:
          `shadowing: page-local "${u.name}" on page ${u.page} has the same name as shared-components/${u.name}`,
        hint:
          "rename the page-local component, or opt in deliberately — see the compiler's sprig-shadows opt-in",
      });
    }
  }
  if (!graph) {
    notes.push(
      "usage matrix not compared: no composition graph given (compositionGraph(appDir) from compiler/composition.ts)",
    );
    return result("composition", read, inv.units.length, findings, notes);
  }
  const reach = new Map<string, Set<string>>();
  const pagesOf = (p: string) => {
    if (!reach.has(p)) reach.set(p, reachableSelectors(graph, p));
    return reach.get(p)!;
  };
  const graphPages = Object.entries(graph.pages).map(([k, p]) =>
    base(p.dir, k)
  );
  for (const u of shared) {
    for (const p of u.usedOn) {
      if (!pageEntry(graph, p)) {
        findings.push({
          where: `${where} ${u.dir}`,
          message:
            `${u.name} is used on page ${p}, which the app does not have`,
          hint: `build page ${p}, or drop it from ${u.name}'s usedOn`,
        });
      } else if (!pagesOf(p).has(u.name)) {
        findings.push({
          where: `${where} ${u.dir}`,
          message:
            `${u.name} is used on page ${p} per the breakdown, but page ${p} never composes <${u.name}>`,
          hint:
            `compose <${u.name}> in pages/${p} (directly or through one of its components) — the app must be faithful to the mock`,
        });
      }
    }
    for (const p of graphPages) {
      if (!u.usedOn.includes(p) && pagesOf(p).has(u.name)) {
        findings.push({
          where: `${where} ${u.dir}`,
          message:
            `usage matrix stale: page ${p} composes <${u.name}> but ${u.name}'s usedOn does not list it`,
          hint:
            `add ${p} to usedOn (and index.md's usage matrix), or remove <${u.name}> from the page`,
        });
      }
    }
  }
  return result(
    "composition",
    read,
    inv.units.length + graphPages.length,
    findings,
    notes,
  );
}
