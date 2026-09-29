/**
 * The file set the source lints read under an app's `ui/src`: every
 * `template.html` / `styles.css` a unit owns, in a stable (sorted) order, with
 * the directories the build itself never compiles left out BY NAME — the
 * caller prints {@link UiFiles.notes} so nothing is skipped silently.
 */
import { join, relative, SEPARATOR } from "@std/path";
import type { LintResult } from "./lint-types.ts";

/** A lint result plus the lines that explain what was left out and why. */
export type LintReport = LintResult & { notes: string[] };

/** The ONE list of directories `sprig check` never judges — every lint
 *  (templates, styles and `.ts` alike), the composition scan it runs and its
 *  typecheck walk past them by name — because they hold generated or
 *  third-party code, not the app's own source. A new generated dir is one
 *  line here (REQ-055). */
export const SKIP_DIRS: Record<string, string> = {
  node_modules: "third-party packages",
  ".git": "version control",
  static: "static assets, served as-is",
  isolate: "isolate harness fixtures",
  _isolate: "generated isolate harness",
  dist: "build output",
  _preview: "generated workbench previews (sprig dev)",
};

/** Is any directory segment of the `/`-separated relative path `rel` a
 *  {@link SKIP_DIRS} name? (The file name itself is not a directory.) */
export function inSkippedDir(
  rel: string,
  skip: Record<string, string> = SKIP_DIRS,
): boolean {
  return rel.split(/[\\/]/).slice(0, -1).some((seg) =>
    Object.hasOwn(skip, seg)
  );
}

export type UiFiles = {
  /** absolute-or-as-given paths (joined onto uiSrc), sorted */
  templates: string[];
  styles: string[];
  notes: string[];
};

/** Collect every `template.html` and `styles.css` under `uiSrc`. */
export async function collectUiFiles(uiSrc: string): Promise<UiFiles> {
  const templates: string[] = [];
  const styles: string[] = [];
  const notes: string[] = [];
  async function visit(dir: string): Promise<void> {
    const entries: Deno.DirEntry[] = [];
    for await (const e of Deno.readDir(dir)) entries.push(e);
    entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    for (const e of entries) {
      const path = join(dir, e.name);
      if (e.isDirectory) {
        const why = SKIP_DIRS[e.name];
        if (why) {
          notes.push(`skipped ${unitName(uiSrc, path)}/ — ${why}`);
          continue;
        }
        await visit(path);
      } else if (e.isFile && e.name === "template.html") templates.push(path);
      else if (e.isFile && e.name === "styles.css") styles.push(path);
    }
  }
  await visit(uiSrc);
  return { templates, styles, notes };
}

/** A unit's name: its folder relative to uiSrc, `/`-separated. */
export function unitName(uiSrc: string, path: string): string {
  return relative(uiSrc, path).split(SEPARATOR).join("/") || ".";
}

/** 1-based line of a character offset. */
export function lineAt(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) {
    if (text.charCodeAt(i) === 10) line++;
  }
  return line;
}
