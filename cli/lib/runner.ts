// Provision the Playwright runner — @playwright/test, rxjs, and the isolate-events
// helper (copied from lib/events/) — in the dir server/src/core/business/runner/dir.ts
// resolves: ISOLATE_RUNNER_HOME, else $XDG_CACHE_HOME/sprig/isolate-runner (~/.cache
// default), else a legacy ~/.isolate-runner that is already provisioned (REQ-007).
// Returns whether the runner is usable and where it is; when it isn't usable, the
// exact cause + fix are printed first — a broken runner must never surface as a
// cryptic spawn failure inside `isolate test` or a ▸ run button.
import { fromFileUrl } from "#std/path";
import { copy } from "#std/fs";
import {
  nodeModulesDir,
  playwrightBin,
  resolveRunnerDir,
} from "../../server/src/core/business/runner/dir.ts";

const EVENTS_DIR = fromFileUrl(new URL("./events", import.meta.url));

export interface RunnerEnsure {
  /** Usable: @playwright/test + rxjs + isolate-events are all in place. */
  ok: boolean;
  /** The resolved runner dir — null only when nothing can name one (no HOME). */
  dir: string | null;
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await Deno.stat(p);
    return true;
  } catch {
    return false;
  }
}

export async function ensureRunner(): Promise<RunnerEnsure> {
  const dir = await resolveRunnerDir();
  if (!dir) {
    console.warn(
      "⚠ HOME is not set — can't locate the Playwright runner.\n" +
        "  Set ISOLATE_RUNNER_HOME=<dir> (or HOME / XDG_CACHE_HOME).\n" +
        "  ▸ run buttons and `isolate test` will fail until it is.",
    );
    return { ok: false, dir: null };
  }
  const mods = nodeModulesDir(dir);
  try {
    await Deno.mkdir(dir, { recursive: true });
  } catch (e) {
    // The reported failure: a location that isn't a write root (a box's Landlock
    // allow-list). Say where we tried and the two knobs that move it — never an
    // uncaught EACCES.
    console.warn(
      `⚠ Can't create the Playwright runner dir ${dir}: ${
        (e as Error).message
      }\n` +
        "  Point it somewhere writable: ISOLATE_RUNNER_HOME=<dir>, or XDG_CACHE_HOME=<cache dir>\n" +
        "  (the runner lives at $XDG_CACHE_HOME/sprig/isolate-runner).\n" +
        "  ▸ run buttons and `isolate test` will fail until it's fixed.",
    );
    return { ok: false, dir };
  }

  let npmMissing = false;
  const npm = async (
    args: string[],
    io: "inherit" | "null",
  ): Promise<boolean> => {
    try {
      const r = await new Deno.Command("npm", {
        args,
        cwd: dir,
        stdout: io,
        stderr: io,
      }).output();
      return r.success;
    } catch {
      if (!npmMissing) {
        npmMissing = true;
        console.warn(
          "⚠ npm not found — the Playwright runner needs Node.js/npm installed.",
        );
      }
      return false;
    }
  };

  if (!(await pathExists(`${dir}/package.json`))) {
    await npm(["init", "-y"], "null");
  }

  // 1. @playwright/test, matched to the system playwright version when available.
  if (!(await pathExists(playwrightBin(dir)))) {
    console.log(`Setting up the Playwright runner (one-time) in ${dir}…`);
    let ver = "latest";
    try {
      const v = await new Deno.Command("playwright", {
        args: ["--version"],
        stdout: "piped",
        stderr: "null",
      }).output();
      const m = new TextDecoder().decode(v.stdout).match(/(\d+\.\d+\.\d+)/);
      if (m) ver = m[1];
    } catch { /* fall back to latest */ }
    await npm(["i", `@playwright/test@${ver}`], "inherit");
  }

  // 2. rxjs — the event-stream test helper depends on it.
  if (!(await pathExists(`${mods}/rxjs`))) {
    console.log("Installing rxjs for the event-stream test helper…");
    await npm(["i", "rxjs@^7"], "inherit");
  }

  // 3. The isolate-events helper (capture/waitHydrated), importable from specs as
  //    "isolate-events". Copied from lib/events/ (the published ./events subpath).
  await Deno.mkdir(mods, { recursive: true });
  await Deno.remove(`${mods}/isolate-events`, { recursive: true }).catch(
    () => {},
  );
  await copy(EVENTS_DIR, `${mods}/isolate-events`, { overwrite: true });

  // Verify what actually landed; one consolidated warning naming the gap + fix.
  const missing: string[] = [];
  if (!(await pathExists(playwrightBin(dir)))) {
    missing.push("@playwright/test");
  }
  if (!(await pathExists(`${mods}/rxjs`))) missing.push("rxjs");
  if (missing.length) {
    console.warn(
      `⚠ Playwright runner incomplete — missing ${missing.join(" + ")}.\n` +
        "  ▸ run buttons and `isolate test` will fail until it's fixed:\n" +
        `    cd ${dir} && npm i ${
          missing.map((m) => (m === "rxjs" ? "rxjs@^7" : m)).join(" ")
        }`,
    );
    return { ok: false, dir };
  }
  return { ok: true, dir };
}
