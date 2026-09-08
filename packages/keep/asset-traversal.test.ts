import { assertEquals } from "@std/assert";
import { Frontend } from "./mod.ts";

// Minimal UI unit; the asset branch runs before app.fetch, so a stub app is fine.
// `Frontend`'s config parameter has a default, so `Parameters<typeof Frontend>[0]`
// includes `undefined` and cannot be indexed. NonNullable strips that.
const ui = Frontend({
  app: { fetch: () => new Response("app") } as unknown as NonNullable<
    Parameters<typeof Frontend>[0]
  >["app"],
  assetsDir: "static",
}).handler;

// BUG (cross-model lens Q3 / workflow security-2) — the path-traversal guard split
// only on "/", so a percent-encoded BACKSLASH (%5c) produced "..\\.." which has no
// "/"-delimited ".." segment → the guard passed. On Windows "\\" is a real path
// separator, so this escaped the assets dir (arbitrary file read). The guard must
// reject a ".." segment on EITHER separator.
Deno.test("serveAsset blocks an encoded backslash (%5c) traversal with 403", async () => {
  const res = await ui(new Request("http://h/ui/_assets/..%5c..%5csecret.txt"));
  assertEquals(res?.status, 403);
});

// control: the forward-slash encoded traversal was already blocked — must stay 403.
Deno.test("serveAsset blocks an encoded slash (%2f) traversal with 403", async () => {
  const res = await ui(new Request("http://h/ui/_assets/..%2f..%2fsecret.txt"));
  assertEquals(res?.status, 403);
});
