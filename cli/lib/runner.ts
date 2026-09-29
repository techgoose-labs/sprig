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

/** The version `playwright --version` printed, WHOLE — a prerelease suffix
 *  (1.64.0-alpha-…) names the browser build the box actually has, so it is the
 *  one to install (REQ-007 AMENDMENT 2). Undefined when there is no version. */
export function playwrightVersionOf(text: string): string | undefined {
  return text.match(/(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/)?.[1];
}

/** Where playwright keeps its browsers: PLAYWRIGHT_BROWSERS_PATH, else the platform cache. */
/** The environment the runner reads — injectable so tests never mutate Deno.env
 *  (the lanes run `deno test --parallel`, one process). */
export type Env = Record<string, string | undefined>;

function browsersPath(env: Env): string | undefined {
  const set = env.PLAYWRIGHT_BROWSERS_PATH;
  if (set && set !== "0") return set;
  const home = env.HOME ?? env.USERPROFILE;
  if (!home) return undefined;
  if (Deno.build.os === "darwin") return `${home}/Library/Caches/ms-playwright`;
  if (Deno.build.os === "windows") {
    return `${env.LOCALAPPDATA ?? home}/ms-playwright`;
  }
  return `${env.XDG_CACHE_HOME ?? `${home}/.cache`}/ms-playwright`;
}

/** What a subprocess inherits: the injected env, undefined values dropped. */
function subEnv(env: Env): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) if (v !== undefined) out[k] = v;
  return out;
}

interface PlaywrightCandidate {
  bin: string;
  ver: string;
  /** the Chromium build this playwright launches (its playwright-core/browsers.json) */
  revision?: string;
  installed: boolean;
}

/** Every `playwright` on PATH, in PATH order, with its version and whether the
 *  Chromium build it wants is in the browsers cache. */
async function playwrightCandidates(env: Env): Promise<PlaywrightCandidate[]> {
  const out: PlaywrightCandidate[] = [];
  const present = new Set<string>();
  const bp = browsersPath(env);
  if (bp) {
    try {
      for await (const e of Deno.readDir(bp)) present.add(e.name);
    } catch { /* no cache dir: nothing is installed */ }
  }
  const sep = Deno.build.os === "windows" ? ";" : ":";
  const seen = new Set<string>();
  for (const d of (env.PATH ?? "").split(sep)) {
    if (!d) continue;
    const bin = `${d}/playwright`;
    let real: string;
    try {
      real = await Deno.realPath(bin);
    } catch {
      continue;
    }
    if (seen.has(real)) continue;
    seen.add(real);
    let ver: string | undefined;
    try {
      const v = await new Deno.Command(bin, { args: ["--version"], stdout: "piped", stderr: "null", env: subEnv(env), clearEnv: true }).output();
      ver = playwrightVersionOf(new TextDecoder().decode(v.stdout));
    } catch { /* not runnable */ }
    if (!ver) continue;
    const revision = await chromiumRevisionNear(real);
    const installed = revision !== undefined &&
      (present.has(`chromium-${revision}`) || present.has(`chromium_headless_shell-${revision}`));
    out.push({ bin, ver, revision, installed });
  }
  return out;
}

/** The Chromium revision in the playwright-core/browsers.json that sits beside a
 *  playwright binary (walking up from its real path; undefined when none is found). */
async function chromiumRevisionNear(realBin: string): Promise<string | undefined> {
  let dir = realBin;
  for (let i = 0; i < 8; i++) {
    dir = dir.slice(0, dir.lastIndexOf("/"));
    if (!dir) break;
    for (const f of [`${dir}/node_modules/playwright-core/browsers.json`, `${dir}/playwright-core/browsers.json`]) {
      try {
        const j = JSON.parse(await Deno.readTextFile(f));
        const b = (j.browsers ?? []).find((x: { name: string }) => x.name === "chromium");
        return typeof b?.revision === "string" ? b.revision : undefined;
      } catch { /* not here */ }
    }
  }
  return undefined;
}

/** Which @playwright/test to install: the playwright on PATH whose Chromium build is
 *  actually in the browsers cache — several playwrights can be on PATH (a repo's
 *  node_modules/.bin under `deno task`, a global one) and only one of them can launch
 *  (REQ-007 AMENDMENT 3). None launchable → the first on PATH, saying what is missing.
 *  No playwright at all → "latest". `why` is printed with the choice. */
export async function choosePlaywright(env: Env = Deno.env.toObject()): Promise<{ ver?: string; why: string }> {
  const cs = await playwrightCandidates(env);
  const bp = browsersPath(env) ?? "(no browsers path)";
  const describe = (c: PlaywrightCandidate) =>
    `${c.bin} ${c.ver} (chromium ${c.revision ?? "?"}: ${c.installed ? "installed" : "not installed"})`;
  if (!cs.length) return { why: "no `playwright` on PATH — latest" };
  const hit = cs.find((c) => c.installed);
  if (hit) {
    return {
      ver: hit.ver,
      why: `its chromium ${hit.revision} is in ${bp}; candidates: ${cs.map(describe).join(", ")}`,
    };
  }
  return {
    ver: cs[0].ver,
    why: `no candidate's chromium build is in ${bp} — taking the first on PATH; run ` +
      `\`${cs[0].bin} install chromium chromium-headless-shell\` or point PLAYWRIGHT_BROWSERS_PATH at a cache that has it; candidates: ${cs.map(describe).join(", ")}`,
  };
}

/** The @playwright/test version a runner dir holds, from its package.json. */
async function installedTestVersion(mods: string): Promise<string | undefined> {
  try {
    const pkg = JSON.parse(
      await Deno.readTextFile(`${mods}/@playwright/test/package.json`),
    );
    return typeof pkg.version === "string" ? pkg.version : undefined;
  } catch {
    return undefined;
  }
}

/** One provisioner at a time per runner dir: an atomic mkdir of `<dir>/.provisioning`
 *  is the lock; a second caller waits for it to clear (a lock older than ten
 *  minutes is a crashed provisioner's and is taken over), then runs `fn` — which
 *  re-checks the dir, so the waiter installs nothing the winner already did. */
async function withProvisionLock(dir: string, fn: () => Promise<void>): Promise<void> {
  const lock = `${dir}/.provisioning`;
  const deadline = Date.now() + 10 * 60_000;
  for (;;) {
    try {
      await Deno.mkdir(lock);
      break;
    } catch (e) {
      if (e instanceof Deno.errors.NotFound) {
        // the runner dir itself is gone (removed under us): recreate it and retry once
        await Deno.mkdir(dir, { recursive: true });
        await Deno.mkdir(lock);
        break;
      }
      if (!(e instanceof Deno.errors.AlreadyExists)) throw e;
      const age = Date.now() - ((await Deno.stat(lock).catch(() => null))?.mtime?.getTime() ?? Date.now());
      if (age > 10 * 60_000 || Date.now() > deadline) {
        await Deno.remove(lock, { recursive: true }).catch(() => {});
        continue;
      }
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  try {
    await fn();
  } finally {
    await Deno.remove(lock, { recursive: true }).catch(() => {});
  }
}

export async function ensureRunner(
  opts: { env?: Env } = {},
): Promise<RunnerEnsure> {
  const env = opts.env ?? Deno.env.toObject();
  const dir = await resolveRunnerDir(env);
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
      // npm's own chatter ("added 3 packages") goes to stderr, never stdout:
      // under --json stdout is exactly one report (REQ-007 AMENDMENT).
      const r = await new Deno.Command("npm", {
        args,
        cwd: dir,
        env: subEnv(env),
        clearEnv: true,
        stdout: io === "inherit" ? "piped" : "null",
        stderr: io,
      }).output();
      if (io === "inherit" && r.stdout.length) await Deno.stderr.write(r.stdout);
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

  // 1. @playwright/test, matched to the system playwright version when available —
  //    and RE-matched when the box's playwright moved on (REQ-007 AMENDMENT 2): the
  //    browsers on disk belong to the system version, so a runner pinned to another
  //    one cannot launch. Provisioning takes a lock: two CLIs (the workbench and
  //    `isolate test`) may start on one fresh dir at once.
  try {
    await withProvisionLock(dir, async () => {
    const sys = await choosePlaywright(env);
    const installed = await installedTestVersion(mods);
    const absent = !(await pathExists(playwrightBin(dir)));
    const stale = sys.ver !== undefined && installed !== undefined && installed !== sys.ver;
    if (!absent && !stale) return;
    const ver = sys.ver ?? "latest";
    console.log(
      absent
        ? `Setting up the Playwright runner (one-time) in ${dir}…`
        : `Playwright runner at ${dir} has @playwright/test ${installed}; the playwright whose browsers are installed is ${sys.ver} — reinstalling so it can launch.`,
    );
    console.log(`  @playwright/test@${ver} (${sys.why})`);
    await npm(["i", `@playwright/test@${ver}`], "inherit");
    });
  } catch (e) {
    // never a crash: a runner dir that vanished mid-provision (another process
    // removed it), a lock that could not be taken — say so, and report not-ok.
    console.warn(
      `⚠ Playwright runner provisioning failed in ${dir}: ${(e as Error).message}\n` +
        "  ▸ run buttons and `isolate test` will fail until it's fixed.",
    );
    return { ok: false, dir };
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
