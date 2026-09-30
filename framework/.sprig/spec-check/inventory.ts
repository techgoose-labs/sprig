// inventory.json (REQ-032): shape validation, the `unassigned` check and `double-assignment`.
import {
  type CheckResult,
  CLASSIFICATIONS,
  type Finding,
  type Inventory,
  type InventoryUnit,
  result,
  SCOPES,
  TIERS,
} from "./types.ts";

const isStrArr = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === "string");

/** The dir a unit's scope implies — the breakdown contract's folder layout. */
function expectedDir(
  u: Pick<InventoryUnit, "name" | "scope" | "page">,
): string {
  if (u.scope === "shared") return `shared-components/${u.name}`;
  if (u.scope === "page") return `pages/${u.name}`;
  return `pages/${u.page}/components/${u.name}`;
}

/** Validate inventory.json; malformed units are reported and dropped, the rest returned. */
export function validateInventory(
  raw: unknown,
  where: string,
): { inventory?: Inventory; findings: Finding[] } {
  const findings: Finding[] = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    findings.push({
      where,
      message: "inventory.json is not an object { units, unassigned }",
      hint:
        'the breakdown analyst\'s opening pass writes { "units": [...], "unassigned": [] }',
    });
    return { findings };
  }
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.units)) {
    findings.push({
      where: `${where} units`,
      message: "units is not an array",
      hint: 'list every page and component under "units"',
    });
  }
  let unassigned: string[] = [];
  if (!isStrArr(obj.unassigned)) {
    findings.push({
      where: `${where} unassigned`,
      message: "unassigned is not an array of strings",
      hint: 'the Unassigned list ships even when empty: "unassigned": []',
    });
  } else unassigned = obj.unassigned;
  const units: InventoryUnit[] = [];
  (Array.isArray(obj.units) ? obj.units : []).forEach(
    (u: unknown, i: number) => {
      const w = `${where} units[${i}]`;
      const bad = (message: string, hint: string) =>
        findings.push({ where: w, message, hint });
      if (!u || typeof u !== "object") {
        return bad(
          "unit is not an object",
          "each unit is { name, dir, classification, scope, usedOn, tier, evidence, dataNeeds }",
        );
      }
      const x = u as Record<string, unknown>;
      const before = findings.length;
      for (const k of ["name", "dir", "evidence"]) {
        if (typeof x[k] !== "string") {
          bad(`${k} is missing or not a string`, `set "${k}"`);
        }
      }
      for (const k of ["usedOn", "dataNeeds"]) {
        if (!isStrArr(x[k])) {
          bad(
            `${k} is missing or not a string array`,
            `set "${k}": [] when there is none`,
          );
        }
      }
      if (!CLASSIFICATIONS.includes(x.classification as never)) {
        bad(
          `classification ${JSON.stringify(x.classification)} is not one of ${
            CLASSIFICATIONS.join("|")
          }`,
          "classify by: does it need a logic.ts",
        );
      }
      if (!SCOPES.includes(x.scope as never)) {
        bad(
          `scope ${JSON.stringify(x.scope)} is not one of ${SCOPES.join("|")}`,
          "shared = used on >1 page",
        );
      }
      if (!TIERS.includes(x.tier as never)) {
        bad(
          `tier ${JSON.stringify(x.tier)} is not one of ${TIERS.join("|")}`,
          "record the interaction tier",
        );
      }
      if (x.scope === "page-local" && typeof x.page !== "string") {
        bad(
          'a page-local unit has no "page"',
          'set "page" to the owning page\'s name',
        );
      }
      if (findings.length > before) return;
      const unit = x as unknown as InventoryUnit;
      const dir = expectedDir(unit);
      if (unit.dir.replace(/\/+$/, "") !== dir) {
        bad(
          `dir "${unit.dir}" does not match its ${unit.scope} scope (expected "${dir}")`,
          "the folder follows the scope: shared-components/<c>, pages/<p>, pages/<p>/components/<c>",
        );
      }
      if (
        (unit.classification === "page-composition") !== (unit.scope === "page")
      ) {
        bad(
          `classification ${unit.classification} with scope ${unit.scope}`,
          "a page is a page-composition and a page-composition is a page",
        );
      }
      if (unit.classification === "static" && unit.tier !== "static") {
        bad(
          `a static unit has tier ${unit.tier}`,
          "a non-static tier needs a logic.ts — classify it island, or set tier static",
        );
      }
      if (unit.classification === "island" && unit.tier === "static") {
        bad(
          "an island has tier static",
          "name the island's tier (pure-client, optimistic-write, confirmed-write, realtime) or classify it static",
        );
      }
      if (findings.length > before) return;
      // REQ-070: `distinct` excuses a DRY pair only with a reason. The unit stays in the
      // inventory (every other check still sees it); the empty reason is the finding.
      if ("distinct" in x) {
        if (typeof x.distinct !== "string") {
          bad(
            `${unit.name}'s distinct is not a string`,
            'write "distinct": "<why this unit must stay separate>"',
          );
        } else if (!x.distinct.trim()) {
          bad(
            `${unit.name} has an empty distinct reason`,
            'write "distinct": "<why this unit must stay separate>", or drop the key and merge the units the DRY checks paired',
          );
        }
      }
      units.push({ ...unit, dir: unit.dir.replace(/\/+$/, "") });
    },
  );
  if (!Array.isArray(obj.units) && !isStrArr(obj.unassigned)) {
    return { findings };
  }
  return { inventory: { units, unassigned }, findings };
}

export function checkUnassigned(
  inv: Inventory,
  where: string,
  read: string[],
): CheckResult {
  const findings = inv.unassigned.map((entry, i): Finding => ({
    where: `${where} unassigned[${i}]`,
    message: `unassigned: ${entry}`,
    hint:
      "give it an owner — a component's Events/Motion or a page region — then drop it from the list",
  }));
  return result("unassigned", read, inv.units.length, findings);
}

/** Names are unique per selector scope (the global scope = shared + pages; each page's
 *  page-local scope); dirs are unique. A page-local name equal to a shared one is shadowing,
 *  which the composition check reports. */
export function checkDoubleAssignment(
  inv: Inventory,
  where: string,
  read: string[],
): CheckResult {
  const findings: Finding[] = [];
  const byName = new Map<string, number[]>();
  const byDir = new Map<string, number[]>();
  inv.units.forEach((u, i) => {
    const key = u.scope === "page-local" ? `${u.page}/${u.name}` : u.name;
    byName.set(key, [...(byName.get(key) ?? []), i]);
    byDir.set(u.dir, [...(byDir.get(u.dir) ?? []), i]);
  });
  for (const [key, idx] of byName) {
    if (idx.length < 2) continue;
    const name = key.split("/").pop();
    findings.push({
      where: `${where} units[${idx.join(",")}]`,
      message: `name "${name}" is claimed by ${idx.length} units${
        key.includes("/") ? ` on page ${key.split("/")[0]}` : ""
      }`,
      hint: "one unit per selector — merge the entries or rename one",
    });
  }
  for (const [dir, idx] of byDir) {
    if (idx.length < 2) continue;
    findings.push({
      where: `${where} units[${idx.join(",")}]`,
      message: `dir "${dir}" is claimed by ${idx.length} units (${
        idx.map((i) => inv.units[i].name).join(", ")
      })`,
      hint: "each unit owns exactly one breakdown folder",
    });
  }
  return result("double-assignment", read, inv.units.length, findings);
}
