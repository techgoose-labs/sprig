// REQ-018 / REQ-019 (integration) — the real CLI on a real composed tree: the
// author's `start` task survives the composed build, and every deno.json edit
// the build does make is printed.
//
// coms 20260922T231859Z-w208-84791 (box 208, ppwk-crm): "sprig build rewrites
// the root deno.json 'start' task and silently drops flags. … the --host
// 127.0.0.1 is gone, so the app goes back to binding 0.0.0.0 … every build
// silently reintroduces the defect and nothing fails."
import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { dirname, fromFileUrl, join } from "@std/path";
import { BEDROCK_SERVE_MARKER } from "@techgoose-labs/bedrock/artifact";

const REPO = dirname(dirname(fromFileUrl(import.meta.url)));
const CLI = join(REPO, "framework", "cli.ts");
const CONFIG = join(REPO, "deno.json");

const REPORTER_START =
  "deno serve -A --env-file=.env --host 127.0.0.1 serve.ts";

/** A generated root — the guard lets it through and the workspace writer runs. */
const GENERATED =
  `// ${BEDROCK_SERVE_MARKER} — the composition root at the git root.
//
//   deno serve -A serve.ts
import { Bedrock } from "@techgoose-labs/bedrock";
import { Frontend } from "@techgoose-labs/sprig/bedrock";
import { api } from "./server/bootstrap/mod.ts";

export default Bedrock({ ui: Frontend(), backend: api });
`;

const SERVER_DENO_JSON = `{
  "name": "@x/server",
  "version": "0.0.0",
  "exports": "./bootstrap/mod.ts",
  "imports": { "@techgoose-labs/bedrock": "jsr:@techgoose-labs/bedrock@^1" }
}
`;

/** The reporter's shape: a composed ui/ + server/ repo with a generated root,
 *  whose root deno.json carries the author's `start` task (or none). */
async function composedRepo(
  tasks: Record<string, string> | undefined,
  opts: { env?: boolean } = {},
): Promise<string> {
  const root = await Deno.makeTempDir({ prefix: "req018-" });
  const rootCfg: Record<string, unknown> = { workspace: ["./ui", "./server"] };
  if (tasks) rootCfg.tasks = tasks;
  await Deno.writeTextFile(
    join(root, "deno.json"),
    JSON.stringify(rootCfg, null, 2) + "\n",
  );
  if (opts.env) await Deno.writeTextFile(join(root, ".env"), "PORT=8000\n");
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
  await Deno.writeTextFile(join(root, "server", "deno.json"), SERVER_DENO_JSON);
  await Deno.writeTextFile(
    join(root, "server", "bootstrap", "mod.ts"),
    `export const api = await bootstrapServer("x", class {}, {});\n`,
  );
  return root;
}

/** `sprig build --rune` — the deploy preset's command. The fixture is not a
 *  real sprig UI, so the client build that FOLLOWS the composition fails; the
 *  composition (serve.ts + the workspace edits + their announcement) runs
 *  first, and that is all these tests read. */
async function build(root: string) {
  const { code, stdout, stderr } = await new Deno.Command(Deno.execPath(), {
    args: ["run", "-A", "--config", CONFIG, CLI, "build", "--rune"],
    cwd: root,
    env: { ...Deno.env.toObject(), NO_COLOR: "1" },
  }).output();
  return {
    code,
    out: new TextDecoder().decode(stdout) + new TextDecoder().decode(stderr),
  };
}

const readJson = async (root: string, rel: string) =>
  JSON.parse(await Deno.readTextFile(join(root, rel)));

Deno.test("REQ-018 (integration): sprig build keeps the reporter's start task byte-for-byte — --host 127.0.0.1 survives", async () => {
  const root = await composedRepo({ start: REPORTER_START }, { env: true });
  try {
    const { out } = await build(root);
    const cfg = await readJson(root, "deno.json");
    assertEquals(
      cfg.tasks.start,
      REPORTER_START,
      `start was rewritten:\n${out}`,
    );
    // and the build never claims to have edited it
    assert(
      !/deno\.json: .*tasks\.start/.test(out),
      `the build announced an edit to a task it must not touch:\n${out}`,
    );
    // the summary tells the developer what `deno task start` actually runs
    assertStringIncludes(out, "deno task start");
    assertStringIncludes(out, REPORTER_START);
    // the composition itself still happened
    assertStringIncludes(
      await Deno.readTextFile(join(root, "serve.ts")),
      BEDROCK_SERVE_MARKER,
    );
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("REQ-018 (integration): a start task that does not run the composed root is replaced, and the build says so with the old value", async () => {
  const root = await composedRepo({ start: "deno run -A serve.ts" });
  try {
    const { out } = await build(root);
    const cfg = await readJson(root, "deno.json");
    assertEquals(cfg.tasks.start, "deno serve -A serve.ts");
    assertStringIncludes(
      out,
      `deno.json: tasks.start "deno run -A serve.ts" → "deno serve -A serve.ts"`,
    );
  } finally {
    await Deno.remove(root, { recursive: true });
  }

  // no task at all → added, and announced as an addition
  const bare = await composedRepo(undefined);
  try {
    const { out } = await build(bare);
    const cfg = await readJson(bare, "deno.json");
    assertEquals(cfg.tasks.start, "deno serve -A serve.ts");
    assertStringIncludes(
      out,
      `deno.json: + tasks.start "deno serve -A serve.ts"`,
    );
  } finally {
    await Deno.remove(bare, { recursive: true });
  }
});

Deno.test("REQ-019 (integration): the server/deno.json bedrock hoist is announced, and a second build announces nothing", async () => {
  const root = await composedRepo({ start: REPORTER_START }, { env: true });
  try {
    const first = await build(root);
    // the hoist itself: member pin gone, root pin present (one runtime)
    const server = await readJson(root, "server/deno.json");
    assertEquals(server.imports?.["@techgoose-labs/bedrock"], undefined);
    const rootCfg = await readJson(root, "deno.json");
    assertEquals(
      rootCfg.imports["@techgoose-labs/bedrock"],
      "jsr:@techgoose-labs/bedrock@^1",
    );
    // …said out loud, naming the file, the specifier, and where it resolves now
    assertStringIncludes(
      first.out,
      `server/deno.json: - imports.@techgoose-labs/bedrock "jsr:@techgoose-labs/bedrock@^1"`,
    );
    assertStringIncludes(first.out, "hoisted");
    // every other edit the writer made is on its own line too
    assertStringIncludes(
      first.out,
      `deno.json: + imports.@techgoose-labs/bedrock`,
    );
    assertStringIncludes(first.out, `deno.json: + unstable "kv"`);

    // idempotent: the second build has nothing to edit, so it says nothing
    const second = await build(root);
    const edits = second.out.split("\n").filter((l) =>
      /^\s+(?:ui\/|server\/)?deno\.json: /.test(l)
    );
    assertEquals(edits, [], `a no-op build announced edits:\n${second.out}`);
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});
