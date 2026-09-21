// REQ-013 (docs) — migrating-1x-to-2x.md §3a scopes `sprig build --ui-only` PER
// APP and states both deploy shapes. The first cut of the guide told a reader to
// point "your deploy preset's build command" at it; infra's preset is shared by
// every app it deploys, and for a generated-root app `--ui-only` emits no
// serve.ts at all — the deploy has no entrypoint (coms 20260921T190104Z-w5-80834).
import { assert, assertStringIncludes } from "@std/assert";

const DOC = new URL("../../docs/sprig/migrating-1x-to-2x.md", import.meta.url);

/** The text of §3a alone — the section that owns the customised-serve.ts
 *  story — with its prose unwrapped, so a phrase can be asserted whole. */
async function section3a(): Promise<string> {
  const doc = await Deno.readTextFile(DOC);
  const start = doc.indexOf("### 3a.");
  const end = doc.indexOf("### 3b.");
  assert(start >= 0 && end > start, "§3a / §3b headings moved");
  return doc.slice(start, end).replace(/\s+/g, " ");
}

Deno.test("REQ-013 (docs): §3a scopes --ui-only to the app's own build command, never a shared preset", async () => {
  const s = await section3a();
  assertStringIncludes(s, "sprig build --ui-only ui");
  assert(
    !s.includes("deploy preset's build command"),
    "§3a still tells the reader to switch a deploy PRESET to --ui-only",
  );
  assertStringIncludes(s, "has to stay on the composed build");
});

Deno.test("REQ-013 (docs): §3a states both deploy shapes — a generated root gitignored, a hand-owned root committed", async () => {
  const s = await section3a();
  assertStringIncludes(s, "| generated");
  assertStringIncludes(s, "| hand-owned");
  assertStringIncludes(
    s,
    "committing `serve.ts` is what makes a root hand-owned",
  );
});
