// REQ-040..045 — how the runner turns a case's keys into a Playwright run: one
// generated wrapper per case (outside the project) that applies _viewport,
// _theme and _network to every test of the case and adds the `reference: …` /
// `motion: …` rows; the report carries the case's tier and the evidence dir.
import {
  assert,
  assertEquals,
  assertRejects,
  assertStringIncludes,
} from "#std/assert";
import { join } from "#std/path";
import type { ComponentEntry } from "../discover/mod.ts";
import { parseReport, planRun, runTests, wrapperSource } from "./mod.ts";

const enc = (s: string) => new TextEncoder().encode(s);

// deno-lint-ignore no-explicit-any
function entry(cases: any[]): ComponentEntry {
  return {
    label: "swatch",
    cases: cases.map((c) => ({
      route: `/components/s/${c.name}`,
      tests: [],
      ...c,
    })),
  } as unknown as ComponentEntry;
}

const ROOT = "/proj";
const E = [entry([
  {
    name: "plain",
    tests: [{ name: "a", file: "/proj/cases/plain/tests/a.spec.ts" }],
  },
  { name: "ref-only", reference: { image: "/proj/r.png", tolerance: 0.01 } },
  {
    name: "net",
    tier: "optimistic-write",
    viewport: { width: 375, height: 720 },
    theme: "dark",
    network: [{
      key: "POST /api/x",
      method: "POST",
      path: "/api/x",
      pattern: "^/api/x$",
      action: { kind: "fail" },
    }],
    tests: [{ name: "b", file: "/proj/cases/net/tests/b.spec.ts" }],
  },
])];

Deno.test("REQ-042: planRun — a case with only a _reference still runs (no spec files needed)", () => {
  const p = planRun(E, {}, ROOT);
  assertEquals(p.cases.map((c) => c.key), [
    "swatch/plain",
    "swatch/ref-only",
    "swatch/net",
  ]);
  assertEquals(p.loose, []);
});

Deno.test("REQ-042: planRun — a filter selects by file path or by <unit>/<case>", () => {
  assertEquals(
    planRun(E, { filter: "ref-only" }, ROOT).cases.map((c) => c.key),
    ["swatch/ref-only"],
  );
  assertEquals(planRun(E, { filter: "b.spec" }, ROOT).cases.map((c) => c.key), [
    "swatch/net",
  ]);
  assertEquals(planRun(E, { filter: "zzz" }, ROOT).cases, []);
});

Deno.test("REQ-040: planRun — explicit files select their cases; unknown files run loose", () => {
  const p = planRun(E, {
    files: [
      "/proj/cases/net/tests/b.spec.ts",
      "/proj/x.spec.ts",
      "/etc/y.spec.ts",
    ],
  }, ROOT);
  assertEquals(p.cases.map((c) => c.key), ["swatch/net"]);
  assertEquals(p.loose, ["/proj/x.spec.ts"]); // outside the root: rejected
});

Deno.test("REQ-040/041/043: the wrapper imports the case's specs and installs viewport, theme and network for them", () => {
  const net = planRun(E, {}, ROOT).cases[2];
  const src = wrapperSource(
    net,
    "/ev/specs/isolate-harness.ts",
    "/ev/cases/swatch-net",
  );
  assertStringIncludes(src, `import "/proj/cases/net/tests/b.spec.ts";`);
  assertStringIncludes(src, "installCase(CASE)");
  const json = JSON.parse(src.match(/const CASE = (.*);\n/)![1]);
  assertEquals(json.viewport, { width: 375, height: 720 });
  assertEquals(json.theme, "dark");
  assertEquals(json.network[0].pattern, "^/api/x$");
  assert(!src.includes("reference:"), "no reference row without _reference");
});

Deno.test("REQ-042/045: the wrapper adds the `reference: <unit>/<case>` and `motion: <unit>/<case>` rows", () => {
  const c = {
    ...planRun(E, {}, ROOT).cases[1],
    motion: { spec: "/proj/m.json" },
  };
  const src = wrapperSource(
    c,
    "/ev/specs/isolate-harness.ts",
    "/ev/cases/swatch-ref-only",
  );
  assertStringIncludes(src, `test("reference: swatch/ref-only"`);
  assertStringIncludes(src, `test("motion: swatch/ref-only"`);
  assertStringIncludes(src, "/ev/cases/swatch-ref-only/actual.png");
});

Deno.test("REQ-040: runTests — spawns the generated config (outside the project), never the raw spec paths", async () => {
  const ev = await Deno.makeTempDir({ prefix: "w3-ev-" });
  let args: string[] = [];
  let wrapper = "";
  try {
    const r = await runTests({ projectRoot: ROOT, evidenceDir: ev }, {
      discover: () => Promise.resolve({ entries: E, problems: [] }),
      runnerPresent: () => Promise.resolve(true),
      env: { ISOLATE_RUNNER_HOME: "/runner" },
      runSpec: async (_b, a) => {
        args = a;
        const specs = join(ev, "specs");
        for await (const f of Deno.readDir(specs)) {
          if (f.name.includes("net")) {
            wrapper = await Deno.readTextFile(join(specs, f.name));
          }
        }
        return {
          stdout: enc(JSON.stringify({
            suites: [{
              file: "2-swatch-net.iso.ts",
              specs: [{
                title: "rolls back",
                file: "../../../proj/cases/net/tests/b.spec.ts",
                line: 4,
                ok: true,
                tests: [{ results: [{}] }],
              }],
            }],
          })),
          stderr: enc(""),
        };
      },
    });
    assertEquals(args.includes("/proj/cases/net/tests/b.spec.ts"), false);
    assertEquals(
      args[args.indexOf("--config") + 1],
      join(ev, "specs", "playwright.config.mjs"),
    );
    assertStringIncludes(wrapper, `"theme":"dark"`);
    assertEquals(r.evidenceDir, ev);
    const row = r.testResults.find((t) => t.title === "rolls back")!;
    assertEquals(row.tier, "optimistic-write"); // REQ-044: the case's tier on each row
    assertEquals(row.caseName, "net");
    assertEquals(row.file, "/proj/cases/net/tests/b.spec.ts");
  } finally {
    await Deno.remove(ev, { recursive: true });
  }
});

Deno.test("REQ-042: runTests — an evidence dir inside the project is refused", async () => {
  await assertRejects(
    () =>
      runTests({ projectRoot: ROOT, evidenceDir: "/proj/evidence" }, {
        discover: () => Promise.resolve({ entries: E, problems: [] }),
        runnerPresent: () => Promise.resolve(true),
        env: { ISOLATE_RUNNER_HOME: "/runner" },
      }),
    Error,
    "inside the project",
  );
});

Deno.test("REQ-043: parseReport — the harness's isolate annotations become the row's detail", () => {
  const json = JSON.stringify({
    suites: [{
      file: "/root/w.iso.ts",
      specs: [{
        title: "t",
        ok: true,
        tests: [{
          annotations: [{
            type: "isolate",
            description: "network POST /api/x → fail: fired 1×",
          }],
          results: [{}],
        }],
      }],
    }],
  });
  const r = parseReport(enc(json), enc(""), new Map(), "/root");
  assertEquals(r.testResults[0].detail, "network POST /api/x → fail: fired 1×");
});

Deno.test("REQ-042: planRun — a case selected through its spec files brings its check rows", () => {
  const withRef = [entry([{
    name: "both",
    reference: { image: "/proj/r.png", tolerance: 0.01 },
    tests: [{ name: "a", file: "/proj/cases/both/tests/a.spec.ts" }],
  }])];
  const p = planRun(
    withRef,
    { files: ["/proj/cases/both/tests/a.spec.ts"] },
    ROOT,
  );
  assertEquals(p.cases[0].reference?.image, "/proj/r.png");
});
