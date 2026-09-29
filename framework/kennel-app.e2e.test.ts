// REQ-062 (e2e) — the kennel fixture (fixtures/kennel-app: 24 units, 3 pages, built
// end to end by the pipeline against a contract derived from its prototype's two
// seams) stays green under every check the build skill gates on. Each test spawns
// the worktree CLI against the fixture with `cwd` set (never Deno.chdir) and reads
// its real output; the isolate run's preview server is the CLI's own.
import { assert, assertEquals, assertMatch } from "@std/assert";
import { dirname, fromFileUrl, join } from "@std/path";

const REPO = dirname(dirname(fromFileUrl(import.meta.url)));
const CLI = join(REPO, "framework", "cli.ts");
const CONFIG = join(REPO, "deno.json");
const APP = "fixtures/kennel-app";

async function sprig(args: string[], env: Record<string, string> = {}) {
  const out = await new Deno.Command(Deno.execPath(), {
    args: ["run", "-A", "--config", CONFIG, CLI, ...args],
    cwd: REPO,
    env: { NO_COLOR: "1", ...env },
    stdout: "piped",
    stderr: "piped",
  }).output();
  const dec = new TextDecoder();
  const stdout = dec.decode(out.stdout);
  return { code: out.code, stdout, text: stdout + dec.decode(out.stderr) };
}

// REQ-068: no --root — the app root (it holds deno.json and its own spec/contract)
// is where the lints look first, before the git root.
let checkRun: ReturnType<typeof sprig> | undefined;
const check = () => checkRun ??= sprig(["check", APP]);

Deno.test("REQ-062: sprig check is green on the kennel fixture", async () => {
  const r = await check();
  assertEquals(r.code, 0, r.text.slice(-4000));
  assertMatch(r.text, /sprig check: green —/);
});

Deno.test("REQ-062: the kennel fixture's contract-calls lint runs, not skips", async () => {
  const r = await check();
  const line = r.text.split("\n").find((l) => l.startsWith("contract-calls:"));
  assert(line, `no contract-calls line:\n${r.text.slice(-4000)}`);
  const m = /^contract-calls: checked (\d+) file\(s\) — 0 error\(s\)/.exec(
    line,
  );
  assert(
    m && Number(m[1]) > 0,
    `contract-calls did not check files cleanly: ${line}`,
  );
  assert(!line.includes("skipped"), line);
  assert(
    !r.text.includes("write-method: no "),
    "the write-method rule was skipped",
  );
  // REQ-068: found at the app root without --root, and the line says so
  assert(
    line.endsWith(
      `contract: ${join(REPO, APP, "spec", "contract")} (app root)`,
    ),
    line,
  );
});

let specRun: ReturnType<typeof sprig> | undefined;
const specCheck = () =>
  specRun ??= sprig([
    "spec-check",
    `${APP}/spec/ui/breakdown`,
    "--ui-src",
    `${APP}/src`,
    "--app",
    APP,
  ]);

Deno.test("REQ-062: sprig spec-check is green on the kennel fixture", async () => {
  const r = await specCheck();
  assertEquals(r.code, 0, r.text.slice(-4000));
  assertMatch(r.text, /spec-check: ok —/);
});

Deno.test("REQ-062 / REQ-068: spec-check binds the kennel breakdown to the app's own contract — binding-drift runs, 7 of 7 checks", async () => {
  const r = await specCheck();
  assertEquals(r.code, 0, r.text.slice(-4000));
  assertMatch(r.text, /spec-check binding-drift: ok \(\d+ items\)/);
  assertMatch(r.text, /spec-check: ok — 7 of 7 checks ran, 0 skipped/);
  assert(r.text.includes("contract: the app root's"), r.text.slice(-4000));
});

Deno.test("REQ-062: sprig map --compose is green on the kennel fixture", async () => {
  const r = await sprig(["map", APP, "--compose"]);
  assertEquals(r.code, 0, r.text.slice(-4000));
  assertMatch(r.stdout, /dog-detail\/dog-actions ← composed by: dog-detail/);
});

Deno.test({
  name: "REQ-062: sprig isolate test is green on the kennel fixture",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const wb = await Deno.makeTempDir({ prefix: "wb-kennel-e2e-" });
    try {
      const r = await sprig(
        ["isolate", "test", "--json", "--root", APP],
        { SPRIG_WB_ROOT: wb },
      );
      const report = JSON.parse(r.stdout) as {
        passed: number;
        failed: number;
        testResults: { ok: boolean; title: string; error?: string }[];
      };
      const reds = report.testResults.filter((t) => !t.ok)
        .map((t) => `${t.title}: ${t.error ?? ""}`.slice(0, 300)).join("\n");
      assertEquals(report.failed, 0, reds);
      assert(report.passed > 0, "nothing was checked");
      assertEquals(r.code, 0, r.text.slice(-3000));
    } finally {
      await Deno.remove(wb, { recursive: true }).catch(() => {});
    }
  },
});
