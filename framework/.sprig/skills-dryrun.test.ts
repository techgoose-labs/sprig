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
    // REQ-066: confirmed-write joined the tiers; it needs `pending` only.
    "`optimistic-write` requires cases (`pending` + `rolled-back`)",
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

Deno.test("REQ-058: reserved class names point at the skill reference, not docs/sprig/styling.md", async () => {
  // REQ-066: the reference is named relative to the skills dir, never ~/.claude.
  for (const f of [ANALYST, SPEC_WRITER, COMPONENT, UI_BREAKDOWN]) {
    const s = await doc(f);
    lacks(s, "docs/sprig/styling.md");
    has(s, "sprig:build/references/component-model.md");
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

// ---------------------------------------------------------------- REQ-066
// A full breakdown → build run on fixtures/kennel-app stopped at each gap
// below; each fix is one sentence, pinned here.

const BUILD_ANALYST = "agents/sprig-build-analyst.md";
const SERVING = "skills/sprig:build/references/serving.md";
const GUARDRAIL =
  /<!-- BEGIN sprig-agent-guardrail[\s\S]*?<!-- END sprig-agent-guardrail -->/;

Deno.test("REQ-066: breakdown paths are app-root-relative; the git root is the fallback", async () => {
  const b = await doc(BREAKDOWN);
  lacks(b, "always `<git-root>/spec/ui/breakdown/`");
  has(
    b,
    "always `<app-root>/spec/ui/breakdown/`",
    "the directory holding the app's `deno.json`",
    "the git root (`git rev-parse --show-toplevel`) is the fallback",
  );
  lacks(await doc(ANALYST), "always `<git-root>/spec/ui/breakdown/`");
  const s = await doc(SPEC_WRITER);
  lacks(s, "GIT-ROOT-relative", "git-root-relative");
  has(s, "APP-ROOT-relative");
  lacks(await doc(CAPTURE), "git-root-relative");
});

Deno.test("REQ-066: agents read the skill's own references/ dir, never a hardcoded home path", async () => {
  const agents = [
    ANALYST,
    CAPTURE,
    SPEC_WRITER,
    COMPONENT,
    SCAFFOLDER,
    BUILD_ANALYST,
  ];
  for (const f of [...agents, BREAKDOWN, BUILD, UI_BREAKDOWN]) {
    lacks((await doc(f)).replace(GUARDRAIL, ""), "~/.claude/skills");
  }
  for (const f of agents) {
    has(
      await doc(f),
      "the `references/` dir next to the SKILL.md that spawned you (installed or repo copy), never a hardcoded home path",
      "`capture-recipes.md`, `isolate-format.md`",
      "`INDEX.md`, `component-model.md`, `isolate.md`, `routing.md`, `serving.md`, `templates.md`, `wiring.md`",
    );
  }
  for (const f of [BREAKDOWN, BUILD]) {
    has(
      await doc(f),
      "the absolute path of the `references/` dir next to this SKILL.md",
    );
  }
});

Deno.test("REQ-066: a confirmed (awaited) write has its own tier — confirmed-write, pending only", async () => {
  const a = await doc(ANALYST);
  has(
    a,
    "`confirmed-write` — the island awaits the server's reply before showing the change (control disabled while pending); it needs a `pending` case only — no `rolled-back`, nothing was shown to roll back.",
    "`feedback: confirmed` → `confirmed-write`",
    '"optimistic-write"|"confirmed-write"',
  );
  has(
    await doc(SPEC_WRITER),
    "A **confirmed-write** unit gets a `pending` case only — no `rolled-back`, nothing was shown to roll back",
  );
});

Deno.test("REQ-066: stills hide host chrome, clear sticky elements, keep a grid unit's natural height; no motion is an empty list", async () => {
  has(
    await doc(CAPTURE),
    "hide the annotate overlay and any host chrome before a still",
    "unstick sticky elements or crop below them",
    "capture a grid unit at its natural row height",
    'a unit with no animations writes `{"animations": []}`',
  );
});

Deno.test("REQ-066: the scaffolder writes what served in the run — explicit Frontend args, --ui-only, daisyUI params", async () => {
  const s = await doc(SCAFFOLDER);
  lacks(s, "→ `ui/src/css-variables.json` verbatim");
  has(
    s,
    'Frontend({ app: sprigApp, assetsDir: fromFileUrl(new URL("./static", import.meta.url)) })',
    "bare `Frontend()` answers 500",
    "sprig build --ui-only <app>",
    "`--size-selector`, `--size-field`, `--border`, `--depth`, `--noise`",
    '`@plugin "daisyui" { themes: false; }`',
  );
  has(
    await doc(SERVING),
    'Frontend({ app: sprigApp, assetsDir: fromFileUrl(new URL("./static", import.meta.url)) })',
    "sprig build --ui-only <app>",
  );
});

Deno.test("REQ-066: a class island receives [prop] bindings only through constructor(ctx)", async () => {
  has(
    await doc(COMPONENT),
    "A class island receives its `[prop]` bindings only through `constructor(ctx)`",
    "constructor(ctx?: ComponentCtx) {",
    'this.closed.set(ctx.input("closed", this.closed())() ?? this.closed());',
  );
});

Deno.test("REQ-066: the workbench PID comes from its isolate.json, not `$!`", async () => {
  const c = await doc(COMPONENT);
  lacks(c, "& echo $! >");
  has(
    c,
    "`$!` is not a PID under every shell",
    "`kill` the `pid` in `/tmp/wb-<your PORT>/isolate.json`",
  );
});

Deno.test("REQ-066: the prod smoke names its URLs and pass criteria; an all-error app fails", async () => {
  for (const f of [BUILD, SCAFFOLDER]) {
    has(
      await doc(f),
      "every route in `src/mod.ts` at least once, one with a real id from the fixture data",
      "HTTP 200, the page's own template rendered — not the load-error or not-found state",
      'the island\'s root element (`<sprig-island data-sel="<island>">`) present',
      "an app where every page renders an error state FAILS the smoke",
    );
  }
});

Deno.test("REQ-066: a write island needs spec/contract/openapi.json — without it the build reports no contract", async () => {
  const b = await doc(BUILD);
  has(
    b,
    "`spec/contract/openapi.json` must exist before any island with a server write is built",
    "nothing in this toolchain derives it from the two seams",
    "`contract snapshot <prototype>` only copies `objects/` + `commands.json` to `spec/contract/draft/`",
    "reports `no contract` for each write island",
    "never invents a state service",
  );
  has(
    await doc(COMPONENT),
    "return `blocked: no contract`",
    "never route its writes to a local state service",
  );
});

Deno.test("REQ-066: a _network command name maps through the --root app's contract, else the git root's", async () => {
  for (const f of [ISOLATE_REF, ISOLATE_FORMAT]) {
    const s = await doc(f);
    lacks(s, "`spec/contract/openapi.json` at the git root");
    has(
      s,
      "`spec/contract/openapi.json` at the `--root` app, else at the git root",
      "the row says which",
    );
  }
});

// ---------------------------------------------------------------- REQ-071
// The DRY guarantee: the duplicate-templates lint fails a template that
// re-creates a shared unit's markup, and spec-check's census / same-job /
// reuse checks read the breakdown. The prompts make agents produce and honour
// both; each rule is one sentence, pinned here.

Deno.test("REQ-071: an inventory unit takes an optional `distinct` — deliberately separate from <unit> because <reason>", async () => {
  const u = await doc(UI_BREAKDOWN);
  has(
    u,
    '"dataNeeds", "distinct"? } ]',
    "`distinct` — this unit is deliberately separate from <unit> because <reason>",
    "an empty reason is an error",
  );
  has(
    await doc(ANALYST),
    '"distinct"?: "<unit> because <reason>"',
  );
});

Deno.test("REQ-071: the ui-breakdown contract names the census, same-job and reuse checks and how each is resolved", async () => {
  const u = await doc(UI_BREAKDOWN);
  has(
    u,
    "**census** — two units whose extracted `source.html` match above a threshold",
    "**same-job** — two units binding the same `dataNeeds` with the same classification",
    "**reuse** — a shared unit composed by one page only, or page-local twins across pages",
    "`sprig spec-check` reports them; the analyst resolves each finding by merging the units or writing `distinct`",
    "every census / same-job / reuse finding merged or carrying `distinct`",
  );
});

Deno.test("REQ-071: the analyst groups repeated regions across ALL pages before classifying — one region, one unit", async () => {
  const a = await doc(ANALYST);
  has(
    a,
    "**Census before classifying.** Group the mock's regions by repeated structure (same DOM shape, same classes) across ALL pages",
    "one repeated region is one unit with a `usedOn` list, never one unit per page",
  );
});

Deno.test("REQ-071: a region that looks like a shared unit but differs is recorded with `distinct` and the reason", async () => {
  has(
    await doc(ANALYST),
    "a region that looks like an existing shared unit but differs is recorded with `distinct` naming that unit and the reason",
  );
});

Deno.test("REQ-071: the closing pass reads spec-check's DRY lines and stops on any unresolved finding", async () => {
  has(
    await doc(ANALYST),
    "Read `sprig spec-check`'s DRY lines (census, same-job, reuse) and stop on any unresolved finding",
    "merge the units or write `distinct` with the reason, then re-run",
  );
});

Deno.test("REQ-071: the spec-writer names a child unit by its tag, never re-describes its markup", async () => {
  has(
    await doc(SPEC_WRITER),
    "A child region that is its own inventory unit is named by its tag (`<status-badge>`), never re-described as markup — the build composes it",
  );
});

Deno.test("REQ-071: the component agent composes, never re-creates", async () => {
  const c = await doc(COMPONENT);
  has(
    c,
    "**Compose, never re-create** — if a shared unit exists for the markup you are writing, use its tag; the `duplicate-templates` lint fails inline re-creation and names the tag to compose",
  );
});

Deno.test("REQ-071: the build analyst's cheatsheet lists every shared unit's tag and props", async () => {
  has(
    await doc(BUILD_ANALYST),
    "**Shared units** — every shared unit's `<tag>` and props, one line each, so builders compose from the sheet",
    "never cut **Shared units**",
  );
});

Deno.test("REQ-071: the build's sprig check step fixes a DRY finding by composing, never by a marker without a design reason", async () => {
  has(
    await doc(BUILD),
    "A DRY finding is fixed by composing the shared unit's tag, never by a `sprig-duplicate:` marker unless the reason is a real design difference, stated",
  );
});

Deno.test("REQ-071: the sprig-app contract declares DRY", async () => {
  has(
    await doc(SPRIG_APP),
    "**DRY:** no template re-creates a shared unit; spec-check's DRY checks pass or every exception carries `distinct`",
  );
});

Deno.test("REQ-071: no breakdown prompt defaults a repeated region to page-local", async () => {
  const b = await doc(BREAKDOWN);
  lacks(
    b,
    "Page-local by default; promote to `shared-components/` only with evidence",
  );
  has(
    b,
    "a region repeated across pages (same DOM shape, same classes) is ONE unit with a `usedOn` list",
  );
  has(
    await doc(ANALYST),
    "a region repeated on several pages maps to the same shared entry",
  );
});

Deno.test("REQ-071: a pair is excused only when both units carry `distinct`; a shared unit one page composes carries its own", async () => {
  for (const f of [UI_BREAKDOWN, ANALYST]) {
    has(
      await doc(f),
      "A pair is excused only when both units carry a non-empty `distinct`; a shared unit only one page composes needs `distinct` on itself.",
    );
  }
  lacks(await doc(UI_BREAKDOWN), "writing `distinct` on the one kept apart");
});

Deno.test("REQ-071: same-job fires only on a shared set of at least two needs, or a command, with the same classification", async () => {
  for (const f of [UI_BREAKDOWN, ANALYST]) {
    has(
      await doc(f),
      "same-job fires only when two units bind the same set of at least two needs, or a command, with the same classification.",
    );
  }
});
