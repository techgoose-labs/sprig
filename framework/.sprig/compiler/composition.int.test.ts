// REQ-024 / REQ-025 / REQ-026 — end to end through the real CLI: `sprig build --ui-only`
// on a small fixture app refuses an unknown tag and an undeclared shadow (exit 1, each
// offender named file:line), prints the opt-in and custom-element lines when the app is
// clean, and the composition graph of the built app is what the templates compose.
import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { fromFileUrl, join } from "@std/path";
import { copy } from "@std/fs/copy";
import { compositionGraph, renderCompositionMap } from "./composition.ts";

const FIXTURE = fromFileUrl(
  new URL("./fixtures/composition-app", import.meta.url),
);
const CLI = fromFileUrl(new URL("../../cli.ts", import.meta.url));

async function fixtureCopy(): Promise<string> {
  const tmp = await Deno.makeTempDir({ prefix: "sprig-composition-int-" });
  await copy(FIXTURE, tmp, { overwrite: true });
  return tmp;
}

async function build(app: string): Promise<{ code: number; out: string }> {
  const r = await new Deno.Command(Deno.execPath(), {
    args: ["run", "-A", CLI, "build", "--ui-only", app],
    stdout: "piped",
    stderr: "piped",
  }).output();
  const dec = new TextDecoder();
  return { code: r.code, out: dec.decode(r.stdout) + dec.decode(r.stderr) };
}

async function edit(path: string, fn: (s: string) => string): Promise<void> {
  await Deno.writeTextFile(path, fn(await Deno.readTextFile(path)));
}

Deno.test("REQ-024: sprig build fails on an unknown tag, naming file:line, the tag and the nearest selector", async () => {
  const app = await fixtureCopy();
  try {
    await edit(
      join(app, "src/pages/dashboard/template.html"),
      (s) =>
        s.replace("<stat-card", "<stat-crd").replace(
          "</stat-card>",
          "</stat-crd>",
        ),
    );
    const r = await build(app);
    assertEquals(r.code, 1, r.out);
    assertStringIncludes(
      r.out,
      `src/pages/dashboard/template.html:2 error: unknown tag <stat-crd> — not an HTML/SVG element and no component named "stat-crd" in page "dashboard" + the shared scope; did you mean <stat-card>?`,
    );
  } finally {
    await Deno.remove(app, { recursive: true });
  }
});

Deno.test("REQ-025: sprig build refuses an undeclared shadow, naming both folders", async () => {
  const app = await fixtureCopy();
  try {
    await edit(
      join(app, "src/pages/dashboard/components/card/template.html"),
      (s) => s.replace(/^<!--[^\n]*\n/, ""),
    );
    const r = await build(app);
    assertEquals(r.code, 1, r.out);
    assertStringIncludes(
      r.out,
      `page-local <card> (src/pages/dashboard/components/card) shadows the shared component <card> (src/shared/card) on page "dashboard"`,
    );
  } finally {
    await Deno.remove(app, { recursive: true });
  }
});

Deno.test("REQ-024/025/026: a clean app builds, prints the opt-in and allow lines, and its graph is what the templates compose", async () => {
  const app = await fixtureCopy();
  try {
    const r = await build(app);
    assertEquals(r.code, 0, r.out);
    assertStringIncludes(
      r.out,
      "sprig build: allowing <x-foo> (custom-elements)",
    );
    assertStringIncludes(
      r.out,
      "sprig build: dashboard/card shadows shared card: the dashboard card is a dense KPI tile, not the shared panel",
    );
    assertStringIncludes(r.out, "every tag resolves, no undeclared shadowing.");
    assert((await Deno.stat(join(app, "static", "client.js"))).isFile);
    const g = await compositionGraph(app);
    assertEquals(g.components["confirm-dialog"].composedBy, [
      "dashboard",
      "settings",
    ]);
    assertStringIncludes(
      renderCompositionMap(g),
      "page dashboard → composes: confirm-dialog, dashboard/card, dashboard/stat-card, sparkline",
    );
  } finally {
    await Deno.remove(app, { recursive: true });
  }
});
