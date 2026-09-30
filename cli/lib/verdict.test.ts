// REQ-056 (unit) — no vacuous green: every discovered case gets a row. A case
// with no tests and no `_reference`/`_motion` is a `skipped` row; the report
// counts passed/failed/skipped; a run where every case is skipped (or nothing
// ran at all) is "nothing was checked" and exits 1.
import { assert, assertEquals, assertStringIncludes } from "#std/assert";
import {
  NOTHING_CHECKED,
  SKIP_REASON,
  skippedRows,
  verdict,
} from "./verdict.ts";
import type { ComponentEntry } from "../../server/src/core/business/discover/mod.ts";
import type { TestReport } from "../../server/src/core/business/runner/mod.ts";

// deno-lint-ignore no-explicit-any
const entry = (label: string, cases: any[]): ComponentEntry =>
  ({ label, cases }) as unknown as ComponentEntry;

const ENTRIES = [
  entry("swatch", [
    { name: "match", route: "/m", reference: { image: "ref.png" }, tests: [] },
    { name: "bare", route: "/b", tests: [], jsonPath: "/x/bare/bare.json" },
  ]),
  entry("saver", [
    { name: "ok", route: "/o", tests: [{ file: "/x/ok.spec.ts" }] },
    { name: "idle", route: "/i", tests: [], jsonPath: "/x/idle/idle.json" },
    { name: "moves", route: "/v", motion: { spec: "m.json" }, tests: [] },
  ]),
];

const ran = (ok: number, bad: number): TestReport => ({
  ok: bad === 0,
  ran: true,
  total: ok + bad,
  passed: ok,
  failed: bad,
  testResults: [
    ...Array.from(
      { length: ok },
      (_, i) => ({ title: `p${i}`, file: "f", ok: true }),
    ),
    ...Array.from(
      { length: bad },
      (_, i) => ({ title: `f${i}`, file: "f", ok: false }),
    ),
  ],
});

Deno.test("REQ-056: a case with no tests, no _reference, no _motion is a skipped row", () => {
  const rows = skippedRows(ENTRIES);
  assertEquals(rows.map((r) => r.title), [
    "skipped: swatch/bare",
    "skipped: saver/idle",
  ]);
  for (const r of rows) {
    assertEquals(r.skipped, true);
    assertEquals(r.detail, SKIP_REASON);
  }
  assertEquals(SKIP_REASON, "skipped — no tests, no _reference");
  assertEquals(rows[0].file, "/x/bare/bare.json");
});

Deno.test("REQ-056: a filter narrows the skipped rows by <unit>/<case>", () => {
  assertEquals(skippedRows(ENTRIES, "saver").map((r) => r.title), [
    "skipped: saver/idle",
  ]);
  assertEquals(skippedRows(ENTRIES, "swatch/match"), []);
});

Deno.test("REQ-056: the verdict carries passed/failed/skipped and every row", () => {
  const v = verdict(ran(3, 0), skippedRows(ENTRIES));
  assertEquals([v.passed, v.failed, v.skipped, v.total], [3, 0, 2, 5]);
  assertEquals(v.testResults.length, 5);
  assertEquals([v.ok, v.exitCode], [true, 0]);
  const red = verdict(ran(3, 1), skippedRows(ENTRIES));
  assertEquals([red.ok, red.exitCode, red.failed], [false, 1, 1]);
});

Deno.test("REQ-056: every case skipped → nothing was checked, exit 1", () => {
  const v = verdict(null, skippedRows(ENTRIES));
  assertEquals([v.ok, v.ran, v.exitCode], [false, false, 1]);
  assertEquals([v.passed, v.failed, v.skipped], [0, 0, 2]);
  assertStringIncludes(v.error!, NOTHING_CHECKED);
  assertEquals(NOTHING_CHECKED, "nothing was checked");
});

Deno.test("REQ-056: no case at all is not a pass either", () => {
  const v = verdict(null, []);
  assertEquals([v.ok, v.exitCode], [false, 1]);
  assertStringIncludes(v.error!, NOTHING_CHECKED);
});

Deno.test("REQ-056: a run that could not run keeps its error and fails", () => {
  const broke: TestReport = {
    ...ran(0, 0),
    ran: false,
    ok: false,
    error: "boom",
  };
  const v = verdict(broke, []);
  assertEquals([v.ok, v.exitCode, v.error], [false, 1, "boom"]);
  assert(!v.error!.includes(NOTHING_CHECKED));
});
