// spec-check (REQ-032): machine checks over the breakdown (`spec/ui/breakdown/`) and its
// contract binding, so a breakdown or build that drifted from the mock or the contract fails
// loudly instead of shipping as prose. Every check prints what it read, what it skipped and
// why, and each offender with a fix hint.
//
//   deno run -A framework/.sprig/spec-check.ts [--root <git-root>] [--ui-src <dir>]
//     [--app <dir>] [--graph <graph.json>] [--json]      → exit 0 ok, 1 findings, 2 usage
import { join, relative, resolve } from "@std/path";
import {
  checkBinding,
  dtoExports,
  findOperation,
  parseBindingTable,
  parseEndpoint,
} from "./spec-check/binding.ts";
import { checkBuilt } from "./spec-check/built.ts";
import { resolveContractRoot } from "./compiler/lints/contract.ts";
import { checkComposition } from "./spec-check/graph.ts";
import {
  checkDoubleAssignment,
  checkUnassigned,
  validateInventory,
} from "./spec-check/inventory.ts";
import { type CaseMap, checkTierCases } from "./spec-check/tier.ts";
import {
  type CheckResult,
  type CompositionGraph,
  type Finding,
  type Inventory,
  result,
  skipped,
  type SpecCheckResult,
} from "./spec-check/types.ts";

export type {
  CheckResult,
  CompositionGraph,
  Finding,
  Inventory,
  InventoryUnit,
  SpecCheckResult,
} from "./spec-check/types.ts";

export interface SpecCheckOptions {
  breakdownDir: string;
  gitRoot: string;
  /** The app's src dir (e.g. `<root>/ui/src`) — enables `built`. */
  uiSrc?: string;
  /** A composition graph — enables the usage-matrix half of `composition`. */
  graph?: CompositionGraph;
  /** Without `graph`: the app dir handed to compiler/composition.ts's compositionGraph. */
  appDir?: string;
}

async function readText(p: string): Promise<string | null> {
  try {
    return await Deno.readTextFile(p);
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) return null;
    throw e;
  }
}

async function isDir(p: string): Promise<boolean> {
  try {
    return (await Deno.stat(p)).isDirectory;
  } catch {
    return false;
  }
}

async function listDir(p: string): Promise<Deno.DirEntry[]> {
  try {
    const out: Deno.DirEntry[] = [];
    for await (const e of Deno.readDir(p)) out.push(e);
    return out.sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

/** Lazily load the compiler's composition graph; a reason string when it cannot. */
async function loadGraph(appDir: string): Promise<CompositionGraph | string> {
  const spec = "./compiler/composition.ts";
  try {
    const mod = await import(spec);
    if (typeof mod.compositionGraph !== "function") {
      return `${spec} exports no compositionGraph`;
    }
    return await mod.compositionGraph(appDir) as CompositionGraph;
  } catch (e) {
    return `compositionGraph(${appDir}) unavailable: ${
      (e as Error).message.split("\n")[0]
    }`;
  }
}

export async function specCheck(
  opts: SpecCheckOptions,
): Promise<SpecCheckResult> {
  const root = resolve(opts.gitRoot);
  const bd = resolve(opts.breakdownDir);
  const rel = (p: string) => {
    const r = relative(root, p);
    return r.startsWith("..") ? p : r;
  };
  const checks: CheckResult[] = [];

  // ── inventory.json ──────────────────────────────────────────────────────────────
  const invPath = join(bd, "inventory.json");
  const invWhere = rel(invPath);
  const invText = await readText(invPath);
  let inventory: Inventory | undefined;
  let invProblem: string | undefined;
  let invShape: CheckResult;
  if (invText === null) {
    invProblem =
      "no inventory.json — the breakdown analyst's opening pass writes it";
    invShape = skipped(
      "inventory",
      [],
      `no ${invWhere} (reported by unassigned)`,
    );
  } else {
    let raw: unknown;
    try {
      raw = JSON.parse(invText);
    } catch (e) {
      invProblem = `inventory.json is not JSON: ${(e as Error).message}`;
    }
    if (invProblem) {
      invShape = skipped(
        "inventory",
        [invWhere],
        `${invWhere} is not JSON (reported by unassigned)`,
      );
    } else {
      const v = validateInventory(raw, invWhere);
      inventory = v.inventory;
      const findings = [...v.findings];
      if (inventory) {
        for (const u of inventory.units) {
          const md = join(bd, u.dir, `${u.name}.md`);
          if (await readText(md) === null) {
            findings.push({
              where: rel(md),
              message: `${u.name}'s spec ${rel(md)} does not exist`,
              hint:
                "every inventory unit gets its <name>.md from the spec-writer pass",
            });
          }
        }
      }
      invShape = result(
        "inventory",
        [invWhere],
        (raw as { units?: unknown[] })?.units?.length ?? 0,
        findings,
      );
      if (!inventory) {
        invProblem = "inventory.json has no usable { units, unassigned }";
      }
    }
  }
  checks.push(invShape);
  const noInv = `no valid inventory.json (${invProblem})`;

  // ── unassigned ─────────────────────────────────────────────────────────────────
  if (inventory && !invProblem) {
    checks.push(checkUnassigned(inventory, invWhere, [invWhere]));
  } else {
    checks.push(result("unassigned", invText === null ? [] : [invWhere], 0, [{
      where: invWhere,
      message: invProblem!,
      hint:
        "run the sprig-breakdown-analyst opening pass; it writes inventory.json with units + unassigned",
    }]));
  }

  // ── double-assignment ──────────────────────────────────────────────────────────
  checks.push(
    inventory
      ? checkDoubleAssignment(inventory, invWhere, [invWhere])
      : skipped("double-assignment", [], noInv),
  );

  // ── binding-drift ──────────────────────────────────────────────────────────────
  // REQ-068: `--app <dir>` given → that dir's spec/contract first, then the git
  // root's (the order the runner and `sprig check` use); the check says which.
  const contract = await resolveContractRoot({
    appRoot: opts.appDir ? resolve(opts.appDir) : undefined,
    gitRoot: root,
  }) ?? { dir: root, via: "git root" as const };
  const contractNote = `contract: the ${contract.via}'s spec/contract (${
    rel(join(contract.dir, "spec/contract"))
  })`;
  const openapiPath = join(contract.dir, "spec/contract/openapi.json");
  const bindingPath = join(contract.dir, "spec/contract/binding.md");
  const dtosPath = join(contract.dir, "spec/contract/client/dtos.ts");
  const openapiText = await readText(openapiPath);
  const bindingText = await readText(bindingPath);
  const commands = new Map<string, string[]>();
  if (openapiText === null) {
    checks.push(
      skipped(
        "binding-drift",
        [],
        `no ${rel(openapiPath)} — no ratified contract to bind against`,
      ),
    );
  } else {
    const read = [rel(openapiPath)];
    let openapi: unknown;
    try {
      openapi = JSON.parse(openapiText);
    } catch (e) {
      openapi = undefined;
      checks.push(result("binding-drift", read, 0, [{
        where: rel(openapiPath),
        message: `openapi.json is not JSON: ${(e as Error).message}`,
        hint: "regenerate the contract (rune sync / the keep's /docs/<m>/json)",
      }]));
    }
    if (openapi !== undefined) {
      if (bindingText === null) {
        checks.push(result("binding-drift", read, 0, [{
          where: rel(bindingPath),
          message: `a ratified contract exists (${rel(openapiPath)}) but ${
            rel(bindingPath)
          } does not`,
          hint:
            "the breakdown analyst's opening pass binds every data-need to an endpoint + DTO there",
        }]));
      } else {
        read.push(rel(bindingPath));
        const dtosText = await readText(dtosPath);
        let dtoNames: Set<string> | undefined;
        if (dtosText !== null) {
          read.push(rel(dtosPath));
          dtoNames = dtoExports(dtosText);
        }
        checks.push(checkBinding({
          bindingText,
          bindingWhere: rel(bindingPath),
          openapi,
          openapiWhere: rel(openapiPath),
          dtoNames,
          dtosWhere: rel(dtosPath),
          inventory,
          read,
        }));
      }
    }
  }
  const drift = checks.find((c) => c.name === "binding-drift");
  if (drift && !drift.skipped) {
    drift.notes = [contractNote, ...drift.notes ?? []];
  }
  // REQ-068: a bound command's other names — its operationId and x-sprig-command —
  // are keys isolate's `_network` accepts, so a rolled-back case may use them.
  const aliases = new Map<string, string[]>();
  if (bindingText !== null) {
    let doc: unknown = null;
    try {
      doc = openapiText === null ? null : JSON.parse(openapiText);
    } catch { /* reported by binding-drift */ }
    for (const row of parseBindingTable(bindingText).rows) {
      const ep = parseEndpoint(row.endpoint);
      if (row.kind !== "command" || !ep) continue;
      commands.set(row.unit, [...(commands.get(row.unit) ?? []), row.endpoint]);
      const tpl = doc ? findOperation(doc, ep.method, ep.path) : null;
      const op = tpl
        ? (doc as { paths: Record<string, Record<string, unknown>> })
          .paths[tpl][ep.method.toLowerCase()] as Record<string, unknown>
        : undefined;
      const names = [op?.operationId, op?.["x-sprig-command"]].filter((
        n,
      ): n is string => typeof n === "string" && n !== "");
      if (names.length) aliases.set(row.endpoint, names);
    }
  }

  // ── tier-cases ─────────────────────────────────────────────────────────────────
  if (!inventory) {
    checks.push(skipped("tier-cases", [], noInv));
  } else {
    const cases: CaseMap = new Map();
    const read: string[] = [];
    const notes: string[] = [];
    for (const u of inventory.units) {
      const casesDir = join(bd, u.dir, "isolate", "cases");
      const m = new Map<string, { where: string; json: unknown }>();
      for (const e of await listDir(casesDir)) {
        if (!e.isDirectory) continue;
        const f = join(casesDir, e.name, `${e.name}.json`);
        const text = await readText(f);
        if (text === null) {
          notes.push(
            `${rel(join(casesDir, e.name))} skipped: no ${e.name}.json in it`,
          );
          continue;
        }
        read.push(rel(f));
        let json: unknown = null;
        try {
          json = JSON.parse(text);
        } catch { /* reported as not-an-object below */ }
        m.set(e.name, { where: rel(f), json });
      }
      if (m.size) cases.set(u.dir, m);
    }
    if (bindingText === null) {
      notes.push(
        "rolled-back cases not matched to a bound command: no spec/contract/binding.md",
      );
    }
    checks.push(
      checkTierCases(inventory, cases, commands, read, notes, aliases),
    );
  }

  // ── built ──────────────────────────────────────────────────────────────────────
  // REQ-057: a path the caller named that is not a directory is a finding, never a skip.
  const missingDir = async (
    flag: string,
    p: string | undefined,
  ): Promise<Finding | undefined> => {
    if (!p || await isDir(resolve(p))) return undefined;
    const where = rel(resolve(p));
    return {
      where,
      message: `${flag} ${where} does not exist (or is not a directory)`,
      hint: `pass the app's real ${
        flag === "--ui-src" ? "src dir (e.g. ui/src)" : "dir (e.g. ui)"
      } — a wrong path must not pass as "not compared"`,
    };
  };
  const uiSrcMissing = await missingDir("--ui-src", opts.uiSrc);
  const appMissing = opts.graph
    ? undefined
    : await missingDir("--app", opts.appDir);
  if (uiSrcMissing) {
    checks.push(
      result("built", [], inventory?.units.length ?? 0, [uiSrcMissing]),
    );
  } else if (!opts.uiSrc) {
    checks.push(
      skipped(
        "built",
        [],
        "no uiSrc given — pass the app's src dir (e.g. ui/src) to check every unit was built",
      ),
    );
  } else if (!inventory) checks.push(skipped("built", [], noInv));
  else checks.push(await checkBuilt(inventory, resolve(opts.uiSrc), root));

  // ── composition ────────────────────────────────────────────────────────────────
  const pathFindings = [uiSrcMissing, appMissing].filter((f): f is Finding =>
    !!f
  );
  if (!inventory) {
    checks.push(
      pathFindings.length
        ? result("composition", [], 0, pathFindings, [noInv])
        : skipped("composition", [], noInv),
    );
  } else if (pathFindings.length) {
    checks.push(
      result("composition", [invWhere], inventory.units.length, pathFindings),
    );
  } else {
    let graph = opts.graph;
    const read = [invWhere];
    let graphFailure: Finding | undefined;
    if (!graph && opts.appDir) {
      const g = await loadGraph(resolve(opts.appDir));
      const where = rel(resolve(opts.appDir)) || ".";
      if (typeof g === "string") {
        // REQ-057: the caller asked for the comparison; not getting a graph is a FAIL.
        graphFailure = {
          where,
          message: `--app ${where}: no composition graph — ${g}`,
          hint:
            "point --app at the app dir whose src/ holds pages/ (e.g. ui), or pass --graph <graph.json>",
        };
      } else {
        graph = g;
        read.push(where);
      }
    }
    const r = checkComposition(inventory, graph, read, invWhere);
    if (graphFailure) {
      r.findings.unshift(graphFailure);
      r.ok = false;
      r.notes = (r.notes ?? []).filter((n) =>
        !n.startsWith("usage matrix not compared")
      );
      if (!r.notes.length) delete r.notes;
    }
    checks.push(r);
  }

  return { checks, ok: checks.every((c) => c.ok) };
}

/** Human text: one block per check, never silent. */
export function renderSpecCheck(r: SpecCheckResult): string {
  const out: string[] = [];
  for (const c of r.checks) {
    const status = c.skipped
      ? "skipped"
      : c.ok
      ? `ok (${c.items} items)`
      : `FAIL (${c.findings.length} finding${
        c.findings.length === 1 ? "" : "s"
      })`;
    out.push(`spec-check ${c.name}: ${status}`);
    out.push(`  read: ${c.read.length ? c.read.join(", ") : "(nothing)"}`);
    if (c.skipped) out.push(`  skipped: ${c.skipped}`);
    for (const n of c.notes ?? []) out.push(`  note: ${n}`);
    for (const f of c.findings) {
      out.push(`  ✗ ${f.where} — ${f.message}`);
      out.push(`    fix: ${f.hint}`);
    }
  }
  const failed = r.checks.filter((c) => !c.ok).map((c) => c.name);
  const ran = r.checks.filter((c) => !c.skipped).length;
  out.push(
    failed.length
      ? `spec-check: FAIL — ${
        failed.join(", ")
      } (${ran} of ${r.checks.length} checks ran)`
      : `spec-check: ok — ${ran} of ${r.checks.length} checks ran, ${
        r.checks.length - ran
      } skipped`,
  );
  return out.join("\n") + "\n";
}

function argValue(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

async function gitTop(): Promise<string | null> {
  try {
    const o = await new Deno.Command("git", {
      args: ["rev-parse", "--show-toplevel"],
      stdout: "piped",
      stderr: "null",
    }).output();
    return o.success ? new TextDecoder().decode(o.stdout).trim() : null;
  } catch {
    return null;
  }
}

if (import.meta.main) {
  const args = Deno.args;
  const known = new Set(["--root", "--ui-src", "--app", "--graph", "--json"]);
  const bad = args.filter((a, i) =>
    a.startsWith("--") && !known.has(a) ||
    (!a.startsWith("--") &&
      !["--root", "--ui-src", "--app", "--graph"].includes(args[i - 1]))
  );
  if (bad.length) {
    console.error(
      `spec-check: unknown argument ${
        bad[0]
      }\nusage: spec-check [--root <git-root>] [--ui-src <dir>] [--app <dir>] [--graph <graph.json>] [--json]`,
    );
    Deno.exit(2);
  }
  const root = argValue(args, "--root") ?? await gitTop();
  if (!root) {
    console.error("spec-check: not in a git checkout — pass --root <git-root>");
    Deno.exit(2);
  }
  const graphPath = argValue(args, "--graph");
  const graph = graphPath
    ? JSON.parse(await Deno.readTextFile(graphPath)) as CompositionGraph
    : undefined;
  const r = await specCheck({
    gitRoot: root,
    breakdownDir: join(root, "spec/ui/breakdown"),
    uiSrc: argValue(args, "--ui-src"),
    appDir: argValue(args, "--app"),
    graph,
  });
  if (args.includes("--json")) console.log(JSON.stringify(r, null, 2));
  else console.log(renderSpecCheck(r));
  Deno.exit(r.ok ? 0 : 1);
}
