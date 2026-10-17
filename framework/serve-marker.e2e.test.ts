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

// REQ-016 / REQ-017 (e2e) — the documented deploy build command, in the
// environment a deploy runs it in. The reporter's Deno Deploy build step ran
// `deno task build` in a clean checkout: `sprig build --ui-only ui` at its head,
// "sprig: command not found", exit 127, every revision for a month — the `sprig`
// launcher is what `sprig install` writes on a developer's machine. The hosted
// form runs the same CLI from jsr through an import-map entry, and the local
// build keeps that entry's pin in lockstep with the runtime's
// (coms 20260921T190104Z-w5-80834).

/** `deno task <task>` the way a hosted build runs it: no TTY, and a PATH with
 *  no `sprig` launcher on it — only `deno` (a symlink in a private dir, because
 *  on a developer's machine `deno` and the launcher share one bin dir) and the
 *  system dirs. */
async function hostedTask(root: string, home: string, task: string) {
  const bin = await Deno.makeTempDir({ prefix: "req016-bin-" });
  await Deno.symlink(Deno.execPath(), join(bin, "deno"));
  try {
    const { code, stdout, stderr } = await new Deno.Command(Deno.execPath(), {
      args: ["task", task],
      cwd: root,
      env: {
        ...Deno.env.toObject(),
        PATH: `${bin}:/usr/bin:/bin`,
        SPRIG_HOME: home,
        NO_COLOR: "1",
      },
      clearEnv: true,
      stdin: "null",
      stdout: "piped",
      stderr: "piped",
    }).output();
    return {
      code,
      out: new TextDecoder().decode(stdout) + new TextDecoder().decode(stderr),
    };
  } finally {
    await Deno.remove(bin, { recursive: true });
  }
}

Deno.test("REQ-016 (e2e): with no `sprig` launcher on PATH the documented task exits 127 and the hosted form — `deno run -A @techgoose-labs/sprig/cli build --ui-only ui` through the import map — builds the bundle and leaves infra's root byte-identical", async () => {
  const home = await Deno.makeTempDir({ prefix: "req016-home-" });
  const base = await scaffoldedInfraRepo(home);
  const root = join(base, "app");
  const read = (rel: string) => Deno.readTextFile(join(root, rel));
  const write = (cfg: unknown) =>
    Deno.writeTextFile(
      join(root, "deno.json"),
      JSON.stringify(cfg, null, 2) + "\n",
    );
  try {
    for (const p of ["/usr/bin/sprig", "/bin/sprig"]) {
      assertEquals(
        await Deno.stat(p).then(() => true).catch(() => false),
        false,
        `${p} exists — this machine cannot stand in for a clean checkout`,
      );
    }
    const serve = await read("serve.ts");
    const ignore = await read(".gitignore");
    const cfg = JSON.parse(await read("deno.json"));

    // 1. the task as first documented, run as the reporter's deploy ran it
    cfg.tasks.build = "sprig build --ui-only ui";
    await write(cfg);
    const bare = await hostedTask(root, home, "build");
    assertEquals(
      bare.code,
      127,
      `expected the reporter's exit 127:\n${bare.out}`,
    );
    assertStringIncludes(bare.out, "sprig: command not found");

    // 2. the hosted head on the COMPOSED build — what a shared preset runs on a
    //    hand-owned root: it refuses, and the refusal names the hosted form of
    //    the way forward, not just the bare one that cannot run here.
    //    (/cli is mapped to this checkout's cli.ts: a jsr pin would need the
    //    registry — its lockstep is REQ-017's test below.)
    cfg.imports["@techgoose-labs/sprig/cli"] = join(
      REPO,
      "framework",
      "cli.ts",
    );
    cfg.tasks.build = "deno run -A @techgoose-labs/sprig/cli build";
    await write(cfg);
    const composed = await hostedTask(root, home, "build");
    assertEquals(
      composed.code,
      1,
      `the composed build on a hand-owned root must refuse:\n${composed.out}`,
    );
    const lines = composed.out.split("\n").map((l) => l.trim());
    assertEquals(
      lines.filter((l) => l === "sprig build --ui-only ui").length,
      1,
      `expected one \`sprig build --ui-only ui\` line:\n${composed.out}`,
    );
    assertEquals(
      lines.filter((l) =>
        l === "deno run -A @techgoose-labs/sprig/cli build --ui-only ui"
      ).length,
      1,
      `expected one hosted-form line:\n${composed.out}`,
    );
    assertEquals(await read("serve.ts"), serve, "the refusal rewrote serve.ts");

    // 3. the hosted form of the instruction: builds, and touches nothing it
    //    must not
    cfg.tasks.build =
      "deno run -A @techgoose-labs/sprig/cli build --ui-only ui";
    await write(cfg);
    const hosted = await hostedTask(root, home, "build");
    assertEquals(hosted.code, 0, `the hosted form failed:\n${hosted.out}`);
    for (const f of ["client.js", "app.css", "templates.json"]) {
      await Deno.stat(join(root, "ui", "static", f)); // throws if the bundle is missing
    }
    assertEquals(await read("serve.ts"), serve, "serve.ts changed");
    assertStringIncludes(await read("serve.ts"), "__firebaseConfig =");
    assertEquals(await read(".gitignore"), ignore, ".gitignore changed");
    const after = JSON.parse(await read("deno.json"));
    assertEquals(
      after.tasks.build,
      cfg.tasks.build,
      "the build task was rewritten",
    );
    assertEquals(
      after.imports["@techgoose-labs/sprig/cli"],
      join(REPO, "framework", "cli.ts"),
      "a local /cli override was restamped",
    );
  } finally {
    await Deno.remove(base, { recursive: true });
    await Deno.remove(home, { recursive: true });
  }
});

Deno.test("REQ-017 (e2e): on a scaffolded app, the local `sprig build --ui-only ui` re-pins the @techgoose-labs/sprig/cli mapping alongside the runtime pins, so the hosted build runs the CLI that built locally", async () => {
  const home = await Deno.makeTempDir({ prefix: "req017-home-" });
  const base = await scaffoldedInfraRepo(home);
  const root = join(base, "app");
  const read = (rel: string) => Deno.readTextFile(join(root, rel));
  try {
    const cliV = JSON.parse(await Deno.readTextFile(CONFIG)).version as string;
    const cfg = JSON.parse(await read("deno.json"));
    // the hosted form as the reporter wired it, with a pin that fell behind
    cfg.imports["@techgoose-labs/sprig/cli"] =
      "jsr:@techgoose-labs/sprig@0.0.1/cli";
    cfg.tasks.build =
      "deno run -A @techgoose-labs/sprig/cli build --ui-only ui";
    await Deno.writeTextFile(
      join(root, "deno.json"),
      JSON.stringify(cfg, null, 2) + "\n",
    );

    const built = await cli(root, home, "build", "--ui-only", "ui");
    assertEquals(
      built.code,
      0,
      `sprig build --ui-only ui failed:\n${built.out}`,
    );
    assertStringIncludes(
      built.out,
      `sprig: stamped @techgoose-labs/sprig → ${cliV}`,
    );
    const after = JSON.parse(await read("deno.json"));
    assertEquals(
      after.imports["@techgoose-labs/sprig/cli"],
      `jsr:@techgoose-labs/sprig@${cliV}/cli`,
      "the hosted build would run a CLI other than the one that built locally",
    );
    // the runtime entries here are local overrides — never restamped
    assertEquals(
      after.imports["@techgoose-labs/sprig"],
      cfg.imports["@techgoose-labs/sprig"],
    );
    assertEquals(
      after.tasks.build,
      cfg.tasks.build,
      "the build task was rewritten",
    );

    // a second build has nothing left to stamp
    const again = await cli(root, home, "build", "--ui-only", "ui");
    assertEquals(again.code, 0, again.out);
    assertEquals(
      again.out.includes("sprig: stamped"),
      false,
      "the stamp is not idempotent",
    );
  } finally {
    await Deno.remove(base, { recursive: true });
    await Deno.remove(home, { recursive: true });
  }
});

// REQ-016 AMENDMENT (e2e) — what the sentence documents, run for real. A hosted
// build runs the CLI from a URL (`deno run -A jsr:…/cli`), not a file; that is
// what leaves `import.meta.dirname` undefined, so cliVersion() has nothing to
// read and stamp() returns before it touches deno.json. Here this checkout's
// framework/ is served over 127.0.0.1 and the CLI is run from that URL with the
// framework's own config — the launcher's shape — so no registry is needed. A
// stale /cli pin that a LOCAL build re-pins (REQ-017 above) stays exactly as
// committed, `sprig: stamped` never prints, and the refusal a hosted composed
// build prints carries the sentence with the <version> placeholder, because
// there is no version on disk (coms 20260921T190104Z-w5-80834).

/** Serve `dir` over 127.0.0.1 with module-friendly content types. */
function serveTree(dir: string): { port: number; close: () => Promise<void> } {
  const types: Record<string, string> = {
    ".ts": "application/typescript",
    ".js": "application/javascript",
    ".mjs": "application/javascript",
    ".json": "application/json",
    ".wasm": "application/wasm",
  };
  const server = Deno.serve(
    { port: 0, hostname: "127.0.0.1", onListen() {} },
    async (req) => {
      const path = decodeURIComponent(new URL(req.url).pathname);
      try {
        const body = await Deno.readFile(join(dir, path));
        const ext = path.slice(path.lastIndexOf("."));
        return new Response(body, {
          headers: {
            "content-type": types[ext] ?? "application/octet-stream",
          },
        });
      } catch {
        return new Response("not found", { status: 404 });
      }
    },
  );
  return { port: server.addr.port, close: () => server.shutdown() };
}

/** The CLI as a hosted build runs it: from a URL, with the framework's config
 *  (what the launcher passes) and a private copy of its lockfile, so the run
 *  resolves exactly what this checkout resolves and writes nothing back. */
async function remoteCli(
  root: string,
  home: string,
  port: number,
  lock: string,
  ...args: string[]
) {
  const { code, stdout, stderr } = await new Deno.Command(Deno.execPath(), {
    args: [
      "run",
      "-A",
      "--config",
      CONFIG,
      `--lock=${lock}`,
      `http://127.0.0.1:${port}/framework/cli.ts`,
      ...args,
    ],
    cwd: root,
    env: { ...Deno.env.toObject(), SPRIG_HOME: home, NO_COLOR: "1" },
    stdin: "null",
    stdout: "piped",
    stderr: "piped",
  }).output();
  return {
    code,
    out: new TextDecoder().decode(stdout) + new TextDecoder().decode(stderr),
  };
}

Deno.test("REQ-016 AMENDMENT (e2e): the CLI run from a URL — no install root, as on jsr — builds `--ui-only ui` without restamping a stale /cli pin and prints no `sprig: stamped` line, and its refusal on the composed build carries the sentence with the <version> placeholder", async () => {
  const home = await Deno.makeTempDir({ prefix: "req016a-home-" });
  const base = await scaffoldedInfraRepo(home);
  const root = join(base, "app");
  const read = (rel: string) => Deno.readTextFile(join(root, rel));
  const lock = join(home, "deno.lock");
  await Deno.copyFile(join(REPO, "deno.lock"), lock);
  const served = serveTree(REPO);
  try {
    // the committed pin: stale, the shape a hosted build reads it in
    const cfg = JSON.parse(await read("deno.json"));
    cfg.imports["@techgoose-labs/sprig/cli"] =
      "jsr:@techgoose-labs/sprig@0.0.1/cli";
    // The client bundle imports the compiler's hydrate/hmr modules by absolute
    // URL off the CLI's own location — jsr.io in production, an allowed import
    // host; here the served host, which `deno bundle` would refuse. Map that
    // prefix back to this checkout, as the scaffold already maps the runtime.
    cfg.imports[`http://127.0.0.1:${served.port}/framework/`] = `${
      join(REPO, "framework")
    }/`;
    await Deno.writeTextFile(
      join(root, "deno.json"),
      JSON.stringify(cfg, null, 2) + "\n",
    );
    const committed = await read("deno.json");
    const serve = await read("serve.ts");

    // 1. the composed build, hosted: refuses, and the refusal says so — with
    //    the placeholder, because a URL run has no version on disk
    const composed = await remoteCli(root, home, served.port, lock, "build");
    assertEquals(
      composed.code,
      1,
      `the composed build on a hand-owned root must refuse:\n${composed.out}`,
    );
    assertStringIncludes(
      composed.out,
      "the pin you commit is the pin that ships",
    );
    assertStringIncludes(
      composed.out,
      `"@techgoose-labs/sprig/cli": "jsr:@techgoose-labs/sprig@<version>/cli"`,
    );
    assertEquals(await read("serve.ts"), serve, "the refusal rewrote serve.ts");
    assertEquals(
      await read("deno.json"),
      committed,
      "the refusal restamped deno.json",
    );

    // 2. the documented hosted form: builds, restamps nothing, says nothing
    //    about a stamp — the pin you commit is the pin that ships
    const hosted = await remoteCli(
      root,
      home,
      served.port,
      lock,
      "build",
      "--ui-only",
      "ui",
    );
    assertEquals(hosted.code, 0, `the hosted form failed:\n${hosted.out}`);
    for (const f of ["client.js", "app.css", "templates.json"]) {
      await Deno.stat(join(root, "ui", "static", f)); // throws if the bundle is missing
    }
    assertEquals(
      await read("deno.json"),
      committed,
      "a hosted build must not touch deno.json",
    );
    assert(
      !hosted.out.includes("sprig: stamped"),
      `a hosted build announced a stamp:\n${hosted.out}`,
    );

    // 3. the contrast: the same command as a LOCAL build moves the pin
    const local = await cli(root, home, "build", "--ui-only", "ui");
    assertEquals(local.code, 0, `the local build failed:\n${local.out}`);
    assertStringIncludes(local.out, "sprig: stamped");
    const cliV = JSON.parse(await Deno.readTextFile(CONFIG)).version as string;
    assertEquals(
      JSON.parse(await read("deno.json")).imports["@techgoose-labs/sprig/cli"],
      `jsr:@techgoose-labs/sprig@${cliV}/cli`,
      "the local build did not re-pin /cli",
    );
  } finally {
    await served.close();
    await Deno.remove(base, { recursive: true });
    await Deno.remove(home, { recursive: true });
  }
});
