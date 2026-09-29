// REQ-061 (e2e) — the real `isolate test --json` in a real browser against the
// served isolate workbench:
//   fixtures/isolate/runner-config-app — the project's playwright.config `use`
//     (colorScheme dark, viewport 411×600) reaches the case's own spec, and the
//     `reference:` row carries the harness's font notes beside its measurement;
//   fixtures/isolate/native-name-app — a component named `base` is refused up
//     front as a config problem naming the native element (exit 1), no browser
//     run, no timeout.
// The Playwright runner is whatever this environment resolves (ISOLATE_RUNNER_HOME
// or the XDG cache); the workbench is a private SPRIG_WB_ROOT under the temp dir.
import { assert, assertEquals, assertStringIncludes } from "#std/assert";
import { fromFileUrl, join } from "#std/path";

const REPO = fromFileUrl(new URL("../../../../../", import.meta.url));
const CLI = join(REPO, "cli", "main.ts");
const FIXTURES = join(REPO, "fixtures", "isolate");

function freePort(): number {
  const l = Deno.listen({ port: 0, hostname: "127.0.0.1" });
  const port = (l.addr as Deno.NetAddr).port;
  l.close();
  return port;
}

async function isolateTest(app: string) {
  const wb = await Deno.makeTempDir({ prefix: "wb-req061-e2e-" });
  try {
    const p = await new Deno.Command(Deno.execPath(), {
      args: [
        "run",
        "-A",
        "--unstable-kv",
        CLI,
        "test",
        "--root",
        join(FIXTURES, app),
        "--json",
        "--port",
        String(freePort()),
      ],
      cwd: REPO,
      env: { ...Deno.env.toObject(), NO_COLOR: "1", SPRIG_WB_ROOT: wb },
      stdout: "piped",
      stderr: "piped",
    }).output();
    return {
      code: p.code,
      report: JSON.parse(new TextDecoder().decode(p.stdout)),
      err: new TextDecoder().decode(p.stderr),
    };
  } finally {
    await Deno.remove(wb, { recursive: true });
  }
}

Deno.test({
  name:
    "REQ-061: `isolate test` applies the project's playwright.config `use` and the reference row keeps the harness's font notes",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const { code, report, err } = await isolateTest("runner-config-app");
    // deno-lint-ignore no-explicit-any
    const rows: any[] = report.testResults ?? [];
    const all = rows.map((r) =>
      `${r.ok ? "ok " : "RED"} ${r.title} ${r.error ?? ""}\n${r.detail ?? ""}`
    ).join("\n") + `\n${report.error ?? ""}\n${err.slice(-1500)}`;
    const use = rows.find((r) =>
      r.title ===
        "REQ-061: the project's playwright.config `use` reaches the case"
    );
    assert(use?.ok, all);
    const ref = rows.find((r) =>
      r.title === "reference: tile/plain"
    );
    assert(ref?.ok, all);
    assertEquals(ref.measured, 0, all);
    const lines: string[] = ref.detail.split("\n");
    assertStringIncludes(lines[0], "measured 0.000 ≤ tolerance 0.010");
    assert(
      lines.includes(
        "fonts: 0 stylesheet(s), 1 inline block(s) from the app · fonts not loaded (local to the app, not served by the workbench): /fonts/brand.css",
      ),
      all,
    );
    assertEquals([report.total, report.failed, code], [2, 0, 0], all);
  },
});

Deno.test({
  name:
    "REQ-061: `isolate test` refuses a component named `base` up front, naming the native element — never a timeout",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const { code, report, err } = await isolateTest("native-name-app");
    assertEquals(
      [code, report.ran, report.total],
      [1, false, 0],
      err.slice(-1500),
    );
    assertEquals(report.problems.length, 1);
    assertEquals(report.problems[0].kind, "component-name");
    assertStringIncludes(
      report.problems[0].path,
      "components/base/template.html",
    );
    assertStringIncludes(
      report.problems[0].detail,
      "<base> is a native HTML element",
    );
  },
});
