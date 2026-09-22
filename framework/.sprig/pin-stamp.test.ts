// Regression tests for the pin-stamp/migration contract. The founding incident:
// a stale 0.21.1 CLI ran `sprig build` on an app pinned to @techgoose-labs/sprig@1.0.0
// and silently DOWNGRADED the pin to 0.21.1 (via the legacy-name migration path,
// which restamped EVERY entry's version) — resurrecting a fixed SSR bug.
import { assert, assertEquals, assertStringIncludes, assertThrows } from "@std/assert";
import {
  declinedStampNotice,
  hasLegacyRuntimeName,
  migrateImports,
  migrateKey,
  migrateSource,
  pinnedSprigVersion,
  sprigImportsInText,
  stampImports,
} from "./pin-stamp.ts";

Deno.test("stampImports upgrades an older pin to the CLI version", () => {
  const res = stampImports(
    { "@techgoose-labs/sprig": "jsr:@techgoose-labs/sprig@0.20.0" },
    "1.0.0",
  );
  assert(res.changed);
  assertEquals(
    res.imports["@techgoose-labs/sprig"],
    "jsr:@techgoose-labs/sprig@1.0.0",
  );
  assertEquals(res.aheadPin, null);
});

Deno.test("stampImports NEVER downgrades a pin ahead of the CLI", () => {
  const imports = {
    "@techgoose-labs/sprig": "jsr:@techgoose-labs/sprig@1.0.0",
    "@techgoose-labs/sprig/keep": "jsr:@techgoose-labs/sprig@1.0.0/keep",
  };
  const res = stampImports(imports, "0.21.1");
  assert(!res.changed, "an ahead pin must be left alone");
  assertEquals(res.imports, imports);
  assertEquals(res.aheadPin, "1.0.0", "the caller warns with the kept pin");
});

Deno.test("stampImports handles range pins (^/~) and local overrides", () => {
  // range ahead of the CLI → kept
  const ahead = stampImports({
    "@techgoose-labs/sprig": "jsr:@techgoose-labs/sprig@^2",
  }, "1.0.0");
  assert(!ahead.changed);
  assertEquals(ahead.aheadPin, "2");
  // local override → never touched
  const local = stampImports({
    "@techgoose-labs/sprig": "../sprig/main/framework/mod.ts",
  }, "1.0.0");
  assert(!local.changed);
  // absent key → never added
  const absent = stampImports({ "@std/path": "jsr:@std/path@^1" }, "1.0.0");
  assert(!absent.changed);
});

Deno.test("migrateImports is a BYTE-IDENTICAL no-op on a CURRENT app", () => {
  const imports = {
    "@techgoose-labs/sprig": "jsr:@techgoose-labs/sprig@2.0.0",
    // `/bedrock`, not `/keep` — the fixture moved with the subpath, because a
    // map still on `/keep` HAS something to migrate (see the test above).
    "@techgoose-labs/sprig/bedrock": "jsr:@techgoose-labs/sprig@2.0.0/bedrock",
    "@std/path": "jsr:@std/path@^1",
  };
  // the CLI is OLDER than the pin — pre-fix, migrateVal restamped every entry
  const res = migrateImports(imports, "0.21.1");
  assert(
    !res.changed,
    "nothing legacy and nothing retired → nothing to migrate",
  );
  assertEquals(res.imports, imports);
});

Deno.test("migrateImports renames legacy entries and re-pins them to the CLI", () => {
  const res = migrateImports(
    {
      "@sprig/core": "jsr:@sprig/core@0.19.0",
      "@sprig/keep": "jsr:@sprig/core@0.19.0/keep",
      "@std/path": "jsr:@std/path@^1",
    },
    "1.0.0",
  );
  assert(res.changed);
  assertEquals(res.imports, {
    "@techgoose-labs/sprig": "jsr:@techgoose-labs/sprig@1.0.0",
    // The subpath moved with the scope: `/keep` is `/bedrock` in sprig 2,
    // because what it exports is a bedrock Unit, not a serving layer.
    "@techgoose-labs/sprig/bedrock": "jsr:@techgoose-labs/sprig@1.0.0/bedrock",
    "@std/path": "jsr:@std/path@^1",
  });
});

Deno.test("migrateImports retires the /keep subpath on an already-modern app", () => {
  // A sprig-1 app has the modern SCOPE but the old SUBPATH — nothing legacy to
  // rename, and still a key that resolves nowhere in sprig 2 if left alone.
  const res = migrateImports(
    {
      "@techgoose-labs/sprig": "jsr:@techgoose-labs/sprig@1.1.3",
      "@techgoose-labs/sprig/keep": "jsr:@techgoose-labs/sprig@1.1.3/keep",
    },
    "2.0.0",
  );
  assert(res.changed, "the retired subpath is a migration, not a no-op");
  assertEquals(
    res.imports["@techgoose-labs/sprig/bedrock"],
    "jsr:@techgoose-labs/sprig@2.0.0/bedrock",
  );
  assertEquals(res.imports["@techgoose-labs/sprig/keep"], undefined);
});

Deno.test("migrateImports lets a local override on the modern key win over a legacy key", () => {
  const res = migrateImports(
    {
      "@sprig/core": "jsr:@sprig/core@0.19.0",
      "@techgoose-labs/sprig": "../sprig/main/framework/mod.ts",
    },
    "1.0.0",
  );
  assert(res.changed, "the legacy key is dropped");
  assertEquals(res.imports, {
    "@techgoose-labs/sprig": "../sprig/main/framework/mod.ts",
  });
});

Deno.test("pinnedSprigVersion reads exact, range, and subpath pins", () => {
  assertEquals(pinnedSprigVersion("jsr:@techgoose-labs/sprig@1.0.0"), "1.0.0");
  assertEquals(
    pinnedSprigVersion("jsr:@techgoose-labs/sprig@^1.2.3/keep"),
    "1.2.3",
  );
  assertEquals(pinnedSprigVersion("jsr:@std/path@^1"), null);
});

// ---- the @mrg-keystone -> @techgoose-labs scope move -----------------------
//
// The packages moved scope, so an app pinned to @mrg-keystone/sprig resolves a
// scope that receives no further releases. That is the same shape as the
// @sprig/* rename before it, so it travels the same migration path — and these
// pin the two bugs that made the FIRST attempt at it silently wrong.

Deno.test("migrateImports carries an app off the @mrg-keystone scope", () => {
  const res = migrateImports({
    "@mrg-keystone/sprig": "jsr:@mrg-keystone/sprig@2.0.1",
    "@mrg-keystone/sprig/bedrock": "jsr:@mrg-keystone/sprig@2.0.1/bedrock",
    "@std/path": "jsr:@std/path@^1",
  }, "2.0.2");
  assert(res.changed);
  assertEquals(res.imports, {
    "@techgoose-labs/sprig": "jsr:@techgoose-labs/sprig@2.0.2",
    "@techgoose-labs/sprig/bedrock": "jsr:@techgoose-labs/sprig@2.0.2/bedrock",
    "@std/path": "jsr:@std/path@^1",
  });
});

Deno.test("a migrated entry is RE-PINNED, not just renamed", () => {
  // The bug this pins: the re-pin regex still matched the OLD scope, but ran
  // AFTER the value had already been rewritten to the new one — so it matched
  // nothing. Keys moved, versions stayed behind, and nothing failed loudly.
  const res = migrateImports(
    { "@mrg-keystone/sprig": "jsr:@mrg-keystone/sprig@0.19.0" },
    "2.0.2",
  );
  assertEquals(
    res.imports["@techgoose-labs/sprig"],
    "jsr:@techgoose-labs/sprig@2.0.2",
  );
});

Deno.test("pinnedSprigVersion reads a version out of EITHER scope", () => {
  // Reading only the modern scope made every legacy pin look version-less, so
  // the migration could not tell an old pin from a local path override.
  assertEquals(pinnedSprigVersion("jsr:@mrg-keystone/sprig@2.0.1"), "2.0.1");
  assertEquals(pinnedSprigVersion("jsr:@techgoose-labs/sprig@2.0.2"), "2.0.2");
  assertEquals(pinnedSprigVersion("jsr:@mrg-keystone/sprig@^2"), "2");
  assertEquals(pinnedSprigVersion("../sprig/main/framework/mod.ts"), null);
});

Deno.test("a 1.x app's `@mrg-keystone/sprig/keep` KEY retires to /bedrock, not /keep", () => {
  // The bug this pins: the @mrg-keystone rename returned before the /keep
  // retirement ran, leaving a `@techgoose-labs/sprig/keep` key that resolves
  // nowhere beside the `/bedrock` one the build adds.
  assertEquals(
    migrateKey("@mrg-keystone/sprig/keep"),
    "@techgoose-labs/sprig/bedrock",
  );
  const res = migrateImports({
    "@mrg-keystone/sprig": "jsr:@mrg-keystone/sprig@1.1.4",
    "@mrg-keystone/sprig/keep": "jsr:@mrg-keystone/sprig@1.1.4/keep",
  }, "2.0.5");
  assertEquals(res.imports, {
    "@techgoose-labs/sprig": "jsr:@techgoose-labs/sprig@2.0.5",
    "@techgoose-labs/sprig/bedrock": "jsr:@techgoose-labs/sprig@2.0.5/bedrock",
  });
});

Deno.test("migrateSource carries a 1.x app's SOURCE imports across, /keep first", () => {
  // The bug this pins: configs migrated off @mrg-keystone, source files did
  // not — the bundle then failed on "@mrg-keystone/sprig not in import map".
  const src = `import { defineComponent } from "@mrg-keystone/sprig";
import { createRenderer } from "@mrg-keystone/sprig/keep";
import { x } from "@sprig/core";
import { y } from "@sprig/keep";
import { z } from "@techgoose-labs/sprig/keep";
`;
  assertEquals(
    migrateSource(src),
    `import { defineComponent } from "@techgoose-labs/sprig";
import { createRenderer } from "@techgoose-labs/sprig/bedrock";
import { x } from "@techgoose-labs/sprig";
import { y } from "@techgoose-labs/sprig/bedrock";
import { z } from "@techgoose-labs/sprig/bedrock";
`,
  );
});

Deno.test("migrateSource is the identity on a current file (and cheap: no rewrite pass)", () => {
  const cur =
    `import { Frontend } from "@techgoose-labs/sprig/bedrock";\nimport { a } from "@techgoose-labs/sprig";\n`;
  assert(migrateSource(cur) === cur);
  assertEquals(hasLegacyRuntimeName(cur), false);
  assertEquals(
    hasLegacyRuntimeName(`deno run -A jsr:@mrg-keystone/sprig@1.1.4/cli build`),
    true,
  );
});

// ------------------------------------------------ REQ-015 (declined stamp)
//
// deno.json is JSONC and Deno accepts comments, but `stamp()` reads it with
// JSON.parse and, when that fails, declines to rewrite the file — the right
// call (it cannot round-trip the comments). What it did not do was SAY so: a
// repo that annotates its deno.json never got re-pinned and was never told
// (coms 20260921T205912Z-w5-115272). One line on stderr closes that.

const CLI_V = "2.1.3";
const JSONC_STALE = `{
  // REQ-010: \`build\` is --ui-only on purpose. Do not "simplify" this.
  "tasks": { "build": "sprig build --ui-only ui" },
  "imports": {
    "@techgoose-labs/sprig": "jsr:@techgoose-labs/sprig@2.1.2",
    "@techgoose-labs/sprig/bedrock": "jsr:@techgoose-labs/sprig@2.1.2/bedrock"
  }
}
`;

Deno.test("REQ-015: sprigImportsInText reads the sprig mappings out of a JSONC text JSON.parse rejects", () => {
  assertThrows(() => JSON.parse(JSONC_STALE));
  assertEquals(sprigImportsInText(JSONC_STALE), {
    "@techgoose-labs/sprig": "jsr:@techgoose-labs/sprig@2.1.2",
    "@techgoose-labs/sprig/bedrock": "jsr:@techgoose-labs/sprig@2.1.2/bedrock",
  });
});

Deno.test("REQ-015: declining a JSONC config with a STALE pin says so — the path, the pin it keeps, the CLI it is behind, one line", () => {
  const line = declinedStampNotice("/app/deno.json", JSONC_STALE, CLI_V);
  assert(line !== null, "a stale pin left unstamped must be announced");
  assertStringIncludes(line, "/app/deno.json");
  assertStringIncludes(line, "2.1.2");
  assertStringIncludes(line, "2.1.3");
  assertEquals(line.includes("\n"), false, "one line on stderr");
});

Deno.test("REQ-015: declining that changes nothing is silent — pin current, no sprig key, local override, pin ahead", () => {
  const p = "/app/deno.json";
  assertEquals(declinedStampNotice(p, JSONC_STALE.replaceAll("2.1.2", CLI_V), CLI_V), null);
  assertEquals(
    declinedStampNotice(p, `{ // note\n  "imports": { "@std/path": "jsr:@std/path@^1" } }\n`, CLI_V),
    null,
  );
  assertEquals(
    declinedStampNotice(p, `{ // note\n  "imports": { "@techgoose-labs/sprig": "../framework/.sprig/core.ts" } }\n`, CLI_V),
    null,
  );
  // never downgrade: a pin AHEAD of the CLI is the CLI's problem, not the file's
  assertEquals(declinedStampNotice(p, JSONC_STALE.replaceAll("2.1.2", "9.0.0"), CLI_V), null);
});
