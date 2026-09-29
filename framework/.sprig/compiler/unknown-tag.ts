// REQ-024 — an unknown tag is a compile error, not a silent native element. The renderer
// resolves a non-native tag through the registry and, when nothing answers, emits it as a
// plain element: a typo'd `<stat-crd>` or a component that was renamed/deleted ships as an
// empty unknown element and nobody hears about it. This check runs at build time over every
// template and names each such tag with the nearest registered selector.
import { join } from "@std/path";
import { isNativeTag } from "./render.ts";
import {
  type AppScan,
  pageLocalMatches,
  resolveTag,
  selectorsInScope,
  type Unit,
} from "./composition-scan.ts";

/** Tags the renderer handles itself (outlet, content projection, grouping). */
const RESERVED_TAGS: ReadonlySet<string> = new Set([
  "router-outlet",
  "content",
  "ng-content",
  "ng-container",
]);

// Standard HTML / SVG / MathML element names the renderer's NATIVE set does not list. They
// render as native elements already (an unregistered tag falls through to a native one);
// listing them here only keeps the unknown-tag check from flagging real markup.
const MORE_ELEMENTS = [
  // HTML
  "search",
  "math",
  "portal",
  // SVG
  "animate",
  "animatemotion",
  "animatetransform",
  "clippath",
  "desc",
  "ellipse",
  "feblend",
  "fecolormatrix",
  "fecomponenttransfer",
  "fecomposite",
  "feconvolvematrix",
  "fediffuselighting",
  "fedisplacementmap",
  "fedistantlight",
  "fedropshadow",
  "feflood",
  "fefunca",
  "fefuncb",
  "fefuncg",
  "fefuncr",
  "fegaussianblur",
  "feimage",
  "femerge",
  "femergenode",
  "femorphology",
  "feoffset",
  "fepointlight",
  "fespecularlighting",
  "fespotlight",
  "fetile",
  "feturbulence",
  "filter",
  "foreignobject",
  "image",
  "lineargradient",
  "marker",
  "mask",
  "metadata",
  "mpath",
  "pattern",
  "radialgradient",
  "set",
  "stop",
  "switch",
  "symbol",
  "textpath",
  "tspan",
  "view",
  // MathML
  "annotation",
  "maction",
  "menclose",
  "merror",
  "mfenced",
  "mfrac",
  "mi",
  "mmultiscripts",
  "mn",
  "mo",
  "mover",
  "mpadded",
  "mphantom",
  "mprescripts",
  "mroot",
  "mrow",
  "ms",
  "mspace",
  "msqrt",
  "mstyle",
  "msub",
  "msubsup",
  "msup",
  "mtable",
  "mtd",
  "mtext",
  "mtr",
  "munder",
  "munderover",
  "semantics",
];
const MORE = new Set(MORE_ELEMENTS);

/** Is `tag` a standard HTML/SVG/MathML element (case-insensitive, as HTML parses it)? */
export function isKnownElement(tag: string): boolean {
  const t = tag.toLowerCase();
  return isNativeTag(t) || MORE.has(t);
}

/** Edit distance (insert/delete/substitute, each 1). */
export function levenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const up = prev[j];
      prev[j] = Math.min(
        prev[j] + 1,
        prev[j - 1] + 1,
        diag + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      diag = up;
    }
  }
  return prev[b.length];
}

/** The candidate within edit distance ≤ 2 of `tag` (closest wins; ties → alphabetical). */
export function didYouMean(
  tag: string,
  candidates: Iterable<string>,
): string | undefined {
  let best: string | undefined;
  let bestD = 3;
  for (const c of [...candidates].sort()) {
    const d = levenshtein(tag, c);
    if (d < bestD) [best, bestD] = [c, d];
  }
  return best;
}

/** The app's escape hatch for genuine third-party web components. */
const CUSTOM_ELEMENTS_FILE = "custom-elements.json";

/** Read `<srcDir>/custom-elements.json` — a JSON array of custom-element names
 *  (`["x-foo"]`). Absent → null. A malformed file or an entry that is not a valid
 *  custom-element name (lowercase, starts with a letter, contains a hyphen) throws,
 *  naming the file and the entry. */
export async function readCustomElements(
  srcDir: string,
): Promise<string[] | null> {
  const path = join(srcDir, CUSTOM_ELEMENTS_FILE);
  let text: string;
  try {
    text = await Deno.readTextFile(path);
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) return null;
    throw e;
  }
  const where = `src/${CUSTOM_ELEMENTS_FILE}`;
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error(
      `sprig: ${where} is not valid JSON (${(e as Error).message}). ` +
        `Expected an array of custom-element names, e.g. ["x-foo", "iconify-icon"].`,
    );
  }
  if (!Array.isArray(data)) {
    throw new Error(
      `sprig: ${where} must be a JSON array of custom-element names, e.g. ["x-foo"].`,
    );
  }
  for (const [i, name] of data.entries()) {
    if (
      typeof name !== "string" || !/^[a-z][a-z0-9._]*-[a-z0-9._-]*$/.test(name)
    ) {
      throw new Error(
        `sprig: ${where} entry ${i} (${
          JSON.stringify(name)
        }) is not a custom-element ` +
          `name — a third-party web component's tag is lowercase and contains a hyphen ` +
          `(e.g. "x-foo"). Sprig components never go here: they resolve by folder name.`,
      );
    }
  }
  return data as string[];
}

/** One unresolved tag. */
export interface UnknownTag {
  file: string;
  line: number;
  tag: string;
  unit: Unit;
  suggestion?: string;
  /** For a tag in a shared component: the page-local components of that name (it
   *  resolves on their pages only). */
  pageLocal?: Unit[];
}

/** The outcome of the unknown-tag check over a scanned app. */
export interface UnknownTagResult {
  unknown: UnknownTag[];
  /** Allow-listed custom elements the templates actually use (each printed as allowed). */
  allowedUsed: string[];
  /** Allow-listed names no template uses (printed, so a stale list is visible). */
  allowedUnused: string[];
  /** Total tag occurrences checked. */
  checked: number;
}

/** Every tag in every template that is not a standard element, not a renderer-reserved
 *  tag, not a registered selector in the template's scope, and not allow-listed. */
export function findUnknownTags(
  scan: AppScan,
  customElements: readonly string[] = [],
): UnknownTagResult {
  const allow = new Set(customElements);
  const used = new Set<string>();
  const unknown: UnknownTag[] = [];
  let checked = 0;
  for (const unit of scan.units) {
    for (const { tag, line } of unit.tags) {
      checked++;
      if (RESERVED_TAGS.has(tag)) continue;
      if (resolveTag(scan, unit, tag).length) continue;
      if (isKnownElement(tag)) continue;
      if (allow.has(tag)) {
        used.add(tag);
        continue;
      }
      const locals = unit.kind === "shared" ? pageLocalMatches(scan, tag) : [];
      unknown.push({
        file: unit.file,
        line,
        tag,
        unit,
        ...(locals.length
          ? { pageLocal: locals }
          : { suggestion: didYouMean(tag, selectorsInScope(scan, unit)) }),
      });
    }
  }
  return {
    unknown,
    allowedUsed: [...used].sort(),
    allowedUnused: [...allow].filter((t) => !used.has(t)).sort(),
    checked,
  };
}

/** The file:line error line for one unknown tag, with the fix. */
export function unknownTagMessage(u: UnknownTag): string {
  if (u.pageLocal?.length) {
    const pages = u.pageLocal.map((d) => `"${d.page}"`).join(", ");
    const dirs = u.pageLocal.map((d) => d.dir).join(", ");
    return `  ${u.file}:${u.line} error: shared component <${u.unit.selector}> uses ` +
      `<${u.tag}>, which only page ${pages} defines (${dirs}) — it would render as an ` +
      `unknown element on every other page; a shared component may only compose shared ` +
      `components; promote <${u.tag}> to shared-components/ or make <${u.unit.selector}> page-local`;
  }
  const scope = u.unit.kind === "shared"
    ? "the shared scope"
    : `page "${u.unit.page}" + the shared scope`;
  const hint = u.suggestion
    ? `did you mean <${u.suggestion}>?`
    : "no registered selector is close";
  return `  ${u.file}:${u.line} error: unknown tag <${u.tag}> — not an HTML/SVG ` +
    `element and no component named "${u.tag}" in ${scope}; ${hint} ` +
    `(a third-party web component? list it in src/${CUSTOM_ELEMENTS_FILE}: ["${u.tag}"])`;
}
