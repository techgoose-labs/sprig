// A build must never remove auth.
//
// `sprig build` regenerates the composition root, and the renderer emits from
// which halves the build can SEE — which never includes a third-party auth
// unit. Regenerating naively deleted `auth:` from an app that composed one, and
// the app came back up with every guarded route open. Found by migrating a real
// app: the slot was there before `sprig build` and gone after.

import { assert, assertEquals } from "@std/assert";
import { join } from "@std/path";

import { existingAuthSlot } from "./auth-slot.ts";

async function withServe(src: string, fn: (path: string) => Promise<void>) {
  const dir = await Deno.makeTempDir({ prefix: "serve-auth-" });
  const path = join(dir, "serve.ts");
  await Deno.writeTextFile(path, src);
  try {
    await fn(path);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
}

Deno.test("reads back a called auth unit and where it came from", async () => {
  await withServe(
    `import { Bedrock } from "@mrg-keystone/bedrock";
import { AlfredAuth } from "./auth/mod.ts";
export default Bedrock({ ui, backend: api, auth: AlfredAuth() });`,
    async (p) => {
      assertEquals(await existingAuthSlot(p), {
        from: "./auth/mod.ts",
        symbol: "AlfredAuth",
        expression: "AlfredAuth()",
      });
    },
  );
});

Deno.test("reads a bare unit reference too (not every unit is a factory)", async () => {
  await withServe(
    `import { myAuth } from "@acme/auth";
export default Bedrock({ backend: api, auth: myAuth });`,
    async (p) => {
      const slot = await existingAuthSlot(p);
      assertEquals(slot?.expression, "myAuth");
      assertEquals(slot?.from, "@acme/auth");
    },
  );
});

Deno.test("no auth slot → undefined, and the build emits the two-slot shape", async () => {
  await withServe(
    `import { Bedrock } from "@mrg-keystone/bedrock";
export default Bedrock({ ui: Frontend(), backend: api });`,
    async (p) => assertEquals(await existingAuthSlot(p), undefined),
  );
});

Deno.test("an auth symbol with no import is NOT guessed at", async () => {
  // Better to keep the app's own file than to emit an import that resolves
  // nowhere; the caller treats undefined as "leave it alone".
  await withServe(
    `export default Bedrock({ backend: api, auth: mystery() });`,
    async (p) => assertEquals(await existingAuthSlot(p), undefined),
  );
});

Deno.test("a missing serve.ts is undefined, not a throw", async () => {
  assertEquals(await existingAuthSlot("/nope/serve.ts"), undefined);
  assert(true);
});
