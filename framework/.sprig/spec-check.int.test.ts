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
    assertEquals(r.checks.map((c) => c.name).slice(0, 7), [
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
  // REQ-057: a page-local unit the breakdown puts on a page is compared too, not only shared.
  ["fail-composition-page-local", "composition", [
    "page-local stat-card is used on page dashboard per the breakdown, but page dashboard never composes <stat-card>",
  ]],
  ["fail-composition", "composition", [
    "shadowing",
    "task-row is used on page archive per the breakdown, but it is not composed by archive or the shell",
    "app-badge is used on page archive per the breakdown, but it is not composed by archive or the shell",
    "usage matrix stale: page settings",
  ]],
  // REQ-064: a shared unit neither the page nor the app shell composes.
  ["fail-composition-nowhere", "composition", [
    "top-bar is used on page dashboard per the breakdown, but it is not composed by dashboard or the shell",
  ]],
  // REQ-064: a confirmed-write island must prove its pending state (nothing to roll back).
  ["fail-confirmed-write", "tier-cases", [
    'confirmed-write save-note has no "pending" case',
  ]],
  // REQ-070: DRY — two units extracting the same mock markup, two units doing the same
  // job, a shared unit only one page composes, page-local twins on two pages.
  ["fail-census", "census", [
    "units task-row and stat-card extract the same markup (1.00) — one unit, or `distinct: <reason>` on both in inventory.json",
  ]],
  ["fail-census-distinct-one", "census", [
    "units task-row and stat-card extract the same markup (1.00)",
  ]],
  ["fail-distinct-empty", "inventory", [
    "app-badge has an empty distinct reason",
  ]],
  ["fail-same-job", "same-job", [
    "units dashboard and archive do the same job — both page-composition, binding the same needs (GET /api/tasks → TaskDto · GET /api/tasks/counts → TaskCountsDto) — one unit, or `distinct: <reason>` on both",
  ]],
  ["fail-shared-once", "reuse", [
    "shared `app-badge` is composed only by archive — page-local, or `distinct:`",
  ]],
  ["fail-page-local-twins", "reuse", [
    "stat-card on page dashboard and stat-card on page archive — one shared unit",
  ]],
];

const REQ_OF: Record<string, string> = {
  "fail-composition-page-local": "REQ-057",
  "fail-composition-nowhere": "REQ-064",
  "fail-confirmed-write": "REQ-064",
  "fail-census": "REQ-070",
  "fail-census-distinct-one": "REQ-070",
  "fail-distinct-empty": "REQ-070",
  "fail-same-job": "REQ-070",
  "fail-shared-once": "REQ-070",
  "fail-page-local-twins": "REQ-070",
};

for (const [overlay, name, expected] of CASES) {
  // REQ-057 owns the page-local composition row, REQ-064 the shell/confirmed-write rows;
  // the rest are REQ-032's.
  const req = REQ_OF[overlay] ?? "REQ-032";
  Deno.test(`${req}: ${overlay} fails exactly the ${name} check, naming each offender with a fix`, async () => {
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
      "no inventory.json — the breakdown analyst's opening pass writes it",
    );
    // REQ-057: the analyst writes inventory.json in its OPENING pass
    // (claude/agents/sprig-breakdown-analyst.md step 5), so the hint must send you there.
    const hint = check(r, "unassigned").findings[0].hint;
    assertStringIncludes(hint, "opening pass");
    assert(!hint.includes("closing pass"), hint);
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
    assertStringIncludes(out, "spec-check: ok — 10 of 10 checks ran");
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
      "task-row is used on page archive per the breakdown, but it is not composed by archive or the shell",
    ]);
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("REQ-057: --app naming a directory that does not exist FAILS composition, naming the path — never ok with a note", async () => {
  const root = await tree();
  try {
    const r = await specCheck({
      gitRoot: root,
      breakdownDir: join(root, "spec/ui/breakdown"),
      uiSrc: join(root, "ui/src"),
      appDir: join(root, "nope-app"),
    });
    const text = renderSpecCheck(r);
    assertEquals(failed(r), ["composition"], text);
    const f = check(r, "composition").findings;
    assertEquals(f.length, 1, text);
    assertStringIncludes(f[0].message, "nope-app");
    assertStringIncludes(f[0].message, "does not exist");
    assertStringIncludes(text, "spec-check composition: FAIL (1 finding)");
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("REQ-057: --app naming a directory the compiler cannot read a graph from FAILS composition with the reason", async () => {
  const root = await tree();
  try {
    await Deno.mkdir(join(root, "empty-app"));
    const r = await specCheck({
      gitRoot: root,
      breakdownDir: join(root, "spec/ui/breakdown"),
      uiSrc: join(root, "ui/src"),
      appDir: join(root, "empty-app"),
    });
    const text = renderSpecCheck(r);
    assertEquals(failed(r), ["composition"], text);
    assertStringIncludes(
      check(r, "composition").findings[0].message,
      "empty-app",
    );
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("REQ-057: --ui-src naming a directory that does not exist FAILS built and composition, each naming the path once", async () => {
  const root = await tree();
  try {
    const r = await specCheck({
      gitRoot: root,
      breakdownDir: join(root, "spec/ui/breakdown"),
      uiSrc: join(root, "nope/src"),
      graph: JSON.parse(
        await Deno.readTextFile(join(root, "composition-graph.json")),
      ) as CompositionGraph,
    });
    const text = renderSpecCheck(r);
    assertEquals(failed(r), ["built", "composition"], text);
    for (const n of ["built", "composition"]) {
      const f = check(r, n).findings;
      assertEquals(f.length, 1, text);
      assertStringIncludes(f[0].message, "nope/src");
      assertStringIncludes(f[0].message, "does not exist");
    }
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("REQ-057: the CLI exits 1 when --app points at a missing directory, printing composition FAIL with the path", async () => {
  const root = await tree();
  try {
    const o = await new Deno.Command(Deno.execPath(), {
      args: [
        "run",
        "-A",
        CLI,
        "--root",
        root,
        "--ui-src",
        join(root, "ui/src"),
        "--app",
        join(root, "ui-missing"),
      ],
      stdout: "piped",
      stderr: "piped",
      cwd: REPO,
    }).output();
    const out = new TextDecoder().decode(o.stdout);
    assertEquals(o.code, 1, out + new TextDecoder().decode(o.stderr));
    assertStringIncludes(out, "spec-check composition: FAIL (1 finding)");
    assertStringIncludes(out, "ui-missing");
    assert(!out.includes("usage matrix not compared"), out);
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

for (const overlay of ["pass-composition-shell", "pass-confirmed-write"]) {
  Deno.test(`REQ-064: ${overlay} passes every check`, async () => {
    const root = await tree(overlay);
    try {
      const r = await run(root);
      assertEquals(failed(r), [], renderSpecCheck(r));
      assert(r.checks.every((c) => !c.skipped), renderSpecCheck(r));
    } finally {
      await Deno.remove(root, { recursive: true });
    }
  });
}

Deno.test("REQ-064: with appDir, the compiler's real graph carries src/shell — a unit only the shell composes passes on every page", async () => {
  const root = await tree("pass-composition-shell");
  try {
    const opts = {
      gitRoot: root,
      breakdownDir: join(root, "spec/ui/breakdown"),
      uiSrc: join(root, "ui/src"),
      appDir: join(root, "ui"),
    };
    let r = await specCheck(opts);
    assertEquals(failed(r), [], renderSpecCheck(r));
    await Deno.writeTextFile(
      join(root, "ui/src/shell/template.html"),
      "<router-outlet></router-outlet>\n",
    );
    r = await specCheck(opts);
    assertEquals(check(r, "composition").findings.map((f) => f.message), [
      "top-bar is used on page dashboard per the breakdown, but it is not composed by dashboard or the shell",
      "top-bar is used on page archive per the breakdown, but it is not composed by archive or the shell",
    ]);
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("REQ-070: the clean tree runs ten checks — census, same-job and reuse after composition — none skipped, each saying what it compared", async () => {
  const root = await tree();
  try {
    const r = await run(root);
    const text = renderSpecCheck(r);
    assertEquals(failed(r), [], text);
    assertEquals(r.checks.map((c) => c.name).slice(7), [
      "census",
      "same-job",
      "reuse",
    ]);
    assert(r.checks.every((c) => !c.skipped), text);
    assert(
      check(r, "census").read.includes(
        "spec/ui/breakdown/shared-components/task-row/source.html",
      ),
      text,
    );
    assert(
      check(r, "census").notes!.some((n) => n.includes("threshold 0.8")),
      text,
    );
    assert(
      check(r, "same-job").notes!.some((n) => n.includes("binding.md")),
      text,
    );
    for (const n of ["census", "same-job", "reuse"]) {
      assertStringIncludes(text, `spec-check ${n}: ok (`);
    }
    assertStringIncludes(text, "spec-check: ok — 10 of 10 checks ran");
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

for (const overlay of ["pass-census-distinct", "pass-shared-once-distinct"]) {
  Deno.test(`REQ-070: ${overlay} passes every check — \`distinct: <reason>\` excuses the pair, and the report says so`, async () => {
    const root = await tree(overlay);
    try {
      const r = await run(root);
      const text = renderSpecCheck(r);
      assertEquals(failed(r), [], text);
      assert(r.checks.every((c) => !c.skipped), text);
      assertStringIncludes(text, "distinct:");
    } finally {
      await Deno.remove(root, { recursive: true });
    }
  });
}

Deno.test("REQ-070: pre-contract (no binding.md), same-job compares inventory dataNeeds and says so", async () => {
  const root = await tree("fail-same-job");
  try {
    await Deno.remove(join(root, "spec/contract/binding.md"));
    await Deno.remove(join(root, "spec/contract/openapi.json"));
    const r = await run(root);
    const text = renderSpecCheck(r);
    assertEquals(failed(r), ["same-job"], text);
    const c = check(r, "same-job");
    assertEquals(c.findings.length, 1, text);
    assertStringIncludes(
      c.findings[0].message,
      "units dashboard and archive do the same job — both page-composition, binding the same needs (list open tasks · task counts)",
    );
    assert(
      c.notes!.some((n) => n.includes("inventory dataNeeds")),
      text,
    );
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("REQ-070 AMENDMENT: two units binding the same SINGLE query is not the same job — pass-same-job-single-query passes, and the note says why", async () => {
  const root = await tree("pass-same-job-single-query");
  try {
    const r = await run(root);
    const text = renderSpecCheck(r);
    assertEquals(failed(r), [], text);
    assert(
      check(r, "same-job").notes!.some((n) =>
        n.includes("dashboard ~ archive") && n.includes("one query")
      ),
      text,
    );
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});
