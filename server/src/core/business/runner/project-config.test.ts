// REQ-061 — the runner keeps what a project and the harness hand it: a project
// playwright.config's settings reach the run even when Playwright's loader hands
// the generated config the TS module as `{ default: config }`, and a reference
// row keeps the harness's notes (the fonts it loaded or could not) beside the
// measurement, in the row's detail the `--json` report carries.
import { assertEquals, assertStringIncludes } from "#std/assert";
import { dirname, join, toFileUrl } from "#std/path";
import type { ComponentEntry } from "../discover/mod.ts";
import { configSource } from "./harness.ts";
import { runTests } from "./mod.ts";
import { encodePng } from "./png.ts";

const USE = { colorScheme: "dark", viewport: { width: 411, height: 600 } };

async function loadGenerated(baseSource: string) {
  const dir = await Deno.makeTempDir({ prefix: "req061-cfg-" });
  const base = join(dir, "base.config.mjs");
  await Deno.writeTextFile(base, baseSource);
  const gen = join(dir, "playwright.config.mjs");
  await Deno.writeTextFile(gen, configSource("/ev/specs", "/ev/out", base));
  try {
    return (await import(toFileUrl(gen).href)).default;
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
}

Deno.test("REQ-061: a project config loaded as { default: config } (a TS config under Playwright's loader) still lends its `use`", async () => {
  // measured: Playwright's loader hands the .mjs the fixture's .ts config as
  // {"default":{"use":{…}}} — the shape this base module reproduces
  const cfg = await loadGenerated(
    `export default { default: ${
      JSON.stringify({ use: USE, testDir: "x" })
    } };`,
  );
  assertEquals(cfg.use, USE);
  assertEquals([cfg.testDir, cfg.outputDir], ["/ev/specs", "/ev/out"]);
  assertEquals("default" in cfg, false);
});

Deno.test("REQ-061: a project config that is the config object itself (plain ESM/CJS) lends its `use`, never its tests", async () => {
  const cfg = await loadGenerated(
    `export default ${
      JSON.stringify({ use: USE, testDir: "x", projects: [{ name: "p" }] })
    };`,
  );
  assertEquals(cfg.use, USE);
  assertEquals([cfg.testDir, cfg.projects], ["/ev/specs", undefined]);
});

Deno.test("REQ-061: a reference row keeps the harness's font notes beside the measurement", async () => {
  const dir = await Deno.makeTempDir({ prefix: "req061-notes-" });
  try {
    const png = await encodePng({
      width: 2,
      height: 2,
      data: new Uint8Array(16).fill(200),
    });
    const ref = join(dir, "ref.png");
    await Deno.writeFile(ref, png);
    const entries = [{
      label: "tile",
      cases: [{
        name: "plain",
        route: "/components/tile/plain",
        tests: [],
        reference: { image: ref, tolerance: 0.01, via: "case dir" },
      }],
    }] as unknown as ComponentEntry[];
    const FONT_NOTE =
      "fonts not loaded (local to the app, not served by the workbench): /fonts/brand.css";
    const r = await runTests({ projectRoot: join(dir, "proj") }, {
      discover: () => Promise.resolve({ entries, problems: [] }),
      runnerPresent: () => Promise.resolve(true),
      env: { ISOLATE_RUNNER_HOME: "/runner", SPRIG_WB_ROOT: join(dir, "wb") },
      runSpec: async (_bin, args) => {
        const specs = dirname(args[args.indexOf("--config") + 1]);
        const out = join(dirname(specs), "cases", "tile-plain", "actual.png");
        await Deno.mkdir(dirname(out), { recursive: true });
        await Deno.writeFile(out, png);
        const annotations = [
          { type: "isolate", description: "case tile/plain: device scale 1" },
          { type: "isolate", description: FONT_NOTE },
        ];
        return {
          stdout: new TextEncoder().encode(JSON.stringify({
            suites: [{
              file: "0-tile-plain.iso.ts",
              specs: [{
                title: "reference: tile/plain",
                ok: true,
                tests: [{ annotations: [], results: [{ annotations }] }],
              }],
            }],
          })),
          stderr: new Uint8Array(),
        };
      },
    });
    const row = r.testResults.find((t) => t.title === "reference: tile/plain")!;
    assertEquals([row.ok, row.measured], [true, 0], row.detail);
    const lines = row.detail!.split("\n");
    assertStringIncludes(lines[0], "measured 0.000 ≤ tolerance 0.010");
    assertStringIncludes(lines[0], "(reference resolved from the case dir)");
    assertEquals(lines.slice(1), [
      "case tile/plain: device scale 1",
      FONT_NOTE,
    ]);
    // the --json report is this object, serialized: the notes ride in it
    assertStringIncludes(JSON.stringify(r), FONT_NOTE);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});
