// REQ-018 / REQ-019 (unit) — the composed build and the app's deno.json.
//
// coms 20260922T231859Z-w208-84791: "sprig build rewrites the root deno.json
// 'start' task and silently drops flags. … Before: "deno serve -A
// --env-file=.env --host 127.0.0.1 serve.ts". After: "deno serve -A
// --env-file=.env serve.ts" — the --host 127.0.0.1 is gone … Same run also
// deleted "@techgoose-labs/bedrock" … from server/deno.json's imports".
import { assert, assertEquals, assertFalse } from "@std/assert";
import { dirname, fromFileUrl, join } from "@std/path";
import { describeConfigEdits, runsCompositionRoot } from "./config-edits.ts";

const REPORTER_START =
  "deno serve -A --env-file=.env --host 127.0.0.1 serve.ts";
const INFRA_START = "KV_PATH=.local-kv.db deno serve -A --unstable-kv serve.ts";

Deno.test("REQ-018 (unit): a start task that runs the composition root is the author's — the reporter's --host 127.0.0.1 and infra's KV_PATH/--unstable-kv both qualify", () => {
  for (
    const task of [
      REPORTER_START,
      INFRA_START,
      "deno serve -A serve.ts",
      "deno serve -A --env-file=.env serve.ts",
      "deno serve -A ./serve.ts",
      "deno serve --allow-all --port 8080 serve.ts",
      "cd . && deno serve -A serve.ts",
      "sprig serve",
    ]
  ) {
    assert(runsCompositionRoot(task), `should be kept: ${task}`);
  }
});

Deno.test("REQ-018 (unit): a start task that does not run the composed root is stale — deno run, another entry, absent", () => {
  for (
    const task of [
      "deno run -A serve.ts", // 1.x: serve.ts listened itself
      "deno serve -A host.ts", // a different root
      "deno serve -A src/serve.ts", // not THE git-root serve.ts
      "deno run -A jsr:@sprig/core@0.12/cli serve",
      "",
      undefined,
      42,
    ]
  ) {
    assertFalse(runsCompositionRoot(task), `should be replaced: ${task}`);
  }
});

Deno.test("REQ-019 (unit): describeConfigEdits names a replaced start task with its old and new value", () => {
  const before = { tasks: { start: "deno run -A serve.ts", dev: "sprig dev" } };
  const after = {
    tasks: { start: "deno serve -A serve.ts", dev: "sprig dev" },
    workspace: ["./ui", "./server"],
  };
  const lines = describeConfigEdits("deno.json", before, after, {
    "tasks.start": "it did not run the composed root",
  });
  assertEquals(lines, [
    `deno.json: tasks.start "deno run -A serve.ts" → "deno serve -A serve.ts" (it did not run the composed root)`,
    `deno.json: + workspace "./ui", "./server"`,
  ]);
});

Deno.test("REQ-019 (unit): describeConfigEdits names a member import hoisted to the root, and says nothing when nothing changed", () => {
  const before = {
    name: "@x/server",
    imports: { "@techgoose-labs/bedrock": "jsr:@techgoose-labs/bedrock@^1" },
    unstable: ["kv"],
  };
  const after = { name: "@x/server", imports: {} };
  const lines = describeConfigEdits("server/deno.json", before, after, {
    "imports.@techgoose-labs/bedrock":
      'hoisted: root-only, resolved through deno.json\'s "jsr:@techgoose-labs/bedrock@^1"',
  });
  assertEquals(lines, [
    `server/deno.json: - imports.@techgoose-labs/bedrock "jsr:@techgoose-labs/bedrock@^1" (hoisted: root-only, resolved through deno.json's "jsr:@techgoose-labs/bedrock@^1")`,
    `server/deno.json: - unstable "kv"`,
  ]);
  // idempotent build: same config in, same config out → not a word
  assertEquals(
    describeConfigEdits("deno.json", after, structuredClone(after)),
    [],
  );
  assertEquals(describeConfigEdits("deno.json", null, {}), []);
});

Deno.test("REQ-018/019 (docs): cli.md's build section states the start-task rule and the root-only hoist", async () => {
  const here = dirname(fromFileUrl(import.meta.url));
  const doc = await Deno.readTextFile(
    join(here, "..", "..", "docs", "sprig", "cli.md"),
  );
  const start = doc.indexOf("## `build");
  assert(start >= 0, "cli.md has no build section");
  const end = doc.indexOf("\n## ", start + 1);
  const section = doc.slice(start, end < 0 ? undefined : end);
  for (
    const phrase of [
      "`start` task",
      "runs the composed root",
      "--host 127.0.0.1",
      "root-only",
      "server/deno.json",
      "one line each",
    ]
  ) {
    assert(section.includes(phrase), `build section lacks: ${phrase}`);
  }
});
