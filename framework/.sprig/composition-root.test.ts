// A composed app in a SUBFOLDER of a git repo must build.
//
// `sprig build` anchored serve.ts + the workspace on the nearest `.git`
// ancestor, so an app folded into `<repo>/tools/<app>/{ui,server,deno.json}`
// died on "no keep backend at <repo>/server/bootstrap/mod.ts" — the layout's
// own marker sits in tools/<app>, not at the git root. Found by folding a real
// app's repo into a larger one (diablo_decopilation, 2026-09-09).

import { assertEquals } from "@std/assert";
import { join } from "@std/path";

import {
  compositionRootOf,
  isCompositionRoot,
  ROOT_ENV,
} from "./composition-root.ts";

/** Build a tree under a temp dir: `"a/b/"` → dir, `"a/f.ts"` → file, `"a/deno.json"` → JSON. */
async function withTree(
  entries: Record<string, string | Record<string, unknown> | null>,
  fn: (root: string) => void | Promise<void>,
) {
  const root = await Deno.makeTempDir({ prefix: "composition-root-" });
  try {
    for (const [rel, body] of Object.entries(entries)) {
      const p = join(root, rel);
      if (rel.endsWith("/")) {
        await Deno.mkdir(p, { recursive: true });
        continue;
      }
      await Deno.mkdir(join(p, ".."), { recursive: true });
      await Deno.writeTextFile(
        p,
        typeof body === "string" ? body : JSON.stringify(body),
      );
    }
    await fn(root);
  } finally {
    await Deno.remove(root, { recursive: true });
  }
}

const KEEP = "export const api = await bootstrapServer('x', Mod);\n";

Deno.test("a composed app in a subfolder of a git repo anchors on the subfolder, not the git root", async () => {
  await withTree({
    ".git/": null,
    "tools/assetgen/deno.json": { workspace: ["./ui", "./server"] },
    "tools/assetgen/ui/bootstrap/template.html": "<html></html>",
    "tools/assetgen/server/bootstrap/mod.ts": KEEP,
  }, (repo) => {
    const ui = join(repo, "tools", "assetgen", "ui");
    assertEquals(compositionRootOf(ui, repo), join(repo, "tools", "assetgen"));
    // from inside the UI package, from the app folder, and from inside server/ — same answer
    assertEquals(
      compositionRootOf(join(ui, "src", "pages"), repo),
      join(repo, "tools", "assetgen"),
    );
    assertEquals(
      compositionRootOf(join(repo, "tools", "assetgen"), repo),
      join(repo, "tools", "assetgen"),
    );
    assertEquals(
      compositionRootOf(join(repo, "tools", "assetgen", "server", "src"), repo),
      join(repo, "tools", "assetgen"),
    );
  });
});

Deno.test("a single-app repo still resolves to its git root (nothing moves for existing apps)", async () => {
  await withTree({
    ".git/": null,
    "deno.json": { workspace: ["./ui", "./server"] },
    "ui/bootstrap/template.html": "<html></html>",
    "server/bootstrap/mod.ts": KEEP,
  }, (repo) => {
    assertEquals(compositionRootOf(join(repo, "ui"), repo), repo);
    assertEquals(compositionRootOf(repo, repo), repo);
  });
});

Deno.test("no marker anywhere → null, so the caller falls back to the git walk", async () => {
  await withTree({
    ".git/": null,
    "ui/bootstrap/template.html": "<html></html>",
  }, (repo) => {
    assertEquals(compositionRootOf(join(repo, "ui"), repo), null);
  });
});

Deno.test("never climbs past the git root, even when a marker sits above it", async () => {
  await withTree({
    "server/bootstrap/mod.ts": KEEP, // a composed app ABOVE the repo
    "nested/.git/": null,
    "nested/ui/bootstrap/template.html": "<html></html>",
  }, (outer) => {
    const repo = join(outer, "nested");
    assertEquals(compositionRootOf(join(repo, "ui"), repo), null);
    // …but with NO git root (a deploy tarball) the walk is unbounded and finds it
    assertEquals(compositionRootOf(join(repo, "ui"), null), outer);
  });
});

Deno.test("nearest wins: an app nested inside another composed app resolves to the inner one", async () => {
  await withTree({
    ".git/": null,
    "server/bootstrap/mod.ts": KEEP,
    "ui/bootstrap/template.html": "<html></html>",
    "tools/inner/server/bootstrap/mod.ts": KEEP,
    "tools/inner/ui/bootstrap/template.html": "<html></html>",
  }, (repo) => {
    assertEquals(
      compositionRootOf(join(repo, "tools", "inner", "ui"), repo),
      join(repo, "tools", "inner"),
    );
    assertEquals(compositionRootOf(join(repo, "ui"), repo), repo);
  });
});

Deno.test("either half of the marker is enough: workspace-only (no backend yet) and backend-only", async () => {
  await withTree({
    ".git/": null,
    "a/deno.json": { workspace: ["ui", "server/"] }, // Deno accepts these spellings too
    "a/ui/bootstrap/template.html": "<html></html>",
    "b/server/bootstrap/mod.ts": KEEP, // no deno.json at all
    "b/ui/bootstrap/template.html": "<html></html>",
    "c/deno.json": { workspace: ["./ui"] }, // a workspace, but not a composed one
    "c/ui/bootstrap/template.html": "<html></html>",
  }, (repo) => {
    assertEquals(isCompositionRoot(join(repo, "a")), true);
    assertEquals(isCompositionRoot(join(repo, "b")), true);
    assertEquals(isCompositionRoot(join(repo, "c")), false);
    assertEquals(isCompositionRoot(join(repo, "a", "ui")), false);
    assertEquals(
      compositionRootOf(join(repo, "a", "ui"), repo),
      join(repo, "a"),
    );
    assertEquals(
      compositionRootOf(join(repo, "b", "ui"), repo),
      join(repo, "b"),
    );
    assertEquals(compositionRootOf(join(repo, "c", "ui"), repo), null);
  });
});

Deno.test(`${ROOT_ENV} overrides the walk outright`, async () => {
  await withTree({
    ".git/": null,
    "server/bootstrap/mod.ts": KEEP,
    "ui/bootstrap/template.html": "<html></html>",
    "elsewhere/": null,
  }, (repo) => {
    const prev = Deno.env.get(ROOT_ENV);
    Deno.env.set(ROOT_ENV, join(repo, "elsewhere"));
    try {
      assertEquals(
        compositionRootOf(join(repo, "ui"), repo),
        join(repo, "elsewhere"),
      );
    } finally {
      if (prev === undefined) Deno.env.delete(ROOT_ENV);
      else Deno.env.set(ROOT_ENV, prev);
    }
  });
});
