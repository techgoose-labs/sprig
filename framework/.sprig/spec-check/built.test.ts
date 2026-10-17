import { assertEquals } from "@std/assert";
import { builtCandidates } from "./built.ts";
import type { InventoryUnit } from "./types.ts";

function unit(
  u: Partial<InventoryUnit> & { name: string; dir: string },
): InventoryUnit {
  return {
    classification: "static",
    scope: "shared",
    usedOn: [],
    tier: "static",
    evidence: "",
    dataNeeds: [],
    ...u,
  };
}

Deno.test("REQ-032: builtCandidates maps each breakdown dir to the sprig src layout (compiler/composition-registry.ts scoping)", () => {
  assertEquals(
    builtCandidates(
      unit({ name: "task-row", dir: "shared-components/task-row" }),
    ),
    [
      "shared-components/task-row",
      "components/task-row",
      "islands/task-row",
    ],
  );
  assertEquals(
    builtCandidates(
      unit({ name: "dashboard", dir: "pages/dashboard", scope: "page" }),
    ),
    ["pages/dashboard"],
  );
  assertEquals(
    builtCandidates(
      unit({
        name: "stat-card",
        dir: "pages/dashboard/components/stat-card",
        scope: "page-local",
        page: "dashboard",
      }),
    ),
    ["pages/dashboard/components/stat-card"],
  );
});
