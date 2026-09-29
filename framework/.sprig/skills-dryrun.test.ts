// REQ-058 (docs) — a read-only dry run followed the breakdown and build prompts
// on fixtures/eval-app and stopped at each gap below. These prompts are
// contracts agents act on: each fix is one sentence, pinned here.
import { assert } from "@std/assert";

const ROOT = new URL("../../claude/", import.meta.url);

/** A prompt file with its prose unwrapped, so a phrase can be asserted whole. */
async function doc(rel: string): Promise<string> {
  return (await Deno.readTextFile(new URL(rel, ROOT))).replace(/\s+/g, " ");
}
function has(s: string, ...phrases: string[]): void {
  for (const p of phrases) assert(s.includes(p), `missing: ${p}`);
}
function lacks(s: string, ...phrases: string[]): void {
  for (const p of phrases) assert(!s.includes(p), `still says: ${p}`);
}

const ANALYST = "agents/sprig-breakdown-analyst.md";
const BREAKDOWN = "skills/sprig:breakdown/SKILL.md";
const UI_BREAKDOWN = "skills/interfaces/ui-breakdown.md";
const SPEC_WRITER = "agents/sprig-breakdown-spec-writer.md";
const CAPTURE = "agents/sprig-breakdown-capture.md";
const BUILD = "skills/sprig:build/SKILL.md";
const COMPONENT = "agents/sprig-build-component.md";
const SCAFFOLDER = "agents/sprig-build-scaffolder.md";
const SPRIG_APP = "skills/interfaces/sprig-app.md";
const ISOLATE_REF = "skills/sprig:build/references/isolate.md";
const ISOLATE_FORMAT = "skills/sprig:breakdown/references/isolate-format.md";
const AUDIT_HUNTER = "agents/sprig-audit-hunter.md";
const BUG_CATALOG = "skills/sprig:audit/references/sprig-bug-catalog.md";

// REQ-035 pins this phrase in the component agent: it names the report's row,
// it is not a command to run.
const PINNED_ROW = "the `_reference` row of `isolate test --json`";

Deno.test("REQ-058: every isolate run is `sprig isolate …` — there is no `isolate` binary", async () => {
  for (
    const f of [
      BUILD,
      BREAKDOWN,
      SPEC_WRITER,
      COMPONENT,
      SCAFFOLDER,
      SPRIG_APP,
      UI_BREAKDOWN,
      ISOLATE_REF,
      ISOLATE_FORMAT,
      AUDIT_HUNTER,
      BUG_CATALOG,
    ]
  ) {
    const s = (await doc(f)).replaceAll(PINNED_ROW, "");
    for (const m of s.matchAll(/`([^`]*)`/g)) {
      const bare = /(^|[\s>=])isolate (test|list|dev)\b/.test(m[1]) &&
        !/sprig isolate (test|list)\b/.test(m[1]);
      assert(!bare, `${f}: bare isolate command ${m[0]}`);
    }
  }
  has(await doc(BUILD), "sprig isolate test --json --root <app>");
});

Deno.test("REQ-058: the build names the app dir by its deno.json and gives both layouts' commands", async () => {
  const b = await doc(BUILD);
  has(
    b,
    "the directory holding the app's `deno.json`",
    "`app_root`",
    "sprig spec-check spec/ui/breakdown --ui-src <app>/src --app <app>",
    "sprig check <app>",
    "sprig spec-check spec/ui/breakdown --ui-src src --app .",
    "sprig check .",
  );
});

Deno.test("REQ-058: every unit fits a tier; only optimistic-write requires pending + rolled-back", async () => {
  const a = await doc(ANALYST);
  has(
    a,
    "a read-only data region (a message wall that only reads) is `static`",
    "a page-composition's tier is the tier of its own `logic.ts`",
    "`pure-client` — a `logic.ts` holding UI state",
    "`realtime` — pushed data",
    "only `optimistic-write` requires cases (`pending` + `rolled-back`)",
  );
});

Deno.test("REQ-058: pre-contract dataNeeds are the unit's data-table names; binding-drift waits for openapi.json", async () => {
  const a = await doc(ANALYST);
  lacks(a, "[needs, as named in the binding]");
  has(
    a,
    "the need's name from the unit's data table",
    "`sprig spec-check` skips binding-drift until `spec/contract/openapi.json` exists",
  );
});

Deno.test('REQ-058: pre-contract _network keys are "METHOD /path"; post-contract the command name', async () => {
  const s = await doc(SPEC_WRITER);
  has(
    s,
    'With no `spec/contract/openapi.json`, key `_network` by `"METHOD /path"`',
  );
  has(
    await doc(ANALYST),
    "the `METHOD /path` the unit will call",
  );
});

Deno.test("REQ-058: a unit lands at its inventory `dir`, not components/|islands/", async () => {
  const s = await doc(SPEC_WRITER);
  lacks(s, "(`components/`|`islands/`|`pages/<name>/`;");
  has(
    s,
    "`<app>/src/<dir>`",
    "shared → `shared-components/<name>`, page → `pages/<page>`, page-local → `pages/<page>/components/<name>`",
  );
  const c = await doc(COMPONENT);
  lacks(c, "`static` → `components/`");
  has(c, "`<app>/src/<dir>`");
});

Deno.test("REQ-058: reserved class names point at an installed reference, not docs/sprig/styling.md", async () => {
  for (const f of [ANALYST, SPEC_WRITER, COMPONENT, UI_BREAKDOWN]) {
    const s = await doc(f);
    lacks(s, "docs/sprig/styling.md");
    has(s, "~/.claude/skills/sprig:build/references/component-model.md");
  }
});

Deno.test("REQ-058: every case carries _theme; the mock's default theme is recorded in design-tokens.md", async () => {
  has(
    await doc(SPEC_WRITER),
    "Every case carries `_theme` explicitly",
    "`Default theme:` line",
  );
  has(await doc(ANALYST), "`Default theme: <name>`");
});

Deno.test("REQ-058: spec-check needs the sprig that ships it; unknown command means an older sprig", async () => {
  has(
    await doc(ANALYST),
    'sprig: unknown command "spec-check"',
    "sprig -v",
    "blocked: sprig spec-check unavailable",
  );
});

Deno.test("REQ-058: capture gets a mock DOM locator per unit from the analyst", async () => {
  has(await doc(ANALYST), "`region` — a CSS selector");
  has(await doc(BREAKDOWN), "`region`");
  has(await doc(CAPTURE), "`region`");
});

Deno.test("REQ-058: one spec-writer per unit — the prompt no longer offers batching", async () => {
  lacks(await doc(SPEC_WRITER), "2–3 TINY sibling units");
});

Deno.test("REQ-058: jank.md has a path", async () => {
  has(await doc(CAPTURE), "`screenshots/jank.md`");
});
