// REQ-028 — the duplicate-templates lint over a fixture app (fixtures/lints/dup-app).
import { assert, assertEquals, assertMatch } from "@std/assert";
import { fromFileUrl } from "@std/path";
import { lintDuplicateTemplates } from "./duplicate-templates.ts";

const uiSrc = fromFileUrl(
  new URL("../../../../fixtures/lints/dup-app/ui/src", import.meta.url),
);
const tpl = (unit: string) => `${uiSrc}/components/${unit}/template.html`;

Deno.test("REQ-028: two near-duplicate cards are an error naming both and the score", async () => {
  const r = await lintDuplicateTemplates({ uiSrc });
  assertEquals(r.findings.length, 1, JSON.stringify(r.findings, null, 2));
  const f = r.findings[0];
  assertEquals([f.rule, f.file, f.line, f.severity], [
    "duplicate-templates",
    tpl("member-card"),
    1,
    "error",
  ]);
  assertMatch(
    f.message,
    /^near-duplicate templates: components\/member-card and components\/profile-card \(1\.00\)$/,
  );
  assertMatch(
    f.hint,
    /compose one from the other, promote to shared-components\/, or justify with `<!-- sprig-duplicate: <reason> -->`/,
  );
});

Deno.test("REQ-028: a justified pair is listed with its reason, never silent", async () => {
  const r = await lintDuplicateTemplates({ uiSrc });
  assertEquals(r.suppressed.length, 1);
  const s = r.suppressed[0];
  assertEquals([s.file, s.line], [tpl("invoice-list"), 1]);
  assertMatch(
    s.reason,
    /^justified: components\/invoice-list ~ components\/order-list \(\d\.\d\d\) — invoices gain per-row payment actions/,
  );
});

Deno.test("REQ-028: tiny templates are skipped by name; every template is listed as checked", async () => {
  const r = await lintDuplicateTemplates({ uiSrc });
  assertEquals(r.checked.length, 6);
  assert(
    r.notes.includes(
      "skipped components/icon-wrap: 1 node < 4, too small to compare",
    ),
    r.notes.join("\n"),
  );
  assert(
    r.notes.includes("compared 5 templates pairwise at threshold 0.85"),
    r.notes.join("\n"),
  );
});

Deno.test("REQ-028: above every score, nothing is flagged and an idle justification is a warning", async () => {
  const r = await lintDuplicateTemplates({ uiSrc, threshold: 1.01 });
  assertEquals(r.suppressed, []);
  assertEquals(r.findings.map((f) => [f.file, f.severity]), [[
    tpl("invoice-list"),
    "warn",
  ]]);
  assertMatch(r.findings[0].message, /excuses no pair at 1\.01/);
});

Deno.test("REQ-028: the result is deterministic across runs", async () => {
  const a = await lintDuplicateTemplates({ uiSrc });
  const b = await lintDuplicateTemplates({ uiSrc });
  assertEquals(a, b);
});
