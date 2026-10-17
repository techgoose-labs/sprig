// REQ-015 (integration) — the real CLI on a real tree whose root deno.json is
// JSONC: the stamp declines (the comment survives, the pin stays) and SAYS so
// on stderr; the same file without the comment is stamped and announced.
import { assertEquals, assertStringIncludes } from "@std/assert";
import { dirname, fromFileUrl, join } from "@std/path";

const REPO = dirname(dirname(fromFileUrl(import.meta.url)));
const CLI = join(REPO, "framework", "cli.ts");
const CONFIG = join(REPO, "deno.json");
const CLI_V = JSON.parse(Deno.readTextFileSync(CONFIG)).version as string;

const COMMENT =
  `  // REQ-010: \`build\` is --ui-only on purpose. Do not "simplify" this.\n`;
const ROOT_DENO_JSON = (comment: string) =>
  `{
${comment}  "workspace": ["./ui"],
  "tasks": { "build": "sprig build --ui-only ui" },
  "imports": {
    "@techgoose-labs/sprig": "jsr:@techgoose-labs/sprig@0.0.1",
    "@techgoose-labs/sprig/bedrock": "jsr:@techgoose-labs/sprig@0.0.1/bedrock"
  }
}
`;

/** A minimal ui/ under a root config — enough for `sprig build --ui-only ui`
 *  to reach the stamp (it runs before the client bundle, whose outcome on this
 *  fixture is not the point). */
async function repo(rootDenoJson: string): Promise<string> {
  const root = await Deno.makeTempDir({ prefix: "req015-" });
  await Deno.writeTextFile(join(root, "deno.json"), rootDenoJson);
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
  return root;
}

async function sprig(root: string, ...args: string[]) {
  const { stdout, stderr } = await new Deno.Command(Deno.execPath(), {
    args: ["run", "-A", "--config", CONFIG, CLI, ...args],
    cwd: root,
    env: { ...Deno.env.toObject(), NO_COLOR: "1" },
  }).output();
  return {
    out: new TextDecoder().decode(stdout),
    err: new TextDecoder().decode(stderr),
  };
}

Deno.test("REQ-015 (integration): a JSONC deno.json with a stale pin is left alone — comment intact — and the CLI says so on stderr", async () => {
  const root = await repo(ROOT_DENO_JSON(COMMENT));
  try {
    const { out, err } = await sprig(root, "build", "--ui-only", "ui");
    assertEquals(
      await Deno.readTextFile(join(root, "deno.json")),
      ROOT_DENO_JSON(COMMENT),
      "the stamp rewrote a JSONC file",
    );
    assertEquals(
      out.includes("sprig: stamped"),
      false,
      "nothing was stamped, so nothing may claim to be",
    );
    assertStringIncludes(err, "left unstamped", `no notice on stderr:\n${err}`);
    assertStringIncludes(err, join(root, "deno.json"));
    assertStringIncludes(err, "0.0.1");
    assertStringIncludes(err, CLI_V);
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("REQ-015 (integration): the same file without the comment is stamped, announced, and not warned about", async () => {
  const root = await repo(ROOT_DENO_JSON(""));
  try {
    const { out, err } = await sprig(root, "build", "--ui-only", "ui");
    assertStringIncludes(
      out,
      `sprig: stamped @techgoose-labs/sprig → ${CLI_V}`,
    );
    assertEquals(err.includes("left unstamped"), false);
    assertStringIncludes(
      await Deno.readTextFile(join(root, "deno.json")),
      `jsr:@techgoose-labs/sprig@${CLI_V}"`,
    );
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

// REQ-017 (integration) — the hosted form runs the CLI through an import-map
// entry, `@techgoose-labs/sprig/cli`; the real CLI stamps that entry with the
// runtime pins, in the same write, so the CLI a deploy builds with is the one
// that built locally (coms 20260921T190104Z-w5-80834).
const ROOT_DENO_JSON_HOSTED = `{
  "workspace": ["./ui"],
  "tasks": { "build": "deno run -A @techgoose-labs/sprig/cli build --ui-only ui" },
  "imports": {
    "@techgoose-labs/sprig": "jsr:@techgoose-labs/sprig@0.0.1",
    "@techgoose-labs/sprig/bedrock": "jsr:@techgoose-labs/sprig@0.0.1/bedrock",
    "@techgoose-labs/sprig/cli": "jsr:@techgoose-labs/sprig@0.0.1/cli"
  }
}
`;

Deno.test("REQ-017 (integration): a stale @techgoose-labs/sprig/cli pin in the root deno.json is stamped to the CLI version by `sprig build --ui-only ui`, in the same write as the runtime pins", async () => {
  const root = await repo(ROOT_DENO_JSON_HOSTED);
  try {
    const { out, err } = await sprig(root, "build", "--ui-only", "ui");
    assertStringIncludes(
      out,
      `sprig: stamped @techgoose-labs/sprig → ${CLI_V}`,
    );
    assertEquals(err.includes("left unstamped"), false);
    const cfg = JSON.parse(await Deno.readTextFile(join(root, "deno.json")));
    assertEquals(
      cfg.imports["@techgoose-labs/sprig/cli"],
      `jsr:@techgoose-labs/sprig@${CLI_V}/cli`,
      "the /cli mapping was left behind the runtime pins",
    );
    assertEquals(
      cfg.imports["@techgoose-labs/sprig"],
      `jsr:@techgoose-labs/sprig@${CLI_V}`,
    );
    assertEquals(
      cfg.imports["@techgoose-labs/sprig/bedrock"],
      `jsr:@techgoose-labs/sprig@${CLI_V}/bedrock`,
    );
    // the task is not the stamp's to touch
    assertEquals(
      cfg.tasks.build,
      "deno run -A @techgoose-labs/sprig/cli build --ui-only ui",
    );
    // and a second build has nothing left to stamp
    const again = await sprig(root, "build", "--ui-only", "ui");
    assertEquals(again.out.includes("sprig: stamped"), false, "not idempotent");
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});
