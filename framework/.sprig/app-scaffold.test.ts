// REQ-020 (unit) — what a scaffolded app is BORN with: a build task a hosted
// builder can run, and the import-map entry that task resolves through.
//
// A deploy's build step is a clean checkout with no `sprig` launcher on PATH, so
// a bare `sprig …` task ends at "sprig: command not found", exit 127 — and a
// scripted `deno deploy` still reports success (coms 20260921T190104Z-w5-80834).
// REQ-016 gave that its documented fix; this pins the fix into the scaffold, so
// a generated-root app does not have to be hand-edited to be deployable.
import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { dirname, fromFileUrl, join } from "@std/path";
import { ROOT_TASKS, rootImports, SPRIG_CLI } from "./app-scaffold.ts";

Deno.test("REQ-020 (unit): the scaffolded build task runs the CLI through the import map, and dev stays the local launcher", () => {
  const build = ROOT_TASKS.build;
  assertEquals(
    build.split(/\s+/)[0],
    "deno",
    `the build task's head must be \`deno\`, never a bare launcher: ${build}`,
  );
  assertStringIncludes(build, SPRIG_CLI);
  assert(
    !/(^|\s)sprig\s/.test(build),
    `a bare \`sprig\` head is what exits 127 in a clean checkout: ${build}`,
  );
  assertEquals(build, `deno run -A ${SPRIG_CLI} build`);

  // `dev` is the one task that CANNOT take the hosted head: it needs the
  // on-disk workbench `sprig install` writes, it only ever runs on a developer's
  // machine — and it is the local run that re-pins every sprig entry (stamp()
  // returns early on a jsr run, REQ-016 AMENDMENT), so the scaffolded pins keep
  // moving even though the build task no longer goes through the launcher.
  assertEquals(ROOT_TASKS.dev, "sprig dev");
});

Deno.test("REQ-020 (unit): a /cli mapping the app already declares is never replaced, local override included", () => {
  const fresh = rootImports({}, "2.1.3");
  assertEquals(fresh[SPRIG_CLI], "jsr:@techgoose-labs/sprig@2.1.3/cli");
  // one version across the three sprig entries — the lockstep REQ-017 stamps
  const versions = new Set(
    Object.entries(fresh)
      .filter(([k]) => k.startsWith("@techgoose-labs/sprig"))
      .map(([, v]) => v.match(/@techgoose-labs\/sprig@([^/]+)/)?.[1]),
  );
  assertEquals(versions, new Set(["2.1.3"]));

  const override = rootImports(
    { [SPRIG_CLI]: "../sprig/framework/cli.ts" },
    "2.1.3",
  );
  assertEquals(override[SPRIG_CLI], "../sprig/framework/cli.ts");
});

Deno.test("REQ-020 (docs): §3a's generated row names the hosted head a scaffolded app is born with", async () => {
  const repo = dirname(dirname(dirname(fromFileUrl(import.meta.url))));
  const md = await Deno.readTextFile(
    join(repo, "docs", "sprig", "migrating-1x-to-2x.md"),
  );
  const row = md.split("\n").find((l) => l.trimStart().startsWith("| generated"));
  assert(row, "§3a's table has no `generated` row");
  assertStringIncludes(row, `deno run -A ${SPRIG_CLI} build`);
  // prose unwrapped, so the sentence can be asserted whole across a line break
  assertStringIncludes(
    md.replace(/\s+/g, " "),
    "`sprig init` writes that task",
  );
});
