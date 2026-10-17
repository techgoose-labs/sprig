import { assert, assertEquals } from "@std/assert";
import {
  checkDoubleAssignment,
  checkUnassigned,
  validateInventory,
} from "./inventory.ts";

const GOOD = {
  units: [
    {
      name: "dashboard",
      dir: "pages/dashboard",
      classification: "page-composition",
      scope: "page",
      usedOn: ["dashboard"],
      tier: "static",
      evidence: "route #/",
      dataNeeds: [],
    },
    {
      name: "task-row",
      dir: "shared-components/task-row",
      classification: "island",
      scope: "shared",
      usedOn: ["dashboard", "archive"],
      tier: "optimistic-write",
      evidence: "mark done",
      dataNeeds: ["mark done"],
    },
    {
      name: "stat-card",
      dir: "pages/dashboard/components/stat-card",
      classification: "static",
      scope: "page-local",
      page: "dashboard",
      usedOn: ["dashboard"],
      tier: "static",
      evidence: "",
      dataNeeds: [],
    },
  ],
  unassigned: [],
};

Deno.test("REQ-032: validateInventory accepts the fixed shape", () => {
  const v = validateInventory(GOOD, "inv.json");
  assertEquals(v.findings, []);
  assertEquals(v.inventory!.units.length, 3);
});

Deno.test("REQ-032: validateInventory drops and reports malformed units — bad enums, missing fields, dir not matching scope, static/tier disagreement", () => {
  const v = validateInventory({
    units: [
      ...GOOD.units,
      {
        name: "x",
        dir: "pages/x",
        classification: "widget",
        scope: "page",
        usedOn: [],
        tier: "static",
        evidence: "",
        dataNeeds: [],
      },
      {
        name: "y",
        dir: "pages/dash/components/y",
        classification: "static",
        scope: "shared",
        usedOn: [],
        tier: "static",
        evidence: "",
        dataNeeds: [],
      },
      {
        name: "z",
        dir: "pages/p/components/z",
        classification: "static",
        scope: "page-local",
        usedOn: [],
        tier: "static",
        evidence: "",
        dataNeeds: [],
      },
      {
        name: "w",
        dir: "shared-components/w",
        classification: "static",
        scope: "shared",
        usedOn: [],
        tier: "realtime",
        evidence: "",
        dataNeeds: [],
      },
      {
        name: "v",
        dir: "shared-components/v",
        classification: "island",
        scope: "shared",
        usedOn: [],
        tier: "static",
        evidence: "",
        dataNeeds: [],
      },
      {
        name: "u",
        dir: "shared-components/u",
        classification: "static",
        scope: "shared",
        tier: "static",
      },
    ],
    unassigned: [],
  }, "inv.json");
  assertEquals(v.inventory!.units.length, 3);
  const where = v.findings.map((f) => f.where).join("\n");
  for (const i of [3, 4, 5, 6, 7, 8]) {
    assert(where.includes(`inv.json units[${i}]`), where);
  }
  for (const f of v.findings) assert(f.hint.length > 0);
});

Deno.test("REQ-032: validateInventory rejects a non-object and a missing unassigned array", () => {
  assertEquals(validateInventory([], "inv.json").inventory, undefined);
  const v = validateInventory({ units: [] }, "inv.json");
  assert(v.findings.some((f) => f.message.includes("unassigned")));
});

Deno.test("REQ-032: checkUnassigned — each entry is a finding; empty passes", () => {
  const ok = checkUnassigned({ units: [], unassigned: [] }, "inv.json", [
    "inv.json",
  ]);
  assert(ok.ok);
  const bad = checkUnassigned(
    { units: [], unassigned: ["footer clock", "toast timer"] },
    "inv.json",
    ["inv.json"],
  );
  assertEquals(bad.findings.length, 2);
  assertEquals(bad.findings[1].where, "inv.json unassigned[1]");
  assert(bad.findings[0].message.includes("footer clock"));
});

Deno.test("REQ-032: checkDoubleAssignment — duplicate names and duplicate dirs; shadowing across scopes is left to composition", () => {
  const units = validateInventory(GOOD, "i").inventory!.units;
  const dup = { ...units[1] };
  const sameDir = { ...units[2], name: "stat-card-2" };
  const shadow = {
    ...units[1],
    name: "task-row",
    dir: "pages/dashboard/components/task-row",
    scope: "page-local" as const,
    page: "dashboard",
  };
  const r = checkDoubleAssignment(
    { units: [...units, dup, sameDir, shadow], unassigned: [] },
    "i",
    ["i"],
  );
  const msgs = r.findings.map((f) => f.message).join("\n");
  assertEquals(r.findings.length, 3, msgs);
  assert(msgs.includes('name "task-row"'), msgs);
  assert(msgs.includes('dir "shared-components/task-row"'), msgs);
  assert(msgs.includes('dir "pages/dashboard/components/stat-card"'), msgs);
});
