// Pure import-map transformations for the CLI's pin stamping + legacy-name
// migration (extracted from cli.ts so they are testable — cli.ts executes its
// command switch on import and cannot be imported by a test).
//
// Contract, learned the hard way (a stale 0.21.1 CLI silently DOWNGRADED an
// app pinned to 1.0.0, resurrecting every runtime bug fixed in between):
//   · stamping keeps an app's @techgoose-labs/sprig pin matched to the CLI that
//     builds it, but NEVER downgrades — a pin AHEAD of the CLI means the CLI
//     install is stale, not the app;
//   · migration renames the legacy `@sprig/core`/`@sprig/keep` scope AND the
//     retired `/keep` subpath (now `/bedrock`, because the module exports a
//     bedrock Unit rather than a keep-specific serving layer) — an
//     entry already on the modern name passes through byte-identical.

/** A relative / absolute / `file:` value — an intentional local dev override. */
export function isLocalOverride(value: string): boolean {
  return /^(\.{0,2}\/|\/|file:)/.test(value);
}

/** The version a `jsr:@techgoose-labs/sprig@X[/keep]` value pins (range markers
 *  `^`/`~` stripped), or null when the value doesn't carry one. */
export function pinnedSprigVersion(value: string): string | null {
  // BOTH scopes: an app pinned to the pre-move `@mrg-keystone/sprig` still has
  // a readable version, and `migrateVal` below is what renames it. Reading only
  // the modern scope made every legacy pin look version-less, so the migration
  // could not tell an old pin from a local override.
  return value.match(/@(?:mrg-keystone|techgoose-labs)\/sprig@[\^~]?([^/]+)/)?.[1] ?? null;
}

/** Compare two semver-ish `a.b.c` strings. Returns >0 if `a` is newer than `b`. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

export interface StampResult {
  imports: Record<string, string>;
  changed: boolean;
  /** a pin left alone because it is AHEAD of the CLI (the caller warns once) */
  aheadPin: string | null;
}

/** Re-pin the existing @techgoose-labs/sprig mappings to the CLI version `v`.
 *  Only existing keys are touched; local overrides and pins NEWER than `v`
 *  are left alone (never downgrade). */
export function stampImports(
  imports: Record<string, string>,
  v: string,
): StampResult {
  const wanted: Record<string, string> = {
    "@techgoose-labs/sprig": `jsr:@techgoose-labs/sprig@${v}`,
    "@techgoose-labs/sprig/bedrock": `jsr:@techgoose-labs/sprig@${v}/bedrock`,
  };
  const out = { ...imports };
  let changed = false;
  let aheadPin: string | null = null;
  for (const [k, want] of Object.entries(wanted)) {
    const cur = out[k];
    if (typeof cur !== "string") continue; // only restamp a key that already exists
    if (isLocalOverride(cur)) continue; // leave a LOCAL / file: override alone
    const pinned = pinnedSprigVersion(cur);
    if (pinned && compareVersions(pinned, v) > 0) {
      aheadPin = pinned; // never downgrade — the CLI is the stale side
      continue;
    }
    if (cur !== want) {
      out[k] = want;
      changed = true;
    }
  }
  return { imports: out, changed, aheadPin };
}

/** Rename a legacy-scoped import KEY to the modern scope; non-legacy keys pass through. */
export function migrateKey(k: string): string {
  // The @mrg-keystone -> @techgoose-labs move is a scope rename like the
  // @sprig/* one before it, so it belongs on the same path: an app that runs
  // `sprig build` gets carried across instead of resolving a scope that no
  // longer receives releases.
  if (k === "@mrg-keystone/sprig") return "@techgoose-labs/sprig";
  if (k.startsWith("@mrg-keystone/sprig/")) {
    return "@techgoose-labs/sprig/" + k.slice("@mrg-keystone/sprig/".length);
  }
  return k === "@sprig/core"
    ? "@techgoose-labs/sprig"
    : k === "@sprig/keep" || k === "@techgoose-labs/sprig/keep"
    ? "@techgoose-labs/sprig/bedrock"
    : k.startsWith("@sprig/core/")
    ? "@techgoose-labs/sprig/" + k.slice("@sprig/core/".length)
    : k.startsWith("@sprig/keep/")
    ? "@techgoose-labs/sprig/bedrock/" + k.slice("@sprig/keep/".length)
    : k;
}

/** Rewrite a LEGACY value's scope and re-pin its version to the CLI's (a
 *  legacy-named app predates the rename, so its pin is behind by definition). */
export function migrateVal(val: string, v: string | null): string {
  let out = val
    .replaceAll("@mrg-keystone/sprig", "@techgoose-labs/sprig")
    .replaceAll("@sprig/keep", "@techgoose-labs/sprig/bedrock")
    .replaceAll("@techgoose-labs/sprig/keep", "@techgoose-labs/sprig/bedrock")
    .replaceAll("@sprig/core", "@techgoose-labs/sprig");
  // The subpath also moved: in a jsr specifier it trails the VERSION
  // (`jsr:@techgoose-labs/sprig@2.0.0/keep`), so the scope rewrites above never
  // see it. Retiring `/keep` without this leaves a key that resolves nowhere.
  out = out.replace(
    /(jsr:@(?:mrg-keystone|techgoose-labs)\/sprig@[^/"']+)\/keep\b/g,
    "$1/bedrock",
  );
  // Re-pin AFTER the scope rewrites above, so this matches the modern name the
  // value now carries. Matching the old scope here made the re-pin a silent
  // no-op: keys migrated, versions stayed behind.
  if (v) out = out.replace(/(@techgoose-labs\/sprig)@[^/"']+/g, `$1@${v}`);
  return out;
}

export interface MigrateResult {
  imports: Record<string, string>;
  changed: boolean;
}

/** Migrate an import map onto the current names: the legacy `@sprig/*` SCOPE,
 *  and the retired `/keep` SUBPATH (now `/bedrock`, because the module exports
 *  a bedrock Unit rather than a keep-specific serving layer). An entry that is
 *  already current passes through byte-identical — this function must be a true
 *  no-op on an already-migrated app. A deliberate LOCAL override already present
 *  on the modern key wins over a migrating key (which is dropped). */
export function migrateImports(
  imports: Record<string, string>,
  v: string | null,
): MigrateResult {
  let changed = false;
  const next: Record<string, string> = {};
  for (const [k, val] of Object.entries(imports)) {
    const key = migrateKey(k);
    if (
      key === k && !val.includes("@sprig/core") &&
      !val.includes("@sprig/keep") &&
      !/jsr:@mrg-keystone\/sprig@[^/"']+\/keep\b/.test(val)
    ) {
      next[k] = val;
      continue;
    }
    const value = migrateVal(val, v);
    if (key !== k) {
      const existing = imports[key];
      if (typeof existing === "string" && isLocalOverride(existing)) {
        changed = true;
        continue; // drop the legacy key; the local override wins
      }
    }
    if (key !== k || value !== val) changed = true;
    next[key] = value;
  }
  return { imports: next, changed };
}
