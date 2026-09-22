// REQ-010 (unit) — the generated-serve.ts marker counts only as the file's
// first-line banner, so a hand-owned composition root that merely MENTIONS the
// marker's name is never mistaken for a generated one.
import { assert, assertFalse, assertStringIncludes } from "jsr:@std/assert@^1";
import { BEDROCK_SERVE_MARKER } from "@techgoose-labs/bedrock/artifact";
import {
  handOwnedRefusal,
  isGeneratedServe,
  isLegacyServe,
  LEGACY_SERVE_MARKER,
} from "./.sprig/serve-marker.ts";

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

// ------------------------------------------------- REQ-014 (one instruction)
//
// Two fixes for the same clobbered root (REQ-010, REQ-011/012) shipped two
// different instructions to the same app — "stamp the marker line" and
// "sprig build --ui-only". Only --ui-only is true of a root that does anything
// besides compose, and one line of top-level code before `Bedrock()` is enough:
// regeneration carries the slots and nothing else. So the refusal gives that
// instruction FIRST, for the app's own ui dir, and never suggests a wrapper.

Deno.test("REQ-014 (unit): infra's root — top-level code before compose — is hand-owned, and its refusal names --ui-only for its own ui dir", () => {
  assertFalse(isGeneratedServe(INFRA_SERVE));
  const reason = handOwnedRefusal("/repo/serve.ts", "web");
  assertStringIncludes(reason, "sprig build --ui-only web");
  assertStringIncludes(
    reason,
    "top-level code",
    "the refusal must name the one easily-overlooked line that makes a root hand-owned for good",
  );
});

Deno.test("REQ-014 (unit): the refusal gives ONE instruction first — `sprig build --ui-only <ui>` — and the marker line only after it", () => {
  const reason = handOwnedRefusal("/repo/serve.ts", "ui");
  assertStringIncludes(reason, "already exists and was NOT generated");
  const uiOnly = reason.indexOf("sprig build --ui-only ui");
  const marker = reason.indexOf(BEDROCK_SERVE_MARKER);
  assert(uiOnly >= 0, `the refusal must name the --ui-only build:\n${reason}`);
  assert(
    marker >= 0,
    `the refusal must still say how a pure-composition root opts in:\n${reason}`,
  );
  assert(
    uiOnly < marker,
    `--ui-only is the instruction; the marker line is the footnote:\n${reason}`,
  );
  assert(
    !/\bwrap/i.test(reason),
    `the wrapper is not the toolchain's instruction:\n${reason}`,
  );
});

Deno.test("REQ-014 (unit): a 2.x root whose prose quotes the 1.x banner is generated, and not legacy", () => {
  const src =
    `// ${BEDROCK_SERVE_MARKER} — the composition root at the git root.
//
// (Before 2.x this file opened with "${LEGACY_SERVE_MARKER}".)
import { Bedrock } from "@techgoose-labs/bedrock";
export default Bedrock({ backend: api });
`;
  assert(isGeneratedServe(src));
  assertFalse(
    isLegacyServe(src),
    "legacy is decided by the banner line, not the old banner's words anywhere",
  );
  assert(isLegacyServe(GENERATED_1X));
});

Deno.test("REQ-014 (unit): §3a gives the hand-owned root the same instruction in the same order — --ui-only before the marker line, top-level code named there and never routed to the wrapper", async () => {
  const doc = await Deno.readTextFile(
    new URL("../docs/sprig/migrating-1x-to-2x.md", import.meta.url),
  );
  const s3a = doc.slice(doc.indexOf("### 3a."), doc.indexOf("### 3b."));
  assert(s3a.length > 0, "§3a not found");
  assertStringIncludes(s3a, "sprig build --ui-only ui");
  const paras = s3a.split(/\n\s*\n/);
  const naming = paras.filter((p) => /top-level code/i.test(p));
  assert(naming.length > 0, "§3a must name the top-level-code case explicitly");
  for (const p of naming) {
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
  const handOwn = paras.findIndex((p) =>
    p.startsWith("**You hand-own the root on purpose**")
  );
  const markerCase = paras.findIndex((p) =>
    p.startsWith("**You wrote it only to keep your OWN `ui:` unit**")
  );
  assert(handOwn >= 0 && markerCase >= 0, "§3a lost one of its two cases");
  assert(
    handOwn < markerCase,
    "§3a lists the marker-line case before the --ui-only case; the refusal says the opposite",
  );
  assert(
    /top-level code/i.test(paras[handOwn]),
    `the hand-own case must name top-level code itself:\n${paras[handOwn]}`,
  );
});
