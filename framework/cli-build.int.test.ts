// REQ-067 (integration) — the real CLI on an app that lives INSIDE a larger git
// repo without being a package of it (fixtures/kennel-app in the sprig repo):
//   · `sprig build <app>` resolves the composition root serve.ts relative to the
//     APP root; absent, it refuses naming both paths it tried and `--ui-only`, and
//     touches nothing — the repo root's own serve.ts is never the app's;
//   · build-info.json is the app repo's HEAD, never the parent's .infra/git.json.
import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { dirname, fromFileUrl, join } from "@std/path";
import { BEDROCK_SERVE_MARKER } from "@techgoose-labs/bedrock/artifact";

const REPO = dirname(dirname(fromFileUrl(import.meta.url)));
const CLI = join(REPO, "framework", "cli.ts");
const CONFIG = join(REPO, "deno.json");

const PARENT_STAMP = {
  repo: "https://example.test/parent",
  commit: "219f86edc84f67bf6bdd75e6b62f650ce8126127",
  branch: "main",
  buildTime: "2026-07-16T20:31:49.548Z",
};

/** The repo root's OWN hand-written composition root — not the app's. */
const ROOT_SERVE = `// the parent project's hand-owned root
export default { fetch: () => new Response("parent") };
`;

/** The app's own flat composition root (src/ + static/ beside it). */
const APP_SERVE = `// ${BEDROCK_SERVE_MARKER} — the app's composition root.
import { Bedrock } from "@techgoose-labs/bedrock";
import { Frontend } from "@techgoose-labs/sprig/bedrock";
export default Bedrock({ ui: Frontend() });
`;

async function git(root: string, ...args: string[]): Promise<string> {
  const { code, stdout, stderr } = await new Deno.Command("git", {
    args: [
      "-C",
      root,
      "-c",
      "user.email=req067@test",
      "-c",
      "user.name=req067",
      "-c",
      "commit.gpgsign=false",
      ...args,
    ],
  }).output();
  if (code !== 0) throw new Error(new TextDecoder().decode(stderr));
  return new TextDecoder().decode(stdout).trim();
}

/** <root>/ — a git repo with its own serve.ts, a stamped .infra/git.json and a
 *  workspace that does NOT list the app — and <root>/fixtures/app, a sprig app. */
async function nestedApp(appServe: string | null) {
  const root = await Deno.makeTempDir({ prefix: "req067-" });
  await git(root, "init", "-q", "-b", "app-branch");
  await Deno.writeTextFile(join(root, "serve.ts"), ROOT_SERVE);
  await Deno.writeTextFile(
    join(root, "deno.json"),
    JSON.stringify({ workspace: ["./server"] }) + "\n",
  );
  await Deno.mkdir(join(root, ".infra"));
  await Deno.writeTextFile(
    join(root, ".infra", "git.json"),
    JSON.stringify(PARENT_STAMP),
  );
  const app = join(root, "fixtures", "app");
  await Deno.mkdir(join(app, "bootstrap"), { recursive: true });
  await Deno.mkdir(join(app, "src"), { recursive: true });
  await Deno.writeTextFile(
    join(app, "bootstrap", "template.html"),
    "<html><body><!--sprig-outlet--></body></html>\n",
  );
  await Deno.writeTextFile(join(app, "deno.json"), "{}\n");
  await Deno.writeTextFile(
    join(app, "src", "mod.ts"),
    "export const routes = [];\n",
  );
  if (appServe !== null) {
    await Deno.writeTextFile(join(app, "serve.ts"), appServe);
  }
  await git(root, "add", "-A");
  await git(root, "commit", "-q", "-m", "req067");
  return { root, app, head: await git(root, "rev-parse", "HEAD") };
}

async function sprig(cwd: string, ...args: string[]) {
  const { code, stdout, stderr } = await new Deno.Command(Deno.execPath(), {
    args: ["run", "-A", "--config", CONFIG, CLI, ...args],
    cwd,
    env: { ...Deno.env.toObject(), NO_COLOR: "1" },
  }).output();
  return {
    code,
    out: new TextDecoder().decode(stdout) + new TextDecoder().decode(stderr),
  };
}

/** Every file outside .git, path → text, so "touched nothing" is provable. */
async function snapshot(root: string): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  const walk = async (dir: string, rel: string) => {
    for await (const e of Deno.readDir(dir)) {
      if (e.name === ".git") continue;
      const p = join(dir, e.name);
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory) await walk(p, r);
      else files.set(r, await Deno.readTextFile(p));
    }
  };
  await walk(root, "");
  return files;
}

async function buildInfo(app: string): Promise<Record<string, unknown>> {
  return JSON.parse(
    await Deno.readTextFile(join(app, "static", "build-info.json")),
  );
}

Deno.test("REQ-067 (integration): no serve.ts at the app root → refuses naming both paths and --ui-only, touches nothing", async () => {
  const { root, app } = await nestedApp(null);
  try {
    const before = await snapshot(root);
    const { code, out } = await sprig(root, "build", "fixtures/app");
    assertEquals(code, 1, out);
    assertStringIncludes(
      out,
      `no serve.ts at ${app}; a UI-only build is \`--ui-only\``,
    );
    assertStringIncludes(out, join(app, "serve.ts"));
    assertStringIncludes(out, join(root, "serve.ts"));
    assertStringIncludes(out, "sprig build --ui-only fixtures/app");
    assertEquals(await snapshot(root), before);
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("REQ-067 (integration): the app's own serve.ts is its composition root — the build succeeds, both roots untouched, provenance is the app repo's HEAD", async () => {
  const { root, app, head } = await nestedApp(APP_SERVE);
  try {
    const { code, out } = await sprig(app, "build", ".");
    assertEquals(code, 0, out);
    assertStringIncludes(out, join(app, "serve.ts"));
    assertEquals(await Deno.readTextFile(join(app, "serve.ts")), APP_SERVE);
    assertEquals(await Deno.readTextFile(join(root, "serve.ts")), ROOT_SERVE);
    const info = await buildInfo(app);
    assertEquals(info.commit, head);
    assertEquals(info.branch, "app-branch");
    assert(
      typeof info.buildTime === "string" &&
        info.buildTime !== PARENT_STAMP.buildTime,
    );
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("REQ-067 (integration): `--ui-only` bakes the app repo's HEAD, never the parent's .infra/git.json", async () => {
  const { root, app, head } = await nestedApp(null);
  try {
    const { code, out } = await sprig(app, "build", "--ui-only", ".");
    assertEquals(code, 0, out);
    const info = await buildInfo(app);
    assertEquals(info.commit, head);
    assertEquals(info.branch, "app-branch");
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});
