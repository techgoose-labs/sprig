/**
 * Shared shapes for the `sprig check` source lints (contract-calls,
 * logic-placement, tokens, duplicate-templates). Every lint is a pure
 * function of the filesystem that returns a {@link LintResult}; the caller
 * prints it and exits non-zero on any `error` finding.
 */

/** One offending site: where it is, what rule it broke, and how to fix it. */
export type Finding = {
  rule: string;
  file: string;
  line: number;
  col?: number;
  message: string;
  hint: string;
  severity: "error" | "warn";
};

/** What a lint found, what it let through on purpose, and what it looked at. */
export type LintResult = {
  findings: Finding[];
  suppressed: { file: string; line: number; reason: string }[];
  skipped?: string;
  checked: string[];
  /** anything else the reader should know: partial skips and why */
  notes?: string[];
};

/** The lines `sprig check` prints for one lint — never silent: what it
 *  checked (or why it skipped), every finding as file:line with its fix
 *  hint, each suppression with its reason, then any notes. */
export function formatLintResult(name: string, r: LintResult): string[] {
  const notes = (r.notes ?? []).map((n) => `  note: ${n}`);
  if (r.skipped) return [`${name}: ${r.skipped} — skipped`, ...notes];
  const errors = r.findings.filter((f) => f.severity === "error").length;
  const out = [
    `${name}: checked ${r.checked.length} file(s) — ${errors} error(s), ${
      r.findings.length - errors
    } warning(s), ${r.suppressed.length} suppressed`,
  ];
  for (const f of r.findings) {
    out.push(
      `  ${f.severity} ${f.file}:${f.line}${
        f.col ? `:${f.col}` : ""
      } [${f.rule}] ${f.message}`,
      `    fix: ${f.hint}`,
    );
  }
  for (const s of r.suppressed) {
    out.push(`  suppressed ${s.file}:${s.line} — ${s.reason}`);
  }
  return [...out, ...notes];
}
