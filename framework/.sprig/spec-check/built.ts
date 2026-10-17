// built (REQ-032): every inventory unit has its folder in the app's src with a template.html.
// Layout per compiler/composition-registry.ts: a page is pages/<p>, a page-local component
// pages/<p>/components/<c>; a shared component is global — keyed by basename anywhere
// outside pages/ — so it may live in shared-components/ (sprig init's `$.shared-components/`
// alias), components/ (static) or islands/.
import { join, relative } from "@std/path";
import {
  type CheckResult,
  type Finding,
  type Inventory,
  type InventoryUnit,
  result,
} from "./types.ts";

export function builtCandidates(u: InventoryUnit): string[] {
  if (u.scope === "shared") {
    return [
      `shared-components/${u.name}`,
      `components/${u.name}`,
      `islands/${u.name}`,
    ];
  }
  if (u.scope === "page") return [`pages/${u.name}`];
  return [`pages/${u.page}/components/${u.name}`];
}

async function isDir(p: string) {
  try {
    return (await Deno.stat(p)).isDirectory;
  } catch {
    return false;
  }
}
async function isFile(p: string) {
  try {
    return (await Deno.stat(p)).isFile;
  } catch {
    return false;
  }
}

export async function checkBuilt(
  inv: Inventory,
  uiSrc: string,
  gitRoot: string,
): Promise<CheckResult> {
  const rel = (p: string) =>
    relative(gitRoot, p).startsWith("..") ? p : relative(gitRoot, p);
  const findings: Finding[] = [];
  const read: string[] = [rel(uiSrc)];
  const notes = [
    "shared units looked up in shared-components/, components/, islands/ (first found wins)",
  ];
  for (const u of inv.units) {
    const cands = builtCandidates(u);
    let found: string | undefined;
    for (const c of cands) {
      if (await isDir(join(uiSrc, c))) {
        found = c;
        break;
      }
    }
    if (!found) {
      findings.push({
        where: rel(join(uiSrc, cands[0])),
        message: `${u.scope} ${u.name} is not built (looked for ${
          cands.map((c) => rel(join(uiSrc, c))).join(", ")
        })`,
        hint:
          `build it from spec/ui/breakdown/${u.dir}/${u.name}.md with sprig-build-component`,
      });
      continue;
    }
    const dir = join(uiSrc, found);
    read.push(rel(dir));
    if (!await isFile(join(dir, "template.html"))) {
      findings.push({
        where: rel(dir),
        message: `${u.name} has no template.html`,
        hint:
          "a sprig component is a folder with template.html (+ logic.ts for an island)",
      });
    }
    const hasLogic = await isFile(join(dir, "logic.ts"));
    if (u.classification === "island" && !hasLogic) {
      findings.push({
        where: rel(dir),
        message: `island ${u.name} (tier ${u.tier}) has no logic.ts`,
        hint:
          "an island hydrates from its logic.ts — author it, or reclassify the unit static in the breakdown",
      });
    }
    if (u.classification === "static" && hasLogic) {
      findings.push({
        where: rel(join(dir, "logic.ts")),
        message: `static ${u.name} ships a logic.ts`,
        hint:
          "the breakdown classified it static (zero client JS) — move the logic to the backend/resolve, or reclassify it with evidence",
      });
    }
  }
  return result("built", read, inv.units.length, findings, notes);
}
