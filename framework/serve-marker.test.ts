// REQ-010 (unit) — the generated-serve.ts marker counts only as the file's
// first-line banner, so a hand-owned composition root that merely MENTIONS the
// marker's name is never mistaken for a generated one.
import { assert, assertFalse } from "jsr:@std/assert@^1";
import { BEDROCK_SERVE_MARKER } from "@techgoose-labs/bedrock/artifact";
import {
  isGeneratedServe,
  LEGACY_SERVE_MARKER,
} from "./.sprig/serve-root.ts";

/** infra's real hand-owned composition root — the file the report says was
 *  overwritten (`git show HEAD:serve.ts` on the reporter's box). Its third line
 *  is what made `src.includes(MARKER)` say "generated". */
const INFRA_SERVE = `// infra's composition root — HAND-OWNED, deliberately.
//
// It carries no BEDROCK_SERVE_MARKER, and that is the point: the toolchain
// refuses to overwrite a serve.ts without the marker, so this file survives
// \`sprig build\`. infra needs that, because its \`ui\` slot is not a plain
// \`Frontend()\` — it is \`InfraFrontend()\`, which adds the public surfaces the
// old mod.ts used to bolt on outside the composition.
import { Bedrock } from "@techgoose-labs/bedrock";
import { Infra } from "@techgoose-labs/infra";
import { api } from "./server/bootstrap/mod.ts";
import { InfraFrontend } from "./public-surfaces.ts";
import { firebaseConfig } from "./firebase-config.ts";

(globalThis as { __firebaseConfig?: typeof firebaseConfig }).__firebaseConfig =
  firebaseConfig;

export default Bedrock({ ui: InfraFrontend(), backend: api, auth: Infra() });
`;

/** The banner `renderServe` writes — the first line of every 2.x generated root. */
const GENERATED_2X =
  `// ${BEDROCK_SERVE_MARKER} — the composition root at the git root.
//
//   deno serve -A serve.ts
import { Bedrock } from "@techgoose-labs/bedrock";
export default Bedrock({ ui: Frontend(), backend: api });
`;

/** The banner the 1.x CLI wrote — recognized so a 1.x app migrates in one build. */
const GENERATED_1X =
  `// ${LEGACY_SERVE_MARKER} — the single-origin composition root at the git root.
//
import { Frontend } from "@mrg-keystone/sprig/keep";
export default api.compose({ frontend: Frontend() });
`;

Deno.test("REQ-010 (unit): a hand-owned root that MENTIONS the marker is not generated", () => {
  assertFalse(isGeneratedServe(INFRA_SERVE));
});

Deno.test("REQ-010 (unit): prose naming the marker anywhere below line 1 is inert", () => {
  assertFalse(
    isGeneratedServe(`// my own root\n// not a ${BEDROCK_SERVE_MARKER} file\n`),
  );
  assertFalse(
    isGeneratedServe(`export default x; // ${BEDROCK_SERVE_MARKER}\n`),
  );
  // even on line 1 — the marker must be the FIRST thing in the banner, not buried in it
  assertFalse(
    isGeneratedServe(`// this file has no ${BEDROCK_SERVE_MARKER} in it\n`),
  );
});

Deno.test("REQ-010 (unit): a real generated root is still recognized — 2.x and 1.x", () => {
  assert(isGeneratedServe(GENERATED_2X));
  assert(isGeneratedServe(GENERATED_1X));
});

Deno.test("REQ-010 (unit): a generated banner survives a BOM and CRLF line endings", () => {
  assert(isGeneratedServe("﻿" + GENERATED_2X));
  assert(isGeneratedServe(GENERATED_2X.replace(/\n/g, "\r\n")));
});

Deno.test("REQ-010 (unit): an empty or marker-free file is not generated", () => {
  assertFalse(isGeneratedServe(""));
  assertFalse(isGeneratedServe("export default 1;\n"));
});
