// Where the Playwright runner (@playwright/test + rxjs + isolate-events) lives —
// ONE rule shared by the CLI's ensureRunner (which provisions it) and this
// module's runnerStatus/runTests (which spawn from it). REQ-007.
//
//   1. ISOLATE_RUNNER_HOME            — explicit; used as given, always.
//   2. $XDG_CACHE_HOME/sprig/isolate-runner, else ~/.cache/sprig/isolate-runner
//                                     — the preferred dir: a CACHE location that
//                                       survives `sprig update` (which swaps the
//                                       whole SPRIG_HOME dir) and that a box's
//                                       Landlock allow-list already opens.
//   3. ~/.isolate-runner              — the legacy dir; used ONLY when it is
//                                       already provisioned and (2) is not, so an
//                                       existing install never re-downloads. It
//                                       is never created.
//
// Never a new dot-dir straight under $HOME: in a box, $HOME itself is not a
// write root (it would open sibling worktrees), so `mkdir $HOME/.x` is EACCES.
import { isAbsolute, join, resolve } from "#std/path";

export type RunnerEnv = Readonly<Record<string, string | undefined>>;

export interface RunnerDirCandidates {
  /** Where a fresh runner goes (rule 2), or null with no HOME and no XDG_CACHE_HOME. */
  preferred: string | null;
  /** The pre-REQ-007 location (rule 3), or null with no HOME. */
  legacy: string | null;
}

export const LEGACY_RUNNER_DIRNAME = ".isolate-runner";

function homeOf(env: RunnerEnv): string | null {
  return env.HOME || env.USERPROFILE || null;
}

/** The two dirs the rule can land on, from an env — pure, so it is unit-testable. */
export function runnerDirCandidates(env: RunnerEnv): RunnerDirCandidates {
  const home = homeOf(env);
  // XDG: a relative XDG_CACHE_HOME is invalid and must be ignored (basedir spec).
  const xdg = env.XDG_CACHE_HOME && isAbsolute(env.XDG_CACHE_HOME)
    ? env.XDG_CACHE_HOME
    : home
    ? join(home, ".cache")
    : null;
  return {
    preferred: xdg ? join(xdg, "sprig", "isolate-runner") : null,
    legacy: home ? join(home, LEGACY_RUNNER_DIRNAME) : null,
  };
}

/** The runner's node_modules — NODE_PATH for spawned specs. */
export function nodeModulesDir(runnerDir: string): string {
  return join(runnerDir, "node_modules");
}

/** The playwright binary the runner spawns; its presence = "provisioned". */
export function playwrightBin(runnerDir: string): string {
  return join(nodeModulesDir(runnerDir), ".bin", "playwright");
}

/** Provisioned = the playwright binary is there (not merely the dir). */
export async function isProvisioned(runnerDir: string): Promise<boolean> {
  try {
    await Deno.stat(playwrightBin(runnerDir));
    return true;
  } catch {
    return false;
  }
}

/**
 * The runner dir to use: the rule above, or null when nothing can name one
 * (no ISOLATE_RUNNER_HOME, no HOME, no XDG_CACHE_HOME) — callers say so
 * instead of guessing a path.
 */
export async function resolveRunnerDir(
  env: RunnerEnv = Deno.env.toObject(),
  provisioned: (dir: string) => Promise<boolean> = isProvisioned,
): Promise<string | null> {
  if (env.ISOLATE_RUNNER_HOME) return resolve(env.ISOLATE_RUNNER_HOME);
  const { preferred, legacy } = runnerDirCandidates(env);
  if (!preferred) return legacy && (await provisioned(legacy)) ? legacy : null;
  if (await provisioned(preferred)) return preferred;
  if (legacy && (await provisioned(legacy))) return legacy;
  return preferred;
}
