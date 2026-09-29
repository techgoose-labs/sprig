// Ported test-runner core (from reference/main.ts parseReport + scaffold.ts
// filterSpecs/specReason). Pure-ish module — the testing module's data adapter
// delegates here. Raises the spec's fault slugs by THROWING Error(<slug>): keep
// maps a thrown error to a failure response whose body.message is the slug, which
// fixtures/heal-rules.json keys on. Dependency-injectable for deterministic tests.

import { isAbsolute, join, relative, resolve } from "#std/path";
import {
  type ComponentEntry,
  discover as realDiscover,
  type Tier,
} from "../discover/mod.ts";
import {
  ACTUAL_PNG,
  CONFIG_FILE,
  configSource,
  DIFF_PNG,
  HARNESS_FILE,
  HARNESS_SOURCE,
  MOTION_ACTUAL,
  type PlannedCase,
  WRAPPER_SUFFIX,
  wrapperSource,
} from "./harness.ts";
import { compareReferenceFiles } from "./reference.ts";
import { compareMotion, readMotionRecords } from "./motion.ts";
import {
  isProvisioned,
  nodeModulesDir,
  playwrightBin,
  resolveRunnerDir,
  type RunnerEnv,
} from "./dir.ts";
// A whole-app suite is ONE playwright spawn: 120s fits a component-sized app but a real
// app's full suite exceeds it (twice measured on a 20+-page suite — the run dies as
// error:"timeout" with nothing wrong). ISOLATE_SPAWN_TIMEOUT_MS raises the ceiling for
// CI/gates without touching per-unit default behavior.
const DEFAULT_TIMEOUT_MS = Number(Deno.env.get("ISOLATE_SPAWN_TIMEOUT_MS")) ||
  120_000;

const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");

async function exists(p: string): Promise<boolean> {
  try {
    await Deno.stat(p);
    return true;
  } catch {
    return false;
  }
}

/** null = runnable spec inside the host root; else the rejection reason. */
export function specReason(s: string, hostRoot: string): string | null {
  const root = resolve(hostRoot);
  const abs = resolve(s);
  const rel = relative(root, abs);
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) {
    return `outside the project root (${root})`;
  }
  if (!/\.spec\.tsx?$/.test(abs)) return "not a .spec.ts/.spec.tsx file";
  return null;
}

export interface RunnerStatus {
  ok: boolean;
  version?: string;
  path: string;
  message?: string;
}

export interface StatusDeps {
  /** The env the runner dir is resolved from (default: this process's). */
  env?: RunnerEnv;
  /** "Is this dir provisioned?" (default: its playwright binary exists). */
  provisioned?: (dir: string) => Promise<boolean>;
}

/** Non-destructive status check of the runner (no install). The runner dir is
 *  resolved by ./dir.ts (REQ-007); `path` is that dir — where to `cd` to fix it. */
export async function runnerStatus(
  deps: StatusDeps = {},
): Promise<RunnerStatus> {
  const env = deps.env ?? Deno.env.toObject();
  const provisioned = deps.provisioned ?? isProvisioned;
  const dir = await resolveRunnerDir(env, provisioned);
  if (!dir) {
    return {
      ok: false,
      path: "",
      message:
        "HOME is not set — can't locate the Playwright runner. Set ISOLATE_RUNNER_HOME=<dir> (or HOME / XDG_CACHE_HOME).",
    };
  }
  if (!(await provisioned(dir))) {
    return {
      ok: false,
      path: dir,
      message:
        `Playwright runner not provisioned at ${dir} — run any isolate command to install it.`,
    };
  }
  let version: string | undefined;
  try {
    const out = await new Deno.Command(playwrightBin(dir), {
      args: ["--version"],
      stdout: "piped",
      stderr: "null",
    }).output();
    version = new TextDecoder().decode(out.stdout).match(/(\d+\.\d+\.\d+)/)
      ?.[1];
  } catch { /* ignore */ }
  return { ok: true, version, path: dir, message: "runner ready" };
}

export interface TestResult {
  caseName?: string;
  /** The unit (component/page label) the case belongs to. */
  unit?: string;
  route?: string;
  /** The case's `_tier` (REQ-044). */
  tier?: Tier;
  title: string;
  file: string;
  line?: number;
  ok: boolean;
  error?: string;
  screenshot?: string;
  /** What the row measured or applied — printed for passing rows too. */
  detail?: string;
  /** `reference:` rows: the measured fraction of differing pixels and its bound. */
  measured?: number;
  tolerance?: number;
  /** Where this row's evidence went (diff PNG, captured motion JSON). */
  evidence?: string;
}

export interface TestReport {
  ok: boolean;
  ran: boolean;
  total: number;
  passed: number;
  failed: number;
  testResults: TestResult[];
  problems?: unknown[];
  error?: string;
  /** Where this run's generated specs, captures and diffs went (outside the project). */
  evidenceDir?: string;
}

/** Row context by spec file (a case wrapper or a case's own spec file). */
export interface RowContext {
  caseName?: string;
  unit?: string;
  route?: string;
  tier?: Tier;
}

export function parseReport(
  stdout: Uint8Array,
  stderr: Uint8Array,
  byFile: Map<string, RowContext>,
  root: string,
  /** Playwright reports files relative to its config's dir (default: root). */
  rootDir: string = root,
): TestReport {
  const testResults: TestResult[] = [];
  const loadErrors: string[] = [];
  let parsed = false;
  try {
    // deno-lint-ignore no-explicit-any
    const j: any = JSON.parse(new TextDecoder().decode(stdout));
    parsed = true;
    // Playwright's top-level `errors` are the only trace of a spec that failed
    // to LOAD (unresolvable import, syntax error): no suite, no spec, and
    // usually an empty stderr. Dropping them leaves a contentless
    // { ran: false, total: 0 } report.
    for (const e of (j.errors ?? [])) {
      const m = e?.message ?? e?.value ?? "";
      if (m) loadErrors.push(stripAnsi(String(m)).trim());
    }
    // deno-lint-ignore no-explicit-any
    const walk = (suite: any, file?: string) => {
      const f: string = suite.file ?? file ?? "";
      const abs = f.startsWith("/") ? f : resolve(rootDir, f);
      const ctx = byFile.get(abs) ?? byFile.get(f);
      for (const spec of (suite.specs ?? [])) {
        const test = spec.tests?.[0];
        const result = (test?.results ?? [])[0];
        const msg = result?.error?.message ?? result?.errors?.[0]?.message;
        // deno-lint-ignore no-explicit-any
        const shot = (result?.attachments ?? []).find((a: any) =>
          a.name === "screenshot"
        )?.path;
        // A wrapped spec's own location (its test() call) is the file to point at.
        const own: string | undefined = spec.file;
        const file = own
          ? (own.startsWith("/") ? own : resolve(rootDir, own))
          : abs;
        const notes = [
          ...(test?.annotations ?? []),
          ...(result?.annotations ?? []),
        ]
          // deno-lint-ignore no-explicit-any
          .filter((a: any) => a?.type === "isolate" && a.description)
          // deno-lint-ignore no-explicit-any
          .map((a: any) => String(a.description));
        const detail = [...new Set(notes)].join("\n");
        const c = ctx ?? byFile.get(file);
        testResults.push({
          caseName: c?.caseName,
          ...(c?.unit ? { unit: c.unit } : {}),
          route: c?.route,
          ...(c?.tier ? { tier: c.tier } : {}),
          title: spec.title,
          file,
          line: spec.line,
          ok: !!spec.ok,
          error: msg ? stripAnsi(String(msg)).trim() : undefined,
          screenshot: shot,
          ...(detail ? { detail } : {}),
        });
      }
      for (const s of (suite.suites ?? [])) walk(s, f);
    };
    for (const s of (j.suites ?? [])) walk(s, s.file);
  } catch { /* not JSON */ }
  const failed = testResults.filter((t) => !t.ok).length;
  return {
    ok: parsed && testResults.length > 0 && failed === 0 &&
      loadErrors.length === 0,
    ran: parsed && testResults.length > 0,
    total: testResults.length,
    passed: testResults.length - failed,
    failed,
    testResults,
    error: loadErrors.length
      ? loadErrors.join("\n\n").slice(0, 1600)
      : (!parsed || testResults.length === 0)
      ? (stripAnsi(new TextDecoder().decode(stderr)).trim().slice(-800) ||
        undefined)
      : undefined,
  };
}

export interface SpawnResult {
  stdout: Uint8Array;
  stderr: Uint8Array;
}

/** Spawn a command with a hard timeout; throws Error("timeout") on abort. */
export async function runSpec(
  bin: string,
  args: string[],
  env: Record<string, string>,
  timeoutMs: number,
  cwd?: string,
): Promise<SpawnResult> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const out = await new Deno.Command(bin, {
      args,
      env,
      cwd,
      stdout: "piped",
      stderr: "piped",
      signal: ac.signal,
    }).output();
    if (ac.signal.aborted) throw new Error("timeout");
    return { stdout: out.stdout, stderr: out.stderr };
  } catch (e) {
    if (ac.signal.aborted) throw new Error("timeout");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export interface RunRequest {
  filter?: string;
  files?: string[];
  baseUrl?: string;
  projectRoot?: string;
  /** Explicit Playwright config path (e.g. the materialized app's). When
   * omitted, a playwright.config.{ts,js} at projectRoot is auto-detected. Its
   * settings apply; the tests come from the generated case wrappers. */
  config?: string;
  /** Where generated specs, captures and diff images go — must be outside the
   *  project. Default: $SPRIG_WB_ROOT/evidence/<stamp>, else a fresh temp dir. */
  evidenceDir?: string;
}

export interface RunDeps {
  discover?: typeof realDiscover;
  /** The env the runner dir is resolved from AND the spawned specs inherit
   *  (default: this process's). */
  env?: RunnerEnv;
  /** "Is this dir provisioned?" (default: its playwright binary exists). */
  provisioned?: (dir: string) => Promise<boolean>;
  /** Override the whole "is the runner there?" gate (kept for existing tests;
   *  `provisioned` is the finer seam). */
  runnerPresent?: () => Promise<boolean>;
  runSpec?: typeof runSpec;
  timeoutMs?: number;
}

/** A child env: the resolved env minus its undefined entries. */
function definedEnv(env: RunnerEnv): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) if (v !== undefined) out[k] = v;
  return out;
}

export { type PlannedCase, wrapperSource };

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

export interface RunPlan {
  cases: PlannedCase[];
  /** Selected spec files that belong to no discovered case. */
  loose: string[];
}

/**
 * What a run executes. Every discovered case is a candidate: its spec files, plus
 * its generated `reference:`/`motion:` rows when it has `_reference`/`_motion`.
 * `files` restricts to those spec files (and the cases owning them); `filter`
 * keeps a file whose path contains it, or a case whose `<unit>/<case>` does. A
 * selected case always brings its check rows.
 * Files outside `root` or not `*.spec.ts` are dropped (specReason).
 */
export function planRun(
  entries: ComponentEntry[],
  sel: { filter?: string; files?: string[] },
  root: string,
): RunPlan {
  const owner = new Map<string, string>();
  const all: PlannedCase[] = [];
  for (const e of entries) {
    for (const c of e.cases ?? []) {
      const key = `${e.label}/${c.name}`;
      const files = (c.tests ?? []).map((t) => resolve(t.file));
      for (const f of files) owner.set(f, key);
      all.push({
        key,
        unit: e.label,
        caseName: c.name,
        route: c.route,
        ...(c.tier ? { tier: c.tier } : {}),
        ...(c.viewport ? { viewport: c.viewport } : {}),
        ...(c.theme ? { theme: c.theme } : {}),
        ...(c.network ? { network: c.network } : {}),
        ...(c.reference ? { reference: c.reference } : {}),
        ...(c.motion ? { motion: c.motion } : {}),
        files,
      });
    }
  }
  const explicit = sel.files && sel.files.length
    ? sel.files.map((f) => resolve(f))
    : null;
  const flt = sel.filter;
  const keepFile = (f: string) =>
    specReason(f, root) === null &&
    (!flt || f.includes(flt) || (owner.get(f)?.includes(flt) ?? false));
  const cases: PlannedCase[] = [];
  for (const c of all) {
    const files = c.files.filter((f) =>
      (!explicit || explicit.includes(f)) && keepFile(f)
    );
    // A case with only checks (no spec files) is selected by name alone.
    const byName = !explicit && !!(c.reference || c.motion) &&
      (!flt || c.key.includes(flt));
    if (files.length || byName) cases.push({ ...c, files });
  }
  const loose = (explicit ?? []).filter((f) => !owner.has(f) && keepFile(f));
  return { cases, loose };
}

/** A dir `inside` sits under `root` (or is it). */
function isInside(dir: string, root: string): boolean {
  const rel = relative(resolve(root), resolve(dir));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

/** The caller's evidence dir: explicit, else $SPRIG_WB_ROOT/evidence/<stamp>;
 *  null = none chosen (a fresh temp dir is used). */
function chosenEvidenceDir(req: RunRequest, env: RunnerEnv): string | null {
  if (req.evidenceDir) return resolve(req.evidenceDir);
  if (!env.SPRIG_WB_ROOT) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-") + "-" +
    Math.random().toString(36).slice(2, 6);
  return resolve(env.SPRIG_WB_ROOT, "evidence", stamp);
}

/** Recount a report after the check rows were settled. */
function recount(report: TestReport): void {
  const failed = report.testResults.filter((t) => !t.ok).length;
  report.total = report.testResults.length;
  report.failed = failed;
  report.passed = report.total - failed;
  report.ran = report.total > 0;
  report.ok = report.ran && failed === 0 && !report.error;
}

/** Turn each case's capture rows into verdicts: compare the captured PNG against the
 *  reference and the captured animations against the motion spec. */
async function settleChecks(
  report: TestReport,
  cases: PlannedCase[],
  evidenceDir: string,
): Promise<void> {
  for (const c of cases) {
    const dir = join(evidenceDir, "cases", slug(c.key));
    const ctx = {
      caseName: c.caseName,
      unit: c.unit,
      route: c.route,
      ...(c.tier ? { tier: c.tier } : {}),
    };
    const rowFor = (title: string): TestResult => {
      let row = report.testResults.find((t) => t.title === title);
      if (!row) {
        row = {
          ...ctx,
          title,
          file: c.reference?.image ?? c.motion?.spec ?? "",
          ok: false,
          error: `no result for "${title}" — the capture test never reported`,
        };
        report.testResults.push(row);
      }
      return row;
    };
    if (c.reference) {
      const row = rowFor(`reference: ${c.key}`);
      row.tolerance = c.reference.tolerance;
      row.file = c.reference.image;
      delete row.line; // the wrapper's line, not the image's
      if (row.ok) {
        try {
          const r = await compareReferenceFiles(
            c.reference.image,
            join(dir, ACTUAL_PNG),
            join(dir, DIFF_PNG),
            c.reference.tolerance,
          );
          row.ok = r.ok;
          row.measured = r.measured;
          row.evidence = r.diff;
          // REQ-061: the measurement first, then what the harness noted while
          // capturing (device scale, the fonts it loaded or could not) — kept.
          const notes = row.detail;
          row.detail = r.message +
            (c.reference.via
              ? ` (reference resolved from the ${c.reference.via})`
              : "") +
            (c.reference.reason
              ? ` (tolerance reason: ${c.reference.reason})`
              : "") +
            (notes ? `\n${notes}` : "");
          if (!r.ok) row.error = r.message;
        } catch (e) {
          row.ok = false;
          row.error = `reference compare failed: ${(e as Error).message}`;
        }
      }
    }
    if (c.motion) {
      const row = rowFor(`motion: ${c.key}`);
      row.file = c.motion.spec;
      delete row.line;
      if (row.ok) {
        try {
          const spec = readMotionRecords(
            JSON.parse(await Deno.readTextFile(c.motion.spec)),
          );
          const actualPath = join(dir, MOTION_ACTUAL);
          const actual = readMotionRecords(
            JSON.parse(await Deno.readTextFile(actualPath)),
          );
          const m = compareMotion(spec, actual);
          row.ok = m.ok;
          row.evidence = actualPath;
          const notes = row.detail;
          row.detail = `${m.summary}; spec ${c.motion.spec}` +
            (c.motion.via ? ` (resolved from the ${c.motion.via})` : "") +
            `; captured ${actualPath}` +
            (m.ok ? "" : "\n" + m.differences.join("\n")) +
            (notes ? `\n${notes}` : "");
          if (!m.ok) row.error = m.differences.join("\n");
        } catch (e) {
          row.ok = false;
          row.error = `motion compare failed: ${(e as Error).message}`;
        }
      }
    }
  }
  recount(report);
}

/**
 * Plan (discovered cases + explicit/filtered files), generate the case wrappers
 * outside the project, spawn Playwright once, parse, then settle the reference and
 * motion rows. Faults: "no-match" (a selector matched nothing), "runner-unavailable"
 * (something to run but no Playwright), "timeout" (spawn exceeded the limit).
 * No selector + nothing to run is NOT a fault — it's an empty (green) report.
 */
export async function runTests(
  req: RunRequest,
  deps: RunDeps = {},
): Promise<TestReport> {
  const discover = deps.discover ?? realDiscover;
  const env = deps.env ?? Deno.env.toObject();
  const provisioned = deps.provisioned ?? isProvisioned;
  const runnerDir = await resolveRunnerDir(env, provisioned);
  const runnerPresent = deps.runnerPresent ??
    (() => runnerDir ? provisioned(runnerDir) : Promise.resolve(false));
  const spawn = deps.runSpec ?? runSpec;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const root = resolve(req.projectRoot || Deno.cwd());
  const selectorGiven = !!(req.filter || (req.files && req.files.length));
  const { entries } = await discover(root);
  const plan = planRun(entries, { filter: req.filter, files: req.files }, root);
  const specCount = plan.loose.length +
    plan.cases.reduce((n, c) => n + c.files.length, 0);
  if (plan.cases.length === 0 && plan.loose.length === 0) {
    if (selectorGiven) throw new Error("no-match");
    return {
      ok: true,
      ran: false,
      total: 0,
      passed: 0,
      failed: 0,
      testResults: [],
      problems: [],
    };
  }
  if (!runnerDir || !(await runnerPresent())) {
    throw new Error("runner-unavailable");
  }

  const chosen = chosenEvidenceDir(req, env);
  if (chosen && isInside(chosen, root)) {
    throw new Error(
      `evidence dir ${chosen} is inside the project (${root}) — ` +
        `captures and diffs must land outside the tree`,
    );
  }
  const evidenceDir = chosen ??
    await Deno.makeTempDir({ prefix: "isolate-evidence-" });
  const specsDir = join(evidenceDir, "specs");
  await Deno.mkdir(specsDir, { recursive: true });
  const harness = join(specsDir, HARNESS_FILE);
  await Deno.writeTextFile(harness, HARNESS_SOURCE);

  const byFile = new Map<string, RowContext>();
  const units: PlannedCase[] = [...plan.cases];
  if (plan.loose.length) {
    units.push({
      key: "loose",
      unit: "",
      caseName: "",
      route: "",
      files: plan.loose,
    });
  }
  for (const [i, c] of units.entries()) {
    const wrapper = join(specsDir, `${i}-${slug(c.key)}${WRAPPER_SUFFIX}`);
    await Deno.writeTextFile(
      wrapper,
      wrapperSource(c, harness, join(evidenceDir, "cases", slug(c.key))),
    );
    if (c.key === "loose") continue;
    const ctx: RowContext = {
      caseName: c.caseName,
      unit: c.unit,
      route: c.route,
      ...(c.tier ? { tier: c.tier } : {}),
    };
    byFile.set(wrapper, ctx);
    for (const f of c.files) byFile.set(f, ctx);
  }

  // A project config (given, else auto-detected at the root) lends its settings.
  let config = req.config;
  if (!config) {
    for (const c of ["playwright.config.ts", "playwright.config.js"]) {
      if (await exists(`${root}/${c}`)) {
        config = `${root}/${c}`;
        break;
      }
    }
  }
  const generated = join(specsDir, CONFIG_FILE);
  await Deno.writeTextFile(
    generated,
    configSource(specsDir, join(evidenceDir, "test-results"), config),
  );
  const { stdout, stderr } = await spawn(
    playwrightBin(runnerDir),
    ["test", "--reporter=json", "--config", generated],
    {
      ...definedEnv(env),
      NODE_PATH: nodeModulesDir(runnerDir),
      ...(req.baseUrl ? { ISOLATE_BASE_URL: req.baseUrl } : {}),
    },
    timeoutMs,
    root,
  );
  const report = parseReport(stdout, stderr, byFile, root, specsDir);
  report.evidenceDir = evidenceDir;
  if (report.ran) await settleChecks(report, plan.cases, evidenceDir);
  if (!report.ran && !report.error) {
    // Parsed-but-empty with a silent stderr: the specs never executed. The one
    // cause observed in the field is a spec the Node runner can't load.
    report.error =
      `playwright produced no test results for ${specCount} spec file(s) — ` +
      `a spec that fails to load (unresolvable import such as "@std/expect" ` +
      `or any Deno-only specifier, or a syntax error) reports nothing. Specs ` +
      `must import { test, expect } from "@playwright/test".`;
  }
  return report;
}
