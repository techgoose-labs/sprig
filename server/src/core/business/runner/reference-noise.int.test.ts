// REQ-051/059 (integration) — runTests on fixtures/isolate/reference-noise-app
// with the real discovery, the real generated wrappers and the real compare, at
// the DEFAULT tolerance. Every PNG in the fixture is a real browser capture
// (chromium headless shell, DPR 1): `renders/guest-card.png` is the card rendered
// by `isolate test` in one run, `cases/rerender/ref.png` the same card in another
// run, `cases/token-swap/ref.png` the card with --primary one palette step darker
// (#2563eb → #1d4ed8). `mock-card` is the eval-app mock's message card with the
// mock's computed styles frozen inline: its `ref.png` is that card shot in a plain
// page (the capture recipe: DPR 1, whole pixels, fonts loaded), `renders/mock-card.png`
// what `isolate test` renders now that the harness loads the app's fonts (from
// bootstrap/template.html), `renders/mock-card-fonts-missing.png` what it
// rendered before (Quicksand fell back to DejaVu Sans). Only the Playwright spawn
// is simulated: it writes the real render where each wrapper says.
import { assert, assertEquals, assertStringIncludes } from "#std/assert";
import { dirname, fromFileUrl, join } from "#std/path";
import { runTests } from "./mod.ts";
import { compareReferenceFiles } from "./reference.ts";
import { DEFAULT_TOLERANCE } from "../discover/mod.ts";

const FIXTURE = fromFileUrl(
  new URL(
    "../../../../../fixtures/isolate/reference-noise-app",
    import.meta.url,
  ),
);
const RENDERS = join(FIXTURE, "renders");
const enc = (s: string) => new TextEncoder().encode(s);

async function fakePlaywright(args: string[]) {
  const specsDir = dirname(args[args.indexOf("--config") + 1]);
  const suites = [];
  for await (const f of Deno.readDir(specsDir)) {
    if (!f.name.endsWith(".iso.ts")) continue;
    const src = await Deno.readTextFile(join(specsDir, f.name));
    const specs = [];
    for (
      const [, title, out] of src.matchAll(
        /test\("(reference: [^"]+)"[\s\S]*?, "([^"]+)"\);/g,
      )
    ) {
      await Deno.mkdir(dirname(out), { recursive: true });
      const unit = title.slice("reference: ".length).split("/")[0];
      await Deno.copyFile(join(RENDERS, `${unit}.png`), out);
      specs.push({ title, ok: true, line: 9, tests: [{ results: [{}] }] });
    }
    suites.push({ file: f.name, specs });
  }
  return { stdout: enc(JSON.stringify({ suites })), stderr: enc("") };
}

Deno.test("REQ-051: at the default tolerance a real re-render passes and a one-step token swap fails", async () => {
  const ev = await Deno.makeTempDir({ prefix: "req051-int-ev-" });
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
      assert(x, `no row "${t}" in ${r.testResults.map((x) => x.title)}`);
      return x;
    };
    const same = row("reference: guest-card/rerender");
    assertEquals([same.ok, same.measured, same.tolerance], [true, 0, 0.01]);
    assertStringIncludes(same.detail!, "measured 0.000 ≤ tolerance 0.010");

    const swap = row("reference: guest-card/token-swap");
    assertEquals(swap.ok, false, swap.detail ?? swap.error);
    assertEquals(swap.tolerance, 0.01);
    // measured on this box: 4483 of 48000 px (the button fill) — 0.093
    assert(swap.measured! > 0.05, `token swap measured ${swap.measured}`);
    assertStringIncludes(swap.error!, "measured 0.093 > tolerance 0.010");
    assertStringIncludes(swap.error!, "a channel moved more than 4/255");
    // REQ-059: the mock's own card, fonts loaded, whole pixels, slot = the
    // still's width: only the stage background in the rounded corners differs
    const mock = row("reference: mock-card/with-photo");
    assertEquals([mock.ok, mock.tolerance], [true, 0.01], mock.detail);
    assertStringIncludes(mock.detail!, "measured 0.002 ≤ tolerance 0.010");
    assertStringIncludes(mock.detail!, "at 600×114");
    assertEquals([r.total, r.failed], [3, 1]);
  } finally {
    await Deno.remove(ev, { recursive: true });
  }
});

Deno.test("REQ-059: the same mock card rendered without the app's fonts fails the default tolerance", async () => {
  const dir = await Deno.makeTempDir({ prefix: "req059-int-" });
  try {
    const v = await compareReferenceFiles(
      join(
        FIXTURE,
        "src/components/mock-card/isolate/cases/with-photo/ref.png",
      ),
      join(RENDERS, "mock-card-fonts-missing.png"),
      join(dir, "diff.png"),
      DEFAULT_TOLERANCE,
    );
    assertEquals(v.ok, false);
    assertStringIncludes(v.message, "measured 0.095 > tolerance 0.010");
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});
