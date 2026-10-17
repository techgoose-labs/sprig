import { assert, assertEquals } from "@std/assert";
import {
  checkBinding,
  dtoExports,
  findOperation,
  parseBindingTable,
  parseDrift,
  parseEndpoint,
  pathMatches,
} from "./binding.ts";
import type { Inventory } from "./types.ts";

const TABLE = `# Binding

Some prose.

| unit | need | kind | endpoint | dto |
| ---- | ---- | ---- | -------- | --- |
| dashboard | list tasks | query | \`GET /api/tasks\` | \`TaskDto[]\` |
| task-row | mark done | command | POST /api/commands/markDone | MarkDoneInput |

## Drift

none
`;

Deno.test("REQ-032: parseBindingTable reads the exact-header table, strips backticks and [] and keeps line numbers", () => {
  const t = parseBindingTable(TABLE);
  assert(t.headerFound);
  assertEquals(t.rows.length, 2);
  assertEquals(t.rows[0], {
    line: 7,
    unit: "dashboard",
    need: "list tasks",
    kind: "query",
    endpoint: "GET /api/tasks",
    dto: "TaskDto",
  });
  assertEquals(t.rows[1].endpoint, "POST /api/commands/markDone");
  assertEquals(t.rows[1].line, 8);
});

Deno.test("REQ-032: parseBindingTable reports a missing header and ignores other tables", () => {
  const t = parseBindingTable("| a | b |\n|---|---|\n| 1 | 2 |\n");
  assertEquals(t.headerFound, false);
  assertEquals(t.rows, []);
});

Deno.test("REQ-032: parseDrift — 'none' is empty, list items are entries, a missing section is reported", () => {
  assertEquals(parseDrift(TABLE), { found: true, entries: [] });
  assertEquals(parseDrift("## Drift\n\n- None.\n"), {
    found: true,
    entries: [],
  });
  assertEquals(
    parseDrift(
      "## Drift\n\n- stat-card needs counts: no endpoint\n- archive: no DTO\n\n## Other\n- x\n",
    ),
    {
      found: true,
      entries: ["stat-card needs counts: no endpoint", "archive: no DTO"],
    },
  );
  assertEquals(parseDrift("## Drift\n\n"), {
    found: true,
    entries: [],
    empty: true,
  });
  assertEquals(parseDrift("# nothing"), { found: false, entries: [] });
});

Deno.test("REQ-032: parseEndpoint splits method and path, drops a query string, rejects junk", () => {
  assertEquals(parseEndpoint("get /api/items?x=1"), {
    method: "GET",
    path: "/api/items",
  });
  assertEquals(parseEndpoint("POST  /api/commands/markDone"), {
    method: "POST",
    path: "/api/commands/markDone",
  });
  assertEquals(parseEndpoint("/api/items"), null);
  assertEquals(parseEndpoint("FETCH /api"), null);
});

Deno.test("REQ-032: pathMatches — openapi {param} matches any segment; binding :id and {id} match a param; a binding param never matches a literal", () => {
  assert(pathMatches("/api/items/{id}", "/api/items/42"));
  assert(pathMatches("/api/items/{id}", "/api/items/{itemId}"));
  assert(pathMatches("/api/items/{id}", "/api/items/:id"));
  assert(pathMatches("/api/items", "/api/items/"));
  assert(!pathMatches("/api/items/counts", "/api/items/{id}"));
  assert(!pathMatches("/api/items/{id}", "/api/items"));
  assert(!pathMatches("/api/items/{id}/tags", "/api/items/1/notes"));
});

Deno.test("REQ-032: findOperation needs the path AND the method", () => {
  const openapi = {
    paths: {
      "/api/items/{id}": { get: {}, parameters: [] },
      "/api/commands/markDone": { post: {} },
    },
  };
  assertEquals(
    findOperation(openapi, "GET", "/api/items/7"),
    "/api/items/{id}",
  );
  assertEquals(findOperation(openapi, "DELETE", "/api/items/7"), null);
  assertEquals(
    findOperation(openapi, "POST", "/api/commands/markDone"),
    "/api/commands/markDone",
  );
  assertEquals(findOperation(openapi, "GET", "/api/nope"), null);
});

Deno.test("REQ-032: dtoExports reads every exported type-ish name, including export lists", () => {
  const names = dtoExports(`export interface TaskDto { id: string }
export type MarkDoneInput = { id: string };
export declare class Foo {}
export const enum Bar { A }
export { Baz, Qux as Quux };
interface Hidden {}
`);
  assertEquals([...names].sort(), [
    "Bar",
    "Baz",
    "Foo",
    "MarkDoneInput",
    "Quux",
    "TaskDto",
  ]);
});

const INV: Inventory = {
  units: [
    {
      name: "dashboard",
      dir: "pages/dashboard",
      classification: "page-composition",
      scope: "page",
      usedOn: ["dashboard"],
      tier: "static",
      evidence: "",
      dataNeeds: ["list tasks"],
    },
    {
      name: "task-row",
      dir: "shared-components/task-row",
      classification: "island",
      scope: "shared",
      usedOn: ["dashboard"],
      tier: "optimistic-write",
      evidence: "",
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
      dataNeeds: ["counts"],
    },
    {
      name: "app-badge",
      dir: "shared-components/app-badge",
      classification: "static",
      scope: "shared",
      usedOn: ["dashboard"],
      tier: "static",
      evidence: "",
      dataNeeds: [],
    },
  ],
  unassigned: [],
};
const OPENAPI = {
  paths: { "/api/tasks": { get: {} }, "/api/commands/markDone": { post: {} } },
  components: { schemas: { TaskDto: {}, MarkDoneInput: {} } },
};

Deno.test("REQ-032: checkBinding — clean table, schemas from openapi, a unit without dataNeeds needs no row", () => {
  const inv = {
    ...INV,
    units: INV.units.filter((u) => u.name !== "stat-card"),
  };
  const r = checkBinding({
    bindingText: TABLE,
    bindingWhere: "spec/contract/binding.md",
    openapi: OPENAPI,
    inventory: inv,
    read: [],
  });
  assertEquals(r.findings, []);
  assert(r.ok);
  assertEquals(r.items, 2);
  assert(r.notes!.some((n) => n.includes("components.schemas")));
});

Deno.test("REQ-032: checkBinding — unknown endpoint, wrong method, unknown DTO, uncovered dataNeeds, unknown unit, bad kind, drift entries are each a finding", () => {
  const text = `| unit | need | kind | endpoint | dto |
|---|---|---|---|---|
| dashboard | list tasks | query | GET /api/nope | TaskDto |
| task-row | mark done | command | GET /api/commands/markDone | GhostDto |
| ghost | x | query | GET /api/tasks | TaskDto |
| dashboard | y | fetch | GET /api/tasks | TaskDto |

## Drift

- stat-card counts: no endpoint
`;
  const r = checkBinding({
    bindingText: text,
    bindingWhere: "b.md",
    openapi: OPENAPI,
    inventory: INV,
    read: [],
  });
  assert(!r.ok);
  const msgs = r.findings.map((f) => `${f.where} ${f.message}`).join("\n");
  assert(msgs.includes("b.md:3") && msgs.includes("GET /api/nope"), msgs);
  assert(
    msgs.includes("b.md:4") && msgs.includes("GET /api/commands/markDone"),
    msgs,
  );
  assert(msgs.includes("GhostDto"), msgs);
  assert(msgs.includes('"ghost"'), msgs);
  assert(msgs.includes('"fetch"'), msgs);
  assert(msgs.includes("stat-card") && msgs.includes("no binding row"), msgs);
  assert(msgs.includes("drift") || msgs.includes("Drift"), msgs);
  for (const f of r.findings) {
    assert(f.hint.length > 0, `hint for ${f.message}`);
  }
});

Deno.test("REQ-032: checkBinding — a query must be GET and a command must not be", () => {
  const text = `| unit | need | kind | endpoint | dto |
|---|---|---|---|---|
| dashboard | list tasks | command | GET /api/tasks | TaskDto |
| task-row | mark done | query | POST /api/commands/markDone | MarkDoneInput |

## Drift

none
`;
  const r = checkBinding({
    bindingText: text,
    bindingWhere: "b.md",
    openapi: OPENAPI,
    inventory: undefined,
    read: [],
  });
  assertEquals(r.findings.length, 2);
  assert(r.notes!.some((n) => n.includes("inventory")));
});

Deno.test("REQ-032: checkBinding — dtos.ts exports count when given and the note names both sources", () => {
  const text = TABLE.replace("MarkDoneInput", "OnlyInClient");
  const inv = {
    ...INV,
    units: INV.units.filter((u) => u.name !== "stat-card"),
  };
  const r = checkBinding({
    bindingText: text,
    bindingWhere: "b.md",
    openapi: OPENAPI,
    dtoNames: new Set(["OnlyInClient"]),
    dtosWhere: "spec/contract/client/dtos.ts",
    inventory: inv,
    read: [],
  });
  assertEquals(r.findings, []);
  assert(
    r.notes!.some((n) =>
      n.includes("dtos.ts") && n.includes("components.schemas")
    ),
  );
});

Deno.test("REQ-032: checkBinding — no table and no Drift section are findings", () => {
  const r = checkBinding({
    bindingText: "# empty\n",
    bindingWhere: "b.md",
    openapi: OPENAPI,
    inventory: undefined,
    read: [],
  });
  const msgs = r.findings.map((f) => f.message).join("\n");
  assert(msgs.includes("| unit | need | kind | endpoint | dto |"), msgs);
  assert(msgs.includes("## Drift"), msgs);
});
