// REQ-027 — the tokens lint over whole fixture apps (fixtures/lints/tokens-*).
import { assert, assertEquals, assertMatch } from "@std/assert";
import { fromFileUrl } from "@std/path";
import { lintTokens } from "./tokens.ts";

const app = (name: string) =>
  fromFileUrl(
    new URL(`../../../../fixtures/lints/${name}/ui/src`, import.meta.url),
  );

Deno.test("REQ-027: a clean app has no findings, lists its one justified value, and names what it skipped", async () => {
  const uiSrc = app("tokens-clean");
  const r = await lintTokens({ uiSrc });
  assertEquals(r.findings, []);
  assertEquals(r.skipped, undefined);
  assertEquals(r.suppressed, [{
    file: `${uiSrc}/components/badge/styles.css`,
    line: 11,
    reason: "the legal notice color is mandated by counsel, not the brand",
  }]);
  assertEquals(r.checked, [
    `${uiSrc}/css-variables.json`,
    `${uiSrc}/components/badge/styles.css`,
    `${uiSrc}/components/badge/template.html`,
  ]);
  assert(
    r.notes.some((n) =>
      /skipped _isolate\/ — generated isolate harness/.test(n)
    ),
    r.notes.join("\n"),
  );
});

Deno.test("REQ-027: a dirty app names every offender as file:line with its fix", async () => {
  const uiSrc = app("tokens-dirty");
  const r = await lintTokens({ uiSrc });
  const css = `${uiSrc}/components/card/styles.css`;
  const html = `${uiSrc}/components/card/template.html`;
  assertEquals(
    r.findings.map((f) => [f.file, f.line, f.severity, f.hint]),
    [
      [css, 2, "error", "use var(--color-primary)"],
      [css, 3, "error", "add it to css-variables.json and use var(--…)"],
      [css, 4, "error", "use var(--space-2)"],
      [
        css,
        5,
        "error",
        "use var(--font-body), or add the font to css-variables.json",
      ],
      [html, 2, "error", "add it to css-variables.json and use var(--…)"],
    ],
  );
  assertMatch(
    r.findings[3].message,
    /off-system font: font-family Comic Sans MS, cursive/,
  );
  assertEquals(r.suppressed, [{
    file: html,
    line: 4,
    reason: "the partner logo tint is theirs, not ours",
  }]);
});

Deno.test("REQ-027: an app with no css-variables.json is skipped, and says why", async () => {
  const r = await lintTokens({ uiSrc: app("tokens-none") });
  assertEquals(r.findings, []);
  assertEquals(r.checked, []);
  assertMatch(
    r.skipped ?? "",
    /css-variables\.json — the app declares no design tokens/,
  );
});
