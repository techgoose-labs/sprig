// REQ-063 (e2e) — the real `isolate test --json` in a real browser against the
// served isolate workbench, on fixtures/isolate/stage-app (an app BELOW the git
// root, its breakdown under its own spec/):
//   stage background  the unit (a transparent heading, as the kennel app's
//     dog-heading) is captured on the app's page colour for the case's _theme —
//     the shell's body `var(--color-base-200)`, light and dark — not the
//     workbench's #f3eee2; `_reference.background` overrides it; the row names
//     the colour it used. The stills are the heading shot on a plain page on
//     base-200 (light/dark) and white (fixtures/isolate/stage-app/spec/stills).
//   paths             every `spec/…` path resolves against the --root app (the
//     row says "app root"), not the git root.
//   _motion trigger   a hover-only transition is captured after the runner
//     hovers the unit's root; the same spec with no trigger is red, naming the
//     trigger it performed (load) and the key that would start it.
// The Playwright runner is whatever this environment resolves (ISOLATE_RUNNER_HOME
// or the XDG cache); the workbench is a private SPRIG_WB_ROOT under the temp dir.
import { assert, assertEquals, assertStringIncludes } from "#std/assert";
import { fromFileUrl, join } from "#std/path";

const REPO = fromFileUrl(new URL("../../../../../", import.meta.url));
const CLI = join(REPO, "cli", "main.ts");
const APP = join(REPO, "fixtures", "isolate", "stage-app");

function freePort(): number {
  const l = Deno.listen({ port: 0, hostname: "127.0.0.1" });
  const port = (l.addr as Deno.NetAddr).port;
  l.close();
  return port;
}

interface Row {
  title: string;
  ok: boolean;
  error?: string;
  detail?: string;
  measured?: number;
}

Deno.test({
  name:
    "REQ-063: the reference stage is the app's page colour for the theme (or the case's explicit one), paths resolve from the --root app, and a hover-only _motion is triggered",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const wb = await Deno.makeTempDir({ prefix: "wb-req063-e2e-" });
    try {
      const p = await new Deno.Command(Deno.execPath(), {
        args: [
          "run",
          "-A",
          "--unstable-kv",
          CLI,
          "test",
          "--root",
          APP,
          "--json",
          "--port",
          String(freePort()),
        ],
        cwd: REPO,
        env: { ...Deno.env.toObject(), NO_COLOR: "1", SPRIG_WB_ROOT: wb },
        stdout: "piped",
        stderr: "piped",
      }).output();
      const err = new TextDecoder().decode(p.stderr);
      const report = JSON.parse(new TextDecoder().decode(p.stdout));
      const rows: Row[] = report.testResults ?? [];
      const all = rows.map((r) =>
        `${r.ok ? "ok " : "RED"} ${r.title} ${r.measured ?? ""} ${
          r.error ?? ""
        }`
      ).join("\n");
      const row = (t: string) => {
        const r = rows.find((r) => r.title === t);
        assert(
          r,
          `no row "${t}":\n${all}\n${report.error ?? ""}\n${
            JSON.stringify(report.problems ?? [])
          }\n${err.slice(-2000)}`,
        );
        return r;
      };

      // 1. the stage behind the transparent heading is the theme's page colour
      const light = row("reference: title-row/default");
      assertEquals([light.ok, light.measured], [true, 0], all);
      assertStringIncludes(
        light.detail!,
        "stage background rgb(243, 234, 219) — the app's page background (src/shell/styles.css body) under theme brand",
      );
      const dark = row("reference: title-row/dark");
      assertEquals([dark.ok, dark.measured], [true, 0], all);
      assertStringIncludes(
        dark.detail!,
        "stage background rgb(41, 32, 26) — the app's page background (src/shell/styles.css body) under theme brand-dark",
      );
      const white = row("reference: title-row/white");
      assertEquals([white.ok, white.measured], [true, 0], all);
      assertStringIncludes(
        white.detail!,
        "stage background rgb(255, 255, 255) — the case's _reference.background",
      );
      // REQ-068: the stage also takes the shell body's text colour, resolved
      // under the case's theme, and the row lists it
      assertStringIncludes(
        light.detail!,
        "stage text color rgb(59, 42, 30) — the app's page text (src/shell/styles.css body) under theme brand",
      );
      // 2. `spec/…` paths resolved against the --root app
      assertStringIncludes(
        light.detail!,
        "(reference resolved from the app root)",
      );

      // 3. hover-only motion: triggered → green; untriggered → red, says why
      const hover = row("motion: lift-card/hover");
      assert(hover.ok, all);
      assertStringIncludes(hover.detail!, "after trigger hover");
      assertStringIncludes(hover.detail!, "motion trigger: hover on div.lift");
      assertStringIncludes(hover.detail!, "(resolved from the app root)");
      const bare = row("motion: lift-card/no-trigger");
      assertEquals(bare.ok, false, all);
      assertStringIncludes(bare.detail!, "after trigger load");
      assertStringIncludes(
        bare.error!,
        "box-shadow on div.lift: missing — the rendered case has no such animation",
      );
      assertStringIncludes(
        bare.error!,
        `"trigger": "hover" | "focus" | "click"`,
      );

      assertEquals(
        [report.total, report.passed, report.failed, p.code],
        [5, 4, 1, 1],
        all,
      );
    } finally {
      await Deno.remove(wb, { recursive: true });
    }
  },
});
