// REQ-040..045 (e2e) — the real `isolate test --json` in a real browser against
// the served isolate workbench, on fixtures/isolate/case-keys-app:
//   _viewport  the case's spec sees innerWidth 375
//   _theme     <html data-theme="dark">, and the dark reference matches
//   _reference an equal render passes at measured 0.000; a 25% drift fails with
//              "measured 0.250 > tolerance 0.010" and a diff PNG outside the tree
//   _network   a failed POST rolls the optimistic count back (the fake fired), a
//              delayed POST doesn't hold the UI, a faked 200 keeps the count
//   _motion    the matching spec passes; the drifted one names duration + easing
//   _tier      every row of a case carries it
// The Playwright runner is whatever this environment resolves (ISOLATE_RUNNER_HOME
// or the XDG cache); the workbench is a private SPRIG_WB_ROOT under the temp dir.
import { assert, assertEquals, assertStringIncludes } from "#std/assert";
import { fromFileUrl, join } from "#std/path";
import { decodePng } from "../../server/src/core/business/runner/png.ts";

const CLI = fromFileUrl(new URL("../main.ts", import.meta.url));
const REPO = fromFileUrl(new URL("../../", import.meta.url));
const FIXTURE = join(REPO, "fixtures", "isolate", "case-keys-app");

function freePort(): number {
  for (let p = 4300; p < 4400; p++) {
    try {
      Deno.listen({ port: p, hostname: "127.0.0.1" }).close();
      return p;
    } catch { /* taken */ }
  }
  throw new Error("no free port in 4300-4399");
}

interface Row {
  title: string;
  ok: boolean;
  caseName?: string;
  tier?: string;
  error?: string;
  detail?: string;
  measured?: number;
  tolerance?: number;
  evidence?: string;
}

Deno.test({
  name:
    "REQ-040..045: `isolate test --json` in a browser applies every case key and reports each check as a row",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const wb = await Deno.makeTempDir({ prefix: "wb-w3-e2e-" });
    try {
      const p = await new Deno.Command(Deno.execPath(), {
        args: [
          "run",
          "-A",
          "--unstable-kv",
          CLI,
          "test",
          "--root",
          FIXTURE,
          "--json",
          "--port",
          String(freePort()),
        ],
        cwd: REPO,
        env: { ...Deno.env.toObject(), NO_COLOR: "1", SPRIG_WB_ROOT: wb },
        stdout: "piped",
        stderr: "piped",
      }).output();
      const err = new TextDecoder().decode(p.stderr);
      const report = JSON.parse(new TextDecoder().decode(p.stdout));
      const rows: Row[] = report.testResults ?? [];
      const all = rows.map((r) =>
        `${r.ok ? "ok " : "RED"} ${r.title} ${r.error ?? ""}`
      ).join("\n");
      const row = (t: string) => {
        const r = rows.find((r) => r.title === t);
        assert(
          r,
          `no row "${t}":\n${all}\n${report.error ?? ""}\n${err.slice(-2000)}`,
        );
        return r;
      };

      // _viewport + _theme reach the case's own specs
      const vp = row("REQ-040: renders at the case's _viewport width");
      assert(vp.ok, all);
      assertStringIncludes(vp.detail!, "viewport 375x720");
      assert(row("REQ-041: <html> carries the case's _theme").ok, all);

      // _reference
      const match = row("reference: swatch/match");
      assertEquals(
        [match.ok, match.measured, match.tolerance],
        [true, 0, 0.01],
        all,
      );
      assert(row("reference: swatch/dark").ok, all); // captured under the case's theme
      const drift = row("reference: swatch/drift");
      assertEquals(drift.ok, false);
      assertStringIncludes(drift.error!, "measured 0.250 > tolerance 0.010");
      assert(
        drift.evidence!.startsWith(wb),
        `diff outside the workbench: ${drift.evidence}`,
      );
      const diff = await decodePng(await Deno.readFile(drift.evidence!));
      assertEquals([diff.width, diff.height], [120, 80]);

      // _network
      const fail = row(
        "REQ-043: a failed save rolls the optimistic count back",
      );
      assert(fail.ok, all);
      assertStringIncludes(
        fail.detail!,
        "network POST /api/save → fail: fired 1×",
      );
      assert(row("REQ-043: a delayed save does not hold the UI").ok, all);
      assert(row("REQ-043: a faked 200 keeps the optimistic count").ok, all);

      // _motion
      assert(row("motion: pulse/motion-ok").ok, all);
      const md = row("motion: pulse/motion-drift");
      assertEquals(md.ok, false);
      assertStringIncludes(md.error!, "duration 1200ms ≠ spec 800ms");
      assertStringIncludes(md.error!, `easing "ease-in-out" ≠ spec "ease-out"`);

      // _tier + the verdict
      assertEquals(fail.tier, "optimistic-write");
      assertEquals(match.tier, "static");
      assertEquals([report.total, report.failed, p.code], [10, 2, 1], all);
      assert(report.evidenceDir.startsWith(wb), report.evidenceDir);
      // nothing written into the fixture
      for await (const e of Deno.readDir(FIXTURE)) {
        assert(
          ["deno.json", "src"].includes(e.name),
          `stray ${e.name} in the fixture`,
        );
      }
    } finally {
      await Deno.remove(wb, { recursive: true });
    }
  },
});
