// REQ-056 — no vacuous green. Every discovered case gets a row: a case with no
// spec files and no `_reference`/`_motion` measurement is a `skipped` row (it
// does not fail the run, but it is not a pass). The report counts
// passed/failed/skipped, and a run where nothing was checked — every case
// skipped, or no case at all — fails: a fidelity run that measures nothing is
// not a pass.
import type { ComponentEntry } from "../../server/src/core/business/discover/mod.ts";
import type {
  TestReport,
  TestResult,
} from "../../server/src/core/business/runner/mod.ts";

export const SKIP_REASON = "skipped — no tests, no _reference";
export const NOTHING_CHECKED = "nothing was checked";

export interface Row extends TestResult {
  skipped?: boolean;
}

export interface Verdict extends TestReport {
  testResults: Row[];
  skipped: number;
  exitCode: 0 | 1;
}

/** The cases a run selects (no filter, or `<unit>/<case>` contains it) that have
 *  nothing to check — one `skipped` row each. */
export function skippedRows(
  entries: ComponentEntry[],
  filter?: string,
): Row[] {
  const rows: Row[] = [];
  for (const e of entries) {
    for (const c of e.cases ?? []) {
      const key = `${e.label}/${c.name}`;
      if (filter && !key.includes(filter)) continue;
      if ((c.tests ?? []).length || c.reference || c.motion) continue;
      rows.push({
        caseName: c.name,
        unit: e.label,
        route: c.route,
        ...(c.tier ? { tier: c.tier } : {}),
        title: `skipped: ${key}`,
        file: c.jsonPath ?? "",
        ok: true, // does not fail the run — but counted as skipped, never passed
        skipped: true,
        detail: SKIP_REASON,
      });
    }
  }
  return rows;
}

/** Fold the skipped rows into the runner's report (null = the runner never ran:
 *  nothing selected had anything to check) and decide the exit code. */
export function verdict(report: TestReport | null, skipped: Row[]): Verdict {
  const base: TestReport = report ?? {
    ok: false,
    ran: false,
    total: 0,
    passed: 0,
    failed: 0,
    testResults: [],
  };
  const checked = base.passed + base.failed;
  const out: Verdict = {
    ...base,
    testResults: [...base.testResults, ...skipped],
    skipped: skipped.length,
    total: checked + skipped.length,
    exitCode: 1,
  };
  if (!report || (checked === 0 && !base.error)) {
    out.ok = false;
    out.error = skipped.length
      ? `${NOTHING_CHECKED} — every selected case was skipped (${skipped.length}): no tests, no _reference, no _motion`
      : `${NOTHING_CHECKED} — no case selected`;
    return out;
  }
  out.ok = base.ran && base.failed === 0 && !base.error;
  out.exitCode = out.ok ? 0 : 1;
  return out;
}
