// REQ-015 (e2e) — the reporter's own experiment on this CLI: a real `sprig init`
// scaffold, one comment added above "tasks" and the sprig pin set stale, then
// `sprig build --ui-only ui`. Before: exit 0, comment survives, pin stays stale,
// NOTHING printed. After: the same, plus one line on stderr saying so.
//
// coms 20260921T205912Z-w5-115272: "a repo that annotates its deno.json never
// gets re-pinned and is never told. One line on stderr when the stamp declines
// would close it."
import { assertEquals, assertStringIncludes } from "@std/assert";
import { dirname, fromFileUrl, join } from "@std/path";

const REPO = dirname(dirname(fromFileUrl(import.meta.url)));
const CLI = join(REPO, "framework", "cli.ts");
const CLI_V = JSON.parse(Deno.readTextFileSync(join(REPO, "deno.json")))
  .version as string;

async function cli(cwd: string, home: string, ...args: string[]) {
  const { code, stdout, stderr } = await new Deno.Command(Deno.execPath(), {
    args: ["run", "-A", CLI, ...args],
    cwd,
    env: { ...Deno.env.toObject(), SPRIG_HOME: home, NO_COLOR: "1" },
  }).output();
  return {
    code,
    out: new TextDecoder().decode(stdout),
    err: new TextDecoder().decode(stderr),
  };
}

Deno.test("REQ-015 (e2e): on a real scaffold, a commented deno.json with a stale pin builds, keeps its comment, and is told the pin was left unstamped", async () => {
  const home = await Deno.makeTempDir({ prefix: "req015-home-" });
  const base = await Deno.makeTempDir({ prefix: "req015-e2e-" });
  const root = join(base, "app");
  try {
    const init = await cli(base, home, "init", "app");
    assertEquals(init.code, 0, init.err);
    const denoJsonPath = join(root, "deno.json");
    // the reporter's file: one comment above "tasks", the pin one release behind
    const commented = (await Deno.readTextFile(denoJsonPath))
      .replace(
        `  "tasks": {`,
        `  // REQ-010: \`build\` is --ui-only on purpose. Do not "simplify" this.\n  "tasks": {`,
      )
      .replace(
        /jsr:@techgoose-labs\/sprig@[^"/]+/g,
        "jsr:@techgoose-labs/sprig@2.1.1",
      );
    assertStringIncludes(commented, "// REQ-010");
    await Deno.writeTextFile(denoJsonPath, commented);

    const built = await cli(root, home, "build", "--ui-only", "ui");
    assertEquals(
      built.code,
      0,
      `the build itself still succeeds:\n${built.err}`,
    );
    assertEquals(
      await Deno.readTextFile(denoJsonPath),
      commented,
      "the comment did not survive, or the pin moved",
    );
    assertStringIncludes(
      built.err,
      "left unstamped",
      `the stamp declined silently:\n${built.out}\n${built.err}`,
    );
    assertStringIncludes(built.err, "2.1.1");
    assertStringIncludes(built.err, CLI_V);

    // …and with the comment gone, the identical file is stamped as before.
    await Deno.writeTextFile(
      denoJsonPath,
      commented.replace(/^\s*\/\/ REQ-010.*\n/m, ""),
    );
    const again = await cli(root, home, "build", "--ui-only", "ui");
    assertEquals(again.code, 0, again.err);
    assertStringIncludes(
      again.out,
      `sprig: stamped @techgoose-labs/sprig → ${CLI_V}`,
    );
    assertEquals(again.err.includes("left unstamped"), false);
  } finally {
    await Deno.remove(base, { recursive: true });
    await Deno.remove(home, { recursive: true });
  }
});
