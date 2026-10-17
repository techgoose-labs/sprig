import { assert, assertEquals } from "@std/assert";
import { checkTierCases, failingKeys, networkValueProblem } from "./tier.ts";
import type { Inventory, InventoryUnit } from "./types.ts";

function unit(
  u: Partial<InventoryUnit> & { name: string; dir: string },
): InventoryUnit {
  return {
    classification: "island",
    scope: "shared",
    usedOn: [],
    tier: "optimistic-write",
    evidence: "",
    dataNeeds: [],
    ...u,
  };
}

Deno.test("REQ-032: networkValueProblem accepts fail, delay:<ms> and {status}; rejects the rest", () => {
  assertEquals(networkValueProblem("fail"), null);
  assertEquals(networkValueProblem("delay:300"), null);
  assertEquals(
    networkValueProblem({ status: 500, body: { error: "x" } }),
    null,
  );
  assert(networkValueProblem("delay:soon") !== null);
  assert(networkValueProblem("boom") !== null);
  assert(networkValueProblem({ body: 1 }) !== null);
  assert(networkValueProblem(42) !== null);
});

Deno.test("REQ-032: failingKeys keeps only entries that fail — 'fail' or status >= 400", () => {
  assertEquals(
    failingKeys({
      "POST /api/a": "fail",
      "b": "delay:10",
      "c": { status: 200 },
      "d": { status: 409 },
    }),
    ["POST /api/a", "d"],
  );
  assertEquals(failingKeys(undefined), []);
});

type Cases = Map<string, Map<string, { where: string; json: unknown }>>;
function cases(entries: Record<string, Record<string, unknown>>): Cases {
  const m: Cases = new Map();
  for (const [dir, cs] of Object.entries(entries)) {
    m.set(
      dir,
      new Map(
        Object.entries(cs).map((
          [k, json],
        ) => [k, { where: `${dir}/isolate/cases/${k}/${k}.json`, json }]),
      ),
    );
  }
  return m;
}

Deno.test("REQ-032: checkTierCases — a write island with pending + a rolled-back that fails its bound command passes", () => {
  const inv: Inventory = {
    units: [unit({ name: "task-row", dir: "shared-components/task-row" })],
    unassigned: [],
  };
  const r = checkTierCases(
    inv,
    cases({
      "shared-components/task-row": {
        default: { done: false, _tier: "optimistic-write" },
        pending: {
          done: true,
          _network: { "POST /api/commands/markDone": "delay:2000" },
        },
        "rolled-back": { done: false, _network: { markDone: "fail" } },
      },
    }),
    new Map([["task-row", ["POST /api/commands/markDone"]]]),
    [],
  );
  assertEquals(r.findings, []);
  assertEquals(r.items, 3);
});

Deno.test("REQ-032: checkTierCases — missing pending, missing rolled-back, a rolled-back that fails nothing or the wrong command, a disagreeing _tier, a malformed _network", () => {
  const inv: Inventory = {
    units: [
      unit({ name: "a", dir: "shared-components/a" }),
      unit({ name: "b", dir: "shared-components/b" }),
      unit({ name: "c", dir: "shared-components/c" }),
      unit({
        name: "d",
        dir: "shared-components/d",
        classification: "static",
        tier: "static",
      }),
    ],
    unassigned: [],
  };
  const r = checkTierCases(
    inv,
    cases({
      "shared-components/a": { default: {} },
      "shared-components/b": {
        pending: {},
        "rolled-back": { _network: { "POST /api/x": "delay:5" } },
      },
      "shared-components/c": {
        pending: {},
        "rolled-back": { _network: { "POST /api/other": "fail" } },
      },
      "shared-components/d": {
        default: { _tier: "realtime", _network: { "GET /api/d": "later" } },
      },
    }),
    new Map([["c", ["POST /api/commands/save"]]]),
    [],
  );
  const msgs = r.findings.map((f) => `${f.where} :: ${f.message}`).join("\n");
  assert(
    msgs.includes("shared-components/a") && msgs.includes('"pending"'),
    msgs,
  );
  assert(msgs.includes('"rolled-back"'), msgs);
  assert(
    msgs.includes(
      "shared-components/b/isolate/cases/rolled-back/rolled-back.json",
    ),
    msgs,
  );
  assert(msgs.includes("POST /api/commands/save"), msgs);
  assert(msgs.includes('_tier "realtime"'), msgs);
  assert(msgs.includes('"later"'), msgs);
  assertEquals(r.findings.length, 6, msgs);
});

Deno.test("REQ-032: checkTierCases — a write island with no isolate/cases folder at all is one finding per required case", () => {
  const inv: Inventory = {
    units: [unit({ name: "a", dir: "shared-components/a" })],
    unassigned: [],
  };
  const r = checkTierCases(inv, cases({}), new Map(), []);
  assertEquals(r.findings.length, 2);
});

// REQ-064: a confirmed-write island awaits the server's reply before it shows the change —
// it proves its "pending" state; there is no optimistic state, so nothing to roll back.
Deno.test("REQ-064: checkTierCases — a confirmed-write island with only a pending case passes", () => {
  const inv: Inventory = {
    units: [unit({
      name: "save-note",
      dir: "shared-components/save-note",
      tier: "confirmed-write",
    })],
    unassigned: [],
  };
  const r = checkTierCases(
    inv,
    cases({
      "shared-components/save-note": {
        pending: {
          _tier: "confirmed-write",
          _network: { "POST /api/commands/saveNote": "delay:2000" },
        },
      },
    }),
    new Map([["save-note", ["POST /api/commands/saveNote"]]]),
    [],
  );
  assertEquals(r.findings, []);
  assert(r.ok);
});

Deno.test("REQ-064: checkTierCases — a confirmed-write island without a pending case fails, naming only pending", () => {
  const inv: Inventory = {
    units: [unit({
      name: "save-note",
      dir: "shared-components/save-note",
      tier: "confirmed-write",
    })],
    unassigned: [],
  };
  const r = checkTierCases(
    inv,
    cases({
      "shared-components/save-note": {
        default: { _tier: "confirmed-write" },
      },
    }),
    new Map(),
    [],
  );
  assertEquals(r.findings.map((f) => f.message), [
    'confirmed-write save-note has no "pending" case',
  ]);
  assert(r.findings[0].hint.includes("pending"));
});

Deno.test("REQ-068: checkTierCases — a rolled-back case may fail its bound command by operationId or x-sprig-command, as isolate's _network accepts", () => {
  const inv: Inventory = {
    units: [
      unit({ name: "dog-actions", dir: "pages/d/components/dog-actions" }),
    ],
    unassigned: [],
  };
  const bound = new Map([["dog-actions", ["POST /api/dog/check-in"]]]);
  const aliases = new Map([["POST /api/dog/check-in", [
    "dogCheckIn",
    "dog.checkIn",
  ]]]);
  for (const key of ["dogCheckIn", "dog.checkIn"]) {
    const r = checkTierCases(
      inv,
      cases({
        "pages/d/components/dog-actions": {
          pending: { _network: { [key]: "delay:2000" } },
          "rolled-back": { _network: { [key]: "fail" } },
        },
      }),
      bound,
      [],
      [],
      aliases,
    );
    assertEquals(r.findings, [], key);
  }
  // a name the contract does not alias to the bound endpoint still fails
  const miss = checkTierCases(
    inv,
    cases({
      "pages/d/components/dog-actions": {
        pending: { _network: { dogCheckOut: "delay:2000" } },
        "rolled-back": { _network: { dogCheckOut: "fail" } },
      },
    }),
    bound,
    [],
    [],
    aliases,
  );
  assertEquals(miss.findings.length, 1);
});
