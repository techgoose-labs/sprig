import { assert, assertStringIncludes } from "@std/assert";
import { renderSpecCheck } from "./spec-check.ts";

Deno.test("REQ-032: renderSpecCheck is never silent — ok with a count, skipped with its reason, every finding with where + fix hint, reads and notes", () => {
  const text = renderSpecCheck({
    ok: false,
    checks: [
      {
        name: "unassigned",
        ok: true,
        read: ["spec/ui/breakdown/inventory.json"],
        items: 5,
        findings: [],
      },
      {
        name: "binding-drift",
        ok: true,
        read: [],
        skipped: "no spec/contract/openapi.json — nothing to bind against",
        items: 0,
        findings: [],
      },
      {
        name: "built",
        ok: false,
        read: ["ui/src"],
        notes: [
          "shared units looked up in shared-components/, components/, islands/",
        ],
        items: 3,
        findings: [{
          where: "ui/src/pages/archive",
          message: "page archive is not built",
          hint: "build it with sprig-build-component",
        }],
      },
    ],
  });
  assertStringIncludes(text, "unassigned");
  assertStringIncludes(text, "ok (5 items)");
  assertStringIncludes(text, "read: spec/ui/breakdown/inventory.json");
  assertStringIncludes(text, "skipped: no spec/contract/openapi.json");
  assertStringIncludes(text, "FAIL (1 finding)");
  assertStringIncludes(
    text,
    "ui/src/pages/archive — page archive is not built",
  );
  assertStringIncludes(text, "fix: build it with sprig-build-component");
  assertStringIncludes(text, "note: shared units looked up");
  assert(text.trimEnd().split("\n").at(-1)!.includes("FAIL"), text);
});

Deno.test("REQ-032: renderSpecCheck — a check that read nothing still says so", () => {
  const text = renderSpecCheck({
    ok: true,
    checks: [{
      name: "double-assignment",
      ok: true,
      read: [],
      items: 0,
      findings: [],
    }],
  });
  assertStringIncludes(text, "read: (nothing)");
  assertStringIncludes(text, "ok (0 items)");
});
