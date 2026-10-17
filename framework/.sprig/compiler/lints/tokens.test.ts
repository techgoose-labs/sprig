// REQ-027 — the tokens lint: raw colors, token-valued lengths and off-system
// fonts in styles.css and template style="…" attributes, over in-memory strings.
import { assert, assertEquals, assertMatch } from "@std/assert";
import {
  describeFamilies,
  lintCssText,
  lintTemplateStyles,
  readTokenFile,
} from "./tokens.ts";

const TOKENS: Record<string, string> = {
  "--color-primary": "#3366ff",
  "--color-ink": "rgb(10, 20, 30)",
  "--space-2": "8px",
  "--radius-box": "0.5rem",
  "--font-body": "'Inter', sans-serif",
};

Deno.test("REQ-027: a raw hex with a token of that exact value names the token", () => {
  const r = lintCssText(".a {\n  color: #36F;\n}\n", "c/styles.css", TOKENS);
  assertEquals(r.findings.length, 1);
  const f = r.findings[0];
  assertEquals([f.rule, f.file, f.line, f.severity], [
    "tokens",
    "c/styles.css",
    2,
    "error",
  ]);
  assertMatch(f.message, /#36F/);
  assertEquals(f.hint, "use var(--color-primary)");
});

Deno.test("REQ-027: a raw color with no matching token says to add one", () => {
  const r = lintCssText(
    ".a { background: rgba(1,2,3,.5); border-color: tomato; }",
    "x.css",
    TOKENS,
  );
  assertEquals(r.findings.length, 2);
  for (const f of r.findings) {
    assertEquals(f.hint, "add it to css-variables.json and use var(--…)");
  }
  assertMatch(r.findings[0].message, /rgba\(1,2,3,\.5\)/);
  assertMatch(r.findings[1].message, /tomato/);
});

Deno.test("REQ-027: rgb() matches a token whatever its spacing", () => {
  const r = lintCssText(".a { color: rgb(10,20,30); }", "x.css", TOKENS);
  assertEquals(r.findings[0].hint, "use var(--color-ink)");
});

Deno.test("REQ-027: transparent, currentColor, inherit and var() are not raw colors", () => {
  const r = lintCssText(
    ".a { color: currentColor; background: transparent; border-color: inherit; outline-color: var(--color-primary); }",
    "x.css",
    TOKENS,
  );
  assertEquals(r.findings, []);
});

Deno.test("REQ-027: a named color inside an identifier, a string or a url is not a color", () => {
  const r = lintCssText(
    '.red-box { color: var(--red-ish); content: "red"; background-image: url(red.png); animation-name: red; }',
    "x.css",
    TOKENS,
  );
  assertEquals(r.findings, []);
});

Deno.test("REQ-027: a px/rem length equal to a token's value names the token; others pass", () => {
  const r = lintCssText(
    ".a { padding: 8px 3px; border-radius: .5rem; margin: 0; }",
    "x.css",
    TOKENS,
  );
  assertEquals(r.findings.map((f) => f.hint), [
    "use var(--space-2)",
    "use var(--radius-box)",
  ]);
  assertMatch(r.findings[0].message, /8px.*--space-2/);
});

Deno.test("REQ-027: lengths inside a media query are not declarations", () => {
  const r = lintCssText(
    "@media (min-width: 8px) { .a { color: var(--color-ink); } }",
    "x.css",
    TOKENS,
  );
  assertEquals(r.findings, []);
});

Deno.test("REQ-027: an off-system font-family is an error; the token's value says use the token", () => {
  const off = lintCssText(
    ".a { font-family: Comic Sans MS, cursive; }",
    "x.css",
    TOKENS,
  );
  assertEquals(off.findings.length, 1);
  assertMatch(off.findings[0].message, /off-system font/);
  assertMatch(off.findings[0].hint, /--font-body/);
  const same = lintCssText(
    '.a { font-family: "Inter",sans-serif; }',
    "x.css",
    TOKENS,
  );
  assertEquals(same.findings.length, 1);
  assertEquals(same.findings[0].hint, "use var(--font-body)");
  const ok = lintCssText(
    ".a { font-family: var(--font-body); } .b { font-family: inherit; }",
    "x.css",
    TOKENS,
  );
  assertEquals(ok.findings, []);
});

Deno.test("REQ-027: a same-line /* sprig-token: reason */ suppresses and is listed with its reason", () => {
  const r = lintCssText(
    ".a {\n  color: #ff0000; /* sprig-token: brand red from the legal footer */\n  background: #00ff00;\n}",
    "x.css",
    TOKENS,
  );
  assertEquals(r.findings.map((f) => f.line), [3]);
  assertEquals(r.suppressed, [{
    file: "x.css",
    line: 2,
    reason: "brand red from the legal footer",
  }]);
});

Deno.test("REQ-027: a suppression with no reason suppresses nothing and says so", () => {
  const r = lintCssText(
    ".a { color: #ff0000; /* sprig-token: */ }",
    "x.css",
    TOKENS,
  );
  assertEquals(r.suppressed, []);
  assert(r.findings.some((f) => /raw color/.test(f.message)));
  assert(r.findings.some((f) => /needs a reason/.test(f.message)));
});

Deno.test("REQ-027: a color in a comment is not a declaration", () => {
  const r = lintCssText(
    "/* was #ff0000 */ .a { color: var(--color-ink); }",
    "x.css",
    TOKENS,
  );
  assertEquals(r.findings, []);
});

Deno.test("REQ-027: template style attributes are linted at their line", async () => {
  const html =
    `<div class="a">\n  <span style="color: #3366ff; padding: 8px">x</span>\n  <b style="color: var(--color-ink)">y</b>\n</div>`;
  const r = await lintTemplateStyles(html, "c/template.html", TOKENS);
  assertEquals(r.findings.map((f) => [f.line, f.hint]), [
    [2, "use var(--color-primary)"],
    [2, "use var(--space-2)"],
  ]);
});

Deno.test("REQ-027: <!-- sprig-token: reason --> before the element suppresses its style", async () => {
  const html =
    `<div>\n  <!-- sprig-token: third-party widget color -->\n  <span style="color: red">x</span>\n  <i style="color: blue"></i>\n</div>`;
  const r = await lintTemplateStyles(html, "t.html", TOKENS);
  assertEquals(r.findings.map((f) => f.line), [4]);
  assertEquals(r.suppressed, [{
    file: "t.html",
    line: 3,
    reason: "third-party widget color",
  }]);
});

Deno.test("REQ-027: the themed css-variables.json the build compiles is read across every theme", () => {
  const { tokens, notes } = readTokenFile(JSON.stringify({
    _note: "derived",
    default: "dark",
    themes: {
      dark: {
        "color-scheme": "dark",
        "--color-base-100": "#1E1712",
        "--space-2": "8px",
      },
      light: { "--color-base-100": "#FFFFFF" },
    },
  }));
  assertEquals(tokens, {
    "--color-base-100": ["#1E1712", "#FFFFFF"],
    "--space-2": ["8px"],
  });
  assertEquals(notes, []);
  const r = lintCssText(
    ".a { color: #fff; background: #1e1712; }",
    "x.css",
    tokens,
  );
  assertEquals(r.findings.map((f) => f.hint), [
    "use var(--color-base-100)",
    "use var(--color-base-100)",
  ]);
});

Deno.test("REQ-027: a flat --* map is read too, and noted as not the shape the build accepts", () => {
  const { tokens, notes } = readTokenFile(
    JSON.stringify({ "--a": "1px", other: "x" }),
  );
  assertEquals(tokens, { "--a": ["1px"] });
  assertMatch(notes.join("\n"), /no "themes" object/);
});

Deno.test("REQ-027: a var() fallback equal to that token's own value passes; a drifted fallback does not", () => {
  const tokens = { "--color-base-100": ["#1e1712"], "--step-0": ["1rem"] };
  const ok = lintCssText(
    ".a { background: var(--color-base-100, #1E1712); font-size: var(--step-0, 1rem); }",
    "x.css",
    tokens,
  );
  assertEquals(ok.findings, []);
  const drift = lintCssText(
    ".a { background: var(--color-base-100, #000); }",
    "x.css",
    tokens,
  );
  assertEquals(drift.findings.length, 1);
  assertMatch(drift.findings[0].message, /raw color #000/);
});

const FAMILY_TOKENS = {
  "--radius-selector": "1rem",
  "--step-0": "1rem",
  "--radius-box": "1.25rem",
  "--radius-field": "0.75rem",
  "--space-3": "0.75rem",
  "--shadow-blur": "2px",
};

Deno.test("REQ-027: a font-size length names only the step/text family token", () => {
  const r = lintCssText(
    ".a { font-size: 1rem; line-height: 1rem; }",
    "x.css",
    FAMILY_TOKENS,
  );
  assertEquals(r.findings.map((f) => f.hint), [
    "use var(--step-0)",
    "use var(--step-0)",
  ]);
});

Deno.test("REQ-027: a length equal only to another family's token is not a finding", () => {
  const r = lintCssText(
    ".a { padding: 1.25rem; margin-top: 1rem; }",
    "x.css",
    FAMILY_TOKENS,
  );
  assertEquals(r.findings, []);
});

Deno.test("REQ-027: spacing properties match space tokens, radius matches radius, shadow matches shadow", () => {
  const r = lintCssText(
    ".a { gap: 0.75rem; border-top-left-radius: 0.75rem; box-shadow: 0 1px 2px black; }",
    "x.css",
    { ...FAMILY_TOKENS, "--color-x": "black" },
  );
  assertEquals(r.findings.map((f) => f.hint), [
    "use var(--space-3)",
    "use var(--radius-field)",
    "use var(--shadow-blur)",
    "use var(--color-x)",
  ]);
});

Deno.test("REQ-027: a property with no token family is never a length finding", () => {
  const r = lintCssText(
    ".a { letter-spacing: 1rem; border-width: 2px; }",
    "x.css",
    FAMILY_TOKENS,
  );
  assertEquals(r.findings, []);
});

Deno.test("REQ-027: the notes line names each family and how many tokens the app has in it", () => {
  assertEquals(
    describeFamilies(FAMILY_TOKENS),
    "token families: step 1 (--step-0), radius 3 (--radius-box, --radius-field, --radius-selector), space 1 (--space-3), shadow 1 (--shadow-blur)",
  );
  assertEquals(
    describeFamilies({ "--color-a": "red" }),
    "token families: step 0, radius 0, space 0, shadow 0 — no length is matched against a token",
  );
});
