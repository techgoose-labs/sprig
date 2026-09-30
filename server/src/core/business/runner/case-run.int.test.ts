// REQ-040..045 (integration) — runTests on the real fixture app
// (fixtures/isolate/case-keys-app) with the real discovery, the real generated
// wrappers/config and the real compare; only Playwright is simulated: the fake
// spawn does what the harness does in a browser (writes each case's actual.png /
// motion.actual.json where the wrapper says) and answers with a JSON report
// naming every wrapper's tests.
import { assert, assertEquals, assertStringIncludes } from "#std/assert";
import { dirname, fromFileUrl, join } from "#std/path";
import { runTests } from "./mod.ts";
import { decodePng } from "./png.ts";

const FIXTURE = fromFileUrl(
  new URL("../../../../../fixtures/isolate/case-keys-app", import.meta.url),
);
const SWATCH = join(FIXTURE, "src/components/swatch/isolate/cases");
const enc = (s: string) => new TextEncoder().encode(s);

// What the rendered pulse animation reads as, in the harness's raw capture form.
const RENDERED_PULSE = [{
  selector: "span.dot",
  name: "pulse",
  keyframes: [{ easing: "ease-in-out" }, { easing: "ease-in-out" }, {
    easing: "ease-in-out",
  }],
  timing: {
    duration: 1200,
    delay: 0,
    iterations: "Infinity",
    easing: "linear",
  },
}];

/** A stand-in for `playwright test --config <generated>`. */
async function fakePlaywright(args: string[]) {
  const config = args[args.indexOf("--config") + 1];
  const specsDir = dirname(config);
  const suites = [];
  for await (const f of Deno.readDir(specsDir)) {
    if (!f.name.endsWith(".iso.ts")) continue;
    const src = await Deno.readTextFile(join(specsDir, f.name));
    const specs = [];
    for (
      const m of src.matchAll(
        /test\("((?:reference|motion): [^"]+)"[\s\S]*?, "([^"]+)"\);/g,
      )
    ) {
      const [, title, out] = m;
      await Deno.mkdir(dirname(out), { recursive: true });
      if (title.startsWith("reference:")) {
        // the swatch renders solid blue at light theme, near-black at dark
        const src = title.endsWith("/dark") ? "dark" : "match";
        await Deno.copyFile(join(SWATCH, src, "ref.png"), out);
      } else {
        await Deno.writeTextFile(out, JSON.stringify(RENDERED_PULSE));
      }
      specs.push({ title, ok: true, line: 9, tests: [{ results: [{}] }] });
    }
    for (const m of src.matchAll(/^import "([^"]+\.spec\.ts)";$/gm)) {
      specs.push({
        title: `spec ${m[1].split("/").pop()}`,
        file: m[1],
        line: 5,
        ok: true,
        tests: [{ results: [{}] }],
      });
    }
    suites.push({ file: f.name, specs });
  }
  return { stdout: enc(JSON.stringify({ suites })), stderr: enc("") };
}

Deno.test("REQ-040..045: runTests on the fixture app — every check is a row with its measurement", async () => {
  const ev = await Deno.makeTempDir({ prefix: "w3-int-ev-" });
  try {
    const r = await runTests({
      projectRoot: FIXTURE,
      evidenceDir: ev,
      baseUrl: "http://127.0.0.1:4399",
    }, {
      runnerPresent: () => Promise.resolve(true),
      env: { ISOLATE_RUNNER_HOME: "/runner" },
      runSpec: (_bin, args) => fakePlaywright(args),
    });
    const row = (t: string) => {
      const x = r.testResults.find((x) => x.title === t);
      assert(
        x,
        `no row "${t}" in ${r.testResults.map((x) => x.title).join(", ")}`,
      );
      return x;
    };
    // REQ-042: equal reference passes with its number; the drifted one fails with it
    const match = row("reference: swatch/match");
    assertEquals([match.ok, match.measured, match.tolerance], [true, 0, 0.01]);
    assertStringIncludes(match.detail!, "measured 0.000 ≤ tolerance 0.010");
    assertStringIncludes(
      match.detail!,
      "(reference resolved from the case dir)",
    );
    const drift = row("reference: swatch/drift");
    assertEquals(drift.ok, false);
    assertStringIncludes(drift.error!, "measured 0.250 > tolerance 0.010");
    assert(drift.evidence!.startsWith(ev), drift.evidence);
    const diff = await decodePng(await Deno.readFile(drift.evidence!));
    assertEquals([diff.width, diff.height], [120, 80]);
    assertEquals(row("reference: swatch/dark").ok, true);
    // REQ-045: motion
    assertEquals(row("motion: pulse/motion-ok").ok, true);
    const md = row("motion: pulse/motion-drift");
    assertEquals(md.ok, false);
    assertStringIncludes(md.error!, "duration 1200ms ≠ spec 800ms");
    assertStringIncludes(md.error!, `easing "ease-in-out" ≠ spec "ease-out"`);
    // REQ-044: tier per row; REQ-040/043: the case's own specs ran inside its wrapper
    assertEquals(row("spec rollback.spec.ts").tier, "optimistic-write");
    assertEquals(row("spec rollback.spec.ts").caseName, "fail");
    assertEquals(row("spec viewport.spec.ts").tier, "static");
    // 5 check rows (3 reference + 2 motion) + 5 case specs; the two drifts fail
    assertEquals([r.total, r.passed, r.failed, r.ok], [10, 8, 2, false]);
    assertEquals(r.evidenceDir, ev);
    // nothing landed in the fixture tree
    for await (const e of Deno.readDir(FIXTURE)) {
      assert(
        ["deno.json", "src"].includes(e.name),
        `stray ${e.name} in the fixture`,
      );
    }
  } finally {
    await Deno.remove(ev, { recursive: true });
  }
});

Deno.test("REQ-043: the generated wrapper for a _network case carries the resolved rule", async () => {
  const ev = await Deno.makeTempDir({ prefix: "w3-int-ev-" });
  try {
    let wrapper = "";
    await runTests({
      projectRoot: FIXTURE,
      evidenceDir: ev,
      filter: "saver/fail",
    }, {
      runnerPresent: () => Promise.resolve(true),
      env: { ISOLATE_RUNNER_HOME: "/runner" },
      runSpec: async (_b, args) => {
        const dir = dirname(args[args.indexOf("--config") + 1]);
        for await (const f of Deno.readDir(dir)) {
          if (f.name.endsWith(".iso.ts")) {
            wrapper = await Deno.readTextFile(join(dir, f.name));
          }
        }
        return { stdout: enc(JSON.stringify({ suites: [] })), stderr: enc("") };
      },
    });
    const json = JSON.parse(wrapper.match(/const CASE = (.*);\n/)![1]);
    assertEquals(json.network, [{
      key: "POST /api/save",
      method: "POST",
      path: "/api/save",
      pattern: "^/api/save$",
      action: { kind: "fail" },
    }]);
    assertStringIncludes(
      wrapper,
      "saver/isolate/cases/fail/tests/rollback.spec.ts",
    );
  } finally {
    await Deno.remove(ev, { recursive: true });
  }
});
