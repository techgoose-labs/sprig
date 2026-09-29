// tier-cases (REQ-032): an optimistic-write island proves its optimism in isolation — a
// `pending` case and a `rolled-back` case whose `_network` fails its command — and every
// case's `_tier` agrees with the inventory.
import {
  type CheckResult,
  type Finding,
  type Inventory,
  result,
  TIERS,
} from "./types.ts";

/** Why a `_network` value is malformed, or null when it is "fail" | "delay:<ms>" | {status,body}. */
export function networkValueProblem(v: unknown): string | null {
  if (v === "fail") return null;
  if (typeof v === "string") {
    return /^delay:\d+$/.test(v)
      ? null
      : `${JSON.stringify(v)} is not "fail" or "delay:<ms>"`;
  }
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const s = (v as { status?: unknown }).status;
    return typeof s === "number" && Number.isInteger(s) && s >= 100 && s <= 599
      ? null
      : "a response object needs an integer HTTP status";
  }
  return `${JSON.stringify(v)} is not "fail", "delay:<ms>" or {status, body}`;
}

/** The `_network` keys whose value fails the call. */
export function failingKeys(network: unknown): string[] {
  if (!network || typeof network !== "object") return [];
  return Object.entries(network as Record<string, unknown>)
    .filter(([, v]) =>
      v === "fail" ||
      (v !== null && typeof v === "object" &&
        typeof (v as { status?: unknown }).status === "number" &&
        (v as { status: number }).status >= 400)
    )
    .map(([k]) => k);
}

/** Does a `_network` key name a bound command endpoint (`POST /api/commands/x` or `x`)? */
function keyHits(key: string, endpoint: string): boolean {
  const norm = (s: string) =>
    s.trim().replace(/\s+/g, " ").replace(
      /^([a-z]+) /i,
      (m) => m.toUpperCase(),
    );
  if (norm(key) === norm(endpoint)) return true;
  const last = endpoint.trim().split(/[\s/]/).filter(Boolean).pop();
  return key.trim() === last;
}

export type CaseMap = Map<
  string,
  Map<string, { where: string; json: unknown }>
>;

/** @param cases unit dir → case name → parsed JSON (+ its path).
 *  @param commands unit name → its bound command endpoints (from binding.md). */
export function checkTierCases(
  inv: Inventory,
  cases: CaseMap,
  commands: Map<string, string[]>,
  read: string[],
  notes: string[] = [],
): CheckResult {
  const findings: Finding[] = [];
  let items = 0;
  for (const u of inv.units) {
    const unitCases = cases.get(u.dir) ?? new Map();
    const casesDir = `spec/ui/breakdown/${u.dir}/isolate/cases`;
    for (const [name, c] of unitCases) {
      items++;
      const json = c.json as Record<string, unknown> | null;
      if (!json || typeof json !== "object" || Array.isArray(json)) {
        findings.push({
          where: c.where,
          message: `case ${name} is not a JSON object`,
          hint: "a case is an object of control values (+ _tier, _network)",
        });
        continue;
      }
      if ("_tier" in json && json._tier !== u.tier) {
        findings.push({
          where: c.where,
          message: `_tier ${
            JSON.stringify(json._tier)
          } disagrees with the inventory tier "${u.tier}" of ${u.name}${
            TIERS.includes(json._tier as never) ? "" : " (not a known tier)"
          }`,
          hint: "one tier per unit — fix the case or the inventory",
        });
      }
      if ("_network" in json) {
        const n = json._network;
        if (!n || typeof n !== "object" || Array.isArray(n)) {
          findings.push({
            where: c.where,
            message: "_network is not an object",
            hint:
              'map "<METHOD /path>" or a command name to "fail" | "delay:<ms>" | {status, body}',
          });
        } else {
          for (const [k, v] of Object.entries(n)) {
            const p = networkValueProblem(v);
            if (p) {
              findings.push({
                where: c.where,
                message: `_network["${k}"]: ${p}`,
                hint:
                  'use "fail", "delay:<ms>" or {"status": 500, "body": {...}}',
              });
            }
          }
        }
      }
    }
    if (u.tier !== "optimistic-write") continue;
    for (const need of ["pending", "rolled-back"]) {
      if (!unitCases.has(need)) {
        findings.push({
          where: `${casesDir}/${need}`,
          message: `optimistic-write ${u.name} has no "${need}" case`,
          hint: need === "pending"
            ? "add cases/pending/pending.json — the optimistic state shown before the server answers (a _network delay)"
            : "add cases/rolled-back/rolled-back.json with a _network entry that fails the command — the rollback must be visible in isolation",
        });
      }
    }
    const rb = unitCases.get("rolled-back");
    if (!rb) continue;
    const failing = failingKeys(
      (rb.json as { _network?: unknown } | null)?._network,
    );
    const bound = commands.get(u.name) ?? [];
    if (!failing.length) {
      findings.push({
        where: rb.where,
        message:
          `rolled-back case of ${u.name} fails no call — no _network entry is "fail" or status >= 400`,
        hint: `add "_network": { "${
          bound[0] ?? "POST /api/commands/<verb>"
        }": "fail" }`,
      });
    } else if (
      bound.length && !failing.some((k) => bound.some((e) => keyHits(k, e)))
    ) {
      findings.push({
        where: rb.where,
        message: `rolled-back case of ${u.name} fails ${
          failing.join(", ")
        }, none of its bound commands (${bound.join(", ")})`,
        hint: `fail the command the unit writes through: "${bound[0]}"`,
      });
    }
  }
  return result("tier-cases", read, items, findings, notes);
}
