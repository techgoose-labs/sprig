// REQ-033…038 (docs) — the breakdown → build → audit agent prompts are
// CONTRACTS agents act on: each hardening sentence must be present and each
// retired instruction gone. The four product concerns ("the app stays dry",
// "NO business logic … in the frontend", "the app is optimistic", "faithful to
// the mock") move from prose-only to commands the prompts make agents RUN
// (`sprig check`, `sprig spec-check`, the isolate `_reference` diff).
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
  for (const p of phrases) {
    assert(!s.toLowerCase().includes(p.toLowerCase()), `still says: ${p}`);
  }
}

const ANALYST = "agents/sprig-breakdown-analyst.md";
const BREAKDOWN = "skills/sprig:breakdown/SKILL.md";
const UI_BREAKDOWN = "skills/interfaces/ui-breakdown.md";
const SPEC_WRITER = "agents/sprig-breakdown-spec-writer.md";
const CAPTURE = "agents/sprig-breakdown-capture.md";
const BUILD = "skills/sprig:build/SKILL.md";
const COMPONENT = "agents/sprig-build-component.md";
const SCAFFOLDER = "agents/sprig-build-scaffolder.md";
const BUILD_ANALYST = "agents/sprig-build-analyst.md";
const TEMPLATES = "skills/sprig:build/references/templates.md";
const SPRIG_APP = "skills/interfaces/sprig-app.md";
const PROTO_IFACE = "skills/interfaces/prototype.md";
const PROTO_BUILDER = "agents/sprig-prototype-builder.md";
const PROTO_SKILL = "skills/sprig:prototype/SKILL.md";
const AUDIT = "skills/sprig:audit/SKILL.md";
const HUNTER = "agents/sprig-audit-hunter.md";
const CATALOG = "skills/sprig:audit/references/sprig-bug-catalog.md";

const EVERY = [
  ANALYST,
  BREAKDOWN,
  UI_BREAKDOWN,
  SPEC_WRITER,
  CAPTURE,
  BUILD,
  COMPONENT,
  SCAFFOLDER,
  BUILD_ANALYST,
  TEMPLATES,
  SPRIG_APP,
  PROTO_IFACE,
  PROTO_BUILDER,
  PROTO_SKILL,
  AUDIT,
  HUNTER,
  CATALOG,
];

// ---------------------------------------------------------------- REQ-033
Deno.test("REQ-033: the analyst writes inventory.json (format A) — the same inventory it returns", async () => {
  const s = await doc(ANALYST);
  has(
    s,
    "spec/ui/breakdown/inventory.json",
    '"classification"',
    '"scope"',
    '"usedOn"',
    '"tier"',
    '"evidence"',
    '"dataNeeds"',
    '"unassigned"',
    "the same inventory you return",
  );
});

Deno.test("REQ-033: the binding is the machine-read table + a Drift section", async () => {
  for (const f of [ANALYST, UI_BREAKDOWN]) {
    const s = await doc(f);
    has(s, "| unit | need | kind | endpoint | dto |", "## Drift");
  }
});

Deno.test("REQ-033: the island rubric no longer pushes filter/sort or validation to the client", async () => {
  const s = await doc(ANALYST);
  lacks(s, "client filter/sort", "inline validation");
  has(
    s,
    "Filter, sort, search and paging are **queries** the backend answers",
    "Client-side validation is `required`/type only",
    "every other rule is a **command** the backend validates",
  );
});

Deno.test("REQ-033: the tier comes from commands.json `feedback`, and mock regions bind to design-system primitives", async () => {
  const s = await doc(ANALYST);
  has(
    s,
    "`feedback: instant` → `optimistic-write`",
    "`feedback: confirmed`",
    "spec/ui/design-system/components.md",
    "bind each mock region to a named primitive",
  );
});

Deno.test("REQ-033: the closing pass RUNS sprig spec-check; a non-empty Unassigned is a failure", async () => {
  const a = await doc(ANALYST);
  has(a, "sprig spec-check spec/ui/breakdown", "not done until it exits 0");
  lacks(a, "ships even when empty");
  const b = await doc(BREAKDOWN);
  has(b, "sprig spec-check spec/ui/breakdown", "inventory.json");
  lacks(b, "ships even when empty");
  const u = await doc(UI_BREAKDOWN);
  has(u, "inventory.json", "sprig spec-check spec/ui/breakdown");
  lacks(u, "ships even empty");
  const validation = u.slice(u.indexOf("## Validation"));
  has(validation, "sprig spec-check spec/ui/breakdown", "sprig isolate test");
});

Deno.test("REQ-033: the analyst states the exact shapes sprig spec-check parses", async () => {
  const s = await doc(ANALYST);
  has(
    s,
    "shared → `shared-components/<name>`",
    "page → `pages/<page>`",
    "page-local → `pages/<page>/components/<name>`",
    "a `static` unit has tier `static` and an island never does",
    "`<dir>/<name>.md`",
    "a query row's endpoint is `GET …`, a command row's is never `GET`",
    "its body is exactly `none` when empty",
  );
});

Deno.test("REQ-033: no prompt names a spec-check flag the tool does not take", async () => {
  for (const f of EVERY) {
    lacks(await doc(f), "--built ui/src", "spec-check --compose");
  }
});

// ---------------------------------------------------------------- REQ-034
Deno.test("REQ-034: every case carries _tier; stills become _viewport/_theme/_reference cases; motion → _motion", async () => {
  const s = await doc(SPEC_WRITER);
  has(
    s,
    "every case carries `_tier`",
    "`_viewport`",
    "`_theme`",
    "`_reference`",
    "`_motion`",
    "references/isolate-format.md",
  );
});

Deno.test("REQ-034: every optimistic-write unit gets pending + rolled-back cases, the latter failing its command via _network", async () => {
  const s = await doc(SPEC_WRITER);
  has(
    s,
    "`pending`",
    "`rolled-back`",
    '`_network`: { "<commandName>": "fail" }',
    "`<dir>/<name>.md`",
  );
});

Deno.test("REQ-034: capture's still naming lines up with the spec-writer's _reference paths", async () => {
  for (const f of [CAPTURE, SPEC_WRITER]) {
    const s = await doc(f);
    has(
      s,
      "screenshots/<name>@<width>.png",
      "screenshots/<name>@<width>-<theme>.png",
      "motion.json",
    );
  }
});

// ---------------------------------------------------------------- REQ-035
Deno.test("REQ-035: the builder's visual check is the measured _reference row, never eyeballing", async () => {
  const s = await doc(COMPONENT);
  lacks(
    s,
    "accept a deviation",
    "screenshot the isolate route via the Playwright MCP and compare",
  );
  has(
    s,
    "the `_reference` row of `isolate test --json`",
    "widen that case's `_reference` tolerance with a `reason`",
  );
});

Deno.test("REQ-035: every server write uses optimistic(...) and every unit's green includes sprig check", async () => {
  const c = await doc(COMPONENT);
  has(
    c,
    "`optimistic(sig, next, call)`",
    "`sprig check ui`",
    "logic-placement",
  );
  const b = await doc(BUILD);
  has(b, "`optimistic(sig, next, call)`");
  for (const x of [c, b]) {
    has(x, "`// sprig-wait: <reason>`", "reported by `sprig check`");
  }
  lacks(b, "snapshot → mutate → call → roll back");
  lacks(c, "snapshot → mutate local state");
});

Deno.test("REQ-035: templates.md derives nothing domain-shaped in the client", async () => {
  const s = await doc(TEMPLATES);
  lacks(s, "Derive anything non-trivial");
  has(
    s,
    "Derive nothing domain-shaped in the client",
    "`logic.ts` holds UI state only",
  );
});

Deno.test("REQ-035: step 3 runs spec-check --ui-src --app and sprig check, red on any finding", async () => {
  const s = await doc(BUILD);
  has(
    s,
    "sprig spec-check spec/ui/breakdown --ui-src ui/src --app ui",
    "sprig check ui",
    "red on any finding",
  );
  const a = await doc(SPRIG_APP);
  has(a, "sprig check ui", "sprig spec-check");
  const sc = await doc(SCAFFOLDER);
  has(sc, "sprig check ui");
});

Deno.test("REQ-035: the cheatsheet carries every suppression comment and its meaning", async () => {
  const s = await doc(BUILD_ANALYST);
  has(
    s,
    "// sprig-logic: <reason>",
    "// sprig-contract: <reason>",
    "/* sprig-token: <reason> */",
    "<!-- sprig-duplicate: <reason> -->",
    "// sprig-wait: <reason>",
    "<!-- sprig-shadows: <reason> -->",
    "src/custom-elements.json",
  );
});

// ---------------------------------------------------------------- REQ-036
Deno.test("REQ-036: each commands.json entry declares feedback instant|confirmed and the prototype honours it", async () => {
  const i = await doc(PROTO_IFACE);
  has(
    i,
    "{ type, kind, input, feedback, does }",
    '`"feedback": "instant" | "confirmed"`',
  );
  const b = await doc(PROTO_BUILDER);
  has(
    b,
    '"feedback"',
    "`instant` → render the intent BEFORE `await`",
    "`confirmed` → show a pending state",
  );
  const k = await doc(PROTO_SKILL);
  has(k, "`feedback`");
});

// ---------------------------------------------------------------- REQ-037
Deno.test("REQ-037: the hunter sees the breakdown's page stills + inventory.json; departing from a still is a bug", async () => {
  const h = await doc(HUNTER);
  has(
    h,
    "spec/ui/breakdown/inventory.json",
    "page-level stills",
    "departs from its still",
  );
  const a = await doc(AUDIT);
  has(a, "inventory.json", "page-level stills");
});

Deno.test("REQ-037: the catalog names domain logic in the client and a blocking write as sprig check findings", async () => {
  const s = await doc(CATALOG);
  has(
    s,
    "F14 **Domain logic in the client**",
    "`logic-placement`",
    "`optimistic-writes`",
    "F15 **Page departs from the mock**",
  );
  assert(
    s.indexOf("F14 **") > s.indexOf("F8 **") &&
      s.indexOf("F14 **") < s.indexOf("F9 **"),
    "F14 sits beside F8",
  );
});

// ---------------------------------------------------------------- REQ-038
Deno.test("REQ-038: the composition graph (sprig map --compose) is the source for the cheatsheet's composes lines", async () => {
  const s = await doc(BUILD_ANALYST);
  has(s, "sprig map --compose --json ui", "composes");
  const raw = await Deno.readTextFile(new URL(BUILD_ANALYST, ROOT));
  assert(
    /^tools: .*Bash/m.test(raw),
    "the build analyst needs Bash to run sprig map",
  );
});

// ---------------------------------------------------------------- all
Deno.test("REQ-033: no touched prompt carries a retired-path word", async () => {
  // Spelled in pieces so this file does not itself trip the gate's clean step.
  const retired = ["leg" + "acy", "@dep" + "recated", "kept for " + "compat"];
  for (const f of EVERY) lacks(await doc(f), ...retired);
});
