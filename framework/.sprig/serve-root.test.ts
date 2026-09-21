// A build must never remove what it cannot see, and must never claim a file it
// did not write.
//
// `sprig build` regenerates the composition root, and the renderer emits from
// which halves the build can SEE — which never includes a third-party auth unit
// or a custom ui unit. Regenerating naively deleted `auth:` from an app that
// composed one, and the app came back up with every guarded route open. Found by
// migrating a real app: the slot was there before `sprig build` and gone after.
// The ui slot is the same failure (REQ-012), reported against a keystone app
// whose own Frontend published the auth config the login path reads.
//
// The other half is which files it may rewrite at all (REQ-011): the marker test
// used to be a substring search over the whole file, so a hand-written root that
// merely NAMED the marker — in the comment explaining that it deliberately has
// none — was classified as generated, overwritten by `sprig build` and DELETED
// by `sprig clean`.

import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { join } from "@std/path";

import {
  existingAuthSlot,
  existingUiSlot,
  isGeneratedServe,
  planServeRoot,
} from "./serve-root.ts";

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
    `import { Bedrock } from "@techgoose-labs/bedrock";
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

// ------------------------------------------------------------ REQ-011 (marker)

const GENERATED_2X =
  `// BEDROCK_SERVE_MARKER — the composition root at the git root.
//
// One call composes the app: every dispatch enters the root, so the guard
// covers every channel and every cross-unit call is instrumented.
import { Bedrock } from "@techgoose-labs/bedrock";

export default Bedrock({ ui: Frontend(), backend: api });
`;

const GENERATED_1X =
  "// GENERATED by `sprig build --rune` — the single-origin composition root at the git root.\n" +
  `//
import { serveSprig } from "@sprig/keep";

export default serveSprig({ keep: api, app: sprigApp });
`;

// Verbatim from the app this was reported against: the sentence documenting the
// protection is what disabled it.
const HAND_WRITTEN_NAMING_THE_MARKER =
  `// The composition root — HAND-WRITTEN, owned by this repo.
//
// It carries no BEDROCK_SERVE_MARKER, and that is the point: the toolchain
// refuses to overwrite a serve.ts without the marker, so this file survives
// \`sprig build\`.
import { Bedrock } from "@techgoose-labs/bedrock";
import { InfraFrontend } from "./ui/infra.ts";

export default Bedrock({ ui: InfraFrontend(), backend: api });
`;

Deno.test("REQ-011: the generated header line is a generated root", () => {
  assert(isGeneratedServe(GENERATED_2X));
});

Deno.test("REQ-011: the legacy 1.x header line still counts as generated", () => {
  // Refusing it stranded every 1.x app one step into the migration.
  assert(isGeneratedServe(GENERATED_1X));
});

Deno.test("REQ-011: prose that names the marker is not a generated root", () => {
  assert(!isGeneratedServe(HAND_WRITTEN_NAMING_THE_MARKER));
});

Deno.test("REQ-011: the marker named further down the file is not a generated root", () => {
  assert(
    !isGeneratedServe(
      `import { Bedrock } from "@techgoose-labs/bedrock";

// This root is hand-written: no BEDROCK_SERVE_MARKER, so the build leaves it.
export default Bedrock({ backend: api });
`,
    ),
  );
});

Deno.test("REQ-011: the marker in a string literal is not a generated root", () => {
  assert(
    !isGeneratedServe(
      `export const why = "we never write BEDROCK_SERVE_MARKER here";\n`,
    ),
  );
});

Deno.test("REQ-011: a pragma above the marker line keeps the root generated", () => {
  // The marker is a LINE of the leading comment block, not necessarily line 1 —
  // a lint pragma prepended to a generated root must not orphan it.
  assert(
    isGeneratedServe(`// deno-lint-ignore-file\n${GENERATED_2X}`),
  );
});

Deno.test("REQ-011: a blank leading line keeps the root generated", () => {
  assert(isGeneratedServe(`\n\n${GENERATED_2X}`));
});

Deno.test("REQ-011: code above the marker ends the leading comment block", () => {
  // Once real code has started, a later `// BEDROCK_SERVE_MARKER` line is the
  // app's own prose (or a fixture string), not the header this writer emits.
  assert(
    !isGeneratedServe(
      `import { Bedrock } from "@techgoose-labs/bedrock";
// BEDROCK_SERVE_MARKER — mentioned on purpose, below the imports.
export default Bedrock({ backend: api });
`,
    ),
  );
});

Deno.test("REQ-011: an empty file is not a generated root", () => {
  assert(!isGeneratedServe(""));
});

// ------------------------------------------------- REQ-014 (one instruction)
//
// Two fixes for the same clobbered root shipped two different instructions to
// the same app: "wrap the generated root" and "sprig build --ui-only". Only the
// second is true of a root that does anything besides compose — and the
// reporter's does: one line of top-level code before `Bedrock()`.

const PLAN_OPTS = { uiRel: "ui", serverRel: "server", assetsRel: "ui/static" };

/** infra's real root: its own `ui:` unit AND top-level code before compose. */
const INFRA_ROOT_WITH_TOP_LEVEL_CODE =
  `// infra's composition root — HAND-OWNED, deliberately.
//
// It carries no BEDROCK_SERVE_MARKER, and that is the point: the toolchain
// refuses to overwrite a serve.ts without the marker, so this file survives
// \`sprig build\`.
import { Bedrock } from "@techgoose-labs/bedrock";
import { Infra } from "@techgoose-labs/infra";
import { api } from "./server/bootstrap/mod.ts";
import { InfraFrontend } from "./public-surfaces.ts";
import { firebaseConfig } from "./firebase-config.ts";

// Published in-process so the auth unit and the session adapter read the
// canonical project id without an env round-trip. Must happen before compose.
(globalThis as { __firebaseConfig?: typeof firebaseConfig }).__firebaseConfig =
  firebaseConfig;

export default Bedrock({ ui: InfraFrontend(), backend: api, auth: Infra() });
`;

Deno.test("REQ-014: a root that runs top-level code before compose is kept — regeneration could not carry that line", async () => {
  await withServe(INFRA_ROOT_WITH_TOP_LEVEL_CODE, async (p) => {
    const plan = await planServeRoot(p, PLAN_OPTS);
    assertEquals(plan.action, "keep");
    assertEquals(await Deno.readTextFile(p), INFRA_ROOT_WITH_TOP_LEVEL_CODE);
  });
});

Deno.test("REQ-014: the refusal gives ONE instruction first — `sprig build --ui-only <ui>` — and only then the marker-line opt-in", async () => {
  await withServe(INFRA_ROOT_WITH_TOP_LEVEL_CODE, async (p) => {
    const plan = await planServeRoot(p, {
      ...PLAN_OPTS,
      uiRel: "web",
      assetsRel: "web/static",
    });
    assert(plan.action === "keep");
    const { reason } = plan;
    const uiOnly = reason.indexOf("sprig build --ui-only web");
    const marker = reason.indexOf("BEDROCK_SERVE_MARKER");
    assert(
      uiOnly >= 0,
      `the refusal must name the --ui-only build for the app's OWN ui dir:\n${reason}`,
    );
    assert(
      marker >= 0,
      `the refusal must still say how a pure-composition root opts back in:\n${reason}`,
    );
    assert(
      uiOnly < marker,
      `--ui-only is the instruction; the marker line is the footnote:\n${reason}`,
    );
    // …and it says what the opt-in does NOT carry, so nobody stamps a root
    // that runs top-level code and loses that line on the next build.
    assertStringIncludes(reason, "top-level code");
    assertStringIncludes(
      reason,
      "--ui-only",
      "the top-level-code case must be routed to --ui-only",
    );
    // the wrapper is not an instruction the toolchain gives
    assert(
      !/\bwrap/i.test(reason),
      `the wrapper is not the toolchain's instruction:\n${reason}`,
    );
  });
});

Deno.test("REQ-014: a 2.x root whose prose quotes the 1.x banner is generated, and not flagged legacy", async () => {
  const src = `// BEDROCK_SERVE_MARKER — the composition root at the git root.
//
// (Before 2.x this file opened with "GENERATED by \`sprig build --rune\`".)
import { Bedrock } from "@techgoose-labs/bedrock";
import { api } from "./server/bootstrap/mod.ts";

export default Bedrock({ backend: api });
`;
  assert(isGeneratedServe(src));
  await withServe(src, async (p) => {
    const plan = await planServeRoot(p, PLAN_OPTS);
    assert(plan.action === "write");
    assertEquals(
      plan.legacy,
      false,
      "legacy is decided by the banner line, not by the words anywhere in the file",
    );
  });
});

Deno.test("REQ-014: §3a routes a root with top-level code to --ui-only, never to the wrapper", async () => {
  const doc = await Deno.readTextFile(
    new URL("../../docs/sprig/migrating-1x-to-2x.md", import.meta.url),
  );
  const s3a = doc.slice(doc.indexOf("### 3a."), doc.indexOf("### 3b."));
  assert(s3a.length > 0, "§3a not found");
  assertStringIncludes(s3a, "sprig build --ui-only ui");
  // every paragraph that names top-level code must give the instruction in
  // the same breath — the two fixes disagreed exactly here.
  const paras = s3a.split(/\n\s*\n/).filter((p) => /top-level code/i.test(p));
  assert(paras.length > 0, "§3a must name the top-level-code case explicitly");
  for (const p of paras) {
    assertStringIncludes(
      p,
      "--ui-only",
      `a §3a paragraph names top-level code without --ui-only:\n${p}`,
    );
    assert(
      !/\bwrap/i.test(p),
      `a §3a paragraph routes top-level code to the wrapper:\n${p}`,
    );
  }
});
