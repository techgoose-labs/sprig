// Terminal formatting: problem reports, the `list` table, and test-run output.
import { colors } from "@cliffy/ansi/colors";
import { Table } from "@cliffy/table";
import type {
  ComponentEntry,
  Problem,
} from "../../server/src/core/business/discover/mod.ts";
import type { TestReport } from "../../server/src/core/business/runner/mod.ts";
import type { Row } from "./verdict.ts";

const HEAD: Record<Problem["kind"], string> = {
  "fixture-json": "malformed fixture.json",
  "case-json": "malformed case JSON",
  "component-file": "unresolved component file",
  "component-export": "component export not found",
  "component-name": "component name is a native or reserved tag",
  "case-key": "invalid case key",
  "unsupported": "feature not yet supported",
};

const rel = (p: string, root: string) =>
  p.startsWith(root + "/") ? p.slice(root.length + 1) : p;

/** A human-readable batch of discovery problems; paths shown relative to root. */
export function formatProblems(problems: Problem[], root: string): string {
  return problems
    .map((p) =>
      `  ${colors.yellow("⚠ " + HEAD[p.kind])}\n      ${
        rel(p.path, root)
      }\n      ${p.detail}`
    )
    .join("\n\n");
}

/** Render discovered components as a table (used by `isolate list`). */
export function renderList(entries: ComponentEntry[], root: string): void {
  const total = entries.reduce((n, e) => n + e.cases.length, 0);
  console.log(
    colors.bold(`isolate`) +
      `  —  ${entries.length} component(s), ${total} case(s) under ${root}\n`,
  );
  new Table()
    .header(
      ["Component", "Kind", "Category", "Cases", "Tests"].map((h) =>
        colors.dim(h)
      ),
    )
    .body(
      entries.map((e) => [
        e.label,
        e.kind === "island" ? colors.cyan("island") : "static",
        e.category,
        String(e.cases.length),
        String(e.cases.reduce((n, c) => n + c.tests.length, 0)),
      ]),
    )
    .padding(2)
    .render();
  console.log("");
  for (const e of entries) {
    for (const c of e.cases) {
      const t = c.tests.length ? colors.dim(` (${c.tests.length} test)`) : "";
      console.log(
        `  ${colors.dim(e.label + " ›")} ${c.name}  →  ${c.route}${t}`,
      );
    }
  }
}

/** Print a test report (human-readable). Returns nothing — caller sets exit code. */
export function printReport(
  report: TestReport & { testResults: Row[]; skipped?: number },
  root: string,
): void {
  const skipped = report.skipped ?? 0;
  if (!report.ran && !skipped) {
    console.error(
      colors.red("✗ Couldn't run tests:\n") + (report.error ?? "unknown error"),
    );
    return;
  }
  for (const t of report.testResults) {
    const head = t.caseName ? colors.dim(t.caseName + " › ") : "";
    if (t.skipped) {
      console.log(
        `  ${colors.yellow("-")} ${colors.dim(t.unit ? t.unit + " › " : "")}${
          t.caseName ?? t.title
        }   ${colors.yellow(t.detail ?? "skipped")}`,
      );
    } else if (t.ok) {
      console.log(`  ${colors.green("✓")} ${head}${t.title}`);
      if (t.detail) {
        console.log(
          colors.dim(t.detail.split("\n").map((l) => "      " + l).join("\n")),
        );
      }
    } else {
      const where = rel(t.file, root) + (t.line ? `:${t.line}` : "");
      console.log(
        `  ${colors.red("✗")} ${head}${t.title}   ${
          colors.dim("(" + where + ")")
        }`,
      );
      if (t.error) {
        console.log(t.error.split("\n").map((l) => "      " + l).join("\n"));
      }
      if (t.detail && t.detail !== t.error) {
        const extra = t.detail.split("\n").filter((l) => !t.error?.includes(l));
        if (extra.length) {
          console.log(colors.dim(extra.map((l) => "      " + l).join("\n")));
        }
      }
      if (t.evidence) console.log(`      ↳ evidence: ${t.evidence}`);
      if (t.screenshot) console.log(`      ↳ screenshot: ${t.screenshot}`);
    }
  }
  // REQ-056 — the counts are passed/failed/skipped; a run that checked nothing is red.
  const summary =
    `${report.passed} passed, ${report.failed} failed, ${skipped} skipped`;
  console.log(
    "\n" + (report.ok ? colors.green(summary) : colors.red(summary)) + ".",
  );
  if (!report.ok && report.error) {
    console.log(colors.red("✗ " + report.error));
  }
  if (report.evidenceDir) {
    console.log(colors.dim(`evidence: ${report.evidenceDir}`));
  }
}
