// REQ-056 (integration) — `isolate list` crashed "keep /http/get-discovery → 404":
// bedrock's one in-process client takes WIRE paths (the browser's), so the keep
// http controller lives at /api/http/<path>. The real in-process discovery on the
// fixture app must answer.
import { assert, assertEquals } from "#std/assert";
import { fromFileUrl } from "#std/path";
import { keep } from "./keep.ts";

const FIXTURE = fromFileUrl(
  new URL("../../fixtures/isolate/case-keys-app", import.meta.url),
);

Deno.test({
  name:
    "REQ-056: keep.discover reaches the discovery controller in-process (no 404)",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const r = await keep.discover(FIXTURE);
    assertEquals(r.problems, []);
    const keys = r.entries.flatMap((e) =>
      e.cases.map((c) => `${e.label}/${c.name}`)
    );
    assert(keys.includes("swatch/match"), keys.join(", "));
    assert(keys.includes("swatch/bare"), keys.join(", "));
  },
});
