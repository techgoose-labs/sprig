// REQ-020 (integration) — the real CLI writing a real app's git-root config:
// what `sprig init` leaves behind, and what a composed build adds to an app
// scaffolded before this existed.
//
// The reporter's app died on `sprig: command not found` (exit 127) in Deno
// Deploy's build step for a month while `deno deploy` kept reporting success
// (coms 20260921T190104Z-w5-80834). REQ-016 documented the hosted form; this
// makes a scaffolded app carry it without being hand-edited first.
import { assert, assertEquals } from "@std/assert";
import { dirname, fromFileUrl, join } from "@std/path";
import { BEDROCK_SERVE_MARKER } from "@techgoose-labs/bedrock/artifact";
import { ROOT_TASKS, SPRIG_CLI } from "./.sprig/app-scaffold.ts";

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

/** The `@techgoose-labs/sprig…` versions an import map pins, deduped. */
function sprigVersions(imports: Record<string, string>): Set<string> {
  return new Set(
    Object.entries(imports)
      .filter(([k]) => k.startsWith("@techgoose-labs/sprig"))
      .map(([, v]) => v.match(/@techgoose-labs\/sprig@([^/]+)/)?.[1] ?? v),
  );
}

Deno.test({
  name:
    "REQ-020 (integration): a real `sprig init` writes the hosted build task and the /cli mapping, all three sprig specifiers on one version",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const base = await Deno.makeTempDir({ prefix: "req020-init-" });
    const home = await Deno.makeTempDir({ prefix: "req020-home-" });
    try {
      const init = await sprig(base, home, "init", "app");
      assertEquals(init.code, 0, `sprig init:\n${init.out}`);

      const cfg = JSON.parse(
        await Deno.readTextFile(join(base, "app", "deno.json")),
      );
      assertEquals(
        cfg.tasks.build,
        ROOT_TASKS.build,
        "the scaffolded build task is not the hosted form",
      );
      assertEquals(cfg.tasks.dev, "sprig dev");
      assert(
        typeof cfg.imports[SPRIG_CLI] === "string",
        `no ${SPRIG_CLI} mapping — the build task cannot resolve:\n${
          JSON.stringify(cfg.imports, null, 2)
        }`,
      );
      assertEquals(
        sprigVersions(cfg.imports).size,
        1,
        `the sprig specifiers drifted apart: ${
          JSON.stringify(cfg.imports, null, 2)
        }`,
      );
      // the scaffolded root IS generated — the row of §3a's table this is for
      assert(
        (await Deno.readTextFile(join(base, "app", "serve.ts"))).startsWith(
          `// ${BEDROCK_SERVE_MARKER}`,
        ),
      );
    } finally {
      await Deno.remove(base, { recursive: true });
      await Deno.remove(home, { recursive: true });
    }
  },
});

const GENERATED =
  `// ${BEDROCK_SERVE_MARKER} — the composition root at the git root.
import { Bedrock } from "@techgoose-labs/bedrock";
import { Frontend } from "@techgoose-labs/sprig/bedrock";
import { api } from "./server/bootstrap/mod.ts";

export default Bedrock({ ui: Frontend(), backend: api });
`;

/** A composed ui/ + server/ project scaffolded before the /cli mapping existed:
 *  a generated root, and a root config that maps the runtime but not the CLI. */
async function olderComposedRepo(): Promise<string> {
  const root = await Deno.makeTempDir({ prefix: "req020-older-" });
  await Deno.writeTextFile(
    join(root, "deno.json"),
    `{
  "tasks": { "dev": "sprig dev", "build": "sprig build" },
  "workspace": ["./ui", "./server"],
  "imports": {
    "@techgoose-labs/sprig": "jsr:@techgoose-labs/sprig@2.1.0",
    "@techgoose-labs/sprig/bedrock": "jsr:@techgoose-labs/sprig@2.1.0/bedrock"
  }
}
`,
  );
  await Deno.writeTextFile(join(root, "serve.ts"), GENERATED);
  await Deno.mkdir(join(root, "ui", "bootstrap"), { recursive: true });
  await Deno.mkdir(join(root, "ui", "src"), { recursive: true });
  await Deno.writeTextFile(
    join(root, "ui", "bootstrap", "template.html"),
    "<html><body><!--sprig-outlet--></body></html>\n",
  );
  await Deno.writeTextFile(
    join(root, "ui", "deno.json"),
    `{ "name": "@x/ui", "version": "0.0.0", "exports": "./src/mod.ts" }\n`,
  );
  await Deno.writeTextFile(
    join(root, "ui", "src", "mod.ts"),
    "export const routes = [];\n",
  );
  await Deno.mkdir(join(root, "server", "bootstrap"), { recursive: true });
  await Deno.writeTextFile(
    join(root, "server", "deno.json"),
    `{ "name": "@x/server", "version": "0.0.0", "exports": "./bootstrap/mod.ts" }\n`,
  );
  await Deno.writeTextFile(
    join(root, "server", "bootstrap", "mod.ts"),
    `export const api = await bootstrapServer("x", class {}, {});\n`,
  );
  return root;
}

Deno.test({
  name:
    "REQ-020 (integration): a composed build adds the /cli mapping to an app that predates it, and a second build changes nothing",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const root = await olderComposedRepo();
    const cfgPath = join(root, "deno.json");
    try {
      // The client build downstream fails on this fixture (it is not a real
      // sprig UI) — emitRuneComposition runs FIRST, which is the part under test.
      await sprig(root, "", "build");
      const cfg = JSON.parse(await Deno.readTextFile(cfgPath));
      assert(
        typeof cfg.imports[SPRIG_CLI] === "string",
        `the composed build left the app without a ${SPRIG_CLI} mapping:\n${
          JSON.stringify(cfg.imports, null, 2)
        }`,
      );
      assertEquals(
        sprigVersions(cfg.imports).size,
        1,
        `the /cli entry is not in lockstep with the runtime pins: ${
          JSON.stringify(cfg.imports, null, 2)
        }`,
      );
      // the app's own build task is the app's — never rewritten under it
      assertEquals(cfg.tasks.build, "sprig build");

      const once = await Deno.readTextFile(cfgPath);
      await sprig(root, "", "build");
      assertEquals(
        await Deno.readTextFile(cfgPath),
        once,
        "a second composed build rewrote the config",
      );
    } finally {
      await Deno.remove(root, { recursive: true });
    }
  },
});
