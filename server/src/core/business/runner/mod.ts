// Ported test-runner core (from reference/main.ts parseReport + scaffold.ts
// filterSpecs/specReason). Pure-ish module — the testing module's data adapter
// delegates here. Raises the spec's fault slugs by THROWING Error(<slug>): keep
// maps a thrown error to a failure response whose body.message is the slug, which
// fixtures/heal-rules.json keys on. Dependency-injectable for deterministic tests.

import { isAbsolute, relative, resolve } from "#std/path";
import { discover as realDiscover } from "../discover/mod.ts";
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

interface TestResult {
  caseName?: string;
  route?: string;
  title: string;
  file: string;
  line?: number;
  ok: boolean;
  error?: string;
  screenshot?: string;
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
}

export function parseReport(
  stdout: Uint8Array,
  stderr: Uint8Array,
  byFile: Map<string, { caseName?: string; route?: string }>,
  root: string,
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
      const abs = f.startsWith("/") ? f : `${root}/${f}`;
      const ctx = byFile.get(abs) ?? byFile.get(f);
      for (const spec of (suite.specs ?? [])) {
        const result = (spec.tests?.[0]?.results ?? [])[0];
        const msg = result?.error?.message ?? result?.errors?.[0]?.message;
        // deno-lint-ignore no-explicit-any
        const shot = (result?.attachments ?? []).find((a: any) =>
          a.name === "screenshot"
        )?.path;
        testResults.push({
          caseName: ctx?.caseName,
          route: ctx?.route,
          title: spec.title,
          file: abs,
          line: spec.line,
          ok: !!spec.ok,
          error: msg ? stripAnsi(String(msg)).trim() : undefined,
          screenshot: shot,
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
   * omitted, a playwright.config.{ts,js} at projectRoot is auto-detected. */
  config?: string;
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

/**
 * Resolve specs (explicit or discovered), path-safety-filter, spawn, parse.
 * Faults: "no-match" (a selector matched zero specs), "runner-unavailable"
 * (specs to run but no Playwright), "timeout" (spawn exceeded the limit).
 * No selector + zero specs is NOT a fault — it's an empty (green) report.
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
  const byFile = new Map<string, { caseName?: string; route?: string }>();

  let files: string[] = [];
  if (req.files && req.files.length) {
    files = req.files;
  } else {
    const r = await discover(root);
    for (const e of r.entries) {
      for (const c of e.cases) {
        for (const t of c.tests) {
          files.push(t.file);
          byFile.set(resolve(t.file), { caseName: c.name, route: c.route });
        }
      }
    }
  }
  if (req.filter) {
    const flt = req.filter;
    files = files.filter((f) => {
      const ctx = byFile.get(resolve(f));
      return f.includes(flt) || (ctx?.caseName?.includes(flt) ?? false);
    });
  }

  const safe = files.filter((f) => specReason(f, root) === null);
  if (safe.length === 0) {
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

  // Pass --config when given (the materialized app's), else auto-detect one at
  // the project root (the generated preview app writes one).
  let config = req.config;
  if (!config) {
    for (const c of ["playwright.config.ts", "playwright.config.js"]) {
      if (await exists(`${root}/${c}`)) {
        config = `${root}/${c}`;
        break;
      }
    }
  }
  const { stdout, stderr } = await spawn(
    playwrightBin(runnerDir),
    [
      "test",
      ...safe,
      "--reporter=json",
      ...(config ? ["--config", config] : []),
    ],
    {
      ...definedEnv(env),
      NODE_PATH: nodeModulesDir(runnerDir),
      ...(req.baseUrl ? { ISOLATE_BASE_URL: req.baseUrl } : {}),
    },
    timeoutMs,
    root,
  );
  const report = parseReport(stdout, stderr, byFile, root);
  if (!report.ran && !report.error) {
    // Parsed-but-empty with a silent stderr: the specs never executed. The one
    // cause observed in the field is a spec the Node runner can't load.
    report.error =
      `playwright produced no test results for ${safe.length} spec file(s) — ` +
      `a spec that fails to load (unresolvable import such as "@std/expect" ` +
      `or any Deno-only specifier, or a syntax error) reports nothing. Specs ` +
      `must import { test, expect } from "@playwright/test".`;
  }
  return report;
}
