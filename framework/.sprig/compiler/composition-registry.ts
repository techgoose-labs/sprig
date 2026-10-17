// The ONE selector-scoping rule, shared by the SSR renderer (mod.ts createRenderer), the
// client build (build.ts) and the composition checks/graph (composition.ts): a component's
// scope is decided by its folder path relative to src/, and a tag resolves page-local first,
// then shared. Keeping it in one module is what makes `sprig map --compose` ground truth —
// the graph resolves tags through the SAME registry object the renderer renders with.

/** Classify a component by its relative dir: page-local (under
 *  pages/<page>/components/<name>/) or global. */
export function pageLocalOf(
  relDir: string,
): { page: string; selector: string } | null {
  const parts = relDir.split("/");
  if (parts[0] === "pages" && parts.length >= 4 && parts[2] === "components") {
    return { page: parts[1], selector: parts[parts.length - 1] };
  }
  return null;
}

/** A routed page root: under pages/ and not a page-local component folder. */
export function isPageRoot(relDir: string): boolean {
  const parts = relDir.split("/");
  return parts[0] === "pages" && parts[parts.length - 2] !== "components";
}

/** The error a duplicate selector within one scope raises. */
export function collision(selector: string, where: string): Error {
  return new Error(
    `sprig: duplicate component selector "${selector}" in ${where}. Two distinct ` +
      `component folders share the basename "${selector}". Rename one folder, or make ` +
      `it a page-local component (pages/<page>/components/${selector}/) to shadow the ` +
      `shared one within a single page.`,
  );
}

/** A tag → definition lookup (the renderer's Registry shape, generic over the def). */
export interface Lookup<T> {
  get(selector: string): T | undefined;
}

/** Two scopes of selectors: `global` (shared/shell/page/layout components, keyed by
 *  basename, unique) and `pageLocal` (page → basename → def, unique per page). A page's
 *  registry resolves page-local first, then global. */
export class ScopedRegistry<T> {
  readonly global = new Map<string, T>();
  readonly pageLocal = new Map<string, Map<string, T>>();

  /** Register `def` under the scope its `relDir` implies; a duplicate within one scope throws. */
  add(relDir: string, selector: string, def: T): void {
    const local = pageLocalOf(relDir);
    if (local) {
      let m = this.pageLocal.get(local.page);
      if (!m) this.pageLocal.set(local.page, m = new Map());
      if (m.has(selector)) throw collision(selector, `page "${local.page}"`);
      m.set(selector, def);
      return;
    }
    if (this.global.has(selector)) {
      throw collision(selector, "the global (shared) scope");
    }
    this.global.set(selector, def);
  }

  /** The registry a page renders with: its page-local components shadow global ones.
   *  `null` → the page-less (global-only) registry layouts and the shell render with. */
  forPage(page: string | null): Lookup<T> {
    const locals = page ? this.pageLocal.get(page) : undefined;
    return { get: (s) => locals?.get(s) ?? this.global.get(s) };
  }
}
