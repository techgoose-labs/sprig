// The shapes spec-check reads and returns (REQ-032). The breakdown's closing pass
// writes `spec/ui/breakdown/inventory.json` in the Inventory shape; the compiler's
// composition scan returns the CompositionGraph shape.

export const TIERS = [
  "static",
  "pure-client",
  "optimistic-write",
  // REQ-064: a write that awaits the server's reply before showing the change.
  "confirmed-write",
  "realtime",
] as const;
export type Tier = typeof TIERS[number];

export const CLASSIFICATIONS = [
  "static",
  "island",
  "page-composition",
] as const;
export type Classification = typeof CLASSIFICATIONS[number];

export const SCOPES = ["shared", "page-local", "page"] as const;
export type Scope = typeof SCOPES[number];

/** One page or component of the breakdown (inventory.json `units[]`). */
export interface InventoryUnit {
  name: string;
  /** Relative to the breakdown dir: `shared-components/<c>`, `pages/<p>`, `pages/<p>/components/<c>`. */
  dir: string;
  classification: Classification;
  scope: Scope;
  page?: string;
  usedOn: string[];
  tier: Tier;
  evidence: string;
  dataNeeds: string[];
  /** REQ-070: why this unit stays separate from a unit the DRY checks (census, same-job,
   *  reuse) pair it with. Optional; when present the reason must not be empty. */
  distinct?: string;
}

/** `spec/ui/breakdown/inventory.json`. */
export interface Inventory {
  units: InventoryUnit[];
  unassigned: string[];
}

/** `compositionGraph(appDir)` from framework/.sprig/compiler/composition.ts. */
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

export interface Finding {
  /** A path (relative to the git root), optionally `:line`, or `<file> <json pointer>`. */
  where: string;
  message: string;
  hint: string;
}

export interface CheckResult {
  name: string;
  ok: boolean;
  /** Every path the check read, relative to the git root when inside it. */
  read: string[];
  /** Set when the whole check did not run — the reason. */
  skipped?: string;
  /** Parts of the check that did not run, or which source a lookup used — never silent. */
  notes?: string[];
  /** How many things the check looked at (units, rows, cases…). */
  items: number;
  findings: Finding[];
}

export interface SpecCheckResult {
  checks: CheckResult[];
  ok: boolean;
}

/** Build a CheckResult whose `ok` follows its findings. */
export function result(
  name: string,
  read: string[],
  items: number,
  findings: Finding[],
  notes: string[] = [],
): CheckResult {
  const r: CheckResult = {
    name,
    ok: findings.length === 0,
    read,
    items,
    findings,
  };
  if (notes.length) r.notes = notes;
  return r;
}

/** A check that did not run: ok (it found nothing wrong) but says why it skipped. */
export function skipped(
  name: string,
  read: string[],
  reason: string,
): CheckResult {
  return { name, ok: true, read, skipped: reason, items: 0, findings: [] };
}
