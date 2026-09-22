// REQ-014 (unit) — what the CLI imports is what the package ships.
//
// Two branches fixing the same bug each moved the composition-root code into a
// module of their own name. Merging one over the other would have deleted
// framework/.sprig/serve-marker.ts with NO conflict — while cli.ts still
// imported it and deno.json still listed it — and only `deno publish` would
// have noticed, on the release an app was waiting for (coms
// 20260921T191537Z-w5-86466, relayed from box 199). These two checks make that
// a red test instead.
import { assertEquals } from "jsr:@std/assert@^1";
import { dirname, fromFileUrl, join } from "@std/path";

const REPO = dirname(dirname(fromFileUrl(import.meta.url)));

async function publishInclude(): Promise<string[]> {
  const cfg = JSON.parse(await Deno.readTextFile(join(REPO, "deno.json")));
  return cfg.publish.include as string[];
}

Deno.test("REQ-014 (unit): every deno.json publish.include entry exists on disk", async () => {
  const gone: string[] = [];
  for (const p of await publishInclude()) {
    try {
      await Deno.stat(join(REPO, p));
    } catch {
      gone.push(p);
    }
  }
  assertEquals(
    gone,
    [],
    "publish.include names files that no longer exist — a module was deleted but is still shipped",
  );
});

Deno.test("REQ-014 (unit): every relative module framework/cli.ts imports is in publish.include", async () => {
  const include = await publishInclude();
  const covered = (p: string) =>
    include.includes(p) ||
    include.some((i) => i.endsWith("/") && p.startsWith(i));
  const cli = await Deno.readTextFile(join(REPO, "framework", "cli.ts"));
  const missing: string[] = [];
  for (const [, spec] of cli.matchAll(/from\s+"(\.\.?\/[^"]+)"/g)) {
    const path = spec.startsWith("./")
      ? `framework/${spec.slice(2)}`
      : spec.replace(/^\.\.\//, "");
    if (!covered(path)) missing.push(path);
  }
  assertEquals(
    missing,
    [],
    "cli.ts imports modules the published package would not contain",
  );
});
