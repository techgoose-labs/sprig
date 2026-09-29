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
 */
import { parseTemplate } from "../parse.ts";
import type { Node } from "../node.ts";
import { collectUiFiles, type LintReport, unitName } from "./ui-files.ts";

const RULE = "duplicate-templates";
const SHINGLE = 3;
export const MIN_NODES = 4;
export const DEFAULT_THRESHOLD = 0.85;

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

/** Find near-duplicate unit templates under `uiSrc`. Pure: reads files, never exits. */
export async function lintDuplicateTemplates(
  opts: { uiSrc: string; threshold?: number },
): Promise<LintReport> {
  const threshold = opts.threshold ?? DEFAULT_THRESHOLD;
  const files = await collectUiFiles(opts.uiSrc);
  const report: LintReport = {
    findings: [],
    suppressed: [],
    checked: [],
    notes: [...files.notes],
  };
  const units: { name: string; file: string; s: Structure }[] = [];
  for (const file of files.templates) {
    const name = unitName(opts.uiSrc, file.replace(/[\\/]template\.html$/, ""));
    const s = await structureOf(await Deno.readTextFile(file));
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
    units.push({ name, file, s });
  }
  report.notes.push(
    `compared ${units.length} template${
      units.length === 1 ? "" : "s"
    } pairwise at threshold ${threshold}`,
  );

  const justifiedUsed = new Set<string>();
  for (let i = 0; i < units.length; i++) {
    for (let j = i + 1; j < units.length; j++) {
      const a = units[i], b = units[j];
      const score = jaccard(a.s.shingles, b.s.shingles);
      if (score < threshold) continue;
      const shown = score.toFixed(2);
      const by = [a, b].find((u) => u.s.justification?.reason);
      if (by) {
        justifiedUsed.add(by.file);
        report.suppressed.push({
          file: by.file,
          line: by.s.justification!.line,
          reason: `justified: ${a.name} ~ ${b.name} (${shown}) — ${
            by.s.justification!.reason
          }`,
        });
        continue;
      }
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
  for (const u of units) {
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
