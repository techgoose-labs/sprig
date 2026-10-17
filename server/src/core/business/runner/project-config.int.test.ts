// REQ-061 (integration) — runTests on fixtures/isolate/runner-config-app with the
// real discovery, the real generated wrappers + config and the real compare;
// only the Playwright spawn is simulated: it reads the generated config's source,
// writes the tile's render where the wrapper says, and notes the fonts the real
// appFontSources finds in the fixture's shell head — as the harness does. Plus
// the real discovery of fixtures/isolate/native-name-app refusing `base`.
import { assert, assertEquals, assertStringIncludes } from "#std/assert";
import { dirname, fromFileUrl, join } from "#std/path";
import { runTests } from "./mod.ts";
import { appFontSources, FONT_SOURCE_FILES } from "./harness.ts";
import { discover } from "../discover/mod.ts";

const FIXTURES = fromFileUrl(
  new URL("../../../../../fixtures/isolate/", import.meta.url),
);
const APP = join(FIXTURES, "runner-config-app");
const REF = join(APP, "src/components/tile/isolate/cases/plain/ref.png");
const enc = (s: string) => new TextEncoder().encode(s);

Deno.test("REQ-061: the reference row keeps the harness's font notes and the run is configured from the project's playwright.config", async () => {
  const ev = await Deno.makeTempDir({ prefix: "req061-int-ev-" });
  let configText = "";
  try {
    const files: Record<string, string> = {};
    for (const f of FONT_SOURCE_FILES) {
      try {
        files[f] = await Deno.readTextFile(join(APP, f));
      } catch { /* absent */ }
    }
    const src = appFontSources(files);
    const fontNotes = [
      `fonts: ${src.urls.length} stylesheet(s), ${src.css.length} inline block(s) from the app`,
      `fonts not loaded (local to the app, not served by the workbench): ${
        src.skipped.join(", ")
      }`,
    ].join(" · ");
    const r = await runTests({ projectRoot: APP, evidenceDir: ev }, {
      runnerPresent: () => Promise.resolve(true),
      env: { ISOLATE_RUNNER_HOME: "/runner" },
      runSpec: async (_bin, args) => {
        const config = args[args.indexOf("--config") + 1];
        configText = await Deno.readTextFile(config);
        const specs = dirname(config);
        const out = join(dirname(specs), "cases", "tile-plain", "actual.png");
        await Deno.mkdir(dirname(out), { recursive: true });
        await Deno.copyFile(REF, out);
        const annotations = [
          { type: "isolate", description: "case tile/plain: device scale 1" },
          { type: "isolate", description: fontNotes },
        ];
        return {
          stdout: enc(JSON.stringify({
            suites: [{
              file: "0-tile-plain.iso.ts",
              specs: [{
                title: "reference: tile/plain",
                ok: true,
                line: 9,
                tests: [{ results: [{ annotations }] }],
              }],
            }],
          })),
          stderr: enc(""),
        };
      },
    });
    // the auto-detected project config is imported, and unwrapped
    assertStringIncludes(configText, join(APP, "playwright.config.ts"));
    assertStringIncludes(configText, `"default" in loaded ? loaded.default`);
    const row = r.testResults.find((t) => t.title === "reference: tile/plain");
    assert(row, JSON.stringify(r.testResults));
    assertEquals([row.ok, row.measured], [true, 0], row.detail);
    assertStringIncludes(row.detail!, "measured 0.000 ≤ tolerance 0.010");
    assertStringIncludes(
      row.detail!,
      "fonts: 0 stylesheet(s), 1 inline block(s) from the app · fonts not loaded (local to the app, not served by the workbench): /fonts/brand.css",
    );
  } finally {
    await Deno.remove(ev, { recursive: true });
  }
});

Deno.test("REQ-061: discovery of the native-name fixture refuses `base`, naming the native element", async () => {
  const root = join(FIXTURES, "native-name-app");
  const r = await discover(root);
  assertEquals(r.entries, []);
  assertEquals(
    r.problems.map((p) => [p.kind, p.path]),
    [["component-name", join(root, "src/components/base/template.html")]],
  );
  assertStringIncludes(r.problems[0].detail, "<base> is a native HTML element");
});
