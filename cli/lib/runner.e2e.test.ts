// REQ-007 (e2e) — the REAL `isolate test` CLI, in the reporter's situation: HOME
// is not writable (a box's Landlock allow-list) but XDG_CACHE_HOME is. Before
// this requirement the run died on an uncaught EACCES from
// `mkdir $HOME/.isolate-runner`. Now the runner dir is carved under
// XDG_CACHE_HOME, nothing is attempted under $HOME, and the one failure the stub
// npm leaves behind (no @playwright/test) is reported naming THAT dir.
import { assert, assertEquals, assertStringIncludes } from "#std/assert";
import { fromFileUrl, join } from "#std/path";

const CLI = fromFileUrl(new URL("../main.ts", import.meta.url));
const REPO = fromFileUrl(new URL("../../", import.meta.url));

// A stub npm whose installs fail: ensureRunner then stops the CLI right after
// provisioning with the "runner unavailable" report — the seam under test —
// instead of going on to spawn a preview server.
const STUB_NPM = `#!/bin/sh
case "$1" in
  init) printf '{"name":"stub"}\\n' > package.json ;;
  *) exit 1 ;;
esac
`;

async function exists(p: string): Promise<boolean> {
  try {
    await Deno.stat(p);
    return true;
  } catch {
    return false;
  }
}

/** The smallest project `isolate` discovers a test in: one folder-component
 *  with an isolate/ case that has a spec file. */
async function minimalProject(root: string): Promise<void> {
  const unit = join(root, "src", "components", "btn");
  const tests = join(unit, "isolate", "cases", "default", "tests");
  await Deno.mkdir(tests, { recursive: true });
  await Deno.writeTextFile(join(unit, "template.html"), "<button>x</button>\n");
  await Deno.writeTextFile(
    join(unit, "isolate", "cases", "default", "default.json"),
    "{}\n",
  );
  await Deno.writeTextFile(
    join(tests, "a.spec.ts"),
    `import { test } from "@playwright/test";\ntest("x", () => {});\n`,
  );
}

async function denoDir(): Promise<string> {
  const out = await new Deno.Command(Deno.execPath(), {
    args: ["info", "--json"],
    stdout: "piped",
    stderr: "null",
  }).output();
  return JSON.parse(new TextDecoder().decode(out.stdout)).denoDir;
}

Deno.test({
  name:
    "REQ-007: `isolate test` with a read-only HOME + XDG_CACHE_HOME carves the runner under XDG and never touches $HOME",
  ignore: Deno.uid() === 0, // chmod can't lock root out
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const root = await Deno.makeTempDir({ prefix: "isolate-runner-e2e-" });
    const home = join(root, "home");
    const cache = join(root, "cache");
    const bin = join(root, "bin");
    const project = join(root, "project");
    for (const d of [home, cache, bin, project]) await Deno.mkdir(d);
    await Deno.writeTextFile(join(bin, "npm"), STUB_NPM, { mode: 0o755 });
    // pin the version probe too: deterministic, and no system playwright needed
    await Deno.writeTextFile(
      join(bin, "playwright"),
      `#!/bin/sh\necho "Version 1.0.0"\n`,
      { mode: 0o755 },
    );
    await minimalProject(project);
    await Deno.chmod(home, 0o555);
    try {
      const env: Record<string, string> = {
        ...Deno.env.toObject(),
        HOME: home,
        XDG_CACHE_HOME: cache,
        PATH: `${bin}:${Deno.env.get("PATH") ?? ""}`,
        DENO_DIR: await denoDir(), // keep Deno's own cache where it is
        NO_COLOR: "1",
      };
      delete env.USERPROFILE;
      delete env.ISOLATE_RUNNER_HOME;
      const p = await new Deno.Command(Deno.execPath(), {
        args: ["run", "-A", CLI, "test", "--root", project, "--json"],
        cwd: REPO,
        env,
        stdout: "piped",
        stderr: "piped",
      }).output();
      const out = new TextDecoder().decode(p.stdout);
      const err = new TextDecoder().decode(p.stderr);
      const all = out + err;
      const dir = join(cache, "sprig", "isolate-runner");

      // 1. no EACCES anywhere — the reported crash
      assert(
        !/PermissionDenied|EACCES/.test(all),
        `permission error surfaced:\n${all}`,
      );
      // 2. the runner dir was carved under XDG_CACHE_HOME (the stub's `npm init` landed there)
      assert(
        await exists(join(dir, "package.json")),
        `no runner dir at ${dir}:\n${all}`,
      );
      // 3. and nothing was attempted under $HOME
      assert(!(await exists(join(home, ".isolate-runner"))));
      // 4. the one remaining failure (no @playwright/test) is a clean report naming THAT dir
      assertEquals(p.code, 1, `exit ${p.code}\n${all}`);
      const report = JSON.parse(out);
      assertEquals(report.ok, false);
      assertStringIncludes(report.error, dir);
      assert(!report.error.includes("~/.isolate-runner"), report.error);
    } finally {
      await Deno.chmod(home, 0o755).catch(() => {});
      await Deno.remove(root, { recursive: true });
    }
  },
});
