// REQ-012 (e2e) — a REAL scaffolded app, the real CLI, the real build: an app
// that takes over the `ui:` slot of its generated root still has it after
// `sprig build --rune`.
//
// `sprig init` scaffolds ui/ + server/ and writes the composition root through
// the same `writeRuneServe` the build uses, so this drives the whole path an app
// actually walks: scaffold → swap in your own unit → build → look at the root.
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@^1";
import { dirname, fromFileUrl, join } from "@std/path";

const REPO = dirname(dirname(fromFileUrl(import.meta.url)));
const CLI = join(REPO, "framework", "cli.ts");
const CONFIG = join(REPO, "deno.json");

async function sprig(cwd: string, sprigHome: string, ...args: string[]) {
  const { code, stdout, stderr } = await new Deno.Command(Deno.execPath(), {
    args: ["run", "-A", "--config", CONFIG, CLI, ...args],
    cwd,
    env: { ...Deno.env.toObject(), SPRIG_HOME: sprigHome, NO_COLOR: "1" },
  }).output();
  const out = new TextDecoder().decode(stdout) +
    new TextDecoder().decode(stderr);
  return { code, out };
}

Deno.test({
  name: "REQ-012 (e2e): a real `sprig build --rune` keeps the app's own ui unit",
  // the CLI children are fully awaited; these guards only cover their stdio pipes
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const base = await Deno.makeTempDir({ prefix: "req012-e2e-" });
    const home = await Deno.makeTempDir({ prefix: "req012-home-" });
    const app = join(base, "myapp");
    const servePath = join(app, "serve.ts");
    try {
      const scaffold = await sprig(base, home, "init", "myapp");
      assertEquals(scaffold.code, 0, `sprig init:\n${scaffold.out}`);
      assertStringIncludes(
        await Deno.readTextFile(servePath),
        "ui: Frontend()",
      );

      // The app takes over the ui slot. The marker banner stays, so the file is
      // still the build's to maintain — that is the whole point: owning a UNIT
      // must not mean owning the FILE.
      await Deno.writeTextFile(
        join(app, "ui", "surfaces.ts"),
        `import { Frontend } from "@techgoose-labs/sprig/bedrock";
export const MyFrontend = () => Frontend();
`,
      );
      const generated = await Deno.readTextFile(servePath);
      await Deno.writeTextFile(
        servePath,
        generated
          .replace(
            `import { Frontend } from "@techgoose-labs/sprig/bedrock";`,
            `import { MyFrontend } from "./ui/surfaces.ts";`,
          )
          .replace("ui: Frontend()", "ui: MyFrontend()"),
      );

      const built = await sprig(app, home, "build", "ui", "--rune");
      assertEquals(built.code, 0, `sprig build --rune:\n${built.out}`);
      assertStringIncludes(built.out, "composed server/ (keep) + ui/ (sprig)");

      const after = await Deno.readTextFile(servePath);
      assertStringIncludes(after, "ui: MyFrontend()");
      assertStringIncludes(after, `import { MyFrontend } from "./ui/surfaces.ts"`);
      assertStringIncludes(after, "backend: api");
      assert(
        !after.includes(`"@techgoose-labs/sprig/bedrock"`),
        `the build re-imported its default ui unit over the app's own:\n${after}`,
      );

      // and the root it wrote is real code: it typechecks.
      const checked = await new Deno.Command(Deno.execPath(), {
        args: ["check", "serve.ts"],
        cwd: app,
        env: { ...Deno.env.toObject(), NO_COLOR: "1" },
      }).output();
      assertEquals(
        checked.code,
        0,
        `the regenerated root does not typecheck:\n${
          new TextDecoder().decode(checked.stderr)
        }`,
      );
    } finally {
      await Deno.remove(base, { recursive: true });
      await Deno.remove(home, { recursive: true });
    }
  },
});
