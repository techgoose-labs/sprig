// REQ-020 (e2e) — a scaffolded app's OWN build task, in the environment a
// deploy runs it in: a clean checkout with no `sprig` launcher on PATH.
//
// The reporter shipped for a month on a stale revision because every build
// ended at `Task build  sprig build --ui-only ui` → "sprig: command not found",
// exit 127, while `deno deploy` reported success (coms 20260921T190104Z-w5-80834).
// REQ-016 fixed the documented command; a generated-root app gets the same head
// from `sprig init` itself, so the state below is what a new app deploys with.
import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { dirname, fromFileUrl, join } from "@std/path";

const REPO = dirname(dirname(fromFileUrl(import.meta.url)));
const CLI = join(REPO, "framework", "cli.ts");
const CONFIG = join(REPO, "deno.json");

async function sprig(cwd: string, home: string, ...args: string[]) {
  const { code, stdout, stderr } = await new Deno.Command(Deno.execPath(), {
    args: ["run", "-A", "--config", CONFIG, CLI, ...args],
    cwd,
    env: { ...Deno.env.toObject(), SPRIG_HOME: home, NO_COLOR: "1" },
  }).output();
  return {
    code,
    out: new TextDecoder().decode(stdout) + new TextDecoder().decode(stderr),
  };
}

/** `deno task <task>` as a hosted build runs it: no TTY, and a PATH carrying
 *  `deno` but no `sprig` launcher (REQ-016's harness — on a developer's machine
 *  the two share one bin dir, so the symlink has to be in a private one). */
async function hostedTask(root: string, task: string) {
  const bin = await Deno.makeTempDir({ prefix: "req020-bin-" });
  await Deno.symlink(Deno.execPath(), join(bin, "deno"));
  try {
    const { code, stdout, stderr } = await new Deno.Command(Deno.execPath(), {
      args: ["task", task],
      cwd: root,
      env: { PATH: `${bin}:/usr/bin:/bin`, NO_COLOR: "1", HOME: root },
      clearEnv: true,
      stdin: "null",
      stdout: "piped",
      stderr: "piped",
    }).output();
    return {
      code,
      out: new TextDecoder().decode(stdout) + new TextDecoder().decode(stderr),
    };
  } finally {
    await Deno.remove(bin, { recursive: true });
  }
}

Deno.test({
  name:
    "REQ-020 (e2e): a scaffolded app's own `deno task build` survives a hosted build — the bare head it used to carry exits 127 in the same clean checkout",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const base = await Deno.makeTempDir({ prefix: "req020-e2e-" });
    const home = await Deno.makeTempDir({ prefix: "req020-e2ehome-" });
    const root = join(base, "app");
    const cfgPath = join(root, "deno.json");
    try {
      for (const p of ["/usr/bin/sprig", "/bin/sprig"]) {
        assertEquals(
          await Deno.stat(p).then(() => true).catch(() => false),
          false,
          `${p} exists — this machine cannot stand in for a clean checkout`,
        );
      }
      const init = await sprig(base, home, "init", "app");
      assertEquals(init.code, 0, `sprig init:\n${init.out}`);

      const scaffolded = JSON.parse(await Deno.readTextFile(cfgPath));
      const write = (cfg: unknown) =>
        Deno.writeTextFile(cfgPath, JSON.stringify(cfg, null, 2) + "\n");

      // 1. the head the scaffold used to write, run the way the deploy ran it
      const before = structuredClone(scaffolded);
      before.tasks.build = "sprig build";
      await write(before);
      const bare = await hostedTask(root, "build");
      assertEquals(bare.code, 127, `expected exit 127:\n${bare.out}`);
      assertStringIncludes(bare.out, "sprig: command not found");

      // 2. what `sprig init` writes now. The /cli entry points at this checkout
      //    rather than its jsr pin — the pin would need the registry; that the
      //    scaffold writes the pin, in lockstep, is the integration test.
      const now = structuredClone(scaffolded);
      now.imports["@techgoose-labs/sprig/cli"] = CLI;
      await write(now);
      const hosted = await hostedTask(root, "build");
      assertEquals(hosted.code, 0, `the hosted build failed:\n${hosted.out}`);
      assertStringIncludes(hosted.out, "island chunk(s)");

      const assets = [...Deno.readDirSync(join(root, "ui", "static"))];
      assert(assets.length > 0, "the hosted build wrote no client bundle");
      assert(
        (await Deno.readTextFile(join(root, "serve.ts"))).includes("Bedrock("),
        "the composed build wrote no composition root",
      );
    } finally {
      await Deno.remove(base, { recursive: true });
      await Deno.remove(home, { recursive: true });
    }
  },
});
