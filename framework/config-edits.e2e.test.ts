// REQ-018 / REQ-019 (e2e) — the reporter's own run: `sprig build --rune` on a
// scaffolded app whose `start` task binds loopback.
//
// coms 20260922T231859Z-w208-84791: "Ran: deno task build (sprig 2.1.3, sprig
// build --rune, workspace members ./ui ./server). Before: "start": "deno serve
// -A --env-file=.env --host 127.0.0.1 serve.ts". After: "start": "deno serve -A
// --env-file=.env serve.ts" … Expected: sprig build regenerates serve.ts and
// ui/static, and leaves author-owned task strings and member import maps alone
// — or at minimum preserves unrecognized flags."
import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { dirname, fromFileUrl, join } from "@std/path";

const REPO = dirname(dirname(fromFileUrl(import.meta.url)));
const CLI = join(REPO, "framework", "cli.ts");

const REPORTER_START =
  "deno serve -A --env-file=.env --host 127.0.0.1 serve.ts";
const BEDROCK_PIN = "jsr:@techgoose-labs/bedrock@^1";

async function cli(root: string, home: string, ...args: string[]) {
  const { code, stdout, stderr } = await new Deno.Command(Deno.execPath(), {
    args: ["run", "-A", CLI, ...args],
    cwd: root,
    env: { ...Deno.env.toObject(), SPRIG_HOME: home, NO_COLOR: "1" },
  }).output();
  return {
    code,
    out: new TextDecoder().decode(stdout) + new TextDecoder().decode(stderr),
  };
}

/** `sprig init app`, then the reporter's tree: a .env, their `start` task, and
 *  server/deno.json carrying its own bedrock pin. The two sprig imports point
 *  at THIS checkout so the client bundle builds offline and exit 0 is real. */
async function reporterRepo(home: string): Promise<string> {
  const base = await Deno.makeTempDir({ prefix: "req018-e2e-" });
  const init = await cli(base, home, "init", "app");
  assertEquals(init.code, 0, init.out);
  const root = join(base, "app");
  const rootCfg = JSON.parse(await Deno.readTextFile(join(root, "deno.json")));
  rootCfg.imports["@techgoose-labs/sprig"] = join(
    REPO,
    "framework",
    ".sprig",
    "core.ts",
  );
  rootCfg.imports["@techgoose-labs/sprig/bedrock"] = join(
    REPO,
    "packages",
    "keep",
    "mod.ts",
  );
  rootCfg.tasks.start = REPORTER_START;
  await Deno.writeTextFile(
    join(root, "deno.json"),
    JSON.stringify(rootCfg, null, 2) + "\n",
  );
  await Deno.writeTextFile(join(root, ".env"), "PORT=8000\n");
  const serverPath = join(root, "server", "deno.json");
  const server = JSON.parse(await Deno.readTextFile(serverPath));
  server.imports = {
    ...(server.imports ?? {}),
    "@techgoose-labs/bedrock": BEDROCK_PIN,
  };
  await Deno.writeTextFile(serverPath, JSON.stringify(server, null, 2) + "\n");
  return base;
}

Deno.test("REQ-018 (e2e): the reporter's repro — sprig build --rune on a scaffolded app with --host 127.0.0.1 in start: exit 0, the flag survives, the hoist is printed", async () => {
  const home = await Deno.makeTempDir({ prefix: "req018-home-" });
  const base = await reporterRepo(home);
  const root = join(base, "app");
  const read = (rel: string) => Deno.readTextFile(join(root, rel));
  try {
    const built = await cli(root, home, "build", "--rune");
    assertEquals(built.code, 0, `sprig build --rune failed:\n${built.out}`);
    for (const f of ["client.js", "app.css", "templates.json"]) {
      await Deno.stat(join(root, "ui", "static", f)); // the bundle is there
    }
    // "leaves author-owned task strings alone"
    const cfg = JSON.parse(await read("deno.json"));
    assertEquals(cfg.tasks.start, REPORTER_START, built.out);
    assertStringIncludes(cfg.tasks.start, "--host 127.0.0.1");
    assert(!/deno\.json: .*tasks\.start/.test(built.out), built.out);
    assertStringIncludes(built.out, `deno task start`);
    assertStringIncludes(built.out, REPORTER_START);

    // the member pin IS hoisted (one runtime, by design) — and the build says
    // so, naming the file, the specifier and the root pin it resolves through
    const server = JSON.parse(await read("server/deno.json"));
    assertEquals(server.imports?.["@techgoose-labs/bedrock"], undefined);
    assertStringIncludes(
      cfg.imports["@techgoose-labs/bedrock"],
      "jsr:@techgoose-labs/bedrock@",
    );
    assertStringIncludes(
      built.out,
      `server/deno.json: - imports.@techgoose-labs/bedrock "${BEDROCK_PIN}"`,
    );
    assertStringIncludes(built.out, "hoisted");

    // a second build: same task, nothing to announce
    const again = await cli(root, home, "build", "--rune");
    assertEquals(again.code, 0, again.out);
    assertEquals(
      JSON.parse(await read("deno.json")).tasks.start,
      REPORTER_START,
    );
    const edits = again.out.split("\n").filter((l) =>
      /^\s+(?:ui\/|server\/)?deno\.json: /.test(l)
    );
    assertEquals(edits, [], `a no-op build announced edits:\n${again.out}`);
  } finally {
    await Deno.remove(base, { recursive: true });
    await Deno.remove(home, { recursive: true });
  }
});
