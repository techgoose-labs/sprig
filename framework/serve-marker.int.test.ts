// REQ-010 (integration) — the real CLI on a real composed tree: refusing a
// hand-owned composition root leaves EVERY file byte-identical, and a genuinely
// generated one is still regenerated and still cleaned.
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@^1";
import { dirname, fromFileUrl, join } from "@std/path";
import { BEDROCK_SERVE_MARKER } from "@techgoose-labs/bedrock/artifact";

const REPO = dirname(dirname(fromFileUrl(import.meta.url)));
const CLI = join(REPO, "framework", "cli.ts");
const CONFIG = join(REPO, "deno.json");

/** A hand-owned composition root whose header explains it has no marker — the
 *  shape the report was filed against. */
const HAND_OWNED = `// my composition root — HAND-OWNED, deliberately.
//
// It carries no ${BEDROCK_SERVE_MARKER}, and that is the point: the toolchain
// refuses to overwrite a serve.ts without the marker, so this file survives
// \`sprig build\`.
import { Bedrock } from "@techgoose-labs/bedrock";
import { api } from "./server/bootstrap/mod.ts";
import { MyFrontend } from "./public-surfaces.ts";

export default Bedrock({ ui: MyFrontend(), backend: api });
`;

const GENERATED =
  `// ${BEDROCK_SERVE_MARKER} — the composition root at the git root.
//
//   deno serve -A serve.ts
import { Bedrock } from "@techgoose-labs/bedrock";
import { Frontend } from "@techgoose-labs/sprig/bedrock";
import { api } from "./server/bootstrap/mod.ts";

export default Bedrock({ ui: Frontend(), backend: api });
`;

const ROOT_DENO_JSON = `{
  "workspace": ["./ui", "./server"],
  "tasks": { "start": "KV_PATH=.local-kv.db deno serve -A --unstable-kv serve.ts" }
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
 *  the UI package, find the keep backend, and reach the serve.ts guard. */
async function composedRepo(serveSrc: string): Promise<string> {
  const root = await Deno.makeTempDir({ prefix: "req010-" });
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

/** Every file in the tree, path → bytes, so "touched nothing" is provable. */
async function snapshot(root: string): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  const walk = async (dir: string, rel: string) => {
    for await (const e of Deno.readDir(dir)) {
      const p = join(dir, e.name);
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory) await walk(p, r);
      else files.set(r, await Deno.readTextFile(p));
    }
  };
  await walk(root, "");
  return files;
}

Deno.test("REQ-010 (integration): sprig build refuses a hand-owned root and leaves the tree byte-identical", async () => {
  const root = await composedRepo(HAND_OWNED);
  try {
    const before = await snapshot(root);
    const { code, out } = await sprig(root, "build");

    assertEquals(code, 1, `expected a refusal, got exit ${code}:\n${out}`);
    assertStringIncludes(out, "already exists and was NOT generated");

    // the whole point: the refusal comes BEFORE every write --rune would make.
    const after = await snapshot(root);
    assertEquals(
      [...after.keys()].sort(),
      [...before.keys()].sort(),
      "the refused build created or removed files",
    );
    for (const [path, body] of before) {
      assertEquals(after.get(path), body, `the refused build rewrote ${path}`);
    }
    // named individually, because each was a separate casualty in the report
    assertEquals(await Deno.readTextFile(join(root, "serve.ts")), HAND_OWNED);
    assertStringIncludes(
      await Deno.readTextFile(join(root, "deno.json")),
      "KV_PATH=.local-kv.db deno serve -A --unstable-kv serve.ts",
    );
    assertStringIncludes(
      await Deno.readTextFile(join(root, "server", "deno.json")),
      "@techgoose-labs/bedrock",
    );
    assertEquals(
      await Deno.stat(join(root, ".gitignore")).then(() => true).catch(() =>
        false
      ),
      false,
      "the refused build added a .gitignore",
    );
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("REQ-010 (integration): the refusal names the way an app that hand-owns its root still builds", async () => {
  const root = await composedRepo(HAND_OWNED);
  try {
    const { out } = await sprig(root, "build");
    assertStringIncludes(out, "--ui-only");
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("REQ-010 (integration): a genuinely generated root still gets past the guard and regenerated", async () => {
  const root = await composedRepo(
    GENERATED.replace("Frontend()", "Frontend() /* stale */"),
  );
  try {
    // The client build that follows needs a real sprig UI, which this fixture is
    // not — but `emitRuneComposition` runs FIRST in build(), so serve.ts is
    // rewritten before anything downstream can matter. Assert exactly that.
    const { out } = await sprig(root, "build");
    const after = await Deno.readTextFile(join(root, "serve.ts"));

    assert(
      !out.includes("already exists and was NOT generated"),
      `the guard refused a generated root:\n${out}`,
    );
    assert(
      after.startsWith(`// ${BEDROCK_SERVE_MARKER}`),
      `serve.ts was not regenerated:\n${after}`,
    );
    assert(!after.includes("/* stale */"), "the stale root survived");
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("REQ-010 (integration): sprig clean removes a generated root and spares a hand-owned one", async () => {
  const generated = await composedRepo(GENERATED);
  const handOwned = await composedRepo(HAND_OWNED);
  try {
    const g = await sprig(generated, "clean");
    assertEquals(g.code, 0, g.out);
    assertEquals(
      await Deno.stat(join(generated, "serve.ts")).then(() => true).catch(() =>
        false
      ),
      false,
      "sprig clean left the generated root behind",
    );

    const h = await sprig(handOwned, "clean");
    assertEquals(h.code, 0, h.out);
    assertEquals(
      await Deno.readTextFile(join(handOwned, "serve.ts")),
      HAND_OWNED,
      "sprig clean deleted a hand-owned root",
    );
  } finally {
    await Deno.remove(generated, { recursive: true });
    await Deno.remove(handOwned, { recursive: true });
  }
});

// ------------------------------------------------- REQ-014 (one instruction)

/** A hand-owned root that does more than compose: one line of top-level code
 *  before `Bedrock()`. No regeneration can carry that line, so this root is
 *  hand-owned for good — the case the refusal's instruction has to fit. */
const HAND_OWNED_WITH_TOP_LEVEL_CODE = HAND_OWNED.replace(
  "\nexport default Bedrock(",
  `
(globalThis as { __config?: unknown }).__config = { projectId: "keystone" };

export default Bedrock(`,
);

Deno.test("REQ-014 (integration): `sprig build --ui-only <ui>` never enters the composition — the hand-owned root, server/deno.json and the ignore file are untouched", async () => {
  const root = await composedRepo(HAND_OWNED_WITH_TOP_LEVEL_CODE);
  try {
    const before = await snapshot(root);
    // Whether this minimal fixture's client bundle completes is the e2e's
    // business (it uses a real scaffold); here the claim is only that the
    // --ui-only path is composition-free, whatever happens downstream.
    const { out } = await sprig(root, "build", "--ui-only", "ui");

    assert(
      !out.includes("was NOT generated"),
      `--ui-only reached the composition root guard:\n${out}`,
    );
    assertEquals(
      await Deno.readTextFile(join(root, "serve.ts")),
      HAND_OWNED_WITH_TOP_LEVEL_CODE,
      "--ui-only rewrote the hand-owned root",
    );
    assertEquals(
      await Deno.stat(join(root, ".gitignore")).then(() => true).catch(() =>
        false
      ),
      false,
      "--ui-only added a .gitignore entry",
    );
    assertEquals(
      await Deno.readTextFile(join(root, "server", "deno.json")),
      before.get("server/deno.json"),
      "--ui-only ran the workspace merge (server/deno.json changed)",
    );
    assertStringIncludes(
      await Deno.readTextFile(join(root, "deno.json")),
      "KV_PATH=.local-kv.db deno serve -A --unstable-kv serve.ts",
      "--ui-only rewrote the start task",
    );
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});
