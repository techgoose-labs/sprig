// REQ-032 integration: specCheck over real breakdown trees on disk. fixtures/spec-check/clean
// is a git-root-shaped tree (breakdown, contract, built ui/src, a hand-built composition
// graph) that passes every check; each fixtures/spec-check/fail-<check>/ is an overlay copied
// on top of a temp copy of clean/, and exactly that one check must fail.
import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { copy } from "@std/fs";
import { dirname, fromFileUrl, join } from "@std/path";
import {
  type CompositionGraph,
  renderSpecCheck,
  specCheck,
  type SpecCheckResult,
} from "./spec-check.ts";

const REPO = join(dirname(fromFileUrl(import.meta.url)), "..", "..");
const FIX = join(REPO, "fixtures", "spec-check");
const CLI = join(REPO, "framework", ".sprig", "spec-check.ts");

async function tree(overlay?: string): Promise<string> {
  const dir = await Deno.makeTempDir({ prefix: "spec-check-" });
  await copy(join(FIX, "clean"), dir, { overwrite: true });
  if (overlay) await copy(join(FIX, overlay), dir, { overwrite: true });
  return dir;
}

async function run(root: string, withGraph = true): Promise<SpecCheckResult> {
  const graph = withGraph
    ? JSON.parse(
      await Deno.readTextFile(join(root, "composition-graph.json")),
    ) as CompositionGraph
    : undefined;
  return await specCheck({
    gitRoot: root,
    breakdownDir: join(root, "spec/ui/breakdown"),
    uiSrc: join(root, "ui/src"),
    graph,
  });
}

const failed = (r: SpecCheckResult) =>
  r.checks.filter((c) => !c.ok).map((c) => c.name);
const check = (r: SpecCheckResult, name: string) =>
  r.checks.find((c) => c.name === name)!;

Deno.test("REQ-032: the clean breakdown tree passes all seven checks, none skipped, and says what each read", async () => {
  const root = await tree();
  try {
    const r = await run(root);
    assertEquals(failed(r), [], renderSpecCheck(r));
    assertEquals(r.checks.map((c) => c.name), [
      "inventory",
      "unassigned",
      "double-assignment",
      "binding-drift",
      "tier-cases",
      "built",
      "composition",
    ]);
    assert(r.checks.every((c) => !c.skipped), renderSpecCheck(r));
    assert(r.ok);
    assert(
      check(r, "binding-drift").read.includes("spec/contract/client/dtos.ts"),
    );
    assert(
      check(r, "tier-cases").read.includes(
        "spec/ui/breakdown/shared-components/task-row/isolate/cases/rolled-back/rolled-back.json",
      ),
    );
    assert(check(r, "built").read.includes("ui/src/components/app-badge"));
    const text = renderSpecCheck(r);
    for (const c of r.checks) {
      assertStringIncludes(text, `spec-check ${c.name}: ok (`);
    }
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

const CASES: [string, string, string[]][] = [
  ["fail-unassigned", "unassigned", ["footer clock"]],
  ["fail-inventory", "inventory", ['classification "widget"']],
  ["fail-double-assignment", "double-assignment", [
    'name "task-row"',
    'dir "shared-components/task-row"',
  ]],
  ["fail-binding-drift", "binding-drift", [
    "GET /api/todos",
    "ArchivedTaskDto",
    '"stat-card"',
    "drift: stat-card",
  ]],
  ["fail-tier-cases", "tier-cases", ["fails no call", '_tier "realtime"']],
  ["fail-built", "built", [
    "empty-state is not built",
    "filter-bar has no template.html",
    "island filter-bar (tier pure-client) has no logic.ts",
  ]],
  ["fail-composition", "composition", [
    "shadowing",
    "page archive never composes <task-row>",
    "page archive never composes <app-badge>",
    "usage matrix stale: page settings",
  ]],
];

for (const [overlay, name, expected] of CASES) {
  Deno.test(`REQ-032: ${overlay} fails exactly the ${name} check, naming each offender with a fix`, async () => {
    const root = await tree(overlay);
    try {
      const r = await run(root);
      const text = renderSpecCheck(r);
      assertEquals(failed(r), [name], text);
      assert(!r.ok);
      const c = check(r, name);
      assertEquals(c.findings.length, expected.length, text);
      for (const e of expected) {
        assertStringIncludes(c.findings.map((f) => f.message).join("\n"), e);
      }
      for (const f of c.findings) assertStringIncludes(text, `fix: ${f.hint}`);
    } finally {
      await Deno.remove(root, { recursive: true });
    }
  });
}

Deno.test("REQ-032: a missing inventory.json FAILS unassigned (its absence is the defect) and every inventory-driven check says why it skipped", async () => {
  const root = await tree();
  try {
    await Deno.remove(join(root, "spec/ui/breakdown/inventory.json"));
    const r = await run(root);
    assertEquals(failed(r), ["unassigned"]);
    assertStringIncludes(
      check(r, "unassigned").findings[0].message,
      "no inventory.json — the breakdown's closing pass writes it",
    );
    for (
      const n of [
        "inventory",
        "double-assignment",
        "tier-cases",
        "built",
        "composition",
      ]
    ) {
      assert(check(r, n).skipped, n);
    }
    assert(
      check(r, "binding-drift").notes!.some((n) =>
        n.includes("no valid inventory.json")
      ),
    );
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("REQ-032: no openapi.json skips binding-drift with the reason; openapi without binding.md FAILS", async () => {
  const root = await tree();
  try {
    await Deno.remove(join(root, "spec/contract/binding.md"));
    let r = await run(root);
    assertEquals(failed(r), ["binding-drift"]);
    assertStringIncludes(
      check(r, "binding-drift").findings[0].message,
      "but spec/contract/binding.md does not",
    );
    await Deno.remove(join(root, "spec/contract/openapi.json"));
    r = await run(root);
    assertEquals(failed(r), []);
    assertStringIncludes(
      check(r, "binding-drift").skipped!,
      "no spec/contract/openapi.json",
    );
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("REQ-032: without dtos.ts, DTOs resolve against openapi components.schemas only and the note says so", async () => {
  const root = await tree();
  try {
    await Deno.remove(join(root, "spec/contract/client/dtos.ts"));
    const r = await run(root);
    const c = check(r, "binding-drift");
    assertEquals(c.findings.map((f) => f.message), [
      "DTO MarkDoneInput is not in spec/contract/openapi.json components.schemas",
    ]);
    assert(c.notes!.some((n) => n.includes("no spec/contract/client/dtos.ts")));
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("REQ-032: without uiSrc or a graph, built skips and composition notes the uncompared matrix — never silently", async () => {
  const root = await tree();
  try {
    const r = await specCheck({
      gitRoot: root,
      breakdownDir: join(root, "spec/ui/breakdown"),
    });
    assertStringIncludes(check(r, "built").skipped!, "no uiSrc given");
    assert(
      check(r, "composition").notes!.some((n) =>
        n.includes("no composition graph")
      ),
    );
    const text = renderSpecCheck(r);
    assertStringIncludes(text, "spec-check built: skipped");
    assertStringIncludes(text, "skipped: no uiSrc given");
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("REQ-032: the CLI prints every check and exits 0 on a clean tree, 1 with findings, 2 on a bad argument", async () => {
  const cmd = (args: string[]) =>
    new Deno.Command(Deno.execPath(), {
      args: ["run", "-A", CLI, ...args],
      stdout: "piped",
      stderr: "piped",
      cwd: REPO,
    }).output();
  const clean = await tree();
  const bad = await tree("fail-binding-drift");
  try {
    let o = await cmd([
      "--root",
      clean,
      "--ui-src",
      join(clean, "ui/src"),
      "--graph",
      join(clean, "composition-graph.json"),
    ]);
    let out = new TextDecoder().decode(o.stdout);
    assertEquals(o.code, 0, out + new TextDecoder().decode(o.stderr));
    assertStringIncludes(out, "spec-check: ok — 7 of 7 checks ran");
    o = await cmd(["--root", bad, "--json"]);
    out = new TextDecoder().decode(o.stdout);
    assertEquals(o.code, 1);
    const r = JSON.parse(out) as SpecCheckResult;
    assertEquals(failed(r), ["binding-drift"]);
    o = await cmd(["--root", clean, "--nope"]);
    assertEquals(o.code, 2);
    assertStringIncludes(
      new TextDecoder().decode(o.stderr),
      "unknown argument --nope",
    );
  } finally {
    await Deno.remove(clean, { recursive: true });
    await Deno.remove(bad, { recursive: true });
  }
});

Deno.test("REQ-032: with appDir, composition runs on the compiler's real compositionGraph — clean passes; a page that stops composing a shared unit fails", async () => {
  const root = await tree();
  try {
    const opts = {
      gitRoot: root,
      breakdownDir: join(root, "spec/ui/breakdown"),
      uiSrc: join(root, "ui/src"),
      appDir: join(root, "ui"),
    };
    let r = await specCheck(opts);
    assertEquals(failed(r), [], renderSpecCheck(r));
    assert(check(r, "composition").read.includes("ui"));
    assertEquals(check(r, "composition").notes, undefined);
    await Deno.writeTextFile(
      join(root, "ui/src/pages/archive/template.html"),
      "<h1>Archive</h1><app-badge></app-badge>\n",
    );
    r = await specCheck(opts);
    assertEquals(failed(r), ["composition"]);
    assertEquals(check(r, "composition").findings.map((f) => f.message), [
      "task-row is used on page archive per the breakdown, but page archive never composes <task-row>",
    ]);
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});
