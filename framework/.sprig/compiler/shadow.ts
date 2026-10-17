// REQ-025 — a page-local component that takes a shared selector's name must say so. The
// page's registry resolves page-local first, so pages/<p>/components/card/ silently
// replaces the shared <card> on that page — the reuse the shared component exists for is
// quietly forked. Shadowing is refused unless the page-local template opens with
// `<!-- sprig-shadows: <reason> -->`; an opted-in shadow prints one line naming it.
import type { AppScan, Unit } from "./composition-scan.ts";

const OPT_IN = /^\s*<!--\s*sprig-shadows:([\s\S]*?)-->/;

/** The reason a template gives for shadowing (its leading `<!-- sprig-shadows: … -->`),
 *  "" when the marker is there with no reason, null when there is no marker. */
export function shadowReason(source: string): string | null {
  const m = source.match(OPT_IN);
  return m ? m[1].trim().replace(/\s+/g, " ") : null;
}

/** One page-local component whose selector a global component also uses. */
export interface Shadow {
  page: string;
  selector: string;
  local: Unit;
  shared: Unit;
  /** The opt-in reason; undefined → refused. */
  reason?: string;
}

/** The outcome of the shadow check. */
export interface ShadowResult {
  shadows: Shadow[];
  /** file:line error lines for every refused shadow. */
  errors: string[];
  /** One "<page>/<selector> shadows shared <selector>: <reason>" line per opt-in. */
  notes: string[];
}

/** Every page-local component whose selector equals a global one's. A page's own island
 *  (pages/<p>/components/<p>/, the "page mounts its island" pattern) is not a shadow: the
 *  global of that name is the page itself, which never renders inside its own template. */
export function findShadows(scan: AppScan): ShadowResult {
  const shadows: Shadow[] = [];
  const errors: string[] = [];
  const notes: string[] = [];
  for (const [page, locals] of [...scan.registry.pageLocal.entries()].sort()) {
    for (const [selector, local] of [...locals.entries()].sort()) {
      const shared = scan.registry.global.get(selector);
      if (!shared) continue;
      if (shared.kind === "page" && shared.page === page) continue;
      const reason = shadowReason(local.source);
      const what = shared.kind === "page" ? "page" : "shared component";
      if (reason === null || reason === "") {
        errors.push(
          `  ${local.file}:1 error: page-local <${selector}> (${local.dir}) shadows the ` +
            `${what} <${selector}> (${shared.dir}) on page "${page}"` +
            (reason === ""
              ? " and its sprig-shadows marker gives no reason"
              : "") +
            ` — reuse the shared one (delete ${local.dir}), rename the page-local folder, ` +
            `or opt in with a first line \`<!-- sprig-shadows: <why this page needs its own ${selector}> -->\``,
        );
        shadows.push({ page, selector, local, shared });
      } else {
        notes.push(`${page}/${selector} shadows shared ${selector}: ${reason}`);
        shadows.push({ page, selector, local, shared, reason });
      }
    }
  }
  return { shadows, errors, notes };
}
