// REQ-024 AMENDMENT — the workbench app builds through the same composition check as the
// project, so it must carry the project's third-party custom-element allowlist the way it
// carries the design tokens: copied in when the project has one, cleared when it has none.
import { assertEquals } from "#std/assert";
import { join } from "#std/path";
import { exists } from "#std/fs";
import { copyDeps, generatePreviews } from "./generate-previews.ts";

Deno.test("REQ-024 AMENDMENT: generatePreviews copies src/custom-elements.json into the workbench app, and clears a stale one", async () => {
  const root = await Deno.makeTempDir({ prefix: "sprig-previews-" });
  const projectSrc = join(root, "project", "src");
  const appSrc = join(root, "wb", "src");
  try {
    await Deno.mkdir(projectSrc, { recursive: true });
    await Deno.mkdir(appSrc, { recursive: true });
    await Deno.writeTextFile(
      join(projectSrc, "custom-elements.json"),
      `["x-foo"]\n`,
    );
    await generatePreviews([], appSrc, projectSrc);
    assertEquals(
      await Deno.readTextFile(join(appSrc, "custom-elements.json")),
      `["x-foo"]\n`,
    );
    await Deno.remove(join(projectSrc, "custom-elements.json"));
    await generatePreviews([], appSrc, projectSrc);
    assertEquals(await exists(join(appSrc, "custom-elements.json")), false);
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("REQ-024 AMENDMENT 2: copyDeps copies a hyphen-less dependency (<sparkline>) and skips native tags", async () => {
  const root = await Deno.makeTempDir({ prefix: "sprig-previews-deps-" });
  const projectSrc = join(root, "project", "src");
  const targets = join(root, "wb", "targets");
  try {
    const card = join(projectSrc, "shared", "stat-card");
    await Deno.mkdir(card, { recursive: true });
    await Deno.writeTextFile(
      join(card, "template.html"),
      `<div><sparkline></sparkline><p>x</p></div>`,
    );
    const spark = join(projectSrc, "shared", "sparkline");
    await Deno.mkdir(spark, { recursive: true });
    await Deno.writeTextFile(join(spark, "template.html"), `<svg></svg>`);
    const done = new Set<string>();
    await copyDeps(card, projectSrc, targets, done);
    assertEquals(
      await Deno.readTextFile(join(targets, "sparkline", "template.html")),
      `<svg></svg>`,
    );
    assertEquals([...done], ["sparkline"]);
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});
