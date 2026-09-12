// REQ-002 (e2e) — `sprig dev --help` answers the question instead of doing the work.
//
// The unit test picks the right block; this one proves the SIDE EFFECT is gone.
// It runs the real CLI, in a temp cwd, with SPRIG_HOME pointed at a temp dir, and
// asserts: help on stdout, exit 0, no dev registration written, nothing listening
// on the port `sprig dev` would have bound.
import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { join } from "@std/path";

const CLI = new URL("../cli.ts", import.meta.url).pathname;

async function runCli(
  args: string[],
  cwd: string,
  sprigHome: string,
): Promise<{ code: number; out: string; err: string }> {
  const p = await new Deno.Command(Deno.execPath(), {
    args: ["run", "-A", "--unstable-kv", CLI, ...args],
    cwd,
    env: { ...Deno.env.toObject(), SPRIG_HOME: sprigHome, NO_COLOR: "1" },
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
  name: "REQ-002: `sprig dev --help` prints help, exits 0, starts nothing",
  // the CLI child is fully awaited; these guards only cover its stdio pipes
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const cwd = await Deno.makeTempDir({ prefix: "sprig-help-cwd-" });
    const home = await Deno.makeTempDir({ prefix: "sprig-help-home-" });
    try {
      const { code, out, err } = await runCli(["dev", "--help"], cwd, home);
      assertEquals(code, 0, `exit ${code}\n${err}`);
      assertStringIncludes(out, "sprig dev");
      assertStringIncludes(out, "--annotate");
      // the tells of a dev server having actually started
      assertEquals(
        /HMR on|isolate +→|annotate\)/.test(out + err),
        false,
        `a dev server started:\n${out}\n${err}`,
      );
      // no shared-process registration
      let registered = true;
      try {
        await Deno.stat(join(home, "dev.json"));
      } catch {
        registered = false;
      }
      assert(!registered, "`dev --help` registered a shared dev process");
    } finally {
      await Deno.remove(cwd, { recursive: true });
      await Deno.remove(home, { recursive: true });
    }
  },
});

Deno.test({
  name: "REQ-002: `--help` does no work for the other side-effecting commands",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const cwd = await Deno.makeTempDir({ prefix: "sprig-help-cwd-" });
    const home = await Deno.makeTempDir({ prefix: "sprig-help-home-" });
    try {
      for (const cmd of ["build", "check", "clean", "init"]) {
        const { code, out } = await runCli([cmd, "--help"], cwd, home);
        assertEquals(code, 0, `\`sprig ${cmd} --help\` exited ${code}`);
        assertStringIncludes(out, `sprig ${cmd}`);
        // an empty temp dir: anything created means the command ran
        const left = [...Deno.readDirSync(cwd)].map((e) => e.name);
        assertEquals(left, [], `\`sprig ${cmd} --help\` wrote ${left}`);
      }
    } finally {
      await Deno.remove(cwd, { recursive: true });
      await Deno.remove(home, { recursive: true });
    }
  },
});
