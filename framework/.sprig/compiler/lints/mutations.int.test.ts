// REQ-049 — mutation tests: every rule of every `sprig check` lint and compiler
// check BITES. Each test copies a CLEAN fixture into its own temp dir, proves the
// unmutated copy is green, applies ONE minimal mutation, re-runs the real check
// over the files, and asserts it reports exactly that rule. Every suppression
// marker (sprig-contract/logic/wait/duplicate/token/shadows) is proven to turn
// its finding into a listed suppression. The tracked fixtures are never touched.
import {
  assert,
  assertEquals,
  assertMatch,
  assertRejects,
  assertStringIncludes,
} from "@std/assert";
import { dirname, fromFileUrl, join } from "@std/path";
import type { Finding, LintResult } from "./lint-types.ts";
import { lintContractCalls } from "./contract-calls.ts";
import { lintLogicPlacement } from "./logic-placement.ts";
import { lintTokens } from "./tokens.ts";
import { lintDuplicateTemplates } from "./duplicate-templates.ts";
import { lintOptimisticWrites } from "./optimistic-writes.ts";
import { checkComposition } from "../composition.ts";
import { SKIP_DIRS } from "./ui-files.ts";

const REPO = fromFileUrl(new URL("../../../../", import.meta.url));
const LINTS = join(REPO, "fixtures", "lints");
const COMPOSITION = join(
  REPO,
  "framework",
  ".sprig",
  "compiler",
  "fixtures",
  "composition-app",
);

async function copyDir(from: string, to: string): Promise<void> {
  await Deno.mkdir(to, { recursive: true });
  for await (const e of Deno.readDir(from)) {
    const s = join(from, e.name), d = join(to, e.name);
    if (e.isDirectory) await copyDir(s, d);
    else await Deno.copyFile(s, d);
  }
}

/** A temp copy of a fixture: `edit` applies a mutation (and fails if it changed
 *  nothing), `write` adds a file. */
type Copy = {
  root: string;
  edit: (rel: string, fn: (s: string) => string) => Promise<void>;
  write: (rel: string, text: string) => Promise<void>;
};

async function withCopy(
  fixture: string,
  body: (c: Copy) => Promise<void>,
): Promise<void> {
  const root = await Deno.makeTempDir({ prefix: "sprig-mutation-" });
  try {
    await copyDir(fixture, root);
    await body({
      root,
      edit: async (rel, fn) => {
        const path = join(root, rel);
        const before = await Deno.readTextFile(path);
        const after = fn(before);
        assert(after !== before, `mutation of ${rel} changed nothing`);
        await Deno.writeTextFile(path, after);
      },
      write: async (rel, text) => {
        await Deno.mkdir(dirname(join(root, rel)), { recursive: true });
        await Deno.writeTextFile(join(root, rel), text);
      },
    });
  } finally {
    await Deno.remove(root, { recursive: true });
  }
}

/** Insert `text` right after the first line containing `anchor`. */
const after = (anchor: string, text: string) => (s: string) => {
  const i = s.indexOf(anchor);
  assert(i >= 0, `anchor not found: ${anchor}`);
  const eol = s.indexOf("\n", i);
  return s.slice(0, eol + 1) + text + s.slice(eol + 1);
};

/** Insert `text` right before the first line containing `anchor`. */
const before = (anchor: string, text: string) => (s: string) => {
  const i = s.indexOf(anchor);
  assert(i >= 0, `anchor not found: ${anchor}`);
  const bol = s.lastIndexOf("\n", i) + 1;
  return s.slice(0, bol) + text + s.slice(bol);
};

const show = (r: LintResult) =>
  JSON.stringify({ findings: r.findings, suppressed: r.suppressed }, null, 2);

/** Green: nothing found at all (no error, no warning). */
function assertGreen(r: LintResult, what = "unmutated copy"): void {
  assertEquals(r.skipped, undefined, `${what} skipped: ${r.skipped}`);
  assertEquals(r.findings, [], `${what} is not green:\n${show(r)}`);
}

/** Red on exactly `rule`: every finding carries it, at least one does, and one
 *  message matches `message` (the sub-rule within a single-id lint). */
function assertOnly(
  r: LintResult,
  rule: string,
  message: RegExp,
  severity: Finding["severity"] = "error",
): Finding[] {
  assert(r.findings.length > 0, `mutation did not bite (${rule}):\n${show(r)}`);
  assertEquals(
    [...new Set(r.findings.map((f) => f.rule))],
    [rule],
    `reported other rules:\n${show(r)}`,
  );
  const hit = r.findings.filter((f) =>
    message.test(f.message) && f.severity === severity
  );
  assert(hit.length > 0, `no ${severity} matching ${message}:\n${show(r)}`);
  return hit;
}

// ─── contract-calls (clean-app) ──────────────────────────────────────────────

const CLEAN = join(LINTS, "clean-app");
const LOGIC = "ui/src/pages/orders/components/order-form/logic.ts";
const RESOLVE = "ui/src/pages/orders/resolve.ts";
const contract = (c: Copy) =>
  lintContractCalls({ uiSrc: join(c.root, "ui", "src"), gitRoot: c.root });

async function contractBites(
  mutate: (c: Copy) => Promise<void>,
  rules: string[],
): Promise<LintResult> {
  let red!: LintResult;
  await withCopy(CLEAN, async (c) => {
    assertGreen(await contract(c));
    await mutate(c);
    red = await contract(c);
  });
  assert(red.findings.length > 0, `mutation did not bite:\n${show(red)}`);
  assertEquals(
    [...new Set(red.findings.map((f) => f.rule))].sort(),
    rules.sort(),
    show(red),
  );
  return red;
}

Deno.test("REQ-049: contract-calls rule raw-backend bites on inject(Backend) not passed to createClient", async () => {
  await contractBites(
    (c) =>
      c.edit(
        RESOLVE,
        after("const api =", "  const backend = inject(Backend);\n"),
      ),
    ["contract-calls/raw-backend"],
  );
});

Deno.test("REQ-049: contract-calls rule literal-backend-path bites on a Backend handle's .get(literal)", async () => {
  // the handle itself is excused, so the literal path is the only finding
  const r = await contractBites(
    (c) =>
      c.edit(
        RESOLVE,
        after(
          "const api =",
          "  // sprig-contract: the health probe is outside the contract\n" +
            "  const backend = inject(Backend);\n\n" +
            '  await backend.get("/api/health");\n',
        ),
      ),
    ["contract-calls/literal-backend-path"],
  );
  assertEquals(r.suppressed.length, 1);
});

Deno.test("REQ-049: contract-calls rule literal-backend-path bites on inject(Backend).get(literal) (with its raw-backend)", async () => {
  await contractBites(
    (c) =>
      c.edit(
        RESOLVE,
        after(
          "const api =",
          '  const health = await inject(Backend).get("/api/health");\n',
        ),
      ),
    ["contract-calls/literal-backend-path", "contract-calls/raw-backend"],
  );
});

Deno.test("REQ-049: contract-calls rule island-fetch bites on any fetch( in an island logic.ts", async () => {
  await contractBites(
    (c) =>
      c.edit(
        LOGIC,
        after(
          "const page = signal(0);",
          "    const ping = () => fetch(globalThis.location.href);\n",
        ),
      ),
    ["contract-calls/island-fetch"],
  );
});

Deno.test("REQ-049: contract-calls rule literal-fetch bites on fetch(literal) in a resolve.ts", async () => {
  await contractBites(
    (c) =>
      c.edit(
        RESOLVE,
        after("const api =", '  const raw = await fetch("/api/orders");\n'),
      ),
    ["contract-calls/literal-fetch"],
  );
});

Deno.test("REQ-049: contract-calls rule literal-fetch bites on globalThis.fetch(literal)", async () => {
  await contractBites(
    (c) =>
      c.edit(
        RESOLVE,
        after(
          "const api =",
          '  const raw = await globalThis.fetch("/api/orders");\n',
        ),
      ),
    ["contract-calls/literal-fetch"],
  );
});

Deno.test("REQ-049: contract-calls suppression sprig-contract: turns the finding into a suppressed entry", async () => {
  await withCopy(CLEAN, async (c) => {
    await c.edit(
      RESOLVE,
      after(
        "const api =",
        "  // sprig-contract: a legacy CSV export the contract does not model\n" +
          '  const raw = await fetch("/api/orders.csv");\n',
      ),
    );
    const r = await contract(c);
    assertEquals(r.findings, []);
    assertEquals(r.suppressed.map((s) => s.reason), [
      "a legacy CSV export the contract does not model",
    ]);
  });
});

// ─── logic-placement (clean-app) ─────────────────────────────────────────────

const logic = (c: Copy) =>
  lintLogicPlacement({ uiSrc: join(c.root, "ui", "src") });

async function logicBites(
  line: string,
  letter: string,
  message: RegExp,
  anchor = "const page = signal(0);",
): Promise<void> {
  await withCopy(CLEAN, async (c) => {
    assertGreen(await logic(c));
    await c.edit(LOGIC, after(anchor, line));
    assertOnly(await logic(c), `logic-placement/${letter}`, message);
  });
}

Deno.test("REQ-049: logic-placement rule a bites on data-times-data arithmetic", async () => {
  await logicBites(
    "    const cost = line.unitCost * line.qty;\n",
    "a",
    /arithmetic on data/,
  );
});

Deno.test("REQ-049: logic-placement rule a bites on a member times a rate literal", async () => {
  await logicBites(
    "    const shown = order.qty * 3;\n",
    "a",
    /arithmetic on data `order\.qty \* 3`/,
  );
});

Deno.test("REQ-049: logic-placement rule b bites on a data-vs-data relational branch", async () => {
  await logicBites(
    '    if (order.qty > stock.onHand) error.set("short");\n',
    "b",
    /data-vs-data branch/,
  );
});

Deno.test("REQ-049: logic-placement rule c bites on .test( pattern validation", async () => {
  await logicBites(
    "    const ok = /^\\d+$/.test(qty());\n",
    "c",
    /`\.test\(` pattern validation/,
  );
});

Deno.test("REQ-049: logic-placement rule c bites on .match( pattern validation", async () => {
  await logicBites(
    "    const m = qty().match(/\\d/);\n",
    "c",
    /`\.match\(` pattern validation/,
  );
});

Deno.test("REQ-049: logic-placement rule c bites on a RegExp", async () => {
  await logicBites(
    '    const re = new RegExp("^[a-z]+$");\n',
    "c",
    /`RegExp` pattern validation/,
  );
});

Deno.test("REQ-049: logic-placement rule c bites on a length check in an event handler", async () => {
  await logicBites(
    '      if (sku().length > 3) return error.set("too long");\n',
    "c",
    /checks a length in an event handler/,
    "const submit = () => {",
  );
});

Deno.test("REQ-049: logic-placement rule d bites on defining a domain function", async () => {
  await logicBites(
    // REQ-065: a definition bites when its body does work, not by name alone
    "    const computeTotal = () => sumOf(rows());\n",
    "d",
    /defines `computeTotal`/,
  );
});

Deno.test("REQ-049: logic-placement rule d bites on calling a domain function", async () => {
  await logicBites(
    "    const p = api.priceOf(sku());\n",
    "d",
    /calls `priceOf\(…\)`/,
  );
});

Deno.test("REQ-049: logic-placement suppression sprig-logic: turns the finding into a suppressed entry", async () => {
  await withCopy(CLEAN, async (c) => {
    await c.edit(
      LOGIC,
      after(
        "const page = signal(0);",
        "    // sprig-logic: a pixel budget is presentation\n" +
          "    const cost = line.unitCost * line.qty;\n",
      ),
    );
    const r = await logic(c);
    assertEquals(r.findings, []);
    assertEquals(r.suppressed.map((s) => s.reason), [
      "a pixel budget is presentation",
    ]);
  });
});

// ─── tokens (tokens-clean) ───────────────────────────────────────────────────

const TOKENS = join(LINTS, "tokens-clean");
const CSS = "ui/src/components/badge/styles.css";
const TPL = "ui/src/components/badge/template.html";
const VARS = "ui/src/css-variables.json";
const tokens = (c: Copy) => lintTokens({ uiSrc: join(c.root, "ui", "src") });
const append = (text: string) => (s: string) => s + text;
/** Add `name: value` to the light theme of css-variables.json. */
const addToken = (name: string, value: string) => (s: string) => {
  const j = JSON.parse(s);
  j.themes.light[name] = value;
  return JSON.stringify(j, null, 2);
};

async function tokensBites(
  mutate: (c: Copy) => Promise<void>,
  message: RegExp,
  severity: Finding["severity"] = "error",
): Promise<Finding[]> {
  let hit!: Finding[];
  await withCopy(TOKENS, async (c) => {
    const green = await tokens(c);
    assertGreen(green);
    assertEquals(green.suppressed.length, 1); // the fixture's own sprig-token
    await mutate(c);
    hit = assertOnly(await tokens(c), "tokens", message, severity);
  });
  return hit;
}

Deno.test("REQ-049: tokens rule a bites on a raw hex color", async () => {
  await tokensBites(
    (c) => c.edit(CSS, append(".badge--x { color: #123456; }\n")),
    /raw color #123456 in color/,
  );
});

Deno.test("REQ-049: tokens rule a bites on a raw hex that IS a token and names it", async () => {
  const [f] = await tokensBites(
    (c) => c.edit(CSS, append(".badge--x { color: #36f; }\n")),
    /raw color #36f in color/,
  );
  assertEquals(f.hint, "use var(--color-primary)");
});

Deno.test("REQ-049: tokens rule a bites on a raw color function", async () => {
  await tokensBites(
    (c) => c.edit(CSS, append(".badge--x { color: rgb(1, 2, 3); }\n")),
    /raw color rgb\(1, 2, 3\) in color/,
  );
});

Deno.test("REQ-049: tokens rule a bites on a named color", async () => {
  await tokensBites(
    (c) => c.edit(CSS, append(".badge--x { color: rebeccapurple; }\n")),
    /raw color rebeccapurple in color/,
  );
});

Deno.test("REQ-049: tokens rule a bites on a raw color in a template style attribute", async () => {
  const [f] = await tokensBites(
    (c) =>
      c.edit(
        TPL,
        (s) => s.replace("color: var(--color-primary)", "color: #3366ff"),
      ),
    /raw color #3366ff in color/,
  );
  assert(f.file.endsWith("template.html"), f.file);
});

Deno.test("REQ-049: tokens rule a bites on a raw color in a template <style> block", async () => {
  const [f] = await tokensBites(
    (c) => c.edit(TPL, append("<style>.x { color: red; }</style>\n")),
    /raw color red in color/,
  );
  assert(f.file.endsWith("template.html"), f.file);
});

Deno.test("REQ-049: tokens rule b bites on a space-family length equal to a token", async () => {
  await tokensBites(
    (c) => c.edit(CSS, append(".badge--x { padding: 8px; }\n")),
    /length 8px in padding is the value of --space-2/,
  );
});

Deno.test("REQ-049: tokens rule b bites on a radius-family length equal to a token", async () => {
  await tokensBites(
    (c) => c.edit(CSS, append(".badge--x { border-radius: 0.5rem; }\n")),
    /length 0\.5rem in border-radius is the value of --radius-box/,
  );
});

Deno.test("REQ-049: tokens rule b bites on a step-family length equal to a token", async () => {
  await tokensBites(async (c) => {
    await c.edit(VARS, addToken("--step-0", "1rem"));
    await c.edit(CSS, append(".badge--x { font-size: 1rem; }\n"));
  }, /length 1rem in font-size is the value of --step-0/);
});

Deno.test("REQ-049: tokens rule b bites on a shadow-family length equal to a token", async () => {
  await tokensBites(async (c) => {
    await c.edit(VARS, addToken("--shadow-offset", "4px"));
    await c.edit(
      CSS,
      append(".badge--x { box-shadow: 0 4px var(--color-primary); }\n"),
    );
  }, /length 4px in box-shadow is the value of --shadow-offset/);
});

Deno.test("REQ-049: tokens rule b bites on a whole box-shadow equal to a shadow token", async () => {
  const [f] = await tokensBites(async (c) => {
    await c.edit(VARS, addToken("--shadow-md", "0 4px 6px rgb(0 0 0 / 0.1)"));
    await c.edit(
      CSS,
      append(".badge--x { box-shadow: 0 4px 6px rgb(0 0 0 / 0.1); }\n"),
    );
  }, /box-shadow .* is the value of --shadow-md/);
  assertEquals(f.hint, "use var(--shadow-md)");
});

Deno.test("REQ-049: tokens rule b bites on a colorless box-shadow equal to a shadow token", async () => {
  await tokensBites(async (c) => {
    await c.edit(VARS, addToken("--shadow-flat", "0 1px 2px"));
    await c.edit(CSS, append(".badge--x { box-shadow: 0 1px 2px; }\n"));
  }, /box-shadow 0 1px 2px is the value of --shadow-flat/);
});

Deno.test("REQ-060: tokens rule a in a property whose family has NO tokens says the design system lacks them", async () => {
  const [f] = await tokensBites(
    (c) =>
      c.edit(
        CSS,
        append(".badge--x { box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05); }\n"),
      ),
    /^box-shadow: the design system defines no shadow tokens — raw color rgb\(0 0 0 \/ 0\.05\)$/,
  );
  assertEquals(
    f.hint,
    "add `--shadow-*` to spec/ui/design-system/css-variables.json or suppress with sprig-token",
  );
});

Deno.test("REQ-060: control — once the family has a token, the raw color hint is the ordinary one", async () => {
  const [f] = await tokensBites(async (c) => {
    await c.edit(VARS, addToken("--shadow-sm", "0 1px 3px rgb(0 0 0 / 0.1)"));
    await c.edit(
      CSS,
      append(".badge--x { box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05); }\n"),
    );
  }, /^raw color rgb\(0 0 0 \/ 0\.05\) in box-shadow$/);
  assertEquals(f.hint, "add it to css-variables.json and use var(--…)");
});

Deno.test("REQ-065: tokens never reads inside @font-face — its descriptors declare a font, they do not use one", async () => {
  await withCopy(TOKENS, async (c) => {
    await c.edit(
      CSS,
      append(
        "@font-face {\n" +
          '  font-family: "Caveat";\n' +
          "  font-style: normal;\n" +
          "  font-weight: 400 700;\n" +
          "  font-display: swap;\n" +
          '  src: url(https://fonts.gstatic.com/s/caveat/v23/x.woff2) format("woff2");\n' +
          "  unicode-range: U+0000-00FF, U+0131;\n" +
          "  size-adjust: 105%;\n" +
          "  ascent-override: 90%;\n" +
          "}\n",
      ),
    );
    assertGreen(await tokens(c), "@font-face block");
  });
  // control: the same family used in a rule is still off-system
  await tokensBites(
    (c) => c.edit(CSS, append('.badge--x { font-family: "Caveat"; }\n')),
    /off-system font: font-family "Caveat"/,
  );
});

Deno.test("REQ-065: daisyUI's --size-field / --size-selector are control sizes, not space steps — a gap equal to one is no finding", async () => {
  await withCopy(TOKENS, async (c) => {
    await c.edit(VARS, addToken("--size-field", "0.25rem"));
    await c.edit(VARS, addToken("--size-selector", "0.25rem"));
    await c.edit(CSS, append(".badge--x { display: flex; gap: 0.25rem; }\n"));
    const r = await tokens(c);
    assertGreen(r, "gap equal to a daisyUI param");
    assert(
      r.notes!.some((n) =>
        /space 1 \(--space-2\)/.test(n) &&
        /daisyUI params, not length tokens: --size-field, --size-selector/
          .test(n)
      ),
      r.notes!.join("\n"),
    );
  });
  // control: a real space step with that value names only the step
  await tokensBites(async (c) => {
    await c.edit(VARS, addToken("--size-field", "0.25rem"));
    await c.edit(VARS, addToken("--space-1", "0.25rem"));
    await c.edit(CSS, append(".badge--x { gap: 0.25rem; }\n"));
  }, /^length 0\.25rem in gap is the value of --space-1$/);
});

Deno.test("REQ-049: tokens rule c bites on an off-system font-family", async () => {
  await tokensBites(
    (c) => c.edit(CSS, append(".badge--x { font-family: Comic Sans MS; }\n")),
    /off-system font: font-family Comic Sans MS/,
  );
});

Deno.test("REQ-049: tokens rule c bites on a font-family literal equal to a token", async () => {
  await tokensBites(
    (c) =>
      c.edit(CSS, append('.badge--x { font-family: "Inter", sans-serif; }\n')),
    /font-family "Inter", sans-serif is the value of --font-body/,
  );
});

Deno.test("REQ-049: tokens rule bites on a sprig-token suppression with no reason", async () => {
  await tokensBites(
    (c) =>
      c.edit(CSS, append(".badge--x { color: #123456; } /* sprig-token: */\n")),
    /sprig-token suppression needs a reason/,
  );
});

Deno.test("REQ-049: tokens rule warns on a sprig-token suppression that excuses nothing", async () => {
  await tokensBites(
    (c) =>
      c.edit(
        CSS,
        append(
          ".badge--x { color: var(--color-primary); } /* sprig-token: stale */\n",
        ),
      ),
    /sprig-token suppression excuses nothing/,
    "warn",
  );
});

Deno.test("REQ-049: tokens rule bites on a css-variables.json that is not JSON", async () => {
  await tokensBites(
    (c) => c.edit(VARS, (s) => s.slice(0, -3)),
    /css-variables\.json is not JSON/,
  );
});

Deno.test("REQ-049: tokens suppression sprig-token: (CSS) turns the finding into a suppressed entry", async () => {
  await withCopy(TOKENS, async (c) => {
    // the fixture's marker, removed, bites …
    await c.edit(CSS, (s) => s.replace(/ \/\* sprig-token:[^*]*\*\//, ""));
    assertOnly(await tokens(c), "tokens", /raw color #b00020 in color/);
    // … and a marker with a reason turns it back into a suppression
    await c.edit(
      CSS,
      (s) => s.replace("#b00020;", "#b00020; /* sprig-token: counsel */"),
    );
    const r = await tokens(c);
    assertEquals(r.findings, []);
    assertEquals(r.suppressed.map((s) => s.reason), ["counsel"]);
  });
});

Deno.test("REQ-049: tokens suppression sprig-token: (template) turns the finding into a suppressed entry", async () => {
  await withCopy(TOKENS, async (c) => {
    await c.edit(
      TPL,
      (s) =>
        s.replace(
          '  <b style="color: var(--color-primary)">',
          "  <!-- sprig-token: the partner logo color -->\n" +
            '  <b style="color: #0f0f0f">',
        ),
    );
    const r = await tokens(c);
    assertEquals(r.findings, []);
    assertEquals(r.suppressed.map((s) => s.reason).sort(), [
      "the legal notice color is mandated by counsel, not the brand",
      "the partner logo color",
    ]);
  });
});

// ─── duplicate-templates (clean-app) ─────────────────────────────────────────

const FORM_TPL = "ui/src/pages/orders/components/order-form/template.html";
const COPY_TPL = "ui/src/pages/orders/components/refund-form/template.html";
const dup = (c: Copy) =>
  lintDuplicateTemplates({ uiSrc: join(c.root, "ui", "src") });

async function duplicateCopy(c: Copy, head = ""): Promise<void> {
  const src = await Deno.readTextFile(join(c.root, FORM_TPL));
  await c.write(COPY_TPL, head + src.replaceAll("error()", "problem()"));
}

Deno.test("REQ-049: duplicate-templates rule bites on a near-duplicate template", async () => {
  await withCopy(CLEAN, async (c) => {
    assertGreen(await dup(c));
    await duplicateCopy(c);
    assertOnly(
      await dup(c),
      "duplicate-templates",
      /near-duplicate templates: pages\/orders\/components\/order-form and pages\/orders\/components\/refund-form/,
    );
  });
});

Deno.test("REQ-049: duplicate-templates rule bites on a sprig-duplicate marker with no reason", async () => {
  await withCopy(CLEAN, async (c) => {
    assertGreen(await dup(c));
    await duplicateCopy(c, "<!-- sprig-duplicate: -->\n");
    assertOnly(
      await dup(c),
      "duplicate-templates",
      /sprig-duplicate justification needs a reason/,
    );
  });
});

Deno.test("REQ-049: duplicate-templates rule warns on a sprig-duplicate marker that excuses no pair", async () => {
  await withCopy(CLEAN, async (c) => {
    assertGreen(await dup(c));
    await c.edit(
      FORM_TPL,
      (s) => "<!-- sprig-duplicate: refunds will diverge -->\n" + s,
    );
    assertOnly(
      await dup(c),
      "duplicate-templates",
      /excuses no pair/,
      "warn",
    );
  });
});

Deno.test("REQ-049: duplicate-templates suppression sprig-duplicate: turns the finding into a suppressed entry", async () => {
  await withCopy(CLEAN, async (c) => {
    await duplicateCopy(
      c,
      "<!-- sprig-duplicate: refunds gain an approval step next milestone -->\n",
    );
    const r = await dup(c);
    assertEquals(r.findings, []);
    assertEquals(r.suppressed.length, 1);
    assertMatch(
      r.suppressed[0].reason,
      /^justified: .*order-form ~ .*refund-form \(1\.00\) — refunds gain an approval step/,
    );
  });
});

// ─── optimistic-writes (optimistic-clean) ────────────────────────────────────

const OPT = join(LINTS, "optimistic-clean");
const LIST = "ui/src/islands/todo-list/logic.ts";
const CHECKOUT = "ui/src/islands/checkout/logic.ts";
const optimisticLint = (c: Copy) =>
  lintOptimisticWrites({ uiSrc: join(c.root, "ui", "src"), gitRoot: c.root });
/** A new function in todo-list that awaits `call` before its first signal write. */
const awaitsFirst = (call: string, comment = "") =>
  before(
    "return { loading, items, load };",
    "    const add = async () => {\n" + comment +
      `      await ${call};\n` +
      "      items.set([]);\n" +
      "    };\n",
  );

async function optimisticBites(
  mutate: (c: Copy) => Promise<void>,
  message: RegExp,
): Promise<LintResult> {
  let red!: LintResult;
  await withCopy(OPT, async (c) => {
    const green = await optimisticLint(c);
    assertGreen(green);
    assertEquals(green.suppressed.length, 1); // the fixture's own sprig-wait
    await mutate(c);
    red = await optimisticLint(c);
    assertOnly(red, "optimistic-writes", message);
  });
  return red;
}

const RULE1 = /^server write awaited before the UI changed .*\(in add,/;

Deno.test("REQ-049: optimistic-writes rule 1 bites on an awaited fetch POST before the signal write", async () => {
  await optimisticBites(
    (c) => c.edit(LIST, awaitsFirst('fetch("/api/todos", { method: "POST" })')),
    RULE1,
  );
});

Deno.test("REQ-049: optimistic-writes rule 1 bites on an awaited .post( member call", async () => {
  await optimisticBites(
    (c) => c.edit(LIST, awaitsFirst('http.post("/api/todos")')),
    RULE1,
  );
});

Deno.test("REQ-049: optimistic-writes rule 1 bites on an awaited client.<op> the contract says is POST", async () => {
  await optimisticBites(
    (c) => c.edit(LIST, awaitsFirst("client.addTodo()")),
    RULE1,
  );
});

Deno.test("REQ-049: optimistic-writes rule 1 bites on an awaited client.<op> the contract does not know", async () => {
  const r = await optimisticBites(
    (c) => c.edit(LIST, awaitsFirst("client.purgeTodos()")),
    RULE1,
  );
  assert(
    r.notes!.some((n) => /not in openapi\.json.*purgeTodos/.test(n)),
    r.notes!.join("\n"),
  );
});

Deno.test("REQ-049: optimistic-writes rule 1 bites on an awaited bare write verb", async () => {
  await optimisticBites(
    (c) => c.edit(LIST, awaitsFirst("save(items())")),
    RULE1,
  );
});

Deno.test("REQ-049: optimistic-writes rule 1 bites on an awaited non-query call on an *Api receiver", async () => {
  await optimisticBites(
    (c) => c.edit(LIST, awaitsFirst("todoApi.archive()")),
    RULE1,
  );
});

Deno.test("REQ-049: optimistic-writes rule 2 bites on the loading-flag spinner around a write", async () => {
  await optimisticBites(
    (c) =>
      c.edit(
        LIST,
        (s) => s.replace("await client.listTodos()", "await client.addTodo()"),
      ),
    /^the UI changed only after the server answered .*\(in load,/,
  );
});

Deno.test("REQ-065: optimistic-writes rule 1 bites through a local helper that awaits the write", async () => {
  const helper = before(
    "export default defineComponent",
    "async function archive(id: string) {\n" +
      '  const res = await fetch(`/api/todos/${id}`, { method: "DELETE" });\n' +
      "  return res.ok;\n" +
      "}\n\n",
  );
  await optimisticBites(
    (c) => c.edit(LIST, (s) => awaitsFirst('archive("t1")')(helper(s))),
    RULE1,
  );
});

Deno.test("REQ-065: optimistic-writes control — a local helper that only reads stays green", async () => {
  await withCopy(OPT, async (c) => {
    await c.edit(
      LIST,
      (s) =>
        awaitsFirst('peek("t1")')(
          before(
            "export default defineComponent",
            [
              "async function peek(id: string) {",
              "  return (await fetch(`/api/todos/${id}`)).json();",
              "}",
              "",
            ].join("\n"),
          )(s),
        ),
    );
    assertGreen(await optimisticLint(c), "awaited read-only helper");
  });
});

Deno.test("REQ-049: optimistic-writes control — an awaited read (GET fetch, GET client op) stays green", async () => {
  await withCopy(OPT, async (c) => {
    await c.edit(LIST, awaitsFirst('fetch("/api/todos")'));
    assertGreen(await optimisticLint(c), "awaited GET fetch");
  });
});

Deno.test("REQ-049: optimistic-writes suppression sprig-wait: turns the finding into a suppressed entry", async () => {
  await withCopy(OPT, async (c) => {
    await c.edit(
      LIST,
      awaitsFirst(
        "client.addTodo()",
        "      // sprig-wait: the new id only exists server-side\n",
      ),
    );
    const r = await optimisticLint(c);
    assertEquals(r.findings, []);
    assertEquals(r.suppressed.map((s) => s.reason).sort(), [
      "payment auth — the receipt id only exists server-side",
      "the new id only exists server-side",
    ]);
  });
});

Deno.test("REQ-049: optimistic-writes suppression — a bare sprig-wait: (no reason) does not suppress", async () => {
  await withCopy(OPT, async (c) => {
    await c.edit(
      CHECKOUT,
      (s) =>
        s.replace(
          /\/\/ sprig-wait: .*\n/,
          "// sprig-wait:\n",
        ),
    );
    const r = await optimisticLint(c);
    assertOnly(
      r,
      "optimistic-writes",
      /server write awaited before the UI changed .*\(in pay,/,
    );
    assertEquals(r.suppressed, []);
  });
});

// ─── composition: unknown-tag + shadow (composition-app) ─────────────────────

const DASH = "src/pages/dashboard/template.html";
const CONFIRM = "src/shared/confirm-dialog/template.html";
const LOCAL_CARD = "src/pages/dashboard/components/card/template.html";
const ALLOW = "src/custom-elements.json";
const compose = (c: Copy) => checkComposition(join(c.root, "src"));

async function compositionBites(
  mutate: (c: Copy) => Promise<void>,
  error: RegExp,
): Promise<void> {
  await withCopy(COMPOSITION, async (c) => {
    const green = await compose(c);
    assertEquals(green.errors, [], "unmutated copy is not green");
    await mutate(c);
    const red = await compose(c);
    assertEquals(red.errors.length, 1, red.errors.join("\n"));
    assertMatch(red.errors[0], error);
  });
}

Deno.test("REQ-049: unknown-tag rule bites on a typo'd component tag and suggests the selector", async () => {
  await compositionBites(
    (c) => c.edit(DASH, append("<stat-crd></stat-crd>\n")),
    /unknown tag <stat-crd> .* did you mean <stat-card>\?/,
  );
});

Deno.test("REQ-049: unknown-tag rule bites on a tag nothing is close to", async () => {
  await compositionBites(
    (c) => c.edit(DASH, append("<quarterly-forecast></quarterly-forecast>\n")),
    /unknown tag <quarterly-forecast> .* no registered selector is close/,
  );
});

Deno.test("REQ-049: unknown-tag rule bites on a shared component using a page-local-only tag", async () => {
  await compositionBites(
    (c) => c.edit(CONFIRM, append("<stat-card></stat-card>\n")),
    /shared component <confirm-dialog> uses <stat-card>, which only page "dashboard" defines/,
  );
});

Deno.test("REQ-049: unknown-tag rule bites on a third-party tag dropped from custom-elements.json", async () => {
  await compositionBites(
    (c) => c.edit(ALLOW, () => "[]\n"),
    /unknown tag <x-foo>/,
  );
});

Deno.test("REQ-049: unknown-tag rule bites on a custom-elements.json entry that is not a custom-element name", async () => {
  await withCopy(COMPOSITION, async (c) => {
    assertEquals((await compose(c)).errors, []);
    await c.edit(ALLOW, () => '["x-foo", "Widget"]\n');
    await assertRejects(
      () => compose(c),
      Error,
      '"Widget") is not a custom-element name',
    );
  });
});

Deno.test("REQ-049: shadow rule bites on an undeclared page-local shadow of a shared selector", async () => {
  await compositionBites(
    (c) => c.edit(LOCAL_CARD, (s) => s.replace(/^<!--.*-->\n/, "")),
    /page-local <card> .* shadows the shared component <card> .* on page "dashboard"/,
  );
});

Deno.test("REQ-049: shadow rule bites on a sprig-shadows marker with no reason", async () => {
  await compositionBites(
    (c) =>
      c.edit(
        LOCAL_CARD,
        (s) => s.replace(/^<!--.*-->\n/, "<!-- sprig-shadows: -->\n"),
      ),
    /shadows the shared component <card> .* its sprig-shadows marker gives no reason/,
  );
});

Deno.test("REQ-049: shadow suppression sprig-shadows: turns the shadow into a declared note", async () => {
  await withCopy(COMPOSITION, async (c) => {
    await c.edit(LOCAL_CARD, (s) => s.replace(/^<!--.*-->\n/, ""));
    assertEquals((await compose(c)).errors.length, 1);
    await c.edit(
      LOCAL_CARD,
      (s) => "<!-- sprig-shadows: a denser tile for the KPI strip -->\n" + s,
    );
    const r = await compose(c);
    assertEquals(r.errors, []);
    assertStringIncludes(
      r.notes.join("\n"),
      "dashboard/card shadows shared card: a denser tile for the KPI strip",
    );
  });
});

// ─── REQ-055: generated `_preview` output is never judged ────────────────────

const PLANT_LOGIC =
  `import { defineComponent, signal } from "@techgoose-labs/sprig";
export default defineComponent({
  setup: () => {
    const items = signal<number[]>([]);
    const add = async () => {
      await fetch("/api/items", { method: "POST" });
      items.set([order.qty * 3]);
    };
    return { items, add };
  },
});
`;

/** Plant a dirty island and a duplicate template under `<dir>/` in ui/src. */
async function plant(c: Copy, dir: string): Promise<void> {
  await c.write(`ui/src/${dir}/targets/twin/logic.ts`, PLANT_LOGIC);
  await c.write(
    `ui/src/${dir}/targets/twin/template.html`,
    await Deno.readTextFile(join(c.root, FORM_TPL)),
  );
  await c.write(
    `ui/src/pages/${dir}/pv-twin/logic.ts`,
    PLANT_LOGIC,
  );
}

async function allLints(c: Copy): Promise<Finding[]> {
  const uiSrc = join(c.root, "ui", "src");
  const rs = await Promise.all([
    lintContractCalls({ uiSrc, gitRoot: c.root }),
    lintLogicPlacement({ uiSrc }),
    lintTokens({ uiSrc }),
    lintDuplicateTemplates({ uiSrc }),
    lintOptimisticWrites({ uiSrc, gitRoot: c.root }),
  ]);
  return rs.flatMap((r) => r.findings);
}

Deno.test("REQ-055: a planted _preview folder (dirty logic.ts + duplicate template) keeps every lint green", async () => {
  await withCopy(CLEAN, async (c) => {
    assertEquals(await allLints(c), []);
    await plant(c, "_preview");
    assertEquals(await allLints(c), []);
  });
});

Deno.test("REQ-055: control — the same plant under a non-generated name is red on every lint it breaks", async () => {
  await withCopy(CLEAN, async (c) => {
    await plant(c, "preview");
    const rules = [...new Set((await allLints(c)).map((f) => f.rule))].sort();
    assertEquals(rules, [
      "contract-calls/island-fetch",
      "duplicate-templates",
      "logic-placement/a",
      "optimistic-writes",
    ]);
  });
});

Deno.test("REQ-055: the composition check skips a planted _preview folder (and bites on the same plant elsewhere)", async () => {
  await withCopy(COMPOSITION, async (c) => {
    const tpl = "<main><stat-crd></stat-crd></main>\n";
    await c.write("src/_preview/targets/twin/template.html", tpl);
    await c.write("src/pages/_preview/pv-twin/template.html", tpl);
    // `sprig check` scans with the shared skip list; the build (which compiles
    // the workbench's previews) scans everything
    const asCheck = () =>
      checkComposition(join(c.root, "src"), { skipDirs: SKIP_DIRS });
    assertEquals((await asCheck()).errors, []);
    assertEquals((await compose(c)).errors.length, 2);
    await c.write("src/preview/targets/twin/template.html", tpl);
    assertEquals((await asCheck()).errors.length, 1);
  });
});

// ─── REQ-054: the contract waist at the call site (write-wrapper-app) ────────

const WRAP = join(LINTS, "write-wrapper-app");
const TODOS = "ui/src/islands/todos/logic.ts";
const WAIST =
  "queries are GET, commands are POST; a write that needs PUT/PATCH/DELETE is a command the contract does not have yet";
const dropDelete = (s: string) =>
  s.replace(/\n    const remove = [^\n]*\n[^\n]*\n/, "\n").replace(
    ", remove }",
    " }",
  );

Deno.test("REQ-054: a UI call to a generated DELETE wrapper is the one finding; the GET and POST wrappers pass", async () => {
  const r = await lintContractCalls({
    uiSrc: join(WRAP, "ui", "src"),
    gitRoot: WRAP,
  });
  assertEquals(r.skipped, undefined);
  assertEquals(r.findings.length, 1, show(r));
  const [f] = r.findings;
  assertEquals(f.rule, "contract-calls/write-method");
  assert(f.file.endsWith("islands/todos/logic.ts"), f.file);
  assertEquals(f.line, 14);
  assertStringIncludes(f.message, "api.removeTodo(");
  assertStringIncludes(f.message, "DELETE /api/todos/{id}");
  assertStringIncludes(f.message, WAIST);
});

Deno.test("REQ-049: contract-calls rule write-method bites on a call to a generated DELETE wrapper", async () => {
  await withCopy(WRAP, async (c) => {
    await c.edit(TODOS, dropDelete);
    assertGreen(await contract(c));
    await c.edit(
      TODOS,
      after(
        "const load =",
        "    const drop = (id: string) => api.removeTodo({ id });\n",
      ),
    );
    assertOnly(
      await contract(c),
      "contract-calls/write-method",
      /api\.removeTodo\(…\) calls DELETE \/api\/todos\/\{id\}/,
    );
  });
});

Deno.test("REQ-049: contract-calls rule write-method bites on a PATCH wrapper the contract gains", async () => {
  await withCopy(WRAP, async (c) => {
    await c.edit(TODOS, dropDelete);
    assertGreen(await contract(c));
    await c.edit("spec/contract/openapi.json", (s) => {
      const j = JSON.parse(s);
      j.paths["/api/todos/{id}"].patch = { operationId: "renameTodo" };
      return JSON.stringify(j, null, 2);
    });
    await c.edit(
      TODOS,
      after(
        "const load =",
        '    const rename = (id: string) => api.renameTodo({ id, title: "x" });\n',
      ),
    );
    assertOnly(
      await contract(c),
      "contract-calls/write-method",
      /api\.renameTodo\(…\) calls PATCH \/api\/todos\/\{id\}/,
    );
  });
});

Deno.test("REQ-054: contract-calls suppression sprig-contract: turns the write-method finding into a suppressed entry", async () => {
  await withCopy(WRAP, async (c) => {
    await c.edit(
      TODOS,
      before(
        "() => api.removeTodo(",
        "      // sprig-contract: the purge command lands next sprint\n",
      ),
    );
    const r = await contract(c);
    assertEquals(r.findings, []);
    assertEquals(r.suppressed.map((s) => s.reason), [
      "the purge command lands next sprint",
    ]);
  });
});

Deno.test("REQ-054: with no openapi.json the write-method rule is skipped with the reason, the other rules still run", async () => {
  await withCopy(WRAP, async (c) => {
    await Deno.remove(join(c.root, "spec", "contract", "openapi.json"));
    const r = await contract(c);
    assertEquals(r.skipped, undefined);
    assertEquals(r.findings, []);
    assert(
      (r.notes ?? []).some((n) =>
        /write-method: no spec\/contract\/openapi\.json/.test(n)
      ),
      JSON.stringify(r.notes),
    );
  });
});
