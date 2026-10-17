import { assertEquals } from "@std/assert";
import { formatLintResult, type LintResult } from "./lint-types.ts";

Deno.test("REQ-023 AMENDMENT: formatLintResult prints a lint's notes after its summary, and with a skip", () => {
  const r: LintResult = {
    findings: [],
    suppressed: [],
    checked: ["a.ts"],
    notes: ["pages/x: no template.html — handlers unknown"],
  };
  assertEquals(formatLintResult("l", r), [
    "l: checked 1 file(s) — 0 error(s), 0 warning(s), 0 suppressed",
    "  note: pages/x: no template.html — handlers unknown",
  ]);
  assertEquals(
    formatLintResult("l", { ...r, checked: [], skipped: "nothing here" }),
    [
      "l: nothing here — skipped",
      "  note: pages/x: no template.html — handlers unknown",
    ],
  );
});
