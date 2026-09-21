// REQ-012 (integration) — the real CLI on a real composed tree: regenerating the
// composition root keeps the units the build cannot see, and supplies its own
// only when the app composes none.
//
// The harness is REQ-010's (`serve-marker.int.test.ts`): the smallest tree that
// resolves a UI package, finds the keep backend, and reaches the serve.ts writer.
// The client build that follows fails on this fixture — it is not a real sprig UI
// — but `emitRuneComposition` runs FIRST, so serve.ts is already written by then,
// which is exactly what these assert.
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@^1";
import { dirname, fromFileUrl, join } from "@std/path";
import { BEDROCK_SERVE_MARKER } from "@techgoose-labs/bedrock/artifact";

const REPO = dirname(dirname(fromFileUrl(import.meta.url)));
const CLI = join(REPO, "framework", "cli.ts");
const CONFIG = join(REPO, "deno.json");

/** A GENERATED root — the build owns it — that composes the app's OWN ui unit
 *  and an auth unit from a package this build has never heard of. */
const OWN_UNITS = `// ${BEDROCK_SERVE_MARKER} — the composition root at the git root.
//
//   deno serve -A serve.ts
import { Bedrock } from "@techgoose-labs/bedrock";
import { MyFrontend } from "./public-surfaces.ts";
import { AlfredAuth } from "@acme/auth";
import { api } from "./server/bootstrap/mod.ts";

export default Bedrock({ ui: MyFrontend({ base: "/" }), backend: api, auth: AlfredAuth() });
`;

/** A GENERATED root with no ui unit of its own — the build supplies the default. */
const NO_UI = `// ${BEDROCK_SERVE_MARKER} — the composition root at the git root.
import { Bedrock } from "@techgoose-labs/bedrock";
import { api } from "./server/bootstrap/mod.ts";

export default Bedrock({ backend: api });
`;

const ROOT_DENO_JSON = `{
  "workspace": ["./ui", "./server"],
  "tasks": { "start": "deno serve -A serve.ts" }
}
`;
const SERVER_DENO_JSON = `{
  "name": "@x/server",
  "version": "0.0.0",
  "exports": "./bootstrap/mod.ts",
  "imports": { "@techgoose-labs/bedrock": "jsr:@techgoose-labs/bedrock@^1" }
}
`;

/** A minimal composed ui/ + server/ project: enough for `sprig build` to resolve
 *  the UI package, find the keep backend, and reach the serve.ts writer. */
async function composedRepo(serveSrc: string): Promise<string> {
  const root = await Deno.makeTempDir({ prefix: "req012-" });
  await Deno.writeTextFile(join(root, "deno.json"), ROOT_DENO_JSON);
  await Deno.writeTextFile(join(root, "serve.ts"), serveSrc);
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
  await Deno.writeTextFile(join(root, "server", "deno.json"), SERVER_DENO_JSON);
  await Deno.writeTextFile(
    join(root, "server", "bootstrap", "mod.ts"),
    `export const api = await bootstrapServer("x", class {}, {});\n`,
  );
  return root;
}

async function sprig(root: string, ...args: string[]) {
  const { code, stdout, stderr } = await new Deno.Command(Deno.execPath(), {
    args: ["run", "-A", "--config", CONFIG, CLI, ...args],
    cwd: root,
    env: { ...Deno.env.toObject(), NO_COLOR: "1" },
  }).output();
  const out = new TextDecoder().decode(stdout) +
    new TextDecoder().decode(stderr);
  return { code, out };
}

Deno.test("REQ-012 (integration): a real build keeps the app's own ui unit, and its auth unit with it", async () => {
  const root = await composedRepo(OWN_UNITS);
  try {
    const { out } = await sprig(root, "build");
    assert(
      !out.includes("already exists and was NOT generated"),
      `the guard refused a generated root:\n${out}`,
    );

    const after = await Deno.readTextFile(join(root, "serve.ts"));
    assert(
      after.startsWith(`// ${BEDROCK_SERVE_MARKER}`),
      `serve.ts was not regenerated:\n${after}`,
    );
    // the units the build cannot see, still there — with their arguments
    assertStringIncludes(after, `ui: MyFrontend({ base: "/" })`);
    assertStringIncludes(after, `import { MyFrontend } from "./public-surfaces.ts"`);
    assertStringIncludes(after, "auth: AlfredAuth()");
    assertStringIncludes(after, `import { AlfredAuth } from "@acme/auth"`);
    // the one slot the build owns: the backend it just composed
    assertStringIncludes(after, "backend: api");
    assertStringIncludes(after, `import { api } from "./server/bootstrap/mod.ts"`);
    assert(
      !after.includes(`"@techgoose-labs/sprig/bedrock"`),
      `the build re-imported its default ui unit over the app's own:\n${after}`,
    );
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("REQ-012 (integration): a root with no ui unit of its own still gets the default Frontend()", async () => {
  const root = await composedRepo(NO_UI);
  try {
    await sprig(root, "build");
    const after = await Deno.readTextFile(join(root, "serve.ts"));
    assertStringIncludes(after, "ui: Frontend()");
    assertStringIncludes(
      after,
      `import { Frontend } from "@techgoose-labs/sprig/bedrock"`,
    );
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("REQ-012 (integration): regenerating twice is stable — the carried units do not drift", async () => {
  const root = await composedRepo(OWN_UNITS);
  try {
    await sprig(root, "build");
    const first = await Deno.readTextFile(join(root, "serve.ts"));
    await sprig(root, "build");
    assertEquals(await Deno.readTextFile(join(root, "serve.ts")), first);
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});
