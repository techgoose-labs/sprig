/**
 * `duplicate-templates` — keep the app DRY: two units whose templates have
 * (nearly) the same STRUCTURE should be one component composed into the other,
 * or one shared component.
 *
 * Structure. Each `template.html` is parsed with the compiler's own tree-sitter
 * grammar (parse.ts) and reduced to labeled nodes:
 *  - an element is its lowercase tag name (`div`, `my-card`, `style`);
 *  - a control-flow node is its keyword (`@if`, `@else`, `@for`, `@empty`,
 *    `@switch`, `@case`, `@default`, `@let`, `@defer`, …);
 *  - each attribute of an element is a leaf `[name]` holding the NAME exactly
 *    as written — `[class]`, `[[title]]`, `[(click)]`, `[[(value)]]`,
 *    `[*ngIf]`, `[sets:org]` — never its value;
 *  - text, interpolations, comments and attribute values are dropped.
 *
 * Similarity. Every labeled node contributes one shingle: the last 3 labels of
 * its root-to-node path (`^` marks the template root, so shallow nodes stay
 * anchored), e.g. `article/header/h3`, `@if/button/[(click)]`. Two templates
 * score the Jaccard index |A ∩ B| / |A ∪ B| of their shingle SETS — symmetric,
 * in [0, 1], deterministic (no hashing, no sampling). Repeating a row does not
 * change a set, so a list of 3 and a list of 30 of the same row compare equal.
 *
 * A pair at or above the threshold (default 0.85) is an error. Either template
 * may carry `<!-- sprig-duplicate: <reason> -->`; every pair it is part of is
 * then listed as `justified: A ~ B — <reason>` instead. Templates with fewer
 * than 4 element/control-flow nodes are skipped by name — trivial wrappers
 * would all match each other.
 *
 * REQ-069 adds the two leaks a whole-template score cannot see:
 *
 *  - Inline re-creation. Every component (shared, and page-local within its
 *    page) is reduced to {@link featuresOf} — tag paths + `tag.class` tokens,
 *    control flow transparent, `<svg>` a leaf, its own `<selector>-…` classes
 *    and `[class.x]` variants not required — and EVERY subtree of every other
 *    template is scored by containment |component ∩ subtree| / |component|.
 *    At or above 0.85 the subtree is an error "this markup is `<x>`
 *    (containment 0.93) — compose it" at its line (best score first, one
 *    finding per copy). A component under 4 features or without a class token
 *    (a thin wrapper around other components) is never looked for, and a pair
 *    the whole-template rule already reported is not reported again. The
 *    host template's `sprig-duplicate:` excuses its inline copies.
 *  - Same-job pairs. Two templates of the same role ({@link roleOf}: the
 *    daisyUI component their root is built on, else its tag) whose reads
 *    ({@link bindingsOf}) have Jaccard ≥ 0.8 (3+ names each), whose handlers
 *    are equal, that are not a near-duplicate pair and where neither composes
 *    the other, are a WARNING "same bindings as `<x>`": same inputs are strong
 *    evidence, not proof — a list row and a detail card legitimately read the
 *    same record, so a person decides. Either template's `sprig-duplicate:`
 *    excuses it.
 */
import { parseTemplate } from "../parse.ts";
import { DAISYUI_RESERVED_CLASSES } from "../build.ts";
import type { Node } from "../node.ts";
import { collectUiFiles, type LintReport, unitName } from "./ui-files.ts";

const RULE = "duplicate-templates";
const SHINGLE = 3;
const MIN_NODES = 4;
const DEFAULT_THRESHOLD = 0.85;

const ELEMENTS = new Set([
  "element",
  "self_closing_element",
  "style_element",
  "script_element",
]);

export type Structure = {
  shingles: Set<string>;
  /** element + control-flow nodes (attributes and text not counted) */
  nodes: number;
  /** the first `<!-- sprig-duplicate: … -->`, reason trimmed ("" when blank) */
  justification?: { line: number; reason: string };
};

function tagName(el: Node): string {
  const holder = el.type === "self_closing_element"
    ? el
    : childOfType(el, "start_tag") ?? el;
  return (childOfType(holder, "tag_name")?.text ?? el.type).toLowerCase();
}

function childOfType(node: Node, type: string): Node | null {
  for (let i = 0; i < node.childCount; i++) {
    if (node.child(i).type === type) return node.child(i);
  }
  return null;
}

/** The attribute-like children of an element's opening tag, as written names. */
function attributeNames(el: Node): string[] {
  const holder = el.type === "self_closing_element"
    ? el
    : childOfType(el, "start_tag");
  if (!holder) return [];
  const names: string[] = [];
  for (let i = 0; i < holder.namedChildCount; i++) {
    const c = holder.namedChild(i);
    if (c.type === "tag_name" || c.type === "ERROR") continue;
    names.push(c.text.split("=")[0].trim());
  }
  return names;
}

/** Reduce a template to its structure (see the module doc). */
export async function structureOf(html: string): Promise<Structure> {
  const root = await parseTemplate(html, { allowError: true });
  const shingles = new Set<string>();
  let nodes = 0;
  let justification: Structure["justification"];
  const emit = (path: string[]) => shingles.add(path.slice(-SHINGLE).join("/"));

  const visit = (node: Node, path: string[]) => {
    if (node.type === "comment") {
      const m = /^<!--\s*sprig-duplicate:([\s\S]*?)-->$/.exec(node.text);
      if (m && !justification) {
        justification = {
          line: node.startPosition.row + 1,
          reason: m[1].trim(),
        };
      }
      return;
    }
    let here = path;
    if (ELEMENTS.has(node.type)) {
      here = [...path, tagName(node)];
      nodes++;
      emit(here);
      for (const a of attributeNames(node)) emit([...here, `[${a}]`]);
    } else if (node.childCount > 0 && node.child(0).type.startsWith("@")) {
      here = [...path, node.child(0).type];
      nodes++;
      emit(here);
    }
    for (let i = 0; i < node.namedChildCount; i++) {
      const c = node.namedChild(i);
      if (c.type === "start_tag") continue;
      visit(c, here);
    }
  };
  visit(root, ["^"]);
  return { shingles, nodes, justification };
}

/** Jaccard index of two sets; 0 when both are empty. */
export function jaccard(a: Set<string>, b: Set<string>): number {
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

// ─── REQ-069: markup reinvented inline, and same-job pairs ───────────────────

/** One element of a template, control flow made transparent (an `@if` around a
 *  span does not change what the span IS) and `<svg>` kept as a leaf (two icons
 *  are the same slot whatever their paths draw). */
export type El = {
  tag: string;
  line: number;
  /** static `class="…"` tokens */
  classes: string[];
  /** `[class.x]` names — a variant switch, never required of a copy */
  bound: string[];
  children: El[];
};

/** Parse a template into its top-level {@link El} trees. */
export async function treeOf(html: string): Promise<El[]> {
  return elementsOf(await parseTemplate(html, { allowError: true }));
}

/** The top-level elements of a template, as {@link El} trees. */
function elementsOf(root: Node): El[] {
  const out: El[] = [];
  const visit = (node: Node, into: El[]) => {
    if (node.type === "comment") return;
    if (ELEMENTS.has(node.type)) {
      const holder = node.type === "self_closing_element"
        ? node
        : childOfType(node, "start_tag");
      const classes: string[] = [];
      const bound: string[] = [];
      for (let i = 0; holder && i < holder.namedChildCount; i++) {
        const a = holder.namedChild(i);
        if (a.type === "attribute") {
          const name = childOfType(a, "attribute_name")?.text;
          if (name !== "class") continue;
          const v = a.text.slice(a.text.indexOf("=") + 1).replace(
            /^["']|["']$/g,
            "",
          );
          classes.push(...v.split(/\s+/).filter(Boolean));
        } else if (a.type === "property_binding") {
          const name = childOfType(a, "binding_name")?.text ?? "";
          if (name.startsWith("class.")) bound.push(name.slice(6));
        }
      }
      const el: El = {
        tag: tagName(node),
        line: node.startPosition.row + 1,
        classes,
        bound,
        children: [],
      };
      into.push(el);
      if (el.tag === "svg") return;
      for (let i = 0; i < node.namedChildCount; i++) {
        const c = node.namedChild(i);
        if (c.type !== "start_tag") visit(c, el.children);
      }
      return;
    }
    for (let i = 0; i < node.namedChildCount; i++) {
      visit(node.namedChild(i), into);
    }
  };
  visit(root, out);
  return out;
}

/** What a piece of markup IS, for containment: every element's last-3-label
 *  tag path from the piece's root (`^/span/svg`) and every class token on its
 *  tag (`span.badge`). `required` is what a copy must carry — the static
 *  classes minus the unit's own `<selector>-…` styling hooks (a re-roll renames
 *  those) and minus `[class.x]` variants; `all` adds them back, so a copy that
 *  hard-codes one variant still matches it. */
export type Features = {
  required: Set<string>;
  all: Set<string>;
  classes: number;
};

export function featuresOf(roots: El[], selector = ""): Features {
  const required = new Set<string>();
  const all = new Set<string>();
  let classes = 0;
  const own = (c: string) =>
    selector !== "" && (c === selector || c.startsWith(`${selector}-`));
  const need = (f: string, isClass = false) => {
    all.add(f);
    if (!required.has(f)) {
      required.add(f);
      if (isClass) classes++;
    }
  };
  const walk = (el: El, path: string[]) => {
    const here = [...path, el.tag];
    need(here.slice(-SHINGLE).join("/"));
    for (const c of [...el.classes, ...el.bound]) all.add(`${el.tag}.${c}`);
    for (const c of el.classes) if (!own(c)) need(`${el.tag}.${c}`, true);
    for (const k of el.children) walk(k, here);
  };
  for (const r of roots) walk(r, ["^"]);
  return { required, all, classes };
}

/** |A ∩ B| / |A| — how much of A the other markup carries (0 when A is empty). */
export function containment(a: Set<string>, b: Set<string>): number {
  if (a.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / a.size;
}

/** What a template reads and what it does: the free names of its expressions
 *  — the root of each member chain, never a member, a pipe name, an
 *  `@for`/`@let` local, a `$`-name or a literal keyword — split into `reads`
 *  (`{{ }}`, `[prop]`, `[(two-way)]`, `@if`/`@for`/`@switch`/`@let` subjects)
 *  and `handlers` (the callee an `(event)` binding calls: `(click)="confirm(id)"`
 *  → `confirm`, its arguments are reads). The DOM event name itself (`click`
 *  vs `submit`) is markup, not the job, so it is not compared. */
export type Bindings = { reads: Set<string>; handlers: Set<string> };

const NOT_NAMES = new Set(["null", "undefined", "true", "false", "this"]);

export function bindingsOf(root: Node): Bindings {
  const reads = new Set<string>();
  const handlers = new Set<string>();
  const locals = new Set<string>();
  /** `ev`: inside an `(event)` binding, where a call's callee is a handler */
  const walk = (n: Node, ev = false) => {
    const kids = (from = 0) => {
      for (let i = from; i < n.namedChildCount; i++) walk(n.namedChild(i), ev);
    };
    switch (n.type) {
      case "comment":
      case "tag_name":
      case "attribute":
      case "binding_name":
        return;
      case "identifier":
        reads.add(n.text);
        return;
      case "member_expression":
      case "safe_member_expression":
        if (n.namedChildCount > 0) walk(n.namedChild(0), ev);
        for (let i = 1; i < n.namedChildCount; i++) {
          const c = n.namedChild(i);
          if (c.type !== "identifier") walk(c, ev);
        }
        return;
      case "pipe_expression":
        for (let i = 0; i < n.namedChildCount; i++) {
          if (i !== 1) walk(n.namedChild(i), ev);
        }
        return;
      case "for_binding":
      case "let_declaration":
        if (n.namedChildCount > 0) locals.add(n.namedChild(0).text);
        return kids(1);
      case "event_binding":
        for (let i = 0; i < n.namedChildCount; i++) walk(n.namedChild(i), true);
        return;
      case "call_expression":
        if (ev && n.namedChildCount > 0) {
          let callee = n.namedChild(0);
          while (callee.namedChildCount > 0 && callee.type !== "identifier") {
            callee = callee.namedChild(0);
          }
          if (callee.type === "identifier") handlers.add(callee.text);
          return kids(1);
        }
        break;
    }
    kids();
  };
  walk(root);
  for (const set of [reads, handlers]) {
    for (const x of [...set]) {
      if (locals.has(x) || x.startsWith("$") || NOT_NAMES.has(x)) set.delete(x);
    }
  }
  return { reads, handlers };
}

/** What KIND of thing a template is: the daisyUI component its first root
 *  element is built on (`card`, `list` for `list-row`, `modal`, `alert`, …),
 *  else that element's tag. A list row and a grid tile of the same record are
 *  two views, not one job twice. */
export function roleOf(els: El[], selector = ""): string {
  const root = els.find((e) => e.tag !== "svg");
  if (!root) return "";
  for (const c of root.classes) {
    if (c === selector || c.startsWith(`${selector}-`)) continue;
    const base = DAISYUI_RESERVED_CLASSES.has(c) ? c : c.split("-")[0];
    if (DAISYUI_RESERVED_CLASSES.has(base)) return base;
  }
  return root.tag;
}

/** The knobs, each calibrated in requirements.md REQ-069. */
export type DuplicateOptions = {
  uiSrc: string;
  /** whole-template Jaccard (REQ-028) */
  threshold?: number;
  /** subtree containment of a component's required features */
  containment?: number;
  /** a component smaller than this many required features is never looked for */
  minFeatures?: number;
  /** …nor one carrying fewer class tokens than this */
  minClasses?: number;
  /** same-job: read-name Jaccard at or above this (handlers equal) */
  sameJob?: number;
  /** same-job: both templates must read at least this many names */
  minNames?: number;
};

export const DEFAULTS = {
  threshold: DEFAULT_THRESHOLD,
  containment: 0.85,
  minFeatures: 4,
  minClasses: 1,
  sameJob: 0.8,
  minNames: 3,
};

type Unit = {
  name: string;
  file: string;
  selector: string;
  /** global (shared) component, page-local (with its page), or neither */
  scope: "shared" | "local" | "page" | "shell";
  page?: string;
  s: Structure;
  els: El[];
  b: Bindings;
  role: string;
};

const pairKey = (a: Unit, b: Unit) =>
  a.file < b.file ? `${a.file}\0${b.file}` : `${b.file}\0${a.file}`;

const sameSet = (a: Set<string>, b: Set<string>) =>
  a.size === b.size && [...a].every((x) => b.has(x));

function scopeOf(name: string): Pick<Unit, "scope" | "page"> {
  const parts = name.split("/");
  if (name === "shell") return { scope: "shell" };
  if (parts[0] === "pages" && parts.length >= 4 && parts[2] === "components") {
    return { scope: "local", page: parts[1] };
  }
  if (parts[0] === "pages") return { scope: "page", page: parts[1] };
  return { scope: "shared" };
}

/** Every subtree of `els` with its features, deepest first. */
function subtrees(els: El[]): { el: El; f: Features }[] {
  const out: { el: El; f: Features }[] = [];
  const walk = (el: El) => {
    for (const k of el.children) walk(k);
    out.push({ el, f: featuresOf([el]) });
  };
  for (const e of els) walk(e);
  return out;
}

function contains(outer: El, inner: El): boolean {
  if (outer === inner) return true;
  return outer.children.some((k) => contains(k, inner));
}

/** Find near-duplicate unit templates under `uiSrc`, markup that re-creates a
 *  component inline, and same-job pairs. Pure: reads files, never exits. */
export async function lintDuplicateTemplates(
  opts: DuplicateOptions,
): Promise<LintReport> {
  const o = { ...DEFAULTS, ...opts };
  const threshold = o.threshold;
  const files = await collectUiFiles(opts.uiSrc);
  const report: LintReport = {
    findings: [],
    suppressed: [],
    checked: [],
    notes: [...files.notes],
  };
  const all: Unit[] = [];
  const units: Unit[] = [];
  for (const file of files.templates) {
    const name = unitName(opts.uiSrc, file.replace(/[\\/]template\.html$/, ""));
    const html = await Deno.readTextFile(file);
    const s = await structureOf(html);
    const root = await parseTemplate(html, { allowError: true });
    const u: Unit = {
      name,
      file,
      selector: name.split("/").pop()!,
      ...scopeOf(name),
      s,
      els: elementsOf(root),
      b: bindingsOf(root),
      role: "",
    };
    u.role = roleOf(u.els, u.selector);
    all.push(u);
    report.checked.push(file);
    if (s.justification && !s.justification.reason) {
      report.findings.push({
        rule: RULE,
        file,
        line: s.justification.line,
        severity: "error",
        message: "sprig-duplicate justification needs a reason",
        hint:
          "write <!-- sprig-duplicate: <why these two must stay separate> -->",
      });
    }
    if (s.nodes < MIN_NODES) {
      report.notes.push(
        `skipped ${name}: ${s.nodes} node${
          s.nodes === 1 ? "" : "s"
        } < ${MIN_NODES}, too small to compare`,
      );
      continue;
    }
    units.push(u);
  }
  report.notes.push(
    `compared ${units.length} template${
      units.length === 1 ? "" : "s"
    } pairwise at threshold ${threshold}`,
  );

  const justifiedUsed = new Set<string>();
  const excuse = (by: Unit | undefined, what: string) => {
    if (!by?.s.justification?.reason) return false;
    justifiedUsed.add(by.file);
    report.suppressed.push({
      file: by.file,
      line: by.s.justification.line,
      reason: `justified: ${what} — ${by.s.justification.reason}`,
    });
    return true;
  };

  const nearDup = new Set<string>();
  for (let i = 0; i < units.length; i++) {
    for (let j = i + 1; j < units.length; j++) {
      const a = units[i], b = units[j];
      const score = jaccard(a.s.shingles, b.s.shingles);
      if (score < threshold) continue;
      nearDup.add(pairKey(a, b));
      const shown = score.toFixed(2);
      const by = [a, b].find((u) => u.s.justification?.reason);
      if (excuse(by, `${a.name} ~ ${b.name} (${shown})`)) continue;
      report.findings.push({
        rule: RULE,
        file: a.file,
        line: 1,
        severity: "error",
        message: `near-duplicate templates: ${a.name} and ${b.name} (${shown})`,
        hint:
          "compose one from the other, promote to shared-components/, or justify with " +
          "`<!-- sprig-duplicate: <reason> -->` in either template",
      });
    }
  }

  // (1) containment: a component's markup re-created inline elsewhere.
  const components = all.filter((u) =>
    u.scope === "shared" || u.scope === "local"
  );
  const looked: string[] = [];
  const trees = new Map(all.map((u) => [u.file, subtrees(u.els)]));
  for (const c of components) {
    const cf = featuresOf(c.els, c.selector);
    if (cf.required.size < o.minFeatures || cf.classes < o.minClasses) continue;
    looked.push(`<${c.selector}>`);
    for (const host of all) {
      if (host === c) continue;
      if (c.scope === "local" && host.page !== c.page) continue;
      // a whole-template pair already said it (or was justified) — once is enough
      if (nearDup.has(pairKey(c, host))) continue;
      // every subtree at or above the bar, best score first (deepest on a tie);
      // one finding per copy — an ancestor or descendant of a reported copy is it.
      const cands: { el: El; score: number; size: number }[] = [];
      for (const { el, f } of trees.get(host.file)!) {
        if (el.tag === c.selector) continue;
        const score = containment(cf.required, f.all);
        if (score >= o.containment) cands.push({ el, score, size: f.all.size });
      }
      cands.sort((x, y) => y.score - x.score || x.size - y.size);
      const hits: El[] = [];
      for (const { el, score } of cands) {
        if (hits.some((h) => contains(el, h) || contains(h, el))) continue;
        hits.push(el);
        const shown = score.toFixed(2);
        const where = `${host.name}:${el.line}`;
        if (excuse(host, `${where} ⊇ <${c.selector}> (${shown})`)) continue;
        report.findings.push({
          rule: RULE,
          file: host.file,
          line: el.line,
          severity: "error",
          message:
            `this markup is \`<${c.selector}>\` (containment ${shown}) — compose it`,
          hint:
            `replace it with <${c.selector} …> (${c.name}), or justify with ` +
            "`<!-- sprig-duplicate: <reason> -->` in this template",
        });
      }
    }
  }
  report.notes.push(
    looked.length
      ? `looked for ${looked.length} component${
        looked.length === 1 ? "" : "s"
      } inline at containment ${o.containment}: ${looked.join(", ")}`
      : `looked for no component inline: none has ${o.minFeatures}+ features and ${o.minClasses}+ class tokens`,
  );

  // (2) same-job pairs: different markup, the same inputs, the same handlers,
  // the same kind of thing — and neither composes the other (a parent passing
  // its props down reads the child's names by design).
  const composes = (x: Unit, y: Unit) => {
    const has = (els: El[]): boolean =>
      els.some((e) => e.tag === y.selector || has(e.children));
    return has(x.els);
  };
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i], b = all[j];
      if (a.scope === "shell" || b.scope === "shell") continue;
      if (nearDup.has(pairKey(a, b))) continue;
      if (a.b.reads.size < o.minNames || b.b.reads.size < o.minNames) continue;
      if (jaccard(a.b.reads, b.b.reads) < o.sameJob) continue;
      if (!sameSet(a.b.handlers, b.b.handlers)) continue;
      if (a.role !== b.role) continue;
      if (composes(a, b) || composes(b, a)) continue;
      const reads = [...a.b.reads].sort().join(", ");
      const does = [...a.b.handlers].sort().join(", ");
      const what = `${reads}${does ? `; handlers ${does}` : ""}`;
      const by = [a, b].find((u) => u.s.justification?.reason);
      if (excuse(by, `${a.name} ≡ ${b.name} (${what})`)) continue;
      report.findings.push({
        rule: RULE,
        file: a.file,
        line: 1,
        severity: "warn",
        message:
          `same bindings as \`<${b.selector}>\` (${what}): one component or a \`sprig-duplicate:\` reason`,
        hint:
          `two ${a.role} templates read and do the same things — merge ${a.name} and ${b.name} ` +
          "into one component with a variant input, or justify with " +
          "`<!-- sprig-duplicate: <reason> -->` in either template",
      });
    }
  }

  for (const u of all) {
    if (u.s.justification?.reason && !justifiedUsed.has(u.file)) {
      report.findings.push({
        rule: RULE,
        file: u.file,
        line: u.s.justification.line,
        severity: "warn",
        message:
          `sprig-duplicate justification in ${u.name} excuses no pair at ${threshold} (${u.s.justification.reason})`,
        hint: "delete the comment — no other template is that close any more",
      });
    }
  }
  return report;
}
