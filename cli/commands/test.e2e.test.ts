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
      // REQ-056: swatch/bare has nothing to check — a skipped row, not a pass
      assertEquals(
        [report.total, report.passed, report.failed, report.skipped, p.code],
        [11, 8, 2, 1, 1],
        all,
      );
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

// REQ-056 (e2e) — `sprig isolate <subcommand>` through the real `sprig` CLI
// (framework/cli.ts): `test` runs the workbench runner, a case with nothing to
// check is a skipped row, a run where every case is skipped is "nothing was
// checked" (exit 1), `list` answers (no keep 404), and an arg that is neither a
// subcommand nor a dir is an error naming it.
const SPRIG = fromFileUrl(new URL("../../framework/cli.ts", import.meta.url));

async function sprig(args: string[], wb?: string) {
  const p = await new Deno.Command(Deno.execPath(), {
    args: ["run", "-A", "--unstable-kv", SPRIG, ...args],
    cwd: REPO,
    env: {
      ...Deno.env.toObject(),
      NO_COLOR: "1",
      ...(wb ? { SPRIG_WB_ROOT: wb } : {}),
    },
    stdout: "piped",
    stderr: "piped",
  }).output();
  return {
    code: p.code,
    out: new TextDecoder().decode(p.stdout),
    err: new TextDecoder().decode(p.stderr),
  };
}

Deno.test({
  name:
    "REQ-056: `sprig isolate test --json` runs the runner and reports a skipped row for a case with nothing to check",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const wb = await Deno.makeTempDir({ prefix: "wb-req056-e2e-" });
    try {
      const r = await sprig([
        "isolate",
        "test",
        "swatch",
        "--root",
        FIXTURE,
        "--json",
        "--port",
        String(freePort()),
      ], wb);
      const report = JSON.parse(r.out);
      const rows: (Row & { skipped?: boolean })[] = report.testResults ?? [];
      const all = rows.map((x) =>
        `${x.skipped ? "SKIP" : x.ok ? "ok  " : "RED "} ${x.title}`
      ).join("\n") + `\n${report.error ?? ""}\n${r.err.slice(-1500)}`;
      // the runner ran: real reference rows came back from the browser
      assert(
        rows.find((x) =>
          x.title === "reference: swatch/match"
        )?.ok,
        all,
      );
      const bare = rows.find((x) => x.title === "skipped: swatch/bare");
      assert(bare, all);
      assertEquals([bare.skipped, bare.detail], [
        true,
        "skipped — no tests, no _reference",
      ]);
      assertEquals(
        [report.passed, report.failed, report.skipped],
        [4, 1, 1],
        all,
      );
      assertEquals(report.total, rows.length);
      assertEquals(r.code, 1, all); // swatch/drift is red
    } finally {
      await Deno.remove(wb, { recursive: true });
    }
  },
});

Deno.test({
  name:
    "REQ-056: `sprig isolate test` where every case is skipped exits 1 — nothing was checked",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const j = await sprig([
      "isolate",
      "test",
      "swatch/bare",
      "--root",
      FIXTURE,
      "--json",
    ]);
    assertEquals(j.code, 1, j.err);
    const report = JSON.parse(j.out);
    assertEquals([report.ok, report.passed, report.failed, report.skipped], [
      false,
      0,
      0,
      1,
    ]);
    assertStringIncludes(report.error, "nothing was checked");
    assertEquals(report.testResults[0].title, "skipped: swatch/bare");

    const h = await sprig([
      "isolate",
      "test",
      "swatch/bare",
      "--root",
      FIXTURE,
    ]);
    assertEquals(h.code, 1);
    assertStringIncludes(h.out + h.err, "skipped — no tests, no _reference");
    assertStringIncludes(h.out + h.err, "nothing was checked");
  },
});

Deno.test({
  name:
    "REQ-056: `sprig isolate list --root <app>` lists the cases (no keep 404)",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const r = await sprig(["isolate", "list", "--root", FIXTURE]);
    assertEquals(r.code, 0, r.err);
    assertStringIncludes(r.out, "swatch ›");
    assertStringIncludes(r.out, "bare");
  },
});

Deno.test({
  name:
    "REQ-056: `sprig isolate tset` is an error naming the arg, never a silent 'nothing to isolate'",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const r = await sprig(["isolate", "tset", "--json"]);
    assertEquals(r.code, 1);
    assertStringIncludes(
      r.err,
      "sprig isolate: 'tset' is not a subcommand (test|list) and not a directory",
    );
    assert(!(r.out + r.err).includes("Nothing to isolate"), r.out);
  },
});
