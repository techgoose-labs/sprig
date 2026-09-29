// Scan an app's src/ tree into composition UNITS — every folder-component (and the
// bootstrap/ shell) with the tags its template uses, each tag at its source line — and
// resolve those tags through the renderer's own ScopedRegistry. The composition checks
// (unknown-tag.ts, shadow.ts) and the graph (composition.ts) all read this one scan.
import { basename, dirname, join, relative } from "@std/path";
import { walk } from "@std/fs/walk";
import { field, named, type Node } from "./node.ts";
import { parseCached } from "./parse.ts";
import { splitShellHtml } from "./mod.ts";
import {
  isPageRoot,
  pageLocalOf,
  ScopedRegistry,
} from "./composition-registry.ts";

/** One tag occurrence in a template. */
export interface TagUse {
  tag: string;
  line: number;
}

/** A folder-component (or page, or the bootstrap shell) as the composition sees it. */
export interface Unit {
  /** Folder relative to src/ — the component's identity ("shell" for bootstrap/). */
  relDir: string;
  /** Folder relative to the app dir, for messages ("src/shared/card", "bootstrap"). */
  dir: string;
  /** template.html relative to the app dir, for file:line messages. */
  file: string;
  selector: string;
  kind: "page" | "shared" | "page-local";
  /** The page a page-local belongs to, or a page's own name. */
  page?: string;
  source: string;
  tags: TagUse[];
}

/** The app scanned: every unit plus the registry the renderer would build from them. */
export interface AppScan {
  srcDir: string;
  units: Unit[];
  registry: ScopedRegistry<Unit>;
}

/** Every element tag in a parsed template, in document order, with its 1-based line. */
export function tagsOf(root: Node, lineOffset = 0): TagUse[] {
  const text: string = root.text ?? "";
  const out: TagUse[] = [];
  const visit = (n: Node) => {
    let name: Node | null = null;
    if (n.type === "self_closing_element") name = field(n, "name");
    else if (
      n.type === "element" || n.type === "script_element" ||
      n.type === "style_element"
    ) {
      const start = named(n).find((c: Node) => c.type === "start_tag");
      name = start ? field(start, "name") : null;
    }
    if (name) {
      const line = text.slice(0, n.startIndex).split("\n").length + lineOffset;
      out.push({ tag: name.text, line });
    }
    for (const c of named(n)) visit(c);
  };
  visit(root);
  return out;
}

/** Scan `srcDir` (an app's src/) plus its sibling bootstrap/ shell. The registry mirrors
 *  createRenderer's: page-local vs global by folder path, duplicates throw, and the
 *  bootstrap shell is registered under "shell" (it wins over a scanned src/shell). */
export async function scanApp(srcDir: string): Promise<AppScan> {
  const appDir = dirname(srcDir);
  const units: Unit[] = [];
  for await (
    const entry of walk(srcDir, {
      includeDirs: false,
      match: [/template\.html$/],
    })
  ) {
    const dirAbs = dirname(entry.path);
    const relDir = relative(srcDir, dirAbs).replace(/\\/g, "/");
    const source = await Deno.readTextFile(entry.path);
    const local = pageLocalOf(relDir);
    const selector = basename(dirAbs);
    const kind: Unit["kind"] = local
      ? "page-local"
      : isPageRoot(relDir)
      ? "page"
      : "shared";
    units.push({
      relDir,
      dir: relative(appDir, dirAbs).replace(/\\/g, "/"),
      file: relative(appDir, entry.path).replace(/\\/g, "/"),
      selector,
      kind,
      page: local ? local.page : kind === "page" ? selector : undefined,
      source,
      tags: tagsOf(await parseCached(source)),
    });
  }
  units.sort((a, b) => a.relDir < b.relDir ? -1 : a.relDir > b.relDir ? 1 : 0);
  const registry = new ScopedRegistry<Unit>();
  for (const u of units) registry.add(u.relDir, u.selector, u);
  const shellPath = join(appDir, "bootstrap", "template.html");
  const shellSrc = await Deno.readTextFile(shellPath).catch(() => null);
  if (shellSrc !== null) {
    const { body } = splitShellHtml(shellSrc);
    const at = shellSrc.indexOf(body);
    const lineOffset = at > 0
      ? shellSrc.slice(0, at).split("\n").length - 1
      : 0;
    const shell: Unit = {
      relDir: "shell",
      dir: "bootstrap",
      file: "bootstrap/template.html",
      selector: "shell",
      kind: "shared",
      source: body,
      tags: tagsOf(await parseCached(body), lineOffset),
    };
    units.push(shell);
    registry.global.set("shell", shell);
  }
  return { srcDir, units, registry };
}

/** What `tag`, used in `unit`'s template, resolves to — through the same registry the
 *  renderer renders that template with. A page and its page-local components render with
 *  the page's registry (page-local first, then shared). A shared component (or the shell)
 *  renders on ANY page, so only the shared scope counts for it: a page-local match would
 *  resolve on that one page and render as an unknown element everywhere else
 *  (pageLocalMatches names those for the error). Empty → nothing registered. */
export function resolveTag(scan: AppScan, unit: Unit, tag: string): Unit[] {
  const hit = unit.kind === "shared"
    ? scan.registry.global.get(tag)
    : scan.registry.forPage(unit.page ?? null).get(tag);
  return hit ? [hit] : [];
}

/** Every page-local component named `tag`, across all pages. */
export function pageLocalMatches(scan: AppScan, tag: string): Unit[] {
  const out: Unit[] = [];
  for (const m of scan.registry.pageLocal.values()) {
    const d = m.get(tag);
    if (d) out.push(d);
  }
  return out;
}

/** Every selector a template in `unit` may name: the shared scope, plus its page's
 *  page-local scope for a page or page-local component. */
export function selectorsInScope(scan: AppScan, unit: Unit): string[] {
  const names = new Set(scan.registry.global.keys());
  if (unit.kind !== "shared" && unit.page) {
    for (const s of scan.registry.pageLocal.get(unit.page)?.keys() ?? []) {
      names.add(s);
    }
  }
  return [...names].sort();
}
