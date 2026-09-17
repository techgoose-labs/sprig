// Supervision of the workbench process chain — `sprig isolate` → `isolate dev` →
// `deno serve serve-dev.ts` (and `isolate test` → `deno serve`). One module, used
// by every level, so no level can forget its half (REQ-004/005/006, report
// 20260917T203646Z-w354-31439: 17 leaked dev servers in one box).
//
//   terminate()      stop a child for real: SIGTERM, a bounded grace, then SIGKILL.
//                    `deno serve` shuts down gracefully on SIGTERM — it waits for
//                    open connections, and the HMR event stream never closes — so a
//                    bare SIGTERM + exit left the server behind (measured).
//   watchParent()    a child notices its parent died (re-parented → ppid changed)
//                    and tears itself down; covers SIGKILL/OOM of any level above.
//   isolate.json     the live server, recorded per workbench (SPRIG_WB_ROOT) and
//                    probed on the next run: a workbench with a live server is
//                    REUSED, a stale record is dropped (REQ-005).
//   idle policy      an unattended workbench (stdin not a terminal) exits after
//                    SPRIG_IDLE_EXIT minutes (default 30) with no request and no
//                    HMR client attached; a person's terminal run never does (REQ-006).
import { join, resolve } from "@std/path";

/** Set by every spawner to its own pid; the child watches that pid. */
export const PARENT_PID_ENV = "SPRIG_PARENT_PID";
/** Minutes of idleness after which an unattended dev server exits; `0` = never. */
export const IDLE_EXIT_ENV = "SPRIG_IDLE_EXIT";
/** The dev server's identity endpoint — what makes a recorded server "ours". */
export const HEALTH_PATH = "/__sprig/isolate";
/** The per-workbench record of the live server. */
export const LIVE_FILE = "isolate.json";
export const DEFAULT_IDLE_MINUTES = 30;

// ───────────────────────────── stopping a child ─────────────────────────────

export interface Terminable {
  readonly pid: number;
  kill(signo?: Deno.Signal): void;
  readonly status: Promise<Deno.CommandStatus>;
}

/** SIGTERM `child`, wait up to `graceMs` for it to exit, then SIGKILL it. Resolves with
 *  the child's exit status; never throws (a child that is already gone is fine). */
export async function terminate(
  child: Terminable,
  graceMs = 2000,
): Promise<Deno.CommandStatus | null> {
  try {
    child.kill("SIGTERM");
  } catch { /* already exited */ }
  let timer: number | undefined;
  const grace = new Promise<null>((r) => {
    timer = setTimeout(() => r(null), graceMs);
  });
  try {
    const st = await Promise.race([child.status, grace]);
    if (st) return st;
    try {
      child.kill("SIGKILL");
    } catch { /* exited in the gap */ }
    return await child.status;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ───────────────────────────── noticing a dead parent ───────────────────────

/** Poll the parent pid; when it is no longer `expected` (this process was re-parented
 *  because its parent died) call `onGone` once. The timer is unref'd — it never keeps a
 *  process alive by itself. Returns a stop function. */
export function watchParent(
  expected: number,
  onGone: () => void,
  opts: { intervalMs?: number; getPpid?: () => number } = {},
): () => void {
  const get = opts.getPpid ?? (() => Deno.ppid);
  let fired = false;
  const id = setInterval(() => {
    if (fired || get() === expected) return;
    fired = true;
    clearInterval(id);
    onGone();
  }, opts.intervalMs ?? 1000);
  Deno.unrefTimer(id);
  return () => clearInterval(id);
}

/** The env a spawner adds so its child can watch it. */
export function parentEnv(): Record<string, string> {
  return { [PARENT_PID_ENV]: String(Deno.pid) };
}

/** The parent pid a spawner declared for THIS process, or null (a bare run). */
export function declaredParent(
  env: { get(key: string): string | undefined } = Deno.env,
): number | null {
  const n = Number(env.get(PARENT_PID_ENV));
  return Number.isInteger(n) && n > 0 ? n : null;
}

// ───────────────────────────── the live-server record ───────────────────────

export interface LiveWorkbench {
  /** The owning `isolate dev` process — `kill <pid>` stops the whole thing. */
  pid: number;
  /** The `deno serve` process. */
  serverPid: number;
  port: number;
  url: string;
  project: string;
  wbRoot: string;
  startedAt: string;
}

/** What the dev server answers on HEALTH_PATH. */
export interface Health {
  ok: true;
  pid: number;
  project: string | null;
  wbRoot: string;
  startedAt: string;
}

export function liveFile(wbRoot: string): string {
  return join(wbRoot, LIVE_FILE);
}

export async function writeLive(
  wbRoot: string,
  info: LiveWorkbench,
): Promise<void> {
  await Deno.mkdir(wbRoot, { recursive: true });
  await Deno.writeTextFile(
    liveFile(wbRoot),
    JSON.stringify(info, null, 2) + "\n",
  );
}

export async function readLive(wbRoot: string): Promise<LiveWorkbench | null> {
  try {
    const j = JSON.parse(await Deno.readTextFile(liveFile(wbRoot)));
    return j && typeof j.port === "number" && typeof j.pid === "number"
      ? j as LiveWorkbench
      : null;
  } catch {
    return null;
  }
}

/** Remove the record — but only the one THIS process (or `ownerPid`) wrote, so a run
 *  that merely found someone else's server never deletes their record. */
export async function clearLive(
  wbRoot: string,
  ownerPid = Deno.pid,
): Promise<void> {
  const rec = await readLive(wbRoot);
  if (rec && rec.pid === ownerPid) {
    await Deno.remove(liveFile(wbRoot)).catch(() => {});
  }
}

/** Ask the server on `port` who it is. null = nothing (of ours) answering. */
export async function probeHealth(
  port: number,
  timeoutMs = 700,
): Promise<Health | null> {
  try {
    const r = await fetch(`http://127.0.0.1:${port}${HEALTH_PATH}`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!r.ok) {
      await r.body?.cancel();
      return null;
    }
    const j = await r.json().catch(() => null);
    return j && j.ok === true && typeof j.wbRoot === "string" &&
        typeof j.pid === "number"
      ? j as Health
      : null;
  } catch {
    return null;
  }
}

function sameDir(a: string, b: string): boolean {
  return resolve(a) === resolve(b);
}

/** The live server for `wbRoot`, if its record still names a server that answers FOR
 *  THIS WORKBENCH. Anything else (no answer, another server on that port by now) is a
 *  stale record: it is removed and null is returned. The result carries the server's
 *  own project, so a caller can tell "live, but for a different project". */
export async function findLive(wbRoot: string): Promise<LiveWorkbench | null> {
  const rec = await readLive(wbRoot);
  if (!rec) return null;
  const h = await probeHealth(rec.port);
  if (h && sameDir(h.wbRoot, wbRoot)) {
    return {
      ...rec,
      serverPid: h.pid,
      project: h.project ?? rec.project,
      startedAt: h.startedAt ?? rec.startedAt,
    };
  }
  await Deno.remove(liveFile(wbRoot)).catch(() => {});
  return null;
}

/** What a launcher prints when it reuses a live server instead of starting one. */
export function reuseBanner(live: LiveWorkbench): string {
  return `\n  ◆ isolate already running → ${live.url}\n     project: ${live.project}\n` +
    `     reusing it (up since ${live.startedAt}; owner pid ${live.pid} — ` +
    `\`kill ${live.pid}\` stops it). Nothing new was started.\n`;
}

/** The workbench is live, but for another project: not reusable, and worth saying. */
export function foreignWarning(live: LiveWorkbench, wbRoot: string): string {
  return `⚠ isolate: ${wbRoot} already serves a different project (${live.project}) at ` +
    `${live.url} — not reusing it. Give this run its own SPRIG_WB_ROOT: two projects in ` +
    `one workbench overwrite each other's previews.`;
}

// ───────────────────────────── the idle policy ──────────────────────────────

/** Minutes after which an unattended server exits. `env` (SPRIG_IDLE_EXIT) wins when it
 *  is a number: > 0 = that many minutes, <= 0 = never. Otherwise: off at a terminal (a
 *  person is there), DEFAULT_IDLE_MINUTES when stdin is not one (an agent, CI, a `… &`). */
export function idleExitMinutes(
  env: string | undefined,
  stdinIsTerminal: boolean,
): number {
  const fallback = stdinIsTerminal ? 0 : DEFAULT_IDLE_MINUTES;
  if (env === undefined || env.trim() === "") return fallback;
  const n = Number(env);
  if (!Number.isFinite(n)) return fallback;
  return n > 0 ? n : 0;
}

export interface IdleClock {
  /** A request came in. */
  touch(): void;
  /** ms since the last request (or since the last attached client was seen). */
  idleFor(): number;
  /** Past the limit with no client attached? An attached client (an open HMR stream)
   *  counts as continuous activity, so detaching restarts the clock. */
  expired(): boolean;
}

export function idleClock(
  idleMs: number,
  attached: () => number = () => 0,
  now: () => number = () => Date.now(),
): IdleClock {
  let last = now();
  return {
    touch() {
      last = now();
    },
    idleFor() {
      return now() - last;
    },
    expired() {
      if (attached() > 0) {
        last = now();
        return false;
      }
      return now() - last > idleMs;
    },
  };
}
