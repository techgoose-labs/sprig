// DRY checks (REQ-070): the breakdown can split one repeated mock region into two units, or
// make two units that do the same job, and nothing downstream catches it before the build.
//
//  census   — pairwise similarity of every non-page unit's extracted mock markup (source.html).
//  same-job — two units of one classification binding the same set of needs.
//  reuse    — a shared unit only one page composes; page-local twins on two pages.
//
// Every pair has one escape: `"distinct": "<reason>"` on the unit(s) in inventory.json.
//
// Markup similarity reuses the shingle + Jaccard approach of the compiler's
// duplicate-templates lint (compiler/lints/duplicate-templates.ts): `jaccard` is imported
// from there; the walk is a local variant of its `structureOf`, because mock markup is not a
// sprig template — tag names alone make every Lucide icon and every daisyUI badge look the
// same (kennel's status-badge ~ overdue-badge scores 1.00 on tags). The variant:
//  - an element is its lowercase tag name, with a leaf `[name]` per attribute name (as
//    structureOf) and a leaf `.token` per class token (new — the mock's classes carry its
//    component vocabulary: `card`, `badge-error`, `stat-value`);
//  - an `<svg>` is one node: its children (path/circle geometry) are not walked; its class
//    tokens (`lucide-clock`) still name the icon;
//  - comments and text are dropped; shingles are the last 3 labels of the root path.
import { jaccard } from "../compiler/lints/duplicate-templates.ts";
import { parseTemplate } from "../compiler/parse.ts";
import type { Node } from "../compiler/node.ts";
import { reachableSelectors, SHELL } from "./graph.ts";
import {
  type CheckResult,
  type CompositionGraph,
  type Finding,
  type Inventory,
  type InventoryUnit,
  result,
} from "./types.ts";

/** At or above this markup similarity two units are one unit. Calibrated on the kennel
 *  breakdown (24 units): its highest non-nested pair is dog-profile-card ~ stay-card 0.62;
 *  two instances of one dog card extracted as two units score 0.92–0.96. */
export const CENSUS_THRESHOLD = 0.8;

const SHINGLE = 3;
const ELEMENTS = new Set([
  "element",
  "self_closing_element",
  "style_element",
  "script_element",
]);

export interface Markup {
  shingles: Set<string>;
  /** element nodes walked (an svg counts once) */
  nodes: number;
  /** whitespace-collapsed outer HTML of each top-level element */
  tops: string[];
  /** the whole source, whitespace-collapsed, comments removed */
  flat: string;
}

const flatten = (html: string) =>
  html.replace(/<!--[\s\S]*?-->/g, "").replace(/\s+/g, " ").replace(
    />\s+</g,
    "><",
  ).trim();

function childOfType(node: Node, type: string): Node | null {
  for (let i = 0; i < node.childCount; i++) {
    if (node.child(i).type === type) return node.child(i);
  }
  return null;
}

/** Reduce extracted mock markup to its shingles (see the module doc). */
export async function markupOf(html: string): Promise<Markup> {
  const root = await parseTemplate(html, { allowError: true });
  const shingles = new Set<string>();
  const tops: string[] = [];
  let nodes = 0;
  const emit = (path: string[]) => shingles.add(path.slice(-SHINGLE).join("/"));
  const visit = (node: Node, path: string[], depth: number) => {
    if (node.type === "comment") return;
    let here = path;
    if (ELEMENTS.has(node.type)) {
      if (depth === 0) tops.push(flatten(node.text));
      const holder = node.type === "self_closing_element"
        ? node
        : childOfType(node, "start_tag") ?? node;
      const tag = (childOfType(holder, "tag_name")?.text ?? node.type)
        .toLowerCase();
      here = [...path, tag];
      nodes++;
      emit(here);
      for (let i = 0; i < holder.namedChildCount; i++) {
        const a = holder.namedChild(i);
        if (a.type !== "attribute") continue;
        const name = childOfType(a, "attribute_name")?.text ?? "";
        emit([...here, `[${name}]`]);
        if (name !== "class") continue;
        const value = a.text.slice(a.text.indexOf("=") + 1).replace(
          /^["']|["']$/g,
          "",
        );
        for (const t of value.split(/\s+/).filter(Boolean)) {
          emit([...here, `.${t}`]);
        }
      }
      if (tag === "svg") return;
      depth++;
    }
    for (let i = 0; i < node.namedChildCount; i++) {
      const c = node.namedChild(i);
      if (c.type === "start_tag") continue;
      visit(c, here, depth);
    }
  };
  visit(root, ["^"], 0);
  return { shingles, nodes, tops, flat: flatten(html) };
}

/** `inner` is composed inside `outer`: one of inner's top-level elements appears verbatim in
 *  outer's markup without being one of outer's own top-level elements (the list holds the
 *  row; two extractions of the same row are siblings, not nesting). */
export function nestedIn(inner: Markup, outer: Markup): boolean {
  const own = new Set(outer.tops);
  return inner.tops.some((t) =>
    t.length >= 20 && !own.has(t) && outer.flat.includes(t)
  );
}

const reason = (u: InventoryUnit) =>
  typeof u.distinct === "string" && u.distinct.trim() ? u.distinct.trim() : "";

/** The key a unit has in the composition graph's reach sets. */
const reachKey = (u: InventoryUnit) =>
  u.scope === "page-local" ? `${u.page}/${u.name}` : u.name;

/** Every component `key` composes, transitively (reach-set keys). */
function descendants(graph: CompositionGraph, u: InventoryUnit): Set<string> {
  if (u.scope === "page") return reachableSelectors(graph, u.name);
  const out = new Set<string>();
  const stack = [...(graph.components[reachKey(u)]?.composes ?? [])];
  while (stack.length) {
    const ref = stack.pop()!;
    const c = graph.components[ref] ??
      (u.page ? graph.components[`${u.page}/${ref}`] : undefined);
    const key = c?.scope === "page-local" && !ref.includes("/")
      ? `${c.page}/${ref}`
      : ref;
    if (out.has(key)) continue;
    out.add(key);
    stack.push(...(c?.composes ?? []));
  }
  return out;
}

export interface UnitMarkup {
  unit: InventoryUnit;
  where: string;
  markup: Markup;
}

/** One unit composes the other — by the graph, or by its markup holding the other's. */
function composes(
  a: UnitMarkup | InventoryUnit,
  b: UnitMarkup | InventoryUnit,
  markups: Map<InventoryUnit, Markup>,
  graph?: CompositionGraph,
): boolean {
  const ua = "unit" in a ? a.unit : a, ub = "unit" in b ? b.unit : b;
  const ma = markups.get(ua), mb = markups.get(ub);
  if (ma && mb && (nestedIn(ma, mb) || nestedIn(mb, ma))) return true;
  if (!graph) return false;
  return descendants(graph, ua).has(reachKey(ub)) ||
    descendants(graph, ub).has(reachKey(ua));
}

const fix = (x: number) => x.toFixed(2);

/** census: pairwise markup similarity of every non-page unit. Page-local units on two
 *  different pages are left to `reuse` (its finding names the fix: one shared unit). */
export function checkCensus(
  inv: Inventory,
  units: UnitMarkup[],
  read: string[],
  where: string,
  notes: string[],
  threshold = CENSUS_THRESHOLD,
  graph?: CompositionGraph,
): CheckResult {
  const findings: Finding[] = [];
  const markups = new Map(units.map((u) => [u.unit, u.markup]));
  const pages = inv.units.filter((u) => u.scope === "page").map((u) => u.name);
  if (pages.length) {
    notes.push(
      `pages not compared (a page's markup is the sum of its units): ${
        pages.join(", ")
      }`,
    );
  }
  const cmp = units.filter((u) => u.unit.scope !== "page");
  notes.push(
    `compared ${cmp.length} unit${
      cmp.length === 1 ? "" : "s"
    }' source.html pairwise at threshold ${threshold} (tags, attribute names, class tokens)`,
  );
  for (let i = 0; i < cmp.length; i++) {
    for (let j = i + 1; j < cmp.length; j++) {
      const a = cmp[i], b = cmp[j];
      const score = jaccard(a.markup.shingles, b.markup.shingles);
      if (score < threshold) continue;
      const pair = `${a.unit.name} ~ ${b.unit.name} (${fix(score)})`;
      if (a.unit.dir === b.unit.dir) {
        notes.push(
          `${pair}: one dir claimed twice — reported by double-assignment`,
        );
        continue;
      }
      if (composes(a, b, markups, graph)) {
        notes.push(`nested: ${pair} — one composes the other, not a duplicate`);
        continue;
      }
      if (
        a.unit.scope === "page-local" && b.unit.scope === "page-local" &&
        a.unit.page !== b.unit.page
      ) {
        notes.push(`cross-page: ${pair} — reported by reuse`);
        continue;
      }
      if (reason(a.unit) && reason(b.unit)) {
        notes.push(
          `distinct: ${pair} — ${a.unit.name}: ${
            reason(a.unit)
          }; ${b.unit.name}: ${reason(b.unit)}`,
        );
        continue;
      }
      findings.push({
        where: `${where} ${a.unit.dir} ~ ${b.unit.dir}`,
        message:
          `units ${a.unit.name} and ${b.unit.name} extract the same markup (${
            fix(score)
          }) — one unit, or \`distinct: <reason>\` on both in inventory.json`,
        hint:
          `merge ${b.unit.name} into ${a.unit.name} (a variant or prop, one source.html), or set "distinct": "<why>" on both ${a.unit.name} and ${b.unit.name}${
            reason(a.unit) || reason(b.unit)
              ? ` — only ${
                reason(a.unit) ? a.unit.name : b.unit.name
              } carries one`
              : ""
          }`,
      });
    }
  }
  return result("census", read, cmp.length, findings, notes);
}

/** A unit's needs: binding.md rows as `endpoint → dto`, else inventory dataNeeds. */
export type NeedSets = Map<InventoryUnit, Set<string>>;

/** same-job: two units of one classification binding the same set of needs — at least two
 *  needs, or one that is a command (`commands`) — neither composing the other. */
export function checkSameJob(
  inv: Inventory,
  needs: NeedSets,
  source: string,
  read: string[],
  where: string,
  markups: Map<InventoryUnit, Markup>,
  graph?: CompositionGraph,
  commands: Set<string> = new Set(),
): CheckResult {
  const findings: Finding[] = [];
  const notes = [`needs compared from ${source}`];
  const withNeeds = inv.units.filter((u) => (needs.get(u)?.size ?? 0) > 0);
  const none = inv.units.length - withNeeds.length;
  if (none) {
    notes.push(
      `${none} unit${none === 1 ? "" : "s"} with no needs not compared: ${
        inv.units.filter((u) => !withNeeds.includes(u)).map((u) => u.name)
          .join(", ")
      }`,
    );
  }
  const key = (u: InventoryUnit) => [...needs.get(u)!].sort().join(" · ");
  for (let i = 0; i < withNeeds.length; i++) {
    for (let j = i + 1; j < withNeeds.length; j++) {
      const a = withNeeds[i], b = withNeeds[j];
      if (a.classification !== b.classification || key(a) !== key(b)) continue;
      const pair = `${a.name} ~ ${b.name} (${key(a)})`;
      // One name on two units: binding.md rows (keyed by unit name) cannot tell them
      // apart — double-assignment or reuse reports the pair.
      if (a.name === b.name) continue;
      // REQ-070 AMENDMENT: every unit on a page reads the page's DTO — one shared query
      // is not evidence of one job; two needs, or a shared command, are.
      const set = needs.get(a)!;
      if (set.size < 2 && ![...set].some((n) => commands.has(n))) {
        notes.push(`${pair}: one query, no command — not evidence of one job`);
        continue;
      }
      if (composes(a, b, markups, graph)) {
        notes.push(`nested: ${pair} — one composes the other`);
        continue;
      }
      if (reason(a) && reason(b)) {
        notes.push(
          `distinct: ${pair} — ${a.name}: ${reason(a)}; ${b.name}: ${
            reason(b)
          }`,
        );
        continue;
      }
      findings.push({
        where: `${where} ${a.dir} ~ ${b.dir}`,
        message:
          `units ${a.name} and ${b.name} do the same job — both ${a.classification}, binding the same needs (${
            key(a)
          }) — one unit, or \`distinct: <reason>\` on both`,
        hint:
          `merge them into one unit composed where both are used, or set "distinct": "<what each does that the other does not>" on both ${a.name} and ${b.name}`,
      });
    }
  }
  return result("same-job", read, withNeeds.length, findings, notes);
}

/** reuse: a shared unit exactly one page composes; page-local twins (same name, or markup
 *  at/above the census threshold) on two different pages. */
export function checkReuse(
  inv: Inventory,
  markups: Map<InventoryUnit, Markup>,
  read: string[],
  where: string,
  graph?: CompositionGraph,
  threshold = CENSUS_THRESHOLD,
): CheckResult {
  const findings: Finding[] = [];
  const notes: string[] = [];
  const shared = inv.units.filter((u) => u.scope === "shared");
  if (graph) {
    notes.push("shared units counted by the pages that compose them (graph)");
    const pageNames = Object.entries(graph.pages).map(([k, p]) =>
      p.dir.replace(/\/+$/, "").split("/").pop() || k
    );
    // What the app shell composes is on every page.
    const shellReach = graph.components[SHELL]
      ? descendants(graph, { name: SHELL, scope: "shared" } as InventoryUnit)
      : new Set<string>();
    for (const u of shared) {
      if (shellReach.has(u.name)) continue;
      const by = pageNames.filter((p) =>
        reachableSelectors(graph, p).has(u.name)
      );
      // A shared unit composed where the breakdown did not say — or not where it did — is
      // the composition check's finding; this one is the unit both agree lives on one page.
      if (by.length !== 1 || u.usedOn.join() !== by[0]) continue;
      shareOnce(u, by[0]);
    }
  } else {
    notes.push(
      "shared units counted by inventory usedOn (no composition graph)",
    );
    for (const u of shared) {
      if (u.usedOn.length === 1) shareOnce(u, u.usedOn[0]);
    }
  }
  function shareOnce(u: InventoryUnit, page: string) {
    if (reason(u)) {
      notes.push(`distinct: shared ${u.name} only on ${page} — ${reason(u)}`);
      return;
    }
    findings.push({
      where: `${where} ${u.dir}`,
      message:
        `shared \`${u.name}\` is composed only by ${page} — page-local, or \`distinct:\``,
      hint:
        `move it to pages/${page}/components/${u.name} with scope page-local, or set "distinct": "<why it is shared>" on ${u.name}`,
    });
  }
  const locals = inv.units.filter((u) => u.scope === "page-local");
  for (let i = 0; i < locals.length; i++) {
    for (let j = i + 1; j < locals.length; j++) {
      const a = locals[i], b = locals[j];
      if (a.page === b.page) continue;
      const ma = markups.get(a), mb = markups.get(b);
      const score = ma && mb ? jaccard(ma.shingles, mb.shingles) : 0;
      const by = a.name === b.name
        ? "same name"
        : score >= threshold
        ? `markup ${fix(score)}`
        : "";
      if (!by) continue;
      const pair = `${a.page}/${a.name} ~ ${b.page}/${b.name} (${by})`;
      if (reason(a) && reason(b)) {
        notes.push(
          `distinct: ${pair} — ${a.name}: ${reason(a)}; ${b.name}: ${
            reason(b)
          }`,
        );
        continue;
      }
      findings.push({
        where: `${where} ${a.dir} ~ ${b.dir}`,
        message:
          `${a.name} on page ${a.page} and ${b.name} on page ${b.page} — one shared unit (${by})`,
        hint:
          `promote one shared-components/<name> used on ${a.page} and ${b.page}, or set "distinct": "<why>" on both`,
      });
    }
  }
  return result(
    "reuse",
    read,
    shared.length + locals.length,
    findings,
    notes,
  );
}
