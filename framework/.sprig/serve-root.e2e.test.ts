// e2e (REQ-011, REQ-012) — the real CLI, on a real scaffolded app, doing the two
// things that destroyed a hand-owned composition root:
//
//   `sprig init` / `sprig build` regenerate the root  → it must keep the app's
//                                                       own `ui:` unit (REQ-012)
//   `sprig clean` removes a generated root            → it must NOT remove a
//                                                       hand-written one that
//                                                       merely names the marker
//                                                       in prose (REQ-011)
//
// `sprig init` on an already-scaffolded repo is the CONTRIBUTOR run: it adds only
// what is absent, and regenerates the composition root through exactly the code
// `sprig build --rune` uses (writeRuneServe). That is the cheap way to drive the
// real regeneration without a full client build.

import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { join } from "@std/path";

const CLI = new URL("../cli.ts", import.meta.url).pathname;

async function runCli(
  args: string[],
  cwd: string,
  sprigHome: string,
): Promise<{ code: number; out: string; err: string }> {
  const p = await new Deno.Command(Deno.execPath(), {
    args: ["run", "-A", CLI, ...args],
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

const HAND_WRITTEN_NAMING_THE_MARKER =
  `// The composition root — HAND-WRITTEN, owned by this repo.
//
// It carries no BEDROCK_SERVE_MARKER, and that is the point: the toolchain
// refuses to overwrite a serve.ts without the marker, so this file survives
// \`sprig build\`.
import { Bedrock } from "@techgoose-labs/bedrock";
import { InfraFrontend } from "./ui/infra.ts";
import { api } from "./server/bootstrap/mod.ts";

export default Bedrock({ ui: InfraFrontend(), backend: api });
`;

Deno.test({
  name: "REQ-011/REQ-012: the real CLI leaves a hand-owned composition root alone",
  // the CLI children are fully awaited; these guards only cover their stdio pipes
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async (t) => {
    const base = await Deno.makeTempDir({ prefix: "sprig-serve-root-e2e-" });
    const home = await Deno.makeTempDir({ prefix: "sprig-serve-root-home-" });
    const app = join(base, "app");
    const servePath = join(app, "serve.ts");
    try {
      const scaffold = await runCli(["init", "app"], base, home);
      assertEquals(scaffold.code, 0, `sprig init: ${scaffold.err}`);
      assertStringIncludes(
        await Deno.readTextFile(servePath),
        "ui: Frontend()",
      );

      await t.step(
        "REQ-012: a real CLI regeneration keeps the app's own ui unit",
        async () => {
          // the app takes ownership of the ui slot — the marker stays, so the
          // build is still free to regenerate the file around it.
          const generated = await Deno.readTextFile(servePath);
          await Deno.writeTextFile(
            servePath,
            generated
              .replace(
                `import { Frontend } from "@techgoose-labs/sprig/bedrock";`,
                `import { InfraFrontend } from "./ui/infra.ts";`,
              )
              .replace("ui: Frontend()", "ui: InfraFrontend()"),
          );

          const again = await runCli(["init", "."], app, home);
          assertEquals(again.code, 0, `sprig init (contributor): ${again.err}`);

          const after = await Deno.readTextFile(servePath);
          assertStringIncludes(after, "ui: InfraFrontend()");
          assertStringIncludes(after, `import { InfraFrontend } from "./ui/infra.ts"`);
          assertStringIncludes(after, "backend: api");
          assert(
            !after.includes(`"@techgoose-labs/sprig/bedrock"`),
            "the build re-imported its default ui unit over the app's own",
          );
        },
      );

      await t.step(
        "REQ-011: `sprig clean` leaves a hand-written root that names the marker",
        async () => {
          await Deno.writeTextFile(servePath, HAND_WRITTEN_NAMING_THE_MARKER);
          const cleaned = await runCli(["clean"], app, home);
          assertEquals(cleaned.code, 0, `sprig clean: ${cleaned.err}`);
          assertEquals(
            await Deno.readTextFile(servePath),
            HAND_WRITTEN_NAMING_THE_MARKER,
            "sprig clean deleted a hand-written composition root",
          );
        },
      );

      await t.step(
        "REQ-011: regeneration refuses that root and says how to opt in",
        async () => {
          const refused = await runCli(["init", "."], app, home);
          assertEquals(refused.code, 1, `expected a refusal:\n${refused.out}`);
          assertEquals(
            await Deno.readTextFile(servePath),
            HAND_WRITTEN_NAMING_THE_MARKER,
            "the refusal still rewrote the file",
          );
          assertStringIncludes(refused.err, "was NOT generated");
          assertStringIncludes(refused.err, "BEDROCK_SERVE_MARKER");
        },
      );
    } finally {
      await Deno.remove(base, { recursive: true });
      await Deno.remove(home, { recursive: true });
    }
  },
});
