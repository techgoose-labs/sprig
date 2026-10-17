// REQ-067 (unit) — build provenance comes from the app's OWN root, never a
// parent project's file. Order: <root>/.infra/git.json → git HEAD of <root>'s
// repo → "unknown". And the app's own root is the app dir itself unless it is
// a package of the enclosing composition (`<root>/ui|app`, or a member of the
// root's deno.json workspace).
import { assertEquals } from "@std/assert";
import { join } from "@std/path";
import { projectRootOf, resolveBuildInfo } from "./cli.ts";

const NOW = () => new Date("2026-09-29T12:00:00.000Z");
const PARENT_STAMP = {
  repo: "https://example.test/parent",
  commit: "219f86e-parent",
  branch: "main",
  buildTime: "2026-07-16T20:31:49.548Z",
};

/** <tmp>/ (a composed parent: workspace lists ./server + ./ui, stamped
 *  .infra/git.json, a legacy `git` block) with <tmp>/fixtures/app (NOT a member)
 *  and <tmp>/ui (a member). */
async function tree(): Promise<{ root: string; app: string; ui: string }> {
  const root = await Deno.makeTempDir({ prefix: "req067-" });
  await Deno.mkdir(join(root, ".infra"));
  await Deno.writeTextFile(
    join(root, ".infra", "git.json"),
    JSON.stringify(PARENT_STAMP),
  );
  await Deno.writeTextFile(
    join(root, "deno.json"),
    JSON.stringify({ workspace: ["./server", "./ui"], git: PARENT_STAMP }),
  );
  const app = join(root, "fixtures", "app");
  const ui = join(root, "ui");
  for (const d of [app, ui]) {
    await Deno.mkdir(d, { recursive: true });
    await Deno.writeTextFile(join(d, "deno.json"), "{}\n");
  }
  return { root, app, ui };
}

Deno.test("REQ-067: the app's own .infra/git.json wins over git and over the parent", async () => {
  const { root, app } = await tree();
  const own = { repo: "r", commit: "c0ffee", branch: "b", buildTime: "t" };
  await Deno.mkdir(join(app, ".infra"));
  await Deno.writeTextFile(
    join(app, ".infra", "git.json"),
    JSON.stringify(own),
  );
  let asked = false;
  const info = await resolveBuildInfo(app, () => {
    asked = true;
    return Promise.resolve({ commit: "x", branch: "y" });
  }, NOW);
  assertEquals(info, own);
  assertEquals(asked, false);
  await Deno.remove(root, { recursive: true });
});

Deno.test("REQ-067: no .infra at the app root → the git HEAD of the app root, never the parent's stamp", async () => {
  const { root, app } = await tree();
  const seen: string[] = [];
  const info = await resolveBuildInfo(app, (dir) => {
    seen.push(dir);
    return Promise.resolve({
      repo: "https://example.test/app",
      commit: "8cc70dc",
      branch: "breakdown-build-hardening",
    });
  }, NOW);
  assertEquals(seen, [app]);
  assertEquals(info, {
    repo: "https://example.test/app",
    commit: "8cc70dc",
    branch: "breakdown-build-hardening",
    buildTime: "2026-09-29T12:00:00.000Z",
  });
  await Deno.remove(root, { recursive: true });
});

Deno.test('REQ-067: no .infra and no git → "unknown", never the parent\'s stamp', async () => {
  const { root, app } = await tree();
  const info = await resolveBuildInfo(app, () => Promise.resolve(null), NOW);
  assertEquals(info, {
    commit: "unknown",
    branch: "unknown",
    buildTime: "2026-09-29T12:00:00.000Z",
  });
  await Deno.remove(root, { recursive: true });
});

Deno.test("REQ-067: an app that is not a package of the enclosing root is its own root", async () => {
  const { root, app, ui } = await tree();
  assertEquals(projectRootOf(app), app); // not a workspace member → its own root
  assertEquals(projectRootOf(ui), root); // a workspace member → the composition root
  await Deno.remove(root, { recursive: true });
});

Deno.test("REQ-067: <root>/ui and <root>/app belong to the root even before the workspace lists them", async () => {
  const root = await Deno.makeTempDir({ prefix: "req067-" });
  await Deno.mkdir(join(root, "server", "bootstrap"), { recursive: true });
  await Deno.writeTextFile(join(root, "server", "bootstrap", "mod.ts"), "");
  for (const name of ["ui", "app"]) {
    await Deno.mkdir(join(root, name));
    assertEquals(projectRootOf(join(root, name)), root);
  }
  await Deno.remove(root, { recursive: true });
});
