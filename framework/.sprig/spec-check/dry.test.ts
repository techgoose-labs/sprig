import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { jaccard } from "../compiler/lints/duplicate-templates.ts";
import {
  CENSUS_THRESHOLD,
  checkCensus,
  checkReuse,
  checkSameJob,
  type Markup,
  markupOf,
  nestedIn,
  type UnitMarkup,
} from "./dry.ts";
import type { CompositionGraph, Inventory, InventoryUnit } from "./types.ts";

const W = "spec/ui/breakdown/inventory.json";

function unit(
  name: string,
  over: Partial<InventoryUnit> = {},
): InventoryUnit {
  const scope = over.scope ?? "shared";
  const page = over.page;
  return {
    name,
    dir: scope === "shared"
      ? `shared-components/${name}`
      : scope === "page"
      ? `pages/${name}`
      : `pages/${page}/components/${name}`,
    classification: "static",
    scope,
    usedOn: page ? [page] : ["a", "b"],
    tier: "static",
    evidence: "",
    dataNeeds: [],
    ...over,
  };
}

const CARD = (who: string, tone = "badge-info") =>
  `<a href="#/dog/${who}" class="card bg-base-100 border"><div class="card-body p-4">
     <h2 class="card-title">${who}</h2>
     <span class="badge ${tone}"><svg class="lucide lucide-clock"><path d="M1 2"></path><circle r="3"></circle></svg>Booked</span>
   </div></a>`;
const STAT =
  `<div class="stat"><div class="stat-title">Open</div><div class="stat-value">12</div><div class="stat-desc">up 3</div></div>`;

async function um(u: InventoryUnit, html: string): Promise<UnitMarkup> {
  return {
    unit: u,
    where: `${u.dir}/source.html`,
    markup: await markupOf(html),
  };
}
const mk = (xs: UnitMarkup[]) =>
  new Map<InventoryUnit, Markup>(xs.map((x) => [x.unit, x.markup]));

Deno.test("REQ-070: markupOf — class tokens and attribute names are shingles, an svg is one node whose geometry is not walked", async () => {
  const m = await markupOf(CARD("d01"));
  assert(m.shingles.has("div/h2/.card-title"), [...m.shingles].join("\n"));
  assert(m.shingles.has("^/a/[href]"));
  assert(m.shingles.has("span/svg/.lucide-clock"));
  assert(![...m.shingles].some((s) => s.includes("path")));
  assertEquals(m.nodes, 5);
  assertEquals(m.tops.length, 1);
});

Deno.test("REQ-070: markupOf — two instances of one card score above the census threshold; a card and a stat tile do not", async () => {
  const a = await markupOf(CARD("d01"));
  const b = await markupOf(CARD("d14", "badge-error"));
  const s = await markupOf(STAT);
  assert(jaccard(a.shingles, b.shingles) >= CENSUS_THRESHOLD);
  assert(jaccard(a.shingles, s.shingles) < 0.2);
  // tag-only structure would call two differently-toned badges identical; class tokens do not
  const info = await markupOf(
    `<span class="badge badge-info"><svg class="lucide lucide-house"></svg>In</span>`,
  );
  const err = await markupOf(
    `<span class="badge badge-error"><svg class="lucide lucide-alarm-clock"></svg>Late</span>`,
  );
  assert(jaccard(info.shingles, err.shingles) < CENSUS_THRESHOLD);
});

Deno.test("REQ-070: nestedIn — a row inside a list nests; two extractions of the same row are siblings, not nesting", async () => {
  const row = await markupOf(CARD("d01"));
  const list = await markupOf(
    `<div class="grid">${CARD("d01")}${CARD("d02")}</div>`,
  );
  const again = await markupOf(CARD("d01"));
  assert(nestedIn(row, list));
  assert(!nestedIn(list, row));
  assert(!nestedIn(row, again));
});

Deno.test("REQ-070: checkCensus — a pair at the threshold FAILS naming both units and the score; a list and its row are nested, not a finding", async () => {
  const card = await um(
    unit("dog-card", { scope: "page-local", page: "board" }),
    CARD("d01"),
  );
  const twin = await um(unit("dog-tile"), CARD("d02", "badge-error"));
  const grid = await um(
    unit("dog-grid", { scope: "page-local", page: "board" }),
    `<div class="grid">${CARD("d01")}</div>`,
  );
  const inv: Inventory = {
    units: [card.unit, twin.unit, grid.unit],
    unassigned: [],
  };
  const r = checkCensus(inv, [card, twin, grid], [], W, []);
  assertEquals(r.findings.length, 1, JSON.stringify(r, null, 1));
  assertStringIncludes(
    r.findings[0].message,
    "units dog-card and dog-tile extract the same markup (",
  );
  assertStringIncludes(
    r.findings[0].message,
    "`distinct: <reason>` on both in inventory.json",
  );
  assertStringIncludes(r.findings[0].hint, "on both dog-card and dog-tile");
});

Deno.test("REQ-070: checkCensus — distinct on ONE side still FAILS and says which side has it; on both it is a note", async () => {
  const a = await um(
    unit("card-a", { distinct: "the booking preview" }),
    CARD("d01"),
  );
  const b = await um(unit("card-b"), CARD("d02"));
  const inv: Inventory = { units: [a.unit, b.unit], unassigned: [] };
  let r = checkCensus(inv, [a, b], [], W, []);
  assertEquals(r.findings.length, 1);
  assertStringIncludes(r.findings[0].hint, "only card-a carries one");
  b.unit.distinct = "the pickup list row";
  r = checkCensus(inv, [a, b], [], W, []);
  assertEquals(r.findings, []);
  assert(r.notes!.some((n) => n.startsWith("distinct: card-a ~ card-b")));
});

Deno.test("REQ-070: checkCensus — page-local twins on two pages are left to reuse; pages are not compared", async () => {
  const a = await um(
    unit("row-a", { scope: "page-local", page: "p" }),
    CARD("d01"),
  );
  const b = await um(
    unit("row-b", { scope: "page-local", page: "q" }),
    CARD("d02"),
  );
  const pg = await um(
    unit("p", { scope: "page", classification: "page-composition" }),
    CARD("d01"),
  );
  const inv: Inventory = { units: [a.unit, b.unit, pg.unit], unassigned: [] };
  const r = checkCensus(inv, [a, b, pg], [], W, []);
  assertEquals(r.findings, []);
  assert(r.notes!.some((n) => n.startsWith("cross-page: row-a ~ row-b")));
  assert(
    r.notes!.some((n) => n.includes("pages not compared") && n.includes("p")),
  );
  const reuse = checkReuse(inv, mk([a, b]), [], W);
  assertEquals(reuse.findings.map((f) => f.message), [
    "row-a on page p and row-b on page q — one shared unit (markup 1.00)",
  ]);
});

Deno.test("REQ-070: checkSameJob — same classification + same need set FAILS; a unit composing the other, or a different classification, does not", () => {
  const needs = new Map<InventoryUnit, Set<string>>();
  const a = unit("status-strip", { scope: "page-local", page: "board" });
  const b = unit("status-breakdown", { scope: "page-local", page: "day" });
  const c = unit("day-stats", {
    scope: "page-local",
    page: "day",
    classification: "island",
    tier: "pure-client",
  });
  const grid = unit("dog-grid", { scope: "page-local", page: "board" });
  const card = unit("dog-card", { scope: "page-local", page: "board" });
  for (const u of [a, b, c]) {
    needs.set(
      u,
      new Set(["GET /api/day/{id} → DayDto", "GET /api/dog → DogDto"]),
    );
  }
  for (const u of [grid, card]) {
    needs.set(
      u,
      new Set(["GET /api/dog → DogDto", "GET /api/owner → OwnerDto"]),
    );
  }
  const graph: CompositionGraph = {
    pages: { board: { dir: "pages/board", composes: ["board/dog-grid"] } },
    components: {
      "board/dog-grid": {
        dir: "pages/board/components/dog-grid",
        scope: "page-local",
        page: "board",
        composes: ["board/dog-card"],
        composedBy: ["board"],
      },
      "board/dog-card": {
        dir: "pages/board/components/dog-card",
        scope: "page-local",
        page: "board",
        composes: [],
        composedBy: ["board/dog-grid"],
      },
    },
  };
  const inv: Inventory = { units: [a, b, c, grid, card], unassigned: [] };
  const r = checkSameJob(inv, needs, "binding.md", [], W, new Map(), graph);
  assertEquals(r.findings.map((f) => f.message), [
    "units status-strip and status-breakdown do the same job — both static, binding the same needs (GET /api/day/{id} → DayDto · GET /api/dog → DogDto) — one unit, or `distinct: <reason>` on both",
  ]);
  assert(r.notes!.some((n) => n.startsWith("nested: dog-grid ~ dog-card")));
  assertEquals(r.notes![0], "needs compared from binding.md");
});

Deno.test("REQ-070: checkReuse — without a graph a shared unit with one usedOn page FAILS; the shell's units are on every page", () => {
  const once = unit("toast", { usedOn: ["detail"] });
  const inv: Inventory = { units: [once], unassigned: [] };
  let r = checkReuse(inv, new Map(), [], W);
  assertEquals(r.findings.map((f) => f.message), [
    "shared `toast` is composed only by detail — page-local, or `distinct:`",
  ]);
  assert(r.notes!.some((n) => n.includes("inventory usedOn")));
  const graph: CompositionGraph = {
    pages: {
      detail: { dir: "pages/detail", composes: [] },
      board: { dir: "pages/board", composes: [] },
    },
    components: {
      shell: {
        dir: "shell",
        scope: "shared",
        composes: ["toast"],
        composedBy: [],
      },
      toast: {
        dir: "shared-components/toast",
        scope: "shared",
        composes: [],
        composedBy: ["shell"],
      },
    },
  };
  r = checkReuse(inv, new Map(), [], W, graph);
  assertEquals(r.findings, []);
});

Deno.test("REQ-070 AMENDMENT: checkSameJob — one shared query is not evidence; one shared COMMAND is", () => {
  const a = unit("left", { scope: "page-local", page: "p" });
  const b = unit("right", { scope: "page-local", page: "q" });
  const inv: Inventory = { units: [a, b], unassigned: [] };
  const q = new Map([[a, new Set(["GET /api/day/{id} → DayDto"])], [
    b,
    new Set(["GET /api/day/{id} → DayDto"]),
  ]]);
  let r = checkSameJob(inv, q, "binding.md", [], W, new Map());
  assertEquals(r.findings, []);
  assert(
    r.notes!.some((n) =>
      n.startsWith("left ~ right") && n.includes("one query")
    ),
  );
  const c = new Map([[a, new Set(["POST /api/day/close → DayCloseDto"])], [
    b,
    new Set(["POST /api/day/close → DayCloseDto"]),
  ]]);
  r = checkSameJob(
    inv,
    c,
    "binding.md",
    [],
    W,
    new Map(),
    undefined,
    new Set(["POST /api/day/close → DayCloseDto"]),
  );
  assertEquals(r.findings.length, 1);
});
