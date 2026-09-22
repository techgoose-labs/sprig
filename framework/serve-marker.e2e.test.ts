// REQ-010 (e2e) — the ticket's own reproduction: infra's ACTUAL hand-owned
// composition root, under the sprig deploy preset's ACTUAL build command.
//
// coms 20260921T181052Z-w5-55966: "Repro: any repo with a marker-less serve.ts,
// run sprig build, diff the tree." The file below is `git show HEAD:serve.ts`
// from the reporter's box, verbatim.
import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { dirname, fromFileUrl, join } from "@std/path";

const REPO = dirname(dirname(fromFileUrl(import.meta.url)));
const CLI = join(REPO, "framework", "cli.ts");
const CONFIG = join(REPO, "deno.json");

const INFRA_SERVE = `// infra's composition root — HAND-OWNED, deliberately.
//
// It carries no BEDROCK_SERVE_MARKER, and that is the point: the toolchain
// refuses to overwrite a serve.ts without the marker, so this file survives
// \`sprig build\`. infra needs that, because its \`ui\` slot is not a plain
// \`Frontend()\` — it is \`InfraFrontend()\`, which adds the public surfaces the
// old mod.ts used to bolt on outside the composition.
//
//   deno serve -A --unstable-kv serve.ts
//
//   /               → the control plane (+ /firebase-config.*, /authz/*, /docs)
//   /api/*          → the backend, /api/docs/* → docs & cake
//   /auth/*         → the auth unit
//
// There is ONE root. Everything enters here, so the guard covers every channel
// and every cross-unit call is instrumented. The previous mod.ts composed a
// SECOND root with \`api.compose({ frontend })\` and wrapped it in hand-rolled
// routing — two entry points, only one of which bedrock could reason about.
import { Bedrock } from "@techgoose-labs/bedrock";
import { Infra } from "@techgoose-labs/infra";
import { api } from "./server/bootstrap/mod.ts";
import { InfraFrontend } from "./public-surfaces.ts";
import { firebaseConfig } from "./firebase-config.ts";

// Published in-process so the auth unit and the session adapter read the
// canonical project id without an env round-trip. Must happen before compose.
(globalThis as { __firebaseConfig?: typeof firebaseConfig }).__firebaseConfig =
  firebaseConfig;

export default Bedrock({ ui: InfraFrontend(), backend: api, auth: Infra() });
`;

/** infra's layout: a composed ui/ + server/ repo whose root serve.ts is hand-owned. */
async function infraLikeRepo(): Promise<string> {
  const root = await Deno.makeTempDir({ prefix: "req010-e2e-" });
  await Deno.writeTextFile(
    join(root, "deno.json"),
    `{
  "workspace": ["./ui", "./server"],
  "tasks": {
    "start": "KV_PATH=.local-kv.db deno serve -A --unstable-kv serve.ts",
    "start:local": "deno serve -A --unstable-kv --env-file=.env serve.ts"
  }
}
`,
  );
  await Deno.writeTextFile(join(root, "serve.ts"), INFRA_SERVE);
  await Deno.writeTextFile(
    join(root, "public-surfaces.ts"),
    "export const InfraFrontend = () => ({});\n",
  );
  await Deno.writeTextFile(
    join(root, "firebase-config.ts"),
    `export const firebaseConfig = { projectId: "keystone" };\n`,
  );
  await Deno.mkdir(join(root, "ui", "bootstrap"), { recursive: true });
  await Deno.mkdir(join(root, "ui", "src"), { recursive: true });
  await Deno.writeTextFile(
    join(root, "ui", "bootstrap", "template.html"),
    "<html><body><!--sprig-outlet--></body></html>\n",
  );
  await Deno.writeTextFile(
    join(root, "ui", "deno.json"),
    `{ "name": "@infra/ui", "version": "0.0.0", "exports": "./src/mod.ts" }\n`,
  );
  await Deno.writeTextFile(
    join(root, "ui", "src", "mod.ts"),
    "export const routes = [];\n",
  );
  await Deno.mkdir(join(root, "server", "bootstrap"), { recursive: true });
  await Deno.writeTextFile(
    join(root, "server", "deno.json"),
    `{ "name": "@infra/server", "version": "0.0.0", "exports": "./bootstrap/mod.ts", "imports": { "@techgoose-labs/bedrock": "jsr:@techgoose-labs/bedrock@^1" } }\n`,
  );
  await Deno.writeTextFile(
    join(root, "server", "bootstrap", "mod.ts"),
    `export const api = await bootstrapServer("infra", class {}, {});\n`,
  );
  return root;
}

Deno.test("REQ-010 (e2e): the deploy preset's `sprig build --rune` leaves infra's hand-owned root untouched", async () => {
  const root = await infraLikeRepo();
  try {
    // the sprig deploy preset's buildCommand, verbatim — the path the report
    // says would have run on every Deno Deploy build.
    const { code, stdout, stderr } = await new Deno.Command(Deno.execPath(), {
      args: ["run", "-A", "--config", CONFIG, CLI, "build", "--rune"],
      cwd: root,
      env: { ...Deno.env.toObject(), NO_COLOR: "1" },
    }).output();
    const out = new TextDecoder().decode(stdout) +
      new TextDecoder().decode(stderr);

    assertEquals(code, 1, `expected a refusal, got exit ${code}:\n${out}`);

    const after = await Deno.readTextFile(join(root, "serve.ts"));
    assertEquals(after, INFRA_SERVE, "infra's composition root was rewritten");
    // spelled out, because each of these is a line the report watched disappear
    assertStringIncludes(after, "ui: InfraFrontend()");
    assertStringIncludes(after, "__firebaseConfig =");
    assertStringIncludes(after, "auth: Infra()");
    assertEquals(
      after.includes("// BEDROCK_SERVE_MARKER —"),
      false,
      "the marker was stamped into a hand-owned root",
    );

    // "It also appends /serve.ts to .gitignore (hiding the substitution from git)"
    assertEquals(
      await Deno.stat(join(root, ".gitignore")).then(() => true).catch(() =>
        false
      ),
      false,
      "/serve.ts was hidden from git",
    );
    // "strips --unstable-kv and KV_PATH from deno.json's start task"
    assertStringIncludes(
      await Deno.readTextFile(join(root, "deno.json")),
      "KV_PATH=.local-kv.db deno serve -A --unstable-kv serve.ts",
    );
    // "drops the @techgoose-labs/bedrock import from server/deno.json"
    assertStringIncludes(
      await Deno.readTextFile(join(root, "server", "deno.json")),
      "@techgoose-labs/bedrock",
    );
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

// ------------------------------------------------- REQ-014 (one instruction)
//
// coms 20260921T191537Z-w5-86466: "'the wrapper is the only configuration that
// works on the released CLI' is not accurate — … 'sprig build --ui-only ui',
// which never enters the composition, and I VERIFIED it on shipped 2.1.3:
// serve.ts, server/deno.json and the ignore file byte-identical after a build."
// This is that verification, on this CLI, against infra's actual root — the
// one whose top-level line rules regeneration out for good.

/** The scaffold `sprig init` writes, with infra's hand-owned root dropped in
 *  and its two @techgoose-labs/sprig imports pointed at THIS repo's runtime
 *  instead of the JSR pin — so the client bundle builds offline, and the test
 *  can insist on exit 0 rather than merely "nothing composed". */
async function scaffoldedInfraRepo(home: string): Promise<string> {
  const base = await Deno.makeTempDir({ prefix: "req014-e2e-" });
  const init = await new Deno.Command(Deno.execPath(), {
    args: ["run", "-A", CLI, "init", "app"],
    cwd: base,
    env: { ...Deno.env.toObject(), SPRIG_HOME: home, NO_COLOR: "1" },
  }).output();
  assertEquals(init.code, 0, new TextDecoder().decode(init.stderr));
  const root = join(base, "app");
  const denoJson = JSON.parse(await Deno.readTextFile(join(root, "deno.json")));
  denoJson.imports["@techgoose-labs/sprig"] = join(
    REPO,
    "framework",
    ".sprig",
    "core.ts",
  );
  denoJson.imports["@techgoose-labs/sprig/bedrock"] = join(
    REPO,
    "packages",
    "keep",
    "mod.ts",
  );
  await Deno.writeTextFile(
    join(root, "deno.json"),
    JSON.stringify(denoJson, null, 2) + "\n",
  );
  // infra's root in place of the generated one, plus what it imports
  await Deno.writeTextFile(join(root, "serve.ts"), INFRA_SERVE);
  await Deno.writeTextFile(
    join(root, "public-surfaces.ts"),
    "export const InfraFrontend = () => ({});\n",
  );
  await Deno.writeTextFile(
    join(root, "firebase-config.ts"),
    `export const firebaseConfig = { projectId: "keystone" };\n`,
  );
  // init already ignores /serve.ts for the generated root it wrote; infra's
  // repo has no such entry — start from one that a composition would have to ADD to.
  await Deno.writeTextFile(join(root, ".gitignore"), "node_modules/\n");
  return base;
}

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

Deno.test("REQ-014 (e2e): `sprig build --ui-only ui` on infra's hand-owned root builds the bundle and leaves serve.ts, server/deno.json and the ignore file byte-identical", async () => {
  const home = await Deno.makeTempDir({ prefix: "req014-home-" });
  const base = await scaffoldedInfraRepo(home);
  const root = join(base, "app");
  const read = (rel: string) => Deno.readTextFile(join(root, rel));
  try {
    const serve = await read("serve.ts");
    const serverDeno = await read("server/deno.json");
    const ignore = await read(".gitignore");
    const rootDeno = JSON.parse(await read("deno.json"));

    const built = await cli(root, home, "build", "--ui-only", "ui");
    assertEquals(
      built.code,
      0,
      `sprig build --ui-only ui failed:\n${built.out}`,
    );
    for (const f of ["client.js", "app.css", "templates.json"]) {
      await Deno.stat(join(root, "ui", "static", f)); // throws if the bundle is missing
    }
    assertEquals(await read("serve.ts"), serve, "serve.ts changed");
    assertStringIncludes(await read("serve.ts"), "__firebaseConfig =");
    assertEquals(
      await read("server/deno.json"),
      serverDeno,
      "server/deno.json changed",
    );
    assertEquals(await read(".gitignore"), ignore, ".gitignore changed");
    // the root deno.json may take the pin stamp and nothing else
    const after = JSON.parse(await read("deno.json"));
    assertEquals(after.tasks, rootDeno.tasks, "the start task was rewritten");
    assertEquals(after.workspace, rootDeno.workspace);
    assertEquals(after.unstable, rootDeno.unstable);

    // …and the same tree under the composed build: refused, still untouched,
    // and pointed at the command that just worked.
    const plain = await cli(root, home, "build");
    assertEquals(
      plain.code,
      1,
      `plain build on a hand-owned root must refuse:\n${plain.out}`,
    );
    assertStringIncludes(plain.out, "sprig build --ui-only ui");
    assertEquals(
      await read("serve.ts"),
      serve,
      "the refused build rewrote serve.ts",
    );
    assertEquals(await read("server/deno.json"), serverDeno);
    assertEquals(await read(".gitignore"), ignore);
  } finally {
    await Deno.remove(base, { recursive: true });
    await Deno.remove(home, { recursive: true });
  }
});

Deno.test("REQ-013 (e2e): read in a Deno Deploy build log — the preset's `sprig build --rune` on infra's root names `--ui-only` unambiguously", async () => {
  const root = await infraLikeRepo();
  try {
    // a deploy build: no TTY on either stream, NO_COLOR not set for us
    // (`clearEnv`, or the runner's own NO_COLOR would be merged back in)
    const env = { ...Deno.env.toObject() };
    delete env.NO_COLOR;
    const { code, stdout, stderr } = await new Deno.Command(Deno.execPath(), {
      args: ["run", "-A", "--config", CONFIG, CLI, "build", "--rune"],
      cwd: root,
      env,
      clearEnv: true,
      stdin: "null",
      stdout: "piped",
      stderr: "piped",
    }).output();
    const err = new TextDecoder().decode(stderr);
    const out = new TextDecoder().decode(stdout);

    assertEquals(
      code,
      1,
      `expected a refusal, got exit ${code}:\n${out}${err}`,
    );
    assertEquals(
      await Deno.readTextFile(join(root, "serve.ts")),
      INFRA_SERVE,
      "infra's composition root was rewritten",
    );

    const lines = err.split("\n").map((l) => l.trim());
    // infra's ui dir is `ui`: the line to put in its deploy build command is exactly this
    assertEquals(
      lines.filter((l) => l === "sprig build --ui-only ui").length,
      1,
      `expected exactly one \`sprig build --ui-only ui\` line on stderr:\n${err}`,
    );
    // the other way forward — for a root that only composes its own unit
    assertStringIncludes(err, "BEDROCK_SERVE_MARKER");
    // the refusal itself is plain text (Deno's own coloured deprecation warning
    // above it is Deno's line, not the CLI's)
    const body = err.slice(err.indexOf("sprig build:"));
    assert(body.startsWith("sprig build:"), `the refusal is missing:\n${err}`);
    // deno-lint-ignore no-control-regex
    assert(!/\x1b/.test(body + out), "escape sequence in the refusal");
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});
