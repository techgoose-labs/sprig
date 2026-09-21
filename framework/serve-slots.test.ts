// A build must never remove what it cannot see.
//
// `sprig build` regenerates the composition root, and the renderer emits from
// which halves the build can SEE — which never includes a third-party auth unit.
// Regenerating naively deleted `auth:` from an app that composed one, and the app
// came back up with every guarded route open. Found by migrating a real app: the
// slot was there before `sprig build` and gone after.
//
// The `ui:` slot is the same failure, one slot over (REQ-012): reported against a
// keystone app composing its own `InfraFrontend()`, replaced by a plain
// `Frontend()` on every build — and its Frontend is what serves the routes the
// app's own auth path reads.

import { assert, assertEquals } from "@std/assert";
import { join } from "@std/path";

import { existingAuthSlot, existingUiSlot } from "./.sprig/serve-slots.ts";

async function withServe(src: string, fn: (path: string) => Promise<void>) {
  const dir = await Deno.makeTempDir({ prefix: "serve-slots-" });
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
    `import { Bedrock } from "@techgoose-labs/bedrock";
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
    `import { Bedrock } from "@techgoose-labs/bedrock";
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

// ---------------------------------------------------------------- REQ-012 (ui)

Deno.test("REQ-012: reads back a custom ui unit and where it came from", async () => {
  await withServe(
    `// BEDROCK_SERVE_MARKER — the composition root at the git root.
import { Bedrock } from "@techgoose-labs/bedrock";
import { InfraFrontend } from "./ui/infra.ts";
import { api } from "./server/bootstrap/mod.ts";

export default Bedrock({ ui: InfraFrontend(), backend: api });`,
    async (p) => {
      assertEquals(await existingUiSlot(p), {
        from: "./ui/infra.ts",
        symbol: "InfraFrontend",
        expression: "InfraFrontend()",
      });
    },
  );
});

Deno.test("REQ-012: the default Frontend() reads back as itself (regeneration is idempotent)", async () => {
  await withServe(
    `import { Bedrock } from "@techgoose-labs/bedrock";
import { Frontend } from "@techgoose-labs/sprig/bedrock";
import { api } from "./server/bootstrap/mod.ts";

export default Bedrock({ ui: Frontend(), backend: api });`,
    async (p) => {
      assertEquals(await existingUiSlot(p), {
        from: "@techgoose-labs/sprig/bedrock",
        symbol: "Frontend",
        expression: "Frontend()",
      });
    },
  );
});

Deno.test("REQ-012: a unit configured with an object argument keeps its argument", async () => {
  await withServe(
    `import { Frontend } from "@techgoose-labs/sprig/bedrock";
import { sprigApp } from "./src/mod.ts";
export default Bedrock({ ui: Frontend({ app: sprigApp }) });`,
    async (p) => {
      assertEquals(
        (await existingUiSlot(p))?.expression,
        "Frontend({ app: sprigApp })",
      );
    },
  );
});

Deno.test("REQ-012: a nested call in the argument is carried whole, not cut at the first `)`", async () => {
  // A regex like /\([^)]*\)/ truncates this to `Frontend({ app: build({ x: 1 })`
  // and emits a serve.ts that does not parse.
  await withServe(
    `import { Frontend } from "@acme/ui";
export default Bedrock({ ui: Frontend({ app: build({ x: 1 }) }), backend: api });`,
    async (p) => {
      assertEquals(
        (await existingUiSlot(p))?.expression,
        "Frontend({ app: build({ x: 1 }) })",
      );
    },
  );
});

Deno.test("REQ-012: an unbalanced argument list is left alone rather than half-copied", async () => {
  await withServe(
    `import { Frontend } from "@acme/ui";
export default Bedrock({ ui: Frontend({ app`,
    async (p) => assertEquals(await existingUiSlot(p), undefined),
  );
});

Deno.test("REQ-012: a ui symbol with no import is NOT guessed at", async () => {
  await withServe(
    `export default Bedrock({ ui: mystery(), backend: api });`,
    async (p) => assertEquals(await existingUiSlot(p), undefined),
  );
});

Deno.test("REQ-012: no ui slot → undefined (the build supplies its own Frontend)", async () => {
  await withServe(
    `import { Bedrock } from "@techgoose-labs/bedrock";
export default Bedrock({ backend: api });`,
    async (p) => assertEquals(await existingUiSlot(p), undefined),
  );
});

Deno.test("REQ-012: a missing serve.ts is undefined, not a throw", async () => {
  assertEquals(await existingUiSlot("/nope/serve.ts"), undefined);
});
