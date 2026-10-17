// REQ-039 (integration) — the real `isolate test` CLI on a project whose case
// carries an unknown `_` key: it stops before provisioning anything or starting a
// server, exit 1, and the problem names the key and the case file — in --json and
// in the human report.
import { assert, assertEquals, assertStringIncludes } from "#std/assert";
import { fromFileUrl, join } from "#std/path";

const CLI = fromFileUrl(new URL("../main.ts", import.meta.url));
const REPO = fromFileUrl(new URL("../../", import.meta.url));

async function badProject(): Promise<string> {
  const root = await Deno.makeTempDir({ prefix: "w3-cli-int-" });
  const c = join(root, "src", "components", "btn", "isolate", "cases", "big");
  await Deno.mkdir(join(c, "tests"), { recursive: true });
  await Deno.writeTextFile(
    join(root, "src", "components", "btn", "template.html"),
    "<button>x</button>",
  );
  await Deno.writeTextFile(
    join(c, "big.json"),
    JSON.stringify({ _viewprt: 375 }),
  );
  await Deno.writeTextFile(
    join(c, "tests", "a.spec.ts"),
    `import { test } from "@playwright/test";\ntest("x", () => {});\n`,
  );
  return root;
}

async function run(root: string, json: boolean) {
  const p = await new Deno.Command(Deno.execPath(), {
    args: [
      "run",
      "-A",
      "--unstable-kv",
      CLI,
      "test",
      "--root",
      root,
      ...(json ? ["--json"] : []),
    ],
    cwd: REPO,
    // a runner home that doesn't exist: reaching the provisioning step would show
    env: {
      ...Deno.env.toObject(),
      NO_COLOR: "1",
      ISOLATE_RUNNER_HOME: join(root, "no-runner"),
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
    "REQ-039: `isolate test` refuses a case with an unknown `_` key, naming the key and the file",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const root = await badProject();
    try {
      const j = await run(root, true);
      assertEquals(j.code, 1, j.err);
      const report = JSON.parse(j.out);
      assertEquals(report.ran, false);
      assertEquals(report.problems.length, 1);
      assertEquals(report.problems[0].kind, "case-key");
      assertStringIncludes(report.problems[0].detail, `"_viewprt"`);
      assertStringIncludes(report.problems[0].detail, "cases/big/big.json");

      const h = await run(root, false);
      assertEquals(h.code, 1);
      assertStringIncludes(h.err, "invalid case key");
      assertStringIncludes(h.err, `"_viewprt"`);
      // it stopped before the runner: nothing was provisioned
      let provisioned = true;
      try {
        await Deno.stat(join(root, "no-runner"));
      } catch {
        provisioned = false;
      }
      assert(!provisioned, "the runner was provisioned for a broken config");
    } finally {
      await Deno.remove(root, { recursive: true });
    }
  },
});
