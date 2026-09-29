import { assert, assertEquals } from "@std/assert";
import { checkComposition, reachableSelectors } from "./graph.ts";
import type { CompositionGraph, Inventory, InventoryUnit } from "./types.ts";

const GRAPH: CompositionGraph = {
  pages: {
    dashboard: { dir: "pages/dashboard", composes: ["task-row", "stat-card"] },
    archive: { dir: "pages/archive", composes: ["task-row", "app-badge"] },
  },
  components: {
    "task-row": {
      dir: "shared-components/task-row",
      scope: "shared",
      composes: [],
      composedBy: ["dashboard", "archive"],
    },
    "app-badge": {
      dir: "shared-components/app-badge",
      scope: "shared",
      composes: [],
      composedBy: ["archive", "stat-card"],
    },
    "dashboard/stat-card": {
      dir: "pages/dashboard/components/stat-card",
      scope: "page-local",
      page: "dashboard",
      composes: ["app-badge"],
      composedBy: ["dashboard"],
    },
  },
};

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

const INV: Inventory = {
  units: [
    unit({
      name: "dashboard",
      dir: "pages/dashboard",
      scope: "page",
      classification: "page-composition",
    }),
    unit({
      name: "archive",
      dir: "pages/archive",
      scope: "page",
      classification: "page-composition",
    }),
    unit({
      name: "task-row",
      dir: "shared-components/task-row",
      usedOn: ["dashboard", "archive"],
      classification: "island",
      tier: "optimistic-write",
    }),
    unit({
      name: "app-badge",
      dir: "shared-components/app-badge",
      usedOn: ["dashboard", "archive"],
    }),
    unit({
      name: "stat-card",
      dir: "pages/dashboard/components/stat-card",
      scope: "page-local",
      page: "dashboard",
      usedOn: ["dashboard"],
    }),
  ],
  unassigned: [],
};

Deno.test("REQ-032: reachableSelectors follows components transitively (dashboard reaches app-badge through stat-card)", () => {
  assertEquals([...reachableSelectors(GRAPH, "dashboard")].sort(), [
    "app-badge",
    "dashboard/stat-card",
    "task-row",
  ]);
  assertEquals([...reachableSelectors(GRAPH, "archive")].sort(), [
    "app-badge",
    "task-row",
  ]);
});

Deno.test("REQ-032: reachableSelectors resolves page-local first (a shadow hides the shared one) and survives a cycle", () => {
  const g: CompositionGraph = {
    pages: {
      p: { dir: "pages/p", composes: ["a"] },
      q: { dir: "pages/q", composes: ["a"] },
    },
    components: {
      a: {
        dir: "shared-components/a",
        scope: "shared",
        composes: ["b"],
        composedBy: [],
      },
      b: {
        dir: "shared-components/b",
        scope: "shared",
        composes: ["a"],
        composedBy: [],
      },
      "p/a": {
        dir: "pages/p/components/a",
        scope: "page-local",
        page: "p",
        composes: ["c"],
        composedBy: [],
      },
      c: {
        dir: "shared-components/c",
        scope: "shared",
        composes: [],
        composedBy: [],
      },
    },
  };
  assertEquals([...reachableSelectors(g, "p")].sort(), ["c", "p/a"]);
  assertEquals([...reachableSelectors(g, "q")].sort(), ["a", "b"]);
  assertEquals([...reachableSelectors(g, "nope")], []);
});

Deno.test("REQ-032: checkComposition passes when the usage matrix matches the graph", () => {
  const r = checkComposition(INV, GRAPH);
  assertEquals(r.findings, []);
  assert(r.ok);
});

Deno.test("REQ-032: checkComposition — a usedOn page that does not compose the selector, and a page composing one it does not list, are findings", () => {
  const inv: Inventory = {
    ...INV,
    units: INV.units.map((u) =>
      u.name === "task-row"
        ? { ...u, usedOn: ["dashboard", "settings"] }
        : u.name === "app-badge"
        ? { ...u, usedOn: ["archive"] }
        : u
    ),
  };
  const r = checkComposition(inv, GRAPH);
  const msgs = r.findings.map((f) => f.message).join("\n");
  assert(msgs.includes("settings"), msgs);
  assert(msgs.includes("task-row"), msgs);
  assert(
    msgs.includes("usage matrix stale") && msgs.includes("dashboard") &&
      msgs.includes("app-badge"),
    msgs,
  );
  assertEquals(r.findings.length, 3);
});

Deno.test("REQ-032: checkComposition — a page-local unit named like a shared one is shadowing, even without a graph", () => {
  const inv: Inventory = {
    ...INV,
    units: [
      ...INV.units,
      unit({
        name: "app-badge",
        dir: "pages/archive/components/app-badge",
        scope: "page-local",
        page: "archive",
        usedOn: ["archive"],
      }),
    ],
  };
  const r = checkComposition(inv, undefined);
  assertEquals(r.findings.length, 1);
  assert(r.findings[0].message.includes("shadowing"));
  assert(r.findings[0].hint.includes("sprig-shadows"));
  assert(r.notes!.some((n) => n.includes("no composition graph")));
});

Deno.test("REQ-032: reachableSelectors reads compositionGraph's resolved keys — `<page>/<selector>` for page-local — transitively", () => {
  const g: CompositionGraph = {
    pages: {
      dashboard: {
        dir: "pages/dashboard",
        composes: ["dashboard/stat-card", "task-row"],
      },
    },
    components: {
      "task-row": {
        dir: "islands/task-row",
        scope: "shared",
        composes: [],
        composedBy: ["dashboard"],
      },
      "app-badge": {
        dir: "components/app-badge",
        scope: "shared",
        composes: [],
        composedBy: ["dashboard/stat-card"],
      },
      "dashboard/stat-card": {
        dir: "pages/dashboard/components/stat-card",
        scope: "page-local",
        page: "dashboard",
        composes: ["app-badge"],
        composedBy: ["dashboard"],
      },
    },
  };
  assertEquals([...reachableSelectors(g, "dashboard")].sort(), [
    "app-badge",
    "dashboard/stat-card",
    "task-row",
  ]);
});

Deno.test("REQ-057: checkComposition compares page-local units too — one the page never composes is a finding", () => {
  const g: CompositionGraph = {
    ...GRAPH,
    pages: {
      ...GRAPH.pages,
      dashboard: {
        dir: "pages/dashboard",
        composes: ["task-row", "app-badge"],
      },
    },
  };
  const r = checkComposition(INV, g);
  assertEquals(r.findings.map((f) => f.message), [
    "page-local stat-card is used on page dashboard per the breakdown, but page dashboard never composes <stat-card>",
  ]);
  assert(r.findings[0].hint.includes("pages/dashboard"));
  assert(!r.ok);
});

// REQ-064: the app shell (src/shell, the graph's "shell" component) wraps every page, so a
// unit it composes — directly or through a component — counts as used on every page.
const SHELL_GRAPH: CompositionGraph = {
  ...GRAPH,
  components: {
    ...GRAPH.components,
    shell: {
      dir: "src/shell",
      scope: "shared",
      composes: ["top-bar"],
      composedBy: [],
    },
    "top-bar": {
      dir: "src/shared-components/top-bar",
      scope: "shared",
      composes: ["main-nav"],
      composedBy: ["shell"],
    },
    "main-nav": {
      dir: "src/shared-components/main-nav",
      scope: "shared",
      composes: [],
      composedBy: ["top-bar"],
    },
  },
};
const SHELL_INV: Inventory = {
  ...INV,
  units: [
    ...INV.units,
    unit({
      name: "top-bar",
      dir: "shared-components/top-bar",
      usedOn: ["dashboard", "archive"],
    }),
    unit({
      name: "main-nav",
      dir: "shared-components/main-nav",
      usedOn: ["dashboard", "archive"],
    }),
  ],
};

Deno.test("REQ-064: a unit the shell composes (directly or through top-bar) counts as used on every page", () => {
  const r = checkComposition(SHELL_INV, SHELL_GRAPH);
  assertEquals(r.findings, []);
  assert(r.ok);
});

Deno.test("REQ-064: a shell-composed unit whose usedOn omits a page is a stale usage matrix — the shell wraps that page too", () => {
  const inv: Inventory = {
    ...SHELL_INV,
    units: SHELL_INV.units.map((u) =>
      u.name === "main-nav" ? { ...u, usedOn: ["dashboard"] } : u
    ),
  };
  assertEquals(
    checkComposition(inv, SHELL_GRAPH).findings.map((f) => f.message),
    [
      "usage matrix stale: page archive composes <main-nav> but main-nav's usedOn does not list it",
    ],
  );
});

Deno.test("REQ-064: a shared unit composed by neither the page nor the shell says so", () => {
  const g: CompositionGraph = {
    ...SHELL_GRAPH,
    components: {
      ...SHELL_GRAPH.components,
      shell: { ...SHELL_GRAPH.components.shell, composes: [] },
      "top-bar": { ...SHELL_GRAPH.components["top-bar"], composedBy: [] },
    },
  };
  const r = checkComposition(SHELL_INV, g);
  assertEquals(r.findings.map((f) => f.message), [
    "top-bar is used on page dashboard per the breakdown, but it is not composed by dashboard or the shell",
    "top-bar is used on page archive per the breakdown, but it is not composed by archive or the shell",
    "main-nav is used on page dashboard per the breakdown, but it is not composed by dashboard or the shell",
    "main-nav is used on page archive per the breakdown, but it is not composed by archive or the shell",
  ]);
  assert(r.findings[0].hint.includes("src/shell"));
});
